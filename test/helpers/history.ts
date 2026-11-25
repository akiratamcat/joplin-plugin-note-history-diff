import { makeTextPatch } from '../../src/history/patch';
import { NOTE_ITEM_TYPE, NoteVersion, RevisionPageFetcher, RevisionRow } from '../../src/history/types';

// Builds revision rows the way Joplin stores them: each revision holds the
// JSON patch from the previous version (starting from an empty note).
export function makeRevisions(versions: NoteVersion[], noteId = 'note-1', startTime = 1000): RevisionRow[] {
	const rows: RevisionRow[] = [];
	let previous: NoteVersion = { title: '', body: '' };
	let parentId = '';
	versions.forEach((version, i) => {
		const id = `${noteId}-rev-${i}`;
		rows.push({
			id,
			parent_id: parentId,
			item_type: NOTE_ITEM_TYPE,
			item_id: noteId,
			item_updated_time: startTime + i * 60_000,
			created_time: startTime + i * 60_000 + 1_000,
			updated_time: startTime + i * 60_000 + 1_000,
			title_diff: makeTextPatch(previous.title, version.title),
			body_diff: makeTextPatch(previous.body, version.body),
			metadata_diff: '{"new":{},"deleted":[]}',
			encryption_applied: 0,
		});
		previous = version;
		parentId = id;
	});
	return rows;
}

// A note that grows a little with every version.
export function growingVersions(count: number): NoteVersion[] {
	const versions: NoteVersion[] = [];
	const lines = ['# 予定', '', '- 会議 15時'];
	for (let i = 0; i < count; i++) {
		if (i > 0) {
			if (i % 3 === 0) lines.splice(1, 1);
			lines.push(`- 項目 ${i}: 変更 ${i}`);
			if (i % 4 === 0) lines[2] = `- 会議 ${15 + (i % 3)}時`;
		}
		versions.push({ title: `予定 v${i}`, body: lines.join('\n') });
	}
	return versions;
}

// Serves rows in pages of `pageSize`, like the Data API, and counts calls.
export function pagedFetcher(rows: RevisionRow[], pageSize = 100): RevisionPageFetcher & { calls: number } {
	const fetcher = (async (page: number) => {
		fetcher.calls++;
		const start = (page - 1) * pageSize;
		return { items: rows.slice(start, start + pageSize), has_more: start + pageSize < rows.length };
	}) as RevisionPageFetcher & { calls: number };
	fetcher.calls = 0;
	return fetcher;
}
