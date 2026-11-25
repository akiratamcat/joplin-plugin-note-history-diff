import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { diffVersions, planDefaultComparison } from './core/comparison';
import { joplinRevisionFetcher } from './history/joplinFetcher';
import { RevisionRepository } from './history/revisionRepository';
import { stringsFor } from './ui/i18n';
import { PanelState, renderPanel } from './ui/panelView';

export const SHOW_DIFF_COMMAND = 'noteHistoryDiff.showDiff';

// Re-diff this long after the last edit of the open note.
const NOTE_CHANGE_DELAY_MS = 500;

async function globalSetting(key: string): Promise<any> {
	try {
		return await joplin.settings.globalValue(key);
	} catch (error) {
		return null;
	}
}

async function historySettings(): Promise<Extract<PanelState, { kind: 'no-history' }>> {
	const enabled = await globalSetting('revisionService.enabled');
	const intervalMs = await globalSetting('revisionService.intervalBetweenRevisions');
	const ttlDays = await globalSetting('revisionService.ttlDays');
	return {
		kind: 'no-history',
		enabled: typeof enabled === 'boolean' ? enabled : null,
		intervalMinutes: typeof intervalMs === 'number' ? Math.round(intervalMs / 60000) : null,
		ttlDays: typeof ttlDays === 'number' ? ttlDays : null,
	};
}

function errorMessage(error: any): string {
	return String(error && error.message ? error.message : error);
}

// The Note History Diff panel (F1, F5): shows what changed in the open note.
export async function registerDiffPanel(): Promise<void> {
	const strings = stringsFor(await globalSetting('locale'));
	const repository = new RevisionRepository(joplinRevisionFetcher);

	const panel = await joplin.views.panels.create('noteHistoryDiff.diffPanel');
	await joplin.views.panels.addScript(panel, './ui/webview/panel.css');
	await joplin.views.panels.addScript(panel, './ui/webview/panel.js');
	await joplin.views.panels.setHtml(panel, renderPanel({ kind: 'no-note' }, strings));
	await joplin.views.panels.show(panel, false);

	// Each refresh gets a number; a result is shown only if no newer refresh has started.
	let generation = 0;
	let currentNoteId: string | null = null;
	let noteChangeTimer: ReturnType<typeof setTimeout> | null = null;

	const render = async (state: PanelState) => {
		await joplin.views.panels.setHtml(panel, renderPanel(state, strings));
	};

	const computeState = async (noteId: string): Promise<PanelState> => {
		const note = await joplin.data.get(['notes', noteId], { fields: ['id', 'title', 'body', 'updated_time'] });
		const rebuilder = await repository.rebuilderFor(noteId);
		const plan = planDefaultComparison(rebuilder, { title: note.title, body: note.body, updatedTime: note.updated_time });
		switch (plan.kind) {
		case 'no-history':
			return await historySettings();
		case 'nothing-to-compare':
			return { kind: 'nothing-to-compare' };
		case 'rebuild-failed':
			return { kind: 'rebuild-failed', reason: plan.error.reason };
		case 'compare':
			return {
				kind: 'result',
				from: { kind: plan.from.kind, time: plan.from.time },
				to: { kind: plan.to.kind, time: plan.to.time },
				diff: diffVersions(plan.from.version, plan.to.version),
				previousVsLatest: plan.to.kind === 'revision',
			};
		}
	};

	const refresh = async (options: { reloadHistory?: boolean; showLoading?: boolean } = {}) => {
		const mine = ++generation;
		if (options.reloadHistory) repository.invalidate();

		const note = await joplin.workspace.selectedNote();
		currentNoteId = note ? note.id : null;
		if (!note) {
			if (mine === generation) await render({ kind: 'no-note' });
			return;
		}
		if (options.showLoading) await render({ kind: 'loading' });

		let state: PanelState;
		try {
			state = await computeState(note.id);
		} catch (error) {
			console.error('Note History Diff: could not compute the diff', error);
			state = { kind: 'error', message: errorMessage(error) };
		}
		if (mine !== generation) return;
		await render(state);
	};

	const isVisible = async () => {
		try {
			return await joplin.views.panels.visible(panel);
		} catch (error) {
			return false;
		}
	};

	await joplin.views.panels.onMessage(panel, async (message: any) => {
		if (!message) return null;
		if (message.type === 'close') await joplin.views.panels.show(panel, false);
		if (message.type === 'refresh') await refresh({ reloadHistory: true, showLoading: true });
		return null;
	});

	await joplin.workspace.onNoteSelectionChange(async () => {
		if (await isVisible()) await refresh({ showLoading: true });
	});

	await joplin.workspace.onNoteChange(async (event: any) => {
		if (!event || event.id !== currentNoteId || !(await isVisible())) return;
		if (noteChangeTimer) clearTimeout(noteChangeTimer);
		noteChangeTimer = setTimeout(() => {
			noteChangeTimer = null;
			void refresh();
		}, NOTE_CHANGE_DELAY_MS);
	});

	await joplin.commands.register({
		name: SHOW_DIFF_COMMAND,
		label: strings.commandLabel,
		iconName: 'fas fa-history',
		execute: async () => {
			await joplin.views.panels.show(panel, true);
			// Revisions are created in the background, so re-read them on explicit requests.
			await refresh({ reloadHistory: true, showLoading: true });
		},
	});

	await joplin.views.menuItems.create('noteHistoryDiff.showDiffMenu', SHOW_DIFF_COMMAND, MenuItemLocation.Tools);
	await joplin.views.toolbarButtons.create('noteHistoryDiff.showDiffButton', SHOW_DIFF_COMMAND, ToolbarButtonLocation.NoteToolbar);
}
