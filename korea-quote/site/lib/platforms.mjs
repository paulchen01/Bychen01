/** Supported public page routes. No arbitrary hosts, credentials, IPs or executable URLs. */
export const APP_VERSION = '2026-10-26.24';
export const PLATFORMS = Object.freeze([
  {id:'bunjang',name:'Bunjang 閃電拍賣',native:'번개장터',short:'Bunjang',detail:'公開商品與一般宅配費'},
  {id:'fruits',name:'FruitsFamily',native:'후루츠패밀리',short:'FruitsFamily',detail:'公開標價；未標運費先估商品價'},
  {id:'zigzag',name:'Zigzag',native:'지그재그',short:'Zigzag',detail:'一般售價；不擅用首購優惠'},
  {id:'naver',name:'Naver',native:'네이버',short:'Naver',detail:'商店商品；部落格／社團需確認'},
  {id:'poca',name:'Pocamarket 小卡市集',native:'포카마켓',short:'Pocamarket',detail:'先確認幣別；外幣不套韓幣公式'},
  {id:'oliveyoung',name:'Olive Young',native:'올리브영',short:'Olive Young',detail:'韓國商品售價；以所選規格確認'},
  {id:'musinsa',name:'Musinsa',native:'무신사',short:'Musinsa',detail:'商品頁粗估；購物車請提供個別商品'},
  {id:'x',name:'X／Twitter 推特',native:'트위터',short:'X／Twitter',detail:'公開貼文解析；多款／圖片價需確認'}
]);
const hosts = {
  bunjang:['bunjang.co.kr','m.bunjang.co.kr','www.bunjang.co.kr','globalbunjang.com','www.globalbunjang.com'],
  fruits:['fruitsfamily.com','www.fruitsfamily.com'],
  zigzag:['zigzag.kr','www.zigzag.kr','store.zigzag.kr'],
  naver:['smartstore.naver.com','m.smartstore.naver.com','brand.naver.com','shopping.naver.com','m.shopping.naver.com','search.shopping.naver.com','msearch.shopping.naver.com','blog.naver.com','m.blog.naver.com','cafe.naver.com','m.cafe.naver.com','naver.me'],
  poca:['pocamarket.com','www.pocamarket.com','phocamarket.com','www.phocamarket.com'],
  oliveyoung:['m.oliveyoung.co.kr','www.oliveyoung.co.kr','oliveyoung.co.kr'],
  musinsa:['www.musinsa.com','musinsa.com','m.musinsa.com','store.musinsa.com'],
  x:['x.com','www.x.com','mobile.x.com','twitter.com','www.twitter.com','mobile.twitter.com','m.twitter.com','t.co']
};
// Only verified first-party public hosts are fetched. Unknown aliases stay unsupported.
export class PlatformError extends Error {
  constructor(code,message){super(message);this.name='PlatformError';this.code=code;}
}
function fail(code,msg){throw new PlatformError(code,msg);}
export function normalize(input){
  if(typeof input!=='string'||!input.trim()||input.length>4096)fail('INVALID_URL','請貼上一個完整的商品或貼文網址。');
  let text=input.trim().replace(/\\&/g,'&').replace(/&amp;/g,'&');
  const md=text.match(/^\[[^\]]*\]\((https?:\/\/.+)\)$/i);
  if(md)text=md[1];
  else if(!/^https?:\/\//i.test(text)){
    const urls=text.match(/https?:\/\/[^\s<>「」]+/gi);
    if(urls){if(urls.length!==1)fail('MULTIPLE_URLS','一次請貼一個商品網址，避免報錯商品。');text=urls[0].replace(/[。，！、]+$/g,'');}
    else text='https://'+text;
  }else if(/\s/.test(text)){
    const urls=text.match(/https?:\/\/[^\s<>「」]+/gi);
    if(urls?.length!==1)fail('MULTIPLE_URLS','一次請貼一個商品網址。');text=urls[0];
  }
  if(/[\u0000-\u001f\u007f\\]/.test(text)||/%(?:00|0a|0d|5c)/i.test(text.split(/[?#]/,1)[0]))fail('INVALID_URL','網址含有不支援的字元。');
  let u;try{u=new URL(text);}catch{fail('INVALID_URL','請貼上完整網址，不是平台名稱或搜尋關鍵字。');}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)fail('INVALID_URL','只接受不含帳號密碼的一般商品網址。');
  const platformId=Object.keys(hosts).find(k=>hosts[k].includes(u.hostname));
  if(!platformId)fail('UNSUPPORTED_SITE','目前可辨識 Bunjang、FruitsFamily、Zigzag、Naver、Pocamarket、Musinsa、Olive Young 與 X／Twitter 的網址。');
  const fragment=u.hash;
  u.protocol='https:';u.hash='';
  let id='',kind='page',m;
  const p=u.pathname;
  const globalBunjang=platformId==='bunjang'&&/^(?:www\.)?globalbunjang\.com$/.test(u.hostname);
  const koreanPoca=platformId==='poca'&&/^(?:www\.)?phocamarket\.com$/.test(u.hostname);
  const market=globalBunjang||(platformId==='poca'&&!koreanPoca)?'global':'kr';
  if(platformId==='bunjang'){
    const ids=[];
    if((m=p.match(/^\/products?\/(\d{5,15})\/?$/)))ids.push(m[1]);
    if(!globalBunjang){
      if(p==='/'&&(m=fragment.match(/^#\/?products?\/(\d{5,15})\/?(?:\?[^#]*)?$/)))ids.push(m[1]);
      // Explicit product identifiers only; never guess an ID from arbitrary numbers.
      if(/^\/products?(?:\/\d{5,15})?\/?$/.test(p))for(const key of ['pid','productId','product_id','id']){
        for(const value of u.searchParams.getAll(key)){
          if(!/^\d{5,15}$/.test(value))fail('INVALID_PRODUCT','商品編號格式不正確，請重新複製商品連結。');
          ids.push(value);
        }
      }
    }
    if(new Set(ids).size>1)fail('PRODUCT_MISMATCH','連結含有不同商品編號，請重新複製，避免報錯商品。');
    if(ids.length){
      id=ids[0];kind='product';u.hostname=globalBunjang?'globalbunjang.com':'m.bunjang.co.kr';u.pathname=(globalBunjang?'/product/':'/products/')+id;
    }else if(!globalBunjang&&p!=='/'&&!/^\/(?:search|shop|categories|login|signup)(?:\/|$)/.test(p)){
      kind='link'; // Resolve first-party redirects/canonical links before quoting.
    }
  }else if(platformId==='fruits'){
    u.hostname='fruitsfamily.com';if((m=p.match(/^\/product\/([a-z0-9]{1,12})(?:\/[^/]+)?\/?$/i))){id=m[1].toLowerCase();kind='product';u.pathname=p.replace(/\/$/,'');}
  }else if(platformId==='zigzag'){
    u.hostname='zigzag.kr';if((m=p.match(/^\/(?:(?:app\/)?catalog\/products|p)\/(\d{1,15})\/?$/))){id=m[1];kind='product';u.pathname='/catalog/products/'+id;}
  }else if(platformId==='naver'){
    if(u.hostname==='naver.me'&&/^\/[a-z0-9]+\/?$/i.test(p)){id=p.slice(1).replace(/\/$/,'');kind='short';}
    else if(['smartstore.naver.com','m.smartstore.naver.com','brand.naver.com'].includes(u.hostname)&&(m=p.match(/^\/([^/]+)\/products\/(\d{1,20})\/?$/))){id=m[1]+':'+m[2];kind='product';u.hostname=u.hostname.replace(/^m\./,'');u.pathname='/'+m[1]+'/products/'+m[2];}
    else if(/^(?:m\.)?(?:blog|cafe)\.naver\.com$/.test(u.hostname)){kind='post';id=p;}
  }else if(platformId==='oliveyoung'){
    const goods=u.searchParams.get('goodsNo');
    if(/^\/(?:m|store)\/goods\/getGoodsDetail\.do$/.test(p)&&goods&&/^A[0-9]{12}$/.test(goods)){
      id=goods;kind='product';u.hostname='www.oliveyoung.co.kr';u.pathname='/store/goods/getGoodsDetail.do';
    }
  }else if(platformId==='musinsa'){
    u.hostname='www.musinsa.com';
    if(/^\/order\/cart\/?$/.test(p)){kind='cart';id='cart';u.pathname='/order/cart';}
    else if((m=p.match(/^\/(?:products|app\/goods|goods)\/(\d{1,15})\/?$/))){id=m[1];kind='product';u.pathname='/products/'+id;}
  }else if(platformId==='poca'){
    u.hostname=koreanPoca?'phocamarket.com':'pocamarket.com';
    // The public global product page now redirects to this observed locale route.
    if((m=p.match(/^\/(zh-tw\/)?search\/detail\/(\d{1,15})\/?$/))&&(!m[1]||!koreanPoca)){
      id=m[2];kind='product';u.pathname='/'+(m[1]||'')+'search/detail/'+id;
    }
  }else if(platformId==='x'){
    if(u.hostname==='t.co'&&/^\/[a-z0-9]+\/?$/i.test(p)){id=p.slice(1).replace(/\/$/,'');kind='short';}
    else if((m=p.match(/^\/(?:([a-z0-9_]{1,20})\/status|i\/(?:web\/)?status)\/(\d{6,22})(?:\/(?:photo|video)\/\d+)?\/?$/i))){id=m[2];kind='post';u.hostname='x.com';u.pathname=m[1]?'/'+m[1]+'/status/'+id:'/i/web/status/'+id;}
    else if(u.hostname!=='t.co')u.hostname='x.com';
  }
  // Retain only document identifiers for legacy Naver posts; never forward tracking tokens.
  const query=new URLSearchParams();
  if(platformId==='oliveyoung'&&kind==='product')query.set('goodsNo',id);
  if(platformId==='naver'&&kind==='post')for(const k of ['blogId','logNo','clubid','articleid']){const v=u.searchParams.get(k);if(v&&/^[a-z0-9_\-]{1,80}$/i.test(v))query.set(k,v);}
  if(platformId==='bunjang'&&kind==='link')for(const k of ['pid','productId','product_id']){
    const values=u.searchParams.getAll(k);if(values.length>1)fail('INVALID_PRODUCT','商品連結含有重複編號，請重新複製。');
    if(values.length&&/^\d{5,15}$/.test(values[0]))query.set(k,values[0]);
  }
  // Preserve only explicit display preferences, not tracking or arbitrary redirect tokens.
  if(kind==='product')for(const k of ['currency','lang','locale']){const v=u.searchParams.get(k);if(v&&/^[a-zA-Z]{2,3}(?:[-_][a-zA-Z]{2})?$/.test(v))query.set(k,v);}
  u.search=query.toString();
  const platform=PLATFORMS.find(p=>p.id===platformId);
  return {platformId,platformName:platform.name,id,kind,market,url:u.href,key:platformId+':'+(koreanPoca?'kr:':'')+(kind==='product'||(platformId==='x'&&kind==='post')?id:u.href)};
}
export function safeImage(input){
  try{const u=new URL(input);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&[
    'image.oliveyoung.co.kr','image.msscdn.net','image.musinsa.com',
    'media.bunjang.co.kr','image.production.fruitsfamily.com','cf.product-image.s.zigzag.kr',
    'ndc.infludeo.com','d1sut5kn3lwnf7.cloudfront.net','phocamarket.s3.ap-northeast-2.amazonaws.com',
    'shop-phinf.pstatic.net','shopping-phinf.pstatic.net','pbs.twimg.com'
  ].includes(u.hostname);}catch{return false;}
}
export function confirmation(target,notice,code='NEEDS_CONFIRMATION',fields={}){
  return { ...target,title:target.platformName+' 商品／貼文',currency:null,priceKrw:null,shippingKrw:null,image:null,...fields,status:'needs_confirmation',notice,reasonCode:code };
}
