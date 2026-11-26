// UI strings (spec section 6). The texts are English in the source and are
// translated with gettext: locales/<locale>.po, compiled into
// src/i18n/catalog/catalogs.json (npm run i18n:compile). The language follows
// Joplin's `locale` setting; untranslated texts and unsupported languages stay
// in English. To change a text: edit it here, run npm run i18n:extract, then
// translate the new entries in every locales/*.po file.

import catalogs from '../i18n/catalog/catalogs.json';
import { Catalog, resolveLocale, Translator } from '../i18n/gettext';

export interface Strings {
	// Locale of the translation, e.g. "en", "ja", "pt_BR".
	locale: string;
	// BCP 47 tag for number and date formatting, e.g. "pt-BR"; undefined for English.
	numberLocale: string | undefined;
	panelTitle: string;
	commandLabel: string;
	mainWindowOnly: string;
	refresh: string;
	close: string;
	loading: string;
	noNote: string;
	noHistory: string;
	historyHint: (intervalMinutes: number, ttlDays: number) => string;
	historyDisabled: string;
	nothingToCompare: string;
	encrypted: string;
	rebuildFailed: (reason: string) => string;
	error: (message: string) => string;
	from: string;
	to: string;
	revision: (time: string) => string;
	currentNote: string;
	chars: (count: number) => string;
	versionLabel: (name: string, size: string) => string;
	unavailable: string;
	sameVersion: string;
	modeSideBySide: string;
	modeUnified: string;
	olderPair: string;
	newerPair: string;
	previousChange: string;
	nextChange: string;
	ignoreWhitespace: string;
	latestVsCurrent: string;
	previousVsLatest: string;
	lineStats: (added: number, removed: number) => string;
	title: string;
	bodyUnchanged: string;
	foldedLines: (count: number) => string;
}

export function stringsFor(joplinLocale: string | null | undefined): Strings {
	const locale = resolveLocale(joplinLocale || '');
	const t = new Translator(locale, (catalogs as Record<string, Catalog>)[locale] || null);
	const numberLocale = locale === 'en' ? undefined : locale.replace('_', '-');
	const number = (n: number) => n.toLocaleString(numberLocale || 'en');
	return {
		locale,
		numberLocale,
		// The plugin's name is not translated.
		panelTitle: 'Note History Diff',
		commandLabel: t._('Show note history diff'),
		mainWindowOnly: t._('Note History Diff works in the main window only. Open the note in the main window to see its history.'),
		refresh: t._('Refresh'),
		close: t._('Close'),
		loading: t._('Loading note history…'),
		noNote: t._('Select a note to see its changes.'),
		noHistory: t._('This note has no history yet.'),
		// TRANSLATORS: {interval} is a number of minutes, {days} a number of days (Joplin's note history settings).
		historyHint: (interval, days) => t._('Joplin saves a revision when the note is changed at least {interval} minutes after the previous revision, and keeps it for {days} days.', { interval, days }),
		historyDisabled: t._('Note history is turned off. You can turn it on in Tools > Options > Note History.'),
		nothingToCompare: t._('The only revision is identical to the current note, so there is nothing to compare yet.'),
		encrypted: t._('A revision is still encrypted, so its content cannot be rebuilt.'),
		// TRANSLATORS: {reason} is a technical code such as "invalid-patch"; keep it as it is.
		rebuildFailed: reason => t._('A revision could not be read ({reason}).', { reason }),
		// TRANSLATORS: {message} is an error message, usually in English.
		error: message => t._('Something went wrong: {message}', { message }),
		// TRANSLATORS: Label of the list of the older version to compare.
		from: t._('From'),
		// TRANSLATORS: Label of the list of the newer version to compare.
		to: t._('To'),
		// TRANSLATORS: A saved revision of the note in the version list. {time} is its date and time.
		revision: time => t._('Revision {time}', { time }),
		currentNote: t._('Current note'),
		// TRANSLATORS: Length of a version in the version list. {count} is a formatted number.
		chars: count => t.ngettext('{count} char', '{count} chars', count, { count: number(count) }),
		// TRANSLATORS: One entry of the version list: {name} is "Revision <date>" or "Current note", {size} its length or "cannot be read".
		versionLabel: (name, size) => t._('{name} ({size})', { name, size }),
		unavailable: t._('cannot be read'),
		sameVersion: t._('The same version is selected on both sides.'),
		modeSideBySide: t._('Side by side'),
		// TRANSLATORS: The one-column layout of the diff.
		modeUnified: t._('Unified'),
		olderPair: t._('◀ Older pair'),
		newerPair: t._('Newer pair ▶'),
		previousChange: t._('↑ Previous change'),
		nextChange: t._('↓ Next change'),
		ignoreWhitespace: t._('Ignore trailing spaces and line endings'),
		latestVsCurrent: t._('Comparing the latest revision with the current note.'),
		previousVsLatest: t._('The note has not changed since the latest revision, so it is compared with the revision before it.'),
		// TRANSLATORS: Number of lines added and removed in the diff.
		lineStats: (added, removed) => t._('+{added} / −{removed} lines', { added: number(added), removed: number(removed) }),
		// TRANSLATORS: Heading of the diff of the note title.
		title: t._('Title'),
		bodyUnchanged: t._('Body: no changes'),
		// TRANSLATORS: Shown in place of unchanged lines that are folded away.
		foldedLines: count => t.ngettext('… {count} unchanged line …', '… {count} unchanged lines …', count, { count: number(count) }),
	};
}
