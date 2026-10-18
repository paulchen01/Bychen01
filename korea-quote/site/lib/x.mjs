import { normalize, PlatformError } from './platforms.mjs';

const HOSTS = new Set(['publish.twitter.com', 'publish.x.com']);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;

function fail(code, message) { throw new PlatformError(code, message); }
const explicitPort = value => /^(?:https?:)?\/\/[^/?#]*:\d+(?=[/?#]|$)/i.test(String(value).trim());

function postIdentity(value) {
  let url;
  try { url = new URL(value); }
  catch { fail('PRODUCT_MISMATCH', '公開貼文連結無法核對，已停止讀取。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || explicitPort(value)) {
    fail('PRODUCT_MISMATCH', '公開貼文連結無法核對，已停止讀取。');
  }
  let target;
  try { target = normalize(url.href); }
  catch { fail('PRODUCT_MISMATCH', '公開貼文連結無法核對，已停止讀取。'); }
  if (target.platformId !== 'x' || target.kind !== 'post') {
    fail('PRODUCT_MISMATCH', '公開貼文連結無法核對，已停止讀取。');
  }
  return target;
}

function endpoint(value, base, post) {
  if (typeof value !== 'string' || value.length > 8192) {
    fail('OEMBED_REDIRECT_UNSAFE', '公開貼文服務的轉址無法確認，請貼上原平台的完整貼文網址。');
  }
  let url;
  try { url = new URL(value, base); }
  catch { fail('OEMBED_REDIRECT_UNSAFE', '公開貼文服務的轉址無法確認，請貼上原平台的完整貼文網址。'); }
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname) ||
      url.pathname !== '/oembed' || url.username || url.password || url.port || explicitPort(value) || url.hash) {
    fail('OEMBED_REDIRECT_UNSAFE', '公開貼文服務轉到未支援的目的地，已停止讀取。');
  }
  const embedded = url.searchParams.getAll('url');
  if (embedded.length !== 1 || postIdentity(embedded[0]).key !== post.key) {
    fail('PRODUCT_MISMATCH', '公開貼文服務轉址後不是同一則貼文，已停止讀取。');
  }
  return url.href;
}

/**
 * Read the official public oEmbed endpoint without logging in.
 * Every redirect is validated before the next request. The caller supplies its
 * bounded response reader; the existing post parser verifies the final payload.
 */
export async function loadXEmbed(target, fetchImpl = fetch, deadline = Date.now() + 48000, readText) {
  if (typeof readText !== 'function') throw new TypeError('A bounded response reader is required.');
  const post = postIdentity(target?.url);
  if (target.platformId !== 'x' || target.kind !== 'post' || target.key !== post.key) {
    fail('PRODUCT_MISMATCH', '待查詢資料不是同一則公開貼文，已停止讀取。');
  }
  const params = new URLSearchParams({
    url: post.url.replace('https://x.com/', 'https://twitter.com/'),
    omit_script: '1',
    hide_thread: 'true'
  });
  let url = endpoint('https://publish.twitter.com/oembed?' + params, undefined, post);
  const visited = new Set();
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (visited.has(url)) fail('REDIRECT_LIMIT', '公開貼文服務出現重複轉址，請稍後再試。');
    visited.add(url);
    const remaining = deadline - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      fail('UPSTREAM_TIMEOUT', '公開貼文服務讀取逾時，請稍後再試。');
    }
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.max(1, Math.min(14000, Math.floor(remaining))))
    });
    if (REDIRECTS.has(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) fail('REDIRECT_UNAVAILABLE', '公開貼文服務轉址未提供目的地，請稍後再試。');
      const next = endpoint(location, url, post);
      if (redirects === MAX_REDIRECTS || visited.has(next)) {
        fail('REDIRECT_LIMIT', '公開貼文服務轉址次數過多或重複，請稍後再試。');
      }
      url = next;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      fail('PUBLIC_POST_UNAVAILABLE', response.status === 429
        ? '公開貼文服務目前限制查詢次數，請稍後再試。'
        : '這則推文未能公開讀取，可能需要登入、已刪除或受到平台限制。請核對原貼文的韓幣售價與運費後使用手動試算。');
    }
    return readText(response);
  }
  fail('REDIRECT_LIMIT', '公開貼文服務轉址次數過多，請稍後再試。');
}
