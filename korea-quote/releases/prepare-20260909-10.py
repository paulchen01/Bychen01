from pathlib import Path
import json,base64,hashlib,os,urllib.request
R=Path('prepared-site');R.mkdir(exist_ok=True)
VERSION='2026-09-09.10'
NOTE='（本日匯率，匯率會浮動）'
FOOTER='本估價網頁僅為廢廢豬韓國代購之初步報價查詢，非各拍賣平台官方服務。'
url='https://raw.githubusercontent.com/paulchen01/Bychen01/6950cc6755514fc5bd2a3d2d36d0d4691bc37536/korea-quote/releases/site-20260909-9.json'
with urllib.request.urlopen(url,timeout=40) as response:raw=response.read()
assert hashlib.sha256(raw).hexdigest()=='603b54dfe5d386d247f023c0e70024dec96497a96936d464752a47537b1210f3'
base=json.loads(raw)
for f in base['files']:
 p=R/f['file'];p.parent.mkdir(parents=True,exist_ok=True)
 data=base64.b64decode(f['data']) if f['encoding']=='base64' else f['data'].encode()
 assert hashlib.sha256(data).hexdigest()==base['hashes'][f['file']]
 p.write_bytes(data)
def edit(file,old,new,count=None):
 p=R/file;s=p.read_text();n=s.count(old)
 assert n>0 and (count is None or n==count),(file,old,n,count)
 p.write_text(s.replace(old,new))
edit('lib/platform-fee.mjs','讀不到，未計入粗估','未標示，本次未計入')
edit('app.js','讀不到，未計入粗估。','未標示，本次未計入。')
edit('app.js','未含尚未讀取到的平台手續費。','未含尚未標示的平台手續費。')
edit('lib/inquiry.mjs','未含未讀取到的平台手續費','未含尚未標示的平台手續費')
edit('index.html','placeholder="讀不到可留空"','placeholder="未標示可留空"')
edit('index.html','id="knownPlatformFee">讀不到','id="knownPlatformFee">未標示，本次未計入')
edit('index.html','<div class="hero-pills"><span>韓幣 → 台幣</span><span>匯率 ÷38 · 分級代購費</span><span>LINE 輕鬆詢價</span></div>','',1)
edit('index.html','非各拍賣平台官方服務。僅讀取您提供的公開網址；Bunjang 使用 Jina Reader，X 使用公開貼文嵌入服務，不需提供拍賣帳號或密碼。<br>點選 LINE 詢價時，會把商品與您填寫的備註帶入 LINE；網站不會自動替您送出訊息。',FOOTER,1)
edit('index.html','÷ <span id="rate">38</span> ＋ 代購費<br>＋ 已知韓國平台費 ÷38','÷ <span id="rate">38</span> <span class="rate-note">'+NOTE+'</span> ＋ 代購費<br>＋ 已知韓國平台費 ÷ <span data-exchange-rate>38</span> <span class="rate-note">'+NOTE+'</span>',1)
edit('index.html','<dt>換算台幣（÷38）</dt>','<dt>換算台幣（÷<span data-exchange-rate>38</span>）</dt>',1)
edit('app.js',"$('version').textContent=VERSION;$('rate').textContent=EXCHANGE_RATE;","$('version').textContent=VERSION;$('rate').textContent=EXCHANGE_RATE;\ndocument.querySelectorAll('[data-exchange-rate]').forEach(el=>{el.textContent=EXCHANGE_RATE;});",1)
edit('lib/inquiry.mjs',"'試算：'+estimateFormula(quote),'代購費：'+estimateFee(quote),","'報價匯率：'+checked.exchangeRate+'"+NOTE+"',\n    '試算：'+estimateFormula(quote),'代購費：'+estimateFee(quote),",1)
edit('lib/platforms.mjs',"'2026-09-09.9'","'"+VERSION+"'",1)
p=R/'index.html';p.write_text(p.read_text().replace('20260908-8','20260909-10').replace('2026-09-08.8',VERSION))
p=R/'style.css';p.write_text(p.read_text()+'\n/* Merchant-maintained quote rate note: display only; no automatic FX updates. */\n.formula-card .rate-note{display:inline-block;font-size:11px;line-height:1.8;font-weight:400;letter-spacing:0;color:var(--muted);vertical-align:baseline;white-space:normal}.hero-copy .intro{margin-bottom:0}\n@media(max-width:720px){.formula-card .rate-note{font-size:10px}}\n')
p=R/'package.json';d=json.loads(p.read_text());d['version']='1.0.10';p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
# Content-only change: preserve all price math, adapters, domestic conversion, brand assets and API behavior.
changed={'app.js','index.html','style.css','lib/inquiry.mjs','lib/platform-fee.mjs','lib/platforms.mjs','package.json'}
files=[];hashes={}
for original in base['files']:
 name=original['file'];data=(R/name).read_bytes();digest=hashlib.sha256(data).hexdigest()
 if name not in changed:assert digest==base['hashes'][name],name
 hashes[name]=digest;files.append({'file':name,'encoding':'base64','data':base64.b64encode(data).decode()})
release=json.dumps({'version':VERSION,'hashes':hashes,'files':files},ensure_ascii=False,separators=(',',':')).encode()
Path('prepared-v10.json').write_bytes(release)
if os.environ.get('GITHUB_TOKEN'):
 body=json.dumps({'message':'Save v10 requested copy edits with unchanged fee and retail logic','content':base64.b64encode(release).decode()}).encode()
 req=urllib.request.Request('https://api.github.com/repos/paulchen01/Bychen01/contents/korea-quote/releases/site-20260909-10.json',data=body,method='PUT',headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json','Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=40) as response:result=json.load(response)
 print('PREPARED_RELEASE',json.dumps({'version':VERSION,'commit':result['commit']['sha'],'sha256':hashlib.sha256(release).hexdigest(),'hashes':hashes}),flush=True)
