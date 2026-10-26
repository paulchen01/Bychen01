import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../site/',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const write=(p,s)=>fs.writeFileSync(new URL(p,root),s);
function replace(s,a,b){assert.equal(s.split(a).length,2,a.slice(0,80));return s.replace(a,b);}
assert.ok(read('lib/platforms.mjs').includes("APP_VERSION = '2026-10-19.23'"),'Only update the inspected v23 source');
write('lib/bunjang-links.mjs',`/** Outbound links only. Official Bunjang app interface and product share routes
 * verified 2026-10-26. Actual native handoff depends on app installation and user consent. */
import {normalize} from './platforms.mjs';
export function bunjangLinks(product,userAgent=''){
  if(!product||typeof product.url!=='string')return null;
  try{
    const target=normalize(product.url);
    if(target.platformId!=='bunjang'||target.kind!=='product'||!/^\\d{5,15}$/.test(target.id))return null;
    if(product.platformId&&product.platformId!=='bunjang')return null;
    if(product.id!=null&&String(product.id)!==target.id)return null;
    const id=target.id,web='https://m.bunjang.co.kr/products/'+id;
    const native='bunjang://product?val='+id;
    const android='intent://product?val='+id+'#Intent;scheme=bunjang;package=kr.co.quicket;end';
    return Object.freeze({id,web,native,app:/Android/i.test(userAgent)?android:native});
  }catch{return null;}
}
`);
let app=read('app.js');
app="import {bunjangLinks} from './lib/bunjang-links.mjs';\n"+app;
const marker='function show(p,q,manual=false,{scroll=true}={}){';
app=replace(app,marker,`function clearBunjangLinks(){
  for(const id of ['bunjangApp','bunjangCopy','bunjangOpenHelp'])$(id).hidden=true;
  $('bunjangApp').removeAttribute('href');$('bunjangCopy').removeAttribute('data-url');
}
function showBunjangLinks(product){
  clearBunjangLinks();
  const links=bunjangLinks(product,navigator.userAgent);
  if(!links)return;
  $('source').href=links.web;$('source').textContent='韓國版網頁 ↗';
  $('bunjangApp').href=links.app;$('bunjangApp').hidden=false;
  $('bunjangCopy').dataset.url=links.web;$('bunjangCopy').hidden=false;
  $('bunjangOpenHelp').hidden=false;
  $('bunjangOpenHelp').textContent='已安裝韓國版 번개장터？請點「韓國 App 開啟」，並允許開啟 App。網頁若轉為 USD，請改用 App 核對韓幣價格。';
  $('originalSource').hidden=true;$('originalSource').removeAttribute('href');
}
${marker}`);
app=replace(app,"  $('quoteComplete').hidden=!q;", "  showBunjangLinks(p);\n  $('quoteComplete').hidden=!q;");
app=replace(app,'function reset(){cancelAutoQuote();','function reset(){clearBunjangLinks();cancelAutoQuote();');
app=replace(app,'async function copyText(text){','async function copyText(text,successMessage){');
app=replace(app,"toast(current?.q?'已複製報價內容。':'已複製商品資訊。');", "toast(successMessage||(current?.q?'已複製報價內容。':'已複製商品資訊。'));");
app=replace(app,"$('copy').onclick=()=>current&&copyText(message());",`$('copy').onclick=()=>current&&copyText(message());
$('bunjangCopy').onclick=()=>{const links=current&&bunjangLinks(current.p,navigator.userAgent);if(links)return copyText(links.web,'已複製韓國版商品連結。');};
// Native navigation is a direct user click. Never use delayed web/USD redirects.
$('bunjangApp').addEventListener('click',()=>{
  $('bunjangOpenHelp').textContent='請允許瀏覽器開啟韓國版 번개장터。若沒有反應，請在 Safari／Chrome 開啟本站後再按一次；不會自動改開美元版。';
});`);
write('app.js',app);
let html=read('index.html');
const source='<a id="source" class="source" target="_blank" rel="noopener noreferrer">查看原商品 ↗</a>';
html=replace(html,source,`<div class="product-link-actions">
<a id="bunjangApp" class="bunjang-app" aria-describedby="bunjangOpenHelp" hidden>韓國 App 開啟 ↗</a>
${source}
<button id="bunjangCopy" class="bunjang-copy" type="button" hidden>複製韓國版連結</button>
</div>
<p id="bunjangOpenHelp" class="bunjang-open-help" role="status" hidden></p>`);
html=html.replaceAll('20261019-23','20261026-24').replaceAll('2026-10-19.23','2026-10-26.24');
write('index.html',html);
write('style.css',read('style.css')+`\n/* Korean Bunjang app is the primary product verification action. */
.product-link-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-top:8px}
.product-link-actions .bunjang-app{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:9px 13px;border-radius:10px;background:var(--green,#39734e);color:#fff;text-decoration:none;font-size:14px;font-weight:650;line-height:1.6}
.product-link-actions .source,.bunjang-copy{font-size:12px;line-height:1.6}
.bunjang-copy{background:transparent;border:0;border-bottom:1px solid currentColor;color:var(--muted,#806c5b);padding:7px 0;cursor:pointer}
.bunjang-open-help{font-size:12px;line-height:1.85;color:var(--muted,#806c5b);margin:9px 0 0;overflow-wrap:anywhere}
.product-link-actions .bunjang-app[hidden],.bunjang-copy[hidden],.bunjang-open-help[hidden]{display:none}
.product-link-actions a:focus-visible,.bunjang-copy:focus-visible{outline:2px solid var(--green,#39734e);outline-offset:3px}
`);
let txt=read('lib/quote-text.mjs');
txt="import {bunjangLinks} from './bunjang-links.mjs';\n"+txt;
txt=replace(txt,"url=product.url?normalize(product.url).url:'';","url=product.url?(bunjangLinks(product)?.web||normalize(product.url).url):'';");
txt=replace(txt,"product.domesticResolution?.status==='verified'&&product.originalUrl&&product.originalUrl!==url?", "!bunjangLinks(product)&&product.domesticResolution?.status==='verified'&&product.originalUrl&&product.originalUrl!==url?");
txt=replace(txt,"'商品連結：'+target.url,","'商品連結：'+(bunjangLinks(product)?.web||target.url),");
write('lib/quote-text.mjs',txt);
write('lib/platforms.mjs',replace(read('lib/platforms.mjs'),"APP_VERSION = '2026-10-19.23'","APP_VERSION = '2026-10-26.24'"));
for(const file of ['package.json','package-lock.json']){const p=JSON.parse(read(file));p.version='1.0.24';if(p.packages?.[''])p.packages[''].version='1.0.24';write(file,JSON.stringify(p,null,2)+'\n');}
write('tests/bunjang-links.test.mjs',`import assert from 'node:assert/strict';
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
`);
write('tests/run-tests.mjs',replace(read('tests/run-tests.mjs'),"const files=['bunjang-api.test.mjs'","const files=['bunjang-links.test.mjs','bunjang-api.test.mjs'"));
write('tests/auto-quote.test.mjs',read('tests/auto-quote.test.mjs')+`
for(const [ua,prefix] of [['iPhone','bunjang://product?val='],['Android 14','intent://product?val=']])test('Bunjang app entry is user-initiated and keeps the product on '+ua,async t=>{
 const h=await harness(t);Object.defineProperty(h.w.navigator,'userAgent',{value:ua});
 h.enter(A+'?currency=USD&lang=en');await h.advance(600);h.requests[0].respond(quoted(A+'?currency=USD&lang=en'));await flush();
 assert.equal(h.$('bunjangApp').hidden,false);assert.ok(h.$('bunjangApp').href.startsWith(prefix+'386933481'));
 assert.equal(h.$('bunjangApp').hasAttribute('target'),false);assert.equal(h.$('source').href,A);
 assert.equal(h.$('source').textContent,'韓國版網頁 ↗');assert.equal(h.$('originalSource').hidden,true);assert.equal(h.$('originalSource').hasAttribute('href'),false);
 assert.equal(h.$('total').textContent,'393');assert.equal(h.w.location.hostname,'korea-quote-0908.vercel.app');
 h.$('bunjangCopy').click();await flush();assert.equal(h.copied[0],A);assert.equal(h.$('toast').textContent,'已複製韓國版商品連結。');
 assert.ok(!h.$('quotePreview').textContent.includes('currency=USD'));
 h.$('bunjangApp').addEventListener('click',e=>e.preventDefault());h.$('bunjangApp').click();assert.match(h.$('bunjangOpenHelp').textContent,/Safari／Chrome/);
 await h.advance(5000);assert.equal(h.w.location.hostname,'korea-quote-0908.vercel.app');assert.equal(h.$('total').textContent,'393');
});
test('app links are cleared when switching or manually quoting',async t=>{
 const h=await harness(t);h.enter(A);await h.advance(600);h.requests[0].respond(quoted());await flush();
 h.enter(B);assert.equal(h.$('bunjangApp').hidden,true);assert.equal(h.$('bunjangApp').hasAttribute('href'),false);
 await h.advance(600);h.requests[1].respond(quoted(B));await flush();assert.equal(h.$('bunjangApp').href,'bunjang://product?val=386933482');
 h.$('p').value='25000';h.$('s').value='0';h.$('pf').value='0';h.event('manual','submit');await flush();
 assert.equal(h.$('bunjangApp').hidden,true);assert.equal(h.$('bunjangCopy').hidden,true);assert.equal(h.$('bunjangOpenHelp').hidden,true);assert.equal(h.$('total').textContent,'708');
});
test('other platforms keep their own product links',async t=>{
 const h=await harness(t),url='https://www.musinsa.com/products/1234567';h.enter(url);await h.advance(600);h.requests[0].respond(quoted(url));await flush();
 assert.equal(h.$('bunjangApp').hidden,true);assert.equal(h.$('bunjangCopy').hidden,true);assert.equal(h.$('source').href,url);assert.equal(h.$('source').textContent,'查看原商品 ↗');
});
test('Korean link copy has a selectable clipboard fallback',async t=>{
 const h=await harness(t,'',{clipboardAvailable:false});h.enter(A);await h.advance(600);h.requests[0].respond(quoted());await flush();
 h.$('bunjangCopy').click();await flush();assert.equal(h.$('copyDialog').open,true);assert.equal(h.$('copyText').value,A);assert.equal(h.$('total').textContent,'393');
});
`);
const release=`import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runtimeFiles} from '../site/build.mjs';
import {APP_VERSION} from '../site/lib/platforms.mjs';
import {PRICING_VERSION} from '../site/lib/pricing.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=b=>createHash('sha256').update(b).digest('hex');
const baseBytes=fs.readFileSync(path.join(root,'releases/site-20261019-23.json')),base=JSON.parse(baseBytes);assert.equal(base.version,'2026-10-19.23');
for(const f of base.files)assert.equal(sha(Buffer.from(f.data,f.encoding==='base64'?'base64':'utf8')),base.hashes[f.file],f.file+' baseline integrity');
assert.equal(APP_VERSION,'2026-10-26.24');assert.equal(PRICING_VERSION,'2026-09-15.5');
const source=path.join(root,'site'),files=[...runtimeFiles(source),...['build.mjs','vercel.json','package-lock.json'].map(file=>({file,data:fs.readFileSync(path.join(source,file))}))].sort((a,b)=>a.file.localeCompare(b.file));
const hashes=Object.fromEntries(files.map(({file,data})=>[file,sha(data)]));
const changed=new Set(['app.js','index.html','style.css','lib/platforms.mjs','lib/quote-text.mjs','package.json','package-lock.json']);
for(const [file,digest] of Object.entries(base.hashes))if(!changed.has(file))assert.equal(hashes[file],digest,file+' must retain production behavior');
for(const file of Object.keys(hashes))if(!Object.hasOwn(base.hashes,file))assert.equal(file,'lib/bunjang-links.mjs','Unexpected new runtime file');
for(const {file,data} of files)if(/\\.(?:html|js|mjs|css|svg|txt|xml)$/.test(file))assert(!/\\bLINE\\b|line\\.me|lin\\.ee|oaMessage|fatfatpig_kr|line-qr\\.png|brand\\.webp|lib\\/inquiry\\.mjs/.test(data.toString('utf8')),'Removed contact content returned: '+file);
const release={version:APP_VERSION,changeType:'bunjang-korean-app-links',basedOn:base.version,baselineSha256:sha(baseBytes),pricingVersion:PRICING_VERSION,behavior:{...base.behavior,bunjangProductLinks:'korean-native-app-and-clean-web',nativeAppLaunchRequiresUserGesture:true,automaticUsdRedirect:false},hashes,files:files.map(({file,data})=>({file,encoding:'base64',data:data.toString('base64')}))};
const bytes=Buffer.from(JSON.stringify(release)),destination=path.join(root,'releases/site-20261026-24.json');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(destination).toString(),bytes.toString(),'Saved release differs from tested source');else fs.writeFileSync(destination,bytes);
console.log(JSON.stringify({version:APP_VERSION,files:files.length,releaseSha256:sha(bytes),productionVerified:false,nativeDeviceVerified:false,action:process.argv.includes('--check')?'verified':'saved'}));
`;
fs.writeFileSync(new URL('./release.mjs',import.meta.url),release);
const note=`## v24 韓國 App 商品開啟（候選，尚待正式發布）

新增「韓國 App 開啟」、乾淨的韓國網頁與複製連結。Bunjang 結果不再顯示國際版原連結，複製報價同步清理幣別／語言／追蹤參數。所有連結使用同一商品編號。價格、運費、匯率及代購費邏輯保持原樣。

官方依據（2026-10-26）：主程式 https://m.bunjang.co.kr/static/js/index.C2oRMW-u.js 的 bunjang:// 與 goToProduct；官方商品分享連結 https://go.bgzt.link/remg97j 與 https://go.bgzt.link/mendsu7 分別轉向 https://bunjang.airbridge.io/goto?type=product&val=386933481 與 val=423628860（省略追蹤參數）；https://m.bunjang.co.kr/.well-known/assetlinks.json 宣告 Android 套件 kr.co.quicket。本站直接使用 product 路由及 val，不依賴臨時分享連結，也不自動轉往全球版。

原生 App 接管仍需手機已安裝韓國版 App 並允許瀏覽器開啟；模擬瀏覽器測試不等於真實手機 App 驗證。發布使用 node korea-quote/scripts/release.mjs，逐檔比對 v23 保留計算與資料來源。

`;
write('README.md',read('README.md').replace('# 廢廢豬韓國代購報價系統\n','# 廢廢豬韓國代購報價系統\n\n'+note));
console.log('Prepared v24 Korean app product links; production has NOT been deployed.');
