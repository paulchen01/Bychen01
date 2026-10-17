import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runtimeFiles} from '../site/build.mjs';
import {APP_VERSION} from '../site/lib/platforms.mjs';
import {PRICING_VERSION} from '../site/lib/pricing.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const baseBytes=fs.readFileSync(path.join(root,'releases/site-20261017-21.json'));
assert.equal(sha(baseBytes),'b3c5747728f113abafbdbd59902b3710eab30d2ef76717920ce1bd05785f7ba1','Unexpected v21 baseline');
const base=JSON.parse(baseBytes);
assert.equal(APP_VERSION,'2026-10-17.22');assert.equal(PRICING_VERSION,'2026-09-15.5');
const source=path.join(root,'site');
const files=[...runtimeFiles(source),...['build.mjs','vercel.json','package-lock.json'].map(file=>({file,data:fs.readFileSync(path.join(source,file))}))].sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
const hashes=Object.fromEntries(files.map(({file,data})=>[file,sha(data)]));
const intendedChanges=new Set(['api/quote.js','index.html','lib/platforms.mjs','lib/retail.mjs','package.json','package-lock.json']);
for(const [file,hash] of Object.entries(base.hashes))if(!intendedChanges.has(file))assert.equal(hashes[file],hash,file+' must retain its existing production behavior');
const release={version:APP_VERSION,changeType:'platform-public-price-and-url-compatibility',basedOn:base.version,pricingVersion:PRICING_VERSION,
  behavior:{...base.behavior,oliveYoungOrdinarySale:true,conditionalCouponsExcluded:true,verifiedZigzagShareRoute:true,verifiedPocaLocaleRoute:true,boundedOfficialXRedirects:true},
  hashes,files:files.map(({file,data})=>({file,encoding:'base64',data:data.toString('base64')}))};
const bytes=Buffer.from(JSON.stringify(release)),destination=path.join(root,'releases/site-20261017-22.json');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(destination).toString(),bytes.toString(),'Saved release does not match current source');
else fs.writeFileSync(destination,bytes);
console.log(JSON.stringify({version:APP_VERSION,files:files.length,releaseSha256:sha(bytes),action:process.argv.includes('--check')?'verified':'saved'}));
