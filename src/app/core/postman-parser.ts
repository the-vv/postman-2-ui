import {
  ApiRequest,
  Auth,
  DEFAULT_OPTIONS,
  DEFAULT_THEME,
  Environment,
  Example,
  Folder,
  KV,
  Project,
  RequestBody,
  TreeNode,
} from './models';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export type FileKind = 'collection' | 'environment' | 'unknown';

export interface ImportResult {
  fileName: string;
  kind: FileKind;
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Human readable summary, e.g. "12 requests in 3 folders". */
  summary: string;
  project?: Project;
  environment?: Environment;
}

let idCounter = 0;
export function uid(prefix = 'id'): string {
  idCounter++;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function str(v: Json): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

function description(d: Json): string {
  if (!d) return '';
  if (typeof d === 'string') return d;
  if (typeof d === 'object' && 'content' in d) return str(d.content);
  return '';
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item'
  );
}

function kvList(list: Json, extra?: (item: Json, kv: KV) => void): KV[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((i) => i && typeof i === 'object' && i.key !== undefined)
    .map((i) => {
      const kv: KV = { key: str(i.key), value: str(i.value), enabled: !i.disabled };
      const desc = description(i.description);
      if (desc) kv.description = desc;
      extra?.(i, kv);
      return kv;
    });
}

function parseHeaderString(s: string): KV[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.includes(':'))
    .map((l) => {
      const i = l.indexOf(':');
      return { key: l.slice(0, i).trim(), value: l.slice(i + 1).trim(), enabled: true };
    });
}

function headers(h: Json): KV[] {
  if (typeof h === 'string') return parseHeaderString(h);
  return kvList(h);
}

/** Splits a raw URL into base + query params. Keeps {{vars}} untouched. */
export function splitUrl(raw: string): { base: string; query: KV[] } {
  const hashless = raw.split('#')[0];
  const qi = hashless.indexOf('?');
  if (qi < 0) return { base: hashless, query: [] };
  const query = hashless
    .slice(qi + 1)
    .split('&')
    .filter((p) => p.length)
    .map((p) => {
      const ei = p.indexOf('=');
      return ei < 0
        ? { key: p, value: '', enabled: true }
        : { key: p.slice(0, ei), value: p.slice(ei + 1), enabled: true };
    });
  return { base: hashless.slice(0, qi), query };
}

function parseUrl(u: Json): { url: string; query: KV[]; pathVars: KV[] } {
  if (!u) return { url: '', query: [], pathVars: [] };
  if (typeof u === 'string') {
    const { base, query } = splitUrl(u);
    return { url: base, query, pathVars: pathVarsFromUrl(base, []) };
  }
  let base: string;
  if (typeof u.raw === 'string' && u.raw) {
    base = splitUrl(u.raw).base;
  } else {
    const host = Array.isArray(u.host) ? u.host.join('.') : str(u.host);
    const path = Array.isArray(u.path) ? u.path.map(str).join('/') : str(u.path);
    const protocol = u.protocol ? `${u.protocol}://` : '';
    const port = u.port ? `:${u.port}` : '';
    base = `${protocol}${host}${port}${path ? '/' + path.replace(/^\//, '') : ''}`;
  }
  // Prefer the structured query list: it also carries disabled params and descriptions.
  const query = Array.isArray(u.query)
    ? kvList(u.query)
    : typeof u.raw === 'string'
      ? splitUrl(u.raw).query
      : [];
  return { url: base, query, pathVars: pathVarsFromUrl(base, kvList(u.variable)) };
}

