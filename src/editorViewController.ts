import joplin from 'api';
import { MenuItemLocation, SettingItemType, ToolbarButtonLocation } from 'api/types';
import { ComparisonSide, CurrentNote, diffVersions, listVersionChoices, neighbourPair, planDefaultComparison, sideForKey, sideKey, VersionChoice } from './core/comparison';
import { RebuildError, RevisionRebuilder } from './history/revisionRebuilder';
import { joplinRevisionFetcher } from './history/joplinFetcher';
import { RevisionRepository } from './history/revisionRepository';
import { stringsFor } from './ui/i18n';
import { DateTimeFormat } from './ui/dateFormat';
import { ComparisonExplanation, DisplayMode, PanelState, renderPanel } from './ui/panelView';
import { CONTEXT_LINE_CHOICES, contextLines, DEFAULT_CONTEXT_LINES, DIFF_FONT_SIZE_MAX, DIFF_FONT_SIZE_MIN, diffFontFamily, diffFontSize, initialMode, InitialMode, modeToOpenWith, NO_FOLDING } from './core/viewSettings';

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
// F3: the display mode the user picked last. Internal: not shown in Options.
const DISPLAY_MODE_SETTING = 'displayMode';
// F9: whether trailing whitespace and line endings are ignored. Internal too.
const IGNORE_WHITESPACE_SETTING = 'ignoreWhitespace';
// F14: the settings screen.
const SETTINGS_SECTION = 'noteHistoryDiff';
const DIFF_FONT_SIZE_SETTING = 'diffFontSize';
const CONTEXT_LINES_SETTING = 'contextLines';
const CHAR_HIGHLIGHT_SETTING = 'charHighlight';
const INITIAL_MODE_SETTING = 'initialMode';
const WRAP_LINES_SETTING = 'wrapLines';
const VIEW_SETTINGS = [DIFF_FONT_SIZE_SETTING, CONTEXT_LINES_SETTING, CHAR_HIGHLIGHT_SETTING, INITIAL_MODE_SETTING, WRAP_LINES_SETTING, IGNORE_WHITESPACE_SETTING];
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
	// F14: the settings screen (Options > Note History Diff). The display mode
	// stays internal: it is the layout chosen last with the view's buttons.
	await joplin.settings.registerSection(SETTINGS_SECTION, { label: strings.panelTitle, iconName: 'fas fa-history' });
	const contextOptions: Record<number, string> = {};
	for (const lines of CONTEXT_LINE_CHOICES) contextOptions[lines] = String(lines);
	contextOptions[NO_FOLDING] = strings.doNotFold;
	await joplin.settings.registerSettings({
		[DISPLAY_MODE_SETTING]: {
			value: 'side',
			type: SettingItemType.String,
			public: false,
			label: 'Display mode (side or unified)',
		},
		[DIFF_FONT_SIZE_SETTING]: {
			value: 0,
			type: SettingItemType.Int,
			public: true,
			section: SETTINGS_SECTION,
			label: strings.settingDiffFontSize,
			description: strings.settingDiffFontSizeDescription(DIFF_FONT_SIZE_MIN, DIFF_FONT_SIZE_MAX),
			minimum: 0,
			maximum: DIFF_FONT_SIZE_MAX,
			step: 1,
		},
		[CONTEXT_LINES_SETTING]: {
			value: DEFAULT_CONTEXT_LINES,
			type: SettingItemType.Int,
			public: true,
			section: SETTINGS_SECTION,
			isEnum: true,
			options: contextOptions,
			label: strings.settingContextLines,
		},
		[CHAR_HIGHLIGHT_SETTING]: {
			value: true,
			type: SettingItemType.Bool,
			public: true,
			section: SETTINGS_SECTION,
			label: strings.settingCharHighlight,
		},
		[INITIAL_MODE_SETTING]: {
			value: 'last',
			type: SettingItemType.String,
			public: true,
			section: SETTINGS_SECTION,
			isEnum: true,
			options: { last: strings.lastUsedMode, side: strings.modeSideBySide, unified: strings.modeUnified },
			label: strings.settingInitialMode,
		},
		[WRAP_LINES_SETTING]: {
			value: true,
			type: SettingItemType.Bool,
			public: true,
			section: SETTINGS_SECTION,
			label: strings.settingWrapLines,
		},
		[IGNORE_WHITESPACE_SETTING]: {
			value: true,
			type: SettingItemType.Bool,
			public: true,
			section: SETTINGS_SECTION,
			label: strings.ignoreWhitespace,
		},
	});
	let ignoreWhitespace = true;
	try {
		ignoreWhitespace = (await joplin.settings.value(IGNORE_WHITESPACE_SETTING)) !== false;
	} catch (error) {
		console.warn('Note History Diff: could not read the whitespace setting', error);
	}
	// The layout chosen last with the view's buttons (remembered), and the
	// layout shown now (F14: the history diff may open with a fixed layout).
	let lastUsedMode: DisplayMode = 'side';
	try {
		lastUsedMode = (await joplin.settings.value(DISPLAY_MODE_SETTING)) === 'unified' ? 'unified' : 'side';
	} catch (error) {
		console.warn('Note History Diff: could not read the display mode', error);
	}
	let displayMode: DisplayMode = lastUsedMode;

	// F14: the plugin's settings, read at startup and whenever they change.
	const pluginSetting = async (key: string): Promise<any> => {
		try {
			return await joplin.settings.value(key);
		} catch (error) {
			return null;
		}
	};
	let diffFontSizeSetting: unknown = 0;
	let contextSetting: number | null = DEFAULT_CONTEXT_LINES;
	let charHighlight = true;
	let openWith: InitialMode = 'last';
	let wrapLines = true;
	const readPluginSettings = async () => {
		diffFontSizeSetting = await pluginSetting(DIFF_FONT_SIZE_SETTING);
		contextSetting = contextLines(await pluginSetting(CONTEXT_LINES_SETTING));
		charHighlight = (await pluginSetting(CHAR_HIGHLIGHT_SETTING)) !== false;
		openWith = initialMode(await pluginSetting(INITIAL_MODE_SETTING));
		wrapLines = (await pluginSetting(WRAP_LINES_SETTING)) !== false;
		ignoreWhitespace = (await pluginSetting(IGNORE_WHITESPACE_SETTING)) !== false;
	};
	await readPluginSettings();
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
	// How the view is opened and closed, for the developer console. Joplin's
	// editor view behaviour took many rounds to get right (docs/prototype.md).
	const note = (line: string) => {
		console.debug(`Note History Diff: ${line}`);
	};

	// Joplin's date and time formats (Options > General), read again on every
	// load so that a change applies the next time the history is shown.
	// Likewise the editor's font size and monospace font family (Options >
	// Editor), used for the diff (F14).
	let dateTimeFormat: DateTimeFormat = { date: null, time: null };
	let editorFontSize: unknown = null;
	let editorMonospaceFont: unknown = null;
	const readDateTimeFormat = async () => {
		const date = await globalSetting('dateFormat');
		const time = await globalSetting('timeFormat');
		dateTimeFormat = { date: typeof date === 'string' ? date : null, time: typeof time === 'string' ? time : null };
		editorFontSize = await globalSetting('style.editor.fontSize');
		editorMonospaceFont = await globalSetting('style.editor.monospaceFontFamily');
	};

	// The state on screen, drawn again when a setting changes.
	let shownState: PanelState | null = null;
	const render = async (state: PanelState) => {
		shownState = state;
		if (!viewHandle) return;
		await joplin.views.editors.setHtml(viewHandle, renderPanel(state, strings, {
			format: dateTimeFormat,
			mode: displayMode,
			ignoreWhitespace,
			diffFontFamily: diffFontFamily(editorMonospaceFont),
			diffFontSize: diffFontSize(diffFontSizeSetting, editorFontSize),
			context: contextSetting,
			inline: charHighlight,
			wrap: wrapLines,
		}));
	};

	let session: Session | null = null;

	const resultState = (current: Session, from: ComparisonSide, to: ComparisonSide): PanelState => ({
		kind: 'result',
		choices: current.choices,
		fromKey: current.fromKey,
		toKey: current.toKey,
		diff: diffVersions(from.version, to.version, { ignoreWhitespace }),
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
			await readDateTimeFormat();
			state = await computeState(noteId, keep);
		} catch (error) {
			console.error('Note History Diff: could not compute the diff', error);
			state = { kind: 'error', message: errorMessage(error) };
		}
		if (mine === generation) await render(state);
	};

	// Recomputes the diff of the versions the session has selected.
	const recompute = async () => {
		if (!session || session.noteId !== historyNoteId) return;
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

	// F2: the user picked other versions.
	const select = async (fromKey: string, toKey: string) => {
		if (!session || session.noteId !== historyNoteId) return;
		session.fromKey = fromKey;
		session.toKey = toKey;
		session.explanation = null;
		await recompute();
	};

	// F6: step to the neighbouring pair of versions.
	const stepPair = async (direction: 'older' | 'newer') => {
		if (!session) return;
		const pair = neighbourPair(session.choices, session.fromKey, session.toKey, direction);
		if (pair) await select(pair.fromKey, pair.toKey);
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

	// Opening the history diff of a note: F14 may fix the layout it opens with.
	const startHistory = (noteId: string) => {
		historyNoteId = noteId;
		displayMode = modeToOpenWith(openWith, lastUsedMode);
	};

	const showHistory = async (noteId: string) => {
		startHistory(noteId);
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
				if (message.type === 'pair-older') await stepPair('older');
				if (message.type === 'pair-newer') await stepPair('newer');
				// Issue #3: "Copy" in the view's right-click menu, when the webview
				// could not copy by itself.
				if (message.type === 'copyText' && typeof message.text === 'string') await joplin.clipboard.writeText(message.text);
				if (message.type === 'whitespace' && typeof message.ignore === 'boolean') {
					ignoreWhitespace = message.ignore;
					await joplin.settings.setValue(IGNORE_WHITESPACE_SETTING, ignoreWhitespace);
					await recompute();
				}
				if (message.type === 'mode' && (message.mode === 'side' || message.mode === 'unified')) {
					// The view already switched; remember the choice for next time.
					displayMode = message.mode;
					lastUsedMode = displayMode;
					await joplin.settings.setValue(DISPLAY_MODE_SETTING, displayMode);
				}
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
			startHistory(selected.id);
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

	await joplin.views.menuItems.create('noteHistoryDiff.showDiffMenu', SHOW_DIFF_COMMAND, MenuItemLocation.Tools);
	await joplin.views.toolbarButtons.create('noteHistoryDiff.showDiffButton', SHOW_DIFF_COMMAND, ToolbarButtonLocation.NoteToolbar);

	// F14: a changed setting applies to the history diff on screen at once.
	await joplin.settings.onChange(async event => {
		if (!event.keys.some(key => VIEW_SETTINGS.includes(key))) return;
		await readPluginSettings();
		if (session && session.noteId === historyNoteId) await recompute();
		else if (shownState) await render(shownState);
	});
}
