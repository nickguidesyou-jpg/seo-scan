// Check registry, result helpers and the runner.

export const CHECKS = [];

/** Register a check. fn(home, scan) returns true | false | null | {s, d}. */
export function C(cat, sev, title, fn, fix) {
  CHECKS.push({ id: CHECKS.length + 1, cat, sev, title, fn, fix });
}

export const pass = d => ({ s: 'pass', d });
export const fail = d => ({ s: 'fail', d });
export const na = d => ({ s: 'na', d: d || 'Skipped — the element this check needs is missing (see related checks).' });

export const hostOf = u => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
export const isInternal = (s, u) => hostOf(u) === s.host;
/** Last meaningful path segment of a URL, for compact lists. */
export const fname = u => { try { const x = new URL(u, 'https://relative.invalid/'); return decodeURIComponent(x.pathname.split('/').filter(Boolean).pop() || x.hostname); } catch { return String(u); } };
export const short = u => (u || '').replace(/^https?:\/\/[^/]+/, '') || '/';
export const list = (arr, n = 4) => arr.slice(0, n).join(', ') + (arr.length > n ? ` +${arr.length - n} more` : '');
export const kb = b => (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB';
export const trunc = (s, n = 70) => (s = String(s ?? '')).length > n ? s.slice(0, n) + '…' : s;

/** Pass when `bad` is empty, otherwise fail and name the offenders. */
export function none(bad, noun = 'item', passMsg) {
  if (!bad.length) return pass(passMsg || `No problems found.`);
  return fail(`${bad.length} ${noun}${bad.length === 1 ? '' : 's'}: ${list(bad)}`);
}

/** Site-wide helper: pages (as paths) where pred(page) is true. */
export const pagesWhere = (s, pred) => s.pages.filter(pred).map(p => short(p.url));

export function sitewide(s, pred, noun = 'page') {
  if (s.pages.length < 2) return na('Only the homepage could be crawled.');
  return none(pagesWhere(s, pred), noun, `All ${s.pages.length} crawled pages pass.`);
}

export const isHttps = s => s.home.url.startsWith('https:');
export const words = t => (t || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

export function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  A.forEach(x => { if (B.has(x)) n++; });
  return n / (A.size + B.size - n);
}

export function dupes(values) {
  const seen = {}, out = new Set();
  values.forEach(([k, v]) => { if (!v) return; const key = v.toLowerCase().trim(); if (seen[key] && seen[key] !== k) out.add(v); seen[key] = seen[key] || k; });
  return [...out];
}

export const WEIGHT = { high: 3, medium: 2, low: 1 };

/** Failing checks ordered by impact (the order we tell people to fix them in). */
export const byImpact = results => results.filter(r => r.status === 'fail').sort((a, b) => WEIGHT[b.sev] - WEIGHT[a.sev] || a.id - b.id);

/** Score if the `n` highest-impact issues were fixed. */
export function projectScore(results, n) {
  const fixed = new Set(byImpact(results).slice(0, n).map(r => r.id));
  let got = 0, max = 0;
  results.forEach(r => {
    if (r.status === 'na') return;
    max += WEIGHT[r.sev];
    if (r.status === 'pass' || fixed.has(r.id)) got += WEIGHT[r.sev];
  });
  return max ? Math.round(100 * got / max) : 0;
}

export function runChecks(scan) {
  const results = CHECKS.map(c => {
    let r;
    try { r = c.fn(scan.home, scan); } catch (e) { console.warn(`Check #${c.id} failed to run:`, e); r = na('Could not evaluate this check.'); }
    if (r === true) r = pass('');
    else if (r === false) r = fail('');
    else if (r == null) r = na();
    return { ...c, status: r.s, detail: r.d || '' };
  });
  let got = 0, max = 0;
  results.forEach(r => {
    if (r.status === 'na') return;
    max += WEIGHT[r.sev];
    if (r.status === 'pass') got += WEIGHT[r.sev];
  });
  return { results, score: max ? Math.round(100 * got / max) : 0 };
}
