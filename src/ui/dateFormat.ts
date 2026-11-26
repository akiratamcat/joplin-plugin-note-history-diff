// Formats dates like Joplin does, following its "Date format" and "Time format"
// settings (Options > General). Joplin uses moment.js formats; its choices are
// made of the tokens below only (DD/MM/YYYY, YYMMDD, h:mm A, HH.mm, ...).

export interface DateTimeFormat {
	// Joplin's `dateFormat` and `timeFormat` settings, or null when unknown.
	date: string | null;
	time: string | null;
}

const TOKENS = /YYYY|YY|MM|DD|HH|hh|h|mm|ss|A|a/g;

function pad(value: number): string {
	return value < 10 ? `0${value}` : String(value);
}

// Formats `ms` (local time) with a moment.js-style format string.
export function formatWithPattern(ms: number, pattern: string): string {
	const d = new Date(ms);
	const hours = d.getHours();
	const hours12 = hours % 12 === 0 ? 12 : hours % 12;
	return pattern.replace(TOKENS, token => {
		switch (token) {
		case 'YYYY': return String(d.getFullYear());
		case 'YY': return pad(d.getFullYear() % 100);
		case 'MM': return pad(d.getMonth() + 1);
		case 'DD': return pad(d.getDate());
		case 'HH': return pad(hours);
		case 'hh': return pad(hours12);
		case 'h': return String(hours12);
		case 'mm': return pad(d.getMinutes());
		case 'ss': return pad(d.getSeconds());
		case 'A': return hours < 12 ? 'AM' : 'PM';
		case 'a': return hours < 12 ? 'am' : 'pm';
		default: return token;
		}
	});
}

// Date and time in Joplin's formats; falls back to the format of `locale`
// (a BCP 47 tag; undefined: the system's) when the settings could not be read.
export function formatDateTime(ms: number, format: DateTimeFormat, locale: string | undefined): string {
	if (!format.date || !format.time) return new Date(ms).toLocaleString(locale);
	return `${formatWithPattern(ms, format.date)} ${formatWithPattern(ms, format.time)}`;
}
