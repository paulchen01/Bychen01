/** Outbound links only. Official Bunjang app interface and product share routes
 * verified 2026-10-26. Actual native handoff depends on app installation and user consent. */
import {normalize} from './platforms.mjs';
export function bunjangLinks(product,userAgent=''){
  if(!product||typeof product.url!=='string')return null;
  try{
    const target=normalize(product.url);
    if(target.platformId!=='bunjang'||target.kind!=='product'||!/^\d{5,15}$/.test(target.id))return null;
    if(product.platformId&&product.platformId!=='bunjang')return null;
    if(product.id!=null&&String(product.id)!==target.id)return null;
    const id=target.id,web='https://m.bunjang.co.kr/products/'+id;
    const native='bunjang://product?val='+id;
    const android='intent://product?val='+id+'#Intent;scheme=bunjang;package=kr.co.quicket;end';
    return Object.freeze({id,web,native,app:/Android/i.test(userAgent)?android:native});
  }catch{return null;}
}
