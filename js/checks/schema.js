import { C, pass, fail, na, none, short, list, trunc } from './core.js';

// ---------- Structured Data ----------
const SD = 'Structured Data';
const types = it => [].concat(it && it['@type'] || []).map(String);
const find = (h, re) => h.jsonld.filter(it => types(it).some(t => re.test(t)));
const has = (o, k) => o && o[k] != null && o[k] !== '' && !(Array.isArray(o[k]) && !o[k].length);
const ORG = /^(Organization|Corporation|LocalBusiness|Store|Restaurant|.*Business|ProfessionalService|MedicalOrganization|EducationalOrganization|NGO|OnlineStore)$/;
const LB = /LocalBusiness|Store|Restaurant|Dentist|Physician|AutoRepair|HairSalon|BeautySalon|LegalService|RealEstateAgent|HomeAndConstructionBusiness|FoodEstablishment|LodgingBusiness/;

C(SD, 'medium', 'Structured data present', h => h.jsonld.length || h.microdata ? pass(h.schemaTypes.length ? list([...new Set(h.schemaTypes)], 6) : `${h.microdata} microdata item(s).`) : fail('No schema.org markup found.'),
  'Add JSON-LD structured data (Organization, WebSite, and page-specific types like Product or Article) to qualify for rich results.');
C(SD, 'high', 'JSON-LD is valid JSON', h => h.jsonldErrors.length ? fail(list(h.jsonldErrors, 2)) : h.jsonld.length ? pass() : na(),
  'Fix the syntax error in your JSON-LD block (trailing commas, unescaped quotes). Test it at validator.schema.org.');
C(SD, 'low', 'Uses JSON-LD format', h => !h.jsonld.length && !h.microdata ? na() : h.jsonld.length ? pass() : fail('Only microdata used.'),
  'Google recommends JSON-LD — it is easier to maintain than microdata woven into the HTML.');
C(SD, 'medium', 'JSON-LD declares schema.org @context', h => {
  if (!h.jsonld.length) return na();
  const blocks = [...h.doc.querySelectorAll('script[type="application/ld+json" i]')].map(s => s.textContent);
  return blocks.every(b => /schema\.org/i.test(b)) ? pass() : fail('A block is missing "@context": "https://schema.org".');
}, 'Start each JSON-LD block with "@context": "https://schema.org".');
C(SD, 'medium', 'Every JSON-LD item has @type', h => !h.jsonld.length ? na() : none(h.jsonld.filter(it => !types(it).length).map((_, i) => `item ${i + 1}`), 'item'),
  'Give every structured-data item a @type so search engines know what it describes.');
C(SD, 'medium', 'Organization or LocalBusiness schema', h => find(h, ORG).length || find(h, LB).length ? pass(types(find(h, ORG)[0] || find(h, LB)[0]).join(', ')) : fail(),
  'Add Organization (or LocalBusiness) JSON-LD with name, url, logo and contact details — it feeds Google\'s Knowledge Panel.');
C(SD, 'low', 'Organization schema has a logo', h => { const o = find(h, ORG)[0] || find(h, LB)[0]; return !o ? na() : has(o, 'logo') || has(o, 'image'); },
  'Add a "logo" property (square-ish, at least 112×112px) to your Organization schema.');
C(SD, 'low', 'Organization schema lists social profiles (sameAs)', h => { const o = find(h, ORG)[0] || find(h, LB)[0]; return !o ? na() : has(o, 'sameAs'); },
  'Add "sameAs": [links to your Facebook, LinkedIn, Instagram…] to connect your brand entity.');
C(SD, 'low', 'WebSite schema present', h => find(h, /^WebSite$/).length ? pass() : fail(),
  'Add WebSite JSON-LD with name and url — it helps Google show your preferred site name in results.');
C(SD, 'low', 'WebSite schema has a name', h => { const w = find(h, /^WebSite$/)[0]; return !w ? na() : has(w, 'name'); },
  'Set "name" in the WebSite schema to your brand name (this controls the site name shown in Google).');
