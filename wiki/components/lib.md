---
title: Shared machinery
type: entity
responsibility: The git, frontmatter, glob and page-listing helpers the three checks share, and the constraints each one encodes.
sources:
  - src/lib/lib.ts
synced: ee3921c
related:
  - ./checks.md
---

Everything the checks have in common, in one dependency-free module: where the wiki is, what a
page is, how git is called, how frontmatter is parsed and how a `sources:` glob is compiled. Its
own header states the rule that keeps it honest — when this file and the wiki's `CONVENTIONS.md`
disagree about the schema, [CONVENTIONS.md wins and this file is fixed](../concepts/schema-lives-in-the-wiki.md).

Since `12ff4b8` the checks are not its only readers. [The atlas](./atlas.md) builds its snapshot
from the same page listing, link reading and citation parsing, and serves cited files only from the
same tracked-file list, so what atlas draws and what `check` reports cannot disagree about what a
page links to or cites.

**It is also where the vocabulary is declared.** Since `df4db0e` the module exports the types the
three checks pass around as well as the functions: `Page` and `LoadedPage`, `Frontmatter`, `Link`,
`Citation`, `CheckContext` (`src/lib/lib.ts:42`). That moves a class of drift from review to the
compiler — a check that reads `page.meta.sources` as if it were always a list no longer typechecks
— but it also puts a second copy of the schema in this file, which is exactly what the header
warns against. The types describe the *parser's* output, not the contract; `CONVENTIONS.md` still
decides what a page must carry, and `REQUIRED_KEYS` is still a list `lint` reads at run time rather
than a shape the compiler enforces.

`Frontmatter` is `Record<string, string | string[] | undefined>` (`src/lib/lib.ts:52`), open on
purpose so a flow page can carry `trigger:` without anyone teaching the checks about it. The cost
is that every read of a known key has to say which of the two it wanted, which is what `asList()`
is for: `sources:` and `related:` are lists whether a page wrote one entry or five, and the old
`[].concat(x ?? [])` idiom that used to say so does not survive typing.

**Git is shelled out to, always.** `git()` is `execFileSync` with a 32 MB buffer;
`gitOrNull()` swallows the failure, which is how "is this sha a commit here?" is answered without a
try/catch at every call site. There is no cache and no index of its own: every answer is recomputed
from git at the moment a check runs, which is why nothing can go stale between runs.

**Uncommitted work counts.** `changedSince()` unions `git diff --name-only <sha>` against the
working tree with `git ls-files --others --exclude-standard` (`src/lib/lib.ts:208`), so a page goes
stale the moment its source is edited, not once the edit is committed. A wiki pass that edits code
would therefore invalidate its own pages — which is one more reason the skills forbid it.

**The frontmatter parser is deliberately small.** Scalars, block lists and inline arrays; no
nesting, no anchors, no multi-line strings (`src/lib/lib.ts:433`). The comment says why: the parser
is the contract `CONVENTIONS.md` documents, and one that accepts more than the contract lets pages
drift out of it. Unknown keys are kept and ignored.

**The ignore list is matched by git, twice.** `.wikipokeignore` is git pathspecs, so its `*`
crosses directories — which is not what a `sources:` glob does, and the two dialects must not be
confused. `ignoreRules()` splits the file into plain lines and `!` lines (`src/lib/lib.ts:233`),
and `indexablePaths()` runs git once with the plain lines as `:(exclude)` pathspecs and once with
the `!` lines to bring paths back (`src/lib/lib.ts:253`). Doing the second pass in git rather than
in JavaScript is the whole point: one dialect decides everything, and re-inclusion is
order-independent because it is a separate pass rather than a rule read top to bottom.
`ignoredFiles()` inverts the result so coverage can say how many files the list hid, minus the
wiki's own pages, which are never code.

**Two glob rules do most of the work.** `normalizeSource()` turns a wildcard-free path that is a
directory on disk into `dir/**`, so `sources: [src/billing/]` means what a reader thinks it means.
`isOverBroad()` flags a source that claims a directory carrying one of the known package manifests
(`src/lib/lib.ts:503`), or the repository root: those are the claims that make
[coverage read green for code nobody wrote up](../concepts/over-broad-sources.md).

**Citations are found the same way links are.** `codeCitations()` pulls `path:line` references
out of a page's prose (`src/lib/lib.ts:577`), stripping fenced blocks — a diagram or an example is
not a claim — but keeping inline code, since a citation is normally written in backticks. `pageCitations()`
(`src/lib/lib.ts:592`) adds the other form agents write, a Markdown link into the repository with a
GitHub line anchor (`#L12`, or the first line of `#L12-L20`), resolved the same way any repository
link is; one pointer written both ways counts once, and `raw` keeps the text the page actually
holds so a report names something findable. It is how `lint` checks the pointers `CONVENTIONS.md`
tells pages to use instead of transcribing code, and how `drift` finds the ones a stale page has to
re-point. Lines count from 1, so `file.js:0` is left
to the prose rather than reported: until `b29f7f4` it crashed every check, the notifier included.

**A `--dir` is chosen, not just validated.** `chooseWiki()` (`src/lib/lib.ts:115`) refuses a path
outside the repository, the repository itself, and a path a file already occupies, and returns the
reason as a sentence rather than `null`, so the CLI can print it before writing anything. Since
`450cac0` and `98bb026` it also refuses what would make a wiki git never commits or a path the
templates cannot carry: a `.git` component at any depth and in any case (macOS reads `.GIT` as
`.git`), a folder git ignores — unless the wiki is already set up there, so `init` can always
re-run on it — a leading `~`, which the shell would not expand, a backslash, since every template
embeds the path and the hooks run it through `sh`, and a symlink on the way that leads out of the
repository.

**The "Never a source" list is read like the page types.** Since `072403d` `neverSources()`
(`src/lib/lib.ts:352`) takes the files listed under the `## Never a source` heading of the wiki's
`CONVENTIONS.md` — the project's list, lock files by default — and `neverMatchers()` compiles each
entry once per lint run (`src/lib/lib.ts:375`): an entry with no `/` is a file name found in any
folder, so a monorepo's nested lock files count. The defaults stand in only when the heading is
missing; a heading with an empty list switches the warning off. Only a single file counts as a hit,
because a folder or a glob is the over-broad rule's to judge.

**Quotes are read as YAML reads them.** Since `d04d1a1` a quoted frontmatter value is unquoted the
way a strict YAML parser would (`''` inside single quotes, `\"` and `\\` inside double ones), not by
dropping a stray quote at either end as before, so the value wikipoke reads and the value
Obsidian or a site generator reads are the same. The parser is still the flat one below; lint warns
about lines the two would read differently.

**The inbox is a dot folder.** `INBOX_DIR` is `.inbox` (`src/lib/lib.ts:21`), and `listPages()`
already skips every entry that starts with a dot, so decision notes are never walked as pages.
`inboxNotes()` (`src/lib/lib.ts:399`) lists the `.md` files in it for drift and the CLI to count,
and never reads them.

**Links are plain Markdown on purpose.** `markdownLinks()` strips code fences and spans first, then
classifies each link as `page` (inside the wiki, compared against the pages), `repo` (outside it,
compared against the filesystem) or `external` (never checked). `[[wikilinks]]` are found and
reported but never resolved — see [the decision](../decisions/plain-markdown-links.md).
