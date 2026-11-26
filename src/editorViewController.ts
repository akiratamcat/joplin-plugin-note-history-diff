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

// Whether Joplin's list of shown editor views includes this view. null: unknown.
function viewRememberedAsShown(shownIds: any): boolean | null {
	return Array.isArray(shownIds) ? shownIds.some(id => String(id).includes(VIEW_ID)) : null;
}

function errorMessage(error: any): string {
	return String(error && error.message ? error.message : error);
}

function wait(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// One editor view. Joplin creates one per window that has a note editor (the
// main window and each note opened in its own window), and each one has its
// own note, visibility and history state (v0.3.7 test: a single shared state
// made the main window stay on "loading" once a second window was opened).
interface HistoryView {
	handle: string;
	label: string;
	// The note shown in this view's window, from the activation checks.
	noteId: string | null;
	// The note whose history this view shows, or null when it shows none.
	historyNoteId: string | null;
	generation: number;
	closing: boolean;
	setupAt: number;
	firstShownSeen: boolean;
	// Was the view remembered as open when it was set up? null: unknown.
	reopenExpected: boolean | null;
	// Joplin remembers that the view was open and re-opens it by itself after
	// a note change or a restart (v0.3.1 test). Those openings must not be
	// mistaken for the user pressing Joplin's "toggle editor" button.
	lastNoteChangeAt: number;
	// Whether the view was shown, or remembered as shown, when the note last
	// changed. Only then does Joplin re-open it by itself (v0.3.5 / v0.3.6 tests).
	shownAtNoteChange: boolean;
}

// A request from the history command, waiting for the view of the focused
// window to become visible (which view that is cannot be asked directly).
interface PendingShow {
	noteId: string;
	at: number;
}
const PENDING_SHOW_MS = 3000;

export async function registerHistoryEditorView(): Promise<void> {
	const strings = stringsFor(await globalSetting('locale'));
	// Was the view left open when Joplin was last closed? null: unknown.
	const shownAtStart = await globalSetting(SHOWN_EDITOR_VIEWS_SETTING);
	const repository = new RevisionRepository(joplinRevisionFetcher);
	const views = new Map<string, HistoryView>();
	let pendingShow: PendingShow | null = null;

	// Diagnostics for the verification of the editor view behaviour.
	const log: string[] = [];
	const note = (view: HistoryView | null, line: string) => {
		const text = view ? `[${view.label}] ${line}` : line;
		log.push(`${new Date().toLocaleTimeString()} ${text}`);
		if (log.length > 40) log.shift();
		console.info(`Note History Diff: ${text}`);
	};

	const render = async (view: HistoryView, state: PanelState) => {
		await joplin.views.editors.setHtml(view.handle, renderPanel(state, strings));
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

	const refresh = async (view: HistoryView, noteId: string) => {
		const mine = ++view.generation;
		await render(view, { kind: 'loading' });
		let state: PanelState;
		try {
			state = await computeState(noteId);
		} catch (error) {
			console.error('Note History Diff: could not compute the diff', error);
			state = { kind: 'error', message: errorMessage(error) };
		}
		if (mine === view.generation) await render(view, state);
	};

	const isVisible = async (view: HistoryView) => {
		try {
			return await joplin.views.editors.isVisible(view.handle);
		} catch (error) {
			return false;
		}
	};

	const showHistory = async (view: HistoryView, noteId: string, options: { reloadHistory?: boolean } = {}) => {
		view.historyNoteId = noteId;
		if (options.reloadHistory) repository.invalidate();
		await refresh(view, noteId);
	};

	// Switches back to the normal editor. Returns false if the view is still shown.
	// `toggleEditorPlugin` acts on the focused window, which is the window where
	// the user acted (closed, changed the note) in every case that calls this.
	const close = async (view: HistoryView, why: string): Promise<boolean> => {
		note(view, `close (${why})`);
		view.historyNoteId = null;
		view.generation++; // drop any diff still being computed
		if (!(await isVisible(view))) return true;
		// Leave something readable behind in case switching back does not happen.
		await render(view, { kind: 'loading' });
		view.closing = true;
		try {
			for (let attempt = 1; attempt <= 2; attempt++) {
				await joplin.commands.execute('toggleEditorPlugin');
				await wait(300);
				const stillVisible = await isVisible(view);
				note(view, `after toggleEditorPlugin (attempt ${attempt}): visible=${stillVisible}`);
				if (!stillVisible) return true;
			}
			return false;
		} finally {
			view.closing = false;
		}
	};

	// An opening that looks automatic: switch back, or if that does not work,
	// show the history rather than leaving "loading" on the screen (v0.3.3 test).
	const closeAutoOpened = async (view: HistoryView, why: string, noteId: string) => {
		if (!(await close(view, why))) {
			note(view, 'could not switch back: showing the history instead');
			await showHistory(view, noteId);
		}
	};

	const takePendingShow = (noteId: string): boolean => {
		if (!pendingShow || pendingShow.noteId !== noteId || Date.now() - pendingShow.at > PENDING_SHOW_MS) return false;
		pendingShow = null;
		return true;
	};

	// The view became visible: by Joplin's update or by the view's own "shown"
	// message, whichever comes first (Joplin does not always send an update).
	const handleShown = async (view: HistoryView, noteId: string | null, source: 'update' | 'webview') => {
		const visible = await isVisible(view);
		note(view, `${source === 'update' ? 'onUpdate' : 'webview shown'} visible=${visible} note=${!noteId ? 'none' : noteId === view.historyNoteId ? 'history note' : 'other'}${view.closing ? ' (closing)' : ''}`);
		if (!visible || !noteId || view.closing) return;
		if (noteId === view.historyNoteId) {
			// Already showing this note's history. An update means the note may have changed.
			if (source === 'update') await refresh(view, noteId);
			return;
		}
		const first = !view.firstShownSeen;
		view.firstShownSeen = true;
		if (takePendingShow(noteId)) {
			note(view, 'shown by the history command');
			await showHistory(view, noteId, { reloadHistory: true });
			return;
		}
		const startupReopen = first && (view.reopenExpected === null
			? Date.now() - view.setupAt < STARTUP_REOPEN_WINDOW_MS
			: view.reopenExpected);
		if (startupReopen) {
			await closeAutoOpened(view, 're-opened by Joplin at startup', noteId);
			return;
		}
		const sinceNoteChange = Date.now() - view.lastNoteChangeAt;
		const noteChangeReopen = view.shownAtNoteChange && sinceNoteChange < AUTO_REOPEN_WINDOW_MS;
		view.shownAtNoteChange = false;
		if (noteChangeReopen) {
			await closeAutoOpened(view, 're-opened by Joplin after a note change', noteId);
			return;
		}
		// Shown by Joplin's own "toggle editor" button: show this note's history.
		note(view, `shown by the toggle editor button (${sinceNoteChange} ms after a note change)`);
		await showHistory(view, noteId);
	};

	// The note of this view's window changed. Leaving the note ends the history
	// view, like Joplin's own history viewer.
	const handleNoteChange = async (view: HistoryView, noteId: string | null) => {
		view.lastNoteChangeAt = Date.now();
		const visible = await isVisible(view);
		// Joplin destroys the webview when it is hidden, so the view cannot report
		// that (v0.3.6 test) and historyNoteId may be stale. The setting Joplin
		// uses to re-open the view empties on hiding (v0.3.7 test).
		const remembered = viewRememberedAsShown(await globalSetting(SHOWN_EDITOR_VIEWS_SETTING));
		view.shownAtNoteChange = visible || (remembered === null ? view.historyNoteId !== null : remembered);
		note(view, `note changed (view visible=${visible}, remembered as shown=${remembered === null ? 'unknown' : remembered}, history note set=${view.historyNoteId !== null})`);
		if (noteId !== view.historyNoteId && (view.historyNoteId || visible)) await close(view, 'note changed');
	};

	const viewFor = (handle: string): HistoryView => {
		let view = views.get(handle);
		if (!view) {
			view = {
				handle,
				label: `view ${views.size + 1}`,
				noteId: null,
				historyNoteId: null,
				generation: 0,
				closing: false,
				setupAt: Date.now(),
				firstShownSeen: false,
				reopenExpected: null,
				lastNoteChangeAt: 0,
				shownAtNoteChange: false,
			};
			views.set(handle, view);
		}
		return view;
	};

	await joplin.views.editors.register(VIEW_ID, {
		onSetup: async (handle: string) => {
			const first = views.size === 0 || (views.size === 1 && views.has(handle));
			const view = viewFor(handle);
			view.setupAt = Date.now();
			// The main window's view is set up at startup: use the setting as it was
			// before Joplin showed anything. A later window reads it now.
			view.reopenExpected = viewRememberedAsShown(first ? shownAtStart : await globalSetting(SHOWN_EDITOR_VIEWS_SETTING));
			note(view, `onSetup (remembered as shown: ${view.reopenExpected === null ? 'unknown' : view.reopenExpected})`);
			await joplin.views.editors.addScript(handle, './ui/webview/panel.css');
			await joplin.views.editors.addScript(handle, './ui/webview/panel.js');
			await joplin.views.editors.onMessage(handle, async (message: any) => {
				if (!message) return null;
				if (message.type === 'close') await close(view, 'close button');
				if (message.type === 'refresh' && view.historyNoteId) await showHistory(view, view.historyNoteId, { reloadHistory: true });
				if (message.type === 'shown') await handleShown(view, view.noteId, 'webview');
				return null;
			});
			// Called when the note changes or when the view becomes visible.
			await joplin.views.editors.onUpdate(handle, async event => {
				if (event.noteId) view.noteId = event.noteId;
				await handleShown(view, event.noteId || null, 'update');
			});
		},
		// Called for each view when its window's note changes (and at startup),
		// whether the view is shown or not.
		onActivationCheck: async event => {
			const view = viewFor(event.handle);
			const previous = view.noteId;
			const noteId = event.noteId || null;
			view.noteId = noteId;
			note(view, `onActivationCheck (${previous === null ? 'first' : previous === noteId ? 'same note' : 'note changed'})`);
			// Do not hold up the activation check: closing waits for Joplin.
			if (previous !== null && previous !== noteId) void handleNoteChange(view, noteId);
			return !!noteId;
		},
	});

	await joplin.commands.register({
		name: SHOW_DIFF_COMMAND,
		label: strings.commandLabel,
		iconName: 'fas fa-history',
		execute: async () => {
			// The note of the focused window.
			const selected = await joplin.workspace.selectedNote();
			if (!selected) return;
			note(null, 'show requested');
			// Views showing this note: the focused window's view is one of them.
			const candidates = Array.from(views.values()).filter(view => view.noteId === selected.id);
			const visibleBefore: HistoryView[] = [];
			for (const view of candidates) {
				if (await isVisible(view)) visibleBefore.push(view);
			}
			if (!candidates.length || visibleBefore.length < candidates.length) {
				// Shows the view of the focused window; handleShown picks it up.
				pendingShow = { noteId: selected.id, at: Date.now() };
				await joplin.commands.execute('showEditorPlugin');
				await wait(300);
			}
			let reloaded = false;
			for (const view of candidates) {
				if (!(await isVisible(view))) continue;
				// Already picked up by handleShown, which reloaded the history.
				if (view.historyNoteId === selected.id && !visibleBefore.includes(view)) continue;
				note(view, 'showing the history for the command');
				await showHistory(view, selected.id, { reloadHistory: !reloaded });
				reloaded = true;
			}
		},
	});

	await joplin.commands.register({
		name: EDITOR_STATUS_COMMAND,
		label: '[dev] Note History Diff: editor view status',
		execute: async () => {
			const lines = [
				'Note History Diff: editor view status',
				`${SHOWN_EDITOR_VIEWS_SETTING}: ${JSON.stringify(await globalSetting(SHOWN_EDITOR_VIEWS_SETTING))} (at startup: ${JSON.stringify(shownAtStart)})`,
				`views: ${views.size}`,
			];
			for (const view of views.values()) {
				let active: any = 'unknown';
				try {
					active = await joplin.views.editors.isActive(view.handle);
				} catch (error) {
					active = `error: ${errorMessage(error)}`;
				}
				lines.push(`- ${view.label}: active=${active}, visible=${await isVisible(view)}, note set=${view.noteId ? 'yes' : 'no'}, history note set=${view.historyNoteId ? 'yes' : 'no'}`);
			}
			lines.push('', 'Recent events:', ...log);
			await joplin.clipboard.writeText(lines.join('\n'));
			await joplin.views.dialogs.showMessageBox(`${lines.join('\n')}\n\n(Copied to the clipboard.)`);
		},
	});

	await joplin.views.menuItems.create('noteHistoryDiff.showDiffMenu', SHOW_DIFF_COMMAND, MenuItemLocation.Tools);
	await joplin.views.menuItems.create('noteHistoryDiff.editorStatusMenu', EDITOR_STATUS_COMMAND, MenuItemLocation.Tools);
	await joplin.views.toolbarButtons.create('noteHistoryDiff.showDiffButton', SHOW_DIFF_COMMAND, ToolbarButtonLocation.NoteToolbar);
}
