import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { get } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { serve } from "../src/atlas/serve.ts";
import type { Snapshot } from "../src/atlas/snapshot.ts";

// The sources, not the build: Node strips the types as it runs them, so `npm test` needs no
// `npm run build` first and the tests exercise exactly the file a contributor edits.
const cli = fileURLToPath(new URL("../src/bin/wikipoke.ts", import.meta.url));

function put(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function git(root: string, ...args: string[]): string {
  // Piped, so the post-commit notifier that init installs does not print into the test report.
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
}

/** A small repository with some code, committed. */
function repo(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "wikipoke-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "test");
  const all: Record<string, string> = {
    "README.md": "# demo\n",
    "docs/guide.md": "guide\n",
    "src/billing/invoice.js": "export const total = 1;\n",
    "src/billing/tax.js": "export const rate = 0.2;\n",
    "src/cli.js": "console.log('hi');\n",
    ".gitignore": "node_modules/\n",
    ...files,
  };
  for (const [path, content] of Object.entries(all)) put(root, path, content);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");
  return root;
}

function wikipoke(root: string, ...args: string[]): { code: number | null; out: string } {
  const res = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
  return { code: res.status, out: res.stdout + res.stderr };
}

interface PageOptions {
  type?: string;
  sources?: string[];
  synced?: string;
  body?: string;
  wiki?: string;
}

function page(root: string, path: string, options: PageOptions = {}): void {
  const { type = "entity", sources = ["src/billing"], synced, body = "", wiki = "wiki" } = options;
  put(
    root,
    `${wiki}/${path}`,
    `---\ntitle: ${path}\ntype: ${type}\nresponsibility: documents ${path}\nsources:\n` +
      sources.map((s) => `  - ${s}\n`).join("") +
      `synced: ${synced ?? git(root, "rev-parse", "--short", "HEAD")}\n---\n${body}\n`,
  );
}

/** Seeds the wiki the way the ingest skill would: pages, index, log, checkpoint. */
function seed(root: string, wiki = "wiki"): void {
  wikipoke(root, "init", ...(wiki === "wiki" ? [] : ["--dir", wiki]));
  page(root, "architecture.md", { type: "architecture", sources: ["src/cli.js"], body: "See [billing](./components/billing.md).", wiki });
  page(root, "components/billing.md", { body: "Back to [the map](../architecture.md).", wiki });
  put(root, `${wiki}/index.md`, "# Wiki\n\n- [Architecture](./architecture.md)\n- [Billing](./components/billing.md)\n");
  put(root, `${wiki}/log.md`, "# Log\n\n## 2026-09-11 · wikipoke-ingest\n- seeded\n");
  put(root, `${wiki}/.wikipoke-state.json`, JSON.stringify({ version: 1, last_indexed_commit: git(root, "rev-parse", "HEAD") }));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "seed wiki");
  // The checkpoint and every page now point at the commit before the seed, which only touched wiki/.
}

/** The shapes `check --json` returns, as far as the assertions below read them. */
interface DriftJson {
  repo: { status: string; commits?: number; files?: number; last?: string };
  stale: { id: string; files: string[]; citations: { raw: string; now: number | null }[] }[];
  moved: { id: string; citations: { raw: string; now: number | null }[] }[];
  fresh: string[];
}
interface CoverageJson {
  unclaimed: string[];
  ignored: string[];
}
interface LintJson {
  errors: { page?: string; message: string }[];
  warnings: { page?: string; message: string }[];
}

const json = <T>(root: string, ...args: string[]): T => JSON.parse(wikipoke(root, ...args).out) as T;
const read = (root: string, path: string): string => readFileSync(join(root, path), "utf8");
const ALL_HOOKS = ["git", "claude", "opencode", "cursor", "agents"];

test("init writes the schema, the ignore list and the skills in both homes, and no hook unless asked", () => {
  const root = repo();
  const { code, out } = wikipoke(root, "init");
  assert.equal(code, 0);
  for (const home of [".agents/skills", ".claude/skills"])
    for (const skill of ["wikipoke-ingest", "wikipoke-query", "wikipoke-lint"])
      assert.ok(existsSync(join(root, home, skill, "SKILL.md")), `${home}/${skill}`);
  for (const path of ["wiki/CONVENTIONS.md", "wiki/.wikipokeignore"]) assert.ok(existsSync(join(root, path)), path);
  // A skill is inert until someone names it; a hook fires on its own. Only the second needs a yes.
  for (const path of ["wiki/.wikipoke-hook.sh", ".git/hooks/post-commit", ".claude/settings.json", "AGENTS.md", "wiki/.wikipoke-state.json"])
    assert.ok(!existsSync(join(root, path)), path);
  // Nobody to ask when an agent runs it, so the output hands the decision on rather than dropping it.
  assert.match(out, /No hook was installed/);
  assert.match(out, /If you are an agent reading this/);
  assert.match(out, /wikipoke hooks add <name>/);
});

