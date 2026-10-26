import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const files=['bunjang-links.test.mjs','bunjang-api.test.mjs','bunjang-reader.test.mjs','retail-prices.test.mjs','platform-routes.test.mjs','x-oembed.test.mjs','auto-quote.test.mjs'];
for(const file of files){
  const args=[...(file==='auto-quote.test.mjs'?['--experimental-vm-modules']:[]),fileURLToPath(new URL(file,import.meta.url))];
  const result=spawnSync(process.execPath,args,{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
