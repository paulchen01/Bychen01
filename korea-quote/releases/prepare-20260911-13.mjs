/** Add an informational order-only pricing card; existing totals and LINE quotes stay unchanged. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const baseURL='https://raw.githubusercontent.com/paulchen01/Bychen01/24d3fe987558a0f43d9f065cf1d79c14bbdbd52c/korea-quote/releases/site-20260910-12.json';
const BASE_SHA='4874db95084d7c7f76ef97804a39ff7e9ddb1922883b66745727c151cc5cec5f';
const version='2026-09-11.13';
const hash=b=>createHash('sha256').update(b).digest('hex');
const baseArg=process.argv.indexOf('--base');
let raw;
if(baseArg>=0) raw=fs.readFileSync(process.argv[baseArg+1]);
else {const r=await fetch(baseURL,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);raw=Buffer.from(await r.arrayBuffer());}
assert.equal(hash(raw),BASE_SHA);
const base=JSON.parse(raw), files=new Map();
for(const f of base.files){const b=Buffer.from(f.data,f.encoding==='base64'?'base64':'utf8');assert.equal(hash(b),base.hashes[f.file],f.file);files.set(f.file,b);}
const card=`<section class="order-only-card" id="orderOnlyQuote" aria-labelledby="orderOnlyTitle">
  <div class="order-only-heading"><span class="order-only-symbol" aria-hidden="true">＋</span><h4 id="orderOnlyTitle">僅下單初步報價</h4><span class="order-only-badge">計價說明</span></div>
  <dl class="order-only-formulas">
    <div><dt>一般網站</dt><dd>金額 ÷ <span data-current-rate data-order-only-rate>—</span><small>（浮動匯率）</small></dd></div>
    <div><dt>特殊網站</dt><dd>金額 ÷ <span data-current-rate data-order-only-rate>—</span><small>（浮動匯率）</small><span class="order-only-extra">＋ NT$50</span></dd></div>
  </dl>
  <p class="order-only-confirm"><strong>以真人報價為主。</strong>一般／特殊網站的適用方式，由廢廢豬確認。</p>
  <p class="order-only-note">本框為「僅下單」計價說明，與上方代購報價分開列示，不會直接加到上方金額。</p>
</section>`;
let html=files.get('index.html').toString('utf8');
const needle='<div class="inquiry-fields">';assert.equal(html.split(needle).length,2);
html=html.replace(needle,card+needle).replaceAll('20260910-12','20260911-13');
files.set('index.html',Buffer.from(html));
const css=`
/* Separate order-only guidance, using the existing shared B2 rate labels. */
.order-only-card{margin:20px 0;padding:19px 18px;background:#fff0d4;border:1px solid #dfbc82;border-left:4px solid #c38e45;border-radius:14px;color:#63482e;overflow-wrap:anywhere}
.order-only-heading{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:13px}
.order-only-heading h4{font-size:17px;line-height:1.6;letter-spacing:.3px;margin:0;font-weight:750;color:#664527}
.order-only-symbol{display:grid;place-items:center;width:24px;height:24px;flex-shrink:0;border-radius:7px;background:#e7c493;color:#72502d;font-size:17px;font-weight:650;line-height:1}
.order-only-badge{font-size:9px;background:#f8dfb1;border-radius:20px;padding:2px 8px;color:#76532f;margin-left:auto;white-space:nowrap}
.order-only-formulas{margin:0;display:grid;gap:9px}
.order-only-formulas>div{display:grid;grid-template-columns:64px minmax(0,1fr);gap:9px;align-items:start;background:#fffaf0;border:1px solid #edddbf;border-radius:10px;padding:12px}
.order-only-formulas dt{font-size:12px;font-weight:650;line-height:1.9;color:#846342}
.order-only-formulas dd{margin:0;font-size:16px;font-weight:700;line-height:1.6;font-variant-numeric:tabular-nums;min-width:0}
.order-only-formulas small{font-size:10px;font-weight:400;display:inline-block;color:#866d54;margin-left:3px}
.order-only-extra{display:inline-block;color:#a06124;white-space:nowrap;margin-left:3px}
.order-only-confirm{font-size:11px;line-height:1.9;margin:13px 0 6px;color:#795a3d}
.order-only-confirm strong{color:#6b472a}
.order-only-note{font-size:10px;line-height:1.9;margin:0;color:#876d52}
@media(max-width:370px){.order-only-card{padding:15px 13px}.order-only-heading h4{font-size:16px}.order-only-formulas>div{grid-template-columns:1fr;gap:3px;padding:10px}.order-only-badge{margin-left:32px}.order-only-formulas dd{font-size:15px}}
`;
files.set('style.css',Buffer.concat([files.get('style.css'),Buffer.from(css)]));
let platforms=files.get('lib/platforms.mjs').toString('utf8');
assert.ok(platforms.includes("'2026-09-10.12'"));
files.set('lib/platforms.mjs',Buffer.from(platforms.replace("'2026-09-10.12'","'"+version+"'")));
const pkg=JSON.parse(files.get('package.json'));pkg.version='1.0.13';files.set('package.json',Buffer.from(JSON.stringify(pkg,null,2)+'\n'));
const changed=['index.html','style.css','lib/platforms.mjs','package.json'];
for(const [file,data] of files){if(!changed.includes(file))assert.equal(hash(data),base.hashes[file],file+' must be preserved');}
assert.equal((html.match(/id="orderOnlyQuote"/g)||[]).length,1);
assert.equal((html.match(/data-order-only-rate/g)||[]).length,2);
assert.equal((html.match(/data-current-rate/g)||[]).length,4);
assert.ok(!card.includes('data-tier')&&!card.includes('value="50"'));
assert.equal(hash(files.get('google4170efb46fe3af33.html')),base.hashes['google4170efb46fe3af33.html']);
const out=process.env.OUTPUT_DIR||'prepared-site';fs.mkdirSync(out,{recursive:true});
for(const [file,data] of files){assert.ok(!file.startsWith('/')&&!file.includes('..'));const p=path.join(out,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data);}
const release={version,changeType:'informational-order-only-card',specialClassification:'human-confirmation-only',existingCalculationsUnchanged:true,hashes:Object.fromEntries([...files].map(([file,b])=>[file,hash(b)])),files:[...files].map(([file,b])=>({file,encoding:'base64',data:b.toString('base64')}))};
const bundle=JSON.stringify(release);fs.writeFileSync('prepared-v13.json',bundle);
console.log('V13_PREPARED',JSON.stringify({version,sha256:hash(bundle),changed,existingCalculationsUnchanged:true}));
