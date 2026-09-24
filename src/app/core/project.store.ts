import { Injectable, computed, signal } from '@angular/core';
import { Environment, Example, Folder, Project, TreeNode } from './models';
import { DEFAULT_OPTIONS, DEFAULT_THEME } from './models';

export type Selection =
  | { type: 'overview' }
  | { type: 'environments' }
  | { type: 'theme' }
  | { type: 'node'; id: string };

const STORAGE_KEY = 'p2u.project.v1';

function mapNode(items: TreeNode[], id: string, fn: (n: TreeNode) => TreeNode): TreeNode[] {
  let changed = false;
  const out = items.map((n) => {
    if (n.id === id) {
      changed = true;
      return fn(n);
    }
    if (n.kind === 'folder') {
      const children = mapNode(n.children, id, fn);
      if (children !== n.children) {
        changed = true;
        return { ...n, children };
      }
    }
    return n;
  });
  return changed ? out : items;
}

function indexTree(items: TreeNode[], map = new Map<string, TreeNode>()): Map<string, TreeNode> {
  for (const n of items) {
    map.set(n.id, n);
    if (n.kind === 'folder') indexTree(n.children, map);
  }
  return map;
}

/** Holds the project being edited. All updates are immutable so signals notify correctly. */
@Injectable({ providedIn: 'root' })
export class ProjectStore {
  readonly project = signal<Project | null>(null);
  readonly selection = signal<Selection>({ type: 'overview' });
  readonly index = computed(() => indexTree(this.project()?.items ?? []));
  readonly storageError = signal('');

  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  load(p: Project) {
    this.project.set(p);
    this.selection.set({ type: 'overview' });
    this.save();
  }

  close() {
    this.project.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage not available */
    }
  }

  update(patch: Partial<Project>) {
    const p = this.project();
    if (!p) return;
    this.project.set({ ...p, ...patch });
    this.save();
  }

  updateNode<T extends TreeNode>(id: string, fn: (n: T) => T) {
    const p = this.project();
    if (!p) return;
    this.update({ items: mapNode(p.items, id, (n) => fn(n as T)) });
  }

  patchNode(id: string, patch: Partial<TreeNode>) {
    this.updateNode(id, (n) => ({ ...n, ...patch }) as TreeNode);
  }

  addExample(requestId: string, ex: Example) {
    this.updateNode(requestId, (n) => (n.kind === 'request' ? { ...n, examples: [...n.examples, ex] } : n));
  }

  updateEnv(id: string, fn: (e: Environment) => Environment) {
    const p = this.project();
    if (!p) return;
    this.update({ environments: p.environments.map((e) => (e.id === id ? fn(e) : e)) });
  }

  addEnvironment(env: Environment) {
    const p = this.project();
    if (!p) return;
    this.update({
      environments: [...p.environments, env],
      activeEnvId: p.activeEnvId ?? env.id,
    });
  }

  removeEnvironment(id: string) {
    const p = this.project();
    if (!p) return;
    const environments = p.environments.filter((e) => e.id !== id);
    this.update({
      environments,
      activeEnvId: p.activeEnvId === id ? (environments[0]?.id ?? null) : p.activeEnvId,
    });
  }

  folderOf(id: string): Folder | null {
    for (const n of this.index().values()) {
      if (n.kind === 'folder' && n.children.some((c) => c.id === id)) return n;
    }
    return null;
  }

  /** Previously saved project, if any. */
  saved(): Project | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw) as Project;
      if (p?.version !== 1 || !Array.isArray(p.items)) return null;
      // Fill fields added in later versions.
      return {
        ...p,
        theme: { ...DEFAULT_THEME, ...p.theme },
        options: { ...DEFAULT_OPTIONS, ...p.options },
      };
    } catch {
      return null;
    }
  }

  private save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const p = this.project();
      if (!p) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
        this.storageError.set('');
      } catch {
        this.storageError.set('Auto-save failed (browser storage is full). Export your work to keep it.');
      }
    }, 400);
  }
}
