// Puts the wiki's working parts into a repository and takes them out again.
//
// `init` writes what every wiki needs: the schema, the ignore list and the three skills. Hooks are
// optional and only installed on request (`wikipoke hooks add <name>`). Each one runs the wiki's
// notifier at a moment where knowing that the wiki is behind is useful: after a commit, or when an
// agent starts a session. None of them writes the wiki.
//
// Everything written here is spelled for this repository's wiki directory: the templates carry a
// {{WIKI}} placeholder, so a project that keeps its wiki in docs/wiki gets skills, hooks and a
// schema that say docs/wiki. Nothing downstream has to look the path up.
//
// Every file wikipoke rewrites carries MARKER. A file without it belongs to the project and is
// never touched: it is reported as a step to do by hand instead.
//
// `templates/` sits next to `src/` in the repository and next to `dist/` in an install, and this
// file is two levels down in both, so one relative URL reaches it either way.
import { chmodSync, existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG_FILE, DEFAULT_WIKI, HOOK_FILE, IGNORE_FILE, chooseWiki, gitOrNull, wikiDir } from "./lib.ts";

export const MARKER = "managed by wikipoke";
export const SKILLS = ["wikipoke-ingest", "wikipoke-query", "wikipoke-lint"];
const NEUTRAL_SKILLS = ".agents/skills";
const CLAUDE_SKILLS = ".claude/skills";
const SETTINGS = ".claude/settings.json";
const AGENTS = "AGENTS.md";
const BLOCK = /<!-- wikipoke:start[\s\S]*?<!-- wikipoke:end -->\n?/;
const templates = fileURLToPath(new URL("../../templates/", import.meta.url));

/** What every command that writes returns: one bucket per outcome, all of them paths but `manual`. */
export interface Report {
  created: string[];
  updated: string[];
  removed: string[];
  kept: string[];
  manual: string[];
}

/** The buckets that hold a path, as opposed to a sentence for a person to act on. */
type Placed = "created" | "updated" | "removed" | "kept";

/** One optional hook: where it lives, when it speaks, and what suggests the project uses it. */
export interface Hook {
  where: string;
  when: string;
  signs: string[];
}

export type HookName = "git" | "claude" | "opencode" | "cursor" | "agents";

/**
 * A hook plus what this repository says about it right now. `outdated` means installed, but its
 * file or the notifier it runs differs from what this version of wikipoke would write.
 */
export interface HookState extends Hook {
  name: HookName;
  installed: boolean;
  outdated: boolean;
  detected: boolean;
}

export interface InitOptions {
  dir?: string;
}

/** Installing or removing one hook: everything each needs, and the report it writes into. */
type HookAction = (root: string, wiki: string, out: Report) => void;

const notifier = (wiki: string): string => `${wiki}/${HOOK_FILE}`;
const notify = (wiki: string): string => `sh ${notifier(wiki)}`;

/** The optional hooks: where each one lives, when it speaks, and what suggests the project uses it. */
export const HOOKS: Record<HookName, Hook> = {
  git: { where: ".git/hooks/post-commit", when: "after each commit, in your terminal", signs: [] },
  // Not a bare `.claude`: init writes .claude/skills itself, so the directory's existence would
  // only prove wikipoke had run. These are files a project puts there, or does not.
  claude: { where: SETTINGS, when: "when a Claude Code session starts", signs: ["CLAUDE.md", SETTINGS, ".claude/settings.local.json"] },
  opencode: { where: ".opencode/plugin/wikipoke.js", when: "when an OpenCode session starts", signs: [".opencode", "opencode.json"] },
  cursor: { where: ".cursor/rules/wikipoke.mdc", when: "a rule Cursor reads in every session", signs: [".cursor", ".cursorrules"] },
  agents: { where: AGENTS, when: "a note for Codex and any agent that reads AGENTS.md", signs: [AGENTS] },
};

const template = (name: string, wiki: string): string =>
  readFileSync(join(templates, name), "utf8").replaceAll("{{WIKI}}", wiki);
const read = (path: string | null): string | null => (path && existsSync(path) ? readFileSync(path, "utf8") : null);
const report = (): Report => ({ created: [], updated: [], removed: [], kept: [], manual: [] });

function write(path: string, content: string, mode?: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  if (mode) chmodSync(path, mode);
}

/** Removes empty directories upwards, stopping at the first one that still holds something. */
function prune(dir: string, root: string): void {
  while (dir !== root && dir.startsWith(root)) {
    try {
      rmdirSync(dir);
    } catch {
      return;
    }
    dir = dirname(dir);
  }
}

