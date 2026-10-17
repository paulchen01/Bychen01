import {getRate} from '../lib/sheet-rate.mjs';
import {APP_VERSION} from '../lib/platforms.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('CDN-Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed'});
 try{return res.status(200).json({ok:true,...await getRate(),version:APP_VERSION});}
 catch(e){return res.status(503).json({ok:false,error:e.message,code:e.code||'RATE_UNAVAILABLE',version:APP_VERSION});}
}
