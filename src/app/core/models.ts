/** Shared data model. The same JSON shape is embedded in the exported HTML and read by the console runtime. */

export interface KV {
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
  /** formdata: 'text' | 'file'. environments: 'secret' hides the value in the console UI. */
  type?: 'text' | 'file' | 'secret';
}

export type BodyMode = 'none' | 'raw' | 'urlencoded' | 'formdata' | 'graphql';

export interface RequestBody {
  mode: BodyMode;
  raw?: string;
  /** json | xml | text | html | javascript */
  language?: string;
  urlencoded?: KV[];
  formdata?: KV[];
  graphql?: { query: string; variables: string };
}

export interface Auth {
  type: 'none' | 'bearer' | 'basic' | 'apikey' | 'unsupported';
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  value?: string;
  in?: 'header' | 'query';
  note?: string;
}

/** Postman scripts. They run in a sandbox in the console. */
export interface Scripts {
  prerequest: string;
  test: string;
}

export interface Example {
  id: string;
  name: string;
  code: number;
  status: string;
  headers: KV[];
  body: string;
  language: string;
  source: 'collection' | 'captured' | 'manual';
}

export interface ApiRequest {
  kind: 'request';
  id: string;
  name: string;
  method: string;
  /** URL without the query string. May contain {{vars}} and :pathVars. */
  url: string;
  query: KV[];
  pathVars: KV[];
  headers: KV[];
  body: RequestBody;
  auth: Auth;
  /** Description from the Postman collection (markdown). */
  description: string;
  /** Extra documentation added in the generator (markdown). */
  docs: string;
  examples: Example[];
  scripts?: Scripts;
  hidden?: boolean;
}

export interface Folder {
  kind: 'folder';
  id: string;
  name: string;
  description: string;
  children: TreeNode[];
  scripts?: Scripts;
}

export type TreeNode = ApiRequest | Folder;

export interface Environment {
  id: string;
  name: string;
  values: KV[];
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeConfig {
  primary: string;
  mode: ThemeMode;
  allowToggle: boolean;
  font: 'system' | 'sans' | 'serif' | 'mono';
  radius: 'none' | 'small' | 'medium' | 'large';
  layout: 'side-by-side' | 'stacked';
  density: 'comfortable' | 'compact';
  customCss: string;
}

/** The "Get started" home page of the exported console. */
export interface GuideConfig {
  enabled: boolean;
  title: string;
  /** Markdown. */
  content: string;
}

export const DEFAULT_GUIDE: GuideConfig = {
  enabled: true,
  title: '',
  content: [
    '## How to use this console',
    '',
    '1. Pick an environment and check the **Base URL** below. It must start with `http://` or `https://`.',
    '2. Choose an API on the left. Its documentation is shown next to a **Try it** panel.',
    '3. Change params, headers or the body, then click **Send** (or press `Ctrl + Enter`).',
    '4. Set tokens and other values on the **Variables** page. Your changes are saved in this browser.',
  ].join('\n'),
};

/** Where "Send to API" posts the exported HTML file. */
export interface PublishConfig {
  method: 'POST' | 'PUT' | 'PATCH';
  url: string;
  headers: KV[];
  /** formdata: multipart upload. base64: JSON body built from bodyTemplate. */
  mode: 'formdata' | 'base64';
  /** formdata: name of the file field. */
  fieldName: string;
  /** formdata: extra text fields sent with the file. */
  fields: KV[];
  /** base64: JSON body. Placeholders: {{file}}, {{fileName}}, {{fileSize}}, {{mimeType}}, {{fileDataUrl}}. */
  bodyTemplate: string;
}

export const DEFAULT_PUBLISH: PublishConfig = {
  method: 'POST',
  url: '',
  headers: [],
  mode: 'formdata',
  fieldName: 'file',
  fields: [],
  bodyTemplate: '{\n  "fileName": "{{fileName}}",\n  "mimeType": "{{mimeType}}",\n  "content": "{{file}}"\n}',
};

export interface ConsoleOptions {
  showTryIt: boolean;
  allowVarEdit: boolean;
  showExamples: boolean;
  showCurl: boolean;
  timeoutSec: number;
  runScripts: boolean;
}

export interface Project {
  version: 1;
  title: string;
  description: string;
  items: TreeNode[];
  /** Collection-level scripts, run before / after every request. */
  scripts?: Scripts;
  /** Get started page. Missing means the default guide. */
  guide?: GuideConfig;
  /** Custom export file name (without folder). Missing means one made from the title. */
  exportName?: string;
  /** Last "Send to API" settings. Kept in the builder only, never written into the export. */
  publish?: PublishConfig;
  collectionVars: KV[];
  environments: Environment[];
  activeEnvId: string | null;
  theme: ThemeConfig;
  options: ConsoleOptions;
  fileName: string;
  warnings: string[];
}

export const DEFAULT_THEME: ThemeConfig = {
  primary: '#2563eb',
  mode: 'light',
  allowToggle: true,
  font: 'system',
  radius: 'medium',
  layout: 'side-by-side',
  density: 'comfortable',
  customCss: '',
};

export const DEFAULT_OPTIONS: ConsoleOptions = {
  showTryIt: true,
  allowVarEdit: true,
  showExamples: true,
  showCurl: true,
  timeoutSec: 30,
  runScripts: true,
};
