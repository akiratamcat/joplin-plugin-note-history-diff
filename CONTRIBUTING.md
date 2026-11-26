# Contributing to Note History Diff

[日本語](CONTRIBUTING.ja.md)

Thank you for your interest. Bug reports, ideas, translations and pull requests are welcome.

## Before you start

- For bugs and requests, please open an [issue](https://github.com/akiratamcat/joplin-plugin-note-history-diff/issues) first. English or Japanese is fine.
- For security problems, do not open a public issue. See [SECURITY.md](SECURITY.md).
- The documents in `docs/` are written only in Japanese:
  - [docs/spec.md](docs/spec.md): the specification (features, screens, design, release conditions).
  - [docs/prototype.md](docs/prototype.md): the verification and test log, with the results of each version tested in Joplin.

## Build and test

Requirements: Node.js 18 or later and npm.

```sh
npm install
npm test        # checks README.md, then runs the unit tests (Jest)
npm run dist    # builds the plugin archive (.jpl) into publish/
```

Install `publish/io.github.akiratamcat.note-history-diff.jpl` with "Install from file" on Joplin's plugin screen. See [GENERATOR_DOC.md](GENERATOR_DOC.md) for details on the build tooling.

The unit tests cover the code that does not depend on the Joplin API. How the view behaves inside Joplin (opening, closing, switching notes) is tested by hand; the checks and their results are in [docs/prototype.md](docs/prototype.md).

## Source layout

| Path | Contents |
| --- | --- |
| `src/history/` | Revision index, patch handling, version rebuilding with checkpoints, cache |
| `src/diff/` | Line diff, character diff, whitespace handling |
| `src/core/` | Which versions to compare, version choices, neighbouring pairs |
| `src/ui/` | View rendering, diff views, UI strings (gettext), date formats, webview script and style |
| `src/editorViewController.ts` | Editor view in the editor area, commands, toolbar button, settings |
| `test/` | Unit tests and test fixtures |
| `src/i18n/` | gettext implementation (`gettext.ts`) and the compiled catalogs |
| `locales/` | Translations (`.po`) and the template (`.pot`) |
| `scripts/` | `readme.mjs` (builds the Japanese half of README.md), `i18n-*.mjs` (translations), `make-test-notes.mjs` (builds the test fixtures) |

## Documents in two languages

User-facing documents have an English and a Japanese version with the same content: `README.md` / `README.ja.md`, `CHANGELOG.md` / `CHANGELOG.ja.md`, `CONTRIBUTING.md` / `CONTRIBUTING.ja.md`, `SECURITY.md` / `SECURITY.ja.md`, `THIRD_PARTY_NOTICES.md` / `THIRD_PARTY_NOTICES.ja.md`.

The Japanese half of `README.md` is generated from `README.ja.md`: edit `README.ja.md`, then run `npm run readme`. `npm test` fails when `README.md` is out of date.

## Translations

The user interface is translated with gettext. The English texts are in the source (`src/ui/i18n.ts`, as `t._('...')` and `t.ngettext(...)`), and the translations are in `locales/<locale>.po`, compiled into `src/i18n/catalog/catalogs.json` at build time (not committed).

- `npm run i18n:extract`: updates `locales/note-history-diff.pot` and every `.po` file from the source. Existing translations are kept.
- `npm run i18n:compile`: builds the catalogs (run by `npm test` and `npm run dist`).
- `npm run i18n:check`: fails on missing or extra entries, wrong plural forms, or placeholders such as `{count}` that differ from the English text (run by `npm test`).

To fix or add a translation, edit the `.po` file with any PO editor or a text editor. Untranslated texts are shown in English. To add a language, add it to `scripts/i18n-common.mjs` and `src/i18n/gettext.ts`, then run `npm run i18n:extract`.

## Pull requests

- Keep each pull request to one change, and describe what it changes and why.
- Run `npm test` and `npm run dist` before opening it.
- If the change is visible to users, add it to both `CHANGELOG.md` and `CHANGELOG.ja.md` under "Unreleased".
- The plugin must stay read only: it must never change notes or their history.
