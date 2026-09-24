# Postman → UI

Turn a Postman collection into a **standalone HTML API console**: docs and a "Try it" console for every API, in one file.

Runs fully in the browser. There is no backend, and nothing is uploaded.

## Features

- **Upload & validate**: Postman collection v2.0 / v2.1 plus any number of environment files (drag & drop). Errors and warnings are shown for each file.
- **Live preview**: a working API console, updated as you edit.
- **Docs**: edit each API's description and add extra Markdown docs. Folder and collection intros can be edited too.
- **Examples**: examples from the collection are kept. Run a request in the preview and click **Save as example**, or add examples by hand.
- **Variables**: collection variables and environments. Users can switch environments and edit values in the exported page (saved in their browser).
- **Auth**: Bearer, Basic and API key, including auth inherited from folders or the collection.
- **Theme**: color (blue by default), light / dark / system mode, layout, font, corners, density, custom CSS, and feature toggles.
- **Export**: one self-contained `.html` file. Open it directly, host it anywhere, or embed it:

```html
<iframe src="my-api.html" style="width:100%;height:800px;border:0"></iframe>
```

In the exported file:

- `my-api.html#/<api-id>` opens one API directly.
- `?sidebar=0` hides the sidebar.
- `?theme=dark` or `?theme=light` forces a theme.

> APIs must allow browser requests from the page's origin (CORS). Pre-request and test scripts are not run.

## Development

Needs Node `^22.22.3 || >=24.15` (Angular 22).

```bash
npm install
npm start          # http://localhost:4200
npm test           # unit tests
npm run build      # static output in dist/postman-2-ui/browser
```

## Hosting

### GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` builds the app and deploys it on every push to `main`. You can also run it by hand from the **Actions** tab.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The site will be at `https://<user>.github.io/postman-2-ui/`.

### Any static host

`npm run build` creates static files in `dist/postman-2-ui/browser`. Upload that folder to any static host, such as GitHub Pages, Netlify, S3 or nginx. It uses `<base href="./">`, so it works from a sub-folder too.

## Project layout

- `src/app/core/postman-parser.ts`: validates and converts Postman files.
- `src/app/core/export-html.ts`: builds the standalone HTML.
- `src/runtime/console.js` / `console.css`: the console runtime. It has no dependencies, is inlined into every export, and is also used by the live preview.
- `src/app/workspace/*`: the editor screens.
