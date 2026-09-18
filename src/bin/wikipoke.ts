#!/usr/bin/env node
// wikipoke: a code wiki that agents maintain. Three skills write it; this CLI sets it up, checks
// it and shows it, and never writes a page.
//
//   wikipoke init [--dir <path>]          the schema, the ignore list and the skills; re-run to refresh
//   wikipoke hooks [add|remove <name>...] optional notifiers: git, claude, opencode, cursor, agents
//   wikipoke check [lint|drift|coverage]... [--json] [--strict] [-v]
//   wikipoke atlas [--port <n>] [--out <dir>]  the wiki in a browser, live or as a static site
//   wikipoke uninstall                    skills and hooks out; the wiki stays
//
// `check` exits 1 on lint errors (a broken wiki), or on any finding at all with --strict.
// Staleness and coverage are debt, not breakage: they do not fail a plain run.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import { exportSite } from "../atlas/export.ts";
import { DEFAULT_PORT, serve } from "../atlas/serve.ts";
import type { CoverageResult } from "../lib/coverage.ts";
import * as coverage from "../lib/coverage.ts";
import type { DriftResult } from "../lib/drift.ts";
import * as drift from "../lib/drift.ts";
import type { HookName, Report } from "../lib/install.ts";
import { HOOKS, addHooks, hookStatus, init, removeHooks, uninstall } from "../lib/install.ts";
import type { CheckContext, ReportOptions } from "../lib/lib.ts";
import { IGNORE_FILE, STATE_FILE, chooseWiki, color, listPages, repoRoot, wikiDir } from "../lib/lib.ts";
import type { LintResult } from "../lib/lint.ts";
import * as lint from "../lib/lint.ts";

const CHECKS = ["drift", "coverage", "lint"] as const;
type CheckName = (typeof CHECKS)[number];
const isCheck = (name: string): name is CheckName => (CHECKS as readonly string[]).includes(name);

/**
 * One check, run. Tagging the result with the name it came from is what lets the three shapes
 * travel together through counting, printing and `--json` without any of them being widened away.
 */
type Ran =
  | { name: "drift"; result: DriftResult }
  | { name: "coverage"; result: CoverageResult }
  | { name: "lint"; result: LintResult };

const HOOK_NAMES = Object.keys(HOOKS) as HookName[];
const isHook = (name: string): name is HookName => (HOOK_NAMES as string[]).includes(name);

const HELP = `wikipoke: a code wiki that agents maintain

  wikipoke init [--dir <path>]
                               write CONVENTIONS.md, ${IGNORE_FILE} and the three skills, into
                               .agents/skills/ and .claude/skills/ both. The wiki lives in wiki/
                               unless --dir moves it, which is then remembered in .wikipoke.json.
                               Re-run after upgrading wikipoke: it refreshes the skills, and says
                               which hooks are outdated without touching them
  wikipoke hooks               list the optional hooks, which are installed, which are outdated
  wikipoke hooks add <name>... install hooks, or update installed ones: ${HOOK_NAMES.join(", ")}
  wikipoke hooks remove <name>...
  wikipoke check [lint|drift|coverage]...
      --json                   machine-readable, for the skills
      --strict                 exit 1 on any finding (CI)
      -v, --verbose            list every file instead of a summary
  wikipoke atlas               browse the wiki at http://127.0.0.1:${DEFAULT_PORT}, redrawn as pages change
      --port <n>               another port
      --out <dir>              write it as a static site instead, citations linked to the remote
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
      dir: { type: "string" },
      out: { type: "string" },
      port: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
  });
} catch (error) {
  console.error(`${(error as Error).message}\n\n${HELP}`);
  process.exit(2);
}
const { values: flags, positionals } = args;
const [command, ...rest] = positionals;

if (flags.version) {
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
  console.log(manifest.version);
  process.exit(0);
}
if (flags.help || !command) {
  console.log(HELP);
  process.exit(command || flags.help ? 0 : 2);
}

let root: string;
try {
  root = repoRoot();
} catch {
  console.error("wikipoke works inside a git repository, and this is not one.");
  process.exit(2);
}
let wiki = wikiDir(root);
let wikiPath = join(root, wiki);

function print(report: Report): void {
  for (const label of ["created", "updated", "removed", "kept"] as const)
    for (const path of report[label]) console.log(`${color.dim(label.padEnd(8))} ${path}`);
  for (const step of report.manual) console.log(`${color.yellow("by hand")}  ${step}`);
}

function printHooks(): { installed: number } {
  const hooks = hookStatus(root, wiki);
  for (const hook of hooks) {
    const state = hook.outdated
      ? color.yellow("installed, outdated")
      : hook.installed
        ? color.green("installed")
        : hook.detected
          ? color.dim("used here")
          : "";
    console.log(`  ${hook.name.padEnd(9)} ${hook.when.padEnd(52)} ${state}`);
  }
  // Said, not done: a hook changes what someone's terminal or agent sees, so the update is theirs
  // to ask for, and they should know it is coming.
  const stale = hooks.filter((hook) => hook.outdated).map((hook) => hook.name);
  if (stale.length)
    console.log(
      `
