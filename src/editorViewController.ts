import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { ComparisonSide, CurrentNote, diffVersions, listVersionChoices, planDefaultComparison, sideForKey, sideKey, VersionChoice } from './core/comparison';
import { RebuildError, RevisionRebuilder } from './history/revisionRebuilder';
import { joplinRevisionFetcher } from './history/joplinFetcher';
import { RevisionRepository } from './history/revisionRepository';
import { stringsFor } from './ui/i18n';
import { ComparisonExplanation, PanelState, renderPanel } from './ui/panelView';

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

// Joplin creates one editor view per window that has a note editor: the main
// window's first, with a handle ending in "-default" (Joplin's
// `defaultWindowId`), then one for each note opened in its own window. Only
// the main window's view shows the history (spec section 4); the others
// answer "not active", so Joplin's "toggle editor" button does not show there.
// v0.3.7 kept a single handle, and a second window overwrote it (the main
// window then stayed on "loading").
const MAIN_WINDOW_HANDLE_SUFFIX = `-${VIEW_ID}-default`;

function isMainWindowHandle(handle: string): boolean {
	return handle.endsWith(MAIN_WINDOW_HANDLE_SUFFIX);
}

// The history shown in the view, kept so that picking other versions (F2)
// only recomputes the diff from the rebuilt versions (spec section 5, step 3).
interface Session {
	noteId: string;
	rebuilder: RevisionRebuilder;
	current: CurrentNote;
	choices: VersionChoice[];
	fromKey: string;
	toKey: string;
	explanation: ComparisonExplanation;
}

