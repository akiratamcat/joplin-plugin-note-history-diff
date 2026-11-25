import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { lineDiff } from './lineDiff';
import { renderHtml, renderMessage, renderSummary, DiffSection, VerificationResult } from './report';
import {
	fetchAllRevisions,
	probeFilteredFetch,
	readRevisionSettings,
	rebuildRevisions,
	sortRevisions,
} from './revisions';

// Prototype for the verification plan in docs/spec.md (section 7).
// It only reads data: it never writes notes or revisions.

const COMMAND_NAME = 'noteHistoryDiff.runVerification';
const CLOSE_COMMAND_NAME = 'noteHistoryDiff.closePanel';
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

joplin.plugins.register({
	onStart: async function() {
		const panel = await joplin.views.panels.create('noteHistoryDiff.panel');
		await joplin.views.panels.addScript(panel, './panel/panel.css');
		await joplin.views.panels.addScript(panel, './panel/panel.js');
		await joplin.views.panels.setHtml(panel, renderMessage('Run “Note History Diff: run verification” from the Tools menu.'));
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
			label: 'Note History Diff: run verification',
			iconName: 'fas fa-columns',
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
			name: CLOSE_COMMAND_NAME,
			label: 'Note History Diff: close panel',
			execute: async () => {
				await joplin.views.panels.show(panel, false);
			},
		});

		await joplin.views.menuItems.create('noteHistoryDiff.menu', COMMAND_NAME, MenuItemLocation.Tools);
		await joplin.views.menuItems.create('noteHistoryDiff.closeMenu', CLOSE_COMMAND_NAME, MenuItemLocation.Tools);
		await joplin.views.toolbarButtons.create('noteHistoryDiff.toolbar', COMMAND_NAME, ToolbarButtonLocation.NoteToolbar);
	},
});
