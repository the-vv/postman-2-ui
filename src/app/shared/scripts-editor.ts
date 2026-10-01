import { Component, computed, input, output } from '@angular/core';
import { Scripts } from '../core/models';

/** Pre-request and test script editors. Emits the new scripts on every change. */
@Component({
  selector: 'app-scripts-editor',
  template: `
    <section class="panel">
      <h3>
        Scripts <span class="opt">Postman pm API</span>
        @if (count()) {
          <span class="count">{{ count() }}</span>
        }
      </h3>
      <p class="hint">{{ hint() }} They run in the console when someone clicks <b>Send</b>.</p>
      <label class="block">
        <span>Pre-request script <em>(before the request is sent)</em></span>
        <textarea
          rows="7"
          class="mono code-area"
          wrap="off"
          spellcheck="false"
          [value]="value().prerequest"
          (input)="set('prerequest', $any($event.target).value)"
          (keydown.tab)="indent($event, 'prerequest')"
          placeholder="pm.environment.set('timestamp', Date.now());"
        ></textarea>
      </label>
      <label class="block">
        <span>Tests <em>(after the response arrives)</em></span>
        <textarea
          rows="7"
          class="mono code-area"
          wrap="off"
          spellcheck="false"
          [value]="value().test"
          (input)="set('test', $any($event.target).value)"
          (keydown.tab)="indent($event, 'test')"
          placeholder="pm.test('Status is 200', () => pm.response.to.have.status(200));&#10;pm.environment.set('token', pm.response.json().token);"
        ></textarea>
      </label>
      <details class="api-help">
        <summary>What works in the browser?</summary>
        <ul>
          <li><code>pm.environment</code>, <code>pm.collectionVariables</code>, <code>pm.globals</code>, <code>pm.variables</code>: get / set / unset / has</li>
          <li><code>pm.request</code>: url, headers (add / upsert / remove), body. Changes apply to the request being sent.</li>
          <li><code>pm.response</code>: code, status, headers, json(), text(), responseTime, <code>pm.response.to.have.status(200)</code></li>
          <li><code>pm.test</code>, <code>pm.expect</code> (chai style), <code>pm.sendRequest</code>, <code>pm.execution.skipRequest()</code>, <code>console.log</code></li>
          <li>Old syntax: <code>postman.setEnvironmentVariable</code>, <code>tests["name"] = true</code>, <code>responseBody</code></li>
          <li>Not available: <code>require()</code>, <code>setNextRequest</code>, cookies, visualizer.</li>
        </ul>
      </details>
    </section>
  `,
})
export class ScriptsEditor {
  readonly scripts = input<Scripts | undefined>();
  readonly hint = input('');
  readonly scriptsChange = output<Scripts>();

  readonly value = computed(() => this.scripts() ?? { prerequest: '', test: '' });
  readonly count = computed(() => [this.value().prerequest, this.value().test].filter((s) => s.trim()).length);

  set(key: keyof Scripts, v: string) {
    this.scriptsChange.emit({ ...this.value(), [key]: v });
  }

  /** Tab inserts two spaces instead of leaving the field. */
  indent(e: Event, key: keyof Scripts) {
    const ta = e.target as HTMLTextAreaElement;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b, value } = ta;
    ta.value = value.slice(0, a) + '  ' + value.slice(b);
    ta.selectionStart = ta.selectionEnd = a + 2;
    this.set(key, ta.value);
  }
}
