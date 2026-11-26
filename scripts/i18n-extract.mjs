// SPDX-License-Identifier: MIT
// Same as in joplin-plugin-dg-plantuml (by the same author).
// npm run i18n:extract: collects _(), ngettext() and pgettext()
// strings and "// TRANSLATORS:" comments from src/, writes locales/note-history-diff.pot,
// and merges it into locales/<locale>.po. Existing translations are kept, new
// messages are added untranslated, and messages no longer used are dropped.
import fs from 'node:fs';
import path from 'node:path';
import { po } from 'gettext-parser';
import { extract, LOCALES, poFile, POT_FILE, ROOT } from './i18n-common.mjs';

function header(language, pluralForms) {
	return {
		'Project-Id-Version': 'note-history-diff',
		'Report-Msgid-Bugs-To': 'https://github.com/akiratamcat/joplin-plugin-note-history-diff/issues',
		Language: language,
		'MIME-Version': '1.0',
		'Content-Type': 'text/plain; charset=UTF-8',
		'Content-Transfer-Encoding': '8bit',
		'Plural-Forms': pluralForms,
	};
}

function toTranslations(messages, translate) {
	const translations = { '': { '': { msgid: '', msgstr: [''] } } };
	for (const msg of [...messages.values()].sort((a, b) => a.refs[0].localeCompare(b.refs[0], 'en'))) {
		const ctx = msg.msgctxt || '';
		translations[ctx] = translations[ctx] || {};
		const item = { msgid: msg.msgid, msgstr: translate(msg), comments: { reference: msg.refs.join('\n') } };
		if (msg.msgctxt) item.msgctxt = msg.msgctxt;
		if (msg.msgid_plural) item.msgid_plural = msg.msgid_plural;
		if (msg.notes.length) item.comments.extracted = msg.notes.join('\n');
		translations[ctx][msg.msgid] = item;
	}
	return translations;
}

const { messages, problems } = extract();
for (const p of problems) console.warn(`warning: ${p}`);

fs.mkdirSync(path.dirname(POT_FILE), { recursive: true });
fs.writeFileSync(POT_FILE, po.compile({
	charset: 'utf-8',
	headers: header('', 'nplurals=2; plural=(n != 1);'),
	translations: toTranslations(messages, (msg) => (msg.msgid_plural ? ['', ''] : [''])),
}, { foldLength: 0 }));
console.log(`${path.relative(ROOT, POT_FILE)}: ${messages.size} messages`);

for (const [locale, info] of Object.entries(LOCALES)) {
	const file = poFile(locale);
	const old = fs.existsSync(file) ? po.parse(fs.readFileSync(file)) : null;
	const n = Number(/nplurals=(\d+)/.exec(info.pluralForms)[1]);
	let kept = 0;
	const translations = toTranslations(messages, (msg) => {
		const prev = old && old.translations[msg.msgctxt || ''] && old.translations[msg.msgctxt || ''][msg.msgid];
		if (prev && prev.msgstr.some((s) => s)) {
			kept++;
			return msg.msgid_plural ? Array.from({ length: n }, (_v, k) => prev.msgstr[k] || '') : [prev.msgstr[0]];
		}
		return msg.msgid_plural ? Array(n).fill('') : [''];
	});
	fs.writeFileSync(file, po.compile({ charset: 'utf-8', headers: header(locale, info.pluralForms), translations }, { foldLength: 0 }));
	console.log(`${path.relative(ROOT, file)}: ${kept}/${messages.size} translated`);
}
