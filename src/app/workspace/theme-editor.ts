import { Component, computed, inject, signal } from '@angular/core';
import { ProjectStore } from '../core/project.store';
import { ConsoleOptions, DEFAULT_THEME, ThemeConfig } from '../core/models';
import { downloadHtml, exportFileName } from '../core/export-html';

@Component({
  selector: 'app-theme-editor',
  templateUrl: './theme-editor.html',
})
export class ThemeEditor {
  readonly store = inject(ProjectStore);
  readonly copied = signal(false);

  readonly presets = [
    { name: 'Blue', color: '#2563eb' },
    { name: 'Indigo', color: '#4f46e5' },
    { name: 'Violet', color: '#7c3aed' },
    { name: 'Pink', color: '#db2777' },
    { name: 'Red', color: '#dc2626' },
    { name: 'Orange', color: '#ea580c' },
    { name: 'Emerald', color: '#059669' },
    { name: 'Teal', color: '#0d9488' },
    { name: 'Sky', color: '#0284c7' },
    { name: 'Slate', color: '#475569' },
  ];

  readonly fileName = computed(() => {
    const p = this.store.project();
    return p ? exportFileName(p) : '';
  });

  readonly embedCode = computed(
    () =>
      `<iframe src="${this.fileName()}" title="API console" style="width:100%;height:800px;border:0"></iframe>`,
  );

  theme(): ThemeConfig {
    return this.store.project()!.theme;
  }

  options(): ConsoleOptions {
    return this.store.project()!.options;
  }

  setTheme(p: Partial<ThemeConfig>) {
    this.store.update({ theme: { ...this.theme(), ...p } });
  }

  setColor(value: string) {
    const v = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(v) || /^#[0-9a-f]{3}$/i.test(v)) this.setTheme({ primary: v.toLowerCase() });
  }

  setOption(p: Partial<ConsoleOptions>) {
    this.store.update({ options: { ...this.options(), ...p } });
  }

  resetTheme() {
    this.store.update({ theme: { ...DEFAULT_THEME } });
  }

  export() {
    const p = this.store.project();
    if (p) downloadHtml(p);
  }

  async copyEmbed() {
    try {
      await navigator.clipboard.writeText(this.embedCode());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
}
