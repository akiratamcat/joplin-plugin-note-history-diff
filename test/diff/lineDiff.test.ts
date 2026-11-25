import { lineDiff } from '../../src/diff/lineDiff';

describe('lineDiff', () => {
	test('reports added, removed and unchanged lines', () => {
		const before = '## 予定\n- 会議 15時\n- 資料を送る\n';
		const after = '## 予定\n- 会議 16時\n- 資料を送る\n- 議事録を共有\n';
		const result = lineDiff(before, after);
		expect(result.lines).toEqual([
			{ kind: 'equal', text: '## 予定' },
			{ kind: 'delete', text: '- 会議 15時' },
			{ kind: 'insert', text: '- 会議 16時' },
			{ kind: 'equal', text: '- 資料を送る' },
			{ kind: 'insert', text: '- 議事録を共有' },
		]);
		expect(result.added).toBe(2);
		expect(result.removed).toBe(1);
		expect(result.timedOut).toBe(false);
	});

	test('identical texts have no changes', () => {
		const result = lineDiff('a\nb\n', 'a\nb\n');
		expect(result.added + result.removed).toBe(0);
		expect(result.lines.every(l => l.kind === 'equal')).toBe(true);
	});

	test('handles empty texts', () => {
		expect(lineDiff('', 'x\ny').added).toBe(2);
		expect(lineDiff('x\ny', '').removed).toBe(2);
		expect(lineDiff('', '').lines).toEqual([]);
	});

	test('a large text with a few changes stays fast', () => {
		const before = Array.from({ length: 20000 }, (_, i) => `line ${i}`).join('\n');
		const after = before.replace('line 100\n', 'line 100 changed\n').replace('line 15000\n', '');
		const result = lineDiff(before, after);
		expect(result.added).toBe(1);
		expect(result.removed).toBe(2);
		expect(result.timedOut).toBe(false);
	});
});
