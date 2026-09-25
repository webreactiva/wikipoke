# Project instructions

- Communicate with Daniel in Spanish.
- Write project documentation in English.
- The skills govern the wiki; the CLI measures it and shows it, and never writes in it. New
  behaviour goes into a skill or into `templates/CONVENTIONS.md` first. Add CLI code only for a
  check that is deterministic and read-only, or to `wikipoke atlas`, which reads the wiki and
  writes only outside it; never make full coverage a precondition for anything.
- Templates are plain files under `templates/`, copied as they are. Do not move them into strings.
- The CLI is TypeScript in `src/`: run straight from source in development (Node strips the types)
  and shipped compiled from `dist/`. Imports name the `.ts` file, and only erasable syntax is
  allowed — no `enum`, no `namespace`, no parameter properties. Run `npm run typecheck` and
  `npm test` before committing.
- A pull request body follows `.github/pull_request_template.md`, including when it is opened
  with `gh pr create --body-file`, which skips the template.

<!-- wikipoke:start · managed by wikipoke: `wikipoke hooks remove agents` takes this block out -->
## Code wiki

This repository keeps a code wiki in `wiki/`, maintained with the skills in `.agents/skills/`:
`wikipoke-ingest` updates it, `wikipoke-query` answers from it, `wikipoke-lint` reviews it. At
the start of a session, run `sh wiki/.wikipoke-hook.sh` and act on what it prints; it is silent
when the wiki is current.
<!-- wikipoke:end -->
