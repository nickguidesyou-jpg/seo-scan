import { C, pass, fail, na, none, sitewide, pagesWhere, short, list, trunc, words, jaccard, dupes } from './core.js';

const brandOf = h => h.host.replace(/^www\./, '').split('.')[0].toLowerCase();
const topKeys = (h, n = 5) => h.topWords.slice(0, n).map(([w]) => w);

// ---------- Titles ----------
const T = 'Titles';
C(T, 'high', 'Page has a <title> tag', h => h.titles.length ? pass(`"${trunc(h.title)}"`) : fail('No <title> element.'),
  'Add a <title> in <head>. It is the clickable headline in search results and one of the strongest on-page signals.');
C(T, 'medium', 'Only one <title> tag', h => h.titles.length <= 1 ? pass() : fail(`${h.titles.length} title tags.`),
  'Remove duplicate <title> tags (often caused by theme + SEO plugin both adding one).');
C(T, 'high', 'Title is not empty', h => !h.titles.length ? na() : h.title ? pass() : fail('The <title> is empty.'),
  'Write a descriptive title that says what the page is about.');
C(T, 'medium', 'Title is at least 30 characters', h => !h.title ? na() : h.title.length >= 30 ? pass(`${h.title.length} characters.`) : fail(`Only ${h.title.length} characters.`),
  'Expand short titles with your main keyword and a benefit, e.g. "Handmade Oak Tables | Free Delivery – Brand".');
C(T, 'medium', 'Title is at most 60 characters', h => !h.title ? na() : h.title.length <= 60 ? pass(`${h.title.length} characters.`) : fail(`${h.title.length} characters — will be cut off in Google.`),
  'Keep titles under ~60 characters (about 580 px) so they are not truncated in search results. Put the keyword first.');
C(T, 'low', 'Title does not start with a generic word', h => !h.title ? na() : /^(home|welcome|homepage|forside|index|untitled)\b/i.test(h.title) ? fail(`Starts with "${h.title.split(/\s/)[0]}".`) : pass(),
  'Lead with your main keyword instead of "Home" or "Welcome", which waste the most valuable part of the title.');
C(T, 'low', 'Title is not written in ALL CAPS', h => !h.title ? na() : h.title.length > 8 && h.title === h.title.toUpperCase() && /[A-Z]/.test(h.title) ? fail() : pass(),
  'Use normal sentence or title case. All-caps titles look spammy and take more pixel width.');
C(T, 'low', 'No repeated words in title (keyword stuffing)', h => {
  if (!h.title) return na();
  const c = {}; words(h.title).filter(w => w.length > 3).forEach(w => c[w] = (c[w] || 0) + 1);
  const rep = Object.keys(c).filter(k => c[k] >= 3);
  return rep.length ? fail(`Repeated: ${rep.join(', ')}`) : pass();
}, 'Mention the keyword once. Repeating it looks like stuffing and can make Google rewrite your title.');
C(T, 'low', 'Title includes your brand name', h => !h.title ? na() : h.title.toLowerCase().replace(/[\s-]/g, '').includes(brandOf(h).replace(/-/g, '')) ? pass() : fail(`"${brandOf(h)}" not found in title.`),
  'Add your brand at the end of the title, e.g. "Main Keyword – Brand", to build recognition in results.');
C(T, 'low', 'Title and H1 share keywords', h => !h.title || !h.h1s[0] ? na() : jaccard(words(h.title), words(h.h1s[0])) > 0 ? pass() : fail(`Title "${trunc(h.title, 40)}" vs H1 "${trunc(h.h1s[0], 40)}"`),
  'Align the title and H1 around the same topic so users and search engines get a consistent message.');
C(T, 'low', 'Title contains a main content keyword', h => {
  if (!h.title || !h.topWords.length) return na();
  const tw = words(h.title);
  return topKeys(h).some(k => tw.includes(k)) ? pass() : fail(`Top words on page: ${topKeys(h).join(', ')}`);
}, 'Use the word the page is really about (your most frequent topic word) in the title.');
C(T, 'low', 'Title does not overuse separators', h => !h.title ? na() : (h.title.match(/[|•·–—:\-]/g) || []).length <= 3,
  'Use at most 1–2 separators ( | or – ). Long chains of pipes look cluttered.');
C(T, 'high', 'All crawled pages have a title', (h, s) => sitewide(s, p => !p.title),
  'Give every page its own title. Pages without titles get auto-generated snippets and rank poorly.');
