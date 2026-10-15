import { randomBytes } from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const scopeKey = (user, conversation) => JSON.stringify([user, conversation]);
export function createConversationVault({ now = Date.now, ttlMs = 1_800_000 } = {}) {
  const scopes = new Map();
  const purge = () => { for (const [key, scope] of scopes) if (now() >= scope.expires) scopes.delete(key); };
  const timer = setInterval(purge, 30_000); timer.unref();
  function scope(user, conversation) {
    purge(); const key = scopeKey(user, conversation);
    if (!scopes.has(key)) {
      if (scopes.size >= 1000) throw new Error('Conversation capacity reached');
      scopes.set(key, { expires: now() + ttlMs, values: new Map() });
    }
    return scopes.get(key);
  }
  return {
    mask(text, findings, { user, conversation, documentId = null }) {
      const current = scope(user, conversation);
      let out = text;
      for (const f of [...findings].sort((a,b) => b.start-a.start)) {
        const value = text.slice(f.start, f.end);
        if (!value || f.start < 0 || f.end > text.length) throw new Error('Invalid finding span');
        let token = [...current.values].find(([,v]) => v.value === value && v.documentId === documentId)?.[0];
        if (!token) {
          if (current.values.size >= 1000) throw new Error('Vault capacity reached');
          do { token = `[${f.category}_${[...randomBytes(4)].map(n=>alphabet[n%32]).join('')}]`; } while (current.values.has(token));
          current.values.set(token, { value, documentId });
        }
        out = out.slice(0,f.start) + token + out.slice(f.end);
      }
      return out;
    },
    async restore(text, { user, conversation, canReadDocument }) {
      purge(); const current = scopes.get(scopeKey(user, conversation)), values = [];
      if (!current) return { text, values };
      let out = '', cursor = 0;
      for (const match of text.matchAll(/\[[A-Z_]+_[A-Z2-7]{4}\]/g)) {
        out += text.slice(cursor, match.index); const entry = current.values.get(match[0]);
        if (!entry) out += match[0];
        else if (entry.documentId && !(await canReadDocument(user, entry.documentId))) out += '[REDACTED]';
        else { out += entry.value; values.push(entry.value); }
        cursor = match.index + match[0].length;
      }
      return { text: out + text.slice(cursor), values };
    },
    clear(user, conversation) { scopes.delete(scopeKey(user, conversation)); },
    close() { clearInterval(timer); scopes.clear(); },
  };
}
