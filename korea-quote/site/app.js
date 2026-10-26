import {bunjangLinks} from './lib/bunjang-links.mjs';
import {platformFeeText} from './lib/platform-fee.mjs';
import {normalize,safeImage,APP_VERSION as VERSION} from './lib/platforms.mjs';
import {PRICING_VERSION,validateRate,FEE_TIERS} from './lib/pricing.mjs';
import {quoteForProduct,estimateFromAmounts,estimateFormula,estimateFee} from './lib/estimate.mjs';
import {validDomesticProof} from './lib/domestic.mjs';
import {quoteText,pendingProductText} from './lib/quote-text.mjs';
const $=id=>document.getElementById(id),fmt=n=>new Intl.NumberFormat('zh-TW').format(n),money=n=>'NT$ '+n.toFixed(2);
let current=null,serial=0,controller=null,toastTimer,latestRate=null,rateRequest=null,autoQuoteTimer=null,lastUrlValue=$('url').value;
const AUTO_QUOTE_DELAY=600;
const scrollTo=el=>el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2800);}
function message(){return current?(current.q?quoteText(current.p,current.q,{manual:current.manual,note:$('requestNote').value}):pendingProductText(current.p,{note:$('requestNote').value})):'';}
function updateReport(){if(current)$('quotePreview').textContent=message();}
function updateBar(){if(current){$('barHint').textContent=current.q?(current.q.shippingExcluded?'商品粗估・未含韓國運費':'預估代購金額'):'商品資訊尚待確認';$('barPrice').textContent=current.q?'NT$'+fmt(current.q.totalTwd):'尚未產生報價';$('barAction').textContent=current.q?'複製報價':'複製商品資訊';}else{$('barHint').textContent='貼上商品網址，即可試算';$('barPrice').textContent='韓幣 → 台幣';$('barAction').textContent='開始報價';}}
function detected(){let t;try{t=normalize($('url').value);}catch{}$('detected').hidden=!t;if(t)$('detected').textContent='✓ 已辨識 '+t.platformName+(t.market==='global'?' · 將查找韓國版原價':'')+(t.kind==='short'?' · 分享短網址':t.kind==='link'?' · 將確認商品連結':t.kind==='cart'?' · 購物車請提供個別商品':t.kind==='page'?' · 請提供單一商品頁':'');return t;}
function cancelAutoQuote(){clearTimeout(autoQuoteTimer);autoQuoteTimer=null;}
function autoQuoteTarget(raw){
  // A share message may contain one URL; multiple URLs must never select a product silently.
  if((raw.match(/https?:\/\//gi)||[]).length>1)return null;
  try{const target=normalize(raw);return ['product','post','short'].includes(target.kind)||(target.platformId==='bunjang'&&target.kind==='link')?target:null;}catch{return null;}
}
function urlChanged(){
  const raw=$('url').value;if(raw===lastUrlValue)return;lastUrlValue=raw;
  reset();$('normalized').hidden=true;detected();
  if(!autoQuoteTarget(raw))return;
  const token=serial;
  autoQuoteTimer=setTimeout(()=>{
    autoQuoteTimer=null;
    if(token!==serial||$('url').value!==raw||!autoQuoteTarget(raw))return;
    $('form').requestSubmit();
  },AUTO_QUOTE_DELAY);
}
function validBunjangLinkProof(p,input,actual){
  const proof=p?.linkResolution;
  if(input.platformId!=='bunjang'||input.market!=='kr'||input.kind!=='link'||p.platformId!=='bunjang'||actual.platformId!=='bunjang'||actual.market!=='kr'||actual.kind!=='product')return false;
  if(proof?.status!=='verified'||!['official_redirect','official_canonical'].includes(proof.method)||proof.productId!==actual.id||p.id!==actual.id)return false;
  try{
    const source=normalize(proof.inputUrl),resolved=normalize(proof.resolvedUrl);
    return source.url===input.url&&source.kind==='link'&&resolved.url===actual.url&&resolved.key===actual.key
      &&(!p.originalUrl||normalize(p.originalUrl).url===input.url)
      &&(!p.priceSourceUrl||normalize(p.priceSourceUrl).url===actual.url);
  }catch{return false;}
}
function clearBunjangLinks(){
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
function show(p,q,manual=false,{scroll=true}={}){
  current={p,q,manual};const excluded=q?.shippingExcluded===true,feeExcluded=q?.platformFeeExcluded===true;$('result').hidden=false;$('empty').hidden=true;
  $('resultStatus').textContent=q?'YOUR FIND, YOUR QUOTE':'PRODUCT DETAILS';
  $('tag').textContent=manual?'手動試算 · 依輸入金額計算，尚未確認原商品價格':q?'✓ '+(p.platformName||'商品')+(excluded?' · 商品粗估，未含韓國運費':' · 已取得售價與韓國運費'):(p.platformName||'商品')+' · 資料待確認';
  $('tag').classList.toggle('manual-tag',manual||!q);$('title').textContent=p.title;$('source').hidden=!p.url;if(p.url)$('source').href=normalize(p.url).url;
  $('image').hidden=!safeImage(p.image);if(safeImage(p.image))$('image').src=p.image;else $('image').removeAttribute('src');
  const resolution=p.domesticResolution;
  $('domesticProof').hidden=!resolution;
  $('domesticProof').classList.toggle('unresolved',resolution?.status!=='verified');
  $('domesticProofText').textContent=resolution?.status==='verified'?'已取得同款韓國版原價（KRW），不是由美金換算。':resolution?'已檢查韓國版；尚無可核對的韓幣原價。':'';
  $('source').textContent=resolution?.status==='verified'?'查看韓國版原商品 ↗':'查看原商品 ↗';
  $('originalSource').hidden=resolution?.status!=='verified'||!p.originalUrl||p.originalUrl===p.url;
  if(!$('originalSource').hidden)$('originalSource').href=normalize(p.originalUrl).url;
  showBunjangLinks(p);
  $('quoteComplete').hidden=!q;$('pendingBlock').hidden=!!q;
  if(q){
    $('total').textContent=fmt(q.totalTwd);$('price').textContent='₩'+fmt(q.priceKrw);$('shipping').textContent=excluded?'未標示，本次未計入':'₩'+fmt(q.shippingKrw)+(q.shippingKrw===0?'（免運）':'');
    $('priceHeading').textContent=excluded?'商品粗估（未含韓國運費）':'預估代購金額';$('priceScope').textContent=excluded?'含商品款及代購費；未含韓國境內運費。':'含商品款、韓國境內運費及代購費。';
    $('platformFee').textContent=platformFeeText(q.platformFeeKrw);
    $('platformFee').classList.toggle('unknown-fee',feeExcluded);
    $('platformFeeNote').textContent=feeExcluded?(p.platformFeeNotice||'未標示，本次未計入。')+' 此為韓國平台費，與廢廢豬代購費不同。':'韓國平台費僅按原額除以'+q.exchangeRate+'加回，不重複加收代購費。';
    if(feeExcluded)$('priceScope').textContent+=' 未含尚未標示的平台手續費。';
    else if(q.platformFeeKrw>0)$('priceScope').textContent+=' 已含韓國平台手續費。';
    $('shippingNote').hidden=!excluded;
    $('base').textContent=money(q.baseTwd);$('fee').textContent=money(q.serviceTwd);$('feeLabel').textContent=estimateFee(q);$('subtotal').textContent='₩'+fmt(q.subtotalKrw);
    $('tierApplied').textContent='套用區間：'+q.tierRange+' · '+q.serviceLabel;$('quoteRate').textContent=q.exchangeRate;$('math').textContent=estimateFormula(q,{grouped:true})+'；合計無條件進位至整數元。';
  }else{
    for(const id of ['total','price','shipping','subtotal','base','fee','math','tierApplied'])$(id).textContent='';
    $('pendingReason').textContent=p.notice||'商品售價與韓國運費尚待確認。';
    $('knownPrice').textContent=Number.isSafeInteger(p.priceKrw)?'₩'+fmt(p.priceKrw):typeof p.sourcePrice==='number'&&p.currency?p.sourcePrice+' '+p.currency:'待確認';
    $('knownPlatformFee').textContent=platformFeeText(p.platformFeeKrw);
    $('knownShipping').textContent=Number.isSafeInteger(p.shippingKrw)?'₩'+fmt(p.shippingKrw):'待確認';
  }
  document.querySelectorAll('[data-tier]').forEach(row=>row.classList.toggle('active-tier',row.dataset.tier===q?.tierId));
  $('productWarning').hidden=!q||!p.notice;if(q&&p.notice)$('productWarning').textContent=p.notice;
  $('copy').textContent=q?'複製報價':'複製商品資訊';
  $('time').textContent=(manual?'試算':'查詢')+'時間：'+new Date(p.fetchedAt||p.checkedAt||Date.now()).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})+'（台灣）'+(p.fromCache?' · 短時間快取':'');
  $('discountNotice').hidden=!p.discountNotice;$('discountNotice').textContent=p.discountNotice||'';
  updateReport();updateBar();updateRateDifference();if(scroll)scrollTo($('result-panel'));
}
function err(e){$('error').hidden=false;$('error').textContent=e.message||'目前無法取得商品資料，請稍後重試或使用手動試算。';}
function busy(on){$('go').disabled=on;$('go').firstElementChild.textContent=on?'廢廢豬正在讀取商品…':'幫我算台幣報價';$('progress').hidden=!on;}
function reset(){clearBunjangLinks();cancelAutoQuote();serial++;if(controller)controller.abort();controller=null;$('error').hidden=true;$('result').hidden=true;$('empty').hidden=false;$('requestNote').value='';$('quotePreview').textContent='';$('resultStatus').textContent='WAITING FOR YOUR FIND';current=null;document.querySelectorAll('[data-tier]').forEach(row=>row.classList.remove('active-tier'));updateBar();busy(false);return serial;}
$('image').onerror=()=>{$('image').hidden=true;};$('requestNote').addEventListener('input',updateReport);
for(const event of ['input','change'])$('url').addEventListener(event,urlChanged);
// Paste fires before the browser inserts clipboard text; input normally handles it immediately.
$('url').addEventListener('paste',()=>setTimeout(urlChanged,0));
$('form').onsubmit=async e=>{
  e.preventDefault();const token=reset();let target;
  try{const raw=$('url').value;target=normalize(raw);$('url').value=target.url;lastUrlValue=target.url;$('normalized').hidden=raw.trim()===target.url;detected();}catch(error){err(error);return;}
  busy(true);const aborter=new AbortController();controller=aborter;const timeout=setTimeout(()=>aborter.abort(),55000);
  try{
    const r=await fetch('/api/quote?url='+encodeURIComponent(target.url),{cache:'no-store',credentials:'same-origin',signal:aborter.signal});
    if(!r.headers.get('content-type')?.includes('application/json'))throw Error('網站沒有回傳報價資料，請重新整理後再試。');
    const d=await r.json();if(token!==serial)return;if(!r.ok||!d.ok)throw Error(typeof d.error==='string'?d.error:'目前無法取得商品資料。');
    if(d.version!==VERSION)throw Error('網站規則已更新，請重新整理後再查詢。');
    const returned=normalize(d.product?.url);
    if(target.kind==='link'){
      const unresolvedSameLink=d.status==='needs_confirmation'&&d.quote===null&&returned.url===target.url;
      if(!unresolvedSameLink&&!validBunjangLinkProof(d.product,target,returned))throw Error('商品來源不一致，已停止顯示。');
    }else if(target.kind!=='short'&&returned.key!==target.key&&!(validDomesticProof(d.product)&&d.product.domesticResolution?.status==='verified'&&normalize(d.product.domesticResolution.inputUrl).url===target.url))throw Error('商品來源不一致，已停止顯示。');
    if(d.status==='quoted'||d.status==='estimated'){
      if(d.product.currency!=='KRW'||d.quote?.pricingVersion!==PRICING_VERSION)throw Error('幣別或報價規則不一致，請重新整理。');
      const verified=quoteForProduct(d.product,validateRate(d.quote.exchangeRate));
      if(!verified||(d.status==='estimated')!==!!(verified.shippingExcluded||verified.platformFeeExcluded)||!!d.quote.shippingExcluded!==!!verified.shippingExcluded)throw Error('估價範圍核對失敗，請重新整理。');
      if(d.quote.totalTwd!==verified.totalTwd||d.quote.tierId!==verified.tierId||d.quote.exchangeRate!==validateRate(d.rate?.exchangeRate)||d.quote.platformFeeKrw!==verified.platformFeeKrw||!!d.quote.platformFeeExcluded!==verified.platformFeeExcluded)throw Error('報價核對失敗，已停止顯示金額。');
      acceptRate(d.rate);show(d.product,{...verified,rateCheckedAt:d.rate.checkedAt});
    }else if(d.status==='needs_confirmation'&&d.quote===null)show(d.product,null);
    else throw Error('回傳資料不完整，這次不會產生報價。');
  }catch(error){if(token===serial)err(error.name==='AbortError'?Error('平台載入逾時，這次未取得價格；請重試，或依已確認的韓幣售價使用手動試算。'):error);}
  finally{clearTimeout(timeout);if(token===serial){controller=null;busy(false);}}
};
$('manual').onsubmit=async e=>{e.preventDefault();const token=reset();busy(true);try{const rate=await syncRate();if(token!==serial)return;const q=estimateFromAmounts($('p').value,$('s').value,$('pf').value,rate.exchangeRate);show({title:'自訂商品',fetchedAt:new Date().toISOString()},{...q,rateCheckedAt:rate.checkedAt},true);}catch(error){if(token===serial)err(error);}finally{if(token===serial)busy(false);}};
async function copyText(text,successMessage){try{await navigator.clipboard.writeText(text);toast(successMessage||(current?.q?'已複製報價內容。':'已複製商品資訊。'));return true;}catch{$('copyText').value=text;if(!$('copyDialog').open)$('copyDialog').showModal();$('copyText').select();return false;}}
$('copy').onclick=()=>current&&copyText(message());
$('bunjangCopy').onclick=()=>{const links=current&&bunjangLinks(current.p,navigator.userAgent);if(links)return copyText(links.web,'已複製韓國版商品連結。');};
// Native navigation is a direct user click. Never use delayed web/USD redirects.
$('bunjangApp').addEventListener('click',()=>{
  $('bunjangOpenHelp').textContent='請允許瀏覽器開啟韓國版 번개장터。若沒有反應，請在 Safari／Chrome 開啟本站後再按一次；不會自動改開美元版。';
});
$('mobileQuoteAction').onclick=()=>{if(current)return copyText(message());scrollTo($('form'));$('url').focus({preventScroll:true});};
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
$('version').textContent=VERSION;
function updateRateDifference(){
 const different=current?.q&&latestRate&&current.q.exchangeRate!==latestRate.exchangeRate;
 $('quoteRateUpdate').hidden=!different;
 if(different)$('quoteRateUpdateText').textContent='本筆粗估使用匯率 '+current.q.exchangeRate+'；目前匯率已更新為 '+latestRate.exchangeRate+'。';
}
function acceptRate(rate){
 const exchangeRate=validateRate(rate?.exchangeRate),stamp=Date.parse(rate?.checkedAt);
 if(!Number.isFinite(stamp))throw Error('匯率確認時間無效，請重新同步。');
 if(latestRate&&Date.parse(latestRate.checkedAt)>stamp)return latestRate;
 latestRate={exchangeRate,checkedAt:rate.checkedAt};
 document.querySelectorAll('[data-current-rate]').forEach(el=>{el.textContent=String(exchangeRate);});
 $('rateSyncStatus').textContent='本日匯率 '+exchangeRate+' · 已同步 '+new Date(stamp).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
 $('rateSyncStatus').classList.remove('rate-error');updateRateDifference();return latestRate;
}
async function syncRate(){
 if(rateRequest)return rateRequest;
 $('refreshRate').disabled=true;
 rateRequest=(async()=>{
  const r=await fetch('/api/rate',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(11000)});
  if(!r.headers.get('content-type')?.includes('application/json'))throw Error('匯率服務尚未準備完成，請重新整理。');
  const data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'暫時無法同步匯率。');
  if(data.version!==VERSION)throw Error('網站已更新，請重新整理後再試。');return acceptRate(data);
 })();
 try{return await rateRequest;}catch(e){
  $('rateSyncStatus').textContent=latestRate?'暫時無法同步；最後確認匯率 '+latestRate.exchangeRate+'。新報價將重新確認。':'暫時無法同步匯率，請按「重新同步」或稍後重試。';
  $('rateSyncStatus').classList.add('rate-error');throw e;
 }finally{rateRequest=null;$('refreshRate').disabled=false;}
}
$('refreshRate').onclick=()=>syncRate().catch(e=>toast(e.message));
$('reprice').onclick=async()=>{
 const saved=current;if(!saved?.q)return;
 try{const rate=await syncRate();if(current!==saved)return;
  const q=estimateFromAmounts(saved.q.priceKrw,saved.q.shippingKrw,saved.q.platformFeeKrw,rate.exchangeRate);
  show(saved.p,{...q,rateCheckedAt:rate.checkedAt},saved.manual,{scroll:false});toast('已依目前匯率 '+rate.exchangeRate+' 重新試算。');
 }catch(e){toast(e.message);}
};
const refreshQuietly=()=>{if(!document.hidden)syncRate().catch(()=>{});};
setInterval(refreshQuietly,30000);document.addEventListener('visibilitychange',refreshQuietly);window.addEventListener('pageshow',refreshQuietly);syncRate().catch(()=>{});

for(const tier of FEE_TIERS){const row=document.createElement('tr');row.dataset.tier=tier.id;const range=document.createElement('td'),fee=document.createElement('td');range.textContent=tier.range;fee.textContent=tier.label;row.append(range,fee);$('feeTiers').append(row);}
const query=new URLSearchParams(location.search).get('product');if(query&&autoQuoteTarget(query)){$('url').value=normalize(query).url;urlChanged();}
