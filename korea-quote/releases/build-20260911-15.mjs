/** v15: exact merchant-requested copy update; pricing, live B2 and all three APIs are unchanged. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const BASE='https://raw.githubusercontent.com/paulchen01/Bychen01/7bf7fa8df128f8220e0c5aaee193d083cfe6125e/korea-quote/releases/site-20260911-13.json';
const EXPECTED='95de20f787e81c06b43e7d28a41777f40e68529feed986264cdc239dc0f36692';
const VERSION='2026-09-11.15';
const sha=b=>createHash('sha256').update(b).digest('hex');
let raw;
if(process.argv[2])raw=fs.readFileSync(process.argv[2]);
else{const r=await fetch(BASE,{signal:AbortSignal.timeout(40000)});assert.equal(r.status,200);raw=Buffer.from(await r.arrayBuffer());}
assert.equal(sha(raw),EXPECTED);
const base=JSON.parse(raw),files=new Map();
for(const f of base.files){assert.ok(!f.file.startsWith('/')&&!f.file.includes('..'));const b=Buffer.from(f.data,f.encoding==='base64'?'base64':'utf8');assert.equal(sha(b),base.hashes[f.file]);files.set(f.file,b);}
let html=files.get('index.html').toString('utf8');
assert.equal((html.match(/僅下單/g)||[]).length,2);
html=html.replaceAll('僅下單','代下單').replaceAll('20260911-13','20260911-15');
const anchor='  <dl class="order-only-formulas">';assert.equal(html.split(anchor).length,2);
html=html.replace(anchor,'  <p class="order-only-subtitle" id="orderOnlySubtitle">（協助下單寄您提供的韓國地址）</p>\n'+anchor);
assert.ok(html.includes('id="orderOnlyTitle">代下單初步報價</h4>'));
assert.ok(html.includes('本框為「代下單」計價說明'));
assert.ok(!html.includes('僅下單'));
assert.equal((html.match(/data-current-rate/g)||[]).length,4);
files.set('index.html',Buffer.from(html));
files.set('style.css',Buffer.concat([files.get('style.css'),Buffer.from('\n/* Merchant-requested service scope, separate from the pricing formulas. */\n.order-only-subtitle{margin:-5px 0 13px;color:#795a3d;font-size:12px;line-height:1.8;font-weight:400;overflow-wrap:anywhere}\n')]));
let platform=files.get('lib/platforms.mjs').toString('utf8');assert.equal(platform.split('2026-09-11.13').length,2);files.set('lib/platforms.mjs',Buffer.from(platform.replace('2026-09-11.13',VERSION)));
const pkg=JSON.parse(files.get('package.json'));pkg.version='1.0.15';files.set('package.json',Buffer.from(JSON.stringify(pkg,null,2)+'\n'));
const changed=new Set(['index.html','style.css','lib/platforms.mjs','package.json']);
for(const[f,b]of files)if(!changed.has(f))assert.equal(sha(b),base.hashes[f],f+' must stay unchanged');
const write=(f,b)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b);};
const root='.vercel/output';fs.rmSync(root,{recursive:true,force:true});
for(const[file,b]of files)if(!file.startsWith('api/')&&file!=='package.json')write(root+'/static/'+file,b);
for(const endpoint of ['health','quote','rate']){
 const dir=root+'/functions/api/'+endpoint+'.func';
 for(const[file,b]of files)if(file.startsWith('lib/'))write(dir+'/'+file,b);
 write(dir+'/api/'+endpoint+'.js',files.get('api/'+endpoint+'.js'));
 write(dir+'/package.json',JSON.stringify({type:'module'}));
 write(dir+'/.vc-config.json',JSON.stringify({runtime:'nodejs22.x',handler:'api/'+endpoint+'.js',launcherType:'Nodejs',shouldAddHelpers:true,maxDuration:endpoint==='quote'?60:15}));
}
write(root+'/config.json',JSON.stringify({version:3,routes:[{src:'/(.*)',headers:{'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'},continue:true},{handle:'filesystem'}]}));
const release={version:VERSION,changeType:'order-title-and-address-description',existingCalculationsUnchanged:true,hashes:Object.fromEntries([...files].map(([f,b])=>[f,sha(b)])),files:[...files].map(([file,b])=>({file,encoding:'base64',data:b.toString('base64')}))};
fs.writeFileSync('prepared-v15.json',JSON.stringify(release));
console.log('V15_BUILD_VERIFIED',JSON.stringify({version:VERSION,title:'代下單初步報價',subtitle:'（協助下單寄您提供的韓國地址）',oldTextOccurrences:0,changed:[...changed],fileCount:files.size,sha256:sha(JSON.stringify(release))}));
