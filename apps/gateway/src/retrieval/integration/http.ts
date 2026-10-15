import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { issueToken, verifyToken } from '../../../../../seed/auth.js';
import { createAccessService } from '../service.js';
import { createFingerprinter } from '../fingerprints.js';
import { createBoundaryScanners } from './scanners.js';

/** Local integration host. Production callers must install their own login/authentication flow. */
export function createIntegrationServer({ db, jwtSecret, fingerprintKey, provider, demoLogin = false, evalMode = false, providerMode = 'configured', scan, log = (_: any) => {} }: any) {
  if (!jwtSecret || Buffer.byteLength(jwtSecret)<32 || typeof provider!=='function') throw new TypeError('Strong secret and explicit provider required');
  const conversations = new Map<string, any>(), requests = new Map<string, any>();
  const scanners = createBoundaryScanners({ db, ...(scan ? {scan}:{}), allowedHosts:['docs.example.test'] });
  const audit = async (event: any) => {
    const safe = { request_id:event.request_id, action:event.action, provider_calls:event.provider_calls, at:new Date() };
    await db.collection('audit').insertOne(safe);
    if (!['allow','mask'].includes(safe.action)) await db.collection('incidents').insertOne(safe);
    log(safe);
  };
  const access = createAccessService({ db, ...scanners, provider, fingerprints:createFingerprinter(fingerprintKey), audit, captureProviderPayload:evalMode });
  const reply = (res:any,status:number,data:any) => { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data)); };
  const purge = () => {
    for (const [id,c] of conversations) if (Date.now()>=c.expires) {scanners.clear(c.user,id);conversations.delete(id);}
    for (const [id,r] of requests) if (Date.now()>=r.expires) requests.delete(id);
  };
  const cleaner=setInterval(purge,30_000);cleaner.unref();
  const format = (result:any,conversation_id:string,request_id:string,capture:boolean) => ({
    request_id,conversation_id,answer:result.answer ?? ({deny:'Access denied.',quarantine:'A suspicious source was quarantined.',require_approval:'Pending admin approval.',block:'Request blocked.',block_response:'Response withheld.'} as any)[result.action] ?? '',
    action:result.action,reason:providerMode==='simulated'?'Local integration demo; simulated provider.':null,rule_ids:(result.findings??[]).map((f:any)=>f.ruleId),findings:result.findings??[],stage_ms:{},
    sent_to_model:result.sent_to_model??null,provider_calls:result.provider_calls,citations:result.citations??[],
    ...(result.id?{approval_id:result.id,approval_expires_at:result.expires_at}:{}),
    ...(evalMode&&capture?{eval:{provider_calls:result.provider_calls,provider_payload:result._provider_payload??null}}:{}),
  });
  const approvalView = (row:any) => ({ approval_id:row._id, request_hash:row.request_hash, user_pseudo:row.user_pseudo, doc_ids:row.doc_ids??[], reason:row.reason??'External approval required', status:Date.now()>=new Date(row.expires_at).getTime()&&row.status==='pending'?'expired':row.status, created_at:new Date(row.created_at).toISOString(), expires_at:new Date(row.expires_at).toISOString() });
  const server=createServer(async (req,res)=> {
    const url=new URL(req.url??'/', 'http://localhost');purge();
    try {
      if (req.method==='GET'&&url.pathname==='/api/health') return reply(res,200,{ok:true,mode:'integration',demo_login:demoLogin,provider_mode:providerMode});
      let text='';for await (const part of req) { text+=part.toString();if(Buffer.byteLength(text)>128_000)return reply(res,413,{error:'Request too large'}); }
      let body:any={};if(text)try{body=JSON.parse(text);}catch{return reply(res,400,{error:'Invalid JSON'});}
      if(req.method==='POST'&&url.pathname==='/api/auth/login') {
        if(!demoLogin)return reply(res,404,{error:'Unavailable'});
        const user=typeof body.user==='string'?await db.collection('users').findOne({_id:body.user}):null;
        if(!user)return reply(res,401,{error:'Unknown demo user'});
        return reply(res,200,{token:issueToken(user,jwtSecret),user:{id:user.id,name:user.id,role:user.roles.includes('admin')?'Admin':user.groups.join(', '),groups:user.groups}});
      }
      let user:any;
      try {const token=req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];user=verifyToken(token,jwtSecret,await db.collection('users').find().toArray());}catch{return reply(res,401,{error:'Authentication required'});}
      if(req.method==='POST'&&url.pathname==='/api/chat') {
        if(typeof body.message!=='string'||!body.message.trim()||body.message.length>4000)return reply(res,400,{error:'Invalid message'});
        let conversation_id=body.conversation_id;
        if(conversation_id!==null&&conversation_id!==undefined&&typeof conversation_id!=='string')return reply(res,400,{error:'Invalid conversation'});
        if(conversation_id) {if(conversations.get(conversation_id)?.user!==user.id)return reply(res,404,{error:'Conversation unavailable'});}
        else {if(conversations.size>=1000)return reply(res,503,{error:'Conversation capacity reached'});conversation_id=randomUUID();conversations.set(conversation_id,{user:user.id,history:[],expires:Date.now()+1_800_000});}
        const conversation=conversations.get(conversation_id);
        const result=await access.run(user.id,{prompt:body.message,history:conversation.history.slice(-19),attached_doc:body.attached_doc,conversation_id});
        if(['allow','warn','mask','redact','require_approval'].includes(result.action)) { conversation.history.push(body.message);conversation.history=conversation.history.slice(-20); }
        if('id' in result && typeof result.id==='string' && 'expires_at' in result && typeof result.expires_at==='string')requests.set(result.request_id,{user:user.id,conversation_id,approval_id:result.id,expires:Date.parse(result.expires_at)});
        return reply(res,200,format(result,conversation_id,result.request_id,req.headers['x-eval-capture']==='1'));
      }
      if(req.method==='GET'&&url.pathname==='/api/approvals'){ await access.list(user.id);return reply(res,200,(await db.collection('approvals').find().sort({created_at:-1}).limit(100).toArray()).map(approvalView)); }
      const decision=url.pathname.match(/^\/api\/approvals\/([^/]+)\/(approve|reject)$/);
      if(req.method==='POST'&&decision) {
        if(decision[2]==='approve') {
          if(typeof body.request_hash!=='string'||!/^[a-f0-9]{64}$/.test(body.request_hash))return reply(res,400,{error:'Request hash required'});
          await access.approve(decision[1],user.id,body.request_hash);return reply(res,200,approvalView(await db.collection('approvals').findOne({_id:decision[1]})));
        }
        await access.reject(decision[1],user.id);return reply(res,200,approvalView(await db.collection('approvals').findOne({_id:decision[1]})));
      }
      const resultPath=url.pathname.match(/^\/api\/access\/results\/([^/]+)$/);
      if(req.method==='GET'&&resultPath) {
        const pending=requests.get(resultPath[1]);
        if(!pending||pending.user!==user.id||pending.conversation_id!==url.searchParams.get('conversation_id'))return reply(res,404,{error:'Result unavailable'});
        const metadata=await db.collection('approvals').findOne({_id:pending.approval_id});
        if(['pending','replaying'].includes(metadata?.status))return reply(res,202,{status:'pending'});
        if(metadata?.status!=='approved') {requests.delete(resultPath[1]);return reply(res,200,format({action:'deny',provider_calls:0},pending.conversation_id,resultPath[1],false));}
        const result=await access.result(resultPath[1],user.id,pending.conversation_id);requests.delete(resultPath[1]);
        return reply(res,200,format(result,pending.conversation_id,resultPath[1],false));
      }
      return reply(res,404,{error:'Unavailable'});
    } catch(error) {
      if((error as Error)?.message==='Admin required')return reply(res,403,{error:'Admin required'});
      if(/Approval missing|Approval hash mismatch/.test((error as Error)?.message))return reply(res,409,{error:'Approval is no longer pending or changed'});
      log({category:'request_failed'});return reply(res,503,{error:'Request could not be completed'});
    }
  });
  return {server,access,async close(){clearInterval(cleaner);access.close();scanners.close();conversations.clear();requests.clear();server.closeAllConnections();if(server.listening)await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
