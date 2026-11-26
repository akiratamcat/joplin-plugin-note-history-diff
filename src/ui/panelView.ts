import { VersionChoice, VersionDiff } from '../core/comparison';
import { DateTimeFormat, formatDateTime } from './dateFormat';
import { escapeHtml, renderDiffViews } from './diffView';
import { Strings } from './i18n';

// Why the default comparison (F1) compares what it compares; null once the
// user picked the versions (F2).
export type ComparisonExplanation = 'latest-vs-current' | 'previous-vs-latest' | null;

// Everything the panel can show. The controller decides the state; this module only renders it.
export type PanelState =
	| { kind: 'loading' }
	| { kind: 'no-note' }
	| { kind: 'no-history'; enabled: boolean | null; intervalMinutes: number | null; ttlDays: number | null }
	| { kind: 'nothing-to-compare' }
	| { kind: 'rebuild-failed'; reason: string }
	| { kind: 'error'; message: string }
	| { kind: 'result'; choices: VersionChoice[]; fromKey: string; toKey: string; diff: VersionDiff; explanation: ComparisonExplanation };

const LOCALE_FORMAT: DateTimeFormat = { date: null, time: null };

function choiceLabel(choice: VersionChoice, strings: Strings, format: DateTimeFormat): string {
	const name = choice.kind === 'current' ? strings.currentNote : strings.revision(formatDateTime(choice.time, format, strings.locale));
	const size = choice.bodyLength === null ? strings.unavailable : strings.chars(choice.bodyLength);
	return `${name}（${size}）`;
}

// F2: a version picker. Revisions that cannot be rebuilt are listed but disabled.
function picker(name: 'from' | 'to', label: string, choices: VersionChoice[], selectedKey: string, strings: Strings, format: DateTimeFormat): string {
	const options = choices.map(choice => {
		const attributes = [
			`value="${escapeHtml(choice.key)}"`,
			choice.key === selectedKey ? 'selected' : '',
			choice.bodyLength === null ? 'disabled' : '',
		].filter(Boolean).join(' ');
		return `<option ${attributes}>${escapeHtml(choiceLabel(choice, strings, format))}</option>`;
	}).join('');
	return `<label class="picker"><span>${escapeHtml(label)}</span><select data-select="${name}">${options}</select></label>`;
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

function renderResult(state: Extract<PanelState, { kind: 'result' }>, strings: Strings, format: DateTimeFormat): string {
	const { diff } = state;
	const pickers = `
	<div class="pickers">
		${picker('from', strings.from, state.choices, state.fromKey, strings, format)}
		${picker('to', strings.to, state.choices, state.toKey, strings, format)}
	</div>`;
	if (state.fromKey === state.toKey) return `${pickers}${message(strings.sameVersion)}`;
	const explanation = state.explanation === 'previous-vs-latest' ? strings.previousVsLatest
		: state.explanation === 'latest-vs-current' ? strings.latestVsCurrent : '';
	const stats = `<strong>${escapeHtml(strings.lineStats(diff.body.added, diff.body.removed))}</strong>`;
	return `${pickers}
	<p class="meta">${explanation ? `${escapeHtml(explanation)} · ` : ''}${stats}</p>
	${renderTitle(diff, strings)}
	${renderBody(diff, strings)}`;
}

function renderContent(state: PanelState, strings: Strings, format: DateTimeFormat): string {
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
		return renderResult(state, strings, format);
	}
}

// `format`: Joplin's date and time formats; the locale's format when omitted.
export function renderPanel(state: PanelState, strings: Strings, format: DateTimeFormat = LOCALE_FORMAT): string {
	return `<div class="nhd">${toolbar(strings)}${renderContent(state, strings, format)}</div>`;
}
