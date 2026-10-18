/** First-party retail product adapters. All amounts remain in KRW. */
import {normalize,confirmation,safeImage,PlatformError} from './platforms.mjs';
import {metadata,decode,plain,descriptionShipping} from './extract.mjs';
import {parsePlatformFee} from './platform-fee.mjs';
export const MUSINSA_NOTICE='折扣、優惠券及會員優惠可能影響售價；試算以已確認的公開售價為準。';
const amount=v=>typeof v==='string'&&/^\d[\d,]*$/.test(v.trim())&&Number.isSafeInteger(Number(v.replace(/,/g,'')))&&Number(v.replace(/,/g,''))>0&&Number(v.replace(/,/g,''))<=1e9?Number(v.replace(/,/g,'')):null;
const base=t=>({...t,title:t.platformName+' 商品',currency:null,priceKrw:null,shippingKrw:null,platformFeeKrw:null,image:null,warnings:[]});
function ready(p){return {...p,status:p.shippingKrw===null?'needs_confirmation':'quoted',reasonCode:p.shippingKrw===null?'SHIPPING_UNKNOWN':null,notice:p.warnings.join(' ')};}
function reader(raw,t){
 let d=typeof raw==='string'?JSON.parse(raw):raw;d=d?.data||d;
 if(d.url&&normalize(d.url).key!==t.key)throw new PlatformError('PRODUCT_MISMATCH','讀取結果不是同一商品。');
 return {title:decode(d.title||''),text:String(d.content||'')};
}
/** Keep a public sale discount even when the displayed best price also includes a coupon. */
function oliveYoungPublicPrice(region,displayMatch,listPrice){
 const displayedPrice=amount(displayMatch?.[1]),originalPrice=amount(listPrice?.[1]);
 const conditional=/쿠폰|회원|첫\s*구매|첫구매|카드/.test(region);
 const saleLines=region.split('\n').map(line=>line.replace(/^\s*[-*]\s*/,'').trim()).filter(line=>/^세일(?:\s|\()/.test(line));
 if(saleLines.length){
  // The benefit breakdown must provide one exact won reduction from the same product's list price.
  // Only a plain sale or its date range is a public discount; membership/payment labels are not.
  const sales=saleLines.map(line=>line.match(/^세일(?:\s*\(\d{2,4}\.\d{1,2}\.\d{1,2}\s*~\s*\d{2,4}\.\d{1,2}\.\d{1,2}\))?\s*[-−]\s*([\d,]+)\s*원\s*$/));
  if(!originalPrice||sales.some(sale=>!sale)||new Set(sales.map(sale=>sale[1].replace(/,/g,''))).size!==1)
   throw new PlatformError('PRICE_AMBIGUOUS','商品的一般折扣明細無法核對，請核對原商品頁的售價與適用折扣後使用手動試算。');
  const reduction=amount(sales[0][1]),price=originalPrice-reduction;
  if(!reduction||price<=0||!displayedPrice||displayedPrice>price||(!conditional&&displayedPrice!==price))
   throw new PlatformError('PRICE_CONFLICT','商品售價與折扣明細不一致，請核對原商品頁的最新售價後使用手動試算。');
  return {price,evidence:listPrice[0]+'；'+saleLines[0],couponExcluded:conditional};
 }
 const chosen=conditional?listPrice:displayMatch||listPrice;
 return {price:amount(chosen?.[1]),evidence:chosen?.[0],couponExcluded:conditional};
}
export function parseOliveYoungReader(raw,input){
 const t=normalize(input);if(t.kind!=='product'||t.platformId!=='oliveyoung')return confirmation(t,'請貼 Olive Young 個別商品連結。','NOT_SINGLE_PRODUCT');
 const {title,text}=reader(raw,t);let p=base(t);
 const name=title.replace(/\s*\|\s*올리브영.*$/,'').trim();
 // Require the source goodsNo, primary image and main heading; never scan navigation or recommendations.
 const image=[...text.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/g)].map(m=>m[1]).find(u=>u.includes(t.id)&&safeImage(u));
 const heading=[...text.matchAll(/^#{1,6}\s+(.+)$/gm)].find(m=>m[1].trim()===name);
 if(!name||!image||!heading)return confirmation(t,'已辨識 Olive Young；商品售價尚未讀取完成，請稍後重試，或核對原商品頁後使用手動試算。','PRODUCT_NOT_FOUND');
 let main=text.slice(heading.index).split(/\n(?:#{1,6}\s*)?상품(?:설명|\s*상세\s*정보)/)[0];
 const priceRegion=main.split(/\n(?:팝업 닫기|평점|리뷰|옵션뷰|구매수량)/)[0];
 const displayed=priceRegion.split('\n').map(s=>s.replace(/~~[^~]*~~/g,'').replace(/_\d+(?:\.\d+)?%_/g,'').trim()).find(s=>/^\d[\d,]*\s*원(?:\s|$)/.test(s));
 const displayMatch=displayed?.match(/^([\d,]+)\s*원/),listPrice=priceRegion.match(/판매가\s+([\d,]+)\s*원/);
 const chosen=oliveYoungPublicPrice(priceRegion,displayMatch,listPrice);
 p={...p,title:name,image,currency:'KRW',priceKrw:chosen.price,sourcePrice:chosen.price,couponExcluded:chosen.couponExcluded};
 if(!p.priceKrw)return confirmation(p,'已辨識商品，但沒有可核對的一般韓幣售價。','PRICE_UNKNOWN',p);
 const ship=main.match(/일반\s*배송\s*([\d,]+)\s*원(?:\s*\(\s*([\d,]+)\s*원\s*이상\s*무료배송\s*\))?/);
 if(ship){const fee=Number(ship[1].replace(/,/g,''));const threshold=ship[2]?amount(ship[2]):null;p.shippingKrw=threshold&&p.priceKrw>=threshold?0:fee;}
 else if(/일반\s*배송\s*무료/.test(main))p.shippingKrw=0;
 Object.assign(p,parsePlatformFee(main));
 p.priceIsStarting=/원\s*~/.test(displayed||'');
 p.warnings=[p.priceIsStarting?'頁面為不同組合／規格起價，先按顯示起價粗估；請在原商品頁選定規格後核對售價。':'以本商品公開售價粗估，款式、庫存與適用優惠以原商品頁資訊為準。',...(chosen.couponExcluded?['領券、會員及指定付款優惠請依原商品頁的適用條件核對。']:[])];
 p.evidence={price:chosen.evidence,shipping:ship?.[0]||'未標示一般配送費',productId:t.id};
 return ready(p);
}
export function parseMusinsa(html,input){
 const t=normalize(input);if(t.kind==='cart')return musinsaCart(t);
 if(t.platformId!=='musinsa'||t.kind!=='product')return confirmation(t,'請貼 Musinsa 個別商品連結。','NOT_SINGLE_PRODUCT');
 const m=metadata(html);let p=base(t);
 let matches=false;try{matches=normalize(m['og:url']).key===t.key;}catch{}
 if(!matches||m['og:type']!=='product')return confirmation(t,'已辨識 Musinsa，尚未取得同款韓國商品頁資料。','PRODUCT_NOT_FOUND');
 p={...p,title:m['og:title']?.replace(/\s*[-|]\s*사이즈.*$|\s*\|\s*무신사.*$/,'')||p.title,currency:m['product:price:currency']||null,image:safeImage(m['og:image'])?m['og:image']:null};
 if(p.currency!=='KRW')return confirmation(p,'未取得韓國版韓幣原價，不使用國際版美金計算。','CURRENCY_NOT_KRW',p);
 p.priceKrw=amount(m['product:price:amount']);p.sourcePrice=p.priceKrw;
 if(!p.priceKrw)return confirmation(p,'Musinsa 公開售價尚未取得，請稍後重試，或核對原商品頁後使用手動試算。','PRICE_UNKNOWN',p);
 if(m['product:availability']&&!/주문가능|InStock|in stock/i.test(m['product:availability']))return confirmation(p,'商品販售狀態尚待確認。','UNAVAILABLE_PRODUCT',p);
 // Meta provides no shipping guarantee: absent data remains null, not free.
 p.evidence={price:'本商品 product:price:amount='+p.priceKrw+' KRW',shipping:'未取得公開一般配送費',productId:t.id};
 p.warnings=['按韓國商品公開售價粗估，未擅用會員等級、個人優惠券或登入後折扣。'];
 p.discountNotice=MUSINSA_NOTICE;return ready(p);
}
export function musinsaCart(t){return confirmation(t,'已辨識 Musinsa 購物車；網址不包含帳號內商品。請貼上個別商品網址，或核對購物車的韓幣金額與運費後使用手動試算。','CART_REQUIRES_PRODUCT',{title:'Musinsa 購物車',discountNotice:MUSINSA_NOTICE,platformFeeKrw:null});}
