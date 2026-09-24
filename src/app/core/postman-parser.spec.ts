import { flattenRequests, parseFile, splitUrl } from './postman-parser';
import { SAMPLE_COLLECTION, SAMPLE_ENVIRONMENT } from './sample';

describe('postman parser', () => {
  it('parses the sample collection', () => {
    const r = parseFile(JSON.stringify(SAMPLE_COLLECTION), 'c.json');
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('collection');
    const reqs = flattenRequests(r.project!.items);
    expect(reqs.length).toBe(6);
    const list = reqs.find((x) => x.name === 'List posts')!;
    expect(list.url).toBe('{{baseUrl}}/posts');
    expect(list.query.map((q) => [q.key, q.enabled])).toEqual([
      ['userId', true],
      ['_limit', false],
    ]);
    expect(list.examples[0].language).toBe('json');
    const byId = reqs.find((x) => x.name === 'Get post by id')!;
    expect(byId.pathVars).toEqual([{ key: 'id', value: '1', enabled: true, description: 'The post id.' }]);
    expect(reqs.find((x) => x.name === 'List users')!.auth).toEqual({ type: 'bearer', token: '{{token}}' });
  });

  it('parses environments and marks secrets', () => {
    const r = parseFile(JSON.stringify(SAMPLE_ENVIRONMENT), 'e.json');
    expect(r.kind).toBe('environment');
    expect(r.environment!.values[1].type).toBe('secret');
  });

  it('inherits auth from folders and handles string requests', () => {
    const r = parseFile(
      JSON.stringify({
        info: { name: 'x', schema: 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json' },
        auth: { type: 'apikey', apikey: { key: 'k', value: 'v', in: 'query' } },
        item: [{ name: 'a', request: 'https://a.com/x?y=1' }],
      }),
      'x.json',
    );
    const req = flattenRequests(r.project!.items)[0];
    expect(req.method).toBe('GET');
    expect(req.url).toBe('https://a.com/x');
    expect(req.auth).toEqual({ type: 'apikey', key: 'k', value: 'v', in: 'query' });
  });

  it('rejects invalid files', () => {
    expect(parseFile('{', 'a.json').ok).toBe(false);
    expect(parseFile('{"a":1}', 'a.json').kind).toBe('unknown');
    expect(parseFile(JSON.stringify({ info: { name: 'x' }, item: [] }), 'a.json').errors).toContain(
      'The collection has no requests.',
    );
  });

  it('splits urls keeping variables', () => {
    expect(splitUrl('{{h}}/a?b={{c}}&d')).toEqual({
      base: '{{h}}/a',
      query: [
        { key: 'b', value: '{{c}}', enabled: true },
        { key: 'd', value: '', enabled: true },
      ],
    });
  });
});
