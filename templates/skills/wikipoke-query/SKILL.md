---
name: wikipoke-query
description: "Answer any question about how this repository's code behaves from its code wiki first, before grepping or opening source files: the wiki's pages already map the flows and cite the lines, so an answer takes fewer steps than exploring. When the wiki does not cover it, research the code, answer, and offer to file the answer back. Use for every question about this codebase, in any language and any phrasing: how X works, what happens when Y, how it handles or avoids Z, where W lives, why it is built this way ('¿cómo funciona…?', '¿qué pasa cuando…?', '¿cómo evita…?', '¿dónde está…?', '¿por qué…?'). Also when the user invokes /wikipoke-query or says 'ask the wiki', 'pregunta al wiki', 'documenta la respuesta'."
argument-hint: "<question>"
---
<!-- managed by wikipoke: `wikipoke init` rewrites this file. Project rules go in {{WIKI}}/CONVENTIONS.md. -->

# wikipoke-query: answer, and let the wiki learn

Answer the question. If the wiki did not have it, offer to add it, so the next
reader finds it. This is what makes the wiki grow **where people actually go**
instead of where the index looks empty.

**Read `{{WIKI}}/CONVENTIONS.md`** for the template before filing anything.

```
question ──► search {{WIKI}}/  (index.md → the pages it points to)
                │ found ──► answer + cite the page(s)             · DONE
                │ not found
                ▼
            research the code ──► answer + cite path:line
                │
                ▼
            offer to file it back ──► a section on an existing page
                                      or a new page of the right type
                │ only on a yes
                ▼
            write · link it from its siblings · index.md · log.md
            (never moves .wikipoke-state.json)
```

## Steps

1. **Wiki first, in as few steps as you can.** Read `{{WIKI}}/index.md`, then every
   page whose line matches the question **in one step, together**. Each step re-sends
   the whole conversation, so three pages read at once cost about a third of three
   read one after another.
2. **A current page is the map, and its citations are the evidence.** Unless a
   notice this session said the wiki owes work, a page's `path:line` citations point
   where it says. Answer from the page and cite those lines. Open code only for what
   the page does not cover, or to confirm the one claim your answer turns on — at its
   cited line, not by searching again. Keep apart what the page keeps apart: two
   cases in neighbouring sentences are still two cases.
3. **Fall back to the code** for what the wiki does not have. Research the source,
   answer from it, and cite what you read as `path:line`. If a page you read is stale
   against the code, say so.
4. **Name the gap.** When the answer came from the code, say the wiki did not have
   it: the gap is a finding.
5. **Offer to file it back**, and where it fits: a **section** on an existing page
   when it extends one, a **new page** of the right type when it is its own unit,
   pattern or comparison. Write only on a yes.
6. **When filing:** the template, **narrow** `sources:` for what you actually read,
   `git rev-parse --short HEAD` as `synced:`, and `confidence: inferred` when the
   answer is your reading rather than something the code states. **Link the new
   page from the pages it relates to**, then add its line to `index.md` and an entry
   to `log.md` (`## <date> · wikipoke-query`).
7. If you wrote anything, run `wikipoke check lint` and fix what it reports.

## Notes

- Descriptive, not normative: file what the code *does*, not what it *should* do.
- Don't file trivia, and don't restate the project's own contributor rules: link.
- Never touch `.wikipoke-state.json` and never re-stamp another page's `synced:`. Never
  modify code.
- The wiki says where to start looking, not where to stop. For inventory questions
  ("every place we do X"), do not accept an answer that rests on the wiki's silence.
