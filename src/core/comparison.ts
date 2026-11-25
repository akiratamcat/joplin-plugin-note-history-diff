import { lineDiff, LineDiffResult } from '../diff/lineDiff';
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
	// A revision could not be rebuilt (encrypted, broken patch).
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

// F5: the title is compared separately from the body.
export function diffVersions(from: NoteVersion, to: NoteVersion): VersionDiff {
	return {
		titleChanged: from.title !== to.title,
		title: { before: from.title, after: to.title },
		body: lineDiff(from.body, to.body),
	};
}
