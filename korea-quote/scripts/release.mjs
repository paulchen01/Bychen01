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
const baseBytes=fs.readFileSync(path.join(root,'releases/site-20261017-22.json'));
assert.equal(sha(baseBytes),'6501808764f05c25bee5821e9f572cad03e5ba4e7ab6fdf199b55a9e199051b6','Unexpected v22 baseline');
const base=JSON.parse(baseBytes);
assert.equal(APP_VERSION,'2026-10-19.23');assert.equal(PRICING_VERSION,'2026-09-15.5');
const source=path.join(root,'site');
const files=[...runtimeFiles(source),...['build.mjs','vercel.json','package-lock.json'].map(file=>({file,data:fs.readFileSync(path.join(source,file))}))].sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
const hashes=Object.fromEntries(files.map(({file,data})=>[file,sha(data)]));
const intendedChanges=new Set([
  'api/quote.js','app.js','assets/favicon.svg','index.html','style.css','smartstore-beta.js',
  'bunjang-guide/index.html','bunjang/index.html','fruitsfamily/index.html','korea-exchange-rate/index.html',
  'korea-proxy-order/index.html','musinsa/index.html','naver-smartstore/index.html','olive-young/index.html','zigzag/index.html',
  'lib/bunjang.mjs','lib/domestic.mjs','lib/extract.mjs','lib/platform-fee.mjs','lib/platforms.mjs','lib/quote.mjs','lib/retail.mjs','lib/x.mjs',
  'llms.txt','sitemap.xml','package.json','package-lock.json'
]);
const removedFiles=new Set(['assets/brand.webp','assets/line-qr.png','lib/inquiry.mjs']);
const addedFiles=new Set(['assets/quote-mark.svg','lib/quote-text.mjs']);
for(const [file,hash] of Object.entries(base.hashes))if(!intendedChanges.has(file)&&!removedFiles.has(file))assert.equal(hashes[file],hash,file+' must retain its existing production behavior');
for(const file of removedFiles)assert.equal(hashes[file],undefined,file+' must be absent from the quotation-only release');
for(const file of Object.keys(hashes))if(!Object.hasOwn(base.hashes,file))assert(addedFiles.has(file),'Unexpected new release file: '+file);
for(const file of addedFiles)assert(hashes[file],'Missing quotation-only file: '+file);
// One display-only fee notice changed. The entire parser and fee policy must remain byte-identical.
const feeSource=fs.readFileSync(path.join(source,'lib/platform-fee.mjs'),'utf8');
const previousFeeSource=feeSource.replace('未標示，本次未計入；請以原商品結帳頁顯示的費用為準。','未標示，本次未計入；需登入後由廢廢豬確認。');
assert.equal(sha(previousFeeSource),base.hashes['lib/platform-fee.mjs'],'Platform fee changes must be limited to the approved display notice');
const contactPattern=/\bLINE\b|line\.me|lin\.ee|oaMessage|fatfatpig_kr|line-qr\.png|brand\.webp|lib\/inquiry\.mjs|lineInquiry|mobileLine|errorLine|copyId|lineDialog|brandDialog/;
for(const {file,data} of files)if(/\.(?:html|js|mjs|css|svg|txt|xml)$/.test(file))assert(!contactPattern.test(data.toString('utf8')),'Contact content remains in release file: '+file);
const release={version:APP_VERSION,changeType:'quotation-only-edition',basedOn:base.version,pricingVersion:PRICING_VERSION,
  backup:{branch:'backup/with-line-20261019-v22',commit:'6263ba7b637b0f63a853efb5ca6c125a3755f484',releaseSha256:sha(baseBytes)},
  behavior:{...base.behavior,edition:'quote-only',contactRedirects:false,standaloneQuoteCopy:true,mobileQuoteAction:'focus-or-copy'},
  hashes,files:files.map(({file,data})=>({file,encoding:'base64',data:data.toString('base64')}))};
const bytes=Buffer.from(JSON.stringify(release)),destination=path.join(root,'releases/site-20261019-23.json');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(destination).toString(),bytes.toString(),'Saved release does not match current source');
else fs.writeFileSync(destination,bytes);
console.log(JSON.stringify({version:APP_VERSION,files:files.length,releaseSha256:sha(bytes),action:process.argv.includes('--check')?'verified':'saved'}));
