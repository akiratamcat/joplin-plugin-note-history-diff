import { VersionDiff } from '../core/comparison';
import { escapeHtml, renderDiffViews } from './diffView';
import { Strings } from './i18n';

export interface SideInfo {
	kind: 'revision' | 'current';
	time: number;
}

// Everything the panel can show. The controller decides the state; this module only renders it.
export type PanelState =
	| { kind: 'loading' }
	| { kind: 'no-note' }
	| { kind: 'no-history'; enabled: boolean | null; intervalMinutes: number | null; ttlDays: number | null }
	| { kind: 'nothing-to-compare' }
	| { kind: 'rebuild-failed'; reason: string }
	| { kind: 'error'; message: string }
	| { kind: 'result'; from: SideInfo; to: SideInfo; diff: VersionDiff; previousVsLatest: boolean };

function formatTime(ms: number, strings: Strings): string {
	return new Date(ms).toLocaleString(strings.locale === 'ja' ? 'ja-JP' : undefined);
}

function sideLabel(side: SideInfo, strings: Strings): string {
	return side.kind === 'current' ? strings.currentNote : strings.revision(formatTime(side.time, strings));
}

function toolbar(strings: Strings): string {
	return `
	<div class="toolbar">
		<strong>${escapeHtml(strings.panelTitle)}</strong>
		<span class="buttons">
			<button data-action="refresh">${escapeHtml(strings.refresh)}</button>
			<button data-action="close">${escapeHtml(strings.close)}</button>
		</span>
	</div>`;
}

function message(text: string, extra = ''): string {
	return `<p class="message">${escapeHtml(text)}</p>${extra}`;
}

function renderTitle(diff: VersionDiff, strings: Strings): string {
	if (!diff.titleChanged) return '';
	return `
	<div class="section-label">${escapeHtml(strings.title)}</div>
	<div class="diff title-diff">
		<div class="line delete"><span class="sign">−</span>${escapeHtml(diff.title.before) || '&nbsp;'}</div>
		<div class="line insert"><span class="sign">+</span>${escapeHtml(diff.title.after) || '&nbsp;'}</div>
	</div>`;
}

function renderBody(diff: VersionDiff, strings: Strings): string {
	const { body } = diff;
	if (!body.added && !body.removed) return message(strings.bodyUnchanged);
	return `<div class="diff">${renderDiffViews(body.lines, { foldedLines: strings.foldedLines })}</div>`;
}

function renderResult(state: Extract<PanelState, { kind: 'result' }>, strings: Strings): string {
	const { diff } = state;
	return `
	<table class="sides">
		<tr><th>${escapeHtml(strings.from)}</th><td>${escapeHtml(sideLabel(state.from, strings))}</td></tr>
		<tr><th>${escapeHtml(strings.to)}</th><td>${escapeHtml(sideLabel(state.to, strings))}</td></tr>
	</table>
	<p class="meta">${escapeHtml(state.previousVsLatest ? strings.previousVsLatest : strings.latestVsCurrent)}
		· <strong>${escapeHtml(strings.lineStats(diff.body.added, diff.body.removed))}</strong></p>
	${renderTitle(diff, strings)}
	${renderBody(diff, strings)}`;
}

function renderContent(state: PanelState, strings: Strings): string {
	switch (state.kind) {
	case 'loading':
		return message(strings.loading);
	case 'no-note':
		return message(strings.noNote);
	case 'no-history': {
		const hints: string[] = [];
		if (state.enabled === false) hints.push(strings.historyDisabled);
		else if (state.intervalMinutes !== null && state.ttlDays !== null) hints.push(strings.historyHint(state.intervalMinutes, state.ttlDays));
		return message(strings.noHistory, hints.map(h => `<p class="meta">${escapeHtml(h)}</p>`).join(''));
	}
	case 'nothing-to-compare':
		return message(strings.nothingToCompare);
	case 'rebuild-failed':
		return message(state.reason === 'encrypted' ? strings.encrypted : strings.rebuildFailed(state.reason));
	case 'error':
		return message(strings.error(state.message));
	case 'result':
		return renderResult(state, strings);
	}
}

export function renderPanel(state: PanelState, strings: Strings): string {
	return `<div class="nhd">${toolbar(strings)}${renderContent(state, strings)}</div>`;
}
