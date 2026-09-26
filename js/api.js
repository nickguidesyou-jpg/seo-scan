// Talks to the Apps Script fetch proxy (GitHub Pages can't read other sites directly).
const PROXY = 'https://script.google.com/macros/s/AKfycbyYqNEzA6IlLK1K2ktx0V50j-6QcPixvZknEUTdBGRzXz54LyVqknMZXzywtBB2a2-LrQ/exec';

async function proxy(payload) {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch {
    throw new Error('The scan service is not available right now. Please try again in a minute.');
  }
  if (data.error && !data.results && !data.status) throw new Error(data.error);
  return data;
}

export function fetchPage(url, body = true) {
  return proxy({ action: 'page', url, body });
}

export async function fetchMany(urls, body = false) {
  if (!urls.length) return [];
  const out = [];
  for (let i = 0; i < urls.length; i += 30) {
    const { results } = await proxy({ action: 'multi', urls: urls.slice(i, i + 30), body });
    out.push(...results);
  }
  return out;
}
