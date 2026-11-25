import joplin from 'api';
import { MenuItemLocation } from 'api/types';
import { lineDiff } from '../diff/lineDiff';
import {
	renderCompareHtml,
	renderCompareSummary,
	renderHtml,
	renderMessage,
	renderSummary,
	CompareResult,
	DiffSection,
	VerificationResult,
} from './report';
import { runSyntheticBenchmark } from './synthetic';
import {
	fetchAllRevisions,
	probeFilteredFetch,
	readRevisionSettings,
	rebuildRevisions,
} from './verifyRevisions';
import { sortRevisions } from '../history/revisionRepository';
import { RevisionRow } from '../history/types';

// Prototype for the verification plan in docs/spec.md (section 7).
// It only reads data: it never writes notes or revisions.

const COMMAND_NAME = 'noteHistoryDiff.runVerification';
const CLOSE_COMMAND_NAME = 'noteHistoryDiff.closePanel';
const COMPARE_COMMAND_NAME = 'noteHistoryDiff.compareTestNotes';
const TEST_NOTE_BEFORE = 'NHD-test-before';
const TEST_NOTE_AFTER = 'NHD-test-after';
const TOP_NOTES = 10;
const NOTE_ITEM_TYPE = 1;

let panelWidth: number | null = null;
let lastSummary = '';

async function joplinVersion(): Promise<string> {
	try {
		const info = await joplin.versionInfo();
		return `${info.version} (${info.platform})`;
	} catch (error) {
		return 'unknown';
	}
}

// Counts revisions per note and returns the notes with the most revisions.
async function topNotesByRevisionCount(all: RevisionRow[]): Promise<VerificationResult['topNotes']> {
	const counts = new Map<string, number>();
	for (const r of all) {
		if (r.item_type !== NOTE_ITEM_TYPE) continue;
		counts.set(r.item_id, (counts.get(r.item_id) || 0) + 1);
	}
	const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, TOP_NOTES);
	const output: VerificationResult['topNotes'] = [];
	for (const [noteId, count] of top) {
		let title = '(deleted note)';
		try {
			const note = await joplin.data.get(['notes', noteId], { fields: ['title'] });
			title = note.title;
		} catch (error) {
			// The note may have been deleted while its revisions remain.
		}
		output.push({ noteId, title, count });
	}
	return output;
}

// Finds a note by its exact title by listing all notes (titles only).
async function findNoteByTitle(title: string): Promise<{ id: string; title: string; body: string } | null> {
	let page = 1;
	for (;;) {
		const result = await joplin.data.get(['notes'], { fields: ['id', 'title'], limit: 100, page });
		const found = (result.items as { id: string; title: string }[]).find(n => n.title === title);
		if (found) return await joplin.data.get(['notes', found.id], { fields: ['id', 'title', 'body'] });
		if (!result.has_more) return null;
		page++;
	}
}

function countLines(text: string): number {
	return text ? text.split('\n').length : 0;
}

// Compares the two test notes (large body, width switching) and runs the synthetic history benchmark (R3).
async function compareTestNotes(): Promise<CompareResult | string> {
	const before = await findNoteByTitle(TEST_NOTE_BEFORE);
	const after = await findNoteByTitle(TEST_NOTE_AFTER);
	if (!before || !after) {
		return `Create two notes titled “${TEST_NOTE_BEFORE}” and “${TEST_NOTE_AFTER}” first (see docs/prototype.md).`;
	}
	return {
		ranAt: Date.now(),
		joplinVersion: await joplinVersion(),
		before: { title: before.title, lines: countLines(before.body), chars: before.body.length },
		after: { title: after.title, lines: countLines(after.body), chars: after.body.length },
		diff: { label: `${TEST_NOTE_BEFORE} → ${TEST_NOTE_AFTER}`, result: lineDiff(before.body, after.body) },
		synthetic: runSyntheticBenchmark(before.body, 100),
	};
}

