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
// Joplin re-runs the editor activation check only when the note changes (or a
// note lock / the set of editor views changes), never on demand for the same
// note, and `showEditorPlugin` can only show an editor that is already active
// (confirmed in v0.3.0). So the view answers "active" for every note and
// stays hidden until the user asks for the history; "Close" and leaving the
// note switch back to the normal editor with `toggleEditorPlugin`.

export const SHOW_DIFF_COMMAND = 'noteHistoryDiff.showDiff';
export const EDITOR_STATUS_COMMAND = 'noteHistoryDiff.editorViewStatus';
const VIEW_ID = 'historyDiffView';
// An opening of the view this soon after a note change is Joplin re-opening it by itself.
const AUTO_REOPEN_WINDOW_MS = 2000;
// At startup Joplin re-opens a view that was left open; it remembers that in the
// setting below. The first opening is not always that, though: Joplin does not
// send updates to a hidden view, so the user's first "toggle editor" press is
// also a first update (v0.3.2 test). So the setting, read before Joplin shows
// anything, tells the two apart. Only if it cannot be read, a first opening
// this soon after setup counts as automatic (v0.3.3 rule).
const SHOWN_EDITOR_VIEWS_SETTING = 'plugins.shownEditorViewIds';
const STARTUP_REOPEN_WINDOW_MS = 5000;

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
	// Was the view left open when Joplin was last closed? null: unknown.
	const shownAtStart = await globalSetting(SHOWN_EDITOR_VIEWS_SETTING);
	const reopenExpected: boolean | null = Array.isArray(shownAtStart)
		? shownAtStart.some(id => String(id).includes(VIEW_ID))
		: null;
	const repository = new RevisionRepository(joplinRevisionFetcher);

	let viewHandle: string | null = null;
	// The note whose history the user asked to see. The view is active only for it.
	let historyNoteId: string | null = null;
	let generation = 0;
	// Joplin remembers that the view was open and re-opens it by itself after
	// a note change or a restart (v0.3.1 test). Those openings must not be
	// mistaken for the user pressing Joplin's "toggle editor" button.
	let lastNoteChangeAt = 0;
	let firstShownSeen = false;
	let closing = false;
	let setupAt = 0;
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

	// Switches back to the normal editor. Returns false if the view is still shown.
	const close = async (why: string): Promise<boolean> => {
		note(`close (${why})`);
		historyNoteId = null;
		generation++; // drop any diff still being computed
		if (!(await isVisible())) return true;
		// Leave something readable behind in case switching back does not happen.
		await render({ kind: 'loading' });
		closing = true;
		try {
			for (let attempt = 1; attempt <= 2; attempt++) {
				await joplin.commands.execute('toggleEditorPlugin');
				await wait(300);
				const stillVisible = await isVisible();
				note(`after toggleEditorPlugin (attempt ${attempt}): visible=${stillVisible}`);
				if (!stillVisible) return true;
			}
			return false;
		} finally {
			closing = false;
		}
	};

	const showHistory = async (noteId: string) => {
		historyNoteId = noteId;
		await refresh(noteId);
	};

	// An opening that looks automatic: switch back, or if that does not work,
	// show the history rather than leaving "loading" on the screen (v0.3.3 test).
	const closeAutoOpened = async (why: string, noteId: string) => {
		if (!(await close(why))) {
			note('could not switch back: showing the history instead');
			await showHistory(noteId);
		}
	};

	// The view became visible: by Joplin's update or by the view's own "shown"
	// message, whichever comes first (Joplin does not always send an update).
	const handleShown = async (noteId: string | null, source: 'update' | 'webview') => {
		const visible = await isVisible();
		note(`${source === 'update' ? 'onUpdate' : 'webview shown'} visible=${visible} note=${!noteId ? 'none' : noteId === historyNoteId ? 'history note' : 'other'}${closing ? ' (closing)' : ''}`);
		if (!visible || !noteId || closing) return;
		if (noteId === historyNoteId) {
			// Already showing this note's history. An update means the note may have changed.
			if (source === 'update') await refresh(noteId);
			return;
		}
		const first = !firstShownSeen;
		firstShownSeen = true;
		const startupReopen = first && (reopenExpected === null
			? Date.now() - setupAt < STARTUP_REOPEN_WINDOW_MS
			: reopenExpected);
		if (startupReopen) {
			await closeAutoOpened('re-opened by Joplin at startup', noteId);
			return;
		}
		if (Date.now() - lastNoteChangeAt < AUTO_REOPEN_WINDOW_MS) {
			await closeAutoOpened('re-opened by Joplin after a note change', noteId);
			return;
		}
		// Shown by Joplin's own "toggle editor" button: show this note's history.
		note('shown by the toggle editor button');
		await showHistory(noteId);
	};

	const selectedNoteId = async (): Promise<string | null> => {
		const ids = await joplin.workspace.selectedNoteIds();
		return ids && ids.length === 1 ? ids[0] : null;
	};

	await joplin.views.editors.register(VIEW_ID, {
		onSetup: async (handle: string) => {
			viewHandle = handle;
			setupAt = Date.now();
			note(`onSetup (left open at the last exit: ${reopenExpected === null ? 'unknown' : reopenExpected})`);
			await joplin.views.editors.addScript(handle, './ui/webview/panel.css');
			await joplin.views.editors.addScript(handle, './ui/webview/panel.js');
			await joplin.views.editors.onMessage(handle, async (message: any) => {
				if (!message) return null;
				if (message.type === 'close') await close('close button');
				if (message.type === 'refresh' && historyNoteId) await refresh(historyNoteId, { reloadHistory: true });
				if (message.type === 'shown') await handleShown(await selectedNoteId(), 'webview');
				return null;
			});
			// Called when the selected note changes or when the view becomes visible.
			await joplin.views.editors.onUpdate(handle, async event => {
				await handleShown(event.noteId || null, 'update');
			});
		},
		onActivationCheck: async event => {
			const active = !!event.noteId;
			note(`onActivationCheck → ${active}`);
			return active;
		},
	});

	// Leaving the note ends the history view, like Joplin's own history viewer.
	await joplin.workspace.onNoteSelectionChange(async (event: any) => {
		lastNoteChangeAt = Date.now();
		const selected = event && event.value && event.value.length ? event.value[0] : null;
		if (selected !== historyNoteId && (historyNoteId || (await isVisible()))) await close('note changed');
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
			if (!(await isVisible())) {
				await joplin.commands.execute('showEditorPlugin');
				await wait(300);
				note(`after showEditorPlugin: visible=${await isVisible()}`);
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
			const shown = await globalSetting(SHOWN_EDITOR_VIEWS_SETTING);
			const lines = [
				'Note History Diff: editor view status',
				`view handle: ${viewHandle ? 'set' : 'none'}`,
				`active: ${active}`,
				`visible: ${await isVisible()}`,
				`history note set: ${historyNoteId ? 'yes' : 'no'}`,
				`${SHOWN_EDITOR_VIEWS_SETTING}: ${JSON.stringify(shown)} (at startup: ${JSON.stringify(shownAtStart)})`,
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
