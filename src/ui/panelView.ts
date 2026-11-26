import { neighbourPair, VersionChoice, VersionDiff } from '../core/comparison';
import { DateTimeFormat, formatDateTime } from './dateFormat';
import { inlineDiff } from '../diff/inlineDiff';
import { escapeHtml, renderDiffViews, segmentsHtml } from './diffView';
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

// F3: side by side (falls back to one column when narrower than 600px), or
// always one column. The plugin remembers the user's choice.
export type DisplayMode = 'side' | 'unified';

export interface RenderOptions {
	// Joplin's date and time formats; the locale's format when omitted.
	format?: DateTimeFormat;
	mode?: DisplayMode;
	// F9: whether trailing whitespace and line endings are ignored.
	ignoreWhitespace?: boolean;
}

interface ResolvedOptions {
	format: DateTimeFormat;
	mode: DisplayMode;
	ignoreWhitespace: boolean;
}

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

// F6: step to the neighbouring pair of versions, one older or one newer.
function pairButtons(state: Extract<PanelState, { kind: 'result' }>, strings: Strings): string {
	const button = (direction: 'older' | 'newer', label: string) => {
		const pair = neighbourPair(state.choices, state.fromKey, state.toKey, direction);
		return `<button data-action="pair-${direction}"${pair ? '' : ' disabled'}>${escapeHtml(label)}</button>`;
	};
	return `<span class="pairs">${button('older', strings.olderPair)}${button('newer', strings.newerPair)}</span>`;
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
	const inline = inlineDiff(diff.title.before, diff.title.after);
	return `
	<div class="section-label">${escapeHtml(strings.title)}</div>
	<div class="diff title-diff">
		<div class="line delete"><span class="sign">−</span>${segmentsHtml(diff.title.before, inline ? inline.before : null)}</div>
		<div class="line insert"><span class="sign">+</span>${segmentsHtml(diff.title.after, inline ? inline.after : null)}</div>
	</div>`;
}

function renderBody(diff: VersionDiff, strings: Strings): string {
	const { body } = diff;
	if (!body.added && !body.removed) return message(strings.bodyUnchanged);
	return `<div class="diff">${renderDiffViews(body.lines, { foldedLines: strings.foldedLines })}</div>`;
}

// The fixed part at the top (versions, buttons) and the part that scrolls (the diff).
interface Parts {
	head: string;
	body: string;
}

function renderResult(state: Extract<PanelState, { kind: 'result' }>, strings: Strings, options: ResolvedOptions): Parts {
	const { diff } = state;
	const { format, mode } = options;
	const pickers = `
	<div class="pickers">
		${picker('from', strings.from, state.choices, state.fromKey, strings, format)}
		${picker('to', strings.to, state.choices, state.toKey, strings, format)}
		${pairButtons(state, strings)}
	</div>`;
	if (state.fromKey === state.toKey) return { head: pickers, body: message(strings.sameVersion) };
	const explanation = state.explanation === 'previous-vs-latest' ? strings.previousVsLatest
		: state.explanation === 'latest-vs-current' ? strings.latestVsCurrent : '';
	const stats = `<strong>${escapeHtml(strings.lineStats(diff.body.added, diff.body.removed))}</strong>`;
	const modeButton = (value: DisplayMode, label: string) =>
		`<button data-mode="${value}" class="${mode === value ? 'active' : ''}">${escapeHtml(label)}</button>`;
	const modes = `<span class="modes">${modeButton('side', strings.modeSideBySide)}${modeButton('unified', strings.modeUnified)}</span>`;
	const hasChanges = diff.body.added > 0 || diff.body.removed > 0;
	const jumps = hasChanges ? `<span class="jumps">
		<button data-jump="previous">${escapeHtml(strings.previousChange)}</button>
		<button data-jump="next">${escapeHtml(strings.nextChange)}</button>
	</span>` : '';
	const whitespace = `<label class="toggle"><input type="checkbox" data-toggle="whitespace"${options.ignoreWhitespace ? ' checked' : ''}> ${escapeHtml(strings.ignoreWhitespace)}</label>`;
	return {
		head: `${pickers}
	<div class="meta-row"><p class="meta">${explanation ? `${escapeHtml(explanation)} · ` : ''}${stats}</p>${jumps}</div>
	<div class="controls">${whitespace}${modes}</div>`,
		body: `${renderTitle(diff, strings)}
	${renderBody(diff, strings)}`,
	};
}

function renderContent(state: PanelState, strings: Strings, options: ResolvedOptions): Parts {
	if (state.kind === 'result') return renderResult(state, strings, options);
	return { head: '', body: renderMessage(state, strings) };
}

function renderMessage(state: Exclude<PanelState, { kind: 'result' }>, strings: Strings): string {
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
	}
}

export function renderPanel(state: PanelState, strings: Strings, options: RenderOptions = {}): string {
	const resolved: ResolvedOptions = {
		format: options.format || LOCALE_FORMAT,
		mode: options.mode || 'side',
		ignoreWhitespace: options.ignoreWhitespace !== false,
	};
	const parts = renderContent(state, strings, resolved);
	// Only the body scrolls, so the buttons stay in view (v0.7.0 test).
	return `<div class="nhd mode-${resolved.mode}"><div class="head">${toolbar(strings)}${parts.head}</div><div class="body">${parts.body}</div></div>`;
}
