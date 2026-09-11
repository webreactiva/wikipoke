// Shared helpers for the three checks (lint · drift · coverage). No dependencies.
//
// The contract these enforce lives in the wiki's CONVENTIONS.md, which every project owns and may
// edit. This file must never become the place where the schema is defined by accident: when the
// two disagree, CONVENTIONS.md wins and this file gets fixed.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";

/** Where the wiki lives when the repository does not say otherwise. */
export const DEFAULT_WIKI = "wiki";

/** The only configuration wikipoke reads, and only projects that moved the wiki have it. */
export const CONFIG_FILE = ".wikipoke.json";

/** Files inside the wiki that belong to wikipoke rather than to a page. */
export const IGNORE_FILE = ".wikipokeignore";
export const STATE_FILE = ".wikipoke-state.json";
export const HOOK_FILE = ".wikipoke-hook.sh";

/**
 * The wiki directory, relative to the repository root: `wiki`, or whatever `.wikipoke.json` says.
 * Everything else takes it as an argument, so a repository can keep its wiki wherever it wants.
 */
export function wikiDir(root) {
  try {
    const raw = readFileSync(join(root, CONFIG_FILE), "utf8");
    const value = JSON.parse(raw).wiki;
    return typeof value === "string" && value.trim() ? value.replace(/\/+$/, "") : DEFAULT_WIKI;
  } catch {
    return DEFAULT_WIKI;
  }
}

/** A wiki path a project may set: relative, inside the repository, not the repository itself. */
export function validWiki(value) {
  const clean = String(value ?? "").trim().replace(/^\.\//, "").replace(/\/+$/, "");
  if (!clean || clean === "." || clean.startsWith("/") || clean.split("/").includes("..")) return null;
  return clean;
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

export function repoRoot(cwd = process.cwd()) {
  return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
}

export function git(root, args, opts = {}) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...opts });
}

export function gitOrNull(root, args) {
  try {
    return git(root, args, { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

export function commitExists(root, sha) {
  return gitOrNull(root, ["cat-file", "-e", `${sha}^{commit}`]) !== null;
}

const lines = (s) => (s ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

/**
 * Files changed between `sha` and the working tree, new files included. Uncommitted work counts:
 * a page is stale the moment its source is edited, not only once it is committed.
 */
export function changedSince(root, sha) {
  const tracked = gitOrNull(root, ["diff", "--name-only", sha, "--"]);
  const untracked = gitOrNull(root, ["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...lines(tracked), ...lines(untracked)])].sort();
}

export function commitsSince(root, sha) {
  const out = gitOrNull(root, ["rev-list", "--count", `${sha}..HEAD`]);
  return out ? Number(out.trim()) : 0;
}

export function shortSha(sha) {
  return (sha ?? "").slice(0, 7);
}

/** Every tracked file in the repository. */
export function trackedFiles(root) {
  return lines(gitOrNull(root, ["ls-files"]));
}

/** `.wikipokeignore` as git exclude pathspecs. */
export function ignoreSpecs(wikiDir) {
  return readIgnore(wikiDir).map((p) => `:(exclude)${p}`);
}

/** Tracked files minus wiki/.wikipokeignore: what coverage and the repo axis are measured against. */
export function indexableFiles(root, wikiDir) {
  return lines(gitOrNull(root, ["ls-files", "--", ".", ...ignoreSpecs(wikiDir)]));
}

export function readIgnore(wikiDir) {
  const file = join(wikiDir, IGNORE_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

/** The repository checkpoint: { version, last_indexed_commit }. */
export function readState(wikiDir) {
  const file = join(wikiDir, STATE_FILE);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * The valid `type:` values: the backticked first column of the first table under the "page types"
 * heading in CONVENTIONS.md, so a project adds a type by adding a row. Falls back to the defaults
 * when the file or the table is missing.
 */
export function pageTypes(wikiDir) {
  const file = join(wikiDir, "CONVENTIONS.md");
  if (!existsSync(file)) return DEFAULT_TYPES;
  const text = readFileSync(file, "utf8").split("\n");
  const start = text.findIndex((line) => /^##\s.*page types/i.test(line));
  if (start === -1) return DEFAULT_TYPES;
  const types = [];
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
export function listPages(wikiDir) {
  const out = [];
  const walk = (dir) => {
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
export function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return { data: null, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { data: null, body: raw };
  const block = raw.slice(raw.indexOf("\n") + 1, end);
  const body = raw.slice(end + 4);
  const data = {};
  let currentKey = null;
  for (const line of block.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && currentKey) {
      data[currentKey].push(unquote(item[1]));
      continue;
    }
    const pair = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!pair) continue;
    const [, key, rest] = pair;
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

function unquote(value) {
  return value.replace(/^["']|["']$/g, "").trim();
}

export function readPage(page) {
  const raw = readFileSync(page.path, "utf8");
  const { data, body } = parseFrontmatter(raw);
  return { ...page, meta: data, body, raw };
}

/** A wildcard-free source pointing at a directory means `dir/**`. */
export function normalizeSource(source, root) {
  if (/[*?]/.test(source)) return source;
  const full = join(root, source);
  if (existsSync(full) && statSync(full).isDirectory()) return `${source.replace(/\/$/, "")}/**`;
  return source;
}

/**
 * Does this `sources:` entry claim a whole package (a directory with its own manifest) or the whole
 * repository? Such a claim makes coverage read green for code nobody wrote up.
 */
export function isOverBroad(source, root) {
  if (/^(\.|\*\*?)(\/\*\*?)*\/?$/.test(source)) return true;
  const dir = source.replace(/\/\*\*$/, "").replace(/\/$/, "");
  if (/[*?]/.test(dir)) return false;
  const full = join(root, dir);
  if (!existsSync(full) || !statSync(full).isDirectory()) return false;
  return MANIFESTS.some((m) => existsSync(join(full, m)));
}

export function globToRegExp(glob) {
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
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(file, patterns) {
  return patterns.some((p) => p.test(file));
}

/** Compiled matchers for one page's `sources:`. */
export function sourcePatterns(meta, root) {
  return [].concat(meta?.sources ?? []).map((s) => globToRegExp(normalizeSource(s, root)));
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
export function markdownLinks(body, pageRel, wikiDir, root) {
  const prose = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const out = [];
  for (const m of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = m[1];
    if (/^(?:https?:|mailto:|#)/.test(raw)) {
      out.push({ raw, target: null, kind: "external" });
      continue;
    }
    out.push(classifyLink(raw, pageRel, wikiDir, root));
  }
  return out;
}

/** `[[...]]` in prose. Never resolved: reported, so a page written for another tool shows up. */
export function wikilinks(body) {
  const prose = body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return [...prose.matchAll(/\[\[([^\]\n]+)\]\]/g)].map((m) => m[0]);
}

/** `related:` entries are declared links and get checked exactly like body links. */
export function relatedLinks(meta, pageRel, wikiDir, root) {
  return [].concat(meta?.related ?? [])
    .filter((r) => r.endsWith(".md"))
    .map((r) => classifyLink(r, pageRel, wikiDir, root));
}

function classifyLink(raw, pageRel, wikiDir, root) {
  let clean = raw.split("#")[0];
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

const tty = process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const color = { dim: paint(2), red: paint(31), yellow: paint(33), green: paint(32), bold: paint(1) };
