// SPDX-License-Identifier: MIT
// Same as in joplin-plugin-dg-plantuml (by the same author).
// Small gettext implementation: _(), ngettext(), pgettext() with
// named placeholders ({name}). Used by the main script (src/ui/i18n.ts). The
// catalogs are JSON made from the PO files at build time (scripts/i18n-compile.mjs).

/**
 * Translations of one locale. The key is the msgid, or "context\u0004msgid"
 * for pgettext. The value holds the msgstr, one entry per plural form.
 */
export type Catalog = Record<string, string[]>;

export const CONTEXT_SEPARATOR = '\u0004';

/** Locales with a translation. English is the source language. */
export const SUPPORTED_LOCALES = ['en', 'ja', 'zh_CN', 'zh_TW', 'ko', 'de', 'fr', 'es', 'pt_BR', 'it', 'ru'];

/** Plural form index for n, per language. PO "Plural-Forms" must match. */
export const PLURAL_RULES: Record<string, { nplurals: number; index: (n: number) => number }> = {
	en: { nplurals: 2, index: (n) => (n !== 1 ? 1 : 0) },
	ja: { nplurals: 1, index: () => 0 },
	zh_CN: { nplurals: 1, index: () => 0 },
	zh_TW: { nplurals: 1, index: () => 0 },
	ko: { nplurals: 1, index: () => 0 },
	de: { nplurals: 2, index: (n) => (n !== 1 ? 1 : 0) },
	fr: { nplurals: 2, index: (n) => (n > 1 ? 1 : 0) },
	es: { nplurals: 2, index: (n) => (n !== 1 ? 1 : 0) },
	pt_BR: { nplurals: 2, index: (n) => (n > 1 ? 1 : 0) },
	it: { nplurals: 2, index: (n) => (n !== 1 ? 1 : 0) },
	ru: {
		nplurals: 3,
		index: (n) => (n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2),
	},
};

/** Locales that use another locale's translation. */
const LOCALE_ALIASES: Record<string, string> = {
	zh_HK: 'zh_TW',
	zh_MO: 'zh_TW',
	zh_Hant: 'zh_TW',
	zh_SG: 'zh_CN',
	zh_Hans: 'zh_CN',
	zh: 'zh_CN',
	pt: 'pt_BR',
	pt_PT: 'pt_BR',
};

/**
 * Locale to use for Joplin's display language: exact match,
 * then the language part, then the alias table, then English.
 * "ja_JP" -> "ja", "pt_PT" -> "pt_BR", "zh_HK" -> "zh_TW", "nl" -> "en".
 */
export function resolveLocale(joplinLocale: string, available: string[] = SUPPORTED_LOCALES): string {
	const locale = (joplinLocale || '').replace('-', '_');
	const language = locale.split('_')[0];
	for (const candidate of [locale, language, LOCALE_ALIASES[locale], LOCALE_ALIASES[language]]) {
		if (candidate && available.includes(candidate)) return candidate;
	}
	return 'en';
}

/** Replaces {name} with params.name. Unknown names are left as they are. */
export function format(text: string, params?: Record<string, string | number>): string {
	if (!params) return text;
	return text.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (all, name: string) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : all));
}

export class Translator {
	private readonly rule: { nplurals: number; index: (n: number) => number };

	constructor(readonly locale: string, private readonly catalog: Catalog | null) {
		this.rule = PLURAL_RULES[locale] || PLURAL_RULES.en;
	}

	private lookup(key: string): string[] | null {
		const entry = this.catalog ? this.catalog[key] : undefined;
		return entry && entry.some((s) => s.length > 0) ? entry : null;
	}

	/** Translates a message. Untranslated messages stay in English. */
	_(msgid: string, params?: Record<string, string | number>): string {
		const entry = this.lookup(msgid);
		return format(entry && entry[0] ? entry[0] : msgid, params);
	}

	/** Translates a message with a plural form chosen by n. {count} is n unless params say otherwise. */
	ngettext(msgid: string, plural: string, n: number, params?: Record<string, string | number>): string {
		const all = { count: n, ...params };
		const entry = this.lookup(msgid);
		if (entry) {
			const text = entry[Math.min(this.rule.index(n), entry.length - 1)];
			if (text) return format(text, all);
		}
		return format(n === 1 ? msgid : plural, all);
	}

	/** Translates a message in a context (the same English text with different meanings). */
	pgettext(context: string, msgid: string, params?: Record<string, string | number>): string {
		const entry = this.lookup(`${context}${CONTEXT_SEPARATOR}${msgid}`);
		return format(entry && entry[0] ? entry[0] : msgid, params);
	}
}

/** English, no catalog: the source strings as they are. */
export const ENGLISH = new Translator('en', null);
