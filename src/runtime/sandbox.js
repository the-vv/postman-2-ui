/*
 * Postman script sandbox.
 * Runs inside a Web Worker (no access to the page, its DOM or its storage). The console
 * sends one job per event (pre-request or test) with the scripts to run in order, a copy
 * of the variables, and the request / response. It replies with variable changes, the
 * (possibly modified) request, test results and console logs.
 */
'use strict';

self.onmessage = function (e) {
  run(e.data).then(
    function (res) {
      self.postMessage(res);
    },
    function (err) {
      self.postMessage({ ops: [], logs: [], tests: [], errors: [{ source: 'Scripts', message: errText(err) }] });
    }
  );
};

function errText(e) {
  if (!e) return 'Unknown error';
  if (e.name === 'AssertionError') return e.message;
  return (e.name && e.name !== 'Error' ? e.name + ': ' : '') + (e.message || String(e));
}

function has(o, k) {
  return o != null && Object.prototype.hasOwnProperty.call(o, k);
}

function show(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === undefined) return 'undefined';
  if (typeof v === 'function') return '[function]';
  try {
    var s = JSON.stringify(v);
    return s && s.length > 200 ? s.slice(0, 200) + '…' : String(s);
  } catch (err) {
    return String(v);
  }
}

function toStr(v) {
  if (v == null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return a !== a && b !== b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  var ka = Object.keys(a);
  var kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(function (k) {
    return has(b, k) && deepEq(a[k], b[k]);
  });
}

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/* ------------------------------------------------------------- assertions */

function AssertionError(message) {
  this.name = 'AssertionError';
  this.message = message;
}
AssertionError.prototype = Object.create(Error.prototype);

function isResponse(v) {
  return v && typeof v === 'object' && typeof v.code === 'number' && v.headers && typeof v.text === 'function';
}

/** A small chai-style `expect`, plus the response helpers Postman adds. */
function assertion(val, msg) {
  var flags = { neg: false, deep: false };
  var a = {};
  function check(ok, text) {
    if (flags.neg ? ok : !ok) {
      throw new AssertionError((msg ? msg + ': ' : '') + 'expected ' + (isResponse(val) ? 'response' : show(val)) + (flags.neg ? ' not ' : ' ') + text);
    }
    return a;
  }
  function word(name, fn) {
    Object.defineProperty(a, name, { get: fn, configurable: true });
  }
  ['to', 'be', 'been', 'is', 'that', 'which', 'and', 'has', 'have', 'with', 'at', 'of', 'same', 'does', 'but', 'itself', 'also', 'still'].forEach(function (w) {
    word(w, function () {
      return a;
    });
  });
  word('not', function () {
    flags.neg = !flags.neg;
    return a;
  });
  word('deep', function () {
    flags.deep = true;
    return a;
  });
  word('ok', function () {
    return isResponse(val) ? check(val.code >= 200 && val.code < 300, 'to be ok (2xx), got ' + val.code) : check(!!val, 'to be truthy');
  });
  word('true', function () { return check(val === true, 'to be true'); });
  word('false', function () { return check(val === false, 'to be false'); });
  word('null', function () { return check(val === null, 'to be null'); });
  word('undefined', function () { return check(val === undefined, 'to be undefined'); });
  word('NaN', function () { return check(val !== val, 'to be NaN'); });
  word('exist', function () { return check(val != null, 'to exist'); });
  word('empty', function () {
    var n = val == null ? 0 : typeof val === 'string' || Array.isArray(val) ? val.length : typeof val === 'object' ? Object.keys(val).length : 1;
    return check(n === 0, 'to be empty');
  });
  // Response helpers: pm.response.to.be.success, pm.expect(pm.response).to.be.json ...
  var codeRange = function (name, lo, hi) {
    word(name, function () {
      return check(isResponse(val) && val.code >= lo && val.code <= hi, 'to be ' + name + (isResponse(val) ? ', got ' + val.code : ''));
    });
  };
  codeRange('success', 200, 299);
  codeRange('info', 100, 199);
  codeRange('redirection', 300, 399);
  codeRange('clientError', 400, 499);
  codeRange('serverError', 500, 599);
  codeRange('error', 400, 599);
  word('accepted', function () { return check(val.code === 202, 'to be accepted (202)'); });
  word('badRequest', function () { return check(val.code === 400, 'to be 400'); });
  word('unauthorized', function () { return check(val.code === 401, 'to be 401'); });
  word('forbidden', function () { return check(val.code === 403, 'to be 403'); });
  word('notFound', function () { return check(val.code === 404, 'to be 404'); });
  word('rateLimited', function () { return check(val.code === 429, 'to be 429'); });
  word('json', function () {
    var ok = false;
    try { JSON.parse(val.text()); ok = true; } catch (err) { ok = false; }
    return check(ok, 'to have a JSON body');
  });
  word('withBody', function () { return check(isResponse(val) && val.text().length > 0, 'to have a body'); });

  a.equal = a.equals = a.eq = function (x) {
    return check(flags.deep ? deepEq(val, x) : val === x, 'to equal ' + show(x));
  };
  a.eql = a.eqls = function (x) { return check(deepEq(val, x), 'to deeply equal ' + show(x)); };
  a.above = a.gt = a.greaterThan = function (n) { return check(val > n, 'to be above ' + n); };
  a.below = a.lt = a.lessThan = function (n) { return check(val < n, 'to be below ' + n); };
  a.least = a.gte = function (n) { return check(val >= n, 'to be at least ' + n); };
  a.most = a.lte = function (n) { return check(val <= n, 'to be at most ' + n); };
  a.within = function (lo, hi) { return check(val >= lo && val <= hi, 'to be within ' + lo + '..' + hi); };
  a.a = a.an = function (type) {
    var t = String(type).toLowerCase();
    return check(typeOf(val) === t || (t === 'object' && typeOf(val) === 'object'), 'to be a ' + t);
  };
  a.include = a.includes = a.contain = a.contains = function (x) {
    var ok;
    if (typeof val === 'string') ok = val.indexOf(x) >= 0;
    else if (Array.isArray(val)) ok = val.some(function (v) { return flags.deep ? deepEq(v, x) : v === x; });
    else if (val && typeof val === 'object' && x && typeof x === 'object') ok = Object.keys(x).every(function (k) { return deepEq(val[k], x[k]); });
    else ok = false;
    return check(ok, 'to include ' + show(x));
  };
  a.string = function (s) { return check(typeof val === 'string' && val.indexOf(s) >= 0, 'to contain ' + show(s)); };
  a.match = a.matches = function (re) { return check(re.test(String(val)), 'to match ' + re); };
  a.oneOf = function (list) {
    return check(list.some(function (x) { return flags.deep ? deepEq(x, val) : x === val; }), 'to be one of ' + show(list));
  };
  a.lengthOf = a.length = function (n) { return check(val != null && val.length === n, 'to have length ' + n); };
  a.keys = a.key = a.all = function () {
    var ks = [].concat.apply([], arguments);
    return check(val != null && ks.every(function (k) { return has(val, k); }), 'to have keys ' + show(ks));
  };
  a.members = function (list) {
    return check(Array.isArray(val) && val.length === list.length && list.every(function (x) { return val.some(function (v) { return deepEq(v, x); }); }), 'to have members ' + show(list));
  };
  a.instanceOf = a.instanceof = function (C) { return check(val instanceof C, 'to be an instance of ' + (C && C.name)); };
  a.satisfy = function (fn) { return check(!!fn(val), 'to satisfy the given function'); };
  a.property = function (name, value) {
    var ok = val != null && name in Object(val);
    if (arguments.length > 1) return check(ok && (flags.deep ? deepEq(val[name], value) : val[name] === value), 'to have property ' + show(name) + ' of ' + show(value));
    check(ok, 'to have property ' + show(name));
    return flags.neg ? a : assertion(val[name], msg);
  };
  a.status = function (code) {
    var ok = typeof code === 'number' ? val.code === code : String(val.status).toLowerCase() === String(code).toLowerCase();
    return check(ok, 'to have status ' + code + ', got ' + val.code + ' ' + val.status);
  };
  a.header = function (key, value) {
    var h = val.headers;
    if (arguments.length > 1) return check(h.has(key) && h.get(key) === value, 'to have header ' + key + ': ' + value);
    return check(h.has(key), 'to have header ' + key);
  };
  a.body = function (b) {
    var t = val.text();
    if (b === undefined) return check(t.length > 0, 'to have a body');
    return check(b instanceof RegExp ? b.test(t) : t === toStr(b), 'to have body ' + show(b));
  };
  a.jsonBody = function (path, value) {
    var j;
    try { j = val.json(); } catch (err) { return check(false, 'to have a JSON body'); }
    if (path === undefined) return check(true, 'to have a JSON body');
    if (typeof path === 'object') return check(deepEq(j, path), 'to have JSON body ' + show(path));
    var cur = j;
    var found = String(path).split('.').every(function (p) {
      if (cur != null && p in Object(cur)) { cur = cur[p]; return true; }
      return false;
    });
    if (arguments.length > 1) return check(found && deepEq(cur, value), 'to have JSON ' + path + ' = ' + show(value));
    return check(found, 'to have JSON property ' + path);
  };
  a.responseTime = function () { return a; };
  return a;
}

/* -------------------------------------------------------------- headers */

function headerList(arr) {
  var list = (arr || []).map(function (h) { return { key: String(h.key), value: toStr(h.value) }; });
  var find = function (k) {
    k = String(k).toLowerCase();
    for (var i = 0; i < list.length; i++) if (list[i].key.toLowerCase() === k) return i;
    return -1;
  };
  var norm = function (h, v) {
    if (typeof h === 'string' && v === undefined && h.indexOf(':') > 0) {
      var i = h.indexOf(':');
      return { key: h.slice(0, i).trim(), value: h.slice(i + 1).trim() };
    }
    if (typeof h === 'string') return { key: h, value: toStr(v) };
    return { key: String(h.key), value: toStr(h.value) };
  };
  var api = {
    get: function (k) { var i = find(k); return i < 0 ? undefined : list[i].value; },
    has: function (k, v) { var i = find(k); return i >= 0 && (v === undefined || list[i].value === v); },
    add: function (h, v) { list.push(norm(h, v)); },
    append: function (h, v) { list.push(norm(h, v)); },
    upsert: function (h, v) {
      var n = norm(h, v);
      var i = find(n.key);
      if (i < 0) list.push(n);
      else list[i].value = n.value;
    },
    remove: function (k) {
      if (typeof k === 'function') list = list.filter(function (h) { return !k(h); });
      else { k = String(k).toLowerCase(); list = list.filter(function (h) { return h.key.toLowerCase() !== k; }); }
    },
    clear: function () { list = []; },
    all: function () { return list.slice(); },
    each: function (fn) { list.slice().forEach(fn); },
    map: function (fn) { return list.map(fn); },
    filter: function (fn) { return list.filter(fn); },
    count: function () { return list.length; },
    toObject: function () {
      var o = {};
      list.forEach(function (h) { o[h.key] = h.value; });
      return o;
    },
    toJSON: function () { return list.slice(); },
  };
  Object.defineProperty(api, 'members', { get: function () { return list; } });
  return api;
}

/* ---------------------------------------------------------------- run */

var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function run(job) {
  var ops = [];
  var logs = [];
  var tests = [];
  var errors = [];
  var pending = [];
  var source = '';
  var skip = false;
  var stores = {
    environment: Object.assign({}, job.vars.environment),
    collectionVariables: Object.assign({}, job.vars.collection),
    globals: Object.assign({}, job.vars.globals),
  };
  var locals = Object.assign({}, job.locals || {});

  function lookup(k) {
    if (has(locals, k)) return locals[k];
    if (has(stores.environment, k)) return stores.environment[k];
    if (has(stores.collectionVariables, k)) return stores.collectionVariables[k];
    if (has(stores.globals, k)) return stores.globals[k];
    return undefined;
  }
  function replaceIn(s) {
    return String(s == null ? '' : s).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (all, k) {
      var v = lookup(k);
      return v === undefined ? all : v;
    });
  }
  function scope(name) {
    var data = stores[name];
    return {
      get: function (k) { return has(data, k) ? data[k] : undefined; },
      set: function (k, v) {
        data[k] = toStr(v);
        ops.push({ scope: name, op: 'set', key: String(k), value: toStr(v) });
      },
      unset: function (k) {
        delete data[k];
        ops.push({ scope: name, op: 'unset', key: String(k) });
      },
      has: function (k) { return has(data, k); },
      clear: function () {
        Object.keys(data).forEach(function (k) { delete data[k]; });
        ops.push({ scope: name, op: 'clear' });
      },
      toObject: function () { return Object.assign({}, data); },
      replaceIn: replaceIn,
      name: name === 'environment' ? job.vars.environmentName || '' : name,
    };
  }

  function log(level) {
    return function () {
      logs.push({ level: level, source: source, text: [].slice.call(arguments).map(function (a) { return typeof a === 'string' ? a : show(a); }).join(' ') });
    };
  }
  var consoleApi = { log: log('log'), info: log('info'), warn: log('warn'), error: log('error'), debug: log('log') };

  /* request (pre-request scripts may change it) */
  var rq = null;
  if (job.request) {
    var r = job.request;
    var url = String(r.url);
    var hdrs = headerList(r.headers);
    var body = {
      mode: r.body.mode,
      raw: r.body.raw || '',
      urlencoded: headerList(r.body.urlencoded),
      formdata: headerList(r.body.formdata),
      graphql: r.body.graphql,
      update: function (b) {
        if (typeof b === 'string') { body.mode = 'raw'; body.raw = b; }
        else if (b) {
          if (b.mode) body.mode = b.mode;
          if (b.raw !== undefined) body.raw = toStr(b.raw);
          if (b.urlencoded) body.urlencoded = headerList(b.urlencoded);
        }
      },
      toString: function () { return body.raw; },
    };
    var queryApi = function () {
      var parse = function () {
        var i = url.indexOf('?');
        return i < 0 ? [] : url.slice(i + 1).split('&').filter(Boolean).map(function (p) {
          var e = p.indexOf('=');
          return e < 0 ? { key: p, value: '' } : { key: p.slice(0, e), value: p.slice(e + 1) };
        });
      };
      var write = function (list) {
        var base = url.split('?')[0];
        url = base + (list.length ? '?' + list.map(function (q) { return q.value === '' ? q.key : q.key + '=' + q.value; }).join('&') : '');
      };
      return {
        all: parse,
        get: function (k) { var f = parse().filter(function (q) { return q.key === k; })[0]; return f && f.value; },
        has: function (k) { return parse().some(function (q) { return q.key === k; }); },
        add: function (q) { var l = parse(); l.push(typeof q === 'string' ? { key: q.split('=')[0], value: q.split('=').slice(1).join('=') } : { key: q.key, value: toStr(q.value) }); write(l); },
        upsert: function (q) {
          var l = parse();
          var f = l.filter(function (x) { return x.key === q.key; })[0];
          if (f) f.value = toStr(q.value);
          else l.push({ key: q.key, value: toStr(q.value) });
          write(l);
        },
        remove: function (k) { write(parse().filter(function (q) { return q.key !== k; })); },
        toObject: function () { var o = {}; parse().forEach(function (q) { o[q.key] = q.value; }); return o; },
      };
    };
    var urlApi = function () {
      return {
        toString: function () { return url; },
        update: function (u) { url = String(u); },
        getHost: function () { return url.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0]; },
        getPath: function () { var m = url.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0]; return m || '/'; },
        getQueryString: function () { var i = url.indexOf('?'); return i < 0 ? '' : url.slice(i + 1); },
        query: queryApi(),
      };
    };
    rq = {
      method: r.method,
      name: job.info.requestName,
      id: job.info.requestId,
      get url() { return urlApi(); },
      set url(u) { url = String(u); },
      get headers() { return hdrs; },
      get body() { return body; },
      set body(b) { body.update(b); },
      addHeader: function (h, v) { hdrs.add(h, v); },
      removeHeader: function (k) { hdrs.remove(k); },
      upsertHeader: function (h, v) { hdrs.upsert(h, v); },
      addQueryParams: function (qs) { [].concat(qs).forEach(function (q) { urlApi().query.add(q); }); },
      removeQueryParams: function (ks) { [].concat(ks).forEach(function (k) { urlApi().query.remove(k); }); },
      toJSON: function () { return { method: rq.method, url: url, headers: hdrs.all(), body: { mode: body.mode, raw: body.raw } }; },
    };
  }

  /* response (test scripts) */
  var rs = null;
  if (job.response) {
    var res = job.response;
    rs = {
      code: res.code,
      status: res.status,
      responseTime: res.responseTime,
      responseSize: res.responseSize,
      headers: headerList(res.headers),
      text: function () { return res.body; },
      json: function () { return JSON.parse(res.body); },
      reason: function () { return res.status; },
    };
    Object.defineProperty(rs, 'to', { get: function () { return assertion(rs); } });
  }

  function makeResponse(code, status, time, headers, text) {
    var o = {
      code: code,
      status: status,
      responseTime: time,
      headers: headerList(headers),
      text: function () { return text; },
      json: function () { return JSON.parse(text); },
    };
    Object.defineProperty(o, 'to', { get: function () { return assertion(o); } });
    return o;
  }

  function sendRequest(req, cb) {
    var src = source;
    var p = (async function () {
      var url2;
      var init = { method: 'GET', headers: {} };
      if (typeof req === 'string') url2 = replaceIn(req);
      else {
        url2 = replaceIn(String(req.url));
        init.method = String(req.method || 'GET').toUpperCase();
        var h = req.header || req.headers || [];
        if (typeof h === 'string') {
          h = h.split('\n').filter(function (l) { return l.indexOf(':') > 0; }).map(function (l) {
            var c = l.indexOf(':');
            return { key: l.slice(0, c).trim(), value: l.slice(c + 1).trim() };
          });
        }
        if (Array.isArray(h)) h.forEach(function (x) { init.headers[replaceIn(x.key)] = replaceIn(x.value); });
        else if (h && typeof h === 'object') Object.keys(h).forEach(function (k) { init.headers[k] = replaceIn(h[k]); });
        var b = req.body;
        if (b && init.method !== 'GET' && init.method !== 'HEAD') {
          if (b.mode === 'urlencoded') {
            var usp = new URLSearchParams();
            (b.urlencoded || []).forEach(function (x) { usp.append(replaceIn(x.key), replaceIn(x.value)); });
            init.body = usp;
          } else if (b.mode === 'formdata') {
            var fd = new FormData();
            (b.formdata || []).forEach(function (x) { fd.append(replaceIn(x.key), replaceIn(x.value)); });
            init.body = fd;
          } else if (b.raw !== undefined) init.body = replaceIn(typeof b.raw === 'string' ? b.raw : JSON.stringify(b.raw));
        }
      }
      var t0 = Date.now();
      var resp = await fetch(url2, init);
      var text = await resp.text();
      var hs = [];
      resp.headers.forEach(function (v, k) { hs.push({ key: k, value: v }); });
      return makeResponse(resp.status, resp.statusText, Date.now() - t0, hs, text);
    })();
    var out = p.then(
      function (r2) {
        if (cb) {
          try { cb(null, r2); } catch (err) { errors.push({ source: src, message: errText(err) }); }
        }
        return r2;
      },
      function (err) {
        var e2 = new Error('pm.sendRequest failed: ' + (err && err.message) + ' (the API may block browser requests, CORS)');
        if (cb) {
          try { cb(e2, null); } catch (err2) { errors.push({ source: src, message: errText(err2) }); }
          return null;
        }
        throw e2;
      }
    );
    pending.push(out.then(null, function () {}));
    return out;
  }

  function test(name, fn) {
    var t = { name: String(name), pass: true, error: '', source: source };
    tests.push(t);
    if (typeof fn !== 'function') { t.skipped = true; return; }
    var fail = function (err) { t.pass = false; t.error = errText(err); };
    try {
      if (fn.length >= 1) {
        pending.push(new Promise(function (resolve) {
          fn(function (err) { if (err) fail(err); resolve(); });
        }));
      } else {
        var ret = fn();
        if (ret && typeof ret.then === 'function') pending.push(ret.then(null, fail));
      }
    } catch (err) {
      fail(err);
    }
  }
  test.skip = function (name) { tests.push({ name: String(name), pass: true, skipped: true, source: source }); };

  var unsupported = function (what) {
    return function () { logs.push({ level: 'warn', source: source, text: what + ' is not supported in the browser console and was ignored.' }); };
  };

  var pm = {
    environment: scope('environment'),
    collectionVariables: scope('collectionVariables'),
    globals: scope('globals'),
    variables: {
      get: lookup,
      set: function (k, v) { locals[k] = toStr(v); },
      has: function (k) { return lookup(k) !== undefined; },
      unset: function (k) { delete locals[k]; },
      replaceIn: replaceIn,
      toObject: function () { return Object.assign({}, stores.globals, stores.collectionVariables, stores.environment, locals); },
    },
    iterationData: { get: function () { return undefined; }, has: function () { return false; }, toObject: function () { return {}; } },
    request: rq,
    response: rs,
    info: { eventName: job.event, requestName: job.info.requestName, requestId: job.info.requestId, iteration: 0, iterationCount: 1 },
    test: test,
    expect: function (v, m) { return assertion(v, m); },
    sendRequest: sendRequest,
    cookies: { get: function () { return undefined; }, has: function () { return false; }, toObject: function () { return {}; }, jar: unsupported('pm.cookies.jar') },
    visualizer: { set: unsupported('pm.visualizer') },
    execution: {
      skipRequest: function () { skip = true; },
      setNextRequest: unsupported('pm.execution.setNextRequest'),
      location: [],
    },
    setNextRequest: unsupported('setNextRequest'),
  };

  var postman = {
    setEnvironmentVariable: function (k, v) { pm.environment.set(k, v); },
    getEnvironmentVariable: function (k) { return pm.environment.get(k); },
    clearEnvironmentVariable: function (k) { pm.environment.unset(k); },
    clearEnvironmentVariables: function () { pm.environment.clear(); },
    setGlobalVariable: function (k, v) { pm.globals.set(k, v); },
    getGlobalVariable: function (k) { return pm.globals.get(k); },
    clearGlobalVariable: function (k) { pm.globals.unset(k); },
    clearGlobalVariables: function () { pm.globals.clear(); },
    getResponseHeader: function (k) { return rs ? rs.headers.get(k) : undefined; },
    setNextRequest: unsupported('postman.setNextRequest'),
  };

  var requireFn = function (name) {
    throw new Error("require('" + name + "') is not available in the browser console");
  };

  async function drain() {
    while (pending.length) {
      var batch = pending.splice(0);
      await Promise.all(batch.map(function (p) { return p.then(null, function () {}); }));
    }
  }

  for (var i = 0; i < job.scripts.length; i++) {
    var s = job.scripts[i];
    source = s.source;
    var legacyTests = {};
    var respHeaders = rs ? rs.headers.toObject() : {};
    try {
      var fn = new AsyncFunction(
        'pm', 'postman', 'tests', 'responseBody', 'responseCode', 'responseHeaders', 'responseTime',
        'environment', 'globals', 'request', 'console', 'require',
        s.code
      );
      await fn(
        pm, postman, legacyTests,
        rs ? rs.text() : undefined,
        rs ? { code: rs.code, name: rs.status, detail: rs.status } : undefined,
        respHeaders,
        rs ? rs.responseTime : undefined,
        Object.assign({}, stores.environment),
        Object.assign({}, stores.globals),
        rq ? { url: String(rq.url), method: rq.method, headers: rq.headers.toObject(), data: rq.body.raw } : undefined,
        consoleApi,
        requireFn
      );
      await drain();
    } catch (err) {
      await drain();
      errors.push({ source: s.source, message: errText(err) });
    }
    Object.keys(legacyTests).forEach(function (name) {
      tests.push({ name: name, pass: !!legacyTests[name], error: legacyTests[name] ? '' : 'returned false', source: s.source });
    });
  }

  return {
    ops: ops,
    logs: logs,
    tests: tests,
    errors: errors,
    locals: locals,
    skip: skip,
    request: rq ? { method: String(rq.method).toUpperCase(), url: url, headers: hdrs.all(), body: { mode: body.mode, raw: body.raw, urlencoded: body.urlencoded.all() } } : null,
  };
}
