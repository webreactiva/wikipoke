// `wikipoke init` when a person is at the terminal: the same init and the same hooks as the plain
// run, asked for one step at a time. Nothing is written before the person says yes, and nothing
// here decides on its own what a plain run would not: a hook is still only installed when ticked.
//
// Agents, pipes and CI never reach this file: the CLI takes its plain path when stdin or stdout is
// not a terminal, or when --yes says not to ask, and that output stays exactly as it was.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import type { HookName, HookState, Report } from "./install.ts";
import { SKILLS, addHooks, hookStatus, init } from "./install.ts";
import { CONFIG_FILE, DEFAULT_WIKI, IGNORE_FILE, STATE_FILE, chooseWiki, color, wikiDir } from "./lib.ts";
import { cancel, confirm, intro, isCancel, log, multiselect, note, outro, text } from "./prompts.ts";

const LOGO = [
  "██╗    ██╗██╗██╗  ██╗██╗██████╗  ██████╗ ██╗  ██╗███████╗",
  "██║    ██║██║██║ ██╔╝██║██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝",
  "██║ █╗ ██║██║█████╔╝ ██║██████╔╝██║   ██║█████╔╝ █████╗  ",
  "██║███╗██║██║██╔═██╗ ██║██╔═══╝ ██║   ██║██╔═██╗ ██╔══╝  ",
  "╚███╔███╔╝██║██║  ██╗██║██║     ╚██████╔╝██║  ██╗███████╗",
  " ╚══╝╚══╝ ╚═╝╚═╝  ╚═╝╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝",
];

/**
 * What each hook touches, for the note shown above the checklist: the file, and whether it is
 * committed, which decides whether the whole team gets it. The note has room for this; a
 * checklist row does not (see hookChoices).
 */
const TOUCHES: Record<HookName, string> = {
  git: "post-commit hook of this clone · not committed",
  claude: "SessionStart hook in .claude/settings.json · committed",
  opencode: ".opencode/plugin/wikipoke.js · committed",
  cursor: ".cursor/rules/wikipoke.mdc · committed",
  agents: "a block in AGENTS.md · committed",
};

/** The checklist's hints: a few words each, the note above says the rest. */
const SHORT: Record<HookName, string> = {
  git: "after each commit, in your terminal",
  claude: "when Claude Code starts",
  opencode: "when OpenCode starts",
  cursor: "a rule Cursor always reads",
  agents: "for Codex and other agents",
};

/**
 * The checklist. Rows are the bare hook names, so the summary clack prints once it is answered
 * reads "git, claude". A hook starts ticked when it is installed or the repository shows signs of
 * its agent. Unticking an installed one does not remove it — that stays with `hooks remove` — so
 * only the rows that would change something come back as `wanted`.
 *
 * clack prints the hint beside the row under the cursor and beside every ticked one, and wraps a
 * row at the terminal's width less its *styled* prefix, colour codes counted: 13 columns, 14 where
 * it draws `[ ]` for want of unicode. A hint that would not fit is left out rather than wrapped.
 */
export function hookChoices(
  hooks: HookState[],
  columns = 80,
): {
  options: { value: HookName; label: string; hint?: string }[];
  initial: HookName[];
  wanted: (selected: HookName[]) => HookName[];
} {
  return {
    options: hooks.map((hook) => {
      const hint = `${SHORT[hook.name]}${hook.outdated ? " · outdated" : hook.installed ? " · installed" : ""}`;
      // "◻ " before the name, " (" and ")" around the hint.
      return 2 + hook.name.length + hint.length + 3 <= columns - 14 ? { value: hook.name, label: hook.name, hint } : { value: hook.name, label: hook.name };
    }),
    initial: hooks.filter((hook) => hook.installed || hook.detected).map((hook) => hook.name),
    wanted: (selected) => hooks.filter((hook) => selected.includes(hook.name) && (!hook.installed || hook.outdated)).map((hook) => hook.name),
  };
}

/** Before anything is written a cancel is a failure, so `wikipoke init && …` stops there. */
function stop(): never {
  cancel("Nothing was written.");
  process.exit(1);
}

/**
 * A clack note, or the same lines without the box when one would not fit: clack wraps a line too
 * long for the box by breaking the box itself.
 */
function box(lines: string[], title: string): void {
  const widest = Math.max(title.length, ...lines.map((line) => stripVTControlCharacters(line).length));
  if (widest + 9 <= (process.stdout.columns ?? 80)) note(lines.join("\n"), title);
  else log.message([color.bold(title), ...lines].join("\n"));
}

function show(report: Report): void {
  const lines = (["created", "updated", "removed", "kept"] as const).flatMap((label) =>
    report[label].map((path) => `${color.dim(label.padEnd(8))} ${path}`),
  );
  if (lines.length) log.message(lines.join("\n"));
  for (const step of report.manual) log.warn(step);
}

