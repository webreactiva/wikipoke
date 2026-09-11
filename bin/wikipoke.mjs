#!/usr/bin/env node
// wikipoke: a code wiki that agents maintain. Three skills write it; this CLI sets it up and
// checks it, and never writes a page.
//
//   wikipoke init [--claude]              the schema, the ignore list and the skills
//   wikipoke hooks [add|remove <name>...] optional notifiers: git, claude, opencode, cursor, agents
//   wikipoke check [lint|drift|coverage]... [--json] [--strict] [-v]
//   wikipoke uninstall                    skills and hooks out; the wiki stays
//
// `check` exits 1 on lint errors (a broken wiki), or on any finding at all with --strict.
// Staleness and coverage are debt, not breakage: they do not fail a plain run.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import * as coverage from "../lib/coverage.mjs";
import * as drift from "../lib/drift.mjs";
import { HOOKS, addHooks, hookStatus, init, removeHooks, uninstall } from "../lib/install.mjs";
import { IGNORE_FILE, STATE_FILE, color, listPages, repoRoot, wikiDir } from "../lib/lib.mjs";
import * as lint from "../lib/lint.mjs";

const CHECKS = { drift, coverage, lint };
const HOOK_NAMES = Object.keys(HOOKS);

const HELP = `wikipoke: a code wiki that agents maintain

  wikipoke init [--claude] [--dir <path>]
                               write CONVENTIONS.md, ${IGNORE_FILE} and the three skills. The wiki
                               lives in wiki/ unless --dir moves it, which is then remembered in
                               .wikipoke.json; --claude adds the skills for Claude Code even
                               without a CLAUDE.md
  wikipoke hooks               list the optional hooks and which are installed
  wikipoke hooks add <name>... install hooks: ${HOOK_NAMES.join(", ")}
  wikipoke hooks remove <name>...
  wikipoke check [lint|drift|coverage]...
      --json                   machine-readable, for the skills
      --strict                 exit 1 on any finding (CI)
      -v, --verbose            list every file instead of a summary
  wikipoke uninstall           remove the skills and hooks; the wiki stays

Then, in your agent: run the wikipoke-ingest skill to seed the wiki.`;

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      strict: { type: "boolean" },
      verbose: { type: "boolean", short: "v" },
      claude: { type: "boolean" },
      dir: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
  });
} catch (error) {
  console.error(`${error.message}\n\n${HELP}`);
  process.exit(2);
}
const { values: flags, positionals } = args;
const [command, ...rest] = positionals;

if (flags.version) {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  console.log(manifest.version);
  process.exit(0);
}
if (flags.help || !command) {
  console.log(HELP);
  process.exit(command || flags.help ? 0 : 2);
}

let root;
try {
  root = repoRoot();
} catch {
  console.error("wikipoke works inside a git repository, and this is not one.");
  process.exit(2);
}
let wiki = wikiDir(root);
let wikiPath = join(root, wiki);

function print(report) {
  for (const label of ["created", "updated", "removed", "kept"])
    for (const path of report[label]) console.log(`${color.dim(label.padEnd(8))} ${path}`);
  for (const step of report.manual) console.log(`${color.yellow("by hand")}  ${step}`);
}

function printHooks() {
  for (const hook of hookStatus(root, wiki)) {
    const state = hook.installed ? color.green("installed") : hook.detected ? color.dim("used here") : "";
    console.log(`  ${hook.name.padEnd(9)} ${hook.when.padEnd(52)} ${state}`);
  }
}

function hookNames(names) {
  const unknown = names.filter((name) => !HOOKS[name]);
  if (!names.length || unknown.length) {
    console.error(`${unknown.length ? `unknown hook: ${unknown.join(", ")}. ` : ""}Name one or more of: ${HOOK_NAMES.join(", ")}`);
    process.exit(2);
  }
  return [...new Set(names)];
}

