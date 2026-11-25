import { LineDiffResult } from '../diff/lineDiff';
import { escapeHtml, renderDiffViews } from '../ui/diffView';
import { ProbeResult, RebuiltRevision, RevisionSettings } from './verifyRevisions';

export interface DiffSection {
	label: string;
	result: LineDiffResult;
}

export interface VerificationResult {
	ranAt: number;
	joplinVersion: string;
	settings: RevisionSettings;
	note: { id: string; titleLength: number; bodyLength: number; updatedTime: number };
	fullScan: { totalRevisions: number; pages: number; elapsedMs: number; forThisNote: number };
	probes: ProbeResult[];
	rebuilt: RebuiltRevision[];
	rebuildMs: number;
	cachedChars: number;
	latestVsCurrent: { titleEqual: boolean; bodyEqual: boolean } | null;
	diffs: DiffSection[];
	// Notes with the most revisions, to find one with ~100 revisions (R3).
	topNotes: { noteId: string; title: string; count: number }[];
}

export interface SyntheticBenchmark {
	revisions: number;
	finalChars: number;
	makeMs: number;
	rebuildMs: number;
	allOk: boolean;
	finalMatches: boolean;
	heldChars: number;
}

export interface CompareResult {
	ranAt: number;
	joplinVersion: string;
	before: { title: string; lines: number; chars: number };
	after: { title: string; lines: number; chars: number };
	diff: DiffSection;
	synthetic: SyntheticBenchmark;
}

function formatTime(ms: number): string {
	return ms ? new Date(ms).toLocaleString() : '-';
}

function yesNo(value: boolean): string {
	return value ? 'yes' : 'no';
}

// Probe verdict: the filter works only if it returns exactly this note's revisions.
function probeVerdict(probe: ProbeResult, expected: number): string {
	if (!probe.ok) return 'error';
	if (probe.returned === expected && probe.matching === expected) return 'filter works';
	if (probe.returned > probe.matching) return 'filter ignored';
	return 'inconclusive';
}

// Both layouts are rendered; CSS shows side-by-side when the panel is at
// least 600px wide and the unified view below that (F3).
export function renderDiff(section: DiffSection): string {
	const { result } = section;
	const hasChanges = result.lines.some(l => l.kind !== 'equal');
	const body = hasChanges
		? renderDiffViews(result.lines, { foldedLines: n => `… ${n} unchanged lines …` })
		: '<div class="fold">No changes</div>';
	return `
		<h3>${escapeHtml(section.label)}</h3>
		<p class="meta">+${result.added} / −${result.removed} lines · ${result.elapsedMs} ms · timeout ${result.timeoutSeconds}s${result.timedOut ? ' · <strong>timed out</strong>' : ''}</p>
		<div class="diff">${body}</div>`;
}

// Header shown on every panel page, so the panel can always be closed.
function toolbar(withCopy: boolean): string {
	return `
		<div class="toolbar">
			<span><strong>Note History Diff · verification</strong>
				<span class="layout-label layout-sbs">layout: side-by-side (≥ 600px)</span>
				<span class="layout-label layout-unified">layout: unified (&lt; 600px)</span></span>
			<span class="buttons">
				${withCopy ? '<button id="nhd-copy">Copy summary</button>' : ''}
				<button id="nhd-close" title="Close this panel">Close</button>
			</span>
		</div>`;
}

// A simple panel page with a message (start, running, errors).
export function renderMessage(messageHtml: string): string {
	return `<div class="nhd">${toolbar(false)}<p>${messageHtml}</p></div>`;
}

