import { applyTextPatch } from './patch';
import { RevisionCache } from './revisionCache';
import { NoteVersion, RevisionRow } from './types';

export type RebuildFailure = 'encrypted' | 'invalid-patch' | 'invalid-chain';

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

export type VersionSummary =
	| { index: number; ok: true; bodyLength: number }
	| { index: number; ok: false; reason: RebuildFailure };

const EMPTY: NoteVersion = { title: '', body: '' };

// Cache key: a revision can be rewritten by Joplin (for example when older
// revisions expire), so the update time is part of the key.
export function cacheKey(revision: RevisionRow): string {
	return `${revision.id}:${revision.updated_time}`;
}

// Rebuilds the full title and body of any revision of one note.
//
// Each revision stores patches against its recorded parent. Rebuilding can
// start from a cached ancestor or from empty text at the root of the chain.
export class RevisionRebuilder {
	private readonly indexesById: Map<string, number>;
	private readonly warned = new Set<string>();

	constructor(
		// Revisions of a single note in display order, oldest first.
		private readonly revisions: RevisionRow[],
		private readonly cache: RevisionCache,
		private readonly checkpointInterval = 10,
	) {
		this.indexesById = new Map(revisions.map((revision, index) => [revision.id, index]));
	}

	public get length(): number {
		return this.revisions.length;
	}

	public revisionAt(index: number): RevisionRow {
		this.checkIndex(index);
		return this.revisions[index];
	}

	public versionAt(index: number): NoteVersion {
		this.checkIndex(index);

		const pending = new Set<number>();
		let version = EMPTY;
		for (let ancestor: number | undefined = index; ancestor !== undefined; ancestor = this.parentIndex(ancestor)) {
			const hit = this.cache.get(cacheKey(this.revisions[ancestor]));
			if (hit) {
				version = hit;
				break;
			}
			if (pending.has(ancestor)) {
				this.warn(ancestor, 'invalid-chain');
				throw new RebuildError(this.revisions[ancestor].id, ancestor, 'invalid-chain', 'Revision parent chain contains a cycle');
			}
			pending.add(ancestor);
		}

		for (const i of Array.from(pending).reverse()) {
			version = this.applyRevision(version, i);
			if (i === index || (i + 1) % this.checkpointInterval === 0) {
				this.cache.set(cacheKey(this.revisions[i]), version);
			}
		}
		return version;
	}

	// Reports the body length of each version for the version list. Consecutive
	// revisions usually share a chain, so keep the previous result for reuse.
	public scan(): VersionSummary[] {
		const summaries: VersionSummary[] = [];
		let previous: NoteVersion | RebuildError = EMPTY;
		for (let i = 0; i < this.revisions.length; i++) {
			const key = cacheKey(this.revisions[i]);
			try {
				let version = this.cache.get(key);
				if (!version) {
					const parent = this.parentIndex(i);
					const base = parent === i - 1 ? previous : parent === undefined ? EMPTY : this.versionAt(parent);
					if (base instanceof RebuildError) throw base;
					version = this.applyRevision(base, i);
					if ((i + 1) % this.checkpointInterval === 0 || i === this.revisions.length - 1) {
						this.cache.set(key, version);
					}
				}
				previous = version;
				summaries.push({ index: i, ok: true, bodyLength: version.body.length });
			} catch (error) {
				if (!(error instanceof RebuildError)) throw error;
				previous = error;
				summaries.push({ index: i, ok: false, reason: error.reason });
			}
		}
		return summaries;
	}

	private parentIndex(index: number): number | undefined {
		const parentId = this.revisions[index].parent_id;
		if (!parentId) return undefined;
		const parent = this.indexesById.get(parentId);
		if (parent === undefined) this.warn(index, 'missing-parent');
		return parent;
	}

	private warn(index: number, reason: string, hunks?: Record<string, number>): void {
		const key = `${index}:${reason}`;
		if (this.warned.has(key)) return;
		this.warned.add(key);
		const revision = this.revisions[index];
		console.warn(`Note History Diff: ${reason}`, {
			revisionId: revision.id,
			parentId: revision.parent_id,
			revisionNumber: index + 1,
			revisionCount: this.revisions.length,
			...hunks,
		});
	}

	private applyRevision(previous: NoteVersion, index: number): NoteVersion {
		const revision = this.revisions[index];
		if (revision.encryption_applied) {
			this.warn(index, 'encrypted');
			throw new RebuildError(revision.id, index, 'encrypted', `Revision ${revision.id} is still encrypted`);
		}
		let title;
		let body;
		try {
			title = applyTextPatch(previous.title, revision.title_diff);
			body = applyTextPatch(previous.body, revision.body_diff);
		} catch {
			this.warn(index, 'invalid-patch');
			throw new RebuildError(revision.id, index, 'invalid-patch', 'Could not read the revision patch');
		}
		// Joplin keeps the resulting text even when some hunks fail to apply.
		if (title.failedHunks || body.failedHunks) {
			this.warn(index, 'patch-not-applied', {
				titleFailedHunks: title.failedHunks,
				titleTotalHunks: title.totalHunks,
				bodyFailedHunks: body.failedHunks,
				bodyTotalHunks: body.totalHunks,
			});
		}
		return { title: title.text, body: body.text };
	}

	private checkIndex(index: number): void {
		if (!Number.isInteger(index) || index < 0 || index >= this.revisions.length) {
			throw new RangeError(`Revision index ${index} is out of range (0..${this.revisions.length - 1})`);
		}
	}
}
