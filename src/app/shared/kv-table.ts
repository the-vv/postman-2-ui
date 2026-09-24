import { Component, input, output } from '@angular/core';
import { KV } from '../core/models';

/** Editable key/value table used for variables. Emits a new array on every change. */
@Component({
  selector: 'app-kv-table',
  template: `
    <table class="kv">
      <thead>
        <tr>
          <th class="c-chk" title="Enabled"></th>
          <th>Variable</th>
          <th>Value</th>
          <th class="c-secret" title="Hide the value in the console">Secret</th>
          <th class="c-del"></th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track $index; let i = $index) {
          <tr [class.off]="!row.enabled">
            <td class="c-chk">
              <input type="checkbox" [checked]="row.enabled" (change)="set(i, { enabled: $any($event.target).checked })" />
            </td>
            <td><input [value]="row.key" placeholder="name" (input)="set(i, { key: $any($event.target).value })" /></td>
            <td>
              <input
                [value]="row.value"
                placeholder="value"
                [type]="row.type === 'secret' ? 'password' : 'text'"
                (input)="set(i, { value: $any($event.target).value })"
              />
            </td>
            <td class="c-secret">
              <input
                type="checkbox"
                [checked]="row.type === 'secret'"
                (change)="set(i, { type: $any($event.target).checked ? 'secret' : undefined })"
              />
            </td>
            <td class="c-del"><button class="icon-btn" (click)="del(i)" title="Remove">✕</button></td>
          </tr>
        } @empty {
          <tr>
            <td colspan="5" class="muted small empty">No variables yet.</td>
          </tr>
        }
      </tbody>
    </table>
    <button class="btn ghost sm" (click)="add()">+ Add variable</button>
  `,
})
export class KvTable {
  readonly rows = input.required<KV[]>();
  readonly rowsChange = output<KV[]>();

  set(i: number, patch: Partial<KV>) {
    this.rowsChange.emit(this.rows().map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  add() {
    this.rowsChange.emit([...this.rows(), { key: '', value: '', enabled: true }]);
  }
  del(i: number) {
    this.rowsChange.emit(this.rows().filter((_, idx) => idx !== i));
  }
}