export function renderHtml(result: VerificationResult, panelWidthNote: string): string {
	const settingsRows = Object.keys(result.settings).map(key => {
		const entry = result.settings[key];
		const value = entry.error ? `error: ${entry.error}` : JSON.stringify(entry.value);
		return `<tr><td><code>${escapeHtml(key)}</code></td><td>${escapeHtml(value)}</td></tr>`;
	}).join('');

	const probeRows = result.probes.map(probe => `
		<tr><td><code>${escapeHtml(probe.label)}</code></td><td>${probeVerdict(probe, result.fullScan.forThisNote)}</td>
		<td>${probe.returned}</td><td>${probe.matching}</td><td>${probe.elapsedMs} ms</td>
		<td>${probe.error ? escapeHtml(probe.error) : ''}</td></tr>`).join('');

	const revisionRows = result.rebuilt.map((r, index) => `
		<tr><td>${index + 1}</td><td><code>${r.revision.id.slice(0, 8)}</code></td>
		<td>${formatTime(r.revision.item_updated_time)}</td><td>${formatTime(r.revision.created_time)}</td>
		<td>${r.title.length}</td><td>${r.body.length}</td>
		<td>${r.skipped ? 'skipped (encrypted)' : r.ok ? 'ok' : `<strong>failed</strong>${r.error ? ` ${escapeHtml(r.error)}` : ''}`}</td>
		<td>${yesNo(r.parentMatchesPrevious)}</td></tr>`).join('');

	const latest = result.latestVsCurrent;

	return `
	<div class="nhd">
		${toolbar(true)}
		<p class="meta">Ran at ${formatTime(result.ranAt)} · Joplin ${escapeHtml(result.joplinVersion)} · panel width <span id="nhd-width">${escapeHtml(panelWidthNote)}</span></p>
		<p class="meta">The summary copied by the button contains counts and timings only, never note text.</p>

		<h2>1. Revision settings</h2>
		<table>${settingsRows}</table>

		<h2>2. Fetching revisions (R1)</h2>
		<p>Full scan: ${result.fullScan.totalRevisions} revisions in ${result.fullScan.pages} page(s), ${result.fullScan.elapsedMs} ms · ${result.fullScan.forThisNote} for this note.</p>
		<table><tr><th>Probe</th><th>Verdict</th><th>Returned</th><th>For this note</th><th>Time</th><th>Error</th></tr>${probeRows}</table>

		<h2>3. Rebuilt revisions (R2, R3)</h2>
		<p>Rebuilt ${result.rebuilt.length} revision(s) in ${result.rebuildMs} ms · ${result.cachedChars} characters held in memory.</p>
		<p class="meta">Compare the lengths and the diffs below with what Joplin's own note history viewer shows for the same revisions.</p>
		<table><tr><th>#</th><th>ID</th><th>Note updated</th><th>Revision created</th><th>Title chars</th><th>Body chars</th><th>Patch</th><th>Parent = previous</th></tr>${revisionRows}</table>

		<h3>Notes with the most revisions</h3>
		<table><tr><th>Revisions</th><th>Note</th></tr>${result.topNotes.map(n => `<tr><td>${n.count}</td><td>${escapeHtml(n.title)}</td></tr>`).join('')}</table>

		<h2>4. Latest revision vs current note (F1)</h2>
		${latest ? `<p>Title equal: <strong>${yesNo(latest.titleEqual)}</strong> · Body equal: <strong>${yesNo(latest.bodyEqual)}</strong></p>` : '<p>No revisions for this note.</p>'}

		<h2>5. Diffs</h2>
		${result.diffs.length ? result.diffs.map(renderDiff).join('') : '<p>Nothing to compare.</p>'}
	</div>`;
}

