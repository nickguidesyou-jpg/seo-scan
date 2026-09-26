import { C, pass, fail, na, none, short, list, trunc, kb, isHttps, isInternal, fname } from './core.js';

// ---------- Performance ----------
const P = 'Performance';
const measured = (s, kind) => s.assetLists[kind].map(u => s.assets[u]).filter(r => r && r.status === 200);
const originOf = u => { try { return new URL(u).origin; } catch { return ''; } };
const thirdParty = h => [...new Set(h.scripts.map(x => x.src).filter(Boolean).map(originOf).filter(o => o && !o.includes(h.host.replace(/^www\./, ''))))];
const blockingJs = h => h.scripts.filter(x => x.src && x.inHead && !x.async && !x.defer && x.type !== 'module' && !/json|template/.test(x.type));

C(P, 'high', 'Server response time under 600 ms', h => h.timeMs == null ? na() : h.timeMs < 600 ? pass(`${h.timeMs} ms.`) : fail(`${h.timeMs} ms.`),
  'Speed up the server: enable page caching, use a CDN, upgrade hosting, and optimise slow database queries.');
C(P, 'low', 'Very fast response (under 200 ms)', h => h.timeMs == null ? na() : h.timeMs < 200 ? pass(`${h.timeMs} ms.`) : fail(`${h.timeMs} ms.`),
  'Full-page caching or static hosting behind a CDN can bring response times under 200 ms.');
C(P, 'medium', 'HTML document under 100 KB', h => h.size < 100 * 1024 ? pass(kb(h.size)) : fail(kb(h.size)),
  'Reduce HTML size: move inline scripts/styles to cached files, remove unused markup and page-builder bloat.');
C(P, 'high', 'HTML document under 500 KB', h => h.size < 500 * 1024 ? pass(kb(h.size)) : fail(kb(h.size)),
  'Very large HTML delays rendering and may be truncated by crawlers. Paginate or trim the page.');
C(P, 'high', 'Text compression (gzip/brotli) enabled', h => {
  const enc = h.headers['content-encoding'];
  if (enc) return /gzip|br|deflate|zstd/.test(enc) ? pass(enc) : fail(enc);
  return na('The server response did not expose its encoding.');
}, 'Enable Brotli or gzip compression on the server/CDN for HTML, CSS, JS and SVG — it typically cuts transfer size by 70%.');
C(P, 'medium', 'DOM has fewer than 1,500 elements', h => h.elementCount < 1500 ? pass(`${h.elementCount} elements.`) : fail(`${h.elementCount} elements.`),
  'Simplify the markup: fewer wrapper divs, paginate long lists, lazy-render hidden content.');
C(P, 'low', 'DOM depth under 32 levels', h => h.maxDepth < 32 ? pass(`${h.maxDepth} levels.`) : fail(`${h.maxDepth} levels.`),
  'Flatten deeply nested markup (common with page builders) to speed up style calculation.');
C(P, 'medium', 'At most 15 JavaScript files', h => {
  const n = h.scripts.filter(x => x.src).length;
  return n <= 15 ? pass(`${n} files.`) : fail(`${n} files.`);
}, 'Bundle scripts, remove unused plugins and load non-essential scripts on demand.');
C(P, 'medium', 'At most 8 CSS files', h => h.styles.length <= 8 ? pass(`${h.styles.length} files.`) : fail(`${h.styles.length} files.`),
  'Combine stylesheets and remove CSS from plugins you do not use on this page.');
C(P, 'high', 'No render-blocking scripts in <head>', h => none(blockingJs(h).map(x => trunc(fname(x.src), 30)), 'blocking script'),
  'Add defer (or async) to scripts in <head>, or move them to the end of <body>, so the page can render before JS downloads.');