test("the skills reach Claude Code even in a repository that shows no sign of it", () => {
  // Claude Code reads only .claude/skills and runs fine against a checkout with no CLAUDE.md and
  // no .claude/ in it, so detection cannot decide this: the skills go to both homes always.
  const bare = repo();
  wikipoke(bare, "init");
  assert.ok(existsSync(join(bare, ".claude/skills/wikipoke-ingest/SKILL.md")));
  assert.doesNotMatch(wikipoke(bare, "hooks").out, /claude .* used here/, "and .claude/skills is not itself a sign");

  const settings = '{"permissions":{"allow":["Bash(ls)"]}}';
  const root = repo({ "CLAUDE.md": "# rules\n", ".claude/settings.json": settings });
  const { out } = wikipoke(root, "init");
  assert.equal(read(root, ".claude/settings.json"), settings, "init never touches the settings");
  assert.match(out, /claude .* used here/);
});

test("a repository with no hook installed is told so, and told what to run", () => {
  const root = repo();
  wikipoke(root, "init");
  assert.match(wikipoke(root, "hooks").out, /No hook was installed/);
  wikipoke(root, "hooks", "add", "agents");
  assert.doesNotMatch(wikipoke(root, "hooks").out, /No hook was installed/, "silent once one is in");
  assert.doesNotMatch(wikipoke(root, "init").out, /No hook was installed/, "and so is a re-run of init");
});

