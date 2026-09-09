# Implementation journal

Started 2026-09-08. Append-only; entries record decisions when made.

- Build start: use the recommended configurable command executor following
  Daniel's "go". Supply a Claude Code bridge because that CLI is installed;
  keep the generic protocol independent of the bridge and disable model tools.
- Use a single package with YAML/Markdown parsers and runtime schema validation.
  Reject handwritten YAML parsing because both legacy implementations lost data
  through specialized text parsing. Preserve source evidence and unknown fields.
- Use local durable event files and recoverable file transactions. Do not treat
  captured queries/decisions as disposable caches. Serialize writes with a lock
  and detect external changes before publication and recovery.
- Validation decision: use a shared clone of Widgetron under `/private/tmp` and
  remove only its existing `wiki/` directory. Rejected: testing against the
  original wiki, because imported knowledge would hide bootstrap behavior.
- Learned during validation: read-only commands serialize behind a writer so a
  concurrent `status` and `lint` returns a visible writer-lock error. Effect on
  plan: document sequential health commands; consider shared reader coordination
  in a later refinement rather than weakening transaction recovery now.
- Naming refinement: use a root-level `.wikipokeignore` as the explicit source
  exclusion input at initialization. Compatibility with Widgetron's name is not
  required.
- Installation refinement: activate a delegating post-commit hook only when the
  configured Git hooks directory has no existing `post-commit`. Existing hook
  managers remain untouched and require explicit composition.

## 2026-09-09 — defect batch

Appended on 2026-09-09 after the work, not while it happened. These entries were
written from the delivered diff against `a4db891` by an agent that did not take
the decisions, so they carry no clock times — the intervals would be invented —
and they state what the code does rather than what was argued. Where an
alternative is named, it is one the shape of the fix rules out, not a rejection
anyone recorded at the time. The earlier entries above are unchanged.

- An unreadable page became a finding instead of a fault. A Markdown file inside
  `wiki/` without valid frontmatter used to throw out of `loadPages`, which every
  command calls, so one hand-written note disabled `status`, `lint`, `graph`,
  `ask` and every write. `loadPages` now returns `{ pages, unreadable }` and
  `lint` emits one `invalid-page` error per file. Two alternatives are ruled out
  by the shape of the fix: the file is not skipped silently, because it surfaces
  as an error finding; and the wiki still loads, because the readable pages are
  returned alongside. `publish` refuses to overwrite an unreadable page rather
  than repairing it.

- Source sanitation moved to the single write point. `sourceSchema` carried
  `.passthrough()`, so the `content` field that `ingest` hands to an agent came
  back through `publish` and was serialized into the page frontmatter — the
  whole source file inside the YAML header. The schema now declares its fields
  and drops the rest, and `render` parses metadata through `pageSchema` before
  stringifying. The guard sits in `render` rather than in `publishPatch` because
  `answer` and `capture` also write metadata, and they all pass through `render`.

- The hook calls a command instead of capturing one. The generated post-commit
  hook ran `wikipoke status > .wikipoke/attention.json 2>/dev/null || true`: the
  shell truncated the file before the command ran, so any failure left 0 bytes
  and destroyed the previous signal, and a success wrote the entire `status`
  payload, graph included. The hook now runs `maintain --once` with its output
  discarded; the command writes the file itself through the store's transaction,
  and writes a bounded signal — counts plus a ten-item sample per category. A
  failed refresh leaves the last good file in place, and the hook still exits 0
  so a commit is never blocked.

- The source tree is read in batches. `inventory` ran `git show <rev>:<path>`
  once per included file. It now lists the tree once, sizes the blobs with
  `cat-file --batch-check`, and streams contents through `cat-file --batch` in
  groups bounded by 512 blobs or 32 MB. Measured on a synthetic 1,000-file
  repository: 1002 Git processes and about 7 s for `status`, against 5 processes
  and about 0.3 s. The cost of the choice is parsing `--batch` output at the byte
  level, which is why the binary and multibyte tests exist. The inventory still
  reads a commit rather than the checkout, so nothing here changed what a source
  record means.

- An unsupported answer is no longer an answered one. `answer` used to set
  `state: 'answered'` unconditionally and recorded nothing when it threw. It now
  refuses a payload with neither citations nor declared gaps, appends the refusal
  to the query page as a `failed` attempt with its reason, and stores an answer
  that declares gaps and cites nothing as `unsupported`. FR-005 forbids
  presenting a lack of coverage as a finding, and `answered` did exactly that.

## 2026-09-09 — findings from an external agent driving a real project

The install → `ingest` → `publish` → `ask` path was exercised against a copy of
the Widgetron monorepo with its previous wiki removed, driven by OpenCode on a
non-Anthropic model rather than by hand. The agent completed the path unaided,
which is the result the agent-first architecture was betting on. What it
stumbled over is recorded here, because every entry below is a defect the
manual runs could not surface.

- A plan is bounded by bytes, not only by files. `ingest` returned 168 KB for a
  ten-file batch: `limits.batchFiles` capped the count while the payload carried
  whole modules, and a UI catalog is not a ten-kilobyte file. The agent did the
  only thing it could and truncated the plan with `head -c 3000`, which threw
  away the `hash` and `revision` each source already carried. It then recomputed
  the evidence by hand, reaching for `git hash-object` first — the wrong digest
  entirely — before landing on SHA-256. So the unbounded payload did not merely
  cost tokens: it destroyed the pinned evidence the patch exists to carry.
  `limits.batchBytes` now caps the weight, defaulting to 64 KiB, and the first
  pending source always ships so an oversized file cannot block the queue behind
  it. `ingest` also answers `remaining`, so an agent can decide whether to loop
  without calling `status` for the full list.

- The skills carry the contract, so they now state it. The ingest skill said
  "obtain the bounded source plan" and stopped. It now says what the plan
  contains, that `revision` and `hash` are copied verbatim and never recomputed,
  that `body` is one Markdown string — the agent's first patch sent an array of
  lines and was rejected — that the patch should declare the plan's revision, and
  that a pass is repeated until `complete`. The query and decision skills gained
  the same treatment. This is where the leverage is: the CLI validated correctly
  every time, and every failure was an agent guessing at a contract nobody had
  written down for it.

- The signal was fresh and nobody read it. `post-commit` kept
  `.wikipoke/attention.json` current, but nothing put it in front of an agent;
  the project's previous wiki had a `SessionStart` hook doing exactly that, and
  dropping it was a regression this rebuild had not noticed. `install` now writes
  `.wikipoke/hooks/session-start`, which refreshes the signal and prints one line
  when the wiki owes work, silent when it does not.

- Harness configs are told, not taken. Only Claude Code has a session hook of
  this shape, and even there the file carries permissions and hooks that are none
  of Wikipoke's business, so it is written only when absent and never rewritten.
  Codex, OpenCode and Cursor get a named manual step and a README section instead
  of an edited config. Cursor and OpenCode have no session lifecycle hook at all,
  so their adapter is an instruction line the agent reads — the same fallback
  Ponytail settles on for those harnesses.

- A path-installed CLI can now answer for itself. `wikipoke --version` failed
  with `unknown option '--version'`. With no registry release, the binary is the
  only thing that knows which build a project has.

- The documented install was npm-only. The agent translated it to
  `pnpm add -D -w` unaided and got it right, which is luck rather than design;
  the workspace-root requirement is now written down.

No gate moved. This is build work recorded against the accepted plan.
