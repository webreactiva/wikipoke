# Release validation

CI proves the CLI behaves. It does not prove the system works when an agent drives it: that the
agent finds the right command, follows the skills, and leaves a wiki `wikipoke check` accepts.
Before each release is tagged, run it end to end and log what happened here.

## The run

On a real repository, with at least one agent runtime, from the release candidate
(`npm run link` from the branch about to be tagged):

1. Install wikipoke, or upgrade an existing install, as the README tells a user to.
2. Seed or reconcile the wiki with `wikipoke-ingest`.
3. `wikipoke check`, and what the agent did with what it reported.
4. One `wikipoke-query` and one `wikipoke-lint`.

Give the agent the task as a user would phrase it, not the command: whether it finds the command
is part of what is being checked.

## The log

One file per run, `YYYY-MM-DD.md`, with:

- the wikipoke version or commit, the date, the agent runtime and the model class;
- what worked and what broke, step by step;
- the issue opened for each failure, or why none was needed.

Name no repository and copy nothing from it: the log is about what happened to wikipoke, not to
the project it ran on. A partial run is logged as partial, with the steps it skipped.
