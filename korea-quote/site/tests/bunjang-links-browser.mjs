import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {normalize,APP_VERSION} from '../lib/platforms.mjs';
import {quoteForProduct} from '../lib/estimate.mjs';
const {chromium}=createRequire('/tmp/pig-browser/package.json')('playwright');
const report={version:APP_VERSION,productionDeployed:false,nativeDeviceVerified:false,scope:'candidate Chromium UI with synthetic product/rate data; native links inspected, not launched',browser:[]};
let rate=38;const A='https://m.bunjang.co.kr/products/386933481';
const rateData=()=>({exchangeRate:rate,checkedAt:new Date().toISOString(),source:'google_sheets'});
fs.mkdirSync('evidence',{recursive:true});
const server=http.createServer((req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:8765');
 if(u.pathname==='/api/rate'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({ok:true,version:APP_VERSION,...rateData()}));}
 if(u.pathname==='/api/quote'){
  const t=normalize(u.searchParams.get('url'));
  const p={...t,url:A,title:'閃電拍賣｜商品開啟測試',status:'quoted',currency:'KRW',priceKrw:64000,shippingKrw:0,platformFeeKrw:null,originalUrl:t.url,fetchedAt:new Date().toISOString()};
  const q=quoteForProduct(p,rate);assert.ok(q,'Synthetic product fixture must meet the same validation rules as real products');
  res.setHeader('content-type','application/json');return res.end(JSON.stringify({ok:true,version:APP_VERSION,status:q.shippingExcluded||q.platformFeeExcluded?'estimated':'quoted',product:p,quote:q,rate:rateData()}));
 }
 const rel=u.pathname==='/'?'index.html':u.pathname.slice(1);if(rel.includes('..'))throw Error('Invalid path');
 const file=path.join('.vercel/output/static',rel),types={'.js':'application/javascript','.mjs':'application/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'};
 res.setHeader('content-type',types[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));
}catch(e){console.error(e.message);res.statusCode=404;res.end('Not found');}});
await new Promise(r=>server.listen(8765,'127.0.0.1',r));
let browser,page;
try{
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 for(const [width,ua] of [[320,'iPhone'],[393,'iPhone'],[393,'Android 14'],[1440,'desktop']]){
  rate=38;const c=await browser.newContext({viewport:{width,height:1000},userAgent:ua,permissions:['clipboard-read','clipboard-write']});page=await c.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdn.jsdelivr.net/**',r=>r.abort());await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('rate').textContent==='38');
  await page.locator('#url').fill(A+'?currency=USD&lang=en');await page.locator('#result:not([hidden])').waitFor({timeout:15000});
  assert.equal(await page.locator('#source').getAttribute('href'),A);
  const appLink=await page.locator('#bunjangApp').getAttribute('href');assert.equal(appLink,ua.startsWith('Android')?'intent://product?val=386933481#Intent;scheme=bunjang;package=kr.co.quicket;end':'bunjang://product?val=386933481');
  assert.equal(await page.locator('#total').innerText(),'1,819');assert.equal(await page.locator('#originalSource').isVisible(),false);
  await page.locator('#bunjangCopy').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),A);
  await page.evaluate(()=>document.getElementById('bunjangApp').addEventListener('click',e=>e.preventDefault()));await page.locator('#bunjangApp').click();assert.ok((await page.locator('#bunjangOpenHelp').innerText()).includes('Safari／Chrome'));
  rate=37.8;await page.locator('#refreshRate').click();await page.waitForFunction(()=>document.getElementById('rate').textContent==='37.8');assert.equal(await page.locator('#quoteRate').innerText(),'38');
  await page.locator('#reprice').click();await page.waitForFunction(()=>document.getElementById('quoteRate').textContent==='37.8');
  assert.equal(await page.locator('#bunjangApp').getAttribute('href'),appLink);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.locator('.product-head').screenshot({path:'evidence/bunjang-link-'+width+'-'+ua.replace(/ /g,'-')+'.png'});
  report.browser.push({width,userAgent:ua,appLink,webLink:A,copyPassed:true,rateSynchronizationPreserved:true,noOverflow:true});await c.close();page=null;
 }
 report.passed=true;console.log('CANDIDATE_LINK_UI_PASSED',JSON.stringify(report));
}catch(e){report.passed=false;report.error=e.message;if(page){report.pageError=await page.locator('#error').textContent().catch(()=>'');await page.screenshot({path:'evidence/ui-failure.png',fullPage:true}).catch(()=>{});}throw e;}
finally{fs.writeFileSync('evidence/bunjang-links-report.json',JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));}
