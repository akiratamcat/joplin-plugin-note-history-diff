import joplin from 'api';
import diff_match_patch = require('diff-match-patch');

// Fields requested from the `revisions` endpoint of the Data API.
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
	item_updated_time: number;
	created_time: number;
	updated_time: number;
	title_diff: string;
	body_diff: string;
	metadata_diff: string;
	encryption_applied: number;
}

export interface FullScanResult {
	all: RevisionRow[];
	pages: number;
	elapsedMs: number;
}

// Data API pages are capped at 100 items.
const PAGE_LIMIT = 100;

// Reads every revision in the profile, page by page (R1 fallback strategy).
export async function fetchAllRevisions(): Promise<FullScanResult> {
	const started = Date.now();
	const all: RevisionRow[] = [];
	let page = 1;
	for (;;) {
		const result = await joplin.data.get(['revisions'], {
			fields: REVISION_FIELDS,
			limit: PAGE_LIMIT,
			page,
		});
		all.push(...(result.items as RevisionRow[]));
		if (!result.has_more) break;
		page++;
	}
	return { all, pages: page, elapsedMs: Date.now() - started };
}

export interface ProbeResult {
	label: string;
	ok: boolean;
	returned: number;
	matching: number;
	elapsedMs: number;
	error?: string;
}

// Tries ways of fetching only one note's revisions, to answer R1.
export async function probeFilteredFetch(noteId: string): Promise<ProbeResult[]> {
	const probes: { label: string; path: string[]; query: any }[] = [
		{
			label: "GET revisions?item_id=<noteId>",
			path: ['revisions'],
			query: { item_id: noteId, fields: REVISION_FIELDS, limit: PAGE_LIMIT },
		},
		{
			label: 'GET notes/<noteId>/revisions',
			path: ['notes', noteId, 'revisions'],
			query: { fields: REVISION_FIELDS, limit: PAGE_LIMIT },
		},
	];

	const results: ProbeResult[] = [];
	for (const probe of probes) {
		const started = Date.now();
		try {
			const result = await joplin.data.get(probe.path, probe.query);
			const items: RevisionRow[] = result && result.items ? result.items : [];
			results.push({
				label: probe.label,
				ok: true,
				returned: items.length,
				matching: items.filter(r => r.item_id === noteId).length,
				elapsedMs: Date.now() - started,
			});
		} catch (error) {
			results.push({
				label: probe.label,
				ok: false,
				returned: 0,
				matching: 0,
				elapsedMs: Date.now() - started,
				error: String(error && error.message ? error.message : error),
			});
		}
	}
	return results;
}

// Oldest first, which is the order patches must be applied in.
export function sortRevisions(revisions: RevisionRow[]): RevisionRow[] {
	return revisions.slice().sort((a, b) => {
		if (a.item_updated_time !== b.item_updated_time) return a.item_updated_time - b.item_updated_time;
		return a.created_time - b.created_time;
	});
}

export interface RebuiltRevision {
	revision: RevisionRow;
	title: string;
	body: string;
	ok: boolean;
	skipped: boolean;
	parentMatchesPrevious: boolean;
	error?: string;
}

interface PatchOutcome {
	text: string;
	ok: boolean;
}

function applyTextPatch(dmp: diff_match_patch, text: string, patchText: string): PatchOutcome {
	if (!patchText) return { text, ok: true };
	const patches = dmp.patch_fromText(patchText);
	const [patched, flags] = dmp.patch_apply(patches, text);
	return { text: patched, ok: flags.every(Boolean) };
}

// Rebuilds the full title and body of each revision by applying the
// patches in order, starting from an empty note (R2).
export function rebuildRevisions(sorted: RevisionRow[]): RebuiltRevision[] {
	const dmp = new diff_match_patch();
	const output: RebuiltRevision[] = [];
	let title = '';
	let body = '';
	let previousId = '';

	for (const revision of sorted) {
		const parentMatchesPrevious = (revision.parent_id || '') === previousId;
		previousId = revision.id;

		if (revision.encryption_applied) {
			output.push({ revision, title, body, ok: false, skipped: true, parentMatchesPrevious });
			continue;
		}

		try {
			const titleOutcome = applyTextPatch(dmp, title, revision.title_diff);
			const bodyOutcome = applyTextPatch(dmp, body, revision.body_diff);
			title = titleOutcome.text;
			body = bodyOutcome.text;
			output.push({
				revision,
				title,
				body,
				ok: titleOutcome.ok && bodyOutcome.ok,
				skipped: false,
				parentMatchesPrevious,
			});
		} catch (error) {
			output.push({
				revision,
				title,
				body,
				ok: false,
				skipped: false,
				parentMatchesPrevious,
				error: String(error && error.message ? error.message : error),
			});
		}
	}

	return output;
}

export interface RevisionSettings {
	[key: string]: { value?: any; error?: string };
}

const SETTING_KEYS = [
	'revisionService.enabled',
	'revisionService.ttlDays',
	'revisionService.intervalBetweenRevisions',
];

// Checks whether the plugin can read the note history settings (section 2 of the spec).
export async function readRevisionSettings(): Promise<RevisionSettings> {
	const output: RevisionSettings = {};
	for (const key of SETTING_KEYS) {
		try {
			output[key] = { value: await joplin.settings.globalValue(key) };
		} catch (error) {
			output[key] = { error: String(error && error.message ? error.message : error) };
		}
	}
	return output;
}
