# Log

## 2026-09-12 · wikipoke-ingest (seed)

- Seeded from `68c8fa3`, the repository's only commit: 19 pages — the map, three flows, six
  component pages, six concepts and three decisions.
- Tailored `.wikipokeignore`: dropped the generic `*.md` (in this repository the Markdown under
  `templates/` **is** the product — the skills and the schema) and kept `README.md`, `AGENTS.md`,
  `CHANGELOG.md` out by name. Ignored `test/**`: the tests verify the CLI, they do not explain it.
- Deferred to later passes: `test/wikipoke.test.mjs` (ignored on purpose, a page on what the tests
  pin down would still be worth writing), and `package.json`, which stays uncovered because no page
  earns it on its own.
- `decisions/cli-read-only.md` is `confidence: inferred`: the 0.1 design it compares against is
  described in the README but its code and history were squashed away.
