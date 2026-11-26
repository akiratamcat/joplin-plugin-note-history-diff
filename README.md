# Note History Diff

Compare two revisions of a Joplin note and see exactly what changed.

Joplin keeps a history of your notes, but its note history view shows one revision at a time. Note History Diff shows the differences between two revisions, or between a revision and the current note, side by side, in the editor area.

<!-- Screenshot: added before the v1.0.0 release. -->

## Features

- **Compare any two versions**: pick the versions to compare in the **From** and **To** lists. They list every revision of the note (newest first, with its date and length) and the current note.
- **Side by side or unified**: switch between the two layouts; your choice is remembered. Narrow views (under 600px) always use one column.
- **Character highlight**: inside a changed line, the characters that changed are highlighted.
- **Step through the history**: **Older pair** / **Newer pair** compare neighbouring revisions one step at a time.
- **Jump between changes**: **Previous change** / **Next change** scroll to each block of changes. Unchanged lines are folded, keeping three lines of context.
- **Ignore whitespace**: differences in trailing spaces and line endings are ignored by default (a checkbox turns this off).
- **Title changes** are shown above the body.
- **Read only**: the plugin never changes your notes or their history.
- English and Japanese user interface. Dates follow your Joplin date and time formats.

## Usage

1. Open a note.
2. Click the history button in the note toolbar, or choose **Tools > Show note history diff**.
3. The history diff replaces the note editor, like Joplin's own note history view.
   - If you edited the note after its latest revision, the latest revision is compared with the current note.
   - Otherwise, the latest revision is compared with the one before it.
4. Click **Close**, or open another note, to return to the editor.

Joplin's "Toggle editors" button in the note toolbar also switches between the editor and the history diff of the current note.

### Good to know

- Joplin saves a revision only when a note is changed at least 10 minutes (by default) after the previous revision, and keeps revisions for 90 days (by default). The "previous" revision can therefore be older than your last edit. You can change these settings in **Tools > Options > Note History**.
- The history diff works in the main window only. For a note opened in its own window, open it in the main window to see its history.
- When Joplin starts with the history diff left open, the view may flash briefly before the normal editor comes back.

## Requirements

- Joplin desktop 3.7 or later (Windows, macOS, Linux). Mobile is not supported yet.

## Development

```sh
npm install
npm test        # unit tests (Jest)
npm run dist    # builds the plugin archive (.jpl) into publish/
```

See [GENERATOR_DOC.md](GENERATOR_DOC.md) for details on the build tooling.

| Path | Contents |
| --- | --- |
| `src/history/` | Revision index, patch handling, version rebuilding with checkpoints, cache |
| `src/diff/` | Line diff, character diff, whitespace handling |
| `src/core/` | Which versions to compare, version choices, neighbouring pairs |
| `src/ui/` | View rendering, diff views, UI strings (English / Japanese), date formats, webview script and style |
| `src/editorViewController.ts` | Editor view in the editor area, commands, toolbar button, settings |
| `test/` | Unit tests and test fixtures |

The specification ([docs/spec.md](docs/spec.md)) and the verification and test log ([docs/prototype.md](docs/prototype.md)) are written in Japanese.

## License

[MIT](LICENSE). The plugin includes [diff-match-patch](https://github.com/google/diff-match-patch) (Apache License 2.0); see [src/THIRD-PARTY-NOTICES.txt](src/THIRD-PARTY-NOTICES.txt).
