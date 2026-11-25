import { RevisionCache } from './revisionCache';
import { RevisionRebuilder } from './revisionRebuilder';
import { NOTE_ITEM_TYPE, RevisionPageFetcher, RevisionRow } from './types';

// Reads every revision, page by page. The Data API cannot filter revisions by
// note ID (`item_id` is ignored, `notes/<id>/revisions` does not exist), so
// the whole list is read and indexed (R1, confirmed on Joplin 3.7.24).
export async function fetchAllRevisionRows(fetchPage: RevisionPageFetcher): Promise<RevisionRow[]> {
	const rows: RevisionRow[] = [];
	for (let page = 1; ; page++) {
		const result = await fetchPage(page);
		rows.push(...result.items);
		if (!result.has_more) break;
	}
	return rows;
}

// Oldest first, which is the order patches must be applied in.
export function sortRevisions(rows: RevisionRow[]): RevisionRow[] {
	return rows.slice().sort((a, b) => {
		if (a.item_updated_time !== b.item_updated_time) return a.item_updated_time - b.item_updated_time;
		return a.created_time - b.created_time;
	});
}

// Groups note revisions by note ID, each list sorted oldest first.
export function indexRevisions(rows: RevisionRow[]): Map<string, RevisionRow[]> {
	const byNote = new Map<string, RevisionRow[]>();
	for (const row of rows) {
		if (row.item_type !== NOTE_ITEM_TYPE) continue;
		const list = byNote.get(row.item_id);
		if (list) list.push(row);
		else byNote.set(row.item_id, [row]);
	}
	byNote.forEach((list, noteId) => byNote.set(noteId, sortRevisions(list)));
	return byNote;
}

export interface RevisionRepositoryOptions {
	// Upper bound of characters held by the version cache (shared by all notes).
	cacheMaxChars?: number;
	checkpointInterval?: number;
}

const DEFAULT_CACHE_MAX_CHARS = 5_000_000;
const DEFAULT_CHECKPOINT_INTERVAL = 10;

// Entry point to the note history: loads the revision index lazily and hands
// out a rebuilder per note. Call `invalidate()` when revisions may have changed.
export class RevisionRepository {
	private index: Map<string, RevisionRow[]> | null = null;
	private loading: Promise<Map<string, RevisionRow[]>> | null = null;
	private readonly cache: RevisionCache;
	private readonly checkpointInterval: number;

	constructor(private readonly fetchPage: RevisionPageFetcher, options: RevisionRepositoryOptions = {}) {
		this.cache = new RevisionCache(options.cacheMaxChars ?? DEFAULT_CACHE_MAX_CHARS);
		this.checkpointInterval = options.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL;
	}

	public async revisionsFor(noteId: string): Promise<RevisionRow[]> {
		const index = await this.loadIndex();
		return index.get(noteId) || [];
	}

	public async rebuilderFor(noteId: string): Promise<RevisionRebuilder> {
		return new RevisionRebuilder(await this.revisionsFor(noteId), this.cache, this.checkpointInterval);
	}

	// Drops the index (re-read on next use). Cached versions stay valid because
	// their keys include each revision's update time.
	public invalidate(): void {
		this.index = null;
		this.loading = null;
	}

	public get cachedChars(): number {
		return this.cache.totalChars;
	}

	private async loadIndex(): Promise<Map<string, RevisionRow[]>> {
		if (this.index) return this.index;
		if (!this.loading) {
			const loading = fetchAllRevisionRows(this.fetchPage).then(rows => indexRevisions(rows));
			this.loading = loading;
			loading.then(
				index => {
					if (this.loading === loading) this.index = index;
				},
				() => {
					if (this.loading === loading) this.loading = null;
				},
			);
		}
		return this.loading;
	}
}
