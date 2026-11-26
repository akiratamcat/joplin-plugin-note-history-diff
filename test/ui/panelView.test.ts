import { CURRENT_KEY, diffVersions, VersionChoice, VersionDiff } from '../../src/core/comparison';
import { stringsFor } from '../../src/ui/i18n';
import { ComparisonExplanation, renderPanel } from '../../src/ui/panelView';

const ja = stringsFor('ja_JP');
const en = stringsFor('en_GB');

describe('stringsFor', () => {
	test('follows the Joplin language, with English for the others', () => {
		expect(stringsFor('ja_JP').locale).toBe('ja');
		expect(stringsFor('ja').locale).toBe('ja');
		expect(stringsFor('fr_FR').locale).toBe('fr');
		expect(stringsFor('pt_PT').locale).toBe('pt_BR');
		expect(stringsFor('zh_HK').locale).toBe('zh_TW');
		expect(stringsFor('nl_NL').locale).toBe('en');
		expect(stringsFor(null).locale).toBe('en');
	});

	test('every supported language is translated (gettext catalogs)', () => {
		const en = stringsFor('en');
		for (const locale of ['ja', 'zh_CN', 'zh_TW', 'ko', 'de', 'fr', 'es', 'pt_BR', 'it', 'ru']) {
			const strings = stringsFor(locale);
			expect(strings.refresh).not.toBe(en.refresh);
			expect(strings.commandLabel).not.toBe(en.commandLabel);
		}
		expect(stringsFor('de').foldedLines(1)).toBe('… 1 unveränderte Zeile …');
		expect(stringsFor('de').foldedLines(2)).toBe('… 2 unveränderte Zeilen …');
		expect(stringsFor('ru').chars(5)).toBe('5 символов');
		expect(stringsFor('ja').chars(1234)).toBe('1,234 文字');
		expect(en.chars(1)).toBe('1 char');
	});
});

