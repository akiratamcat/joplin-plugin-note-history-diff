import { DiffLine } from '../diff/lineDiff';

// Renders a line diff as HTML, in two layouts: side-by-side and unified
// (one column). Both are emitted; the panel CSS shows side-by-side when the
// panel is at least 600px wide and the unified view below that (F3).

const CONTEXT_LINES = 3;

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

function cellText(text: string): string {
	return escapeHtml(text) || '&nbsp;';
}

function foldHtml(count: number, labels: DiffViewLabels): string {
	return `<div class="fold">${escapeHtml(labels.foldedLines(count))}</div>`;
}

export function renderUnified(lines: DiffLine[], labels: DiffViewLabels): string {
	return foldRuns(lines, l => l.kind === 'equal').map(line => {
		if (isFold(line)) return foldHtml(line.count, labels);
		const sign = line.kind === 'insert' ? '+' : line.kind === 'delete' ? '−' : ' ';
		return `<div class="line ${line.kind}"><span class="sign">${sign}</span>${cellText(line.text)}</div>`;
	}).join('');
}

export interface SideRow {
	left: { no: number; text: string } | null;
	right: { no: number; text: string } | null;
	kind: 'equal' | 'change';
}

// Pairs deleted lines (left) with inserted lines (right) for the side-by-side view.
export function toSideRows(lines: DiffLine[]): SideRow[] {
	const rows: SideRow[] = [];
	let leftNo = 0;
	let rightNo = 0;
	let index = 0;
	while (index < lines.length) {
		if (lines[index].kind === 'equal') {
			leftNo++;
			rightNo++;
			rows.push({ left: { no: leftNo, text: lines[index].text }, right: { no: rightNo, text: lines[index].text }, kind: 'equal' });
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
			rows.push({
				left: i < deleted.length ? { no: ++leftNo, text: deleted[i] } : null,
				right: i < inserted.length ? { no: ++rightNo, text: inserted[i] } : null,
				kind: 'change',
			});
		}
	}
	return rows;
}

function sideCell(cell: SideRow['left'], changeClass: string): string {
	if (!cell) return '<div class="no"></div><div class="cell empty"></div>';
	return `<div class="no">${cell.no}</div><div class="cell ${changeClass}">${cellText(cell.text)}</div>`;
}

export function renderSideBySide(lines: DiffLine[], labels: DiffViewLabels): string {
	const rows = foldRuns(toSideRows(lines), r => r.kind === 'equal').map(row => {
		if (isFold(row)) return `<div class="sbs-fold">${foldHtml(row.count, labels)}</div>`;
		const changed = row.kind === 'change';
		return `<div class="sbs-row">${sideCell(row.left, changed ? 'delete' : '')}${sideCell(row.right, changed ? 'insert' : '')}</div>`;
	});
	return `<div class="sbs">${rows.join('')}</div>`;
}

// Both layouts; CSS picks one by panel width.
export function renderDiffViews(lines: DiffLine[], labels: DiffViewLabels): string {
	return `<div class="view-sbs">${renderSideBySide(lines, labels)}</div><div class="view-unified">${renderUnified(lines, labels)}</div>`;
}
