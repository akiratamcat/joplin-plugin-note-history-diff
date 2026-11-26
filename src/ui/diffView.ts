import { inlineDiff, Segment } from '../diff/inlineDiff';
import { DiffLine } from '../diff/lineDiff';

// Renders a line diff as HTML, in two layouts: side-by-side and unified
// (one column). Both are emitted; the CSS and the display mode pick one (F3).
// Inside a changed line, the characters that changed are highlighted (F4).

const CONTEXT_LINES = 3;
// Character highlighting costs a diff per changed line pair. Past this many
// pairs (a very large change), the rest are only marked line by line
// (spec section 6: large notes fall back to the line diff).
export const INLINE_MAX_PAIRS = 2000;

export interface DiffViewLabels {
	// e.g. (n) => `… ${n} unchanged lines …`
	foldedLines: (count: number) => string;
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

interface Fold {
	fold: true;
	count: number;
}

function isFold(item: any): item is Fold {
	return !!item && item.fold === true;
}

// Collapses long runs of unchanged items, keeping a few items of context.
export function foldRuns<T>(items: T[], isEqual: (item: T) => boolean, context = CONTEXT_LINES): (T | Fold)[] {
	const output: (T | Fold)[] = [];
	let index = 0;
	while (index < items.length) {
		if (!isEqual(items[index])) {
			output.push(items[index]);
			index++;
			continue;
		}
		let end = index;
		while (end < items.length && isEqual(items[end])) end++;
		const run = items.slice(index, end);
		const keepHead = index === 0 ? 0 : context;
		const keepTail = end === items.length ? 0 : context;
		if (run.length > keepHead + keepTail + 1) {
			output.push(...run.slice(0, keepHead));
			output.push({ fold: true, count: run.length - keepHead - keepTail });
			output.push(...run.slice(run.length - keepTail));
		} else {
			output.push(...run);
		}
		index = end;
	}
	return output;
}

// The text of a line, with its changed characters wrapped in <span class="chg">.
// An empty line stays empty: a placeholder such as &nbsp; would be copied as a
// non-breaking space (Issue #1). The row keeps its height from the line numbers.
export function segmentsHtml(text: string, segments: Segment[] | null): string {
	if (!segments) return escapeHtml(text);
	return segments.map(s => (s.changed ? `<span class="chg">${escapeHtml(s.text)}</span>` : escapeHtml(s.text))).join('');
}

export interface SideCell {
	no: number;
	text: string;
	// Character highlight (F4), or null when the line is only marked as a whole.
	segments: Segment[] | null;
}

export interface SideRow {
	left: SideCell | null;
	right: SideCell | null;
	kind: 'equal' | 'change';
}

// Pairs deleted lines (left) with inserted lines (right), in order, within
// each block of changes. The same pairs drive the character highlight in
// both layouts.
export function toSideRows(lines: DiffLine[], maxInlinePairs = INLINE_MAX_PAIRS): SideRow[] {
	const rows: SideRow[] = [];
	let leftNo = 0;
	let rightNo = 0;
	let pairs = 0;
	let index = 0;
	while (index < lines.length) {
		if (lines[index].kind === 'equal') {
			leftNo++;
			rightNo++;
			const text = lines[index].text;
			rows.push({ left: { no: leftNo, text, segments: null }, right: { no: rightNo, text, segments: null }, kind: 'equal' });
			index++;
			continue;
		}
		const deleted: string[] = [];
		const inserted: string[] = [];
		while (index < lines.length && lines[index].kind !== 'equal') {
			if (lines[index].kind === 'delete') deleted.push(lines[index].text);
			else inserted.push(lines[index].text);
			index++;
		}
		for (let i = 0; i < Math.max(deleted.length, inserted.length); i++) {
			let inline = null;
			if (i < deleted.length && i < inserted.length && pairs < maxInlinePairs) {
				pairs++;
				inline = inlineDiff(deleted[i], inserted[i]);
			}
			rows.push({
				left: i < deleted.length ? { no: ++leftNo, text: deleted[i], segments: inline ? inline.before : null } : null,
				right: i < inserted.length ? { no: ++rightNo, text: inserted[i], segments: inline ? inline.after : null } : null,
				kind: 'change',
			});
		}
	}
	return rows;
}

function foldHtml(count: number, labels: DiffViewLabels): string {
	return `<div class="fold">${escapeHtml(labels.foldedLines(count))}</div>`;
}

// F7: the first line of each block of changes carries the class "hunk", the
// targets of the "Previous change" / "Next change" buttons.
function unifiedLine(kind: 'equal' | 'delete' | 'insert', cell: SideCell, hunk = false): string {
	const sign = kind === 'insert' ? '+' : kind === 'delete' ? '−' : ' ';
	return `<div class="line ${kind}${hunk ? ' hunk' : ''}"><span class="sign">${sign}</span>${segmentsHtml(cell.text, cell.segments)}</div>`;
}

// One column: in each block of changes, the deleted lines, then the inserted ones.
export function renderUnified(rows: SideRow[], labels: DiffViewLabels): string {
	const items = foldRuns(rows, r => r.kind === 'equal');
	const html: string[] = [];
	let index = 0;
	while (index < items.length) {
		const item = items[index];
		if (isFold(item)) {
			html.push(foldHtml(item.count, labels));
			index++;
			continue;
		}
		if (item.kind === 'equal') {
			html.push(unifiedLine('equal', item.left));
			index++;
			continue;
		}
		const block: SideRow[] = [];
		while (index < items.length && !isFold(items[index]) && (items[index] as SideRow).kind === 'change') {
			block.push(items[index] as SideRow);
			index++;
		}
		const lines: [('delete' | 'insert'), SideCell][] = [];
		for (const row of block) if (row.left) lines.push(['delete', row.left]);
		for (const row of block) if (row.right) lines.push(['insert', row.right]);
		lines.forEach(([kind, cell], i) => html.push(unifiedLine(kind, cell, i === 0)));
	}
	return html.join('');
}

// Each cell says which side it is on ("left" / "right"), so that a selection and
// a copy can be kept to one side (Issue #1): in the page, every row holds a left
// cell then a right cell, so a selection over several rows takes both sides.
function sideCell(cell: SideCell | null, changeClass: string, side: 'left' | 'right'): string {
	if (!cell) return `<div class="no ${side}"></div><div class="cell ${side} empty"></div>`;
	return `<div class="no ${side}">${cell.no}</div><div class="cell ${side}${changeClass ? ` ${changeClass}` : ''}">${segmentsHtml(cell.text, cell.segments)}</div>`;
}

export function renderSideBySide(rows: SideRow[], labels: DiffViewLabels): string {
	let inBlock = false;
	const html = foldRuns(rows, r => r.kind === 'equal').map(row => {
		if (isFold(row)) {
			inBlock = false;
			return `<div class="sbs-fold">${foldHtml(row.count, labels)}</div>`;
		}
		const changed = row.kind === 'change';
		const hunk = changed && !inBlock;
		inBlock = changed;
		return `<div class="sbs-row${hunk ? ' hunk' : ''}">${sideCell(row.left, changed ? 'delete' : '', 'left')}${sideCell(row.right, changed ? 'insert' : '', 'right')}</div>`;
	});
	return `<div class="sbs">${html.join('')}</div>`;
}

// Both layouts; the CSS and the display mode pick one.
export function renderDiffViews(lines: DiffLine[], labels: DiffViewLabels): string {
	const rows = toSideRows(lines);
	return `<div class="view-sbs">${renderSideBySide(rows, labels)}</div><div class="view-unified">${renderUnified(rows, labels)}</div>`;
}
