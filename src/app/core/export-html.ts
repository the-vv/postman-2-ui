import { Project, TreeNode } from './models';
// The console runtime is plain JS/CSS, inlined as text into the exported file.
// @ts-ignore - text loader import
import runtimeJs from '../../runtime/console.js' with { loader: 'text' };
// @ts-ignore - text loader import
import runtimeCss from '../../runtime/console.css' with { loader: 'text' };

function stripHidden(items: TreeNode[], keepHidden: boolean): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of items) {
    if (n.kind === 'request') {
      if (keepHidden || !n.hidden) out.push(n);
    } else {
      const children = stripHidden(n.children, keepHidden);
      if (children.length || keepHidden) out.push({ ...n, children });
    }
  }
  return out;
}

/** The JSON payload the console runtime reads. */
export function consoleData(p: Project, editorMode: boolean) {
  return {
    title: p.title,
    description: p.description,
    items: stripHidden(p.items, editorMode),
    collectionVars: p.collectionVars,
    environments: p.environments,
    activeEnvId: p.activeEnvId,
    theme: p.theme,
    options: p.options,
    editorMode,
    generatedAt: new Date().toISOString(),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** JSON safe to put inside a <script> tag. */
function scriptJson(v: unknown): string {
  return JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildHtml(p: Project, editorMode = false): string {
  const data = consoleData(p, editorMode);
  const customCss = p.theme.customCss.replace(/<\/style/gi, '<\\/style');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Postman to UI">
<title>${escapeHtml(p.title)}</title>
<style>${runtimeCss as string}</style>
<style id="p2u-custom">${customCss}</style>
</head>
<body>
<div id="app"></div>
<script type="application/json" id="p2u-data">${scriptJson(data)}</script>
<script>${(runtimeJs as string).replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
}

export function exportFileName(p: Project): string {
  const base = p.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'api-console'}.html`;
}

export function downloadHtml(p: Project) {
  const blob = new Blob([buildHtml(p)], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = exportFileName(p);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
