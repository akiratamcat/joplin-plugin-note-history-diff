import joplin from 'api';
import { joplinRevisionFetcher } from '../history/joplinFetcher';
import { applyTextPatch } from '../history/patch';
import { fetchAllRevisionRows } from '../history/revisionRepository';
import { REVISION_FIELDS, RevisionRow } from '../history/types';

// Diagnostics used by the verification prototype (docs/prototype.md).
// Product code lives in src/history; this file only adds checks that are
// useful while verifying behaviour on a real Joplin profile.

export interface FullScanResult {
	all: RevisionRow[];
	pages: number;
	elapsedMs: number;
}

// Data API pages are capped at 100 items.
const PAGE_LIMIT = 100;

export async function fetchAllRevisions(): Promise<FullScanResult> {
	const started = Date.now();
	let pages = 0;
	const all = await fetchAllRevisionRows(async page => {
		pages = page;
		return await joplinRevisionFetcher(page);
	});
	return { all, pages, elapsedMs: Date.now() - started };
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
			label: 'GET revisions?item_id=<noteId>',
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

export interface RebuiltRevision {
	revision: RevisionRow;
	title: string;
	body: string;
	ok: boolean;
	skipped: boolean;
	parentMatchesPrevious: boolean;
	error?: string;
}

// Replays every patch in order and reports each revision separately, so a
// single bad revision is visible (the product rebuilder stops at the first error).
export function rebuildRevisions(sorted: RevisionRow[]): RebuiltRevision[] {
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
			const titleOutcome = applyTextPatch(title, revision.title_diff);
			const bodyOutcome = applyTextPatch(body, revision.body_diff);
			title = titleOutcome.text;
			body = bodyOutcome.text;
			output.push({ revision, title, body, ok: titleOutcome.ok && bodyOutcome.ok, skipped: false, parentMatchesPrevious });
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
