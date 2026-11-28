import { fetchAllRevisionRows, indexRevisions, RevisionRepository, sortRevisions } from '../../src/history/revisionRepository';
import { growingVersions, makeRevisions, pagedFetcher } from '../helpers/history';
import { makeTextPatch } from '../../src/history/patch';

describe('revisionRepository', () => {
	const noteA = makeRevisions(growingVersions(12), 'note-a', 1000);
	const noteB = makeRevisions(growingVersions(3), 'note-b', 500);
	// Shuffled and mixed with a non-note item, like the unordered Data API output.
	const otherItem = { ...noteB[0], id: 'folder-rev', item_type: 2, item_id: 'folder-1' };
	const all = [noteA[5], noteB[2], otherItem, ...noteA.slice(0, 5), noteB[0], ...noteA.slice(6), noteB[1]];

	test('fetchAllRevisionRows reads every page', async () => {
		const fetcher = pagedFetcher(all, 4);
		const rows = await fetchAllRevisionRows(fetcher);
		expect(rows).toHaveLength(all.length);
		expect(fetcher.calls).toBe(Math.ceil(all.length / 4));
	});

	test('sortRevisions orders by note update time, then creation time', () => {
		const sorted = sortRevisions([noteA[2], noteA[0], noteA[1]]);
		expect(sorted.map(r => r.id)).toEqual([noteA[0].id, noteA[1].id, noteA[2].id]);
		const tie = [{ ...noteA[1], item_updated_time: 1, created_time: 9 }, { ...noteA[0], item_updated_time: 1, created_time: 2 }];
		expect(sortRevisions(tie).map(r => r.created_time)).toEqual([2, 9]);
	});

	test('indexRevisions groups note revisions by note and ignores other items', () => {
		const index = indexRevisions(all);
		expect(Array.from(index.keys()).sort()).toEqual(['note-a', 'note-b']);
		expect(index.get('note-a')!.map(r => r.id)).toEqual(noteA.map(r => r.id));
		expect(index.get('note-b')!.map(r => r.id)).toEqual(noteB.map(r => r.id));
	});

	test('RevisionRepository loads the index once and rebuilds versions', async () => {
		const fetcher = pagedFetcher(all, 4);
		const repository = new RevisionRepository(fetcher);
		const rebuilder = await repository.rebuilderFor('note-a');
		const callsAfterFirstLoad = fetcher.calls;
		expect(rebuilder.length).toBe(12);
		expect(rebuilder.versionAt(11)).toEqual(growingVersions(12)[11]);

		await repository.rebuilderFor('note-b');
		expect(fetcher.calls).toBe(callsAfterFirstLoad);
		expect(await repository.revisionsFor('missing')).toEqual([]);
	});

	test('concurrent first calls share one load', async () => {
		const fetcher = pagedFetcher(all, 100);
		const repository = new RevisionRepository(fetcher);
		await Promise.all([repository.revisionsFor('note-a'), repository.revisionsFor('note-b')]);
		expect(fetcher.calls).toBe(1);
	});

	test('invalidate makes the next call reload the index', async () => {
		const fetcher = pagedFetcher(all, 100);
		const repository = new RevisionRepository(fetcher);
		await repository.revisionsFor('note-a');
		repository.invalidate();
		await repository.revisionsFor('note-a');
		expect(fetcher.calls).toBe(2);
	});

	test('rebuilds cached descendants after an ancestor changes', async () => {
		const first = { title: 'Title', body: 'Original body' };
		const rows = makeRevisions([first, { ...first, title: 'Edited title' }]);
		const repository = new RevisionRepository(pagedFetcher(rows));
		const initial = await repository.rebuilderFor('note-1');
		expect(initial.versionAt(1).body).toBe(first.body);

		const updatedBody = 'Body from rewritten ancestor';
		rows[0] = { ...rows[0], body_diff: makeTextPatch('', updatedBody), updated_time: rows[0].updated_time + 1 };
		repository.invalidate();
		const refreshed = await repository.rebuilderFor('note-1');
		expect(refreshed.versionAt(1).body).toBe(updatedBody);
		expect(initial.versionAt(1).body).toBe(first.body);
	});

	test('a failed load is retried on the next call', async () => {
		let fail = true;
		const fetcher = pagedFetcher(all, 100);
		const flaky = async (page: number) => {
			if (fail) throw new Error('offline');
			return fetcher(page);
		};
		const repository = new RevisionRepository(flaky);
		await expect(repository.revisionsFor('note-a')).rejects.toThrow('offline');
		fail = false;
		expect(await repository.revisionsFor('note-a')).toHaveLength(12);
	});
});
