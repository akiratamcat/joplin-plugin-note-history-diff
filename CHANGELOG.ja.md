# 変更履歴

[English](CHANGELOG.md)

本プロジェクトの主な変更をこのファイルに記録します。
形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に基づき、
版数は [セマンティック バージョニング](https://semver.org/lang/ja/) に従います。

利用者が気づく変更は必ず載せます。英語版（`CHANGELOG.md`）と同じ内容を載せます。

## [Unreleased]

## [1.1.0] - 2026-11-28

### 追加

- 「ツール」→「オプション」→「Note History Diff」の設定：差分の文字の大きさ（初期値はエディターのフォントサイズに合わせる）、変更の前後に残す行数（または折りたたまない）、文字単位の強調、履歴の差分を開いたときの表示方式（前回の方式・横並び・1 列）、長い行の折り返し、行末の空白と改行コードの違いを無視。設定を変えると、表示中の履歴の差分にもすぐ反映される。
- Joplin のエディタビューには右クリックのメニューが出ないため、履歴の差分に「コピー」のある右クリックのメニューを付けた（[#3](https://github.com/akiratamcat/joplin-plugin-note-history-diff/issues/3)）。

### 変更

- 差分の書体に、エディターの等幅フォント（オプションの「エディター」）を使うようにした。
- 差分以外の部分（ボタン、版の一覧など）の文字を、Joplin 本体の画面と同じ大きさにした（少し小さかった）。

### 修正

- 横並びの表示で、文字を選んだまま反対側の列を押すと、前の選択の隣のセルが選ばれた表示になっていた。

## [1.0.2] - 2026-11-28

### 修正

- Joplin 本体の履歴画面では開けるのに、比較しようとすると「A revision could not be read (patch-not-applied).」と表示されるノートがあった。版の組み立て方を Joplin 本体に合わせ、各版の差分を、日付でひとつ前の版ではなく、その差分が記録されたもとの版に当てるようにした。保存されている差分の一部が文字に合わないときも、Joplin 本体と同じように残りの差分を当てて続ける。比較は開くが、合わなかった部分の変更は抜けることがある。このときプラグインのコンソールに、版の ID を含む警告を出す（ノートの文字は含まない）。（[#2](https://github.com/akiratamcat/joplin-plugin-note-history-diff/issues/2)、[#4](https://github.com/akiratamcat/joplin-plugin-note-history-diff/pull/4) by [@bwat47](https://github.com/bwat47)）
- 記録されている版どうしのつながりが輪になっているときは、「A revision could not be read (invalid-chain).」と表示する。（[#4](https://github.com/akiratamcat/joplin-plugin-note-history-diff/pull/4) by [@bwat47](https://github.com/bwat47)）
- 読めない版があっても、その版に頼らない後の版の文字数は、版の一覧に表示されるようにした。（[#4](https://github.com/akiratamcat/joplin-plugin-note-history-diff/pull/4) by [@bwat47](https://github.com/bwat47)）

## [1.0.1] - 2026-11-26

### 修正

- 横並びの表示で範囲選択してコピーすると、比較元と比較先の両方の文字が混ざってコピーされ、右（比較先）の内容に見えていた。範囲選択を始めた側だけが選べるようにし、その側の文字だけを、行番号、行がない側の空き、折りたたんだ行を除いてコピーするようにした（[#1](https://github.com/akiratamcat/joplin-plugin-note-history-diff/issues/1)）。
- 空の行が、改行しない空白（U+00A0）としてコピーされていた。

## [1.0.0] - 2026-11-26

最初の公開版です。

### 追加

- Joplin 本体の「ノートの履歴」と同じように、エディタの場所にノートの 2 つの版の違いを表示する。ノートのツールバーのボタン、「ツール」→「ノート履歴の差分を表示」、Joplin の「エディタの切り替え」ボタンで開く。
- 最新の版と現在のノートを比べる。最新の版から変更がないときは、最新の版とその 1 つ前の版を比べる。
- 「比較元」「比較先」の一覧で、好きな 2 つの版を比べる。一覧には、すべての版（新しい順、日時と文字数つき）と現在のノートが並ぶ。
- 「前の版ペア」「次の版ペア」ボタンで、隣り合う版どうしの比較をたどる。
- 「前の変更」「次の変更」ボタンで、変更のかたまりへ移動する。変更のない行は、前後 3 行を残して折りたたむ。
- 横並びと 1 列の表示。選んだ方式を覚える。表示の幅が 600 px 未満のときは 1 列で表示する。
- 変わった行の中で、変わった文字を強調する。タイトルの差分も別に表示する。
- 行末の空白と改行コードの違いを無視する設定（初期値は有効）。
- 明るいテーマと暗いテーマに合わせた色。日時は Joplin の「日付の形式」「時刻の形式」に従う。
- 11 言語の画面（gettext で翻訳）：英語、日本語、中国語（簡体字・繁体字）、韓国語、ドイツ語、フランス語、スペイン語、イタリア語、ポルトガル語（ブラジル）、ロシア語。

[Unreleased]: https://github.com/akiratamcat/joplin-plugin-note-history-diff/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/akiratamcat/joplin-plugin-note-history-diff/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/akiratamcat/joplin-plugin-note-history-diff/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/akiratamcat/joplin-plugin-note-history-diff/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/akiratamcat/joplin-plugin-note-history-diff/releases/tag/v1.0.0
