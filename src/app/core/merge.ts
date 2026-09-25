import { ApiRequest, Example, Folder, KV, Project, TreeNode } from './models';

/** A request with the folder names above it. */
export interface Located {
  req: ApiRequest;
  path: string[];
  parentId: string | null;
}

export interface ChangedApi {
  old: Located;
  next: Located;
  /** Which parts differ, e.g. ["url", "headers"]. */
  fields: string[];
}

export interface MergePlan {
  added: Located[];
  changed: ChangedApi[];
  removed: Located[];
  unchanged: number;
  /** Collection variables that are new (by key). */
  newVars: KV[];
  /** Old request id → matched incoming request id. */
  matches: Map<string, string>;
}

export interface MergeChoices {
  /** Incoming ids of new APIs to add. */
  add: Set<string>;
  /** Incoming ids of changed APIs to update. */
  update: Set<string>;
  /** Old ids of APIs to remove because the collection no longer has them. */
  remove: Set<string>;
  /** Replace descriptions of updated APIs with the collection's text. */
  replaceDescriptions: boolean;
}

function locate(items: TreeNode[], path: string[] = [], parentId: string | null = null, out: Located[] = []) {
  for (const n of items) {
    if (n.kind === 'folder') locate(n.children, [...path, n.name], n.id, out);
    else out.push({ req: n, path, parentId });
  }
  return out;
}

function stripDesc(list: KV[]) {
  return list.map((k) => ({ key: k.key, value: k.value, enabled: k.enabled, type: k.type }));
}

const COMPARED: [string, (r: ApiRequest) => unknown][] = [
  ['name', (r) => r.name],
  ['method', (r) => r.method],
  ['url', (r) => r.url],
  ['query params', (r) => stripDesc(r.query)],
  ['path variables', (r) => stripDesc(r.pathVars)],
  ['headers', (r) => stripDesc(r.headers)],
  ['body', (r) => r.body],
  ['auth', (r) => r.auth],
];

export function diffFields(a: ApiRequest, b: ApiRequest): string[] {
  return COMPARED.filter(([, get]) => JSON.stringify(get(a)) !== JSON.stringify(get(b))).map(([n]) => n);
}

function key(r: ApiRequest) {
  return `${r.method} ${r.url.trim().replace(/\/+$/, '')}`;
}

/** Compares the current project with a newly imported collection. */
export function planMerge(current: Project, incoming: Project): MergePlan {
  const olds = locate(current.items);
  const news = locate(incoming.items);
  const byId = new Map(olds.map((o) => [o.req.id, o]));
  const byKey = new Map<string, Located[]>();
  for (const o of olds) byKey.set(key(o.req), [...(byKey.get(key(o.req)) ?? []), o]);
  const used = new Set<string>();
  const matches = new Map<string, string>();
  const plan: MergePlan = { added: [], changed: [], removed: [], unchanged: 0, newVars: [], matches };

  // Pass 1: same folder path + name (same id). Pass 2: same method + URL (renamed or moved).
  const pending: Located[] = [];
  for (const n of news) {
    const o = byId.get(n.req.id);
    if (o && !used.has(o.req.id)) {
      used.add(o.req.id);
      matches.set(o.req.id, n.req.id);
    } else pending.push(n);
  }
  for (const n of pending) {
    const o = (byKey.get(key(n.req)) ?? []).find((x) => !used.has(x.req.id));
    if (o) {
      used.add(o.req.id);
      matches.set(o.req.id, n.req.id);
    } else plan.added.push(n);
  }

  const newById = new Map(news.map((n) => [n.req.id, n]));
  for (const o of olds) {
    const nid = matches.get(o.req.id);
    if (!nid) {
      plan.removed.push(o);
      continue;
    }
    const n = newById.get(nid)!;
    const fields = diffFields(o.req, n.req);
    if (o.req.description.trim() !== n.req.description.trim() && n.req.description.trim()) fields.push('description');
    if (fields.length) plan.changed.push({ old: o, next: n, fields });
    else plan.unchanged++;
  }

  const keys = new Set(current.collectionVars.map((v) => v.key));
  plan.newVars = incoming.collectionVars.filter((v) => !keys.has(v.key));
  return plan;
}

function mergeExamples(old: Example[], incoming: Example[]): Example[] {
  const seen = new Set(old.map((e) => `${e.name}|${e.code}`));
  return [...old, ...incoming.filter((e) => !seen.has(`${e.name}|${e.code}`))];
}

/**
 * Builds the updated project. The folder layout follows the new collection. Docs,
 * examples, hidden flags, environments, theme and settings from the current project are kept.
 */
export function applyMerge(current: Project, incoming: Project, plan: MergePlan, c: MergeChoices): Project {
  const oldReqs = new Map(locate(current.items).map((o) => [o.req.id, o]));
  const oldFolders = new Map<string, Folder>();
  (function walk(items: TreeNode[]) {
    for (const n of items) if (n.kind === 'folder') (oldFolders.set(n.id, n), walk(n.children));
  })(current.items);
  const oldIdFor = new Map([...plan.matches].map(([o, n]) => [n, o]));
  const changed = new Set(plan.changed.map((x) => x.next.req.id));

  // Removed APIs the user keeps, grouped by their old folder.
  const keep = plan.removed.filter((r) => !c.remove.has(r.req.id));
  const keepByParent = new Map<string | null, ApiRequest[]>();
  for (const k of keep) keepByParent.set(k.parentId, [...(keepByParent.get(k.parentId) ?? []), k.req]);

  const usedIds = new Set<string>();
  const placedFolders = new Set<string>();
  const uniq = (id: string) => {
    let out = id;
    let i = 2;
    while (usedIds.has(out)) out = `${id}-${i++}`;
    usedIds.add(out);
    return out;
  };
  // Reserve ids of kept APIs first so deep links to them never change.
  for (const id of plan.matches.keys()) usedIds.add(id);
  for (const k of keep) usedIds.add(k.req.id);

  const build = (items: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const n of items) {
      if (n.kind === 'folder') {
        const old = oldFolders.get(n.id);
        placedFolders.add(n.id);
        const children = [...build(n.children), ...(keepByParent.get(n.id) ?? [])];
        if (!children.length) continue;
        out.push({ ...n, description: old?.description || n.description, children });
        continue;
      }
      const oldId = oldIdFor.get(n.id);
      if (!oldId) {
        if (c.add.has(n.id)) out.push({ ...n, id: usedIds.has(n.id) ? uniq(n.id) : (usedIds.add(n.id), n.id) });
        continue;
      }
      const old = oldReqs.get(oldId)!.req;
      const useNew = changed.has(n.id) && c.update.has(n.id);
      const base = useNew ? n : old;
      out.push({
        ...base,
        id: old.id,
        description: useNew && c.replaceDescriptions && n.description.trim() ? n.description : old.description,
        docs: old.docs,
        hidden: old.hidden,
        examples: mergeExamples(old.examples, n.examples),
      });
    }
    return out;
  };

  const items = build(incoming.items);
  // Kept APIs whose folder is gone from the collection go to the end.
  for (const [parent, reqs] of keepByParent) {
    if (parent === null) items.push(...reqs);
    else if (!placedFolders.has(parent)) {
      const f = oldFolders.get(parent)!;
      items.push({ ...f, children: reqs });
    }
  }

  return {
    ...current,
    description: current.description || incoming.description,
    items,
    collectionVars: [...current.collectionVars, ...plan.newVars],
    warnings: [...new Set([...current.warnings, ...incoming.warnings])],
  };
}
