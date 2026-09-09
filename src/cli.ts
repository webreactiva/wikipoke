#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { parse } from 'yaml';
import { Wiki } from './wiki.js';
import { configSchema } from './model.js';
import { answerSchema, patchSchema } from './model.js';
import { z } from 'zod';
import { hookActive, install, uninstall } from './integrations.js';
import { Store } from './runtime/store.js';

const program = new Command();
program.name('wikipoke').description('Maintain versioned, connected knowledge from project sources')
  .option('--root <path>', 'project root', process.cwd());
function root() { return resolve(program.opts().root); }
function output(value: unknown) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
function fail(error: unknown) { process.stderr.write(`${(error as Error).message}\n`); process.exitCode = 1; }
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
    await Wiki.init(path, input); output({ initialized: true, config: 'wikipoke.config.yaml', limits: input.limits });
  } catch (error) { fail(error); } });
for (const [name, description, action] of [
  ['status', 'report health and pending work', async (wiki: Wiki) => wiki.status()],
  ['lint', 'validate wiki structure without an LLM', async (wiki: Wiki) => wiki.lint()],
  ['graph', 'emit a reconstructable graph', async (wiki: Wiki) => wiki.graph()],
  ['ingest', 'bootstrap or reconcile source knowledge', async (wiki: Wiki, options: { ref?: string }) => wiki.ingest(options.ref)],
  ['maintain', 'refresh the deterministic attention signal', async (wiki: Wiki, options: { once?: boolean }) => wiki.attention()],
] as const) {
  const command = program.command(name).description(description);
  if (name === 'ingest') command.option('--ref <commit>', 'source commit', 'HEAD');
  if (name === 'maintain') command.requiredOption('--once', 'perform one bounded maintenance pass');
  command.action(async (options: any) => { try { output(await action(new Wiki(root()), options)); } catch (error) { fail(error); } });
}
program.command('ask <question>').description('open and preserve a query for an agent to research')
  .option('--request-id <id>', 'stable request identity').option('--ref <commit>', 'historical source commit')
  .action(async (question, options) => { try { output(await new Wiki(root()).ask(question, options.requestId, options.ref)); } catch (error) { fail(error); } });
program.command('answer').description('validate and persist an agent-researched query answer')
  .requiredOption('--request-id <id>', 'query request identity').requiredOption('--response <file>', 'answer JSON file')
  .action(async options => { try { output(await new Wiki(root()).answer(options.requestId, JSON.parse(readFileSync(options.response, 'utf8')))); } catch (error) { fail(error); } });
program.command('publish').description('validate and publish an agent-authored wiki patch')
  .requiredOption('--patch <file>', 'patch JSON file').option('--ref <commit>', 'source commit', 'HEAD')
  .action(async options => { try { output(await new Wiki(root()).publishPatch(JSON.parse(readFileSync(options.patch, 'utf8')), options.ref)); } catch (error) { fail(error); } });
program.command('schema <kind>').description('emit the JSON schema for an agent-authored payload')
  .action((kind: string) => { try {
    if (kind === 'patch') output(z.toJSONSchema(patchSchema));
    else if (kind === 'answer') output(z.toJSONSchema(answerSchema));
    else throw new Error('Schema kind must be patch or answer');
  } catch (error) { fail(error); } });
program.command('capture').description('persist and materialize a task event')
  .requiredOption('--event <file>', 'event JSON file')
  .action(async options => { try { output(await new Wiki(root()).capture(JSON.parse(readFileSync(options.event, 'utf8')))); } catch (error) { fail(error); } });
program.command('snapshot <label>').description('capture exact code and wiki revisions')
  .option('--ref <commit>', 'code commit', 'HEAD')
  .action(async (label, options) => { try { output(await new Wiki(root()).snapshot(label, options.ref)); } catch (error) { fail(error); } });
program.command('seal').description('advance the Git checkpoint after complete reconciliation')
  .option('--ref <commit>', 'code commit', 'HEAD')
  .action(async options => { try { output(await new Wiki(root()).seal(options.ref)); } catch (error) { fail(error); } });
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
      hook: '.wikipoke/hooks/post-commit', hookComposed: hookActive(path), pending: null, problems };
    if (Number(process.versions.node.split('.')[0]) < 22) problems.push(`Node 22 or later is required; running ${process.version}.`);
    if (!version) problems.push('Git is not on PATH; Wikipoke reads every source from Git.');
    else if (!repo) problems.push(`No Git repository with at least one commit at ${path}.`);
    if (!configured) problems.push('No wikipoke.config.yaml; run init to configure the wiki.');
    if (!report.hookComposed) problems.push('No post-commit hook composes .wikipoke/hooks/post-commit; the attention signal will not refresh on commit.');
    if (configured) {
      try { report.wiki = (parse(readFileSync(configPath, 'utf8')) as { wiki?: string }).wiki ?? 'wiki'; }
      catch (error) { problems.push(`Unreadable configuration: ${(error as Error).message}`); }
    }
    if (configured && repo) {
      try { const status = await new Wiki(path).status(); report.pending = status.uncovered.length + status.drift.length; }
      catch (error) { problems.push((error as Error).message); }
    }
    output(report);
  });
program.parseAsync().catch(fail);
