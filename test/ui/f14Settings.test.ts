import { CURRENT_KEY, diffVersions, VersionChoice } from '../../src/core/comparison';
import { contextLines, diffFontFamily, diffFontSize, initialMode, modeToOpenWith, NO_FOLDING } from '../../src/core/viewSettings';
import { lineDiff } from '../../src/diff/lineDiff';
import { renderDiffViews } from '../../src/ui/diffView';
import { stringsFor } from '../../src/ui/i18n';
import { renderPanel } from '../../src/ui/panelView';

const labels = { foldedLines: (n: number) => `… ${n} …` };
const en = stringsFor('en');
const ja = stringsFor('ja');

describe('F14 settings', () => {
	test('diff font size: 0 follows the editor font size, other values are used as they are', () => {
		expect(diffFontSize(0, 18)).toBe(18);
		expect(diffFontSize(0, null)).toBe(15);
		expect(diffFontSize(20, 18)).toBe(20);
		expect(diffFontSize(2, 18)).toBe(4);
		expect(diffFontSize(80, 18)).toBe(50);
		expect(diffFontSize('x', 'y')).toBe(15);
	});

	test('diff font family: the editor monospace font, cleaned, or null when empty', () => {
		expect(diffFontFamily('Consolas')).toBe('Consolas, monospace');
		expect(diffFontFamily("'Fira Code', Consolas")).toBe("'Fira Code', Consolas, monospace");
		expect(diffFontFamily('')).toBeNull();
		expect(diffFontFamily('   ')).toBeNull();
		expect(diffFontFamily(null)).toBeNull();
		// Characters that could end the CSS declaration or the HTML attribute are dropped.
		expect(diffFontFamily('Consolas; color: red}"><b>')).toBe('Consolas color: redb, monospace');
	});

	test('context lines: 0-20, "do not fold", or the default', () => {
		expect(contextLines(0)).toBe(0);
		expect(contextLines(20)).toBe(20);
		expect(contextLines(NO_FOLDING)).toBeNull();
		expect(contextLines(99)).toBe(3);
		expect(contextLines(undefined)).toBe(3);
	});

	test('initial layout: last used, or always one of the two', () => {
		expect(initialMode('side')).toBe('side');
		expect(initialMode('weird')).toBe('last');
		expect(modeToOpenWith('last', 'unified')).toBe('unified');
		expect(modeToOpenWith('side', 'unified')).toBe('side');
	});
});

describe('diff options (F14)', () => {
	const before = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
	const after = before.replace('line 15', 'line fifteen');

	test('context lines change the folding; null shows every line', () => {
		const lines = lineDiff(before, after).lines;
		expect(renderDiffViews(lines, labels)).toContain('… 12 …');
		expect(renderDiffViews(lines, labels, { context: 0 })).toContain('… 15 …');
		const unfolded = renderDiffViews(lines, labels, { context: null });
		expect(unfolded).not.toContain('class="fold"');
		expect(unfolded).toContain('line 0');
	});

	test('the character highlight can be turned off', () => {
		const lines = lineDiff(before, after).lines;
		expect(renderDiffViews(lines, labels)).toContain('class="chg"');
		expect(renderDiffViews(lines, labels, { inline: false })).not.toContain('class="chg"');
	});
});

describe('panel rendering (F14, Issue #3)', () => {
	const choices: VersionChoice[] = [
		{ key: CURRENT_KEY, kind: 'current', time: 2, bodyLength: 2 },
		{ key: 'r1', kind: 'revision', time: 1, bodyLength: 1 },
	];
	const state = { kind: 'result' as const, choices, fromKey: 'r1', toKey: CURRENT_KEY, diff: diffVersions({ title: 'T', body: 'x' }, { title: 'T', body: 'y' }), explanation: null };

	test('the diff font and size are set on the root element, escaped', () => {
		const html = renderPanel(state, en, { diffFontFamily: "'Fira Code', monospace", diffFontSize: 18 });
		expect(html).toContain(`style="--nhd-diff-font: 'Fira Code', monospace; --nhd-diff-size: 18px"`);
		expect(renderPanel(state, en)).not.toContain('style=');
	});

	test('long lines can be left unwrapped', () => {
		expect(renderPanel(state, en, { wrap: false })).toContain('class="nhd mode-side nowrap"');
		expect(renderPanel(state, en)).toContain('class="nhd mode-side"');
	});

	test('the view has its own right-click menu with a translated Copy', () => {
		expect(renderPanel(state, en)).toContain('<div class="ctxmenu" hidden><button data-ctx="copy">Copy</button></div>');
		expect(renderPanel(state, ja)).toContain('<button data-ctx="copy">コピー</button>');
		// Also on pages without a diff, so that copying a message works the same way.
		expect(renderPanel({ kind: 'no-note' }, en)).toContain('data-ctx="copy"');
	});
});
