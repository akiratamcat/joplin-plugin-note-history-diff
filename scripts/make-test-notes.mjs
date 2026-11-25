// Generates a pair of large Markdown notes for testing the diff view:
//   NHD-test-before.md / NHD-test-after.md
// Import both into Joplin (File > Import > MD - Markdown (File)) and run
// "Note History Diff: compare test notes".
//
// Usage: node scripts/make-test-notes.mjs [--sections 150] [--out test/fixtures]
// The output is deterministic: the same options always give the same files.

import fs from 'node:fs';
import path from 'node:path';

function option(name, fallback) {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const sections = Number(option('sections', '150'));
const outDir = option('out', path.join('test', 'fixtures'));

const topics = ['設計', 'テスト', 'リリース', 'ドキュメント', 'レビュー', '移行', '性能', 'セキュリティ'];
const owners = ['Alice', 'Bob', 'Carol', 'Dave', '佐藤', '鈴木', '高橋', '田中'];

function pad(text, width) {
	// Pads by character count (approximate for CJK, which is what real notes look like).
	return text + ' '.repeat(Math.max(0, width - text.length));
}

function table(rows, aligned) {
	const header = ['項目', '担当', '状態', '期限'];
	const all = [header, ...rows];
	const widths = header.map((_, c) => Math.max(...all.map(r => r[c].length)));
	const line = r => aligned ? `| ${r.map((cell, c) => pad(cell, widths[c])).join(' | ')} |` : `| ${r.join(' | ')} |`;
	const sep = aligned ? `| ${widths.map(w => '-'.repeat(w)).join(' | ')} |` : `| ${header.map(() => '---').join(' | ')} |`;
	return [line(header), sep, ...rows.map(line)];
}

function section(i, version) {
	const after = version === 'after';
	const topic = topics[i % topics.length];
	const lines = [];

	lines.push(`## ${i}. ${topic}のメモ`);
	lines.push('');

	let paragraph = `セクション ${i} では${topic}について検討する。This paragraph mixes Japanese and English text so that the diff has to handle both. 期限は 2026-12-${String((i % 28) + 1).padStart(2, '0')} とする。`;
	if (after && i % 10 === 1) paragraph = paragraph.replace('検討する', '詳しく検討し、結論を出す');
	lines.push(paragraph);
	lines.push('');

	const bullets = [
		`- ${topic}の範囲を決める`,
		`- 関係者（${owners[i % owners.length]}、${owners[(i + 3) % owners.length]}）に確認する`,
		`- 前回の結果を見直す`,
		`- 課題を一覧にする`,
		`- 次回の予定を決める`,
	];
	if (after && i % 10 === 3) bullets.splice(2, 0, `- 追加：${topic}の手順書を更新する`);
	if (after && i % 10 === 5) bullets.splice(3, 1);
	// Whitespace-only change (trailing spaces), useful for F9.
	if (after && i % 10 === 9) bullets[0] = `${bullets[0]}   `;
	lines.push(...bullets);
	lines.push('');

	const rows = [
		[`${topic} A`, owners[i % owners.length], '未着手', `12/${(i % 28) + 1}`],
		[`${topic} B`, owners[(i + 1) % owners.length], '進行中', `12/${((i + 5) % 28) + 1}`],
		[`${topic} C`, owners[(i + 2) % owners.length], '完了', `12/${((i + 9) % 28) + 1}`],
	];
	// i % 10 === 7: the table is only re-formatted (column widths aligned).
	lines.push(...table(rows, after && i % 10 === 7));
	lines.push('');

	if (i % 5 === 0) {
		lines.push('```js');
		lines.push(`function section${i}(value) {`);
		lines.push(after && i % 20 === 0 ? `\treturn value * ${i} + 1;` : `\treturn value * ${i};`);
		lines.push('}');
		lines.push('```');
		lines.push('');
	}

	if (i % 7 === 0) {
		// A long line, to check wrapping in narrow panels.
		lines.push(`長い行：${'この行はパネルの幅を確かめるために、とても長くしてあります。'.repeat(6)}${after ? '（末尾を変更）' : ''}`);
		lines.push('');
	}

	if (after && i % 25 === 0) {
		lines.push(`> 追加の段落：セクション ${i} の振り返り。New paragraph added in the "after" version.`);
		lines.push('');
	}

	return lines;
}

function build(version) {
	const lines = [`# Note History Diff test (${version})`, ''];
	for (let i = 1; i <= sections; i++) {
		// i % 40 === 0: the whole section is removed in the "after" version.
		if (version === 'after' && i % 40 === 0) continue;
		lines.push(...section(i, version));
	}
	return lines.join('\n');
}

fs.mkdirSync(outDir, { recursive: true });
for (const version of ['before', 'after']) {
	const file = path.join(outDir, `NHD-test-${version}.md`);
	const text = build(version);
	fs.writeFileSync(file, text);
	console.log(`${file}: ${text.split('\n').length} lines, ${text.length} chars`);
}
