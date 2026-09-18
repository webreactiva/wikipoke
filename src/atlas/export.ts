// `wikipoke atlas --out <dir>`: the page the live server shows, written to a directory with the
// snapshot beside it, to publish or to open from disk. Nothing here touches the wiki, and nothing
// is written into a directory atlas did not make.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CheckContext } from "../lib/lib.ts";
import type { Snapshot } from "./snapshot.ts";
import { snapshot } from "./snapshot.ts";

/** The browser side: next to this module in the sources, and copied next to it by the build. */
export const WEB = fileURLToPath(new URL("./web/", import.meta.url));

/**
 * marked renders the Markdown in the browser. It is an ordinary devDependency, never a copy kept
 * in the repository: running from the sources it is read from node_modules, and the build copies
 * it next to the compiled code, so the published package has no runtime dependency and atlas
 * works offline.
 */
const MARKED: Record<string, string> = {
  "marked.js": "lib/marked.umd.js",
  "marked.LICENSE.md": "LICENSE",
};

/** Every file the page is made of, besides the snapshot. The server serves exactly these. */
export const ASSETS = ["index.html", "atlas.css", "atlas.js", "graph.js", "logo.webp", ...Object.keys(MARKED)];

/** Where an asset is read from: web/, or marked's own package when the build has not copied it. */
export function assetFile(asset: string): string {
  const file = join(WEB, asset);
  const inPackage = MARKED[asset];
  if (!inPackage || existsSync(file)) return file;
  return join(dirname(createRequire(import.meta.url).resolve("marked/package.json")), inPackage);
}

/** Copies the page into `dir`: what an export writes, and what the build puts next to dist/atlas/. */
export function writeAssets(dir: string): void {
  for (const asset of ASSETS) {
    mkdirSync(dirname(join(dir, asset)), { recursive: true });
    copyFileSync(assetFile(asset), join(dir, asset));
  }
}

/** The snapshot as a script, not JSON: a page opened from disk may load scripts but not fetch. */
export function script(snap: Snapshot): string {
  return `window.ATLAS = ${JSON.stringify(snap)};\n`;
}

export type Exported = { ok: true; dir: string; files: string[] } | { ok: false; problem: string };

/**
 * Writes the site into `out`, which must be new, empty, or a previous export: the marker every
 * file wikipoke owns carries is what tells a previous export from someone's own site.
 */
export function exportSite(ctx: CheckContext, out: string, cwd: string = process.cwd()): Exported {
  const dir = resolve(cwd, out);
  const inWiki = relative(ctx.wikiDir, dir);
  if (!inWiki.startsWith("..") && !isAbsolute(inWiki))
    return { ok: false, problem: `${out} is inside ${ctx.wiki}/, and atlas never writes in the wiki. Pick a directory outside it, such as site/.` };
  if (existsSync(dir)) {
    if (!statSync(dir).isDirectory()) return { ok: false, problem: `${out} is a file, not a directory.` };
    const index = join(dir, "index.html");
    const ours = existsSync(index) && readFileSync(index, "utf8").includes("managed by wikipoke");
    if (readdirSync(dir).length && !ours)
      return { ok: false, problem: `${out} already holds files atlas did not write. Point --out at a new or empty directory.` };
  }
  writeAssets(dir);
  writeFileSync(join(dir, "wiki.js"), script(snapshot(ctx, { live: false })));
  return { ok: true, dir, files: [...ASSETS, "wiki.js"] };
}
