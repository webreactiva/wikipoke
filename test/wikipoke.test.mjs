import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../bin/wikipoke.mjs", import.meta.url));

function put(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function git(root, ...args) {
  // Piped, so the post-commit notifier that init installs does not print into the test report.
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
}

/** A small repository with some code, committed. */
function repo(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "wikipoke-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "test");
  const all = {
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

function wikipoke(root, ...args) {
  const res = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
  return { code: res.status, out: res.stdout + res.stderr };
}

function page(root, path, { type = "entity", sources = ["src/billing"], synced, body = "", wiki = "wiki" } = {}) {
  put(
    root,
    `${wiki}/${path}`,
    `---\ntitle: ${path}\ntype: ${type}\nresponsibility: documents ${path}\nsources:\n` +
      sources.map((s) => `  - ${s}\n`).join("") +
      `synced: ${synced ?? git(root, "rev-parse", "--short", "HEAD")}\n---\n${body}\n`,
  );
}

/** Seeds the wiki the way the ingest skill would: pages, index, log, checkpoint. */
function seed(root, wiki = "wiki") {
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

const read = (root, path) => readFileSync(join(root, path), "utf8");
const ALL_HOOKS = ["git", "claude", "opencode", "cursor", "agents"];

test("init writes the schema, the ignore list and the neutral skills, and no hook unless asked", () => {
  const root = repo();
  const { code, out } = wikipoke(root, "init");
  assert.equal(code, 0);
  for (const path of [
    "wiki/CONVENTIONS.md",
    "wiki/.wikipokeignore",
    ".agents/skills/wikipoke-ingest/SKILL.md",
    ".agents/skills/wikipoke-query/SKILL.md",
    ".agents/skills/wikipoke-lint/SKILL.md",
  ])
    assert.ok(existsSync(join(root, path)), path);
  for (const path of ["wiki/.wikipoke-hook.sh", ".git/hooks/post-commit", ".claude", "AGENTS.md", "wiki/.wikipoke-state.json"])
    assert.ok(!existsSync(join(root, path)), path);
  // Nobody to ask when an agent runs it: the output tells the agent to ask the person.
  assert.match(out, /None was installed\. Ask the person which they want/);
});

test("init adds the skills for Claude Code where it is used, and leaves its settings alone", () => {
  const settings = '{"permissions":{"allow":["Bash(ls)"]}}';
  const root = repo({ "CLAUDE.md": "# rules\n", ".claude/settings.json": settings });
  const { out } = wikipoke(root, "init");
  assert.ok(existsSync(join(root, ".claude/skills/wikipoke-ingest/SKILL.md")));
  assert.equal(read(root, ".claude/settings.json"), settings);
  assert.match(out, /claude .* used here/);
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
  assert.equal(read(root, "AGENTS.md").match(/wikipoke:start/g).length, 1);
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

  const cov = JSON.parse(wikipoke(root, "check", "coverage", "--json").out);
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
  const drift = JSON.parse(wikipoke(root, "check", "drift", "--json").out);
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
  const lint = JSON.parse(wikipoke(root, "check", "lint", "--json").out);
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
  const before = JSON.parse(wikipoke(root, "check", "lint", "--json").out);
  assert.ok(before.errors.some((f) => /unknown type `runbook`/.test(f.message)));

  const conventions = readFileSync(join(root, "wiki/CONVENTIONS.md"), "utf8").replace(
    "| `decision`",
    "| `runbook`      | how to operate something in production    | `runbooks/deploy.md`       |\n| `decision`",
  );
  writeFileSync(join(root, "wiki/CONVENTIONS.md"), conventions);
  const after = JSON.parse(wikipoke(root, "check", "lint", "--json").out);
  assert.ok(!after.errors.some((f) => /unknown type/.test(f.message)), JSON.stringify(after.errors));
  assert.ok(!after.errors.some((f) => /unknown type `type`/.test(f.message)));
});

test("a source claiming a whole package or the whole repository is over-broad; a folder is not", () => {
  const root = repo({ "packages/api/package.json": "{}\n", "packages/api/server.js": "//\n" });
  seed(root);
  page(root, "components/api.md", { sources: ["packages/api", "src/billing"], body: "[map](../architecture.md)" });
  page(root, "concepts/all.md", { type: "concept", sources: ["**"], body: "[map](../architecture.md)" });
  const lint = JSON.parse(wikipoke(root, "check", "lint", "--json").out);
  const broad = lint.warnings.filter((f) => /over-broad/.test(f.message)).map((f) => f.message.match(/`([^`]+)`/)[1]);
  assert.deepEqual(broad.sort(), ["**", "packages/api"]);
});

test("the notifier is silent when the wiki is current, and the git hook speaks after a commit it has not seen", () => {
  const root = repo();
  seed(root);
  mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
  symlinkSync(cli, join(root, "node_modules/.bin/wikipoke"));
  wikipoke(root, "hooks", "add", "git");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "add the notifier");
  assert.equal(execFileSync("sh", ["wiki/.wikipoke-hook.sh"], { cwd: root, encoding: "utf8" }), "");

  put(root, "src/cli.js", "console.log('bye');\n");
  // Git runs hooks with their output on stderr.
  const commit = spawnSync("git", ["commit", "-qam", "change cli"], { cwd: root, encoding: "utf8" });
  assert.equal(commit.status, 0);
  assert.match(commit.stderr, /behind[\s\S]*stale\s+architecture/);
});
