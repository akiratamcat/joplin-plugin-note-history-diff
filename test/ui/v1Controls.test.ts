import { CURRENT_KEY, diffVersions, VersionChoice } from '../../src/core/comparison';
import { lineDiff } from '../../src/diff/lineDiff';
import { renderSideBySide, renderUnified, toSideRows } from '../../src/ui/diffView';
import { stringsFor } from '../../src/ui/i18n';
import { renderPanel } from '../../src/ui/panelView';

const labels = { foldedLines: (n: number) => `… ${n} …` };
const ja = stringsFor('ja');

describe('change blocks are marked for jumping (F7)', () => {
	// Two separate blocks of changes: b → B, and an added line after e.
	const rows = toSideRows(lineDiff('a\nb\nc\nd\ne\n', 'a\nB\nc\nd\ne\nf\n').lines);

	test('side by side: the first row of each block', () => {
		expect(renderSideBySide(rows, labels).match(/class="sbs-row hunk"/g)).toHaveLength(2);
	});

	test('unified: the first line of each block', () => {
		const html = renderUnified(rows, labels);
		expect(html.match(/ hunk"/g)).toHaveLength(2);
		// In the block b → B, the deleted line comes first and carries the mark.
		expect(html).toContain('<div class="line delete hunk">');
	});

	test('a block of several rows is marked once', () => {
		const block = toSideRows(lineDiff('a\nb\nc\n', 'A\nB\nC\n').lines);
		expect(renderSideBySide(block, labels).match(/ hunk"/g)).toHaveLength(1);
	});
});

describe('result controls (F6, F7, F9)', () => {
	const choices: VersionChoice[] = [
		{ key: CURRENT_KEY, kind: 'current', time: 3, bodyLength: 3 },
		{ key: 'r2', kind: 'revision', time: 2, bodyLength: 2 },
		{ key: 'r1', kind: 'revision', time: 1, bodyLength: 1 },
	];
	const changed = diffVersions({ title: 'T', body: 'x' }, { title: 'T', body: 'y' });

	test('pair buttons: older enabled, newer disabled at the newest pair', () => {
		const html = renderPanel({ kind: 'result', choices, fromKey: 'r2', toKey: CURRENT_KEY, diff: changed, explanation: null }, ja);
		expect(html).toContain('<button data-action="pair-older">◀ 前の版ペア</button>');
		expect(html).toContain('<button data-action="pair-newer" disabled>次の版ペア ▶</button>');
	});

	test('jump buttons only when there are changes', () => {
		const withChanges = renderPanel({ kind: 'result', choices, fromKey: 'r2', toKey: CURRENT_KEY, diff: changed, explanation: null }, ja);
		expect(withChanges).toContain('data-jump="next"');
		expect(withChanges).toContain('data-jump="previous"');
		const titleOnly = diffVersions({ title: 'A', body: 'x' }, { title: 'B', body: 'x' });
		const without = renderPanel({ kind: 'result', choices, fromKey: 'r2', toKey: CURRENT_KEY, diff: titleOnly, explanation: null }, ja);
		expect(without).not.toContain('data-jump=');
	});

	test('the whitespace toggle is checked by default and follows the option', () => {
		const state = { kind: 'result' as const, choices, fromKey: 'r2', toKey: CURRENT_KEY, diff: changed, explanation: null };
		expect(renderPanel(state, ja)).toContain('data-toggle="whitespace" checked>');
		expect(renderPanel(state, ja, { ignoreWhitespace: false })).toContain('data-toggle="whitespace">');
	});
});
