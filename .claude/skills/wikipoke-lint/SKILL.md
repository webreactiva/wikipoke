---
name: wikipoke-lint
description: "Check the wiki's health and report what to fix. By default runs the deterministic checks (integrity, staleness, coverage) and explains each finding. With --deep, also reads the pages as a body of text to catch what no script can: contradictions, expired claims, concepts with no page, pages that only restate signatures, undocumented subsystems, missing flows and decisions, wrong confidence. Proposes; fixes nothing without a yes. Use when: (1) the user invokes /wikipoke-lint, (2) the user says 'review the wiki', 'check the wiki', 'is the wiki still right?', (3) every few weeks."
argument-hint: "[--deep] [--fix-trivial] [--path=<glob>]"
---
<!-- managed by wikipoke: `wikipoke init` rewrites this file. Project rules go in wiki/CONVENTIONS.md. -->

# wikipoke-lint: is the wiki sound, and is it still true?

Two layers under one verb. The first is a machine; the second is a reading.

```
     wikipoke check        ← deterministic: git only, no model, no judgement
 integrity · staleness · coverage
          │
          ├── default ──► explain the findings · propose fixes
          │
          └── --deep  ──► read the pages themselves, seven lenses:
                          contradiction · expired · orphan concept
                          density · gap · missing kind · confidence
                                   │
                                   ▼
                      prioritized findings + a proposed fix each
```

**Read `wiki/CONVENTIONS.md`**: the schema, the writing rules and the `confidence:`
contract live there. `wikipoke` is `node_modules/.bin/wikipoke` when the project
depends on it, `wikipoke` when it is installed globally.

It **proposes; it does not rewrite.** Reconciling with the code is
`wikipoke-ingest`'s job; this pass finds what needs reconciling.

## Default pass

1. Run `wikipoke check` (add `--json` to consume it, `-v` for file by file).
   Everything it reports is already decided: **list it, don't re-derive it**.
2. Explain each finding in plain terms: what it means, why it matters, the fix.
   Keep the two scales apart: **errors** are a broken wiki; **staleness and
   coverage are debt**, not breakage.
3. Watch for the two false greens the machine cannot judge on its own. **An
   over-broad `sources:`** makes coverage read green for code nobody wrote up: read
   those warnings and the coverage total together, and report the total as false while
   they stand, even when the log already calls them known debt. **An ignore list nobody has
   reviewed** does the same, more quietly — `wikipoke check coverage -v` ends with
   how many files `.wikipokeignore` took out; when that number is large, or the
   repository's product is prose the generic `*.md` line swallowed, say so and
   propose the `!` lines that bring it back.

## `--deep` pass

Also read the wiki **as a body of text**: the pages, not the code. Scope it with
`--path` on a large wiki and say what you skipped. Seven lenses:

- **Contradiction**: two pages asserting incompatible things. Name both, and which
  one the code supports.
- **Expired claim**: true once, not now. Verify against the code before calling it,
  and cite `path:line`. Open the citations the pages already carry, too: `check`
  knows a cited line exists, not that it still says what the sentence claims.
- **Orphan concept**: a term used across pages with no page of its own.
- **Density**: a page that only restates signatures, parameters or exports. It
  breaks "the wiki holds what the code cannot say". Also flag pages longer than two
  screens.
- **Gap**: a subsystem nobody explains, or an obvious question with no answer.
  Cross-check coverage, including the false green above.
- **Missing kind**: coverage only asks for module pages, so count the pages by `type:`
  and look for what it cannot see. Fewer flows than one per three module pages, or no
  decision once the wiki has a dozen pages, is the usual sign. An entry point (a route,
  a command, a job, a webhook) whose sequence no `flow` page follows. A "why", an
  "instead of" or a fix that changed the design, buried in an `entity` page or only in
  `git log`, with no `decision` page. A `concept` that is only a folder left over
  (tests, config, tooling). Propose each as a command: `wikipoke-ingest "<the flow or
  decision>"`.
- **Confidence**: `high` on a claim you cannot find in the code, or `inferred` on
  something now confirmed.

## Output

4. **A prioritized list.** One line per finding: what, where, why it matters, and
   the proposed fix. Order by how much damage it does to a reader who trusts the
   page. Say plainly when a finding is a judgement call.
5. **Fix nothing without a yes**, except trivia (a broken link, a missing `index.md`
   line, an obviously wrong `type:`), and only with `--fix-trivial`. List those
   apart from the proposals.
6. **Log a `--deep` pass** in `wiki/log.md`:
   ```
   ## <date> · wikipoke-lint --deep
   - N findings (M critical) · <one line on the state of the wiki>
   ```
   Do **not** touch `.wikipoke-state.json` and do **not** re-stamp any `synced:`: a review
   verifies nothing against the code on its own. A default pass needs no entry.

## Notes

- A finding you cannot back with a page quote or a `path:line` is an opinion. Say
  so, or drop it.
- **"No findings" is a real outcome.** Don't manufacture work.
- Never modify code. Found a bug? Note it and tell the person.
