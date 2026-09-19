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
  else if (!/^## \d{4}-\d{2}-\d{2} · /m.test(logRaw))
    add("warn", `${wiki}/log.md has no \`## YYYY-MM-DD · <skill>\` entry`);

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
