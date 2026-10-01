import { Component, inject } from '@angular/core';
import { ProjectStore } from './core/project.store';
import { pickFiles } from './core/file-utils';
import { parseFile } from './core/postman-parser';
import { Landing } from './landing/landing';
import { Workspace } from './workspace/workspace';
import { ExportDialog } from './workspace/export-dialog';

@Component({
  selector: 'app-root',
  imports: [Landing, Workspace, ExportDialog],
  template: `
    <header class="app-bar">
      <div class="logo"><span class="logo-mark">P</span> Postman <span class="arrow">→</span> UI</div>
      @if (store.project(); as p) {
        <span class="sep"></span>
        <span class="project-name" [title]="p.fileName">{{ p.title }}</span>
        @if (store.storageError()) {
          <span class="save-warn" [title]="store.storageError()">⚠ Not saved</span>
        }
        <span class="grow"></span>
        <button class="btn ghost sm" (click)="closeProject()">New collection</button>
        <button class="btn ghost sm" (click)="syncFromCollection()" title="Add new APIs from an updated Postman collection. Your docs are kept.">
          ⟳ Update from collection
        </button>
        <button class="btn ghost sm" (click)="store.selection.set({ type: 'theme' })">Theme</button>
        <button class="btn primary" (click)="export()">Export…</button>
      } @else {
        <span class="grow"></span>
        <span class="muted small">Runs fully in your browser. Nothing is uploaded.</span>
      }
    </header>
    <main class="app-main">
      @if (store.project()) {
        <app-workspace />
      } @else {
        <app-landing />
      }
    </main>
    @if (store.exportOpen() && store.project()) {
      <app-export-dialog />
    }
  `,
})
export class App {
  readonly store = inject(ProjectStore);

  constructor() {
    // Restore the last auto-saved project.
    const saved = this.store.saved();
    if (saved) this.store.project.set(saved);
  }

  export() {
    this.store.exportOpen.set(true);
  }

  async syncFromCollection() {
    const [file] = await pickFiles('.json,application/json', false);
    if (!file) return;
    const r = parseFile(await file.text(), file.name);
    if (r.kind === 'collection' && r.ok) this.store.syncSource.set(r);
    else this.store.notice.set(`${file.name}: ${r.errors[0] ?? 'Not a Postman collection.'}`);
  }

  closeProject() {
    if (confirm('Close this collection? Your current work will be removed from this browser.')) this.store.close();
  }
}
