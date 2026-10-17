/** Bunjang public product adapter. Downloads data, never executes remote code.
 * A new endpoint is adopted only after the requested product passes validation.
 */
import {normalize, PlatformError, safeImage} from './platforms.mjs';
import {parseReader, QuoteError} from './quote.mjs';

const API_ORIGIN='https://api.bunjang.co.kr';
const DEFAULT_PATH='/api/pms/v1/products/{id}/detail/web';
const DOMESTIC_HOSTS=new Set(['m.bunjang.co.kr','www.bunjang.co.kr','bunjang.co.kr']);
const states=new WeakMap();
const fail=(code,message)=>{throw new PlatformError(code,message);};
const terminal=new Set(['PRODUCT_MISMATCH','UNAVAILABLE_PRODUCT','ACCESS_RESTRICTED','CURRENCY_MISMATCH','SHIPPING_AMBIGUOUS','SHIPPING_RESTRICTED','PRICE_CONFLICT','REDIRECT_CONFIRMATION','REDIRECT_LIMIT']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function won(v,zero=false){
  if(!['number','string'].includes(typeof v)||!/^\d+$/.test(String(v)))return null;
  const n=Number(v);return Number.isSafeInteger(n)&&n>=(zero?0:1)&&n<=1e9?n:null;
}
function targetFor(input){
  const t=normalize(typeof input==='string'?input:input.url);
  if(t.platformId!=='bunjang'||t.market!=='kr')fail('UNSUPPORTED_SITE','請提供 Bunjang 韓國站商品連結。');
  return t;
}
function attributes(tag){
  const out={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))out[m[1].toLowerCase()]=(m[2]??m[3]??m[4]).replace(/&amp;/g,'&');return out;
}
function officialPageUrl(value,base){
  let u;try{u=new URL(value,base);}catch{fail('REDIRECT_CONFIRMATION','無法確認商品連結的轉址目的地。');}
  if(!['https:','http:'].includes(u.protocol)||!DOMESTIC_HOSTS.has(u.hostname)||u.username||u.password||u.port)fail('REDIRECT_CONFIRMATION','商品連結轉到未確認的網站，請提供原平台的商品頁。');
  u.protocol='https:';return u.href;
}
async function textResponse(r,limit){
  if(Number(r.headers.get('content-length'))>limit){await r.body?.cancel();fail('PAGE_TOO_LARGE','商品資料超出可驗證的範圍。');}
  if(!r.body)return '';
  const reader=r.body.getReader(),parts=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail('PAGE_TOO_LARGE','商品資料超出可驗證的範圍。');}parts.push(value);}
  return Buffer.concat(parts.map(p=>Buffer.from(p))).toString('utf8');
}
async function request(url,fetchImpl,deadline,{timeout=8000,limit=500000,headers={}}={}){
  const remaining=deadline-Date.now();if(remaining<=0)fail('UPSTREAM_UNAVAILABLE','平台載入逾時，請稍後再試。');
  const r=await fetchImpl(url,{headers:{Accept:'application/json,text/html','Accept-Language':'ko-KR,ko;q=0.9',...headers},credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(Math.max(1,Math.min(timeout,remaining)))});
  return {status:r.status,location:r.headers.get('location'),body:await textResponse(r,limit)};
}
function apiFailure(data,status){
  const code=data?.error?.code??data?.code??data?.errorCode;
  if(['ERR_PRODUCT_NOT_FOUND','ERR_DELETED_PRODUCT','ERR_PRODUCT_STOP_SELLING','ERR_MERCARI_PRODUCT_CANNOT_ACCESS'].includes(code))fail('UNAVAILABLE_PRODUCT','商品已下架、停止販售或無法購買，請到 LINE 確認。');
  if(code==='ERR_NOT_HIDDEN_PRODUCT_OWNER'||[401,403].includes(status))fail('ACCESS_RESTRICTED','這件商品無法公開讀取，請到 LINE 確認。');
}
/** Parse only data.product. shopProducts, ads and seller instructions are not prices. */
export function parseBunjangApi(payload,input){
  const target=targetFor(input);
  if(target.kind!=='product')fail('INVALID_PRODUCT','尚未確認商品編號。');
  let data=payload;try{if(typeof payload==='string')data=JSON.parse(payload);}catch{fail('BUNJANG_SCHEMA_CHANGED','商品資料格式已變更，正在嘗試其他公開來源。');}
  apiFailure(data,200);
  const p=data?.data?.product;
  if(!object(p)||!['string','number'].includes(typeof p.pid)||!/^\d{5,15}$/.test(String(p.pid)))fail('BUNJANG_SCHEMA_CHANGED','商品資料欄位已變更，正在嘗試其他公開來源。');
  if(String(p.pid)!==target.id)fail('PRODUCT_MISMATCH','資料來源回傳不同商品，已停止報價。');
  if(p.isHidden===true||(typeof p.saleStatus==='string'&&p.saleStatus!=='SELLING')||won(p.qty,true)===0)fail('UNAVAILABLE_PRODUCT','商品已售出、預約、隱藏或停止販售，請到 LINE 確認。');
  if(p.saleStatus!=='SELLING'||p.isHidden!==false)fail('BUNJANG_SCHEMA_CHANGED','目前無法核對商品販售狀態，請到 LINE 確認。');
  if(p.currency!==undefined&&p.currency!=='KRW')fail('CURRENCY_MISMATCH','這不是已確認的韓元售價，已停止自動換算。');
  const priceKrw=won(p.price),title=typeof p.name==='string'?p.name.trim():'';
  if(priceKrw===null||!title||title.length>400)fail('BUNJANG_SCHEMA_CHANGED','尚未取得有效的商品名稱與售價。');
  let shippingKrw=null,shippingEvidence='';
  const trade=object(p.trade)?p.trade:{},standard=trade.shippingSpecs?.DEFAULT;
  const fee=object(standard)?won(standard.fee,true):null;
  if(trade.freeShipping===true){
    if(fee!==null&&fee!==0)fail('SHIPPING_AMBIGUOUS','商品的免運與一般宅配費標示互相衝突，請到 LINE 確認。');
    shippingKrw=0;shippingEvidence='trade.freeShipping = true';
  }else if(fee!==null){
    if(fee===0&&trade.freeShipping===false)fail('SHIPPING_AMBIGUOUS','一般宅配標示 0 元，但商品未標免運，請到 LINE 確認。');
    shippingKrw=fee;shippingEvidence='trade.shippingSpecs.DEFAULT.fee = '+fee;
  }
  // Cross-check explicit public shipping labels; never use the cheapest store pickup fee.
  const shippingLabels=(Array.isArray(p.trades)?p.trades:[]).filter(t=>/^(?:배송비|택배비)$/.test(t?.title)).flatMap(t=>Array.isArray(t.contents)?t.contents:[]).filter(t=>typeof t==='string');
  const labelValues=shippingLabels.flatMap(t=>{
    const m=t.trim().match(/^(?:일반(?:\s*택배)?\s*)?([\d,]+)\s*원$/);
    if(m)return [won(m[1].replace(/,/g,''),true)];
    return /^(?:일반(?:\s*택배)?\s*)?무료(?:\s*배송)?$/.test(t.trim())?[0]:[];
  }).filter(v=>v!==null);
  if(new Set(labelValues).size>1||shippingKrw!==null&&labelValues.some(v=>v!==shippingKrw)||trade.freeShipping===false&&labelValues.includes(0))fail('SHIPPING_AMBIGUOUS','一般宅配費的公開標示不一致，請到 LINE 確認。');
  if(shippingKrw===null&&labelValues.length){shippingKrw=labelValues[0];shippingEvidence=shippingLabels.join(' | ');}
  const restricted=/(?:반택|반값(?:택배)?|알뜰(?:택배)?)\s*만\s*(?:가능|합니다|해요)|(?:일반\s*택배)\s*(?:불가|안\s*돼|안\s*되)|직거래\s*만/.test(String(p.description??''));
  const image=String(p.imageUrl??'').replace('{cnt}','1').replace('{res}','320');
  const verifiedImage=safeImage(image)&&new URL(image).hostname==='media.bunjang.co.kr'&&new URL(image).pathname.startsWith('/product/'+target.id+'_')&&!/[{}]/.test(image)?image:null;
  return {...target,title,currency:'KRW',priceKrw,shippingKrw,shippingMethod:'韓國一般宅配',image:verifiedImage,
    status:restricted||shippingKrw===null?'needs_confirmation':'quoted',
    reasonCode:restricted?'SHIPPING_RESTRICTED':shippingKrw===null?'SHIPPING_UNKNOWN':null,
    notice:restricted?'賣家文字限制寄送方式，需確認能否使用韓國一般宅配，暫不提供完整報價。':shippingKrw===null?'已依商品售價粗估，未含未確認的韓國境內運費；正式報價請到 LINE 確認。':'按主商品標價及韓國一般宅配估算；款式、數量、平台費與庫存請到 LINE 確認。',
    extractionSource:'bunjang_public_api',sourceUpdatedAt:typeof p.updatedAt==='string'?p.updatedAt:null,
    evidence:{productId:String(p.pid),price:'data.product.price = '+priceKrw,shipping:shippingEvidence,saleStatus:p.saleStatus}};
}
/** A canonical URL must identify a product. Platform-home og:url is ignored. */
export function canonicalBunjangTarget(html,input){
  const original=targetFor(input),found=[];
  const markup=String(html).replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  const head=markup.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1]??'';
  for(const tag of head.match(/<(?:link|meta)\b[^>]*>/gi)||[]){
    const a=attributes(tag),href=a.rel?.toLowerCase()==='canonical'?a.href:a.property?.toLowerCase()==='og:url'?a.content:null;
    if(!href)continue;
    let t;try{t=targetFor(officialPageUrl(href,original.url));}catch{continue;}
    if(t.kind==='product')found.push(t);
  }
  const unique=[...new Map(found.map(t=>[t.id,t])).values()];
  if(unique.length>1||original.kind==='product'&&unique.some(t=>t.id!==original.id))fail('PRODUCT_MISMATCH','商品頁的來源編號不一致，已停止報價。');
  return unique[0]??null;
}
export async function resolveBunjangTarget(input,fetchImpl=fetch,deadline=Date.now()+48000){
  const original=targetFor(input);if(original.kind==='product')return {target:original,proof:null};
  let url=original.url;
  for(let hop=0;hop<4;hop++){
    const page=await request(url,fetchImpl,deadline,{timeout:6000});
    if([301,302,303,307,308].includes(page.status)){
      if(!page.location)fail('REDIRECT_CONFIRMATION','商品分享連結缺少轉址目的地。');
      url=officialPageUrl(page.location,url);const next=targetFor(url);
      if(next.kind==='product')return {target:next,proof:{status:'verified',method:'official_redirect',inputUrl:original.url,resolvedUrl:next.url,productId:next.id}};
      if(next.kind!=='link')fail('NOT_SINGLE_PRODUCT','這個連結沒有指向單一商品，請重新複製商品網址。');
      url=next.url;
      continue;
    }
    apiFailure(null,page.status);
    if(page.status!==200)fail('UPSTREAM_UNAVAILABLE','商品分享連結暫時無法讀取，請稍後重試。');
    const target=canonicalBunjangTarget(page.body,url);
    if(target)return {target,proof:{status:'verified',method:'official_canonical',inputUrl:original.url,resolvedUrl:target.url,productId:target.id}};
    fail('BUNJANG_LINK_UNRESOLVED','已辨識 Bunjang，但尚未能核對這種連結的商品編號，請提供完整商品頁或到 LINE 確認。');
  }
  fail('REDIRECT_LIMIT','商品分享連結轉址過多，請提供完整商品網址。');
}
/** Extract a narrowly specified URL template, without evaluating downloaded JS. */
export function discoverApiTemplates(javascript){
  const matches=String(javascript).match(/\/api\/pms\/v\d{1,3}\/products\/\$\{[\w$]+(?:\.[\w$]+)*\}\/detail\/web\b/g)||[];
  return [...new Set(matches.map(s=>s.replace(/\$\{[^}]+\}/,'{id}')))].slice(0,3);
}
function stateFor(fetchImpl){
  if(!states.has(fetchImpl))states.set(fetchImpl,{path:DEFAULT_PATH,discoveredAt:0,discovery:null,paths:[]});
  return states.get(fetchImpl);
}
async function discover(target,fetchImpl,deadline,state){
  if(state.discovery)return state.discovery;
  if(Date.now()-state.discoveredAt<300000)return state.paths;
  state.discoveredAt=Date.now();
  state.discovery=(async()=>{
    let url=target.url,page;
    for(let hop=0;hop<3;hop++){
      page=await request(url,fetchImpl,deadline,{timeout:5000});
      if(![301,302,303,307,308].includes(page.status))break;
      if(!page.location)fail('REDIRECT_CONFIRMATION','商品頁轉址缺少目的地，請到 LINE 確認。');
      url=officialPageUrl(page.location,url);const next=targetFor(url);
      if(/^\/(?:login|signup|auth)(?:\/|$)/.test(new URL(url).pathname))fail('ACCESS_RESTRICTED','商品頁需要登入，請到 LINE 確認。');
      if(next.kind==='product'&&next.id!==target.id)fail('PRODUCT_MISMATCH','平台轉址指向其他商品，已停止報價。');
    }
    apiFailure(null,page.status);
    if(page.status!==200)return [];
    canonicalBunjangTarget(page.body,target.url);
    const scripts=[];
    for(const tag of page.body.match(/<script\b[^>]*>/gi)||[]){
      const a=attributes(tag);if(!a.src)continue;
      let script;try{script=new URL(a.src,url);}catch{continue;}
      if(script.protocol==='https:'&&DOMESTIC_HOSTS.has(script.hostname)&&!script.username&&!script.password&&!script.port&&/^\/static\/js\/index[.\w-]*\.js$/.test(script.pathname)&&!script.search)scripts.push(script.href);
    }
    const paths=[];
    for(const url of [...new Set(scripts)].slice(0,2)){
      const bundle=await request(url,fetchImpl,deadline,{timeout:5000,limit:2000000,headers:{Accept:'text/javascript'}});
      if(bundle.status===200)paths.push(...discoverApiTemplates(bundle.body));
    }
    state.paths=[...new Set(paths)];return state.paths;
  })();
  try{return await state.discovery;}finally{state.discovery=null;}
}
async function fromApi(target,path,fetchImpl,deadline){
  if(!/^\/api\/pms\/v\d{1,3}\/products\/\{id\}\/detail\/web$/.test(path))fail('BUNJANG_SCHEMA_CHANGED','商品資料端點未通過驗證。');
  let url=API_ORIGIN+path.replace('{id}',target.id);
  for(let hop=0;hop<3;hop++){
    const response=await request(url,fetchImpl,deadline);
    if([301,302,303,307,308].includes(response.status)){
      if(!response.location)fail('REDIRECT_CONFIRMATION','商品資料轉址缺少目的地，請到 LINE 確認。');
      const next=new URL(response.location??'',url);
      if(DOMESTIC_HOSTS.has(next.hostname)&&/^\/(?:login|signup|auth)(?:\/|$)/.test(next.pathname))fail('ACCESS_RESTRICTED','這件商品需要登入才能確認，請到 LINE 詢問。');
      if(next.origin!==API_ORIGIN||next.username||next.password||next.search||next.hash||!new RegExp('^/api/pms/v\\d{1,3}/products/'+target.id+'/detail/web$').test(next.pathname))fail('REDIRECT_CONFIRMATION','商品資料轉址尚未通過驗證，請到 LINE 確認。');
      url=next.href;continue;
    }
    let json;try{json=JSON.parse(response.body);}catch{}
    apiFailure(json,response.status);
    if(response.status!==200){const e=new PlatformError('BUNJANG_API_UNAVAILABLE','公開商品資料目前無法取得。');e.httpStatus=response.status;throw e;}
    const product=parseBunjangApi(json,target.url);
    return {...product,apiPath:new URL(url).pathname.replace('/'+target.id+'/','/{id}/'),dataSourceUrl:url};
  }
  fail('REDIRECT_LIMIT','商品資料端點轉址過多，請稍後重試。');
}
async function fromReader(target,fetchImpl,deadline){
  const headers={Accept:'application/json','X-Respond-With':'markdown','X-Engine':'browser','X-Timeout':'18','X-No-Cache':'true'};
  if(process.env.JINA_API_KEY)headers.Authorization='Bearer '+process.env.JINA_API_KEY;
  const response=await request('https://r.jina.ai/'+target.url,fetchImpl,deadline,{timeout:23000,limit:3000000,headers});
  if(response.status!==200)fail('UPSTREAM_UNAVAILABLE','商品頁的公開讀取服務暫時無法使用。');
  const parsed=parseReader(response.body,target.url,{allowMissingShipping:true});
  return {...target,...parsed,currency:'KRW',status:parsed.shippingKrw===null?'needs_confirmation':'quoted',reasonCode:parsed.shippingKrw===null?'SHIPPING_UNKNOWN':null,
    notice:parsed.shippingKrw===null?'已依商品售價粗估，未含未確認的韓國運費；正式報價請到 LINE 確認。':'按主商品標價及一般宅配估算，款式與庫存請到 LINE 確認。',extractionSource:'bunjang_page_reader'};
}
export async function loadBunjang(input,fetchImpl=fetch,deadline=Date.now()+48000){
  const target=targetFor(input),state=stateFor(fetchImpl);
  if(target.kind!=='product')fail('INVALID_PRODUCT','尚未確認單一商品編號。');
  let product,primaryError;
  try{product=await fromApi(target,state.path,fetchImpl,deadline);state.path=product.apiPath;}catch(e){if(terminal.has(e.code))throw e;primaryError=e;}
  if(!product&&(primaryError?.code==='BUNJANG_SCHEMA_CHANGED'||[404,410].includes(primaryError?.httpStatus))){
    try{
      const candidates=await discover(target,fetchImpl,deadline,state);
      for(const path of candidates.filter(p=>p!==state.path).slice(0,2)){
        try{product=await fromApi(target,path,fetchImpl,deadline);state.path=product.apiPath;product.adaptedEndpoint=true;break;}catch(e){if(terminal.has(e.code))throw e;}
      }
    }catch(e){if(terminal.has(e.code))throw e;}
  }
  if((product&&product.shippingKrw!==null)||product?.reasonCode==='SHIPPING_RESTRICTED')return product;
  try{
    const fallback=await fromReader(target,fetchImpl,deadline);
    if(product){
      if(product.priceKrw!==fallback.priceKrw)fail('PRICE_CONFLICT','兩個公開來源的商品價格不同，請稍後重試或到 LINE 確認。');
      return {...product,shippingKrw:fallback.shippingKrw,status:fallback.status,reasonCode:fallback.reasonCode,notice:fallback.notice,
        extractionSource:fallback.shippingKrw!==null?'bunjang_api_with_page_shipping':product.extractionSource,
        evidence:{...product.evidence,shipping:fallback.evidence.shipping}};
    }
    return fallback;
  }catch(e){
    if(terminal.has(e.code))throw e;
    if(product)return product;
    if(e instanceof PlatformError||e instanceof QuoteError)throw e;
    fail('UPSTREAM_UNAVAILABLE','平台暫時無法提供可驗證的商品資料，請稍後重試或到 LINE 確認。');
  }
}
