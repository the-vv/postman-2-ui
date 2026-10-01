import { Component, computed, inject, signal } from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { DEFAULT_PUBLISH, PublishConfig } from '../core/models';
import { buildHtml, downloadHtml, exportFileName, normalizeFileName } from '../core/export-html';
import { PublishResult, publishHtml } from '../core/publish';
import { KvTable } from '../shared/kv-table';

/** Export: download the HTML file, or send it to an API. */
@Component({
  selector: 'app-export-dialog',
  imports: [KvTable],
  template: `
    @let c = config();
    <div class="modal-bg" (click)="close()">
      <div class="modal export-modal" role="dialog" aria-modal="true" aria-label="Export" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <h2>Export</h2>
          <button class="icon-btn" (click)="close()" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <label class="block">
            <span>File name</span>
            <input
              class="mono"
              [value]="nameInput()"
              [placeholder]="defaultName()"
              (input)="setName($any($event.target).value)"
            />
            <span class="muted small">Saved as <code>{{ fileName() }}</code>. Leave empty for the default name.</span>
          </label>

          <div class="seg seg-lg">
            <button [class.on]="mode() === 'download'" (click)="mode.set('download')">Download</button>
            <button [class.on]="mode() === 'api'" (click)="mode.set('api')">Send to API</button>
          </div>

          @if (mode() === 'download') {
            <p class="hint">Saves one HTML file with everything inside. Open it in any browser, host it or embed it.</p>
          } @else {
            <p class="hint">
              Uploads the HTML file to your server, e.g. a file storage or CMS endpoint. The API must allow browser
              requests from this page (CORS).
            </p>
            <div class="api-row">
              <select [value]="c.method" (change)="patch({ method: $any($event.target).value })">
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
              </select>
              <input class="mono" [value]="c.url" placeholder="https://api.example.com/files" (input)="patch({ url: $any($event.target).value })" />
            </div>

            <h4>Headers</h4>
            <app-kv-table [rows]="c.headers" keyLabel="Header" addLabel="header" (rowsChange)="patch({ headers: $event })" />

            <h4>Send the file as</h4>
            <div class="radio-cards">
              <label [class.on]="c.mode === 'formdata'">
                <input type="radio" name="pm" [checked]="c.mode === 'formdata'" (change)="patch({ mode: 'formdata' })" />
                <b>Form data</b><span>multipart/form-data upload</span>
              </label>
              <label [class.on]="c.mode === 'base64'">
                <input type="radio" name="pm" [checked]="c.mode === 'base64'" (change)="patch({ mode: 'base64' })" />
                <b>Base64 (JSON)</b><span>file content encoded in a JSON body</span>
              </label>
            </div>

            @if (c.mode === 'formdata') {
              <label class="block">
                <span>File field name</span>
                <input class="mono" [value]="c.fieldName" placeholder="file" (input)="patch({ fieldName: $any($event.target).value })" />
              </label>
              <h4>Extra form fields <span class="opt">optional</span></h4>
              <app-kv-table [rows]="c.fields" keyLabel="Field" addLabel="field" (rowsChange)="patch({ fields: $event })" />
            } @else {
              <label class="block">
                <span>JSON body</span>
                <textarea rows="7" class="mono" spellcheck="false" [value]="c.bodyTemplate" (input)="patch({ bodyTemplate: $any($event.target).value })"></textarea>
                <span class="muted small">
                  Placeholders: <code>{{ ph('file') }}</code> (base64), <code>{{ ph('fileDataUrl') }}</code>,
                  <code>{{ ph('fileName') }}</code>, <code>{{ ph('fileSize') }}</code>, <code>{{ ph('mimeType') }}</code>.
                  Add any other keys your API needs.
                </span>
              </label>
            }
            <p class="muted small">These settings are remembered in this browser. They are never written into the exported file.</p>

            @if (result(); as r) {
              <div class="publish-result" [class.ok]="r.ok" [class.bad]="!r.ok">
                @if (r.error) {
                  <b>{{ r.error }}</b>
                } @else {
                  <b>{{ r.ok ? '✓ Sent' : '✕ Failed' }}: {{ r.status }} {{ r.statusText }}</b>
                  @if (r.body) {
                    <pre>{{ r.body }}</pre>
                  }
                }
              </div>
            }
          }
        </div>
        <div class="modal-foot">
          <span class="grow"></span>
          <button class="btn ghost" (click)="close()">Close</button>
          @if (mode() === 'download') {
            <button class="btn primary" (click)="download()">Download {{ fileName() }}</button>
          } @else {
            <button class="btn primary" [disabled]="sending()" (click)="send()">{{ sending() ? 'Sending…' : 'Send to API' }}</button>
          }
        </div>
      </div>
    </div>
  `,
})
export class ExportDialog {
  readonly store = inject(ProjectStore);
  readonly mode = signal<'download' | 'api'>(this.store.project()?.publish?.url ? 'api' : 'download');
  readonly sending = signal(false);
  readonly result = signal<PublishResult | null>(null);

  readonly nameInput = computed(() => this.store.project()?.exportName ?? '');
  readonly defaultName = computed(() => {
    const p = this.store.project();
    return p ? exportFileName({ ...p, exportName: '' }) : '';
  });
  readonly fileName = computed(() => normalizeFileName(this.nameInput()) || this.defaultName());
  readonly config = computed<PublishConfig>(() => ({ ...DEFAULT_PUBLISH, ...this.store.project()?.publish }));

  ph(name: string) {
    return `{{${name}}}`;
  }

  setName(v: string) {
    this.store.update({ exportName: v });
  }

  patch(p: Partial<PublishConfig>) {
    this.store.update({ publish: { ...this.config(), ...p } });
    this.result.set(null);
  }

  download() {
    const p = this.store.project();
    if (!p) return;
    downloadHtml(p, this.fileName());
    this.close();
  }

  async send() {
    const p = this.store.project();
    if (!p) return;
    this.sending.set(true);
    this.result.set(null);
    this.result.set(await publishHtml(this.config(), buildHtml(p), this.fileName()));
    this.sending.set(false);
    setTimeout(() => document.querySelector('.publish-result')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  close() {
    this.store.exportOpen.set(false);
  }
}

