/** Google HTML-file verification + basic search metadata. No pricing changes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const VERSION='2026-09-09.11', BASE='https://korea-quote-0908.vercel.app';
const SOURCE='https://raw.githubusercontent.com/paulchen01/Bychen01/314275d94b0d6340a74ac3c942a8809ba96e7ec3/korea-quote/releases/site-20260909-10.json';
const SOURCE_HASH='d5c0db7d7ce67e36a7a65694e764ef4379a5dde81d1b3ce943a0eef9bde061da';
const VERIFY='google4170efb46fe3af33.html', TOKEN='google-site-verification: '+VERIFY;
const hash=b=>createHash('sha256').update(b).digest('hex');
const raw=process.env.LOCAL_RELEASE_FILE?await fs.readFile(process.env.LOCAL_RELEASE_FILE):await(async()=>{const r=await fetch(SOURCE,{signal:AbortSignal.timeout(40000)});assert.equal(r.status,200);return Buffer.from(await r.arrayBuffer());})();
assert.equal(hash(raw),SOURCE_HASH,'Pinned v10 release changed');
const release=JSON.parse(raw),sources=new Map();
for(const f of release.files){assert.ok(!f.file.includes('..')&&!path.isAbsolute(f.file));const b=Buffer.from(f.data,f.encoding==='base64'?'base64':'utf8');assert.equal(hash(b),release.hashes[f.file],f.file);sources.set(f.file,b);}
const edit=(file,from,to)=>{const s=sources.get(file).toString('utf8');assert.ok(s.includes(from),file+': missing expected source');sources.set(file,Buffer.from(s.replaceAll(from,to)));};
const title='廢廢豬韓國代購｜韓國商品台幣估價・LINE 詢價';
const description='廢廢豬 fat fat pig 韓國代購，貼上韓國商品連結即可查詢台幣粗估，列出已知運費、韓國平台手續費及代購費。支援 Bunjang、FruitsFamily、Musinsa、Olive Young 等平台，實際價格請透過 LINE 確認。';
let html=sources.get('index.html').toString('utf8');const body=html.split('<body>')[1];
assert.ok(!html.includes('rel="canonical"'));
html=html.replace(/<title>[^<]*<\/title>/,'<title>'+title+'</title>')
 .replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="'+description+'">')
 .replace(/<meta property="og:title" content="[^"]*">/,'<meta property="og:title" content="'+title+'">')
 .replace(/<meta property="og:description" content="[^"]*">/,'<meta property="og:description" content="'+description+'">');
const ld={'@context':'https://schema.org','@graph':[
 {'@type':'WebSite','@id':BASE+'/#website',url:BASE+'/',name:'廢廢豬韓國代購',alternateName:'fat fat pig 韓國代購',inLanguage:'zh-Hant',publisher:{'@id':BASE+'/#organization'}},
 {'@type':'Organization','@id':BASE+'/#organization',name:'廢廢豬韓國代購',alternateName:'fat fat pig 韓國代購',url:BASE+'/',logo:BASE+'/assets/brand.webp',sameAs:['https://line.me/R/ti/p/%40fatfatpig_kr']}
]};
const seo='\n<link rel="canonical" href="'+BASE+'/">\n<meta name="robots" content="index,follow,max-image-preview:large">\n<meta property="og:url" content="'+BASE+'/">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="廢廢豬韓國代購">\n<meta property="og:locale" content="zh_TW">\n<script type="application/ld+json">'+JSON.stringify(ld)+'</script>\n';
html=html.replace('</head>',seo+'</head>');assert.equal(html.split('<body>')[1],body,'Visible body must not change');
html=html.replaceAll('2026-09-09.10',VERSION).replaceAll('20260909-10','20260909-11');sources.set('index.html',Buffer.from(html));
edit('lib/platforms.mjs','2026-09-09.10',VERSION);
const pkg=JSON.parse(sources.get('package.json'));pkg.version='1.0.11';sources.set('package.json',Buffer.from(JSON.stringify(pkg,null,2)+'\n'));
// The file is Google's real upload, not an invented meta-verification token.
const verification=await fs.readFile(VERIFY);assert.equal(verification.toString('utf8'),TOKEN);assert.equal(hash(verification),'b0cc16cf33c20d78cd4278a90030f03aafaf461151d4695e836b1120bcd192ae');sources.set(VERIFY,verification);
sources.set('robots.txt',Buffer.from('User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: '+BASE+'/sitemap.xml\n'));
sources.set('sitemap.xml',Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>'+BASE+'/</loc>\n    <lastmod>2026-09-09</lastmod>\n  </url>\n</urlset>\n'));
const changed=new Set(['index.html','lib/platforms.mjs','package.json']);
for(const[file,want]of Object.entries(release.hashes))if(!changed.has(file))assert.equal(hash(sources.get(file)),want,file+' must be unchanged');
const out='.vercel/output';await fs.rm(out,{recursive:true,force:true});
for(const[file,b]of sources){if(file==='package.json'||file.startsWith('api/'))continue;const target=path.join(out,'static',file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,b);}
for(const route of ['quote','health']){const root=path.join(out,'functions','api',route+'.func');await fs.mkdir(root,{recursive:true});for(const[file,b]of sources){if(file!=='package.json'&&file!=='api/'+route+'.js'&&!file.startsWith('lib/'))continue;const dest=path.join(root,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,b);}await fs.writeFile(path.join(root,'.vc-config.json'),JSON.stringify({runtime:'nodejs22.x',handler:'api/'+route+'.js',launcherType:'Nodejs',shouldAddHelpers:true,maxDuration:60}));}
await fs.writeFile(path.join(out,'config.json'),JSON.stringify({version:3,routes:[{src:'/(.*)',headers:{'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-cache'},continue:true},{handle:'filesystem'}]},null,2));
const snapshot={version:VERSION,hashes:Object.fromEntries([...sources].map(([f,b])=>[f,hash(b)])),files:[...sources].map(([file,b])=>({file,encoding:'base64',data:b.toString('base64')}))};
await fs.writeFile('prepared-v11.json',JSON.stringify(snapshot));
console.log('SEO_BUILD_OK',JSON.stringify({version:VERSION,verification:VERIFY,verificationSHA:hash(verification),files:sources.size,quoteLogicUnchanged:true}));
