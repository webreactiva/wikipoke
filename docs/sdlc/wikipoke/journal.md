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
