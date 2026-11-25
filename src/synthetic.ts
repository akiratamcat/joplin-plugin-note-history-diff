import diff_match_patch = require('diff-match-patch');
import { SyntheticBenchmark } from './report';
import { rebuildRevisions, RevisionRow } from './revisions';

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
// like Joplin does, then rebuilds it with the same code as the real history (R3).
export function runSyntheticBenchmark(baseText: string, count = 100): SyntheticBenchmark {
	const dmp = new diff_match_patch();
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
			body_diff: JSON.stringify(dmp.patch_make(previous, current)),
			metadata_diff: '',
			encryption_applied: 0,
		});
		previous = current;
		parentId = id;
	}
	const makeMs = Date.now() - makeStarted;

	const rebuildStarted = Date.now();
	const rebuilt = rebuildRevisions(revisions);
	const rebuildMs = Date.now() - rebuildStarted;

	return {
		revisions: count,
		finalChars: current.length,
		makeMs,
		rebuildMs,
		allOk: rebuilt.every(r => r.ok),
		finalMatches: rebuilt.length > 0 && rebuilt[rebuilt.length - 1].body === current,
		heldChars: rebuilt.reduce((sum, r) => sum + r.body.length, 0),
	};
}
