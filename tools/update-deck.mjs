import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const { FileBlob, PresentationFile } = await import(process.env.ARTIFACT_TOOL_MODULE ?? '@oai/artifact-tool');
const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const p=await PresentationFile.importPptx(new FileBlob(new Uint8Array(await fs.readFile(root+'/docs/Alwaz-LeakShield.pptx'))));
const table=p.resolve('tb/nad4jits');
const values=[['Measurement','Observed'],['Current combined tests','414 + 53 passed'],['Historical real Ollama calls','37 calls; 10/10 boundary checks'],['Historical fixture labels','4/31 matched; not accuracy pass'],['Current UI rehearsal','Mask + approval + live eval']];
for(let row=0;row<5;row++)for(let col=0;col<2;col++) { const cell=table.getCell(row,col); cell.text.replace(String(cell.text), values[row][col]); }
const changes={
 'sh/dgbulwnm':['Measured access evidence','Evidence and validation'],
 'sh/cf2tcr61':['Reference-host HTTP timing · merged suites use simulated providers','Current tests and rehearsal; historical local-model evidence'],
 'sh/l4bupwny':['Includes real detectors. Excludes model/network time and human approval wait. This is not the final frozen gateway evaluation.','Simulated evaluation has recorded misses and a provider leak. No coordinated freeze or final model-backed benchmark is claimed.'],
 'sh/6h0fypgb':['Remaining: team Groq settings, a real Groq/Ollama run, full frozen evaluation and real-model rehearsal.','Remaining: Ojaswi freeze coordination, real-model final evaluation, Groq account verification and Docker rehearsal.'],
 'sh/zi98nu94':['Pinned ProtectAI DeBERTa model · local Node ONNX · English only','Historical feasibility only; production gateway refuses int8'],
 'sh/ri9g7uhw':['Ready: merged gateway, actual detectors, ACLs, encrypted approval replay, audit and connected UI.','Verified: document attachments, ACL-safe approval polling, production tests and simulated UI rehearsal.'],
};
for(const [id,[from,to]] of Object.entries(changes))p.resolve(id).text.replace(from,to);
p.resolve('tb/it87elgv').getCell(5,1).text.replace('Require admin approval','External: approval; local: allow');
await fs.mkdir(root+'/tmp/deck-build',{recursive:true});
const blob=await PresentationFile.exportPptx(p);await blob.save(root+'/tmp/deck-build/candidate.pptx');
console.log('Exported editable eight-slide candidate');