/** Writes, and on failure (a file where a directory goes, no permission) says so inside the frame. */
function write(step: () => Report): void {
  try {
    show(step());
  } catch (error) {
    cancel(`Stopped: ${(error as Error).message}`);
    process.exit(1);
  }
}

export async function interactiveInit(root: string, dir: string | undefined, version: string): Promise<void> {
  // The logo is 56 columns: in a narrower terminal it would wrap into noise.
  if ((process.stdout.columns ?? 0) >= 60) console.log(`\n${LOGO.map((line) => color.bold(line)).join("\n")}`);
  console.log(color.dim(`a code wiki that agents maintain · v${version}\n`));
  intro("wikipoke init");

  const current = wikiDir(root);
  let wiki = dir;
  if (wiki === undefined) {
    const answer = await text({
      message: "Where should the wiki live?",
      initialValue: current,
      validate: (value) => {
        const choice = chooseWiki(value, root);
        return choice.ok ? undefined : choice.problem;
      },
    });
    if (isCancel(answer)) stop();
    wiki = answer;
  }
  // The CLI checked --dir already, and the prompt validated its own answer.
  const choice = chooseWiki(wiki, root);
  if (!choice.ok) throw new Error(choice.problem);
  wiki = choice.wiki;

  // init never moves a wiki: a new folder starts empty and the old one stays. Said before the yes.
  if (wiki !== current && existsSync(join(root, current, "CONVENTIONS.md")))
    log.warn(`The wiki moves from ${current}/ to ${wiki}/, which starts empty.\n${current}/ stays as it is: move its pages yourself.`);

  const rows: [string, string][] = [];
  if (wiki !== DEFAULT_WIKI) rows.push([CONFIG_FILE, "where the wiki lives"]);
  else if (existsSync(join(root, CONFIG_FILE))) rows.push([CONFIG_FILE, `removed: the wiki is back in ${DEFAULT_WIKI}/`]);
  const kept = (path: string): string => (existsSync(join(root, path)) ? ` ${color.dim("(kept)")}` : "");
  const refreshed = existsSync(join(root, ".agents/skills", SKILLS[0] ?? "")) ? ` ${color.dim("(refreshed)")}` : "";
  rows.push(
    [`${wiki}/CONVENTIONS.md`, `the rules the skills follow${kept(`${wiki}/CONVENTIONS.md`)}`],
    [`${wiki}/${IGNORE_FILE}`, `what the wiki leaves out${kept(`${wiki}/${IGNORE_FILE}`)}`],
    [".agents/skills/", `${SKILLS.length} skills, for every agent${refreshed}`],
    [".claude/skills/", `the same skills, for Claude Code${refreshed}`],
  );
  const width = Math.max(...rows.map(([path]) => path.length));
  box(rows.map(([path, what]) => `${path.padEnd(width)}  ${what}`), "This will write");
  const go = await confirm({ message: "Set up wikipoke in this repository?" });
  if (isCancel(go) || !go) stop();

  write(() => init(root, { dir: wiki }));

  const states = hookStatus(root, wiki);
  box(
    states.flatMap((hook) => [
      `${hook.name.padEnd(9)} ${SHORT[hook.name]}`,
      `  ${color.dim(TOUCHES[hook.name])}`,
      // Here and not only in the hint, which a narrow terminal drops.
      ...(hook.installed ? [`  ${hook.outdated ? color.yellow("installed, outdated: tick it to update it") : color.green("installed")}`] : []),
    ]),
    "Hooks: they tell you when the wiki falls behind",
  );
  const hooks = hookChoices(states, process.stdout.columns);
  const selected = await multiselect({
    message: "Which hooks do you want?",
    options: hooks.options,
    initialValues: hooks.initial,
    required: false,
  });
  // Cancelling here keeps what init wrote and adds no hook: the same as ticking none, said aloud.
  if (isCancel(selected)) log.warn("No hook installed.\n`wikipoke hooks add <name>` adds one later.");
  const names = isCancel(selected) ? [] : hooks.wanted(selected);
  if (names.length) write(() => addHooks(root, names, wiki));

  if (existsSync(join(root, wiki, STATE_FILE)))
    box(["The wiki is already seeded.", "", `See what it owes:  npx wikipoke check`, `Browse it:         npx wikipoke atlas`], "How to start");
  else
    box(
      [
        "1. Open your agent in this repository",
        "2. Seed the wiki:",
        "     Claude Code   /wikipoke-ingest",
        '     others        "use the wikipoke-ingest skill"',
        "3. Browse it:      npx wikipoke atlas",
        "4. Check it later: npx wikipoke check",
      ],
      "How to start",
    );
  outro("Done. The wiki is yours: wikipoke never writes a page.");
}