C(T, 'medium', 'No duplicate titles across pages', (h, s) => s.pages.length < 2 ? na() : none(dupes(s.pages.map(p => [p.url, p.title])).map(t => `"${trunc(t, 40)}"`), 'duplicated title'),
  'Write a unique title for each page. Duplicates make pages compete with each other.');
C(T, 'low', 'Crawled page titles are 30–60 characters', (h, s) => sitewide(s, p => p.title && (p.title.length < 30 || p.title.length > 60)),
  'Aim for 30–60 characters on every page title.');
C(T, 'medium', 'Title is not a placeholder', h => !h.title ? na() : /(untitled|just another .* site|my wordpress|new page|document|coming soon|^page$|lorem)/i.test(h.title) ? fail(`"${h.title}"`) : pass(),
  'Replace the default CMS/placeholder title with a real, descriptive one.');

// ---------- Meta descriptions ----------
const M = 'Meta Descriptions';
C(M, 'medium', 'Meta description present', h => h.metaDescs.length ? pass(`"${trunc(h.metaDesc, 90)}"`) : fail('No meta description.'),
  'Add <meta name="description" content="…"> with a compelling 1–2 sentence summary. It is often shown as the snippet under your title.');
C(M, 'low', 'Only one meta description', h => h.metaDescs.length <= 1 ? pass() : fail(`${h.metaDescs.length} found.`),
  'Remove duplicate description tags.');
C(M, 'medium', 'Meta description is not empty', h => !h.metaDescs.length ? na() : h.metaDesc.trim() ? pass() : fail('Empty content attribute.'),
  'Fill in the description content.');
C(M, 'medium', 'Meta description is at least 70 characters', h => !h.metaDesc ? na() : h.metaDesc.length >= 70 ? pass(`${h.metaDesc.length} characters.`) : fail(`Only ${h.metaDesc.length} characters.`),
  'Write 120–160 characters: what the page offers, a benefit, and a call to action.');
C(M, 'medium', 'Meta description is at most 160 characters', h => !h.metaDesc ? na() : h.metaDesc.length <= 160 ? pass(`${h.metaDesc.length} characters.`) : fail(`${h.metaDesc.length} characters — will be truncated.`),
  'Trim to ~155–160 characters and front-load the important part.');
C(M, 'low', 'Meta description differs from title', h => !h.metaDesc || !h.title ? na() : h.metaDesc.trim().toLowerCase() !== h.title.trim().toLowerCase(),
  'Use the description to add information the title does not already say.');
C(M, 'low', 'Meta description contains a main keyword', h => {
  if (!h.metaDesc || !h.topWords.length) return na();
  const dw = words(h.metaDesc);
  return topKeys(h).some(k => dw.includes(k)) ? pass() : fail(`Consider using: ${topKeys(h, 3).join(', ')}`);
}, 'Include the main keyword — Google bolds matching words in the snippet, which improves click-through.');
C(M, 'low', 'Meta description has no HTML or odd characters', h => !h.metaDesc ? na() : /<[a-z]|&lt;|\{\{|\}\}/i.test(h.metaDesc) ? fail() : pass(),
  'Use plain text only in the description — no HTML tags or template placeholders.');
C(M, 'medium', 'All crawled pages have a meta description', (h, s) => sitewide(s, p => !(p.metaDesc || '').trim()),
  'Write a unique description for each important page.');
C(M, 'medium', 'No duplicate meta descriptions', (h, s) => s.pages.length < 2 ? na() : none(dupes(s.pages.map(p => [p.url, p.metaDesc])).map(t => `"${trunc(t, 40)}"`), 'duplicated description'),
  'Make each description unique to its page.');
C(M, 'low', 'Crawled descriptions are 70–160 characters', (h, s) => sitewide(s, p => p.metaDesc && (p.metaDesc.length < 70 || p.metaDesc.length > 160)),
  'Keep every description between 70 and 160 characters.');
C(M, 'low', 'No obsolete meta keywords tag', h => h.keywordsMeta ? fail('meta keywords is present.') : pass(),
  'Remove meta keywords. Google ignores it and it reveals your keyword strategy to competitors.');

// ---------- Headings ----------
const H = 'Headings';
C(H, 'high', 'Page has an H1 heading', h => h.h1s.length ? pass(`"${trunc(h.h1s[0])}"`) : fail('No <h1>.'),
  'Add one <h1> that states the main topic of the page.');
C(H, 'medium', 'Exactly one H1', h => !h.h1s.length ? na() : h.h1s.length === 1 ? pass() : fail(`${h.h1s.length} H1s: ${list(h.h1s.map(t => `"${trunc(t, 30)}"`), 3)}`),
  'Use a single H1 per page and turn the others into H2s.');
