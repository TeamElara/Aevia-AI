import { createApprovals } from './index.js';
/** Bridge for Mahatva's ApprovalService: approval re-enters Gateway.run, never calls a provider directly. */
export async function createGatewayApprovals({ db, resolvePrincipal, replay, now = Date.now }) {
  const metadata=db.collection('approvals'), grants=new Map(), requests=new Map(), results=new Map();
  await metadata.createIndex({expires_at:1},{expireAfterSeconds:0});
  const admin=actor=>{if(!Array.isArray(actor?.groups)||!actor.groups.includes('admin'))throw new Error('Admin required');return {...actor,roles:['admin']};};
  const allowed=async(user,ids)=>{
    for(const id of ids)if(!await db.collection('chunks').findOne({document_id:id,quarantined:false,$or:[{allowed_users:user.id},{allowed_groups:{$in:user.groups}}]}))return false;
    return true;
  };
  const view=row=>({approval_id:row._id,request_hash:row.request_hash,user_pseudo:row.user_pseudo,doc_ids:row.doc_ids??[],reason:row.reason,status:now()>=new Date(row.expires_at).getTime()&&row.status==='pending'?'expired':row.status,created_at:new Date(row.created_at).toISOString(),expires_at:new Date(row.expires_at).toISOString()});
  const queue=createApprovals({metadata,now,
    async revalidate(payload,ctx){const current=await resolvePrincipal(ctx.user.id);return !!current&&await allowed(current,payload.chunks.map(c=>c.doc_id));},
    async replay(payload,ctx,reference){
      const original=ctx.gatewayContext,current=await resolvePrincipal(ctx.user.id);
      grants.set(reference.approvalId,{user:current.id,conversation:original.conversationId,hash:original.requestHash,policy:original.policyVersion});
      try{
        const result=await replay(current,{...original.replayInput,conversationId:original.conversationId,approvalId:reference.approvalId});
        const request=requests.get(ctx.request_id);if(request)request.expires=now()+600_000;
        results.set(ctx.request_id,{result,expires:now()+600_000});
        return {request_id:ctx.request_id,status:'completed'};
      }finally{grants.delete(reference.approvalId);}
    },
  });
  const purge=()=>{for(const[id,item]of requests)if(now()>=item.expires){requests.delete(id);results.delete(id);}};
  const timer=setInterval(purge,30_000);timer.unref();
  return {
    async enqueue(payload,ctx){
      purge();if(!ctx.replayInput?.messages)throw new Error('Original replay input required');
      const ids=[...new Set(payload.chunks.map(c=>c.doc_id))];
      const item=await queue.enqueue(payload,{user:ctx.user,request_id:ctx.requestId,doc_ids:ids,gatewayContext:ctx});
      requests.set(ctx.requestId,{user:ctx.user.id,conversation:ctx.conversationId,approval:item.id,docs:ids,expires:Date.parse(item.expires_at),policy:ctx.policyVersion});return item;
    },
    async verifyAndConsume(id,ctx){
      const grant=grants.get(id);if(!grant)return false;grants.delete(id);
      return grant.user===ctx.user.id&&grant.conversation===ctx.conversationId&&grant.hash===ctx.requestHash&&grant.policy===ctx.policyVersion;
    },
    async list(actor){admin(actor);purge();return(await metadata.find().sort({created_at:-1}).limit(100).toArray()).map(view);},
    async approve(id,actor,hash){if(typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash))throw new Error('Approval hash mismatch');await queue.approve(id,admin(actor),hash);return view(await metadata.findOne({_id:id}));},
    async reject(id,actor){await queue.reject(id,admin(actor));return view(await metadata.findOne({_id:id}));},
    async result(requestId,user,conversationId){
      purge();const request=requests.get(requestId);if(!request||request.user!==user.id||request.conversation!==conversationId)throw new Error('Result unavailable');
      const completed=results.get(requestId);
      if(completed){
        if(!await allowed(await resolvePrincipal(user.id),request.docs))throw new Error('Result unavailable');
        results.delete(requestId);requests.delete(requestId);return completed.result;
      }
      const record=await metadata.findOne({_id:request.approval});if(record&&['pending','replaying'].includes(record.status))return null;
      requests.delete(requestId);
      return {request_id:requestId,conversation_id:conversationId,answer:'Approval rejected, expired or unavailable.',action:'deny',reason:'Approval unavailable.',findings:[],stage_ms:{},provider_calls:0,policy_version:request.policy,sent_to_model:null,citations:[]};
    },
    close(){clearInterval(timer);queue.close();grants.clear();requests.clear();results.clear();},
  };
}
