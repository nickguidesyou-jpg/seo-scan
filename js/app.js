import { scan, normalizeInput } from './crawler.js';
import { CHECKS, runChecks } from './checks/index.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CATS = [...new Set(CHECKS.map(c => c.cat))];
const SEV_ORDER = { high: 0, medium: 1, low: 2 };
const STATUS_ORDER = { fail: 0, pass: 1, na: 2 };

const CAT_BLURB = {
  'Crawlability & Indexing': ['robots.txt & sitemap', 'noindex & canonicals', 'Soft 404s'],
  'URLs & Redirects': ['HTTPS & www redirects', 'Redirect chains', 'Clean URL structure'],
  'Titles': ['Length & uniqueness', 'Keywords & brand', 'Duplicates site-wide'],
  'Meta Descriptions': ['Length & presence', 'Duplicates', 'Keyword use'],
  'Headings': ['One clear H1', 'Heading hierarchy', 'Site-wide H1s'],
  'Content': ['Thin & duplicate content', 'Readability', 'Trust pages'],
  'Links': ['Broken links', 'Anchor text', 'Orphan pages'],
  'Images': ['Alt text', 'File size & format', 'Lazy loading'],
  'Performance': ['Response time', 'Render-blocking JS', 'Caching & compression'],
  'Security': ['HTTPS & HSTS', 'Security headers', 'Mixed content'],
  'Mobile & Technical': ['Viewport', 'Charset & doctype', 'Mobile forms'],
  'Structured Data': ['JSON-LD validity', 'Organization & LocalBusiness', 'Product & Article'],
  'Social Sharing': ['Open Graph', 'Twitter/X cards', 'Share images'],
  'Accessibility': ['Labels & names', 'Landmarks', 'Language'],
  'International': ['lang attribute', 'hreflang', 'UTF-8'],
};

// ---------- Landing ----------
$('cat-grid').innerHTML = CATS.map(cat => `
  <div class="cat-card"><h3>${esc(cat)} <span>${CHECKS.filter(c => c.cat === cat).length}</span></h3>
  <ul>${(CAT_BLURB[cat] || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul></div>`).join('');

document.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => {
  $('url').value = b.dataset.try;
  $('scan-form').requestSubmit();
}));

// ---------- Scan ----------
let state = null;

$('scan-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('form-error').textContent = '';
  let url;
  try { url = normalizeInput($('url').value); } catch (err) { $('form-error').textContent = err.message; return; }

  const btn = $('scan-btn');
  btn.disabled = true;
  $('progress').hidden = false;
  $('progress').classList.remove('done');
  $('progress-host').textContent = new URL(url).hostname;
  $('progress-log').innerHTML = '';
  setProgress('Starting scan', 2);

  try {
    const data = await scan(url, setProgress);
    const { results, score } = runChecks(data);
    setProgress('Done', 100);
    $('progress').classList.add('done');
    state = { data, results, score, cat: 'all', status: 'fail', q: '' };
    history.replaceState(null, '', '?url=' + encodeURIComponent(data.host));
    renderResults();
  } catch (err) {
    $('form-error').textContent = err.message || 'Something went wrong. Please try again.';
    $('progress').hidden = true;
  } finally {
    btn.disabled = false;
  }
});

function setProgress(label, pct) {
  $('progress-bar').style.width = pct + '%';
  $('progress-pct').textContent = pct + '%';
  const log = $('progress-log');
  const last = log.lastElementChild;
  if (last && last.dataset.key === label.replace(/\s*\(.*\)$/, '')) { last.textContent = label; return; }
  const li = document.createElement('li');
  li.dataset.key = label.replace(/\s*\(.*\)$/, '');
  li.textContent = label;
  log.appendChild(li);
}

