# Log

## 2026-10-11

* **wikipoke-ingest**: reconciled 3 commits since `ecc7b09` — the trust-keys release (#5).
  - components/checks.md: lint reads a `{` value under `generated:`/`verified:` as the OKF trust
    map and checks its shape — one `{ by, at }`, an OKF §7 actor, an ISO time with its offset —
    instead of warning about a misread (6f2b5f6); citations re-pointed for the inserted code
    (297→322, 348→373).
  - components/skills.md: the four wiki skills say what a pass stamps now — ingest marks every page
    it touches, lint's claim fix stamps `generated:` and a link or typo neither, query and the
    decision draft carry `generated:` (7526c5e); the "Where each type comes from" citation
    re-pointed (158→164).
  - concepts/schema-lives-in-the-wiki.md: the trust keys are schema prose under "The one template";
    lint owns only the shape check.
  - concepts/skills-as-product.md: #5 as the judgement/determinism split — prose in four skills and
    the four-case table, 25 lines of src/ for the shape check.
  - flows/ingest-pass.md: the reconcile re-stamp names its kind, `generated:` for rewritten claims
    and `verified:` for re-read-and-true (7526c5e); citation re-pointed (158→164).
  - flows/check.md, concepts/over-broad-sources.md, concepts/two-axes-of-staleness.md,
    decisions/plain-markdown-links.md: re-read against the diff, nothing they claim moved, and
    re-stamped.
  - decisions/capture-decisions.md: citations re-pointed (199→220, 211→232, 221→242), claims
    unchanged. No inbox notes; no `planned: true` pages to sweep.

* **wikipoke-ingest**: reconciled 2 commits since `1097b15` — the page-types evidence release (#20).
  - components/skills.md, flows/ingest-pass.md: what a page of each type holds is now an entry under
    "Where each type comes from" in CONVENTIONS.md, which ingest and query read and lint's
    missing-kind lens enforces for added types (ecc7b09); the skill's own table demoted to fallback.
  - concepts/schema-lives-in-the-wiki.md: adding a type needs the table row **and** the evidence
    entry; a fourth schema section read by the skills, not by the checker.
  - concepts/skills-as-product.md: #20 as the limit case — a behaviour change with no line of src/.
  - concepts/two-axes-of-staleness.md: re-read against the diff (nothing it claims moved) and
    re-stamped.
  - decisions/capture-decisions.md: CONVENTIONS citations re-pointed for the inserted section
    (176→199, 188→211, 198→221).

* **wikipoke-ingest**: reconciled 9 commits since `dbfe0cf` — the `wikipoke-decision` release (#19).
  - components/skills.md: the sixth skill documented; the query skill answers with the `planned:`/
    `deprecated` caveats, lint's deep pass gained the planned-decisions lens (3e94960), and
    reconcile now reads every planned page, stale or not (9c722ab).
  - decisions/capture-decisions.md: the decision-page lifecycle ("On the page" keys, f4554ee/
    d34957f/9c722ab) and the way in that skips the inbox (the first page written with it:
    decisions/own-viewer.md); its CONVENTIONS citations re-pointed to the new lines (173→176,
    183→188, 193→198).
  - flows/ingest-pass.md: supersede marks the old page `status: deprecated` once the code follows,
    and the `planned: true` sweep joins Mode B.
  - concepts/schema-lives-in-the-wiki.md, concepts/skills-as-product.md, concepts/two-axes-of-
    staleness.md: the bar's person exception, the one-code-line proof (`src/lib/install.ts:25`),
    planned staleness; components/install.md, flows/install.md: the sixth skill in `SKILLS`;
    concepts/file-ownership.md re-read against the diff (nothing it claims moved) and re-stamped.

* **wikipoke-decision**: new decisions/own-viewer.md — own HTML viewer over a third-party one
  (Obsidian), to control how the wiki looks.

## 2026-10-03

* **wikipoke-ingest**: reconciled 4 commits since `6a9925f`, from more OpenCode runs on copies of
  atalaya-lab.
  - decisions/capture-decisions.md, components/hooks.md, components/skills.md: the diff sweep
    before closing, and a `pending` notice that leaves page citations alone.

* **wikipoke-ingest**: reconciled 1 commit since `ee3921c`, wording from an OpenCode run on a
  copy of atalaya-lab.
  - decisions/capture-decisions.md, components/skills.md, flows/ingest-pass.md: one decision per
    note, and a bundled note judged one decision at a time.
  - The other ten stale pages re-read against the diff (the invitation's hook count, the same
    wording in the templates) and re-stamped; nothing they claim changed.

## 2026-10-02

* **wikipoke-ingest**: reconciled 24 commits since `542edcd`: YAML-safe frontmatter (#4), the
  "Never a source" list (#6), the wiki as an OKF v0.2 bundle (#9), a stricter `--dir` (#11), and
  decision capture (#18).
  - Rewrote this log in the OKF shape, newest first, one heading per day; no old entry changed.
  - Drained the inbox: 2 notes, both kept, into one page. new: decisions/capture-decisions.md, the
    strict bar in CONVENTIONS.md that the project owns (from a note by the person), and the
    uncommitted inbox with a hook that is not a notifier (from a note by the agent, extended in).
    No note dropped.
  - components/hooks.md: a sixth hook, `decisions`, that runs no notifier; now sources
    `templates/agents-decisions.md`. components/install.md: two `AGENTS.md` blocks updated in place,
    the inbox's `.gitignore`, the OKF hint for an older `CONVENTIONS.md`. components/cli.md:
    `pending` before seeding, the invitation that counts only notifiers. components/checks.md:
    `pending` in drift, the never-a-source, YAML, OKF and log warnings in lint. components/lib.md:
    `chooseWiki` refusals, `neverSources`, YAML-exact unquoting, the inbox. components/skills.md:
    `wikipoke-implement`, the ingest's drain, the OKF log shape. components/atlas.md: the OKF
    frontmatter atlas strips from the two documents.
  - architecture.md, the three flows, and concepts file-ownership, schema-lives-in-the-wiki,
    skills-as-product, over-broad-sources, two-axes-of-staleness and coverage-as-debt: what each of
    those changes means for them. decisions cli-read-only (the inbox does not move the line) and
    interactive-init (the sixth checklist row).
  - decisions/plain-markdown-links.md: citations re-pointed only. 79 citations re-pointed in all.
  - Also brought this repository's own `wiki/CONVENTIONS.md` up to the template, which it had
    matched exactly before this change.

## 2026-09-25

* **wikipoke-ingest**:
  - Reconciled 9 commits since `e3139d1`: the interactive `init` of issue #2 (PR #10), the bundled
    @clack/prompts, and a pull request template.
  - new: decisions/interactive-init.md, from PR #10's Decisions section: the intent, the two paths,
    what is hard to undo (`--yes`, the exit codes, the rule for asking), the reversible choices and
    the discarded ones (a regular dependency, prompts on `node:readline`).
  - flows/install.md: `init` splits on TTY and `--yes` (`f5879b8`); before, it wrote first and then
    read hook names typed on one line. The interactive path, its exit codes, the folder-move warning
    and the three wordings each hook has. Now also sources `src/lib/setup.ts`.
  - components/cli.md: the `init` section says what the terminal branch used to be; 11 citations
    re-pointed. decisions/typescript-two-ways.md: esbuild bundles clack into `dist/lib/prompts.js`
    and the build refuses a stray `@clack/` import (`ea005d1`). architecture.md: `setup.ts` in the
    entry points, and the two libraries that travel inside the package.
  - components/atlas.md, concepts/coverage-as-debt.md, flows/check.md: citations re-pointed only.
    decisions/cli-read-only.md: the questions do not move the line; `AGENTS.md` changed only by the
    PR-template rule, re-read.
  - Left uncovered: `src/atlas/web` (1 file), as before.

## 2026-09-23

* **wikipoke-ingest**:
  - Reconciled 4 commits since `78adf3b`, plus the change that adds `wikipoke-agents`.
  - components/skills.md: query asks candidates for their `responsibility:` line and reads one page
    whole, leaving `log.md` and `CONVENTIONS.md` out of the search, and its description opens with
    the imperative so it fires (`eb11f31`); the new, experimental `wikipoke-agents`, which writes
    `AGENTS.md` about the code, never the wiki, and only after a yes to a diff.
  - architecture.md, flows/install.md, index.md: the skills are four; `init` writes the fourth.
  - cli, install, coverage-as-debt, file-ownership, skills-as-product, cli-read-only, flows/check:
    their sources changed only in wording ("the three skills" → "the skills"); re-read and
    re-stamped. No citation moved. No new page.

## 2026-09-19

* **wikipoke-ingest**:
  - Reconciled 16 stale pages with 14 commits since `fe78f53`: the fixes and skill changes that came
    out of running wikipoke through OpenCode on a 1,480-file Laravel app.
  - components/install.md, flows/install.md, concepts/file-ownership.md, components/hooks.md: the git
    hook follows husky 9 to `.husky/post-commit`, and a project-owned post-commit counts as installed
    when it runs the notifier (`25997d8`); in a husky repository the git hook travels with the clone.
  - components/checks.md, concepts/over-broad-sources.md: `-v` labels ignored paths and keeps the count
    last (`d3d5d3b`); over-broad now also means past fifty files, per source or per page (`dc452c1`,
    `d63f692`).
  - components/cli.md, flows/check.md: `check` sets the exit code and lets stdout drain, so a large
    `--json` is no longer cut at a pipe's 64 KB (`c82a188`).
  - components/skills.md, flows/ingest-pass.md, concepts/skills-as-product.md: ingest closes with what
    it left and the pages by type, `all` gives every cluster one pass, page types name their evidence
    and a part can be a topic (`3f36deb`, `da8898c`); lint --deep's missing-kind lens and the false
    green rule (`86294e6`); query searches and reads in one call and re-reads what it files (`78adf3b`).
  - Citations re-pointed in install.ts (8, one inside a diagram drift does not read), lint.ts (5,
    two re-found by hand) and bin/wikipoke.ts (1). No new page: every change extended one.

## 2026-09-18

* **wikipoke-ingest**:
  - decisions/cli-read-only.md: dropped `README.md` from `sources:`. The page is about the CLI and
    quotes only the README's "Where this comes from", which is history; every edit to the rest of the
    README marked it stale for nothing. The README is linked from the page instead. If that section
    ever changes, drift will no longer say so.

* **wikipoke-ingest**:
  - decisions/cli-read-only.md: re-read against `f36a2b1`, which gave the README a features list,
    Mermaid diagrams and atlas screenshots. Nothing the page claims changed: "Where this comes from"
    is as it was, and the new overview draws the CLI as reading and never writing a page.

* **wikipoke-ingest**: Seven commits since `60d592f`, four of them about `wikipoke atlas` (`12ff4b8` and the three after
  it). Seven pages stale, every one of them through `src/bin/wikipoke.ts` or the build; reconciled
  from their own diffs and re-stamped at `f4615f9`.

  - new: components/atlas.md — the snapshot both the live server and the export hand the browser,
    the three guards on the local server (Host header, GET only, git-tracked files only), why
    exported citations point at each page's `synced:` commit, and how `--out` tells a previous export
    from someone's site by the `managed by wikipoke` marker.
  - decisions/cli-read-only.md: `AGENTS.md` used to say the CLI only measures and CLI code goes only
    to a check; since `12ff4b8` it says the CLI measures and shows, and atlas is the one other place
    CLI code may go, on the condition that it writes only outside the wiki. Recorded as a change, not
    an overwrite. The page never writing is intact.
  - decisions/typescript-two-ways.md: the build's `node -e` chmod became `scripts/build.ts`, which also
    copies atlas's page and marked into `dist/`. The page had predicted that cost ("anything else the
    shipped tree needs has to be added there too"); it came due. Also: `scripts/` is type-checked now,
    and a third tsconfig checks the browser JavaScript.
  - architecture.md, components/cli.md: five commands, not four; the atlas as a layer; atlas's exit
    codes. Twelve `src/bin/wikipoke.ts` citations re-pointed, each checked against the line it lands on.
  - concepts/coverage-as-debt.md, flows/check.md, flows/install.md: re-read, nothing they claim
    changed; one citation re-pointed.
  - components/lib.md: one paragraph on atlas reading the same helpers. Its source did not change, so
    drift never flagged it; not re-stamped, since the rest of the page was not re-read.
  - Found, not fixed: `exportSite` tests "inside the wiki" by comparing paths as strings, so on a
    case-insensitive filesystem `--out Wiki/site` (or a symlink into the wiki) would get past it.
    Noted on components/atlas.md; read from the code, not tried.
  - Ignored `*.webp`: the logo in the README and in the atlas header is not code.
  - Not done: `src/atlas/web/atlas.css` stays uncovered, as does a page on what the atlas tests pin down.

* **wikipoke-ingest**: `34f14a3`, `a02c873` and the README's token section. The query skill was measured against the code
  on two repositories and rewritten to answer in fewer steps; its description now covers any question
  about the code, and all three skills keep their trigger phrases in English.

  - components/skills.md: how the query skill reads now, and why the step count is the cost.
  - concepts/skills-as-product.md: a description decides whether the skill is used at all — 3 of 9
    runs with the old one, 9 of 9 with the new.
  - concepts/schema-lives-in-the-wiki.md: the writing rules as the place a measured failure goes, with
    "one case, one sentence" as the example.
  - CONVENTIONS.md: level with the template. Four more pages re-read against the changed templates
    and README and re-stamped; nothing they claim moved.

* **wikipoke-ingest**:
  - components/checks.md: two lint.ts citations re-pointed after the inline-code fix; three more
    pages re-read against it and re-stamped, nothing they claim changed.

* **wikipoke-ingest**: `87d9fd0`: `init` and `wikipoke hooks` report outdated hooks without rewriting them, `init` says
  when CONVENTIONS.md differs from the template, drift caps the citations it prints, and lint checks
  that a link's text and line anchor agree. Sixteen pages stale; twenty-three citations carried, plus
  one inside a diagram in components/install.md that drift does not read, fixed by hand.

  - concepts/file-ownership.md, components/install.md, flows/install.md, components/cli.md: updating a
    hook waits for the person, like installing one; the upgrade path is `init`, which says so.
  - concepts/schema-lives-in-the-wiki.md: the project's schema is still never rewritten, but a copy
    behind the template is now reported.
  - decisions/cli-read-only.md: the `wikipoke refresh` an agent asked for turned out to be `init`
    plus saying so.
  - components/checks.md, components/skills.md: the capped report, the text/anchor check, and the
    upgrade note in the ingest skill.
  - Written with an invented sha in five places first, caught before the commit: the same failure
    the skills now prevent for the checkpoint. Prose shas are not checked by anything yet.

* **wikipoke-ingest**: `4943a76`: drift dates each citation by the commit that wrote its page line instead of by
  `synced:`, and reports fresh pages whose pointers moved anyway. Found on tracewake, where an agent
  cited a file it had added in the same commit and drift moved the citation 94 lines from a commit
  where the file did not exist. Fourteen pages stale; six citations carried, one `null` (the
  `movedCitations` signature) found again by reading the code.

  - components/checks.md, concepts/two-axes-of-staleness.md, flows/ingest-pass.md: the earlier
    reasoning — re-stamping is the last moment a move can be seen, so re-point and re-stamp in one
    edit — no longer holds, and each page says what replaced it and with which SHA. Citations have a
    clock of their own now.
  - flows/check.md, components/skills.md: `moved[]` beside `stale[]`.
  - CONVENTIONS.md: level with the template.

* **wikipoke-ingest**: `3eb714c`, found by the second real run: an OpenCode seed of another repository wrote every one of
  its 65 citations as a `#L` link, which nothing checked, and claimed `src/` on its architecture page.
  Twelve pages stale; drift carried nine citations, three of them `null` because the cited line itself
  changed (the `movedCitations` signature, the over-broad count), and those were found again by
  reading the code.

  - components/checks.md, components/lib.md, decisions/plain-markdown-links.md: citations are read in
    both forms, `path:line` and a `#L` link into the repository; a line anchor is the one fragment
    the checks read instead of dropping.
  - concepts/over-broad-sources.md: the page's own first example, `src/`, was not caught by the check
    it describes. It is now, by share of the indexable files. Recorded as a change with its SHA.
  - components/skills.md, flows/ingest-pass.md: a file only named goes to the backlog, not into
    `sources:`.
  - CONVENTIONS.md: level with the template again.

* **wikipoke-ingest**: Four commits since the checkpoint (`b29f7f4`, `c6a201a`, `aafa306`, `b305be6`), all nineteen pages
  with a source among them stale. The first pass run with the new drift report: it listed 23
  citations the diffs had moved, every one checked against the sentence citing it before being
  re-pointed, and none of them had been re-pointed before without a re-stamp. `lint` had caught ten
  of them, the ones on a blank line or a lone `}`; the other thirteen landed on real code.

  - components/checks.md, concepts/two-axes-of-staleness.md: drift now carries a stale page's
    citations through the diff, and why that has to happen before the re-stamp. Also its one trap,
    found halfway through this pass: the report is mapped from `synced:`, so a page re-pointed but
    not re-stamped reads as moved again (`b305be6` makes the two one edit in the skill).
  - components/hooks.md, decisions/notify-never-write.md, concepts/coverage-as-debt.md,
    flows/check.md: the notifier runs drift alone. It used to run coverage, which on an honestly
    seeded wiki is never empty, so the notifier was never silent. Recorded as a change with its SHA.
  - flows/ingest-pass.md, components/skills.md: the checkpoint is written by `printf`, never typed;
    a seed cites only files it opened; a reconcile re-points before it re-stamps.
  - decisions/cli-read-only.md: an agent asked for `wikipoke seal`. The answer stayed in the skill.
  - components/cli.md, flows/install.md, components/install.md, components/lib.md: `b29f7f4`, never
    indexed until now — `chooseWiki()` refuses a bad `--dir` before anything is written, `:0` is not a
    citation — and `init` no longer invites hooks in a repository that has some.
  - CONVENTIONS.md: brought level with the template, which it had fallen behind twice.

## 2026-09-12

* **wikipoke-ingest**:
  - coverage-as-debt.md: claims templates/wikipokeignore now, with what the default list hides and how a `!` line brings a subtree back
  - typescript-two-ways.md: package.json citations moved with the publish metadata; `npm run link` builds before it links
  - cli-read-only.md: re-read against the README install change, which did not touch what the page claims
  - ignored LICENSE: a licence is not code

* **wikipoke-ingest**: `08177b5` changed what `init` writes and what it says when nobody is at the terminal. Nine pages
  stale; reconciled and re-stamped. Twelve `path:line` citations had also rotted from the line shifts
  in `df4db0e` and `08177b5` — none of them caught by `lint`, since the lines still exist and are not
  blank. Re-pointed all forty-seven after checking each against the line it now lands on.

  - concepts/file-ownership.md: new section. Ownership decides whether wikipoke may rewrite a file;
    a second rule decides whether it may add one at all, and it turns on whether the file acts on its
    own. Skills do not, so both homes are written unasked; hooks do, so none is. This is the page the
    rest now point at for that question.
  - components/cli.md: `init`'s no-TTY branch used to print one line and leave. Recorded what that
    cost here — three commits with no notifier — and that the invitation is addressed to the agent
    because the CLI cannot see which agent is running it.
  - components/skills.md, components/install.md, flows/install.md: the skills go to `.agents/skills/`
    and `.claude/skills/` both, always. Detection was tried and cannot work.
  - flows/install.md: the `claude` detection sign had become self-fulfilling once `init` started
    writing `.claude/skills` — a bare `.claude/` proved only that wikipoke had run.
  - components/skills.md also still said `lib/`, which `df4db0e` removed. Its sources are templates
    that did not change, so drift never flagged it: a page can rot on code it does not claim.
  - Not done: `templates/wikipokeignore` is still uncovered, unchanged from the last two passes.

* **wikipoke-ingest**: The CLI moved from `.mjs` to TypeScript (`df4db0e`), so every page that named a source under
  `bin/` or `lib/` had a dead one. Reconciled all fifteen against the new tree and re-stamped them.

  - new: decisions/typescript-two-ways.md — the sources run from `src/` in development (Node strips
    the types) but ship compiled from `dist/`, because Node refuses to strip types under
    `node_modules/`. Also records the executable bit `tsc` drops and the build now restores.
  - architecture.md, components/cli.md, components/checks.md: the CLI's `CHECKS` object gave way to a
    tagged union, because indexing it by name erased which result came back. Recorded as a change
    with its SHA rather than an overwrite: the uniform `run`/`report` contract did not change.
  - components/lib.md: `src/lib/lib.ts` now exports the shared types too, and `asList()` replaces the
    `[].concat(x ?? [])` idiom. Noted the tension with the schema-lives-in-the-wiki rule: the types
    describe the parser's output, not the page contract.
  - components/install.md: why the sources had to move under `src/` rather than be renamed in place —
    `src/lib/` and `dist/lib/` must sit at the same depth for the one `templates/` URL to resolve.
  - components/hooks.md: new section on which hooks survive a clone. Only `git` cannot: it lives in
    `.git/`. Written after this repository turned out to have no notifier installed at all, so its
    own drift went unreported until someone ran `check` by hand.
  - Not done: `templates/wikipokeignore` is still uncovered, as it was before this pass.

* **wikipoke-ingest (reconcile)**: Reconciled against `19b233f`, the commit that fixed what this wiki's own seeding pass ran into.
  13 pages were stale; each was rewritten from its own diff, and the rest were left alone.

  - `components/lib.md`: new sections on the two-pass ignore matching (`ignoreRules`,
    `indexablePaths`, `ignoredFiles`) and on `codeCitations`.
  - `components/checks.md`: coverage now reports what the ignore list hid; lint now re-reads
    `path:line` citations. Both are warnings, so the silence contract the hooks depend on is intact.
  - `concepts/coverage-as-debt.md`: the ignore list was the one way coverage could be gamed silently;
    the count closes it.
  - `flows/ingest-pass.md`: tailoring `.wikipokeignore` is now explicitly two-directional.
  - Citations across ten pages were re-anchored: the change shifted `lib/lib.mjs` by up to 57 lines.
    Five of those were wrong from the seed pass — line numbers read out of a concatenated listing of
    two files — which is what prompted the new check.

* **wikipoke-ingest (seed)**:
  - Seeded from `68c8fa3`, the repository's only commit: 19 pages — the map, three flows, six
    component pages, six concepts and three decisions.
  - Tailored `.wikipokeignore`: dropped the generic `*.md` (in this repository the Markdown under
    `templates/` **is** the product — the skills and the schema) and kept `README.md`, `AGENTS.md`,
    `CHANGELOG.md` out by name. Ignored `test/**`: the tests verify the CLI, they do not explain it.
  - Deferred to later passes: `test/wikipoke.test.mjs` (ignored on purpose, a page on what the tests
    pin down would still be worth writing), and `package.json`, which stays uncovered because no page
    earns it on its own.
  - `decisions/cli-read-only.md` is `confidence: inferred`: the 0.1 design it compares against is
    described in the README but its code and history were squashed away.
