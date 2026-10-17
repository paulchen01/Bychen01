/** Resolve actual Korean storefront prices; this module deliberately has NO FX conversion.
 * Only first-party product IDs or official head-level Korean alternate links are used.
 * A Korean-language page, a changed currency symbol, or a matching title is not proof.
 */
import {normalize,confirmation,PlatformError} from './platforms.mjs';
import {decode} from './extract.mjs';
export const DOMESTIC_POLICY='verified-korean-listing-v1';
const asTarget=v=>typeof v==='string'?normalize(v):v;
const sameId=(a,b)=>a.platformId===b.platformId&&a.kind==='product'&&b.kind==='product'&&!!a.id&&a.id===b.id;
const validAmount=n=>Number.isSafeInteger(n)&&n>0&&n<=1e9;
export function directDomesticTarget(input){
  const t=asTarget(input);
  if(t.platformId==='bunjang'&&t.market==='global'&&t.kind==='product'){
    return {target:normalize('https://m.bunjang.co.kr/products/'+t.id),method:'bunjang_same_product_id'};
  }
  return null;
}
function attributes(tag){const out={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))out[m[1].toLowerCase()]=decode(m[2]??m[3]);return out;}
export function koreanCandidates(html,input){
  const source=asTarget(input),candidates=new Map();
  // Only official metadata in <head>, never a seller's description or an unrelated anchor.
  const head=String(html).match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]||'';
  const clean=head.replace(/<!--[^]*?-->|<script\b[^>]*>[^]*?<\/script>/gi,'');
  for(const m of clean.matchAll(/<link\b[^>]*>/gi)){
    const a=attributes(m[0]);
    if(!a.rel?.split(/\s+/).includes('alternate')||!/^ko(?:[-_]kr)?$/i.test(a.hreflang||'')||!a.href)continue;
    try{
      const t=normalize(new URL(a.href,source.url).href);
      if(t.market!=='kr'||!sameId(source,t)||t.url===source.url)continue;
      // Reject a Korean label that still explicitly selects a foreign currency.
      const currency=new URL(t.url).searchParams.get('currency');if(currency&&currency.toUpperCase()!=='KRW')continue;
      candidates.set(t.url,{target:t,method:'official_korean_alternate'});
    }catch{/* off-platform hosts, executable URLs, private addresses and bad IDs are ignored */}
  }
  // Existing Korean storefronts can expose foreign display preferences on the same listing.
  // Removing only those preferences is a CANDIDATE, not evidence of a Korean price.
  if(source.market==='kr'&&['fruits','zigzag','naver','bunjang'].includes(source.platformId)){
    const u=new URL(source.url);let changed=false;
    for(const k of ['currency','lang','locale'])if(u.searchParams.has(k)){u.searchParams.delete(k);changed=true;}
    if(changed){const t=normalize(u.href);if(sameId(source,t)&&!candidates.has(t.url))candidates.set(t.url,{target:t,method:'korean_canonical_recheck'});}
  }
  if(candidates.size>1)throw new PlatformError('DOMESTIC_AMBIGUOUS','國內版出現多個不同商品入口，暫不選取其中一個價格。');
  return [...candidates.values()];
}
function unresolved(source,p,reason,domesticUrl=null){
  const localEntry=source.platformId==='poca'?'https://phocamarket.com/':null;
  const text=source.platformId==='poca'
    ?'已辨識國際版，已檢查韓國版對應資訊，但未取得同款商品的公開韓幣售價。韓國站不是把 .com 網域替換就能對應；此筆不使用美金換算價，請由廢廢豬確認韓國採購價。'
    :'已檢查韓國版，但尚未取得同一商品的有效韓幣售價；不使用國際版金額或換匯推算值報價。';
  return confirmation(source,text,'DOMESTIC_PRICE_UNAVAILABLE',{
    ...p,originalUrl:source.url,priceKrw:null,shippingKrw:null,priceSourceUrl:null,
    domesticResolution:{policy:DOMESTIC_POLICY,status:'unavailable',inputUrl:source.url,domesticUrl,reason,fxConversionUsed:false},
    ...(localEntry?{koreanSiteUrl:localEntry}:{})
  });
}
export function validateDomesticProduct(product,input,candidate,method){
  const source=asTarget(input),target=asTarget(candidate);let actual;
  try{actual=normalize(product.url);}catch{return unresolved(source,null,'INVALID_DOMESTIC_SOURCE',target.url);}
  if(!sameId(source,target)||target.market!=='kr'||actual.key!==target.key||actual.url!==target.url||product.id!==target.id){
    return unresolved(source,null,'PRODUCT_MISMATCH',target.url);
  }
  if(product.currency!=='KRW'||!validAmount(product.priceKrw))return unresolved(source,null,product.reasonCode||'NO_KRW_OFFER',target.url);
  const proof={policy:DOMESTIC_POLICY,status:'verified',method,inputUrl:source.url,domesticUrl:target.url,
    productId:target.id,currency:'KRW',rawPriceKrw:product.priceKrw,fxConversionUsed:false};
  return {...product,originalUrl:source.url,priceSourceUrl:target.url,domesticResolution:proof};
}
export function validDomesticProof(p){
  const proof=p?.domesticResolution;if(!proof)return true;
  if(proof.policy!==DOMESTIC_POLICY||proof.status!=='verified'||proof.fxConversionUsed!==false||proof.currency!=='KRW'||p.currency!=='KRW'||proof.rawPriceKrw!==p.priceKrw||!validAmount(p.priceKrw))return false;
  try{
    const source=normalize(proof.inputUrl),target=normalize(proof.domesticUrl),actual=normalize(p.url);
    if(!sameId(source,target)||target.market!=='kr'||actual.url!==target.url||p.id!==target.id||proof.productId!==target.id||p.priceSourceUrl!==target.url)return false;
    if(proof.method==='bunjang_same_product_id')return source.platformId==='bunjang'&&source.market==='global'&&directDomesticTarget(source)?.target.url===target.url;
    if(proof.method==='korean_canonical_recheck')return koreanCandidates('',source).some(c=>c.target.url===target.url);
    return proof.method==='official_korean_alternate';
  }catch{return false;}
}
export async function resolveDomesticPrice(product,input,html,load){
  const source=asTarget(input);let candidates;
  try{candidates=koreanCandidates(html,source);}catch(e){return unresolved(source,product,e.code);}
  if(!candidates.length)return unresolved(source,product,'NO_VERIFIED_KOREAN_LINK');
  const {target,method}=candidates[0];
  try{return validateDomesticProduct(await load(target),source,target,method);}
  catch(e){return unresolved(source,product,e.code||'DOMESTIC_FETCH_FAILED',target.url);}
}
