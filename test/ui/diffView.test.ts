import { lineDiff } from '../../src/diff/lineDiff';
import { foldRuns, renderUnified, toSideRows } from '../../src/ui/diffView';

const labels = { foldedLines: (n: number) => `… ${n} unchanged …` };

describe('toSideRows', () => {
	test('pairs deleted and inserted lines, keeping line numbers per side', () => {
		const rows = toSideRows(lineDiff('a\nb\nc\nd\n', 'a\nB\nc\nd\ne\n').lines);
		expect(rows).toEqual([
			{ left: { no: 1, text: 'a' }, right: { no: 1, text: 'a' }, kind: 'equal' },
			{ left: { no: 2, text: 'b' }, right: { no: 2, text: 'B' }, kind: 'change' },
			{ left: { no: 3, text: 'c' }, right: { no: 3, text: 'c' }, kind: 'equal' },
			{ left: { no: 4, text: 'd' }, right: { no: 4, text: 'd' }, kind: 'equal' },
			{ left: null, right: { no: 5, text: 'e' }, kind: 'change' },
		]);
	});
});

describe('foldRuns', () => {
	test('keeps 3 lines of context around changes and folds the rest', () => {
		const items = Array.from({ length: 20 }, (_, i) => (i === 10 ? 'x' : '='));
		const folded = foldRuns(items, i => i === '=');
		// 7 folded before (10 - 3), the 3 context lines, the change, 3 context lines, 6 folded after.
		expect(folded[0]).toEqual({ fold: true, count: 7 });
		expect(folded[folded.length - 1]).toEqual({ fold: true, count: 6 });
		expect(folded.filter(i => i === 'x')).toHaveLength(1);
	});

	test('does not fold a short run', () => {
		expect(foldRuns(['=', '=', 'x', '=', '='], i => i === '=')).toEqual(['=', '=', 'x', '=', '=']);
	});
});

describe('renderUnified', () => {
	test('uses the fold label and escapes HTML', () => {
		const before = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
		const after = `${before}\n<script>`;
		// 30 unchanged lines, the last 3 kept as context before the added line.
		const html = renderUnified(lineDiff(before, after).lines, labels);
		expect(html).toContain('… 27 unchanged …');
		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('<script>');
	});
});
