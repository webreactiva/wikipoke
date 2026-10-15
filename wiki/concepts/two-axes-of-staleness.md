---
title: Two axes of staleness
type: concept
responsibility: Why the wiki tracks both a repository checkpoint and a per-page `synced:`, and what each one catches that the other misses.
sources:
  - src/lib/drift.ts
  - src/lib/lib.ts
  - templates/CONVENTIONS.md
synced: d7a7356
sources_key: d1e48839011c
generated: { by: claude-code/claude-haiku-5-5, at: 2026-10-15T11:39:03Z }
verified: { by: opencode/glm-5.3-flash, at: 2026-10-11T01:13:36Z }
related:
  - ../components/checks.md
  - ../flows/ingest-pass.md
---

Two clocks, one question asked twice.

```
repo axis    .wikipoke-state.json  last_indexed_commit ──► HEAD
             "N commits nobody has looked at"          catches code with no page at all

page axis    each page's  synced:  ──► its own sources:
             "this page's code moved since it was verified"   catches pages that lie
```

Neither replaces the other. A repository that is perfectly current on the repo axis can still hold
a page nobody re-read after its module was rewritten — if that rewrite landed before the
checkpoint moved. And every page can be fresh while ten commits' worth of new code has arrived that
no page claims, which the repo axis sees and the page axis cannot: a page only tracks files it
already lists.

The asymmetry in the *response* matters more than the symmetry in the measurement. Being behind on
the repo axis is answered by reconciling (Mode B); a stale page is answered by re-reading that one
page's diff and re-stamping it. Which is why `synced:` may never be re-stamped without re-reading
the page against the code: the field is not a timestamp, it is an assertion that someone checked.
Re-stamping it in bulk would leave the wiki looking current and quietly lying, and there is no
third clock to catch that.

There is deliberately no date field on a page. `git show -s --format=%cs <synced>` gives the date
of the commit the page was verified against, which is the date that actually matters, and cannot
drift from the sha the way a hand-written date can.

There is a third clock, finer than either: each citation's own. Drift dates it by the commit that
last wrote its page line and reports where the cited line went since (`src/lib/drift.ts:251`). It
cannot hang off `synced:`, and that is the lesson of its first version: `synced:` says when someone
checked the page's *sources*, not when each number was written, and re-stamping it over pointers
nobody moved made them read as current. With its own clock a skipped pointer stays visible after
the re-stamp, as a fresh page listed under `moved`.

Both axes measure against the **working tree**, not the last commit (`src/lib/lib.ts:224`): a page is
stale the moment its source is edited. `--against <ref>` measures the same two axes on a commit
instead, for a question about a branch (`0da6c99`). A page with no `sources:` or no `synced:` is on
neither axis — `drift` puts it in `skipped[]`, because a page with no contract cannot be called fresh.

Both axes have a fallback for a squash or rebase merge, which throws away the commit a page or the
checkpoint names. The repo axis then counts from the newest commit that touched the state file, if
that commit wrote the same checkpoint (`287f3c4`). The page axis compares `sources_key:`, a hash of what the page's sources are now, with
the key the pass stored (`942d6a6`). That is an answer, not a clock: it says the sources moved, but
not when and not which file, so the reconcile pass re-reads the page's sources instead of a diff.
The key does not replace `synced:`. Both are re-stamped together, and only after the re-read.

Drift also reports `pending` decision notes since `35f9c8a`, but that is not a third axis: no
clock is compared, it counts what an agent left in the inbox for the next ingest. It sits in drift
because it answers the same question, what the wiki owes
([the decision](../decisions/capture-decisions.md)).

One kind of staleness is not a defect at all. Since `3e94960` a decision page may carry
`planned: true` while the code has yet to carry it out, and the commit that carries it out makes
that page stale on purpose — that is how the ingest learns to drop the key and mark what was
reversed `status: deprecated`. The page axis catches it like any other page; what differs is that
the ending was written down in advance ([the decision](../decisions/capture-decisions.md)).
