// Orchestrates one scan: homepage → site files → crawl → links → assets.
import { fetchPage, fetchMany } from './api.js';
import { parsePage, safeHost } from './parse.js';

const MAX_PAGES = 25;
const MAX_LINKS = 40;
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|zip|rar|mp4|mp3|mov|docx?|xlsx?|pptx?|ico|css|js|xml|txt|json)(\?|$)/i;

export function normalizeInput(input) {
  let s = (input || '').trim();
  if (!s) throw new Error('Please enter a website address.');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { throw new Error('That does not look like a valid web address.'); }
  if (!u.hostname.includes('.')) throw new Error('That does not look like a valid web address.');
  return u.href;
}

function parseRobots(text) {
  const groups = [];
  let cur = null;
  const sitemaps = [];
  (text || '').split(/\r?\n/).forEach(line => {
    const l = line.replace(/#.*/, '').trim();
    const m = l.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) return;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'sitemap') { sitemaps.push(val); return; }
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if (cur && (key === 'disallow' || key === 'allow')) cur.rules.push({ type: key, path: val });
    else if (cur && key === 'crawl-delay') cur.delay = +val;
  });
  const star = groups.find(g => g.agents.includes('*')) || { rules: [], delay: null };
  const gbot = groups.find(g => g.agents.some(a => a.includes('googlebot'))) || null;
  const blocksAll = g => g && g.rules.some(r => r.type === 'disallow' && r.path === '/') && !g.rules.some(r => r.type === 'allow' && r.path === '/');
  return {
    groups, sitemaps, star, gbot,
    blocksAll: blocksAll(star) || blocksAll(gbot),
    disallow: star.rules.filter(r => r.type === 'disallow' && r.path).map(r => r.path),
    isDisallowed(path) {
      const rules = (gbot || star).rules.filter(r => r.path);
      let best = null;
      rules.forEach(r => {
        const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
        if (re.test(path) && (!best || r.path.length > best.path.length)) best = r;
      });
      return !!best && best.type === 'disallow';
    },
  };
}

function parseSitemap(res) {
  const text = res && res.status === 200 ? res.body || '' : '';
  const locs = [...text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)].map(m => m[1].replace(/&amp;/g, '&'));
  return {
    url: res && res.url, status: res ? res.status : 0, ok: !!text && /<(urlset|sitemapindex)/i.test(text),
    isIndex: /<sitemapindex/i.test(text), urls: locs, count: locs.length,
    hasLastmod: /<lastmod>/i.test(text), contentType: res && res.headers ? res.headers['content-type'] || '' : '',
    size: res ? res.size : 0,
  };
}

const stripHash = u => u.split('#')[0];

