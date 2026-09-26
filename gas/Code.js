/**
 * Scan300 fetch proxy.
 * The static frontend on GitHub Pages cannot read other sites (CORS), so it
 * asks this web app to fetch pages. GET-only towards the target sites.
 *
 * POST body (text/plain JSON):
 *   { action: 'page',  url: 'https://…', body: true }
 *   { action: 'multi', urls: ['https://…', …], body: false }
 */

var MAX_URLS = 30;
var MAX_BODY_CHARS = 1500000;
var MAX_HOPS = 6;

function doGet() {
  return json_({ ok: true, service: 'scan300-proxy' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: 'Invalid JSON' });
  }
  try {
    if (req.action === 'page') {
      return json_(fetchMany_([req.url], req.body !== false, true)[0]);
    }
    if (req.action === 'multi') {
      var urls = (req.urls || []).slice(0, MAX_URLS);
      return json_({ results: fetchMany_(urls, !!req.body, false) });
    }
    return json_({ error: 'Unknown action' });
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Only public http(s) URLs. */
function validUrl_(u) {
  if (typeof u !== 'string' || u.length > 2048) return false;
  var m = u.match(/^https?:\/\/([^\/?#:]+)(?::\d+)?(?:[\/?#]|$)/i);
  if (!m) return false;
  var host = m[1].toLowerCase();
  if (host === 'localhost' || /\.(local|internal|localhost)$/.test(host)) return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (host.indexOf('[') === 0 || host.indexOf(':') !== -1) return false;
  return true;
}

function resolve_(base, loc) {
  if (/^https?:\/\//i.test(loc)) return loc;
  var origin = base.match(/^(https?:\/\/[^\/?#]+)/i)[1];
  if (loc.indexOf('//') === 0) return base.split(':')[0] + ':' + loc;
  if (loc.charAt(0) === '/') return origin + loc;
  var dir = base.replace(/[?#].*$/, '').replace(/\/[^\/]*$/, '/');
  return dir + loc;
}

function lowerHeaders_(h) {
  var out = {};
  Object.keys(h || {}).forEach(function (k) {
    var v = h[k];
    out[k.toLowerCase()] = Array.isArray(v) ? v.join('\n') : String(v);
  });
  return out;
}

/**
 * Fetches all urls in parallel, following redirects manually so the
 * redirect chain can be reported.
 */
function fetchMany_(urls, withBody, timed) {
  var state = urls.map(function (u) {
    return { url: u, current: u, redirects: [], done: !validUrl_(u), error: validUrl_(u) ? null : 'Blocked or invalid URL' };
  });
  var t0 = Date.now();
  for (var hop = 0; hop <= MAX_HOPS; hop++) {
    var pending = state.filter(function (s) { return !s.done; });
    if (!pending.length) break;
    var reqs = pending.map(function (s) {
      return {
        url: s.current,
        method: 'get',
        followRedirects: false,
        muteHttpExceptions: true,
        validateHttpsCertificates: true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Scan300/1.0; +https://github.com)' }
      };
    });
    var responses;
    try {
      responses = UrlFetchApp.fetchAll(reqs);
    } catch (err) {
      // One bad host makes fetchAll throw; fall back to one-by-one.
      responses = reqs.map(function (r) {
        try { return UrlFetchApp.fetch(r.url, r); } catch (e2) { return e2; }
      });
    }
    pending.forEach(function (s, i) {
      var r = responses[i];
      if (!r || typeof r.getResponseCode !== 'function') {
        s.done = true;
        s.error = String(r && r.message || r || 'Fetch failed');
        return;
      }
      var code = r.getResponseCode();
      var headers = lowerHeaders_(r.getAllHeaders());
      if (code >= 300 && code < 400 && headers.location && hop < MAX_HOPS) {
        s.redirects.push({ url: s.current, status: code });
        var next = resolve_(s.current, headers.location.split('\n')[0]);
        if (!validUrl_(next)) { s.done = true; s.error = 'Redirect to blocked URL'; return; }
        s.current = next;
        return;
      }
      s.done = true;
      s.status = code;
      s.headers = headers;
      var bytes = r.getContent();
      s.size = bytes.length;
      if (withBody) {
        var ct = headers['content-type'] || '';
        var cs = (ct.match(/charset=([\w-]+)/i) || [])[1] || 'UTF-8';
        var text;
        try { text = r.getContentText(cs); } catch (e3) { text = r.getContentText('UTF-8'); }
        s.body = text.length > MAX_BODY_CHARS ? text.slice(0, MAX_BODY_CHARS) : text;
        s.truncated = text.length > MAX_BODY_CHARS;
      }
    });
  }
  var elapsed = Date.now() - t0;
  return state.map(function (s) {
    return {
      url: s.url,
      finalUrl: s.current,
      status: s.status || 0,
      headers: s.headers || {},
      body: s.body,
      truncated: !!s.truncated,
      size: s.size || 0,
      redirects: s.redirects,
      timeMs: timed ? elapsed : undefined,
      error: s.error || (s.done ? null : 'Too many redirects')
    };
  });
}

/** Run once from the editor to grant the UrlFetchApp permission. */
function authorize() {
  UrlFetchApp.fetch('https://example.com');
}
