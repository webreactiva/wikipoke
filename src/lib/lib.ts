// Shared helpers for the three checks (lint · drift · coverage). No dependencies.
//
// The contract these enforce lives in the wiki's CONVENTIONS.md, which every project owns and may
// edit. This file must never become the place where the schema is defined by accident: when the
// two disagree, CONVENTIONS.md wins and this file gets fixed.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";

/** Where the wiki lives when the repository does not say otherwise. */
export const DEFAULT_WIKI = "wiki";

/** The only configuration wikipoke reads, and only projects that moved the wiki have it. */
export const CONFIG_FILE = ".wikipoke.json";

/** Files inside the wiki that belong to wikipoke rather than to a page. */
export const IGNORE_FILE = ".wikipokeignore";
export const STATE_FILE = ".wikipoke-state.json";
export const HOOK_FILE = ".wikipoke-hook.sh";

/**
 * What `check` hands every check: the repository root, the wiki's absolute path, and the wiki's
 * path relative to the root, which is the one that goes into messages a person reads.
 */
export interface CheckContext {
  root: string;
  wikiDir: string;
  wiki: string;
}

/** `-v` is the only thing a report reads; each check decides what it means for its own output. */
export interface ReportOptions {
  verbose?: boolean | undefined;
}

/**
 * A page as `listPages` finds it, before its text is read. `id` is what messages and links use;
 * `rel` is the path inside the wiki; `path` is absolute.
 */
export interface Page {
  id: string;
  rel: string;
  path: string;
}

/** One frontmatter value: the flat contract allows scalars and lists of scalars, nothing deeper. */
export type FrontmatterValue = string | string[];

/** Parsed frontmatter. Pages may carry keys the checks never look at, so this stays open. */
export type Frontmatter = Record<string, FrontmatterValue | undefined>;

/** A page with its text read and its frontmatter parsed. `meta` is null when there is none. */
export interface LoadedPage extends Page {
  meta: Frontmatter | null;
  body: string;
  raw: string;
}

/** Where a link points, as far as the checks are concerned. */
export type LinkKind = "page" | "repo" | "external";

/** A Markdown link out of a page. `target` is null only when nothing can be resolved. */
export interface Link {
  raw: string;
  target: string | null;
  kind: LinkKind;
}

/** A `path:line` pointer in prose. */
export interface Citation {
  raw: string;
  path: string;
  line: number;
}

/** `.wikipokeignore`, split into what it takes out and what a `!` line brings back. */
export interface IgnoreRules {
  excludes: string[];
  includes: string[];
}

/** The repository checkpoint the ingest skill writes and only it advances. */
export interface State {
  version?: number;
  last_indexed_commit?: string;
}

/**
 * The wiki directory, relative to the repository root: `wiki`, or whatever `.wikipoke.json` says.
 * Everything else takes it as an argument, so a repository can keep its wiki wherever it wants.
 */
export function wikiDir(root: string): string {
  try {
    const raw = readFileSync(join(root, CONFIG_FILE), "utf8");
    const value: unknown = (JSON.parse(raw) as { wiki?: unknown }).wiki;
    return typeof value === "string" && value.trim() ? value.replace(/\/+$/, "") : DEFAULT_WIKI;
  } catch {
    return DEFAULT_WIKI;
  }
}

/** A `--dir` path: the wiki directory it names, or why it cannot hold one. */
export type WikiChoice = { ok: true; wiki: string } | { ok: false; problem: string };

/**
 * A wiki path a project may set: relative, inside the repository, not the repository itself, a
 * place git commits, and not a path something else already occupies. These are checked here rather
 * than left to `mkdir`, so a bad `--dir` is a sentence the caller can print instead of a stack trace
 * from halfway through writing the files, or a wiki that is never committed. The wiki already
 * set up is never refused for being ignored: it is the project's, and `init` must be able to re-run
 * on it.
 */