export async function registerHistoryEditorView(): Promise<void> {
	const strings = stringsFor(await globalSetting('locale'));
	// Was the view left open when Joplin was last closed? null: unknown.
	const shownAtStart = await globalSetting(SHOWN_EDITOR_VIEWS_SETTING);
	const reopenExpected = viewRememberedAsShown(shownAtStart);
	const repository = new RevisionRepository(joplinRevisionFetcher);

	// The main window's view.
	let viewHandle: string | null = null;
	// The note shown in the main window, from the activation checks.
	let windowNoteId: string | null = null;
	// The note whose history the view shows, or null when it shows none.
	let historyNoteId: string | null = null;
	let generation = 0;
	// Joplin remembers that the view was open and re-opens it by itself after
	// a note change or a restart (v0.3.1 test). Those openings must not be
	// mistaken for the user pressing Joplin's "toggle editor" button.
	let lastNoteChangeAt = 0;
	// Whether the view was shown, or remembered as shown, when the note last
	// changed. Only then does Joplin re-open it by itself (v0.3.5 / v0.3.6 tests).
	let shownAtNoteChange = false;
	let firstShownSeen = false;
	let closing = false;
	let setupAt = 0;
	let otherViews = 0;
	// Diagnostics for the verification of the editor view behaviour.
	const log: string[] = [];
	const note = (line: string) => {
		log.push(`${new Date().toLocaleTimeString()} ${line}`);
		if (log.length > 30) log.shift();
		console.info(`Note History Diff: ${line}`);
	};

	const render = async (state: PanelState) => {
		if (viewHandle) await joplin.views.editors.setHtml(viewHandle, renderPanel(state, strings));
	};

	let session: Session | null = null;

	const resultState = (current: Session, from: ComparisonSide, to: ComparisonSide): PanelState => ({
		kind: 'result',
		choices: current.choices,
		fromKey: current.fromKey,
		toKey: current.toKey,
		diff: diffVersions(from.version, to.version),
		explanation: current.explanation,
	});

	// Compares the versions the session has selected.
	const sessionState = (current: Session): PanelState => {
		try {
			const from = sideForKey(current.rebuilder, current.current, current.fromKey);
			const to = sideForKey(current.rebuilder, current.current, current.toKey);
			if (!from || !to) return { kind: 'error', message: 'The selected version no longer exists.' };
			return resultState(current, from, to);
		} catch (error) {
			if (error instanceof RebuildError) return { kind: 'rebuild-failed', reason: error.reason };
			throw error;
		}
	};

	// Loads the note and its history. `keep` carries the versions the user
	// picked over a reload ("Refresh"), when they still exist.
	const computeState = async (noteId: string, keep: { fromKey: string; toKey: string } | null): Promise<PanelState> => {
		session = null;
		const row = await joplin.data.get(['notes', noteId], { fields: ['id', 'title', 'body', 'updated_time'] });
		const current: CurrentNote = { title: row.title, body: row.body, updatedTime: row.updated_time };
		const rebuilder = await repository.rebuilderFor(noteId);
		const plan = planDefaultComparison(rebuilder, current);
		switch (plan.kind) {
		case 'no-history':
			return await historySettings();
		case 'nothing-to-compare':
			return { kind: 'nothing-to-compare' };
		case 'rebuild-failed':
			return { kind: 'rebuild-failed', reason: plan.error.reason };
		case 'compare': {
			const choices = listVersionChoices(rebuilder, current);
			const usable = (key: string) => choices.some(choice => choice.key === key && choice.bodyLength !== null);
			const kept = keep && usable(keep.fromKey) && usable(keep.toKey);
			const next: Session = {
				noteId,
				rebuilder,
				current,
				choices,
				fromKey: kept ? keep.fromKey : sideKey(plan.from),
				toKey: kept ? keep.toKey : sideKey(plan.to),
				explanation: kept ? null : plan.to.kind === 'revision' ? 'previous-vs-latest' : 'latest-vs-current',
			};
			session = next;
			return kept ? sessionState(next) : resultState(next, plan.from, plan.to);
		}
		}
	};

	const refresh = async (noteId: string, options: { reloadHistory?: boolean } = {}) => {
		const mine = ++generation;
		// Keep the picked versions when reloading the same note.
		const keep = session && session.noteId === noteId && session.explanation === null
			? { fromKey: session.fromKey, toKey: session.toKey } : null;
		if (options.reloadHistory) repository.invalidate();
		await render({ kind: 'loading' });
		let state: PanelState;
		try {
			state = await computeState(noteId, keep);
		} catch (error) {
			console.error('Note History Diff: could not compute the diff', error);
			state = { kind: 'error', message: errorMessage(error) };
		}
		if (mine === generation) await render(state);
	};

	// F2: the user picked other versions.
	const select = async (fromKey: string, toKey: string) => {
		if (!session || session.noteId !== historyNoteId) return;
		session.fromKey = fromKey;
		session.toKey = toKey;
		session.explanation = null;
		const mine = ++generation;
		let state: PanelState;
		try {
			state = sessionState(session);
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
	// `toggleEditorPlugin` acts on the focused window; every caller follows an
	// action in the main window (Close, a note change, Joplin re-opening the view).
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
		const sinceNoteChange = Date.now() - lastNoteChangeAt;
		const noteChangeReopen = shownAtNoteChange && sinceNoteChange < AUTO_REOPEN_WINDOW_MS;
		shownAtNoteChange = false;
		if (noteChangeReopen) {
			await closeAutoOpened('re-opened by Joplin after a note change', noteId);
			return;
		}
		// Shown by Joplin's own "toggle editor" button: show this note's history.
		note(`shown by the toggle editor button (${sinceNoteChange} ms after a note change)`);
		await showHistory(noteId);
	};

	// The main window's note changed. Leaving the note ends the history view,
	// like Joplin's own history viewer.
	const handleNoteChange = async (noteId: string | null) => {
		lastNoteChangeAt = Date.now();
		const visible = await isVisible();
		// Joplin destroys the webview when it is hidden, so the view cannot report
		// that (v0.3.6 test) and historyNoteId may be stale. The setting Joplin
		// uses to re-open the view empties on hiding (v0.3.7 test).
		const remembered = viewRememberedAsShown(await globalSetting(SHOWN_EDITOR_VIEWS_SETTING));
		shownAtNoteChange = visible || (remembered === null ? historyNoteId !== null : remembered);
		note(`note changed (view visible=${visible}, remembered as shown=${remembered === null ? 'unknown' : remembered}, history note set=${historyNoteId !== null})`);
		if (noteId !== historyNoteId && (historyNoteId || visible)) await close('note changed');
	};

	await joplin.views.editors.register(VIEW_ID, {
		onSetup: async (handle: string) => {
			if (!isMainWindowHandle(handle)) {
				otherViews++;
				note('onSetup for another window: not used');
				return;
			}
			viewHandle = handle;
			setupAt = Date.now();
			note(`onSetup (left open at the last exit: ${reopenExpected === null ? 'unknown' : reopenExpected})`);
			await joplin.views.editors.addScript(handle, './ui/webview/panel.css');
			await joplin.views.editors.addScript(handle, './ui/webview/panel.js');
			await joplin.views.editors.onMessage(handle, async (message: any) => {
				if (!message) return null;
				if (message.type === 'close') await close('close button');
				if (message.type === 'refresh' && historyNoteId) await refresh(historyNoteId, { reloadHistory: true });
				if (message.type === 'shown') await handleShown(windowNoteId, 'webview');
				if (message.type === 'select' && typeof message.from === 'string' && typeof message.to === 'string') await select(message.from, message.to);
				return null;
			});
			// Called when the note changes or when the view becomes visible.
			await joplin.views.editors.onUpdate(handle, async event => {
				if (event.noteId) windowNoteId = event.noteId;
				await handleShown(event.noteId || null, 'update');
			});
		},
		// Called for each window's view when that window's note changes (and at
		// startup), whether the view is shown or not.
		onActivationCheck: async event => {
			if (!isMainWindowHandle(event.handle)) return false;
			const previous = windowNoteId;
			const noteId = event.noteId || null;
			windowNoteId = noteId;
			note(`onActivationCheck (${previous === null ? 'first' : previous === noteId ? 'same note' : 'note changed'})`);
			// Do not hold up the activation check: closing waits for Joplin.
			if (previous !== null && previous !== noteId) void handleNoteChange(noteId);
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
			note('show requested');
			// A note open in its own window: the main window shows another note.
			if (windowNoteId && selected.id !== windowNoteId) {
				note('requested from another window');
				await joplin.views.dialogs.showMessageBox(strings.mainWindowOnly);
				return;
			}
			historyNoteId = selected.id;
			if (!(await isVisible())) {
				await joplin.commands.execute('showEditorPlugin');
				await wait(300);
				const visible = await isVisible();
				note(`after showEditorPlugin: visible=${visible}`);
				if (!visible) {
					// The same note open in its own window, which was focused.
					historyNoteId = null;
					await joplin.views.dialogs.showMessageBox(strings.mainWindowOnly);
					return;
				}
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
			const lines = [
				'Note History Diff: editor view status',
				`main window view: ${viewHandle ? 'set' : 'none'} (views of other windows: ${otherViews})`,
				`active: ${active}`,
				`visible: ${await isVisible()}`,
				`history note set: ${historyNoteId ? 'yes' : 'no'}`,
				`${SHOWN_EDITOR_VIEWS_SETTING}: ${JSON.stringify(await globalSetting(SHOWN_EDITOR_VIEWS_SETTING))} (at startup: ${JSON.stringify(shownAtStart)})`,
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
