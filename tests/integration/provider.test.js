import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createCompatibleProvider, configuredProvider } from '../../apps/gateway/src/retrieval/integration/provider.js';

test('compatible transport retries 429 with actual call counts and never logs payloads',async()=>{
 const requests=[],waits=[];
 const provider=createCompatibleProvider({url:'http://127.0.0.1:1/v1/chat/completions',model:'local-test',apiKey:'test-only',fetchImpl:async(url,options)=>{
  requests.push({url,options});return requests.length===1?new Response('',{status:429,headers:{'retry-after':'1'}}):Response.json({choices:[{message:{content:'Test answer'}}]});
 },sleep:async ms=>{waits.push(ms);}});
 assert.deepEqual(await provider({messages:[{role:'user',content:'masked input'}]}),{text:'Test answer',provider_calls:2});
 assert.deepEqual(waits,[1000]);assert.equal(JSON.parse(requests[0].options.body).stream,false);assert.equal(requests[0].options.headers.Authorization,'Bearer test-only');
});
test('transport errors are generic, invalid replies fail closed, and live mode needs explicit credentials',async()=>{
 const provider=createCompatibleProvider({url:'http://127.0.0.1:1/v1/chat/completions',model:'local-test',fetchImpl:async()=>{throw new Error('SENSITIVE DETAILS');}});
 await assert.rejects(provider({messages:[]}),error=>!String(error).includes('SENSITIVE DETAILS')&&String(error).includes('unavailable'));
 const bad=createCompatibleProvider({url:'http://127.0.0.1:1/v1/chat/completions',model:'local-test',fetchImpl:async()=>Response.json({wrong:'shape'})});
 await assert.rejects(bad({messages:[]}),/Invalid provider response/);
 assert.throws(()=>configuredProvider({ACCESS_PROVIDER:'groq'}),/Set GROQ_API_KEY/);assert.equal(configuredProvider({}).mode,'simulated');
});
