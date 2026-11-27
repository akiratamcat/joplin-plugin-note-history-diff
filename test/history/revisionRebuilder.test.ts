import { RevisionCache } from '../../src/history/revisionCache';
import { makeTextPatch } from '../../src/history/patch';
import { cacheKey, RebuildError, RevisionRebuilder } from '../../src/history/revisionRebuilder';
import { growingVersions, makeRevisions } from '../helpers/history';

describe('RevisionRebuilder', () => {
	const versions = growingVersions(35);
	const revisions = makeRevisions(versions);

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('rebuilds every version in order', () => {
		const rebuilder = new RevisionRebuilder(revisions, new RevisionCache(1_000_000), 10);
		versions.forEach((expected, i) => expect(rebuilder.versionAt(i)).toEqual(expected));
	});

	test('rebuilds versions in random order with the same results', () => {
		const rebuilder = new RevisionRebuilder(revisions, new RevisionCache(1_000_000), 10);
		for (const i of [34, 3, 17, 0, 29, 9, 10, 33]) {
			expect(rebuilder.versionAt(i)).toEqual(versions[i]);
		}
	});

	test('stores checkpoints instead of every version', () => {
		const cache = new RevisionCache(1_000_000);
		const rebuilder = new RevisionRebuilder(revisions, cache, 10);
		rebuilder.versionAt(34);
		// Checkpoints at versions 10, 20, 30 (indexes 9, 19, 29) plus the requested one.
		expect(cache.size).toBe(4);
		for (const i of [9, 19, 29, 34]) expect(cache.has(cacheKey(revisions[i]))).toBe(true);
	});

	test('starts from the nearest checkpoint', () => {
		const cache = new RevisionCache(1_000_000);
		const rebuilder = new RevisionRebuilder(revisions, cache, 10);
		rebuilder.versionAt(34);
		// Break an early revision: if rebuilding replayed from the start, this would throw.
		const broken = revisions.map((r, i) => (i === 2 ? { ...r, body_diff: '{bad' } : r));
		const fromCheckpoint = new RevisionRebuilder(broken, cache, 10);
		expect(fromCheckpoint.versionAt(32)).toEqual(versions[32]);
	});

	test('still rebuilds correctly with a very small cache', () => {
		const rebuilder = new RevisionRebuilder(revisions, new RevisionCache(50), 10);
		for (const i of [34, 5, 20]) expect(rebuilder.versionAt(i)).toEqual(versions[i]);
	});

	test('reports an encrypted revision', () => {
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		const encrypted = revisions.map((r, i) => (i === 5 ? { ...r, encryption_applied: 1 } : r));
		const rebuilder = new RevisionRebuilder(encrypted, new RevisionCache(1_000_000), 10);
		expect(rebuilder.versionAt(4)).toEqual(versions[4]);
		expect(() => rebuilder.versionAt(7)).toThrow(RebuildError);
		try {
			rebuilder.versionAt(7);
		} catch (error) {
			expect(error).toMatchObject({ reason: 'encrypted', index: 5 });
		}
	});

	test('reports an invalid patch', () => {
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		const broken = revisions.map((r, i) => (i === 3 ? { ...r, title_diff: 'not a patch' } : r));
		const rebuilder = new RevisionRebuilder(broken, new RevisionCache(1_000_000), 10);
		expect(() => rebuilder.versionAt(3)).toThrow(expect.objectContaining({ reason: 'invalid-patch', index: 3 }));
	});

	test('rejects an index out of range', () => {
		const rebuilder = new RevisionRebuilder(revisions, new RevisionCache(1_000_000), 10);
		expect(() => rebuilder.versionAt(-1)).toThrow(RangeError);
		expect(() => rebuilder.versionAt(35)).toThrow(RangeError);
	});

	test('scan reports every body length in one pass and stores the checkpoints', () => {
		const cache = new RevisionCache(1_000_000);
		const rebuilder = new RevisionRebuilder(revisions, cache, 10);
		const summaries = rebuilder.scan();
		expect(summaries).toEqual(versions.map((v, index) => ({ index, ok: true, bodyLength: v.body.length })));
		// Checkpoints at indexes 9, 19, 29 plus the latest version.
		expect(cache.size).toBe(4);
		for (const i of [9, 19, 29, 34]) expect(cache.has(cacheKey(revisions[i]))).toBe(true);
		expect(rebuilder.versionAt(34)).toEqual(versions[34]);
	});

	test('scan marks a revision that cannot be rebuilt and its descendants', () => {
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		const broken = revisions.map((r, i) => (i === 5 ? { ...r, encryption_applied: 1 } : r));
		const summaries = new RevisionRebuilder(broken, new RevisionCache(1_000_000), 10).scan();
		expect(summaries[4]).toEqual({ index: 4, ok: true, bodyLength: versions[4].body.length });
		expect(summaries.slice(5).every(s => !s.ok && 'reason' in s && s.reason === 'encrypted')).toBe(true);
	});

	test('rebuilds a branch from its recorded parent with another branch in the cache', () => {
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		const root = { title: 'Original title', body: 'Original body' };
		const branch = { title: 'Unrelated heading', body: 'Other content' };
		const latest = { title: 'Original title edited', body: 'Original body and more' };
		const [first, other] = makeRevisions([root, branch]);
		const child = { ...makeRevisions([root, latest])[1], id: 'latest' };
		const rebuilder = new RevisionRebuilder([first, other, child], new RevisionCache(1_000_000));
		expect(rebuilder.versionAt(1)).toEqual(branch);
		expect(rebuilder.versionAt(2)).toEqual(latest);

		const unreadableBranch = { ...other, encryption_applied: 1 };
		const scan = new RevisionRebuilder([first, unreadableBranch, child], new RevisionCache(1_000_000));
		expect(scan.scan()).toEqual([
			{ index: 0, ok: true, bodyLength: root.body.length },
			{ index: 1, ok: false, reason: 'encrypted' },
			{ index: 2, ok: true, bodyLength: latest.body.length },
		]);
	});

	test('continues from the text returned by a failed hunk and logs counts', () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		const root = { title: 'First', body: 'Completely unrelated text that shares nothing.' };
		const latest = { title: 'Third', body: root.body + ' Then an edit.' };
		const [first, second, third] = makeRevisions([root, { ...root, title: 'Second' }, latest]);
		second.body_diff = makeTextPatch('The quick brown fox jumps over the lazy dog.', 'The quick brown cat jumps over the lazy dog.');
		const rebuilder = new RevisionRebuilder([first, second, third], new RevisionCache(1_000_000));
		expect(rebuilder.versionAt(2)).toEqual(latest);
		expect(rebuilder.scan()[1]).toEqual({ index: 1, ok: true, bodyLength: root.body.length });
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith('Note History Diff: patch-not-applied', {
			revisionId: second.id,
			parentId: first.id,
			revisionNumber: 2,
			revisionCount: 3,
			titleFailedHunks: 0,
			titleTotalHunks: 1,
			bodyFailedHunks: 1,
			bodyTotalHunks: 1,
		});
	});
});
