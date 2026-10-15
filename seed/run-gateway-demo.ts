import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { seedDatabase } from './seed.js';
import { createApprovalBridge } from '../apps/gateway/src/approval-bridge.js';
import { loadAccessAdapter } from '../apps/gateway/src/access-adapter.js';
import { createApp } from '../apps/gateway/src/app.js';
import { Audit, MongoAuditStore } from '../apps/gateway/src/audit.js';
import { Auth } from '../apps/gateway/src/auth.js';
import { Gateway } from '../apps/gateway/src/pipeline.js';
import { OfflineBaseline } from '../apps/gateway/src/baseline.js';
import { HttpProvider } from '../apps/gateway/src/provider.js';
import { PolicyStore } from '../apps/gateway/src/policy.js';
import { Scanner } from '../apps/gateway/src/scanner.js';
import { ConversationVault } from '../apps/gateway/src/vault.js';
import { loadDetectorAdapter } from '../apps/gateway/src/detector-adapter.js';
import { Delegations } from '../apps/gateway/src/delegation.js';
import { Attachments } from '../apps/gateway/src/attachments.js';
import { loadSecurityHierarchy, SecurityEscalation } from '../apps/gateway/src/security-escalation.js';

/** Entire merged gateway; upstream is explicitly simulated on loopback, never a paid/cloud call. */
export async function startGatewayDemo(port=8080, options: { baseline?: boolean; corsOrigin?: string; securityEscalation?: boolean } = {}){
 if(options.securityEscalation&&options.baseline)throw new Error('Security warnings are unavailable in baseline mode');
 const mongo=await MongoMemoryServer.create(),client=await new MongoClient(mongo.getUri()).connect(),db=client.db('aevia-demo');
 const fingerprintKey=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex');
 await seedDatabase(db,{fingerprintKey});const store=new MongoAuditStore(db);await store.initialise();const audit=new Audit(store,randomBytes(32).toString('hex'));
 const delegations=new Delegations(db,audit);await delegations.initialise();
 const securityEscalation=options.securityEscalation?new SecurityEscalation(db,audit,loadSecurityHierarchy('apps/gateway/security-hierarchy.json')):undefined;
 await securityEscalation?.initialise();
 const access=await loadAccessAdapter(db,resolve('apps/gateway/src/retrieval/index.js'),fingerprintKey,id=>delegations.lentTo(id));
 const upstream=createServer(async(req,res)=>{const parts=[];for await(const part of req)parts.push(Buffer.from(part));const body=JSON.parse(Buffer.concat(parts).toString());res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'Simulated HTTP provider: '+body.messages.at(-1).content}}]}));}).listen(0,'127.0.0.1');await once(upstream,'listening');
 const transport=new HttpProvider({kind:'ollama',baseURL:`http://127.0.0.1:${(upstream.address() as any).port}/v1`,model:'simulated-external-policy'});
 const provider={external:true,model:'simulated-external-policy',complete:transport.complete.bind(transport)};
 const policies=new PolicyStore(resolve('apps/gateway/policy.yaml'),false),vault=new ConversationVault();let gateway:Gateway;
 const detectors=await loadDetectorAdapter('packages/detectors/src/index.ts');
 const approvals=await createApprovalBridge({db,audit,policies,principal:access.principal,gateway:()=>gateway});
 const scanner=new Scanner(detectors.detect),attachments=new Attachments(scanner,audit,detectors.splitSecrets);
 gateway=new Gateway({scanner,splitSecrets:detectors.splitSecrets,findLinks:detectors.findLinks,provider,audit,policies,vault,retrieve:access.retrieve,restrictedOverlap:access.restrictedOverlap,approvals:approvals.service,evalMode:true,securityEscalation});
 const baseline=options.baseline ? new OfflineBaseline(provider,audit,async(query,documentId)=>{
   const rows=await db.collection('chunks').find(documentId?{document_id:documentId}:{$text:{$search:query.slice(0,4000)}}).sort({_id:1}).limit(8).toArray();
   return rows.map(r=>r.text as string);
 }) : undefined;
 const app=createApp({gateway,auth:new Auth(secret,[],access.principal),audit,policies,ready:()=>true,demoAuth:true,signingSecret:secret,evalMode:true,baseline,approvalBridge:approvals,delegations,attachments,providerMode:'simulated',corsOrigin:options.corsOrigin ?? 'http://localhost:5173',securityEscalation});
 const server=app.listen(port,'127.0.0.1');await once(server,'listening');
 return {url:`http://127.0.0.1:${(server.address() as any).port}`,async close(){securityEscalation?.close();baseline?.close();await attachments.close();approvals.close();vault.close();policies.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));upstream.closeAllConnections();await new Promise<void>(r=>upstream.close(()=>r()));await client.close();await mongo.stop();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const demo=await startGatewayDemo(8080,{securityEscalation:process.env.SECURITY_ESCALATION_ENABLED==='true'});process.stdout.write(`Merged gateway demo: ${demo.url} (SIMULATED HTTP PROVIDER; no cloud calls)\n`);
 let closing=false;const close=async()=>{if(closing)return;closing=true;await demo.close();};process.once('SIGINT',close);process.once('SIGTERM',close);
}
