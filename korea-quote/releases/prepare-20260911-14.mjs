import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const url='https://raw.githubusercontent.com/paulchen01/Bychen01/7bf7fa8df128f8220e0c5aaee193d083cfe6125e/korea-quote/releases/site-20260911-13.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
let raw;if(process.argv[2])raw=fs.readFileSync(process.argv[2]);else{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);raw=Buffer.from(await r.arrayBuffer());}
assert.equal(sha(raw),'95de20f787e81c06b43e7d28a41777f40e68529feed986264cdc239dc0f36692');
const base=JSON.parse(raw),files=new Map();
for(const f of base.files){assert.ok(!f.file.startsWith('/')&&!f.file.includes('..'));const b=Buffer.from(f.data,f.encoding==='base64'?'base64':'utf8');assert.equal(sha(b),base.hashes[f.file]);files.set(f.file,b);}
let html=files.get('index.html').toString('utf8');assert.equal((html.match(/僅下單/g)||[]).length,2);
html=html.replaceAll('僅下單','代下單').replaceAll('20260911-13','20260911-14');
assert.ok(html.includes('id="orderOnlyTitle">代下單初步報價</h4>'));assert.ok(html.includes('本框為「代下單」計價說明'));assert.ok(!html.includes('僅下單'));
files.set('index.html',Buffer.from(html));
const version='2026-09-11.14',key='lib/platforms.mjs',platforms=files.get(key).toString();assert.equal((platforms.match(/2026-09-11\.13/g)||[]).length,1);files.set(key,Buffer.from(platforms.replace('2026-09-11.13',version)));
const pkg=JSON.parse(files.get('package.json'));pkg.version='1.0.14';files.set('package.json',Buffer.from(JSON.stringify(pkg,null,2)+'\n'));
const changed=['index.html','lib/platforms.mjs','package.json'];
for(const[file,b]of files)if(!changed.includes(file))assert.equal(sha(b),base.hashes[file],file+' must remain unchanged');
assert.equal((html.match(/data-order-only-rate/g)||[]).length,2);assert.equal((html.match(/data-current-rate/g)||[]).length,4);
const release={version,changeType:'wording-only',existingCalculationsUnchanged:true,hashes:Object.fromEntries([...files].map(([n,b])=>[n,sha(b)])),files:[...files].map(([file,b])=>({file,encoding:'base64',data:b.toString('base64')}))};
fs.mkdirSync('prepared-site',{recursive:true});for(const[file,b]of files){const dest=path.join('prepared-site',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);}
const bundle=JSON.stringify(release);fs.writeFileSync('prepared-v14.json',bundle);
console.log('PREPARED_V14',JSON.stringify({version,sha256:sha(bundle),changed,oldTextOccurrences:0,newTextOccurrences:2,priceAndRateCodeUnchanged:true}));
