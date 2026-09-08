/** Bunjang quote parser. Parses public rendered content; never executes seller content. */
export const VERSION = '2026-09-08.2';
export class QuoteError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new QuoteError(code, message); };
export function normalize(input) {
  if (typeof input !== 'string' || input.length > 4096) fail('INVALID_URL', '請貼上完整的 Bunjang 商品網址。');
  let value = input.trim().replace(/\\&/g, '&').replace(/&amp;/g, '&');
  const md = value.match(/^\[[^\]]*\]\((https?:\/\/[^\s]+)\)$/i);
  if (md) value = md[1];
  if (/^(m\.|www\.)?bunjang\.co\.kr\//i.test(value)) value = 'https://' + value;
  let u; try { u = new URL(value); } catch { fail('INVALID_URL', '請貼上完整的 Bunjang 商品網址。'); }
  if (!['http:', 'https:'].includes(u.protocol) || !['m.bunjang.co.kr', 'www.bunjang.co.kr', 'bunjang.co.kr'].includes(u.hostname) || u.username || u.password || u.port) fail('UNSUPPORTED_SITE', '目前支援 Bunjang 商品網址。');
  const match = u.pathname.match(/^\/products\/(\d{5,15})\/?$/);
  if (!match) fail('INVALID_PRODUCT', '請貼上包含 /products/商品編號 的商品頁。');
  return { id: match[1], url: 'https://m.bunjang.co.kr/products/' + match[1] };
}
function amount(value, zero = false) {
  const s = String(value ?? '').replace(/[,₩원\s]/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= (zero ? 0 : 1) && n <= 1000000000 ? n : null;
}
function clean(s) { return String(s).replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
function unique(values) { return [...new Set(values.filter(v => v !== null))]; }
function imageFor(text, id) {
  const re = new RegExp('https://media\\.bunjang\\.co\\.kr/product/' + id + '_[^\\s)]+', 'g');
  for (const m of text.matchAll(re)) {
    try { const u = new URL(m[0]); if (!/%7B|\{|%7D/i.test(u.href)) return u.href; } catch {}
  }
  return null;
}
export function parseReader(payload, input) {
  const target = normalize(input);
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { payload = { content: payload }; }
  }
  if (!payload || typeof payload !== 'object') fail('EMPTY_PAGE', '商品頁尚未載入完成。');
  if (payload.code && payload.code !== 200) fail('UPSTREAM_ERROR', '公開商品頁讀取服務暫時無法使用。');
  const data = payload.data ?? payload;
  if (data.url && normalize(data.url).id !== target.id) fail('PRODUCT_MISMATCH', '回傳資料不是這件商品，已停止報價。');
  let text = String(data.content ?? '').replace(/\r/g, '');
  if (text.length > 3000000) fail('PAGE_TOO_LARGE', '商品資料過大。');
  const source = text.match(/^URL Source:\s*(\S+)/m);
  if (source && normalize(source[1]).id !== target.id) fail('PRODUCT_MISMATCH', '回傳資料不是這件商品，已停止報價。');
  text = text.replace(/^([^\n]+)\n={3,}[ \t]*$/gm, '# $1').replace(/^([^\n]+)\n-{3,}[ \t]*$/gm, '## $1');
  if (!text.trim()) fail('EMPTY_PAGE', '商品頁尚未載入完成，這次沒有取得價格。');
  // Current page: the hero image binds the following inline title/price to the requested ID.
  const hero = new RegExp('https://media\\.bunjang\\.co\\.kr/product/' + target.id + '_').exec(text);
  const heading = /^#{1,2}\s+(.+)$/m.exec(text);
  let start;
  if (hero) start = Math.max(0, text.lastIndexOf('\n', hero.index));
  else if (heading) start = heading.index;
  else fail('PRODUCT_NOT_FOUND', '尚未讀到這件商品的主商品資料；可能仍在載入、已下架或需要登入。');
  let main = text.slice(start);
  const endMarkers = [/\n[ \t#]*(?:이 상품과 비슷해요|이 상품을 추천해요|비슷한 새 상품 보기)/, /\n[ \t#]*상점정보\/후기 더보기/, /\n[ \t#]*파워 링크/, /\n[ \t#]*회사소개/];
  let end = Math.min(main.length, 30000);
  for (const re of endMarkers) { const m = re.exec(main); if (m) end = Math.min(end, m.index); }
  main = main.slice(0, end);
  // Keep price extraction in the header, never in seller descriptions or recommendations.
  let headerEnd = Math.min(main.length, 8000);
  const headerStops = [/\n[^\n]*신고하기/, /\n[ \t]*\*\s*\*\s*\*[ \t]*\n/, /\n[ \t#]*(?:브랜드|상품상태|상품 상태|상품정보|상품설명|상품 설명|배송비|택배비|일반\s*택배)/];
  for (const re of headerStops) { const m = re.exec(main); if (m && m.index > 0) headerEnd = Math.min(headerEnd, m.index); }
  const header = main.slice(0, headerEnd);
  const lines = header.split('\n').map(clean).filter(Boolean);
  const candidates = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('http') || line.startsWith('![') || line.startsWith('[![')) continue;
    const m = line.match(/^(.*?)([0-9][0-9,]*)\s*원$/);
    if (!m) continue;
    const price = amount(m[2]);
    if (price === null) continue;
    let title = m[1].trim();
    if (!title && i > 0) title = lines[i - 1];
    if (!title || /^\d+(?:\/\d+)?$/.test(title) || /http|배송|택배|captcha|access denied|로그인|상품을 찾을 수/i.test(title)) continue;
    if (title.length > 400) continue;
    candidates.push({ price, title });
  }
  const prices = unique(candidates.map(c => c.price));
  if (prices.length !== 1) fail('PRICE_AMBIGUOUS', '主商品價格不明確，已停止報價，避免抓到其他商品價格。');
  const selected = candidates.find(c => c.price === prices[0]);
  // New layout places shipping AFTER the description, unlike the old header layout.
  let shippingBlock = '';
  const shippingLabel = /(?:^|\n)[ \t#*\-]*(?:배송비|택배비)[ \t:*]*(?:\n|$)/m.exec(main);
  if (shippingLabel) shippingBlock = main.slice(shippingLabel.index + shippingLabel[0].length, shippingLabel.index + shippingLabel[0].length + 800);
  else {
    const inline = /(?:^|\n)[ \t#*\-]*(?:배송비|택배비)[ \t:*]+([^\n]+)/m.exec(main);
    if (inline) shippingBlock = inline[1];
    else {
      const old = /(?:^|\n)[ \t*\-]*일반\s*택배[ \t:*]+(?:\n[ \t]*)?(?:[\d,]+\s*원|무료(?:배송)?)/m.exec(header);
      if (old) shippingBlock = old[0];
    }
  }
  shippingBlock = shippingBlock.split(/\n\s*(?:구매하기|상점|팔로우|후기)/)[0].replace(/\*\*/g, '');
  let shipping = null;
  const ordinary = [...shippingBlock.matchAll(/(?:^|[\s|])일반(?:\s*택배)?[ \t:|]*(?:\n[ \t]*)?([\d,]+)\s*원/g)].map(m => amount(m[1], true));
  const ordinaryValues = unique(ordinary);
  if (ordinaryValues.length > 1) fail('SHIPPING_AMBIGUOUS', '韓國一般宅配費出現不同金額，請先確認。');
  if (ordinaryValues.length === 1) shipping = ordinaryValues[0];
  else if (/(?:^|[\s|])일반(?:\s*택배)?[ \t:|]*(?:\n[ \t]*)?무료(?:\s*배송)?/.test(shippingBlock)) shipping = 0;
  else if (!/(?:GS|CU|반값|알뜰|착불)/i.test(shippingBlock)) {
    const generic = shippingBlock.trim().match(/^([\d,]+)\s*원(?:\s|$)/);
    if (generic) shipping = amount(generic[1], true);
    else if (/^(?:배송비\s*)?무료(?:\s*배송)?(?:\s|$)/.test(shippingBlock.trim())) shipping = 0;
  }
  if (shipping === null) fail('SHIPPING_UNKNOWN', '已讀到商品，但韓國一般宅配費未確認；不會把未知運費當成免運。');
  if (/(?:^|\n)[ \t#*]*(?:판매\s*완료|예약\s*중|거래\s*완료)[ \t*]*(?:\n|$)/.test(header)) fail('UNAVAILABLE_PRODUCT', '商品標示已售出或預約中，請先確認。');
  return { ...target, title: selected.title, priceKrw: prices[0], shippingKrw: shipping, shippingMethod: '韓國一般宅配', image: imageFor(main, target.id), evidence: { price: selected.title + ' ' + prices[0] + '원', shipping: shippingBlock.trim().slice(0, 180) } };
}
export function calculate(price, shipping, exchangeRate = 43, servicePercent = 5) {
  const p = amount(price), s = amount(shipping, true);
  if (p === null || s === null) fail('INVALID_AMOUNT', '請填寫有效的商品金額與韓國運費；免運請明確填 0。');
  const r = String(exchangeRate), f = String(servicePercent);
  if (!/^\d+(?:\.\d{1,4})?$/.test(r) || Number(r) < 1 || Number(r) > 1000 || !/^\d+(?:\.\d{1,2})?$/.test(f) || Number(f) > 100) fail('BAD_SETTINGS', '報價設定不正確。');
  const parts = v => { const [i, d = ''] = v.split('.'); return [BigInt(i + d), 10n ** BigInt(d.length)]; };
  const [ri, rs] = parts(r), [fi, fs] = parts(f), sum = p + s;
  const n = BigInt(sum) * rs * (100n * fs + fi), d = ri * 100n * fs;
  return { priceKrw: p, shippingKrw: s, subtotalKrw: sum, exchangeRate: Number(r), servicePercent: Number(f), baseTwd: sum / Number(r), serviceTwd: sum / Number(r) * Number(f) / 100, totalTwd: Number((n + d - 1n) / d) };
}