/** Writes a file wikipoke manages: when missing, or when it is still wikipoke's. */
function place(
  root: string,
  path: string,
  content: string,
  out: Report,
  { mode, foreign }: { mode?: number; foreign?: string } = {},
): void {
  const rel = relative(root, path);
  const old = read(path);
  if (old !== null && !old.includes(MARKER)) {
    out.manual.push(foreign ?? `${rel} exists and is not managed by wikipoke: left unchanged.`);
    return;
  }
  if (old === content) return;
  write(path, content, mode);
  out[old === null ? "created" : "updated"].push(rel);
}

/** Deletes a file wikipoke manages; a file that is not its own stays. */
function unplace(root: string, path: string, out: Report, { keepDirs = false }: { keepDirs?: boolean } = {}): void {
  const old = read(path);
  if (old === null) return;
  if (!old.includes(MARKER)) {
    out.manual.push(`${relative(root, path)} is not managed by wikipoke: left in place.`);
    return;
  }
  rmSync(path);
  if (!keepDirs) prune(dirname(path), root);
  out.removed.push(relative(root, path));
}

function postCommitPath(root: string): string | null {
  const hooks = gitOrNull(root, ["rev-parse", "--git-path", "hooks"])?.trim();
  if (!hooks) return null;
  const dir = resolve(root, hooks);
  // Husky 9 points git at .husky/_ and rewrites every file in it on each install. Its wrapper, `h`,
  // runs the hook of the same name one level up, which is the one that lasts.
  return join(existsSync(join(dir, "h")) ? dirname(dir) : dir, "post-commit");
}

/**
 * The homes an agent looks in. Claude Code reads only `.claude/skills`; OpenCode, Codex and the
 * rest read the neutral `.agents/skills`. Both are written every time, because a skill nobody can
 * see is a skill that does not exist, and detecting Claude Code from the repository does not work:
 * it runs perfectly well against a checkout with no `.claude/` and no `CLAUDE.md` in it. They are
 * inert Markdown either way — nothing runs them until a person names one — which is the whole
 * difference between a skill and a hook.
 */
const SKILL_HOMES = [NEUTRAL_SKILLS, CLAUDE_SKILLS];

function writeSkills(root: string, home: string, wiki: string, out: Report): void {
  for (const skill of SKILLS) place(root, join(root, home, skill, "SKILL.md"), template(`skills/${skill}/SKILL.md`, wiki), out);
}

/**
 * The schema, the ignore list and the skills. No hooks: those are asked for separately.
 * `dir` moves the wiki, and is remembered in .wikipoke.json so every later command agrees.
 */
export function init(root: string, { dir }: InitOptions = {}): Report {
  const out = report();
  let wiki = wikiDir(root);
  if (dir !== undefined) {
    // The CLI rejects a bad `--dir` before it gets here, so this only catches a programmatic
    // caller. It throws rather than reporting: a report that says nothing went wrong while none
    // of the files were written is worse than no report at all.
    const choice = chooseWiki(dir, root);
    if (!choice.ok) throw new Error(choice.problem);
    wiki = choice.wiki;
    const path = join(root, CONFIG_FILE);
    const current = read(path);
    // The default needs no configuration; anything else is written down so nothing has to guess.
    const wanted_ = wiki === DEFAULT_WIKI ? null : `${JSON.stringify({ wiki }, null, 2)}\n`;
    if (wanted_ === null && current !== null) {
      rmSync(path);
      out.removed.push(CONFIG_FILE);
    } else if (wanted_ !== null && wanted_ !== current) {
      write(path, wanted_);
      out[current === null ? "created" : "updated"].push(CONFIG_FILE);
    }
  }

  // The schema and the ignore list are the project's the moment they exist: never overwritten.
  for (const [file, source] of [["CONVENTIONS.md", "CONVENTIONS.md"], [IGNORE_FILE, "wikipokeignore"]] as const) {
    const path = join(root, wiki, file);
    if (existsSync(path)) out.kept.push(relative(root, path));
    else {
      write(path, template(source, wiki));
      out.created.push(relative(root, path));
    }
  }
  // Kept, but not in silence: a schema that fell behind the skills reading it is how rules go
  // missing. The ignore list is left out on purpose — every project tailors it, so it always differs.
  const conventions = join(root, wiki, "CONVENTIONS.md");
  if (out.kept.includes(relative(root, conventions)) && read(conventions) !== template("CONVENTIONS.md", wiki))
    out.manual.push(
      `${relative(root, conventions)} differs from the template this version ships, ${join(templates, "CONVENTIONS.md")} ` +
        `({{WIKI}} stands for ${wiki}). It is the project's and was kept: carry over what you want from the template.`,
    );
  for (const home of SKILL_HOMES) writeSkills(root, home, wiki, out);
  return out;
}

