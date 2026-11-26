# Note History Diff への協力

[English](CONTRIBUTING.md)

関心を持っていただき、ありがとうございます。不具合の報告、アイデア、翻訳、プルリクエストを歓迎します。

## はじめに

- 不具合や要望は、まず [Issue](https://github.com/akiratamcat/joplin-plugin-note-history-diff/issues) を作ってください。日本語でも英語でもかまいません。
- セキュリティの問題は、公開の Issue に書かないでください。[SECURITY.ja.md](SECURITY.ja.md) を見てください。
- `docs/` の文書は日本語だけで書いています。
  - [docs/spec.md](docs/spec.md)：仕様書（機能、画面、設計、公開の条件）
  - [docs/prototype.md](docs/prototype.md)：検証とテストの記録（Joplin で確かめた各版の結果）

## ビルドとテスト

必要なもの：Node.js 18 以降と npm。

```sh
npm install
npm test        # README.md を確かめてから、単体テスト（Jest）を実行する
npm run dist    # プラグインのファイル（.jpl）を publish/ に作る
```

`publish/io.github.akiratamcat.note-history-diff.jpl` を、Joplin のプラグインの画面の「ファイルからインストール」で入れます。ビルドの仕組みの詳細は [GENERATOR_DOC.md](GENERATOR_DOC.md) を見てください。

単体テストは、Joplin の API を使わない部分を確かめます。Joplin の中での動き（開く、閉じる、ノートの切り替え）は手で確かめており、確かめた項目と結果は [docs/prototype.md](docs/prototype.md) にあります。

## ソースの構成

| パス | 内容 |
| --- | --- |
| `src/history/` | 版の索引、差分の適用、チェックポイントを使った版の組み立て、キャッシュ |
| `src/diff/` | 行単位の差分、文字単位の差分、空白の扱い |
| `src/core/` | 比べる版の決め方、版の一覧、隣り合う版の組 |
| `src/ui/` | 画面の描画、差分の表示、画面の文言（英語・日本語）、日時の形式、webview のスクリプトとスタイル |
| `src/editorViewController.ts` | エディタの場所に表示するビュー、コマンド、ツールバーのボタン、設定 |
| `test/` | 単体テストとテスト用のファイル |
| `scripts/` | `readme.mjs`（README.md の日本語部分を作る）、`make-test-notes.mjs`（テスト用のファイルを作る） |

## 英語と日本語の文書

利用者向けの文書は、同じ内容の英語版と日本語版を置いています：`README.md` / `README.ja.md`、`CHANGELOG.md` / `CHANGELOG.ja.md`、`CONTRIBUTING.md` / `CONTRIBUTING.ja.md`、`SECURITY.md` / `SECURITY.ja.md`、`THIRD_PARTY_NOTICES.md` / `THIRD_PARTY_NOTICES.ja.md`。

`README.md` の日本語部分は `README.ja.md` から作ります。`README.ja.md` を直してから `npm run readme` を実行してください。`README.md` が古いままだと `npm test` が失敗します。

画面の文言は `src/ui/i18n.ts`（英語と日本語）にあります。

## プルリクエスト

- 1 つのプルリクエストには 1 つの変更だけを入れ、何をなぜ変えるのかを書いてください。
- 作る前に `npm test` と `npm run dist` を実行してください。
- 利用者が気づく変更は、`CHANGELOG.md` と `CHANGELOG.ja.md` の両方の「Unreleased」に書いてください。
- プラグインは読み取り専用のままにしてください。ノートとその履歴を書き換えてはいけません。
