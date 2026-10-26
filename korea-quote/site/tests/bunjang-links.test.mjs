import assert from 'node:assert/strict';
import test from 'node:test';
import {bunjangLinks} from '../lib/bunjang-links.mjs';
const id='386933481',web='https://m.bunjang.co.kr/products/'+id;
for(const url of [web,web+'?currency=USD&lang=en&locale=en-US#tracking','https://www.bunjang.co.kr/product/'+id+'?ref=hello','https://globalbunjang.com/product/'+id+'?currency=USD']){
 test('links keep same product and remove web preferences: '+url,()=>{
  const p={platformId:'bunjang',id,url},before=JSON.stringify(p),l=bunjangLinks(p,'iPhone');
  assert.equal(l.web,web);assert.equal(l.native,'bunjang://product?val='+id);assert.equal(l.app,l.native);
  assert.equal(JSON.stringify(p),before);assert.equal(new URL(l.web).search,'');
 });
}
test('Android uses the official Korean package',()=>assert.equal(bunjangLinks({url:web},'Android 14').app,'intent://product?val='+id+'#Intent;scheme=bunjang;package=kr.co.quicket;end'));
for(const p of [null,{}, {url:'https://example.com/products/'+id},{url:web,id:'999999999'},{url:web,platformId:'fruits'},{url:web+'?pid=999999999'},{url:'javascript:alert(1)'},{url:'https://m.bunjang.co.kr/item/unknown'},{url:'https://m.bunjang.co.kr'},{url:'https://m.bunjang.co.kr.evil.example/products/'+id},{url:'https://user@bunjang.co.kr/products/'+id}])test('reject unsafe or unidentified product '+JSON.stringify(p),()=>assert.equal(bunjangLinks(p),null));
