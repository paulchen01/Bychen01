/** Estimate known merchandise even when domestic shipping is unpublished.
 * null remains unknown; only the calculation basis omits it. Fee policy is unchanged.
 */
import {calculate,formulaText,feeDescription,EXCHANGE_RATE,rateUnits} from './pricing.mjs';
import {validDomesticProof} from './domestic.mjs';
export function estimateFromAmounts(price,shipping,platformFee=null,exchangeRate=EXCHANGE_RATE){
  const excluded=shipping===null||shipping===undefined||(typeof shipping==='string'&&!shipping.trim());
  const q=calculate(price,excluded?0:shipping,exchangeRate);
  const feeExcluded=platformFee===null||platformFee===undefined||platformFee==='';
  let f=0;
  if(!feeExcluded){
    if(!['string','number'].includes(typeof platformFee)||!/^\d+$/.test(String(platformFee).trim().replace(/,/g,'')))throw Error('平台手續費必須為非負韓幣整數。');
    f=Number(String(platformFee).replace(/,/g,''));if(!Number.isSafeInteger(f)||f<0||f>1e9)throw Error('平台手續費金額無效。');
  }
  const den=rateUnits(q.exchangeRate);
  const num=BigInt(q.subtotalKrw)*BigInt(100+(q.servicePercent||0))+BigInt(q.fixedFeeTwd)*den+BigInt(f)*100n;
  return {...q,...(excluded?{shippingKrw:null,shippingExcluded:true,estimateScope:'product_only'}:{}),platformFeeKrw:feeExcluded?null:f,platformFeeExcluded:feeExcluded,platformFeeTwd:feeExcluded?null:f/q.exchangeRate,totalTwd:Number((num+den-1n)/den)};
}
export function quoteForProduct(p,exchangeRate=EXCHANGE_RATE){
  if(!p||p.currency!=='KRW'||!Number.isSafeInteger(p.priceKrw)||p.priceKrw<1||p.priceKrw>1e9)return null;
  if(p.domesticResolution&&!validDomesticProof(p))return null;
  if(p.market==='global'&&!p.domesticResolution)return null;
  if(p.status!=='quoted'&&p.reasonCode!=='SHIPPING_UNKNOWN')return null;
  if(p.shippingKrw!==null&&p.shippingKrw!==undefined&&(!Number.isSafeInteger(p.shippingKrw)||p.shippingKrw<0||p.shippingKrw>1e9))return null;
  return estimateFromAmounts(p.priceKrw,p.shippingKrw,p.platformFeeKrw,exchangeRate);
}
export function verifiedCalculation(q){
  if(q.shippingExcluded===true){
    if(q.shippingKrw!==null)throw Error('未含運費的估價資料不一致。');
    return estimateFromAmounts(q.priceKrw,null,q.platformFeeKrw,q.exchangeRate);
  }
  return estimateFromAmounts(q.priceKrw,q.shippingKrw,q.platformFeeKrw,q.exchangeRate);
}
export function estimateFormula(q,options={}){
  const base=merchandiseFormula(q,options);const f=q.platformFeeKrw;
  return Number.isSafeInteger(f)&&f>0?base+'＋'+(options.grouped?new Intl.NumberFormat('zh-TW').format(f):String(f))+'÷'+q.exchangeRate:base;
}
function merchandiseFormula(q,options={}){
  const c=verifiedCalculation(q);
  if(!q.shippingExcluded)return formulaText(c,options);
  const p=options.grouped?new Intl.NumberFormat('zh-TW').format(c.priceKrw):String(c.priceKrw);
  const base=p+'÷'+c.exchangeRate;
  if(c.feeType==='fixed')return base+'＋'+c.fixedFeeTwd;
  if(c.feeType==='percent')return base+'×'+((100+c.servicePercent)/100).toFixed(2);
  return base;
}
export function estimateFee(q){const c=verifiedCalculation(q);return feeDescription(calculate(c.priceKrw,c.shippingKrw??0,c.exchangeRate));}
