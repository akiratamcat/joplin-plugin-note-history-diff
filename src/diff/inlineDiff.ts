import diff_match_patch = require('diff-match-patch');

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;

// F4: highlights the characters that changed inside a changed line. A deleted
// line and the inserted line paired with it (side by side) are compared
// character by character.

export interface Segment {
	text: string;
	// True for the characters that differ from the other line.
	changed: boolean;
}

export interface InlineDiff {
	before: Segment[];
	after: Segment[];
}

// Lines longer than this are not compared character by character: the diff
// would be slow and the highlight unreadable (spec section 6).
export const INLINE_MAX_LINE_CHARS = 5000;
// When more than this share of the characters changed, the lines are too
// different for a highlight to help; the whole line stays marked instead.
const MAX_CHANGED_RATIO = 0.7;

function push(segments: Segment[], text: string, changed: boolean): void {
	if (!text) return;
	const last = segments[segments.length - 1];
	if (last && last.changed === changed) last.text += text;
	else segments.push({ text, changed });
}

// Returns null when the pair should only be marked line by line.
export function inlineDiff(before: string, after: string): InlineDiff | null {
	if (before.length > INLINE_MAX_LINE_CHARS || after.length > INLINE_MAX_LINE_CHARS) return null;
	if (!before || !after) return null;

	const dmp = new diff_match_patch();
	dmp.Diff_Timeout = 0.1;
	const diffs = dmp.diff_main(before, after);
	dmp.diff_cleanupSemantic(diffs);

	const result: InlineDiff = { before: [], after: [] };
	let changedChars = 0;
	for (const [op, text] of diffs) {
		if (op === DIFF_DELETE) {
			push(result.before, text, true);
			changedChars += text.length;
		} else if (op === DIFF_INSERT) {
			push(result.after, text, true);
			changedChars += text.length;
		} else {
			push(result.before, text, false);
			push(result.after, text, false);
		}
	}
	if (changedChars > (before.length + after.length) * MAX_CHANGED_RATIO) return null;
	return result;
}
