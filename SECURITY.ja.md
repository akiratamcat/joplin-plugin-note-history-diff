# セキュリティについて

[English](SECURITY.md)

## 脆弱性の報告

セキュリティの問題は、公開の Issue に書かないでください。

代わりに、GitHub の非公開の脆弱性報告を使ってください。
リポジトリの **Security** タブを開き、**Report a vulnerability** を選びます
（<https://github.com/akiratamcat/joplin-plugin-note-history-diff/security/advisories/new>）。

次の内容を書いてください。

- Note History Diff と Joplin の版、OS
- 問題が起きる手順やノート
- 何が起きて、本来はどうなるはずか

報告は、あなたと作者だけが見られます。回答は GitHub で行います。日本語でも英語でもかまいません。

## 対象

本プラグインは、Joplin のプラグイン API でノートとその版を読み、違いをエディタの場所に表示するだけです。ネットワーク通信は行わず、ノートとその履歴を書き換えることもありません。

知らせてほしい問題の例：

- 履歴の画面で、ノートの内容がスクリプトとして動いてしまう
- プラグインがノートやその履歴を書き換えてしまう
- プラグインがネットワーク通信を行う
- 履歴を表示すると Joplin が応答しなくなるノートがある

Joplin 本体の問題は、[Joplin プロジェクト](https://github.com/laurent22/joplin/security)に報告してください。

## 対象の版

セキュリティの修正を行うのは、最新の公開版だけです。
