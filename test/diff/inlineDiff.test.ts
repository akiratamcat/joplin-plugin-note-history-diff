import { inlineDiff, INLINE_MAX_LINE_CHARS } from '../../src/diff/inlineDiff';

describe('inlineDiff (F4)', () => {
	test('marks only the changed characters', () => {
		expect(inlineDiff('- 会議 15時', '- 会議 16時')).toEqual({
			before: [{ text: '- 会議 1', changed: false }, { text: '5', changed: true }, { text: '時', changed: false }],
			after: [{ text: '- 会議 1', changed: false }, { text: '6', changed: true }, { text: '時', changed: false }],
		});
	});

	test('an insertion inside the line is marked on the new side only', () => {
		const result = inlineDiff('資料を送る', '資料を明日送る');
		expect(result!.before).toEqual([{ text: '資料を送る', changed: false }]);
		expect(result!.after.filter(s => s.changed).map(s => s.text)).toEqual(['明日']);
	});

	test('no highlight for lines that are too different, too long, or empty on one side', () => {
		expect(inlineDiff('abcdefgh', 'zyxwvuts')).toBeNull();
		expect(inlineDiff('x'.repeat(INLINE_MAX_LINE_CHARS + 1), 'y')).toBeNull();
		expect(inlineDiff('', 'abc')).toBeNull();
	});
});
