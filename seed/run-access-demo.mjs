import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { seedDatabase } from './seed.js';
import { createIntegrationServer } from '../apps/gateway/src/retrieval/integration/http.ts';

export async function startAccessDemo({ port = 8080 } = {}) {
  const mongo=await MongoMemoryServer.create();
  const client=await new MongoClient(mongo.getUri()).connect();const db=client.db('leakshield-demo');
  const fingerprintKey=randomBytes(32),jwtSecret=randomBytes(32);
  try {
    await seedDatabase(db,{fingerprintKey});
    const app=createIntegrationServer({db,jwtSecret,fingerprintKey,demoLogin:true,evalMode:true,providerMode:'simulated',
      provider:async(payload)=>`Simulated provider: ${payload.messages.at(-1).content}`});
    await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(port,'127.0.0.1',resolve);});
    return { url:`http://127.0.0.1:${app.server.address().port}`,async close(){await app.close();await client.close();await mongo.stop();} };
  }catch(error){await client.close();await mongo.stop();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const port=Number(process.env.ACCESS_DEMO_PORT??8080);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid demo port');
  const app=await startAccessDemo({port});
  console.log(`Access integration demo: ${app.url} (SIMULATED PROVIDER; temporary local database; ephemeral demo accounts)`);
  let closing=false;const close=async()=>{if(closing)return;closing=true;await app.close();};
  process.once('SIGINT',close);process.once('SIGTERM',close);
}