${stale.join(", ")}: installed by an older wikipoke and left as they are. ` +
        `\`wikipoke hooks add ${stale.join(" ")}\` updates them.`,
    );
  return { installed: hooks.filter((hook) => hook.installed).length };
}

/**
 * What `init` says when there is nobody at the terminal to ask. It never installs a hook on its
 * own — a hook changes what a person's terminal and other sessions do, and that is theirs to
 * agree to — but leaving with a shrug is how a repository ends up with no notifier at all and
 * discovers its wiki is stale months later. So it says plainly what is missing, that the reader
 * is the one who knows which row is theirs, and the exact command.
 */
function invitation(): string {
  return [
    ``,
    `No hook was installed. Hooks are the only thing that ever tells you the wiki has fallen`,
    `behind — \`wikipoke check\` speaks only when someone runs it — but each one changes what a`,
    `terminal or an agent session does, so wikipoke never adds one on its own.`,
    ``,
    `${color.bold("If you are an agent reading this")}: you know which of the rows above is you. Ask the person`,
    `whether they want it, and then run:`,
    ``,
    `    wikipoke hooks add <name>`,
    ``,
    `${color.dim("git is per clone: .git/hooks is not versioned, so every checkout installs it again.")}`,
    `${color.dim("The other four are ordinary repository files — commit one and everyone who clones has it.")}`,
  ].join("\n");
}

function hookNames(names: string[]): HookName[] {
  const unknown = names.filter((name) => !isHook(name));
  if (!names.length || unknown.length) {
    console.error(`${unknown.length ? `unknown hook: ${unknown.join(", ")}. ` : ""}Name one or more of: ${HOOK_NAMES.join(", ")}`);
    process.exit(2);
  }
  return [...new Set(names.filter(isHook))];
}

