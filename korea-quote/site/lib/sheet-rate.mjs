import {validateRate} from './pricing.mjs';
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
