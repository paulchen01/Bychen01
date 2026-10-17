import { normalize as normalizePlatform } from './platforms.mjs';

export { PRICING_VERSION as VERSION, calculate } from './pricing.mjs';

export class QuoteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'QuoteError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new QuoteError(code, message); };

// Keep URL recognition in one place so every reader uses the same product ID.
export function normalize(input) {
  let target;
  try { target = normalizePlatform(input); }
  catch (error) { fail(error.code || 'INVALID_URL', error.message); }
  if (target.platformId !== 'bunjang' || target.market !== 'kr') {
    fail('UNSUPPORTED_SITE', '目前支援 Bunjang 韓國商品網址。');
  }
  if (target.kind !== 'product') {
    fail('INVALID_PRODUCT', '請貼上可確認商品編號的 Bunjang 商品頁。');
  }
  return { id: target.id, url: target.url };
}

function amount(value, zero = false) {
  const text = String(value ?? '').replace(/[₩원\s]/g, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
  const number = Number(text.replace(/,/g, ''));
  return Number.isSafeInteger(number) && number >= (zero ? 0 : 1) && number <= 1e9 ? number : null;
}

function clean(value) {
  return String(value).trim()
    .replace(/^#{1,6}\s+/, '').replace(/\s+#+$/, '')
    .replace(/^(?:[-*+•]\s+)+/, '').replace(/\*\*|__/g, '')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

function unique(values) { return [...new Set(values.filter(value => value !== null))]; }

function rowsFrom(text) {
  // Both ATX and Setext headings occur in public rendered-page readers.
  text = text.replace(/^([^\n]+)\n={3,}[ \t]*$/gm, '# $1')
    .replace(/^([^\n]+)\n-{3,}[ \t]*$/gm, (whole, line) =>
      /^\s*(?:[-*+#]|!\[|\[!\[)/.test(line) ? whole : '## ' + line);
  let fenced = false;
  return text.split('\n').map((raw, index) => {
    const fence = /^\s*(?:\x60{3}|~~~)/.test(raw), quoted = fenced || fence || /^\s*>/.test(raw);
    if (fence) fenced = !fenced;
    return {
    raw, index, text: clean(raw),
    heading: raw.trim().match(/^(#{1,6})\s+/)?.[1].length || 0,
    bullet: /^\s*[-*+•]\s+/.test(raw),
    indent: raw.match(/^\s*/)[0].length,
    imageIds: [...raw.matchAll(/https:\/\/media\.bunjang\.co\.kr\/product\/(\d{5,15})_/g)].map(match => match[1]),
    media: /!\[|https?:\/\//.test(raw),
    divider: /^\s*(?:-{3,}|\*\s*\*\s*\*|_{3,})\s*$/.test(raw),
    quoted
    };
  });
}

const sectionEnd = row => /^(?:이 상품과 비슷해요|이 상품을 추천해요|비슷한 새 상품 보기|판매자의 다른 상품|이 판매자의 다른 상품|추천\s*상품|연관\s*상품|상점정보\s*\/\s*후기 더보기|상점\s*정보|판매자\s*정보|파워 링크|회사소개)/.test(row.text);
const descriptionEnd = row => row.divider || /^(?:상품\s*설명|상세\s*설명|신고하기)(?:\s|[:：]|$)/.test(row.text);
const unavailable = row => !row.media && (
  /^(?:(?:판매|거래)\s*상태\s*[:：]?\s*)?(?:판매\s*완료|예약\s*중|거래\s*완료)(?:$|\s*[:：])/.test(row.text) ||
  /^[[(](?:판매\s*완료|예약\s*중|거래\s*완료)[\])](?:\s|$)/.test(row.text)
);

function field(row) {
  if (row.quoted || row.media) return null;
  const labels = [
    ['shipping', /^(배송비|택배비)(?:\s*[:：]\s*|\s+|$)(.*)$/],
    ['ordinary', /^(일반\s*(?:택배|배송)(?:비)?)(?:\s*[:：]\s*|\s+|$)(.*)$/],
    ['brand', /^(브랜드)(?:\s*[:：]\s*|\s+|$)(.*)$/],
    ['condition', /^(상품\s*상태)(?:\s*[:：]\s*|\s+|$)(.*)$/],
    ['quantity', /^(수량)(?:\s*[:：]\s*|\s+|$)(.*)$/],
    ['region', /^(거래\s*지역|지역)(?:\s*[:：]\s*|\s+|$)(.*)$/],
    ['category', /^(카테고리)(?:\s*[:：]\s*|\s+|$)(.*)$/],
    ['sale', /^((?:판매|거래)\s*상태)(?:\s*[:：]\s*|\s+|$)(.*)$/],
    ['details', /^(상품\s*정보|상세\s*정보)(?:\s*[:：]\s*|\s+|$)(.*)$/]
  ];
  for (const [kind, regex] of labels) {
    const match = row.text.match(regex);
    if (match) return { kind, label: match[1], value: match[2] };
  }
  return null;
}

const uiLine = row => !row.quoted && /^(?:\d+(?:\s*\/\s*\d+)?|\d+\s*(?:초|분|시간|일|주|개월|년)\s*전|(?:찜|조회|관심|댓글)\s*\d+|번개페이|안전결제|번개톡|구매하기|찜하기)$/.test(row.text);

function wonPrice(row) {
  if (row.media || row.quoted || row.bullet) return null;
  const match = row.text.match(/^(?:(?:판매가|상품\s*가격|가격)\s*[:：]?\s*)?(?:₩\s*([0-9][0-9,]*)(?:\s*원)?|([0-9][0-9,]*)\s*원)$/);
  return match ? amount(match[1] ?? match[2]) : null;
}

function titleRow(row) {
  if (!row.text || row.text.length > 400 || row.media || row.quoted || row.bullet || row.divider || uiLine(row) || unavailable(row) || sectionEnd(row)) return false;
  if (wonPrice(row) !== null || /^\d[\d,\s./]*$/.test(row.text)) return false;
  if (/^(?:번개장터|상품정보|상품 설명|홈|카테고리|검색|로그인|회원가입|Markdown Content:|Title:|URL Source:)$/.test(row.text)) return false;
  if (/captcha|access denied|403 error|404 not found|상품을 찾을 수/i.test(row.text)) return false;
  const item = field(row);
  return !item || (row.heading === 1 && item.value && !['shipping', 'ordinary', 'sale'].includes(item.kind));
}

function assertSource(source, target) {
  let sourceTarget;
  try { sourceTarget = normalize(source); }
  catch { fail('PRODUCT_MISMATCH', '回傳資料不是可確認的同一件商品，已停止報價。'); }
  if (sourceTarget.id !== target.id) fail('PRODUCT_MISMATCH', '回傳資料不是這件商品，已停止報價。');
}

function imageFor(rows, id) {
  const pattern = new RegExp('https://media\\.bunjang\\.co\\.kr/product/' + id + '_[^\\s)\\]"<>]+', 'g');
  for (const row of rows) for (const match of row.raw.matchAll(pattern)) {
    try {
      const url = new URL(match[0]);
      if (!/%7B|\{|%7D|\}/i.test(url.href)) return url.href;
    } catch { /* An unusable image must not invalidate an otherwise known price. */ }
  }
  return null;
}

function mainRows(rows, target, sourceVerified) {
  const stop = rows.findIndex(sectionEnd);
  const top = stop < 0 ? rows : rows.slice(0, stop);
  const firstImage = top.findIndex(row => row.imageIds.length);
  let start;
  if (firstImage >= 0) {
    if (top[firstImage].imageIds.some(id => id !== target.id)) {
      fail('PRODUCT_MISMATCH', '主商品圖片與商品編號不符，已停止報價。');
    }
    start = firstImage;
    // A new layout puts H1 before the gallery; the old layout puts it after it.
    for (let index = firstImage - 1, scanned = 0; index >= 0 && scanned < 4000; index--) {
      const row = top[index];
      scanned += row.raw.length + 1;
      if (row.heading && titleRow(row)) { start = index; break; }
      if (row.divider || field(row) || sectionEnd(row)) break;
    }
  } else {
    if (!sourceVerified) fail('PRODUCT_NOT_FOUND', '尚未讀到與商品編號相符的主商品資料，請稍後再試。');
    start = top.findIndex(row => row.heading && titleRow(row));
    if (start < 0) fail('PRODUCT_NOT_FOUND', '尚未讀到這件商品的主商品資料；可能仍在載入、已下架或需要登入。');
  }
  // Include a badge placed immediately above the product title or gallery.
  for (let index = start - 1; index >= 0 && start - index <= 6; index--) {
    if (!top[index].text) continue;
    if (unavailable(top[index])) start = index;
    else break;
  }
  const main = [];
  let size = 0;
  for (const row of top.slice(start)) {
    if (row.imageIds.some(id => id !== target.id) || size + row.raw.length > 30000) break;
    main.push(row);
    size += row.raw.length + 1;
  }
  return main;
}

function productHeader(main) {
  const header = [];
  let size = 0;
  for (const row of main) {
    if ((header.length && (field(row) || descriptionEnd(row))) || sectionEnd(row) || size + row.raw.length > 8000) break;
    header.push(row);
    size += row.raw.length + 1;
  }
  return header;
}

const shippingDetail = text => /^(?:일반|택배|배송|무료|[\d,]+\s*원|GS|CU|편의점|반값|알뜰|착불|선불|별도|포함|문의|협의|조건|제주|도서|지역|직거래|방문)/i.test(text);

function metadataRows(main, priceRow) {
  const output = [];
  let active = null, remaining = 0, size = 0;
  for (const row of main.slice(main.indexOf(priceRow) + 1)) {
    if (!row.text) continue;
    if (descriptionEnd(row) || sectionEnd(row) || row.quoted || size + row.raw.length > 6000) break;
    const item = field(row);
    if (item) {
      active = item;
      remaining = ['details', 'shipping', 'ordinary'].includes(item.kind) || item.value ? 0 : 1;
    } else if (unavailable(row) || uiLine(row) || (row.media && !row.imageIds.length)) {
      // Public UI counters, icons and status badges can separate metadata fields.
    } else if (active && ['shipping', 'ordinary'].includes(active.kind) && shippingDetail(row.text)) {
      // Only semantic shipping rows belong to this field, even without a divider.
    } else if (active && remaining > 0 && !row.heading) {
      remaining--;
    } else break;
    output.push(row);
    size += row.raw.length + 1;
  }
  return output;
}

function shippingBlocks(metadata) {
  const blocks = [];
  let active = null;
  for (const row of metadata) {
    const item = field(row);
    if (item && ['shipping', 'ordinary'].includes(item.kind)) {
      // Ordinary delivery can be a child of 배송비 or a legacy standalone field.
      if (item.kind === 'ordinary' && active) active.push(row.text);
      else {
        active = [];
        blocks.push(active);
        if (item.kind === 'ordinary') active.push(row.text);
        else if (item.value) active.push(item.value);
      }
    } else if (item) active = null;
    else if (active && !row.media && shippingDetail(row.text)) active.push(row.text);
    else if (active && !uiLine(row) && !unavailable(row)) active = null;
  }
  return blocks.filter(block => block.length);
}

function shippingAmount(blocks) {
  const groups = [];
  for (const block of blocks) {
    let group = { method: 'generic', lines: [] };
    groups.push(group);
    for (const text of block.flatMap(line => line.split(/\s+[|/]\s+/))) {
      const ordinary = text.match(/^(?:일반(?:\s*(?:택배|배송))?(?:비)?|택배)(?:\s*[:：]\s*|\s+|$)(.*)$/);
      if (ordinary) {
        group = { method: 'ordinary', lines: ordinary[1] ? [ordinary[1]] : [] };
        groups.push(group);
      } else if (/^(?:GS|CU|편의점|반값|알뜰|직거래|방문)/i.test(text)) {
        group = { method: 'other', lines: [text] };
        groups.push(group);
      } else group.lines.push(text);
    }
  }
  function valueFor(group) {
    const text = group.lines.join(' ');
    if (/GS|CU|편의점|반값|알뜰|착불|조건|이상|미만|제주|도서|지역|추가|문의|협의|별도|부터|~|～/i.test(text)) return null;
    const values = unique(group.lines.map(line => {
      if (/^(?:무료\s*배송|무료|배송비\s*포함)(?:\s*\(선불\))?$/.test(line)) return 0;
      const match = line.match(/^([0-9][0-9,]*)\s*원(?:\s*\(선불\))?$/);
      return match ? amount(match[1], true) : null;
    }));
    if (values.length > 1) fail('SHIPPING_AMBIGUOUS', '韓國一般宅配費出現不同金額，請先確認。');
    return values.length === 1 ? values[0] : null;
  }
  const ordinary = groups.filter(group => group.method === 'ordinary');
  const relevant = ordinary.length ? ordinary : groups.filter(group => group.lines.length);
  if (!ordinary.length && relevant.some(group => group.method === 'other')) return null;
  const values = relevant.map(valueFor), known = unique(values);
  if (known.length > 1) fail('SHIPPING_AMBIGUOUS', '韓國一般宅配費出現不同金額，請先確認。');
  return known.length === 1 && values.every(value => value !== null) ? known[0] : null;
}

function shippingRestricted(main, priceRow) {
  const priceIndex = main.indexOf(priceRow);
  const boundary = main.findIndex((row, index) => index > priceIndex && descriptionEnd(row));
  if (boundary < 0) return false;
  // Seller prose may restrict delivery, but it must never supply a price or fee.
  // main already ends before related items and the seller's other listings.
  const description = main.slice(boundary + 1).filter(row => !row.media && !row.quoted).map(row => row.text).join('\n');
  return /(?:반택|반값\s*(?:택배)?|알뜰\s*(?:택배)?|편의점\s*택배)\s*만\s*(?:가능|합니다|해요)|일반\s*택배\s*(?:불가|안\s*돼|안\s*되)|직거래\s*만/.test(description);
}

export function parseReader(payload, input, { allowMissingShipping = false } = {}) {
  const target = normalize(input);
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); }
    catch { payload = { content: payload }; }
  }
  if (!payload || typeof payload !== 'object') fail('EMPTY_PAGE', '商品頁尚未載入完成。');
  if (payload.code && payload.code !== 200) fail('UPSTREAM_ERROR', '公開商品頁讀取服務暫時無法使用。');
  const data = payload.data ?? payload;
  let sourceVerified = false;
  if (data.url) { assertSource(data.url, target); sourceVerified = true; }
  let text = typeof data.content === 'string' ? data.content.replace(/\r/g, '') : '';
  if (text.length > 3000000) fail('PAGE_TOO_LARGE', '商品資料過大。');
  if (!text.trim()) fail('EMPTY_PAGE', '商品頁尚未載入完成，這次沒有取得價格。');
  const source = text.slice(0, 6000).match(/^URL Source:\s*(\S+)/m);
  if (source) { assertSource(source[1], target); sourceVerified = true; }
  const markdown = /^Markdown Content:[ \t]*\n/m.exec(text);
  if (markdown) text = text.slice(markdown.index + markdown[0].length);
  if (/^#{0,3}\s*403 ERROR\s*$/mi.test(text) && /Request blocked|Generated by cloudfront|request could not be satisfied/i.test(text)) {
    fail('ACCESS_RESTRICTED', '平台未提供可公開讀取的商品內容，請稍後再試或到 LINE 確認。');
  }
  const main = mainRows(rowsFrom(text), target, sourceVerified);
  const header = productHeader(main);
  if (header.some(unavailable)) fail('UNAVAILABLE_PRODUCT', '商品標示已售出或預約中，請先確認。');
  const candidates = header.map(row => ({ row, price: wonPrice(row) })).filter(candidate => candidate.price !== null);
  // Legacy readers sometimes combine an unheaded title and price on one line.
  if (!candidates.length) for (const row of header) {
    if (row.heading || row.media || row.quoted || row.bullet) continue;
    const match = row.text.match(/^(.{2,400}?)\s+([0-9][0-9,]*)\s*원$/);
    if (match && titleRow({ ...row, text: match[1] }) && amount(match[2]) !== null) {
      candidates.push({ row, price: amount(match[2]), title: match[1] });
    }
  }
  const prices = unique(candidates.map(candidate => candidate.price));
  if (prices.length !== 1) fail('PRICE_AMBIGUOUS', '主商品價格不明確，已停止報價，避免抓到其他商品價格。');
  const selected = candidates[0];
  const beforePrice = header.slice(0, header.indexOf(selected.row)).filter(titleRow);
  const title = beforePrice.find(row => row.heading === 1)?.text || beforePrice.find(row => row.heading)?.text || selected.title || beforePrice.at(-1)?.text;
  if (!title) fail('PRODUCT_NOT_FOUND', '尚未確認主商品名稱，已停止報價，避免抓錯商品。');
  const metadata = metadataRows(main, candidates.at(-1).row);
  if ([...header, ...metadata].some(unavailable) || /^[[(]?(?:판매\s*완료|예약\s*중|거래\s*완료)(?:[\])]|\s|$)/.test(title)) {
    fail('UNAVAILABLE_PRODUCT', '商品標示已售出或預約中，請先確認。');
  }
  if (shippingRestricted(main, selected.row)) {
    fail('SHIPPING_RESTRICTED', '賣家文字限制寄送方式，需確認能否使用韓國一般宅配，暫不提供完整報價。');
  }
  const blocks = shippingBlocks(metadata), shipping = shippingAmount(blocks);
  if (shipping === null && !allowMissingShipping) {
    fail('SHIPPING_UNKNOWN', '已讀到商品，但韓國一般宅配費未確認；不會把未知運費當成免運。');
  }
  return {
    ...target, title, priceKrw: prices[0], shippingKrw: shipping,
    shippingMethod: '韓國一般宅配', image: imageFor(main, target.id),
    evidence: { price: title + ' ' + prices[0] + '원', shipping: blocks.flat().join('\n').slice(0, 180) }
  };
}
