---
title: Plain Markdown links, not wikilinks
type: decision
responsibility: Why the wiki uses `[text](./page.md)` and reports `[[term]]` instead of resolving it.
sources:
  - lib/lib.mjs
  - lib/lint.mjs
synced: 68c8fa3
related:
  - ../components/lib.md
---

**Decision.** Links between pages are ordinary Markdown links. `[[wikilinks]]` are detected in
prose and reported as a warning (`lib/lint.mjs:102`), never followed.

**Why.** A Markdown link resolves to a path, so `lint` can check every one of them — on pages, in
`related:` and in `index.md` — and a page that moves shows up immediately as a list of broken links
to fix. That single property is what keeps the link graph trustworthy enough to warn about orphans
at all. A `[[term]]` resolves against an index that the tool would have to own, which means
inventing a naming scheme, a disambiguation rule and a resolution order, none of which git or an
editor understands.

**The discarded alternative** is what most wikis do, and the comment in `lib/lib.mjs:314` gives the
second reason to skip it: double brackets tend to collide with whatever the host project already
uses them for — a templating language, another wiki tool, a documentation generator. The wiki lives
inside someone else's repository, so it takes the syntax least likely to already mean something.

**What it costs.** Relative paths (`../concepts/thing.md`) are more awkward to write than a bare
term, and moving a page means fixing its inbound links by hand — though `lint` lists exactly which
ones. Links are checked for existence, not for anchors: a link to `page.md#a-heading` is verified
as far as the file, and the fragment is dropped (`lib/lib.mjs:327`).
