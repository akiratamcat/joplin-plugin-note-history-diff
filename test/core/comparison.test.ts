import { diffVersions, planDefaultComparison } from '../../src/core/comparison';
import { RevisionCache } from '../../src/history/revisionCache';
import { RevisionRebuilder } from '../../src/history/revisionRebuilder';
import { makeRevisions } from '../helpers/history';

const v1 = { title: '予定', body: '# 予定\n- 会議 15時\n' };
const v2 = { title: '予定', body: '# 予定\n- 会議 16時\n' };
const v3 = { title: '予定（確定）', body: '# 予定\n- 会議 16時\n- 資料を送る\n' };

function rebuilderOf(versions: { title: string; body: string }[]) {
	return new RevisionRebuilder(makeRevisions(versions), new RevisionCache(1_000_000));
}

describe('planDefaultComparison (F1)', () => {
	test('no revisions', () => {
		expect(planDefaultComparison(rebuilderOf([]), { ...v1, updatedTime: 1 })).toEqual({ kind: 'no-history' });
	});

	test('the note was edited after the latest revision: latest revision → current note', () => {
		const plan = planDefaultComparison(rebuilderOf([v1, v2]), { ...v3, updatedTime: 9 });
		expect(plan.kind).toBe('compare');
		if (plan.kind !== 'compare') return;
		expect(plan.from).toMatchObject({ kind: 'revision', index: 1, version: v2 });
		expect(plan.to).toMatchObject({ kind: 'current', time: 9, version: v3 });
	});

	test('the note equals the latest revision: previous revision → latest revision', () => {
		const plan = planDefaultComparison(rebuilderOf([v1, v2, v3]), { ...v3, updatedTime: 9 });
		expect(plan.kind).toBe('compare');
		if (plan.kind !== 'compare') return;
		expect(plan.from).toMatchObject({ kind: 'revision', index: 1, version: v2 });
		expect(plan.to).toMatchObject({ kind: 'revision', index: 2, version: v3 });
	});

	test('a single revision equal to the note: nothing to compare yet', () => {
		const plan = planDefaultComparison(rebuilderOf([v1]), { ...v1, updatedTime: 9 });
		expect(plan.kind).toBe('nothing-to-compare');
	});

	test('a single revision different from the note: compare them', () => {
		const plan = planDefaultComparison(rebuilderOf([v1]), { ...v2, updatedTime: 9 });
		expect(plan).toMatchObject({ kind: 'compare', from: { kind: 'revision', index: 0 }, to: { kind: 'current' } });
	});

	test('a revision that cannot be rebuilt is reported, not thrown', () => {
		const revisions = makeRevisions([v1, v2]).map((r, i) => (i === 1 ? { ...r, encryption_applied: 1 } : r));
		const rebuilder = new RevisionRebuilder(revisions, new RevisionCache(1_000_000));
		const plan = planDefaultComparison(rebuilder, { ...v3, updatedTime: 9 });
		expect(plan).toMatchObject({ kind: 'rebuild-failed', error: { reason: 'encrypted' } });
	});
});

describe('diffVersions (F5)', () => {
	test('reports a title change separately from the body', () => {
		const diff = diffVersions(v2, v3);
		expect(diff.titleChanged).toBe(true);
		expect(diff.title).toEqual({ before: '予定', after: '予定（確定）' });
		expect(diff.body.added).toBe(1);
		expect(diff.body.removed).toBe(0);
	});

	test('a title-only change leaves the body unchanged', () => {
		const diff = diffVersions({ title: 'a', body: 'same\n' }, { title: 'b', body: 'same\n' });
		expect(diff.titleChanged).toBe(true);
		expect(diff.body.added + diff.body.removed).toBe(0);
	});
});
