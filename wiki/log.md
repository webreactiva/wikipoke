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

## 2026-09-12 · wikipoke-ingest (reconcile)

Reconciled against `19b233f`, the commit that fixed what this wiki's own seeding pass ran into.
13 pages were stale; each was rewritten from its own diff, and the rest were left alone.

- `components/lib.md`: new sections on the two-pass ignore matching (`ignoreRules`,
  `indexablePaths`, `ignoredFiles`) and on `codeCitations`.
- `components/checks.md`: coverage now reports what the ignore list hid; lint now re-reads
  `path:line` citations. Both are warnings, so the silence contract the hooks depend on is intact.
- `concepts/coverage-as-debt.md`: the ignore list was the one way coverage could be gamed silently;
  the count closes it.
- `flows/ingest-pass.md`: tailoring `.wikipokeignore` is now explicitly two-directional.
- Citations across ten pages were re-anchored: the change shifted `lib/lib.mjs` by up to 57 lines.
  Five of those were wrong from the seed pass — line numbers read out of a concatenated listing of
  two files — which is what prompted the new check.
