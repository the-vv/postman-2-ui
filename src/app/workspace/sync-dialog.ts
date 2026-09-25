import { Component, WritableSignal, computed, inject, signal } from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { applyMerge, planMerge } from '../core/merge';

/** Review dialog for "Update from collection": pick which new / changed / removed APIs to apply. */
@Component({
  selector: 'app-sync-dialog',
  template: `
    @if (plan(); as pl) {
      <div class="modal-bg" (click)="close()">
        <div class="modal" role="dialog" aria-modal="true" aria-label="Update from collection" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <div>
              <h2>Update from collection</h2>
              <div class="muted small">{{ store.syncSource()!.fileName }}</div>
            </div>
            <button class="icon-btn" (click)="close()" aria-label="Close">✕</button>
          </div>
          <div class="modal-body">
            <div class="chips">
              <span class="chip chip-new">{{ pl.added.length }} new</span>
              <span class="chip chip-changed">{{ pl.changed.length }} changed</span>
              <span class="chip chip-removed">{{ pl.removed.length }} removed</span>
              <span class="chip">{{ pl.unchanged }} unchanged</span>
              @if (pl.newVars.length) {
                <span class="chip">{{ pl.newVars.length }} new variables</span>
              }
            </div>
            <p class="hint">
              Your docs, examples, environments and theme are always kept. Examples from the collection are added
              next to yours.
            </p>

            @if (pl.added.length) {
              <div class="sync-sec">
                <div class="sync-head">
                  <h3>New APIs</h3>
                  <button class="link" (click)="toggleAll(add, addIds())">{{ allOn(add, addIds()) ? 'Select none' : 'Select all' }}</button>
                </div>
                @for (a of pl.added; track a.req.id) {
                  <label class="sync-row">
                    <input type="checkbox" [checked]="add().has(a.req.id)" (change)="toggle(add, a.req.id)" />
                    <span class="method m-{{ a.req.method.toLowerCase() }}">{{ a.req.method }}</span>
                    <span class="sync-name">{{ a.req.name }}</span>
                    <span class="muted small sync-path">{{ a.path.join(' / ') }}</span>
                  </label>
                }
              </div>
            }

            @if (pl.changed.length) {
              <div class="sync-sec">
                <div class="sync-head">
                  <h3>Changed APIs</h3>
                  <button class="link" (click)="toggleAll(update, changedIds())">{{ allOn(update, changedIds()) ? 'Select none' : 'Select all' }}</button>
                </div>
                @for (c of pl.changed; track c.next.req.id) {
                  <label class="sync-row">
                    <input type="checkbox" [checked]="update().has(c.next.req.id)" (change)="toggle(update, c.next.req.id)" />
                    <span class="method m-{{ c.next.req.method.toLowerCase() }}">{{ c.next.req.method }}</span>
                    <span class="sync-name">
                      {{ c.old.req.name }}
                      @if (c.old.req.name !== c.next.req.name) {
                        → {{ c.next.req.name }}
                      }
                    </span>
                    <span class="tag">{{ c.fields.join(', ') }}</span>
                  </label>
                }
                <label class="check">
                  <input type="checkbox" [checked]="replaceDescriptions()" (change)="replaceDescriptions.set(!replaceDescriptions())" />
                  Also replace descriptions with the collection's text (your extra docs stay)
                </label>
              </div>
            }

            @if (pl.removed.length) {
              <div class="sync-sec">
                <div class="sync-head">
                  <h3>Not in the collection anymore</h3>
                  <button class="link" (click)="toggleAll(remove, removedIds())">{{ allOn(remove, removedIds()) ? 'Keep all' : 'Remove all' }}</button>
                </div>
                <p class="hint">Checked APIs are deleted, with their docs and examples. Unchecked ones are kept.</p>
                @for (r of pl.removed; track r.req.id) {
                  <label class="sync-row">
                    <input type="checkbox" [checked]="remove().has(r.req.id)" (change)="toggle(remove, r.req.id)" />
                    <span class="method m-{{ r.req.method.toLowerCase() }}">{{ r.req.method }}</span>
                    <span class="sync-name">{{ r.req.name }}</span>
                    <span class="muted small sync-path">{{ r.path.join(' / ') }}</span>
                  </label>
                }
              </div>
            }

            @if (!pl.added.length && !pl.changed.length && !pl.removed.length && !pl.newVars.length) {
              <div class="empty-box">Everything is already up to date.</div>
            }
          </div>
          <div class="modal-foot">
            <span class="muted small">{{ summary() }}</span>
            <span class="grow"></span>
            <button class="btn ghost" (click)="close()">Cancel</button>
            <button class="btn primary" (click)="apply()">Apply changes</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class SyncDialog {
  readonly store = inject(ProjectStore);

  readonly plan = computed(() => {
    const src = this.store.syncSource()?.project;
    const cur = this.store.project();
    return src && cur ? planMerge(cur, src) : null;
  });

  readonly addIds = computed(() => this.plan()?.added.map((a) => a.req.id) ?? []);
  readonly changedIds = computed(() => this.plan()?.changed.map((c) => c.next.req.id) ?? []);
  readonly removedIds = computed(() => this.plan()?.removed.map((r) => r.req.id) ?? []);

  // Defaults: add every new API, update every changed one, keep removed ones.
  readonly add = signal(new Set(this.addIds()));
  readonly update = signal(new Set(this.changedIds()));
  readonly remove = signal(new Set<string>());
  readonly replaceDescriptions = signal(false);

  readonly summary = computed(
    () => `Will add ${this.add().size}, update ${this.update().size}, remove ${this.remove().size}`,
  );

  toggle(sig: WritableSignal<Set<string>>, id: string) {
    sig.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  allOn(sig: WritableSignal<Set<string>>, ids: string[]) {
    return ids.every((id) => sig().has(id));
  }

  toggleAll(sig: WritableSignal<Set<string>>, ids: string[]) {
    sig.set(this.allOn(sig, ids) ? new Set() : new Set(ids));
  }

  apply() {
    const src = this.store.syncSource()?.project;
    const cur = this.store.project();
    const pl = this.plan();
    if (!src || !cur || !pl) return;
    const next = applyMerge(cur, src, pl, {
      add: this.add(),
      update: this.update(),
      remove: this.remove(),
      replaceDescriptions: this.replaceDescriptions(),
    });
    this.store.update(next);
    this.store.notice.set(
      `Updated from ${this.store.syncSource()!.fileName}: ${this.add().size} added, ${this.update().size} updated, ${this.remove().size} removed.`,
    );
    this.store.syncSource.set(null);
  }

  close() {
    this.store.syncSource.set(null);
  }
}
