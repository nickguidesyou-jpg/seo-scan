import { C, pass, fail, na, none, short, list, trunc, kb, isHttps, isInternal, fname } from './core.js';

// ---------- Links ----------
const L = 'Links';
const httpLinks = h => h.links.filter(l => l.http);
const internal = h => httpLinks(h).filter(l => l.internal);
const external = h => httpLinks(h).filter(l => !l.internal);
// Many sites answer bots with 403/429/999; only count clear failures as broken.
const broken = r => r && (r.status === 404 || r.status === 410 || r.status >= 500 || (!r.status && r.error && !/redirect/i.test(r.error)));

C(L, 'high', 'Homepage has internal links', h => internal(h).length ? pass(`${internal(h).length} internal links.`) : fail('No internal links found in the HTML.'),
  'Link to your important pages with normal <a href> links. Crawlers discover pages through links.');
C(L, 'medium', 'At least 10 internal links on the homepage', h => internal(h).length >= 10 ? pass(`${internal(h).length}.`) : fail(`Only ${internal(h).length}.`),
  'Link from the homepage to your key categories, services and content to pass authority down the site.');
C(L, 'low', 'Fewer than 300 links on the page', h => h.links.length < 300 ? pass(`${h.links.length} links.`) : fail(`${h.links.length} links.`),
  'Trim mega-menus and footers. Hundreds of links dilute the value passed through each one.');
C(L, 'high', 'No broken internal links', (h, s) => none(Object.values(s.linkStatus).filter(r => isInternal(s, r.url) && broken(r)).map(r => `${short(r.url)} (${r.status || 'error'})`), 'broken link', `Checked ${Object.values(s.linkStatus).filter(r => isInternal(s, r.url)).length} internal URLs.`),
  'Fix or remove links pointing to pages that return 404/410/5xx, or redirect those URLs to the best alternative.');
C(L, 'medium', 'No broken external links', (h, s) => {
  const ext = Object.values(s.linkStatus).filter(r => !isInternal(s, r.url));
  if (!ext.length) return na('No external links checked.');
  return none(ext.filter(broken).map(r => `${trunc(r.url, 45)} (${r.status || 'unreachable'})`), 'broken link', `Checked ${ext.length} external URLs.`);
}, 'Update or remove outbound links to pages that no longer exist.');
C(L, 'low', 'Descriptive anchor text (no "click here")', h => none([...new Set(h.links.filter(l => /^(click here|here|read more|more|learn more|link|this|klik her|læs mere|her)$/i.test(l.text)).map(l => `"${l.text}"`))], 'generic anchor'),
  'Use anchor text that describes the target ("see our oak dining tables") instead of "click here".');
C(L, 'medium', 'No links without anchor text', h => none(h.links.filter(l => l.http && !l.text).map(l => short(l.abs)), 'empty link'),
  'Give every link visible text, or an aria-label / image alt if it is an icon or image link.');
C(L, 'low', 'Links out to other websites', h => external(h).length ? pass(`${external(h).length} external links.`) : fail('No outbound links.'),
  'Linking to relevant, trustworthy sources (partners, references, social profiles) is natural and helps context.');
C(L, 'medium', 'No nofollow on internal links', h => none(internal(h).filter(l => /nofollow/.test(l.rel) && !l.abs.includes('?')).map(l => short(l.abs)), 'nofollowed link'),
  'Remove rel="nofollow" from internal links; it wastes link equity instead of sculpting it.');
C(L, 'low', 'No javascript: links', h => none(h.links.filter(l => /^javascript:/i.test(l.raw)).map(l => `"${trunc(l.text, 20)}"`), 'link'),
  'Use real URLs in href (and <button> for actions). Crawlers cannot follow javascript: links.');
C(L, 'low', 'No empty or "#" links', h => {
  const n = h.links.filter(l => l.raw === '' || l.raw === '#').length;
  return n <= 2 ? pass(`${n} found.`) : fail(`${n} links with href="#" or empty href.`);
}, 'Point links at real URLs, or use <button> elements for interactive controls.');
C(L, 'low', 'Image links have alt text', h => {
  const imgLinks = h.doc.querySelectorAll('a[href] img');
  const bad = [...imgLinks].filter(i => !(i.getAttribute('alt') || '').trim() && !i.closest('a').textContent.trim());
  return !imgLinks.length ? na() : none(bad.map(i => trunc(i.getAttribute('src'), 40)), 'image link');
}, 'When an image is a link, its alt text acts as the anchor text — describe the destination.');
C(L, 'high', 'No links to localhost or staging', h => none(h.links.filter(l => /\/\/(localhost|127\.0\.0\.1|[\w-]*staging[\w.-]*|dev\.[\w-]+\.|[\w-]+\.local)\b/i.test(l.abs || '')).map(l => trunc(l.abs, 50)), 'link'),
  'Replace development/staging URLs with live URLs.');
