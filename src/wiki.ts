import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { posix } from 'node:path';
import { parse, stringify } from 'yaml';
import { configSchema, draftSchema, answerSchema, eventSchema,
  type Config, type Draft, type Metadata, type Page, type SourceMeta } from './model.js';
import { index, lint, loadPages, graph, render, reserved, type Library } from './knowledge.js';
import { Store, read, hash, json, safePath, files } from './runtime/store.js';
import { manifest, sourcesFor, revision, uncommitted, covers, matched, digestOf, changed } from './sources/git.js';
import { z } from 'zod';

type Event = z.infer<typeof eventSchema>;
interface Attempt { at: string; state: string; reason?: string }
const stamp = () => new Date().toISOString();
// A session id comes from whatever harness is driving; it names a file, so it is reduced to the
// characters a file name can carry rather than trusted and resolved.
// A digest written by an earlier release is longer than one written today, and both name the same
// content. Comparing by prefix keeps every wiki already on disk valid instead of reporting the whole
// repository as drifted the moment the tool is upgraded. Eight characters is the floor: below that a
// prefix stops being evidence of anything.
function sameDigest(mine?: string, theirs?: string): boolean {
  if (!mine || !theirs) return mine === theirs;
  if (mine.length < 8 || theirs.length < 8) return mine === theirs;
  return mine.startsWith(theirs) || theirs.startsWith(mine);
}
const SAMPLE = 10;
function slug(value: string): string {
  const result = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72).replace(/-+$/g, '');
  return result || 'record';
}
// Files in tree order are neighbours by accident. A batch drawn that way hands an agent a stylesheet,
// two entry points and four unrelated pages and asks for knowledge about them - and the only page
// that can be written about files sharing nothing is one page per file, which is the shape `lint`
// reports as a mirror of the tree and `seal` refuses. So the batch starts wherever the queue starts
// and takes everything under that directory first: whatever else it is, it is about one thing.
function clustered(pending: SourceMeta[]): SourceMeta[] {
  if (!pending.length) return pending;
  const home = posix.dirname(pending[0].id);
  const near = (source: SourceMeta) => source.id.startsWith(`${home}/`) || posix.dirname(source.id) === home;
  return [...pending.filter(near), ...pending.filter(source => !near(source))];
}
// A plan is only bounded when both its file count and its byte weight are: ten files of a large
// module outweigh an agent's context. The first pending source always ships, so a file larger than
// the budget is still planned rather than blocking the queue behind it forever.
function budgeted(pending: SourceMeta[], limits: Config['limits']): SourceMeta[] {
  const batch: SourceMeta[] = [];
  let bytes = 0;
  for (const source of pending) {
    if (batch.length >= limits.batchFiles) break;
    if (batch.length && bytes + source.size > limits.batchBytes) break;
    batch.push(source); bytes += source.size;
  }
  return batch;
}
// A readable path is worth more than a deterministic one, and the page's identity never lived in the
// path anyway - it lives in `wikipoke.uid`. So the name is just the slug, and the numeric suffix
// appears only when a name is genuinely taken. Callers resolve an existing page by uid first, so a
// published page keeps the path it already has and nothing is ever renamed underneath a link.
function unique(directory: string, label: string, taken: Set<string>): string {
  const base = `${directory}/${slug(label)}`;
  if (!taken.has(`${base}.md`)) return `${base}.md`;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}.md`)) return `${base}-${n}.md`;
}
// A choice is a paragraph; a title is a name. When an event declares no title, the first sentence is
// the closest thing to one it has - better than the whole paragraph, and honest about being derived.
function headline(value: string): string {
  const trim = (text: string) => text.replace(/[\s.,:;-]+$/, '');
  const first = value.split('\n')[0].trim();
  const sentence = first.split(/(?<=[.:;])\s/)[0] || first;
  if (sentence.length <= 90) return trim(sentence);
  // A hard cut at the character limit ends a name mid-phrase - "...can be surfaced to the". Falling
  // back to the last clause boundary inside the budget ends it somewhere a reader would have paused.
  const budget = sentence.slice(0, 90);
  const clause = Math.max(budget.lastIndexOf(', '), budget.lastIndexOf(' - '),
    budget.lastIndexOf(' ('), budget.lastIndexOf(' so '), budget.lastIndexOf(' because '));
  return trim(clause > 40 ? budget.slice(0, clause) : budget.replace(/\s+\S*$/, ''));
}
function metadata(type: string, title: string, uid: string): Metadata {
  return { type, title, description: title, sources: [], wikipoke: { uid, relations: [] } };
}
function trace(attempts: Attempt[]): string {
  return attempts.length ? `\n# Attempts\n\n${attempts
    .map(a => `- ${a.at} - ${a.state}${a.reason ? `: ${a.reason}` : ''}`).join('\n')}\n` : '';
}
const answerHeading = '\n# Answer\n\n', gapsHeading = '\n\n# Gaps\n';
// The page body holds the prose once. The frontmatter keeps machine state — state, citations, gaps,
// attempts, completedAt — and no second copy of the answer, because two copies of the same text in
// one editable file is one copy that silently goes stale the first time a human corrects the page.
function answerProse(body: string): string | undefined {
  const start = body.indexOf(answerHeading);
  if (start < 0) return undefined;
  const from = start + answerHeading.length, stop = body.indexOf(gapsHeading, from);
  return stop < 0 ? undefined : body.slice(from, stop);
}
// Two spellings of the same question are the same question. Normalizing to letters and digits alone
// catches the case that actually happens - the same words asked twice, once with a comma - without
// pretending to understand meaning, which a string comparison cannot do.
function normalize(question: string): string {
  return question.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)?.join(' ') ?? '';
}
// A link between two pages belongs in the body, where a reader can follow it and where Obsidian and
// GitHub both render it. Ordinary Markdown, relative to the page holding it - not a typed relation
// in frontmatter that only a graph command can see.
function links(from: string, targets: string[]): string {
  return targets.map(to => `- [${posix.basename(to, '.md')}](${posix.relative(posix.dirname(from), to) || to})`).join('\n');
}
function queryBody(query: Record<string, unknown>, prose?: string, path = ''): string {
  const cited = (query.pages as string[] | undefined) ?? [];
  return `# Question\n\n${query.question}\n` +
    (prose === undefined ? '' : `${answerHeading}${prose}${gapsHeading}\n${((query.gaps as string[]) ?? []).join('\n')}\n`) +
    (cited.length ? `\n# Answered from\n\n${links(path, cited)}\n` : '') +
    trace((query.attempts as Attempt[] | undefined) ?? []);
}
export class Wiki {
  readonly store: Store;
  readonly config: Config;
  constructor(readonly root: string) {
    this.store = new Store(root);
    const config = read(this.store.path('wikipoke.config.yaml'));
    if (!config) throw new Error('Run init first');
    this.config = configSchema.parse(parse(config));
    safePath(root, this.config.wiki);
  }
  static async init(root: string, input: Config) {
    let config = configSchema.parse(input), store = new Store(root);
    safePath(root, config.wiki);
    await store.locked(() => {
      const existing = read(store.path('wikipoke.config.yaml'));
      if (existing) throw new Error('Configuration already exists; edit it explicitly');
      const indexPath = `${config.wiki}/index.md`, existingIndex = read(store.path(indexPath));
      if (existingIndex !== null && existingIndex !== '# Knowledge index\n')
        throw new Error(`Wiki already exists at ${indexPath}; migrate it explicitly instead of initializing over it`);
      const ignoreFile = read(store.path('.wikipokeignore'));
      if (ignoreFile !== null) {
        const adopted = ignoreFile.split(/\r?\n/).map(line => line.trim())
          .filter(line => line.length > 0 && !line.startsWith('#'));
        config = { ...config, exclude: [...new Set([...config.exclude, ...adopted])] };
      }
      store.commit([{ path: 'wikipoke.config.yaml', before: null, after: stringify(config) },
        { path: indexPath, before: existingIndex, after: '# Knowledge index\n' },
        { path: '.wikipoke/state.json', before: null, after: json({ version: 1, lastIndexedCommit: null }) }]);
    });
    return new Wiki(root);
  }
  library(): Library { return loadPages(this.store.path(this.config.wiki)); }
  pages(): Page[] { return this.library().pages; }
  pagePath(path: string) {
    if (!path.endsWith('.md') || reserved.includes(path)) throw new Error(`Invalid concept path: ${path}`);
    safePath(this.store.path(this.config.wiki), path);
    const parts = path.slice(0, -3).split('/');
    if (parts.some(part => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part)))
      throw new Error(`Wiki path needs readable slug segments: ${path}`);
    return `${this.config.wiki}/${path}`;
  }
  private publish(pages: Page[], extra: { path: string; before: string | null; after: string }[] = []) {
    const { pages: existing, unreadable } = this.library(), byPath = new Map(existing.map(p => [p.path, p]));
    // Conflict markers are excluded here too: git wrote them and nobody is midway through editing.
    const broken = new Map(unreadable.filter(p => p.code !== 'conflict-markers').map(p => [p.path, p.reason]));
    for (const p of pages) {
      this.pagePath(p.path);
      if (broken.has(p.path)) throw new Error(`Cannot publish over an unreadable page: ${p.path} (${broken.get(p.path)})`);
      byPath.set(p.path, p);
    }
    const errors = lint([...byPath.values()]).filter(f => f.severity === 'error');
    if (errors.length) throw new Error(json(errors));
    // Normalized at the single point everything written passes through, rather than in one caller.
    // An agent fills in fields it knows the schema has even when the plan stopped offering them, and
    // Wikipoke's own generated pages carried the same duplication in from the inventory.
    const writes = pages.map(p => {
      const meta = { ...p.meta, sources: p.meta.sources.map(source =>
        source.resource === source.id ? (({ resource, ...rest }) => rest)(source) : source) };
      return { path: this.pagePath(p.path), before: read(this.store.path(this.pagePath(p.path))),
        after: render(meta, p.body) };
    });
    const idx = `${this.config.wiki}/index.md`;
    writes.push({ path: idx, before: read(this.store.path(idx)), after: index([...byPath.values()]) });
    const chronology = this.changelog([...byPath.values()]);
    if (chronology) {
      const log = `${this.config.wiki}/log.md`;
      writes.push({ path: log, before: read(this.store.path(log)), after: chronology });
    }
    this.store.commit([...writes, ...extra].filter(w => w.before !== w.after));
  }
  // index.md answers "what does this project know". This answers the other question, the one a diff
  // can restate and never explain: what has been done to the code, and why. It is generated from the
  // decision tape, newest first, so it grows only when somebody records a reason.
  private changelog(pages: Page[]): string {
    const byUid = new Map(pages.map(p => [p.meta.wikipoke.uid, p]));
    const decisions = this.events().filter(e => e.kind === 'decision')
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
    if (!decisions.length) return '';
    const entries = decisions.flatMap(event => {
      // The log links pages, so it is written from what is published, resolved by identity. An event
      // whose page is not there yet simply has no line: a broken link would be worse than a gap.
      const page = byUid.get(`decision:${hash(event.id)}`);
      if (!page) return [];
      // Pages written before decisions carried a title have a whole paragraph as their name. The log
      // is a list and has to stay readable, so it links the first sentence of whatever it finds.
      const title = headline(page.meta.title).replace(/[\[\]\n]/g, '');
      const touched = event.evidence.length
        ? event.evidence.map(file => `\`${file}\``).join(', ')
        : '_no file declared_';
      return [`## ${event.at} - ${event.task}\n\n[${title}](${page.path}) - ${event.actor}\n\nTouched: ${touched}\n`];
    });
    if (!entries.length) return '';
    return '# Change log\n\nWhat changed in the code and why, newest first. Generated from the recorded '
      + 'decisions on every publication; hand edits are replaced.\n\n' + entries.join('\n');
  }
  async status() {
    return this.store.locked(() => this.health());
  }
  async graph() {
    return this.store.locked(() => graph(this.pages()));
  }
  async lint() {
    // The source count is part of the input: two of the checks are about the shape of the wiki
    // relative to the code, and without it they silently never fire.
    return this.store.locked(() => {
      const { pages, unreadable } = this.library();
      return lint(pages, unreadable, manifest(this.root, this.config).sources.length);
    });
  }
  // The event tape only ever grows, and it is knowledge: nothing here is deleted. Events are folded
  // into one file per month, because ten thousand files in a flat directory is what makes reading
  // them expensive, not their content. Only tasks that are closed are folded, so nothing in flight
  // moves.
  private prune(): { archived: number } {
    return { archived: this.archive(this.events()) };
  }
  private archive(events: Event[]): number {
    const closed = new Set(events.filter(e => e.kind === 'close').map(e => e.task));
    const months = new Map<string, Event[]>();
    for (const event of events) {
      if (!closed.has(event.task)) continue;
      const loose = this.store.path(`.wikipoke/events/${hash(event.id)}.json`);
      if (!read(loose)) continue;
      const month = event.at.slice(0, 7);
      months.set(month, [...(months.get(month) ?? []), event]);
    }
    let archived = 0;
    for (const [month, batch] of months) {
      const path = `.wikipoke/events/archive/${month}.jsonl`;
      const before = read(this.store.path(path));
      const kept = new Set((before ?? '').split('\n').filter(Boolean));
      for (const event of batch) kept.add(JSON.stringify(event));
      this.store.commit([{ path, before, after: [...kept].sort().join('\n') + '\n' }]);
      for (const event of batch) { rmSync(this.store.path(`.wikipoke/events/${hash(event.id)}.json`)); archived += 1; }
    }
    return archived;
  }
  async attention() {
    return this.store.locked(() => {
      // The maintenance pass is the only thing that runs on its own, so it is where growth is kept
      // in check. It happens before the signal is computed, so what the signal reports is the tape
      // that will still be there tomorrow.
      const pruned = this.prune();
      const health = this.health(), path = '.wikipoke/attention.json';
      const count = (severity: string) => health.findings.filter(f => f.severity === severity).length;
      // Flows are counted, not sampled: their absence is one fact, and it is the one kind of pending
      // work a diff can never raise, because nothing goes uncovered when a flow is missing.
      const flows = { count: health.flows, missing: health.findings.some(f => f.code === 'no-flows') };
      // Every other number here is computed from committed code, which is the state an agent editing
      // files has not reached yet. Uncommitted in-scope work is the debt that exists before the hook
      // that refreshes this file has any reason to run, so it is the one thing the signal can say at
      // the end of a session that it could not say at the start.
      const dirty = uncommitted(this.root, this.config);
      const signal = { at: stamp(), revision: health.revision, checkpoint: health.checkpoint.lastIndexedCommit,
        pages: health.pages, flows, findings: { error: count('error'), warning: count('warning') },
        drift: { count: health.drift.length, sample: health.drift.slice(0, SAMPLE) },
        uncovered: { count: health.uncovered.length, sample: health.uncovered.slice(0, SAMPLE) },
        uncommitted: { count: dirty.length, sample: dirty.slice(0, SAMPLE) } };
      this.store.commit([{ path, before: read(this.store.path(path)), after: json(signal) }]);
      return { ...signal, pruned };
    });
  }
  private health() {
    const inv = manifest(this.root, this.config), { pages, unreadable } = this.library();
    // A decision cites the code it was about, not the code it documents. Counting it as coverage
    // would let a wiki with no knowledge in it report every source as documented.
    const claimed = pages.filter(p => !['query', 'decision'].includes(p.meta.type))
      .flatMap(p => p.meta.sources.map(s => s.id));
    // Coverage is set membership and nothing else: a file is covered when some page's pattern claims
    // it. Requiring the digest to match as well made a single edit uncover every file its pattern
    // matched - one moved file reporting a hundred as undocumented. That a page has fallen behind is
    // drift, and drift is the axis that already says so.
    const covered = new Set(inv.sources.filter(s => claimed.some(pattern => covers(pattern, s.id))).map(s => s.id));
    // Naming the remedy, not only the symptom: a source that is gone reads as a dead end, and the
    // way out - republish the page without it, or repoint it if the file was renamed - is not
    // something an agent finds on its own. Nothing else in the tool ever says it.
    const drift = pages.flatMap(p => p.meta.sources.filter(s => s.hash).flatMap(s => {
      if (!matched(inv.sources, s.id).length) return [{ page: p.path, source: s.id, reason: 'missing',
        remedy: `${s.id} matches no file in scope: republish ${p.path} without that source, or repoint it at the path the code moved to` }];
      if (sameDigest(s.hash, digestOf(inv.sources, s.id))) return [];
      return [{ page: p.path, source: s.id, reason: 'changed',
        remedy: 'Re-plan with ingest and republish the page against the current content' }];
    }));
    const events = this.events();
    const tasks = [...new Set(events.map(e => e.task))].map(task => {
      const list = events.filter(e => e.task === task), closed = [...list].reverse().find(e => e.kind === 'close');
      const hasDecision = list.some(e => e.kind === 'decision');
      const closure = !list.some(e => e.kind === 'open') || !closed ||
        (closed.closure === 'recorded' && !hasDecision) || (closed.closure === 'none_declared' && hasDecision)
        ? 'incomplete' : closed.closure;
      return { task, closure };
    });
    const checkpoint = this.store.load<{ version: number; lastIndexedCommit: string | null }>(
      '.wikipoke/state.json', { version: 1, lastIndexedCommit: null });
    const reachable = this.reachable(checkpoint.lastIndexedCommit);
    const findings = lint(pages, unreadable, inv.sources.length);
    if (!reachable) findings.push({ code: 'lost-checkpoint', severity: 'error',
      message: `The sealed checkpoint ${checkpoint.lastIndexedCommit} is not in this repository, so changes since it cannot be compared; seal again once the wiki is level with the code` });
    return { revision: inv.revision, checkpoint, pages: pages.length,
      flows: pages.filter(p => p.meta.type === 'flow').length, findings, drift,
      uncovered: inv.sources.filter(s => !covered.has(s.id)).map(s => s.id), tasks,
      graph: graph(pages) };
  }
  // A squash-merge, a deleted branch or a fresh clone can leave the sealed commit unreachable. The
  // checkpoint then certifies a commit nobody can look at, so it is reported as an error finding
  // rather than left standing as a claim that the wiki is level with the code.
  private reachable(checkpoint: string | null): boolean {
    if (!checkpoint) return true;
    try { revision(this.root, checkpoint); return true; } catch { return false; }
  }
  async ingest(ref = 'HEAD', target?: string) {
    return this.store.locked(() => {
      // Planning needs identity and digest for everything, and content for the batch alone. Reading
      // the whole repository into memory to choose ten files is what put the peak at 425 MB.
      const inv = manifest(this.root, this.config, ref), existing = this.pages();
      const claimed = existing.filter(p => !['query', 'decision'].includes(p.meta.type))
        .flatMap(p => p.meta.sources.map(s => s.id));
      const outstanding = inv.sources.filter(s => !claimed.some(pattern => covers(pattern, s.id)));
      // Aiming is the difference between seeding a wiki and grinding one out. Left to itself the
      // plan hands over whatever is next in tree order, which is how an agent ends up documenting a
      // stylesheet and two entry points together and writing a page per file because they share
      // nothing. A target says "this part, now", and is the only way to cover code that was never
      // going to show up in a diff.
      if (target && !inv.sources.some(s => covers(target, s.id)))
        throw new Error(`Nothing in scope matches ${target}; it must name a file, a directory or a glob inside the configured include patterns`);
      const pending = target ? outstanding.filter(s => covers(target, s.id)) : outstanding;
      const batch = budgeted(clustered(pending), this.config.limits);
      const sources = sourcesFor(this.root, this.config, batch.map(s => s.id), ref);
      const direct = new Set(existing.filter(p => p.meta.sources
        .some(s => sources.some(source => covers(s.id, source.id)))).map(p => p.path));
      for (const edge of graph(existing).edges) if (edge.type === 'depends_on' && direct.has(edge.to)) direct.add(edge.from);
      const dirty = uncommitted(this.root, this.config);
      // `complete` and `remaining` always speak for the whole scope, aimed or not: a pass that
      // finished its target has not finished the wiki, and a plan that said so would stop the loop
      // with most of the repository still undocumented.
      return { complete: outstanding.length === 0, remaining: outstanding.length - sources.length,
        ...(target ? { target, remainingHere: pending.length - sources.length } : {}),
        language: this.config.language, revision: inv.revision,
        // Sources whose working copy differs from the commit this plan was made against. Documenting
        // one of these describes code that is already superseded on disk.
        uncommitted: dirty,
        ...(dirty.length ? { warning: `${dirty.length} in-scope file(s) have uncommitted changes; this plan describes the committed version. Commit first, or leave those files for a later pass.` } : {}),
        // The plan is what an agent copies into the frontmatter, so it offers no field it would only
        // be repeating: with a Git adapter the resource is the id.
        sources: sources.map(({ resource, ...rest }) => resource === rest.id ? rest : { ...rest, resource }),
        pages: existing.filter(p => direct.has(p.path)), catalog: existing.map(p => ({ path: p.path, title: p.meta.title })) };
    });
  }
  // Pages as an agent writes them: Markdown with frontmatter, sources as bare patterns. Everything
  // an agent used to transcribe - the revision, the digest of every file, the page's identity - is
  // resolved here from the inventory it was planned against, because all of it was already known.
  async publishPages(input: Draft[], ref = 'HEAD') {
    const drafts = input.map(draft => ({ path: draft.path, body: draft.body, meta: draftSchema.parse(draft.meta) }));
    if (!drafts.length) throw new Error('No pages to publish');
    return this.store.locked(() => {
      const at = revision(this.root, ref), inv = manifest(this.root, this.config, at);
      const { pages: existing, unreadable } = this.library();
      const base = new Map(existing.map(p => [p.path, p.raw]));
      // A page a human is midway through writing must never be overwritten. A page full of conflict
      // markers is not that: git wrote them, nobody wants them kept, and refusing to publish over it
      // leaves the one repair the agent could make to a human editing YAML by hand.
      const broken = new Map(unreadable.filter(p => p.code !== 'conflict-markers').map(p => [p.path, p.reason]));
      // Did the code move while the pages were being written? One diff against the plan's commit
      // answers it for every pattern at once - and only for the patterns these pages claim, so a
      // typo committed in a README during the turn no longer throws away a batch of work.
      const patterns = drafts.flatMap(draft => draft.meta.sources);
      const moved = changed(this.root, this.config, at).filter(file => patterns.some(p => covers(p, file)));
      if (moved.length) throw new Error(`Source moved after planning: ${moved.slice(0, 3).join(', ')}${
        moved.length > 3 ? ` and ${moved.length - 3} more` : ''}; re-plan with ingest and write these pages again`);
      const updated = drafts.map(draft => {
        this.pagePath(draft.path);
        if (draft.meta.type === 'query') throw new Error('Publish cannot replace captured history');
        if (broken.has(draft.path)) throw new Error(`Cannot publish over an unreadable page: ${draft.path} (${broken.get(draft.path)})`);
        const onDisk = read(this.store.path(this.pagePath(draft.path)));
        if (onDisk !== (base.get(draft.path) ?? null) && !unreadable.some(u => u.path === draft.path && u.code === 'conflict-markers'))
          throw new Error(`Concurrent edit: ${draft.path}`);
        const old = existing.find(e => e.path === draft.path);
        // Identity is assigned on first publication and never reassigned: a page keeps the uid it was
        // given even when it is renamed, which is what keeps every link in the wiki pointing at it.
        const uid = draft.meta.wikipoke.uid ?? old?.meta.wikipoke.uid ?? slug(draft.path.replace(/\.md$/, ''));
        if (old && old.meta.wikipoke.uid !== uid) throw new Error('Cannot replace page identity');
        const sources = draft.meta.sources.map(pattern => {
          if (!matched(inv.sources, pattern).length)
            throw new Error(`Unverified source: ${pattern} matches no file in the configured scope at ${at.slice(0, 12)}; check the pattern against the plan`);
          return { id: pattern, revision: at.slice(0, 12), hash: digestOf(inv.sources, pattern) };
        });
        const meta: Metadata = { ...draft.meta, sources,
          wikipoke: { ...draft.meta.wikipoke, uid, relations: draft.meta.wikipoke.relations } };
        return { path: draft.path, meta, body: draft.body, raw: render(meta, draft.body) };
      });
      this.publish(updated);
      return { published: updated.map(p => p.path), revision: at,
        sources: Object.fromEntries(updated.map(p => [p.path, p.meta.sources.map(s => s.id)])) };
    });
  }
  async ask(question: string, requestId = randomUUID(), ref?: string, again = false) {
    const id = hash(requestId);
    return this.store.locked(async () => {
      const existing = this.pages();
      const before = existing.find(p => p.meta.wikipoke.uid === `query:${id}`);
      const path = before?.path ?? unique('queries', question, new Set(existing.map(p => p.path)));
      // The same question, already answered, against evidence that has not moved: the answer is the
      // cheapest in the wiki and researching it again produces a second page saying the same thing.
      // Offering it as a suggestion was not enough - it was ignored - so it is returned instead of a
      // new query. A stale answer is not reused: drift there means the code moved under it.
      if (!before && !again) {
        const wanted = normalize(question), current = manifest(this.root, this.config, ref);
        const known = new Map(current.sources.map(source => [source.id, source.hash]));
        const answered = existing.find(p => {
          const record = p.meta.wikipoke.query as Record<string, unknown> | undefined;
          // Reuse rests on the evidence still matching, so an answer with no pinned source has
          // nothing to check: `every` over an empty list is vacuously true, and the answer would be
          // reusable forever no matter how far the code moved underneath it.
          return p.meta.type === 'query' && record?.state === 'answered' &&
            typeof record.question === 'string' && normalize(record.question) === wanted &&
            record.ref === (ref ?? 'HEAD') && p.meta.sources.length > 0 &&
            p.meta.sources.every(source => sameDigest(source.hash, known.get(source.id)));
        });
        if (answered) {
          const record = answered.meta.wikipoke.query as Record<string, unknown>;
          return { ...record, reused: true, path: answered.path, revision: current.revision,
            language: this.config.language, answer: answerProse(answered.body),
            note: 'This question was already answered against evidence that has not changed. Read this answer instead of researching it again; pass --again to research it anyway.' };
        }
      }
      if (before) {
        const record = before.meta.wikipoke.query as Record<string, unknown>;
        if (record.question !== question || record.ref !== (ref ?? 'HEAD')) throw new Error('Request ID already used for different input');
        if (record.state === 'answered') return record;
      }
      const at = stamp(), meta = metadata('query', question, `query:${id}`);
      const attempts: Attempt[] = [...(before ? (before.meta.wikipoke.query as any).attempts ?? [] : []), { at, state: 'pending' }];
      meta.wikipoke.query = { requestId, question, ref: ref ?? 'HEAD', at, state: 'pending', attempts };
      this.publish([{ path, meta, body: queryBody(meta.wikipoke.query as Record<string, unknown>, undefined, path), raw: '' }]);
      const inv = manifest(this.root, this.config, ref), everything = this.pages();
      const pages = everything.filter(p => p.meta.type !== 'query');
      const tokens = question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      const overlap = (text: string) => tokens.reduce((n, t) => n + Number(text.toLowerCase().includes(t)), 0);
      const suggestedPages = pages.map(p => ({ path: p.path, score: overlap(`${p.meta.title} ${p.body}`) }))
        .sort((a, b) => b.score - a.score).slice(0, 6).map(p => p.path);
      // A question already answered is the cheapest evidence in the wiki, and it was the one kind of
      // page suggestion excluded outright. Prior answers are offered separately from knowledge pages
      // because they are a different move: read one and reuse it, rather than research from source.
      const priorAnswers = everything.filter(p => p.meta.type === 'query' && p.path !== path)
        .map(p => ({ page: p, record: p.meta.wikipoke.query as Record<string, unknown> | undefined }))
        .filter(({ record }) => record?.state === 'answered' && typeof record.question === 'string')
        .map(({ page, record }) => ({ path: page.path, question: record!.question as string,
          requestId: record!.requestId as string, score: overlap(record!.question as string) }))
        .filter(candidate => candidate.score > 0)
        .sort((a, b) => b.score - a.score).slice(0, 3)
        .map(({ score, ...candidate }) => candidate);
      return { ...(meta.wikipoke.query as object), path, revision: inv.revision,
        language: this.config.language, suggestedPages, priorAnswers };
    });
  }
  async answer(requestId: string, input: unknown) {
    const answer = answerSchema.parse(input);
    return this.store.locked(() => {
      const page = this.pages().find(p => p.meta.type === 'query' && (p.meta.wikipoke.query as any)?.requestId === requestId);
      if (!page) throw new Error('Unknown query request ID');
      const query = page.meta.wikipoke.query as Record<string, unknown>, meta = page.meta;
      if (query.state === 'answered') throw new Error('Query already answered; ask again with a new request ID to revise it');
      const previous: Attempt[] = (query.attempts as Attempt[] | undefined) ?? [];
      // A retry re-renders the page, so it reads back the prose already written rather than dropping
      // it: an unsupported answer keeps its text while a later attempt fails.
      const written = answerProse(page.body);
      const record = (next: Record<string, unknown>, prose = written) => {
        meta.wikipoke.query = next;
        this.publish([{ path: page.path, meta, body: queryBody(next, prose, page.path), raw: '' }]);
        return next;
      };
      try {
        const inv = manifest(this.root, this.config, query.ref as string);
        const library = this.pages();
        // A citation is a source id or the path of a page, which is what the query skill has always
        // promised and what the code used to reject. Both are evidence; they are not the same edge.
        // Source ids pin provenance in `sources`; a cited page becomes an `asks_about` relation, so
        // an answered question is finally connected to the knowledge it was answered from.
        const cited = answer.citations.map(id => {
          const source = inv.sources.find(s => s.id === id);
          if (source) { const { size, ...evidence } = source; return { source: evidence }; }
          const page = library.find(p => p.path === id);
          if (page) return { page };
          throw new Error(`Unknown citation: ${id}; name a source id from the plan or the path of a page in the wiki`);
        });
        const citations = cited.flatMap(c => c.source ? [c.source] : []);
        const referenced = cited.flatMap(c => c.page ? [c.page] : []);
        if (!cited.length && !answer.gaps.length)
          throw new Error('Answer needs cited evidence, or declared gaps when no evidence exists');
        const at = stamp(), state = cited.length ? 'answered' : 'unsupported';
        meta.sources = citations;
        return record({ ...query, citations: answer.citations, gaps: answer.gaps,
          pages: referenced.map(page => page.path), revision: inv.revision, state, completedAt: at,
          attempts: [...previous, { at, state }] }, answer.answer);
      } catch (error) {
        const reason = (error as Error).message;
        record({ ...query, attempts: [...previous, { at: stamp(), state: 'failed', reason }] });
        throw error;
      }
    });
  }
  events(): Event[] {
    const directory = this.store.path('.wikipoke/events');
    const loose = files(directory).filter(f => f.endsWith('.json') && !f.includes('/archive/'))
      .map(f => eventSchema.parse(JSON.parse(read(f)!)));
    // Folded months read as one file each. A tape of ten thousand events is then a handful of reads
    // rather than ten thousand, and nothing was thrown away to get there.
    const folded = files(`${directory}/archive`).filter(f => f.endsWith('.jsonl'))
      .flatMap(f => (read(f) ?? '').split('\n').filter(Boolean).flatMap(line => {
        try { return [eventSchema.parse(JSON.parse(line))]; } catch { return []; }
      }));
    const byId = new Map([...folded, ...loose].map(e => [e.id, e]));
    return [...byId.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
  async capture(input: unknown) {
    const event = eventSchema.parse(input), eventPath = `.wikipoke/events/${hash(event.id)}.json`;
    // Checked here and not in the schema: the schema also re-reads every event ever written, and a
    // rule added today must not make yesterday's tape unreadable.
    if (event.kind === 'close' && event.closure === 'none_declared' && !event.evidence.length)
      throw new Error('Closing with none_declared must name in evidence the source files it covers, so the absence of a reason is recorded against something rather than everything');
    return this.store.locked(() => {
      const old = read(this.store.path(eventPath));
      if (old && old !== json(event)) throw new Error('Event ID already exists with different content');
      if (!old) this.store.commit([{ path: eventPath, before: null, after: json(event) }]);
      const events = this.events().filter(e => e.task === event.task);
      const published = this.pages(), byUid = new Map(published.map(p => [p.meta.wikipoke.uid, p]));
      const taken = new Set(published.map(p => p.path));
      // Declared evidence names files. Resolved against the inventory it becomes real provenance:
      // the decision joins the graph through the code it is about, and drift can say that the source
      // behind a choice has moved - which is the one thing a decision record has to be able to say.
      const inv = manifest(this.root, this.config);
      const known = new Map(inv.sources.map(source => [source.id, source]));
      const recorded = events.filter(e => e.kind === 'decision');
      const named = recorded.map(e => {
        const uid = `decision:${hash(e.id)}`, existing = byUid.get(uid);
        // Identity is the uid, never the path: a page already published keeps its name even after
        // the naming rules change, so no link in the wiki is broken by a later release.
        if (existing) return { event: e, uid, path: existing.path, existing };
        const path = unique('decisions', e.title ?? headline(e.choice!), taken);
        taken.add(path);
        return { event: e, uid, path, existing: undefined };
      });
      const siblings = new Map(named.map(n => [n.event.id, n.path]));
      const decisions = named.map(({ event: e, uid, path, existing }) => {
        const name = e.title ?? headline(e.choice!);
        // Evidence is pinned once and never recomputed: the hash recorded when the choice was made is
        // what later reports as drifted, and recalculating it would erase exactly that. Everything
        // else on the page - its name, its links - is derived, so it is rebuilt on every capture and
        // a later choice under the same task shows up on the pages decided beside it.
        const cited = e.evidence.filter(file => known.has(file));
        const pinned = existing?.meta.sources.length ? existing.meta.sources
          : cited.map(file => { const { size, ...source } = known.get(file)!; return source; });
        const meta = existing ? { ...existing.meta, title: name, description: name } : metadata('decision', name, uid);
        meta.sources = pinned;
        // Relations on a decision page are Wikipoke's to write, and Wikipoke no longer writes any:
        // what connects these pages now lives in the body, so a leftover from an older release goes.
        meta.wikipoke.relations = [];
        meta.wikipoke.decision = { actor: e.actor, eventId: e.id, at: e.at };
        // What this choice touches, written as links in the body rather than as typed relations: the
        // pages documenting the same code, and the other choices recorded under the same task. A
        // reader following the wiki finds them; so does the graph, which reads the body too.
        // A decision names files; a page claims a pattern. Matching the two by string equality
        // silently stopped finding anything the moment a page covered a module rather than a file -
        // and a decision that links to nothing is a decision nobody reading the wiki will ever meet.
        const evidence = pinned.map(source => source.id);
        const about = published.filter(page => !['decision', 'query'].includes(page.meta.type) &&
          page.meta.sources.some(source => evidence.some(file => covers(source.id, file) || covers(file, source.id))))
          .map(page => page.path);
        const together = named.filter(other => other.event.id !== e.id).map(other => siblings.get(other.event.id)!);
        const unverified = e.evidence.filter(file => !known.has(file));
        const section = (title: string, content: string) => content ? `\n# ${title}\n\n${content}\n` : '';
        return { path, meta, raw: '',
          body: `# Choice\n\n${e.choice}\n\n# Declared rationale\n\n${e.rationale ?? 'Unknown; not declared.'}\n`
            + section('Alternatives', e.alternatives.join('\n'))
            + section('Documented here', links(path, about))
            + section('Decided alongside', links(path, together))
            + section('Declared evidence not in scope', unverified.join('\n')) };
      });
      // The wiki carries what the task decided, never a transcript of it. The open/close pair is
      // already durable in .wikipoke/events and counted in the attention signal, and a page
      // restating "Task opened" buys shelf space with no knowledge in it. The tape is kept; only
      // the choices are published.
      if (!decisions.length) return { id: event.id, task: event.task, materialized: false, decisions: 0 };
      this.publish(decisions);
      return { id: event.id, task: event.task, materialized: true, decisions: decisions.length };
    });
  }
  async seal(ref = 'HEAD') {
    return this.store.locked(() => {
      const health = this.health(), commit = revision(this.root, ref);
      const errors = health.findings.filter(f => f.severity === 'error').length;
      // A checkpoint says this wiki is level with the code. A wiki with no flow page is not: it has
      // one page per file and nothing describing how they run together, which is the knowledge the
      // whole exercise exists to capture. It is the one warning that holds the seal, because a
      // missing flow leaves no source uncovered and would otherwise be certified as complete.
      const flowless = health.findings.some(f => f.code === 'no-flows');
      const thin = health.findings.filter(f => f.code === 'thin-coverage');
      const mirrored = health.findings.some(f => f.code === 'mirrors-the-tree');
      if (health.drift.length || health.uncovered.length || errors || flowless || thin.length || mirrored)
        throw new Error(`Cannot advance checkpoint while wiki health has pending work: ${health.uncovered.length} uncovered source(s), ${health.drift.length} drifted reference(s), ${errors} error finding(s)${flowless ? ', and no page describes a flow through the code' : ''}${thin.length ? `, and ${thin.length} page(s) claim more sources than they describe: ${thin.slice(0, 3).map(f => f.page).join(', ')}` : ''}${mirrored ? ', and the wiki is shaped like the file tree rather than written as knowledge' : ''}`);
      const state = { version: 1, lastIndexedCommit: commit, sealedAt: stamp() };
      const path = '.wikipoke/state.json';
      this.store.commit([{ path, before: read(this.store.path(path)), after: json(state) }]);
      return state;
    });
  }
}
