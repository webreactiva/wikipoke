# Evidence: Wikipoke

Status: build-phase evidence, re-collected on 2026-09-09. The human test gate
remains open and no gate decision is claimed here.

This file replaces the evidence collected earlier on 2026-09-09 against the
executor-based product. That product no longer exists; see
[Superseded evidence](#superseded-evidence) for what was removed and why.

Every command below was executed while writing this file. Timings come from
this machine, which was running several agents concurrently.

## Environment

| Item | Value |
| --- | --- |
| Repository state | working tree of `a4db891` with the defect batch still uncommitted (`src/**`, `tests/**`, `package.json`) |
| Node | v24.11.0 |
| Git | 2.40.0 |
| Platform | darwin 23.6.0 |

## Commands run

```text
$ npx tsc --noEmit
Exit: 0 (no diagnostics)

$ npm run build
> wikipoke@0.1.0 build
> npm run clean && tsc && node -e "...chmodSync('dist/cli.js', 0o755)"
Exit: 0

$ npm test
> wikipoke@0.1.0 test
> tsx --test tests/*.test.ts
...
ℹ tests 48
ℹ suites 0
ℹ pass 48
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5117.061333
Exit: 0
```

The suite was run three times while this file was written: 44 tests passing at
the start and 48 in the last two runs, because tests were still being added to
the working tree. Every run was green and no test failed at any point. The count
is a snapshot of a tree under change, not a stable figure.

The 48 tests live in `tests/{cli,install,knowledge,runtime,sources,wiki}.test.ts`
and cover: transaction recovery and external-edit refusal; lock acquisition,
release and orphan reporting; page round trips with unknown metadata preserved;
readable/unreadable page separation; source-field stripping at render; skill and
hook installation over foreign files; the delegating hook resolving its notifier
at run time; a failed refresh keeping the previous signal; uninstall preserving
unmanaged files; `init` refusing a non-repository and an empty repository; batch
limits; `doctor` with and without a wiki; `maintain --once`; `recover --unlock`
and its refusal without the flag; batched inventory across groups, multibyte
text, binary and symlink exclusion; deterministic `ingest` planning and source
validation on `publish`; query persistence and request-ID deduplication;
citation rejection without losing the question; cited vs unsupported answers;
decision capture idempotence and non-certification of empty closure; patch
scope containment and concurrent-edit refusal; snapshot refs; `seal` coverage;
`.wikipokeignore` adoption; refusal to initialize over an existing wiki; slug
paths; unreadable pages as findings; frontmatter sanitation; revision-staleness
refusal on `publish`; reserved generated names at the wiki root; the error
raised when publishing over an unreadable page; and the bounded attention
signal.

## Source inventory: batched Git reads

The inventory used to run one `git show` per included file. It now lists the
tree once, sizes the blobs in one `cat-file --batch-check`, and streams their
contents through `cat-file --batch` in groups bounded by 512 blobs or 32 MB.

Method: a synthetic repository of 1,000 committed TypeScript files, `init
--include 'src/**'`, then `status` end to end. "Before" is the same CLI built
from `a4db891` (`git archive HEAD`, `npx tsc`); "after" is the working tree.
Git process counts come from a shim on `PATH` that logs each invocation and
execs the real binary.

| Measure | Before (`a4db891`) | After (working tree) |
| --- | --- | --- |
| `git` processes for `status` over 1,000 sources | 1002 | 5 |
| `status` wall clock, 3 runs | 7.30 s / 6.62 s / 7.35 s | 0.33 s / 0.30 s / 0.30 s |

The five remaining processes are `rev-parse`, `ls-tree`, one
`cat-file --batch-check`, and two `cat-file --batch` runs — one per 512-blob
group. The count is bounded by the batch size, not by the file count; it is not
literally a single process.

## Installed product in a consumer project

A disposable Git repository with three TypeScript modules, `npm install
--save-dev wikipoke-0.1.0.tgz` from `npm pack`, and no other Wikipoke presence.

```text
$ node_modules/.bin/wikipoke doctor        # before init, no wiki
{ "node": "v24.11.0", "git": "git version 2.40.0", "repository": true,
  "config": null, "wiki": null, "hookComposed": false, "pending": null,
  "problems": [ "No wikipoke.config.yaml; run init to configure the wiki.",
    "No post-commit hook composes .wikipoke/hooks/post-commit; ..." ] }

$ node_modules/.bin/wikipoke init --include 'src/**'
{ "initialized": true, "config": "wikipoke.config.yaml", "limits": { "batchFiles": 10 } }

$ node_modules/.bin/wikipoke install
{ "skills": [ ".agents/skills/wikipoke-ingest/SKILL.md",
              ".agents/skills/wikipoke-query/SKILL.md",
              ".agents/skills/wikipoke-decision/SKILL.md" ],
  "hook": ".wikipoke/hooks/post-commit", "activeHook": true,
  "manual": [ "Schedule `npx --no-install wikipoke maintain --once` ..." ] }

$ git commit -m "add version module"      # the hook fires here
$ wc -c < .wikipoke/attention.json
421
$ cat .wikipoke/attention.json
{ "at": "2026-09-09T16:55:38.743Z",
  "revision": "b8f858697a311607859dac2ae20ce58f83f297b8",
  "checkpoint": null, "pages": 0,
  "findings": { "error": 0, "warning": 0 },
  "drift": { "count": 0, "sample": [] },
  "uncovered": { "count": 3,
    "sample": [ "src/queue.ts", "src/retry.ts", "src/version.ts" ] },
  "tasks": { "incomplete": 0, "sample": [] } }
```

The signal is 421 bytes with real content. It is bounded by construction: counts
plus a ten-item sample per category, never the graph.

A broken configuration does not reach the commit:

```text
$ printf 'version: 1\ninclude: [\n' > wikipoke.config.yaml
$ node_modules/.bin/wikipoke maintain --once
Flow sequence in block collection must be sufficiently indented and end with a ]
Exit: 1

$ git commit -m "add build constant"
Exit: 0
$ diff attention-before-breakage.json .wikipoke/attention.json
(no differences — the previous signal survived)
```

Then the agent-facing loop, run by hand in place of an agent:

```text
$ node_modules/.bin/wikipoke ingest
{ "complete": false, "revision": "80bf438...",
  "sourceIds": [ "src/build.ts", "src/queue.ts", "src/retry.ts", "src/version.ts" ],
  "pages": 0, "catalog": [] }

$ node_modules/.bin/wikipoke publish --patch patch.json
{ "published": [ "concepts/retry-policy.md" ], "findings": [] }
```

The patch deliberately carried the full `content` field of `src/retry.ts` inside
its source entry. The published frontmatter kept only `id`, `resource`,
`revision`, `hash` and `title`; `grep -c 'function retry' wiki/concepts/retry-policy.md`
returns 0. Source text cannot reach the wiki through the metadata path.

```text
$ node_modules/.bin/wikipoke ask "How many times does the app retry?" --request-id q-retry
{ "state": "pending", "path": "queries/how-many-times-does-the-app-retry-aa893cd4.md",
  "suggestedPages": [ "concepts/retry-policy.md" ] }

$ ... answer with neither citations nor gaps
Answer needs cited evidence, or declared gaps when no evidence exists      Exit: 1

$ ... answer citing src/nonexistent.ts
Unknown citation: src/nonexistent.ts                                       Exit: 1

$ ... answer with declared gaps and no citations
{ "state": "unsupported", "attempts": [ {pending}, {failed: no evidence},
  {failed: unknown citation}, {unsupported} ] }                            Exit: 0
```

Both refusals are recorded as `failed` attempts on the query page, which keeps
its question throughout. An answer with declared gaps and no citations lands as
`unsupported`, never as `answered`.

`capture` materializes a decision page whose `wikipoke.decision` block holds
`actor`, `eventId` and `at` — nothing else. The task stays
`{"task":"add-retry-budget","closure":"incomplete"}` until an explicit close
event arrives, so a submitted event does not certify capture.

`snapshot release-0.1` pinned code and wiki at `f2f51dd`, wrote
`.wikipoke/releases/<sha256(label)>.json`, and retained
`refs/wikipoke/<sha256(label)>/{code,wiki}`.

## Failure, recovery and boundary checks

| Check | Observed | Exit |
| --- | --- | --- |
| Human Markdown without frontmatter dropped into `wiki/` | `lint`, `status`, `graph` and `ask` all keep working; the file appears once as `{"code":"invalid-page","severity":"error","page":"notes.md"}` | 0 |
| Orphan writer lock present | `status` refuses with "Wiki writer locked. If its process died, inspect then use recover --unlock." | 1 |
| `recover --unlock` | `{ "released": true, "owner": { "pid": 4242, "at": "2026-09-09T16:40:00.000Z" } }`; the next `status` succeeds | 0 |
| `seal` with uncovered sources | "Cannot advance checkpoint while wiki health has pending work: 3 uncovered source(s), 0 drifted reference(s), 0 error finding(s)" | 1 |
| `init` in a directory with no Git repository | "Not a Git repository with at least one commit: …; every Wikipoke command reads source from Git, so initialize and commit the repository first"; nothing written | 1 |
| `uninstall` with a Wikipoke-owned hook | removed the three skills, the notifier and the delegating hook; preserved `wiki`, `wikipoke.config.yaml`, `.wikipoke/{state.json,events,releases,attention.json}` and an unmanaged `.agents/skills/team-review/SKILL.md`; 7 wiki pages survived | 0 |
| `install` over a foreign `post-commit` | `activeHook: false` plus a manual composition instruction; the foreign hook is not touched | 0 |
| `uninstall` after that | reports `Kept .git/hooks/post-commit: not installed by Wikipoke.`; the foreign hook is byte-identical afterwards | 0 |
| `ask --ref <first commit>` | the query records `ref` and `revision` at that commit while `HEAD` is elsewhere | 0 |

## Superseded evidence

The previous version of this file documented the executor-based product:
`executorConfigured` and `automaticMaintenance` fields, an
"No executor configured (exit 1)" path, a `maintain --once` that generated wiki
pages through a deterministic JSON executor, a bundled Claude Code bridge, a
one-file/one-job budget, and a 12-test suite.

None of those exist. The execution layer was removed from the code after
Daniel rejected provider-specific executor adapters on 2026-09-09 (recorded in
[state.md](./state.md)). Grepping `src/` for `executor` or `automaticMaintenance`
returns nothing.

That evidence has been removed rather than kept as a historical appendix.
Reproducing command output for flags that no longer parse would read as
verification of the current product, and re-running any of it is impossible.
What is worth keeping from it is the fact, not the transcript: a scratch
Widgetron clone under `/private/tmp` exercised the old bootstrap loop with a
deterministic executor and no model provider. The decision to run it that way
is in [journal.md](./journal.md) and its consequences in
[plan.md](./plan.md#departures); this file records only what can be re-run today.

## Not verified

- **No external agent has completed ingest → publish end to end in a real
  project.** The loop above was driven by hand, composing the patch and the
  answer payloads directly. The CLI does not invoke models by design, so
  "no real-provider run" is no longer the same gap it was under the executor
  architecture — but nothing here shows an agent reading `ingest`, researching,
  and publishing a patch it authored itself.
- **No scheduled invocation.** `install` still emits a manual instruction to
  schedule `maintain --once`; no cron, launchd or CI schedule was exercised.
- **Timings are indicative.** The performance figures come from a synthetic
  1,000-file repository on a machine running several agents at once. They show
  the order of magnitude, not a benchmark.
- **Single platform.** darwin only; no Linux, no Windows, no alternate Git
  version, no `core.hooksPath` or hook-manager project.
- **Nothing to verify for the unimplemented requirements.** FR-008, FR-009 and
  FR-014 have no implementation, and FR-011 has no read path. See
  [plan.md](./plan.md#delivered-and-not-delivered).
- **Concurrency was exercised only through the test suite.** No two real
  processes were raced against each other by hand; read commands still queue
  behind the writer lock, as `status` demonstrated above.
