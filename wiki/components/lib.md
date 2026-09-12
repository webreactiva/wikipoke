---
title: Shared machinery
type: entity
responsibility: The git, frontmatter, glob and page-listing helpers the three checks share, and the constraints each one encodes.
sources:
  - src/lib/lib.ts
synced: df4db0e
related:
  - ./checks.md
---

Everything the checks have in common, in one dependency-free module: where the wiki is, what a
page is, how git is called, how frontmatter is parsed and how a `sources:` glob is compiled. Its
own header states the rule that keeps it honest — when this file and the wiki's `CONVENTIONS.md`
disagree about the schema, [CONVENTIONS.md wins and this file is fixed](../concepts/schema-lives-in-the-wiki.md).

**It is also where the vocabulary is declared.** Since `df4db0e` the module exports the types the
three checks pass around as well as the functions: `Page` and `LoadedPage`, `Frontmatter`, `Link`,
`Citation`, `CheckContext` (`src/lib/lib.ts:40`). That moves a class of drift from review to the
compiler — a check that reads `page.meta.sources` as if it were always a list no longer typechecks
— but it also puts a second copy of the schema in this file, which is exactly what the header
warns against. The types describe the *parser's* output, not the contract; `CONVENTIONS.md` still
decides what a page must carry, and `REQUIRED_KEYS` is still a list `lint` reads at run time rather
than a shape the compiler enforces.

`Frontmatter` is `Record<string, string | string[] | undefined>` (`src/lib/lib.ts:50`), open on
purpose so a flow page can carry `trigger:` without anyone teaching the checks about it. The cost
is that every read of a known key has to say which of the two it wanted, which is what `asList()`
is for: `sources:` and `related:` are lists whether a page wrote one entry or five, and the old
`[].concat(x ?? [])` idiom that used to say so does not survive typing.

**Git is shelled out to, always.** `git()` is `execFileSync` with a 32 MB buffer;
`gitOrNull()` swallows the failure, which is how "is this sha a commit here?" is answered without a
try/catch at every call site. There is no cache and no index of its own: every answer is recomputed
from git at the moment a check runs, which is why nothing can go stale between runs.

**Uncommitted work counts.** `changedSince()` unions `git diff --name-only <sha>` against the
working tree with `git ls-files --others --exclude-standard` (`src/lib/lib.ts:163`), so a page goes
stale the moment its source is edited, not once the edit is committed. A wiki pass that edits code
would therefore invalidate its own pages — which is one more reason the skills forbid it.

**The frontmatter parser is deliberately small.** Scalars, block lists and inline arrays; no
nesting, no anchors, no multi-line strings (`src/lib/lib.ts:304`). The comment says why: the parser
is the contract `CONVENTIONS.md` documents, and one that accepts more than the contract lets pages
drift out of it. Unknown keys are kept and ignored.

**The ignore list is matched by git, twice.** `.wikipokeignore` is git pathspecs, so its `*`
crosses directories — which is not what a `sources:` glob does, and the two dialects must not be
confused. `ignoreRules()` splits the file into plain lines and `!` lines (`src/lib/lib.ts:188`),
and `indexablePaths()` runs git once with the plain lines as `:(exclude)` pathspecs and once with
the `!` lines to bring paths back (`src/lib/lib.ts:208`). Doing the second pass in git rather than
in JavaScript is the whole point: one dialect decides everything, and re-inclusion is
order-independent because it is a separate pass rather than a rule read top to bottom.
`ignoredFiles()` inverts the result so coverage can say how many files the list hid, minus the
wiki's own pages, which are never code.

**Two glob rules do most of the work.** `normalizeSource()` turns a wildcard-free path that is a
directory on disk into `dir/**`, so `sources: [src/billing/]` means what a reader thinks it means.
`isOverBroad()` flags a source that claims a directory carrying one of the known package manifests
(`src/lib/lib.ts:366`), or the repository root: those are the claims that make
[coverage read green for code nobody wrote up](../concepts/over-broad-sources.md).

**Citations are found the same way links are.** `codeCitations()` pulls `path:line` references
out of a page's prose (`src/lib/lib.ts:437`), stripping fenced blocks — a diagram or an example is
not a claim — but keeping inline code, since a citation is normally written in backticks. It is how
`lint` can check the pointers `CONVENTIONS.md` tells pages to use instead of transcribing code.

**Links are plain Markdown on purpose.** `markdownLinks()` strips code fences and spans first, then
classifies each link as `page` (inside the wiki, compared against the pages), `repo` (outside it,
compared against the filesystem) or `external` (never checked). `[[wikilinks]]` are found and
reported but never resolved — see [the decision](../decisions/plain-markdown-links.md).