export function chooseWiki(value: unknown, root: string): WikiChoice {
  const raw = String(value ?? "").trim();
  const unusable = (why: string): WikiChoice => ({ ok: false, problem: `Not a usable wiki directory: ${String(value)}. ${why}` });
  // The shell expands ~ only unquoted and at the start of a word: here it would be a folder named ~.
  if (raw.startsWith("~")) return unusable("~ is not expanded here: give a path inside the repository, such as docs/wiki.");
  // Every template embeds this path, and the hooks run it through sh: "/" is the only separator.
  if (raw.includes("\\")) return unusable('Separate folders with "/", such as docs/wiki.');
  const clean = posix.normalize(raw).replace(/^(\.\/)+/, "").replace(/\/+$/, "");
  if (!raw || clean === "." || clean.startsWith("/") || clean.split("/").includes(".."))
    return unusable("Give a path inside the repository, such as docs/wiki.");
  // At any depth, in any case: macOS reads .GIT as .git, and git refuses to track a .git component.
  if (clean.split("/").some((segment) => segment.toLowerCase() === ".git"))
    return unusable("git keeps its own files there and never tracks it: use a folder such as docs/wiki.");
  // A symlink on the way can lead out of the repository, or into .git, whatever the path says.
  const real = realInside(root, clean);
  if (real === null) return unusable("A symlink on the way leads outside the repository: give a folder inside it, such as docs/wiki.");
  if (real.split(sep).some((segment) => segment.toLowerCase() === ".git"))
    return unusable("A symlink on the way leads into git's own directory: use a folder such as docs/wiki.");
  // Exit 0 means ignored; 1 (not ignored) and any git error come back as null and let it through.
  // A wiki already tracked under an ignore rule is committed all the same, so git's own answer counts.
  const existing = clean === wikiDir(root) && existsSync(join(root, clean, "CONVENTIONS.md"));
  if (!existing && gitOrNull(root, ["check-ignore", "-q", `${clean}/`]) !== null)
    return unusable("git ignores it, so the wiki would never be committed.");
  const full = join(root, clean);
  if (existsSync(full) && !statSync(full).isDirectory()) return unusable("It is a file: the wiki needs a directory of its own.");
  return { ok: true, wiki: clean };
}

/**
 * Where `path` really lands, relative to the repository, following symlinks through its deepest
 * part that exists; null when that is outside the repository.
 */
function realInside(root: string, path: string): string | null {
  let existing = join(root, path);
  while (!existsSync(existing) && existing !== root) existing = dirname(existing);
  const rel = relative(realpathSync(root), realpathSync(existing));
  return rel.startsWith("..") || isAbsolute(rel) ? null : rel;
}

/** The page types a wiki gets when its CONVENTIONS.md does not list its own. */
export const DEFAULT_TYPES = ["architecture", "flow", "entity", "concept", "decision"];

/** `confidence:` values. Absent means `high`. */
export const CONFIDENCE = ["high", "inferred"];

/**
 * Frontmatter keys every page must carry. There is deliberately no date: `synced:` already answers
 * "how old is this knowledge?" through `git show -s --format=%cs <sha>`. Pages may carry any other
 * key; the checks do not police them.
 */
export const REQUIRED_KEYS = ["title", "type", "responsibility", "sources", "synced"];

/**
 * Page count past which reading index.md first stops telling pages apart. A conservative marker,
 * not a measured threshold: its job is to bring the retrieval question back to a human.
 */
export const INDEX_SCALE_LIMIT = 80;

/** Files inside wiki/ that are not pages (no frontmatter contract). */
export const NON_PAGES = new Set(["CONVENTIONS.md", "index.md", "log.md"]);

/** A directory holding one of these is the root of a package. */
const MANIFESTS = [
  "package.json", "composer.json", "pyproject.toml", "setup.py", "Cargo.toml", "go.mod",
  "Gemfile", "pom.xml", "build.gradle", "build.gradle.kts", "mix.exs", "deno.json",
];

export function repoRoot(cwd: string = process.cwd()): string {
  return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
}

export function git(root: string, args: string[], opts: Record<string, unknown> = {}): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...opts });
}

