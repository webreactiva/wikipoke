<!--
First paragraph: what changes for the person who uses wikipoke, in plain language. No file
names, no jargon: someone who has never read the code should understand it.
-->

Closes #

## 🎯 Intent

<!-- Why this change exists, and what must not break while making it. -->

## 🔀 Decisions

**🔒 Hard to undo**

<!--
Public once merged or released: flags, exit codes, output an agent parses, files written into
users' repositories, anything already published (issues, branches). Say why each one is worth it.
-->

-

**♻️ Reversible**

<!-- Internal choices: libraries, layout, thresholds, wording. Say what was discarded. -->

-

## 🗺️ What to keep in mind

<!--
What the next person, or agent, touching this area would get wrong without being told: things that
must change together, invariants a test does not guard, traps met on the way, what is left out
on purpose.
-->

-

## Changes

<!--
Show, don't list: a mermaid flow, a file tree as a diff, or an ASCII sketch of what a person sees.
Mermaid on GitHub: quote every label, nodes A["text"] and edges -->|"text"|. An unquoted edge
label containing "--" (like --yes) breaks the parser.
-->

## Checked

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `wikipoke init` with no terminal prints what `main` prints, if `init` or `hooks` changed

<!-- Plus anything run by hand, and how. -->
