import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { buildHtml, consoleData } from '../core/export-html';
import { Example } from '../core/models';
import { uid } from '../core/postman-parser';

/** Live preview: runs the real console runtime in an iframe and syncs edits into it. */
@Component({
  selector: 'app-preview',
  template: `<iframe #frame title="Console preview" class="preview-frame"></iframe>`,
})
export class Preview {
  private store = inject(ProjectStore);
  private frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');
  private ready = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Build the iframe once. Later changes are pushed with postMessage.
    effect(() => {
      const el = this.frame().nativeElement;
      untracked(() => {
        const p = this.store.project();
        if (p) el.srcdoc = buildHtml(p, true);
      });
    });

    effect(() => {
      const p = this.store.project();
      if (!p) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.send({ type: 'update', data: consoleData(p, true) }), 250);
    });

    effect(() => {
      const sel = this.store.selection();
      this.send({ type: 'select', id: sel.type === 'node' ? sel.id : null });
    });

    const onMessage = (e: MessageEvent) => this.onMessage(e);
    window.addEventListener('message', onMessage);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('message', onMessage);
      clearTimeout(this.timer);
    });
  }

  private send(msg: Record<string, unknown>) {
    const win = this.frame().nativeElement.contentWindow;
    if (!this.ready || !win) return;
    win.postMessage({ ...msg, source: 'p2u-parent' }, '*');
  }

  private onMessage(e: MessageEvent) {
    if (e.source !== this.frame().nativeElement.contentWindow) return;
    const msg = e.data ?? {};
    if (msg.source !== 'p2u-console') return;
    switch (msg.type) {
      case 'ready': {
        this.ready = true;
        const p = this.store.project();
        if (p) this.send({ type: 'update', data: consoleData(p, true) });
        const sel = this.store.selection();
        if (sel.type === 'node') this.send({ type: 'select', id: sel.id });
        break;
      }
      case 'navigate': {
        const sel = this.store.selection();
        if (msg.id) {
          if (sel.type !== 'node' || sel.id !== msg.id) this.store.selection.set({ type: 'node', id: msg.id });
        } else if (sel.type === 'node') {
          this.store.selection.set({ type: 'overview' });
        }
        break;
      }
      case 'saveExample': {
        const ex = msg.example as Omit<Example, 'id' | 'source'>;
        this.store.addExample(msg.requestId, { ...ex, id: uid('ex'), source: 'captured' });
        this.store.selection.set({ type: 'node', id: msg.requestId });
        break;
      }
    }
  }
}
