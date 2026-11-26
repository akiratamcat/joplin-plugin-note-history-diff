# Changelog

[日本語](CHANGELOG.ja.md)

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

Changes that users notice are always listed. The Japanese version
(`CHANGELOG.ja.md`) has the same content.

## [Unreleased]

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

[Unreleased]: https://github.com/akiratamcat/joplin-plugin-note-history-diff/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/akiratamcat/joplin-plugin-note-history-diff/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/akiratamcat/joplin-plugin-note-history-diff/releases/tag/v1.0.0