test("hooks add wires every agent, keeps what the files already hold, and is idempotent", () => {
  const root = repo({
    "CLAUDE.md": "# rules\n",
    ".claude/settings.json": '{"permissions":{"allow":["Bash(ls)"]}}',
    "AGENTS.md": "# Rules\n\nBe kind.\n",
  });
  wikipoke(root, "init");
  assert.equal(wikipoke(root, "hooks", "add", ...ALL_HOOKS).code, 0);

  assert.match(read(root, "wiki/.wikipoke-hook.sh"), /managed by wikipoke/);
  assert.match(read(root, ".git/hooks/post-commit"), /wiki\/\.wikipoke-hook\.sh/);
  const settings = JSON.parse(read(root, ".claude/settings.json"));
  assert.deepEqual(settings.permissions, { allow: ["Bash(ls)"] });
  assert.equal(settings.hooks.SessionStart[0].hooks[0].command, "sh wiki/.wikipoke-hook.sh");
  assert.match(read(root, ".opencode/plugin/wikipoke.js"), /experimental\.chat\.system\.transform/);
  assert.match(read(root, ".cursor/rules/wikipoke.mdc"), /alwaysApply: true/);
  assert.match(read(root, "AGENTS.md"), /^# Rules\n\nBe kind\.\n\n<!-- wikipoke:start/);

  const list = wikipoke(root, "hooks").out.trim().split("\n");
  assert.equal(list.filter((line) => /installed/.test(line)).length, ALL_HOOKS.length, list.join("\n"));

  assert.doesNotMatch(wikipoke(root, "hooks", "add", ...ALL_HOOKS).out, /created|updated/);
  assert.equal(JSON.parse(read(root, ".claude/settings.json")).hooks.SessionStart.length, 1);
  assert.equal(read(root, "AGENTS.md").match(/wikipoke:start/g)?.length, 1);
});

test("hooks remove takes out one hook at a time, and the notifier goes with the last one", () => {
  const root = repo({ "AGENTS.md": "# Rules\n\nBe kind.\n" });
  wikipoke(root, "init");
  wikipoke(root, "hooks", "add", "git", "agents");
  wikipoke(root, "hooks", "remove", "agents");
  assert.equal(read(root, "AGENTS.md"), "# Rules\n\nBe kind.\n");
  assert.ok(existsSync(join(root, "wiki/.wikipoke-hook.sh")), "git still runs it");
  wikipoke(root, "hooks", "remove", "git");
  assert.ok(!existsSync(join(root, ".git/hooks/post-commit")));
  assert.ok(!existsSync(join(root, "wiki/.wikipoke-hook.sh")));

  // An AGENTS.md that only ever held wikipoke's block goes with it.
  const bare = repo();
  wikipoke(bare, "hooks", "add", "agents");
  assert.ok(existsSync(join(bare, "AGENTS.md")));
  wikipoke(bare, "hooks", "remove", "agents");
  assert.ok(!existsSync(join(bare, "AGENTS.md")));
});

test("--dir moves the wiki, and everything written names the new place", () => {
  const root = repo({ "CLAUDE.md": "# rules\n", "AGENTS.md": "# Rules\n" });
  seed(root, "docs/wiki");
  assert.deepEqual(JSON.parse(read(root, ".wikipoke.json")), { wiki: "docs/wiki" });
  assert.ok(!existsSync(join(root, "wiki")));
  for (const path of [".agents/skills/wikipoke-ingest/SKILL.md", ".claude/skills/wikipoke-lint/SKILL.md", "docs/wiki/CONVENTIONS.md"]) {
    assert.match(read(root, path), /docs\/wiki\//, path);
    assert.doesNotMatch(read(root, path), /(^|[^/\w])wiki\//m, path);
  }

  wikipoke(root, "hooks", "add", ...ALL_HOOKS);
  assert.match(read(root, ".git/hooks/post-commit"), /docs\/wiki\/\.wikipoke-hook\.sh/);
  assert.equal(JSON.parse(read(root, ".claude/settings.json")).hooks.SessionStart[0].hooks[0].command, "sh docs/wiki/.wikipoke-hook.sh");
  assert.match(read(root, ".opencode/plugin/wikipoke.js"), /docs\/wiki\/\.wikipoke-hook\.sh/);
  assert.match(read(root, "AGENTS.md"), /docs\/wiki/);

  // The checks read the same place, and the notifier speaks from it.
  const { code, out } = wikipoke(root, "check");
  assert.equal(code, 0, out);
  assert.match(out, /current, covered and sound/);
  assert.equal(execFileSync("sh", ["docs/wiki/.wikipoke-hook.sh"], { cwd: root, encoding: "utf8" }), "");

  wikipoke(root, "uninstall");
  assert.ok(existsSync(join(root, "docs/wiki/index.md")), "the wiki stays");
  assert.ok(!existsSync(join(root, "docs/wiki/.wikipoke-hook.sh")));
});

test("init and hooks leave files they do not manage alone and say what to do by hand", () => {
  const root = repo({ ".agents/skills/wikipoke-query/SKILL.md": "mine\n", ".cursor/rules/wikipoke.mdc": "ours\n" });
  put(root, ".git/hooks/post-commit", "#!/bin/sh\necho mine\n");
  put(root, "wiki/CONVENTIONS.md", "# our own schema\n");
  wikipoke(root, "init");
  const { out } = wikipoke(root, "hooks", "add", "git", "cursor");
  assert.equal(read(root, ".agents/skills/wikipoke-query/SKILL.md"), "mine\n");
  assert.equal(read(root, ".git/hooks/post-commit"), "#!/bin/sh\necho mine\n");
  assert.equal(read(root, ".cursor/rules/wikipoke.mdc"), "ours\n");
  assert.equal(read(root, "wiki/CONVENTIONS.md"), "# our own schema\n");
  assert.match(out, /post-commit already exists\. Add this line to it/);
  assert.match(out, /wikipoke\.mdc exists and is not managed by wikipoke/);

  // Following that line to the letter is what installs it.
  const line = out.match(/Add this line to it: (.*)/)?.[1] ?? "";
  put(root, ".git/hooks/post-commit", `#!/bin/sh\necho mine\n${line}\n`);
  assert.match(wikipoke(root, "hooks").out, /git .* installed/);
  assert.doesNotMatch(wikipoke(root, "hooks").out, /git .* outdated/);
});

test("with husky 9, the git hook goes where husky keeps it, not in the wrappers it regenerates", () => {
  const root = repo();
  put(root, ".husky/_/h", "#!/usr/bin/env sh\n");
  put(root, ".husky/_/post-commit", '#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n');
  git(root, "config", "core.hooksPath", ".husky/_");
  wikipoke(root, "init");
  wikipoke(root, "hooks", "add", "git");
  assert.match(read(root, ".husky/post-commit"), /wiki\/\.wikipoke-hook\.sh/);
  assert.equal(read(root, ".husky/_/post-commit"), '#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n');
  assert.match(wikipoke(root, "hooks").out, /git .* installed/);
});

test("uninstall takes out skills and hooks, keeps the wiki and the rest of the settings", () => {
  const root = repo({ "CLAUDE.md": "# rules\n", ".claude/settings.json": '{"model":"opus"}' });
  seed(root);
  wikipoke(root, "hooks", "add", ...ALL_HOOKS);
  assert.equal(wikipoke(root, "uninstall").code, 0);
  for (const path of [".agents", ".claude/skills", ".opencode", ".cursor", "AGENTS.md", ".git/hooks/post-commit", "wiki/.wikipoke-hook.sh"])
    assert.ok(!existsSync(join(root, path)), path);
  assert.deepEqual(JSON.parse(read(root, ".claude/settings.json")), { model: "opus" });
  for (const path of ["wiki/CONVENTIONS.md", "wiki/.wikipokeignore", "wiki/index.md", "wiki/architecture.md", "wiki/.wikipoke-state.json"])
    assert.ok(existsSync(join(root, path)), path);
});

test("before seeding, check says so, and coverage still runs for the seed to read", () => {
  const root = repo();
  wikipoke(root, "init");
  const all = wikipoke(root, "check");
  assert.equal(all.code, 0);
  assert.match(all.out, /unseeded/);

  const cov = json<CoverageJson>(root, "check", "coverage", "--json");
  // `*.md` in .wikipokeignore reaches README.md at the root and docs/guide.md alike.
  assert.deepEqual(cov.unclaimed, ["src/billing/invoice.js", "src/billing/tax.js", "src/cli.js"]);
});

test("a seeded wiki is current, covered and sound", () => {
  const root = repo();
  seed(root);
  const { code, out } = wikipoke(root, "check");
  assert.equal(code, 0, out);
  assert.match(out, /current, covered and sound \(2 pages\)/);
});

test("drift finds the pages whose code moved, and the commits nobody indexed", () => {
  const root = repo();
  seed(root);
  put(root, "src/billing/tax.js", "export const rate = 0.21;\n");
  git(root, "commit", "-qam", "raise tax");
  const drift = json<DriftJson>(root, "check", "drift", "--json");
  assert.equal(drift.repo.status, "behind");
  assert.deepEqual(drift.stale.map((s) => [s.id, s.files]), [["components/billing", ["src/billing/tax.js"]]]);
  assert.deepEqual(drift.fresh, ["architecture"]);
  // Debt, not breakage: a plain run passes, a strict one does not.
  assert.equal(wikipoke(root, "check").code, 0);
  assert.equal(wikipoke(root, "check", "--strict").code, 1);
});

test("lint catches broken links, dead sources, orphans and wikilinks, and fails on errors", () => {
  const root = repo();
  seed(root);
  page(root, "concepts/money.md", {
    type: "concept",
    sources: ["src/money/**"],
    body: "See [gone](./gone.md), [code](../../src/nope.js) and [[billing]].",
  });
  const { code } = wikipoke(root, "check", "lint");
  assert.equal(code, 1);
  const lint = json<LintJson>(root, "check", "lint", "--json");
  const messages = [...lint.errors, ...lint.warnings].map((f) => `${f.page}: ${f.message}`);
  for (const expected of [
    /concepts\/money: dead source/,
    /concepts\/money: broken link: `\.\/gone\.md`/,
    /concepts\/money: broken link to a repository file/,
    /concepts\/money: `\[\[billing\]\]` is not a link/,
    /concepts\/money: orphan/,
    /concepts\/money: not listed in index\.md/,
  ])
    assert.ok(messages.some((m) => expected.test(m)), `${expected} in\n${messages.join("\n")}`);
});

test("the page types come from the CONVENTIONS.md table, so a project can add its own", () => {
  const root = repo();
  seed(root);
  page(root, "runbooks/deploy.md", { type: "runbook", sources: ["src/cli.js"], body: "[map](../architecture.md)" });
  const before = json<LintJson>(root, "check", "lint", "--json");
  assert.ok(before.errors.some((f) => /unknown type `runbook`/.test(f.message)));

  const conventions = readFileSync(join(root, "wiki/CONVENTIONS.md"), "utf8").replace(
    "| `decision`",
    "| `runbook`      | how to operate something in production    | `runbooks/deploy.md`       |\n| `decision`",
  );
  writeFileSync(join(root, "wiki/CONVENTIONS.md"), conventions);
  const after = json<LintJson>(root, "check", "lint", "--json");
  assert.ok(!after.errors.some((f) => /unknown type/.test(f.message)), JSON.stringify(after.errors));
  assert.ok(!after.errors.some((f) => /unknown type `type`/.test(f.message)));
});

test("a source claiming a whole package or the whole repository is over-broad; a folder is not", () => {
  const root = repo({ "packages/api/package.json": "{}\n", "packages/api/server.js": "//\n" });
  seed(root);
  page(root, "components/api.md", { sources: ["packages/api", "src/billing"], body: "[map](../architecture.md)" });
  page(root, "concepts/all.md", { type: "concept", sources: ["**"], body: "[map](../architecture.md)" });
  const lint = json<LintJson>(root, "check", "lint", "--json");
  const broad = lint.warnings.filter((f) => /over-broad/.test(f.message)).map((f) => f.message.match(/`([^`]+)`/)?.[1]);
  assert.deepEqual(broad.sort(), ["**", "packages/api"]);
});

test("the notifier is silent when the wiki is current, and the git hook speaks after a commit it has not seen", () => {
  const root = repo();
  seed(root);
  mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
  // A symlink, the way npm links a dependency's bin. Node follows it to the real path before it
  // decides whether it may strip types, so the .ts entry point runs from there just as it does here.
  symlinkSync(cli, join(root, "node_modules/.bin/wikipoke"));
  wikipoke(root, "hooks", "add", "git");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "add the notifier");
  assert.equal(execFileSync("sh", ["wiki/.wikipoke-hook.sh"], { cwd: root, encoding: "utf8" }), "");

  // Uncovered code is a backlog meant to outlive every pass: the notifier leaves it to `check`,
  // or it would never be silent again.
  put(root, "src/extra.js", "//\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "add uncovered code");
  put(root, "wiki/.wikipoke-state.json", JSON.stringify({ version: 1, last_indexed_commit: git(root, "rev-parse", "HEAD") }));
  git(root, "commit", "-qam", "index it");
  assert.match(wikipoke(root, "check", "coverage").out, /uncovered 1 of/);
  assert.equal(execFileSync("sh", ["wiki/.wikipoke-hook.sh"], { cwd: root, encoding: "utf8" }), "");

  put(root, "src/cli.js", "console.log('bye');\n");
  // Git runs hooks with their output on stderr.
  const commit = spawnSync("git", ["commit", "-qam", "change cli"], { cwd: root, encoding: "utf8" });
  assert.equal(commit.status, 0);
  assert.match(commit.stderr, /behind[\s\S]*stale\s+architecture/);
});

test("a `!` line in .wikipokeignore brings paths back, and coverage says how many it hid", () => {
  const root = repo({ "prompts/agent.md": "do the thing\n" });
  seed(root);
  // The starting ignore list drops every .md, product or not.
  const hidden = json<CoverageJson>(root, "check", "coverage", "--json");
  assert.equal(hidden.unclaimed.includes("prompts/agent.md"), false);
  assert.equal(hidden.ignored.includes("prompts/agent.md"), true);
  assert.equal(hidden.ignored.includes("wiki/index.md"), false, "the wiki's own pages are not code it hid");

  writeFileSync(join(root, "wiki/.wikipokeignore"), "wiki/**\n*.md\n!prompts/**\n");
  const back = json<CoverageJson>(root, "check", "coverage", "--json");
  assert.equal(back.unclaimed.includes("prompts/agent.md"), true, "a ! line wins over the plain one above it");
  assert.equal(back.ignored.includes("prompts/agent.md"), false);
  assert.match(wikipoke(root, "check", "coverage").out, /file\(s\) ignored by \.wikipokeignore/);

  // Read through `tail`, the verbose list still tells an ignored path from an uncovered one.
  const verbose = wikipoke(root, "check", "coverage", "-v").out.trim().split("\n");
  assert.match(verbose.at(-1) ?? "", /file\(s\) ignored by \.wikipokeignore$/);
  assert.ok(verbose.some((line) => /^ {4}ignored {2}README\.md$/.test(line)), verbose.join("\n"));
  assert.ok(!verbose.some((line) => /^ {4}README\.md$/.test(line)), "never bare, like an uncovered file");
});

test("a re-included path counts for the repo axis of drift too", () => {
  const root = repo({ "prompts/agent.md": "do the thing\n" });
  seed(root);
  writeFileSync(join(root, "wiki/.wikipokeignore"), "wiki/**\n*.md\n!prompts/**\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "re-include the prompts");
  put(root, "prompts/agent.md", "do the other thing\n");
  git(root, "commit", "-qam", "edit a prompt");
  const drift = json<DriftJson>(root, "check", "drift", "--json");
  assert.equal(drift.repo.status, "behind");
  assert.equal(drift.repo.files, 1);
});

test("lint re-reads every path:line citation and reports the ones the code moved out from under", () => {
  const root = repo({ "src/cli.js": "a\nb\nc\nd\ne\n" });
  seed(root);
  page(root, "components/cited.md", {
    sources: ["src/cli.js"],
    body: [
      "Real: `src/cli.js:3`. Gone: `src/cli.js:99`. Deleted: `src/old/gone.js:4`.",
      "Not a path at all: 12:30, and version 0.2:1.",
      "```\nsrc/cli.js:400\n```",
      "[map](../architecture.md)",
    ].join("\n\n"),
  });
  const lint = json<LintJson>(root, "check", "lint", "--json");
  const cites = lint.warnings.filter((f) => f.page === "components/cited" && /src\//.test(f.message)).map((f) => f.message);
  assert.equal(cites.length, 1, `one citation is wrong, got: ${cites.join(" | ")}`);
  assert.match(cites[0] as string, /`src\/cli\.js:99` is past the end of src\/cli\.js \(5 lines\)/);
  assert.equal(lint.errors.length, 0, "a drifted pointer is debt, not a broken wiki");

  // A file the repository does not have is an example; one whose folder exists is a dead pointer.
  put(root, "src/old/other.js", "//\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "add src/old");
  const after = json<LintJson>(root, "check", "lint", "--json");
  assert.ok(after.warnings.some((f) => /`src\/old\/gone\.js:4` points at a file that is not tracked/.test(f.message)));
});

test("drift carries a stale page's citations through the diff, so re-stamping cannot hide them", () => {
  const lines = (n: number, tag: string): string => Array.from({ length: n }, (_, i) => `${tag} ${i + 1}`).join("\n") + "\n";
  const root = repo({ "src/billing/invoice.js": lines(10, "line") });
  seed(root);
  page(root, "components/billing.md", {
    body: [
      "Totals: `src/billing/invoice.js:2`. Rounding: `src/billing/invoice.js:5`.",
      "Tax: `src/billing/invoice.js:8`. Rate: `src/billing/tax.js:1`.",
      "Back to [the map](../architecture.md).",
    ].join("\n\n"),
  });
  git(root, "commit", "-qam", "cite");
  // Three lines in above line 5, line 8 rewritten; line 2 and tax.js stay where they were.
  const text = lines(10, "line").split("\n");
  text.splice(7, 1, "rewritten");
  text.splice(3, 0, "new a", "new b", "new c");
  put(root, "src/billing/invoice.js", text.join("\n"));
  git(root, "commit", "-qam", "reshape invoice");

  const drift = json<DriftJson>(root, "check", "drift", "--json");
  const billing = drift.stale.find((s) => s.id === "components/billing");
  assert.deepEqual(billing?.citations, [
    { raw: "src/billing/invoice.js:5", now: 8 },
    { raw: "src/billing/invoice.js:8", now: null },
  ]);
  const out = wikipoke(root, "check", "drift").out;
  assert.match(out, /src\/billing\/invoice\.js:5 is now line 8/);
  assert.match(out, /src\/billing\/invoice\.js:8 — that line changed, re-read it/);
});

test("lint warns about a citation that lands on the end of a block", () => {
  const root = repo({ "src/cli.js": "function a() {\n  return 1;\n}\n" });
  seed(root);
  page(root, "components/cli.md", { sources: ["src/cli.js"], body: "`src/cli.js:1` and `src/cli.js:3`. [map](../architecture.md)" });
  const lint = json<LintJson>(root, "check", "lint", "--json");
  const cites = lint.warnings.filter((f) => f.page === "components/cli" && /src\/cli\.js/.test(f.message)).map((f) => f.message);
  assert.deepEqual(cites, ["`src/cli.js:3` lands on `}`, the end of a block: the code moved"]);
});

test("a checkpoint that is not a commit is shown in full, since its first characters may be right", () => {
  const root = repo();
  seed(root);
  const head = git(root, "rev-parse", "HEAD");
  const invented = head.slice(0, 7) + "0".repeat(33);
  put(root, "wiki/.wikipoke-state.json", JSON.stringify({ version: 1, last_indexed_commit: invented }));
  assert.match(wikipoke(root, "check", "drift").out, new RegExp(`checkpoint points at ${invented}, which is not a commit here`));
});

test("a link with a line anchor is a citation too, for lint and for drift", () => {
  const lines = (n: number): string => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  const root = repo({ "src/billing/invoice.js": lines(10) });
  seed(root);
  page(root, "components/billing.md", {
    body: [
      "Totals ([invoice.js:4](../../src/billing/invoice.js#L4)), and [a range](../../src/billing/invoice.js#L6-L8).",
      "Gone: [invoice.js:40](../../src/billing/invoice.js#L40). A heading is not a line: [map](../architecture.md#top).",
    ].join("\n\n"),
  });
  const lint = json<LintJson>(root, "check", "lint", "--json");
  const cites = lint.warnings.filter((f) => f.page === "components/billing").map((f) => f.message);
  assert.deepEqual(cites, ["`../../src/billing/invoice.js#L40` is past the end of src/billing/invoice.js (10 lines): the code moved"]);

  git(root, "add", "-A");
  git(root, "commit", "-qm", "cite by link");
  put(root, "src/billing/invoice.js", "new 1\nnew 2\n" + lines(10));
  git(root, "commit", "-qam", "two lines on top");
  const billing = json<DriftJson>(root, "check", "drift", "--json").stale.find((s) => s.id === "components/billing");
  assert.deepEqual(billing?.citations, [
    { raw: "../../src/billing/invoice.js#L4", now: 6 },
    { raw: "../../src/billing/invoice.js#L6-L8", now: 8 },
    { raw: "../../src/billing/invoice.js#L40", now: 42 },
  ]);
});

test("a source that claims most of the repository is over-broad even without a manifest", () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 12; i++) files[`src/mod/f${i}.js`] = "//\n";
  const root = repo(files);
  seed(root);
  page(root, "concepts/everything.md", { type: "concept", sources: ["src/"], body: "[map](../architecture.md)" });
  const lint = json<LintJson>(root, "check", "lint", "--json");
  const broad = lint.warnings.filter((f) => /over-broad/.test(f.message)).map((f) => f.message);
  assert.equal(broad.length, 1, broad.join("\n"));
  assert.match(broad[0] as string, /`src\/` claims 15 of the 15 indexable files/);
});

