# Security policy

[日本語](SECURITY.ja.md)

## Reporting a vulnerability

Please do not report security problems in public issues.

Use GitHub's private vulnerability reporting instead:
open the repository's **Security** tab and choose **Report a vulnerability**
(<https://github.com/akiratamcat/joplin-plugin-note-history-diff/security/advisories/new>).

Please include:

- the version of Note History Diff and of Joplin, and your operating system,
- the steps or a note that shows the problem, and
- what happens and what you expected.

The report is visible only to you and the maintainer. You will get an answer on GitHub. English or Japanese is fine.

## Scope

The plugin only reads notes and their revisions through Joplin's plugin API, and shows the differences in the editor area. It makes no network requests and never changes notes or their history.

Examples of problems we want to hear about:

- note content that runs script in the history view,
- the plugin changing a note or its history,
- the plugin making a network request,
- a note that makes Joplin stop responding when its history is shown.

Problems in Joplin itself should be reported to the [Joplin project](https://github.com/laurent22/joplin/security).

## Supported versions

Only the latest released version receives security fixes.