C(H, 'high', 'H1 is not empty', h => !h.h1s.length ? na() : h.h1s.every(Boolean) ? pass() : fail('An H1 has no text (maybe only an image without alt).'),
  'Give the H1 real text. If it is a logo image, add alt text or use a text heading.');
C(H, 'low', 'H1 is 20–70 characters', h => !h.h1s[0] ? na() : h.h1s[0].length >= 20 && h.h1s[0].length <= 70 ? pass(`${h.h1s[0].length} characters.`) : fail(`${h.h1s[0].length} characters.`),
  'Write a clear, specific H1 of roughly 20–70 characters.');
C(H, 'low', 'H1 is not identical to the title', h => !h.h1s[0] || !h.title ? na() : h.h1s[0].toLowerCase() !== h.title.toLowerCase(),
  'Use the title for search results and the H1 for on-page wording — related, but not copy-paste identical.');
C(H, 'medium', 'Page uses H2 subheadings', h => h.headings.some(x => x.level === 2) ? pass(`${h.headings.filter(x => x.level === 2).length} H2s.`) : fail('No H2 headings.'),
  'Structure content with H2 subheadings for each main section. It helps skimming and featured snippets.');
C(H, 'low', 'Heading levels are not skipped', h => {
  const skips = [];
  h.headings.forEach((x, i) => { const prev = i ? h.headings[i - 1].level : 0; if (x.level > prev + 1 && prev) skips.push(`H${prev}→H${x.level}`); });
  return none([...new Set(skips)], 'skip');
}, 'Go down one level at a time (H1 → H2 → H3). Pick heading levels for structure, and style with CSS.');
C(H, 'low', 'First heading is the H1', h => !h.headings.length ? na() : h.headings[0].level === 1 ? pass() : fail(`First heading is H${h.headings[0].level}: "${trunc(h.headings[0].text, 40)}"`),
  'Put the H1 before other headings; avoid using H2–H4 for logos or header widgets.');
C(H, 'low', 'No empty headings', h => none(h.headings.filter(x => !x.text).map(x => 'H' + x.level), 'empty heading'),
  'Remove empty heading tags or add text to them.');
C(H, 'low', 'Headings are not overly long', h => none(h.headings.filter(x => x.text.length > 120).map(x => `H${x.level} (${x.text.length} chars)`), 'heading'),
  'Keep headings short and scannable; move long text into paragraphs.');
C(H, 'low', 'Headings are not overused', h => h.wordCount < 100 || h.headings.length <= h.wordCount / 15 ? pass(`${h.headings.length} headings / ${h.wordCount} words.`) : fail(`${h.headings.length} headings for ${h.wordCount} words.`),
  'Use headings to structure content, not to style short text snippets (use CSS for that).');
C(H, 'low', 'H1 contains a main content keyword', h => {
  if (!h.h1s[0] || !h.topWords.length) return na();
  return topKeys(h).some(k => words(h.h1s[0]).includes(k)) ? pass() : fail(`Top words: ${topKeys(h).join(', ')}`);
}, 'Include the primary keyword naturally in the H1.');
C(H, 'medium', 'All crawled pages have an H1', (h, s) => sitewide(s, p => !p.h1s.length),
  'Add an H1 to every page.');
C(H, 'low', 'No duplicate H1s across pages', (h, s) => s.pages.length < 2 ? na() : none(dupes(s.pages.map(p => [p.url, p.h1s[0]])).map(t => `"${trunc(t, 40)}"`), 'duplicated H1'),
  'Give each page a unique H1 that describes that specific page.');
C(H, 'low', 'No crawled pages with multiple H1s', (h, s) => sitewide(s, p => p.h1s.length > 1),
  'Keep one H1 per page across the site.');
C(H, 'low', 'Long pages have enough subheadings', h => { if (h.wordCount < 600) return na('Page is shorter than 600 words.'); const n = h.headings.filter(x => x.level === 2 || x.level === 3).length; return n >= 3 ? pass(`${n} H2/H3s.`) : fail(`${n} H2/H3s for ${h.wordCount} words.`); },
  'Break long content into sections with at least one H2/H3 every 300 words or so.');

// ---------- Content ----------
const X = 'Content';
const sentences = t => (t.match(/[^.!?]+[.!?]+/g) || []).filter(x => x.trim().split(/\s+/).length > 2);
const syllables = w => Math.max(1, (w.toLowerCase().replace(/e$/, '').match(/[aeiouyæøå]+/g) || []).length);
const LINKS_TO = (h, re) => h.links.some(l => re.test(l.abs || '') || re.test(l.text || ''));

