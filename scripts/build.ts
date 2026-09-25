// The half of the build tsc does not do: atlas's page, marked included, copied next to the
// compiled code; the prompts bundled with @clack/prompts inside, so the package keeps no runtime
// dependency; and the bin made executable.
import { chmodSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { build } from "esbuild";

import { writeAssets } from "../src/atlas/export.ts";

writeAssets("dist/atlas/web");

// Replaces tsc's re-export with clack itself. Every package that ends up inside is credited.
const { metafile } = await build({
  entryPoints: ["src/lib/prompts.ts"],
  outfile: "dist/lib/prompts.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  allowOverwrite: true,
  metafile: true,
  logLevel: "warning",
});
const packages = [...new Set(Object.keys(metafile.inputs).flatMap((input) => input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)?.[1] ?? []))];
const credits = packages.sort().map((dir) => {
  const licence = readdirSync(dir).find((file) => /^licen[cs]e/i.test(file));
  if (!licence) throw new Error(`${dir} is bundled into dist/lib/prompts.js and ships no licence file`);
  return `## ${dir.replace(/^.*node_modules\//, "")}\n\n${readFileSync(join(dir, licence), "utf8").trim()}\n`;
});
writeFileSync("dist/lib/prompts.LICENSES.md", `# Bundled into prompts.js\n\n${credits.join("\n")}`);
// tsc's map and declarations describe the one-line re-export, not the bundle: nothing reads them.
for (const stale of ["prompts.js.map", "prompts.d.ts", "prompts.d.ts.map"]) rmSync(join("dist/lib", stale), { force: true });

// A bare import of a devDependency left anywhere in dist/ would break every install.
for (const file of readdirSync("dist", { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".js")))
  if (/["']@clack\//.test(readFileSync(join("dist", file), "utf8")))
    throw new Error(`dist/${file} still imports @clack: clack goes through src/lib/prompts.ts only`);

chmodSync("dist/bin/wikipoke.js", 0o755);