C(SD, 'low', 'BreadcrumbList schema on subpages', (h, s) => {
  const sub = s.pages.slice(1); if (!sub.length) return na();
  const n = sub.filter(p => p.schemaTypes.includes('BreadcrumbList')).length;
  return n ? pass(`${n} of ${sub.length} subpages.`) : fail('No BreadcrumbList found on crawled subpages.');
}, 'Add BreadcrumbList JSON-LD to subpages so Google can show the breadcrumb path instead of the raw URL.');
C(SD, 'low', 'LocalBusiness schema has an address', h => { const b = find(h, LB)[0]; return !b ? na('No LocalBusiness schema.') : has(b, 'address'); },
  'Add a full PostalAddress (street, city, postal code, country) to LocalBusiness schema.');
C(SD, 'low', 'LocalBusiness schema has a phone number', h => { const b = find(h, LB)[0]; return !b ? na() : has(b, 'telephone'); },
  'Add "telephone" in international format (+45…) to LocalBusiness schema.');
C(SD, 'low', 'LocalBusiness schema has opening hours', h => { const b = find(h, LB)[0]; return !b ? na() : has(b, 'openingHoursSpecification') || has(b, 'openingHours'); },
  'Add openingHoursSpecification so Google can show when you are open.');
C(SD, 'medium', 'Product schema includes offers/price', (h, s) => {
  const p = s.pages.flatMap(pg => pg.jsonld).filter(it => types(it).includes('Product'));
  if (!p.length) return na('No Product schema found.');
  return none(p.filter(x => !has(x, 'offers')).map(x => trunc(x.name || 'Product', 30)), 'product');
}, 'Add "offers" with price, priceCurrency and availability to Product schema to get price rich results.');
C(SD, 'low', 'Product schema includes ratings or reviews', (h, s) => {
  const p = s.pages.flatMap(pg => pg.jsonld).filter(it => types(it).includes('Product'));
  if (!p.length) return na();
  return p.some(x => has(x, 'aggregateRating') || has(x, 'review')) ? pass() : fail();
}, 'Add aggregateRating/review from genuine customer reviews to show stars in search results.');
C(SD, 'medium', 'Article schema has headline, date and author', (h, s) => {
  const a = s.pages.flatMap(pg => pg.jsonld).filter(it => types(it).some(t => /Article|BlogPosting|NewsArticle/.test(t)));
  if (!a.length) return na('No Article schema found.');
  return none(a.filter(x => !has(x, 'headline') || !has(x, 'datePublished') || !has(x, 'author')).map(x => trunc(x.headline || 'Article', 30)), 'article');
}, 'Include headline, datePublished, dateModified, author and image in Article schema.');
C(SD, 'low', 'FAQPage schema is complete', (h, s) => {
  const f = s.pages.flatMap(pg => pg.jsonld).filter(it => types(it).includes('FAQPage'));
  if (!f.length) return na('No FAQPage schema.');
  return f.every(x => [].concat(x.mainEntity || []).length && [].concat(x.mainEntity).every(q => q.acceptedAnswer)) ? pass() : fail('Questions without acceptedAnswer.');
}, 'Every Question in FAQPage needs name and acceptedAnswer.text.');
C(SD, 'low', 'No empty values in structured data', h => {
  if (!h.jsonld.length) return na();
  const empty = [];
  const walk = (o, path) => { if (o && typeof o === 'object') Object.entries(o).forEach(([k, v]) => { if (v === '' || v === null) empty.push(path + k); else walk(v, path + k + '.'); }); };
  h.jsonld.forEach(it => walk(it, ''));
  return none([...new Set(empty)], 'empty property');
}, 'Remove empty properties or fill them in — empty values can make items ineligible for rich results.');
C(SD, 'low', 'Most crawled pages have structured data', (h, s) => {
  if (s.pages.length < 2) return na();
  const n = s.pages.filter(p => p.jsonld.length || p.microdata).length;
  return n / s.pages.length >= 0.5 ? pass(`${n} of ${s.pages.length} pages.`) : fail(`${n} of ${s.pages.length} pages.`);
}, 'Add relevant schema to templates (products, articles, services, breadcrumbs) so it appears site-wide.');

