#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { parse } from 'yaml';
import { Wiki } from './wiki.js';
import { configSchema } from './model.js';
import { answerSchema, eventSchema, extensionSchema, patchSchema } from './model.js';
import { z } from 'zod';
import { briefingActive, hookActive, install, uninstall } from './integrations.js';
import { dispatch } from './extensions.js';
import type { ExtensionEvent } from './model.js';
import { Store } from './runtime/store.js';

// A path-installed CLI has no registry entry to look the build up in, so the one question
// an operator asks of an unfamiliar binary must be answerable by the binary itself.
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const program = new Command();
program.name('wikipoke').description('Maintain versioned, connected knowledge from project sources')
  .version(manifest.version, '-v, --version', 'report the installed Wikipoke version')
  .option('--root <path>', 'project root', process.cwd());
function root() { return resolve(program.opts().root); }
function output(value: unknown) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
function fail(error: unknown) { process.stderr.write(`${(error as Error).message}\n`); process.exitCode = 1; }
// Extensions run outside the writer lock, on either side of the command rather than inside it. A
// script called with the lock held could not run a single Wikipoke command - it would be handed a
// lifecycle event and a tool that answers "writer locked", which is the trap this surface exists to
// avoid repeating.
function extend(wiki: Wiki, event: ExtensionEvent, payload: Record<string, unknown> = {}) {
  dispatch(wiki.root, wiki.config, event, payload);
}
function git(...args: string[]): string | null {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}
function repository(path: string): boolean {
  return git('-C', path, 'rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}') !== null;
}
function count(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new InvalidArgumentError('Expected a positive integer.');
  return parsed;
}
program.command('init').description('create an explicit configuration and empty wiki')
  .requiredOption('--include <glob...>', 'source glob(s)')
  .option('--wiki <path>', 'wiki path', 'wiki').option('--language <language>', 'knowledge language', 'en')
  .option('--exclude <glob...>', 'source glob(s) to exclude', [])
  .option('--batch-files <count>', 'source files planned per maintenance pass', count, 10)
  .option('--batch-bytes <count>', 'source bytes planned per maintenance pass', count, 64 * 1024)
  .action(async options => { try {
    const path = root();
    if (!repository(path)) throw new Error(`Not a Git repository with at least one commit: ${path}; every Wikipoke command reads source from Git, so initialize and commit the repository first`);
    const input = configSchema.parse({ version: 1, wiki: options.wiki, language: options.language,
      include: options.include, exclude: options.exclude,
      limits: { batchFiles: options.batchFiles, batchBytes: options.batchBytes } });
    const wiki = await Wiki.init(path, input);
    extend(wiki, 'init.after', { wiki: input.wiki, language: input.language, config: 'wikipoke.config.yaml' });
    output({ initialized: true, config: 'wikipoke.config.yaml', limits: input.limits });
  } catch (error) { fail(error); } });
