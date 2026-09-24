import { Component, inject, input, signal } from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { Folder, KV } from '../core/models';
import { parseFile } from '../core/postman-parser';
import { pickFiles } from '../core/file-utils';
import { uid } from '../core/postman-parser';
import { KvTable } from '../shared/kv-table';

@Component({
  selector: 'app-folder-editor',
  template: `
    @let f = folder();
    <div class="editor-head">
      <div class="eyebrow">Folder</div>
      <h2>{{ f.name }}</h2>
    </div>
    <section class="panel">
      <h3>Folder description</h3>
      <p class="hint">Markdown. Shown on the folder page above the list of its APIs.</p>
      <textarea
        rows="10"
        class="mono"
        [value]="f.description"
        (input)="store.patchNode(f.id, { description: $any($event.target).value })"
      ></textarea>
    </section>
  `,
})
export class FolderEditor {
  readonly store = inject(ProjectStore);
  readonly folder = input.required<Folder>();
}

@Component({
  selector: 'app-overview-editor',
  template: `
    @if (store.project(); as p) {
      <div class="editor-head">
        <div class="eyebrow">Overview</div>
        <h2>Collection details</h2>
      </div>
      <section class="panel">
        <label class="block">
          <span>Title</span>
          <input [value]="p.title" (input)="store.update({ title: $any($event.target).value })" />
        </label>
        <label class="block">
          <span>Introduction <em>(Markdown, shown on the home page)</em></span>
          <textarea
            rows="12"
            class="mono"
            [value]="p.description"
            (input)="store.update({ description: $any($event.target).value })"
          ></textarea>
        </label>
      </section>
      @if (p.warnings.length) {
        <section class="panel">
          <h3>Import notes</h3>
          @for (w of p.warnings; track $index) {
            <div class="msg warn">{{ w }}</div>
          }
        </section>
      }
      <section class="panel">
        <h3>Source</h3>
        <p class="hint">Imported from <code>{{ p.fileName }}</code>. Your edits are auto-saved in this browser.</p>
      </section>
    }
  `,
})
export class OverviewEditor {
  readonly store = inject(ProjectStore);
}

@Component({
  selector: 'app-env-editor',
  imports: [KvTable],
  template: `
    @if (store.project(); as p) {
      <div class="editor-head">
        <div class="eyebrow">Variables</div>
        <h2>Environments &amp; variables</h2>
        <p class="hint">
          Use them as <code>{{ '{{' }}name{{ '}}' }}</code> in URLs, headers and bodies. Users can switch environments
          and change values in the exported console. Environment values override collection values.
        </p>
      </div>

      <div class="msg warn">
        All values here are written into the exported HTML file. Remove real secrets and tokens before sharing it.
      </div>

      <section class="panel">
        <h3>Collection variables</h3>
        <app-kv-table [rows]="p.collectionVars" (rowsChange)="store.update({ collectionVars: $event })" />
      </section>

      <section class="panel">
        <div class="panel-head">
          <h3>Environments <span class="count">{{ p.environments.length }}</span></h3>
          <div class="row-gap">
            <button class="btn sm" (click)="importEnv()">Import file</button>
            <button class="btn sm" (click)="addEnv()">+ New</button>
          </div>
        </div>
        @if (error()) {
          <div class="msg err">{{ error() }}</div>
        }
        @if (p.environments.length) {
          <label class="block">
            <span>Selected by default</span>
            <select [value]="p.activeEnvId ?? ''" (change)="store.update({ activeEnvId: $any($event.target).value || null })">
              <option value="">No environment</option>
              @for (e of p.environments; track e.id) {
                <option [value]="e.id" [selected]="e.id === p.activeEnvId">{{ e.name }}</option>
              }
            </select>
          </label>
        }
        @for (e of p.environments; track e.id) {
          <div class="env-card">
            <div class="panel-head">
              <input class="ex-name" [value]="e.name" (input)="rename(e.id, $any($event.target).value)" />
              <button class="icon-btn danger" (click)="store.removeEnvironment(e.id)" title="Delete environment">✕</button>
            </div>
            <app-kv-table [rows]="e.values" (rowsChange)="setValues(e.id, $event)" />
          </div>
        } @empty {
          <div class="empty-box">No environments. Import a Postman environment file or create one.</div>
        }
      </section>
    }
  `,
})
export class EnvEditor {
  readonly store = inject(ProjectStore);
  readonly error = signal('');

  async importEnv() {
    this.error.set('');
    for (const f of await pickFiles()) {
      const r = parseFile(await f.text(), f.name);
      if (r.kind === 'environment' && r.environment) this.store.addEnvironment(r.environment);
      else this.error.set(`${f.name}: ${r.errors[0] ?? 'Not a Postman environment file.'}`);
    }
  }

  addEnv() {
    const n = (this.store.project()?.environments.length ?? 0) + 1;
    this.store.addEnvironment({ id: uid('env'), name: `Environment ${n}`, values: [] });
  }

  rename(id: string, name: string) {
    this.store.updateEnv(id, (e) => ({ ...e, name }));
  }

  setValues(id: string, values: KV[]) {
    this.store.updateEnv(id, (e) => ({ ...e, values }));
  }
}
