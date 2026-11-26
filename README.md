# Note History Diff

A Joplin plugin to compare two revisions of a note and see what changed.

> Status: in development (v0.4.0). Not published to the plugin repository yet.

## Usage

Open a note, then click the history button in the note toolbar, or choose **Tools > Show note history diff**.

The history diff replaces the note editor, like Joplin's own note history view, and shows what changed:

- If the note was edited after its latest revision: latest revision → current note.
- If not (the latest revision equals the note): previous revision → latest revision.
- Pick other versions to compare in the **From** and **To** lists: every revision (newest first, with its date and length) and the current note.
- Title changes are shown above the body. The view shows side-by-side columns when it is at least 600px wide, and one column when narrower.

Click **Close**, or open another note, to return to the editor. Joplin's "Toggle editors" button also switches between the editor and the history diff of the current note.

Joplin saves a revision only when a note is changed at least 10 minutes (by default) after the previous revision, so the "previous" revision can be older than your last edit.

- Specification (Japanese): [docs/spec.md](docs/spec.md)
- Verification prototype (Japanese): [docs/prototype.md](docs/prototype.md)

## Build

```sh
npm install
npm run dist
```

The plugin archive is written to `publish/`. See [GENERATOR_DOC.md](GENERATOR_DOC.md) for details on the build tooling.

## Test

```sh
npm test
```

Unit tests (Jest) cover the code that does not depend on the Joplin API: `src/history`, `src/diff`, `src/core` and `src/ui`.

## Source layout

| Path | Contents |
| --- | --- |
| `src/history/` | Revision index, patch handling, version rebuilding with checkpoints, cache |
| `src/diff/` | Line diff |
| `src/core/` | Which versions to compare (F1) and the version diff (F5) |
| `src/ui/` | View rendering, diff views, UI strings (English / Japanese), webview script and style |
| `src/editorViewController.ts` | Editor view (shown in the editor area), command, toolbar button and note events |
| `src/dev/` | Verification prototype (to be removed before v1) |
| `test/` | Unit tests and test fixtures |

## License

MIT
