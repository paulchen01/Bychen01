import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalize} from '../lib/platforms.mjs';
import {parseBunjangApi,loadBunjang,discoverApiTemplates,canonicalBunjangTarget,resolveBunjangTarget} from '../lib/bunjang.mjs';
import {lookup} from '../api/quote.js';
import {quoteForProduct} from '../lib/estimate.mjs';
import {withPlatformFee} from '../lib/platform-fee.mjs';
import {calculate} from '../lib/pricing.mjs';

const ID='386933481',URL='https://m.bunjang.co.kr/products/'+ID;
const API='https://api.bunjang.co.kr/api/pms/v1/products/'+ID+'/detail/web';
const fixture=id=>JSON.parse(fs.readFileSync(new globalThis.URL('./fixtures/bunjang-'+id+'.json',import.meta.url),'utf8'));
const sample=()=>fixture(ID);
const changed=patch=>{const data=sample();Object.assign(data.data.product,patch);return data;};
const response=(data,status=200,headers={})=>new Response(typeof data==='string'?data:JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});
const failing=(code)=>e=>e?.code===code;
const reader=(price=64000,shipping='일반 4,000원')=>({code:200,data:{url:URL,content:`# 비투비) 삐프렌즈 인형 일괄\n\n![상품](https://media.bunjang.co.kr/product/${ID}_1_1770135718_w320.jpg)\n\n## ${price.toLocaleString('en-US')}원\n\n* 배송비\n  * ${shipping}\n* 거래 지역: 전국\n\n상품상태\n새 상품 (미사용)\n\n---\n\n판매자 설명\n\n### 이 상품과 비슷해요\n추천 상품 130,000원`}});

