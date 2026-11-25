import { makeTextPatch } from '../history/patch';
import { RevisionCache } from '../history/revisionCache';
import { RevisionRebuilder } from '../history/revisionRebuilder';
import { RevisionRow } from '../history/types';
import { SyntheticBenchmark } from './report';

// Small deterministic PRNG so every run produces the same history.
function prng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

// Applies a few random line edits (change, insert, delete).
function mutate(text: string, random: () => number, step: number): string {
	const lines = text.split('\n');
	for (let edit = 0; edit < 3; edit++) {
		const at = Math.floor(random() * Math.max(lines.length, 1));
		const action = Math.floor(random() * 3);
		if (action === 0 && lines.length) lines[at] = `${lines[at]} (edited in revision ${step})`;
		if (action === 1) lines.splice(at, 0, `Inserted line in revision ${step}`);
		if (action === 2 && lines.length > 1) lines.splice(at, 1);
	}
	return lines.join('\n');
}

// Builds a history of `count` revisions in memory, stored as JSON patches
// like Joplin does, then rebuilds the newest one with the product rebuilder
// from an empty cache: the worst case, replaying the whole chain (R3).
export function runSyntheticBenchmark(baseText: string, count = 100): SyntheticBenchmark {
	const random = prng(42);

	const makeStarted = Date.now();
	const revisions: RevisionRow[] = [];
	let previous = '';
	let current = baseText;
	let parentId = '';
	for (let i = 0; i < count; i++) {
		if (i > 0) current = mutate(current, random, i);
		const id = `synthetic-${i}`;
		revisions.push({
			id,
			parent_id: parentId,
			item_type: 1,
			item_id: 'synthetic',
			item_updated_time: i,
			created_time: i,
			updated_time: i,
			title_diff: '[]',
			body_diff: makeTextPatch(previous, current),
			metadata_diff: '',
			encryption_applied: 0,
		});
		previous = current;
		parentId = id;
	}
	const makeMs = Date.now() - makeStarted;

	const cache = new RevisionCache(5_000_000);
	const rebuilder = new RevisionRebuilder(revisions, cache, 10);
	const rebuildStarted = Date.now();
	let allOk = true;
	let finalMatches = false;
	try {
		finalMatches = rebuilder.versionAt(count - 1).body === current;
	} catch (error) {
		allOk = false;
	}
	const rebuildMs = Date.now() - rebuildStarted;

	return {
		revisions: count,
		finalChars: current.length,
		makeMs,
		rebuildMs,
		allOk,
		finalMatches,
		heldChars: cache.totalChars,
	};
}
