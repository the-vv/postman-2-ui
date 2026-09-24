import { Component, inject } from '@angular/core';
import { ProjectStore } from './core/project.store';
import { downloadHtml } from './core/export-html';
import { Landing } from './landing/landing';
import { Workspace } from './workspace/workspace';

@Component({
  selector: 'app-root',
  imports: [Landing, Workspace],
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
        <button class="btn ghost sm" (click)="store.selection.set({ type: 'theme' })">Theme</button>
        <button class="btn primary" (click)="export()">Export HTML</button>
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
    const p = this.store.project();
    if (p) downloadHtml(p);
  }

  closeProject() {
    if (confirm('Close this collection? Your current work will be removed from this browser.')) this.store.close();
  }
}
