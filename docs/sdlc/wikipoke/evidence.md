# Evidence: Wikipoke

Status: test evidence collected; human test gate remains open.

## Commands run

```text
$ npm run typecheck
> tsc --noEmit
Exit: 0

$ npm test
12 tests passed, 0 failed.

$ npm run build
> tsc
Exit: 0
```

The test suite covers structured OKF/profile round trips, graph links and
validation, Git source drift, no-op ingestion, failed/retried queries, citation
rejection, decision capture completeness, transaction recovery, concurrent
edits, path/symlink containment, command output/timeout bounds, snapshots, and
installer ownership behavior.

## Scratch Widgetron validation

Created `/private/tmp/wikipoke-widgetron.j8e3am/project` as a shared Git clone
of Widgetron and removed exactly its `wiki/` directory before initialization.
The scratch copy was intentionally independent from the original repository.

```text
$ node dist/cli.js --root <scratch> init --include 'packages/**' --include 'apps/**' --wiki wiki
initialized: true; automaticMaintenance: false

$ node dist/cli.js --root <scratch> install
installed: three .agents skills; generated .wikipoke/hooks/post-commit;
activated a delegating .git/hooks/post-commit because no existing hook was present

$ node dist/cli.js --root <scratch> status
pages: 0; uncovered sources reported; executorConfigured: false

$ node dist/cli.js --root <scratch> lint
[]

$ node dist/cli.js --root <scratch> ask ... --request-id widgetron-no-executor
No executor configured (exit 1); query page persisted
```

Configured a deterministic JSON test executor only inside the scratch directory,
with a one-file/one-job budget. `maintain --once` created
`wiki/entities/apps-playground-e2e-catalog-smoke-spec-ts.md` from a real
Widgetron source. `ask` then returned a cited source answer and `capture`
materialized a decision and implementation log. After committing the generated
scratch wiki, `snapshot widgetron-scratch` retained equal code and wiki commits
at `cf08186ef47c23deb5c29179fd4d5491b8c8159e`.

`doctor` reported executor configured, scheduler still required, an active hook,
and 338 pending source items. The test task remained `incomplete`
because no close event was deliberately submitted. This verifies that a hook or
event alone does not falsely certify decision capture.

## Limits and pending evidence

- No provider credential was used. The bundled Claude bridge was inspected
  against installed CLI help and official headless documentation, but has not
  completed a real provider request. Real-executor acceptance remains pending.
- The generated hook is intentionally a no-LLM notifier. It uses the project's
  locally installed `wikipoke` executable through `npx --no-install`; the
  scratch clone did not install the package, so its notifier exits harmlessly.
- The scratch clone exists only under `/private/tmp`; it is not a product fixture
  or a modification of Widgetron.