C(X, 'high', 'Homepage is not thin (150+ words)', h => h.wordCount >= 150 ? pass(`${h.wordCount} words.`) : fail(`Only ${h.wordCount} words.`),
  'Add meaningful text: what you do, who it is for, why choose you. Pages with almost no text rarely rank.');
C(X, 'medium', 'Homepage has 300+ words', h => h.wordCount >= 300 ? pass(`${h.wordCount} words.`) : fail(`${h.wordCount} words.`),
  'Aim for at least 300 words of useful, original copy on key pages.');
C(X, 'low', 'Text-to-HTML ratio is at least 10%', h => {
  const r = h.text.length / Math.max(h.html.length, 1);
  return r >= 0.1 ? pass(`${(r * 100).toFixed(1)}%`) : fail(`${(r * 100).toFixed(1)}% text.`);
}, 'Reduce code bloat (inline scripts/styles, builder markup) and/or add more content.');
C(X, 'low', 'Readable text (Flesch score ≥ 50)', h => {
  const sents = sentences(h.mainText); const w = words(h.mainText);
  if (sents.length < 3 || w.length < 100) return na('Not enough text to score.');
  const syl = w.reduce((n, x) => n + syllables(x), 0);
  const score = Math.round(206.835 - 1.015 * (w.length / sents.length) - 84.6 * (syl / w.length));
  return score >= 50 ? pass(`Score ${score}.`) : fail(`Score ${score} (hard to read).`);
}, 'Use shorter sentences and simpler words. Aim for text a 13–15 year-old can read easily.');
C(X, 'low', 'Sentences average under 25 words', h => {
  const s = sentences(h.mainText); if (s.length < 3) return na();
  const avg = words(h.mainText).length / s.length;
  return avg <= 25 ? pass(`${avg.toFixed(1)} words/sentence.`) : fail(`${avg.toFixed(1)} words/sentence.`);
}, 'Split long sentences. Short sentences are easier to read on mobile.');
C(X, 'low', 'Paragraphs are not too long', h => none(h.paragraphs.filter(p => p.split(' ').length > 150).map(p => `"${trunc(p, 30)}"`), 'long paragraph'),
  'Keep paragraphs under ~150 words (3–4 sentences) for easy scanning.');
C(X, 'high', 'No placeholder "lorem ipsum" text', (h, s) => none(pagesWhere(s, p => /lorem ipsum|dolor sit amet/i.test(p.text)), 'page'),
  'Replace all lorem ipsum placeholder text with real content before launch.');
C(X, 'medium', 'No keyword stuffing (top word ≤ 5%)', h => {
  if (h.wordCount < 300 || !h.topWords.length) return na('Fewer than 300 words.');
  const [w, n] = h.topWords[0]; const d = n / h.wordCount;
  return d <= 0.05 ? pass(`"${w}" at ${(d * 100).toFixed(1)}%.`) : fail(`"${w}" makes up ${(d * 100).toFixed(1)}% of the text.`);
}, 'Write naturally for humans; use synonyms and related terms instead of repeating one keyword.');
C(X, 'low', 'Uses lists to structure content', h => h.lists > 0,
  'Use bullet or numbered lists for features, steps and benefits — they are easy to scan and can win featured snippets.');
C(X, 'low', 'Uses bold/strong for key phrases', h => h.strong > 0,
  'Highlight a few important phrases with <strong> to help skimmers.');
