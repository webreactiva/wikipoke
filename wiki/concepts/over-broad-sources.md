---
title: Over-broad sources, the false green
type: concept
responsibility: How a too-wide `sources:` entry makes coverage lie, and what the check does about it.
sources:
  - src/lib/lib.ts
  - src/lib/lint.ts
synced: fa67d16
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
indexable files, once that is at least ten (`src/lib/lint.ts:123`): the share is what makes a claim
a package in all but name, and the floor keeps a five-file repository quiet.

It is a **warning**, not an error, and it says how many indexable files the claim swallows
(`src/lib/lint.ts:113`). A wiki can be sound and still be lazily indexed; the number is there so the
reader can judge.

The trap this leaves is one no script can close, and the `wikipoke-lint` skill is told to watch for
it by name: **green coverage plus an over-broad warning is a false green**. Read the two together,
and treat the over-broad claim as uncovered code until someone narrows it.
