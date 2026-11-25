import { diffVersions } from '../../src/core/comparison';
import { stringsFor } from '../../src/ui/i18n';
import { renderPanel } from '../../src/ui/panelView';

const ja = stringsFor('ja_JP');
const en = stringsFor('en_GB');

describe('stringsFor', () => {
	test('picks Japanese for ja locales and English otherwise', () => {
		expect(stringsFor('ja_JP').locale).toBe('ja');
		expect(stringsFor('ja').locale).toBe('ja');
		expect(stringsFor('fr_FR').locale).toBe('en');
		expect(stringsFor(null).locale).toBe('en');
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

	test('result: sides, stats, title diff and both layouts, with HTML escaped', () => {
		const diff = diffVersions({ title: 'Plan', body: 'a\n<b>\n' }, { title: 'Plan <final>', body: 'a\n<c>\n' });
		const html = renderPanel({ kind: 'result', from: { kind: 'revision', time: 0 }, to: { kind: 'current', time: 0 }, diff, previousVsLatest: false }, en);
		expect(html).toContain(en.currentNote);
		expect(html).toContain('Revision ');
		expect(html).toContain('+1 / −1 lines');
		expect(html).toContain('Plan &lt;final&gt;');
		expect(html).toContain('&lt;c&gt;');
		expect(html).not.toContain('<c>');
		expect(html).toContain('view-sbs');
		expect(html).toContain('view-unified');
		expect(html).toContain(en.latestVsCurrent);
	});

	test('result: no title section when the title is unchanged; body-unchanged message for title-only edits', () => {
		const same = diffVersions({ title: 'T', body: 'x\n' }, { title: 'T', body: 'y\n' });
		const sameHtml = renderPanel({ kind: 'result', from: { kind: 'revision', time: 0 }, to: { kind: 'revision', time: 0 }, diff: same, previousVsLatest: true }, ja);
		expect(sameHtml).not.toContain('title-diff');
		expect(sameHtml).toContain(ja.previousVsLatest);

		const titleOnly = diffVersions({ title: 'A', body: 'x\n' }, { title: 'B', body: 'x\n' });
		const titleHtml = renderPanel({ kind: 'result', from: { kind: 'revision', time: 0 }, to: { kind: 'current', time: 0 }, diff: titleOnly, previousVsLatest: false }, ja);
		expect(titleHtml).toContain('title-diff');
		expect(titleHtml).toContain(ja.bodyUnchanged);
	});
});
