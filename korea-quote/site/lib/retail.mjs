/** First-party retail product adapters. All amounts remain in KRW. */
import {normalize,confirmation,safeImage,PlatformError} from './platforms.mjs';
import {metadata,decode,plain,descriptionShipping} from './extract.mjs';
import {parsePlatformFee} from './platform-fee.mjs';
export const MUSINSA_NOTICE='因常有折扣，故真人報價應能更便宜，以實際報價為主';
const amount=v=>typeof v==='string'&&/^\d[\d,]*$/.test(v.trim())&&Number.isSafeInteger(Number(v.replace(/,/g,'')))&&Number(v.replace(/,/g,''))>0&&Number(v.replace(/,/g,''))<=1e9?Number(v.replace(/,/g,'')):null;
const base=t=>({...t,title:t.platformName+' 商品',currency:null,priceKrw:null,shippingKrw:null,platformFeeKrw:null,image:null,warnings:[]});
function ready(p){return {...p,status:p.shippingKrw===null?'needs_confirmation':'quoted',reasonCode:p.shippingKrw===null?'SHIPPING_UNKNOWN':null,notice:p.warnings.join(' ')};}
function reader(raw,t){
 let d=typeof raw==='string'?JSON.parse(raw):raw;d=d?.data||d;
 if(d.url&&normalize(d.url).key!==t.key)throw new PlatformError('PRODUCT_MISMATCH','讀取結果不是同一商品。');
 return {title:decode(d.title||''),text:String(d.content||'')};
}
export function parseOliveYoungReader(raw,input){
 const t=normalize(input);if(t.kind!=='product'||t.platformId!=='oliveyoung')return confirmation(t,'請貼 Olive Young 個別商品連結。','NOT_SINGLE_PRODUCT');
 const {title,text}=reader(raw,t);let p=base(t);
 const name=title.replace(/\s*\|\s*올리브영.*$/,'').trim();
 // Require the source goodsNo, primary image and main heading; never scan navigation or recommendations.
 const image=[...text.matchAll(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/g)].map(m=>m[1]).find(u=>u.includes(t.id)&&safeImage(u));
 const heading=[...text.matchAll(/^#{1,6}\s+(.+)$/gm)].find(m=>m[1].trim()===name);
 if(!name||!image||!heading)return confirmation(t,'已辨識 Olive Young；商品售價尚未讀取完成，請重試或到 LINE 詢問。','PRODUCT_NOT_FOUND');
 let main=text.slice(heading.index).split(/\n(?:#{1,6}\s*)?상품(?:설명|\s*상세\s*정보)/)[0];
 const priceRegion=main.split(/\n(?:팝업 닫기|평점|리뷰|옵션뷰|구매수량)/)[0];
 const displayed=priceRegion.split('\n').map(s=>s.replace(/~~[^~]*~~/g,'').replace(/_\d+(?:\.\d+)?%_/g,'').trim()).find(s=>/^\d[\d,]*\s*원(?:\s|$)/.test(s));
 const displayMatch=displayed?.match(/^([\d,]+)\s*원/),listPrice=priceRegion.match(/판매가\s+([\d,]+)\s*원/);
 const conditional=/쿠폰|회원|첫\s*구매|첫구매|카드/.test(priceRegion);
 const chosen=conditional?listPrice:displayMatch||listPrice;
 p={...p,title:name,image,currency:'KRW',priceKrw:amount(chosen?.[1]),sourcePrice:amount(chosen?.[1])};
 if(!p.priceKrw)return confirmation(p,'已辨識商品，但沒有可核對的一般韓幣售價。','PRICE_UNKNOWN',p);
 const ship=main.match(/일반\s*배송\s*([\d,]+)\s*원(?:\s*\(\s*([\d,]+)\s*원\s*이상\s*무료배송\s*\))?/);
 if(ship){const fee=Number(ship[1].replace(/,/g,''));const threshold=ship[2]?amount(ship[2]):null;p.shippingKrw=threshold&&p.priceKrw>=threshold?0:fee;}
 else if(/일반\s*배송\s*무료/.test(main))p.shippingKrw=0;
 Object.assign(p,parsePlatformFee(main));
 p.priceIsStarting=/원\s*~/.test(displayed||'');
 p.warnings=[p.priceIsStarting?'頁面為不同組合／規格起價，先按顯示起價粗估；選定規格後確認正式報價。':'以本商品公開售價粗估，款式、庫存與實際優惠以真人確認為準。'];
 p.evidence={price:chosen?.[0],shipping:ship?.[0]||'未標示一般配送費',productId:t.id};
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
 if(!p.priceKrw)return confirmation(p,'Musinsa 公開售價尚未取得，請重試或到 LINE 詢問。','PRICE_UNKNOWN',p);
 if(m['product:availability']&&!/주문가능|InStock|in stock/i.test(m['product:availability']))return confirmation(p,'商品販售狀態尚待確認。','UNAVAILABLE_PRODUCT',p);
 // Meta provides no shipping guarantee: absent data remains null, not free.
 p.evidence={price:'本商品 product:price:amount='+p.priceKrw+' KRW',shipping:'未取得公開一般配送費',productId:t.id};
 p.warnings=['按韓國商品公開售價粗估，未擅用會員等級、個人優惠券或登入後折扣。'];
 p.discountNotice=MUSINSA_NOTICE;return ready(p);
}
export function musinsaCart(t){return confirmation(t,'已辨識 Musinsa 購物車；網址不包含帳號內商品。請貼個別商品網址粗估，或將購物車截圖傳到 LINE 詢價。','CART_REQUIRES_PRODUCT',{title:'Musinsa 購物車',discountNotice:MUSINSA_NOTICE,platformFeeKrw:null});}
