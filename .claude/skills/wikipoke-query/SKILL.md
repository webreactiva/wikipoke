---
name: wikipoke-query
description: "Answer a question about this codebase from the wiki first; when the wiki doesn't cover it, research the code, answer, and offer to file the answer back as a page or section, so the wiki grows from what people actually ask. Use when: (1) the user invokes /wikipoke-query, (2) the user asks how X works, where Y lives or why Z is like this in this repository, (3) the user says 'ask the wiki', 'pregunta al wiki', 'documenta la respuesta'."
argument-hint: "<question>"
---
<!-- managed by wikipoke: `wikipoke init` rewrites this file. Project rules go in wiki/CONVENTIONS.md. -->

# wikipoke-query: answer, and let the wiki learn

Answer the question. If the wiki did not have it, offer to add it, so the next
reader finds it. This is what makes the wiki grow **where people actually go**
instead of where the index looks empty.

**Read `wiki/CONVENTIONS.md`** for the template before filing anything.

```
question ──► search wiki/  (index.md → the pages it points to)
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

1. **Wiki first.** Start at `wiki/index.md`, then the pages it points to. If the
   answer is there, give it and cite the page(s). Done, nothing to file.
2. **Fall back to the code.** Research the source, answer from it, and cite what you
   read as `path:line`. If a page you read is stale against the code, say so.
3. **Name the gap.** When the answer came from the code, say the wiki did not have
   it: the gap is a finding.
4. **Offer to file it back**, and where it fits: a **section** on an existing page
   when it extends one, a **new page** of the right type when it is its own unit,
   pattern or comparison. Write only on a yes.
5. **When filing:** the template, **narrow** `sources:` for what you actually read,
   `git rev-parse --short HEAD` as `synced:`, and `confidence: inferred` when the
   answer is your reading rather than something the code states. **Link the new
   page from the pages it relates to**, then add its line to `index.md` and an entry
   to `log.md` (`## <date> · wikipoke-query`).
6. If you wrote anything, run `wikipoke check lint` and fix what it reports.

## Notes

- Descriptive, not normative: file what the code *does*, not what it *should* do.
- Don't file trivia, and don't restate the project's own contributor rules: link.
- Never touch `.wikipoke-state.json` and never re-stamp another page's `synced:`. Never
  modify code.
- The wiki says where to start looking, not where to stop. For inventory questions
  ("every place we do X"), do not accept an answer that rests on the wiki's silence.
