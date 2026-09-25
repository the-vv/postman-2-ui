import { applyMerge, planMerge } from './merge';
import { ApiRequest } from './models';
import { buildHtml } from './export-html';
import { flattenRequests, parseFile } from './postman-parser';

const coll = (items: unknown[], variable: unknown[] = []) =>
  parseFile(
    JSON.stringify({
      info: { name: 'T', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: items,
      variable,
    }),
    't.json',
  ).project!;

const req = (name: string, method: string, url: string, extra: object = {}) => ({
  name,
  request: { method, url, ...extra },
});

describe('merge', () => {
  const v1 = () => {
    const p = coll([
      { name: 'Users', item: [req('List users', 'GET', '{{b}}/users'), req('Old one', 'GET', '{{b}}/old')] },
      req('Health', 'GET', '{{b}}/health'),
    ]);
    const list = flattenRequests(p.items)[0];
    list.docs = 'My docs';
    list.examples.push({ id: 'e', name: 'Mine', code: 200, status: 'OK', headers: [], body: '{}', language: 'json', source: 'captured' });
    return p;
  };
  const v2 = () =>
    coll(
      [
        {
          name: 'Users',
          item: [
            req('List users', 'GET', '{{b}}/users', { header: [{ key: 'X-New', value: '{{t}}' }] }),
            req('Create user', 'POST', '{{b}}/users'),
          ],
        },
        req('Health check', 'GET', '{{b}}/health'),
      ],
      [{ key: 'b', value: 'x' }],
    );

  it('finds new, changed, renamed and removed APIs', () => {
    const plan = planMerge(v1(), v2());
    expect(plan.added.map((a) => a.req.name)).toEqual(['Create user']);
    expect(plan.changed.map((c) => [c.old.req.name, c.fields])).toEqual([
      ['List users', ['headers']],
      ['Health', ['name']],
    ]);
    expect(plan.removed.map((r) => r.req.name)).toEqual(['Old one']);
    expect(plan.newVars.map((v) => v.key)).toEqual(['b']);
  });

  it('keeps docs and examples while applying updates', () => {
    const cur = v1();
    const inc = v2();
    const plan = planMerge(cur, inc);
    const out = applyMerge(cur, inc, plan, {
      add: new Set(plan.added.map((a) => a.req.id)),
      update: new Set(plan.changed.map((c) => c.next.req.id)),
      remove: new Set(),
      replaceDescriptions: false,
    });
    const reqs = flattenRequests(out.items);
    expect(reqs.map((r) => r.name)).toEqual(['List users', 'Create user', 'Old one', 'Health check']);
    const list = reqs[0] as ApiRequest;
    expect(list.docs).toBe('My docs');
    expect(list.examples.map((e) => e.name)).toEqual(['Mine']);
    expect(list.headers[0].key).toBe('X-New');
    // Renamed API keeps its old id so links still work.
    expect(reqs[3].id).toBe('health');
  });

  it('respects unchecked choices', () => {
    const cur = v1();
    const inc = v2();
    const plan = planMerge(cur, inc);
    const out = applyMerge(cur, inc, plan, {
      add: new Set(),
      update: new Set(),
      remove: new Set(plan.removed.map((r) => r.req.id)),
      replaceDescriptions: false,
    });
    const reqs = flattenRequests(out.items);
    expect(reqs.map((r) => r.name)).toEqual(['List users', 'Health']);
    expect(reqs[0].headers).toEqual([]);
  });

  it('reads back an exported html file without loss', () => {
    const p = v1();
    const first = flattenRequests(p.items)[1];
    first.hidden = true;
    p.theme.primary = '#7c3aed';
    const r = parseFile(buildHtml(p), 'api.html');
    expect(r.kind).toBe('console');
    expect(r.ok).toBe(true);
    expect(r.project!.items).toEqual(p.items);
    expect(r.project!.theme.primary).toBe('#7c3aed');
    expect(parseFile('<html><body>hi</body></html>', 'x.html').ok).toBe(false);
  });
});
