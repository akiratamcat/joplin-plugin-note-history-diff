# Note History Diff

A Joplin plugin to compare two revisions of a note and see what changed.

> Status: early prototype (v0.1.0). Not published to the plugin repository yet.

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

Unit tests (Jest) cover the code that does not depend on the Joplin API: `src/history` (reading, indexing and rebuilding revisions) and `src/diff`.

## Source layout

| Path | Contents |
| --- | --- |
| `src/history/` | Revision index, patch handling, version rebuilding with checkpoints, cache |
| `src/diff/` | Line diff |
| `src/dev/` | Verification prototype (to be removed before v1) |
| `test/` | Unit tests and test fixtures |

## License

MIT