for (const [name, description, action] of [
  ['status', 'report health and pending work', async (wiki: Wiki) => wiki.status()],
  ['lint', 'validate wiki structure without an LLM', async (wiki: Wiki) => wiki.lint()],
  ['graph', 'emit a reconstructable graph', async (wiki: Wiki) => wiki.graph()],
  ['ingest', 'bootstrap or reconcile source knowledge', async (wiki: Wiki, options: { ref?: string }) => {
    extend(wiki, 'ingest.before', { ref: options.ref ?? 'HEAD' });
    const plan = await wiki.ingest(options.ref);
    extend(wiki, 'ingest.after', { revision: plan.revision, complete: plan.complete,
      remaining: plan.remaining, sources: plan.sources.map(s => s.id) });
    return plan;
  }],
  ['maintain', 'refresh the deterministic attention signal', async (wiki: Wiki, options: { once?: boolean }) => {
    // The signal is already bounded and sampled, so it is handed over whole: it is the one payload
    // that is a summary by construction.
    const signal = await wiki.attention();
    extend(wiki, 'maintain.after', signal);
    return signal;
  }],
] as const) {
  const command = program.command(name).description(description);
  if (name === 'ingest') command.option('--ref <commit>', 'source commit', 'HEAD');
  if (name === 'maintain') command.requiredOption('--once', 'perform one bounded maintenance pass');
  command.action(async (options: any) => { try { output(await action(new Wiki(root()), options)); } catch (error) { fail(error); } });
}
program.command('ask <question>').description('open and preserve a query for an agent to research')
  .option('--request-id <id>', 'stable request identity').option('--ref <commit>', 'historical source commit')
  .option('--again', 'research even when the same question is already answered against unchanged evidence')
  .action(async (question, options) => { try {
    const wiki = new Wiki(root());
    const query = await wiki.ask(question, options.requestId, options.ref, options.again) as Record<string, unknown>;
    extend(wiki, 'ask.after', { requestId: query.requestId ?? options.requestId, question,
      ref: query.ref ?? options.ref ?? 'HEAD', state: query.state, reused: query.reused === true, path: query.path });
    output(query);
  } catch (error) { fail(error); } });
program.command('answer').description('validate and persist an agent-researched query answer')
  .requiredOption('--request-id <id>', 'query request identity').requiredOption('--response <file>', 'answer JSON file')
  .action(async options => { try {
    const wiki = new Wiki(root());
    const record = await wiki.answer(options.requestId, JSON.parse(readFileSync(options.response, 'utf8'))) as Record<string, unknown>;
    extend(wiki, 'answer.after', { requestId: options.requestId, state: record.state,
      citations: record.citations, gaps: record.gaps, pages: record.pages });
    output(record);
  } catch (error) { fail(error); } });
program.command('publish').description('validate and publish an agent-authored wiki patch')
  .requiredOption('--patch <file>', 'patch JSON file').option('--ref <commit>', 'source commit', 'HEAD')
  .action(async options => { try {
    const wiki = new Wiki(root()), patch = JSON.parse(readFileSync(options.patch, 'utf8'));
    // The only place a project can refuse knowledge before it lands: the paths are known, the wiki is
    // not written yet, and a non-zero exit here leaves the wiki exactly as it was.
    extend(wiki, 'publish.before', { ref: options.ref,
      pages: Array.isArray(patch?.pages) ? patch.pages.map((page: { path?: string }) => page?.path) : [] });
    const result = await wiki.publishPatch(patch, options.ref);
    extend(wiki, 'publish.after', { ref: options.ref, published: result.published, findings: result.findings });
    output(result);
  } catch (error) { fail(error); } });
program.command('schema <kind>').description('emit the JSON schema for an agent-authored payload')
  .action((kind: string) => { try {
    if (kind === 'patch') output(z.toJSONSchema(patchSchema));
    else if (kind === 'answer') output(z.toJSONSchema(answerSchema));
    else if (kind === 'event') output(z.toJSONSchema(eventSchema));
    else throw new Error('Schema kind must be patch, answer or event');
  } catch (error) { fail(error); } });
program.command('capture').description('persist and materialize a task event')
  .requiredOption('--event <file>', 'event JSON file')
  .action(async options => { try {
    const wiki = new Wiki(root()), event = JSON.parse(readFileSync(options.event, 'utf8'));
    const result = await wiki.capture(event);
    extend(wiki, 'capture.after', { ...result, kind: event?.kind, actor: event?.actor,
      evidence: event?.evidence ?? [] });
    output(result);
  } catch (error) { fail(error); } });
program.command('snapshot <label>').description('capture exact code and wiki revisions')
  .option('--ref <commit>', 'code commit', 'HEAD')
  .action(async (label, options) => { try {
    const wiki = new Wiki(root());
    const manifest = await wiki.snapshot(label, options.ref);
    const { health, ...summary } = manifest;
    extend(wiki, 'snapshot.after', summary);
    output(manifest);
  } catch (error) { fail(error); } });