C(P, 'low', 'At most 3 render-blocking stylesheets', h => {
  const n = h.styles.filter(x => x.inHead && (!x.media || /all|screen/.test(x.media))).length;
  return n <= 3 ? pass(`${n}.`) : fail(`${n} blocking stylesheets.`);
}, 'Inline critical CSS and load the rest asynchronously, or combine files.');
C(P, 'low', 'Inline JavaScript under 50 KB', h => {
  const n = h.scripts.filter(x => !/ld\+json/.test(x.type)).reduce((a, x) => a + x.inline, 0);
  return n < 50 * 1024 ? pass(kb(n)) : fail(kb(n));
}, 'Move large inline scripts into external files that the browser can cache.');
C(P, 'low', 'Inline CSS under 50 KB', h => {
  const n = h.styleTags.reduce((a, x) => a + x.length, 0);
  return n < 50 * 1024 ? pass(kb(n)) : fail(kb(n));
}, 'Keep only critical CSS inline; move the rest to a cached stylesheet.');
C(P, 'medium', 'JavaScript weight under 500 KB', (h, s) => {
  const got = measured(s, 'js'); if (!got.length) return na();
  const t = got.reduce((n, r) => n + r.size, 0);
  return t < 500 * 1024 ? pass(`${kb(t)} in ${got.length} files.`) : fail(`${kb(t)} in ${got.length} files.`);
}, 'Remove unused JavaScript, split bundles and drop heavy libraries you barely use. JS is the most expensive resource per byte.');
C(P, 'low', 'CSS weight under 150 KB', (h, s) => {
  const got = measured(s, 'css'); if (!got.length) return na();
  const t = got.reduce((n, r) => n + r.size, 0);
  return t < 150 * 1024 ? pass(`${kb(t)}`) : fail(`${kb(t)}`);
}, 'Purge unused CSS (e.g. with PurgeCSS) and avoid loading full frameworks for a few components.');
C(P, 'medium', 'Static assets are cached for 7+ days', (h, s) => {
  const got = [...measured(s, 'js'), ...measured(s, 'css')]; if (!got.length) return na();
  const bad = got.filter(r => { const m = (r.headers['cache-control'] || '').match(/max-age=(\d+)/); return !(m && +m[1] >= 604800) && !/immutable/.test(r.headers['cache-control'] || ''); });
  return none(bad.map(r => trunc(fname(r.url), 30)), 'file');
}, 'Set Cache-Control: public, max-age=31536000, immutable on versioned CSS/JS files.');
C(P, 'low', 'HTML sends caching/validation headers', h => h.headers.etag || h.headers['last-modified'] || h.headers['cache-control'] ? pass() : fail('No ETag, Last-Modified or Cache-Control.'),
  'Send ETag or Last-Modified (and a Cache-Control policy) so browsers and bots can revalidate cheaply.');