test("a folder claiming more than fifty files is over-broad, however small a share of the repository", () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 60; i++) files[`app/features/f${i}.js`] = "//\n";
  for (let i = 0; i < 70; i++) files[`app/other/f${i}.js`] = "//\n";
  const root = repo(files);
  seed(root);
  page(root, "concepts/layer.md", { type: "concept", sources: ["app/features", "src/billing"], body: "[map](../architecture.md)" });
  const lint = json<LintJson>(root, "check", "lint", "--json");
  const broad = lint.warnings.filter((f) => /over-broad/.test(f.message)).map((f) => f.message);
  assert.equal(broad.length, 1, broad.join("\n"));
  assert.match(broad[0] as string, /`app\/features` claims 60 of the \d+ indexable files/);

  // Split into subfolders under the limit, the page still claims them all.
  for (let i = 0; i < 60; i++) put(root, `app/features/${i < 30 ? "a" : "b"}/g${i}.js`, "//\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "split");
  page(root, "concepts/layer.md", { type: "concept", sources: ["app/features/a", "app/features/b/*.js"], body: "[map](../architecture.md)" });
  const split = json<LintJson>(root, "check", "lint", "--json").warnings.filter((f) => /over-broad/.test(f.message));
  assert.equal(split.length, 1, split.map((f) => f.message).join("\n"));
  assert.match(split[0]?.message ?? "", /folders and wildcards claim 60 indexable files together/);
});

