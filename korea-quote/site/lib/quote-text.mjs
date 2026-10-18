import {platformFeeText} from './platform-fee.mjs';
import {validDomesticProof} from './domestic.mjs';
import {normalize} from './platforms.mjs';
import {verifiedCalculation,estimateFormula,estimateFee} from './estimate.mjs';

const fmt=n=>new Intl.NumberFormat('zh-TW').format(n);
const singleLine=value=>String(value||'').replace(/[\r\n]+/g,' ').slice(0,240);
const noteText=note=>String(note).trim()?'報價備註：'+String(note).trim().slice(0,240):'';
const localTime=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})+'（台灣）':'';

export function quoteText(product,quote,{manual=false,note=''}={}){
  if(!product||!quote||!Number.isSafeInteger(quote.totalTwd)||quote.totalTwd<0)throw new Error('尚未取得有效報價。');
  if(product.domesticResolution&&!validDomesticProof(product))throw new Error('韓國版來源未通過核對，不能產生報價內容。');
  const checked=verifiedCalculation(quote);
  if(checked.totalTwd!==quote.totalTwd)throw new Error('報價與計算規則不一致。');
  const excluded=quote.shippingExcluded===true,url=product.url?normalize(product.url).url:'';
  const stamp=localTime(product.fetchedAt||product.checkedAt),rateStamp=localTime(quote.rateCheckedAt);
  return [
    '廢廢豬｜韓國商品報價',
    '【'+(manual?'手動試算，依輸入金額計算':excluded?'商品粗估，未含韓國運費':'網站預估報價')+'】',
    product.platformName?'平台：'+product.platformName:'',
    '商品：'+singleLine(product.title||'自訂商品'),
    url?'商品連結：'+url:'',
    product.domesticResolution?.status==='verified'?'價格來源：同款韓國國內版原價 KRW（非美元換算）':'',
    product.domesticResolution?.status==='verified'&&product.originalUrl&&product.originalUrl!==url?'原始連結：'+normalize(product.originalUrl).url:'',
    '商品金額：₩'+fmt(checked.priceKrw),
    excluded?'韓國境內運費：未標示，本次未計入':'韓國境內運費：₩'+fmt(checked.shippingKrw),
    '韓國平台手續費：'+platformFeeText(quote.platformFeeKrw),
    '計算匯率：NT$1 = ₩'+checked.exchangeRate,
    rateStamp?'匯率確認時間：'+rateStamp:'',
    '試算：'+estimateFormula(quote),
    '代購費：'+estimateFee(quote),
    '預估台幣：NT$'+fmt(checked.totalTwd)+'（'+(checked.feeType==='none'?'免代購費':'已含代購費')+(excluded?'；未含韓國運費':'')+(quote.platformFeeExcluded?'；未含尚未標示的平台手續費':'')+'）',
    excluded?'先依商品款判定代購費區間，加入實際運費後需重新試算。':'',
    '國際運費：另計，未包含於本次預估。',
    stamp?(manual?'試算':'資料取得')+'時間：'+stamp:'',
    noteText(note),
    product.discountNotice||'',
    '本報價為預估金額，商品選項、售價及費用以原商品頁與結帳頁為準。'
  ].filter(Boolean).join('\n');
}

export function pendingProductText(product,{note=''}={}){
  // Incomplete source data never creates a TWD total or an inferred KRW price.
  const target=normalize(product.url);
  const price=Number.isSafeInteger(product.priceKrw)?'₩'+fmt(product.priceKrw):typeof product.sourcePrice==='number'&&product.currency?product.sourcePrice+' '+product.currency:'待確認';
  return [
    '廢廢豬｜商品資訊',
    '【資料待確認，尚未產生台幣報價】',
    '平台：'+target.platformName,
    '商品：'+singleLine(product.title||target.platformName+' 商品'),
    '商品連結：'+target.url,
    '頁面商品金額：'+price,
    '韓國境內運費：'+(Number.isSafeInteger(product.shippingKrw)?'₩'+fmt(product.shippingKrw):'待確認'),
    '韓國平台手續費：'+platformFeeText(product.platformFeeKrw),
    product.discountNotice||'',
    '待確認資料：'+String(product.notice||'韓幣售價與運費'),
    noteText(note),
    '確認原商品韓幣售價後，可重新查詢或使用手動試算。'
  ].filter(Boolean).join('\n');
}
