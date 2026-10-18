/** Deterministic public-page adapters. Seller text is data, never instructions or executable code. */
import {parsePlatformFee} from './platform-fee.mjs';
import {normalize,confirmation,safeImage,PlatformError} from './platforms.mjs';
export function decode(s){return String(s??'').replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#(?:x[\da-f]+|\d+);/gi,m=>{
  const named={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '};
  if(named[m.toLowerCase()])return named[m.toLowerCase()];
  const n=m.toLowerCase().startsWith('&#x')?parseInt(m.slice(3,-1),16):parseInt(m.slice(2,-1),10);
  return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
});}
export function plain(s){return decode(String(s??'').replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi,'').replace(/<br\s*\/?>|<\/(?:p|div)>/gi,'\n').replace(/<[^>]*>/g,''));}
const clean=s=>plain(s).replace(/[\u0000-\u0008\u000b-\u001f]/g,'').trim();
function attrs(tag){const a={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))a[m[1].toLowerCase()]=decode(m[2]??m[3]);return a;}
export function metadata(html){const o={};for(const m of String(html).matchAll(/<meta\b[^>]*>/gi)){const a=attrs(m[0]),k=a.property||a.name;if(k&&a.content&&!Object.hasOwn(o,k))o[k]=a.content;}return o;}
export function scriptJSON(html,id){for(const m of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){const a=attrs(m[1]);if(a.id===id){try{return JSON.parse(m[2]);}catch{return null;}}}return null;}
function productsLD(html){const found=[];function visit(v){if(!v||typeof v!=='object')return;if(Array.isArray(v))return v.forEach(visit);if([v['@type']].flat().some(t=>t==='Product'))found.push(v);if(v['@graph'])visit(v['@graph']);}
  for(const m of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi))if(attrs(m[1]).type==='application/ld+json'){try{visit(JSON.parse(m[2]));}catch{}}
  return found;
}
const arr=v=>Array.isArray(v)?v:v?[v]:[];
function amount(v,zero=false){if(v===null||v===undefined||typeof v==='boolean')return null;const s=String(v).replace(/,/g,'').trim();if(!/^\d+$/.test(s))return null;const n=Number(s);return Number.isSafeInteger(n)&&n>=(zero?0:1)&&n<=1e9?n:null;}
const one=vals=>{const u=[...new Set(vals.filter(v=>v!==null))];return u.length===1?u[0]:null;};
function sameUrl(v,t){try{return normalize(new URL(typeof v==='object'?v['@id']||v.url:v,t.url).href).key===t.key;}catch{return false;}}
function mainLD(html,t){const products=productsLD(html).filter(p=>[p.url,p.mainEntityOfPage,...arr(p.offers).map(o=>o.url)].filter(Boolean).some(u=>sameUrl(u,t)));return products.length===1?products[0]:null;}
function base(t,fields={}){return {...t,title:t.platformName+' 商品',currency:null,priceKrw:null,shippingKrw:null,image:null,warnings:[],...fields};}
function pending(p,msg,code='NEEDS_CONFIRMATION'){return confirmation(p,msg,code,p);}
function ready(p){if(p.currency!=='KRW')return pending(p,'目前未取得可核對的韓幣售價，暫不產生台幣報價。請核對原始韓幣售價與運費後使用手動試算。','CURRENCY_NOT_KRW');if(amount(p.priceKrw)===null)return pending(p,'商品售價尚未確認。請稍後重試，或核對原商品頁的韓幣售價後使用手動試算。','PRICE_UNKNOWN');if(amount(p.shippingKrw,true)===null)return pending(p,'已依商品售價粗估，未含尚未確認的韓國境內運費；請核對原商品頁的運費後補入手動試算。','SHIPPING_UNKNOWN');return {...p,status:'quoted',notice:p.warnings.join(' '),reasonCode:null};}
function shipLD(offers){const values=[];for(const o of offers)for(const detail of arr(o.shippingDetails)){
  const countries=arr(detail.shippingDestination).flatMap(d=>arr(d.addressCountry));
  if(!countries.some(c=>['KR','KOR','South Korea','대한민국'].includes(c)))continue;
  if(detail.shippingConditions||detail.doesNotShip||detail.shippingLabel||detail.shippingRate?.minValue!==undefined||detail.shippingRate?.maxValue!==undefined)continue;
  const rate=detail.shippingRate;if(rate?.currency==='KRW')values.push(amount(rate.value,true));
}return one(values);}
/** Explicit unconditional domestic charge in the MAIN product description only. */
export function descriptionShipping(text){
  const lines=clean(text).split(/\n|[;；]/).map(x=>x.trim()).filter(Boolean),values=[];
  for(const line of lines){
    if(/이상|미만|이하|부터|조건|구매\s*시|구매시|제주|도서|산간|해외|착불|반값|반택|GS|CU|무료배송\s*(?:불가|아님)/i.test(line))continue;
    const m=line.match(/^(?:[✔✓*•·-]\s*)?(?:국내\s*)?(?:일반\s*택배(?:비)?|택배비|배송비|일반\s*배송비)\s*[:：+]?\s*([\d,]+)\s*원\s*(?:추가|별도|입니다|이에요|\.|!)?$/);
    if(m)values.push(amount(m[1],true));
    else if(/^(?:[✔✓*•·-]\s*)?(?:국내\s*)?(?:무료\s*배송|배송비\s*무료|택배비\s*포함|배송비\s*포함)\s*[.!]?$/.test(line))values.push(0);
  }
  return one(values);
}
export function parseFruits(html,input){
  const t=normalize(input),meta=metadata(html),ld=mainLD(html,t);let p=base(t);
  if(!ld)return pending(p,'這個 FruitsFamily 頁面未提供可核對的主商品資料。請稍後重試，或核對原商品頁後使用手動試算。','PRODUCT_NOT_FOUND');
  p={...p,title:clean(ld.name).slice(0,300),image:arr(ld.image).find(safeImage)||null};
  const offers=arr(ld.offers);if(!offers.length||offers.some(o=>o['@type']==='AggregateOffer'))return pending(p,'同一頁包含多種售價，請先確認款式。','PRICE_AMBIGUOUS');
  const currencies=[...new Set(offers.map(o=>o.priceCurrency))];p.currency=currencies.length===1?currencies[0]:null;
  p.sourcePrice=one(offers.map(o=>{const n=Number(o.price);return Number.isFinite(n)&&n>=0?n:null;}));
  if(p.currency==='KRW')p.priceKrw=one(offers.map(o=>amount(o.price)));
  const state=scriptJSON(html,'__APOLLO_STATE__'),expected=parseInt(t.id,36);
  if(state){const root=state.ROOT_QUERY?.['seeProductResponse({"id":'+expected+'})'],main=state[root?.seeProduct?.__ref];
    if(!main||String(main.id)!==String(expected)||String(ld.sku)!==String(expected))return pending(p,'頁面商品編號無法一致核對，已停止計算。','PRODUCT_MISMATCH');
    if(main.status!=='selling'||main.is_visible===false)return pending(p,'商品不是可確認的販售中狀態，請先確認庫存。','UNAVAILABLE_PRODUCT');
    if(amount(main.price)!==p.priceKrw)return pending(p,'頁面中的售價不一致，請先確認最新價格。','PRICE_AMBIGUOUS');
  }
  if(offers.some(o=>o.availability&&!/\/(?:InStock|PreOrder)$/.test(o.availability)))return pending(p,'商品可能已售出或暫停販售，請先確認庫存。','UNAVAILABLE_PRODUCT');
  Object.assign(p,parsePlatformFee(ld.description));
  p.shippingKrw=shipLD(offers)??descriptionShipping(ld.description);
  p.evidence={price:'主商品 JSON-LD Offer.price：'+p.sourcePrice+' '+p.currency,shipping:p.shippingKrw===null?'主商品未提供明確境內運費':'主商品運費欄位或明確說明'};
  p.warnings=['以頁面主商品標價估算；款式、平台另收費用及庫存以原商品頁和結帳頁資訊為準。'];
  return ready(p);
}
export function parseZigzag(html,input){
  const t=normalize(input),state=scriptJSON(html,'__NEXT_DATA__');let p=base(t);
  const queries=state?.props?.pageProps?.dehydratedState?.queries;
  const matching=Array.isArray(queries)?queries.filter(q=>q.queryKey?.[0]==='getPdpBaseInfo'&&String(q.queryKey[1])===t.id):[];
  if(matching.length!==1)return pending(p,'Zigzag 主商品資料尚未讀取完成，請稍後重試，或核對原商品頁的一般售價後使用手動試算。','PRODUCT_NOT_FOUND');
  const data=matching[0].state?.data,product=data?.product;
  if(!product||String(product.id)!==t.id||!sameUrl(product.product_url,t))return pending(p,'Zigzag 商品編號未通過核對。','PRODUCT_MISMATCH');
  p={...p,title:clean((data.shop?.name?data.shop.name+' ':'')+product.name).slice(0,300),image:product.product_image_list?.map(x=>x.url||x.pdp_static_image_url).find(safeImage)||null};
  const shown=product.product_price?.display_final_price;
  const normal=shown?.final_price,currency=normal?.price_with_currency?.display_currency;
  p.currency=currency==='원'||currency==='원~'?'KRW':typeof currency==='string'&&currency.trim()?'FOREIGN':null;
  p.sourcePrice=normal?.price!=null&&Number.isFinite(Number(normal.price))?Number(normal.price):null;
  p.priceKrw=p.currency==='KRW'?amount(normal?.price):null;
  if(!product.is_purchasable||product.sales_status!=='ON_SALE'||product.display_status!=='VISIBLE')return pending(p,'Zigzag 商品目前未確認可購買，請先確認款式與庫存。','UNAVAILABLE_PRODUCT');
  if(currency?.includes('~'))return pending(p,'頁面標示為起價；請在原商品頁選定規格並核對售價後使用手動試算。','STARTING_PRICE');
  const ship=product.shipping_fee;
  if(ship?.fee_type==='FREE'&&ship.base_fee===0)p.shippingKrw=0;
  else if(ship?.fee_type==='CHARGED'&&ship.minimum_free_shipping_fee==null)p.shippingKrw=amount(ship.base_fee,true);
  // Known conditional threshold requires explicit amount, not a marketing free-shipping string.
  else if(['CONDITIONAL_FREE','CONDITIONAL_FREE_SHIPPING','CHARGED'].includes(ship?.fee_type)&&amount(ship.minimum_free_shipping_fee)!==null&&p.priceKrw!==null)p.shippingKrw=p.priceKrw>=ship.minimum_free_shipping_fee?0:amount(ship.base_fee,true);
  p.warnings=['按一般顯示售價估算，不含首購券、會員券或信用卡優惠；加價選項與庫存請依原商品頁核對。'];
  p.evidence={price:'getPdpBaseInfo['+t.id+'].product_price.display_final_price.final_price',shipping:ship?'shipping_fee：'+ship.fee_type+'，base_fee='+ship.base_fee:'未標示'};
  return ready(p);
}
export function parseNaver(html,input){
  const t=normalize(input);let p=base(t);const ld=mainLD(html,t);
  if(!ld)return pending(p,'已辨識 Naver 商店，但未取得可核對的商品售價與運費；可能需要登入或頁面未公開。請核對原商品頁的韓幣售價與運費後使用手動試算。','PUBLIC_DATA_UNAVAILABLE');
  p={...p,title:clean(ld.name).slice(0,300),image:arr(ld.image).find(safeImage)||null};
  const offers=arr(ld.offers);
  if(offers.length!==1||offers[0]['@type']==='AggregateOffer')return pending(p,'這個 Naver 頁面有多種／比價價格，請指定賣家與商品規格。','PRICE_AMBIGUOUS');
  const o=offers[0];p.currency=o.priceCurrency;p.sourcePrice=Number.isFinite(Number(o.price))?Number(o.price):null;p.priceKrw=p.currency==='KRW'?amount(o.price):null;
  if(o.availability&&!/\/InStock$/.test(o.availability))return pending(p,'商品販售狀態尚待確認。','UNAVAILABLE_PRODUCT');
  p.shippingKrw=shipLD(offers);p.warnings=['Naver 優惠券、會員優惠與商品選項，以實際下單條件為準。'];
  return ready(p);
}
export function parsePoca(html,input){
  const t=normalize(input),meta=metadata(html),ld=mainLD(html,t);let p=base(t);
  const canonical=[...String(html).matchAll(/<link\b[^>]*>/gi)].map(m=>attrs(m[0])).find(a=>a.rel==='canonical')?.href;
  if(ld){p.title=clean(ld.name).slice(0,300);p.image=arr(ld.image).find(safeImage)||null;const offers=arr(ld.offers);if(offers.length===1){p.currency=offers[0].priceCurrency||null;p.sourcePrice=Number.isFinite(Number(offers[0].price))?Number(offers[0].price):null;p.priceKrw=p.currency==='KRW'?amount(offers[0].price):null;}}
  else if(sameUrl(meta['og:url']||canonical,t)){p.title=clean(meta['og:title']||p.title).slice(0,300);p.image=safeImage(meta['og:image'])?meta['og:image']:null;}
  if(/Log in to see price|로그인.{0,15}가격/i.test(plain(html)))return pending(p,'已讀到小卡商品，但頁面要求登入後才能查看售價。請在原商品頁確認原始韓幣售價與運費後，使用手動試算。','PRICE_REQUIRES_LOGIN');
  if(t.market==='kr'&&ld){
    const offers=arr(ld.offers);
    if(offers.length!==1||offers[0]['@type']==='AggregateOffer')return pending(p,'韓國版有多種商品價格，請先確認規格。','PRICE_AMBIGUOUS');
    if(offers[0].availability&&!/\/(?:InStock|PreOrder)$/.test(offers[0].availability))return pending(p,'韓國版商品目前不在可確認的販售狀態。','UNAVAILABLE_PRODUCT');
    Object.assign(p,parsePlatformFee(ld.description));
  p.shippingKrw=shipLD(offers)??descriptionShipping(ld.description);
    p.evidence={price:'韓國版主商品 Offer.price / priceCurrency',shipping:p.shippingKrw===null?'未標示':'韓國版主商品運費'};
    return ready(p);
  }
  // Global Pocamarket lists amounts in USD and storage/shipping charges separately.
  // No inference from a global homepage shipping promotion or a USD amount to KRW.
  return pending(p,'已辨識 Pocamarket 小卡市集，但原始韓幣售價或韓國境內運費尚未確認。請核對同卡韓國商品頁後使用手動試算。','CURRENCY_OR_SHIPPING_UNCONFIRMED');
}
export function parseXEmbed(payload,input){
  const t=normalize(input);let p=base(t,{title:'X／Twitter 公開貼文'});let data=payload;
  if(typeof data==='string'){try{data=JSON.parse(data);}catch{return pending(p,'公開貼文目前無法讀取，請稍後重試，或核對原貼文的韓幣售價與運費後使用手動試算。','PUBLIC_DATA_UNAVAILABLE');}}
  if(!data?.html||!data.url||!sameUrl(data.url,t))return pending(p,'無法核對這則公開貼文，請貼上原平台的完整貼文網址。','PRODUCT_MISMATCH');
  const match=data.html.match(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/i),text=match?.[1].match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  if(!text)return pending(p,'沒有取得可解析的公開貼文內容。','PUBLIC_DATA_UNAVAILABLE');
  const content=clean(text);p.title=content.split('\n').find(Boolean)?.slice(0,160)||p.title;p.postExcerpt=content.slice(0,700);
  // Quote only a single, explicitly labelled KRW selling price plus an explicit
  // unconditional shipping line. Never use image text, WTB budgets or shorthand decimals.
  if(!/구해요|삽니다|매입|구매글|판매\s*완료|양도\s*완료|거래\s*완료/.test(content)){
    const matches=[...content.matchAll(/(?:^|\n)\s*(?:판매가|양도가|판매\s*가격)\s*[:：]?\s*([\d,]+)\s*원\s*(?:\n|$)/g)];
    const shipping=descriptionShipping(content),price=matches.length===1?amount(matches[0][1]):null;
    const amounts=[...content.matchAll(/([\d,]+)\s*원/g)].map(m=>amount(m[1],true));
    if(price!==null&&amounts.every(n=>n===price||n===shipping))return ready({...p,currency:'KRW',priceKrw:price,shippingKrw:shipping,warnings:['依公開貼文中明確標示的單一售價及運費估算；需確認貼文是否仍有效。']});
  }
  // A post is not a structured product listing. Even explicit numbers can denote
  // multiple cards, a want-to-buy budget or deposits. Retain source, request confirmation.
  return pending(p,'已讀取公開貼文，但未確認單一商品的韓幣售價與運費；多款商品、收購價或圖片價無法直接報價。請核對原貼文後使用手動試算。','SOCIAL_POST_CONFIRMATION');
}