test("a --json larger than a pipe's buffer reaches the reader whole", () => {
  const files: Record<string, string> = {};
  for (let i = 0; i < 400; i++) files[`src/gen/${"x".repeat(200)}${i}.js`] = "//\n";
  const root = repo(files);
  seed(root);
  // spawnSync reads through a pipe, like `wikipoke check --json | jq` does.
  const out = wikipoke(root, "check", "coverage", "--json").out;
  assert.ok(out.length > 65536, `${out.length} bytes`);
  assert.ok(json<CoverageJson>(root, "check", "coverage", "--json").unclaimed.length >= 400);
});

test("a citation is moved from the commit that wrote it, not from synced:", () => {
  const lines = (n: number, tag = "line"): string => Array.from({ length: n }, (_, i) => `${tag} ${i + 1}`).join("\n") + "\n";
  const root = repo({ "src/billing/invoice.js": lines(10) });
  seed(root);
  const synced = git(root, "rev-parse", "--short", "HEAD");
  const cite = (body: string): void => page(root, "components/billing.md", { synced, body: `${body}\n\n[map](../architecture.md)` });

  // Written in the same commit that added the file, after synced: already current.
  put(root, "src/billing/rounding.js", lines(5));
  cite("Rounding: `src/billing/rounding.js:3`.");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "add rounding, and cite it");
  assert.deepEqual(json<DriftJson>(root, "check", "drift", "--json").stale[0]?.citations, []);

  // Re-pointed in the working tree and not re-stamped: current, not moved a second time.
  put(root, "src/billing/invoice.js", "new\n" + lines(10));
  git(root, "commit", "-qam", "one line on top");
  cite("Rounding: `src/billing/rounding.js:3`. Total: `src/billing/invoice.js:5`.");
  git(root, "commit", "-qam", "cite the total");
  put(root, "src/billing/invoice.js", "newer\nnew\n" + lines(10));
  git(root, "commit", "-qam", "another line on top");
  assert.deepEqual(json<DriftJson>(root, "check", "drift", "--json").stale[0]?.citations, [{ raw: "src/billing/invoice.js:5", now: 6 }]);
  cite("Rounding: `src/billing/rounding.js:3`. Total: `src/billing/invoice.js:6`.");
  assert.deepEqual(json<DriftJson>(root, "check", "drift", "--json").stale[0]?.citations, []);
});

