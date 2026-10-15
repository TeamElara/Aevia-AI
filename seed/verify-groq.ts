/** Small real-provider development check. Never writes prompts, payloads or answers. */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { seedDatabase } from './seed.js';
import { loadAccessAdapter } from '../apps/gateway/src/access-adapter.js';
import { loadDetectorAdapter } from '../apps/gateway/src/detector-adapter.js';
import { Audit, MongoAuditStore } from '../apps/gateway/src/audit.js';
import { Gateway } from '../apps/gateway/src/pipeline.js';
import { HttpProvider } from '../apps/gateway/src/provider.js';
import { PolicyStore } from '../apps/gateway/src/policy.js';
import { Scanner } from '../apps/gateway/src/scanner.js';
import { ConversationVault } from '../apps/gateway/src/vault.js';
if (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL) throw new Error('Configure Groq locally; never paste credentials into chat');
const metadata: Record<string, unknown>[] = [];
const provider = new HttpProvider({ kind: 'groq', baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL, maxRetries: 0,
  fetch: async (input, init) => {
    const response = await fetch(input, init);
    const rate: Record<string, string> = {};
    for (const name of ['x-ratelimit-limit-requests','x-ratelimit-limit-tokens','x-ratelimit-remaining-requests','x-ratelimit-remaining-tokens','x-ratelimit-reset-requests','x-ratelimit-reset-tokens']) {
      const value=response.headers.get(name); if(value) rate[name]=value;
    }
    metadata.push({ status: response.status, rate_headers: rate }); return response;
  } });
const mongo=await MongoMemoryServer.create();
let client: MongoClient | undefined, policies: PolicyStore | undefined, vault: ConversationVault | undefined;
try {
  client=await new MongoClient(mongo.getUri()).connect(); const db=client.db('groq-continuation');
  const key=randomBytes(32).toString('hex'); await seedDatabase(db,{fingerprintKey:key});
  const store=new MongoAuditStore(db); await store.initialise();
  const access=await loadAccessAdapter(db,'apps/gateway/src/retrieval/index.js',key);
  const detectors=await loadDetectorAdapter('packages/detectors/src/index.ts');
  policies=new PolicyStore('apps/gateway/policy.yaml',false); vault=new ConversationVault();
  const gateway=new Gateway({provider,scanner:new Scanner(detectors.detect),splitSecrets:detectors.splitSecrets,findLinks:detectors.findLinks,
    audit:new Audit(store,randomBytes(32).toString('hex')),policies,vault,retrieve:access.retrieve,restrictedOverlap:access.restrictedOverlap,evalMode:true});
  const cases=[
    {id:'greeting',user:'asha',prompt:'Reply with one short greeting.',doc:undefined,action:'allow',calls:1},
    {id:'user-pii',user:'asha',prompt:'Write one short sentence about synthetic PAN ABCPA1234F.',doc:undefined,action:'mask',calls:1},
    {id:'authorized-hr',user:'ravi',prompt:'Summarise this reference in one sentence.',doc:'salary',action:'allow',calls:1},
    {id:'document-pii',user:'ravi',prompt:'Summarise this reference in one sentence.',doc:'employees',action:'redact',calls:1},
    {id:'forbidden',user:'asha',prompt:'Summarise this reference.',doc:'salary',action:'deny',calls:0},
    {id:'quarantined',user:'asha',prompt:'Summarise this reference.',doc:'vendor',action:'quarantine',calls:0},
    {id:'external-deny',user:'ceo',prompt:'Summarise this reference.',doc:'board',action:'deny',calls:0},
    {id:'external-approval',user:'meera',prompt:'Summarise this reference.',doc:'garuda',action:'require_approval',calls:0},
  ];
  const rows=[];
  for(const c of cases) {
    const start=performance.now();
    const result=await gateway.run(await access.principal!(c.user),{messages:[{role:'user',content:c.prompt}],attachedDoc:c.doc});
    const payload=JSON.stringify(result.captured_payload??[]);
    const protectedValues=['ABCPA1234F','2345 6789 0124'];
    const leak=protectedValues.some(value=>payload.includes(value));
    rows.push({id:c.id,action:result.action,expected_action:c.action,provider_calls:result.provider_calls,
      passed:result.action===c.action&&result.provider_calls===c.calls&&!leak,
      declared_pii_provider_leak:leak,answer_nonempty:result.answer.length>0,
      stage_overhead_ms:Object.entries(result.stage_ms).filter(([name])=>name.toLowerCase()!=='llm').reduce((n,[,ms])=>n+ms,0),wall_ms:performance.now()-start});
    console.log(c.id,result.action,result.provider_calls);
    if(c.calls)await new Promise(resolve=>setTimeout(resolve,2200));
  }
  const { findSeededLeaks }=await import('../packages/detectors/src/index.js');
  const audit_private=findSeededLeaks(JSON.stringify(await db.collection('audit_events').find().toArray())).length===0;
  const report={at:new Date().toISOString(),source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source_dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),model:provider.model,provider:'real Groq HTTPS',frozen:false,
    scope:'Eight synthetic direct-pipeline boundaries, four planned real calls. Not browser E2E, independent accuracy, a full baseline or a frozen evaluation. Stage timings exclude model and uninstrumented audit/vault work. Response rate headers do not prove all RPM/RPD/TPM/TPD limits or ZDR.',
    audit_private,rows,transport_metadata:metadata};
  await mkdir('results/continuation-groq',{recursive:true}); await writeFile('results/continuation-groq/boundaries.json',JSON.stringify(report,null,2)+'\n');
  if(!audit_private||rows.some(r=>!r.passed))process.exitCode=1;
}finally{policies?.close();vault?.close();await client?.close();await mongo.stop();}
