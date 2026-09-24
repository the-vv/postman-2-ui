import { Component, computed, inject, input } from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { ApiRequest, Example, KV } from '../core/models';
import { uid } from '../core/postman-parser';

@Component({
  selector: 'app-request-editor',
  templateUrl: './request-editor.html',
})
export class RequestEditor {
  private store = inject(ProjectStore);
  readonly req = input.required<ApiRequest>();

  readonly fullUrl = computed(() => {
    const r = this.req();
    const q = r.query.filter((x) => x.enabled);
    return r.url + (q.length ? '?' + q.map((x) => (x.value !== '' ? `${x.key}=${x.value}` : x.key)).join('&') : '');
  });

  patch(p: Partial<ApiRequest>) {
    this.store.patchNode(this.req().id, p);
  }

  addExample() {
    const ex: Example = {
      id: uid('ex'),
      name: 'New example',
      code: 200,
      status: 'OK',
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
      body: '{\n  \n}',
      language: 'json',
      source: 'manual',
    };
    this.patch({ examples: [...this.req().examples, ex] });
  }

  updateExample(id: string, p: Partial<Example>) {
    this.patch({ examples: this.req().examples.map((e) => (e.id === id ? { ...e, ...p } : e)) });
  }

  removeExample(id: string) {
    this.patch({ examples: this.req().examples.filter((e) => e.id !== id) });
  }

  moveExample(i: number, dir: -1 | 1) {
    const list = [...this.req().examples];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.patch({ examples: list });
  }

  formatJson(ex: Example) {
    try {
      this.updateExample(ex.id, { body: JSON.stringify(JSON.parse(ex.body), null, 2) });
    } catch {
      /* not JSON, leave as is */
    }
  }

  headersText(h: KV[]): string {
    return h.map((x) => `${x.key}: ${x.value}`).join('\n');
  }

  parseHeaders(text: string): KV[] {
    return text
      .split('\n')
      .filter((l) => l.includes(':'))
      .map((l) => {
        const i = l.indexOf(':');
        return { key: l.slice(0, i).trim(), value: l.slice(i + 1).trim(), enabled: true };
      });
  }

  sourceLabel(s: Example['source']) {
    return { collection: 'from collection', captured: 'saved response', manual: 'manual' }[s];
  }
}