test("a page re-stamped without re-pointing its citations is still reported", () => {
  const lines = (n: number): string => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  const root = repo({ "src/billing/invoice.js": lines(10) });
  seed(root);
  page(root, "components/billing.md", { body: "Total: `src/billing/invoice.js:5`. [map](../architecture.md)" });
  git(root, "commit", "-qam", "cite");
  put(root, "src/billing/invoice.js", "a\nb\nc\n" + lines(10));
  git(root, "commit", "-qam", "three lines on top");
  // The laundering: synced: moves to HEAD, the number stays.
  const text = read(root, "wiki/components/billing.md").replace(/^synced: .*$/m, `synced: ${git(root, "rev-parse", "--short", "HEAD")}`);
  writeFileSync(join(root, "wiki/components/billing.md"), text);
  git(root, "commit", "-qam", "re-stamp only");

  const drift = json<DriftJson>(root, "check", "drift", "--json");
  assert.ok(drift.fresh.includes("components/billing"));
  assert.deepEqual(drift.moved, [{ id: "components/billing", citations: [{ raw: "src/billing/invoice.js:5", now: 8 }] }]);
  const out = wikipoke(root, "check", "drift");
  assert.match(out.out, /moved\s+components\/billing[\s\S]*invoice\.js:5 is now line 8/);
  assert.equal(wikipoke(root, "check").code, 0, "debt, not breakage");
});

