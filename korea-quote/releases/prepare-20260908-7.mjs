import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='https://korea-quote-0908.vercel.app',version='2026-09-08.7',sources=new Map();
const hashes={'index.html':'4c20ff5868510ffac1324df73e1ce69dd418282fb38998645b1282a3a9b7ece5','style.css':'9e3ee24286dfeed514429aff5d49df91cf42ac8a9ee534dc387e02ec8eadcde8','app.js':'cef5f02d7b65c04e1cf6e3378556026cedcd1803f4f37ee220dd47be1750379c','lib/platforms.mjs':'8ae241bdec48c967babde6b1ec226b2521e51957744fafde43e6a4edd9a79d55','lib/extract.mjs':'f87c2197569265e1dcc356b48f70e70c0662c848878169a8db98098b106b66e4','lib/quote.mjs':'5abb8020998c7863e8fedaacb8e1265d45f13a5d42f45417ee3ebe10774e91be','lib/pricing.mjs':'dbba85432912d14ccd97011cb8303a52eb38969c46da8b549334d6f61206ae1e','lib/inquiry.mjs':'e5344a3efebdf3c57a0a0cf1fbaf6b9f5d3e7368f43271b80b2d5f111190738d','assets/brand.webp':'86ea0745abd440aa68a81f114c103a2859172dc1a31e7251c19d2c7a564d8a6f','assets/line-qr.png':'c9d42ee7057f9bc8eb282e5d34860a622cc7681b56bbe6860603c1656aef8fec','assets/favicon.svg':'7fa8bcf2eca3ec23bc3731c087ef598c498020ac15d8180870ecc38dd411ab5a'};
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const [file,expected]of Object.entries(hashes)){const r=await fetch(base+'/'+file,{redirect:'manual',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,file);const b=Buffer.from(await r.arrayBuffer());assert.equal(hash(b),expected,'Unexpected live source '+file);sources.set(file,b);}
function put(file,text){sources.set(file,Buffer.from(text));}
function replace(file,old,value){const s=sources.get(file).toString();assert.ok(s.includes(old),file+' missing '+old.slice(0,90));put(file,s.split(old).join(value));}
put('lib/estimate.mjs',String.raw`/** Estimate known merchandise even when domestic shipping is unpublished.
 * null remains unknown; only the calculation basis omits it. Fee policy is unchanged.
 */
import {calculate,formulaText,feeDescription} from './pricing.mjs';
export function estimateFromAmounts(price,shipping){
  const excluded=shipping===null||shipping===undefined||(typeof shipping==='string'&&!shipping.trim());
  const q=calculate(price,excluded?0:shipping);
  return excluded?{...q,shippingKrw:null,shippingExcluded:true,estimateScope:'product_only'}:q;
}
export function quoteForProduct(p){
  if(!p||p.currency!=='KRW'||!Number.isSafeInteger(p.priceKrw)||p.priceKrw<1||p.priceKrw>1e9)return null;
  if(p.status!=='quoted'&&p.reasonCode!=='SHIPPING_UNKNOWN')return null;
  if(p.shippingKrw!==null&&p.shippingKrw!==undefined&&(!Number.isSafeInteger(p.shippingKrw)||p.shippingKrw<0||p.shippingKrw>1e9))return null;
  return estimateFromAmounts(p.priceKrw,p.shippingKrw);
}
export function verifiedCalculation(q){
  if(q.shippingExcluded===true){
    if(q.shippingKrw!==null)throw Error('未含運費的估價資料不一致。');
    return calculate(q.priceKrw,0);
  }
  return calculate(q.priceKrw,q.shippingKrw);
}
export function estimateFormula(q,options={}){
  const c=verifiedCalculation(q);
  if(!q.shippingExcluded)return formulaText(c,options);
  const p=options.grouped?new Intl.NumberFormat('zh-TW').format(c.priceKrw):String(c.priceKrw);
  const base=p+'÷'+c.exchangeRate;
  if(c.feeType==='fixed')return base+'＋'+c.fixedFeeTwd;
  if(c.feeType==='percent')return base+'×'+((100+c.servicePercent)/100).toFixed(2);
  return base;
}
export function estimateFee(q){return feeDescription(verifiedCalculation(q));}
`);
replace('lib/platforms.mjs',"APP_VERSION = '2026-09-08.6'","APP_VERSION = '2026-09-08.7'");
replace('lib/platforms.mjs','公開標價；未標運費轉 LINE 確認','公開標價；未標運費先估商品價');
replace('lib/extract.mjs','已讀到商品售價，但韓國境內運費未標明；不把未知運費當成免運，請到 LINE 確認。','已依商品售價粗估，未含韓國境內運費；實際運費與正式報價請到 LINE 確認。');
replace('lib/extract.mjs','if(price!==null&&shipping!==null&&amounts.every(n=>n===price||n===shipping))','if(price!==null&&amounts.every(n=>n===price||n===shipping))');
replace('lib/quote.mjs','export function parseReader(payload,input){','export function parseReader(payload,input,{allowMissingShipping=false}={}){');
replace('lib/quote.mjs',"if(shipping===null)fail('SHIPPING_UNKNOWN'","if(shipping===null&&!allowMissingShipping)fail('SHIPPING_UNKNOWN'");
let inquiry=sources.get('lib/inquiry.mjs').toString();const start=inquiry.indexOf('export function inquiryText('),end=inquiry.indexOf('export function chatUrl',start);assert.ok(start>=0&&end>start);
inquiry=inquiry.slice(0,start)+String.raw`export function inquiryText(product,quote,{manual=false,note=''}={}){
  if(!product||!quote||!Number.isSafeInteger(quote.totalTwd)||quote.totalTwd<0)throw new Error('尚未取得有效報價。');
  const excluded=quote.shippingExcluded===true;
  const checked=verifiedCalculation(quote);
  if(checked.totalTwd!==quote.totalTwd)throw new Error('報價與計算規則不一致。');
  const fmt=n=>new Intl.NumberFormat('zh-TW').format(n),title=String(product.title||'自訂商品').replace(/[\r\n]+/g,' ').slice(0,240),url=product.url?normalize(product.url).url:'';
  const stamp=product.fetchedAt&&Number.isFinite(Date.parse(product.fetchedAt))?new Date(product.fetchedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'';
  return ['廢廢豬你好，我想詢問這件商品！','【'+(manual?'手動試算，待確認':excluded?'商品粗估，未含韓國運費':'網站預估報價')+'】',product.platformName?'平台：'+product.platformName:'',title,url,
    '商品：₩'+fmt(checked.priceKrw),
    excluded?'韓國境內運費：未標示，本次未計入':'韓國境內運費：₩'+fmt(checked.shippingKrw),
    '試算：'+estimateFormula(quote),'代購費：'+estimateFee(quote),
    '預估台幣：NT$'+fmt(checked.totalTwd)+'（'+(checked.feeType==='none'?'免代購費':'已含代購費')+(excluded?'；未含韓國運費':'')+'）',
    excluded?'先依商品款判定代購費區間，加入實際運費後再確認總額。':'',
    stamp?(manual?'試算':'資料取得')+'時間：'+stamp+'（台灣）':'',
    String(note).trim()?'想要的款式／數量：'+String(note).trim().slice(0,240):'',
    '請幫我確認款式、庫存與正式報價，謝謝！'].filter(Boolean).join('\n');
}
`+inquiry.slice(end);
put('lib/inquiry.mjs',inquiry);
replace('lib/inquiry.mjs',"import {calculate,formulaText,feeDescription} from './pricing.mjs';","import {quoteForProduct,verifiedCalculation,estimateFormula,estimateFee} from './estimate.mjs';");
replace('lib/inquiry.mjs',"export function pendingInquiryText(product,{note=''}={}){","export function pendingInquiryText(product,{note=''}={}){\n  const quote=quoteForProduct(product);if(quote)return inquiryText(product,quote,{note});");
replace('app.js',"import {calculate,PRICING_VERSION,EXCHANGE_RATE,FEE_TIERS,formulaText,feeDescription} from './lib/pricing.mjs';","import {PRICING_VERSION,EXCHANGE_RATE,FEE_TIERS} from './lib/pricing.mjs';\nimport {quoteForProduct,estimateFromAmounts,estimateFormula,estimateFee} from './lib/estimate.mjs';");
replace('app.js',"current.q?'預估代購金額':'商品資訊尚待確認'","current.q?(current.q.shippingExcluded?'商品粗估・未含韓國運費':'預估代購金額'):'商品資訊尚待確認'");
replace('app.js',"current={p,q,manual};$('result').hidden=false;","current={p,q,manual};const excluded=q?.shippingExcluded===true;$('result').hidden=false;");
replace('app.js',"q?'✓ '+(p.platformName||'Bunjang')+' · 已取得售價與韓國運費'","q?'✓ '+(p.platformName||'商品')+(excluded?' · 商品粗估，未含韓國運費':' · 已取得售價與韓國運費')");
replace('app.js',"$('total').textContent=fmt(q.totalTwd);$('price').textContent='₩'+fmt(q.priceKrw);$('shipping').textContent='₩'+fmt(q.shippingKrw);","$('total').textContent=fmt(q.totalTwd);$('price').textContent='₩'+fmt(q.priceKrw);$('shipping').textContent=excluded?'未標示，本次未計入':'₩'+fmt(q.shippingKrw)+(q.shippingKrw===0?'（免運）':'');\n    $('priceHeading').textContent=excluded?'商品粗估（未含韓國運費）':'預估代購金額';$('priceScope').textContent=excluded?'含商品款及代購費；未含韓國境內運費。':'含商品款、韓國境內運費及代購費。';\n    $('shippingNote').hidden=!excluded;");
replace('app.js','feeDescription(q)','estimateFee(q)');replace('app.js','formulaText(q,{grouped:true})','estimateFormula(q,{grouped:true})');
replace('app.js',"if(d.status==='quoted'){","if(d.status==='quoted'||d.status==='estimated'){");
replace('app.js',"const verified=calculate(d.product.priceKrw,d.product.shippingKrw);","const verified=quoteForProduct(d.product);\n      if(!verified||(d.status==='estimated')!==!!verified.shippingExcluded||!!d.quote.shippingExcluded!==!!verified.shippingExcluded)throw Error('估價範圍核對失敗，請重新整理。');");
replace('app.js',"show({title:'自訂商品',fetchedAt:new Date().toISOString()},calculate($('p').value,$('s').value),true);","const q=estimateFromAmounts($('p').value,$('s').value);show({title:'自訂商品',fetchedAt:new Date().toISOString()},q,true);");
replace('index.html','v=20260908-6','v=20260908-7');replace('index.html','<span id="version">2026-09-08.5</span>','<span id="version">2026-09-08.7</span>');
replace('index.html','資料齊全就能估價；不完整也能直接詢問。','讀到商品售價就先估；有運費再一起算。');
replace('index.html','手動試算不代表已讀取商品價格；免運請明確填 0。','有韓國運費就填入；未標示可留空，先估商品價。');
replace('index.html','id="s" type="number" inputmode="numeric" min="0" max="1000000000" step="1" required','id="s" type="number" inputmode="numeric" min="0" max="1000000000" step="1" placeholder="未標示可留空"');
replace('index.html','<div class="price-block"><span>預估代購金額</span>','<div class="price-block"><span id="priceHeading">預估代購金額</span>');
replace('index.html','<p>含商品款、韓國境內運費及代購手續費</p>','<p id="priceScope">含商品款、韓國境內運費及代購費</p>');
replace('index.html','<dt>韓國一般宅配</dt>','<dt>韓國境內運費</dt>');
replace('index.html','<p id="math" class="math"></p>','<p id="math" class="math"></p><p id="shippingNote" class="small muted" hidden>先依商品款選用代購費區間，加入實際運費後再確認總額。</p>');
replace('index.html','先別急著猜價格，<br>讓廢廢豬幫你確認。','尚未讀到售價，<br>讓廢廢豬幫你看。');
replace('index.html','尚未產生台幣報價；未確認的運費不會當成 0 元。','尚未取得可換算的韓幣售價，可帶連結到 LINE 詢問。');
replace('index.html','（商品韓幣 ＋ 韓國運費）<br>','（商品韓幣 ＋ 已知韓國運費）<br>');
replace('index.html','不是分段累進；百分比按換算後的台幣金額計算。','不是分段累進；百分比按換算後的台幣金額計算。<br>未標運費時，先依商品款估價，並標示未含韓國運費。');
put('api/quote.js',String.raw`import {normalize,confirmation,PlatformError,APP_VERSION} from '../lib/platforms.mjs';
import {parseReader,QuoteError} from '../lib/quote.mjs';
import {quoteForProduct} from '../lib/estimate.mjs';
import {parseFruits,parseZigzag,parseNaver,parsePoca,parseXEmbed} from '../lib/extract.mjs';
const cache=new Map(),pending=new Map(),hits=new Map();
const LIMIT=3000000;
export async function readLimited(r){
  if(Number(r.headers.get('content-length'))>LIMIT)throw new PlatformError('PAGE_TOO_LARGE','商品頁資料過大。');
  if(!r.body)return '';
  const reader=r.body.getReader(),chunks=[];let size=0;
  while(true){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT){await reader.cancel();throw new PlatformError('PAGE_TOO_LARGE','商品頁資料過大。');}chunks.push(value);}
  return Buffer.concat(chunks.map(b=>Buffer.from(b))).toString('utf8');
}
/** Validate EVERY redirect before issuing the next request. No cookies or login bypass. */
export async function publicPage(target,fetchImpl=fetch,deadline=Date.now()+48000){
  let t=target;
  for(let i=0;i<4;i++){
    const r=await fetchImpl(t.url,{headers:{Accept:'text/html,application/json','Accept-Language':'ko-KR,ko;q=0.9'},redirect:'manual',signal:AbortSignal.timeout(Math.max(1,Math.min(12000,deadline-Date.now())))});
    if([301,302,303,307,308].includes(r.status)){
      const location=r.headers.get('location');await r.body?.cancel();
      if(!location)throw new PlatformError('REDIRECT_UNAVAILABLE','頁面轉址未提供目的地。');
      const next=normalize(new URL(location,t.url).href);
      if(target.kind!=='short'&&(next.platformId!==target.platformId||next.key!==target.key))throw new PlatformError('REDIRECT_CONFIRMATION','頁面轉到登入頁、其他商品或未支援的目的地，請到 LINE 確認。');
      if(next.kind!=='product'&&next.kind!=='post'&&next.kind!=='short')throw new PlatformError('REDIRECT_CONFIRMATION','短網址沒有指向可確認的商品或貼文，請到 LINE 確認。');
      t=next;continue;
    }
    if(!r.ok){await r.body?.cancel();throw new PlatformError([401,403].includes(r.status)?'ACCESS_RESTRICTED':'UPSTREAM_ERROR',r.status===429?'平台目前限制查詢次數，請稍後再試或到 LINE 詢問。':'平台未提供可讀取的公開頁面（HTTP '+r.status+'），請到 LINE 確認。');}
    return {target:t,html:await readLimited(r)};
  }
  throw new PlatformError('REDIRECT_LIMIT','這個分享連結轉址較多，請提供商品的完整網址，或直接到 LINE 詢問。');
}
function pageNotice(t){return t.platformId==='naver'?'已辨識 Naver。比價頁、部落格與社團不等於單一商品售價；請提供 Smart Store 商品頁，或直接到 LINE 確認。':'已辨識 '+t.platformName+'；目前貼的是首頁、賣場或未確認的分享格式，請提供單一商品／貼文網址，或直接到 LINE 詢問。';}
export async function lookup(input,fetchImpl=fetch){
  const original=normalize(input),deadline=Date.now()+48000;let target=original,html=null,p;
  try{
    if(target.kind==='short'){
      const resolved=await publicPage(target,fetchImpl,deadline);target=resolved.target;html=resolved.html;
      if(target.kind==='short')return confirmation(original,'分享短網址未解析出商品，請貼完整商品網址或到 LINE 確認。','SHORTLINK_UNRESOLVED');
    }
    if(target.kind==='page'||(target.platformId==='naver'&&target.kind==='post'))return confirmation(target,pageNotice(target),'NOT_SINGLE_PRODUCT');
    if(target.platformId==='bunjang'){
      const headers={Accept:'application/json','X-Respond-With':'markdown','X-Engine':'browser','X-Timeout':'20','X-No-Cache':'true'};
      if(process.env.JINA_API_KEY)headers.Authorization='Bearer '+process.env.JINA_API_KEY;
      const r=await fetchImpl('https://r.jina.ai/'+target.url,{headers,redirect:'manual',signal:AbortSignal.timeout(Math.max(1,Math.min(45000,deadline-Date.now())))});
      if(!r.ok){await r.body?.cancel();throw new PlatformError('UPSTREAM_ERROR','公開商品讀取服務目前未回應，請稍後重試或到 LINE 確認。');}
      const parsed=parseReader(await readLimited(r),target.url,{allowMissingShipping:true});
      p={...target,...parsed,currency:'KRW',status:parsed.shippingKrw===null?'needs_confirmation':'quoted',reasonCode:parsed.shippingKrw===null?'SHIPPING_UNKNOWN':null,notice:parsed.shippingKrw===null?'已依商品售價粗估，未含韓國境內運費；實際運費與正式報價請到 LINE 確認。':'按主商品標價及一般宅配估算，款式與庫存請到 LINE 確認。'};
    }else if(target.platformId==='x'){
      const publicUrl=target.url.replace('https://x.com/','https://twitter.com/');
      const r=await fetchImpl('https://publish.twitter.com/oembed?url='+encodeURIComponent(publicUrl)+'&omit_script=1&hide_thread=true',{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(Math.max(1,Math.min(14000,deadline-Date.now())))});
      if(!r.ok){await r.body?.cancel();throw new PlatformError('PUBLIC_POST_UNAVAILABLE','這則推文未能公開讀取，可能需要登入、已刪除或受到平台限制。請到 LINE 確認。');}
      p=parseXEmbed(await readLimited(r),target.url);
    }else{
      if(html===null){const page=await publicPage(target,fetchImpl,deadline);html=page.html;target=page.target;}
      const parser={fruits:parseFruits,zigzag:parseZigzag,naver:parseNaver,poca:parsePoca}[target.platformId];
      p=parser(html,target.url);
    }
    return {...p,originalUrl:original.url,fetchedAt:new Date().toISOString(),fromCache:false};
  }catch(e){
    const known=e instanceof PlatformError||e instanceof QuoteError;
    const notice=known?e.message:/Abort|Timeout/.test(e.name||'')?'平台載入逾時，這次未取得完整報價。請稍後重試或到 LINE 確認。':'暫時無法連接這個平台，請稍後重試或到 LINE 詢問。';
    return confirmation(target,notice,known?e.code:'UPSTREAM_UNAVAILABLE',{originalUrl:original.url,checkedAt:new Date().toISOString()});
  }
}
export async function fetchProduct(input,fetchImpl=fetch){
  const target=normalize(input),cached=cache.get(target.key),ttl=cached?.product?.status==='quoted'?60000:15000;
  if(cached&&Date.now()-cached.at<ttl)return {...cached.product,fromCache:true};
  if(pending.has(target.key))return pending.get(target.key);
  if(pending.size>=15)throw new PlatformError('BUSY','目前查詢較多，請稍後再試。');
  const work=lookup(target.url,fetchImpl);pending.set(target.key,work);
  try{const product=await work;cache.set(target.key,{at:Date.now(),product});if(cache.size>300)cache.delete(cache.keys().next().value);return product;}finally{pending.delete(target.key);}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Quote-Version',APP_VERSION);
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed',version:APP_VERSION});
  try{
    const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0],now=Date.now();
    for(const[k,v]of hits)if(v.until<now)hits.delete(k);
    const h=hits.get(ip)||{count:0,until:now+60000};h.count++;hits.set(ip,h);if(hits.size>3000)hits.delete(hits.keys().next().value);
    if(h.count>18)return res.status(429).json({ok:false,error:'查詢次數較多，請一分鐘後再試。',version:APP_VERSION});
    const url=new URL(req.url,'https://local.invalid').searchParams.get('url'),product=await fetchProduct(url);
    const quote=quoteForProduct(product);
    return res.status(200).json({ok:true,status:quote?(quote.shippingExcluded?'estimated':'quoted'):'needs_confirmation',product,quote,version:APP_VERSION});
  }catch(e){return res.status(e instanceof PlatformError?422:502).json({ok:false,error:e instanceof PlatformError?e.message:'本次沒有取得報價，請稍後再試。',code:e.code||'LOOKUP_ERROR',version:APP_VERSION});}
}
`);
put('api/health.js',"import {APP_VERSION,PLATFORMS} from '../lib/platforms.mjs';\nimport {EXCHANGE_RATE,FEE_BASIS,FEE_TIERS,PRICING_VERSION} from '../lib/pricing.mjs';\nexport default function handler(req,res){res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,version:APP_VERSION,pricingVersion:PRICING_VERSION,service:'fatfatpig-korea-quote',scope:'已知商品價即粗估；有運費就計入，未標運費先不計入',unknownShippingPolicy:'estimate_product_only',exchangeRate:EXCHANGE_RATE,feeBasis:FEE_BASIS,tiers:FEE_TIERS,platforms:PLATFORMS});}\n");
put('package.json',JSON.stringify({name:'korea-quote-0908',version:'1.0.7',type:'module',engines:{node:'22.x'}},null,2)+'\n');
await fs.mkdir('prepared-site',{recursive:true});
for(const[file,b]of sources){await fs.mkdir(path.dirname('prepared-site/'+file),{recursive:true});await fs.writeFile('prepared-site/'+file,b);}
const {quoteForProduct,estimateFormula}=await import(path.resolve('prepared-site/lib/estimate.mjs'));
const {inquiryText}=await import(path.resolve('prepared-site/lib/inquiry.mjs'));
for(const[p,total]of [[10000,314],[20000,577],[20001,569],[38000,1080],[80000,2211],[150000,4066],[200000,5264],[1300000,34211]]){const product={currency:'KRW',priceKrw:p,shippingKrw:null,status:'needs_confirmation',reasonCode:'SHIPPING_UNKNOWN',title:'Scope test'},q=quoteForProduct(product);assert.equal(q.totalTwd,total);assert.equal(q.shippingKrw,null);assert.ok(inquiryText(product,q).includes('未含韓國運費'));assert.ok(!estimateFormula(q).includes('＋0'));}
assert.equal(quoteForProduct({currency:'KRW',priceKrw:28000,shippingKrw:4000,status:'quoted'}).totalTwd,910);
const snapshot=JSON.stringify({version,files:[...sources].map(([file,b])=>({file,encoding:'base64',data:b.toString('base64'),sha256:hash(b)}))});
await fs.writeFile('prepared-v7.json',snapshot);
const response=await fetch('https://api.github.com/repos/paulchen01/Bychen01/contents/korea-quote/releases/site-20260908-7.json',{method:'PUT',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.GITHUB_TOKEN,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({message:'Save verified v7 product-only estimate source snapshot',content:Buffer.from(snapshot).toString('base64')})});
const result=await response.json();assert.equal(response.status,201,JSON.stringify(result));
console.log('PREPARED_RELEASE',JSON.stringify({version,commit:result.commit.sha,sha256:hash(snapshot),files:sources.size}));
