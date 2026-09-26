import { C, pass, fail, na, none, sitewide, short, list, trunc, isHttps, isInternal, fname } from './core.js';

const CI = 'Crawlability & Indexing';
const noSlash = u => (u || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();

C(CI, 'high', 'Homepage returns HTTP 200', h => h.status === 200 ? pass('Status 200 OK.') : fail(`Homepage returned status ${h.status}.`),
  'Make sure the homepage responds with 200 OK. Fix server errors, and avoid serving the homepage as a 3xx/4xx/5xx.');
C(CI, 'medium', 'robots.txt file exists', (h, s) => s.robots.ok ? pass(`Found (${s.robots.size} bytes).`) : fail(`/robots.txt returned ${s.robots.status || 'no response'}.`),
  'Create a plain-text /robots.txt at the root of your domain. Even a minimal "User-agent: *\\nAllow: /" tells crawlers they are welcome.');
C(CI, 'high', 'robots.txt does not block the whole site', (h, s) => !s.robots.ok ? na('No robots.txt found.') : s.robots.blocksAll ? fail('"Disallow: /" blocks all crawlers.') : pass('Site is crawlable.'),
  'Remove "Disallow: /" for User-agent: * (and Googlebot). It stops search engines from crawling every page.');
C(CI, 'low', 'robots.txt references an XML sitemap', (h, s) => !s.robots.ok ? na('No robots.txt found.') : s.robots.sitemaps.length ? pass(list(s.robots.sitemaps, 2)) : fail('No "Sitemap:" line.'),
  'Add a line like "Sitemap: https://example.com/sitemap.xml" to robots.txt so every crawler can find your sitemap.');
C(CI, 'low', 'robots.txt is under 500 KB', (h, s) => !s.robots.ok ? na() : s.robots.size < 500 * 1024,
  'Google ignores everything after 500 KB of robots.txt. Simplify rules using wildcards.');
C(CI, 'medium', 'robots.txt does not block CSS or JavaScript', (h, s) => {
  if (!s.robots.ok) return na();
  const assets = [...h.scripts.map(x => x.src), ...h.styles.map(x => x.href)].filter(u => u && u.startsWith(s.origin));
  return none(assets.filter(u => s.robots.isDisallowed(new URL(u).pathname)).map(short), 'blocked asset');
}, 'Allow Googlebot to fetch CSS and JS files. Google renders pages like a browser, and blocked assets can make pages look broken to it.');
C(CI, 'high', 'Homepage is not disallowed in robots.txt', (h, s) => !s.robots.ok ? na() : !s.robots.isDisallowed(new URL(h.url).pathname),
  'Your robots.txt rules match the homepage path. Adjust the Disallow rules so "/" is crawlable.');
C(CI, 'low', 'No crawl-delay directive', (h, s) => !s.robots.ok ? na() : s.robots.star.delay ? fail(`Crawl-delay: ${s.robots.star.delay}`) : pass('No crawl-delay.'),
  'Remove Crawl-delay. Google ignores it and Bing/Yandex will crawl your site much more slowly.');
C(CI, 'medium', 'XML sitemap found', (h, s) => s.sitemap.ok ? pass(`${short(s.sitemap.url)} (${s.sitemap.count} entries)`) : fail('No sitemap at /sitemap.xml or in robots.txt.'),
  'Generate an XML sitemap listing all indexable pages (most CMSs have a plugin) and submit it in Google Search Console.');
C(CI, 'medium', 'Sitemap is valid XML', (h, s) => s.sitemap.status !== 200 ? na('No sitemap found.') : s.sitemap.ok ? pass(s.sitemap.isIndex ? 'Valid sitemap index.' : 'Valid urlset.') : fail('Response is not a <urlset> or <sitemapindex>.'),
  'Your sitemap must be XML with a <urlset> (or <sitemapindex>) root, following the sitemaps.org protocol.');
C(CI, 'low', 'Sitemap has fewer than 50,000 URLs', (h, s) => !s.sitemap.ok ? na() : s.sitemap.count <= 50000,
  'Split sitemaps larger than 50,000 URLs (or 50 MB) and reference them from a sitemap index.');
C(CI, 'low', 'Sitemap includes <lastmod> dates', (h, s) => !s.sitemap.ok ? na() : (s.sitemap.hasLastmod || s.sitemap.childHasLastmod) ? pass('lastmod present.') : fail('No <lastmod> values.'),
  'Add accurate <lastmod> dates so search engines know which pages changed and should be re-crawled.');
C(CI, 'medium', 'Sitemap URLs use the correct host and protocol', (h, s) => {
  if (!s.sitemap.ok) return na();
  const origin = new URL(h.url).origin;
  return none(s.sitemapPageUrls.filter(u => !u.startsWith(origin)).slice(0, 50), 'URL');
}, 'Every URL in the sitemap should use your preferred protocol and host (e.g. https://www.). Mismatches send mixed signals.');
C(CI, 'medium', 'Sitemap URLs return 200', (h, s) => {
  const checked = s.sitemapPageUrls.map(u => s.linkStatus[u.split('#')[0]]).filter(Boolean);
  if (!checked.length) return na('No sitemap URLs were checked.');
  return none(checked.filter(r => r.status !== 200 || r.redirects.length).map(r => `${short(r.url)} (${r.redirects.length ? 'redirects' : r.status})`), 'URL');
}, 'Only list final, indexable 200 URLs in your sitemap — no redirects, 404s or noindexed pages.');
C(CI, 'high', 'Homepage is not set to noindex', h => /noindex|none/.test(h.robotsMeta) ? fail(`meta robots: ${h.robotsMeta}`) : pass(h.robotsMeta ? `meta robots: ${h.robotsMeta}` : 'No robots meta (defaults to index).'),
  'Remove "noindex" from the robots meta tag, otherwise Google will drop the page from search results.');
C(CI, 'high', 'No noindex in X-Robots-Tag header', h => /noindex|none/.test(h.xRobots) ? fail(`X-Robots-Tag: ${h.xRobots}`) : pass(),
  'Your server sends an X-Robots-Tag: noindex header. Remove it from the web server / CDN config for public pages.');
C(CI, 'medium', 'Homepage links are followable (no nofollow)', h => /nofollow|none/.test(h.robotsMeta) ? fail(`meta robots: ${h.robotsMeta}`) : pass(),
  'Remove "nofollow" from the robots meta so search engines follow and pass value through your links.');
C(CI, 'medium', 'Canonical tag present', h => h.canonical ? pass(h.canonical) : fail('No <link rel="canonical">.'),
  'Add <link rel="canonical" href="https://your-preferred-url/"> in <head> to tell search engines the preferred URL.');
C(CI, 'low', 'Canonical URL is absolute', h => !h.canonicalRaw ? na() : /^https?:\/\//i.test(h.canonicalRaw) ? pass() : fail(`Relative: ${h.canonicalRaw}`),
  'Use a full absolute URL (https://…) in the canonical tag. Relative canonicals are easy to get wrong.');
C(CI, 'medium', 'Only one canonical tag', h => h.canonicals.length <= 1 ? pass() : fail(`${h.canonicals.length} canonical tags found.`),
  'Keep exactly one canonical tag. With several, Google may ignore all of them.');
C(CI, 'medium', 'Homepage canonical points to itself', h => !h.canonical ? na() : noSlash(h.canonical) === noSlash(h.url) ? pass() : fail(`Points to ${h.canonical}`),
  'The homepage canonical should reference the homepage URL itself. Pointing elsewhere asks Google to index another page instead.');
C(CI, 'medium', 'Canonical uses HTTPS', (h, s) => !h.canonical ? na() : !isHttps(s) || h.canonical.startsWith('https:'),
  'Point canonicals at the HTTPS version of your URLs.');
C(CI, 'low', 'Canonical is on the same domain', h => !h.canonical ? na() : new URL(h.canonical).hostname === h.host ? pass() : fail(`Cross-domain: ${new URL(h.canonical).hostname}`),
  'A cross-domain canonical hands your ranking to another domain. Only do this on purpose (e.g. syndicated content).');
C(CI, 'medium', 'All crawled pages have a canonical tag', (h, s) => sitewide(s, p => !p.canonical),
  'Add a self-referencing canonical to every indexable page to prevent duplicate-content issues from parameters and tracking codes.');
C(CI, 'medium', 'No crawled pages are noindexed', (h, s) => sitewide(s, p => /noindex|none/.test(p.robotsMeta + p.xRobots)),
  'Check that noindexed pages really should be hidden from search. Remove noindex from pages you want to rank.');
C(CI, 'high', 'Missing pages return a real 404', (h, s) => {
  const st = s.notFoundRes.status;
  if (st === 404 || st === 410) return pass(`Unknown URL returned ${st}.`);
  return fail(st === 200 ? 'Soft 404: an unknown URL returned 200 OK.' : `Unknown URL returned ${st || 'no response'}${s.notFoundRes.redirects.length ? ' after a redirect' : ''}.`);
}, 'Configure your server so URLs that do not exist return HTTP 404 (not 200 or a redirect to the homepage). Soft 404s waste crawl budget.');
C(CI, 'low', '404 page helps visitors find their way', (h, s) => {
  const st = s.notFoundRes.status;
  if (st !== 404 && st !== 410) return na();
  const n = ((s.notFoundRes.body || '').match(/<a\s[^>]*href/gi) || []).length;
  return n >= 3 ? pass(`${n} links on the 404 page.`) : fail(`Only ${n} links on the 404 page.`);
}, 'Design a friendly 404 page with navigation, a search box and links to popular pages so visitors (and link equity) are not lost.');
C(CI, 'medium', 'No meta refresh redirect', h => h.metaRefresh ? fail(`meta refresh: ${h.metaRefresh}`) : pass(),
  'Replace meta refresh redirects with server-side 301 redirects.');
C(CI, 'high', 'Content is available without JavaScript', h => h.wordCount >= 50 ? pass(`${h.wordCount} words in the raw HTML.`) : fail(`Only ${h.wordCount} words in the raw HTML — content is probably rendered by JavaScript.`),
  'Serve the main content in the initial HTML (server-side rendering or static generation). Crawlers and AI bots may not run your JavaScript.');
C(CI, 'low', 'llms.txt file for AI assistants', (h, s) => s.llmsRes.status === 200 && !/<html/i.test(s.llmsRes.body || '') ? pass('/llms.txt found.') : fail('No /llms.txt.'),
  'Optional but emerging: add /llms.txt — a short Markdown summary of your site and key pages, to help AI assistants understand it.');

const UR = 'URLs & Redirects';

C(UR, 'high', 'HTTP redirects to HTTPS', (h, s) => {
  const r = s.httpRes;
  if (r.error && !r.status) return na('HTTP version not reachable.');
  return (r.finalUrl || '').startsWith('https:') ? pass(`http:// → ${r.finalUrl}`) : fail('The http:// version does not redirect to https://.');
}, 'Force HTTPS with a 301 redirect from every http:// URL to its https:// equivalent.');
C(UR, 'medium', 'HTTP → HTTPS redirect is permanent (301/308)', (h, s) => {
  const first = s.httpRes.redirects[0];
  if (!first) return na();
  return [301, 308].includes(first.status) ? pass(`${first.status}`) : fail(`Uses ${first.status} (temporary).`);
}, 'Use a 301 (or 308) permanent redirect so ranking signals are transferred to the HTTPS URL.');
C(UR, 'medium', 'www and non-www resolve to one version', (h, s) => {
  const r = s.altRes;
  if (!r.status) return pass(`${s.altHost} does not resolve (fine).`);
  const fh = r.finalUrl ? new URL(r.finalUrl).hostname : '';
  return fh === s.host ? pass(`${s.altHost} → ${s.host}`) : fail(`${s.altHost} serves content without redirecting to ${s.host}.`);
}, 'Pick www or non-www and 301-redirect the other one to it, so you do not have two copies of the site.');
C(UR, 'low', 'www/non-www redirect is permanent', (h, s) => {
  const first = s.altRes.redirects[0];
  if (!first) return na();
  return [301, 308].includes(first.status) ? pass(`${first.status}`) : fail(`Uses ${first.status}.`);
}, 'Use a 301 permanent redirect between www and non-www.');
C(UR, 'medium', 'Homepage loads without a redirect chain', h => h.redirects.length <= 1 ? pass(h.redirects.length ? '1 redirect.' : 'No redirects.') : fail(`${h.redirects.length} redirects: ${h.redirects.map(r => r.status).join(' → ')}`),
  'Link to and redirect straight to the final URL. Each extra hop slows loading and can lose link equity.');
C(UR, 'low', 'Entry redirects are permanent', h => !h.redirects.length ? na() : none(h.redirects.filter(r => ![301, 308].includes(r.status)).map(r => `${short(r.url)} (${r.status})`), 'temporary redirect'),
  'Use 301 instead of 302/307 for permanent moves.');
C(UR, 'low', 'Homepage URL is short', h => h.url.length <= 75 ? pass(`${h.url.length} characters.`) : fail(`${h.url.length} characters.`),
  'Keep the homepage URL short and clean, ideally just the domain.');
C(UR, 'low', 'No uppercase letters in URLs', (h, s) => sitewide(s, p => /[A-Z]/.test(new URL(p.url).pathname), 'URL'),
  'Use lowercase URLs. Servers are often case-sensitive, so mixed case creates duplicates and broken links.');
C(UR, 'low', 'No underscores in URLs', (h, s) => sitewide(s, p => /_/.test(new URL(p.url).pathname), 'URL'),
  'Use hyphens (-) instead of underscores (_) to separate words; Google treats hyphens as word separators.');
C(UR, 'low', 'Internal links avoid query parameters', h => {
  const internal = h.links.filter(l => l.internal && l.http);
  const q = internal.filter(l => /\?/.test(l.abs));
  return q.length <= Math.max(2, internal.length * 0.1) ? pass(`${q.length} of ${internal.length} links use parameters.`) : fail(`${q.length} of ${internal.length} internal links use ?parameters.`);
}, 'Prefer clean, static URLs (/shoes/red/) over parameters (?cat=3&color=red) for pages you want indexed.');
C(UR, 'low', 'URLs are under 115 characters', (h, s) => sitewide(s, p => p.url.length > 115, 'URL'),
  'Shorten long URLs. Short, descriptive URLs are easier to share and display fully in search results.');
C(UR, 'low', 'No spaces or special characters in URLs', (h, s) => sitewide(s, p => /%20|%[0-9a-f]{2}.*%[0-9a-f]{2}|[\s<>{}|\\^`]/i.test(new URL(p.url).pathname), 'URL'),
  'Use only letters, numbers and hyphens in URL paths. Avoid spaces and encoded characters.');
C(UR, 'low', 'URLs are not deeply nested', (h, s) => sitewide(s, p => new URL(p.url).pathname.split('/').filter(Boolean).length > 4, 'URL'),
  'Keep important pages within 3–4 folders of the root. Flat structures are easier to crawl.');
C(UR, 'medium', 'No session IDs in URLs', (h, s) => none(h.links.filter(l => l.internal && /[?&;](sid|sessionid|phpsessid|jsessionid)=/i.test(l.abs)).map(l => short(l.abs)), 'link'),
  'Store sessions in cookies, not URLs. Session IDs create endless duplicate URLs.');
C(UR, 'low', 'Consistent trailing-slash usage', h => {
  const paths = [...new Set(h.links.filter(l => l.internal && l.http).map(l => new URL(l.abs).pathname).filter(p => p !== '/' && !/\.\w+$/.test(p)))];
  if (paths.length < 4) return na();
  const withSlash = paths.filter(p => p.endsWith('/')).length;
  const share = withSlash / paths.length;
  return share > 0.85 || share < 0.15 ? pass('Consistent.') : fail(`${withSlash} with and ${paths.length - withSlash} without trailing slash.`);
}, 'Choose one style (with or without trailing slash), link consistently and 301-redirect the other.');
C(UR, 'medium', 'No internal links to redirects', (h, s) => {
  const bad = Object.values(s.linkStatus).filter(r => isInternal(s, r.url) && r.redirects.length && r.finalUrl.split('#')[0].replace(/\/$/, '') !== r.url.split('#')[0].replace(/\/$/, ''));
  return none(bad.map(r => `${short(r.url)} → ${short(r.finalUrl)}`), 'redirecting link');
}, 'Update internal links to point directly at the final URL instead of going through a redirect.');
C(UR, 'medium', 'No redirect chains', (h, s) => none(Object.values(s.linkStatus).filter(r => r.redirects.length > 1).map(r => `${short(r.url)} (${r.redirects.length} hops)`), 'chain'),
  'Collapse redirect chains (A → B → C) into single redirects (A → C).');
C(UR, 'high', 'No redirect loops', (h, s) => none(Object.values(s.linkStatus).filter(r => /too many redirects/i.test(r.error || '')).map(r => short(r.url)), 'loop'),
  'Fix redirect rules that point back to themselves; these URLs never load.');
C(UR, 'high', 'No 5xx server errors', (h, s) => none(Object.values(s.linkStatus).filter(r => r.status >= 500).map(r => `${trunc(r.url, 50)} (${r.status})`), 'URL'),
  'Investigate server errors (500–599) in your server logs; they stop pages from being indexed.');
C(UR, 'medium', 'Internal links use HTTPS', (h, s) => !isHttps(s) ? na('Site is not on HTTPS.') : none([...new Set(h.links.filter(l => l.internal && l.abs.startsWith('http:')).map(l => l.abs))], 'link'),
  'Update internal links to https:// so visitors are not bounced through an HTTP → HTTPS redirect.');
