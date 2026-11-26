// SPDX-License-Identifier: MIT
// Same as in joplin-plugin-dg-plantuml (by the same author).
// npm run i18n:check: checks every PO file. Fails on errors:
// unreadable file, wrong Plural-Forms, wrong number of plural forms, a
// placeholder ({name}) that differs from the English text, a fuzzy entry, or
// messages that are not in note-history-diff.pot (run i18n:extract). Prints how much is
// untranslated (not an error: untranslated text is shown in English).
import fs from 'node:fs';
import path from 'node:path';
import { po } from 'gettext-parser';
import { extract, LOCALES, nplurals, placeholders, poFile, POT_FILE, ROOT } from './i18n-common.mjs';

const errors = [];
const pot = po.parse(fs.readFileSync(POT_FILE));
const potKeys = new Set();
for (const [ctx, items] of Object.entries(pot.translations)) for (const msgid of Object.keys(items)) if (msgid) potKeys.add(`${ctx}\u0004${msgid}`);

// note-history-diff.pot must match the source (a new message needs npm run i18n:extract).
const short = (key) => key.split('\u0004')[1].slice(0, 50);
const source = new Set([...extract().messages.values()].map((m) => `${m.msgctxt || ''}\u0004${m.msgid}`));
for (const key of source) if (!potKeys.has(key)) errors.push(`note-history-diff.pot: "${short(key)}" is used in the source but missing (run npm run i18n:extract)`);
for (const key of potKeys) if (!source.has(key)) errors.push(`note-history-diff.pot: "${short(key)}" is no longer used (run npm run i18n:extract)`);

for (const [locale, info] of Object.entries(LOCALES)) {
	const file = poFile(locale);
	const rel = path.relative(ROOT, file);
	if (!fs.existsSync(file)) { errors.push(`${rel}: missing (run npm run i18n:extract)`); continue; }
	let data;
	try {
		data = po.parse(fs.readFileSync(file));
	} catch (e) {
		errors.push(`${rel}: cannot be read: ${e.message}`);
		continue;
	}
	const pluralForms = data.headers['Plural-Forms'] || '';
	const n = nplurals(pluralForms);
	if (n !== nplurals(info.pluralForms)) errors.push(`${rel}: Plural-Forms "${pluralForms}" should have nplurals=${nplurals(info.pluralForms)}`);
	let total = 0;
	let untranslated = 0;
	const seen = new Set();
	for (const [ctx, items] of Object.entries(data.translations)) {
		for (const [msgid, item] of Object.entries(items)) {
			if (!msgid) continue;
			total++;
			const where = `${rel}: "${msgid.slice(0, 50)}"`;
			seen.add(`${ctx}\u0004${msgid}`);
			if (!potKeys.has(`${ctx}\u0004${msgid}`)) errors.push(`${where}: not in note-history-diff.pot`);
			if (item.comments && /\bfuzzy\b/.test(item.comments.flag || '')) errors.push(`${where}: fuzzy`);
			if (item.msgid_plural && item.msgstr.length !== n) errors.push(`${where}: ${item.msgstr.length} plural forms, expected ${n}`);
			if (!item.msgstr.some((s) => s)) { untranslated++; continue; }
			const expected = placeholders(item.msgid_plural ? `${msgid} ${item.msgid_plural}` : msgid).join(' ');
			for (const s of item.msgstr) {
				if (!s) continue;
				// A form may leave out {count} (e.g. a singular written as a word), but must not add unknown names.
				const got = placeholders(s);
				const unknown = got.filter((p) => !expected.split(' ').includes(p));
				const missing = expected.split(' ').filter((p) => p && p !== '{count}' && !got.includes(p));
				if (unknown.length || missing.length) errors.push(`${where}: placeholders differ (expected ${expected || 'none'}, got ${got.join(' ') || 'none'})`);
			}
		}
	}
	for (const key of potKeys) if (!seen.has(key)) errors.push(`${rel}: "${key.split('\u0004')[1].slice(0, 50)}" is missing (run npm run i18n:extract)`);
	console.log(`${rel}: ${total - untranslated}/${total} translated${untranslated ? ` (${untranslated} untranslated)` : ''}`);
}

if (errors.length) {
	for (const e of errors) console.error(`error: ${e}`);
	process.exit(1);
}
console.log('i18n check: OK');
