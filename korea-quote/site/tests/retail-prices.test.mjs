import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseOliveYoungReader} from '../lib/retail.mjs';
import {quoteForProduct} from '../lib/estimate.mjs';
import {withPlatformFee} from '../lib/platform-fee.mjs';
import {lookup} from '../api/quote.js';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/oliveyoung-A000000260412.json',import.meta.url),'utf8'));
const INPUT=fixture.reader.data.url;
const sample=transform=>{
 const r=structuredClone(fixture.reader);
 if(transform)r.data.content=transform(r.data.content);
 return r;
};
const parse=transform=>parseOliveYoungReader(sample(transform),INPUT);
const sale='세일 (26.10.01 ~ 26.11.28)-9,500원';
const withoutCoupon=text=>text.replace(/^\*[^\n]*쿠폰[^\n]*\n/gm,'');
const failing=code=>error=>error?.code===code;

test('live Olive Young benefits retain the ordinary sale and exclude the coupon',()=>{
 const p=withPlatformFee(parse());
 assert.equal(p.priceKrw,17500);assert.equal(p.sourcePrice,17500);
 assert.equal(p.couponExcluded,true);assert.equal(p.shippingKrw,2500);
 assert.match(p.evidence.price,/27,000원.*9,500원/);
 assert.equal(p.priceKrw,fixture.provenance.crossCheck.promotionSalePrice);
 assert.notEqual(p.priceKrw,fixture.provenance.crossCheck.finalPriceWithCoupon);
 const q=quoteForProduct(p,38);
 assert.equal(q.subtotalKrw,20000);assert.equal(q.totalTwd,577);
 assert.equal(q.platformFeeKrw,null);assert.equal(q.platformFeeExcluded,true);
});

test('public sale without a coupon must agree with the displayed price',()=>{
 const p=parse(text=>withoutCoupon(text).replaceAll('16,900','17,500'));
 assert.equal(p.priceKrw,17500);assert.equal(p.couponExcluded,false);
 assert.equal(p.shippingKrw,2500);
});

test('coupon-only benefits fall back to the verified ordinary list price',()=>{
 const p=parse(text=>text.replace(/^\*[^\n]*세일[^\n]*\n/gm,''));
 assert.equal(p.priceKrw,27000);assert.equal(p.shippingKrw,0);
 assert.equal(p.couponExcluded,true);
 assert.doesNotMatch(p.notice,/已計入可核對的一般特價/);
});

test('an ordinary display without a benefit breakdown remains readable',()=>{
 const p=parse(text=>text.replace(/\*\*혜택정보\*\*[\s\S]*?(?=팝업 닫기)/,'').replace('16,900','23,500'));
 assert.equal(p.priceKrw,23500);assert.equal(p.shippingKrw,0);
 assert.equal(quoteForProduct(p,38).totalTwd,669);
});

test('sale breakdown without its own list price is not guessed',()=>{
 assert.throws(()=>parse(text=>text.replace(/^\*[^\n]*판매가[^\n]*\n/gm,'')),failing('PRICE_AMBIGUOUS'));
});

test('a displayed price above the ordinary sale conflicts with the breakdown',()=>{
 assert.throws(()=>parse(text=>text.replaceAll('16,900','18,000')),failing('PRICE_CONFLICT'));
});

test('a lower display without an identified conditional benefit is ambiguous',()=>{
 assert.throws(()=>parse(withoutCoupon),failing('PRICE_CONFLICT'));
});

test('percentage or unrecognized sale lines are not converted to won discounts',()=>{
 for(const replacement of ['세일 35%','세일 (특별 조건)-9,500원','세일 -0원'])
  assert.throws(()=>parse(text=>text.replace(sale,replacement)),error=>['PRICE_AMBIGUOUS','PRICE_CONFLICT'].includes(error.code));
});

test('member, first-purchase, card and coupon sale labels cannot become public discounts',()=>{
 for(const condition of ['회원 전용','첫 구매','카드 결제','쿠폰 적용'])
  assert.throws(()=>parse(text=>text.replace(sale,`세일 (${condition})-9,500원`)),failing('PRICE_AMBIGUOUS'));
});

test('different ordinary discount rows cannot be combined or selected arbitrarily',()=>{
 assert.throws(()=>parse(text=>text.replace(sale,sale+'\n* 세일 -8,000원')),failing('PRICE_AMBIGUOUS'));
});

test('a repeated identical benefit row is subtracted only once',()=>{
 assert.equal(parse(text=>text.replace(sale,sale+'\n* '+sale)).priceKrw,17500);
});

test('coupons in navigation and recommendations do not alter the primary product price',()=>{
 const p=parse(text=>'회원 쿠폰 50%\n\n'+withoutCoupon(text).replaceAll('16,900','17,500')+'\n추천 상품\n쿠폰 1,000원\n판매가 99,000원');
 assert.equal(p.priceKrw,17500);assert.equal(p.couponExcluded,false);
});

test('an unpublished shipping fee stays unknown and is disclosed as excluded',()=>{
 const p=parse(text=>text.replace(/일반배송[^\n]+/,''));
 assert.equal(p.shippingKrw,null);assert.equal(p.reasonCode,'SHIPPING_UNKNOWN');
 const q=quoteForProduct(p,38);
 assert.equal(q.shippingKrw,null);assert.equal(q.shippingExcluded,true);
});

test('another product URL or image does not establish this product price',()=>{
 const r=sample();r.data.url=INPUT.replace('260412','165177');
 assert.throws(()=>parseOliveYoungReader(r,INPUT),failing('PRODUCT_MISMATCH'));
 const p=parse(text=>text.replaceAll('A000000260412','A000000165177'));
 assert.equal(p.reasonCode,'PRODUCT_NOT_FOUND');assert.equal(quoteForProduct(p,38),null);
});

test('automatic lookup applies the same price and shipping decision',async()=>{
 const calls=[];
 const p=await lookup(INPUT,async url=>{
  calls.push(url);
  return new Response(JSON.stringify(sample()),{headers:{'content-type':'application/json'}});
 });
 assert.deepEqual(calls,['https://r.jina.ai/'+INPUT]);
 assert.equal(p.priceKrw,17500);assert.equal(p.shippingKrw,2500);
 assert.equal(quoteForProduct(p,38).totalTwd,577);
});

test('lookup converts a conditional-sale ambiguity into a stopped quote',async()=>{
 const p=await lookup(INPUT,async()=>new Response(JSON.stringify(sample(text=>text.replace(sale,'세일 (회원 전용)-9,500원')))));
 assert.equal(p.reasonCode,'PRICE_AMBIGUOUS');assert.equal(p.priceKrw,null);
 assert.equal(quoteForProduct(p,38),null);
});