// ---------- Social Sharing ----------
const SO = 'Social Sharing';
C(SO, 'medium', 'Open Graph title (og:title)', h => h.og.title ? pass(`"${trunc(h.og.title)}"`) : fail(),
  'Add <meta property="og:title" content="…"> — used as the headline when the page is shared on Facebook, LinkedIn, Slack etc.');
C(SO, 'medium', 'Open Graph description', h => h.og.description ? pass() : fail(),
  'Add og:description with a short, enticing summary for social shares.');
C(SO, 'medium', 'Open Graph image', h => h.og.image ? pass(trunc(h.og.image, 60)) : fail(),
  'Add og:image (1200×630 px) so shares show a large preview image — it greatly increases clicks.');
C(SO, 'low', 'og:image is an absolute URL', h => !h.og.image ? na() : /^https?:\/\//.test(h.og.image),
  'Use a full https:// URL for og:image; relative paths do not work on most platforms.');
C(SO, 'low', 'og:url set', h => h.og.url ? pass() : fail(), 'Add og:url with the canonical URL of the page.');
C(SO, 'low', 'og:type set', h => h.og.type ? pass(h.og.type) : fail(), 'Add og:type (website for the homepage, article for posts, product for products).');
C(SO, 'low', 'og:site_name set', h => h.og.site_name ? pass(h.og.site_name) : fail(), 'Add og:site_name with your brand name.');
C(SO, 'low', 'og:locale set', h => h.og.locale ? pass(h.og.locale) : fail(), 'Add og:locale (e.g. en_US, da_DK) to indicate the content language.');
C(SO, 'low', 'og:url matches the canonical URL', h => !h.og.url || !h.canonical ? na() : h.og.url.replace(/\/$/, '') === h.canonical.replace(/\/$/, '') ? pass() : fail(`${trunc(h.og.url, 40)} vs ${trunc(h.canonical, 40)}`),
  'Use the same URL in og:url and the canonical tag so share counts consolidate on one URL.');
C(SO, 'low', 'og:image dimensions declared', h => !h.og.image ? na() : h.og['image:width'] && h.og['image:height'] ? pass(`${h.og['image:width']}×${h.og['image:height']}`) : fail(),
  'Add og:image:width and og:image:height so platforms can render the preview immediately.');
C(SO, 'low', 'Twitter/X card type set', h => h.tw.card ? pass(h.tw.card) : fail(),
  'Add <meta name="twitter:card" content="summary_large_image"> for large image previews on X.');
C(SO, 'low', 'Twitter/X title available', h => h.tw.title || h.og.title ? pass() : fail(),
  'X falls back to og:title — add either twitter:title or og:title.');
C(SO, 'low', 'Twitter/X image available', h => h.tw.image || h.og.image ? pass() : fail(),
  'Add twitter:image or og:image so shares on X include a picture.');
C(SO, 'low', 'og:title is not too long', h => !h.og.title ? na() : h.og.title.length <= 95 ? pass(`${h.og.title.length} characters.`) : fail(`${h.og.title.length} characters.`),
  'Keep og:title under ~95 characters (ideally ~60) to avoid truncation.');
C(SO, 'low', 'og:description is 200 characters or less', h => !h.og.description ? na() : h.og.description.length <= 200 ? pass() : fail(`${h.og.description.length} characters.`),
  'Keep og:description short — most platforms show only 1–2 lines.');
C(SO, 'low', 'Crawled pages have Open Graph tags', (h, s) => {
  if (s.pages.length < 2) return na();
  return none(s.pages.filter(p => !p.og.title).map(p => short(p.url)), 'page', `All ${s.pages.length} crawled pages pass.`);
}, 'Add Open Graph tags to every page template, not only the homepage.');

// ---------- Accessibility ----------
const A = 'Accessibility';
const labelled = (doc, el) => (el.id && doc.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label') || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');

