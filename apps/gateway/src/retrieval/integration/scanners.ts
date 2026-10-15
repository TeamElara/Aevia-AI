import { safeDetectAll, detectSplitSecrets, findLinks } from '../../../../../packages/detectors/src/index';
import { createConversationVault } from './vault.js';
const pii = new Set(['AADHAAR','VID','PAN','PHONE','CARD','IFSC','UPI','BANK_ACCOUNT','EMAIL']);
const dangerous = (f: any) => ['SECRET','PRIVATE_KEY','CANARY'].includes(f.category) || f.category === 'INJECTION' && f.score >= .85;
const summary = (f: any) => ({ category:f.category, source:f.source, via:f.via, ruleId:f.ruleId });

/** Reference integration for the team's actual detector contract; no detector thresholds are tuned here. */
export function createBoundaryScanners({ db, scan = safeDetectAll, allowedHosts = [], canaries = ['LS-CANARY-INTEGRATION-ONLY'] }: any) {
  const vault = createConversationVault();
  function inspect(text: string, source: string, user: any) {
    const result = scan(text, { source, canaries, currentUser:user.id, knownUsers:['asha','ravi','meera','ceo','admin'] });
    if (!result?.ok || !Array.isArray(result.findings)) throw new Error('Scanner unavailable');
    return result.findings;
  }
  const canReadDocument = async (id: string, documentId: string) => {
    const user = await db.collection('users').findOne({ _id:id });
    return !!user && !!await db.collection('chunks').findOne({ document_id: documentId, quarantined:false,
      $or:[{allowed_users:id},{allowed_groups:{$in:user.groups}}] });
  };
  return {
    async inspectOutbound(payload: any, {user,chunks,input}: any) {
      const messages = structuredClone(payload.messages), all: any[] = [];
      const userTurns = messages.slice(1 + chunks.length).map((m:any)=>m.content);
      if (detectSplitSecrets(userTurns).length) return { action:'block', findings: [{category:'SECRET',source:'history',via:'raw',ruleId:'secret.split'}] };
      const joined = messages.map((m:any)=>m.content).join('\n');
      // Whole-payload scan is in addition to origin-aware per-message scanning.
      const finalFindings = inspect(joined,'prompt',user);
      if (finalFindings.some(dangerous)) return {action:'block',findings:finalFindings.map(summary)};
      let action = 'allow';
      for (let i=0;i<messages.length;i++) {
        const document = i>0 && i<=chunks.length ? chunks[i-1] : null;
        const source = document ? 'document' : i===messages.length-1 ? 'prompt' : 'history';
        const findings = inspect(messages[i].content,source,user); all.push(...findings);
        const masks = findings.filter((f:any)=>pii.has(f.category) && !(f.category==='AADHAAR' && f.score<.85));
        if (masks.length) { action='mask'; messages[i].content=vault.mask(messages[i].content,masks,{user:user.id,conversation:input.conversation_id,documentId:document?.document_id}); }
        else if (action==='allow' && findings.length) action='warn';
      }
      // A second scan verifies no supported high-confidence PII/secret survived assembly.
      const checked = inspect(messages.map((m:any)=>m.content).join('\n'),'prompt',user);
      if (checked.some((f:any)=>dangerous(f) || pii.has(f.category) && f.score>=.85)) return {action:'block',findings:checked.map(summary)};
      return { action, payload:{messages}, findings:all.map(summary) };
    },
    async inspectResponse(raw: string, {user,input}: any) {
      const findings = inspect(raw,'response',user);
      if (findings.some(dangerous)) return { action:'block_response' };
      let redacted=raw;
      for (const f of findings.filter((f:any)=>pii.has(f.category)).sort((a:any,b:any)=>b.start-a.start)) redacted=redacted.slice(0,f.start)+'[REDACTED]'+redacted.slice(f.end);
      const restored=await vault.restore(redacted,{user:user.id,conversation:input.conversation_id,canReadDocument});
      let answer=restored.text;
      for (const link of findLinks(answer).sort((a,b)=>b.start-a.start)) {
        let decoded=link.url;try {decoded=decodeURIComponent(decoded);}catch {}
        const tainted=restored.values.some((value:string)=>decoded.includes(value) || value.split(/\s+/).some((part:string)=>part.length>=4 && decoded.includes(part)));
        if (link.kind==='markdown_image' || link.kind==='html' || !allowedHosts.includes(link.host) || tainted) answer=answer.slice(0,link.start)+'[LINK REMOVED]'+answer.slice(link.end);
      }
      return {action: findings.some((f:any)=>pii.has(f.category)) ? 'redact':'allow', answer};
    },
    clear(user: string, conversation: string) { vault.clear(user,conversation); },
    close() { vault.close(); },
  };
}
