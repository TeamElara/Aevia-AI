import { afterAll, beforeAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { createServer } from 'node:http';
import { once } from 'node:events';
import request from 'supertest';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { seedDatabase } from '../../seed/seed.js';
import { createApprovalBridge } from '../../apps/gateway/src/approval-bridge.js';
import { loadAccessAdapter } from '../../apps/gateway/src/access-adapter.js';
import { createApp } from '../../apps/gateway/src/app.js';
import { Audit, MongoAuditStore } from '../../apps/gateway/src/audit.js';
import { Auth } from '../../apps/gateway/src/auth.js';
import { Gateway } from '../../apps/gateway/src/pipeline.js';
import { PolicyStore } from '../../apps/gateway/src/policy.js';
import { Scanner } from '../../apps/gateway/src/scanner.js';
import { ConversationVault } from '../../apps/gateway/src/vault.js';
import { HttpProvider } from '../../apps/gateway/src/provider.js';
import { detectAll } from '../../packages/detectors/src/index.js';
let mongo:any,client:any,db:any,upstream:any,base:any,approvals:any,policies:any,vault:any,principal:any;
let calls=0;
beforeAll(async()=>{
 mongo=await MongoMemoryServer.create();client=await new MongoClient(mongo.getUri()).connect();db=client.db('full-gateway');await seedDatabase(db,{fingerprintKey:'f'.repeat(32)});
 const store=new MongoAuditStore(db);await store.initialise();const audit=new Audit(store,'audit-'+randomBytes(32).toString('hex'));
 const access=await loadAccessAdapter(db,resolve('apps/gateway/src/retrieval/index.js'),'f'.repeat(32));principal=access.principal;
 policies=new PolicyStore(resolve('apps/gateway/policy.yaml'),false);vault=new ConversationVault();
 upstream=createServer(async(req,res)=>{calls++;const parts=[];for await(const part of req)parts.push(part);const body=JSON.parse(Buffer.concat(parts).toString());res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'Simulated HTTP provider: '+body.messages.at(-1).content}}]}));}).listen(0,'127.0.0.1');await once(upstream,'listening');
 const transport=new HttpProvider({kind:'ollama',baseURL:`http://127.0.0.1:${upstream.address().port}/v1`,model:'fixture'});
 // Test external-disclosure policy while the explicitly simulated provider stays on loopback.
 const provider={external:true,model:'external-policy-fixture',complete:transport.complete.bind(transport)};
 let gateway:Gateway;
 approvals=await createApprovalBridge({db,audit,policies,principal,gateway:()=>gateway});
 gateway=new Gateway({scanner:new Scanner(detectAll as any),provider,audit,policies,vault,retrieve:access.retrieve,restrictedOverlap:access.restrictedOverlap,approvals:approvals.service,evalMode:true});
 base=request(createApp({gateway,auth:new Auth('j'.repeat(32),[],principal),audit,policies,ready:()=>true,demoAuth:true,signingSecret:'j'.repeat(32),evalMode:true,approvalBridge:approvals}));
},180_000);
afterAll(async()=>{approvals?.close();policies?.close();vault?.close();if(upstream){upstream.closeAllConnections();await new Promise<void>(r=>upstream.close(()=>r()));}await client?.close();await mongo?.stop();});
const login=async(user:string)=>(await base.post('/api/auth/login').send({user}).expect(200)).body.token;
const chat=async(token:string,message:string,conversation_id?:string)=>(await base.post('/api/chat').set('Authorization',`Bearer ${token}`).send({message,...(conversation_id?{conversation_id}:{})}).expect(200)).body;

test('full gateway queues Garuda, verifies hash and ACL on admin replay, and returns answer only to Meera',async()=>{
 const meera=await login('meera'),admin=await login('admin'),asha=await login('asha'),before=calls;
 const pending=await chat(meera,'Summarise Garuda roadmap');assert.equal(pending.action,'require_approval');assert.equal(calls,before);
 const list=(await base.get('/api/approvals').set('Authorization',`Bearer ${admin}`).expect(200)).body;const item=list.find((r:any)=>r.approval_id===pending.approval_id);assert.ok(item);
 await base.post(`/api/approvals/${item.approval_id}/approve`).set('Authorization',`Bearer ${admin}`).send({request_hash:'0'.repeat(64)}).expect(409);assert.equal(calls,before);
 await base.post(`/api/approvals/${item.approval_id}/approve`).set('Authorization',`Bearer ${admin}`).send({request_hash:item.request_hash}).expect(200);assert.equal(calls,before+1);
 const path=`/api/access/results/${pending.request_id}?conversation_id=${pending.conversation_id}`;
 await base.get(path).set('Authorization',`Bearer ${asha}`).expect(404);
 const result=(await base.get(path).set('Authorization',`Bearer ${meera}`).expect(200)).body;assert.equal(result.provider_calls,1);assert.ok(result.answer.includes('Garuda'));
 await base.get(path).set('Authorization',`Bearer ${meera}`).expect(404);
 await base.post(`/api/approvals/${item.approval_id}/approve`).set('Authorization',`Bearer ${admin}`).send({request_hash:item.request_hash}).expect(409);assert.equal(calls,before+1);
});
test('full gateway rejects a revoked-membership approval without an upstream call',async()=>{
 const meera=await login('meera'),admin=await login('admin');const pending=await chat(meera,'Garuda roadmap');const before=calls;
 const list=(await base.get('/api/approvals').set('Authorization',`Bearer ${admin}`).expect(200)).body;const item=list.find((r:any)=>r.approval_id===pending.approval_id);
 await db.collection('users').updateOne({_id:'meera'},{$set:{groups:['employee']}});
 try{await base.post(`/api/approvals/${item.approval_id}/approve`).set('Authorization',`Bearer ${admin}`).send({request_hash:item.request_hash}).expect(409);assert.equal(calls,before);}finally{await seedDatabase(db,{fingerprintKey:'f'.repeat(32)});}
});
test('full gateway admin rejection deletes pending payload and exposes no raw content in metadata/audit/stats',async()=>{
 const meera=await login('meera'),admin=await login('admin'),before=calls;const pending=await chat(meera,'Garuda review PAN ABCPA1234F');assert.equal(pending.action,'require_approval');
 const list=(await base.get('/api/approvals').set('Authorization',`Bearer ${admin}`).expect(200)).body;const item=list.find((r:any)=>r.approval_id===pending.approval_id);
 await base.post(`/api/approvals/${item.approval_id}/reject`).set('Authorization',`Bearer ${admin}`).send({}).expect(200);assert.equal(calls,before);
 for(const name of ['approvals','audit_events'])assert.ok(!JSON.stringify(await db.collection(name).find().toArray()).includes('ABCPA1234F'));
 const stats=await base.get('/api/stats').set('Authorization',`Bearer ${admin}`).expect(200);assert.ok(stats.body.requests>0);
 await base.get('/api/approvals').set('Authorization',`Bearer ${meera}`).expect(403);
});

test('full gateway actual audit and approval stores contain none of five seeded sensitive values',async()=>{
 const {seededValues,findSeededLeaks}=await import('../../packages/detectors/src/index.js');const values=seededValues();
 const token=await login('meera');
 const blocked=await chat(token,values.map(v=>`${v.label} ${v.value}`).join('; '));assert.equal(blocked.provider_calls,0);
 await chat(token,`Garuda roadmap for PAN ${values.find(v=>v.label==='pan')!.value}`);
 for(const collection of ['audit_events','approvals'])assert.deepEqual(findSeededLeaks(JSON.stringify(await db.collection(collection).find().toArray()),values),[]);
});
