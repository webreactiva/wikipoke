# Wikipoke: a library for maintaining connected knowledge

Status: product and architecture proposal; not implemented.
Date: 2026-09-08. Commands and contracts below are proposed interfaces.
This is the English edition of the proposal developed in the project conversation.

## 1. Objective

Build a library that turns changing sources into a persistent, verifiable,
connected wiki. The first source adapter understands software repositories;
the core must also accommodate documents, published content, and other sources.

One knowledge unit can synthesize several sources, and one source can affect
several units. Each unit has a clear responsibility: explaining a concept,
entity, flow, decision, or synthesis.

Editorial value comes from behavior, invariants, documented rationale,
alternatives, and connections. Link to signatures and inventories already
produced by project tooling. Mark inferred rationale as inference; never invent
an author's intention.

## 2. Existing implementations

| Aspect | Widgetron | Web Reactiva | Proposed combination |
| --- | --- | --- | --- |
| Unit | Architecture, entity, flow, concept, decision | Topic and concept with multiple sources | Extensible profiles |
| Evidence | Code paths and per-page commit | Sources and audio/video moments | Versioned references with locators |
| Updates | Global checkpoint and per-page drift | Skill-guided ingestion | Incremental reconciliation with a persistent queue |
| Integrity | Metadata, links, sources, coverage, orphans | Resolved and reciprocal links | Separate structural and semantic checks |
| Queries | Wiki first, code for gaps | Content and fragment search | Page retrieval, graph expansion, source verification |
| Presentation | Repository Markdown | Quartz separated from content | Independent exporters |

Findings from the local implementations:

- Widgetron's hook only notifies, never invokes an LLM, and exits when
  `.state.json` is absent. It does not provide autonomous bootstrap.
- Its engine distinguishes coverage from drift. Keep that distinction: listing
  a source path does not establish that its behavior is adequately explained.
- Web Reactiva requires reciprocal `Relacionado` links. That fits association,
  but dependencies need direction: A depending on B does not imply the reverse.
- The specialized parsers rely on regular expressions and textual conventions.
  The knowledge-card skill documents silent losses of fields and moments. The
  shared engine should use a YAML parser and Markdown AST, preserve unknown
  fields, and report material it cannot interpret.
- Widgetron avoids wikilinks because they collide with its RichText syntax.
  Import both existing link forms and emit ordinary Markdown links.

Local evidence: [Widgetron conventions](../../widgetron/wiki/CONVENTIONS.md),
[hook](../../widgetron/scripts/wiki-hook.sh),
[query skill](../../widgetron/.claude/skills/wiki-query/SKILL.md),
[Web Reactiva architecture](../../webreactiva-wiki/README.md),
[card parser](../../webreactiva-wiki/.claude/skills/genera-fichas-conocimiento/scripts/lib-fichas.mjs),
and [graph validator](../../webreactiva-wiki/.claude/skills/genera-fichas-conocimiento/scripts/validate.mjs).
These sibling-repository references require the original local checkouts.

## 3. Conceptual foundation and compatibility

