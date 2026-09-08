/** Shared server/browser fee policy. Uses merchandise + Korean domestic shipping.
 * A single tier applies to the whole subtotal, not progressive brackets.
 * Round only the final TWD amount upwards using integer arithmetic.
 */
export const PRICING_VERSION = '2026-09-08.4';
export const EXCHANGE_RATE = 38;
export const FEE_BASIS = 'subtotalKrw';
export const FEE_TIERS = Object.freeze([
  Object.freeze({id:'fixed50',min:1,max:20000,type:'fixed',percent:null,fixedTwd:50,range:'₩20,000 以下（含）',label:'固定 NT$50'}),
  Object.freeze({id:'percent8',min:20001,max:79999,type:'percent',percent:8,fixedTwd:0,range:'₩20,001～79,999',label:'換算台幣後加 8%'}),
  Object.freeze({id:'percent5',min:80000,max:149999,type:'percent',percent:5,fixedTwd:0,range:'₩80,000～149,999',label:'換算台幣後加 5%'}),
  Object.freeze({id:'percent3',min:150000,max:199999,type:'percent',percent:3,fixedTwd:0,range:'₩150,000～199,999',label:'換算台幣後加 3%'}),
  Object.freeze({id:'free',min:200000,max:Infinity,type:'none',percent:0,fixedTwd:0,range:'₩200,000 以上（含）',label:'免代購費'})
]);
function invalid(code,message){const e=new Error(message);e.name='QuoteError';e.code=code;throw e;}
function amount(value,zero=false){
  if(!['string','number'].includes(typeof value))invalid('INVALID_AMOUNT','請填寫有效的商品金額與韓國運費；免運請明確填 0。');
  const s=String(value).trim().replace(/[,₩원\s]/g,'');
  if(!/^\d+$/.test(s))invalid('INVALID_AMOUNT','韓幣金額請填寫非負整數。');
  const n=Number(s);
  if(!Number.isSafeInteger(n)||n<(zero?0:1)||n>1000000000)invalid('INVALID_AMOUNT','請填寫有效的商品金額與韓國運費；免運請明確填 0。');
  return n;
}
export function calculate(price,shipping){
  const p=amount(price),s=amount(shipping,true),sum=p+s;
  const tier=FEE_TIERS.find(t=>sum>=t.min&&sum<=t.max);
  if(!tier)invalid('INVALID_AMOUNT','無法確認代購費區間。');
  const percent=tier.percent||0,denominator=BigInt(EXCHANGE_RATE)*100n;
  const numerator=BigInt(sum)*BigInt(100+percent)+BigInt(tier.fixedTwd)*denominator;
  const base=sum/EXCHANGE_RATE;
  return {priceKrw:p,shippingKrw:s,subtotalKrw:sum,exchangeRate:EXCHANGE_RATE,pricingVersion:PRICING_VERSION,feeBasis:FEE_BASIS,tierId:tier.id,tierRange:tier.range,feeType:tier.type,servicePercent:tier.percent,fixedFeeTwd:tier.fixedTwd,serviceLabel:tier.label,baseTwd:base,serviceTwd:tier.type==='fixed'?tier.fixedTwd:base*percent/100,totalTwd:Number((numerator+denominator-1n)/denominator)};
}
export function formulaText(quote,{grouped=false}={}){
  const q=calculate(quote.priceKrw,quote.shippingKrw),fmt=n=>grouped?new Intl.NumberFormat('zh-TW').format(n):String(n);
  const base='（'+fmt(q.priceKrw)+'＋'+fmt(q.shippingKrw)+'）÷'+q.exchangeRate;
  if(q.feeType==='fixed')return base+'＋'+q.fixedFeeTwd;
  if(q.feeType==='percent')return base+'×'+((100+q.servicePercent)/100).toFixed(2);
  return base;
}
export function feeDescription(quote){const q=calculate(quote.priceKrw,quote.shippingKrw);return q.feeType==='fixed'?'固定代購費 NT$'+q.fixedFeeTwd:q.feeType==='none'?'免代購費':q.servicePercent+'% 代購費';}
