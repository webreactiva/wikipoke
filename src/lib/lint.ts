// Integrity: "is the wiki internally sound?", everything a machine can decide.
//
// Frontmatter contract, link graph, dead sources, over-broad sources, orphans, index coverage. It
// never judges the prose: contradictions between pages, expired claims and thin pages are the
// wikipoke-lint skill's deep pass, which reads the pages.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { CheckContext, Citation, Link } from "./lib.ts";
import {
  CONFIDENCE,
  INDEX_SCALE_LIMIT,
  NON_PAGES,
  REQUIRED_KEYS,
  STATE_FILE,
  asList,
  color,
  commitExists,
  globToRegExp,
  indexableFiles,
  isOverBroad,
  listPages,
  markdownLinks,
  normalizeSource,
  pageCitations,
  pageTypes,
  readPage,
  relatedLinks,
  trackedFiles,
  wikilinks,
} from "./lib.ts";

/** An error breaks the wiki; a warning is debt. Only errors fail a plain `check`. */
export type Level = "error" | "warn";

/** One thing lint found. `page` is a page id, or undefined for a finding about the wiki itself. */
export interface Finding {
  level: Level;
  message: string;
  page: string | undefined;
}

export interface LintResult {
  errors: Finding[];
  warnings: Finding[];
  pages: number;
}

/** Records a finding. Everything in this file reports through one of these. */
type Add = (level: Level, message: string, page?: string) => void;

/** Reads a repository file, split into lines, once per file however often it is cited. */
type ReadSource = (path: string) => string[];