// ---------- Results ----------
function renderResults() {
  const { data, results, score } = state;
  $('results').hidden = false;
  $('res-host').textContent = data.host;
  $('res-meta').textContent = `${data.pages.length} page${data.pages.length === 1 ? '' : 's'} crawled · ${Object.keys(data.linkStatus).length} URLs checked · ${data.scannedAt.toLocaleString()}`;

  $('score').textContent = score;
  const fg = $('ring-fg');
  fg.style.stroke = score >= 80 ? 'var(--pass)' : score >= 55 ? 'var(--med)' : 'var(--high)';
  requestAnimationFrame(() => { fg.style.strokeDashoffset = 326.7 * (1 - score / 100); });

  const fails = results.filter(r => r.status === 'fail');
  const n = (st, sev) => results.filter(r => r.status === st && (!sev || r.sev === sev)).length;
  $('counts').innerHTML = [
    ['var(--high)', `${n('fail', 'high')} high`], ['var(--med)', `${n('fail', 'medium')} medium`],
    ['var(--low)', `${n('fail', 'low')} low`], ['var(--pass)', `${n('pass')} passed`], ['var(--na)', `${n('na')} n/a`],
  ].map(([c, t]) => `<span class="count"><i style="background:${c}"></i>${t}</span>`).join('');

  const top = fails.filter(r => r.sev === 'high').concat(fails.filter(r => r.sev === 'medium')).slice(0, 6);
  $('priorities').innerHTML = top.length ? `<h3>Fix these first</h3><div class="prio-list">${top.map(r =>
    `<button type="button" class="prio" data-jump="${r.id}" style="border-left-color:var(--${r.sev === 'high' ? 'high' : 'med'})"><small>${esc(r.cat)}</small><strong>${esc(r.title)}</strong>${r.detail ? `<span>${esc(r.detail.length > 90 ? r.detail.slice(0, 90) + '…' : r.detail)}</span>` : ''}</button>`).join('')}</div>` : '';

  $('pages-count').textContent = `(${data.pages.length})`;
  renderCats();
  renderChips();
  renderList();
  renderPages();
  $('results').scrollIntoView({ behavior: 'smooth' });
}

function renderCats() {
  const { results, cat } = state;
  const row = (key, label) => {
    const rs = key === 'all' ? results : results.filter(r => r.cat === key);
    const bad = rs.filter(r => r.status === 'fail').length;
    return `<button type="button" data-cat="${esc(key)}" class="${cat === key ? 'on' : ''}"><span>${esc(label)}</span><span class="n ${bad ? 'bad' : ''}">${bad ? bad + (bad === 1 ? ' issue' : ' issues') : '✓'}</span></button>`;
  };
  $('cats').innerHTML = row('all', 'All categories') + CATS.map(c => row(c, c)).join('');
}

function renderChips() {
  const { results, status } = state;
  const chips = [['fail', 'Issues'], ['pass', 'Passed'], ['na', 'Not applicable'], ['all', 'All 300']];
  $('status-chips').innerHTML = chips.map(([k, l]) => {
    const count = k === 'all' ? '' : ` (${results.filter(r => r.status === k).length})`;
    return `<button type="button" class="chip ${status === k ? 'on' : ''}" data-status="${k}">${l}${count}</button>`;
  }).join('');
}

function visible() {
  const { results, cat, status, q } = state;
  const qq = q.toLowerCase();
  return results
    .filter(r => (cat === 'all' || r.cat === cat) && (status === 'all' || r.status === status))
    .filter(r => !qq || (r.title + ' ' + r.detail + ' ' + r.fix + ' ' + r.cat).toLowerCase().includes(qq))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || SEV_ORDER[a.sev] - SEV_ORDER[b.sev] || a.id - b.id);
}

function renderList() {
  const rows = visible();
  if (!rows.length) {
    $('check-list').innerHTML = `<div class="empty">${state.status === 'fail' ? 'No issues here — nice work.' : 'No checks match.'}</div>`;
    return;
  }
  $('check-list').innerHTML = rows.map(r => {
    const icon = r.status === 'pass' ? '✓' : r.status === 'na' ? '–' : '!';
    return `<div class="check" id="c${r.id}">
      <button type="button" aria-expanded="false">
        <span class="ico ${r.status} ${r.sev}">${icon}</span>
        <span><span class="t">${esc(r.title)}</span>${r.detail ? `<span class="d">${esc(r.detail)}</span>` : ''}</span>
        <span class="meta">${r.status === 'fail' ? `<span class="sev ${r.sev}">${r.sev}</span>` : ''}</span>
      </button>
      <div class="fix"><b>${r.status === 'fail' ? 'How to fix' : 'Why it matters'}</b>${esc(r.fix)}<div class="cat-l">#${r.id} · ${esc(r.cat)} · ${r.sev} impact</div></div>
    </div>`;
  }).join('');
}