describe('renderPanel', () => {
	test('every page has the refresh and close buttons', () => {
		const html = renderPanel({ kind: 'no-note' }, ja);
		expect(html).toContain('data-action="refresh"');
		expect(html).toContain('data-action="close"');
		expect(html).toContain(ja.noNote);
	});

	test('no history: explains when revisions are saved', () => {
		const html = renderPanel({ kind: 'no-history', enabled: true, intervalMinutes: 10, ttlDays: 90 }, ja);
		expect(html).toContain('このノートには履歴がありません。');
		expect(html).toContain('10 分以上');
		expect(html).toContain('90 日間');
	});

	test('no history with the history service turned off', () => {
		const html = renderPanel({ kind: 'no-history', enabled: false, intervalMinutes: 10, ttlDays: 90 }, en);
		// Rendered with HTML escaping ("Tools > Options" becomes "Tools &gt; Options").
		expect(html).toContain('Note history is turned off. You can turn it on in Tools &gt; Options &gt; Note History.');
		expect(html).not.toContain('minutes after');
	});

	test('nothing to compare and rebuild failures', () => {
		expect(renderPanel({ kind: 'nothing-to-compare' }, ja)).toContain(ja.nothingToCompare);
		expect(renderPanel({ kind: 'rebuild-failed', reason: 'encrypted' }, ja)).toContain(ja.encrypted);
		expect(renderPanel({ kind: 'rebuild-failed', reason: 'invalid-patch' }, en)).toContain('invalid-patch');
	});

	const choices: VersionChoice[] = [
		{ key: CURRENT_KEY, kind: 'current', time: 0, bodyLength: 1234 },
		{ key: 'rev-2', kind: 'revision', time: 0, bodyLength: 10 },
		{ key: 'rev-1', kind: 'revision', time: 0, bodyLength: null },
	];
	const result = (diff: VersionDiff, fromKey: string, toKey: string, explanation: ComparisonExplanation) =>
		renderPanel({ kind: 'result', choices, fromKey, toKey, diff, explanation }, en);

	test('result: stats, title diff and both layouts, with HTML escaped', () => {
		const diff = diffVersions({ title: 'Plan', body: 'a\n<b>\n' }, { title: 'Plan <final>', body: 'a\n<c>\n' });
		const html = result(diff, 'rev-2', CURRENT_KEY, 'latest-vs-current');
		expect(html).toContain('+1 / −1 lines');
		expect(html).toContain('Plan<span class="chg"> &lt;final&gt;</span>');
		expect(html).toContain('&lt;<span class="chg">c</span>&gt;');
		expect(html).not.toContain('<c>');
		expect(html).toContain('view-sbs');
		expect(html).toContain('view-unified');
		expect(html).toContain(en.latestVsCurrent);
		// F3: side by side by default, with the mode buttons.
		expect(html).toContain('class="nhd mode-side"');
		expect(html).toContain('<button data-mode="side" class="active">');
		expect(html).toContain('<button data-mode="unified" class="">');
	});

	test('result: the remembered one-column mode (F3)', () => {
		const diff = diffVersions({ title: 'T', body: 'x' }, { title: 'T', body: 'y' });
		const html = renderPanel({ kind: 'result', choices, fromKey: 'rev-2', toKey: CURRENT_KEY, diff, explanation: null }, en, { mode: 'unified' });
		expect(html).toContain('class="nhd mode-unified"');
		expect(html).toContain('<button data-mode="unified" class="active">');
	});

	test('result: version pickers (F2) list every version, select the compared ones and disable unreadable ones', () => {
		const diff = diffVersions({ title: 'T', body: 'x\n' }, { title: 'T', body: 'y\n' });
		const html = result(diff, 'rev-2', CURRENT_KEY, null);
		expect(html).toContain('data-select="from"');
		expect(html).toContain('data-select="to"');
		expect(html).toContain('<option value="current" selected>Current note (1,234 chars)</option>');
		expect(html).toContain('<option value="rev-2" selected>');
		expect(html).toContain('<option value="rev-1" disabled>');
		expect(html).toContain('cannot be read');
		// No explanation once the user picked the versions.
		expect(html).not.toContain(en.latestVsCurrent);
		expect(html).not.toContain(en.previousVsLatest);
	});

	test('result: revision dates follow the Joplin date and time formats', () => {
		const time = new Date(2026, 10, 24, 21, 10).getTime();
		const dated: VersionChoice[] = [{ key: CURRENT_KEY, kind: 'current', time, bodyLength: 1 }, { key: 'rev-1', kind: 'revision', time, bodyLength: 1 }];
		const diff = diffVersions({ title: 'T', body: 'x' }, { title: 'T', body: 'y' });
		const html = renderPanel({ kind: 'result', choices: dated, fromKey: 'rev-1', toKey: CURRENT_KEY, diff, explanation: null }, ja, { format: { date: 'DD/MM/YYYY', time: 'h:mm A' } });
		expect(html).toContain('版 24/11/2026 9:10 PM（1 文字）');
	});

	test('result: the same version on both sides shows a message instead of a diff', () => {
		const diff = diffVersions({ title: 'T', body: 'x\n' }, { title: 'T', body: 'x\n' });
		const html = result(diff, 'rev-2', 'rev-2', null);
		expect(html).toContain(en.sameVersion);
		expect(html).not.toContain('class="diff"');
	});

	test('result: no title section when the title is unchanged; body-unchanged message for title-only edits', () => {
		const same = diffVersions({ title: 'T', body: 'x\n' }, { title: 'T', body: 'y\n' });
		const sameHtml = renderPanel({ kind: 'result', choices, fromKey: 'rev-1', toKey: 'rev-2', diff: same, explanation: 'previous-vs-latest' }, ja);
		expect(sameHtml).not.toContain('title-diff');
		expect(sameHtml).toContain(ja.previousVsLatest);

		const titleOnly = diffVersions({ title: 'A', body: 'x\n' }, { title: 'B', body: 'x\n' });
		const titleHtml = renderPanel({ kind: 'result', choices, fromKey: 'rev-2', toKey: CURRENT_KEY, diff: titleOnly, explanation: 'latest-vs-current' }, ja);
		expect(titleHtml).toContain('title-diff');
		expect(titleHtml).toContain(ja.bodyUnchanged);
	});
});