export async function scan(input, onStep = () => {}) {
  const start = normalizeInput(input);
  onStep('Fetching homepage', 5);
  const homeRes = await fetchPage(start, true);
  if (!homeRes || homeRes.error || !homeRes.status) {
    throw new Error(`Could not reach ${start}${homeRes && homeRes.error ? ' — ' + homeRes.error : ''}`);
  }
  const home = parsePage(homeRes);
  const homeUrl = new URL(home.url);
  const origin = homeUrl.origin;
  const host = homeUrl.hostname;
  const altHost = host.startsWith('www.') ? host.slice(4) : 'www.' + host;
  const rand = 'scan300-' + Math.random().toString(36).slice(2, 10);

  onStep('Checking robots.txt, sitemap, redirects and 404 handling', 15);
  const [robotsRes, sitemapRes, httpRes, altRes, notFoundRes, faviconRes, securityRes, llmsRes] = await fetchMany([
    origin + '/robots.txt', origin + '/sitemap.xml', 'http://' + host + '/', homeUrl.protocol + '//' + altHost + '/',
    origin + '/' + rand, origin + '/favicon.ico', origin + '/.well-known/security.txt', origin + '/llms.txt',
  ], true);

  const robotsOk = robotsRes.status === 200 && !/<html/i.test(robotsRes.body || '');
  const robots = { status: robotsRes.status, ok: robotsOk, text: robotsOk ? robotsRes.body : '', size: robotsRes.size, ...parseRobots(robotsOk ? robotsRes.body : '') };

  let sitemap = parseSitemap(sitemapRes);
  const declared = robots.sitemaps.find(s => /^https?:/.test(s));
  if (!sitemap.ok && declared && declared !== origin + '/sitemap.xml') {
    const [r] = await fetchMany([declared], true);
    sitemap = parseSitemap(r);
  }
  if (sitemap.ok && sitemap.isIndex && sitemap.urls[0]) {
    const [child] = await fetchMany([sitemap.urls[0]], true);
    const c = parseSitemap(child);
    sitemap.childUrls = c.urls;
    sitemap.childHasLastmod = c.hasLastmod;
  }
  const sitemapPageUrls = sitemap.isIndex ? sitemap.childUrls || [] : sitemap.urls;

  onStep('Crawling internal pages', 30);
  const seen = new Set([stripHash(start), stripHash(home.url)]);
  const queue = [];
  const add = u => {
    if (!u) return;
    const s = stripHash(u);
    if (seen.has(s) || SKIP_EXT.test(s) || safeHost(s) !== host || !/^https?:/.test(s)) return;
    seen.add(s); queue.push(s);
  };
  home.links.filter(l => l.internal && l.http).forEach(l => add(l.abs));
  sitemapPageUrls.slice(0, 50).forEach(add);
  const toCrawl = queue.slice(0, MAX_PAGES - 1);

  const pages = [home];
  const crawled = [];
  for (let i = 0; i < toCrawl.length; i += 8) {
    const batch = await fetchMany(toCrawl.slice(i, i + 8), true);
    crawled.push(...batch);
    onStep(`Crawling internal pages (${Math.min(i + 8, toCrawl.length)}/${toCrawl.length})`, 30 + Math.round(35 * (i + 8) / Math.max(toCrawl.length, 1)));
  }
  crawled.forEach(r => {
    const isHtml = /html/i.test(r.headers && r.headers['content-type'] || '') || /<html/i.test((r.body || '').slice(0, 500));
    if (r.status >= 200 && r.status < 300 && isHtml) pages.push(parsePage(r));
  });

  onStep('Checking links for errors', 70);
  const crawledSet = new Set(crawled.map(r => stripHash(r.url)));
  const linkSet = new Set();
  const internalLinks = [], externalLinks = [];
  pages.forEach(p => p.links.forEach(l => {
    if (!l.http) return;
    const s = stripHash(l.abs);
    if (linkSet.has(s) || seen.has(s) && crawledSet.has(s) || s === stripHash(home.url)) return;
    linkSet.add(s);
    (l.internal ? internalLinks : externalLinks).push(s);
  }));
  const sitemapSample = sitemapPageUrls.map(stripHash).filter(u => !crawledSet.has(u) && !linkSet.has(u)).slice(0, 5);
  const linkTargets = [...sitemapSample, ...internalLinks.slice(0, 20), ...externalLinks].slice(0, MAX_LINKS);
  const linkResults = await fetchMany(linkTargets, false);
  const linkStatus = {};
  crawled.forEach(r => { linkStatus[stripHash(r.url)] = r; });
  linkResults.forEach(r => { linkStatus[stripHash(r.url)] = r; });

  onStep('Measuring images, scripts and stylesheets', 85);
  const imgs = [...new Set(home.images.map(i => i.abs).filter(u => u && /^https?:/.test(u)))].slice(0, 12);
  const js = home.scripts.map(s => s.src).filter(Boolean).slice(0, 10);
  const css = home.styles.map(s => s.href).filter(Boolean).slice(0, 8);
  const assetRes = await fetchMany([...imgs, ...js, ...css], false);
  const assets = {};
  assetRes.forEach(r => { assets[r.url] = r; });

  onStep('Running 300 checks', 95);
  return {
    input: start, origin, host, altHost, home, pages, crawled,
    robots, sitemap, sitemapPageUrls,
    httpRes, altRes, notFoundRes, faviconRes, securityRes, llmsRes,
    linkStatus, linkTargets, assets,
    assetLists: { imgs, js, css },
    scannedAt: new Date(),
  };
}
