const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
/** Config comes from the host environment, never from a chat request. No payload or response logging. */
export function createCompatibleProvider({ url, model, apiKey, timeoutMs = 15_000, retries = 2, fetchImpl = fetch, sleep = delay }) {
  const target = new URL(url);
  if (!['http:','https:'].includes(target.protocol) || target.username || target.password || !model || !Number.isInteger(retries) || retries<0 || retries>3 || !Number.isInteger(timeoutMs) || timeoutMs<1) throw new Error('Invalid provider configuration');
  return async payload => {
    let calls=0;
    for(let attempt=0;;attempt++){
      let response;
      try {
        calls++;
        response=await fetchImpl(target,{method:'POST',headers:{'Content-Type':'application/json',...(apiKey?{Authorization:`Bearer ${apiKey}`}:{})},body:JSON.stringify({model,messages:payload.messages,stream:false}),signal:AbortSignal.timeout(timeoutMs)});
      }catch{throw new Error('Provider transport unavailable');}
      if([429,503].includes(response.status)&&attempt<retries){
        const retry=Number(response.headers.get('retry-after'));
        await response.body?.cancel();
        await sleep(Math.min(30_000,Number.isFinite(retry)&&retry>0?retry*1000:500*2**attempt));continue;
      }
      if(!response.ok){await response.body?.cancel();throw new Error('Provider request failed');}
      let data;try{data=await response.json();}catch{throw new Error('Invalid provider response');}
      const text=data?.choices?.[0]?.message?.content;
      if(typeof text!=='string'||text.length>100_000)throw new Error('Invalid provider response');
      return {text,provider_calls:calls};
    }
  };
}
export function configuredProvider(env=process.env){
  const mode=env.ACCESS_PROVIDER??'simulated';
  if(mode==='simulated')return {mode,provider:async payload=>`Simulated provider: ${payload.messages.at(-1).content}`};
  if(mode==='groq'){
    if(!env.GROQ_API_KEY||!env.GROQ_MODEL)throw new Error('Set GROQ_API_KEY and GROQ_MODEL locally');
    return {mode,provider:createCompatibleProvider({url:'https://api.groq.com/openai/v1/chat/completions',model:env.GROQ_MODEL,apiKey:env.GROQ_API_KEY})};
  }
  if(mode==='ollama'){
    if(!env.OLLAMA_MODEL)throw new Error('Set OLLAMA_MODEL locally');
    return {mode,provider:createCompatibleProvider({url:new URL('chat/completions',(env.OLLAMA_URL??'http://127.0.0.1:11434/v1/').replace(/\/?$/,'/')).href,model:env.OLLAMA_MODEL})};
  }
  throw new Error('ACCESS_PROVIDER must be simulated, groq or ollama');
}
