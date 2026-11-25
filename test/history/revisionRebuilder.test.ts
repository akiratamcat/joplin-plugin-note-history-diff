import { RevisionCache } from '../../src/history/revisionCache';
import { cacheKey, RebuildError, RevisionRebuilder } from '../../src/history/revisionRebuilder';
import { growingVersions, makeRevisions } from '../helpers/history';

describe('RevisionRebuilder', () => {
	const versions = growingVersions(35);
	const revisions = makeRevisions(versions);

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
		const broken = revisions.map((r, i) => (i === 3 ? { ...r, title_diff: 'not a patch' } : r));
		const rebuilder = new RevisionRebuilder(broken, new RevisionCache(1_000_000), 10);
		expect(() => rebuilder.versionAt(3)).toThrow(expect.objectContaining({ reason: 'invalid-patch', index: 3 }));
	});

	test('rejects an index out of range', () => {
		const rebuilder = new RevisionRebuilder(revisions, new RevisionCache(1_000_000), 10);
		expect(() => rebuilder.versionAt(-1)).toThrow(RangeError);
		expect(() => rebuilder.versionAt(35)).toThrow(RangeError);
	});
});
