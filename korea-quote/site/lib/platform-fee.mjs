/** Only explicit buyer platform charges are accepted; missing is NOT zero.
 * Call with the main product's fee information, never recommendations or seller fees.
 */
export function parsePlatformFee(text=''){
  const values=[];
  for(const line of String(text).replace(/<[^>]*>/g,' ').split(/\n|[;；]/)){
    const s=line.replace(/^[\s*•·-]+|[\s*]+$/g,'').trim();
    if(/판매자|판매\s*수수료|정산|환불|취소|최대|최소|부터|쿠폰|회원|[0-9]\s*%/.test(s))continue;
    const m=s.match(/^(?:(?:구매자|구매)\s*(?:플랫폼\s*)?수수료|플랫폼\s*이용\s*수수료|안전\s*결제\s*수수료)\s*[:：]?\s*([0-9,]+\s*원|무료|없음)\s*$/);
    if(!m)continue;
    const n=/무료|없음/.test(m[1])?0:Number(m[1].replace(/[,원\s]/g,''));
    if(Number.isSafeInteger(n)&&n>=0&&n<=1e9)values.push({value:n,evidence:s});
  }
  const unique=[...new Set(values.map(x=>x.value))];
  return unique.length===1?{platformFeeKrw:unique[0],platformFeeEvidence:values[0].evidence,platformFeeStatus:'known'}:{platformFeeKrw:null,platformFeeEvidence:null,platformFeeStatus:'unknown'};
}
export function withPlatformFee(product){
  if(!product)return product;
  const valid=Number.isSafeInteger(product.platformFeeKrw)&&product.platformFeeKrw>=0&&product.platformFeeKrw<=1e9;
  return {...product,platformFeeKrw:valid?product.platformFeeKrw:null,platformFeeStatus:valid?'known':'unknown',platformFeeNotice:valid?'按本商品公開標示的平台費計入。':product.platformId==='fruits'?'未標示，本次未計入；需登入後由廢廢豬確認。':'未標示，本次未計入。'};
}
export function platformFeeText(fee){return Number.isSafeInteger(fee)&&fee>=0?'₩'+new Intl.NumberFormat('zh-TW').format(fee)+(fee===0?'（已確認免平台費）':''):'未標示，本次未計入';}
