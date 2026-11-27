import { lineDiff, LineDiffResult } from '../diff/lineDiff';
import { normalizeWhitespace } from '../diff/whitespace';
import { RebuildError, RevisionRebuilder } from '../history/revisionRebuilder';
import { NoteVersion } from '../history/types';

// One side of a comparison: a revision of the note, or the note as it is now.
export type ComparisonSide =
	| { kind: 'revision'; index: number; revisionId: string; time: number; version: NoteVersion }
	| { kind: 'current'; time: number; version: NoteVersion };

export interface CurrentNote extends NoteVersion {
	updatedTime: number;
}

export type DefaultComparison =
	// The note has no revisions at all.
	| { kind: 'no-history' }
	// One revision only, identical to the current note: nothing to compare yet.
	| { kind: 'nothing-to-compare'; revisionTime: number }
	// A revision could not be rebuilt (encrypted, broken patch, invalid chain).
	| { kind: 'rebuild-failed'; error: RebuildError }
	| { kind: 'compare'; from: ComparisonSide; to: ComparisonSide };

function revisionSide(rebuilder: RevisionRebuilder, index: number): ComparisonSide {
	const revision = rebuilder.revisionAt(index);
	return { kind: 'revision', index, revisionId: revision.id, time: revision.item_updated_time, version: rebuilder.versionAt(index) };
}

function sameVersion(a: NoteVersion, b: NoteVersion): boolean {
	return a.title === b.title && a.body === b.body;
}

// F1: compare the current note with the latest revision. A revision holds the
// note as of its time, so when the note has not been edited since, the latest
// revision equals the current note; then the latest revision is compared with
// the one before it instead.
export function planDefaultComparison(rebuilder: RevisionRebuilder, current: CurrentNote): DefaultComparison {
	const count = rebuilder.length;
	if (!count) return { kind: 'no-history' };

	const currentSide: ComparisonSide = { kind: 'current', time: current.updatedTime, version: { title: current.title, body: current.body } };
	try {
		const latest = revisionSide(rebuilder, count - 1);
		if (!sameVersion(latest.version, currentSide.version)) {
			return { kind: 'compare', from: latest, to: currentSide };
		}
		if (count === 1) return { kind: 'nothing-to-compare', revisionTime: latest.time };
		return { kind: 'compare', from: revisionSide(rebuilder, count - 2), to: latest };
	} catch (error) {
		if (error instanceof RebuildError) return { kind: 'rebuild-failed', error };
		throw error;
	}
}

export interface VersionDiff {
	titleChanged: boolean;
	title: { before: string; after: string };
	body: LineDiffResult;
}

export interface DiffOptions {
	// F9: ignore differences in trailing whitespace and line endings.
	ignoreWhitespace?: boolean;
}

// F5: the title is compared separately from the body.
export function diffVersions(from: NoteVersion, to: NoteVersion, options: DiffOptions = {}): VersionDiff {
	const clean = options.ignoreWhitespace ? normalizeWhitespace : (text: string) => text;
	const before = { title: clean(from.title), body: clean(from.body) };
	const after = { title: clean(to.title), body: clean(to.body) };
	return {
		titleChanged: before.title !== after.title,
		title: { before: before.title, after: after.title },
		body: lineDiff(before.body, after.body),
	};
}

// F2: a version the user can pick as the "from" or "to" side. The key is
// stable across reloads: a revision's id (revision indexes shift when older
// revisions expire), or CURRENT_KEY for the note as it is now.
export const CURRENT_KEY = 'current';

export interface VersionChoice {
	key: string;
	kind: 'revision' | 'current';
	time: number;
	// Body length in characters, or null when the revision cannot be rebuilt.
	bodyLength: number | null;
}

export function sideKey(side: ComparisonSide): string {
	return side.kind === 'current' ? CURRENT_KEY : side.revisionId;
}

// Every version, newest first: the current note, then the revisions.
export function listVersionChoices(rebuilder: RevisionRebuilder, current: CurrentNote): VersionChoice[] {
	const choices: VersionChoice[] = [{ key: CURRENT_KEY, kind: 'current', time: current.updatedTime, bodyLength: current.body.length }];
	const summaries = rebuilder.scan();
	for (let i = summaries.length - 1; i >= 0; i--) {
		const summary = summaries[i];
		const revision = rebuilder.revisionAt(i);
		choices.push({ key: revision.id, kind: 'revision', time: revision.item_updated_time, bodyLength: summary.ok ? summary.bodyLength : null });
	}
	return choices;
}

// The side for a key from `listVersionChoices`, or null when no version has
// that key (any more). Throws RebuildError when the revision cannot be rebuilt.
export function sideForKey(rebuilder: RevisionRebuilder, current: CurrentNote, key: string): ComparisonSide | null {
	if (key === CURRENT_KEY) return { kind: 'current', time: current.updatedTime, version: { title: current.title, body: current.body } };
	for (let i = 0; i < rebuilder.length; i++) {
		if (rebuilder.revisionAt(i).id === key) return revisionSide(rebuilder, i);
	}
	return null;
}

// F6: the pair of neighbouring versions one step older or newer than the
// selected ones, for the "Older pair" / "Newer pair" buttons. Choices are
// newest first, so the newer selected version sits at the lower index n.
// From a pair of neighbours (n+1 → n), the older pair is (n+2 → n+1) and the
// newer pair (n → n-1): one step back or forward. From versions that are not
// neighbours, the older pair is the one ending at the newer version
// (n+1 → n). Null when there is no such pair or one of its versions cannot
// be read.
export function neighbourPair(
	choices: VersionChoice[],
	fromKey: string,
	toKey: string,
	direction: 'older' | 'newer',
): { fromKey: string; toKey: string } | null {
	const fromIndex = choices.findIndex(choice => choice.key === fromKey);
	const toIndex = choices.findIndex(choice => choice.key === toKey);
	if (fromIndex < 0 || toIndex < 0) return null;
	const newer = Math.min(fromIndex, toIndex);
	const neighbours = Math.abs(fromIndex - toIndex) === 1;
	const toAt = direction === 'older' ? (neighbours ? newer + 1 : newer) : newer - 1;
	const pairTo = choices[toAt];
	const pairFrom = choices[toAt + 1];
	if (toAt < 0 || !pairTo || !pairFrom) return null;
	if (pairTo.bodyLength === null || pairFrom.bodyLength === null) return null;
	return { fromKey: pairFrom.key, toKey: pairTo.key };
}