if (command === "init") {
  print(init(root, { ...(flags.claude ? { claude: true } : {}), ...(flags.dir === undefined ? {} : { dir: flags.dir }) }));
  wiki = wikiDir(root); // --dir may have just moved it
  wikiPath = join(root, wiki);
  console.log(`\nHooks are optional. Each one tells you or your agent when the wiki falls behind the code:\n`);
  printHooks();
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(`\nInstall which? Names separated by spaces, Enter for none: `).catch(() => ""); // Ctrl+D or Ctrl+C: none
    prompt.close();
    const names = answer.split(/[\s,]+/).filter(Boolean);
    if (names.length) print(addHooks(root, hookNames(names)));
  } else {
    // Run by an agent, or piped: nobody to ask here, so the agent asks the person.
    console.log(`\nNone was installed. Ask the person which they want, then run: wikipoke hooks add <name>...`);
  }
  console.log(
    existsSync(join(wikiPath, STATE_FILE))
      ? `\nThe wiki is already seeded: \`wikipoke check\` shows what it owes.`
      : `\nNext: open your agent and run the wikipoke-ingest skill to seed the wiki.`,
  );
  process.exit(0);
}

if (command === "hooks") {
  const [action, ...names] = rest;
  if (!action) printHooks();
  else if (action === "add") print(addHooks(root, hookNames(names)));
  else if (action === "remove") print(removeHooks(root, hookNames(names)));
  else {
    console.error(`unknown hooks action: ${action} (expected: add, remove)`);
    process.exit(2);
  }
  process.exit(0);
}

if (command === "uninstall") {
  const report = uninstall(root);
  print(report);
  if (!report.removed.length && !report.manual.length) console.log("Nothing of wikipoke's was installed here.");
  console.log(color.dim(`\n${wiki}/ stays: it is the project's knowledge, not wikipoke's.`));
  process.exit(0);
}

if (command !== "check") {
  console.error(`unknown command: ${command}\n\n${HELP}`);
  process.exit(2);
}

const unknown = rest.filter((name) => !CHECKS[name]);
if (unknown.length) {
  console.error(`unknown check: ${unknown.join(", ")} (expected: ${Object.keys(CHECKS).join(", ")})`);
  process.exit(2);
}

if (!existsSync(join(wikiPath, "CONVENTIONS.md"))) {
  console.error(`No ${wiki}/CONVENTIONS.md here: run \`wikipoke init\` first.`);
  process.exit(1);
}

const all = !rest.length;

// Before the first ingest there is nothing to be stale or unsound yet. A check named on purpose
// still runs: seeding reads coverage to decide what to ignore.
if (all && !existsSync(join(wikiPath, STATE_FILE)) && !listPages(wikiPath).length) {
  if (flags.json) console.log(JSON.stringify({ seeded: false }));
  else console.log(`${color.yellow("unseeded")}  the wiki has no pages yet ${color.dim("-> wikipoke-ingest")}`);
  process.exit(flags.strict ? 1 : 0);
}

const names = all ? Object.keys(CHECKS) : [...new Set(rest)];
const ctx = { root, wikiDir: wikiPath, wiki };
const results = Object.fromEntries(names.map((name) => [name, CHECKS[name].run(ctx)]));

const findings = {
  lint: (r) => r.errors.length + r.warnings.length,
  drift: (r) => r.stale.length + r.skipped.length + (r.repo.status === "current" ? 0 : 1),
  coverage: (r) => r.unclaimed.length,
};
const total = names.reduce((sum, name) => sum + findings[name](results[name]), 0);

if (flags.json) {
  console.log(JSON.stringify(names.length === 1 ? results[names[0]] : results, null, 2));
} else if (all && !total) {
  console.log(color.green(`✓ wiki: current, covered and sound (${results.lint.pages} pages)`));
} else {
  for (const name of names)
    if (findings[name](results[name]) || (name === "lint" && !all)) CHECKS[name].report(results[name], { verbose: flags.verbose });
}

const errors = results.lint?.errors.length ?? 0;
process.exit(flags.strict ? (total ? 1 : 0) : errors ? 1 : 0);
