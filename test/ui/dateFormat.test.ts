import { formatDateTime, formatWithPattern } from '../../src/ui/dateFormat';

// 2026-11-05 09:07:03 and 21:07 local time.
const morning = new Date(2026, 10, 5, 9, 7, 3).getTime();
const evening = new Date(2026, 10, 5, 21, 7, 3).getTime();

describe('formatWithPattern (Joplin date and time formats)', () => {
	test.each([
		['DD/MM/YYYY', '05/11/2026'],
		['DD/MM/YY', '05/11/26'],
		['MM/DD/YYYY', '11/05/2026'],
		['MM/DD/YY', '11/05/26'],
		['YYYY-MM-DD', '2026-11-05'],
		['DD.MM.YYYY', '05.11.2026'],
		['YYYY.MM.DD', '2026.11.05'],
		['YYMMDD', '261105'],
		['YYYY/MM/DD', '2026/11/05'],
		['HH:mm', '09:07'],
		['h:mm A', '9:07 AM'],
		['HH.mm', '09.07'],
	])('%s', (pattern, expected) => {
		expect(formatWithPattern(morning, pattern)).toBe(expected);
	});

	test('12-hour clock in the evening and at noon / midnight', () => {
		expect(formatWithPattern(evening, 'h:mm A')).toBe('9:07 PM');
		expect(formatWithPattern(new Date(2026, 0, 1, 12, 0).getTime(), 'h:mm A')).toBe('12:00 PM');
		expect(formatWithPattern(new Date(2026, 0, 1, 0, 5).getTime(), 'h:mm A')).toBe('12:05 AM');
	});
});

describe('formatDateTime', () => {
	test('joins the date and time formats', () => {
		expect(formatDateTime(evening, { date: 'YYYY/MM/DD', time: 'HH:mm' }, 'ja')).toBe('2026/11/05 21:07');
	});

	test('falls back to the locale format when a setting is unknown', () => {
		expect(formatDateTime(evening, { date: null, time: 'HH:mm' }, 'en')).toBe(new Date(evening).toLocaleString());
	});
});