/** Where each hook's own file is, and what this version would put there; claude has no file of its own. */
const HOOK_FILES: Record<HookName, (root: string, wiki: string) => { path: string | null; content: string } | null> = {
  git: (root, wiki) => ({ path: postCommitPath(root), content: template("post-commit", wiki) }),
  claude: () => null,
  opencode: (root, wiki) => ({ path: join(root, HOOKS.opencode.where), content: template("opencode-plugin.js", wiki) }),
  cursor: (root, wiki) => ({ path: join(root, HOOKS.cursor.where), content: template("cursor-rule.mdc", wiki) }),
  agents: (root, wiki) => ({ path: join(root, AGENTS), content: template("agents-block.md", wiki) }),
};

/**
 * Whether an installed hook differs from what `hooks add` would write now. Nothing here writes:
 * a hook changes what someone's terminal or agent sees, so updating it waits for them to ask.
 */
function outdated(root: string, wiki: string, name: HookName): boolean {
  if (read(join(root, notifier(wiki))) !== template("wikipoke-hook.sh", wiki)) return true;
  const file = HOOK_FILES[name](root, wiki);
  if (!file) return false;
  const current = read(file.path) ?? "";
  // AGENTS.md is shared: only wikipoke's block is compared. A post-commit the project owns holds
  // only the line it was told to add, and the notifier that line runs was compared above.
  if (name === "agents") return current.match(BLOCK)?.[0] !== file.content.match(BLOCK)?.[0];
  return current.includes(MARKER) && current !== file.content;
}

const INSTALLED: Record<HookName, (root: string, wiki: string) => boolean> = {
  // By the notifier it runs, not the marker: a post-commit the project owns gets that line added by
  // hand, and never the marker, which would hand the whole file to wikipoke.
  git: (root, wiki) => read(postCommitPath(root))?.includes(notifier(wiki)) ?? false,
  claude: (root, wiki) => read(join(root, SETTINGS))?.includes(notify(wiki)) ?? false,
  opencode: (root) => read(join(root, HOOKS.opencode.where))?.includes(MARKER) ?? false,
  cursor: (root) => read(join(root, HOOKS.cursor.where))?.includes(MARKER) ?? false,
  agents: (root) => BLOCK.test(read(join(root, AGENTS)) ?? ""),
};

/** Every optional hook, whether it is installed, and whether the project shows signs of using it. */
export function hookStatus(root: string, wiki: string = wikiDir(root)): HookState[] {
  return (Object.entries(HOOKS) as [HookName, Hook][]).map(([name, hook]) => {
    const installed = INSTALLED[name](root, wiki);
    return {
      name,
      ...hook,
      installed,
      outdated: installed && outdated(root, wiki, name),
      detected: hook.signs.some((sign) => existsSync(join(root, sign))),
    };
  });
}

const ADD: Record<HookName, HookAction> = {
  git(root, wiki, out) {
    const path = postCommitPath(root);
    if (!path) {
      out.manual.push("No git hooks directory was found for this repository.");
      return;
    }
    place(root, path, template("post-commit", wiki), out, {
      mode: 0o755,
      foreign: `${relative(root, path)} already exists. Add this line to it: sh "$(git rev-parse --show-toplevel)/${notifier(wiki)}"`,
    });
  },
  claude(root, wiki, out) {
    // The briefing points at a skill, so Claude Code has to be able to see the skills.
    writeSkills(root, CLAUDE_SKILLS, wiki, out);
    const outcome = wireClaude(root, wiki);
    if (outcome === "manual") out.manual.push(`${SETTINGS} could not be read as JSON. Add a SessionStart hook running \`${notify(wiki)}\` to it.`);
    else if (outcome !== "kept") out[outcome].push(SETTINGS);
  },
  opencode: (root, wiki, out) => place(root, join(root, HOOKS.opencode.where), template("opencode-plugin.js", wiki), out),
  cursor: (root, wiki, out) => place(root, join(root, HOOKS.cursor.where), template("cursor-rule.mdc", wiki), out),
  agents(root, wiki, out) {
    const path = join(root, AGENTS);
    const old = read(path);
    const block = template("agents-block.md", wiki);
    const rest = withoutBlock(old ?? "");
    const next = rest.trim() ? `${rest.replace(/\n+$/, "")}\n\n${block}` : block;
    if (next === old) return;
    write(path, next);
    out[old === null ? "created" : "updated"].push(AGENTS);
  },
};