export function run({ root, wikiDir, wiki }: CheckContext): LintResult {
  const findings: Finding[] = [];
  const add: Add = (level, message, page) => void findings.push({ level, message, page });

  const pages = listPages(wikiDir).map(readPage);
  const types = pageTypes(wikiDir);
  const pageFiles = new Set(pages.map((p) => p.rel));
  const inbound = new Map(pages.map((p) => [p.rel, 0]));
  const tracked = trackedFiles(root);
  const trackedSet = new Set(tracked);
  const readSource = sourceReader(root);
  const indexable = indexableFiles(root, wikiDir);

  const indexRaw = readIfExists(join(wikiDir, "index.md"));
  if (!indexRaw) add("error", `${wiki}/index.md is missing`);

  const logRaw = readIfExists(join(wikiDir, "log.md"));
  if (!logRaw) add("error", `${wiki}/log.md is missing`);
  else for (const problem of logProblems(logRaw)) add("warn", `${wiki}/log.md ${problem}`);

  if (!existsSync(join(wikiDir, "CONVENTIONS.md")))
    add("error", `${wiki}/CONVENTIONS.md is missing: the schema this check enforces`);
  if (!existsSync(join(wikiDir, STATE_FILE)))
    add("error", `${wiki}/${STATE_FILE} is missing: no repository checkpoint`);

  // The index is the map: a broken link there is as bad as one on a page.
  if (indexRaw)
    checkLinks(markdownLinks(indexRaw, "index.md", wikiDir, root), { pageFiles, root, add, page: "index.md", self: "index.md" });

  for (const page of pages) {
    const meta = page.meta;
    if (!meta) {
      add("error", "no frontmatter", page.id);
      continue;
    }

    for (const problem of yamlProblems(page.raw)) add("warn", problem, page.id);

    for (const key of REQUIRED_KEYS) {
      const value = meta[key];
      if (value === undefined || value === "" || (Array.isArray(value) && !value.length))
        add("error", `missing \`${key}:\``, page.id);
    }

    if (typeof meta.type === "string" && meta.type && !types.includes(meta.type))
      add("error", `unknown type \`${meta.type}\` (valid: ${types.join(", ")}; CONVENTIONS.md lists them)`, page.id);

    if (typeof meta.confidence === "string" && meta.confidence && !CONFIDENCE.includes(meta.confidence))
      add("error", `unknown confidence \`${meta.confidence}\` (valid: ${CONFIDENCE.join(", ")})`, page.id);

    if (typeof meta.synced === "string" && meta.synced && !commitExists(root, meta.synced))
      add("error", `\`synced: ${meta.synced}\` is not a commit in this repository`, page.id);

    // What the page's folders and wildcards claim together: fifty files split across subfolders are
    // still more than one page read, and splitting them is how the limit below gets dodged.
    const swept = new Set<string>();
    let broad = false;
    for (const source of asList(meta.sources)) {
      const glob = normalizeSource(source, root);
      const re = globToRegExp(glob);
      if (!tracked.some((f) => re.test(f))) {
        add("error", `dead source (matches no tracked file): \`${source}\``, page.id);
        continue;
      }
      const claimed = indexable.filter((f) => re.test(f));
      const n = claimed.length;
      if (/[*?]/.test(glob)) for (const f of claimed) swept.add(f);
      const whole = isOverBroad(source, root);
      // A package's code usually sits in one folder, not at its root: `src/` in a single-package
      // repository claims the package just the same. Ten files keeps a small repository quiet. In a
      // large one no share is telling: a layer holding thirty modules can be a third of the
      // repository, so past fifty files a claim is more than any one page read.
      const most = n >= 10 && (n * 2 > indexable.length || n > 50);
      broad ||= whole || most;
      if (whole)
        add(
          "warn",
          `over-broad source \`${source}\` claims a whole package (${n} indexable file(s)): ` +
            `narrow it to what this page really documents, or coverage reads green for code nobody wrote up`,
          page.id,
        );
      else if (most)
        add(
          "warn",
          `over-broad source \`${source}\` claims ${n} of the ${indexable.length} indexable files: ` +
            `narrow it to what this page really documents, or coverage reads green for code nobody wrote up`,
          page.id,
        );
    }
    if (!broad && swept.size > 50)
      add(
        "warn",
        `over-broad sources: this page's folders and wildcards claim ${swept.size} indexable files together: ` +
          `list the files you read instead, or coverage reads green for code nobody wrote up`,
        page.id,
      );

    checkLinks(
      [...markdownLinks(page.body, page.rel, wikiDir, root), ...relatedLinks(meta, page.rel, wikiDir, root)],
      { pageFiles, root, add, page: page.id, self: page.rel, inbound },
    );

    for (const raw of wikilinks(page.body))
      add("warn", `\`${raw}\` is not a link in this wiki: write [text](./page.md)`, page.id);

    // `path:line` is how a page points at code without transcribing it, so it is worth as much as
    // a link and rots the same way — silently, as soon as the file is edited above that line.
    for (const cite of pageCitations(page.body, page.rel, wikiDir, root))
      checkCitation(cite, { root, trackedSet, readSource, add, page: page.id });

    // `[event.ts:41](…#L41)` carries its line twice, and re-pointing the anchor leaves the text.
    // Code is stripped the way markdownLinks() strips it: a link shown in backticks is an example.
    for (const m of page.body.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "").matchAll(/\[[^\]]*?:(\d+)(?:-\d+)?\]\([^)\s]*#L(\d+)[^)\s]*\)/g))
      if (m[1] !== m[2]) add("warn", `\`${m[0]}\` says line ${m[1]} and links to line ${m[2]}: one of them moved`, page.id);

    if (indexRaw && !indexRaw.includes(page.rel)) add("warn", "not listed in index.md", page.id);
  }

  for (const [rel, count] of inbound)
    if (count === 0) add("warn", "orphan: no other page links here", rel.replace(/\.md$/, ""));

  // The wikipoke-query skill reads index.md first and drills down. Past a certain page count that
  // stops ranking and only lists; saying so here keeps the "do we need search?" decision alive.
  if (pages.length > INDEX_SCALE_LIMIT)
    add(
      "warn",
      `${pages.length} pages: past ~${INDEX_SCALE_LIMIT}, reading index.md first stops telling ` +
        `pages apart. Decide on ranked search over page bodies.`,
    );

  return {
    errors: findings.filter((f) => f.level === "error"),
    warnings: findings.filter((f) => f.level === "warn"),
    pages: pages.length,
  };
}