C(A, 'high', 'Page declares a language (lang)', h => h.lang ? pass(`lang="${h.lang}"`) : fail('<html> has no lang attribute.'),
  'Add lang to the html element, e.g. <html lang="en">. Screen readers and search engines use it.');
C(A, 'medium', 'Form fields have labels', h => !h.inputs.length ? na('No form fields.') : none(h.inputs.filter(i => !labelled(h.doc, i) && !i.getAttribute('placeholder')).map(i => i.name || i.id || i.tagName.toLowerCase()), 'unlabelled field'),
  'Associate every input with a <label for="…"> (placeholders are not labels).');
C(A, 'medium', 'Buttons have accessible names', h => none(h.buttons.filter(b => !(b.textContent.trim() || b.getAttribute('aria-label') || b.getAttribute('title') || b.getAttribute('value') || b.querySelector('img[alt]:not([alt=""])'))).map(b => b.className ? '.' + String(b.className).split(' ')[0] : 'button'), 'button'),
  'Give icon buttons an aria-label (e.g. aria-label="Open menu").');
C(A, 'medium', 'Links have discernible text', h => none(h.links.filter(l => !l.text && !l.title).map(l => short(l.abs || l.raw)), 'link'),
  'Add text, an aria-label or alt text on the inner image for every link.');
C(A, 'low', 'Page has a <main> landmark', h => h.landmarks.main ? pass() : fail(),
  'Wrap the primary content in <main> so assistive tech (and parsers) can jump straight to it.');
C(A, 'low', 'Skip-to-content link', h => h.links.some(l => /^#(main|content|skip)/i.test(l.raw) || /skip to|spring til/i.test(l.text)) ? pass() : fail(),
  'Add a "Skip to content" link as the first focusable element for keyboard users.');
C(A, 'low', 'No positive tabindex values', h => h.tabindexPositive ? fail(`${h.tabindexPositive} element(s).`) : pass(),
  'Remove tabindex values above 0; they break the natural keyboard order.');
C(A, 'low', 'No duplicate element IDs', h => none(h.dupIds.map(i => '#' + i), 'duplicate id'),
  'IDs must be unique per page; duplicates break labels, anchors and scripts.');
C(A, 'low', 'Iframes have a title', h => !h.iframes.length ? na('No iframes.') : none(h.iframes.filter(f => !f.title).map(f => trunc(f.src, 35)), 'iframe'),
  'Add title="…" to each iframe describing its content (e.g. "Map of our location").');
C(A, 'low', 'Data tables have header cells', h => {
  const data = h.tables.filter(t => t.querySelectorAll('tr').length > 1 && t.getAttribute('role') !== 'presentation');
  if (!data.length) return na('No data tables.');
  return none(data.filter(t => !t.querySelector('th')).map((_, i) => `table ${i + 1}`), 'table');
}, 'Use <th> for header cells (with scope) so tables are understandable to screen readers and search engines.');
C(A, 'low', 'No autoplaying media', h => [...h.videos, ...h.audios].some(m => m.hasAttribute('autoplay') && !m.hasAttribute('muted')) ? fail('Media autoplays with sound.') : pass(),
  'Do not autoplay audio/video with sound; if autoplay is needed, mute it and provide controls.');
C(A, 'low', 'Inline SVG icons are labelled or hidden', h => {
  const svgs = [...h.doc.querySelectorAll('a svg, button svg')];
  if (!svgs.length) return na();
  const bad = svgs.filter(s => s.getAttribute('aria-hidden') !== 'true' && !s.querySelector('title') && !s.getAttribute('aria-label') && !(s.closest('a,button').textContent.trim() || s.closest('a,button').getAttribute('aria-label')));
  return none(bad.map(() => 'svg'), 'unlabelled icon');
}, 'Give icon-only links/buttons an aria-label, and add aria-hidden="true" to decorative SVGs.');
C(A, 'low', 'Page has a heading structure', h => h.headings.length >= 2 ? pass(`${h.headings.length} headings.`) : fail(),
  'Use headings to outline the page; screen reader users navigate by heading.');
C(A, 'low', 'No deprecated HTML tags', h => none([...new Set(h.deprecated)].map(t => `<${t}>`), 'deprecated tag'),
  'Replace <font>, <center>, <marquee> etc. with CSS.');
C(A, 'low', 'Limited inline style attributes', h => h.inlineStyleAttrs < 50 ? pass(`${h.inlineStyleAttrs}.`) : fail(`${h.inlineStyleAttrs} elements with style="…".`),
  'Move inline styles into a stylesheet — easier to maintain, cache and theme.');
C(A, 'low', 'Header and footer landmarks', h => h.landmarks.header && h.landmarks.footer ? pass() : fail(`${h.landmarks.header ? '' : '<header> '}${h.landmarks.footer ? '' : '<footer>'} missing.`),
  'Use semantic <header> and <footer> elements for site-wide areas.');

// ---------- International ----------
const IN = 'International';
const BCP47 = /^[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|\d{3}))?$/i;

