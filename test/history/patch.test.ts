import { applyTextPatch, InvalidPatchError, makeTextPatch, parseTextPatch } from '../../src/history/patch';

describe('patch', () => {
	test('applies a JSON patch in the format Joplin stores', () => {
		// Same shape as a real title_diff seen on Joplin 3.7.24.
		const patch = '[{"diffs":[[1,"週次ミーティングのメモ"]],"start1":0,"start2":0,"length1":0,"length2":11}]';
		expect(applyTextPatch('', patch)).toEqual({ text: '週次ミーティングのメモ', ok: true });
	});

	test('applies a JSON patch with context (equal, delete, insert)', () => {
		const patch = '[{"diffs":[[0,"ミーティング"],[-1,"のメモ"],[1,"：議事録"]],"start1":2,"start2":2,"length1":9,"length2":10}]';
		expect(applyTextPatch('週次ミーティングのメモ', patch)).toEqual({ text: '週次ミーティング：議事録', ok: true });
	});

	test('treats "[]" and an empty string as no change', () => {
		expect(applyTextPatch('abc', '[]')).toEqual({ text: 'abc', ok: true });
		expect(applyTextPatch('abc', '')).toEqual({ text: 'abc', ok: true });
	});

	test('accepts the legacy @@ text format', () => {
		expect(applyTextPatch('', '@@ -0,0 +1,3 @@\n+abc\n')).toEqual({ text: 'abc', ok: true });
	});

	test('round-trips with makeTextPatch', () => {
		const before = '# Title\n\n- one\n- two\n';
		const after = '# Title\n\n- one\n- 2\n- three\n';
		expect(applyTextPatch(before, makeTextPatch(before, after)).text).toBe(after);
	});

	test('reports ok=false when a patch does not fit the text', () => {
		const patch = makeTextPatch('The quick brown fox jumps over the lazy dog.', 'The quick brown cat jumps over the lazy dog.');
		const result = applyTextPatch('Completely unrelated text that shares nothing.', patch);
		expect(result.ok).toBe(false);
	});

	test('rejects malformed patches', () => {
		expect(() => parseTextPatch('{not json')).toThrow(InvalidPatchError);
		expect(() => parseTextPatch('{"a":1}')).toThrow(InvalidPatchError);
	});
});
