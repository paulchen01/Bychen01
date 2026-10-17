import {platformFeeText} from './platform-fee.mjs';
import {validDomesticProof} from './domestic.mjs';
import { normalize } from './platforms.mjs';
import {quoteForProduct,verifiedCalculation,estimateFormula,estimateFee} from './estimate.mjs';
export const BRAND=Object.freeze({name:'廢廢豬韓國代購',english:'fat fat pig',lineId:'@fatfatpig_kr'});
export const CONTACT_URL='https://line.me/R/ti/p/'+encodeURIComponent(BRAND.lineId);
export function inquiryText(product,quote,{manual=false,note=''}={}){
  if(!product||!quote||!Number.isSafeInteger(quote.totalTwd)||quote.totalTwd<0)throw new Error('尚未取得有效報價。');
  if(product.domesticResolution&&!validDomesticProof(product))throw new Error('韓國版來源未通過核對，不能將此金額傳為正式估價。');
  const excluded=quote.shippingExcluded===true;
  const checked=verifiedCalculation(quote);
  if(checked.totalTwd!==quote.totalTwd)throw new Error('報價與計算規則不一致。');
  const fmt=n=>new Intl.NumberFormat('zh-TW').format(n),title=String(product.title||'自訂商品').replace(/[\r\n]+/g,' ').slice(0,240),url=product.url?normalize(product.url).url:'';
  const stamp=product.fetchedAt&&Number.isFinite(Date.parse(product.fetchedAt))?new Date(product.fetchedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'';
  return ['廢廢豬你好，我想詢問這件商品！','【'+(manual?'手動試算，待確認':excluded?'商品粗估，未含韓國運費':'網站預估報價')+'】',product.platformName?'平台：'+product.platformName:'',title,url,
    product.domesticResolution?.status==='verified'?'價格來源：同款韓國國內版原價 KRW（非美元換算）':'',
    product.domesticResolution?.status==='verified'&&product.originalUrl!==url?'客人原連結：'+normalize(product.originalUrl).url:'',
    '商品：₩'+fmt(checked.priceKrw),
    excluded?'韓國境內運費：未標示，本次未計入':'韓國境內運費：₩'+fmt(checked.shippingKrw),
    '韓國平台手續費：'+platformFeeText(quote.platformFeeKrw),
    '報價匯率：'+checked.exchangeRate+'（本日匯率，匯率會浮動）',
    quote.rateCheckedAt?'匯率確認時間：'+new Date(quote.rateCheckedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})+'（台灣）':'',
    '試算：'+estimateFormula(quote),'代購費：'+estimateFee(quote),
    '預估台幣：NT$'+fmt(checked.totalTwd)+'（'+(checked.feeType==='none'?'免代購費':'已含代購費')+(excluded?'；未含韓國運費':'')+(quote.platformFeeExcluded?'；未含尚未標示的平台手續費':'')+'）',
    excluded?'先依商品款判定代購費區間，加入實際運費後再確認總額。':'',
    stamp?(manual?'試算':'資料取得')+'時間：'+stamp+'（台灣）':'',
    String(note).trim()?'想要的款式／數量：'+String(note).trim().slice(0,240):'',
    product.discountNotice||'',
    '請幫我確認款式、庫存與正式報價，謝謝！'].filter(Boolean).join('\n');
}
export function chatUrl(message='廢廢豬你好，我想詢問韓國代購！'){return 'https://line.me/R/oaMessage/'+encodeURIComponent(BRAND.lineId)+'/?'+encodeURIComponent(String(message));}

export function pendingInquiryText(product,{note=''}={}){
  // Pending messages cannot invent a quote using a default rate.
  const t=normalize(product.url),fmt=n=>new Intl.NumberFormat('zh-TW').format(n);
  const price=Number.isSafeInteger(product.priceKrw)?'₩'+fmt(product.priceKrw):typeof product.sourcePrice==='number'&&product.currency?product.sourcePrice+' '+product.currency:'待確認';
  return ['廢廢豬你好，我想詢問這件商品！','【待人工確認，尚未產生台幣報價】','平台：'+t.platformName,String(product.title||'').replace(/[\r\n]+/g,' ').slice(0,240),t.url,'頁面商品金額：'+price,'韓國境內運費：'+(Number.isSafeInteger(product.shippingKrw)?'₩'+fmt(product.shippingKrw):'待確認'),'韓國平台手續費：'+platformFeeText(product.platformFeeKrw),product.discountNotice||'','需確認：'+String(product.notice||'售價與運費'),String(note).trim()?'想要的款式／數量：'+String(note).trim().slice(0,240):'','請幫我確認商品、庫存與正式報價，謝謝！'].filter(Boolean).join('\n');
}
