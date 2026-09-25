import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ProjectStore } from '../core/project.store';
import { TreeNode } from '../core/models';
import { Preview } from './preview';
import { RequestEditor } from './request-editor';
import { EnvEditor, FolderEditor, OverviewEditor } from './simple-editors';
import { ThemeEditor } from './theme-editor';
import { SyncDialog } from './sync-dialog';

export type PreviewMode = 'split' | 'full' | 'hidden';

@Component({
  selector: 'app-workspace',
  imports: [NgTemplateOutlet, Preview, RequestEditor, FolderEditor, OverviewEditor, EnvEditor, ThemeEditor, SyncDialog],
  templateUrl: './workspace.html',
})
export class Workspace {
  readonly store = inject(ProjectStore);
  readonly previewMode = signal<PreviewMode>('split');
  readonly collapsed = signal(new Set<string>());
  readonly filter = signal('');

  readonly selectedNode = computed(() => {
    const s = this.store.selection();
    return s.type === 'node' ? (this.store.index().get(s.id) ?? null) : null;
  });

  select(id: string) {
    this.store.selection.set({ type: 'node', id });
  }

  isSelected(id: string) {
    const s = this.store.selection();
    return s.type === 'node' && s.id === id;
  }

  toggle(id: string, e: Event) {
    e.stopPropagation();
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  visible(n: TreeNode): boolean {
    const q = this.filter().trim().toLowerCase();
    if (!q) return true;
    if (n.kind === 'folder') return n.name.toLowerCase().includes(q) || n.children.some((c) => this.visible(c));
    return `${n.method} ${n.name} ${n.url}`.toLowerCase().includes(q);
  }

  isOpen(id: string) {
    return !!this.filter().trim() || !this.collapsed().has(id);
  }
}
