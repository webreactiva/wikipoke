# Project instructions

- Communicate with Daniel in Spanish.
- Write project documentation in English.
- The skills govern the wiki; the CLI only measures. New behaviour goes into a skill or into
  `templates/CONVENTIONS.md` first. Add CLI code only for a check that is deterministic and
  read-only, and never make full coverage a precondition for anything.
- Templates are plain files under `templates/`, copied as they are. Do not move them into strings.
- The CLI is TypeScript in `src/`: run straight from source in development (Node strips the types)
  and shipped compiled from `dist/`. Imports name the `.ts` file, and only erasable syntax is
  allowed — no `enum`, no `namespace`, no parameter properties. Run `npm run typecheck` and
  `npm test` before committing.
