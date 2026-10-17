import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(root,'.vercel/output');
const exclude=new Set(['node_modules','.vercel','tests','evidence','.git','.gitignore','README.md','package-lock.json','build.mjs','vercel.json']);
export function runtimeFiles(directory=root,prefix=''){
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    if(exclude.has(entry.name)||entry.name.startsWith('.'))return [];
    const file=prefix+entry.name,absolute=path.join(directory,entry.name);
    return entry.isDirectory()?runtimeFiles(absolute,file+'/'):[{file,data:fs.readFileSync(absolute)}];
  });
}
const files=runtimeFiles();
const write=(file,body)=>{const target=path.join(output,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);};
fs.rmSync(output,{recursive:true,force:true});
for(const {file,data} of files)if(!file.startsWith('api/')&&file!=='package.json')write('static/'+file,data);
for(const endpoint of ['health','quote','rate']){
  const dir='functions/api/'+endpoint+'.func/';
  for(const {file,data} of files)if(file.startsWith('lib/'))write(dir+file,data);
  const handler=files.find(f=>f.file==='api/'+endpoint+'.js');
  if(!handler)throw Error('Missing endpoint '+endpoint);
  write(dir+handler.file,handler.data);write(dir+'package.json',JSON.stringify({type:'module'}));
  write(dir+'.vc-config.json',JSON.stringify({runtime:'nodejs22.x',handler:handler.file,launcherType:'Nodejs',shouldAddHelpers:true,maxDuration:endpoint==='quote'?60:15}));
}
write('config.json',JSON.stringify({version:3,routes:[{src:'/(.*)',headers:{'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'},continue:true},{handle:'filesystem'}]}));
console.log('Built quotation site:',files.length,'runtime source files; 3 server endpoints.');
