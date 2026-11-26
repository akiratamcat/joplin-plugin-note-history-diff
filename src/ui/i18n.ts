// UI strings in English and Japanese (spec section 6). The language follows
// Joplin's `locale` setting; anything other than Japanese falls back to English.

export interface Strings {
	locale: string;
	panelTitle: string;
	commandLabel: string;
	mainWindowOnly: string;
	refresh: string;
	close: string;
	loading: string;
	noNote: string;
	noHistory: string;
	historyHint: (intervalMinutes: number, ttlDays: number) => string;
	historyDisabled: string;
	nothingToCompare: string;
	encrypted: string;
	rebuildFailed: (reason: string) => string;
	error: (message: string) => string;
	from: string;
	to: string;
	revision: (time: string) => string;
	currentNote: string;
	latestVsCurrent: string;
	previousVsLatest: string;
	lineStats: (added: number, removed: number) => string;
	title: string;
	bodyUnchanged: string;
	foldedLines: (count: number) => string;
}

const en: Strings = {
	locale: 'en',
	panelTitle: 'Note History Diff',
	commandLabel: 'Show note history diff',
	mainWindowOnly: 'Note History Diff works in the main window only. Open the note in the main window to see its history.',
	refresh: 'Refresh',
	close: 'Close',
	loading: 'Loading note history…',
	noNote: 'Select a note to see its changes.',
	noHistory: 'This note has no history yet.',
	historyHint: (interval, days) =>
		`Joplin saves a revision when the note is changed at least ${interval} minutes after the previous revision, and keeps it for ${days} days.`,
	historyDisabled: 'Note history is turned off. You can turn it on in Tools > Options > Note History.',
	nothingToCompare: 'The only revision is identical to the current note, so there is nothing to compare yet.',
	encrypted: 'A revision is still encrypted, so its content cannot be rebuilt.',
	rebuildFailed: reason => `A revision could not be read (${reason}).`,
	error: message => `Something went wrong: ${message}`,
	from: 'From',
	to: 'To',
	revision: time => `Revision ${time}`,
	currentNote: 'Current note',
	latestVsCurrent: 'Comparing the latest revision with the current note.',
	previousVsLatest: 'The note has not changed since the latest revision, so it is compared with the revision before it.',
	lineStats: (added, removed) => `+${added} / −${removed} lines`,
	title: 'Title',
	bodyUnchanged: 'Body: no changes',
	foldedLines: count => `… ${count} unchanged line${count === 1 ? '' : 's'} …`,
};

const ja: Strings = {
	locale: 'ja',
	panelTitle: 'Note History Diff',
	commandLabel: 'ノート履歴の差分を表示',
	mainWindowOnly: 'Note History Diff はメインウィンドウでだけ使えます。履歴を見るには、ノートをメインウィンドウで開いてください。',
	refresh: '更新',
	close: '閉じる',
	loading: 'ノートの履歴を読み込んでいます…',
	noNote: 'ノートを選ぶと、変更点を表示します。',
	noHistory: 'このノートには履歴がありません。',
	historyHint: (interval, days) =>
		`履歴（版）は、前の版から ${interval} 分以上たってノートが保存されたときに作られ、${days} 日間保存されます。`,
	historyDisabled: 'ノート履歴の機能が無効になっています。「ツール」→「オプション」→「ノート履歴」で有効にできます。',
	nothingToCompare: '版は 1 件だけで、今のノートと同じ内容です。まだ比べるものがありません。',
	encrypted: '暗号化されたままの版があるため、内容を組み立てられません。',
	rebuildFailed: reason => `版を読み込めませんでした（${reason}）。`,
	error: message => `エラーが発生しました：${message}`,
	from: '比較元',
	to: '比較先',
	revision: time => `版 ${time}`,
	currentNote: '現在のノート',
	latestVsCurrent: '最新の版と現在のノートを比べています。',
	previousVsLatest: '最新の版から変更がないため、その 1 つ前の版と比べています。',
	lineStats: (added, removed) => `+${added} / −${removed} 行`,
	title: 'タイトル',
	bodyUnchanged: '本文は変更なし',
	foldedLines: count => `… 変更のない ${count} 行 …`,
};

export function stringsFor(locale: string | null | undefined): Strings {
	return locale && locale.toLowerCase().startsWith('ja') ? ja : en;
}
