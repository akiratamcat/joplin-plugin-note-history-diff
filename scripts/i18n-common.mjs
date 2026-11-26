// SPDX-License-Identifier: MIT
// Same as in joplin-plugin-dg-plantuml (by the same author).
// Shared parts of the i18n scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LOCALES_DIR = path.join(ROOT, 'locales');
export const POT_FILE = path.join(LOCALES_DIR, 'note-history-diff.pot');
export const CATALOG_FILE = path.join(ROOT, 'src', 'i18n', 'catalog', 'catalogs.json');

/** Translated locales and their plural rules (must match src/i18n/gettext.ts PLURAL_RULES). */
export const LOCALES = {
	ja: { name: 'Japanese', pluralForms: 'nplurals=1; plural=0;' },
	zh_CN: { name: 'Chinese (Simplified)', pluralForms: 'nplurals=1; plural=0;' },
	zh_TW: { name: 'Chinese (Traditional)', pluralForms: 'nplurals=1; plural=0;' },
	ko: { name: 'Korean', pluralForms: 'nplurals=1; plural=0;' },
	de: { name: 'German', pluralForms: 'nplurals=2; plural=(n != 1);' },
	fr: { name: 'French', pluralForms: 'nplurals=2; plural=(n > 1);' },
	es: { name: 'Spanish', pluralForms: 'nplurals=2; plural=(n != 1);' },
	pt_BR: { name: 'Portuguese (Brazil)', pluralForms: 'nplurals=2; plural=(n > 1);' },
	it: { name: 'Italian', pluralForms: 'nplurals=2; plural=(n != 1);' },
	ru: { name: 'Russian', pluralForms: 'nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);' },
};

export function nplurals(pluralForms) {
	const m = /nplurals\s*=\s*(\d+)/.exec(pluralForms || '');
	return m ? Number(m[1]) : 0;
}

export function poFile(locale) {
	return path.join(LOCALES_DIR, `${locale}.po`);
}

/** Placeholders such as {line} in a text, sorted. */
export function placeholders(text) {
	return [...new Set((text.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g) || []))].sort();
}

export function listSourceFiles(dir = path.join(ROOT, 'src')) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'catalog') out.push(...listSourceFiles(full));
		} else if (/\.tsx?$/.test(entry.name)) {
			out.push(full);
		}
	}
	return out.sort();
}

// Extraction of the messages from the source (used by i18n-extract and i18n-check).
const CALL_RE = /(^|[^\w$])(_|ngettext|pgettext)\(\s*/g;

/** Reads a JS string literal at text[i] (quote character included). */
function readString(text, i) {
	const quote = text[i];
	if (quote !== '\'' && quote !== '"') return null;
	let out = '';
	let j = i + 1;
	while (j < text.length && text[j] !== quote) {
		if (text[j] === '\\') {
			const c = text[j + 1];
			out += c === 'n' ? '\n' : c === 't' ? '\t' : c;
			j += 2;
		} else {
			out += text[j];
			j++;
		}
	}
	if (j >= text.length) return null;
	return { value: out, end: j + 1 };
}

function readArgs(text, i, count) {
	const args = [];
	let j = i;
	for (let k = 0; k < count; k++) {
		while (/\s/.test(text[j])) j++;
		const s = readString(text, j);
		if (!s) return null;
		args.push(s.value);
		j = s.end;
		while (/\s/.test(text[j])) j++;
		if (k < count - 1) {
			if (text[j] !== ',') return null;
			j++;
		}
	}
	return args;
}

/** "// TRANSLATORS:" comment lines right above a line. */
function translatorComment(lines, lineIndex) {
	const notes = [];
	for (let k = lineIndex - 1; k >= 0; k--) {
		const line = lines[k].trim();
		if (!line.startsWith('//')) break;
		const m = /^\/\/\s*TRANSLATORS:\s*(.*)$/.exec(line);
		if (m) notes.unshift(m[1]);
	}
	return notes.join('\n');
}

export function extract() {
	const messages = new Map();
	const problems = [];
	for (const file of listSourceFiles()) {
		const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
		const lines = text.split('\n');
		const rel = path.relative(ROOT, file).replace(/\\/g, '/');
		let m;
		CALL_RE.lastIndex = 0;
		while ((m = CALL_RE.exec(text))) {
			const fn = m[2];
			const start = m.index + m[0].length;
			const args = readArgs(text, start, fn === '_' ? 1 : 2);
			const lineIndex = text.slice(0, start).split('\n').length - 1;
			if (!args) {
				// Calls whose first argument is not a string literal (e.g. the gettext implementation itself).
				if (!rel.endsWith('i18n/gettext.ts')) problems.push(`${rel}:${lineIndex + 1}: ${fn}() without a string literal`);
				continue;
			}
			const entry = fn === 'pgettext'
				? { msgctxt: args[0], msgid: args[1] }
				: fn === 'ngettext' ? { msgid: args[0], msgid_plural: args[1] } : { msgid: args[0] };
			const key = `${entry.msgctxt || ''}\u0004${entry.msgid}`;
			const old = messages.get(key) || { ...entry, refs: [], notes: [] };
			old.refs.push(`${rel}:${lineIndex + 1}`);
			const note = translatorComment(lines, lineIndex);
			if (note && !old.notes.includes(note)) old.notes.push(note);
			messages.set(key, old);
		}
	}
	return { messages, problems };
}
