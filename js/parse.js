// Turns a fetched HTML response into a flat page model the checks can read.

const clean = s => (s || '').replace(/\s+/g, ' ').trim();

export function absUrl(href, base) {
  try { return new URL(href, base).href; } catch { return null; }
}

const STOP = new Set('the a an and or of to in on for with is are was be by at as it this that from your you we our i not but have has can will more all about'.split(' '));

export function parsePage(res) {
  const url = res.finalUrl || res.url;
  const html = res.body || '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // DOMParser runs without scripting, so <noscript> fallbacks would be counted twice.
  doc.querySelectorAll('noscript').forEach(n => n.remove());
  const host = safeHost(url);
  const $ = sel => [...doc.querySelectorAll(sel)];
  const meta = name => {
    const el = doc.querySelector(`meta[name="${name}" i]`);
    return el ? el.getAttribute('content') : null;
  };

  const titles = $('title').filter(t => !t.closest('svg')).map(t => clean(t.textContent));
  const descs = $('meta[name="description" i]').map(m => m.getAttribute('content') || '');
  const canonicals = $('link[rel~="canonical" i]').map(l => absUrl(l.getAttribute('href') || '', url));
  const headings = $('h1,h2,h3,h4,h5,h6').map(h => ({ level: +h.tagName[1], text: clean(h.textContent) }));

  const links = $('a[href]').map(a => {
    const raw = a.getAttribute('href').trim();
    const abs = absUrl(raw, url);
    const rel = (a.getAttribute('rel') || '').toLowerCase();
    const text = clean(a.textContent) || clean(a.getAttribute('aria-label')) || clean(a.querySelector('img')?.getAttribute('alt'));
    return {
      raw, abs, rel, text,
      hasImg: !!a.querySelector('img'),
      target: a.getAttribute('target'),
      title: a.getAttribute('title'),
      internal: !!abs && safeHost(abs) === host,
      http: !!abs && /^https?:/.test(abs),
    };
  });

  const images = $('img').map(i => {
    const src = (i.getAttribute('src') || i.getAttribute('data-src') || '').trim();
    return {
      src,
      abs: src ? absUrl(src, url) : null,
      alt: i.getAttribute('alt'),
      width: i.getAttribute('width'),
      height: i.getAttribute('height'),
      loading: i.getAttribute('loading'),
      srcset: i.getAttribute('srcset') || i.closest('picture')?.querySelector('source[srcset]')?.getAttribute('srcset'),
      inPicture: !!i.closest('picture'),
      decoding: i.getAttribute('decoding'),
    };
  });

  const scripts = $('script').map(s => ({
    src: s.getAttribute('src') ? absUrl(s.getAttribute('src'), url) : null,
    async: s.hasAttribute('async'), defer: s.hasAttribute('defer'),
    type: (s.getAttribute('type') || '').toLowerCase(),
    inHead: !!s.closest('head'),
    inline: s.getAttribute('src') ? 0 : s.textContent.length,
    integrity: s.hasAttribute('integrity'),
    text: s.getAttribute('src') ? '' : s.textContent,
  }));
  const styles = $('link[rel~="stylesheet" i]').filter(l => (l.getAttribute('href') || '').trim()).map(l => ({
    href: absUrl(l.getAttribute('href') || '', url),
    media: l.getAttribute('media'),
    inHead: !!l.closest('head'),
  }));
  const styleTags = $('style').map(s => s.textContent);

  const jsonld = [];
  const jsonldErrors = [];
  $('script[type="application/ld+json" i]').forEach(s => {
    try {
      const data = JSON.parse(s.textContent);
      const items = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
      items.forEach(it => jsonld.push(it));
    } catch (e) { jsonldErrors.push(e.message); }
  });
  const schemaTypes = jsonld.flatMap(it => [].concat(it && it['@type'] || [])).map(String);

  // Visible text: strip non-content nodes on a clone.
  const body = doc.body ? doc.body.cloneNode(true) : doc.createElement('body');
  body.querySelectorAll('script,style,noscript,template,svg,iframe').forEach(n => n.remove());
  const text = clean(body.textContent);
  const words = text ? text.split(' ').filter(w => /\p{L}/u.test(w)) : [];
  const freq = {};
  words.forEach(w => {
    const k = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (k.length > 2 && !STOP.has(k)) freq[k] = (freq[k] || 0) + 1;
  });
  const topWords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  body.querySelectorAll('header,nav,footer,aside,form,[role=navigation],[role=banner],[role=contentinfo]').forEach(n => n.remove());
  const mainText = clean(body.textContent);
  const paragraphs = $('p').map(p => clean(p.textContent)).filter(Boolean);

  const og = {};
  $('meta[property^="og:" i]').forEach(m => { og[m.getAttribute('property').toLowerCase().slice(3)] = m.getAttribute('content'); });
  const tw = {};
  $('meta[name^="twitter:" i], meta[property^="twitter:" i]').forEach(m => {
    tw[(m.getAttribute('name') || m.getAttribute('property')).toLowerCase().slice(8)] = m.getAttribute('content');
  });

  const ids = $('[id]').map(e => e.id);
  const dupIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  let maxDepth = 0;
  (function walk(el, d) { if (d > maxDepth) maxDepth = d; for (const c of el.children) walk(c, d + 1); })(doc.documentElement, 1);

  const rawHead = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];

  return {
    url, host, status: res.status, headers: res.headers || {}, size: res.size || html.length,
    redirects: res.redirects || [], timeMs: res.timeMs, html, doc, rawHead,
    doctype: /^\s*(<!--[\s\S]*?-->\s*)*<!doctype html/i.test(html),
    lang: doc.documentElement.getAttribute('lang'),
    charset: doc.querySelector('meta[charset]')?.getAttribute('charset') ||
      (doc.querySelector('meta[http-equiv="content-type" i]')?.getAttribute('content') || '').match(/charset=([\w-]+)/i)?.[1] || null,
    viewport: meta('viewport'),
    title: titles[0] ?? null, titles,
    metaDesc: descs[0] ?? null, metaDescs: descs,
    robotsMeta: [meta('robots'), meta('googlebot')].filter(Boolean).join(',').toLowerCase(),
    xRobots: (res.headers?.['x-robots-tag'] || '').toLowerCase(),
    canonical: canonicals[0] || null, canonicals,
    canonicalRaw: doc.querySelector('link[rel~="canonical" i]')?.getAttribute('href') || null,
    metaRefresh: doc.querySelector('meta[http-equiv="refresh" i]')?.getAttribute('content') || null,
    keywordsMeta: meta('keywords'),
    generator: meta('generator'),
    themeColor: meta('theme-color'),
    headings, h1s: headings.filter(h => h.level === 1).map(h => h.text),
    links, images, scripts, styles, styleTags,
    jsonld, jsonldErrors, schemaTypes,
    microdata: $('[itemscope]').length,
    og, tw, text, mainText, words, wordCount: words.length, topWords, paragraphs,
    hreflangs: $('link[rel="alternate" i][hreflang]').map(l => ({ lang: l.getAttribute('hreflang'), href: absUrl(l.getAttribute('href') || '', url) })),
    iframes: $('iframe').map(f => ({ src: f.getAttribute('src') || '', title: f.getAttribute('title'), loading: f.getAttribute('loading') })),
    forms: $('form'), inputs: $('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea'),
    buttons: $('button, [role=button], input[type=submit], input[type=button]'),
    favicon: $('link[rel~="icon" i]').map(l => absUrl(l.getAttribute('href') || '', url)),
    appleIcon: $('link[rel~="apple-touch-icon" i]').length > 0,
    manifest: doc.querySelector('link[rel="manifest" i]')?.getAttribute('href') || null,
    preconnects: $('link[rel~="preconnect" i], link[rel~="dns-prefetch" i]').map(l => l.getAttribute('href')),
    preloads: $('link[rel~="preload" i]').map(l => ({ href: l.getAttribute('href'), as: l.getAttribute('as') })),
    dupIds, elementCount: doc.getElementsByTagName('*').length, maxDepth,
    inlineStyleAttrs: $('[style]').length,
    deprecated: $('font,center,marquee,blink,frame,frameset,big,strike,tt,applet').map(e => e.tagName.toLowerCase()),
    embeds: $('object,embed').length,
    videos: $('video'), audios: $('audio'),
    landmarks: { main: $('main,[role=main]').length, nav: $('nav,[role=navigation]').length, header: $('header').length, footer: $('footer').length },
    tables: $('table'), lists: $('ul,ol').length,
    strong: $('strong,b').length, em: $('em,i').length,
    tabindexPositive: $('[tabindex]').filter(e => +e.getAttribute('tabindex') > 0).length,
    svgInline: $('svg').length,
    breadcrumbsNav: $('nav[aria-label*="breadcrumb" i], .breadcrumb, .breadcrumbs, [itemtype*="BreadcrumbList"]').length,
    commentsSize: (html.match(/<!--[\s\S]*?-->/g) || []).reduce((n, c) => n + c.length, 0),
    whitespaceRatio: html.length ? (html.match(/\s/g) || []).length / html.length : 0,
  };
}

export function safeHost(u) {
  try { return new URL(u).hostname.toLowerCase(); } catch { return ''; }
}
