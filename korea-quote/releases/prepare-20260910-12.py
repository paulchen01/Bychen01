from pathlib import Path
import json,base64,hashlib,urllib.request,os,subprocess
R=Path('prepared-site');R.mkdir(exist_ok=True)
BASE='https://raw.githubusercontent.com/paulchen01/Bychen01/bf2ce268a7757f1f184a5594d3f71095394a9588/korea-quote/releases/site-20260909-11.json'
with urllib.request.urlopen(BASE,timeout=40) as response:raw=response.read()
assert hashlib.sha256(raw).hexdigest()=='db2edfebad822423fdd8a00a03bde8660ad48d1e0eb1603b48ac1a879cee362d'
base=json.loads(raw)
for f in base['files']:
 p=R/f['file'];p.parent.mkdir(parents=True,exist_ok=True);data=base64.b64decode(f['data']) if f['encoding']=='base64' else f['data'].encode();assert hashlib.sha256(data).hexdigest()==base['hashes'][f['file']];p.write_bytes(data)
def edit(f,a,b,n=None):
 p=R/f;s=p.read_text();assert a in s,(f,a[:100]);assert n is None or s.count(a)==n,(f,a,s.count(a));p.write_text(s.replace(a,b))
edit('lib/pricing.mjs','export const EXCHANGE_RATE = 38;',r'''export const EXCHANGE_RATE = 38; // Compatibility default; live endpoints pass the verified sheet rate.
export function validateRate(value){
 if(!['number','string'].includes(typeof value)||!/^\d+(?:\.\d{1,2})?$/.test(String(value).trim()))invalid('INVALID_RATE','匯率必須為 10～100，最多兩位小數。');
 const n=Number(value);if(!Number.isFinite(n)||n<10||n>100)invalid('INVALID_RATE','匯率必須為 10～100，最多兩位小數。');return n;
}
export function rateUnits(value){return BigInt(Math.round(validateRate(value)*100));}''')
edit('lib/pricing.mjs','export function calculate(price,shipping){','export function calculate(price,shipping,exchangeRate=EXCHANGE_RATE){\n const rate=validateRate(exchangeRate);')
edit('lib/pricing.mjs','const percent=tier.percent||0,denominator=BigInt(EXCHANGE_RATE)*100n;','const percent=tier.percent||0,denominator=rateUnits(rate);')
edit('lib/pricing.mjs','const base=sum/EXCHANGE_RATE;','const base=sum/rate;')
edit('lib/pricing.mjs','exchangeRate:EXCHANGE_RATE','exchangeRate:rate')
edit('lib/pricing.mjs','calculate(quote.priceKrw,quote.shippingKrw)','calculate(quote.priceKrw,quote.shippingKrw,quote.exchangeRate)')
edit('lib/estimate.mjs','import {calculate,formulaText,feeDescription}','import {calculate,formulaText,feeDescription,EXCHANGE_RATE,rateUnits}')
edit('lib/estimate.mjs','estimateFromAmounts(price,shipping,platformFee=null){','estimateFromAmounts(price,shipping,platformFee=null,exchangeRate=EXCHANGE_RATE){')
edit('lib/estimate.mjs','calculate(price,excluded?0:shipping)','calculate(price,excluded?0:shipping,exchangeRate)')
edit('lib/estimate.mjs','const den=BigInt(q.exchangeRate)*100n;','const den=rateUnits(q.exchangeRate);')
edit('lib/estimate.mjs','export function quoteForProduct(p){','export function quoteForProduct(p,exchangeRate=EXCHANGE_RATE){')
edit('lib/estimate.mjs','estimateFromAmounts(p.priceKrw,p.shippingKrw,p.platformFeeKrw)','estimateFromAmounts(p.priceKrw,p.shippingKrw,p.platformFeeKrw,exchangeRate)')
edit('lib/estimate.mjs','estimateFromAmounts(q.priceKrw,null,q.platformFeeKrw)','estimateFromAmounts(q.priceKrw,null,q.platformFeeKrw,q.exchangeRate)')
edit('lib/estimate.mjs','estimateFromAmounts(q.priceKrw,q.shippingKrw,q.platformFeeKrw)','estimateFromAmounts(q.priceKrw,q.shippingKrw,q.platformFeeKrw,q.exchangeRate)')
edit('lib/estimate.mjs','calculate(c.priceKrw,c.shippingKrw??0)','calculate(c.priceKrw,c.shippingKrw??0,c.exchangeRate)')
edit('lib/inquiry.mjs','  const quote=quoteForProduct(product);if(quote)return inquiryText(product,quote,{note});','  // Pending messages cannot invent a quote using a default rate.')
edit('lib/inquiry.mjs',"    '試算：'+estimateFormula(quote)","    quote.rateCheckedAt?'匯率確認時間：'+new Date(quote.rateCheckedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})+'（台灣）':'',\n    '試算：'+estimateFormula(quote)")
(R/'lib/sheet-rate.mjs').write_text(r'''import {validateRate} from './pricing.mjs';
export const SHEET_RATE_URL='https://docs.google.com/spreadsheets/d/1DPBaWy1JLvwtAabHmGhYTsxxyfyW3vAEPyQkcWYHRDc/gviz/tq?gid=527189645&range=B2&headers=0&tqx=out:json';
export class RateError extends Error{constructor(code,message){super(message);this.name='RateError';this.code=code;}}
export function parseSheetRate(text){
 if(typeof text!=='string'||text.length>65536)throw new RateError('INVALID_RATE_RESPONSE','匯率資料格式無效。');
 const match=text.trim().match(/^(?:\/\*O_o\*\/\s*)?google\.visualization\.Query\.setResponse\(([\s\S]+)\);?$/);
 let data;try{data=JSON.parse(match?match[1]:text);}catch{throw new RateError('INVALID_RATE_RESPONSE','尚未取得試算表的有效匯率。');}
 const table=data?.table;
 if(data?.status!=='ok'||table?.cols?.length!==1||table.cols[0].type!=='number'||table?.rows?.length!==1||table.rows[0]?.c?.length!==1||typeof table.rows[0].c[0]?.v!=='number')throw new RateError('INVALID_RATE_CELL','B2 匯率未填寫或格式無效，請確認試算表。');
 try{return validateRate(table.rows[0].c[0].v);}catch{throw new RateError('INVALID_RATE_CELL','B2 匯率必須為 10～100，最多兩位小數。');}
}
export function createRateReader({fetchImpl=globalThis.fetch,now=Date.now,ttl=15000}={}){
 let cached=null,inflight=null;
 return async function readRate(){
  if(cached&&now()-cached.checkedMs<ttl)return {...cached.value,fromCache:true};
  if(inflight)return inflight;
  inflight=(async()=>{
   let r;try{r=await fetchImpl(SHEET_RATE_URL+'&_='+now(),{headers:{Accept:'application/javascript,application/json','Cache-Control':'no-cache'},redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(8000)});}catch{throw new RateError('RATE_UNAVAILABLE','暫時無法同步匯率，請稍後再試；不會改用舊的預設匯率。');}
   if(!r.ok){await r.body?.cancel();throw new RateError('RATE_UNAVAILABLE','匯率試算表目前無法讀取，請稍後再試。');}
   if(Number(r.headers.get('content-length'))>65536)throw new RateError('INVALID_RATE_RESPONSE','匯率資料格式無效。');
   const reader=r.body?.getReader();if(!reader)throw new RateError('INVALID_RATE_RESPONSE','匯率回應為空。');
   const decoder=new TextDecoder();let text='',size=0;
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();throw new RateError('INVALID_RATE_RESPONSE','匯率回應過大。');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();
   const exchangeRate=parseSheetRate(text),checkedMs=now(),value={exchangeRate,checkedAt:new Date(checkedMs).toISOString(),source:'google_sheets',cell:'B2',fromCache:false};cached={checkedMs,value};return value;
  })();
  try{return await inflight;}finally{inflight=null;}
 };
}
export const getRate=createRateReader();
''')
(R/'api/rate.js').write_text('''import {getRate} from '../lib/sheet-rate.mjs';
import {APP_VERSION} from '../lib/platforms.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('CDN-Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed'});
 try{return res.status(200).json({ok:true,...await getRate(),version:APP_VERSION});}
 catch(e){return res.status(503).json({ok:false,error:e.message,code:e.code||'RATE_UNAVAILABLE',version:APP_VERSION});}
}
''')
edit('api/quote.js','import {withPlatformFee}',"import {getRate,RateError} from '../lib/sheet-rate.mjs';\nimport {withPlatformFee}")
edit('api/quote.js','    const quote=quoteForProduct(product);','    const rate=await getRate();\n    const calculated=quoteForProduct(product,rate.exchangeRate);\n    const quote=calculated?{...calculated,rateCheckedAt:rate.checkedAt}:null;')
edit('api/quote.js','product,quote,version:APP_VERSION','product,quote,rate,version:APP_VERSION')
edit('api/quote.js','res.status(e instanceof PlatformError?422:502)','res.status(e instanceof RateError?503:e instanceof PlatformError?422:502)')
edit('api/quote.js','error:e instanceof PlatformError?e.message:','error:e instanceof PlatformError||e instanceof RateError?e.message:')
edit('api/health.js','EXCHANGE_RATE,FEE_BASIS','FEE_BASIS')
edit('api/health.js','export default function handler',"import {getRate} from '../lib/sheet-rate.mjs';\nexport default async function handler")
edit('api/health.js',"res.setHeader('Cache-Control','no-store');return","res.setHeader('Cache-Control','no-store');let rate;try{rate=await getRate();}catch(e){rate={exchangeRate:null,error:e.message,source:'google_sheets'};}return")
edit('api/health.js','exchangeRate:EXCHANGE_RATE,',"exchangeRate:rate.exchangeRate,rate,ratePolicy:'shared-google-sheet-b2',")
edit('index.html','<span id="rate">38</span>','<span id="rate" data-current-rate>—</span>')
edit('index.html','<span data-exchange-rate>38</span>','<span data-current-rate>—</span>',2)
edit('index.html','換算台幣（÷<span data-current-rate>—</span>）','換算台幣（÷<span id="quoteRate">—</span>）')
edit('index.html','<span class="formula-label">每一筆，都算清楚。</span>','<span class="formula-label">每一筆，都算清楚。</span><div class="rate-sync-bar"><span id="rateSyncStatus" role="status">正在同步本日匯率…</span><button id="refreshRate" type="button">重新同步</button></div>')
edit('index.html','<p id="math" class="math"></p>','<p id="math" class="math"></p><div class="quote-rate-update" id="quoteRateUpdate" hidden><span id="quoteRateUpdateText"></span><button id="reprice" type="button">依新匯率重新試算</button></div>')
edit('index.html','20260909-11','20260910-12')
edit('lib/platforms.mjs',"'2026-09-09.11'","'2026-09-10.12'")
edit('app.js','PRICING_VERSION,EXCHANGE_RATE,FEE_TIERS','PRICING_VERSION,validateRate,FEE_TIERS')
edit('app.js','let current=null,serial=0,controller=null,toastTimer;','let current=null,serial=0,controller=null,toastTimer,latestRate=null,rateRequest=null;')
edit('app.js','function show(p,q,manual=false){','function show(p,q,manual=false,{scroll=true}={}){')
edit('app.js',"'韓國平台費僅按原額除以38加回，不重複加收代購費。'","'韓國平台費僅按原額除以'+q.exchangeRate+'加回，不重複加收代購費。'")
edit('app.js',"$('rate').textContent=q.exchangeRate;","$('quoteRate').textContent=q.exchangeRate;")
edit('app.js',"  updateInquiry();updateBar();scrollTo($('result-panel'));","  updateInquiry();updateBar();updateRateDifference();if(scroll)scrollTo($('result-panel'));")
edit('app.js','const verified=quoteForProduct(d.product);','const verified=quoteForProduct(d.product,validateRate(d.quote.exchangeRate));')
edit('app.js','d.quote.exchangeRate!==EXCHANGE_RATE','d.quote.exchangeRate!==validateRate(d.rate?.exchangeRate)')
edit('app.js','      show(d.product,verified);','      acceptRate(d.rate);show(d.product,{...verified,rateCheckedAt:d.rate.checkedAt});')
edit('app.js',"$('manual').onsubmit=e=>{e.preventDefault();reset();try{const q=estimateFromAmounts($('p').value,$('s').value,$('pf').value);show({title:'自訂商品',fetchedAt:new Date().toISOString()},q,true);}catch(error){err(error);}};","$('manual').onsubmit=async e=>{e.preventDefault();const token=reset();busy(true);try{const rate=await syncRate();if(token!==serial)return;const q=estimateFromAmounts($('p').value,$('s').value,$('pf').value,rate.exchangeRate);show({title:'自訂商品',fetchedAt:new Date().toISOString()},{...q,rateCheckedAt:rate.checkedAt},true);}catch(error){if(token===serial)err(error);}finally{if(token===serial)busy(false);}};")
edit('app.js',"$('version').textContent=VERSION;$('rate').textContent=EXCHANGE_RATE;\ndocument.querySelectorAll('[data-exchange-rate]').forEach(el=>{el.textContent=EXCHANGE_RATE;});",r'''$('version').textContent=VERSION;
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
  $('rateSyncStatus').textContent=latestRate?'暫時無法同步；最後確認匯率 '+latestRate.exchangeRate+'。新報價將重新確認。':'暫時無法同步匯率，請按「重新同步」或聯絡廢廢豬。';
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
''')
p=R/'style.css';p.write_text(p.read_text()+'''\n.rate-sync-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0 14px;font-size:12px;color:var(--muted)}.rate-sync-bar button,.quote-rate-update button{border:1px solid #c8cbb9;border-radius:8px;padding:7px 12px;color:var(--ink);background:#fffaf2;font:inherit;cursor:pointer}.rate-sync-bar button:disabled{opacity:.6;cursor:wait}.rate-sync-bar .rate-error{color:#995334}.quote-rate-update{margin:12px 0;padding:12px;border:1px solid #ded3b9;background:#fff6df;border-radius:10px;font-size:12px;line-height:1.8}.quote-rate-update button{display:block;margin-top:8px}.formula-card [data-current-rate]{font-variant-numeric:tabular-nums}\n''')
p=R/'package.json';d=json.loads(p.read_text());d['version']='1.0.12';p.write_text(json.dumps(d,indent=2)+'\n')
for p in R.rglob('*'):
 if p.suffix in ['.js','.mjs']:subprocess.run(['node','--check',str(p)],check=True)
files=[];hashes={}
for p in sorted(R.rglob('*')):
 if not p.is_file():continue
 name=str(p.relative_to(R));data=p.read_bytes();hashes[name]=hashlib.sha256(data).hexdigest();files.append({'file':name,'encoding':'base64','data':base64.b64encode(data).decode()})
release=json.dumps({'version':'2026-09-10.12','hashes':hashes,'files':files},ensure_ascii=False,separators=(',',':')).encode();Path('prepared-v12.json').write_bytes(release)
if os.environ.get('GITHUB_TOKEN'):
 body=json.dumps({'message':'Save shared Google Sheet rate source snapshot v12','content':base64.b64encode(release).decode()}).encode()
 req=urllib.request.Request('https://api.github.com/repos/paulchen01/Bychen01/contents/korea-quote/releases/site-20260910-12.json',data=body,method='PUT',headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=40) as response:result=json.load(response)
 print('PREPARED_RELEASE',json.dumps({'version':'2026-09-10.12','commit':result['commit']['sha'],'sha256':hashlib.sha256(release).hexdigest(),'hashes':hashes}),flush=True)