const REMOVE: Record<HookName, HookAction> = {
  git(root, _wiki, out) {
    const path = postCommitPath(root);
    if (path) unplace(root, path, out, { keepDirs: true });
  },
  claude(root, wiki, out) {
    // The skills in .claude/skills stay: they are skills, not a hook, and `uninstall` takes them.
    const outcome = unwireClaude(root, wiki);
    if (outcome === "removed") out.removed.push(`${SETTINGS} (SessionStart hook)`);
    if (outcome === "manual") out.manual.push(`Remove the \`${notify(wiki)}\` SessionStart hook from ${SETTINGS} by hand.`);
  },
  opencode: (root, _wiki, out) => unplace(root, join(root, HOOKS.opencode.where), out),
  cursor: (root, _wiki, out) => unplace(root, join(root, HOOKS.cursor.where), out),
  agents(root, _wiki, out) {
    const path = join(root, AGENTS);
    const old = read(path);
    if (old === null || !BLOCK.test(old)) return;
    const rest = withoutBlock(old);
    if (rest.trim()) write(path, rest);
    else rmSync(path);
    out.removed.push(`${AGENTS} (wikipoke block)`);
  },
};

/** Installs the named hooks, and the notifier they all run. */
export function addHooks(root: string, names: HookName[], wiki: string = wikiDir(root)): Report {
  const out = report();
  place(root, join(root, notifier(wiki)), template("wikipoke-hook.sh", wiki), out, { mode: 0o755 });
  for (const name of names) ADD[name](root, wiki, out);
  return out;
}

/** Removes the named hooks, and the notifier once no hook is left to run it. */
export function removeHooks(root: string, names: HookName[], wiki: string = wikiDir(root)): Report {
  const out = report();
  for (const name of names) REMOVE[name](root, wiki, out);
  if (!hookStatus(root, wiki).some((hook) => hook.installed)) unplace(root, join(root, notifier(wiki)), out);
  return out;
}

/** Takes out the skills and every hook. The wiki itself (pages, schema, checkpoint) stays. */
export function uninstall(root: string): Report {
  const wiki = wikiDir(root);
  const out = removeHooks(root, Object.keys(HOOKS) as HookName[], wiki);
  for (const home of SKILL_HOMES)
    for (const skill of SKILLS) unplace(root, join(root, home, skill, "SKILL.md"), out);
  return out;
}

/** The file without wikipoke's block, and without the blank lines the block sat between. */
function withoutBlock(text: string): string {
  const match = text.match(BLOCK);
  if (!match || match.index === undefined) return text;
  const before = text.slice(0, match.index).replace(/\n+$/, "");
  const after = text.slice(match.index + match[0].length).replace(/^\n+/, "");
  if (!before) return after;
  return after ? `${before}\n\n${after}` : `${before}\n`;
}

/** `.claude/settings.json` as far as wikipoke reads it: one entry among whatever else is in there. */
interface ClaudeSettings {
  hooks?: { SessionStart?: unknown[] } & Record<string, unknown>;
  [key: string]: unknown;
}

/** Adds one SessionStart hook to `.claude/settings.json`, keeping everything else in it. */
function wireClaude(root: string, wiki: string): Placed | "manual" {
  const path = join(root, SETTINGS);
  const raw = read(path);
  let settings: unknown;
  try {
    settings = raw === null ? {} : JSON.parse(raw);
  } catch {
    return "manual";
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return "manual";
  const config = settings as ClaudeSettings;
  config.hooks ??= {};
  config.hooks.SessionStart ??= [];
  if (JSON.stringify(config.hooks.SessionStart).includes(notify(wiki))) return "kept";
  config.hooks.SessionStart.push({ matcher: "startup|resume", hooks: [{ type: "command", command: notify(wiki), timeout: 15 }] });
  write(path, `${JSON.stringify(config, null, 2)}\n`);
  return raw === null ? "created" : "updated";
}

function unwireClaude(root: string, wiki: string): "removed" | "manual" | null {
  const path = join(root, SETTINGS);
  const raw = read(path);
  if (raw === null || !raw.includes(notify(wiki))) return null;
  let config: ClaudeSettings;
  try {
    config = JSON.parse(raw) as ClaudeSettings;
  } catch {
    return "manual";
  }
  const start = (config.hooks?.SessionStart ?? []).filter((entry) => !JSON.stringify(entry).includes(notify(wiki)));
  if (config.hooks) {
    if (start.length) config.hooks.SessionStart = start;
    else delete config.hooks.SessionStart;
    if (!Object.keys(config.hooks).length) delete config.hooks;
  }
  if (!Object.keys(config).length) {
    rmSync(path);
    prune(dirname(path), root);
  } else write(path, `${JSON.stringify(config, null, 2)}\n`);
  return "removed";
}
