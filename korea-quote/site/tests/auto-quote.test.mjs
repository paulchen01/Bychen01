/**
 * Interaction tests execute the unmodified app.js ES module against the real index.html.
 * Uses the project's jsdom devDependency when installed. Alternatively, install test-only
 * DOM tooling outside the release, then run:
 *   npm install --prefix /tmp/quote-ui-tools --ignore-scripts --no-audit --no-fund jsdom@30.1.3
 *   node --experimental-vm-modules --test tests/auto-quote.test.mjs
 * QUOTE_UI_TOOLS may point to another directory containing the test-only jsdom install.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {normalize, APP_VERSION} from '../lib/platforms.mjs';
import {quoteForProduct} from '../lib/estimate.mjs';

function domTooling(){
  if(process.env.QUOTE_UI_TOOLS)return createRequire(path.join(process.env.QUOTE_UI_TOOLS,'package.json'))('jsdom');
  const requireProject=createRequire(import.meta.url);
  try{return requireProject('jsdom');}catch(error){
    if(error.code!=='MODULE_NOT_FOUND')throw error;
    return createRequire('/tmp/quote-ui-tools/package.json')('jsdom');
  }
}
const {JSDOM}=domTooling();
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const HTML=readFileSync(path.join(ROOT,'index.html'),'utf8');
const A='https://m.bunjang.co.kr/products/386933481';
const B='https://m.bunjang.co.kr/products/386933482';
const LINK='https://m.bunjang.co.kr/item/shared-example';
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function rate(){return {exchangeRate:38,checkedAt:new Date().toISOString(),source:'google_sheets'};}
function quoted(url=A,extra={}){
  const p={...normalize(url),title:url===B?'商品 B':'商品 A',status:'quoted',currency:'KRW',priceKrw:10000,shippingKrw:3000,platformFeeKrw:0,originalUrl:url,priceSourceUrl:url,fetchedAt:new Date().toISOString(),...extra};
  const q=quoteForProduct(p,38);
  return {ok:true,version:APP_VERSION,status:q.shippingExcluded||q.platformFeeExcluded?'estimated':'quoted',product:p,quote:q,rate:rate()};
}
function resolved(method='official_redirect'){
  return quoted(A,{originalUrl:LINK,linkResolution:{status:'verified',method,inputUrl:LINK,resolvedUrl:A,productId:'386933481'}});
}

async function harness(t,query=''){
  assert.equal(typeof vm.SourceTextModule,'function','Run with node --experimental-vm-modules.');
  const dom=new JSDOM(HTML,{url:'https://korea-quote-0908.vercel.app/'+query,runScripts:'outside-only'});
  const w=dom.window,requests=[],timers=new Map();
  let now=0,timerId=0;
  w.AbortController=AbortController;
  w.AbortSignal=AbortSignal;
  w.matchMedia=()=>({matches:false});
  w.HTMLElement.prototype.scrollIntoView=function(){};
  w.setTimeout=(fn,delay=0,...args)=>{
    const id=++timerId;timers.set(id,{at:now+Math.max(0,Number(delay)||0),run:()=>fn(...args)});return id;
  };
  w.clearTimeout=id=>timers.delete(id);
  w.setInterval=()=>++timerId;
  w.clearInterval=()=>{};
  w.fetch=(url,options={})=>{
    if(url==='/api/rate')return Promise.resolve(new Response(JSON.stringify({ok:true,version:APP_VERSION,...rate()}),{headers:{'content-type':'application/json'}}));
    assert.ok(String(url).startsWith('/api/quote?url='),'Only the same-origin quotation endpoint may be called.');
    let resolve,reject;
    const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
    requests.push({url:new URL(url,w.location.origin).searchParams.get('url'),signal:options.signal,
      respond:data=>resolve(new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})),reject});
    // The mock intentionally permits late responses after abort to exercise the serial guard.
    return promise;
  };
  const context=dom.getInternalVMContext(),modules=new Map();
  function sourceModule(url){
    if(modules.has(url))return modules.get(url);
    const mod=new vm.SourceTextModule(readFileSync(fileURLToPath(url),'utf8'),{context,identifier:url});
    modules.set(url,mod);return mod;
  }
  const entry=sourceModule(pathToFileURL(path.join(ROOT,'app.js')).href);
  await entry.link((specifier,ref)=>sourceModule(new URL(specifier,ref.identifier).href));
  await entry.evaluate();
  await flush();
  t.after(()=>{timers.clear();dom.window.close();});
  const $=id=>w.document.getElementById(id);
  const event=(id,type)=>$(id).dispatchEvent(new w.Event(type,{bubbles:true,cancelable:true}));
  const enter=(value,type='input')=>{$('url').value=value;event('url',type);};
  async function advance(ms){
    const end=now+ms;
    for(;;){
      const next=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
      if(!next)break;
      timers.delete(next[0]);now=next[1].at;next[1].run();await flush();
    }
    now=end;await flush();
  }
  return {w,$,requests,event,enter,advance};
}

test('paste, input and change debounce to one automatic quote and show the verified amount',async t=>{
  const h=await harness(t);
  h.enter('推薦商品 https://www.bunjang.co.kr/product/386933481?utm_source=test','paste');
  h.event('url','input');h.event('url','change');
  await h.advance(599);assert.equal(h.requests.length,0);
  await h.advance(1);assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].url,A);
  assert.equal(h.$('go').disabled,true);
  h.event('url','change');await h.advance(600);assert.equal(h.requests.length,1);
  h.requests[0].respond(quoted());await flush();
  assert.equal(h.$('result').hidden,false);
  assert.equal(h.$('title').textContent,'商品 A');
  assert.equal(h.$('total').textContent,'393');
  assert.equal(h.$('go').disabled,false);
});

test('pressing the existing quote button cancels a queued automatic submit',async t=>{
  const h=await harness(t);
  h.enter(A);await h.advance(250);
  h.$('go').click();await flush();
  assert.equal(h.requests.length,1);
  await h.advance(1000);assert.equal(h.requests.length,1);
  h.requests[0].respond(quoted());await flush();
  assert.equal(h.$('total').textContent,'393');
});

test('a replacement link aborts the old request immediately and ignores its late reply',async t=>{
  const h=await harness(t);
  h.enter(A);await h.advance(600);
  const first=h.requests[0];
  h.enter(B);
  assert.equal(first.signal.aborted,true);
  assert.equal(h.$('result').hidden,true);
  assert.equal(h.$('go').disabled,false);
  await h.advance(600);assert.equal(h.requests.length,2);
  h.requests[1].respond(quoted(B));await flush();
  assert.equal(h.$('title').textContent,'商品 B');
  first.respond(quoted(A));await flush();
  assert.equal(h.$('title').textContent,'商品 B');
  assert.equal(h.$('source').href,B);
  assert.equal(h.$('error').hidden,true);
});

test('a changed or cleared input removes the previous quotation before any new request',async t=>{
  const h=await harness(t);
  h.enter(A);await h.advance(600);
  h.requests[0].respond(quoted());await flush();
  assert.equal(h.$('result').hidden,false);
  h.enter('');
  assert.equal(h.$('result').hidden,true);
  assert.equal(h.$('empty').hidden,false);
  assert.equal(h.$('barPrice').textContent,'@fatfatpig_kr');
  await h.advance(1000);assert.equal(h.requests.length,1);
});

test('a change event alone starts quoting and cancels an outdated request',async t=>{
  const h=await harness(t);
  h.enter(A,'change');await h.advance(600);
  h.enter(B,'change');assert.equal(h.requests[0].signal.aborted,true);
  h.requests[0].reject(new DOMException('Aborted','AbortError'));await flush();
  assert.equal(h.$('error').hidden,true);
  await h.advance(600);assert.equal(h.requests.length,2);
});

test('a product URL in the opening query is automatically requested',async t=>{
  const h=await harness(t,'?product='+encodeURIComponent(A));
  assert.equal(h.$('url').value,A);
  await h.advance(600);
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].url,A);
});

test('the manual amount calculator cancels pending automatic lookup',async t=>{
  const h=await harness(t);
  h.enter(A);await h.advance(200);
  h.$('p').value='10000';h.$('s').value='3000';h.$('pf').value='0';
  h.event('manual','submit');await flush();
  await h.advance(1000);
  assert.equal(h.requests.length,0);
  assert.equal(h.$('title').textContent,'自訂商品');
  assert.equal(h.$('total').textContent,'393');
});

for(const [name,url,type] of [
  ['another supported product','https://www.musinsa.com/products/1234567','input'],
  ['a public post','https://x.com/seller/status/123456789012','change'],
  ['a supported short link','https://naver.me/TestLink1','paste'],
  ['a first-party Bunjang route requiring resolution',LINK,'input']
])test('automatically accepts '+name,async t=>{
  const h=await harness(t);h.enter(url,type);await h.advance(600);
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,normalize(url).url);
});

for(const [name,url] of [
  ['multiple separate URLs',A+' '+B],
  ['multiple concatenated URLs',A+B],
  ['an unknown site','https://example.com/products/386933481'],
  ['an incomplete URL','https://'],
  ['a platform home page','https://m.bunjang.co.kr/'],
  ['a shopping cart','https://www.musinsa.com/order/cart'],
  ['conflicting product identifiers',A+'?pid=386933482']
])test('does not auto-submit '+name,async t=>{
  const h=await harness(t);h.enter(url);await h.advance(1000);
  assert.equal(h.requests.length,0);
});

test('a multiple-URL opening query is not automatically submitted',async t=>{
  const h=await harness(t,'?product='+encodeURIComponent(A+' '+B));
  await h.advance(1000);assert.equal(h.requests.length,0);
});

for(const method of ['official_redirect','official_canonical'])test('accepts a fully verified Bunjang '+method+' chain',async t=>{
  const h=await harness(t);h.enter(LINK);await h.advance(600);
  h.requests[0].respond(resolved(method));await flush();
  assert.equal(h.$('error').hidden,true);
  assert.equal(h.$('result').hidden,false);
  assert.equal(h.$('source').href,A);
  assert.equal(h.$('total').textContent,'393');
});

for(const [name,mutate] of [
  ['missing proof',d=>delete d.product.linkResolution],
  ['unverified status',d=>d.product.linkResolution.status='unavailable'],
  ['an unsupported resolution method',d=>d.product.linkResolution.method='title_guess'],
  ['a different original link',d=>d.product.linkResolution.inputUrl='https://m.bunjang.co.kr/item/other'],
  ['a different resolved product',d=>d.product.linkResolution.resolvedUrl=B],
  ['a mismatching proof product ID',d=>d.product.linkResolution.productId='386933482'],
  ['a mismatching product ID',d=>d.product.id='386933482'],
  ['a foreign price source',d=>d.product.priceSourceUrl='https://www.musinsa.com/products/1234567'],
  ['a different original URL',d=>d.product.originalUrl='https://m.bunjang.co.kr/item/other']
])test('rejects resolved Bunjang output with '+name,async t=>{
  const h=await harness(t);h.enter(LINK);await h.advance(600);
  const data=resolved();mutate(data);h.requests[0].respond(data);await flush();
  assert.equal(h.$('result').hidden,true);
  assert.equal(h.$('error').hidden,false);
  assert.match(h.$('error').textContent,/商品來源不一致/);
});

test('a proof cannot replace an already known product ID with another product',async t=>{
  const h=await harness(t);h.enter(A);await h.advance(600);
  h.requests[0].respond(quoted(B,{originalUrl:A,linkResolution:{status:'verified',method:'official_redirect',inputUrl:A,resolvedUrl:B,productId:'386933482'}}));await flush();
  assert.equal(h.$('result').hidden,true);
  assert.match(h.$('error').textContent,/商品來源不一致/);
});

test('an unresolved Bunjang link may show confirmation but cannot claim a quote',async t=>{
  const h=await harness(t);h.enter(LINK);await h.advance(600);
  h.requests[0].respond({ok:true,version:APP_VERSION,status:'needs_confirmation',quote:null,product:{...normalize(LINK),title:'待確認的連結',currency:null,notice:'尚未確認商品連結。'}});await flush();
  assert.equal(h.$('result').hidden,false);
  assert.equal(h.$('quoteComplete').hidden,true);
  assert.equal(h.$('pendingBlock').hidden,false);
  assert.equal(h.$('error').hidden,true);
});

test('a link that has not resolved to a product cannot display a monetary quote',async t=>{
  const h=await harness(t);h.enter(LINK);await h.advance(600);
  const data=quoted(A);
  Object.assign(data.product,normalize(LINK),{originalUrl:LINK,priceSourceUrl:LINK});
  h.requests[0].respond(data);await flush();
  assert.equal(h.$('result').hidden,true);
  assert.match(h.$('error').textContent,/商品來源不一致/);
});

test('the existing Naver short-link behavior still accepts its resolved product',async t=>{
  const h=await harness(t);h.enter('https://naver.me/TestLink1');await h.advance(600);
  const url='https://smartstore.naver.com/store/products/123456789';
  h.requests[0].respond(quoted(url));await flush();
  assert.equal(h.$('error').hidden,true);
  assert.equal(h.$('source').href,url);
  assert.equal(h.$('result').hidden,false);
});

test('the page advertises automatic lookup and references the new release assets',()=>{
  assert.ok(HTML.includes('貼上完整商品連結，即可自動查價。'));
  assert.ok(HTML.includes('/app.js?v=20261017-22'));
  assert.ok(HTML.includes('/smartstore-beta.js?v=20261017-22'));
  assert.ok(HTML.includes('/style.css?v=20261017-22'));
  assert.ok(HTML.includes('<span id="version">2026-10-17.22</span>'));
});
