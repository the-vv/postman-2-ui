import { PublishConfig } from './models';

export const HTML_MIME = 'text/html';

/** Base64 of a UTF-8 string, in chunks so large files do not overflow the call stack. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Text safe inside a JSON string literal. */
function jsonText(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

/** Fills the base64 body template. Throws when the result is not valid JSON. */
export function fillTemplate(template: string, html: string, fileName: string): string {
  const b64 = toBase64(html);
  const values: Record<string, string> = {
    file: b64,
    fileDataUrl: `data:${HTML_MIME};base64,${b64}`,
    fileName: jsonText(fileName),
    fileSize: String(new TextEncoder().encode(html).length),
    mimeType: HTML_MIME,
  };
  const body = template.replace(/\{\{\s*(file|fileDataUrl|fileName|fileSize|mimeType)\s*\}\}/g, (_, k) => values[k]);
  JSON.parse(body);
  return body;
}

/** Builds the fetch call for "Send to API". */
export function buildPublishRequest(c: PublishConfig, html: string, fileName: string): { url: string; init: RequestInit } {
  const url = c.url.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('Enter a URL that starts with http:// or https://');
  const headers = new Headers();
  for (const h of c.headers) if (h.enabled && h.key.trim()) headers.set(h.key.trim(), h.value);

  let body: BodyInit;
  if (c.mode === 'formdata') {
    const fd = new FormData();
    for (const f of c.fields) if (f.enabled && f.key.trim()) fd.append(f.key.trim(), f.value);
    fd.append(c.fieldName.trim() || 'file', new Blob([html], { type: `${HTML_MIME};charset=utf-8` }), fileName);
    body = fd;
    // The browser must set multipart/form-data with its boundary.
    headers.delete('content-type');
  } else {
    try {
      body = fillTemplate(c.bodyTemplate, html, fileName);
    } catch {
      throw new Error('The JSON body is not valid JSON. Check quotes and commas around the placeholders.');
    }
    if (!headers.has('content-type')) headers.set('Content-Type', 'application/json');
  }
  return { url, init: { method: c.method, headers, body } };
}

export interface PublishResult {
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
  error?: string;
}

export async function publishHtml(c: PublishConfig, html: string, fileName: string): Promise<PublishResult> {
  let req: { url: string; init: RequestInit };
  try {
    req = buildPublishRequest(c, html, fileName);
  } catch (e) {
    return { ok: false, status: 0, statusText: '', body: '', error: (e as Error).message };
  }
  try {
    const res = await fetch(req.url, req.init);
    const text = await res.text();
    return { ok: res.ok, status: res.status, statusText: res.statusText, body: text.slice(0, 5000) };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      statusText: '',
      body: '',
      error: `Could not reach the API (${(e as Error).message}). It may block browser requests (CORS), or the URL is wrong.`,
    };
  }
}