C(IN, 'medium', 'lang attribute is a valid language code', h => !h.lang ? na() : BCP47.test(h.lang) ? pass(h.lang) : fail(`"${h.lang}" is not a valid code.`),
  'Use a valid BCP 47 code such as "en", "en-GB" or "da-DK".');
C(IN, 'low', 'og:locale matches the page language', h => !h.lang || !h.og.locale ? na() : h.og.locale.slice(0, 2).toLowerCase() === h.lang.slice(0, 2).toLowerCase() ? pass() : fail(`lang="${h.lang}" but og:locale="${h.og.locale}"`),
  'Make og:locale consistent with the html lang attribute.');
C(IN, 'medium', 'hreflang codes are valid', h => !h.hreflangs.length ? na('No hreflang tags (fine for single-language sites).') : none(h.hreflangs.filter(x => x.lang !== 'x-default' && !BCP47.test(x.lang)).map(x => x.lang), 'invalid code'),
  'Use ISO 639-1 language (+ optional ISO 3166-1 region) codes, e.g. "en-gb" — not "uk" or "en-UK".');
C(IN, 'medium', 'hreflang includes a self-reference', h => !h.hreflangs.length ? na() : h.hreflangs.some(x => (x.href || '').replace(/\/$/, '') === h.url.replace(/\/$/, '')) ? pass() : fail(),
  'Each language version must list itself in its hreflang set, as well as all alternates.');
C(IN, 'low', 'hreflang has an x-default', h => !h.hreflangs.length ? na() : h.hreflangs.some(x => x.lang === 'x-default'),
  'Add hreflang="x-default" pointing at your language selector or main version.');
C(IN, 'low', 'hreflang URLs are absolute', h => {
  if (!h.hreflangs.length) return na();
  const raw = [...h.doc.querySelectorAll('link[hreflang]')].map(l => l.getAttribute('href') || '');
  return none(raw.filter(u => !/^https?:\/\//.test(u)), 'relative URL');
}, 'Use absolute URLs in hreflang annotations.');
C(IN, 'medium', 'Page is encoded as UTF-8', h => {
  const cs = (h.charset || (h.headers['content-type'] || '').match(/charset=([\w-]+)/i)?.[1] || '').toLowerCase();
  return !cs ? na() : /utf-?8/.test(cs) ? pass() : fail(cs);
}, 'Use UTF-8 everywhere so special characters (æ, ø, é, ü…) display correctly.');
C(IN, 'low', 'Consistent language across crawled pages', (h, s) => {
  if (s.pages.length < 2) return na();
  const langs = [...new Set(s.pages.map(p => (p.lang || 'none').slice(0, 2).toLowerCase()))];
  return langs.length === 1 || h.hreflangs.length ? pass(langs.join(', ')) : fail(`Mixed: ${langs.join(', ')}`);
}, 'Set the correct lang on every page; if the site is multilingual, add hreflang annotations.');
