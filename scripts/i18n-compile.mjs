// SPDX-License-Identifier: MIT
// Same as in joplin-plugin-dg-plantuml (by the same author).
// npm run i18n:compile: locales/<locale>.po -> src/i18n/catalog/catalogs.json
// (a generated file, not in git). Only translated messages are kept; untranslated
// ones fall back to English at run time.
import fs from 'node:fs';
import path from 'node:path';
import { po } from 'gettext-parser';
import { CATALOG_FILE, LOCALES, poFile, ROOT } from './i18n-common.mjs';

const catalogs = {};
for (const locale of Object.keys(LOCALES)) {
	const file = poFile(locale);
	const catalog = {};
	if (fs.existsSync(file)) {
		const data = po.parse(fs.readFileSync(file));
		for (const [ctx, items] of Object.entries(data.translations)) {
			for (const [msgid, item] of Object.entries(items)) {
				if (!msgid) continue; // header
				if (item.comments && /\bfuzzy\b/.test(item.comments.flag || '')) continue;
				if (!item.msgstr.some((s) => s)) continue;
				catalog[ctx ? `${ctx}\u0004${msgid}` : msgid] = item.msgstr;
			}
		}
	}
	catalogs[locale] = catalog;
}
fs.mkdirSync(path.dirname(CATALOG_FILE), { recursive: true });
fs.writeFileSync(CATALOG_FILE, `${JSON.stringify(catalogs, null, '\t')}\n`);
console.log(`${path.relative(ROOT, CATALOG_FILE)}: ${Object.entries(catalogs).map(([l, c]) => `${l} ${Object.keys(c).length}`).join(', ')}`);
