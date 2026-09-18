// `wikipoke atlas`: the wiki served on this machine. The snapshot is rebuilt on every request, as
// `check` recomputes on every run, and the browser is told when a page changes, so an ingest pass
// can be watched landing page by page. It reads; it never writes a file.
import type { FSWatcher } from "node:fs";
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { extname, join } from "node:path";

import type { CheckContext } from "../lib/lib.ts";
import { trackedFiles } from "../lib/lib.ts";
import { ASSETS, assetFile, script } from "./export.ts";
import { snapshot } from "./snapshot.ts";

export const DEFAULT_PORT = 4747;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webp": "image/webp",
};

/**
 * The Host a request may carry. The server holds the repository's source, so a page on some other
 * site that rebinds its own name to 127.0.0.1 must not be able to read it.
 */
const LOCAL_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/;

export interface Served {
  url: string;
  close(): Promise<void>;
}

export async function serve(ctx: CheckContext, { port, exact }: { port: number; exact: boolean }): Promise<Served> {
  const clients = new Set<ServerResponse>();
  const server = createServer((req, res) => {
    handle(ctx, req, res, clients).catch((error: unknown) => send(res, 500, `atlas: ${(error as Error).message}\n`));
  });

  // A port someone else holds moves atlas to the next one, unless the port was asked for by name.
  let bound = port;
  for (let attempt = 0; ; attempt++) {
    try {
      await listen(server, bound);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE" || exact || attempt === 20) throw error;
      bound++;
    }
  }
  const address = server.address();
  const url = `http://127.0.0.1:${typeof address === "object" && address ? address.port : bound}/`;

  let timer: NodeJS.Timeout | undefined;
  const watcher: FSWatcher = watch(ctx.wikiDir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const client of clients) client.write("data: change\n\n");
    }, 150);
  });

  return {
    url,
    close: () =>
      new Promise((done) => {
        clearTimeout(timer);
        watcher.close();
        for (const client of clients) client.end();
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", fail);
      done();
    });
  });
}

async function handle(ctx: CheckContext, req: IncomingMessage, res: ServerResponse, clients: Set<ServerResponse>): Promise<void> {
  if (!LOCAL_HOST.test(req.headers.host ?? "")) return send(res, 403, "atlas answers only on this machine\n");
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "atlas only reads\n");
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
  } catch {
    return send(res, 400, "bad path\n");
  }

  if (path === "/") path = "/index.html";
  const asset = path.slice(1);
  if (ASSETS.includes(asset)) return send(res, 200, await readFile(assetFile(asset)), TYPES[extname(asset)]);
  if (path === "/wiki.js") return send(res, 200, script(snapshot(ctx, { live: true })), TYPES[".js"]);
  if (path === "/wiki.json") return send(res, 200, JSON.stringify(snapshot(ctx, { live: true })), TYPES[".json"]);

  if (path === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(": atlas\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  // Only files git tracks, named exactly: the check that keeps `..` and untracked secrets out.
  if (path.startsWith("/code/")) {
    const file = path.slice("/code/".length);
    if (!trackedFiles(ctx.root).includes(file)) return send(res, 404, `not a tracked file: ${file}\n`);
    return send(res, 200, await readFile(join(ctx.root, file)), "text/plain; charset=utf-8");
  }

  send(res, 404, "not found\n");
}

function send(res: ServerResponse, status: number, body: string | Buffer, type = "text/plain; charset=utf-8"): void {
  if (res.headersSent) return void res.end();
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}
