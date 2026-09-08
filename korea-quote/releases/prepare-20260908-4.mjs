import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='https://korea-quote-0908.vercel.app';
const files={};
const original={
'index.html':'54f584b61d8e1a95b5abbcb391e909d98c72a8ccfff935658a0cf76deded7aa3',
'style.css':'6eb246a5b4864b31afa1dfffe346cb54ed6f531c8b6cb5b5ff9f1abd82a12a90',
'app.js':'5114c16e9fdc40256d134fafcc62059b7a183ac1e4f1aa2eb8662a2ce666d584',
'lib/quote.mjs':'b00c9db327fe25b5944949370f7810046a269a2ca95772cbd9ab9682a4e0928e',
'lib/inquiry.mjs':'974629b66a7245da6519545adf733954581dd7a6eeb05291273032de0ddd5968',
'assets/brand.webp':'86ea0745abd440aa68a81f114c103a2859172dc1a31e7251c19d2c7a564d8a6f',
'assets/line-qr.png':'c9d42ee7057f9bc8eb282e5d34860a622cc7681b56bbe6860603c1656aef8fec',
'assets/favicon.svg':'7fa8bcf2eca3ec23bc3731c087ef598c498020ac15d8180870ecc38dd411ab5a'};
for(const [file,hash] of Object.entries(original)){
 const r=await fetch(base+'/'+(file==='index.html'?'':file),{redirect:'manual',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,file);
 const bytes=Buffer.from(await r.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,'Production changed since inspected snapshot: '+file);
 files[file]=bytes;console.log('VERIFIED_ORIGINAL',file,bytes.length);
}
function set(file,text){files[file]=Buffer.from(text);}
function patch(file,from,to){const s=files[file].toString();assert.ok(s.includes(from),'Missing patch anchor '+file+' '+from.slice(0,70));set(file,s.replace(from,to));}
const pr=await fetch('https://raw.githubusercontent.com/paulchen01/Bychen01/3daa189fefabc4935ec6dd85af9e06644eb68afd/korea-quote/lib/pricing.mjs',{signal:AbortSignal.timeout(15000)});assert.equal(pr.status,200);set('lib/pricing.mjs',await pr.text());
patch('lib/quote.mjs',"export const VERSION='2026-09-08.3';","export { PRICING_VERSION as VERSION, calculate } from './pricing.mjs';");
let q=files['lib/quote.mjs'].toString();assert.ok(q.includes('export function calculate('));set('lib/quote.mjs',q.slice(0,q.indexOf('export function calculate(')));
patch('lib/inquiry.mjs',"import { normalize } from './quote.mjs';","import { normalize } from './quote.mjs';\nimport {calculate,formulaText,feeDescription} from './pricing.mjs';");
patch('lib/inquiry.mjs','const fmt=n=>','quote=calculate(quote.priceKrw,quote.shippingKrw);const fmt=n=>');
patch('lib/inquiry.mjs',"'試算：('+quote.priceKrw+'＋'+quote.shippingKrw+')÷'+quote.exchangeRate+'×'+(1+quote.servicePercent/100)","'試算：'+formulaText(quote),'代購費：'+feeDescription(quote)");
patch('lib/inquiry.mjs',"'（含'+quote.servicePercent+'%手續費）'","'（'+(quote.feeType==='none'?'免代購費':'已含代購費')+'）'");
patch('app.js',"import { normalize, calculate, VERSION } from './lib/quote.mjs';","import { normalize, calculate, VERSION } from './lib/quote.mjs';\nimport { EXCHANGE_RATE, FEE_TIERS, formulaText, feeDescription } from './lib/pricing.mjs';");
patch('app.js','settings={rate:43,fee:5},','');
patch('app.js',"$('feePercent').textContent=q.servicePercent;settings={rate:q.exchangeRate,fee:q.servicePercent};$('rate').textContent=q.exchangeRate;$('multiplier').textContent=1+q.servicePercent/100;$('ruleFee').textContent=q.servicePercent;$('math').textContent='（'+fmt(q.priceKrw)+'＋'+fmt(q.shippingKrw)+'）÷'+q.exchangeRate+'×'+(1+q.servicePercent/100)+'；合計無條件進位至整數元。';","$('feeLabel').textContent=feeDescription(q);$('subtotal').textContent='₩'+fmt(q.subtotalKrw);$('tierApplied').textContent='套用區間：'+q.tierRange+' · '+q.serviceLabel;$('rate').textContent=q.exchangeRate;$('math').textContent=formulaText(q,{grouped:true})+'；合計無條件進位至整數元。';document.querySelectorAll('[data-tier]').forEach(row=>row.classList.toggle('active-tier',row.dataset.tier===q.tierId));");
patch('app.js',"calculate($('p').value,$('s').value,settings.rate,settings.fee)","calculate($('p').value,$('s').value)");
patch('app.js','show(d.product,d.quote);',"if(d.version!==VERSION||d.quote?.pricingVersion!==VERSION)throw Error('報價規則已更新，請重新整理頁面後再查詢。');const verified=calculate(d.product.priceKrw,d.product.shippingKrw);if(d.quote.totalTwd!==verified.totalTwd||d.quote.tierId!==verified.tierId||d.quote.exchangeRate!==EXCHANGE_RATE)throw Error('報價規則不一致，已停止顯示金額；請重新整理頁面。');show(d.product,verified);");
patch('app.js','current=null;updateBar();busy(false);',"current=null;document.querySelectorAll('[data-tier]').forEach(row=>row.classList.remove('active-tier'));updateBar();busy(false);");
set('app.js',files['app.js'].toString()+"\n$('rate').textContent=EXCHANGE_RATE;for(const tier of FEE_TIERS){const row=document.createElement('tr');row.dataset.tier=tier.id;const range=document.createElement('td'),fee=document.createElement('td');range.textContent=tier.range;fee.textContent=tier.label;row.append(range,fee);$('feeTiers').append(row);}\n");
set('index.html',files['index.html'].toString().replaceAll('20260908-3','20260908-4').replaceAll('2026-09-08.3','2026-09-08.4'));
patch('index.html','<span>5% 代購手續費</span>','<span>匯率 ÷38 · 分級代購費</span>');
patch('index.html','<p>（商品韓幣 ＋ 韓國運費）<br><b>÷ <span id="rate">43</span> × <span id="multiplier">1.05</span></b></p><small>商品款與韓國境內運費一併加收 <span id="ruleFee">5</span>% 手續費；<br>合計無條件進位至新台幣整數元。</small>','<p>（商品韓幣 ＋ 韓國運費）<br><b>÷ <span id="rate">38</span> ＋ 代購費</b></p><small>依「商品款＋韓國境內運費」的韓幣小計選用下列一個區間，<br>不是分段累進；百分比按換算後的台幣金額計算。</small><table class="fee-table"><caption>分級代購費</caption><thead><tr><th scope="col">韓幣小計</th><th scope="col">代購費</th></tr></thead><tbody id="feeTiers"></tbody></table><small>20,000 韓幣含以下固定加 NT$50；200,000 韓幣起免代購費。<br>只在最後合計時無條件進位至新台幣整數元。</small>');
patch('index.html','<div><dt>換算台幣</dt><dd id="base"></dd></div>','<div><dt>韓幣小計（判定費率）</dt><dd id="subtotal"></dd></div><div><dt>換算台幣（÷38）</dt><dd id="base"></dd></div>');
patch('index.html','<dt>代購手續費 <span id="feePercent">5</span>%</dt>','<dt id="feeLabel">代購費</dt>');
patch('index.html','<p id="math" class="math"></p>','<p id="tierApplied" class="tier-applied"></p><p id="math" class="math"></p>');
set('style.css',files['style.css'].toString()+'\n.fee-table{width:100%;border-collapse:collapse;margin:18px 0 13px;font-size:12px;text-align:left;line-height:1.8}.fee-table caption{text-align:left;font-weight:700;padding-bottom:8px;color:var(--ink)}.fee-table th,.fee-table td{padding:9px 8px;border-bottom:1px solid #d7ddca}.fee-table th{font-size:11px;color:var(--muted);font-weight:600}.fee-table td:first-child{width:57%}.fee-table .active-tier{background:#dce7ce;color:#3e573c;font-weight:700}.tier-applied{font-size:12px;line-height:1.8;background:var(--sage);color:var(--ink);padding:10px 12px;border-radius:9px;margin:16px 0 6px}.formula-card small{display:block;line-height:1.9}.quote-breakdown dt{min-width:0}.quote-breakdown dd{flex-shrink:0}@media(max-width:360px){.fee-table{font-size:11px}.fee-table th,.fee-table td{padding:9px 4px}}\n');
set('package.json',JSON.stringify({name:'korea-quote-0908',version:'1.0.4',type:'module',engines:{node:'22.x'}}));
set('api/quote.js',`import {normalize,parseReader,calculate,QuoteError,VERSION} from '../lib/quote.mjs';
const cache=new Map(),pending=new Map(),hits=new Map();
async function readLimited(response){if(!response.ok)throw new QuoteError('UPSTREAM_ERROR','商品頁讀取服務暫時無法回應（HTTP '+response.status+'）。');const reader=response.body.getReader(),chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3000000){await reader.cancel();throw new QuoteError('PAGE_TOO_LARGE','商品頁資料過大。');}chunks.push(value);}return Buffer.concat(chunks.map(b=>Buffer.from(b))).toString('utf8');}
export async function fetchProduct(input,fetchImpl=fetch){const target=normalize(input),cached=cache.get(target.id);if(cached&&Date.now()-cached.at<60000)return{...cached.product,fromCache:true};if(pending.has(target.id))return pending.get(target.id);const work=(async()=>{const headers={Accept:'application/json','X-Respond-With':'markdown','X-Engine':'browser','X-Timeout':'20','X-No-Cache':'true'};if(process.env.JINA_API_KEY)headers.Authorization='Bearer '+process.env.JINA_API_KEY;const response=await fetchImpl('https://r.jina.ai/'+target.url,{headers,redirect:'manual',signal:AbortSignal.timeout(45000)});const product={...parseReader(await readLimited(response),target.url),fetchedAt:new Date().toISOString(),fromCache:false};cache.set(target.id,{at:Date.now(),product});if(cache.size>300)cache.delete(cache.keys().next().value);return product;})();pending.set(target.id,work);try{return await work;}finally{pending.delete(target.id);}}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Quote-Version',VERSION);if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed'});try{const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0],now=Date.now();for(const [k,v]of hits)if(v.until<now)hits.delete(k);const h=hits.get(ip)||{count:0,until:now+60000};h.count++;hits.set(ip,h);if(hits.size>3000)hits.delete(hits.keys().next().value);if(h.count>12)return res.status(429).json({ok:false,error:'查詢次數較多，請一分鐘後再試。',code:'RATE_LIMIT'});const url=new URL(req.url,'https://local.invalid').searchParams.get('url');const product=await fetchProduct(url);const quote=calculate(product.priceKrw,product.shippingKrw);return res.status(200).json({ok:true,product,quote,version:VERSION});}catch(error){const timeout=/Timeout|Abort/.test(error.name||''),known=error instanceof QuoteError||(error.name==='QuoteError'&&typeof error.code==='string');console.error('quote lookup',known?error.code:error.name);return res.status(known?422:502).json({ok:false,code:known?error.code:timeout?'TIMEOUT':'UPSTREAM_ERROR',error:known?error.message:timeout?'商品載入逾時，這次未取得價格，請重新查詢。':'暫時無法連接商品讀取服務，這次未取得價格。',version:VERSION});}}
`);
set('api/health.js',"import {VERSION} from '../lib/quote.mjs';import {EXCHANGE_RATE,FEE_BASIS,FEE_TIERS} from '../lib/pricing.mjs';export default function handler(req,res){res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,version:VERSION,service:'fatfatpig-korea-quote',scope:'商品款、韓國境內運費及分級代購費',exchangeRate:EXCHANGE_RATE,feeBasis:FEE_BASIS,tiers:FEE_TIERS.map(t=>({...t,max:Number.isFinite(t.max)?t.max:null}))});}\n");
for(const [file,bytes] of Object.entries(files)){const p=path.join('prepared-site',file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);}
const {calculate,FEE_TIERS,formulaText}=await import(path.resolve('prepared-site/lib/pricing.mjs'));
const {inquiryText}=await import(path.resolve('prepared-site/lib/inquiry.mjs'));
const cases=[[19999,'fixed50'],[20000,'fixed50'],[20001,'percent8'],[79999,'percent8'],[80000,'percent5'],[149999,'percent5'],[150000,'percent3'],[199999,'percent3'],[200000,'free'],[200001,'free']];
for(const [n,id]of cases){const q=calculate(n,0);assert.equal(q.tierId,id);const rate=n<=20000?0:n<80000?8:n<150000?5:n<200000?3:0,fixed=n<=20000?50:0;assert.equal(q.totalTwd,Number((BigInt(n)*BigInt(100+rate)+BigInt(fixed*3800)+3799n)/3800n));console.log('BOUNDARY_PASS',n,q.totalTwd,id);}
for(let n=1;n<=200001;n++)assert.equal(FEE_TIERS.filter(t=>n>=t.min&&n<=t.max).length,1);
for(const [p,s,total]of [[10000,4000,419],[28000,4000,910],[76000,4000,2211],[146000,4000,4066],[196000,4000,5264],[680000,4000,18000],[50000,5000,1564]]){const q=calculate(p,s);assert.equal(q.totalTwd,total);const text=inquiryText({title:'測試商品',url:'https://m.bunjang.co.kr/products/405399188'},q);assert.ok(text.includes(formulaText(q)));assert.ok(!text.includes('÷43'));}
for(const v of ['',null,undefined,-1,0.5,false,NaN])assert.throws(()=>calculate(28000,v));
assert.ok(!files['app.js'].toString().includes('settings.fee'));assert.ok(!files['index.html'].toString().includes('5% 代購手續費'));
const manifest={version:'2026-09-08.4',originalHashes:original,files:Object.entries(files).map(([file,bytes])=>({file,encoding:'base64',data:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')}))};
const content=JSON.stringify(manifest),hash=createHash('sha256').update(content).digest('hex');fs.mkdirSync('prepared-output',{recursive:true});fs.writeFileSync('prepared-output/site-20260908-4.json',content);fs.writeFileSync('prepared-output/preparation-summary.json',JSON.stringify({version:manifest.version,sha256:hash,files:manifest.files.map(({file,sha256})=>({file,sha256})),boundaries:cases},null,2));
const endpoint='https://api.github.com/repos/paulchen01/Bychen01/contents/korea-quote/releases/site-20260908-4.json';
const headers={Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
const check=await fetch(endpoint,{headers});let sha;if(check.ok)sha=(await check.json()).sha;else assert.equal(check.status,404);
const saved=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify({message:'Save reproducible Fat Fat Pig pricing v4 source snapshot',content:Buffer.from(content).toString('base64'),...(sha?{sha}:{})})});
if(!saved.ok)throw Error('Snapshot save failed HTTP '+saved.status);const result=await saved.json();console.log('PREPARED_RELEASE',JSON.stringify({commit:result.commit.sha,sha256:hash,version:manifest.version,files:manifest.files.length}));
