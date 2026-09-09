# Implementation plan: Wikipoke

Status: accepted as a block following Daniel's "go" on 2026-09-08.
From: [accepted specification](./spec.md), 2026-09-08.
Gate: build accepted; test and deploy remain human.
Revised 2026-09-09 to match the delivered code after the architecture change and
the defect batch. The revision reports what exists and what does not; it accepts
nothing on Daniel's behalf.

## Scope and decisions

Implement FR-001 through FR-015 as one library/CLI with independently testable
source, knowledge, execution, and integration boundaries. Delivery steps below
are internal milestones, not a reduction of the accepted scope. Importers,
query retention, decision capture, and release history remain part of completion.

⛔ The execution boundary named above no longer exists. Daniel rejected
provider-specific executor adapters on 2026-09-09 and accepted an agent-first
architecture; the delivered package has no executor, no model call and no
provider budget. See [state.md](./state.md#superseding-decision) and the
superseded clauses in [spec.md](./spec.md#superseded-requirements).

Proposed technical baseline: TypeScript, Node, npm, one package with public
library exports and a `wikipoke` executable. This follows the proposal and the
existing JavaScript engines; approval of this plan will settle the baseline.
Select and pin maintained YAML, Markdown AST, glob, and CLI parsing dependencies
after checking their supported runtime and licenses during scaffolding. Do not
recreate specialized YAML or Markdown parsers. ⛔ Use a deterministic test harness
and fake executor for the core, plus a real-executor acceptance pass.

Delivered baseline: TypeScript 7 on Node 22 or later, one private package with
`commander`, `minimatch`, `yaml`, `unified`/`remark`, `unist-util-visit` and
`zod`; `tsx --test` as the harness. There is no executor to fake and no
real-executor pass to run.

### Decision frontier

| Bucket | Item |
| --- | --- |
| Decided | The design is accepted; every query is retained; implementation choices are captured; history uses Git; the build gate remains human. |
| ⛔ Resolved, O-002 | Proceed with the recommended configurable-command executor. Supply a Claude Code bridge as the first concrete command implementation. |
| Reversed, 2026-09-09 | Daniel rejected that resolution. The product exposes an attention signal and deterministic commands; an external agent does the research. Both the executor contract and the Claude Code bridge were deleted from the code. |
| Decided, O-001 | Daniel selected automatic activation. Completing executor, allowed scope, limits, and execution-environment configuration activates maintenance without an additional opt-in. Missing prerequisites remain visible. ⛔ in part: `init` plus `install` is the whole activation, and what activates is the signal. |
| Proposed | One package, local files as canonical knowledge, rebuildable indexes, and one writer per target wiki. Delivered as planned. |
| ⛔ Investigation required | Verify the selected executor's supported invocation, output, cancellation, and lifecycle hooks before fixing its concrete integration plan. No installed CLI or credentials have been assumed. |
| Open, raised 2026-09-09 | O-004 (`seal` requiring complete coverage) and O-005 (no page retirement) need a product decision from Daniel before either is implemented. |

O-003 is per-installation configuration. Require an explicit source scope and
resource limits for unattended work; interactive setup may suggest values but
must record the selected values. No unlimited unattended default is proposed.
Delivered as `--include` (required), `--exclude`, an adopted `.wikipokeignore`,
and `limits.batchFiles`, which bounds how many source files one `ingest` plan
carries. No other limit exists, and none is needed while the product spends no
provider resources.

## Files and responsibilities

The planned layout below was one file per responsibility. The delivered layout
is flatter: eight source files, no `src/operations/`, `src/capture/`,
`src/importers/`, `src/retrieval/`, `src/history/` or `src/execution/`, no
`templates/` directory, and tests as one file per area rather than a directory
per domain. The responsibilities did not disappear with the directories — where
they are unimplemented, the table says so.

| Delivered file | Responsibility | Planned as |
| --- | --- | --- |
| `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore` | Runtime/build contract, dependencies, scripts, generated-file exclusions | as planned |
| `src/index.ts` | Public library exports: `Wiki`, page/graph/lint helpers, `inventory`, the schemas | as planned |
| `src/cli.ts` | Command dispatch for the 15 commands, structured JSON output, exit codes, `doctor` | as planned |
| `src/model.ts` | Zod contracts: config, page, source, relation, patch, answer | merged `src/config.ts` |
| `src/knowledge.ts` | Frontmatter parsing, unreadable-page separation, canonical rendering, graph construction with derived link edges, lint findings, index generation | merged `src/knowledge/{parse,write,validate,graph,index}.ts` |
| `src/sources/git.ts` | Batched source inventory from a Git tree, include/exclude scope, secret and binary exclusion, revision resolution | merged `src/sources/{types,git}.ts` |
| `src/runtime/store.ts` | Path containment, atomic writes, writer lock with owner record, journaled transaction and crash recovery | `queue`, `transaction` and `budget` folded in or dropped |
| `src/wiki.ts` | `init`, `status`, `lint`, `graph`, `ingest`, `publish`, `ask`, `answer`, `capture`, `snapshot`, `seal`, attention signal | replaces `src/operations/*`, `src/capture/*`, `src/history/snapshot.ts`, `src/retrieval/search.ts` |
| `src/integrations.ts` | Agent-neutral skill files, the notifier hook, the delegating Git hook, reversible uninstall | replaces `src/integrations/*` and `templates/skills/` |
| `tests/{cli,install,knowledge,runtime,sources,wiki}.test.ts` | 48 behavioral tests over disposable Git repositories (count still moving); no fixture directory | replaces `tests/{knowledge,git,runtime,query,capture,history,integration}/` |
| `README.md`, `docs/{installation,user-guide,architecture,format,operations}.md` | English user documentation for delivered behavior | `docs/user-guide.md` and `docs/architecture.md` added |
| `docs/sdlc/wikipoke/{plan,journal,evidence,state}.md` | This record | as planned |

Not created, because nothing implements them: `src/knowledge/conflicts.ts`
(claim conflicts and conformance, FR-008/FR-009), `src/importers/*` (FR-014),
`src/execution/*` (⛔ removed by the architecture decision).

## Delivered and not delivered

Status as of 2026-09-09, read from the code rather than from the milestones
below. `partial` means a requirement has an implemented core and a named hole,
not that it is nearly done.

| Req | Status | What exists | What is missing |
| --- | --- | --- | --- |
| FR-001 | partial | Markdown pages with YAML frontmatter in OKF card shape, a `wikipoke` extension namespace, unknown keys preserved, rebuildable graph and index. Source kinds are not hardcoded to code. | No OKF version/profile mapping is documented in the code and no external validator has been run. `docs/format.md` states this as format compatibility, not certification. |
| FR-002 | ⛔ superseded, partial | `status`, `lint` and `maintain --once` expose uncovered scope, drift, findings and incomplete tasks without declaring success. `ingest` plans a bounded batch. | Bootstrap and reconciliation are performed by an external agent, not by the product. See [spec.md](./spec.md#superseded-requirements). |
| FR-003 | delivered | Every page source carries `revision` and `hash`, compared by prefix so an older wiki keeps validating; `status` separates integrity findings, drift and uncovered scope; relations carry `basis: observed \| inferred`; a changed source produces drift, not a falsehood verdict, and every drift entry names its remedy. `lint` is no longer structural only: it also reports the shapes a wiki takes when it looks complete and is not — no flow page, a page claiming more sources than it describes, one page per source file — and those hold `seal`. | — |
| FR-004 | partial | Typed relations, link and source edges derived from the body, symmetric-edge normalization, supersession-cycle detection, graph rebuilt from the wiki alone, `uid` preserved across renames. | No page-level relationship or backlink section is generated. Incoming edges exist in `graph` output only. |
| FR-005 | partial | `answer` rejects unknown citations, records consulted revision and gaps, and distinguishes `answered` from `unsupported`. | Cannot expose unresolved conflicts, because FR-009 is unimplemented. |
| FR-006 | delivered | The query page is written before any research; failures append `failed` attempts and keep the question; `--request-id` deduplicates a retry while a new ID is a new invocation; `--ref` pins the consulted revision. | — |
| FR-007 | partial | `capture` persists an event, materializes a decision page and an entry in the generated `wiki/log.md`, keeps declared rationale and marks it unknown when absent. The `tool-journal` hook records which sources an agent edited and `session-stop` confronts it with them before the turn ends, under `capture: off \| remind \| block`. | The reason is still declared, never observed: the hooks can prove a file changed and never why. Only Claude Code exposes a stop hook Wikipoke can compose; other harnesses journal nothing yet. |
| FR-008 | **not implemented** | Nothing. | No intent/decision/behavior separation, no conformance evaluation against a revision, no divergence findings. `wikipoke.decision` stores `actor`, `eventId` and `at` — the conformance fields were removed because nothing computed them. |
| FR-009 | **not implemented** | Nothing. | No claim-level conflicts, no competing evidence, no resolution history, no source-authority rules. `grep -niE 'conform\|divergen\|conflict' src/` matches only the transaction-recovery message. |
| FR-010 | delivered | Task closure is derived from the event stream and resolves to `recorded`, `none_declared` or `incomplete`; a submitted event or a successful hook never certifies completeness; `status` and the attention signal expose incomplete tasks. | — |
| FR-011 | partial | `snapshot <label>` pins code and wiki commits, retains `refs/wikipoke/<sha256(label)>/{code,wiki}` and writes a manifest with the health at capture time; it refuses an uncommitted or empty wiki. Historical queries work through `ask --ref <commit>`. | No command lists, reads or queries a snapshot. The manifest file is named by the hash of the label, so a label cannot be resolved by hand. `ask` takes a commit, never a release label. |
| FR-012 | delivered | Agents edit through `publish` with full validation; direct edits are detected as concurrent changes rather than silently overwritten; no separate human-correction subsystem exists. | — |
| FR-013 | ⛔ superseded, delivered | `install` writes three agent-neutral skills under `.agents/skills/` and again under `.claude/skills/`, which Claude Code needs because it does not read the neutral location; a notifier, a session briefing, and the two capture hooks; composes a delegating Git hook only when none exists, and reports `activeHook`, `activeBriefing` and `captureComposed` plus manual steps; keeps the writer lock out of commits through `.gitignore`; `doctor` reports capabilities with or without a wiki; `uninstall` is reversible and preserves knowledge. | The unattended-execution clause is void. No scheduled invocation has been verified. Where a project already owns `.claude/settings.json`, the hooks are a manual step that is easy never to take. |
| FR-014 | **not implemented** | Nothing. | No Widgetron importer, no Web Reactiva importer, no migration or fidelity report. Adopting the shared system currently means starting an empty wiki. |
| FR-015 | delivered | Include/exclude scope with `.wikipokeignore` adoption, secret-name and binary exclusion, symlink and path containment, one writer lock with an owner record, journaled transactions with crash recovery that refuses external edits, a checkpoint that only advances through `seal`, installation preserving prior integrations and removal preserving knowledge. | Budget accounting is limited to `limits.batchFiles`; nothing else needs a budget while the product spends no provider resources. |

Beyond the requirement table:

- **No page retirement.** `publish` creates and replaces; there is no deletion
  and no deprecation state. A deleted source leaves its page behind as drift.
  Raised as O-005 in [spec.md](./spec.md#open-concerns).
- **`seal` demands total coverage.** It refuses while any source is uncovered,
  any reference has drifted or any error finding stands. On a real repository
  with a broad `include`, the checkpoint may never advance. This is a product
  decision for Daniel (O-004), not a defect that was fixed.
- **Read commands serialize behind the writer lock.** `status`, `lint`, `graph`
  and `ask` all take the same lock, so a read fails while a write is in flight.
  Recorded in [journal.md](./journal.md) on 2026-09-08 as deferred; still
  deferred, because a shared-reader design would touch transaction recovery.
- **One platform.** Verified on darwin only.

## Implementation sequence

The nine milestones below are the accepted plan text. Their status:

| Milestone | Status |
| --- | --- |
| 1. Contracts and portable knowledge | delivered, minus generated relationship sections |
| 2. Source revisions and mechanical health | delivered; the "avoid one Git subprocess per page" clause was only satisfied on 2026-09-09 |
| 3. Durable capture and recoverable writes | delivered |
| 4. ⛔ Wire the selected executor and incremental ingestion | the executor half is void; `ingest` was delivered as a bounded plan handed to an agent |
| 5. Recorded, grounded queries | delivered, minus conflict exposure (depends on milestone 6) |
| 6. Decisions, conformance, and conflicts | decisions delivered; conformance and conflicts **not started** |
| 7. Install into isolated consumer projects | delivered; no scheduled invocation verified |
| 8. History and importers | `snapshot` delivered with no read path; importers **not started** |
| 9. Verify the installed product and document evidence | in progress; see [evidence.md](./evidence.md) |

### 1. Establish contracts and portable knowledge

Create package/build scripts and define library boundaries. Document the exact
OKF version/profile mapping before implementing readers and writers. Keep
standard fields distinct from Wikipoke extensions; concept path remains public
identity and an internal immutable UID tracks moves.

Parse YAML and Markdown structurally, preserve unrecognized keys and user text,
and diagnose invalid content without silently defaulting away missing fields.
Define semantic relations separately from prose links and source references.
Build incoming edges from declarations, normalize symmetric edges, and validate
type-specific cycles and targets. Generate indexes and relationship sections
without rewriting unrelated body content. (FR-001, FR-003, FR-004, FR-012)

### 2. Implement source revisions and mechanical health

Use argument-array Git subprocesses with explicit repository paths. Inventory
tracked files inside configured scope and compare pinned commits, including old
and new paths for renames/deletions. Snapshot source hashes; separate optional
working-tree inputs from committed inputs and include permitted untracked files
only in the former. Do not read secrets or paths escaping scope through symlinks.

Group revisions to avoid one Git subprocess per page. Resolve missing/shallow
history through available hashes or a visible rescan requirement. Distinguish
observed inventory, reconciled changes, per-page verification, and initial
coverage backlog. Build status/lint without an executor. (FR-002, FR-003, FR-015)

### 3. Build durable capture and recoverable writes

Persist accepted query/task/decision events before generation. Pending events
are durable input, not cache; keep them until their wiki representation is
published. Scope runtime identities by source repository/worktree and use a
shared lock for a shared output bundle, even across distinct source branches.

Implement a journaled transaction with staged proposed files, expected original
hashes, revision checks, and recoverable phases. Readers use the committed
transaction generation or wait/recover rather than observe a partially published
batch. Crash recovery only restores files still matching transaction-owned hashes;
unexpected external edits create a conflict instead of being overwritten.
Advance checkpoints last. Deduplicate by event/job identity, never by query text.
Keep retries and exhaustion visible. (FR-006, FR-007, FR-010, FR-015)

### 4. ⛔ Wire the selected executor and incremental ingestion

The execution boundary accepts bounded source/context payloads and returns
validated patches, review findings, or cited answers. It does not grant an LLM
unrestricted filesystem write authority. Implement timeouts, cancellation,
output limits, schema rejection, and available usage accounting. Reject unknown
evidence IDs and writes outside allowed knowledge/state paths.

Complete the provider-specific invocation and lifecycle mapping after O-002.
A fake adapter alone is insufficient to complete this milestone or claim an
operational autonomous product. If a configurable-command adapter is selected,
specify stdin/stdout JSON and exit semantics, provide a usable real-model bridge,
and verify it; simply asking users to invent a bridge does not fulfill bootstrap.

Bootstrap a map and coverage jobs, then reconcile bounded source clusters and
dependency candidates. Treat inferred impacts as candidates, not unconditional
rewrite instructions. A no-op review can record updated verification without
changing the prose. Exclude generated artifacts from source-trigger loops while
retaining explicit query/decision events. (FR-002, FR-003, FR-013, FR-015)

### 5. Deliver recorded, grounded queries

Create the pending query page before model execution; fail visibly if persistence
is impossible. Search titles/descriptions/body with deterministic text ranking,
expand bounded graph neighbors, and read source evidence as needed within scope.
Record delivered text, citations, consulted revision IDs, and completion outcome.
Separate historical answer records from current explanatory pages in retrieval.

Interrupted requests become recoverable pending/failed records. A retry shares
identity while a new invocation does not. Validate citation existence and pinned
locators mechanically; semantic support requires review/evaluation, not just
link resolution. Persist the answer before reporting successful completion.
(FR-005, FR-006)

### 6. Materialize decisions, conformance, and conflicts

Convert task events into implementation logs and independently useful decision
pages, preserving original declarations and links. Distinguish submission,
materialization, task closure, implementation evidence, and human review.
Map interrupted/missing closure to incomplete capture; explicit no-decision
declarations require attribution and remain declarations rather than proofs.

Track decision lifecycle separately from conformance against a revision. Record
claim-level conflicts with scope and evidence, retain resolution history, and
surface unresolved conflicts during queries. Restrict automatic corrections to
evidenced documentary errors under the accepted policy; project decisions remain
pending for their owner. Never recover motives by inventing them from code.
(FR-007, FR-008, FR-009, FR-010, FR-012)

### 7. Install into isolated consumer projects

Implement init/install, capture, maintain-once, and doctor entry points. Install
managed configuration/skills and supported hooks while recording ownership and
original integration state. Respect existing hook managers and hooks paths;
where automatic composition cannot be verified, offer the exact manual wiring
and report that capability as inactive. Never claim installed hooks exist merely
because files were generated.

Hooks persist/queue quickly without LLM calls. A worker invoked by a scheduler
performs discovery and maintenance; document and verify at least one working
scheduled invocation. Session-only operation is reported separately. Test
reinstallation and uninstall against pre-existing hooks and manual edits to
managed entries. Apply the resolved O-001 default: activate maintenance when
required configuration is complete, without a separate enable command. Verify
that incomplete setup reports the missing capability and does not claim active
maintenance. This product default does not self-approve development-cycle gates.
(FR-002, FR-007, FR-010, FR-013, FR-015)

### 8. Capture history and import the two wikis

Pin source and wiki commits; require committed snapshot content. Preserve durable
refs before publishing the release manifest, and write the manifest in a later
commit to avoid a self-reference. Report incomplete reconciliation/conflicts in
the snapshot's health. Historical reads use pinned objects, never source HEAD;
new query records go into the active wiki. Missing historical material is explicit.

Import the two legacy formats to new destinations, preserving originals. Convert
Widgetron source patterns into inventory plus future-discovery rules; preserve
inherited verification as inherited. Parse Web Reactiva citations/moments and
normalize reciprocal links without guessing dependency types. Compare all input
elements against output counts and diagnostics. Use sanitized representative
fixtures in this repository, and read sibling repos only for local acceptance.
(FR-011, FR-014)

### 9. Verify the installed product and document evidence

Build/package the CLI, install the package artifact into a disposable consumer,
run the end-to-end scenarios below, and exercise the selected real executor.
Record actual commands, output, observed limits, and budget usage in evidence.md.
Read journal.md when composing evidence so departures and dead ends are covered.
Update docs to match actual commands and runtime support. Present the Test gate;
do not claim release readiness from unit tests alone.

## Proof and failure cases

| Suite | Evidence required | Spec scenarios | Delivered as |
| --- | --- | --- | --- |
| Knowledge | Round trips preserve unknown fields/prose; graph rebuild, rename, cycle and direction tests; invalid YAML/link diagnostics | S2, S11, S13 | `tests/knowledge.test.ts` and `tests/wiki.test.ts`; unreadable pages become findings |
| Git | Temporary repos with additions, renames, deletions, untracked edits, rebases, shallow history, distinct worktrees | S1-S3, S13 | `tests/sources.test.ts`: batch groups, multibyte text, binary and symlink exclusion. Rebases, shallow history and separate worktrees are **not** exercised |
| Runtime | Fault injection before/after each publication phase; two writers and manual edits; retry deduplication; source change during inference | S4, S5, S12, S16 | `tests/runtime.test.ts` plus concurrency cases in `tests/wiki.test.ts`. No two-process race outside the harness |
| Queries | Model success/failure/cancellation; pending record first; repeated text vs same request; evidence validation and disclosure | S4, S5, S10 | `tests/wiki.test.ts`: pending record first, request-ID dedupe, unknown citations, `unsupported` vs `answered`. "Model cancellation" no longer applies |
| Decisions | Recorded, explicitly empty and missing closure; missing rationale; proposed vs implemented vs diverged; conflict preservation/resolution | S6-S9 | `tests/wiki.test.ts` covers closure states and undeclared rationale. **Divergence and conflicts are untested because unimplemented** (FR-008, FR-009); S7, S8 unmet |
| History | Separate code/wiki commits, moving tags, retained refs, unavailable external versions, immutable snapshot queries | S10 | `tests/wiki.test.ts` covers retained refs and the committed-wiki requirement. No snapshot read path exists, so immutable snapshot queries are unmet |
| Importers | Original/output source, moment and relationship accounting; malformed input remains reported; originals unchanged | S14 | **Not started.** S14 unmet |
| Consumer install | Automatic activation on completed setup without another opt-in; incomplete setup reports missing prerequisites; existing hooks/managers, twice-install/uninstall, manual managed-entry edits, absent executor, invocation outside an agent session | S1, S15, S16 | `tests/install.test.ts`, `tests/cli.test.ts`, plus the packed-tarball walkthrough in [evidence.md](./evidence.md). Hook managers and `core.hooksPath` projects untested |
| ⛔ Real executor | Empty repo wiki -> bootstrap -> code change -> reconciliation -> cited recorded query -> captured decision -> release snapshot | S1, S2, S4, S6, S10 | Void: the product invokes no model. The equivalent obligation is now an **external agent** completing `ingest` → `publish` and `ask` → `answer` in a real project, which has not happened |

`npm run typecheck`, `npm test` and `npm run build` exist and are green.
The reference-question set, citation-accuracy measurement and cost accounting
were never built, and no longer apply in their original form: there is no model
result to score. What replaces them is unwritten — an agent-driven acceptance
pass on a real repository, which remains the largest gap in the evidence.

## Risks and boundaries

- No existing runtime callers are affected inside this repository. Consumer
  repositories are affected by installation; tests use disposable projects first.
- A Git SHA alone cannot certify working-tree knowledge. Preserve the input kind
  and content hashes rather than falsely stamping uncommitted input as a commit.
- Query/log growth can dominate retrieval. Keep record types filterable and rank
  current evidence separately; do not discard queries to reduce index size.
- Storing a source citation does not grant permission to export its derived text.
  Enforce configured source restrictions before model input and output publication.
- ⛔ A process adapter may not expose tokens. Enforce measurable limits and report
  missing accounting; do not advertise a token guarantee the adapter cannot enforce.
- ⛔ Real-executor acceptance depends on an available configured provider. Missing
  credentials leave that evidence pending, not the feature declared verified.
- New, 2026-09-09: the product no longer bounds what a model reads, because it
  no longer calls one. The scope restriction is enforced at `inventory`, which is
  what `ingest`, `ask` and `publish` all read from — but an agent holding the
  repository can read anything the configuration excludes. The boundary is
  advisory towards the agent and enforced only for what enters the wiki.

## Not doing

- No service-specific hosting, production deployment, vector database, or custom
  graph viewer in this plan. The CLI/library provides the accepted behavior.
- No copy-paste fork of either legacy parser; migrate content through one shared
  structured model so fixes apply to both sources.
- No copying the governance skill into every consumer as product implementation.
  Product capture can accept its journal as a future source without depending on it.
- No implementation journal reconstructed before coding. Start entries when
  implementation decisions actually occur after build-gate acceptance.

## Departures

2026-09-08: selected a JSON stdin/stdout command executor and a Claude Code bridge
after Daniel's "go". The bridge supplies context explicitly, disables tools and
project hooks, and accepts structured output. Verified invocation options against
the installed CLI help and https://code.claude.com/docs/en/headless.
Related decisions are recorded in journal.md as implementation proceeds.

2026-09-09: Widgetron scratch validation used a deterministic executor because
no provider credential was configured. This demonstrates protocol integration,
not real-model quality. Its concurrent read/write lock behavior is documented in
the journal and evidence; a shared-reader lock is deferred rather than added
without a tested concurrency design.

2026-09-09: Daniel rejected the executor architecture. `src/execution/` and the
Claude Code bridge were deleted; `maintain --once` stopped generating pages and
now only refreshes `.wikipoke/attention.json`; `ingest` became a bounded plan an
agent reads; `publish`, `answer` and `schema` became the agent's write path. The
milestone-4 text above is kept as accepted and marked ⛔.

2026-09-09: the file layout collapsed from one module per responsibility to
eight source files. No reason was recorded at the time, and this note does not
invent one. What the code shows is that the merged responsibilities all operate
on the same locked store — `src/wiki.ts` holds every command that takes the
write lock — and that the empty directories were not created as scaffolding.
The cost is visible: `src/wiki.ts` is the largest file, just under 300 lines.
The table above maps each planned path to where its responsibility ended up, or
records that nothing implements it.

2026-09-09, defect batch: an unreadable Markdown file inside `wiki/` used to
throw from `loadPages` and break every command; it is now an `invalid-page`
finding. Source `content` used to survive into published frontmatter through a
`passthrough()` on the source schema; the schema now strips unknown source
fields at `render`, the single write point. The post-commit hook used to
redirect `status` output into `attention.json`, which left a 0-byte file whenever
the command failed and wrote the whole graph when it succeeded; it now calls
`maintain --once` and lets the command own the write, bounded. The inventory
used to run one `git show` per file; it now batches through `cat-file`. `answer` used to record an evidence-free answer as `answered`; it
now distinguishes `unsupported`. Each decision is in
[journal.md](./journal.md); the measurements are in [evidence.md](./evidence.md).

Still open against this plan: FR-008, FR-009 and FR-014 have no implementation,
FR-011 has no read path, and no external agent has completed the loop on a real
repository. Nothing in this revision narrows the accepted scope — it records the
distance to it.
