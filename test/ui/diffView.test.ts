import { lineDiff } from '../../src/diff/lineDiff';
import { foldRuns, renderSideBySide, renderUnified, segmentsHtml, toSideRows } from '../../src/ui/diffView';

const labels = { foldedLines: (n: number) => `… ${n} unchanged …` };

describe('toSideRows', () => {
	test('pairs deleted and inserted lines, keeping line numbers per side', () => {
		const rows = toSideRows(lineDiff('a\nb\nc\nd\n', 'a\nB\nc\nd\ne\n').lines);
		expect(rows.map(r => [r.kind, r.left && r.left.no, r.left && r.left.text, r.right && r.right.no, r.right && r.right.text])).toEqual([
			['equal', 1, 'a', 1, 'a'],
			['change', 2, 'b', 2, 'B'],
			['equal', 3, 'c', 3, 'c'],
			['equal', 4, 'd', 4, 'd'],
			['change', null, null, 5, 'e'],
		]);
	});

	test('F4: a paired line gets a character highlight; an unpaired one does not', () => {
		const rows = toSideRows(lineDiff('会議 15時\n', '会議 16時\n追加\n').lines);
		expect(rows[0].left!.segments).toEqual([{ text: '会議 1', changed: false }, { text: '5', changed: true }, { text: '時', changed: false }]);
		expect(rows[0].right!.segments).toEqual([{ text: '会議 1', changed: false }, { text: '6', changed: true }, { text: '時', changed: false }]);
		expect(rows[1].right!.segments).toBeNull();
	});

	test('F4: past the pair budget, lines are only marked as a whole', () => {
		const rows = toSideRows(lineDiff('a1\nb1\n', 'a2\nb2\n').lines, 1);
		expect(rows[0].left!.segments).not.toBeNull();
		expect(rows[1].left!.segments).toBeNull();
	});
});

describe('segmentsHtml', () => {
	test('wraps changed characters and escapes HTML', () => {
		expect(segmentsHtml('a<b', [{ text: 'a', changed: false }, { text: '<b', changed: true }])).toBe('a<span class="chg">&lt;b</span>');
		expect(segmentsHtml('<x>', null)).toBe('&lt;x&gt;');
		expect(segmentsHtml('', null)).toBe('&nbsp;');
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
		const html = renderUnified(toSideRows(lineDiff(before, after).lines), labels);
		expect(html).toContain('… 27 unchanged …');
		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('<script>');
	});

	test('shows the deleted lines of a block, then the inserted ones, with the same highlight as side by side', () => {
		const rows = toSideRows(lineDiff('x\na1\nb1\ny\n', 'x\na2\nb2\ny\n').lines);
		const unified = renderUnified(rows, labels);
		const order = ['a<span class="chg">1</span>', 'b<span class="chg">1</span>', 'a<span class="chg">2</span>', 'b<span class="chg">2</span>'].map(s => unified.indexOf(s));
		expect(order.every(i => i >= 0)).toBe(true);
		expect([...order].sort((p, q) => p - q)).toEqual(order);
		expect(renderSideBySide(rows, labels)).toContain('a<span class="chg">2</span>');
	});
});
