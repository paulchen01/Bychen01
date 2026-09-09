from pathlib import Path
import json,base64,hashlib,os,urllib.request,subprocess
R=Path('prepared-site');R.mkdir(exist_ok=True)
def fetch(url):
 with urllib.request.urlopen(url,timeout=40) as r:return r.read()
raw=fetch('https://raw.githubusercontent.com/paulchen01/Bychen01/662a7c25b09f5b0b320a8723ddd0196f487ba7cf/korea-quote/releases/site-20260908-8.json')
assert hashlib.sha256(raw).hexdigest()=='979929fb4460d98b00e537e5ce1edd4ff0207f860e8b214625efa79b7ceb9912'
for f in json.loads(raw)['files']:
 p=R/f['file'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(base64.b64decode(f['data']) if f['encoding']=='base64' else f['data'].encode())
def edit(f,old,new):
 p=R/f;s=p.read_text();assert old in s,(f,old[:130]);p.write_text(s.replace(old,new))
edit('lib/platforms.mjs','2026-09-08.8','2026-09-09.9')
edit('lib/platforms.mjs',"  {id:'x',", "  {id:'oliveyoung',name:'Olive Young',native:'올리브영',short:'Olive Young',detail:'韓國商品售價；以所選規格確認'},\n  {id:'musinsa',name:'Musinsa',native:'무신사',short:'Musinsa',detail:'商品頁粗估；購物車請提供個別商品'},\n  {id:'x',")
edit('lib/platforms.mjs',"  x:['x.com'", "  oliveyoung:['m.oliveyoung.co.kr','www.oliveyoung.co.kr','oliveyoung.co.kr'],\n  musinsa:['www.musinsa.com','musinsa.com','m.musinsa.com','store.musinsa.com'],\n  x:['x.com'")
edit('lib/platforms.mjs','Pocamarket 與 X／Twitter 的網址。','Pocamarket、Musinsa、Olive Young 與 X／Twitter 的網址。')
edit('lib/platforms.mjs',"  }else if(platformId==='poca'){",r"""  }else if(platformId==='oliveyoung'){
    const goods=u.searchParams.get('goodsNo');
    if(/^\/(?:m|store)\/goods\/getGoodsDetail\.do$/.test(p)&&goods&&/^A[0-9]{12}$/.test(goods)){
      id=goods;kind='product';u.hostname='www.oliveyoung.co.kr';u.pathname='/store/goods/getGoodsDetail.do';
    }
  }else if(platformId==='musinsa'){
    u.hostname='www.musinsa.com';
    if(/^\/order\/cart\/?$/.test(p)){kind='cart';id='cart';u.pathname='/order/cart';}
    else if((m=p.match(/^\/(?:products|app\/goods|goods)\/(\d{1,15})\/?$/))){id=m[1];kind='product';u.pathname='/products/'+id;}
  }else if(platformId==='poca'){""")
edit('lib/platforms.mjs','  const query=new URLSearchParams();',"  const query=new URLSearchParams();\n  if(platformId==='oliveyoung'&&kind==='product')query.set('goodsNo',id);")
edit('lib/platforms.mjs',"    'media.bunjang.co.kr',", "    'image.oliveyoung.co.kr','image.msscdn.net','image.musinsa.com',\n    'media.bunjang.co.kr',")
(R/'lib/platform-fee.mjs').write_text(r'''/** Only explicit buyer platform charges are accepted; missing is NOT zero.
 * Call with the main product's fee information, never recommendations or seller fees.
 */
export function parsePlatformFee(text=''){
  const values=[];
  for(const line of String(text).replace(/<[^>]*>/g,' ').split(/\n|[;；]/)){
    const s=line.replace(/^[\s*•·-]+|[\s*]+$/g,'').trim();
    if(/판매자|판매\s*수수료|정산|환불|취소|최대|최소|부터|쿠폰|회원|[0-9]\s*%/.test(s))continue;
    const m=s.match(/^(?:(?:구매자|구매)\s*(?:플랫폼\s*)?수수료|플랫폼\s*이용\s*수수료|안전\s*결제\s*수수료)\s*[:：]?\s*([0-9,]+\s*원|무료|없음)\s*$/);
    if(!m)continue;
    const n=/무료|없음/.test(m[1])?0:Number(m[1].replace(/[,원\s]/g,''));
    if(Number.isSafeInteger(n)&&n>=0&&n<=1e9)values.push({value:n,evidence:s});
  }
  const unique=[...new Set(values.map(x=>x.value))];
  return unique.length===1?{platformFeeKrw:unique[0],platformFeeEvidence:values[0].evidence,platformFeeStatus:'known'}:{platformFeeKrw:null,platformFeeEvidence:null,platformFeeStatus:'unknown'};
}
export function withPlatformFee(product){
  if(!product)return product;
  const valid=Number.isSafeInteger(product.platformFeeKrw)&&product.platformFeeKrw>=0&&product.platformFeeKrw<=1e9;
  return {...product,platformFeeKrw:valid?product.platformFeeKrw:null,platformFeeStatus:valid?'known':'unknown',platformFeeNotice:valid?'按本商品公開標示的平台費計入。':product.platformId==='fruits'?'讀不到，未計入粗估；需登入後由廢廢豬確認。':'讀不到，未計入粗估。'};
}
export function platformFeeText(fee){return Number.isSafeInteger(fee)&&fee>=0?'₩'+new Intl.NumberFormat('zh-TW').format(fee)+(fee===0?'（已確認免平台費）':''):'讀不到，未計入粗估';}
''')
edit('lib/extract.mjs','import {normalize,',"import {parsePlatformFee} from './platform-fee.mjs';\nimport {normalize,")
edit('lib/extract.mjs','  p.shippingKrw=shipLD(offers)??descriptionShipping(ld.description);','  Object.assign(p,parsePlatformFee(ld.description));\n  p.shippingKrw=shipLD(offers)??descriptionShipping(ld.description);')
(R/'lib/retail.mjs').write_text(r'''/** First-party retail product adapters. All amounts remain in KRW. */
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
''')
edit('api/quote.js','const cache=new Map()',"import {parseOliveYoungReader,parseMusinsa,musinsaCart} from '../lib/retail.mjs';\nimport {withPlatformFee} from '../lib/platform-fee.mjs';\nconst cache=new Map()")
edit('api/quote.js',"    if(target.kind==='page'", "    if(target.platformId==='musinsa'&&target.kind==='cart')return withPlatformFee(musinsaCart(target));\n    if(target.kind==='page'")
edit('api/quote.js',"    if(target.platformId==='bunjang'){", "    if(target.platformId==='bunjang'||target.platformId==='oliveyoung'){")
edit('api/quote.js','      const parsed=parseReader(await readLimited(r),target.url,{allowMissingShipping:true});',"      const raw=await readLimited(r);\n      if(target.platformId==='oliveyoung'){p=parseOliveYoungReader(raw,target.url);}else{\n      const parsed=parseReader(raw,target.url,{allowMissingShipping:true});")
edit('api/quote.js',"    }else if(target.platformId==='x'){", "      }\n    }else if(target.platformId==='x'){")
edit('api/quote.js','poca:parsePoca}','poca:parsePoca,musinsa:parseMusinsa}')
edit('api/quote.js','    return {...p,originalUrl:','    return {...withPlatformFee(p),originalUrl:')
edit('api/quote.js',"quote.shippingExcluded?'estimated':'quoted'","quote.shippingExcluded||quote.platformFeeExcluded?'estimated':'quoted'")
edit('lib/estimate.mjs','export function estimateFromAmounts(price,shipping){','export function estimateFromAmounts(price,shipping,platformFee=null){')
edit('lib/estimate.mjs',"  return excluded?{...q,shippingKrw:null,shippingExcluded:true,estimateScope:'product_only'}:q;",r"""  const feeExcluded=platformFee===null||platformFee===undefined||platformFee==='';
  let f=0;
  if(!feeExcluded){
    if(!['string','number'].includes(typeof platformFee)||!/^\d+$/.test(String(platformFee).trim().replace(/,/g,'')))throw Error('平台手續費必須為非負韓幣整數。');
    f=Number(String(platformFee).replace(/,/g,''));if(!Number.isSafeInteger(f)||f<0||f>1e9)throw Error('平台手續費金額無效。');
  }
  const den=BigInt(q.exchangeRate)*100n;
  const num=BigInt(q.subtotalKrw)*BigInt(100+(q.servicePercent||0))+BigInt(q.fixedFeeTwd)*den+BigInt(f)*100n;
  return {...q,...(excluded?{shippingKrw:null,shippingExcluded:true,estimateScope:'product_only'}:{}),platformFeeKrw:feeExcluded?null:f,platformFeeExcluded:feeExcluded,platformFeeTwd:feeExcluded?null:f/q.exchangeRate,totalTwd:Number((num+den-1n)/den)};""")
edit('lib/estimate.mjs','return estimateFromAmounts(p.priceKrw,p.shippingKrw);','return estimateFromAmounts(p.priceKrw,p.shippingKrw,p.platformFeeKrw);')
edit('lib/estimate.mjs','return calculate(q.priceKrw,0);','return estimateFromAmounts(q.priceKrw,null,q.platformFeeKrw);')
edit('lib/estimate.mjs','return calculate(q.priceKrw,q.shippingKrw);','return estimateFromAmounts(q.priceKrw,q.shippingKrw,q.platformFeeKrw);')
edit('lib/estimate.mjs','export function estimateFormula(q,options={}){',"export function estimateFormula(q,options={}){\n  const base=merchandiseFormula(q,options);const f=q.platformFeeKrw;\n  return Number.isSafeInteger(f)&&f>0?base+'＋'+(options.grouped?new Intl.NumberFormat('zh-TW').format(f):String(f))+'÷'+q.exchangeRate:base;\n}\nfunction merchandiseFormula(q,options={}){")
edit('lib/estimate.mjs','return feeDescription(verifiedCalculation(q));','const c=verifiedCalculation(q);return feeDescription(calculate(c.priceKrw,c.shippingKrw??0));')
edit('lib/inquiry.mjs','import {validDomesticProof}',"import {platformFeeText} from './platform-fee.mjs';\nimport {validDomesticProof}")
edit('lib/inquiry.mjs',"    '試算：'+estimateFormula(quote)","    '韓國平台手續費：'+platformFeeText(quote.platformFeeKrw),\n    '試算：'+estimateFormula(quote)")
edit('lib/inquiry.mjs',"+(excluded?'；未含韓國運費':'')+'）'","+(excluded?'；未含韓國運費':'')+(quote.platformFeeExcluded?'；未含未讀取到的平台手續費':'')+'）'")
edit('lib/inquiry.mjs',"    '請幫我確認款式、庫存與正式報價，謝謝！'","    product.discountNotice||'',\n    '請幫我確認款式、庫存與正式報價，謝謝！'")
edit('lib/inquiry.mjs',"'需確認：'+String(product.notice","'韓國平台手續費：'+platformFeeText(product.platformFeeKrw),product.discountNotice||'','需確認：'+String(product.notice")
edit('index.html','Pocamarket 或 X 的連結','Musinsa、Olive Young 或 X 的連結')
edit('index.html','<div><dt>韓國境內運費</dt><dd id="shipping"></dd></div>','<div><dt>韓國境內運費</dt><dd id="shipping"></dd></div><div><dt>韓國平台手續費</dt><dd id="platformFee"></dd></div>')
edit('index.html','<div><dt>韓國境內運費</dt><dd id="knownShipping">待確認</dd></div>','<div><dt>韓國境內運費</dt><dd id="knownShipping">待確認</dd></div><div><dt>韓國平台手續費</dt><dd id="knownPlatformFee">讀不到</dd></div>')
edit('index.html','<p id="tierApplied" class="tier-applied">','<p class="small muted" id="platformFeeNote">平台手續費與廢廢豬代購費分開列示；未讀取到的費用不計入粗估。</p><p id="tierApplied" class="tier-applied">')
edit('index.html','<p id="time" class="timestamp"></p>','<p id="time" class="timestamp"></p><p class="product-warning" id="discountNotice" hidden></p>')
edit('index.html','＋ 代購費</b>','＋ 代購費<br>＋ 已知韓國平台費 ÷38</b>')
edit('index.html','未標運費時，先依商品款估價，並標示未含韓國運費。','未讀取到運費或平台費，仍先粗估並標示未含項目。平台費另以原額換算，不重複加收代購費。')
edit('index.html','<button class="button secondary" type="submit">依輸入金額試算</button>','<label for="pf">韓國平台手續費 ₩（可留空）</label><input id="pf" type="number" inputmode="numeric" min="0" max="1000000000" step="1" placeholder="讀不到可留空"><button class="button secondary" type="submit">依輸入金額試算</button>')
edit('app.js','import {normalize,',"import {platformFeeText} from './lib/platform-fee.mjs';\nimport {normalize,")
edit('app.js',"t.kind==='page'?' · 請提供單一商品頁'","t.kind==='cart'?' · 購物車請提供個別商品':t.kind==='page'?' · 請提供單一商品頁'")
edit('app.js','const excluded=q?.shippingExcluded===true;','const excluded=q?.shippingExcluded===true,feeExcluded=q?.platformFeeExcluded===true;')
edit('app.js',"    $('shippingNote').hidden=!excluded;","""    $('platformFee').textContent=platformFeeText(q.platformFeeKrw);
    $('platformFee').classList.toggle('unknown-fee',feeExcluded);
    $('platformFeeNote').textContent=feeExcluded?(p.platformFeeNotice||'讀不到，未計入粗估。')+' 此為韓國平台費，與廢廢豬代購費不同。':'韓國平台費僅按原額除以38加回，不重複加收代購費。';
    if(feeExcluded)$('priceScope').textContent+=' 未含尚未讀取到的平台手續費。';
    else if(q.platformFeeKrw>0)$('priceScope').textContent+=' 已含韓國平台手續費。';
    $('shippingNote').hidden=!excluded;""")
edit('app.js',"    $('knownShipping').textContent=","    $('knownPlatformFee').textContent=platformFeeText(p.platformFeeKrw);\n    $('knownShipping').textContent=")
edit('app.js',"  updateInquiry();updateBar();scrollTo($('result-panel'));","  $('discountNotice').hidden=!p.discountNotice;$('discountNotice').textContent=p.discountNotice||'';\n  updateInquiry();updateBar();scrollTo($('result-panel'));")
edit('app.js',"(d.status==='estimated')!==!!verified.shippingExcluded","(d.status==='estimated')!==!!(verified.shippingExcluded||verified.platformFeeExcluded)")
edit('app.js','d.quote.exchangeRate!==EXCHANGE_RATE)','d.quote.exchangeRate!==EXCHANGE_RATE||d.quote.platformFeeKrw!==verified.platformFeeKrw||!!d.quote.platformFeeExcluded!==verified.platformFeeExcluded)')
edit('app.js',"estimateFromAmounts($('p').value,$('s').value)","estimateFromAmounts($('p').value,$('s').value,$('pf').value)")
edit('api/health.js','fxConversionUsed:false,',"fxConversionUsed:false,platformFeePolicy:'separate-pass-through-unknown-excluded',")
(R/'style.css').write_text((R/'style.css').read_text()+'''\n/* Fee details must wrap on small phones instead of stretching the card. */
.quote-breakdown dd,.pending-facts dd{overflow-wrap:anywhere;max-width:60%;text-align:right;}
.quote-breakdown .unknown-fee{font-size:12px;line-height:1.65;color:#856849;white-space:normal;}
#platformFeeNote{font-size:11px;line-height:1.8;}#pf{width:100%;margin-bottom:12px;}\n''')
p=json.loads((R/'package.json').read_text());p['version']='1.0.9';(R/'package.json').write_text(json.dumps(p,ensure_ascii=False,indent=2))
for f in ['app.js','api/quote.js','lib/platforms.mjs','lib/retail.mjs','lib/estimate.mjs']:subprocess.run(['node','--check',str(R/f)],check=True)
subprocess.run(['node','--input-type=module','-e',"import assert from 'node:assert/strict';import{estimateFromAmounts,estimateFee}from './prepared-site/lib/estimate.mjs';import{normalize}from './prepared-site/lib/platforms.mjs';import{lookup}from './prepared-site/api/quote.js';assert.equal(estimateFromAmounts(28000,4000,1900).totalTwd,960);assert.equal(estimateFromAmounts(1300000,null).totalTwd,34211);assert.equal(estimateFee(estimateFromAmounts(1300000,null)),'免代購費');assert.equal(normalize('https://m.oliveyoung.co.kr/m/goods/getGoodsDetail.do?goodsNo=A000000249451').id,'A000000249451');assert.equal(normalize('https://www.musinsa.com/order/cart').kind,'cart');const p=await lookup('https://www.musinsa.com/order/cart',()=>{throw Error('Cart must not be fetched')});assert.equal(p.reasonCode,'CART_REQUIRES_PRODUCT');console.log('PREPARE_CHECKS_PASSED');"],check=True)
files=[];hashes={}
for p in sorted(R.rglob('*')):
 if not p.is_file():continue
 name=p.relative_to(R).as_posix();b=p.read_bytes();hashes[name]=hashlib.sha256(b).hexdigest();files.append({'file':name,'encoding':'base64','data':base64.b64encode(b).decode()})
raw=json.dumps({'version':'2026-09-09.9','hashes':hashes,'files':files},ensure_ascii=False,separators=(',',':')).encode();Path('prepared-v9.json').write_bytes(raw)
body=json.dumps({'message':'Save retail and platform-fee v9 deployable source snapshot','content':base64.b64encode(raw).decode()}).encode()
req=urllib.request.Request('https://api.github.com/repos/paulchen01/Bychen01/contents/korea-quote/releases/site-20260909-9.json',data=body,headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'},method='PUT')
with urllib.request.urlopen(req,timeout=40) as resp:result=json.load(resp)
print('PREPARED_RELEASE',json.dumps({'version':'2026-09-09.9','commit':result['commit']['sha'],'sha256':hashlib.sha256(raw).hexdigest(),'hashes':hashes}),flush=True)