test("an outdated hook is reported by init and hooks, and only hooks add changes it", () => {
  const root = repo({ "AGENTS.md": "# Rules\n" });
  wikipoke(root, "init");
  wikipoke(root, "hooks", "add", "opencode", "agents");
  const plugin = ".opencode/plugin/wikipoke.js";
  const old = "// managed by wikipoke: an older plugin\n";
  writeFileSync(join(root, plugin), old);

  for (const args of [["hooks"], ["init"]]) {
    const out = wikipoke(root, ...args).out;
    assert.match(out, /opencode .* installed, outdated/, args.join(" "));
    assert.match(out, /opencode: installed by an older wikipoke .* `wikipoke hooks add opencode` updates them/);
    assert.doesNotMatch(out, /agents .* outdated/);
  }
  assert.equal(read(root, plugin), old, "reported, never rewritten");

  wikipoke(root, "hooks", "add", "opencode");
  assert.doesNotMatch(wikipoke(root, "hooks").out, /outdated/);
});

test("init says when the project's CONVENTIONS.md differs from the template, and keeps it", () => {
  const root = repo();
  wikipoke(root, "init");
  assert.doesNotMatch(wikipoke(root, "init").out, /differs from the template/, "a copy still equal to the template is news to nobody");
  writeFileSync(join(root, "wiki/CONVENTIONS.md"), "# our own schema\n");
  const out = wikipoke(root, "init").out;
  assert.match(out, /wiki\/CONVENTIONS\.md differs from the template this version ships/);
  assert.equal(read(root, "wiki/CONVENTIONS.md"), "# our own schema\n");
});

test("drift caps the moved citations it prints, like the files", () => {
  const lines = (n: number): string => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  const root = repo({ "src/billing/invoice.js": lines(20) });
  seed(root);
  const cites = Array.from({ length: 10 }, (_, i) => `\`src/billing/invoice.js:${i + 1}\``).join(", ");
  page(root, "components/billing.md", { body: `${cites}. [map](../architecture.md)` });
  git(root, "commit", "-qam", "cite");
  put(root, "src/billing/invoice.js", "top\n" + lines(20));
  git(root, "commit", "-qam", "one line on top");
  const out = wikipoke(root, "check", "drift").out;
  assert.equal(out.match(/is now line/g)?.length, 8);
  assert.match(out, /…and 2 more citation\(s\)/);
  assert.equal(wikipoke(root, "check", "drift", "-v").out.match(/is now line/g)?.length, 10);
});