C(L, 'low', 'Phone numbers are clickable (tel:)', h => {
  if (!/(\+\d{2}\s?)?(\d{2}\s?){4}|\(\d{3}\)\s?\d{3}-\d{4}/.test(h.text)) return na('No phone number detected.');
  return h.links.some(l => /^tel:/i.test(l.raw)) ? pass() : fail('Phone number shown but no tel: link.');
}, 'Wrap phone numbers in <a href="tel:+4512345678"> so mobile visitors can call with one tap.');
C(L, 'low', 'Email addresses are clickable (mailto:)', h => {
  if (!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(h.text)) return na('No email address detected.');
  return h.links.some(l => /^mailto:/i.test(l.raw)) ? pass() : fail('Email shown but no mailto: link.');
}, 'Link email addresses with mailto: so visitors can write with one click.');
C(L, 'low', 'Breadcrumb navigation on subpages', (h, s) => {
  const sub = s.pages.slice(1);
  if (!sub.length) return na();
  const n = sub.filter(p => p.breadcrumbsNav || p.schemaTypes.includes('BreadcrumbList')).length;
  return n ? pass(`${n} of ${sub.length} subpages.`) : fail('No breadcrumbs found on subpages.');
}, 'Add breadcrumbs (Home › Category › Page) with BreadcrumbList schema. They aid navigation and appear in search results.');
C(L, 'medium', 'Uses a <nav> element for navigation', h => h.landmarks.nav ? pass() : fail('No <nav> element.'),
  'Wrap the main menu in <nav> so crawlers and screen readers can identify your site navigation.');
C(L, 'low', 'Footer contains links', h => h.doc.querySelector('footer a[href]') ? pass() : fail('No links in a <footer>.'),
  'Use the footer for key links: contact, about, privacy, main categories.');
C(L, 'low', 'Anchor texts are not overly long', h => none(h.links.filter(l => l.text.length > 100).map(l => `"${trunc(l.text, 30)}"`), 'long anchor'),
  'Keep anchor text short and descriptive; do not wrap whole paragraphs in links.');