test('live fixture: main product ID/price are bound; recommendation 130000 is ignored',()=>{
  const p=parseBunjangApi(sample(),URL);
  assert.equal(p.id,ID);assert.equal(p.priceKrw,64000);assert.equal(p.shippingKrw,0);
  assert.equal(p.currency,'KRW');assert.equal(p.status,'quoted');
  assert.equal(p.image,'https://media.bunjang.co.kr/product/386933481_1_1770135718_w320.jpg');
  const q=quoteForProduct(withPlatformFee(p),38);
  assert.equal(q.totalTwd,1819);assert.equal(q.tierId,'percent8');assert.equal(q.platformFeeExcluded,true);
});
test('live paid fixture: DEFAULT 4000 is selected, not GS/CU 2000 and not quantity times price',()=>{
  const p=parseBunjangApi(fixture('424103084'),'https://m.bunjang.co.kr/products/424103084');
  assert.equal(p.priceKrw,10000);assert.equal(p.shippingKrw,4000);
  assert.equal(quoteForProduct(withPlatformFee(p),38).totalTwd,419);
});
test('live seller restriction: standard-fee metadata does not override convenience-only text',()=>{
  const p=parseBunjangApi(fixture('421839382'),'https://m.bunjang.co.kr/products/421839382');
  assert.equal(p.reasonCode,'SHIPPING_RESTRICTED');assert.equal(quoteForProduct(p,38),null);
});
test('unpublished standard shipping remains null, even if delivery and convenience pickup exist',()=>{
  const p=parseBunjangApi(changed({trade:{freeShipping:false,shippingSpecs:{GS_HALF_PRICE:{fee:2000}}},trades:[{title:'배송비',contents:['GS 반값 2,000원']}]}),URL);
  assert.equal(p.shippingKrw,null);assert.equal(p.reasonCode,'SHIPPING_UNKNOWN');
  const q=quoteForProduct(withPlatformFee(p),38);assert.equal(q.shippingExcluded,true);assert.equal(q.shippingKrw,null);
});
test('conflicting free and paid shipping stops the quote',()=>{
  assert.throws(()=>parseBunjangApi(changed({trade:{freeShipping:true,shippingSpecs:{DEFAULT:{fee:3000}}}}),URL),failing('SHIPPING_AMBIGUOUS'));
  assert.throws(()=>parseBunjangApi(changed({trade:{freeShipping:false,shippingSpecs:{DEFAULT:{fee:3000}}},trades:[{title:'배송비',contents:['일반 4,000원']}]}),URL),failing('SHIPPING_AMBIGUOUS'));
  assert.throws(()=>parseBunjangApi(changed({trade:{freeShipping:false},trades:[{title:'배송비',contents:['무료배송']}]}),URL),failing('SHIPPING_AMBIGUOUS'));
});
test('wrong ID and foreign currency are rejected',()=>{
  assert.throws(()=>parseBunjangApi(changed({pid:386913781}),URL),failing('PRODUCT_MISMATCH'));
  assert.throws(()=>parseBunjangApi(changed({currency:'USD'}),URL),failing('CURRENCY_MISMATCH'));
});
test('sold/reserved/hidden/unavailable items are never priced',()=>{
  for(const patch of [{saleStatus:'SOLD_OUT'},{saleStatus:'RESERVED'},{isHidden:true},{qty:0},{qty:'0'}])assert.throws(()=>parseBunjangApi(changed(patch),URL),failing('UNAVAILABLE_PRODUCT'));
  assert.throws(()=>parseBunjangApi({errorCode:'ERR_PRODUCT_NOT_FOUND'},URL),failing('UNAVAILABLE_PRODUCT'));
});
test('missing sale status and ambiguous main price cause schema validation failure',()=>{
  for(const patch of [{saleStatus:undefined},{isHidden:undefined},{price:null},{price:-1},{price:'1e3'},{price:10.5},{name:''}])assert.throws(()=>parseBunjangApi(changed(patch),URL),failing('BUNJANG_SCHEMA_CHANGED'));
});
test('common domain, product path, share text, explicit query and hash aliases map to one ID',()=>{
  for(const value of [URL,'https://www.bunjang.co.kr/products/'+ID+'?utm_source=line','bunjang.co.kr/products/'+ID,
    'https://m.bunjang.co.kr/product/'+ID,'https://m.bunjang.co.kr/products?pid='+ID,
    'https://m.bunjang.co.kr/products?productId='+ID,'https://m.bunjang.co.kr/#/products/'+ID,
    '這件幫我報價 '+URL+'。','[商品]('+URL+')']){
    const t=normalize(value);assert.equal(t.kind,'product',value);assert.equal(t.id,ID,value);assert.equal(t.url,URL,value);
  }
});
test('ambiguous IDs, multiple URLs and unsafe hosts never normalize to a product',()=>{
  for(const value of [URL+'?pid=386913781','https://m.bunjang.co.kr/products?pid='+ID+'&pid=386913781'])assert.throws(()=>normalize(value),failing('PRODUCT_MISMATCH'));
  for(const value of [URL+' https://m.bunjang.co.kr/products/386913781','https://m.bunjang.co.kr.evil.example/products/'+ID,'https://m.bunjang.co.kr@evil.example/products/'+ID,'http://127.0.0.1/products/'+ID])assert.throws(()=>normalize(value));
});
test('home-page og:url and unrelated links are not canonical product identity',()=>{
  assert.equal(canonicalBunjangTarget('<head><meta property="og:url" content="http://m.bunjang.co.kr"></head>',URL),null);
  assert.equal(canonicalBunjangTarget('<head><link rel="canonical" href="'+URL+'"><a href="https://m.bunjang.co.kr/products/386913781">Other</a></head>',URL).id,ID);
  assert.throws(()=>canonicalBunjangTarget('<head><link rel="canonical" href="https://m.bunjang.co.kr/products/386913781"></head>',URL),failing('PRODUCT_MISMATCH'));
});
test('canonical tags in comments, scripts and body do not prove product identity',()=>{
  const input='https://m.bunjang.co.kr/s/new-format';
  for(const html of ['<head><!-- <link rel="canonical" href="'+URL+'"> --></head>',
    '<head><script>const example=`<meta property="og:url" content="'+URL+'">`;</script></head>',
    '<head></head><body><code><link rel="canonical" href="'+URL+'"></code></body>'])assert.equal(canonicalBunjangTarget(html,input),null);
});
test('official renamed page resolves via canonical metadata and verifies product identity',async()=>{
  const input='https://m.bunjang.co.kr/listing/example',calls=[];
  const fetcher=async u=>{calls.push(u);if(u===input)return response('<html><head><link rel="canonical" href="'+URL+'"></head><body></body></html>');if(u===API)return response(sample());throw Error('Unexpected '+u);};
  const p=await lookup(input,fetcher);assert.equal(p.priceKrw,64000);assert.equal(p.linkResolution.productId,ID);
  assert.equal(p.linkResolution.inputUrl,input);assert.equal(p.originalUrl,input);assert.equal(p.linkResolution.resolvedUrl,URL);assert.deepEqual(calls,[input,API]);
});
test('official redirect to another official product page resolves; external redirect is not requested',async()=>{
  const input='https://m.bunjang.co.kr/share/example';
  const success=await resolveBunjangTarget(input,async()=>response('',302,{location:URL}));assert.equal(success.target.id,ID);
  let calls=0;await assert.rejects(resolveBunjangTarget(input,async()=>{calls++;return response('',302,{location:'http://169.254.169.254/latest/meta-data/'});}),failing('REDIRECT_CONFIRMATION'));assert.equal(calls,1);
});
test('new official link without product proof is left unresolved',async()=>{
  await assert.rejects(resolveBunjangTarget('https://m.bunjang.co.kr/share/example',async()=>response('<meta property="og:url" content="https://m.bunjang.co.kr">')),failing('BUNJANG_LINK_UNRESOLVED'));
});
test('primary public API works without reader, cookies or login headers',async()=>{
  const calls=[];const p=await lookup(URL,async(u,options)=>{calls.push(u);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,undefined);return response(sample());});
  assert.equal(p.priceKrw,64000);assert.equal(p.shippingKrw,0);assert.equal(p.extractionSource,'bunjang_public_api');assert.deepEqual(calls,[API]);
});
test('404 product-not-found and 403 access denial are terminal, with no fallback',async()=>{
  for(const [status,data,code] of [[404,{errorCode:'ERR_PRODUCT_NOT_FOUND'},'UNAVAILABLE_PRODUCT'],[403,{},'ACCESS_RESTRICTED']]){
    let calls=0;const p=await lookup(URL,async()=>{calls++;return response(data,status);});
    assert.equal(p.reasonCode,code);assert.equal(p.priceKrw,null);assert.equal(calls,1);
  }
});
test('API redirects to login or unverified origins cannot be overridden by reader',async()=>{
  for(const [location,code] of [['https://m.bunjang.co.kr/login','ACCESS_RESTRICTED'],['https://evil.example/product','REDIRECT_CONFIRMATION']]){
    const calls=[];const p=await lookup(URL,async u=>{calls.push(u);return u===API?response('',302,{location}):response(reader());});
    assert.equal(p.reasonCode,code);assert.equal(p.priceKrw,null);assert.deepEqual(calls,[API]);
  }
});
test('wrong product from primary API is not overridden by a reader response',async()=>{
  let calls=0;const p=await lookup(URL,async()=>{calls++;return response(changed({pid:386913781}));});
  assert.equal(p.reasonCode,'PRODUCT_MISMATCH');assert.equal(calls,1);assert.equal(quoteForProduct(p,38),null);
});
test('API same-product version redirect is validated and the verified endpoint is reused',async()=>{
  const v2=API.replace('/v1/','/v2/'),calls=[];
  const fetcher=async u=>{calls.push(u);if(u===API)return response('',308,{location:v2});if(u===v2)return response(sample());throw Error('Unexpected '+u);};
  assert.equal((await loadBunjang(URL,fetcher)).priceKrw,64000);
  assert.equal((await loadBunjang(URL,fetcher)).priceKrw,64000);assert.deepEqual(calls,[API,v2,v2]);
});
test('endpoint disappearance discovers official bundle template and adopts only a verified response',async()=>{
  const v2=API.replace('/v1/','/v2/'),script='https://m.bunjang.co.kr/static/js/index.new.js',calls=[];
  const fetcher=async u=>{calls.push(u);if(u===API)return response({},404);if(u===URL)return response('<meta property="og:url" content="https://m.bunjang.co.kr"><script type="module" src="/static/js/index.new.js"></script>');if(u===script)return response('function detail(pid){return client.get(`/api/pms/v2/products/${pid}/detail/web`)}');if(u===v2)return response(sample());throw Error('Unexpected '+u);};
  const first=await loadBunjang(URL,fetcher);assert.equal(first.adaptedEndpoint,true);assert.equal(first.priceKrw,64000);
  await loadBunjang(URL,fetcher);assert.deepEqual(calls,[API,URL,script,v2,v2]);
});
test('unverified discovered endpoint cannot switch to a different product',async()=>{
  const v2=API.replace('/v1/','/v2/');let calls=0;
  const fetcher=async u=>{calls++;if(u===API)return response({},404);if(u===URL)return response('<script src="/static/js/index.new.js"></script>');if(u.endsWith('index.new.js'))return response('`/api/pms/v2/products/${pid}/detail/web`');if(u===v2)return response(changed({pid:386913781}));throw Error('Unexpected '+u);};
  const p=await lookup(URL,fetcher);assert.equal(p.reasonCode,'PRODUCT_MISMATCH');assert.equal(calls,4);
});
test('API template discovery does not evaluate JS or accept arbitrary endpoint shapes',()=>{
  const text='globalThis.SHOULD_NOT_RUN=true; client.get(`/api/pms/v2/products/${item.pid}/detail/web`); client.get(`/api/admin/products/${pid}/delete`);';
  assert.deepEqual(discoverApiTemplates(text),['/api/pms/v2/products/{id}/detail/web']);assert.equal(globalThis.SHOULD_NOT_RUN,undefined);
  assert.deepEqual(discoverApiTemplates('`https://evil.example/api/products/${pid}/detail/web`'),[]);
});
test('reader fallback can enrich unknown shipping only when main price and ID agree',async()=>{
  const unknown=changed({trade:{freeShipping:false},trades:[]});
  const p=await loadBunjang(URL,async u=>u===API?response(unknown):response(reader()));
  assert.equal(p.priceKrw,64000);assert.equal(p.shippingKrw,4000);assert.equal(p.extractionSource,'bunjang_api_with_page_shipping');
});
test('conflicting API and reader prices produce no quote',async()=>{
  const unknown=changed({trade:{freeShipping:false},trades:[]});
  const p=await lookup(URL,async u=>u===API?response(unknown):response(reader(65000)));
  assert.equal(p.reasonCode,'PRICE_CONFLICT');assert.equal(quoteForProduct(p,38),null);
});
test('transient API failure can use validated public page fallback',async()=>{
  const p=await loadBunjang(URL,async u=>u===API?response({},503):response(reader(64000,'무료배송')));
  assert.equal(p.priceKrw,64000);assert.equal(p.shippingKrw,0);assert.equal(p.extractionSource,'bunjang_page_reader');
});
test('fallback seller shipping restriction blocks complete and partial quotes',async()=>{
  const restricted=reader(64000,'일반 3,000원');restricted.data.content=restricted.data.content.replace('판매자 설명','⭐️반택만 가능합니당⭐️');
  for(const primary of [response({},503),response(changed({trade:{freeShipping:false},trades:[]}))]){
    const p=await lookup(URL,async u=>u===API?primary:response(restricted));
    assert.equal(p.reasonCode,'SHIPPING_RESTRICTED');assert.equal(quoteForProduct(p,38),null);
  }
});
test('tier boundaries and final rounding remain exactly the established policy',()=>{
  for(const [p,s,tier,total] of [[25000,0,'fixed50',708],[25001,0,'percent8',711],[64000,0,'percent8',1819],[10000,4000,'fixed50',419]]){
    const q=calculate(p,s,38);assert.equal(q.tierId,tier);assert.equal(q.totalTwd,total);
  }
  for(const [amount,tier] of [[79999,'percent8'],[80000,'percent5'],[149999,'percent5'],[150000,'percent3'],[199999,'percent3'],[200000,'free']])assert.equal(calculate(amount,0,38).tierId,tier);
});
