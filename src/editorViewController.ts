import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { diffVersions, planDefaultComparison } from './core/comparison';
import { joplinRevisionFetcher } from './history/joplinFetcher';
import { RevisionRepository } from './history/revisionRepository';
import { stringsFor } from './ui/i18n';
import { PanelState, renderPanel } from './ui/panelView';

// Shows the note history diff in the editor area (where the note editor is),
// like Joplin's own "Note history" view, using the editor plugin API.
//
// An editor plugin should only be active when relevant: only one editor view
// can be active at a time. So the view is active only for the note the user
// asked to see the history of (`historyNoteId`), and closing it switches back
// to the normal editor.

export const SHOW_DIFF_COMMAND = 'noteHistoryDiff.showDiff';
export const EDITOR_STATUS_COMMAND = 'noteHistoryDiff.editorViewStatus';
const VIEW_ID = 'historyDiffView';

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

function wait(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function registerHistoryEditorView(): Promise<void> {
	const strings = stringsFor(await globalSetting('locale'));
	const repository = new RevisionRepository(joplinRevisionFetcher);

	let viewHandle: string | null = null;
	// The note whose history the user asked to see. The view is active only for it.
	let historyNoteId: string | null = null;
	let generation = 0;
	// Diagnostics for the verification of the editor view behaviour.
	const log: string[] = [];
	const note = (line: string) => {
		const entry = `${new Date().toLocaleTimeString()} ${line}`;
		log.push(entry);
		if (log.length > 30) log.shift();
		console.info(`Note History Diff: ${line}`);
	};

	const render = async (state: PanelState) => {
		if (viewHandle) await joplin.views.editors.setHtml(viewHandle, renderPanel(state, strings));
	};

	const computeState = async (noteId: string): Promise<PanelState> => {
		const current = await joplin.data.get(['notes', noteId], { fields: ['id', 'title', 'body', 'updated_time'] });
		const rebuilder = await repository.rebuilderFor(noteId);
		const plan = planDefaultComparison(rebuilder, { title: current.title, body: current.body, updatedTime: current.updated_time });
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

	const refresh = async (noteId: string, options: { reloadHistory?: boolean } = {}) => {
		const mine = ++generation;
		if (options.reloadHistory) repository.invalidate();
		await render({ kind: 'loading' });
		let state: PanelState;
		try {
			state = await computeState(noteId);
		} catch (error) {
			console.error('Note History Diff: could not compute the diff', error);
			state = { kind: 'error', message: errorMessage(error) };
		}
		if (mine === generation) await render(state);
	};

	const isVisible = async () => {
		if (!viewHandle) return false;
		try {
			return await joplin.views.editors.isVisible(viewHandle);
		} catch (error) {
			return false;
		}
	};

	const close = async () => {
		note('close requested');
		historyNoteId = null;
		if (await isVisible()) {
			await joplin.commands.execute('toggleEditorPlugin');
			await wait(300);
			note(`after toggleEditorPlugin: visible=${await isVisible()}`);
		}
	};

	await joplin.views.editors.register(VIEW_ID, {
		onSetup: async (handle: string) => {
			viewHandle = handle;
			note('onSetup');
			await joplin.views.editors.addScript(handle, './ui/webview/panel.css');
			await joplin.views.editors.addScript(handle, './ui/webview/panel.js');
			await joplin.views.editors.onMessage(handle, async (message: any) => {
				if (!message) return null;
				if (message.type === 'close') await close();
				if (message.type === 'refresh' && historyNoteId) await refresh(historyNoteId, { reloadHistory: true });
				return null;
			});
			await joplin.views.editors.onUpdate(handle, async event => {
				note(`onUpdate note=${event.noteId === historyNoteId ? 'history note' : 'other'}`);
				if (event.noteId === historyNoteId) await refresh(event.noteId);
			});
		},
		onActivationCheck: async event => {
			const active = !!event.noteId && event.noteId === historyNoteId;
			note(`onActivationCheck → ${active}`);
			return active;
		},
	});

	// Leaving the note ends the history view, like Joplin's own history viewer.
	await joplin.workspace.onNoteSelectionChange(async (event: any) => {
		const selected = event && event.value && event.value.length ? event.value[0] : null;
		if (historyNoteId && selected !== historyNoteId) {
			note('note changed: history view ends');
			historyNoteId = null;
		}
	});

	await joplin.commands.register({
		name: SHOW_DIFF_COMMAND,
		label: strings.commandLabel,
		iconName: 'fas fa-history',
		execute: async () => {
			const selected = await joplin.workspace.selectedNote();
			if (!selected) return;
			historyNoteId = selected.id;
			note('show requested');

			// Path 1: ask Joplin to show the editor plugin.
			await joplin.commands.execute('showEditorPlugin');
			await wait(300);
			if (await isVisible()) {
				note('shown by showEditorPlugin');
			} else {
				// Path 2: activation is checked when a note is opened, so re-open the note, then show again.
				note('not visible after showEditorPlugin: re-opening the note');
				await joplin.commands.execute('openNote', selected.id);
				await wait(300);
				await joplin.commands.execute('showEditorPlugin');
				await wait(300);
				note(`after re-open + showEditorPlugin: visible=${await isVisible()}`);
			}
			await refresh(selected.id, { reloadHistory: true });
		},
	});

	await joplin.commands.register({
		name: EDITOR_STATUS_COMMAND,
		label: '[dev] Note History Diff: editor view status',
		execute: async () => {
			let active: any = 'unknown';
			try {
				active = viewHandle ? await joplin.views.editors.isActive(viewHandle) : 'no view';
			} catch (error) {
				active = `error: ${errorMessage(error)}`;
			}
			const shown = await globalSetting('plugins.shownEditorViewIds');
			const lines = [
				'Note History Diff: editor view status',
				`view handle: ${viewHandle ? 'set' : 'none'}`,
				`active: ${active}`,
				`visible: ${await isVisible()}`,
				`history note set: ${historyNoteId ? 'yes' : 'no'}`,
				`plugins.shownEditorViewIds: ${JSON.stringify(shown)}`,
				'',
				'Recent events:',
				...log,
			];
			await joplin.clipboard.writeText(lines.join('\n'));
			await joplin.views.dialogs.showMessageBox(`${lines.join('\n')}\n\n(Copied to the clipboard.)`);
		},
	});

	await joplin.views.menuItems.create('noteHistoryDiff.showDiffMenu', SHOW_DIFF_COMMAND, MenuItemLocation.Tools);
	await joplin.views.menuItems.create('noteHistoryDiff.editorStatusMenu', EDITOR_STATUS_COMMAND, MenuItemLocation.Tools);
	await joplin.views.toolbarButtons.create('noteHistoryDiff.showDiffButton', SHOW_DIFF_COMMAND, ToolbarButtonLocation.NoteToolbar);
}
