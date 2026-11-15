import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const excluded=new Set(['node_modules','.vercel','tests','evidence','.git']);
const extensions=/\.(?:html|js|mjs|css|svg|txt|xml)$/;
const prohibited=/(?:\bLINE\b|line\.me|lin\.ee|\bInstagram\b|instagram\.com|\bThreads\b|threads\.net|\bWhatsApp\b|wa\.me|\bTelegram\b|t\.me\/|\bWeChat\b|\bMessenger\b|facebook\.com|\bIG\b)/i;

function visit(directory){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(excluded.has(entry.name)||entry.name.startsWith('.'))return [];
    const absolute=path.join(directory,entry.name);
    return entry.isDirectory()?visit(absolute):extensions.test(entry.name)?[absolute]:[];
  });
}

test('all deployed text assets omit external social and off-platform contact references',()=>{
  for(const file of visit(root)){
    const text=fs.readFileSync(file,'utf8');
    // Match LINE in uppercase only, to avoid CSS line-height or JS line helpers.
    const match=text.match(prohibited);
    assert.equal(match,null, 'Contact or social wording found in '+path.relative(root,file)+': '+match?.[0]);
  }
});

test('brand-only redesign preserves real quote controls and truthful pricing presentation',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  for(const id of ['form','url','go','result','total','price','shipping','platformFee','copy','rate','feeTiers']){
    assert.match(html,new RegExp('id="'+id+'"'), 'Missing existing quote control '+id);
  }
  assert.match(html,/brand-refresh\.css\?v=20261116-1/);
  assert.match(html,/assets\/pig-mascot\.svg/);
  assert.match(html,/未取得的金額會明確標示/);
});