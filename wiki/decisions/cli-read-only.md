---
title: The CLI never writes a page
type: decision
responsibility: Why version 0.2 moved the writing out of the CLI and into the skills, and what was given up.
sources:
  - README.md
  - src/bin/wikipoke.ts
synced: 87d9fd0
confidence: inferred
related:
  - ../concepts/skills-as-product.md
  - ./notify-never-write.md
---

**Decision.** The three skills write the wiki; `wikipoke check` only measures. No publish step, no
staging area, no writer lock, no completeness seal.

**The discarded alternative was built and shipped.** Version 0.1, on this repository's `main`
history, put the CLI in charge of writing: it planned batches, staged pages, held a writer lock and
sealed a wiki as complete. The README records what happened to it — *"agents ended up driving the
CLI instead of following the skills, and every real run surfaced new rules to add"*. Two distinct
failures. The agent spent its attention operating a tool rather than reading code, and every rule
the tool learned had to be encoded in JavaScript, released, and installed, when the same rule as a
sentence in a skill would have taken effect on the next run.

There is a third, quieter failure in a writing CLI: a lock and a staging area only make sense if
something can be half-written. Pages written directly by an agent, one at a time, are never in a
half-state a tool has to protect.

**What it costs.** Nothing enforces the process. An agent can ignore a skill, and no lock stops two
sessions from writing the same page — so the guarantees moved from the process to the *artifact*:
the frontmatter contract, `sources:`, `synced:` and the link graph are all checkable after the fact
by `lint`, which is the reason they exist in that shape. The project keeps the line drawn in
`AGENTS.md`: CLI code is added only for a check that is deterministic and read-only.

The pressure comes back from the agents themselves. An OpenCode agent that mistyped the checkpoint
asked for a `wikipoke seal`, a command that would write it. The fix stayed on this side of the line
(`aafa306`): the skills write the checkpoint with a `printf` around `git rev-parse HEAD`, which
takes the typing away from the agent without giving the CLI its first write. A command that writes
one file is how 0.1 started. The next ask was a `wikipoke refresh`; `init` already refreshed the
skills, and what was missing was saying so, and listing the outdated hooks instead of rewriting
them.

This page is `confidence: inferred` about the reasoning: the outcome is documented in the README's
"Where this comes from", but the repository was squashed to a single commit, so the 0.1 code and
its history are not here to read.