test("lint warns when a link's text and its line anchor disagree", () => {
  const root = repo({ "src/billing/invoice.js": "a\nb\nc\nd\n" });
  seed(root);
  page(root, "components/billing.md", {
    body:
      "[invoice.js:2](../../src/billing/invoice.js#L2) and [invoice.js:1](../../src/billing/invoice.js#L3). " +
      "An example is not a link: `[a.js:1](../../src/billing/invoice.js#L4)`. [map](../architecture.md)",
  });
  const lint = json<LintJson>(root, "check", "lint", "--json");
  const found = lint.warnings.filter((f) => f.page === "components/billing").map((f) => f.message);
  assert.deepEqual(found, ["`[invoice.js:1](../../src/billing/invoice.js#L3)` says line 1 and links to line 3: one of them moved"]);
});

/** GET through node:http, which, unlike fetch, lets a test send a Host header of its own. */
function fetchWith(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((done, fail) => {
    get(url, { headers }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk.toString()));
      res.on("end", () => done({ status: res.statusCode ?? 0, body }));
    }).on("error", fail);
  });
}

test("atlas --out writes the page and a snapshot of the wiki, and only where it may", () => {
  const root = repo();
  seed(root);
  put(root, "src/billing/tax.js", "export const rate = 0.21;\n");
  git(root, "commit", "-qam", "raise tax");
  git(root, "remote", "add", "origin", "https://someone:s3cret@github.com/acme/demo.git");

  const { code, out } = wikipoke(root, "atlas", "--out", "site");
  assert.equal(code, 0, out);
  for (const file of ["index.html", "atlas.css", "atlas.js", "graph.js", "logo.webp", "marked.js", "marked.LICENSE.md", "wiki.js"])
    assert.ok(existsSync(join(root, "site", file)), file);
  assert.match(read(root, "site/index.html"), /Created with 🧡 by <a href="https:\/\/webreactiva.dev\/wikipoke">wikipoke<\/a>/);

  const script = read(root, "site/wiki.js");
  const snap = JSON.parse(script.replace(/^window\.ATLAS = /, "").replace(/;\n$/, "")) as Snapshot;
  assert.equal(snap.live, false);
  assert.deepEqual(snap.pages.map((p) => p.id), ["architecture", "components/billing"]);
  assert.deepEqual(snap.docs.map((d) => d.id), ["index", "log", "CONVENTIONS"]);
  const billing = snap.pages.find((p) => p.id === "components/billing");
  assert.deepEqual(billing?.backlinks, ["architecture"]);
  assert.deepEqual(billing?.stale, ["src/billing/tax.js"]);
  assert.equal(snap.pages.find((p) => p.id === "architecture")?.stale, null);
  // Citations open on the remote, built from its host and path: the token never reaches the page.
  assert.equal(snap.blob, "https://github.com/acme/demo/blob/");
  assert.doesNotMatch(script, /s3cret/);

  // Never into the wiki, never into a directory it did not make; a previous export is its own.
  assert.equal(wikipoke(root, "atlas", "--out", "wiki/site").code, 2);
  assert.ok(!existsSync(join(root, "wiki/site")));
  assert.equal(wikipoke(root, "atlas", "--out", "docs").code, 2);
  assert.ok(!existsSync(join(root, "docs/index.html")));
  assert.equal(wikipoke(root, "atlas", "--out", "site").code, 0);
});

test("atlas serves the wiki live, hands out only tracked files, and says when a page changes", async () => {
  const root = repo();
  seed(root);
  put(root, "secret.env", "TOKEN=1\n"); // untracked, like a real one
  const served = await serve({ root, wikiDir: join(root, "wiki"), wiki: "wiki" }, { port: 0, exact: true });
  try {
    const snap = JSON.parse((await fetchWith(`${served.url}wiki.json`)).body) as Snapshot;
    assert.equal(snap.live, true);
    assert.equal(snap.pages.length, 2);
    assert.equal((await fetchWith(`${served.url}marked.js`)).status, 200);
    assert.equal((await fetchWith(`${served.url}graph.js`)).status, 200);

    assert.deepEqual(await fetchWith(`${served.url}code/src/cli.js`), { status: 200, body: "console.log('hi');\n" });
    assert.equal((await fetchWith(`${served.url}code/secret.env`)).status, 404);
    assert.equal((await fetchWith(`${served.url}code/src%2F..%2F..%2Fetc%2Fpasswd`)).status, 404);
    // A page elsewhere that rebinds its own name to 127.0.0.1 is still not this machine.
    assert.equal((await fetchWith(`${served.url}wiki.json`, { host: "evil.example" })).status, 403);

    const changed = new Promise<string>((done, fail) => {
      get(`${served.url}events`, (res) => {
        res.on("data", (chunk: Buffer) => {
          if (chunk.toString().includes("data: change")) done("change");
          else put(root, "wiki/log.md", "# Log\n\n## later\n- edited\n");
        });
      }).on("error", fail);
      setTimeout(() => fail(new Error("no change event within 3s")), 3000).unref();
    });
    assert.equal(await changed, "change");
  } finally {
    await served.close();
  }
});