async function verify(noteId: string): Promise<VerificationResult> {
	const note = await joplin.data.get(['notes', noteId], { fields: ['id', 'title', 'body', 'updated_time'] });

	const fullScan = await fetchAllRevisions();
	const forNote = fullScan.all.filter(r => r.item_id === noteId && r.item_type === NOTE_ITEM_TYPE);
	const probes = await probeFilteredFetch(noteId);

	const rebuildStarted = Date.now();
	const rebuilt = rebuildRevisions(sortRevisions(forNote));
	const rebuildMs = Date.now() - rebuildStarted;
	const cachedChars = rebuilt.reduce((sum, r) => sum + r.title.length + r.body.length, 0);

	const usable = rebuilt.filter(r => !r.skipped);
	const latest = usable.length ? usable[usable.length - 1] : null;
	const previous = usable.length > 1 ? usable[usable.length - 2] : null;

	const diffs: DiffSection[] = [];
	if (latest) {
		diffs.push({ label: 'Latest revision → current note', result: lineDiff(latest.body, note.body) });
	}
	if (latest && previous) {
		diffs.push({ label: 'Previous revision → latest revision', result: lineDiff(previous.body, latest.body) });
	}

	return {
		topNotes: await topNotesByRevisionCount(fullScan.all),
		ranAt: Date.now(),
		joplinVersion: await joplinVersion(),
		settings: await readRevisionSettings(),
		note: { id: note.id, titleLength: note.title.length, bodyLength: note.body.length, updatedTime: note.updated_time },
		fullScan: {
			totalRevisions: fullScan.all.length,
			pages: fullScan.pages,
			elapsedMs: fullScan.elapsedMs,
			forThisNote: forNote.length,
		},
		probes,
		rebuilt,
		rebuildMs,
		cachedChars,
		latestVsCurrent: latest ? { titleEqual: latest.title === note.title, bodyEqual: latest.body === note.body } : null,
		diffs,
	};
}

// Registers the verification prototype commands (docs/prototype.md).
// To be removed before v1.
export async function registerDevTools(): Promise<void> {
	{
		const panel = await joplin.views.panels.create('noteHistoryDiff.panel');
		await joplin.views.panels.addScript(panel, './dev/panel/panel.css');
		await joplin.views.panels.addScript(panel, './dev/panel/panel.js');
		await joplin.views.panels.setHtml(panel, renderMessage('Run “[dev] Note History Diff: run verification” from the Tools menu.'));
		await joplin.views.panels.show(panel, false);

		await joplin.views.panels.onMessage(panel, async (message: any) => {
			if (message && message.type === 'close') {
				await joplin.views.panels.show(panel, false);
				return null;
			}
			if (message && message.type === 'width') {
				panelWidth = message.width;
				return null;
			}
			if (message && message.type === 'copy') {
				await joplin.clipboard.writeText(lastSummary);
				return 'copied';
			}
			return null;
		});

		await joplin.commands.register({
			name: COMMAND_NAME,
			label: '[dev] Note History Diff: run verification',
			execute: async () => {
				await joplin.views.panels.show(panel, true);
				const note = await joplin.workspace.selectedNote();
				if (!note) {
					await joplin.views.panels.setHtml(panel, renderMessage('Select a note first.'));
					return;
				}
				await joplin.views.panels.setHtml(panel, renderMessage('Running verification…'));
				try {
					const result = await verify(note.id);
					lastSummary = renderSummary(result, panelWidth);
					console.info(lastSummary);
					await joplin.views.panels.setHtml(panel, renderHtml(result, panelWidth === null ? 'unknown' : `${panelWidth}px`));
				} catch (error) {
					console.error('Note History Diff verification failed', error);
					const text = String(error && error.message ? error.message : error);
					await joplin.views.panels.setHtml(panel, renderMessage(`<strong>Verification failed:</strong> ${text.replace(/</g, '&lt;')}`));
				}
			},
		});

		await joplin.commands.register({
			name: COMPARE_COMMAND_NAME,
			label: '[dev] Note History Diff: compare test notes',
			execute: async () => {
				await joplin.views.panels.show(panel, true);
				await joplin.views.panels.setHtml(panel, renderMessage('Comparing test notes…'));
				try {
					const result = await compareTestNotes();
					if (typeof result === 'string') {
						await joplin.views.panels.setHtml(panel, renderMessage(result));
						return;
					}
					lastSummary = renderCompareSummary(result, panelWidth);
					console.info(lastSummary);
					await joplin.views.panels.setHtml(panel, renderCompareHtml(result, panelWidth === null ? 'unknown' : `${panelWidth}px`));
				} catch (error) {
					console.error('Note History Diff comparison failed', error);
					const text = String(error && error.message ? error.message : error);
					await joplin.views.panels.setHtml(panel, renderMessage(`<strong>Comparison failed:</strong> ${text.replace(/</g, '&lt;')}`));
				}
			},
		});

		await joplin.commands.register({
			name: CLOSE_COMMAND_NAME,
			label: '[dev] Note History Diff: close verification panel',
			execute: async () => {
				await joplin.views.panels.show(panel, false);
			},
		});

		await joplin.views.menuItems.create('noteHistoryDiff.menu', COMMAND_NAME, MenuItemLocation.Tools);
		await joplin.views.menuItems.create('noteHistoryDiff.compareMenu', COMPARE_COMMAND_NAME, MenuItemLocation.Tools);
		await joplin.views.menuItems.create('noteHistoryDiff.closeMenu', CLOSE_COMMAND_NAME, MenuItemLocation.Tools);
	}
}