/** A plain value opening with one of these is read by YAML as something else: a list, a map, a tag, an anchor… */
const INDICATOR = /^(?:[[\]{},#&*!|>'"%@`]|[-?:](?:[ \t]|$))/;

/**
 * Frontmatter lines a strict YAML parser reads differently from wikipoke, or not at all. wikipoke's
 * own reader splits a line at the first ": " on purpose, so it accepts them, while Obsidian, static
 * site generators and every YAML library reject or misread the page. The same line walk as
 * `parseFrontmatter`: `key: value` and `  - item`. A warning, not an error: wikipoke itself reads
 * the page fine, and what breaks is every other tool.
 */
export function yamlProblems(raw: string): string[] {
  if (!raw.startsWith("---")) return [];
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return [];
  const problems: string[] = [];
  let list = false; // whether a `- item` line has an empty `key:` above it to belong to
  for (const line of raw.slice(raw.indexOf("\n") + 1, end).split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (line.includes("\t")) {
      problems.push(`frontmatter line \`${line.trim()}\` holds a tab, which YAML rejects there: use spaces`);
      continue;
    }
    const item = line.match(/^( +- +)(.*)$/);
    const pair = item ? null : line.match(/^([A-Za-z_][\w-]*:)(.*)$/);
    if (item && !list) continue; // wikipoke skips it too; nothing to compare
    if (!item && !pair) {
      problems.push(`frontmatter line \`${line.trim()}\` is not \`key: value\` or \`- item\`: wikipoke skips it, YAML reads it into the value above or rejects it`);
      continue;
    }
    const [, lead = "", rest = ""] = item ?? pair ?? [];
    if (pair) list = rest.trim() === "";
    if (pair && rest && !/^ /.test(rest)) {
      problems.push(`frontmatter \`${line.trim()}\` has no space after \`${lead}\`, so YAML reads the whole line as text: write \`${lead} ${rest}\``);
      continue;
    }
    const value = rest.trim();
    // `- [a, b]` is a list inside the list to YAML, and one string to wikipoke.
    const reason = value && (item && value.startsWith("[") ? "is a `[…]` list inside a list" : misread(value));
    if (!reason) continue;
    const fix = value.startsWith("[")
      ? "write it as a block list, one `- item` per line"
      : `quote it, \`${lead.trim()} ${singleQuoted(value)}\``;
    problems.push(`frontmatter \`${lead.trim()} …\` ${reason}, which a strict YAML parser reads differently: ${fix}`);
  }
  return problems;
}

/**
 * The value a quoted line should hold. Single quotes, because inside them YAML reads every character
 * as written, backslashes included, and an inner `'` is written twice; `unquote` reads it back the
 * same. A value that was already quoted, badly, keeps what is inside its quotes.
 */
function singleQuoted(value: string): string {
  const text = /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
  return `'${text.replaceAll("'", "''")}'`;
}

function misread(value: string): string | null {
  if (value.startsWith("'")) return /^'(?:[^']|'')*'$/.test(value) ? null : "is single-quoted with a lone `'` inside";
  // Only the escapes `unquote` decodes: YAML reads any other backslash differently, or rejects it.
  if (value.startsWith('"')) return /^"(?:[^"\\]|\\["\\/])*"$/.test(value) ? null : 'is double-quoted with a backslash or a lone `"` inside';
  if (value.startsWith("["))
    // wikipoke splits a flow list at every comma, so an item YAML reads another way is a different list.
    return /^\[[^[\]{}]*\]$/.test(value) && value.slice(1, -1).split(",").every((item) => !item.trim() || !misread(item.trim()))
      ? null
      : "is a `[…]` list with an item YAML reads as something else";
  if (INDICATOR.test(value)) return `starts with \`${value[0]}\``;
  if (/:(?:[ \t]|$)/.test(value)) return "holds `: `";
  if (/[ \t]#/.test(value)) return "holds ` #`, where YAML starts a comment";
  return null;
}

/**
 * The log's shape is the Open Knowledge Format's (§9): newest first, one `## YYYY-MM-DD` heading per
 * day, each pass a `* **<skill>**: …` entry under it. Wikis written before that have one
 * `## YYYY-MM-DD · <skill>` heading per pass, oldest first: still read, and named as the old shape,
 * because the next ingest pass rewrites it. Warnings only: the log is history, not the wiki's truth.
 */
export function logProblems(raw: string): string[] {
  const headings = [...raw.matchAll(/^## (\d{4}-\d{2}-\d{2})(.*)$/gm)].map((m) => ({ date: m[1] as string, rest: (m[2] as string).trim() }));
  if (!headings.length) return ["has no `## YYYY-MM-DD` heading: one per day, newest first"];
  if (headings.some((h) => h.rest.startsWith("·")))
    return [
      "has the old shape, a `## YYYY-MM-DD · <skill>` heading per pass, oldest first: " +
        "the next wikipoke-ingest pass rewrites it newest first, one heading per day, each pass a `* **<skill>**: …` entry",
    ];
  const problems: string[] = [];
  const odd = headings.find((h) => h.rest);
  if (odd) problems.push(`heading \`## ${odd.date} ${odd.rest}\` holds more than the date: the skill goes in the entry, \`* **<skill>**: …\``);
  for (let i = 1; i < headings.length; i++) {
    const [before, here] = [headings[i - 1]?.date ?? "", headings[i]?.date ?? ""];
    if (here === before) problems.push(`has two \`## ${here}\` headings: one per day, every pass of that day under it`);
    else if (here > before) problems.push(`is not newest first: \`## ${here}\` comes after \`## ${before}\``);
    else continue;
    break;
  }
  return problems;
}

/** Reads a repository file once, split into lines. Pages cite the same file many times over. */
function sourceReader(root: string): ReadSource {
  const cache = new Map<string, string[]>();
  return (path) => {
    // The trailing newline is not a line: "past the end of a 5-line file" must say 5.
    let body = cache.get(path);
    if (!body) cache.set(path, (body = readFileSync(join(root, path), "utf8").replace(/\n$/, "").split("\n")));
    return body;
  };
}

interface CitationContext {
  root: string;
  trackedSet: Set<string>;
  readSource: ReadSource;
  add: Add;
  page: string;
}

/**
 * A citation is checked as far as a machine can: the file is tracked, and the line is still there,
 * not blank, and not just the end of a block. It cannot know whether line 96 still says what the
 * page claims — that is the wikipoke-lint skill's deep pass, and drift carries each citation
 * through the diff from the commit that wrote it — but "the file lost 40 lines" it can see, and so
 * is a line that holds nothing but `}`: nobody cites a closing brace, so the code moved under it.
 * A warning, never an error: a pointer that drifted is debt.
 */
function checkCitation({ raw, path, line }: Citation, { root, trackedSet, readSource, add, page }: CitationContext): void {
  if (!trackedSet.has(path)) {
    // No directory means it is probably prose, not a path. A missing directory means an example.
    if (path.includes("/") && existsSync(join(root, dirname(path))))
      add("warn", `\`${raw}\` points at a file that is not tracked here`, page);
    return;
  }
  const body = readSource(path);
  // Indexed, not compared against the length: the line either is there or it is not, and asserting
  // it is there because a regexp elsewhere only ever captures 1 upwards is how this once crashed.
  const text = body[line - 1];
  if (text === undefined) add("warn", `\`${raw}\` is past the end of ${path} (${body.length} lines): the code moved`, page);
  else if (!text.trim()) add("warn", `\`${raw}\` lands on a blank line: the code moved`, page);
  else if (/^[)\]};,]+$/.test(text.trim())) add("warn", `\`${raw}\` lands on \`${text.trim()}\`, the end of a block: the code moved`, page);
}

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

