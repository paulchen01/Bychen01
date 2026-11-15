import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runtimeFiles} from '../site/build.mjs';
import {APP_VERSION} from '../site/lib/platforms.mjs';
import {PRICING_VERSION} from '../site/lib/pricing.mjs';

// v24 remains an immutable, fully embedded production release. The 2026-11-16
// brand refresh is an audited delta manifest rather than an altered v24 archive.
// This protects all platform parsers, fee tables, and server-side behavior.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'site');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitBlob=bytes=>createHash('sha1')
  .update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const baseBytes=fs.readFileSync(path.join(root,'releases/site-20261026-24.json'));
const baseline=JSON.parse(baseBytes);
assert.equal(baseline.version,'2026-10-26.24','Unexpected immutable production baseline');
for(const f of baseline.files){
  assert.equal(sha256(Buffer.from(f.data,f.encoding==='base64'?'base64':'utf8')),
    baseline.hashes[f.file],f.file+' baseline archive integrity');
}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'releases/brand-refresh-20261116.json'),'utf8'));
assert.equal(manifest.basedOn,baseline.version);
assert.equal(manifest.appVersion,APP_VERSION);
assert.equal(manifest.pricingVersion,PRICING_VERSION);
assert.equal(APP_VERSION,'2026-10-26.24');
assert.equal(PRICING_VERSION,'2026-09-15.5');
const files=[...runtimeFiles(source),...['build.mjs','vercel.json','package-lock.json']
  .map(file=>({file,data:fs.readFileSync(path.join(source,file))}))]
  .sort((a,b)=>a.file.localeCompare(b.file));
const current=Object.fromEntries(files.map(f=>[f.file,f.data]));
const changed=manifest.changed||{},added=manifest.added||{};
assert.deepEqual(Object.keys(changed).sort(),['app.js','index.html']);
assert.deepEqual(Object.keys(added).sort(),['assets/pig-mascot.svg','brand-refresh.css']);
for(const [file,digest] of Object.entries(baseline.hashes)){
  assert.ok(current[file],file+' missing from refreshed release');
  if(Object.hasOwn(changed,file))continue;
  assert.equal(sha256(current[file]),digest,file+' unexpectedly changed: protected pricing/backend/platform logic');
}
for(const [file,expected] of [...Object.entries(changed),...Object.entries(added)]){
  assert.ok(current[file],file+' missing from refreshed release');
  assert.equal(gitBlob(current[file]),expected,file+' does not match pinned refresh delta');
}
for(const file of Object.keys(current)){
  if(Object.hasOwn(baseline.hashes,file))continue;
  assert.ok(Object.hasOwn(added,file),'Unexpected new runtime file: '+file);
}
for(const {file,data} of files){
  if(/\.(?:html|js|mjs|css|svg|txt|xml)$/.test(file)){
    assert.doesNotMatch(data.toString('utf8'),
      /\bLINE\b|line\.me|lin\.ee|oaMessage|fatfatpig_kr|line-qr\.png|brand\.webp|lib\/inquiry\.mjs|instagram\.com|threads\.net|wa\.me|t\.me\//,
      'Forbidden external contact content in '+file);
  }
}
const index=current['index.html'].toString('utf8');
const app=current['app.js'].toString('utf8');
assert.match(index,/id="copyNoLinks"/);
assert.match(index,/brand-refresh\.css\?v=20261116-1/);
assert.match(index,/src="\/app\.js\?v=20261116-2"/);
assert.match(app,/function linkFreeMessage\(\)/);
assert.match(app,/\$\('copyNoLinks'\)\.onclick/);
console.log(JSON.stringify({
  version:manifest.version,basedOn:baseline.version,sourceFiles:files.length,
  baselineSha256:sha256(baseBytes),
  manifestSha256:sha256(fs.readFileSync(path.join(root,'releases/brand-refresh-20261116.json'))),
  checked:'entire pinned source and protected unchanged pricing/backend modules',
  action:process.argv.includes('--check')?'verified':'verified-no-mutation'
}));