LLM Wiki supplies the persistent knowledge workflow: ingestion, queries, and
review, with sources separated from synthesized knowledge. It is a working
pattern, not a software dependency.
[Karpathy's original note](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

OKF means Open Knowledge Format. The specification consulted was v0.2:
Markdown with YAML frontmatter, required `type`, path-based identity, Markdown
links, and provenance, verification, and lifecycle fields. Wikipoke proposes
extensions for revision tracking and typed relationships while retaining
readability by OKF consumers. Editorial checks can be stricter than basic
conformance: unresolved imported links can become maintenance findings.
[OKF specification](https://raw.githubusercontent.com/GoogleCloudPlatform/knowledge-catalog/main/okf/SPEC.md).

Pin the supported format version in the bundle and the profile version in
configuration. Specification upgrades require explicit migrations and
compatibility checks.

## 4. Knowledge model and graph

### Documents and identity

Each page has a type, title, description, sources, and body. The code profile
offers `architecture`, `entity`, `flow`, `concept`, `decision`, `query`, and
`implementation-log`. Other profiles can introduce types without changing the
engine.

Public identity is the concept's path within its bundle. A proposed immutable
`wikipoke.uid` tracks the same unit through moves. Rename mappings update
references and preserve export redirects; the UID does not replace OKF identity.

### Sources and evidence

References identify what was read and allow that version to be retrieved:

- Code: repository, path, full commit, content hash, and useful symbol/line locators.
- Document: URI or path, hash, and section locator.
- Audio/video: identifier, transcript revision, and time range.
- Remote source: provider identifier, available revision, and retrieval date.
  An ETag helps detect changes; it does not establish semantic freshness.
- Agent activity: event identity, task/session, actor, date, declared rationale,
  and change/check references. This establishes what the agent recorded;
  verifying implementation still requires inspecting the software.

Store revisions in a source-associated profile extension. Non-Git sources do
not require a SHA. Local repositories without remotes need an origin identifier
and an adapter-resolvable locator; exports preserve access or disclose its limits.

Important claims and relationships cite specific evidence. Distinguish observed
facts, inferences, and unresolved questions. Model-generated confidence scores
do not substitute for evidence.

### First-class relationships

Each declared relationship has an implicit origin, target, type, evidence, and
an `observed` or `inferred` basis. Targets may address individual page anchors.

| Proposed relation | Direction | Meaning |
| --- | --- | --- |
| `part_of` | Directed | An entity belongs to a subsystem |
| `depends_on` | Directed | A component or flow needs another |
| `implements` | Directed | A component realizes a concept or decision |
| `motivated_by` | Directed | A decision responds to a documented constraint |
| `supersedes` | Directed | A decision or explanation replaces another |
| `contradicts` | Symmetric | Claims conflict |
| `related_to` | Symmetric | Editorial association without more specific meaning |
| `asks_about` | Directed | A query concerns a knowledge unit |
| `answers` | Directed | A response or synthesis answers a query |
| `records` | Directed | An implementation log records a decision |
| `prompted_by` | Directed | A decision arose from a recorded query or task |

Compute backlinks rather than requiring duplicate edges. Prose links produce
navigation edges (`links_to`), not inferred dependencies. Citations produce
provenance edges. Tags classify content without implying relationships. A
visualizer can expose these graph layers separately.

Typed relationships are authoritative in `wikipoke.relations` frontmatter. A
readable relationship section derives ordinary Markdown links from that data;
validation detects divergence. The remaining prose stays free-form. Imported
untyped relationships remain untyped.

Example profile extension, not standard OKF fields:

```yaml
wikipoke:
  uid: flow-checkout
  relations:
    - type: depends_on
      target: /entities/payment-gateway.md
      evidence: [checkout-handler]
      basis: observed
```

Provide neighbors, backlinks, paths, and bounded impact analysis. Dependencies
can trigger review; generic associations expand retrieval. Validate cycles by
type: circular association may be valid, a replacement cycle is not.
Reconstruct the exported graph from documents and references; the initial
version does not need a graph database.

## 5. Required operations

### Bootstrap

`init` inspects sources and existing documentation, installs configuration and
integrations, and prepares ingestion. With an executor configured, bootstrap
starts without another prompt. Without one, retain pending work and explain
the missing capability.

First generate a project map and essential pages, then continue through a
visible coverage backlog in bounded, resumable batches. Stop at the configured
scope or budget. Never describe a small seed as complete documentation.

### Discover changes

Inventory and compare source revisions, including Git additions, edits,
deletions, and renames. Separate committed input from an optional working-tree
view, including permitted new files. Periodic full checks recover missed events.

New sources can expose gaps without existing pages. Manual wiki edits require
reindexing and relationship validation. Source deletion preserves historical
traceability and produces retired references or findings rather than removing
all associated knowledge.

### Reconcile

```text
event -> inventory/diff -> deduplicated queue -> impact plan
      -> read sources -> propose pages and relationships
      -> validate -> apply -> record and checkpoint
```

Include directly affected pages and dependency candidates. Source changes mean
review is needed, not that claims are false. Review may confirm existing text
and record why it remains valid.

Each job retains input revisions, planned pages, and results. Apply through a
recoverable transaction: lock, staging, validation, input-version recheck, and
journaled publication. Recalculate pending work if inputs change. Detect manual
concurrent edits by hash and do not overwrite them.

Keep separate markers for the latest observed inventory, reconciled change set,
and checked page/source revisions. Partial jobs cannot advance the global
checkpoint past failed work. Initial coverage debt remains visible without new
commits. Branches and worktrees have separate operational state. Rebases,
shallow history, and inaccessible checkpoints trigger hash comparison or a new
scan, never a false freshness claim. Reprocessing a revision does not duplicate
pages or relationships.

### Review health

Report independent dimensions: structural integrity, source drift, time/policy
expiry, structural source coverage, and semantic quality. Semantic review looks
for contradictions, unsupported claims, duplicates, thin explanations, and
missing flows. It records findings and may enqueue fixes under project policy.

Structural lint is deterministic and does not invoke an LLM. Passing lint does
not verify meaning; unchanged sources do not prove old inferences correct.

### Answer and preserve queries

Search titles, descriptions, aliases, and bodies; expand through relevant
relationships and check selected evidence for freshness. Read authorized
sources when the wiki is incomplete, and disclose gaps. Return an answer,
citations, consulted revisions, uncertainty, and pages used. Wiki silence does
not establish that a capability is absent. Disclose inaccessible sources.

Every query becomes a versioned, searchable `query` page, including unanswered,
failed, or cancelled requests. Persist the original question before invoking
the model, then attach the delivered response. Record date, request ID, actor
when available, scope, citations, revisions, gaps, and execution state.

Separate invocations retain separate identities even when their question is
identical. Technical retries with the same ID do not duplicate records. Later
answers are identified revisions that preserve the original delivered answer.
Operational states (`pending`, `answered`, `failed`, `cancelled`) belong in
`wikipoke.query`, separately from editorial lifecycle.

Queries connect through `asks_about`; resulting syntheses can link back through
`answers`. Preserve evidence through citations. Capturing a query does not
depend on promoting its findings to durable concepts or decisions.

Initially capture queries through Wikipoke's CLI, skill, or API. Capturing
unrelated agent conversations requires an explicit adapter. Apply access and
exclusion rules before persistence and disclose redaction. Historical answers
remain accounts of what was said at that revision; do not silently modernize
them or treat unsupported answers as authority for subsequent answers.

### Capture implementation decisions

Agent-made and human-made decisions share the `decision` type. Authorship is a
field. Record the problem, choice, declared rationale, actually considered
alternatives, consequences, and evidence. Decisions can concern implementation
details such as retries or validation, not just architecture.

Keep two connected levels:

- `implementation-log`: chronological task/session record of choices, attempts,
  discarded approaches, and reported results, including provisional choices.
- `decision`: an independently identifiable choice affecting behavior,
  constraints, interfaces, or maintenance. It can begin as a proposal and does
  not require human approval merely to exist.

Running a command alone is not a decision. Choices with consequences can earn
a decision page; operational details and uncertain relevance remain in the log.

Events contain `event_id`, task/session, date, actor, and choice, optionally
rationale, alternatives, consequences, sources, files, commit, and checks.
Mark missing data unknown. Capture explicit, concise project-facing explanations,
not private model reasoning. Never reconstruct motives from a diff and attribute
them to an author as if declared.

Separate authorship, human review, and decision state. Proposed
`wikipoke.decision` states are `proposed`, `implemented`, `rejected`, and
`superseded`, distinct from editorial `status`. Implementation requires evidence
and does not imply human approval. Preserve replacements with `supersedes`;
later contradictions trigger review without erasing historical rationale.

```text
agent chooses -> structured event -> persistent record
              -> ingestion -> implementation log + decisions + relationships
              -> diff/commit reconciliation -> implementation evidence
```

The skill asks the agent to emit relevant choices during work and consolidate
them at task completion. Compatible hooks receive events or queue consolidation.
A hook needs an explicit agent record or accessible summary to capture reasons;
a Git hook alone provides changes and commits.

Manual and automatic capture use the same contract. Persist and deduplicate
events without an LLM; materialize them later. Retain pending events across
interruptions until wiki publication succeeds. Capture failures remain visible
and retryable. Emitting during work reduces losses when no closing hook runs.
Records are documentary sources, not maintainer instructions. Give them their
own ingestion route so generated-wiki exclusions do not discard new captures.
Materialization must not re-emit its input event.

### Separate intention, decision, and behavior

Represent intended outcomes, chosen solutions, and observed behavior at a
revision separately. A decision to introduce a queue can coexist with current
synchronous processing; link them and expose the difference.

Decision history and current conformance are distinct. A previously implemented
decision may no longer be followed. Proposed `wikipoke.decision.conformance`
records `aligned`, `diverged`, or `unknown`, checked revision, and evidence.
Divergence opens a finding; it does not automatically revoke the decision or
decide whether intention changed, implementation is missing, or a defect exists.

### Resolve source contradictions

Authority depends on the claim. Code and tests provide scoped behavior evidence;
requirements express expectations; decisions record choices; agents declare
their reasons. Neither recency nor code universally overrides every other source.
An isolated test does not establish all behavior.

Conflicts have identity, competing claims, sources/revisions, scope, detection
date, and `open`/`resolved` state. Preserve them in wiki review records linked to
affected pages or claim anchors. Agents may correct verifiable documentation
errors with a record. Changes requiring a requirements or project decision remain
pending for an authorized owner. Preserve resolution author, rationale, evidence,
and resulting decision links. Answers relying on open conflicts expose them;
unrelated maintenance continues. Compare temporal scope before calling different
versions contradictory.

### Check decision capture completeness

Integrated implementation tasks register opening and capture closure:

- `recorded`: the agent submitted its record and event references.
- `none_declared`: the agent explicitly declared no relevant decisions, with a
  brief explanation.
- `incomplete`: closure is absent, the record is partial, or capture failed.

Transport and materialization have separate states. A successful hook is not
proof of captured decisions. Submission does not prove every choice was stated;
absence declarations are attributed reports, not deductions from empty logs.
Detect closed tasks without declarations and events awaiting materialization.
Interrupted tasks remain incomplete until recovered or explicitly qualified.
Audits may compare diffs with declarations to flag omissions, never invent reasons.
Report incomplete capture separately from code coverage. This guarantee covers
observed, registered tasks only, not sessions the integration never saw.

### Git-backed historical capture

Initially capture history at releases/tags through a manual command or release
pipeline. Record exact code and wiki commits, date, release label, checkpoint,
and check results. Full commit IDs fix versions; tags provide readable names.
No specialized temporal query engine is required.

Before declaring reconciliation, finish ingestion against the target and check
its pending work. Record missing sources, open conflicts, and incomplete task
capture without claiming completeness. The wiki snapshot must be committed;
uncommitted content is not a reproducible capture.

Write manifests under `.wikipoke/releases/`, outside the bundle, after both
commits exist, avoiding a self-referential commit hash. Code and wiki may live
in one or two repositories. Preserve durable Git references to captured commits.

Read historical files without modifying them, for example through a separate
worktree, using ordinary queries with fixed scope. Store the new query record
in the active wiki with snapshot references. Rebuild the graph at that revision.
Git does not archive external sources automatically; disclose unavailable source
versions. Specialized historical indexes and automatic temporal comparisons
are outside this initial delivery.

### Corrections through agents

Users can correct generated pages through their project AI agent using ordinary
editing, validation, and change recording, preserving evidence and attribution
when available. No separate human-correction workflow is planned initially.
Concurrent-edit detection and conflict-resolution rules still apply.

## 6. Library architecture

Proposed starting point: TypeScript on Node, consistent with existing engines.
The documented project's language is independent. Projects without Node can
run the CLI in CI or a container; runtime requirements remain explicit.

Start with one package, internal modules, and a small public API:

| Module | Responsibility |
| --- | --- |
| `core` | Model, parsing, validation, graph, impact, checkpoints |
| `sources` | Inventory, versioned reads, comparison, locators |
| `capture` | Query/event persistence, deduplication, wiki materialization |
| `runtime` | Queue, budgets, retries, locking, change application |
| `agents` | LLM execution contract and structured results |
| `retrieval` | Local search and bounded graph expansion |
| `integrations` | CLI, installer, hooks, skill templates |
| `exporters` | Portable Markdown, graph JSON, visualizer connections |

Illustrative contracts; supporting types will be defined during implementation:

```ts
interface SourceAdapter {
  discover(scope: Scope): Promise<SourceInventory>;
  diff(previous: Snapshot, current: Snapshot): Promise<SourceChange[]>;
  read(ref: VersionedSourceRef): Promise<SourceContent>;
}
interface AgentAdapter {
  ingest(input: IngestContext): Promise<KnowledgePatch>;
  review(input: ReviewContext): Promise<Finding[]>;
  answer(input: QueryContext): Promise<CitedAnswer>;
}
```

The engine determines scope and allowed operations and validates agent proposals.
Prompts and skills must not maintain parallel parser, graph, or state logic.

## 7. Project integration

Proposed structure; the wiki location is configurable:

```text
project/
  wikipoke.config.yaml       # profile, sources, executor, policy
  wiki/                     # versioned portable bundle
    index.md
    log.md
    architecture.md
    concepts/
    entities/
    flows/
    decisions/
    queries/                # question, responses, evidence per request
    implementation-logs/    # task/session activity and choices
  .wikipoke/
    conventions.md          # instructions outside the concept bundle
    state.json              # portable reconciliation checkpoint
    local/                  # queue, locks, caches, traces; Git-ignored
    releases/               # historical capture manifests
```

Configuration declares allowed/excluded paths, language, documentary scope,
source adapter, executor, and maintenance policy. Resolve credentials from the
environment. Caches and derived indexes are rebuildable; new clones rediscover
source work from checkpoints. Pending query/decision events are durable input,
not disposable cache, and must survive until materialized.

Proposed commands, not a published package:

```sh
wikipoke init --profile code --agent <adapter>
wikipoke ingest                         # bootstrap or reconcile
wikipoke ingest src/payments            # targeted ingestion
wikipoke status --json                  # health and pending work
wikipoke lint                           # no LLM
wikipoke review --deep                  # semantic audit
wikipoke ask "How is a payment validated?"
wikipoke capture decisions --file decisions.json
wikipoke snapshot --release v1.0.0 --ref <commit>
wikipoke maintain --once                # consume queued work
wikipoke graph --format json
wikipoke doctor                         # check installation capabilities
```

Installation is idempotent, detects existing integrations, and owns only its
managed entries. Respect existing hooks/managers, `core.hooksPath`, project
instructions, and configuration. Uninstall removes owned entries while keeping
knowledge and previous integrations.

| Integration | Role |
| --- | --- |
| Commit/merge/checkout hook | Fast notification or enqueueing without an LLM |
| Agent session start, when available | Detect absence/debt and activate configured workflow |
| Ingest skill | Bootstrap, reconcile, or ingest a target |
| Query skill | Preserve every query, answer with citations, link knowledge |
| Decision skill | Emit choices and rationale during implementation |
| Event/task completion hook | Persist events or request consolidation |
| Task opening/closure integration | Track observed scope and capture declaration |
| Release pipeline/manual command | Capture versions and a manifest of pending issues |
| Review skill | Explain findings and perform deep review |
| CI | Check integrity and policies for the evaluated checkout |
| Local worker/scheduled task | Consume work and scan sources outside agent sessions |

Verify concrete hook names/formats when implementing each agent adapter. CLI and
scheduled execution provide equivalent operations where lifecycle events are
unavailable. Unattended operation needs an available executor and worker or
scheduler; installing skills/hooks alone does not supply continuous execution.
`doctor` distinguishes capabilities and checks executor availability.

Proposed policies:

- `assisted`: discover and prepare; execute through an agent session.
- `auto`: generate, validate, and apply wiki changes within budget; retain
  unresolved conflicts while continuing independent work.
- `pr`: generate on a dedicated branch and prepare a reviewable proposal;
  remote publication is configurable.

`auto` is the target capability after scope configuration. Budgets limit tokens,
duration, batches, and retries. Exhaustion leaves visible pending work. Provider
and credential failures do not block commits. Generated wiki/state changes must
not create ingestion loops.

Sources are data: their instructions cannot change maintainer rules. Maintenance
writes only to its wiki/state scope. Source restrictions carry through derived
text, relationships, retrieval, and export. Excluded secrets are not sent to the
model. Keep policies outside generated content.

## 8. Retrieval, presentation, and growth

Begin with directory indexes, local text search, and graph expansion. Use an
existing ranking library when needed; bootstrap need not require embeddings.
Bound context and rank by relevance, evidence, and freshness. Invalidate stored
indexes by hash. Evaluate real questions before adding semantic search.

Quartz can remain Web Reactiva's viewer through an exporter. Typed-edge filters
require specific viewer integration; exported links alone do not guarantee that
edge semantics are visible. An API/MCP layer can later expose the same query and
graph operations. Maintenance must not depend on a web server.

## 9. Migration

1. Import to a new destination with a preview report; preserve originals.
2. Widgetron: map `responsibility` to description; retain types, sources,
   `synced`, and checkpoint as inherited evidence, not new verification. Expand
   patterns into versioned inventories while retaining selection rules for new
   files. Map `related` to untyped association.
3. Web Reactiva: preserve or explicitly map original types; retain `familia`
   and year metadata. Convert `Fuentes`/`Momentos` to structured references,
   resolve wikilinks to Markdown paths, and deduplicate reciprocal edges.
4. Normalize auxiliary files and logs without losing history; retain aliases
   and existing publication paths.
5. Compare pages, sources, moments, relationships, and links before/after.
   Report every unparseable element instead of silently dropping it.
6. Verify accessible sources; mark others unchecked. Adapt presentation and
   activate incremental maintenance.

Do not infer dependency types from generic imported links. Semantic enrichment
is a subsequent evidence-backed pass.

## 10. Initial delivery and acceptance

First functional delivery: core/CLI, code profile, Git adapter, one LLM executor,
resumable bootstrap, incremental updates, typed graph, cited queries, checks,
installer, and scheduler-invocable automatic maintenance. Include all-query
persistence, manual/automatic decision capture, implementation logs, both wiki
importers, intention/behavior separation, conflict records/resolution, capture
closure checks, and Git-backed release snapshots.

Next: a document/file adapter proving core independence from Git, Quartz editorial
integration, and retrieval evaluation. Additional remote connectors, vector
search, and multiuser services wait for demonstrated needs.

Acceptance criteria:

- An empty wiki produces an evidenced map, pages, and backlog without a bootstrap prompt.
- Source changes review relevant pages/dependencies without changing source code.
- Unchanged ingestion creates no semantic edits or duplicates.
- Failed batches retain correct checkpoints and can resume.
- Renames, deletions, rebases, shallow clones, and worktrees never yield false freshness.
- Concurrent manual edits are not overwritten.
- Initial coverage debt is detected even without further commits.
- Answers cite verifiable evidence and disclose gaps, stale sources, and conflicts.
- Every query survives model failure; new invocations remain distinct and retries deduplicate.
- Historical answers retain their evidence and are distinguishable from current verification.
- Agent choices appear in logs and, when independently relevant, linked decision pages.
- Manual and automatic capture disclose missing rationale instead of inventing it.
- Proposed choices, verified implementation, human review, and replaced/rejected choices remain distinct.
- Capture interruptions resume without event loss, duplicates, or generated-file loops.
- Unimplemented intent is not reported as behavior; later nonconformance creates a finding.
- Conflicts preserve scope, competing evidence, and resolution history.
- Successful hooks without records or absence declarations leave capture incomplete.
- Unobserved tasks are not counted as verified.
- Release captures retain recoverable commits and health manifests; queries neither mutate snapshots nor mix in HEAD.
- Graph reconstruction preserves navigation, dependencies, provenance, and identity across moves.
- Import/export loses no sources, moments, relationships, or unknown fields silently.
- Reinstallation does not duplicate hooks; uninstall preserves prior hooks and knowledge.
- Without an LLM, reading, text search, graphs, and mechanical checks work; generation stays visibly pending.

Validate with Git-change fixtures, real-card migrations, and reference questions
with expected evidence. Measure citation accuracy, missed affected pages,
unnecessary rewrites, and update cost. Semantic review reduces errors without
promising absolute truth.