function renderPages() {
  const pages = state.data.pages;
  const lenCls = (v, lo, hi) => !v ? 'bad-txt' : v < lo || v > hi ? 'warn-txt' : '';
  $('pages-table').innerHTML = `<thead><tr><th>URL</th><th>Status</th><th>Title</th><th class="num">Len</th><th class="num">Desc len</th><th>H1</th><th class="num">Words</th><th class="num">Size</th><th>Indexable</th></tr></thead><tbody>` +
    pages.map(p => {
      const idx = !/noindex|none/.test(p.robotsMeta + p.xRobots) && (!p.canonical || p.canonical.replace(/\/$/, '') === p.url.replace(/\/$/, ''));
      const tl = (p.title || '').length, dl = (p.metaDesc || '').length;
      return `<tr>
        <td class="url"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.replace(/^https?:\/\/[^/]+/, '') || '/')}</a></td>
        <td class="num ${p.status === 200 ? 'ok-txt' : 'bad-txt'}">${p.status}</td>
        <td>${esc(p.title || '—')}</td>
        <td class="num ${lenCls(tl, 30, 60)}">${tl}</td>
        <td class="num ${lenCls(dl, 70, 160)}">${dl}</td>
        <td>${p.h1s.length > 1 ? `<span class="warn-txt">(${p.h1s.length}×)</span> ` : ''}${esc(p.h1s[0] || '—')}</td>
        <td class="num ${p.wordCount < 200 ? 'warn-txt' : ''}">${p.wordCount}</td>
        <td class="num">${(p.size / 1024).toFixed(0)} KB</td>
        <td class="${idx ? 'ok-txt' : 'warn-txt'}">${idx ? 'Yes' : 'No'}</td>
      </tr>`;
    }).join('') + '</tbody>';
}

// ---------- Interactions ----------
$('results').addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.cat) { state.cat = t.dataset.cat; renderCats(); renderList(); }
  else if (t.dataset.status) { state.status = t.dataset.status; renderChips(); renderList(); }
  else if (t.dataset.tab) {
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b === t));
    $('tab-checks').hidden = t.dataset.tab !== 'checks';
    $('tab-pages').hidden = t.dataset.tab !== 'pages';
  } else if (t.dataset.jump) {
    state.cat = 'all'; state.status = 'fail'; state.q = ''; $('search').value = '';
    renderCats(); renderChips(); renderList();
    const el = $('c' + t.dataset.jump);
    el.classList.add('open');
    el.querySelector('button').setAttribute('aria-expanded', 'true');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (t.parentElement.classList.contains('check')) {
    const open = t.parentElement.classList.toggle('open');
    t.setAttribute('aria-expanded', open);
  }
});

$('search').addEventListener('input', e => { state.q = e.target.value; renderList(); });
$('btn-new').addEventListener('click', () => {
  $('results').hidden = true;
  $('progress').hidden = true;
  $('url').value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $('url').focus();
});
$('btn-print').addEventListener('click', () => {
  state.status = 'fail'; state.cat = 'all'; state.q = '';
  renderChips(); renderCats(); renderList();
  window.print();
});
$('btn-csv').addEventListener('click', () => {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['#', 'Category', 'Check', 'Status', 'Impact', 'Details', 'How to fix']]
    .concat(state.results.map(r => [r.id, r.cat, r.title, r.status, r.sev, r.detail, r.fix]));
  const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `seo-audit-${state.data.host}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// Deep link: ?url=example.com starts a scan.
const pre = new URLSearchParams(location.search).get('url');
if (pre) { $('url').value = pre; $('scan-form').requestSubmit(); }
