import {normalize,confirmation,PlatformError,APP_VERSION} from '../lib/platforms.mjs';
import {QuoteError} from '../lib/quote.mjs';
import {quoteForProduct} from '../lib/estimate.mjs';
import {parseFruits,parseZigzag,parseNaver,parsePoca,parseXEmbed} from '../lib/extract.mjs';
import {directDomesticTarget,resolveDomesticPrice,validateDomesticProduct} from '../lib/domestic.mjs';
import {parseOliveYoungReader,parseMusinsa,musinsaCart} from '../lib/retail.mjs';
import {getRate,RateError} from '../lib/sheet-rate.mjs';
import {withPlatformFee} from '../lib/platform-fee.mjs';
import {loadBunjang,resolveBunjangTarget} from '../lib/bunjang.mjs';
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
  const original=normalize(input),deadline=Date.now()+48000;let target=original,html=null,p,linkResolution=null;
  const direct=directDomesticTarget(original);if(direct)target=direct.target;
  try{
    if(target.platformId==='bunjang'&&target.market==='kr'&&target.kind==='link'){
      const resolved=await resolveBunjangTarget(target,fetchImpl,deadline);target=resolved.target;linkResolution=resolved.proof;
    }
    if(target.kind==='short'){
      const resolved=await publicPage(target,fetchImpl,deadline);target=resolved.target;html=resolved.html;
      if(target.kind==='short')return confirmation(original,'分享短網址未解析出商品，請貼完整商品網址或到 LINE 確認。','SHORTLINK_UNRESOLVED');
    }
    if(target.platformId==='musinsa'&&target.kind==='cart')return withPlatformFee(musinsaCart(target));
    if(target.kind==='page'||(target.platformId==='naver'&&target.kind==='post'))return confirmation(target,pageNotice(target),'NOT_SINGLE_PRODUCT');
    if(target.platformId==='bunjang'){
      p=await loadBunjang(target,fetchImpl,deadline);
    }else if(target.platformId==='oliveyoung'){
      const headers={Accept:'application/json','X-Respond-With':'markdown','X-Engine':'browser','X-Timeout':'20','X-No-Cache':'true'};
      if(process.env.JINA_API_KEY)headers.Authorization='Bearer '+process.env.JINA_API_KEY;
      const r=await fetchImpl('https://r.jina.ai/'+target.url,{headers,redirect:'manual',signal:AbortSignal.timeout(Math.max(1,Math.min(45000,deadline-Date.now())))});
      if(!r.ok){await r.body?.cancel();throw new PlatformError('UPSTREAM_ERROR','公開商品讀取服務目前未回應，請稍後重試或到 LINE 確認。');}
      const raw=await readLimited(r);
      p=parseOliveYoungReader(raw,target.url);
    }else if(target.platformId==='x'){
      const publicUrl=target.url.replace('https://x.com/','https://twitter.com/');
      const r=await fetchImpl('https://publish.twitter.com/oembed?url='+encodeURIComponent(publicUrl)+'&omit_script=1&hide_thread=true',{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(Math.max(1,Math.min(14000,deadline-Date.now())))});
      if(!r.ok){await r.body?.cancel();throw new PlatformError('PUBLIC_POST_UNAVAILABLE','這則推文未能公開讀取，可能需要登入、已刪除或受到平台限制。請到 LINE 確認。');}
      p=parseXEmbed(await readLimited(r),target.url);
    }else{
      if(html===null){const page=await publicPage(target,fetchImpl,deadline);html=page.html;target=page.target;}
      const parser={fruits:parseFruits,zigzag:parseZigzag,naver:parseNaver,poca:parsePoca,musinsa:parseMusinsa}[target.platformId];
      p=parser(html,target.url);
    }
    if(direct){p=validateDomesticProduct(p,original,target,direct.method);}
    else if(target.kind==='product'&&(target.market==='global'||(p.currency&&p.currency!=='KRW'))){
      p=await resolveDomesticPrice(p,original,html||'',async candidate=>{
        const page=await publicPage(candidate,fetchImpl,deadline);
        const parser={fruits:parseFruits,zigzag:parseZigzag,naver:parseNaver,poca:parsePoca,musinsa:parseMusinsa}[candidate.platformId];
        if(!parser)throw new PlatformError('DOMESTIC_UNAVAILABLE','尚無此韓國版的商品解析器。');
        return parser(page.html,page.target.url);
      });
    }
    return {...withPlatformFee(p),...(linkResolution?{linkResolution}:{}),originalUrl:original.url,priceSourceUrl:p.currency==='KRW'?p.url:null,fetchedAt:new Date().toISOString(),fromCache:false};
  }catch(e){
    const known=e instanceof PlatformError||e instanceof QuoteError;
    const notice=known?e.message:/Abort|Timeout/.test(e.name||'')?'平台載入逾時，這次未取得完整報價。請稍後重試或到 LINE 確認。':'暫時無法連接這個平台，請稍後重試或到 LINE 詢問。';
    return confirmation(target,notice,known?e.code:'UPSTREAM_UNAVAILABLE',{originalUrl:original.url,checkedAt:new Date().toISOString(),...(direct?{domesticResolution:{status:'unavailable',method:direct.method,inputUrl:original.url,domesticUrl:target.url,reason:'DOMESTIC_FETCH_FAILED'}}:{})});
  }
}
export async function fetchProduct(input,fetchImpl=fetch){
  const target=normalize(input),cached=cache.get(target.url),ttl=cached?.product?.status==='quoted'?60000:15000;
  if(cached&&Date.now()-cached.at<ttl)return {...cached.product,fromCache:true};
  if(pending.has(target.url))return pending.get(target.url);
  if(pending.size>=15)throw new PlatformError('BUSY','目前查詢較多，請稍後再試。');
  const work=lookup(target.url,fetchImpl);pending.set(target.url,work);
  try{const product=await work;cache.set(target.url,{at:Date.now(),product});if(cache.size>300)cache.delete(cache.keys().next().value);return product;}finally{pending.delete(target.url);}
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
    const rate=await getRate();
    const calculated=quoteForProduct(product,rate.exchangeRate);
    const quote=calculated?{...calculated,rateCheckedAt:rate.checkedAt}:null;
    return res.status(200).json({ok:true,status:quote?(quote.shippingExcluded||quote.platformFeeExcluded?'estimated':'quoted'):'needs_confirmation',product,quote,rate,version:APP_VERSION});
  }catch(e){return res.status(e instanceof RateError?503:e instanceof PlatformError?422:502).json({ok:false,error:e instanceof PlatformError||e instanceof RateError?e.message:'本次沒有取得報價，請稍後再試。',code:e.code||'LOOKUP_ERROR',version:APP_VERSION});}
}