// Plain-text summary for pasting into an issue or a chat. No note content.
export function renderSummary(result: VerificationResult, panelWidth: number | null): string {
	const lines: string[] = [];
	lines.push('Note History Diff verification summary');
	lines.push(`joplin: ${result.joplinVersion}`);
	lines.push(`panel width: ${panelWidth === null ? 'unknown' : `${panelWidth}px`}`);
	for (const key of Object.keys(result.settings)) {
		const entry = result.settings[key];
		lines.push(`setting ${key}: ${entry.error ? `error (${entry.error})` : JSON.stringify(entry.value)}`);
	}
	lines.push(`full scan: total=${result.fullScan.totalRevisions} pages=${result.fullScan.pages} ms=${result.fullScan.elapsedMs} note=${result.fullScan.forThisNote}`);
	for (const probe of result.probes) {
		lines.push(`probe "${probe.label}": ${probeVerdict(probe, result.fullScan.forThisNote)} returned=${probe.returned} matching=${probe.matching} ms=${probe.elapsedMs}${probe.error ? ` error=${probe.error}` : ''}`);
	}
	const failed = result.rebuilt.filter(r => !r.ok && !r.skipped).length;
	const skipped = result.rebuilt.filter(r => r.skipped).length;
	const brokenChain = result.rebuilt.filter(r => !r.parentMatchesPrevious).length;
	lines.push(`rebuild: revisions=${result.rebuilt.length} failed=${failed} skipped=${skipped} parentMismatch=${brokenChain} ms=${result.rebuildMs} chars=${result.cachedChars}`);
	lines.push(`note: titleChars=${result.note.titleLength} bodyChars=${result.note.bodyLength}`);
	lines.push(`top revision counts: ${result.topNotes.map(n => n.count).join(', ') || '-'}`);
	if (result.latestVsCurrent) {
		lines.push(`latest vs current: titleEqual=${result.latestVsCurrent.titleEqual} bodyEqual=${result.latestVsCurrent.bodyEqual}`);
	}
	for (const section of result.diffs) {
		const r = section.result;
		lines.push(`diff "${section.label}": +${r.added} -${r.removed} ms=${r.elapsedMs} timedOut=${r.timedOut}`);
	}
	return lines.join('\n');
}

export function renderCompareHtml(result: CompareResult, panelWidthNote: string): string {
	const s = result.synthetic;
	return `
	<div class="nhd">
		${toolbar(true)}
		<p class="meta">Ran at ${formatTime(result.ranAt)} · Joplin ${escapeHtml(result.joplinVersion)} · panel width <span id="nhd-width">${escapeHtml(panelWidthNote)}</span></p>
		<p class="meta">Resize the panel across 600px: the diff switches between side-by-side and unified.</p>

		<h2>1. Test notes</h2>
		<table>
			<tr><th></th><th>Title</th><th>Lines</th><th>Characters</th></tr>
			<tr><td>Before</td><td>${escapeHtml(result.before.title)}</td><td>${result.before.lines}</td><td>${result.before.chars}</td></tr>
			<tr><td>After</td><td>${escapeHtml(result.after.title)}</td><td>${result.after.lines}</td><td>${result.after.chars}</td></tr>
		</table>

		<h2>2. Synthetic history (R3)</h2>
		<p>Built ${s.revisions} revisions in memory from the “before” note (each with a few random edits, stored as JSON patches like Joplin does), then rebuilt the newest one from an empty cache with the product rebuilder (worst case: the whole chain is replayed, checkpoints every 10 revisions).</p>
		<table>
			<tr><td>Make patches</td><td>${s.makeMs} ms</td></tr>
			<tr><td>Rebuild newest revision (full replay)</td><td>${s.rebuildMs} ms</td></tr>
			<tr><td>No rebuild error</td><td>${yesNo(s.allOk)}</td></tr>
			<tr><td>Last rebuilt revision matches</td><td>${yesNo(s.finalMatches)}</td></tr>
			<tr><td>Characters held in the cache (checkpoints)</td><td>${s.heldChars}</td></tr>
		</table>

		<h2>3. Diff: before → after</h2>
		${renderDiff(result.diff)}
	</div>`;
}

export function renderCompareSummary(result: CompareResult, panelWidth: number | null): string {
	const r = result.diff.result;
	const s = result.synthetic;
	return [
		'Note History Diff test-notes summary',
		`joplin: ${result.joplinVersion}`,
		`panel width: ${panelWidth === null ? 'unknown' : `${panelWidth}px`}`,
		`before: lines=${result.before.lines} chars=${result.before.chars}`,
		`after: lines=${result.after.lines} chars=${result.after.chars}`,
		`diff: +${r.added} -${r.removed} ms=${r.elapsedMs} timedOut=${r.timedOut}`,
		`synthetic: revisions=${s.revisions} makeMs=${s.makeMs} rebuildMs=${s.rebuildMs} allOk=${s.allOk} finalMatches=${s.finalMatches} heldChars=${s.heldChars}`,
	].join('\n');
}
