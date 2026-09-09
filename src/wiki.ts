import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { posix } from 'node:path';
import { parse, stringify } from 'yaml';
import { configSchema, patchSchema, answerSchema, eventSchema, touchSchema,
  type Config, type Metadata, type Page, type Source, type Touch } from './model.js';
import { index, lint, loadPages, graph, render, reserved, type Library } from './knowledge.js';
import { Store, read, hash, json, safePath, files } from './runtime/store.js';
import { changed, ignored, inventory, revision, uncommitted, git } from './sources/git.js';
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
const sessionFile = (session?: string) => (session ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 96) || 'unknown';
const SAMPLE = 10;
function slug(value: string): string {
  const result = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72).replace(/-+$/g, '');
  return result || 'record';
}
// A plan is only bounded when both its file count and its byte weight are: ten files of a
// large module outweigh an agent's context, and a truncated plan loses the pinned evidence
// the patch has to carry. The first pending source always ships, so a file larger than the
// budget is still planned rather than blocking the queue behind it forever.
function budgeted(pending: Source[], limits: Config['limits']): Source[] {
  const batch: Source[] = [];
  let bytes = 0;
  for (const source of pending) {
    if (batch.length >= limits.batchFiles) break;
    if (batch.length && bytes + source.content.length > limits.batchBytes) break;
    batch.push(source); bytes += source.content.length;
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
    const writes = pages.map(p => ({ path: this.pagePath(p.path), before: read(this.store.path(this.pagePath(p.path))),
      after: render(p.meta, p.body) }));
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
      return lint(pages, unreadable, inventory(this.root, this.config).sources.length);
    });
  }
  async attention() {
    return this.store.locked(() => {
      const health = this.health(), path = '.wikipoke/attention.json';
      const count = (severity: string) => health.findings.filter(f => f.severity === severity).length;
      const incomplete = health.tasks.filter(t => t.closure === 'incomplete').map(t => t.task);
      // Flows are counted, not sampled: their absence is one fact, and it is the one kind of pending
      // work a diff can never raise, because nothing goes uncovered when a flow is missing.
      const flows = { count: health.flows, missing: health.findings.some(f => f.code === 'no-flows') };
      const signal = { at: stamp(), revision: health.revision, checkpoint: health.checkpoint.lastIndexedCommit,
        pages: health.pages, flows, findings: { error: count('error'), warning: count('warning') },
        drift: { count: health.drift.length, sample: health.drift.slice(0, SAMPLE) },
        uncovered: { count: health.uncovered.length, sample: health.uncovered.slice(0, SAMPLE) },
        unexplained: { count: health.unexplained.length, sample: health.unexplained.slice(0, SAMPLE) },
        tasks: { incomplete: incomplete.length, sample: incomplete.slice(0, SAMPLE) } };
      this.store.commit([{ path, before: read(this.store.path(path)), after: json(signal) }]);
      return signal;
    });
  }
  private health() {
    const inv = inventory(this.root, this.config), { pages, unreadable } = this.library();
    const current = new Map(inv.sources.map(s => [s.id, s]));
    // A decision cites the code it was about, not the code it documents. Counting it as coverage
    // would let a wiki with no knowledge in it report every source as documented.
    const covered = new Set(pages.filter(p => !['query', 'decision'].includes(p.meta.type))
      .flatMap(p => p.meta.sources.filter(s => sameDigest(s.hash, current.get(s.id)?.hash)).map(s => s.id)));
    // Naming the remedy, not only the symptom: a source that is gone reads as a dead end, and the
    // way out - republish the page without it, or repoint it if the file was renamed - is not
    // something an agent finds on its own. Nothing else in the tool ever says it.
    const drift = pages.flatMap(p => p.meta.sources.filter(s => s.hash && !sameDigest(s.hash, current.get(s.id)?.hash))
      .map(s => ({ page: p.path, source: s.id, reason: current.has(s.id) ? 'changed' : 'missing',
        remedy: current.has(s.id) ? 'Re-plan with ingest and republish the page against the current content'
          : `${s.id} no longer exists: republish ${p.path} without that source, or repoint it at the path the file was renamed to` })));
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
      unexplained: reachable ? this.unexplained(checkpoint.lastIndexedCommit, events) : [],
      graph: graph(pages) };
  }
  // Source that moved since the sealed checkpoint and that no decision event claims as its evidence:
  // the change happened and nobody recorded why. It stays silent until a checkpoint exists, because
  // capture is for work done with the wiki in place — code that predates it cannot be explained now.
  private unexplained(checkpoint: string | null, events: Event[]): string[] {
    if (!checkpoint) return [];
    const explained = new Set(events.filter(e => e.kind === 'decision' ||
      (e.kind === 'close' && e.closure === 'none_declared')).flatMap(e => e.evidence));
    return changed(this.root, this.config, checkpoint).filter(id => !explained.has(id));
  }
  // A squash-merge, a deleted branch or a fresh clone can leave the sealed commit unreachable. The
  // comparison then cannot run at all, and answering "nothing unexplained" would be a green light
  // meaning the opposite: the signal is gone, not clean.
  private reachable(checkpoint: string | null): boolean {
    if (!checkpoint) return true;
    try { revision(this.root, checkpoint); return true; } catch { return false; }
  }
  async ingest(ref = 'HEAD') {
    return this.store.locked(() => {
      const inv = inventory(this.root, this.config, ref), existing = this.pages();
      const documented = new Set(existing.filter(p => !['query', 'decision'].includes(p.meta.type))
        .flatMap(p => p.meta.sources.filter(s => inv.sources.some(c => c.id === s.id && sameDigest(c.hash, s.hash))).map(s => s.id)));
      const pending = inv.sources.filter(s => !documented.has(s.id));
      const sources = budgeted(pending, this.config.limits);
      const sourceIds = new Set(sources.map(s => s.id));
      const direct = new Set(existing.filter(p => p.meta.sources.some(s => sourceIds.has(s.id))).map(p => p.path));
      for (const edge of graph(existing).edges) if (edge.type === 'depends_on' && direct.has(edge.to)) direct.add(edge.from);
      const dirty = uncommitted(this.root, this.config);
      return { complete: pending.length === 0, remaining: pending.length - sources.length,
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
  async publishPatch(input: unknown, ref = 'HEAD') {
    const output = patchSchema.parse(input);
    return this.store.locked(() => {
      const inv = inventory(this.root, this.config, ref), { pages: existing, unreadable } = this.library();
      const base = new Map(existing.map(p => [p.path, p.raw]));
      // A page a human is midway through writing must never be overwritten. A page full of conflict
      // markers is not that: git wrote them, nobody wants them kept, and refusing to publish over it
      // leaves the one repair the agent could make to a human editing YAML by hand.
      const broken = new Map(unreadable.filter(p => p.code !== 'conflict-markers').map(p => [p.path, p.reason]));
      // The patch's revision is recorded, not enforced: what matters is that every source it cites
      // still has the content it was written against, and each source carries its own hash for that.
      if (output.revision && output.revision !== inv.revision && output.pages.every(p => !p.meta.sources.length))
        throw new Error(`Source revision changed after planning: patch declares ${output.revision}, sources are at ${inv.revision}; plan again`);
      const allowed = new Map(inv.sources.map(s => [s.id, s]));
      const updated = output.pages.map(p => {
        this.pagePath(p.path);
        if (p.meta.type === 'query') throw new Error('Publish cannot replace captured history');
        if (broken.has(p.path)) throw new Error(`Cannot publish over an unreadable page: ${p.path} (${broken.get(p.path)})`);
        const onDisk = read(this.store.path(this.pagePath(p.path)));
        if (onDisk !== (base.get(p.path) ?? null) && !unreadable.some(u => u.path === p.path && u.code === 'conflict-markers'))
          throw new Error(`Concurrent edit: ${p.path}`);
        const old = existing.find(e => e.path === p.path);
        if (old && old.meta.wikipoke.uid !== p.meta.wikipoke.uid) throw new Error('Cannot replace page identity');
        for (const source of p.meta.sources) {
          const known = allowed.get(source.id);
          // Naming the field that failed, not just the source: a patch built from a stale plan has a
          // matching hash and a stale revision, and "unverified" alone sends an agent hunting a bug
          // in the inventory instead of re-planning.
          if (!known) throw new Error(`Unverified source: ${source.id} is outside the configured scope at this revision`);
          if (source.resource !== undefined && source.resource !== known.resource)
            throw new Error(`Unverified source: ${source.id} declares resource ${source.resource}, sources have ${known.resource}; re-plan with ingest`);
          // Only the hash is checked. It already proves the content the page was written against,
          // while the revision is the commit that content happened to sit in - so requiring it to
          // match threw away a whole batch of an agent's work every time anyone committed anything
          // during the turn, including a typo in a README the plan never touched.
          if (!sameDigest(source.hash, known.hash))
            throw new Error(`Unverified source: ${source.id} declares hash ${source.hash ?? 'nothing'}, sources have ${known.hash}; re-plan with ingest`);
        }
        // An agent fills in fields it knows the schema has, even ones the plan stopped offering. The
        // frontmatter is normalized here so the file on disk never repeats a path twice.
        const meta = { ...p.meta, sources: p.meta.sources.map(source =>
          source.resource === source.id ? (({ resource, ...rest }) => rest)(source) : source) };
        return { ...p, meta, raw: render(meta, p.body) };
      });
      if (!updated.length) throw new Error('Patch contains no pages');
      this.publish(updated);
      return { published: updated.map(p => p.path), findings: output.findings };
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
        const wanted = normalize(question), current = inventory(this.root, this.config, ref);
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
      const inv = inventory(this.root, this.config, ref), everything = this.pages();
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
        const inv = inventory(this.root, this.config, query.ref as string);
        const library = this.pages();
        // A citation is a source id or the path of a page, which is what the query skill has always
        // promised and what the code used to reject. Both are evidence; they are not the same edge.
        // Source ids pin provenance in `sources`; a cited page becomes an `asks_about` relation, so
        // an answered question is finally connected to the knowledge it was answered from.
        const cited = answer.citations.map(id => {
          const source = inv.sources.find(s => s.id === id);
          if (source) { const { content, ...evidence } = source; return { source: evidence }; }
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
  // What an agent actually touched, as observed by a harness hook rather than declared afterwards.
  // The journal is append-only and unfiltered on write, because a hook that parses the config on
  // every edit is a hook nobody keeps installed; scope is resolved here, on read. It records the
  // file and never a reason: a hook cannot see one, and inventing it is the failure this avoids.
  note(input: unknown): Touch {
    const touch = touchSchema.parse(input);
    const path = this.store.path(`.wikipoke/journal/${sessionFile(touch.session)}.jsonl`);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(touch) + '\n');
    return touch;
  }
  journal(session?: string): Touch[] {
    const directory = this.store.path('.wikipoke/journal');
    const wanted = session ? [`${directory}/${sessionFile(session)}.jsonl`]
      : files(directory).filter(f => f.endsWith('.jsonl'));
    return wanted.flatMap(file => (read(file) ?? '').split('\n').filter(Boolean).flatMap(line => {
      try { return [touchSchema.parse(JSON.parse(line))]; } catch { return []; }
    })).filter(touch => !ignored(touch.file, this.config))
      .sort((a, b) => a.at.localeCompare(b.at));
  }
  // The debt a turn is about to leave behind: source this session touched that no decision claims.
  // Unlike the checkpoint-based signal, it needs no commit and no seal, so it can be answered while
  // the agent is still in the turn that made the change — which is the only moment the why exists.
  // Deliberately outside the writer lock. This is asked while the agent is mid-turn - by a stop hook,
  // or by a plugin composing a system prompt - and taking the lock there would block the very agent
  // whose work is being described. Both inputs are append-only files, so the worst a concurrent
  // write can cost is one line that the next call will see.
  async touched(session?: string) {
    const entries = this.journal(session), events = this.events();
    const decided = new Set(events.filter(e => e.kind === 'decision').flatMap(e => e.evidence));
    // Saying "this code changed and nobody stated a reason" is an answer, and the product's whole
    // position is that it is a better answer than an invented one. So a close that declares none
    // settles its files too - otherwise the only way past a blocked stop is to make a decision up,
    // which is the exact fiction the block exists to prevent.
    const undeclared = new Set(events.filter(e => e.kind === 'close' && e.closure === 'none_declared')
      .flatMap(e => e.evidence).filter(file => !decided.has(file)));
    const files = [...new Set(entries.map(e => e.file))].sort();
    return { session: session ?? null, mode: this.config.capture, entries: entries.length, files,
      unexplained: files.filter(file => !decided.has(file) && !undeclared.has(file)),
      undeclared: files.filter(file => undeclared.has(file)),
      since: entries[0]?.at ?? null, until: entries[entries.length - 1]?.at ?? null };
  }
  events(): Event[] {
    return files(this.store.path('.wikipoke/events')).filter(f => f.endsWith('.json'))
      .map(f => eventSchema.parse(JSON.parse(read(f)!))).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
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
      const inv = inventory(this.root, this.config);
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
          : cited.map(file => { const { content, ...source } = known.get(file)!; return source; });
        const meta = existing ? { ...existing.meta, title: name, description: name } : metadata('decision', name, uid);
        meta.sources = pinned;
        // Relations on a decision page are Wikipoke's to write, and Wikipoke no longer writes any:
        // what connects these pages now lives in the body, so a leftover from an older release goes.
        meta.wikipoke.relations = [];
        meta.wikipoke.decision = { actor: e.actor, eventId: e.id, at: e.at };
        // What this choice touches, written as links in the body rather than as typed relations: the
        // pages documenting the same code, and the other choices recorded under the same task. A
        // reader following the wiki finds them; so does the graph, which reads the body too.
        const evidence = new Set(pinned.map(source => source.id));
        const about = published.filter(page => !['decision', 'query'].includes(page.meta.type) &&
          page.meta.sources.some(source => evidence.has(source.id))).map(page => page.path);
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
  async snapshot(label: string, ref = 'HEAD') {
    return this.store.locked(() => {
      const code = revision(this.root, ref), wiki = revision(this.root);
      const dirty = git(this.root, 'status', '--porcelain', '--', this.config.wiki);
      if (dirty.trim()) throw new Error('Commit wiki changes before a snapshot');
      const tree = git(this.root, 'ls-tree', '-r', '--name-only', wiki, '--', this.config.wiki);
      if (!tree.trim()) throw new Error('Snapshot requires committed wiki content');
      const name = hash(label), dest = `.wikipoke/releases/${name}.json`;
      if (read(this.store.path(dest))) throw new Error('Release label already captured');
      git(this.root, 'update-ref', `refs/wikipoke/${name}/code`, code);
      git(this.root, 'update-ref', `refs/wikipoke/${name}/wiki`, wiki);
      const manifest = { label, code, wiki, at: stamp(), health: this.health() };
      this.store.commit([{ path: dest, before: null, after: json(manifest) }]);
      return manifest;
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
