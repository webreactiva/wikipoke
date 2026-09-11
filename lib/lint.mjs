// Integrity: "is the wiki internally sound?", everything a machine can decide.
//
// Frontmatter contract, link graph, dead sources, over-broad sources, orphans, index coverage. It
// never judges the prose: contradictions between pages, expired claims and thin pages are the
// wikipoke-lint skill's deep pass, which reads the pages.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONFIDENCE,
  INDEX_SCALE_LIMIT,
  NON_PAGES,
  REQUIRED_KEYS,
  STATE_FILE,
  color,
  commitExists,
  globToRegExp,
  indexableFiles,
  isOverBroad,
  listPages,
  markdownLinks,
  normalizeSource,
  pageTypes,
  readPage,
  relatedLinks,
  trackedFiles,
  wikilinks,
} from "./lib.mjs";

export function run({ root, wikiDir, wiki }) {
  const findings = [];
  const add = (level, message, page) => findings.push({ level, message, page });

  const pages = listPages(wikiDir).map(readPage);
  const types = pageTypes(wikiDir);
  const pageFiles = new Set(pages.map((p) => p.rel));
  const inbound = new Map(pages.map((p) => [p.rel, 0]));
  const tracked = trackedFiles(root);
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

    if (meta.type && !types.includes(meta.type))
      add("error", `unknown type \`${meta.type}\` (valid: ${types.join(", ")}; CONVENTIONS.md lists them)`, page.id);

    if (meta.confidence && !CONFIDENCE.includes(meta.confidence))
      add("error", `unknown confidence \`${meta.confidence}\` (valid: ${CONFIDENCE.join(", ")})`, page.id);

    if (meta.synced && !commitExists(root, meta.synced))
      add("error", `\`synced: ${meta.synced}\` is not a commit in this repository`, page.id);

    for (const source of [].concat(meta.sources ?? [])) {
      const re = globToRegExp(normalizeSource(source, root));
      if (!tracked.some((f) => re.test(f))) {
        add("error", `dead source (matches no tracked file): \`${source}\``, page.id);
        continue;
      }
      if (isOverBroad(source, root)) {
        const n = indexable.filter((f) => re.test(f)).length;
        add(
          "warn",
          `over-broad source \`${source}\` claims a whole package (${n} indexable file(s)): ` +
            `narrow it to what this page really documents, or coverage reads green for code nobody wrote up`,
          page.id,
        );
      }
    }

    checkLinks(
      [...markdownLinks(page.body, page.rel, wikiDir, root), ...relatedLinks(meta, page.rel, wikiDir, root)],
      { pageFiles, root, add, page: page.id, self: page.rel, inbound },
    );

    for (const raw of wikilinks(page.body))
      add("warn", `\`${raw}\` is not a link in this wiki: write [text](./page.md)`, page.id);

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

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function checkLinks(links, { pageFiles, root, add, page, self, inbound }) {
  for (const link of links) {
    if (link.kind === "external") continue;
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
export function report(res) {
  if (!res.errors.length && !res.warnings.length) {
    console.log(color.green(`✓ lint: OK (${res.pages} pages)`));
    return 0;
  }
  for (const f of res.errors) console.log(`${color.red("error")}     ${f.page ? color.bold(f.page) + " — " : ""}${f.message}`);
  for (const f of res.warnings) console.log(`${color.yellow("warn")}      ${f.page ? color.bold(f.page) + " — " : ""}${f.message}`);
  console.log(color.dim(`\n${res.errors.length} error(s) · ${res.warnings.length} warning(s) · ${res.pages} pages`));
  return res.errors.length + res.warnings.length;
}
