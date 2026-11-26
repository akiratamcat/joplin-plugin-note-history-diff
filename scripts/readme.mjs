// SPDX-License-Identifier: MIT
// npm run readme: copies README.ja.md into the Japanese half of README.md.
// GitHub shows only README.md on the repository page, so README.md has the
// English text first and the Japanese text after it. README.ja.md stays the
// file to edit; the part of README.md between the ja:start and ja:end markers
// is generated from it (title and language link left out, headings one level
// down). npm run readme:check (run by npm run test:unit) fails when README.md
// is out of date.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const README = path.join(ROOT, 'README.md');
const README_JA = path.join(ROOT, 'README.ja.md');
const START = '<!-- ja:start -->';
const END = '<!-- ja:end -->';

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/** README.ja.md as the Japanese half: no title, no link to the English README, headings one level down. */
export function japaneseSection(ja) {
	const out = [];
	let fence = null;
	for (const [i, line] of ja.split('\n').entries()) {
		const f = /^(`{3,}|~{3,})/.exec(line);
		if (fence) {
			if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null;
		} else if (f) {
			fence = f[1];
		} else {
			if (i === 0 && line.startsWith('# ')) continue;
			if (/^\[English README\]\(README\.md\)$/.test(line.trim())) continue;
			if (/^#{1,5} /.test(line)) {
				out.push(`#${line}`);
				continue;
			}
		}
		out.push(line);
	}
	return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function buildReadme() {
	const en = read(README);
	const start = en.indexOf(START);
	const end = en.indexOf(END);
	if (start < 0 || end < start) throw new Error(`README.md needs the markers ${START} and ${END}`);
	return `${en.slice(0, start + START.length)}\n\n${japaneseSection(read(README_JA))}\n\n${en.slice(end)}`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const built = buildReadme();
	if (process.argv.includes('--check')) {
		if (read(README) !== built) {
			console.error('README.md is out of date: run npm run readme');
			process.exit(1);
		}
		console.log('readme check: OK');
	} else {
		fs.writeFileSync(README, built, 'utf8');
		console.log('README.md written');
	}
}
