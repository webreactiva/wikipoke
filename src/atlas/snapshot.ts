// What atlas shows, gathered into one object: every page with its frontmatter, the links between
// pages, and what drift says about each. It reads the wiki and git and writes nothing; the page in
// web/ does all the rendering, so the live server and the static export hand it the same thing.
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import type { RepoAxis } from "../lib/drift.ts";
import * as drift from "../lib/drift.ts";
import { yamlProblems } from "../lib/lint.ts";
import type { CheckContext, Citation } from "../lib/lib.ts";
import {
  asList,
  gitOrNull,
  listPages,
  markdownLinks,
  pageCitations,
  pageTypes,
  parseFrontmatter,
  readPage,
  relatedLinks,
} from "../lib/lib.ts";

/** A page as atlas shows it. Ids are the wiki path without `.md`, the same ones `check` prints. */
export interface AtlasPage {
  id: string;
  rel: string;
  title: string;
  type: string;
  responsibility: string;
  /** As written; absent means `high`, which is what CONVENTIONS.md says it means. */
  confidence: string;
  synced: string;
  /** The date of the `synced:` commit: the one date the schema says matters. */
  date: string | null;
  sources: string[];
  related: string[];
  citations: Citation[];
  backlinks: string[];
  /** Sources that changed since `synced:`, or null when the page is current. */
  stale: string[] | null;
  body: string;
}

/** The three files in the wiki that are not pages: no frontmatter, rendered as they are. */
export interface AtlasDoc {
  id: string;
  rel: string;
  title: string;
  body: string;
}

export interface Snapshot {
  name: string;
  /** The wiki's path from the repository root, which links resolve against. */
  wiki: string;
  commit: string;
  date: string | null;
  /** Served by `wikipoke atlas`, which can open cited files, rather than exported. */
  live: boolean;
  /** Where a citation opens when exported: the remote's blob URL up to the sha, or null. */
  blob: string | null;
  repo: RepoAxis;
  types: string[];
  pages: AtlasPage[];
  docs: AtlasDoc[];
}

const DOCS: [id: string, title: string][] = [
  ["index", "Index"],
  ["log", "Log"],
  ["CONVENTIONS", "Conventions"],
];

/**
 * CONVENTIONS and index may open with a frontmatter for other tools (OKF): not something to read.
 * Only a block that is all `key: value` and `- item` lines goes. One that never closes would run to
 * the next `---` in the text and take the prose with it, so it stays, where lint names it.
 */
function docBody(raw: string): string {
  const { data, body } = parseFrontmatter(raw);
  return data && !yamlProblems(raw).some((problem) => problem.includes("is not `key: value`")) ? body : raw;
}

export function snapshot(ctx: CheckContext, { live }: { live: boolean }): Snapshot {
  const { root, wikiDir, wiki } = ctx;
  const loaded = listPages(wikiDir).map(readPage);
  const measured = drift.run(ctx);
  const stale = new Map(measured.stale.map((page) => [page.id, page.files]));

  const dates = new Map<string, string | null>();
  const dateOf = (sha: string): string | null => {
    if (!dates.has(sha)) dates.set(sha, gitOrNull(root, ["show", "-s", "--format=%cs", sha])?.trim() || null);
    return dates.get(sha) ?? null;
  };

  // Backlinks come from the same link reading lint checks, so atlas and `check` never disagree
  // about which page points where. `related:` counts: it is a declared link.
  const ids = new Set(loaded.map((page) => page.id));
  const backlinks = new Map<string, Set<string>>();
  for (const page of loaded) {
    const out = [...markdownLinks(page.body, page.rel, wikiDir, root), ...relatedLinks(page.meta, page.rel, wikiDir, root)]
      .filter((link) => link.kind === "page" && link.target)
      .map((link) => (link.target as string).replace(/\.md$/, ""))
      .filter((id) => ids.has(id) && id !== page.id);
    for (const target of out) {
      if (!backlinks.has(target)) backlinks.set(target, new Set());
      backlinks.get(target)?.add(page.id);
    }
  }

  const pages: AtlasPage[] = loaded.map((page) => {
    const meta = page.meta ?? {};
    const text = (key: string): string => {
      const value = meta[key];
      return typeof value === "string" ? value : "";
    };
    const synced = text("synced");
    return {
      id: page.id,
      rel: page.rel,
      title: text("title") || page.id,
      type: text("type"),
      responsibility: text("responsibility"),
      confidence: text("confidence") || "high",
      synced,
      date: synced ? dateOf(synced) : null,
      sources: asList(meta.sources),
      related: relatedLinks(page.meta, page.rel, wikiDir, root)
        .map((link) => (link.target ?? "").replace(/\.md$/, ""))
        .filter((id) => ids.has(id)),
      citations: pageCitations(page.body, page.rel, wikiDir, root),
      backlinks: [...(backlinks.get(page.id) ?? [])].sort(),
      stale: stale.get(page.id) ?? null,
      body: page.body,
    };
  });

  const docs: AtlasDoc[] = DOCS.filter(([id]) => existsSync(join(wikiDir, `${id}.md`))).map(([id, title]) => ({
    id,
    rel: `${id}.md`,
    title,
    body: docBody(readFileSync(join(wikiDir, `${id}.md`), "utf8")),
  }));

  const commit = gitOrNull(root, ["rev-parse", "HEAD"])?.trim() ?? "";
  return {
    name: basename(root),
    wiki,
    commit,
    date: commit ? dateOf(commit) : null,
    live,
    blob: blobBase(gitOrNull(root, ["remote", "get-url", "origin"])?.trim() ?? ""),
    repo: measured.repo,
    types: pageTypes(wikiDir),
    pages,
    docs,
  };
}

/**
 * The URL a cited file opens at on the remote, up to where the sha goes: GitHub and GitLab, which
 * both take `#L42`. Built from the host and the path alone, so a token in an https remote never
 * reaches a page that may be published. Any other host gets no links rather than wrong ones.
 */
export function blobBase(remote: string): string | null {
  const match = remote.match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/);
  const host = match?.[1];
  const path = match?.[2];
  if (!host || !path) return null;
  if (host === "github.com") return `https://github.com/${path}/blob/`;
  if (host.includes("gitlab")) return `https://${host}/${path}/-/blob/`;
  return null;
}
