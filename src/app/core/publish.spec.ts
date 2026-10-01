import { DEFAULT_PUBLISH } from './models';
import { buildPublishRequest, fillTemplate, toBase64 } from './publish';
import { normalizeFileName } from './export-html';

describe('publish', () => {
  const html = '<!doctype html><p>héllo ✓</p>';

  it('encodes UTF-8 as base64', () => {
    expect(new TextDecoder().decode(Uint8Array.from(atob(toBase64(html)), (c) => c.charCodeAt(0)))).toBe(html);
  });

  it('fills the JSON template and escapes the file name', () => {
    const body = JSON.parse(fillTemplate(DEFAULT_PUBLISH.bodyTemplate, html, 'my "api".html'));
    expect(body.fileName).toBe('my "api".html');
    expect(body.mimeType).toBe('text/html');
    expect(body.content).toBe(toBase64(html));
    expect(() => fillTemplate('{"a": {{file}}}', html, 'x.html')).toThrow();
  });

  it('builds a multipart request with extra fields', () => {
    const { url, init } = buildPublishRequest(
      {
        ...DEFAULT_PUBLISH,
        url: 'https://x.test/upload',
        fieldName: 'doc',
        fields: [{ key: 'folder', value: 'docs', enabled: true }, { key: 'off', value: '1', enabled: false }],
        headers: [
          { key: 'Authorization', value: 'Bearer t', enabled: true },
          { key: 'Content-Type', value: 'text/plain', enabled: true },
        ],
      },
      html,
      'a.html',
    );
    expect(url).toBe('https://x.test/upload');
    const fd = init.body as FormData;
    expect(fd.get('folder')).toBe('docs');
    expect(fd.get('off')).toBeNull();
    expect((fd.get('doc') as File).name).toBe('a.html');
    const h = init.headers as Headers;
    expect(h.get('authorization')).toBe('Bearer t');
    expect(h.has('content-type')).toBe(false);
  });

  it('builds a JSON request and rejects bad URLs', () => {
    const { init } = buildPublishRequest({ ...DEFAULT_PUBLISH, url: 'http://x.test', mode: 'base64', method: 'PUT' }, html, 'a.html');
    expect(init.method).toBe('PUT');
    expect((init.headers as Headers).get('content-type')).toBe('application/json');
    expect(() => buildPublishRequest({ ...DEFAULT_PUBLISH, url: 'x.test' }, html, 'a.html')).toThrow();
  });

  it('normalizes custom file names', () => {
    expect(normalizeFileName('My API docs')).toBe('My API docs.html');
    expect(normalizeFileName('a/b:c.HTML')).toBe('a-b-c.HTML');
    expect(normalizeFileName('  ')).toBe('');
  });
});
