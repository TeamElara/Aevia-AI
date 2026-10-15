// Links and images in model output, for the gateway's link sanitiser.
// A Markdown image with a non-allowlisted host can carry data out in its URL.

export interface Link {
  start: number;
  end: number;
  url: string;
  host: string;
  kind: 'markdown_image' | 'markdown_link' | 'html' | 'bare';
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

export function findLinks(text: string): Link[] {
  const links: Link[] = [];
  const taken: Array<[number, number]> = [];
  const push = (start: number, end: number, url: string, kind: Link['kind']) => {
    if (taken.some(([s, e]) => start < e && end > s)) return;
    taken.push([start, end]);
    links.push({ start, end, url, host: hostOf(url), kind });
  };
  for (const m of text.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) push(m.index!, m.index! + m[0].length, m[1], 'markdown_image');
  for (const m of text.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) push(m.index!, m.index! + m[0].length, m[1], 'markdown_link');
  for (const m of text.matchAll(/<(?:img|a|iframe|script)\b[^>]*?(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)) push(m.index!, m.index! + m[0].length, m[1], 'html');
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>()"'\]]+/g)) push(m.index!, m.index! + m[0].length, m[0], 'bare');
  return links.sort((a, b) => a.start - b.start);
}
