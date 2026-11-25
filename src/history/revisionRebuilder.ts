import { applyTextPatch } from './patch';
import { RevisionCache } from './revisionCache';
import { NoteVersion, RevisionRow } from './types';

export type RebuildFailure = 'encrypted' | 'invalid-patch' | 'patch-not-applied';

export class RebuildError extends Error {
	constructor(
		public readonly revisionId: string,
		public readonly index: number,
		public readonly reason: RebuildFailure,
		message: string,
	) {
		super(message);
		this.name = 'RebuildError';
	}
}

const EMPTY: NoteVersion = { title: '', body: '' };

// Cache key: a revision can be rewritten by Joplin (for example when older
// revisions expire), so the update time is part of the key.
export function cacheKey(revision: RevisionRow): string {
	return `${revision.id}:${revision.updated_time}`;
}

// Rebuilds the full title and body of any revision of one note.
//
// Revisions only store patches, so version N needs every patch from the first
// revision up to N. To avoid replaying the whole chain each time, every
// `checkpointInterval`-th version is cached (a "checkpoint") and rebuilding
// starts from the nearest cached version at or before N.
export class RevisionRebuilder {
	constructor(
		// Revisions of a single note, oldest first.
		private readonly revisions: RevisionRow[],
		private readonly cache: RevisionCache,
		private readonly checkpointInterval = 10,
	) {}

	public get length(): number {
		return this.revisions.length;
	}

	public revisionAt(index: number): RevisionRow {
		this.checkIndex(index);
		return this.revisions[index];
	}

	public versionAt(index: number): NoteVersion {
		this.checkIndex(index);

		const cached = this.cache.get(cacheKey(this.revisions[index]));
		if (cached) return cached;

		// Find the nearest cached version before `index`.
		let start = index - 1;
		let version = EMPTY;
		for (; start >= 0; start--) {
			const hit = this.cache.get(cacheKey(this.revisions[start]));
			if (hit) {
				version = hit;
				break;
			}
		}

		for (let i = start + 1; i <= index; i++) {
			version = this.applyRevision(version, i);
			if (i === index || (i + 1) % this.checkpointInterval === 0) {
				this.cache.set(cacheKey(this.revisions[i]), version);
			}
		}
		return version;
	}

	private applyRevision(previous: NoteVersion, index: number): NoteVersion {
		const revision = this.revisions[index];
		if (revision.encryption_applied) {
			throw new RebuildError(revision.id, index, 'encrypted', `Revision ${revision.id} is still encrypted`);
		}
		let title;
		let body;
		try {
			title = applyTextPatch(previous.title, revision.title_diff);
			body = applyTextPatch(previous.body, revision.body_diff);
		} catch (error) {
			throw new RebuildError(revision.id, index, 'invalid-patch', String(error && error.message ? error.message : error));
		}
		if (!title.ok || !body.ok) {
			throw new RebuildError(revision.id, index, 'patch-not-applied', `Revision ${revision.id} could not be applied cleanly`);
		}
		return { title: title.text, body: body.text };
	}

	private checkIndex(index: number): void {
		if (!Number.isInteger(index) || index < 0 || index >= this.revisions.length) {
			throw new RangeError(`Revision index ${index} is out of range (0..${this.revisions.length - 1})`);
		}
	}
}
