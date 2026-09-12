---
title: Hooks notify, they never write
type: decision
responsibility: Why no hook updates the wiki automatically, and why the notifier can never fail.
sources:
  - templates/wikipoke-hook.sh
  - templates/post-commit
synced: 68c8fa3
related:
  - ../components/hooks.md
---

**Decision.** Every hook runs the same notifier, which reports and stops. Writing the wiki always
takes a person launching `wikipoke-ingest`.

**The discarded alternative** is the obvious one: a post-commit hook that calls an agent to
reconcile the pages. It fails on both halves. Unattended writing produces pages nobody reviewed —
and an unreviewed page is worse than a missing one, because a reader trusts it. And a hook that
calls a model makes every commit slow, expensive and occasionally non-deterministic, in a place
where people expect neither latency nor cost.

**Three properties follow**, and all three are load-bearing:

- **It never fails.** Every path in `wiki/.wikipoke-hook.sh` ends in `exit 0`, including "wikipoke
  is not installed" and "not a git repository". A hook that can break a commit gets uninstalled.
- **It is silent when the wiki is current.** Which is why `drift` and `coverage` print nothing on a
  clean run — a notifier that speaks every time is muted within the week, and then speaks to nobody
  when it matters.
- **It exits early on an unseeded wiki.** No `.wikipoke-state.json`, nothing owed: installing
  wikipoke does not start nagging.

The agent-facing hooks put the same output in front of a model instead of a person, which is the
one place automation is welcome: the agent reads that the wiki is three commits behind and can
*offer* to run the skill. The offer is still a person's to accept.
