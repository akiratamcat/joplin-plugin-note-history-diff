import diff_match_patch = require('diff-match-patch');

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;

export type LineKind = 'equal' | 'insert' | 'delete';

export interface DiffLine {
	kind: LineKind;
	text: string;
}

export interface LineDiffResult {
	lines: DiffLine[];
	added: number;
	removed: number;
	elapsedMs: number;
	timeoutSeconds: number;
	// True when the computation ran into Diff_Timeout, which can make the
	// result non-minimal and harder to read.
	timedOut: boolean;
}

function splitLines(text: string): string[] {
	const lines = text.split('\n');
	if (lines.length && lines[lines.length - 1] === '') lines.pop();
	return lines;
}

// Notes often have no newline after the last line. In line mode "abc" and
// "abc\n" are different lines, so appending a line would show the unchanged
// last line as deleted and re-added. Compare both texts with a final newline.
function withFinalNewline(text: string): string {
	return text === '' || text.endsWith('\n') ? text : `${text}\n`;
}

// Line-mode diff: each line is mapped to one character, diffed, then mapped back.
export function lineDiff(before: string, after: string, timeoutSeconds = 1): LineDiffResult {
	const dmp = new diff_match_patch();
	dmp.Diff_Timeout = timeoutSeconds;

	const started = Date.now();
	const { chars1, chars2, lineArray } = dmp.diff_linesToChars_(withFinalNewline(before), withFinalNewline(after));
	const diffs = dmp.diff_main(chars1, chars2, false);
	dmp.diff_charsToLines_(diffs, lineArray);
	const elapsedMs = Date.now() - started;

	const lines: DiffLine[] = [];
	let added = 0;
	let removed = 0;
	for (const [op, text] of diffs) {
		const kind: LineKind = op === DIFF_INSERT ? 'insert' : op === DIFF_DELETE ? 'delete' : 'equal';
		for (const line of splitLines(text)) {
			lines.push({ kind, text: line });
			if (kind === 'insert') added++;
			if (kind === 'delete') removed++;
		}
	}

	return {
		lines,
		added,
		removed,
		elapsedMs,
		timeoutSeconds,
		timedOut: timeoutSeconds > 0 && elapsedMs >= timeoutSeconds * 1000,
	};
}
