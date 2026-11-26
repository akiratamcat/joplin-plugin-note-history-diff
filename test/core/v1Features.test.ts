import { CURRENT_KEY, diffVersions, neighbourPair, VersionChoice } from '../../src/core/comparison';
import { normalizeWhitespace } from '../../src/diff/whitespace';

describe('normalizeWhitespace (F9)', () => {
	test('turns CRLF and CR into LF and drops trailing spaces and tabs', () => {
		expect(normalizeWhitespace('a  \r\nb\t\rc \n d')).toBe('a\nb\nc\n d');
	});

	test('keeps leading and inner whitespace', () => {
		expect(normalizeWhitespace('  - a  b')).toBe('  - a  b');
	});
});

describe('diffVersions with ignoreWhitespace (F9)', () => {
	const from = { title: 'Plan ', body: '# Plan\r\n- one  \r\n- two\r\n' };
	const to = { title: 'Plan', body: '# Plan\n- one\n- two\n' };

	test('only whitespace differences: nothing changed', () => {
		const diff = diffVersions(from, to, { ignoreWhitespace: true });
		expect(diff.titleChanged).toBe(false);
		expect(diff.body.added).toBe(0);
		expect(diff.body.removed).toBe(0);
	});

	test('without the option, the same versions differ', () => {
		const diff = diffVersions(from, to);
		expect(diff.titleChanged).toBe(true);
		expect(diff.body.added).toBe(3);
		expect(diff.body.removed).toBe(3);
	});

	test('real changes are still shown', () => {
		const diff = diffVersions(from, { title: 'Plan', body: '# Plan\n- one\n- three\n' }, { ignoreWhitespace: true });
		expect(diff.body.added).toBe(1);
		expect(diff.body.removed).toBe(1);
	});
});

describe('neighbourPair (F6)', () => {
	// Newest first: current note, then revisions r4 (newest) .. r1 (oldest).
	const choices: VersionChoice[] = [
		{ key: CURRENT_KEY, kind: 'current', time: 5, bodyLength: 5 },
		{ key: 'r4', kind: 'revision', time: 4, bodyLength: 4 },
		{ key: 'r3', kind: 'revision', time: 3, bodyLength: 3 },
		{ key: 'r2', kind: 'revision', time: 2, bodyLength: 2 },
		{ key: 'r1', kind: 'revision', time: 1, bodyLength: 1 },
	];

	test('from a pair of neighbours: one step older or newer', () => {
		expect(neighbourPair(choices, 'r3', 'r4', 'older')).toEqual({ fromKey: 'r2', toKey: 'r3' });
		expect(neighbourPair(choices, 'r3', 'r4', 'newer')).toEqual({ fromKey: 'r4', toKey: CURRENT_KEY });
	});

	test('the default comparison (latest revision → current note) steps back through the revisions', () => {
		expect(neighbourPair(choices, 'r4', CURRENT_KEY, 'older')).toEqual({ fromKey: 'r3', toKey: 'r4' });
		expect(neighbourPair(choices, 'r4', CURRENT_KEY, 'newer')).toBeNull();
	});

	test('no older pair at the oldest revisions', () => {
		expect(neighbourPair(choices, 'r1', 'r2', 'older')).toBeNull();
	});

	test('from versions that are not neighbours, or reversed: based on the newer one', () => {
		expect(neighbourPair(choices, 'r1', 'r4', 'older')).toEqual({ fromKey: 'r3', toKey: 'r4' });
		expect(neighbourPair(choices, 'r4', 'r1', 'newer')).toEqual({ fromKey: 'r4', toKey: CURRENT_KEY });
	});

	test('a pair with a version that cannot be read is not offered', () => {
		const broken = choices.map(c => (c.key === 'r2' ? { ...c, bodyLength: null } : c));
		expect(neighbourPair(broken, 'r3', 'r4', 'older')).toBeNull();
	});

	test('unknown keys', () => {
		expect(neighbourPair(choices, 'gone', 'r4', 'older')).toBeNull();
	});
});
