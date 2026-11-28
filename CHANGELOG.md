# Changelog

[日本語](CHANGELOG.ja.md)

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

Changes that users notice are always listed. The Japanese version
(`CHANGELOG.ja.md`) has the same content.

## [Unreleased]

### Added

- Settings in Tools > Options > Note History Diff: font size of the diff (follows the editor font size by default), unchanged lines kept around each change (or no folding), character highlight, layout when the history diff opens (last used, side by side or unified), wrapping of long lines, and ignoring trailing spaces and line endings. A changed setting applies to the history diff on screen at once.
- A right-click menu with "Copy" in the history diff, since Joplin's editor view shows none ([#3](https://github.com/akiratamcat/joplin-plugin-note-history-diff/issues/3)).

### Changed

- The diff uses the editor monospace font (Options > Editor).
- The rest of the history diff (buttons, version lists) uses the same text size as Joplin's own interface; it was slightly smaller.

## [1.0.2] - 2026-11-28

### Fixed

- Some notes could not be compared and showed "A revision could not be read (patch-not-applied)." even though Joplin's own history viewer could open them. Revisions are now rebuilt the way Joplin rebuilds them: each change is applied to the revision it was recorded against, not to the one just before it by date. When part of a stored change no longer fits its text, the rest of the change is still used, as in Joplin. The comparison then opens, but it can miss that part of the change. A warning with the revision ID, and no note text, is written to the plugin console. ([#2](https://github.com/akiratamcat/joplin-plugin-note-history-diff/issues/2), [#4](https://github.com/akiratamcat/joplin-plugin-note-history-diff/pull/4) by [@bwat47](https://github.com/bwat47))
- If the recorded links between revisions form a loop, the comparison shows "A revision could not be read (invalid-chain)." ([#4](https://github.com/akiratamcat/joplin-plugin-note-history-diff/pull/4) by [@bwat47](https://github.com/bwat47))
- A revision that cannot be read no longer hides the length of later revisions that do not depend on it in the version list. ([#4](https://github.com/akiratamcat/joplin-plugin-note-history-diff/pull/4) by [@bwat47](https://github.com/bwat47))

## [1.0.1] - 2026-11-26

### Fixed

- Copying a selection in the side-by-side view copied text from both versions, which looked like the right side's text. Now only the side where the selection was made can be selected and is copied, without line numbers, missing lines or folded lines ([#1](https://github.com/akiratamcat/joplin-plugin-note-history-diff/issues/1)).
- An empty line was copied as a non-breaking space.

## [1.0.0] - 2026-11-26

First release.

### Added

- Shows the differences between two versions of a note in the editor area, like Joplin's own note history view. Opened from the note toolbar button, **Tools > Show note history diff**, or Joplin's "Toggle editors" button.
- Compares the latest revision with the current note, or the latest revision with the one before it when the note has not changed since.
- **From** and **To** lists to compare any two versions: every revision (newest first, with its date and length) and the current note.
- **Older pair** / **Newer pair** buttons to step through neighbouring revisions.
- **Previous change** / **Next change** buttons to jump between blocks of changes. Unchanged lines are folded, keeping three lines of context.
- Side-by-side and unified layouts; the choice is remembered. Narrow views (under 600px) use one column.
- Highlight of the changed characters inside a changed line, and a separate diff of the title.
- Option to ignore trailing spaces and line ending differences (on by default).
- Colours for the light and dark themes. Dates follow Joplin's date and time formats.
- User interface in 11 languages, translated with gettext: English, Japanese, Chinese (Simplified and Traditional), Korean, German, French, Spanish, Italian, Portuguese (Brazil) and Russian.

[Unreleased]: https://github.com/akiratamcat/joplin-plugin-note-history-diff/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/akiratamcat/joplin-plugin-note-history-diff/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/akiratamcat/joplin-plugin-note-history-diff/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/akiratamcat/joplin-plugin-note-history-diff/releases/tag/v1.0.0
