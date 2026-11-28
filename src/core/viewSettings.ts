// F14: the plugin's settings (Options > Note History Diff) and the Joplin
// settings the view follows, turned into what the view needs. Pure functions,
// so that they can be tested without Joplin.

export type InitialMode = 'last' | 'side' | 'unified';

// Values of the context-lines setting: 0-20 lines, or this for "do not fold".
export const NO_FOLDING = -1;
export const CONTEXT_LINE_CHOICES = Array.from({ length: 21 }, (_, i) => i);
export const DEFAULT_CONTEXT_LINES = 3;

export const DIFF_FONT_SIZE_MIN = 4;
export const DIFF_FONT_SIZE_MAX = 50;

// Joplin's own default for the editor font size (Options > Editor).
const JOPLIN_EDITOR_FONT_SIZE_DEFAULT = 15;

function isNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function clampFontSize(value: number): number {
	return Math.min(DIFF_FONT_SIZE_MAX, Math.max(DIFF_FONT_SIZE_MIN, Math.round(value)));
}

// Font size of the diff in pixels. 0 (the default) follows Joplin's editor
// font size; any other value is the size the user chose.
export function diffFontSize(setting: unknown, editorFontSize: unknown): number {
	if (isNumber(setting) && setting > 0) return clampFontSize(setting);
	return isNumber(editorFontSize) && editorFontSize > 0 ? clampFontSize(editorFontSize) : JOPLIN_EDITOR_FONT_SIZE_DEFAULT;
}

// Joplin's "Editor monospace font family" as a CSS font-family list, or null
// when it is empty (the system's monospace font is used then). Characters
// that could end the CSS declaration or the HTML attribute are dropped.
export function diffFontFamily(setting: unknown): string | null {
	if (typeof setting !== 'string') return null;
	const cleaned = setting.replace(/[;{}<>"\\]/g, '').trim().slice(0, 200);
	if (!cleaned) return null;
	return `${cleaned}, monospace`;
}

// Unchanged lines kept around each change, or null for "do not fold".
export function contextLines(setting: unknown): number | null {
	if (setting === NO_FOLDING) return null;
	if (isNumber(setting) && setting >= 0 && setting <= 20) return Math.round(setting);
	return DEFAULT_CONTEXT_LINES;
}

export function initialMode(setting: unknown): InitialMode {
	return setting === 'side' || setting === 'unified' ? setting : 'last';
}

// The layout to open the history diff with.
export function modeToOpenWith(initial: InitialMode, lastUsed: 'side' | 'unified'): 'side' | 'unified' {
	return initial === 'last' ? lastUsed : initial;
}
