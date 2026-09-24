/*
 * API console runtime.
 * Plain JS with no dependencies. It is inlined into every exported HTML file and
 * also runs inside the generator's live preview (editorMode = true).
 */
(function () {
  'use strict';

  var DATA = JSON.parse(document.getElementById('p2u-data').textContent);
  var IS_EDITOR = !!DATA.editorMode;
  var app = document.getElementById('app');
  var qs = new URLSearchParams(location.search);
  var METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  var FORBIDDEN_HEADER =
    /^(host|content-length|connection|cookie2?|origin|referer|accept-encoding|accept-charset|keep-alive|transfer-encoding|te|trailer|upgrade|via|expect|date|dnt|access-control-request-(headers|method))$|^(sec-|proxy-)/i;

  var S = {
    index: new Map(),
    parent: new Map(),
    current: null,
    drafts: {},
    responses: {},
    sending: {},
    envId: null,
    envs: {},
    coll: [],
    varsSig: '',
    search: '',
    collapsed: new Set(),
    themeChosen: null,
    exTab: {},
    respTab: {},
    respPretty: {},
  };

  /* ---------------------------------------------------------------- utils */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clone(v) {
    return v == null ? v : JSON.parse(JSON.stringify(v));
  }
  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function $(sel) {
    return app.querySelector(sel);
  }
  function post(msg) {
    if (!IS_EDITOR || window.parent === window) return;
    msg.source = 'p2u-console';
    window.parent.postMessage(msg, '*');
  }
  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }
  function methodClass(m) {
    return 'm m-' + String(m).toLowerCase();
  }
  function statusClass(code) {
    if (!code) return 'st st-err';
    return 'st st-' + String(code).charAt(0) + 'xx';
  }
  var ICON = {
    copy: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    chev: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>',
    sun: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    vars: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  };

  /* ------------------------------------------------------------- markdown */

  function safeUrl(u) {
    var raw = u.replace(/&amp;/g, '&').trim();
    if (/^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(raw) || !/^[a-z][a-z0-9+.-]*:/i.test(raw)) return u;
    return '#';
  }

  function inline(text) {
    var parts = String(text).split(/(`+[^`]*?`+)/g);
    return parts
      .map(function (p, i) {
        if (i % 2 === 1) return '<code>' + esc(p.replace(/^`+|`+$/g, '')) + '</code>';
        var s = esc(p);
        s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, function (_, alt, url) {
          return '<img alt="' + alt + '" src="' + safeUrl(url) + '">';
        });
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, function (_, label, url) {
          return '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener">' + label + '</a>';
        });
        s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, function (_, a, b) {
          return '<strong>' + (a || b) + '</strong>';
        });
        s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)|(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, function (_, p1, a, p3, b) {
          return (p1 || p3 || '') + '<em>' + (a || b) + '</em>';
        });
        s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        return s;
      })
      .join('');
  }

  var BLOCK_START = /^\s*(```|~~~|#{1,6}\s|>|([-*+]|\d+[.)])\s+|([-*_])(\s*\3){2,}\s*$)/;

  function md(src) {
    if (!src) return '';
    var lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      var m;
      if (/^\s*$/.test(line)) {
        i++;
        continue;
      }
      if ((m = line.match(/^\s*(```|~~~)\s*([\w-]*)/))) {
        var fence = m[1];
        var lang = m[2];
        var code = [];
        i++;
        while (i < lines.length && lines[i].trim().indexOf(fence) !== 0) code.push(lines[i++]);
        i++;
        out.push('<pre class="code"><code>' + highlight(code.join('\n'), lang) + '</code></pre>');
        continue;
      }
      if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
        var lvl = Math.min(6, m[1].length + 1);
        out.push('<h' + lvl + '>' + inline(m[2]) + '</h' + lvl + '>');
        i++;
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        out.push('<hr>');
        i++;
        continue;
      }
      if (/^\s*>/.test(line)) {
        var q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push('<blockquote>' + md(q.join('\n')) + '</blockquote>');
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        var ordered = /^\s*\d/.test(line);
        var items = [];
        var cur = null;
        while (i < lines.length) {
          var l = lines[i];
          var im = l.match(/^(\s{0,1})([-*+]|\d+[.)])\s+(.*)$/);
          if (im) {
            cur = [im[3]];
            items.push(cur);
            i++;
          } else if (/^\s*$/.test(l)) {
            if (i + 1 < lines.length && /^(\s{2,}|\s{0,1}([-*+]|\d+[.)])\s)/.test(lines[i + 1])) {
              cur && cur.push('');
              i++;
            } else break;
          } else if (/^\s{2,}/.test(l) || (cur && !BLOCK_START.test(l))) {
            cur.push(l.replace(/^\s{2,4}/, ''));
            i++;
          } else break;
        }
        var tag = ordered ? 'ol' : 'ul';
        out.push(
          '<' + tag + '>' +
            items
              .map(function (it) {
                var nested = it.slice(1).some(function (x) {
                  return BLOCK_START.test(x);
                });
                return '<li>' + (nested ? inline(it[0]) + md(it.slice(1).join('\n')) : inline(it.join(' '))) + '</li>';
              })
              .join('') +
            '</' + tag + '>'
        );
        continue;
      }
      if (line.indexOf('|') >= 0 && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
        var row = function (r) {
          return r.trim().replace(/^\||\|$/g, '').split('|').map(function (c) {
            return c.trim();
          });
        };
        var head = row(line);
        i += 2;
        var body = [];
        while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim()) body.push(row(lines[i++]));
        out.push(
          '<div class="tbl-wrap"><table class="md-table"><thead><tr>' +
            head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') +
            '</tr></thead><tbody>' +
            body.map(function (r) {
              return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
            }).join('') +
            '</tbody></table></div>'
        );
        continue;
      }
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !(para.length && BLOCK_START.test(lines[i]))) {
        para.push(lines[i++]);
      }
      out.push(
        '<p>' +
          para
            .map(function (p, idx) {
              return inline(p.trim()) + (/\s{2,}$/.test(p) && idx < para.length - 1 ? '<br>' : '');
            })
            .join(' ') +
          '</p>'
      );
    }
    return out.join('\n');
  }

  /* ---------------------------------------------------- code highlighting */

  function pretty(body, lang) {
    if (lang === 'json' || lang === undefined) {
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch (e) {
        /* not JSON */
      }
    }
    return body;
  }

  function highlight(text, lang) {
    text = String(text == null ? '' : text);
    if (lang !== 'json' || text.length > 400000) return esc(text);
    var re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      if (m[1]) out += '<span class="' + (m[2] ? 'j-k' : 'j-s') + '">' + esc(m[1]) + '</span>' + (m[2] ? esc(m[2]) : '');
      else if (m[3]) out += '<span class="j-b">' + m[3] + '</span>';
      else out += '<span class="j-n">' + m[4] + '</span>';
      last = re.lastIndex;
    }
    return out + esc(text.slice(last));
  }

  function langOf(headers, body) {
    var ct = '';
    (headers || []).forEach(function (h) {
      if (String(h.key).toLowerCase() === 'content-type') ct = String(h.value).toLowerCase();
    });
    if (ct.indexOf('json') >= 0) return 'json';
    if (ct.indexOf('html') >= 0) return 'html';
    if (ct.indexOf('xml') >= 0) return 'xml';
    var t = String(body || '').trim();
    if (t.charAt(0) === '{' || t.charAt(0) === '[') return 'json';
    return 'text';
  }

  /* ------------------------------------------------------------ variables */

  function varsSignature() {
    return JSON.stringify([DATA.environments, DATA.collectionVars, DATA.activeEnvId]);
  }

  var STORE_KEY = 'p2u:' + hash(DATA.title || 'api');

  function loadStored() {
    if (IS_EDITOR) return null;
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function persist() {
    if (IS_EDITOR) return;
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ envId: S.envId, envs: S.envs, coll: S.coll, theme: S.themeChosen })
      );
    } catch (e) {
      /* storage blocked (e.g. sandboxed iframe) */
    }
  }

  function initVars(stored) {
    S.envs = {};
    (DATA.environments || []).forEach(function (e) {
      S.envs[e.id] = clone(e.values);
    });
    S.coll = clone(DATA.collectionVars || []);
    S.envId = DATA.activeEnvId && S.envs[DATA.activeEnvId] ? DATA.activeEnvId : null;
    if (stored) {
      if (stored.envId === null || S.envs[stored.envId]) S.envId = stored.envId;
      if (DATA.options.allowVarEdit) {
        Object.keys(stored.envs || {}).forEach(function (id) {
          if (S.envs[id] && Array.isArray(stored.envs[id])) S.envs[id] = stored.envs[id];
        });
        if (Array.isArray(stored.coll)) S.coll = stored.coll;
      }
    }
    S.varsSig = varsSignature();
  }

  function varMap() {
    var map = {};
    S.coll.forEach(function (v) {
      if (v.enabled !== false && v.key) map[v.key] = v.value;
    });
    (S.envs[S.envId] || []).forEach(function (v) {
      if (v.enabled !== false && v.key) map[v.key] = v.value;
    });
    return map;
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }

  var DYNAMIC = {
    $guid: uuid,
    $randomUUID: uuid,
    $timestamp: function () { return String(Math.floor(Date.now() / 1000)); },
    $isoTimestamp: function () { return new Date().toISOString(); },
    $randomInt: function () { return String(Math.floor(Math.random() * 1001)); },
    $randomEmail: function () { return 'user' + Math.floor(Math.random() * 100000) + '@example.com'; },
  };

  /** Replaces {{var}} placeholders. Unknown names are collected in `missing`. */
  function resolve(s, missing, map) {
    s = String(s == null ? '' : s);
    map = map || varMap();
    for (var depth = 0; depth < 5 && s.indexOf('{{') >= 0; depth++) {
      var changed = false;
      s = s.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (all, name) {
        if (Object.prototype.hasOwnProperty.call(map, name)) {
          changed = true;
          return map[name];
        }
        if (DYNAMIC[name]) {
          changed = true;
          return DYNAMIC[name]();
        }
        return all;
      });
      if (!changed) break;
    }
    if (missing) {
      s.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (_, name) {
        missing[name] = true;
      });
    }
    return s;
  }

  /* --------------------------------------------------------------- drafts */

  function splitUrl(raw) {
    var q = raw.indexOf('?');
    if (q < 0) return { base: raw, query: [] };
    return {
      base: raw.slice(0, q),
      query: raw
        .slice(q + 1)
        .split('&')
        .filter(Boolean)
        .map(function (p) {
          var e = p.indexOf('=');
          return e < 0 ? { key: p, value: '', enabled: true } : { key: p.slice(0, e), value: p.slice(e + 1), enabled: true };
        }),
    };
  }

  function fullUrl(d) {
    var q = d.query.filter(function (p) { return p.enabled && p.key; });
    return d.base + (q.length ? '?' + q.map(function (p) { return p.value === '' ? p.key : p.key + '=' + p.value; }).join('&') : '');
  }

  function pathVarNames(base) {
    var names = [];
    base.replace(/^[a-z]+:\/\//i, '').replace(/\/:([A-Za-z0-9_\-]+)/g, function (_, n) {
      if (names.indexOf(n) < 0) names.push(n);
    });
    return names;
  }

  function draft(id) {
    if (S.drafts[id]) return S.drafts[id];
    var r = S.index.get(id);
    var b = clone(r.body) || { mode: 'none' };
    b.raw = b.raw || '';
    b.language = b.language || 'json';
    b.urlencoded = b.urlencoded || [];
    b.formdata = b.formdata || [];
    b.graphql = b.graphql || { query: '', variables: '' };
    var d = {
      method: r.method,
      base: r.url,
      query: clone(r.query) || [],
      pathVars: clone(r.pathVars) || [],
      headers: clone(r.headers) || [],
      body: b,
      auth: clone(r.auth) || { type: 'none' },
      files: {},
      tab: r.pathVars && r.pathVars.length ? 'path' : b.mode !== 'none' ? 'body' : r.query && r.query.length ? 'params' : 'headers',
    };
    S.drafts[id] = d;
    return d;
  }

  function syncPathVars(d) {
    var names = pathVarNames(d.base);
    d.pathVars = names.map(function (n) {
      var old = d.pathVars.filter(function (p) { return p.key === n; })[0];
      return old || { key: n, value: '', enabled: true };
    });
  }

  function listOf(d, path) {
    if (path === 'urlencoded' || path === 'formdata') return d.body[path];
    return d[path];
  }

  /* ------------------------------------------------------ build requests */

  function encodeQ(s) {
    return s.replace(/[^A-Za-z0-9\-._~!$'()*,;:@/?%+=]/g, function (c) {
      return encodeURIComponent(c);
    });
  }

  function buildRequest(id) {
    var d = draft(id);
    var map = varMap();
    var missing = {};
    var skipped = [];
    var base = resolve(d.base, missing, map);
    d.pathVars.forEach(function (p) {
      var v = resolve(p.value, missing, map);
      base = base.replace(new RegExp('/:' + p.key.replace(/[-]/g, '\\-') + '(?=/|$|[?#.])', 'g'), '/' + (v === '' ? ':' + p.key : encodeURIComponent(v)));
    });
    var query = d.query
      .filter(function (p) { return p.enabled && p.key; })
      .map(function (p) {
        var k = encodeQ(resolve(p.key, missing, map));
        var v = resolve(p.value, missing, map);
        return p.value === '' ? k : k + '=' + encodeQ(v);
      });
    var headers = [];
    d.headers.forEach(function (h) {
      if (h.enabled && h.key) headers.push([resolve(h.key, missing, map), resolve(h.value, missing, map)]);
    });
    var a = d.auth;
    if (a.type === 'bearer' && a.token) headers.push(['Authorization', 'Bearer ' + resolve(a.token, missing, map)]);
    if (a.type === 'basic' && (a.username || a.password)) {
      var cred = resolve(a.username, missing, map) + ':' + resolve(a.password, missing, map);
      headers.push(['Authorization', 'Basic ' + btoa(unescape(encodeURIComponent(cred)))]);
    }
    if (a.type === 'apikey' && a.key) {
      var ak = resolve(a.key, missing, map);
      var av = resolve(a.value, missing, map);
      if (a.in === 'query') query.push(encodeQ(ak) + '=' + encodeQ(av));
      else headers.push([ak, av]);
    }
    var url = base + (query.length ? (base.indexOf('?') >= 0 ? '&' : '?') + query.join('&') : '');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && url) url = 'http://' + url;

    var hasCT = function () {
      return headers.some(function (h) { return h[0].toLowerCase() === 'content-type'; });
    };
    var body = null;
    var curlBody = [];
    var mode = d.method === 'GET' || d.method === 'HEAD' ? 'none' : d.body.mode;
    if (mode === 'raw') {
      body = resolve(d.body.raw, missing, map);
      if (!hasCT()) {
        var ct = { json: 'application/json', xml: 'application/xml', html: 'text/html', javascript: 'application/javascript' }[d.body.language] || 'text/plain';
        headers.push(['Content-Type', ct]);
      }
      curlBody.push(['--data-raw', body]);
    } else if (mode === 'graphql') {
      var vars = resolve(d.body.graphql.variables, missing, map).trim();
      var parsed = {};
      try { parsed = vars ? JSON.parse(vars) : {}; } catch (e) { parsed = {}; }
      body = JSON.stringify({ query: resolve(d.body.graphql.query, missing, map), variables: parsed });
      if (!hasCT()) headers.push(['Content-Type', 'application/json']);
      curlBody.push(['--data-raw', body]);
    } else if (mode === 'urlencoded') {
      var usp = new URLSearchParams();
      d.body.urlencoded.forEach(function (f) {
        if (f.enabled && f.key) usp.append(resolve(f.key, missing, map), resolve(f.value, missing, map));
      });
      body = usp;
      curlBody.push(['--data', usp.toString()]);
    } else if (mode === 'formdata') {
      var fd = new FormData();
      d.body.formdata.forEach(function (f, i) {
        if (!f.enabled || !f.key) return;
        var k = resolve(f.key, missing, map);
        if (f.type === 'file') {
          var file = d.files[i];
          if (file) fd.append(k, file, file.name);
          curlBody.push(['-F', k + '=@' + (file ? file.name : 'file')]);
        } else {
          var v = resolve(f.value, missing, map);
          fd.append(k, v);
          curlBody.push(['-F', k + '=' + v]);
        }
      });
      body = fd;
      // Browser must set the multipart boundary itself.
      headers = headers.filter(function (h) { return h[0].toLowerCase() !== 'content-type'; });
    }
    var sendHeaders = headers.filter(function (h) {
      if (FORBIDDEN_HEADER.test(h[0])) {
        skipped.push(h[0]);
        return false;
      }
      return true;
    });
    return { method: d.method, url: url, headers: headers, sendHeaders: sendHeaders, body: body, curlBody: curlBody, missing: Object.keys(missing), skipped: skipped };
  }

  function shq(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
  }

  function curl(id) {
    var r = buildRequest(id);
    var parts = ['curl' + (r.method === 'GET' ? '' : ' -X ' + r.method) + ' ' + shq(r.url)];
    r.headers.forEach(function (h) { parts.push('-H ' + shq(h[0] + ': ' + h[1])); });
    r.curlBody.forEach(function (b) { parts.push(b[0] + ' ' + shq(b[1])); });
    return parts.join(' \\\n  ');
  }

  /* ----------------------------------------------------------- send/fetch */

  function send(id) {
    if (S.sending[id]) {
      S.sending[id].abort('cancelled');
      return;
    }
    var r = buildRequest(id);
    if (!r.url) return toast('Enter a URL first.');
    var ctrl = new AbortController();
    S.sending[id] = ctrl;
    var timeout = Math.max(1, Number(DATA.options.timeoutSec) || 30) * 1000;
    var timer = setTimeout(function () { ctrl.abort('timeout'); }, timeout);
    renderConsoleParts(id);
    var started = performance.now();
    var init = { method: r.method, headers: r.sendHeaders, signal: ctrl.signal };
    if (r.body !== null) init.body = r.body;
    fetch(r.url, init)
      .then(function (res) {
        return res.arrayBuffer().then(function (buf) {
          var ct = res.headers.get('content-type') || '';
          var headers = [];
          res.headers.forEach(function (v, k) { headers.push({ key: k, value: v, enabled: true }); });
          var out = {
            status: res.status,
            statusText: res.statusText,
            time: Math.round(performance.now() - started),
            size: buf.byteLength,
            headers: headers,
            contentType: ct,
          };
          if (/^image\//i.test(ct)) out.image = URL.createObjectURL(new Blob([buf], { type: ct }));
          else out.body = new TextDecoder().decode(buf);
          out.language = langOf(headers, out.body);
          return out;
        });
      })
      .catch(function (err) {
        var reason = ctrl.signal.reason;
        var msg;
        if (reason === 'timeout') msg = 'Request timed out after ' + timeout / 1000 + 's.';
        else if (reason === 'cancelled') msg = 'Request cancelled.';
        else {
          msg = 'Could not reach the server (' + (err && err.message ? err.message : err) + ').';
          var hints = [
            'The API may not allow requests from this page (CORS). The server must send an Access-Control-Allow-Origin header.',
            'Check the URL, your network connection and that the server is running.',
          ];
          if (location.protocol === 'https:' && /^http:/i.test(r.url)) hints.unshift('This page is HTTPS but the API is HTTP. Browsers block this (mixed content).');
          return { error: msg, hints: hints, time: Math.round(performance.now() - started) };
        }
        return { error: msg, hints: [], time: Math.round(performance.now() - started) };
      })
      .then(function (out) {
        clearTimeout(timer);
        delete S.sending[id];
        out.skipped = r.skipped;
        var old = S.responses[id];
        if (old && old.image) URL.revokeObjectURL(old.image);
        S.responses[id] = out;
        renderConsoleParts(id);
      });
  }

  /* --------------------------------------------------------------- toast */

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('p2u-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'p2u-toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  function copy(text) {
    var done = function () { toast('Copied to clipboard'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }

  /* ---------------------------------------------------------------- theme */

  function applyTheme() {
    var t = DATA.theme || {};
    var root = document.documentElement;
    root.style.setProperty('--p', /^#[0-9a-f]{3,8}$/i.test(t.primary || '') ? t.primary : '#2563eb');
    root.setAttribute('data-font', t.font || 'system');
    root.setAttribute('data-radius', t.radius || 'medium');
    root.setAttribute('data-density', t.density || 'comfortable');
    var mode = S.themeChosen || qs.get('theme') || t.mode || 'light';
    if (mode === 'system') mode = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
    var custom = document.getElementById('p2u-custom');
    if (IS_EDITOR && custom) custom.textContent = t.customCss || '';
  }

  /* --------------------------------------------------------------- index */

  function buildIndex() {
    S.index = new Map();
    S.parent = new Map();
    (function walk(items, parent) {
      items.forEach(function (n) {
        S.index.set(n.id, n);
        S.parent.set(n.id, parent);
        if (n.kind === 'folder') walk(n.children, n.id);
      });
    })(DATA.items || [], null);
    Object.keys(S.drafts).forEach(function (id) {
      if (!S.index.has(id)) delete S.drafts[id];
    });
  }

  function ancestors(id) {
    var out = [];
    var p = S.parent.get(id);
    while (p) {
      out.unshift(S.index.get(p));
      p = S.parent.get(p);
    }
    return out;
  }

  function countRequests(items) {
    var n = 0;
    items.forEach(function (i) { n += i.kind === 'folder' ? countRequests(i.children) : 1; });
    return n;
  }

  /* ---------------------------------------------------------------- shell */

  function renderShell() {
    var hideSidebar = qs.get('sidebar') === '0';
    app.innerHTML =
      '<div class="shell' + (hideSidebar ? ' no-sb' : '') + '">' +
      '<aside class="sb" id="sb"></aside>' +
      '<div class="sb-backdrop" data-act="close-sb"></div>' +
      '<main class="main" id="main"></main>' +
      '</div><div id="modal"></div>';
    renderSidebar();
  }

  function renderSidebar() {
    var sb = document.getElementById('sb');
    var envs = DATA.environments || [];
    var t = DATA.theme || {};
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var showVars = envs.length || (DATA.collectionVars || []).length;
    sb.innerHTML =
      '<div class="sb-head"><a class="brand" href="#/" data-nav=""><span class="brand-dot"></span><span class="brand-title">' + esc(DATA.title) + '</span></a>' +
      (t.allowToggle !== false ? '<button class="icon-btn" data-act="toggle-theme" title="Toggle dark mode">' + (dark ? ICON.sun : ICON.moon) + '</button>' : '') +
      '</div>' +
      (showVars
        ? '<div class="sb-env">' +
          (envs.length
            ? '<select id="env-select" aria-label="Environment"><option value="">No environment</option>' +
              envs.map(function (e) {
                return '<option value="' + esc(e.id) + '"' + (e.id === S.envId ? ' selected' : '') + '>' + esc(e.name) + '</option>';
              }).join('') + '</select>'
            : '<span class="muted small">Collection variables</span>') +
          '<button class="icon-btn" data-act="vars" title="Variables">' + ICON.vars + '</button></div>'
        : '') +
      '<div class="sb-search">' + ICON.search + '<input id="search" type="search" placeholder="Search APIs" value="' + esc(S.search) + '"></div>' +
      '<nav class="tree" id="tree"></nav>';
    renderTree();
  }

  function matches(n, q) {
    if (!q) return true;
    if (n.kind === 'folder') return n.name.toLowerCase().indexOf(q) >= 0 || n.children.some(function (c) { return matches(c, q); });
    return (n.name + ' ' + n.method + ' ' + n.url).toLowerCase().indexOf(q) >= 0;
  }

  function renderTree() {
    var tree = document.getElementById('tree');
    if (!tree) return;
    var q = S.search.trim().toLowerCase();
    var html = (function walk(items, depth) {
      return items
        .filter(function (n) { return matches(n, q); })
        .map(function (n) {
          var pad = ' style="padding-left:' + (10 + depth * 14) + 'px"';
          if (n.kind === 'folder') {
            var open = q || !S.collapsed.has(n.id);
            return '<div class="tf' + (open ? ' open' : '') + '">' +
              '<div class="tf-row' + (S.current === n.id ? ' active' : '') + '"' + pad + '>' +
              '<button class="chev" data-act="toggle-folder" data-id="' + esc(n.id) + '" aria-label="Toggle folder">' + ICON.chev + '</button>' +
              '<a href="#/' + esc(n.id) + '" data-nav="' + esc(n.id) + '" class="tf-name">' + esc(n.name) + '</a></div>' +
              (open ? '<div class="tf-body">' + walk(n.children, depth + 1) + '</div>' : '') +
              '</div>';
          }
          return '<a class="tr' + (S.current === n.id ? ' active' : '') + '" href="#/' + esc(n.id) + '" data-nav="' + esc(n.id) + '"' + pad + '>' +
            '<span class="' + methodClass(n.method) + '">' + esc(n.method) + '</span><span class="tr-name">' + esc(n.name) + '</span></a>';
        })
        .join('');
    })(DATA.items || [], 0);
    tree.innerHTML = html || '<div class="muted small pad">No APIs match your search.</div>';
  }

  /* ----------------------------------------------------------------- main */

  function topbar() {
    return '<div class="topbar"><button class="icon-btn" data-act="open-sb" aria-label="Menu">' + ICON.menu + '</button><span class="topbar-title">' + esc(DATA.title) + '</span></div>';
  }

  function renderMain() {
    var main = document.getElementById('main');
    var node = S.current ? S.index.get(S.current) : null;
    var html;
    if (!node) html = overviewPage();
    else if (node.kind === 'folder') html = folderPage(node);
    else html = requestPage(node);
    main.innerHTML = topbar() + html;
    if (node && node.kind === 'request' && DATA.options.showTryIt !== false) renderConsoleParts(node.id);
  }

  function endpointList(items) {
    var rows = [];
    (function walk(list, prefix) {
      list.forEach(function (n) {
        if (n.kind === 'folder') walk(n.children, prefix.concat(n.name));
        else rows.push({ n: n, path: prefix.join(' / ') });
      });
    })(items, []);
    if (!rows.length) return '<p class="muted">No APIs.</p>';
    return '<div class="ep-list">' + rows.map(function (r) {
      return '<a class="ep" href="#/' + esc(r.n.id) + '" data-nav="' + esc(r.n.id) + '"><span class="' + methodClass(r.n.method) + '">' + esc(r.n.method) + '</span>' +
        '<span class="ep-name">' + esc(r.n.name) + (r.path ? '<span class="muted small"> · ' + esc(r.path) + '</span>' : '') + '</span>' +
        '<code class="ep-url">' + esc(r.n.url) + '</code></a>';
    }).join('') + '</div>';
  }

  function overviewPage() {
    var envs = DATA.environments || [];
    return '<div class="page narrow">' +
      '<div class="eyebrow">API Reference</div><h1 class="title">' + esc(DATA.title) + '</h1>' +
      '<div class="meta muted small">' + countRequests(DATA.items || []) + ' endpoints' + (envs.length ? ' · ' + envs.length + ' environment' + (envs.length > 1 ? 's' : '') : '') + '</div>' +
      (DATA.description ? '<div class="md">' + md(DATA.description) + '</div>' : '') +
      '<h2 class="section">Endpoints</h2>' + endpointList(DATA.items || []) +
      '</div>';
  }

  function crumbs(id) {
    var a = ancestors(id);
    return '<div class="crumbs"><a href="#/" data-nav="">Overview</a>' + a.map(function (f) {
      return '<span>/</span><a href="#/' + esc(f.id) + '" data-nav="' + esc(f.id) + '">' + esc(f.name) + '</a>';
    }).join('') + '</div>';
  }

  function folderPage(f) {
    return '<div class="page narrow">' + crumbs(f.id) + '<h1 class="title">' + esc(f.name) + '</h1>' +
      (f.description ? '<div class="md">' + md(f.description) + '</div>' : '') +
      '<h2 class="section">Endpoints</h2>' + endpointList(f.children) + '</div>';
  }

  function docTable(title, rows, showType) {
    rows = (rows || []).filter(function (r) { return r.key; });
    if (!rows.length) return '';
    return '<h3 class="sub">' + esc(title) + '</h3><div class="tbl-wrap"><table class="params"><thead><tr><th>Name</th>' + (showType ? '<th>Type</th>' : '') + '<th>Value</th><th>Description</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr' + (r.enabled === false ? ' class="off"' : '') + '><td><code>' + esc(r.key) + '</code>' + (r.enabled === false ? ' <span class="muted small">(optional)</span>' : '') + '</td>' +
          (showType ? '<td class="muted">' + esc(r.type || 'text') + '</td>' : '') +
          '<td><code class="val">' + esc(r.value) + '</code></td><td class="md-cell">' + (r.description ? md(r.description) : '<span class="muted">—</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function authLabel(a) {
    return { bearer: 'Bearer token', basic: 'Basic auth', apikey: 'API key (' + (a.in === 'query' ? 'query' : 'header') + ': ' + (a.key || '') + ')', unsupported: a.note || 'Unsupported' }[a.type] || '';
  }

  function examplesBlock(r) {
    if (DATA.options.showExamples === false || !r.examples || !r.examples.length) return '';
    var idx = Math.min(S.exTab[r.id] || 0, r.examples.length - 1);
    var ex = r.examples[idx];
    var lang = ex.language || langOf(ex.headers, ex.body);
    return '<h2 class="section">Examples</h2><div class="card ex">' +
      '<div class="tabs ex-tabs">' + r.examples.map(function (e, i) {
        return '<button class="tab' + (i === idx ? ' on' : '') + '" data-act="ex-tab" data-i="' + i + '"><span class="' + statusClass(e.code) + '">' + esc(e.code) + '</span> ' + esc(e.name) + '</button>';
      }).join('') + '</div>' +
      '<div class="ex-body"><div class="ex-meta"><span class="' + statusClass(ex.code) + '">' + esc(ex.code) + ' ' + esc(ex.status || '') + '</span>' +
      '<button class="btn ghost sm" data-act="copy-ex" data-i="' + idx + '">' + ICON.copy + ' Copy</button></div>' +
      (ex.headers && ex.headers.length ? '<details class="hdrs"><summary>Headers (' + ex.headers.length + ')</summary>' + kvView(ex.headers) + '</details>' : '') +
      (ex.body ? '<pre class="code"><code>' + highlight(pretty(ex.body, lang), lang) + '</code></pre>' : '<div class="muted small pad">No body</div>') +
      '</div></div>';
  }

  function kvView(list) {
    return '<table class="kv-view">' + list.map(function (h) {
      return '<tr><td>' + esc(h.key) + '</td><td>' + esc(h.value) + '</td></tr>';
    }).join('') + '</table>';
  }

  function requestPage(r) {
    var showTry = DATA.options.showTryIt !== false;
    var layout = (DATA.theme && DATA.theme.layout) || 'side-by-side';
    var body = r.body || { mode: 'none' };
    var bodyDoc = '';
    if (body.mode === 'raw' && body.raw) bodyDoc = '<h3 class="sub">Body <span class="muted small">' + esc(body.language || 'text') + '</span></h3><pre class="code"><code>' + highlight(pretty(body.raw, body.language), body.language) + '</code></pre>';
    else if (body.mode === 'urlencoded') bodyDoc = docTable('Body (form URL-encoded)', body.urlencoded);
    else if (body.mode === 'formdata') bodyDoc = docTable('Body (multipart form)', body.formdata, true);
    else if (body.mode === 'graphql') bodyDoc = '<h3 class="sub">GraphQL query</h3><pre class="code"><code>' + esc(body.graphql.query) + '</code></pre>' + (body.graphql.variables ? '<h3 class="sub">Variables</h3><pre class="code"><code>' + highlight(pretty(body.graphql.variables, 'json'), 'json') + '</code></pre>' : '');
    var auth = r.auth && r.auth.type !== 'none' ? '<div class="auth-line"><span class="muted">Authorization:</span> ' + esc(authLabel(r.auth)) + '</div>' : '';
    var full = r.url + (r.query && r.query.some(function (q) { return q.enabled; }) ? '?' + r.query.filter(function (q) { return q.enabled; }).map(function (q) { return q.key + (q.value !== '' ? '=' + q.value : ''); }).join('&') : '');

    var docs =
      crumbs(r.id) +
      '<h1 class="title">' + esc(r.name) + '</h1>' +
      '<div class="endpoint"><span class="' + methodClass(r.method) + '">' + esc(r.method) + '</span><code>' + esc(full) + '</code>' +
      '<button class="icon-btn" data-act="copy-url" title="Copy URL">' + ICON.copy + '</button></div>' +
      auth +
      (r.description ? '<div class="md">' + md(r.description) + '</div>' : '') +
      (r.docs ? '<div class="md docs-extra">' + md(r.docs) + '</div>' : '') +
      (!r.description && !r.docs ? '<p class="muted">No description.</p>' : '') +
      (r.pathVars.length || r.query.length || r.headers.length || bodyDoc ? '<h2 class="section">Request</h2>' : '') +
      docTable('Path variables', r.pathVars) +
      docTable('Query parameters', r.query) +
      docTable('Headers', r.headers) +
      bodyDoc +
      examplesBlock(r);

    if (!showTry) return '<div class="page narrow">' + docs + '</div>';
    return '<div class="page req layout-' + esc(layout) + '"><div class="doc-col">' + docs + '</div>' +
      '<div class="try-col"><div class="card console" id="console">' + consoleHtml(r) + '</div></div></div>';
  }

  /* -------------------------------------------------------------- console */

  function kvEditor(list, path, opts) {
    opts = opts || {};
    return '<table class="kv-edit"><tbody>' + list.map(function (row, i) {
      var attrs = ' data-kv="' + path + '" data-i="' + i + '"';
      var valueCell;
      if (opts.files && row.type === 'file') {
        valueCell = '<input type="file"' + attrs + ' data-file="1">';
      } else {
        valueCell = '<input' + attrs + ' data-k="value" value="' + esc(row.value) + '" placeholder="value"' + (row.type === 'secret' ? ' type="password"' : '') + '>';
      }
      return '<tr>' +
        (opts.fixedKeys ? '' : '<td class="c-chk"><input type="checkbox"' + attrs + ' data-k="enabled"' + (row.enabled ? ' checked' : '') + '></td>') +
        '<td><input' + attrs + ' data-k="key" value="' + esc(row.key) + '" placeholder="key"' + (opts.fixedKeys ? ' readonly' : '') + '></td>' +
        (opts.files ? '<td class="c-type"><select' + attrs + ' data-k="type"><option value="text"' + (row.type !== 'file' ? ' selected' : '') + '>Text</option><option value="file"' + (row.type === 'file' ? ' selected' : '') + '>File</option></select></td>' : '') +
        '<td>' + valueCell + '</td>' +
        (opts.fixedKeys ? '' : '<td class="c-del"><button class="icon-btn" data-act="kv-del"' + attrs + ' title="Remove">' + ICON.x + '</button></td>') +
        '</tr>';
    }).join('') + '</tbody></table>' +
      (opts.fixedKeys ? '' : '<button class="btn ghost sm" data-act="kv-add" data-kv="' + path + '">+ Add</button>');
  }

  function consoleHtml(r) {
    var d = draft(r.id);
    return '<div class="con-head">' +
      '<select class="method-sel ' + methodClass(d.method) + '" data-f="method">' + METHODS.concat(METHODS.indexOf(d.method) < 0 ? [d.method] : []).map(function (m) {
        return '<option' + (m === d.method ? ' selected' : '') + '>' + m + '</option>';
      }).join('') + '</select>' +
      '<input class="url-input" data-f="url" spellcheck="false" value="' + esc(fullUrl(d)) + '">' +
      '<button class="btn primary" data-act="send" id="send-btn">Send</button></div>' +
      '<div class="tabs" id="con-tabs"></div><div class="tab-body" id="con-tab"></div>' +
      '<div class="con-foot"><div id="con-warn" class="con-warn"></div><div class="con-actions">' +
      (DATA.options.showCurl !== false ? '<button class="btn ghost sm" data-act="copy-curl">' + ICON.copy + ' cURL</button>' : '') +
      '<button class="btn ghost sm" data-act="reset">Reset</button></div></div>' +
      '<div class="resp" id="resp"></div>';
  }

  function renderConsoleParts(id) {
    if (S.current !== id || !$('#console')) return;
    var d = draft(id);
    var n = function (l) { return l.filter(function (x) { return x.enabled && x.key; }).length; };
    var tabs = [
      ['params', 'Params', n(d.query)],
      ['path', 'Path', d.pathVars.length],
      ['headers', 'Headers', n(d.headers)],
      ['body', 'Body', d.body.mode !== 'none' ? '•' : 0],
      ['auth', 'Auth', d.auth.type !== 'none' ? '•' : 0],
    ].filter(function (t) { return t[0] !== 'path' || d.pathVars.length; });
    if (!tabs.some(function (t) { return t[0] === d.tab; })) d.tab = 'params';
    $('#con-tabs').innerHTML = tabs.map(function (t) {
      return '<button class="tab' + (d.tab === t[0] ? ' on' : '') + '" data-act="con-tab" data-tab="' + t[0] + '">' + t[1] + (t[2] ? ' <span class="count">' + t[2] + '</span>' : '') + '</button>';
    }).join('');
    renderTab(id);
    renderWarn(id);
    var btn = $('#send-btn');
    btn.textContent = S.sending[id] ? 'Cancel' : 'Send';
    btn.classList.toggle('danger', !!S.sending[id]);
    renderResponse(id);
  }

  function renderTab(id) {
    var d = draft(id);
    var el = $('#con-tab');
    var h = '';
    if (d.tab === 'params') h = kvEditor(d.query, 'query');
    else if (d.tab === 'path') h = '<p class="muted small">Values replace <code>:name</code> segments in the URL.</p>' + kvEditor(d.pathVars, 'pathVars', { fixedKeys: true });
    else if (d.tab === 'headers') h = kvEditor(d.headers, 'headers');
    else if (d.tab === 'body') {
      var modes = [['none', 'None'], ['raw', 'Raw'], ['urlencoded', 'URL-encoded'], ['formdata', 'Form data'], ['graphql', 'GraphQL']];
      h = '<div class="radio-row">' + modes.map(function (m) {
        return '<label><input type="radio" name="bm" data-f="bodyMode" value="' + m[0] + '"' + (d.body.mode === m[0] ? ' checked' : '') + '> ' + m[1] + '</label>';
      }).join('') + '</div>';
      if (d.method === 'GET' || d.method === 'HEAD') h += '<p class="muted small">Body is not sent with ' + d.method + ' requests in browsers.</p>';
      if (d.body.mode === 'raw') {
        h += '<div class="raw-bar"><select data-f="bodyLang">' + ['json', 'text', 'xml', 'html', 'javascript'].map(function (l) {
          return '<option' + (d.body.language === l ? ' selected' : '') + '>' + l + '</option>';
        }).join('') + '</select>' + (d.body.language === 'json' ? '<button class="btn ghost sm" data-act="beautify">Beautify</button>' : '') + '</div>' +
          '<textarea class="code-input" data-f="bodyRaw" spellcheck="false" rows="10">' + esc(d.body.raw) + '</textarea>';
      } else if (d.body.mode === 'urlencoded') h += kvEditor(d.body.urlencoded, 'urlencoded');
      else if (d.body.mode === 'formdata') h += kvEditor(d.body.formdata, 'formdata', { files: true });
      else if (d.body.mode === 'graphql') {
        h += '<label class="lbl">Query</label><textarea class="code-input" data-f="gqlQuery" spellcheck="false" rows="8">' + esc(d.body.graphql.query) + '</textarea>' +
          '<label class="lbl">Variables (JSON)</label><textarea class="code-input" data-f="gqlVars" spellcheck="false" rows="4">' + esc(d.body.graphql.variables) + '</textarea>';
      }
    } else if (d.tab === 'auth') {
      var a = d.auth;
      h = '<div class="form-row"><label class="lbl">Type</label><select data-f="authType">' + [['none', 'No auth'], ['bearer', 'Bearer token'], ['basic', 'Basic auth'], ['apikey', 'API key']].map(function (o) {
        return '<option value="' + o[0] + '"' + (a.type === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + (a.type === 'unsupported' ? '<option value="unsupported" selected>Unsupported</option>' : '') + '</select></div>';
      var field = function (label, key, type) {
        return '<div class="form-row"><label class="lbl">' + label + '</label><input data-f="auth" data-k="' + key + '" value="' + esc(a[key] || '') + '"' + (type ? ' type="' + type + '"' : '') + '></div>';
      };
      if (a.type === 'bearer') h += field('Token', 'token');
      if (a.type === 'basic') h += field('Username', 'username') + field('Password', 'password', 'password');
      if (a.type === 'apikey') {
        h += field('Key', 'key') + field('Value', 'value') + '<div class="form-row"><label class="lbl">Add to</label><select data-f="auth" data-k="in"><option value="header"' + (a.in !== 'query' ? ' selected' : '') + '>Header</option><option value="query"' + (a.in === 'query' ? ' selected' : '') + '>Query params</option></select></div>';
      }
      if (a.type === 'unsupported') h += '<p class="muted small">' + esc(a.note || '') + '</p>';
      h += '<p class="muted small">Tip: use <code>{{variable}}</code> to read values from the environment.</p>';
    }
    el.innerHTML = h;
  }

  function renderWarn(id) {
    var el = $('#con-warn');
    if (!el) return;
    var r = buildRequest(id);
    var msgs = [];
    if (r.missing.length) msgs.push('Unresolved variables: ' + r.missing.map(function (m) { return '<code>{{' + esc(m) + '}}</code>'; }).join(' ') + (DATA.options.allowVarEdit !== false ? ' <button class="link" data-act="vars">Set values</button>' : ''));
    el.innerHTML = msgs.join('<br>');
  }

  function renderResponse(id) {
    var el = $('#resp');
    if (!el) return;
    var res = S.responses[id];
    if (S.sending[id]) {
      el.innerHTML = '<div class="resp-empty"><span class="spinner"></span> Sending request…</div>';
      return;
    }
    if (!res) {
      el.innerHTML = '<div class="resp-empty muted">Click <b>Send</b> to run this request and see the response here.</div>';
      return;
    }
    if (res.error) {
      el.innerHTML = '<div class="resp-err"><b>' + esc(res.error) + '</b>' + (res.hints.length ? '<ul>' + res.hints.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
      return;
    }
    var tab = S.respTab[id] || 'body';
    var prettyOn = S.respPretty[id] !== false;
    var body = res.body || '';
    var shown = prettyOn ? pretty(body, res.language) : body;
    var content;
    if (tab === 'headers') content = kvView(res.headers);
    else if (res.image) content = '<div class="img-wrap"><img src="' + res.image + '" alt="Response image"></div>';
    else if (!body) content = '<div class="muted small pad">Empty body</div>';
    else if (res.language === 'html' && prettyOn) content = '<iframe class="html-frame" sandbox="" srcdoc="' + esc(body) + '"></iframe>';
    else content = '<pre class="code resp-code"><code>' + (prettyOn ? highlight(shown, res.language) : esc(shown)) + '</code></pre>';

    el.innerHTML =
      '<div class="resp-head"><span class="' + statusClass(res.status) + '">' + res.status + ' ' + esc(res.statusText || '') + '</span>' +
      '<span class="muted small">' + res.time + ' ms · ' + fmtSize(res.size) + '</span><span class="grow"></span>' +
      (IS_EDITOR ? '<button class="btn sm primary-soft" data-act="save-example">Save as example</button>' : '') +
      '</div>' +
      (res.skipped && res.skipped.length ? '<div class="muted small pad-x">Browser does not allow setting: ' + esc(res.skipped.join(', ')) + '</div>' : '') +
      '<div class="tabs resp-tabs"><button class="tab' + (tab === 'body' ? ' on' : '') + '" data-act="resp-tab" data-tab="body">Body</button>' +
      '<button class="tab' + (tab === 'headers' ? ' on' : '') + '" data-act="resp-tab" data-tab="headers">Headers <span class="count">' + res.headers.length + '</span></button>' +
      '<span class="grow"></span>' +
      (tab === 'body' && !res.image ? '<label class="small muted pretty-toggle"><input type="checkbox" data-act="pretty"' + (prettyOn ? ' checked' : '') + '> Pretty</label><button class="btn ghost sm" data-act="copy-resp">' + ICON.copy + '</button>' : '') +
      '</div>' + content;
  }

  /* ----------------------------------------------------- variables modal */

  function renderModal() {
    var m = document.getElementById('modal');
    if (!S.modal) {
      m.innerHTML = '';
      return;
    }
    var editable = DATA.options.allowVarEdit !== false;
    var envs = DATA.environments || [];
    var env = envs.filter(function (e) { return e.id === S.envId; })[0];
    var table = function (list, scope) {
      if (!list.length && !editable) return '<p class="muted small">No variables.</p>';
      return '<table class="kv-edit"><thead><tr><th></th><th>Variable</th><th>Value</th><th></th></tr></thead><tbody>' + list.map(function (v, i) {
        var a = ' data-vs="' + scope + '" data-i="' + i + '"' + (editable ? '' : ' disabled');
        return '<tr><td class="c-chk"><input type="checkbox"' + a + ' data-k="enabled"' + (v.enabled !== false ? ' checked' : '') + '></td>' +
          '<td><input' + a + ' data-k="key" value="' + esc(v.key) + '"></td>' +
          '<td><input' + a + ' data-k="value" value="' + esc(v.value) + '"' + (v.type === 'secret' ? ' type="password"' : '') + '></td>' +
          '<td class="c-del">' + (editable ? '<button class="icon-btn" data-act="var-del"' + a + '>' + ICON.x + '</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>' + (editable ? '<button class="btn ghost sm" data-act="var-add" data-vs="' + scope + '">+ Add variable</button>' : '');
    };
    m.innerHTML = '<div class="modal-bg" data-act="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-label="Variables">' +
      '<div class="modal-head"><h2>Variables</h2><button class="icon-btn" data-act="close-modal" aria-label="Close">' + ICON.x + '</button></div>' +
      '<div class="modal-body">' +
      (envs.length ? '<div class="form-row"><label class="lbl">Active environment</label><select id="env-select-modal">' +
        '<option value="">No environment</option>' + envs.map(function (e) {
          return '<option value="' + esc(e.id) + '"' + (e.id === S.envId ? ' selected' : '') + '>' + esc(e.name) + '</option>';
        }).join('') + '</select></div>' : '') +
      (env ? '<h3 class="sub">' + esc(env.name) + '</h3>' + table(S.envs[env.id], 'env') : '') +
      '<h3 class="sub">Collection variables</h3>' + table(S.coll, 'coll') +
      '<p class="muted small">Use variables as <code>{{name}}</code> in URLs, headers and bodies. Environment values override collection values.' + (IS_EDITOR ? ' Changes here are for testing only. Edit defaults in the generator.' : ' Your changes are saved in this browser.') + '</p>' +
      '</div><div class="modal-foot">' + (editable ? '<button class="btn ghost" data-act="vars-reset">Reset to defaults</button>' : '') + '<span class="grow"></span><button class="btn primary" data-act="close-modal">Done</button></div>' +
      '</div></div>';
  }

  function varsList(scope) {
    return scope === 'env' ? S.envs[S.envId] : S.coll;
  }

  function setEnv(id) {
    S.envId = id && S.envs[id] ? id : null;
    persist();
    renderSidebar();
    if (S.modal) renderModal();
    if (S.current && $('#console')) renderWarn(S.current);
  }

  /* ----------------------------------------------------------- navigation */

  function navigate(id, silent) {
    id = id && S.index.has(id) ? id : null;
    S.current = id;
    document.body.classList.remove('sb-open');
    if (id) ancestors(id).forEach(function (f) { S.collapsed.delete(f.id); });
    if (!IS_EDITOR) {
      var h = id ? '#/' + encodeURIComponent(id) : '#/';
      if (location.hash !== h && !(h === '#/' && !location.hash)) {
        try { history.pushState(null, '', h); } catch (e) { location.hash = h; }
      }
    }
    renderTree();
    renderMain();
    var main = document.getElementById('main');
    if (main) main.scrollTop = 0;
    if (!silent) post({ type: 'navigate', id: id });
  }

  function idFromHash() {
    return decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  }

  /* --------------------------------------------------------------- events */

  function onInput(e) {
    var t = e.target;
    if (t.id === 'search') {
      S.search = t.value;
      renderTree();
      return;
    }
    var id = S.current;
    if (t.dataset.vs) {
      var list = varsList(t.dataset.vs);
      var row = list && list[+t.dataset.i];
      if (!row) return;
      if (t.dataset.k === 'enabled') row.enabled = t.checked;
      else row[t.dataset.k] = t.value;
      persist();
      if (id && $('#console')) renderWarn(id);
      return;
    }
    if (!id || !S.index.has(id) || S.index.get(id).kind !== 'request') return;
    var d = draft(id);
    if (t.dataset.kv) {
      var l = listOf(d, t.dataset.kv);
      var item = l[+t.dataset.i];
      if (!item) return;
      if (t.dataset.file) {
        d.files[+t.dataset.i] = t.files && t.files[0];
      } else if (t.dataset.k === 'enabled') item.enabled = t.checked;
      else if (t.dataset.k === 'type') {
        item.type = t.value;
        renderTab(id);
      } else item[t.dataset.k] = t.value;
      if (t.dataset.kv === 'query') {
        var urlInput = $('.url-input');
        if (urlInput) urlInput.value = fullUrl(d);
      }
      if (e.type === 'change') renderConsoleTabsOnly(id);
      renderWarn(id);
      return;
    }
    switch (t.dataset.f) {
      case 'url': {
        var parts = splitUrl(t.value);
        d.base = parts.base;
        var disabled = d.query.filter(function (q) { return !q.enabled; });
        d.query = parts.query.map(function (q) {
          var old = d.query.filter(function (o) { return o.key === q.key && o.enabled; })[0];
          if (old && old.description) q.description = old.description;
          return q;
        }).concat(disabled);
        var before = d.pathVars.map(function (p) { return p.key; }).join();
        syncPathVars(d);
        if (d.tab === 'params' || before !== d.pathVars.map(function (p) { return p.key; }).join()) renderConsoleTabsOnly(id, true);
        renderWarn(id);
        break;
      }
      case 'method':
        d.method = t.value;
        t.className = 'method-sel ' + methodClass(d.method);
        break;
      case 'bodyMode':
        d.body.mode = t.value;
        renderConsoleTabsOnly(id, true);
        break;
      case 'bodyLang':
        d.body.language = t.value;
        renderTab(id);
        break;
      case 'bodyRaw':
        d.body.raw = t.value;
        renderWarn(id);
        break;
      case 'gqlQuery':
        d.body.graphql.query = t.value;
        break;
      case 'gqlVars':
        d.body.graphql.variables = t.value;
        break;
      case 'authType':
        d.auth = { type: t.value, in: 'header' };
        renderConsoleTabsOnly(id, true);
        break;
      case 'auth':
        d.auth[t.dataset.k] = t.value;
        renderWarn(id);
        break;
    }
  }

  /** Re-renders tab headers (counts) and optionally the tab content. */
  function renderConsoleTabsOnly(id, withBody) {
    var focused = document.activeElement;
    var keep = focused && focused.dataset && focused.dataset.kv ? [focused.dataset.kv, focused.dataset.i, focused.dataset.k] : null;
    var tabsEl = $('#con-tabs');
    if (!tabsEl) return;
    var scroll = $('#con-tab').scrollTop;
    renderConsoleParts(id);
    if (!withBody && keep) {
      var again = $('[data-kv="' + keep[0] + '"][data-i="' + keep[1] + '"][data-k="' + keep[2] + '"]');
      if (again) again.focus();
    }
    $('#con-tab').scrollTop = scroll;
  }

  function onClick(e) {
    var navEl = e.target.closest('[data-nav]');
    if (navEl && app.contains(navEl)) {
      e.preventDefault();
      navigate(navEl.getAttribute('data-nav') || null);
      return;
    }
    var a = e.target.closest('[data-act]');
    if (!a) return;
    var act = a.dataset.act;
    if (act === 'close-modal' && a.classList.contains('modal-bg') && e.target !== a) return;
    if (act === 'pretty') {
      S.respPretty[S.current] = a.checked;
      renderResponse(S.current);
      return;
    }
    e.preventDefault();
    var id = S.current;
    var d = id && S.index.has(id) && S.index.get(id).kind === 'request' ? draft(id) : null;
    switch (act) {
      case 'toggle-folder':
        if (S.collapsed.has(a.dataset.id)) S.collapsed.delete(a.dataset.id);
        else S.collapsed.add(a.dataset.id);
        renderTree();
        break;
      case 'toggle-theme':
        S.themeChosen = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme();
        persist();
        renderSidebar();
        break;
      case 'open-sb':
        document.body.classList.add('sb-open');
        break;
      case 'close-sb':
        document.body.classList.remove('sb-open');
        break;
      case 'vars':
        S.modal = 'vars';
        renderModal();
        break;
      case 'close-modal':
        S.modal = null;
        renderModal();
        break;
      case 'var-add':
        if (a.dataset.vs === 'env' && !S.envs[S.envId]) break;
        varsList(a.dataset.vs).push({ key: '', value: '', enabled: true });
        persist();
        renderModal();
        break;
      case 'var-del':
        varsList(a.dataset.vs).splice(+a.dataset.i, 1);
        persist();
        renderModal();
        if (id && $('#console')) renderWarn(id);
        break;
      case 'vars-reset':
        initVars(null);
        persist();
        renderSidebar();
        renderModal();
        if (id && $('#console')) renderWarn(id);
        break;
      case 'con-tab':
        d.tab = a.dataset.tab;
        renderConsoleParts(id);
        break;
      case 'kv-add':
        listOf(d, a.dataset.kv).push(a.dataset.kv === 'formdata' ? { key: '', value: '', enabled: true, type: 'text' } : { key: '', value: '', enabled: true });
        renderConsoleParts(id);
        break;
      case 'kv-del': {
        var i = +a.dataset.i;
        listOf(d, a.dataset.kv).splice(i, 1);
        if (a.dataset.kv === 'formdata') {
          var files = {};
          Object.keys(d.files).forEach(function (k) {
            if (+k < i) files[k] = d.files[k];
            else if (+k > i) files[+k - 1] = d.files[k];
          });
          d.files = files;
        }
        if (a.dataset.kv === 'query') $('.url-input').value = fullUrl(d);
        renderConsoleParts(id);
        break;
      }
      case 'beautify':
        try {
          d.body.raw = JSON.stringify(JSON.parse(d.body.raw), null, 2);
          renderTab(id);
        } catch (err) {
          toast('Body is not valid JSON');
        }
        break;
      case 'send':
        send(id);
        break;
      case 'reset':
        delete S.drafts[id];
        delete S.responses[id];
        renderMain();
        break;
      case 'copy-curl':
        copy(curl(id));
        break;
      case 'copy-url':
        copy(buildRequest(id).url);
        break;
      case 'copy-resp':
        copy(S.responses[id].body || '');
        break;
      case 'copy-ex':
        copy(S.index.get(id).examples[+a.dataset.i].body || '');
        break;
      case 'ex-tab':
        S.exTab[id] = +a.dataset.i;
        renderMain();
        break;
      case 'resp-tab':
        S.respTab[id] = a.dataset.tab;
        renderResponse(id);
        break;
      case 'save-example': {
        var res = S.responses[id];
        if (!res || res.error) break;
        post({
          type: 'saveExample',
          requestId: id,
          example: {
            name: res.status + ' ' + (res.statusText || 'Response'),
            code: res.status,
            status: res.statusText || '',
            headers: res.headers,
            body: res.image ? '' : pretty(res.body || '', res.language),
            language: res.language,
          },
        });
        toast('Saved as example');
        break;
      }
    }
  }

  function onChange(e) {
    var t = e.target;
    if (t.id === 'env-select' || t.id === 'env-select-modal') {
      setEnv(t.value);
      return;
    }
    if (t.type === 'checkbox' || t.tagName === 'SELECT' || t.type === 'file' || t.type === 'radio') onInput(e);
  }

  /* ------------------------------------------------------ editor bridge */

  window.addEventListener('message', function (e) {
    if (!IS_EDITOR || e.source !== window.parent) return;
    var msg = e.data || {};
    if (msg.source !== 'p2u-parent') return;
    if (msg.type === 'update' && msg.data) {
      var prevCurrent = S.current;
      DATA = msg.data;
      DATA.editorMode = true;
      buildIndex();
      if (varsSignature() !== S.varsSig) initVars(null);
      applyTheme();
      document.title = DATA.title;
      var main = document.getElementById('main');
      var scroll = main ? main.scrollTop : 0;
      renderSidebar();
      S.current = prevCurrent && S.index.has(prevCurrent) ? prevCurrent : null;
      renderTree();
      renderMain();
      if (S.modal) renderModal();
      main = document.getElementById('main');
      if (main) main.scrollTop = scroll;
    } else if (msg.type === 'select') {
      if (msg.id !== S.current) navigate(msg.id, true);
    }
  });

  /* ----------------------------------------------------------------- init */

  function init() {
    buildIndex();
    var stored = loadStored();
    initVars(stored);
    if (stored && stored.theme) S.themeChosen = stored.theme;
    applyTheme();
    if (window.matchMedia) {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (!S.themeChosen && (DATA.theme || {}).mode === 'system') {
          applyTheme();
          renderSidebar();
        }
      });
    }
    renderShell();
    app.addEventListener('input', onInput);
    app.addEventListener('change', onChange);
    app.addEventListener('click', onClick);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && S.modal) {
        S.modal = null;
        renderModal();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && S.current && $('#console')) {
        e.preventDefault();
        send(S.current);
      }
    });
    if (!IS_EDITOR) {
      window.addEventListener('popstate', function () { navigate(idFromHash(), true); });
      window.addEventListener('hashchange', function () {
        if (idFromHash() !== (S.current || '')) navigate(idFromHash(), true);
      });
    }
    navigate(IS_EDITOR ? null : idFromHash(), true);
    post({ type: 'ready' });
  }

  init();
})();