function pathVarsFromUrl(base: string, known: KV[]): KV[] {
  const withoutProto = base.replace(/^[a-z]+:\/\//i, '');
  const names = Array.from(withoutProto.matchAll(/\/:([A-Za-z0-9_\-]+)/g)).map((m) => m[1]);
  const out: KV[] = [];
  for (const n of names) {
    if (out.some((o) => o.key === n)) continue;
    const k = known.find((x) => x.key === n);
    out.push(k ? { ...k, enabled: true } : { key: n, value: '', enabled: true });
  }
  return out;
}

function authParam(list: Json, key: string): string {
  if (Array.isArray(list)) {
    const f = list.find((x) => x && x.key === key);
    return f ? str(f.value) : '';
  }
  if (list && typeof list === 'object') return str(list[key]);
  return '';
}

function parseAuth(a: Json, warnings: Set<string>): Auth | null {
  if (!a || typeof a !== 'object' || !a.type) return null;
  switch (a.type) {
    case 'noauth':
      return { type: 'none' };
    case 'bearer':
      return { type: 'bearer', token: authParam(a.bearer, 'token') };
    case 'basic':
      return {
        type: 'basic',
        username: authParam(a.basic, 'username'),
        password: authParam(a.basic, 'password'),
      };
    case 'apikey':
      return {
        type: 'apikey',
        key: authParam(a.apikey, 'key') || 'x-api-key',
        value: authParam(a.apikey, 'value'),
        in: authParam(a.apikey, 'in') === 'query' ? 'query' : 'header',
      };
    case 'oauth2': {
      const token = authParam(a.oauth2, 'accessToken');
      if (token) return { type: 'bearer', token };
      warnings.add('OAuth 2.0 auth without a saved access token was converted to a Bearer token field.');
      return { type: 'bearer', token: '{{accessToken}}' };
    }
    default:
      warnings.add(`Auth type "${a.type}" is not supported in the browser console and was skipped.`);
      return { type: 'unsupported', note: `"${a.type}" auth is not supported. Add the needed headers manually.` };
  }
}

function parseBody(b: Json, warnings: Set<string>): RequestBody {
  if (!b || typeof b !== 'object' || !b.mode || b.disabled) return { mode: 'none' };
  switch (b.mode) {
    case 'raw': {
      const language = str(b.options?.raw?.language) || guessLanguage(str(b.raw));
      return { mode: 'raw', raw: str(b.raw), language };
    }
    case 'urlencoded':
      return { mode: 'urlencoded', urlencoded: kvList(b.urlencoded) };
    case 'formdata':
      return {
        mode: 'formdata',
        formdata: kvList(b.formdata, (i, kv) => {
          kv.type = i.type === 'file' ? 'file' : 'text';
          if (kv.type === 'file') kv.value = '';
        }),
      };
    case 'graphql':
      return {
        mode: 'graphql',
        graphql: { query: str(b.graphql?.query), variables: str(b.graphql?.variables) },
      };
    case 'file':
      warnings.add('Binary file bodies are not supported and were removed.');
      return { mode: 'none' };
    default:
      return { mode: 'none' };
  }
}

function guessLanguage(body: string): string {
  const t = body.trim();
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  if (t.startsWith('<')) return /^<!doctype html|<html/i.test(t) ? 'html' : 'xml';
  return 'text';
}

function languageFromHeaders(h: KV[], fallback: string): string {
  const ct = h.find((x) => x.key.toLowerCase() === 'content-type')?.value.toLowerCase() || '';
  if (ct.includes('json')) return 'json';
  if (ct.includes('xml')) return 'xml';
  if (ct.includes('html')) return 'html';
  return fallback;
}

function parseExamples(responses: Json): Example[] {
  if (!Array.isArray(responses)) return [];
  return responses.map((r, i) => {
    const hs = headers(r.header);
    const body = str(r.body);
    const preview = str(r._postman_previewlanguage);
    return {
      id: uid('ex'),
      name: str(r.name) || `Example ${i + 1}`,
      code: Number(r.code) || 200,
      status: str(r.status),
      headers: hs,
      body,
      language: languageFromHeaders(hs, preview || guessLanguage(body)),
      source: 'collection' as const,
    };
  });
}

interface Ctx {
  warnings: Set<string>;
  ids: Set<string>;
  counts: { requests: number; folders: number; examples: number };
}

function uniqueId(base: string, ctx: Ctx): string {
  let id = slugify(base);
  let n = 2;
  while (ctx.ids.has(id)) id = `${slugify(base)}-${n++}`;
  ctx.ids.add(id);
  return id;
}

function parseItems(items: Json[], parentAuth: Auth, path: string[], ctx: Ctx): TreeNode[] {
  const out: TreeNode[] = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    if (Array.isArray(it.event) && it.event.some((e: Json) => e?.script?.exec?.length)) {
      ctx.warnings.add('Pre-request and test scripts are not run by the generated console.');
    }
    const name = str(it.name) || 'Untitled';
    if (Array.isArray(it.item)) {
      const auth = parseAuth(it.auth, ctx.warnings) ?? parentAuth;
      const folder: Folder = {
        kind: 'folder',
        id: uniqueId([...path, name].join(' '), ctx),
        name,
        description: description(it.description),
        children: parseItems(it.item, auth, [...path, name], ctx),
      };
      ctx.counts.folders++;
      out.push(folder);
    } else if (it.request !== undefined) {
      const r = typeof it.request === 'string' ? { url: it.request, method: 'GET' } : it.request;
      const { url, query, pathVars } = parseUrl(r.url);
      const examples = parseExamples(it.response);
      const req: ApiRequest = {
        kind: 'request',
        id: uniqueId([...path, name].join(' '), ctx),
        name,
        method: (str(r.method) || 'GET').toUpperCase(),
        url,
        query,
        pathVars,
        headers: headers(r.header),
        body: parseBody(r.body, ctx.warnings),
        auth: parseAuth(r.auth, ctx.warnings) ?? parentAuth,
        description: description(r.description) || description(it.description),
        docs: '',
        examples,
      };
      ctx.counts.requests++;
      ctx.counts.examples += examples.length;
      out.push(req);
    }
  }
  return out;
}

