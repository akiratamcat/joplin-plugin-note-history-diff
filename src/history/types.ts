// Shapes of the data read from Joplin's `revisions` Data API endpoint.

export const NOTE_ITEM_TYPE = 1;

// Fields requested from the `revisions` endpoint.
export const REVISION_FIELDS = [
	'id',
	'parent_id',
	'item_type',
	'item_id',
	'item_updated_time',
	'created_time',
	'updated_time',
	'title_diff',
	'body_diff',
	'metadata_diff',
	'encryption_applied',
];

export interface RevisionRow {
	id: string;
	parent_id: string;
	item_type: number;
	item_id: string;
	// Time the note was last updated when this revision was taken. A revision
	// holds the note content as of this time (confirmed on Joplin 3.7.24).
	item_updated_time: number;
	created_time: number;
	updated_time: number;
	// JSON of diff-match-patch's patch_make() result, `[]` when unchanged.
	title_diff: string;
	body_diff: string;
	metadata_diff: string;
	encryption_applied: number;
}

export interface NoteVersion {
	title: string;
	body: string;
}

export interface RevisionPage {
	items: RevisionRow[];
	has_more: boolean;
}

// Reads one page of revisions. Injected so the history code can be tested without Joplin.
export type RevisionPageFetcher = (page: number) => Promise<RevisionPage>;
