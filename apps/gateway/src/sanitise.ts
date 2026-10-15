/** Answers are returned as plain text. Drop markup, controls and every unapproved URL.
 * Do not allow automatic image fetching, even on approved hosts: query strings can carry PII.
 */
export interface DetectedLink { start: number; end: number; url: string; host: string; kind: string; }
export type FindLinks = (text: string) => DetectedLink[];
export function sanitiseLinks(text: string, hosts: readonly string[], findLinks?: FindLinks): string {
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '');
  if (findLinks) {
    const links = findLinks(text);
    if (!Array.isArray(links) || links.some(l => !Number.isInteger(l.start) || !Number.isInteger(l.end) || l.start < 0 || l.end <= l.start || l.end > text.length || typeof l.url !== 'string')) throw new Error('Invalid link detector result');
    for (const link of [...links].sort((a, b) => b.start - a.start)) {
      let replacement = '[link removed]';
      try {
        const url = new URL(link.url);
        if (!['markdown_image', 'html'].includes(link.kind) && url.protocol === 'https:' && !url.username && !url.password && hosts.includes(url.hostname.toLowerCase())) replacement = url.origin;
      } catch { /* Relative/malformed URLs are not approved destinations. */ }
      text = text.slice(0, link.start) + replacement + text.slice(link.end);
    }
  }
  text = text.replace(/!\[[^\]]*\]\([^\n]*?\)/g, '[image removed]');
  // HTML is never passed through. Clients must render this field as text, never innerHTML.
  text = text.replace(/<[^>]*>/g, '[markup removed]');
  text = text.replace(/\b(?:https?:\/\/|www\.)[^\s<>"'\])]+/gi, raw => {
    try {
      const u = new URL(raw.startsWith('www.') ? `https://${raw}` : raw);
      if (u.protocol !== 'https:' || u.username || u.password || !hosts.includes(u.hostname.toLowerCase())) return '[link removed]';
      // Only the origin survives: paths, queries and fragments can contain restored secrets.
      return u.origin;
    } catch { return '[link removed]'; }
  });
  text = text.replace(/\b(?:javascript|data|vbscript|file):[^\s)]+/gi, '[link removed]');
  text = text.replace(/\]\(\s*\/\/[^)]*\)/g, ']([link removed])');
  return text;
}
