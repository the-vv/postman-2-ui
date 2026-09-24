import { Component, computed, inject, signal } from '@angular/core';
import { ImportResult, parseFile } from '../core/postman-parser';
import { ProjectStore } from '../core/project.store';
import { pickFiles } from '../core/file-utils';
import { SAMPLE_COLLECTION, SAMPLE_ENVIRONMENT } from '../core/sample';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.html',
})
export class Landing {
  private store = inject(ProjectStore);

  readonly results = signal<ImportResult[]>([]);
  readonly dragging = signal(false);

  readonly collection = computed(() =>
    [...this.results()].reverse().find((r) => r.kind === 'collection' && r.ok),
  );
  readonly environments = computed(() => this.results().filter((r) => r.kind === 'environment' && r.ok));

  async browse() {
    this.addFiles(await pickFiles());
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(false);
    this.addFiles(Array.from(e.dataTransfer?.files ?? []));
  }

  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(true);
  }

  async addFiles(files: File[]) {
    const parsed = await Promise.all(files.map(async (f) => parseFile(await f.text(), f.name)));
    this.results.update((r) => [...r, ...parsed]);
  }

  remove(r: ImportResult) {
    this.results.update((list) => list.filter((x) => x !== r));
  }

  loadSample() {
    this.results.set([
      parseFile(JSON.stringify(SAMPLE_COLLECTION), 'jsonplaceholder.postman_collection.json'),
      parseFile(JSON.stringify(SAMPLE_ENVIRONMENT), 'production.postman_environment.json'),
    ]);
  }

  start() {
    const c = this.collection();
    if (!c?.project) return;
    const envs = this.environments().map((e) => e.environment!);
    this.store.load({ ...c.project, environments: envs, activeEnvId: envs[0]?.id ?? null });
  }
}