C(L, 'low', 'No excessive duplicate links', h => {
  const c = {}; internal(h).forEach(l => c[l.abs] = (c[l.abs] || 0) + 1);
  return none(Object.keys(c).filter(k => c[k] > 5).map(k => `${short(k)} (${c[k]}×)`), 'URL');
}, 'Link to the same URL a few times at most; Google mainly uses the first anchor text anyway.');
C(L, 'medium', 'Crawled pages are linked internally (no orphans)', (h, s) => {
  if (s.pages.length < 2) return na();
  const linked = new Set();
  s.pages.forEach(p => p.links.forEach(l => l.internal && linked.add((l.abs || '').split('#')[0].replace(/\/$/, ''))));
  return none(s.pages.slice(1).filter(p => !linked.has(p.url.split('#')[0].replace(/\/$/, ''))).map(p => short(p.url)), 'orphan page');
}, 'Link to every important page from at least one other page (menus, related content). Pages only in the sitemap are "orphans".');
C(L, 'low', 'Links to social media profiles', h => h.links.some(l => /(facebook|instagram|linkedin|twitter|x|youtube|tiktok|pinterest)\.com\//i.test(l.abs || '')) ? pass() : fail('No social profile links.'),
  'Link to your social profiles (and add them as sameAs in Organization schema) to connect your brand entity.');
C(L, 'low', 'More internal than external links', h => internal(h).length >= external(h).length ? pass(`${internal(h).length} internal / ${external(h).length} external.`) : fail(`${internal(h).length} internal / ${external(h).length} external.`),
  'Keep visitors on your site with more internal links than outbound links.');
C(L, 'low', 'External links do not redirect', (h, s) => {
  const ext = Object.values(s.linkStatus).filter(r => !isInternal(s, r.url) && r.status);
  if (!ext.length) return na();
  const bad = ext.filter(r => r.redirects.length && new URL(r.finalUrl).hostname !== new URL(r.url).hostname);
  return none(bad.map(r => trunc(r.url, 45)), 'redirecting link');
}, 'Update outbound links that now redirect to a different domain — the target may have moved or changed.');
C(L, 'low', 'No links to raw IP addresses', h => none(h.links.filter(l => /^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(l.abs || '')).map(l => l.abs), 'link'),
  'Link to domain names, not IP addresses.');
C(L, 'low', 'Logo links to the homepage', h => {
  const a = [...h.doc.querySelectorAll('header a[href], a[href] img[alt*="logo" i], a[href] img[src*="logo" i]')]
    .map(e => e.closest('a')).filter(Boolean);
  if (!a.length) return na('No header logo link detected.');
  return a.some(x => { try { return new URL(x.getAttribute('href'), h.url).pathname === '/'; } catch { return false; } }) ? pass() : fail();
}, 'Make the logo in the header link to the homepage — users expect it.');

// ---------- Images ----------
const I = 'Images';
const imgAsset = (s, i) => s.assets[i.abs];

C(I, 'high', 'All images have an alt attribute', h => !h.images.length ? na('No images.') : none(h.images.filter(i => i.alt === null).map(i => trunc(fname(i.src), 30)), 'image'),
  'Add alt="…" to every <img>. Describe informative images; use alt="" for purely decorative ones.');
C(I, 'medium', 'Informative images have non-empty alt text', h => {
  if (!h.images.length) return na();
  const empty = h.images.filter(i => i.alt !== null && !i.alt.trim());
  return empty.length <= h.images.length / 2 ? pass(`${empty.length} decorative (alt="").`) : fail(`${empty.length} of ${h.images.length} images have empty alt.`);
}, 'Only decorative images should have empty alt. Product photos, diagrams and content images need descriptions.');
C(I, 'low', 'Alt text under 125 characters', h => none(h.images.filter(i => (i.alt || '').length > 125).map(i => trunc(i.alt, 30)), 'long alt'),
  'Keep alt text concise (under ~125 characters); screen readers cut off long alt text.');
C(I, 'low', 'Alt text is not a filename', h => none(h.images.filter(i => /\.(jpe?g|png|gif|webp|svg)$|^(img|dsc|image|photo)[-_]?\d+/i.test(i.alt || '')).map(i => i.alt), 'image'),
  'Write alt text in plain words, not file names like "IMG_2031.jpg".');
C(I, 'medium', 'Images have width and height (prevents layout shift)', h => {
  if (!h.images.length) return na();
  const bad = h.images.filter(i => !i.width || !i.height);
  return bad.length <= h.images.length * 0.2 ? pass(`${h.images.length - bad.length} of ${h.images.length} sized.`) : fail(`${bad.length} of ${h.images.length} images lack width/height.`);
}, 'Set width and height attributes on <img> so the browser reserves space — this reduces Cumulative Layout Shift (a Core Web Vital).');
C(I, 'medium', 'Offscreen images are lazy-loaded', h => h.images.length <= 3 ? na('3 or fewer images.') : h.images.some(i => i.loading === 'lazy' || /lazy/.test(i.src + (i.srcset || ''))) || h.html.includes('data-src') ? pass() : fail(`${h.images.length} images, none lazy-loaded.`),
  'Add loading="lazy" to images below the fold so the page loads faster.');
C(I, 'low', 'First image is not lazy-loaded (LCP)', h => !h.images.length ? na() : h.images[0].loading === 'lazy' ? fail('The first image has loading="lazy".') : pass(),
  'Do not lazy-load the hero/first image — it is usually the Largest Contentful Paint element. Consider fetchpriority="high".');
C(I, 'medium', 'Uses modern image formats (WebP/AVIF)', h => {
  const raster = h.images.filter(i => /\.(jpe?g|png|webp|avif)(\?|$)/i.test(i.src) || i.inPicture);
  if (!raster.length) return na();
  return raster.some(i => /\.(webp|avif)(\?|$)/i.test(i.src + ' ' + (i.srcset || '')) || i.inPicture) || h.html.match(/image\/(webp|avif)/) ? pass() : fail('Only JPEG/PNG found.');
}, 'Serve WebP or AVIF images — typically 25–50% smaller than JPEG/PNG at the same quality.');
C(I, 'medium', 'No images larger than 200 KB', (h, s) => {
  const got = s.assetLists.imgs.map(u => s.assets[u]).filter(r => r && r.status === 200);
  if (!got.length) return na('No images measured.');
  return none(got.filter(r => r.size > 200 * 1024).map(r => `${trunc(fname(r.url), 30)} (${kb(r.size)})`), 'large image');
}, 'Compress and resize big images (e.g. with Squoosh or TinyPNG). Serve images no wider than they are displayed.');
C(I, 'medium', 'Total image weight under 1.5 MB', (h, s) => {
  const got = s.assetLists.imgs.map(u => s.assets[u]).filter(r => r && r.status === 200);
  if (!got.length) return na();
  const t = got.reduce((n, r) => n + r.size, 0);
  return t < 1.5 * 1024 * 1024 ? pass(`${kb(t)} for ${got.length} images.`) : fail(`${kb(t)} for ${got.length} images.`);
}, 'Reduce total image weight: compress, use modern formats and lazy-load below-the-fold images.');
C(I, 'low', 'Responsive images (srcset) are used', h => h.images.length < 2 ? na() : h.images.some(i => i.srcset) ? pass() : fail('No srcset found.'),
  'Use srcset/sizes so phones download smaller image versions than desktops.');
C(I, 'high', 'No broken images', (h, s) => {
  const got = s.assetLists.imgs.map(u => s.assets[u]).filter(Boolean);
  if (!got.length) return na();
  return none(got.filter(r => r.status >= 400 || (!r.status && r.error)).map(r => trunc(fname(r.url), 30)), 'broken image');
}, 'Fix image URLs that return errors, or remove the images.');
C(I, 'low', 'Descriptive image file names', h => {
  if (!h.images.length) return na();
  const bad = h.images.filter(i => /(^|\/)(img|dsc|image|photo|screenshot|unnamed)[-_ ]?\d+|\/[a-f0-9]{20,}\.\w+$/i.test(i.src));
  return none(bad.map(i => trunc(fname(i.src), 30)), 'image');
}, 'Rename images descriptively before upload, e.g. "oak-dining-table.webp" instead of "IMG_4032.jpg".');
C(I, 'medium', 'Images load over HTTPS', (h, s) => !isHttps(s) ? na() : none(h.images.filter(i => (i.abs || '').startsWith('http:')).map(i => trunc(i.src, 40)), 'image'),
  'Use https:// URLs for all images to avoid mixed-content warnings.');
C(I, 'low', 'Reasonable number of images (<60)', h => h.images.length < 60 ? pass(`${h.images.length} images.`) : fail(`${h.images.length} images.`),
  'Many images slow the page. Lazy-load, paginate galleries or use CSS sprites for icons.');
C(I, 'low', 'Images are cacheable', (h, s) => {
  const got = s.assetLists.imgs.map(u => s.assets[u]).filter(r => r && r.status === 200);
  if (!got.length) return na();
  return none(got.filter(r => !/max-age=[1-9]|immutable/.test(r.headers['cache-control'] || '') && !r.headers.expires).map(r => trunc(fname(r.url), 30)), 'image');
}, 'Serve images with Cache-Control: max-age (e.g. 1 year with versioned file names) so returning visitors do not re-download them.');
C(I, 'medium', 'Favicon is declared', h => h.favicon.length ? pass() : fail('No <link rel="icon">.'),
  'Add <link rel="icon" href="/favicon.png">. Google shows favicons next to mobile search results.');
C(I, 'low', '/favicon.ico is reachable', (h, s) => s.faviconRes.status === 200 ? pass() : fail(`/favicon.ico returned ${s.faviconRes.status || 'no response'}.`),
  'Place a favicon.ico at the site root; browsers and bots request it automatically.');
C(I, 'low', 'Apple touch icon provided', h => h.appleIcon ? pass() : fail(),
  'Add <link rel="apple-touch-icon" href="/apple-touch-icon.png"> (180×180) for iOS home-screen bookmarks.');
C(I, 'medium', 'Images on crawled pages have alt attributes', (h, s) => {
  if (s.pages.length < 2) return na();
  const bad = s.pages.filter(p => p.images.some(i => i.alt === null)).map(p => `${short(p.url)} (${p.images.filter(i => i.alt === null).length})`);
  return none(bad, 'page', `All ${s.pages.length} crawled pages pass.`);
}, 'Add alt attributes to images across the whole site, not just the homepage.');
C(I, 'low', 'Alt texts are unique', h => {
  const alts = h.images.map(i => (i.alt || '').trim().toLowerCase()).filter(a => a.length > 3);
  const d = [...new Set(alts.filter((a, i) => alts.indexOf(a) !== i))];
  return none(d.map(a => `"${trunc(a, 25)}"`), 'repeated alt');
}, 'Describe each image specifically instead of reusing the same alt text.');
C(I, 'low', 'Alt text does not start with "image of"', h => none(h.images.filter(i => /^(image|picture|photo|billede|foto) (of|af)\b/i.test(i.alt || '')).map(i => `"${trunc(i.alt, 25)}"`), 'image'),
  'Screen readers already announce "image" — start with what the image shows.');