C(X, 'low', 'Contact information is visible', h => /(\+?\d[\d\s-]{7,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)/.test(h.text) || LINKS_TO(h, /^(tel|mailto):/i) ? pass() : fail('No phone number or email found on the homepage.'),
  'Show a phone number and/or email (e.g. in the footer). It builds trust with users and search engines.');
C(X, 'medium', 'Links to a privacy policy', h => LINKS_TO(h, /privacy|privatliv|persondata|cookie|datenschutz|gdpr/i) ? pass() : fail('No privacy/cookie policy link found.'),
  'Add a privacy policy page and link it in the footer. It is legally required in the EU and a trust signal.');
C(X, 'low', 'Links to an About page', h => LINKS_TO(h, /about|om-os|om os|ueber-uns|über uns|who-we-are|team/i) ? pass() : fail('No About page link.'),
  'Add an About page explaining who is behind the site — important for E-E-A-T (experience, expertise, trust).');
C(X, 'low', 'Links to a Contact page', h => LINKS_TO(h, /contact|kontakt/i) ? pass() : fail('No Contact page link.'),
  'Make it easy to contact you with a dedicated contact page linked from the menu or footer.');
C(X, 'low', 'Copyright year is current', h => {
  const m = h.text.match(/(?:©|\(c\)|copyright)[\s©]*(?:\d{4}\s*[-–]\s*)?(\d{4})/i);
  if (!m) return na('No copyright notice found.');
  const y = new Date().getFullYear();
  return +m[1] >= y - 1 ? pass(`© ${m[1]}`) : fail(`© ${m[1]} — looks outdated.`);
}, 'Update the footer year (or generate it automatically). An old year makes the site look abandoned.');
C(X, 'low', 'No duplicate paragraphs on the page', h => {
  const seen = new Set(), d = new Set();
  h.paragraphs.filter(p => p.length > 60).forEach(p => seen.has(p) ? d.add(p) : seen.add(p));
  return none([...d].map(p => `"${trunc(p, 30)}"`), 'repeated paragraph');
}, 'Remove repeated blocks of text; say each thing once.');
C(X, 'medium', 'Crawled pages average 300+ words', (h, s) => {
  if (s.pages.length < 2) return na();
  const avg = Math.round(s.pages.reduce((n, p) => n + p.wordCount, 0) / s.pages.length);
  return avg >= 300 ? pass(`Average ${avg} words.`) : fail(`Average ${avg} words.`);
}, 'Expand important pages with useful, specific information.');
C(X, 'medium', 'No thin pages (<200 words)', (h, s) => sitewide(s, p => p.wordCount < 200),
  'Improve thin pages with more content, merge them with related pages, or noindex them if they have no search value.');
C(X, 'medium', 'No near-duplicate pages', (h, s) => {
  if (s.pages.length < 2) return na();
  const shingles = p => { const w = words(p.mainText); const out = []; for (let i = 0; i + 5 <= w.length; i++) out.push(w.slice(i, i + 5).join(' ')); return out; };
  const sets = s.pages.map(shingles);
  const bad = [];
  for (let i = 0; i < s.pages.length; i++) for (let j = i + 1; j < s.pages.length; j++) {
    if (sets[i].length > 80 && sets[j].length > 80 && jaccard(sets[i], sets[j]) > 0.85) bad.push(`${short(s.pages[i].url)} ≈ ${short(s.pages[j].url)}`);
  }
  return none(bad, 'pair');
}, 'Rewrite near-duplicate pages to be unique, or consolidate them and use a canonical/301.');
C(X, 'low', 'Content includes images', h => h.images.length > 0,
  'Add relevant images to support the text and appear in image search.');
C(X, 'medium', 'Site is not "under construction"', h => /under construction|coming soon|site is being built|kommer snart|under opbygning/i.test(h.text) ? fail() : pass(),
  'Launch real content before promoting the site; "coming soon" pages rarely rank.');
C(X, 'low', 'Page has a clear main topic', h => {
  if (h.wordCount < 100 || !h.topWords.length) return na();
  return h.topWords[0][1] >= 3 ? pass(`Main topic word: "${h.topWords[0][0]}" (${h.topWords[0][1]}×).`) : fail('No word is repeated 3+ times.');
}, 'Focus each page on one topic and mention the key term several times naturally.');
C(X, 'low', 'Shows publish or update dates', h => h.doc.querySelector('time') || JSON.stringify(h.jsonld).match(/date(Modified|Published)/) ? pass() : fail('No <time> element or dateModified found.'),
  'Show "Last updated" dates (with <time datetime>) and dateModified in structured data — freshness matters for many queries.');
C(X, 'low', 'Answers questions (question headings)', h => h.headings.some(x => /\?$|^(how|what|why|when|where|who|can|do|does|is|hvordan|hvad|hvorfor)\b/i.test(x.text)) ? pass() : fail('No question-style headings.'),
  'Add an FAQ or question-style headings ("How long does delivery take?") — they match voice/AI search and featured snippets.');
C(X, 'low', 'Has a clear call to action', h => h.links.concat(h.buttons.map(b => ({ text: b.textContent }))).some(l => /(contact|buy|shop|book|order|get started|sign up|subscribe|try|request|quote|kontakt|køb|bestil|book)/i.test(l.text || '')) ? pass() : fail('No obvious CTA link or button.'),
  'Add a visible call to action (Contact us, Get a quote, Shop now) so visitors know the next step.');
C(X, 'low', 'No excessive ALL-CAPS text', h => {
  const caps = h.words.filter(w => w.length > 3 && w === w.toUpperCase() && /[A-Z]/.test(w)).length;
  return h.wordCount < 50 || caps / h.wordCount < 0.1 ? pass() : fail(`${caps} words in all caps.`);
}, 'Use CSS text-transform for stylistic caps, and write the text itself in normal case.');
