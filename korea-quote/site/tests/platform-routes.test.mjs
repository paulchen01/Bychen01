/** Route regressions use synthetic main-product data; all HTTP is mocked. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {normalize} from '../lib/platforms.mjs';
import {quoteForProduct} from '../lib/estimate.mjs';
import {lookup,publicPage} from '../api/quote.js';

const ZIGZAG_ID='125508991';
const ZIGZAG='https://zigzag.kr/catalog/products/'+ZIGZAG_ID;
const ZIGZAG_ALIAS='https://zigzag.kr/p/'+ZIGZAG_ID;
const POCA_ID='85968';
const POCA='https://pocamarket.com/search/detail/'+POCA_ID;
const POCA_LOCALIZED='https://pocamarket.com/zh-tw/search/detail/'+POCA_ID;
const POCA_KR='https://phocamarket.com/search/detail/'+POCA_ID;
const htmlResponse=html=>new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
const redirectResponse=location=>new Response(null,{status:308,headers:{location}});

function zigzagFixture(productOverrides={}){
  const product={
    id:ZIGZAG_ID,product_url:ZIGZAG,name:'Synthetic main trousers',
    product_price:{display_final_price:{final_price:{price:25600,price_with_currency:{display_currency:'원'}}}},
    is_purchasable:true,sales_status:'ON_SALE',display_status:'VISIBLE',
    shipping_fee:{fee_type:'FREE',base_fee:0},...productOverrides
  };
  const query=(id,value)=>({queryKey:['getPdpBaseInfo',id],state:{data:{shop:{name:'Fixture shop'},product:value}}});
  const state={props:{pageProps:{dehydratedState:{queries:[
    query('125508992',{...product,id:'125508992',product_url:'https://zigzag.kr/p/125508992',name:'Unrelated recommendation',product_price:{display_final_price:{final_price:{price:1000,price_with_currency:{display_currency:'원'}}}}}),
    query(ZIGZAG_ID,product)
  ]}}}};
  return '<html><head><script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(state)+'</script></head><body>Synthetic product fixture</body></html>';
}

function pocaUsdFixture(){
  const product={
    '@context':'https://schema.org','@type':'Product',name:'Synthetic global photocard',
    url:POCA_LOCALIZED,sku:POCA_ID,
    offers:{'@type':'Offer',url:POCA_LOCALIZED,price:'12.50',priceCurrency:'USD',availability:'https://schema.org/InStock'}
  };
  return '<html><head><link rel="canonical" href="'+POCA_LOCALIZED+'"><script type="application/ld+json">'+JSON.stringify(product)+'</script></head><body>USD 12.50</body></html>';
}

test('Zigzag /p links identify the same Korean product as the catalog URL',()=>{
  const alias=normalize(ZIGZAG_ALIAS+'/?utm_source=share#details');
  const catalog=normalize(ZIGZAG);
  assert.equal(alias.kind,'product');
  assert.equal(alias.id,ZIGZAG_ID);
  assert.equal(alias.platformId,'zigzag');
  assert.equal(alias.market,'kr');
  assert.equal(alias.key,catalog.key);
  assert.equal(alias.url,ZIGZAG);
});

test('Poca zh-tw routes retain their locale and global product identity',()=>{
  const localized=normalize(POCA_LOCALIZED+'/?currency=USD&utm_source=share#details');
  const original=normalize(POCA);
  assert.equal(localized.kind,'product');
  assert.equal(localized.id,POCA_ID);
  assert.equal(localized.platformId,'poca');
  assert.equal(localized.market,'global');
  assert.equal(localized.key,original.key);
  assert.equal(localized.url,POCA_LOCALIZED+'?currency=USD');
  assert.deepEqual(normalize(localized.url),localized);
});

test('the same numeric Poca ID does not make a Korean storefront redirect equivalent',async()=>{
  const global=normalize(POCA_LOCALIZED),korean=normalize(POCA_KR);
  assert.equal(korean.id,global.id);
  assert.equal(korean.market,'kr');
  assert.notEqual(korean.key,global.key);
  assert.equal(normalize(POCA_KR.replace('/search/','/zh-tw/search/')).kind,'page');
  const calls=[];
  await assert.rejects(publicPage(global,async url=>{
    calls.push(url);return redirectResponse(POCA_KR);
  }),{code:'REDIRECT_CONFIRMATION'});
  assert.deepEqual(calls,[POCA_LOCALIZED]);
});

test('aliases without an explicit numeric product ID never start a product lookup',async()=>{
  const inputs=[
    'https://zigzag.kr/p/',
    'https://zigzag.kr/p/not-a-product',
    'https://pocamarket.com/zh-tw/search/detail/',
    'https://pocamarket.com/zh-tw/search/detail/not-a-product'
  ];
  for(const input of inputs){
    let calls=0;
    const product=await lookup(input,async()=>{calls++;assert.fail('A product ID is required before fetching.');});
    assert.equal(product.kind,'page',input);
    assert.equal(product.reasonCode,'NOT_SINGLE_PRODUCT',input);
    assert.equal(quoteForProduct(product,38),null,input);
    assert.equal(calls,0,input);
  }
});

test('a Poca locale redirect completes without normalizing back into a redirect loop',async()=>{
  const calls=[],html=pocaUsdFixture();
  const result=await publicPage(normalize(POCA),async(url,options)=>{
    calls.push(url);
    assert.equal(options.redirect,'manual');
    return url===POCA?redirectResponse('/zh-tw/search/detail/'+POCA_ID):htmlResponse(html);
  });
  assert.deepEqual(calls,[POCA,POCA_LOCALIZED]);
  assert.equal(result.target.url,POCA_LOCALIZED);
  assert.equal(result.target.key,normalize(POCA).key);
  assert.equal(result.html,html);
});

test('a real loop between equivalent Poca locale routes has a bounded request count',async()=>{
  const calls=[];
  await assert.rejects(publicPage(normalize(POCA),async url=>{
    calls.push(url);return redirectResponse(url===POCA?POCA_LOCALIZED:POCA);
  }),{code:'REDIRECT_LIMIT'});
  assert.deepEqual(calls,[POCA,POCA_LOCALIZED,POCA,POCA_LOCALIZED]);
});

test('Zigzag and Poca redirects to a different product ID stop before the destination fetch',async()=>{
  for(const [input,destination] of [
    [ZIGZAG_ALIAS,'https://zigzag.kr/p/125508992'],
    [POCA,'https://pocamarket.com/zh-tw/search/detail/85969']
  ]){
    const calls=[];
    await assert.rejects(publicPage(normalize(input),async url=>{
      calls.push(url);return redirectResponse(destination);
    }),{code:'REDIRECT_CONFIRMATION'});
    assert.deepEqual(calls,[normalize(input).url]);
  }
});

test('a redirect to another platform cannot borrow the original numeric product ID',async()=>{
  const calls=[];
  await assert.rejects(publicPage(normalize(ZIGZAG_ALIAS),async url=>{
    calls.push(url);return redirectResponse('https://pocamarket.com/zh-tw/search/detail/'+ZIGZAG_ID);
  }),{code:'REDIRECT_CONFIRMATION'});
  assert.deepEqual(calls,[ZIGZAG]);
});

test('redirects to login or pages without a product ID are rejected before fetching them',async()=>{
  for(const [input,destination] of [
    [ZIGZAG_ALIAS,'/login'],
    [POCA_LOCALIZED,'/zh-tw/search/detail/']
  ]){
    const calls=[];
    await assert.rejects(publicPage(normalize(input),async url=>{
      calls.push(url);return redirectResponse(destination);
    }),{code:'REDIRECT_CONFIRMATION'});
    assert.deepEqual(calls,[normalize(input).url]);
  }
});

test('lookup sends a Zigzag /p link through the main-product parser and quote calculation',async()=>{
  const calls=[];
  const product=await lookup(ZIGZAG_ALIAS,async url=>{
    calls.push(url);return htmlResponse(zigzagFixture());
  });
  assert.deepEqual(calls,[ZIGZAG]);
  assert.equal(product.id,ZIGZAG_ID);
  assert.equal(product.title,'Fixture shop Synthetic main trousers');
  assert.equal(product.market,'kr');
  assert.equal(product.currency,'KRW');
  assert.equal(product.status,'quoted');
  assert.equal(product.reasonCode,null);
  assert.equal(product.priceKrw,25600);
  assert.equal(product.shippingKrw,0);
  assert.equal(product.priceSourceUrl,ZIGZAG);
  assert.equal(quoteForProduct(product,38)?.totalTwd,728);
});

test('a recognized Zigzag alias still rejects inconsistent primary product data',async()=>{
  let calls=0;
  const product=await lookup(ZIGZAG_ALIAS,async()=>{
    calls++;return htmlResponse(zigzagFixture({id:'125508992'}));
  });
  assert.equal(calls,1);
  assert.equal(product.reasonCode,'PRODUCT_MISMATCH');
  assert.equal(product.priceKrw,null);
  assert.equal(quoteForProduct(product,38),null);
});

test('Poca locale resolution preserves a USD offer without inventing a Korean price or quote',async()=>{
  const calls=[];
  const product=await lookup(POCA,async url=>{
    calls.push(url);
    if(url===POCA)return redirectResponse('/zh-tw/search/detail/'+POCA_ID);
    assert.equal(url,POCA_LOCALIZED,'The global URL must not be replaced by a guessed Korean listing.');
    return htmlResponse(pocaUsdFixture());
  });
  assert.deepEqual(calls,[POCA,POCA_LOCALIZED]);
  assert.equal(product.id,POCA_ID);
  assert.equal(product.url,POCA_LOCALIZED);
  assert.equal(product.market,'global');
  assert.equal(product.title,'Synthetic global photocard');
  assert.equal(product.currency,'USD');
  assert.equal(product.sourcePrice,12.5);
  assert.equal(product.priceKrw,null);
  assert.equal(product.shippingKrw,null);
  assert.equal(product.priceSourceUrl,null);
  assert.equal(product.status,'needs_confirmation');
  assert.equal(product.reasonCode,'DOMESTIC_PRICE_UNAVAILABLE');
  assert.equal(product.domesticResolution.status,'unavailable');
  assert.equal(product.domesticResolution.domesticUrl,null);
  assert.equal(product.domesticResolution.fxConversionUsed,false);
  assert.equal(quoteForProduct(product,38),null);
});