function detectKind(json: Json): FileKind {
  if (json && typeof json === 'object') {
    if (json.info && Array.isArray(json.item)) return 'collection';
    if (json.collection?.info && Array.isArray(json.collection?.item)) return 'collection';
    if (Array.isArray(json.values)) return 'environment';
  }
  return 'unknown';
}

export function parseCollection(json: Json, fileName: string): ImportResult {
  const res: ImportResult = { fileName, kind: 'collection', ok: false, errors: [], warnings: [], summary: '' };
  // Postman API exports wrap the collection in { collection: {...} }.
  const c = json.collection?.info ? json.collection : json;
  const schema = str(c.info?.schema);
  if (!c.info?.name) res.errors.push('Missing "info.name".');
  if (schema && !/collection\/v2\.[01]/.test(schema)) {
    if (/v1/.test(schema)) res.errors.push('Collection format v1 is not supported. Re-export it from Postman as v2.1.');
    else res.warnings.push(`Unknown schema "${schema}". Trying to read it as v2.1.`);
  } else if (!schema) {
    res.warnings.push('No schema found in "info.schema". Trying to read it as v2.1.');
  }
  if (res.errors.length) return res;

  const ctx: Ctx = { warnings: new Set(), ids: new Set(), counts: { requests: 0, folders: 0, examples: 0 } };
  const rootAuth = parseAuth(c.auth, ctx.warnings) ?? { type: 'none' };
  const items = parseItems(c.item, rootAuth, [], ctx);
  if (Array.isArray(c.event) && c.event.some((e: Json) => e?.script?.exec?.length)) {
    ctx.warnings.add('Pre-request and test scripts are not run by the generated console.');
  }
  if (!ctx.counts.requests) res.errors.push('The collection has no requests.');
  res.warnings.push(...ctx.warnings);
  if (res.errors.length) return res;

  res.ok = true;
  res.summary = `${ctx.counts.requests} requests, ${ctx.counts.folders} folders, ${ctx.counts.examples} examples, ${
    Array.isArray(c.variable) ? c.variable.length : 0
  } variables`;
  res.project = {
    version: 1,
    title: str(c.info.name),
    description: description(c.info.description),
    items,
    collectionVars: kvList(c.variable, (i, kv) => {
      if (i.type === 'secret') kv.type = 'secret';
    }),
    environments: [],
    activeEnvId: null,
    theme: { ...DEFAULT_THEME },
    options: { ...DEFAULT_OPTIONS },
    fileName,
    warnings: res.warnings,
  };
  return res;
}

export function parseEnvironment(json: Json, fileName: string): ImportResult {
  const res: ImportResult = { fileName, kind: 'environment', ok: false, errors: [], warnings: [], summary: '' };
  const values = kvList(json.values, (i, kv) => {
    if (i.type === 'secret') kv.type = 'secret';
  });
  const name = str(json.name) || fileName.replace(/\.(postman_environment\.)?json$/i, '');
  if (!values.length) res.warnings.push('Environment has no variables.');
  res.ok = true;
  res.summary = `"${name}" with ${values.length} variables`;
  res.environment = { id: uid('env'), name, values };
  return res;
}

export function parseFile(text: string, fileName: string): ImportResult {
  let json: Json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return {
      fileName,
      kind: 'unknown',
      ok: false,
      errors: [`Not valid JSON: ${(e as Error).message}`],
      warnings: [],
      summary: '',
    };
  }
  const kind = detectKind(json);
  if (kind === 'collection') return parseCollection(json, fileName);
  if (kind === 'environment') return parseEnvironment(json, fileName);
  return {
    fileName,
    kind,
    ok: false,
    errors: ['This is not a Postman collection (v2.x) or environment file.'],
    warnings: [],
    summary: '',
  };
}

/** Visits all requests in tree order. */
export function flattenRequests(items: TreeNode[], out: ApiRequest[] = []): ApiRequest[] {
  for (const n of items) {
    if (n.kind === 'request') out.push(n);
    else flattenRequests(n.children, out);
  }
  return out;
}