program.command('releases').description('list captured releases, newest first')
  .action(async () => { try { output(await new Wiki(root()).releases()); } catch (error) { fail(error); } });
program.command('release <label>').description('read one captured release and whether its refs still exist')
  .action(async (label: string) => { try { output(await new Wiki(root()).release(label)); } catch (error) { fail(error); } });
program.command('seal').description('advance the Git checkpoint after complete reconciliation')
  .option('--ref <commit>', 'code commit', 'HEAD')
  .action(async options => { try {
    const wiki = new Wiki(root());
    extend(wiki, 'seal.before', { ref: options.ref });
    const state = await wiki.seal(options.ref);
    extend(wiki, 'seal.after', state);
    output(state);
  } catch (error) { fail(error); } });
program.command('recover').description('release a writer lock left behind by a dead process')
  .requiredOption('--unlock', 'release the recorded lock after reporting its owner')
  .action(() => { try { output(new Store(root()).unlock()); } catch (error) { fail(error); } });
program.command('install').description('install agent-neutral skills and a composable hook')
  .action(() => { try { output(install(root())); } catch (error) { fail(error); } });
program.command('uninstall').description('remove Wikipoke-managed skills and hooks, preserving knowledge')
  .action(() => { try { output(uninstall(root())); } catch (error) { fail(error); } });
program.command('doctor').description('report environment and configured capabilities, with or without a wiki')
  .action(async () => {
    const path = root(), version = git('--version'), repo = repository(path), problems: string[] = [];
    const configPath = resolve(path, 'wikipoke.config.yaml'), configured = existsSync(configPath);
    const report: Record<string, unknown> = { node: process.version, git: version, repository: repo,
      config: configured ? 'wikipoke.config.yaml' : null, wiki: null,
      hook: '.wikipoke/hooks/post-commit', hookComposed: hookActive(path),
      briefing: '.wikipoke/hooks/session-start', briefingComposed: briefingActive(path),
      extensions: [] as unknown[], pending: null, problems };
    if (Number(process.versions.node.split('.')[0]) < 22) problems.push(`Node 22 or later is required; running ${process.version}.`);
    if (!version) problems.push('Git is not on PATH; Wikipoke reads every source from Git.');
    else if (!repo) problems.push(`No Git repository with at least one commit at ${path}.`);
    if (!configured) problems.push('No wikipoke.config.yaml; run init to configure the wiki.');
    if (!report.hookComposed) problems.push('No post-commit hook composes .wikipoke/hooks/post-commit; the attention signal will not refresh on commit.');
    if (!report.briefingComposed) problems.push('No agent harness runs .wikipoke/hooks/session-start; an agent will open a session without the attention signal.');
    if (configured) {
      try {
        const raw = parse(readFileSync(configPath, 'utf8')) as { wiki?: string; extensions?: unknown };
        report.wiki = raw.wiki ?? 'wiki';
        // Extensions are third-party scripts this project asked Wikipoke to run. Listing them is the
        // point of declaring them: a machine an operator is diagnosing should say what will fire and
        // where, not leave them to read the YAML and hope it parses the same way the tool does.
        const declared = Array.isArray(raw.extensions) ? raw.extensions : [];
        report.extensions = declared.flatMap((entry, position) => {
          const parsed = extensionSchema.safeParse(entry);
          if (!parsed.success) {
            problems.push(`extensions[${position}] is not a valid extension: ${parsed.error.issues.map(i => i.message).join('; ')}`);
            return [];
          }
          return [{ event: parsed.data.event, run: parsed.data.run,
            timeout: parsed.data.timeout, blocking: parsed.data.blocking }];
        });
      }
      catch (error) { problems.push(`Unreadable configuration: ${(error as Error).message}`); }
    }
    if (configured && repo) {
      try { const status = await new Wiki(path).status(); report.pending = status.uncovered.length + status.drift.length; }
      catch (error) { problems.push((error as Error).message); }
    }
    output(report);
  });
program.parseAsync().catch(fail);
