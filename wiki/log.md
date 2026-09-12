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

## 2026-09-12 · wikipoke-ingest

The CLI moved from `.mjs` to TypeScript (`df4db0e`), so every page that named a source under
`bin/` or `lib/` had a dead one. Reconciled all fifteen against the new tree and re-stamped them.

- new: decisions/typescript-two-ways.md — the sources run from `src/` in development (Node strips
  the types) but ship compiled from `dist/`, because Node refuses to strip types under
  `node_modules/`. Also records the executable bit `tsc` drops and the build now restores.
- architecture.md, components/cli.md, components/checks.md: the CLI's `CHECKS` object gave way to a
  tagged union, because indexing it by name erased which result came back. Recorded as a change
  with its SHA rather than an overwrite: the uniform `run`/`report` contract did not change.
- components/lib.md: `src/lib/lib.ts` now exports the shared types too, and `asList()` replaces the
  `[].concat(x ?? [])` idiom. Noted the tension with the schema-lives-in-the-wiki rule: the types
  describe the parser's output, not the page contract.
- components/install.md: why the sources had to move under `src/` rather than be renamed in place —
  `src/lib/` and `dist/lib/` must sit at the same depth for the one `templates/` URL to resolve.
- components/hooks.md: new section on which hooks survive a clone. Only `git` cannot: it lives in
  `.git/`. Written after this repository turned out to have no notifier installed at all, so its
  own drift went unreported until someone ran `check` by hand.
- Not done: `templates/wikipokeignore` is still uncovered, as it was before this pass.

## 2026-09-12 · wikipoke-ingest

`08177b5` changed what `init` writes and what it says when nobody is at the terminal. Nine pages
stale; reconciled and re-stamped. Twelve `path:line` citations had also rotted from the line shifts
in `df4db0e` and `08177b5` — none of them caught by `lint`, since the lines still exist and are not
blank. Re-pointed all forty-seven after checking each against the line it now lands on.

- concepts/file-ownership.md: new section. Ownership decides whether wikipoke may rewrite a file;
  a second rule decides whether it may add one at all, and it turns on whether the file acts on its
  own. Skills do not, so both homes are written unasked; hooks do, so none is. This is the page the
  rest now point at for that question.
- components/cli.md: `init`'s no-TTY branch used to print one line and leave. Recorded what that
  cost here — three commits with no notifier — and that the invitation is addressed to the agent
  because the CLI cannot see which agent is running it.
- components/skills.md, components/install.md, flows/install.md: the skills go to `.agents/skills/`
  and `.claude/skills/` both, always. Detection was tried and cannot work.
- flows/install.md: the `claude` detection sign had become self-fulfilling once `init` started
  writing `.claude/skills` — a bare `.claude/` proved only that wikipoke had run.
- components/skills.md also still said `lib/`, which `df4db0e` removed. Its sources are templates
  that did not change, so drift never flagged it: a page can rot on code it does not claim.
- Not done: `templates/wikipokeignore` is still uncovered, unchanged from the last two passes.

## 2026-09-12 · wikipoke-ingest
- coverage-as-debt.md: claims templates/wikipokeignore now, with what the default list hides and how a `!` line brings a subtree back
- typescript-two-ways.md: package.json citations moved with the publish metadata; `npm run link` builds before it links
- cli-read-only.md: re-read against the README install change, which did not touch what the page claims
- ignored LICENSE: a licence is not code