C(P, 'low', 'Preconnects to third-party origins', h => {
  const tp = thirdParty(h);
  if (!tp.length) return na('No third-party scripts.');
  return h.preconnects.length ? pass(`${h.preconnects.length} preconnect/dns-prefetch hints.`) : fail(`${tp.length} third-party origins, no preconnect.`);
}, 'Add <link rel="preconnect" href="https://thirdparty.com"> for critical third-party origins to save connection time.');
C(P, 'low', 'Web fonts are preloaded or preconnected', h => {
  const usesFonts = /fonts\.googleapis|\.woff2?|typekit|fonts\.bunny/i.test(h.rawHead);
  if (!usesFonts) return na('No web fonts detected in <head>.');
  return h.preloads.some(p => p.as === 'font') || h.preconnects.some(p => /fonts\./.test(p || '')) ? pass() : fail();
}, 'Preconnect to font hosts (fonts.gstatic.com) or preload your main WOFF2 file to avoid invisible text.');
C(P, 'medium', 'Third-party script origins ≤ 10', h => {
  const tp = thirdParty(h);
  return tp.length <= 10 ? pass(`${tp.length} origins.`) : fail(`${tp.length}: ${list(tp.map(o => o.replace(/^https?:\/\//, '')))}`);
}, 'Audit tracking, chat and widget scripts; remove what you do not need and delay the rest until interaction.');
C(P, 'medium', 'No document.write()', h => h.scripts.some(x => /document\.write\s*\(/.test(x.text)) ? fail('Inline script uses document.write.') : pass(),
  'Replace document.write with DOM methods; browsers may block it on slow connections.');
C(P, 'low', 'jQuery is not loaded multiple times', h => {
  const n = h.scripts.filter(x => /jquery(\.min)?(-\d[\d.]*)?\.js|jquery@|\/jquery\//i.test(x.src || '') && !/migrate|ui|plugin/i.test(x.src)).length;
  return n <= 1 ? pass() : fail(`${n} copies of jQuery.`);
}, 'Load a single jQuery version (or drop jQuery entirely if only used for a few things).');
C(P, 'low', 'No CSS @import in inline styles', h => h.styleTags.some(t => /@import/i.test(t)) ? fail() : pass(),
  'Replace @import with <link> tags; @import delays CSS loading because files download one after another.');
C(P, 'low', 'HTML is minified', h => h.whitespaceRatio < 0.25 ? pass(`${Math.round(h.whitespaceRatio * 100)}% whitespace.`) : fail(`${Math.round(h.whitespaceRatio * 100)}% whitespace.`),
  'Minify HTML output (most caching plugins/CDNs can do this).');
C(P, 'low', 'HTML comments under 5 KB', h => h.commentsSize < 5120 ? pass(kb(h.commentsSize)) : fail(kb(h.commentsSize)),
  'Strip HTML comments in production — they add weight and can leak details.');
C(P, 'low', 'At most 3 iframes', h => h.iframes.length <= 3 ? pass(`${h.iframes.length}.`) : fail(`${h.iframes.length} iframes.`),
  'Each iframe loads a whole extra page. Replace embeds with lightweight facades (e.g. a thumbnail that loads YouTube on click).');
C(P, 'low', 'Iframes are lazy-loaded', h => !h.iframes.length ? na('No iframes.') : h.iframes.every(f => f.loading === 'lazy') ? pass() : fail(`${h.iframes.filter(f => f.loading !== 'lazy').length} iframe(s) without loading="lazy".`),
  'Add loading="lazy" to iframes (maps, videos) that are below the fold.');
C(P, 'low', 'Videos do not preload everything', h => !h.videos.length ? na('No videos.') : h.videos.every(v => /none|metadata/.test(v.getAttribute('preload') || '') || v.hasAttribute('autoplay') === false && v.getAttribute('preload') !== 'auto') ? pass() : fail(),
  'Use preload="none" or "metadata" on <video> so large files are not downloaded before playback.');
C(P, 'medium', 'No Flash, <object> or <embed> plugins', h => h.embeds ? fail(`${h.embeds} plugin element(s).`) : pass(),
  'Remove Flash/plugin content; browsers no longer support it. Use HTML5 video/audio.');
C(P, 'medium', 'Fewer than 80 page resources', h => {
  const n = h.scripts.filter(x => x.src).length + h.styles.length + h.images.length + h.iframes.length;
  return n < 80 ? pass(`~${n} resources.`) : fail(`~${n} resources.`);
}, 'Reduce requests: bundle files, lazy-load images, use SVG sprites and remove unused plugins.');
C(P, 'low', 'At most 3 Google Font families', h => {
  const m = h.rawHead.match(/fonts\.googleapis\.com\/css2?\?[^"'>]+/g);
  if (!m) return na('Google Fonts not used.');
  const fams = m.join('&').match(/family=/g).length;
  return fams <= 3 ? pass(`${fams} families.`) : fail(`${fams} families.`);
}, 'Limit fonts and weights; each family/weight is another download. Consider self-hosting a variable font.');
C(P, 'low', 'Google Fonts use font-display: swap', h => {
  const m = h.rawHead.match(/fonts\.googleapis\.com\/css2?\?[^"'>]+/g);
  if (!m) return na();
  return m.every(u => /display=(swap|optional|fallback)/.test(u)) ? pass() : fail('Missing &display=swap.');
}, 'Add &display=swap to the Google Fonts URL so text is visible while fonts load.');
C(P, 'medium', 'CSS and JS files are compressed', (h, s) => {
  const got = [...measured(s, 'js'), ...measured(s, 'css')].filter(r => r.size > 2048);
  if (!got.length) return na();
  if (!got.some(r => 'content-encoding' in r.headers) && !h.headers['content-encoding']) return na('Encoding headers not exposed.');
  return none(got.filter(r => !/gzip|br|zstd|deflate/.test(r.headers['content-encoding'] || '')).map(r => trunc(fname(r.url), 30)), 'uncompressed file');
}, 'Enable gzip/Brotli for text assets (text/css, application/javascript) on the server or CDN.');
C(P, 'low', 'Assets are requested without redirects', (h, s) => {
  const all = Object.values(s.assets);
  if (!all.length) return na();
  return none(all.filter(r => r.redirects.length).map(r => trunc(fname(r.url), 30)), 'redirected asset');
}, 'Reference CSS, JS and images at their final URLs to avoid extra round trips.');

// ---------- Security ----------
const S = 'Security';
const hdr = (h, k) => h.headers[k] || '';
const cookies = h => hdr(h, 'set-cookie').split('\n').filter(Boolean);

C(S, 'high', 'Site uses HTTPS', (h, s) => isHttps(s) ? pass() : fail('Homepage is served over plain HTTP.'),
  'Install a TLS certificate (free with Let\'s Encrypt or your host/CDN) and serve everything over HTTPS. It is a ranking signal and browsers mark HTTP as "Not secure".');
C(S, 'high', 'Valid SSL certificate', (h, s) => !isHttps(s) ? na() : h.status ? pass('Certificate accepted.') : fail(),
  'Renew or fix the certificate so it matches the domain and is trusted.');
C(S, 'medium', 'HSTS header set', (h, s) => !isHttps(s) ? na() : hdr(h, 'strict-transport-security') ? pass(hdr(h, 'strict-transport-security')) : fail('No Strict-Transport-Security header.'),
  'Add Strict-Transport-Security: max-age=31536000; includeSubDomains so browsers always use HTTPS.');
C(S, 'low', 'HSTS max-age is at least 6 months', h => {
  const m = hdr(h, 'strict-transport-security').match(/max-age=(\d+)/);
  return !m ? na() : +m[1] >= 15768000 ? pass(`${Math.round(m[1] / 86400)} days.`) : fail(`${Math.round(m[1] / 86400)} days.`);
}, 'Use max-age=31536000 (1 year).');
C(S, 'low', 'HSTS includes subdomains', h => !hdr(h, 'strict-transport-security') ? na() : /includesubdomains/i.test(hdr(h, 'strict-transport-security')),
  'Add includeSubDomains to the HSTS header (after confirming all subdomains support HTTPS).');
C(S, 'medium', 'Content-Security-Policy header', h => hdr(h, 'content-security-policy') ? pass() : fail(),
  'Add a Content-Security-Policy that whitelists your script/style sources. It is the strongest protection against XSS.');
C(S, 'medium', 'X-Content-Type-Options: nosniff', h => /nosniff/i.test(hdr(h, 'x-content-type-options')),
  'Send X-Content-Type-Options: nosniff to stop browsers guessing file types.');
C(S, 'medium', 'Clickjacking protection', h => hdr(h, 'x-frame-options') || /frame-ancestors/.test(hdr(h, 'content-security-policy')) ? pass() : fail('No X-Frame-Options or frame-ancestors.'),
  'Send X-Frame-Options: SAMEORIGIN (or CSP frame-ancestors \'self\') so other sites cannot frame yours.');
C(S, 'low', 'Referrer-Policy header', h => hdr(h, 'referrer-policy') ? pass(hdr(h, 'referrer-policy')) : fail(),
  'Send Referrer-Policy: strict-origin-when-cross-origin to avoid leaking full URLs to other sites.');
C(S, 'low', 'Permissions-Policy header', h => hdr(h, 'permissions-policy') ? pass() : fail(),
  'Send a Permissions-Policy (e.g. camera=(), microphone=(), geolocation=()) to disable browser features you do not use.');
C(S, 'high', 'No mixed content', (h, s) => {
  if (!isHttps(s)) return na();
  const bad = [...h.scripts.map(x => x.src), ...h.styles.map(x => x.href), ...h.iframes.map(f => f.src)].filter(u => /^http:/i.test(u || ''));
  return none(bad.map(u => trunc(u, 45)), 'insecure resource');
}, 'Load every script, stylesheet and iframe over https://. Browsers block insecure active content on HTTPS pages.');
C(S, 'low', 'target="_blank" links use rel="noopener"', h => none(h.links.filter(l => l.target === '_blank' && !l.internal && !/noopener|noreferrer/.test(l.rel)).map(l => trunc(l.abs, 40)), 'link'),
  'Add rel="noopener" to links that open in a new tab (modern browsers do it by default, older ones do not).');
C(S, 'low', 'Server header does not reveal versions', h => /\d/.test(hdr(h, 'server')) ? fail(`Server: ${hdr(h, 'server')}`) : pass(hdr(h, 'server') ? `Server: ${hdr(h, 'server')}` : ''),
  'Hide software version numbers in the Server header (e.g. ServerTokens Prod in Apache, server_tokens off in nginx).');
C(S, 'low', 'X-Powered-By header is hidden', h => hdr(h, 'x-powered-by') ? fail(`X-Powered-By: ${hdr(h, 'x-powered-by')}`) : pass(),
  'Remove X-Powered-By (e.g. expose_php = Off) so attackers cannot fingerprint your stack.');
C(S, 'medium', 'Cookies use the Secure flag', (h, s) => !cookies(h).length ? na('No cookies set.') : !isHttps(s) ? na() : none(cookies(h).filter(c => !/;\s*secure/i.test(c)).map(c => c.split('=')[0]), 'cookie'),
  'Set the Secure attribute on cookies so they are only sent over HTTPS.');
C(S, 'low', 'Cookies use HttpOnly', h => !cookies(h).length ? na() : none(cookies(h).filter(c => !/httponly/i.test(c)).map(c => c.split('=')[0]), 'cookie'),
  'Mark session cookies HttpOnly so JavaScript (and XSS) cannot read them.');
C(S, 'low', 'Cookies set SameSite', h => !cookies(h).length ? na() : none(cookies(h).filter(c => !/samesite/i.test(c)).map(c => c.split('=')[0]), 'cookie'),
  'Add SameSite=Lax (or Strict) to cookies to reduce CSRF risk.');
C(S, 'high', 'Forms submit over HTTPS', h => !h.forms.length ? na('No forms.') : none(h.forms.filter(f => /^http:/i.test(f.getAttribute('action') || '')).map(f => f.getAttribute('action')), 'form'),
  'Point form actions at https:// URLs so submitted data is encrypted.');
C(S, 'high', 'No password fields on insecure pages', (h, s) => isHttps(s) ? na('Site uses HTTPS.') : h.doc.querySelector('input[type=password]') ? fail() : pass(),
  'Never collect passwords over HTTP. Move to HTTPS.');
C(S, 'low', 'security.txt published', (h, s) => s.securityRes.status === 200 && /contact:/i.test(s.securityRes.body || '') ? pass() : fail('No /.well-known/security.txt.'),
  'Publish /.well-known/security.txt with a Contact: line so researchers can report vulnerabilities.');
C(S, 'medium', 'No outdated jQuery (< 3.5)', h => {
  const v = h.scripts.map(x => (x.src || '').match(/jquery[.-]?(\d+)\.(\d+)/i)).find(Boolean);
  if (!v) return na('jQuery version not detected.');
  return +v[1] > 3 || (+v[1] === 3 && +v[2] >= 5) ? pass(`jQuery ${v[1]}.${v[2]}`) : fail(`jQuery ${v[1]}.${v[2]} has known XSS vulnerabilities.`);
}, 'Upgrade jQuery to 3.5+ (or remove it).');
C(S, 'low', 'CMS version not exposed', h => h.generator && /\d/.test(h.generator) ? fail(`generator: ${h.generator}`) : pass(),
  'Remove the generator meta tag version (e.g. WordPress 6.x) — it helps attackers target known vulnerabilities.');
C(S, 'low', 'Email addresses are not exposed in plain text', h => {
  const m = h.html.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/gi) || [];
  const real = [...new Set(m.filter(e => !/\.(png|jpe?g|webp|svg|gif)$|@\d|example\.|domain\.|^(you|name|email|your|user)@|sentry|wixpress/i.test(e)))];
  return real.length ? fail(list(real, 2)) : pass();
}, 'Consider a contact form or obfuscation to reduce spam harvesting of plain-text addresses.');
C(S, 'low', 'CDN scripts use Subresource Integrity', h => {
  const cdn = h.scripts.filter(x => x.src && /cdn|unpkg|jsdelivr|cloudflare|googleapis/.test(x.src) && !x.src.includes(h.host));
  if (!cdn.length) return na('No CDN scripts.');
  return none(cdn.filter(x => !x.integrity).map(x => trunc(fname(x.src), 30)), 'script');
}, 'Add integrity="sha384-…" crossorigin="anonymous" to scripts from public CDNs so a compromised CDN cannot inject code.');

// ---------- Mobile & Technical ----------
const MT = 'Mobile & Technical';
const vp = h => (h.viewport || '').toLowerCase().replace(/\s/g, '');

C(MT, 'high', 'Viewport meta tag present', h => h.viewport ? pass(h.viewport) : fail('No viewport meta.'),
  'Add <meta name="viewport" content="width=device-width, initial-scale=1">. Without it, phones show a zoomed-out desktop page.');
C(MT, 'high', 'Viewport uses device width', h => !h.viewport ? na() : /width=device-width/.test(vp(h)),
  'Use width=device-width instead of a fixed pixel width.');
C(MT, 'medium', 'Zooming is not disabled', h => !h.viewport ? na() : /user-scalable=(no|0)|maximum-scale=1(\.0)?(,|$)/.test(vp(h)) ? fail(h.viewport) : pass(),
  'Remove user-scalable=no and maximum-scale=1 — users must be able to zoom (accessibility requirement).');
C(MT, 'low', 'Viewport sets initial-scale=1', h => !h.viewport ? na() : /initial-scale=1/.test(vp(h)),
  'Add initial-scale=1 to the viewport meta.');
C(MT, 'low', 'No fixed widths wider than a phone', h => {
  const bad = [...h.doc.querySelectorAll('[style*="width"]')].filter(e => { const m = e.getAttribute('style').match(/(?:^|;|\s)width\s*:\s*(\d+)px/i); return m && +m[1] > 500; });
  return none(bad.map(e => e.tagName.toLowerCase()), 'element');
}, 'Replace fixed pixel widths with max-width: 100% / responsive CSS so content fits small screens.');
C(MT, 'low', 'Theme color set for mobile browsers', h => h.themeColor ? pass(h.themeColor) : fail(),
  'Add <meta name="theme-color" content="#yourbrand"> to colour the browser UI on mobile.');
C(MT, 'low', 'Web app manifest', h => h.manifest ? pass(h.manifest) : fail(),
  'Add a manifest.json (name, icons, theme colour) for a better "Add to home screen" experience.');
C(MT, 'low', 'No tiny font sizes in inline styles', h => {
  const bad = [...h.doc.querySelectorAll('[style*="font-size"]')].filter(e => { const m = e.getAttribute('style').match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/i); return m && +m[1] < 12; });
  return none(bad.map(e => e.tagName.toLowerCase()), 'element');
}, 'Use at least 16px for body text and 12px for small print so text is readable on phones without zooming.');
C(MT, 'low', 'Large images are responsive', h => none(h.images.filter(i => +i.width > 800 && !i.srcset).map(i => trunc(fname(i.src), 30)), 'image'),
  'Give wide images a srcset (or CSS max-width:100%) so they scale down on phones.');
C(MT, 'low', 'Inputs use mobile-friendly types', h => none(h.inputs.filter(i => i.type === 'text' && /mail|phone|tel|mobil/i.test((i.name || '') + (i.id || '') + (i.placeholder || ''))).map(i => i.name || i.id), 'input'),
  'Use type="email" and type="tel" so phones show the right keyboard.');
C(MT, 'low', 'Form fields support autocomplete', h => {
  const f = h.inputs.filter(i => /name|mail|phone|tel|address|zip|city/i.test((i.name || '') + (i.id || '')));
  if (!f.length) return na('No personal-data fields.');
  return f.some(i => i.getAttribute('autocomplete')) ? pass() : fail(`${f.length} field(s) without autocomplete.`);
}, 'Add autocomplete="name", "email", "tel" etc. so browsers can fill forms instantly.');
C(MT, 'medium', 'Character encoding declared', h => h.charset || /charset=/i.test(h.headers['content-type'] || '') ? pass(h.charset || h.headers['content-type']) : fail(),
  'Add <meta charset="utf-8"> as the first element in <head>.');
C(MT, 'low', 'Charset declared early in <head>', h => !h.charset ? na() : h.html.slice(0, 1024).toLowerCase().includes('charset') ? pass() : fail('Charset appears after the first 1024 bytes.'),
  'Place <meta charset="utf-8"> right after <head> — browsers only look in the first 1024 bytes.');
C(MT, 'medium', 'HTML5 doctype', h => h.doctype ? pass() : fail('Missing <!DOCTYPE html>.'),
  'Start the document with <!DOCTYPE html> to avoid quirks mode rendering.');