if (command === "init") {
  // Before anything is written: an init that cannot place the wiki must not go on to print the
  // hook invitation and "next, seed the wiki", least of all exit 0 for an agent to believe.
  if (flags.dir !== undefined) {
    const choice = chooseWiki(flags.dir, root);
    if (!choice.ok) {
      console.error(choice.problem);
      process.exit(2);
    }
  }
  print(init(root, flags.dir === undefined ? {} : { dir: flags.dir }));
  wiki = wikiDir(root); // --dir may have just moved it
  wikiPath = join(root, wiki);
  console.log(`\nHooks are optional. Each one tells you or your agent when the wiki falls behind the code:\n`);
  const { installed } = printHooks();
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(`\nInstall which? Names separated by spaces, Enter for none: `).catch(() => ""); // Ctrl+D or Ctrl+C: none
    prompt.close();
    const names = answer.split(/[\s,]+/).filter(Boolean);
    if (names.length) print(addHooks(root, hookNames(names)));
  } else if (!installed) {
    // Run by an agent, or piped: nobody to ask here, so hand the decision on rather than drop it.
    // Which hook fits is something the agent knows about itself and this command cannot see, so
    // the invitation names the choice and the command instead of guessing at one. A re-run on a
    // repository that already has one says nothing: "no hook was installed" would read as none is.
    console.log(invitation());
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
  if (!action) {
    if (!printHooks().installed) console.log(invitation());
  }
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

if (command === "atlas") {
  if (!existsSync(join(wikiPath, "CONVENTIONS.md"))) {
    console.error(`No ${wiki}/CONVENTIONS.md here: run \`wikipoke init\` first.`);
    process.exit(1);
  }
  const ctx: CheckContext = { root, wikiDir: wikiPath, wiki };
  if (flags.out !== undefined) {
    const exported = exportSite(ctx, flags.out);
    if (!exported.ok) {
      console.error(exported.problem);
      process.exit(2);
    }
    console.log(`${color.green("atlas")}  ${exported.dir} ${color.dim(`(${exported.files.length} files: open index.html, or publish the folder)`)}`);
    process.exit(0);
  }
  const port = flags.port === undefined ? DEFAULT_PORT : Number(flags.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`Not a port: ${flags.port}`);
    process.exit(2);
  }
  const served = await serve(ctx, { port, exact: flags.port !== undefined }).catch((error: Error) => {
    console.error(`atlas could not start: ${error.message}`);
    process.exit(1);
  });
  console.log(`${color.green("atlas")}  ${served.url} ${color.dim("· redrawn as the wiki changes · Ctrl+C to stop")}`);
  await new Promise<never>(() => {});
}

if (command !== "check") {
  console.error(`unknown command: ${command}\n\n${HELP}`);
  process.exit(2);
}

const unknown = rest.filter((name) => !isCheck(name));
if (unknown.length) {
  console.error(`unknown check: ${unknown.join(", ")} (expected: ${CHECKS.join(", ")})`);
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

const names: CheckName[] = all ? [...CHECKS] : [...new Set(rest.filter(isCheck))];
const ctx: CheckContext = { root, wikiDir: wikiPath, wiki };

const runCheck = (name: CheckName, ctx: CheckContext): Ran =>
  name === "drift"
    ? { name, result: drift.run(ctx) }
    : name === "coverage"
      ? { name, result: coverage.run(ctx) }
      : { name, result: lint.run(ctx) };

const countFindings = (ran: Ran): number =>
  ran.name === "drift"
    ? ran.result.stale.length + ran.result.moved.length + ran.result.skipped.length + (ran.result.repo.status === "current" ? 0 : 1)
    : ran.name === "coverage"
      ? ran.result.unclaimed.length
      : ran.result.errors.length + ran.result.warnings.length;

const reportOne = (ran: Ran, opts: ReportOptions): void => {
  if (ran.name === "drift") drift.report(ran.result, opts);
  else if (ran.name === "coverage") coverage.report(ran.result, opts);
  else lint.report(ran.result);
};

const results = names.map((name) => runCheck(name, ctx));
const total = results.reduce((sum, ran) => sum + countFindings(ran), 0);
const lintResult = results.find((ran) => ran.name === "lint")?.result as LintResult | undefined;

if (flags.json) {
  const first = results[0];
  console.log(
    JSON.stringify(results.length === 1 && first ? first.result : Object.fromEntries(results.map((r) => [r.name, r.result])), null, 2),
  );
} else if (all && !total) {
  console.log(color.green(`✓ wiki: current, covered and sound (${lintResult?.pages ?? 0} pages)`));
} else {
  for (const ran of results)
    if (countFindings(ran) || (ran.name === "lint" && !all)) reportOne(ran, { verbose: flags.verbose });
}

const errors = lintResult?.errors.length ?? 0;
process.exit(flags.strict ? (total ? 1 : 0) : errors ? 1 : 0);
