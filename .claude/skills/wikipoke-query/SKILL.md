---
name: wikipoke-query
description: "Use for every question about how this repository's code behaves — how X works, what happens when Y, how it handles or avoids Z, where W lives, why it is built this way — in whatever language it is asked, and before any grep, glob or opening a source file. It answers from the code wiki first: the pages map the flows and cite the lines, so the answer takes fewer steps than exploring. When the wiki does not cover it, research the code, answer, and offer to file the answer back. Also when the user invokes /wikipoke-query or says 'ask the wiki', 'file this answer in the wiki'."
argument-hint: "<question>"
---
<!-- managed by wikipoke: `wikipoke init` rewrites this file. Project rules go in wiki/CONVENTIONS.md. -->

# wikipoke-query: answer, and let the wiki learn

Answer the question. If the wiki did not have it, offer to add it, so the next
reader finds it. This is what makes the wiki grow **where people actually go**
instead of where the index looks empty.

**Read `wiki/CONVENTIONS.md`** for the template before filing anything.

```
question ──► search wiki/  (the candidates' responsibility lines, or index.md → the page)
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

1. **Which page, before which text.** Put the question's most specific terms in this
   command (a status, a command, a table, an error; not a word the whole domain uses,
   which every page mentions). It answers with one line per candidate — the page and
   what it is responsible for — and costs a fraction of the pages themselves:
   ```sh
   grep -rilE "<term>|<synonym>" wiki --include='*.md' \
     --exclude='log.md' --exclude='CONVENTIONS.md' | head -20 | xargs grep -H -m1 '^responsibility:'
   ```
   The two exclusions matter: `log.md` records every pass and `CONVENTIONS.md` defines
   the vocabulary, so both match nearly any term and would crowd out the page that
   answers. When nothing matches, or the question names nothing concrete, read
   `wiki/index.md`: it carries the same line for every page in the wiki.
2. **Then read the pages you chose, whole**, in one step together — the one or two
   whose `responsibility:` answers the question, not every page that mentioned the
   word. What a step brings in is re-sent by every step after it, so reading five
   pages to answer from one is paid for again and again.
3. **A current page is the map, and its citations are the evidence.** Unless a
   notice this session said the wiki owes work, a page's `path:line` citations point
   where it says. Answer from the page and cite those lines: re-reading code the page
   already cites buys nothing. Open code only for what the page does not cover, and
   then read the lines around a citation (`sed -n '40,60p' <file>`), not the whole
   file and not by searching again, every range you need in the same step. Keep apart what
   the page keeps apart: two cases in neighbouring sentences are still two cases.
4. **Fall back to the code** for what the wiki does not have. Research the source,
   answer from it, and cite what you read as `path:line`. If a page you read is stale
   against the code, say so.
5. **Name the gap.** When the answer came from the code, say the wiki did not have
   it: the gap is a finding. So is a detail you had to open code for that the page
   should carry (what a command covers, a limit, which way a value or a flag works):
   added to that page, the next question stays in the wiki.
6. **Offer to file it back**, and where it fits: a **section** on an existing page
   when it extends one, a **new page** of the right type when it is its own unit,
   pattern or comparison. Write only on a yes.
7. **When filing:** the template, **narrow** `sources:` for what you actually read,
   `git rev-parse --short HEAD` as `synced:`, and `confidence: inferred` when the
   answer is your reading rather than something the code states. **Link the new
   page from the pages it relates to**, then add its line to `index.md` and an entry
   to `log.md` (`## <date> · wikipoke-query`).
8. **Re-read what you wrote against the question.** The next person will ask it with
   the page and nothing else: every fact your answer gave has to be there, each
   condition with all its cases (not "requires X" when a neighbouring case behaves
   differently), and nothing the page said before that the code contradicts. A section
   that only points at the code is not filed yet.
9. If you wrote anything, run `wikipoke check lint` and fix what it reports.

## Notes

- Descriptive, not normative: file what the code *does*, not what it *should* do.
- Don't file trivia, and don't restate the project's own contributor rules: link.
- Never touch `.wikipoke-state.json` and never re-stamp another page's `synced:`. Never
  modify code.
- The wiki says where to start looking, not where to stop. For inventory questions
  ("every place we do X"), do not accept an answer that rests on the wiki's silence.
