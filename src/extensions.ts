import { spawnSync } from 'node:child_process';
import type { Config, ExtensionEvent } from './model.js';

// Wikipoke's own lifecycle, opened up. The tool does the deterministic work - plan, validate,
// publish, seal - and everything a particular team wants to happen around that is theirs to attach
// here rather than the tool's to grow a setting for. A script gets the event on stdin as JSON, runs
// from the project root, and answers with its exit status.
export interface ExtensionResult { event: ExtensionEvent; run: string; ok: boolean; status: number | null; message: string }

// The payload is a summary, never the command's own output. An `ingest` plan carries the full
// content of every source in the batch, and piping that into every extension on every pass is the
// kind of cost that gets a feature uninstalled - which is the mistake this whole surface replaces.
const LIMIT = 2000;
function trim(value: string): string {
  const text = value.trim();
  return text.length > LIMIT ? `${text.slice(0, LIMIT)}...` : text;
}
export function dispatch(root: string, config: Config, event: ExtensionEvent,
  payload: Record<string, unknown> = {}): ExtensionResult[] {
  const wanted = config.extensions.filter(extension => extension.event === event);
  if (!wanted.length) return [];
  const input = JSON.stringify({ event, at: new Date().toISOString(), root, ...payload });
  const results: ExtensionResult[] = [];
  for (const extension of wanted) {
    const run = spawnSync('sh', ['-c', extension.run], {
      cwd: root, input, encoding: 'utf8', timeout: extension.timeout * 1000,
      // The event is in the environment as well as on stdin, so a one-line script that only needs to
      // know which point it was called from does not have to parse JSON to find out.
      env: { ...process.env, WIKIPOKE_EVENT: event, WIKIPOKE_ROOT: root },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const failed = !!run.error || run.status !== 0;
    const message = trim(run.error ? run.error.message : (run.stderr || run.stdout || ''));
    results.push({ event, run: extension.run, ok: !failed, status: run.status, message });
    // A veto is the entire reason a `before` event exists, so it stops the command and says who
    // stopped it. This runs before the action, so nothing has been written yet.
    if (failed && extension.blocking)
      throw new Error(`Extension refused ${event}: ${extension.run}${message ? ` - ${message}` : ''}`);
    // Everything else is an observer and never fails the command it was watching. It never fails
    // silently either: an extension that quietly stopped running is an extension nobody notices is
    // gone, and stderr keeps the JSON on stdout intact for whatever is parsing it.
    if (failed) process.stderr.write(`Wikipoke: extension for ${event} failed (${extension.run})` +
      `${message ? `: ${message}` : ''}\n`);
  }
  return results;
}
