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
  hidden?: boolean;
}

export interface Folder {
  kind: 'folder';
  id: string;
  name: string;
  description: string;
  children: TreeNode[];
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

export interface ConsoleOptions {
  showTryIt: boolean;
  allowVarEdit: boolean;
  showExamples: boolean;
  showCurl: boolean;
  timeoutSec: number;
}

export interface Project {
  version: 1;
  title: string;
  description: string;
  items: TreeNode[];
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
};
