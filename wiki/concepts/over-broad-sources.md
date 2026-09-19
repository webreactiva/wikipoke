---
title: Over-broad sources, the false green
type: concept
responsibility: How a too-wide `sources:` entry makes coverage lie, and what the check does about it.
sources:
  - src/lib/lib.ts
  - src/lib/lint.ts
synced: 78adf3b
related:
  - ./coverage-as-debt.md
  - ../components/checks.md
---

`sources:` is the inverted index: it maps a page to the code it documents, which is how drift maps
a changed file back to the pages that must be re-read, and how coverage knows what is claimed. Both
directions break the same way — a page that claims `src/` covers every file under it, so coverage
reports green for code nobody wrote up, and every change anywhere under `src/` marks that one page
stale, which trains everyone to ignore staleness.

`isOverBroad()` catches the shape (`src/lib/lib.ts:378`): a wildcard-free source pointing at a
directory that carries one of the known package manifests (`package.json`, `Cargo.toml`,
`go.mod`, …), or a source that resolves to the repository root. Claiming a whole *package* is the
line, not claiming a directory — `src/billing/` is a legitimate module page's source, while a
monorepo package root almost never is.

Until `3eb714c` that left the example in the first paragraph uncaught. In a single-package
repository the manifest sits at the root and the code in `src/`, so `src/` carries no manifest and
passed — and a real seed claimed it on its architecture page, which turned coverage green over a
file nobody had opened. `lint` now also warns about any source that matches more than half of the
indexable files, once that is at least ten (`src/lib/lint.ts:126`): the share is what makes a claim
a package in all but name, and the floor keeps a five-file repository quiet.

A share stops working on a large repository. On a 1,480-file Laravel app a seed claimed
`app/Features`, thirty modules and a third of the code, and passed: no manifest, less than half.
Since `dc452c1` a source past fifty indexable files is over-broad whatever its share, fifty being
more than any one page reads. The next run dodged that too, by splitting one module into eight
subfolders under fifty each, so since `d63f692` a page's folder and wildcard sources are also
counted together, and more than fifty between them gets one warning (`src/lib/lint.ts:143`). A
list of files is never summed: naming a file is a claim to have read it, which is the point.

It is a **warning**, not an error, and it says how many indexable files the claim swallows
(`src/lib/lint.ts:131`). A wiki can be sound and still be lazily indexed; the number is there so the
reader can judge.

The trap this leaves is one no script can close, and the `wikipoke-lint` skill is told to watch for
it by name: **green coverage plus an over-broad warning is a false green**. Read the two together,
and treat the over-broad claim as uncovered code until someone narrows it. A review on that same
repository dismissed seven such warnings as "known debt" because the log mentioned them, and
reported coverage as complete; the skill now says the total stays false while they stand, whatever
the log says (`86294e6`).