export function gitOrNull(root: string, args: string[]): string | null {
  try {
    return git(root, args, { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

export function commitExists(root: string, sha: string): boolean {
  return gitOrNull(root, ["cat-file", "-e", `${sha}^{commit}`]) !== null;
}

const lines = (s: string | null): string[] => (s ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

/**
 * Files changed between `sha` and the working tree, new files included. Uncommitted work counts:
 * a page is stale the moment its source is edited, not only once it is committed.
 */
export function changedSince(root: string, sha: string): string[] {
  const tracked = gitOrNull(root, ["diff", "--name-only", sha, "--"]);
  const untracked = gitOrNull(root, ["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...lines(tracked), ...lines(untracked)])].sort();
}

export function commitsSince(root: string, sha: string): number {
  const out = gitOrNull(root, ["rev-list", "--count", `${sha}..HEAD`]);
  return out ? Number(out.trim()) : 0;
}

export function shortSha(sha: string | undefined): string {
  return (sha ?? "").slice(0, 7);
}

/** Every tracked file in the repository. */
export function trackedFiles(root: string): string[] {
  return lines(gitOrNull(root, ["ls-files"]));
}

/**
 * `.wikipokeignore` split into what it excludes and what a `!` line brings back. Re-inclusion is
 * order-independent — every `!` line wins over every plain one — because these are git pathspecs
 * applied in two passes, not gitignore rules read top to bottom.
 */
export function ignoreRules(wikiDir: string): IgnoreRules {
  const excludes: string[] = [];
  const includes: string[] = [];
  for (const line of readIgnore(wikiDir)) {
    if (!line.startsWith("!")) excludes.push(line);
    else if (line.slice(1).trim()) includes.push(line.slice(1).trim());
  }
  return { excludes, includes };
}

/** `.wikipokeignore`'s plain lines as git exclude pathspecs. */
export function ignoreSpecs(wikiDir: string): string[] {
  return ignoreRules(wikiDir).excludes.map((p) => `:(exclude)${p}`);
}

/**
 * The paths a git command reports, minus what `.wikipokeignore` excludes and plus what its `!`
 * lines bring back. Git does the matching in both passes, so one pathspec dialect decides
 * everything: a plain `*` crosses directories, exactly as the ignore file says it does.
 */
function indexablePaths(root: string, wikiDir: string, args: string[]): string[] {
  const { excludes, includes } = ignoreRules(wikiDir);
  const kept = lines(gitOrNull(root, [...args, "--", ".", ...excludes.map((p) => `:(exclude)${p}`)]));
  if (!includes.length) return kept;
  const back = lines(gitOrNull(root, [...args, "--", ...includes]));
  return [...new Set([...kept, ...back])].sort();
}

/** Tracked files minus wiki/.wikipokeignore: what coverage and the repo axis are measured against. */
export function indexableFiles(root: string, wikiDir: string): string[] {
  return indexablePaths(root, wikiDir, ["ls-files"]);
}

/** Files changed in a git range, filtered the same way: the repo axis of drift. */
export function indexableChanges(root: string, wikiDir: string, range: string): string[] {
  return indexablePaths(root, wikiDir, ["diff", "--name-only", range]);
}

/**
 * Tracked files `.wikipokeignore` keeps out of coverage, the wiki's own pages aside — those are
 * never code and would drown the list. Ignoring is a conscious call, so the number is reported
 * rather than left to be discovered by its absence.
 */
export function ignoredFiles(root: string, wikiDir: string): string[] {
  const indexable = new Set(indexableFiles(root, wikiDir));
  const wiki = `${relative(root, wikiDir).split(sep).join(posix.sep)}/`;
  return trackedFiles(root).filter((f) => !indexable.has(f) && !f.startsWith(wiki));
}

export function readIgnore(wikiDir: string): string[] {
  const file = join(wikiDir, IGNORE_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

/** The repository checkpoint: { version, last_indexed_commit }. */
export function readState(wikiDir: string): State | null {
  const file = join(wikiDir, STATE_FILE);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as State;
  } catch {
    return null;
  }
}

/**
 * The valid `type:` values: the backticked first column of the first table under the "page types"
 * heading in CONVENTIONS.md, so a project adds a type by adding a row. Falls back to the defaults
 * when the file or the table is missing.
 */
export function pageTypes(wikiDir: string): string[] {
  const file = join(wikiDir, "CONVENTIONS.md");
  if (!existsSync(file)) return DEFAULT_TYPES;
  const text = readFileSync(file, "utf8").split("\n");
  const start = text.findIndex((line) => /^##\s.*page types/i.test(line));
  if (start === -1) return DEFAULT_TYPES;
  const types: string[] = [];
  let body = false; // rows count only after the header separator
  for (const line of text.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    if (/^\|\s*:?-{3,}/.test(line)) body = true;
    else if (body && !line.startsWith("|")) break;
    else if (body) {
      const type = line.match(/^\|\s*`([a-z][\w-]*)`\s*\|/)?.[1];
      if (type) types.push(type);
    }
  }
  return types.length ? types : DEFAULT_TYPES;
}

/** Every page under wiki/, excluding the non-page files. `id` is the path without `.md`. */
export function listPages(wikiDir: string): Page[] {
  const out: Page[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) {
        const rel = relative(wikiDir, full).split(sep).join(posix.sep);
        if (NON_PAGES.has(rel)) continue;
        out.push({ id: rel.replace(/\.md$/, ""), rel, path: full });
      }
    }
  };
  walk(wikiDir);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Flat frontmatter: scalars, block lists (`- item`) and inline arrays (`[a, b]`). Deliberately
 * limited: it is the contract CONVENTIONS.md documents, and a parser that accepts more than the
 * contract lets pages drift out of it.
 */
export function parseFrontmatter(raw: string): { data: Frontmatter | null; body: string } {
  if (!raw.startsWith("---")) return { data: null, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { data: null, body: raw };
  const block = raw.slice(raw.indexOf("\n") + 1, end);
  const body = raw.slice(end + 4);
  const data: Frontmatter = {};
  let currentKey: string | null = null;
  for (const line of block.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item?.[1] !== undefined && currentKey) {
      // A `- item` line only ever follows the empty `key:` that opened the list.
      (data[currentKey] as string[]).push(unquote(item[1]));
      continue;
    }
    const pair = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!pair) continue;
    const key = pair[1] as string;
    const rest = pair[2] as string;
    if (rest === "") {
      currentKey = key;
      data[key] = [];
    } else if (rest.startsWith("[")) {
      currentKey = null;
      data[key] = rest.replace(/^\[|\]$/g, "").split(",").map((v) => unquote(v.trim())).filter(Boolean);
    } else {
      currentKey = null;
      data[key] = unquote(rest);
    }
  }
  return { data, body };
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, "").trim();
}

export function readPage(page: Page): LoadedPage {
  const raw = readFileSync(page.path, "utf8");
  const { data, body } = parseFrontmatter(raw);
  return { ...page, meta: data, body, raw };
}

/** One frontmatter key as the list it may also be written as: `sources:`, `related:`. */
export function asList(value: FrontmatterValue | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** A wildcard-free source pointing at a directory means `dir/**`. */
export function normalizeSource(source: string, root: string): string {
  if (/[*?]/.test(source)) return source;
  const full = join(root, source);
  if (existsSync(full) && statSync(full).isDirectory()) return `${source.replace(/\/$/, "")}/**`;
  return source;
}

/**
 * Does this `sources:` entry claim a whole package (a directory with its own manifest) or the whole
 * repository? Such a claim makes coverage read green for code nobody wrote up.
 */
export function isOverBroad(source: string, root: string): boolean {
  if (/^(\.|\*\*?)(\/\*\*?)*\/?$/.test(source)) return true;
  const dir = source.replace(/\/\*\*$/, "").replace(/\/$/, "");
  if (/[*?]/.test(dir)) return false;
  const full = join(root, dir);
  if (!existsSync(full) || !statSync(full).isDirectory()) return false;
  return MANIFESTS.some((m) => existsSync(join(full, m)));
}

export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:[^/]*/)*";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += (c as string).replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(file: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(file));
}

/** Compiled matchers for one page's `sources:`. */
export function sourcePatterns(meta: Frontmatter | null, root: string): RegExp[] {
  return asList(meta?.sources).map((s) => globToRegExp(normalizeSource(s, root)));
}

/**
 * Markdown links out of a page body, code fences and spans stripped first. Returns
 * `{ raw, target, kind }` where kind is:
 *   "page"     → resolves inside wiki/ (compared against the pages)
 *   "repo"     → resolves outside wiki/ (compared against the filesystem)
 *   "external" → http(s), mailto, bare anchors: never checked
 * Plain Markdown on purpose: it is checkable here, and `[[term]]` tends to collide with whatever
 * the host project already uses double brackets for.
 */
export function markdownLinks(body: string, pageRel: string, wikiDir: string, root: string): Link[] {
  const prose = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const out: Link[] = [];
  for (const m of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = m[1] as string;
    if (/^(?:https?:|mailto:|#)/.test(raw)) {
      out.push({ raw, target: null, kind: "external" });
      continue;
    }
    out.push(classifyLink(raw, pageRel, wikiDir, root));
  }
  return out;
}

/**
 * `path:line` references in prose: the way CONVENTIONS.md says to point at code instead of copying
 * it. Fenced blocks are stripped, because a diagram or an example is not a claim; inline code is
 * kept, since a citation is normally written as `src/lib/lib.ts:96`.
 *
 * Lines are numbered from 1, so `file.js:0` points at nothing and is not a citation at all: it is
 * left to the prose rather than reported as a pointer that rotted.
 */
export function codeCitations(body: string): Citation[] {
  const prose = body.replace(/```[\s\S]*?```/g, "");
  const out: Citation[] = [];
  for (const m of prose.matchAll(/(?<![\w:/.-])([\w.-]+(?:\/[\w.-]+)*\.[A-Za-z]\w{0,9}):([1-9]\d*)/g))
    out.push({ raw: m[0], path: m[1] as string, line: Number(m[2]) });
  return out;
}

/**
 * Every citation on a page, in either form an agent writes: `path:line` in prose, or a link into
 * the repository with a GitHub line anchor, `[event.ts](../src/core/event.ts#L12)`. A wiki written
 * the second way used to go entirely unchecked, because the link text alone (`event.ts:12`) names
 * no path. `raw` is what the page says, so a report names text someone can find and replace; a
 * pointer written both ways counts once. A range (`#L12-L20`) is checked by its first line.
 */
export function pageCitations(body: string, pageRel: string, wikiDir: string, root: string): Citation[] {
  const out = codeCitations(body);
  const seen = new Set(out.map((c) => `${c.path}:${c.line}`));
  for (const link of markdownLinks(body, pageRel, wikiDir, root)) {
    const line = Number(link.raw.match(/#L([1-9]\d*)(?:-L?\d+)?$/)?.[1]);
    if (link.kind !== "repo" || !link.target || !line || seen.has(`${link.target}:${line}`)) continue;
    seen.add(`${link.target}:${line}`);
    out.push({ raw: link.raw, path: link.target, line });
  }
  return out;
}

/** `[[...]]` in prose. Never resolved: reported, so a page written for another tool shows up. */
export function wikilinks(body: string): string[] {
  const prose = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return [...prose.matchAll(/\[\[([^\]\n]+)\]\]/g)].map((m) => m[0]);
}

/** `related:` entries are declared links and get checked exactly like body links. */
export function relatedLinks(meta: Frontmatter | null, pageRel: string, wikiDir: string, root: string): Link[] {
  return asList(meta?.related)
    .filter((r) => r.endsWith(".md"))
    .map((r) => classifyLink(r, pageRel, wikiDir, root));
}

function classifyLink(raw: string, pageRel: string, wikiDir: string, root: string): Link {
  let clean = raw.split("#")[0] as string;
  try {
    clean = decodeURI(clean);
  } catch {
    // a malformed escape is checked as written
  }
  if (!clean) return { raw, target: null, kind: "external" };
  const from = dirname(join(wikiDir, pageRel));
  const abs = resolve(from, clean);
  const inWiki = relative(wikiDir, abs);
  if (!inWiki.startsWith("..") && !inWiki.startsWith(sep)) {
    return { raw, target: inWiki.split(sep).join(posix.sep), kind: "page" };
  }
  return { raw, target: relative(root, abs).split(sep).join(posix.sep), kind: "repo" };
}

/** Paints a string for a terminal, and leaves it alone when the output is not one. */
export type Paint = (s: string | number) => string;

const tty = process.stdout.isTTY;
const paint = (code: number): Paint => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const color: Record<"dim" | "red" | "yellow" | "green" | "bold", Paint> = {
  dim: paint(2),
  red: paint(31),
  yellow: paint(33),
  green: paint(32),
  bold: paint(1),
};