interface LinkContext {
  pageFiles: Set<string>;
  root: string;
  add: Add;
  page: string;
  self: string;
  inbound?: Map<string, number>;
}

function checkLinks(links: Link[], { pageFiles, root, add, page, self, inbound }: LinkContext): void {
  for (const link of links) {
    if (link.kind === "external" || link.target === null) continue;
    if (link.kind === "repo") {
      if (!existsSync(join(root, link.target))) add("error", `broken link to a repository file: \`${link.raw}\``, page);
      continue;
    }
    if (pageFiles.has(link.target)) {
      if (inbound && link.target !== self) inbound.set(link.target, (inbound.get(link.target) ?? 0) + 1);
      continue;
    }
    if (NON_PAGES.has(link.target)) continue;
    add("error", `broken link: \`${link.raw}\``, page);
  }
}

/** Human report. Prints an OK line when clean: this one is run by a person. */
export function report(res: LintResult): number {
  if (!res.errors.length && !res.warnings.length) {
    console.log(color.green(`✓ lint: OK (${res.pages} pages)`));
    return 0;
  }
  for (const f of res.errors) console.log(`${color.red("error")}     ${f.page ? color.bold(f.page) + " — " : ""}${f.message}`);
  for (const f of res.warnings) console.log(`${color.yellow("warn")}      ${f.page ? color.bold(f.page) + " — " : ""}${f.message}`);
  console.log(color.dim(`\n${res.errors.length} error(s) · ${res.warnings.length} warning(s) · ${res.pages} pages`));
  return res.errors.length + res.warnings.length;
}
