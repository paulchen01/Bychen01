import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize, PlatformError } from '../lib/platforms.mjs';
import { parseXEmbed } from '../lib/extract.mjs';
import { quoteForProduct } from '../lib/estimate.mjs';
import { loadXEmbed } from '../lib/x.mjs';
import { lookup } from '../api/quote.js';

const POST = 'https://x.com/hellolivetv/status/1910256553699262759';
const TARGET = normalize(POST);
const RAW = readFileSync(new URL('./fixtures/x-oembed-hellolive.json', import.meta.url), 'utf8');
const embedUrl = (host = 'publish.x.com', post = POST.replace('https://x.com/', 'https://twitter.com/')) =>
  'https://' + host + '/oembed?' + new URLSearchParams({ url: post, omit_script: '1', hide_thread: 'true' });
const readText = response => response.text();
const code = expected => error => error instanceof PlatformError && error.code === expected;
const load = fetchImpl => loadXEmbed(TARGET, fetchImpl, Date.now() + 48000, readText);
const redirect = (location, status = 301) => new Response(null, { status, headers: location ? { Location: location } : {} });

test('observed official twitter-to-x oEmbed redirect returns the real public response', async () => {
  const calls = [];
  const raw = await load(async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? redirect(embedUrl()) : new Response(RAW, { headers: { 'Content-Type': 'application/json' } });
  });
  assert.equal(raw, RAW);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, embedUrl('publish.twitter.com'));
  assert.equal(calls[1].url, embedUrl('publish.x.com'));
  assert.ok(calls.every(call => call.options.redirect === 'manual'));
  assert.ok(calls.every(call => call.options.signal instanceof AbortSignal));
  assert.ok(calls.every(call => call.options.headers.Accept === 'application/json'));
});

test('real sales announcement without an explicit KRW price stays unquoted after transport repair', async () => {
  const raw = await load(async () => new Response(RAW));
  const product = parseXEmbed(raw, POST);
  assert.equal(product.id, TARGET.id);
  assert.equal(product.reasonCode, 'SOCIAL_POST_CONFIRMATION');
  assert.equal(product.priceKrw, null);
  assert.equal(product.shippingKrw, null);
  assert.equal(quoteForProduct(product, 38), null);
  assert.match(product.postExcerpt, /2025/);
});

for (const status of [301, 302, 303, 307, 308]) {
  test('handles supported official redirect status ' + status, async () => {
    let requests = 0;
    const raw = await load(async () => ++requests === 1 ? redirect(embedUrl(), status) : new Response(RAW));
    assert.equal(raw, RAW);
    assert.equal(requests, 2);
  });
}

test('accepts the same immutable post ID through an x.com instead of twitter.com query URL', async () => {
  let requests = 0;
  const raw = await load(async () => ++requests === 1 ? redirect(embedUrl('publish.x.com', POST)) : new Response(RAW));
  assert.equal(raw, RAW);
});

test('allows an observed relative redirect only when its resolved endpoint and post are still valid', async () => {
  const relative = '/oembed?' + new URLSearchParams({ url: POST, omit_script: '1', hide_thread: 'true' });
  let requests = 0;
  const raw = await load(async () => ++requests === 1 ? redirect(relative) : new Response(RAW));
  assert.equal(raw, RAW);
});

for (const [name, destination] of [
  ['external domain', embedUrl('example.invalid')],
  ['login route', 'https://publish.x.com/login?url=' + encodeURIComponent(POST)],
  ['http downgrade', embedUrl().replace('https://', 'http://')],
  ['credentials', embedUrl().replace('https://', 'https://user:password@')],
  ['non-default port', embedUrl().replace('publish.x.com', 'publish.x.com:8443')],
  ['explicit default port', embedUrl().replace('publish.x.com', 'publish.x.com:443')],
  ['subdomain lookalike', embedUrl().replace('publish.x.com', 'publish.x.com.example.invalid')],
  ['fragment', embedUrl() + '#login']
]) {
  test('rejects ' + name + ' before making the next request', async () => {
    let requests = 0;
    await assert.rejects(() => load(async () => { requests++; return redirect(destination); }), code('OEMBED_REDIRECT_UNSAFE'));
    assert.equal(requests, 1);
  });
}

for (const [name, destination] of [
  ['different post', embedUrl('publish.x.com', POST.replace('1910256553699262759', '1910256553699262760'))],
  ['missing post URL', 'https://publish.x.com/oembed?omit_script=1'],
  ['duplicate post URL', embedUrl() + '&url=' + encodeURIComponent(POST)],
  ['non-post query', embedUrl('publish.x.com', 'https://x.com/hellolivetv')],
  ['external query URL', embedUrl('publish.x.com', 'https://example.invalid/item/1')],
  ['explicit post URL port', embedUrl('publish.x.com', POST.replace('x.com', 'x.com:443'))],
  ['malformed query URL', embedUrl('publish.x.com', 'not a URL')]
]) {
  test('rejects ' + name + ' in the redirect query without following it', async () => {
    let requests = 0;
    await assert.rejects(() => load(async () => { requests++; return redirect(destination); }), code('PRODUCT_MISMATCH'));
    assert.equal(requests, 1);
  });
}

test('rejects a redirect without Location', async () => {
  await assert.rejects(() => load(async () => redirect(null)), code('REDIRECT_UNAVAILABLE'));
});

test('detects a two-host redirect loop before re-requesting either URL', async () => {
  let requests = 0;
  await assert.rejects(() => load(async () => {
    requests++;
    return redirect(requests === 1 ? embedUrl() : embedUrl('publish.twitter.com'));
  }), code('REDIRECT_LIMIT'));
  assert.equal(requests, 2);
});

test('permits at most three redirects and never fetches a fifth URL', async () => {
  let requests = 0;
  await assert.rejects(() => load(async () => {
    requests++;
    return redirect(embedUrl() + '&hop=' + requests, 302);
  }), code('REDIRECT_LIMIT'));
  assert.equal(requests, 4);
});

for (const status of [401, 403, 404, 429, 500]) {
  test('does not retry or switch hosts after public endpoint HTTP ' + status, async () => {
    let requests = 0;
    await assert.rejects(() => load(async () => {
      requests++;
      return new Response('Unavailable', { status });
    }), code('PUBLIC_POST_UNAVAILABLE'));
    assert.equal(requests, 1);
  });
}

test('honors the shared deadline before starting a request', async () => {
  let requests = 0;
  await assert.rejects(
    () => loadXEmbed(TARGET, async () => { requests++; return new Response(RAW); }, Date.now() - 1, readText),
    code('UPSTREAM_TIMEOUT')
  );
  assert.equal(requests, 0);
});

test('rejects mismatched target metadata before any outbound request', async () => {
  let requests = 0;
  await assert.rejects(
    () => loadXEmbed({ ...TARGET, key: 'x:wrong' }, async () => { requests++; return new Response(RAW); }, Date.now() + 48000, readText),
    code('PRODUCT_MISMATCH')
  );
  assert.equal(requests, 0);
});

test('preserves bounded-reader failures instead of returning partial content', async () => {
  await assert.rejects(
    () => loadXEmbed(TARGET, async () => new Response(RAW), Date.now() + 48000, async () => {
      throw new PlatformError('PAGE_TOO_LARGE', 'Too large');
    }),
    code('PAGE_TOO_LARGE')
  );
});

test('final payload post identity remains checked by the existing parser', async () => {
  const data = JSON.parse(RAW);
  data.url = POST.replace('1910256553699262759', '1910256553699262760');
  const raw = await load(async () => new Response(JSON.stringify(data)));
  const product = parseXEmbed(raw, POST);
  assert.equal(product.reasonCode, 'PRODUCT_MISMATCH');
  assert.equal(quoteForProduct(product, 38), null);
});

test('transport forwards an explicit single-price example to the existing quote parser unchanged', async () => {
  // Synthetic parser contract case; no claim of a real live priced-listing test.
  const sample = {
    url: POST,
    html: '<blockquote><p>인형 1개 판매<br>판매가: 10,000원<br>배송비: 3,000원</p></blockquote>'
  };
  const raw = await load(async () => new Response(JSON.stringify(sample)));
  const product = parseXEmbed(raw, POST);
  assert.equal(product.priceKrw, 10000);
  assert.equal(product.shippingKrw, 3000);
  assert.notEqual(quoteForProduct(product, 38), null);
});

test('API lookup uses the new loader across the real official 301 and preserves no-price confirmation', async () => {
  const requests = [];
  const product = await lookup(POST, async (url, options) => {
    requests.push({ url, redirect: options.redirect });
    if (url === embedUrl('publish.twitter.com')) return redirect(embedUrl());
    if (url === embedUrl()) return new Response(RAW, { headers: { 'Content-Type': 'application/json' } });
    throw new Error('Unexpected API lookup request: ' + url);
  });
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.redirect === 'manual'));
  assert.equal(product.id, TARGET.id);
  assert.equal(product.reasonCode, 'SOCIAL_POST_CONFIRMATION');
  assert.match(product.postExcerpt, /2025/);
  assert.equal(quoteForProduct(product, 38), null);
});

test('API lookup quotes the explicitly synthetic single-KRW-price fixture after the official redirect', async () => {
  const raw = readFileSync(new URL('./fixtures/x-oembed-synthetic-priced.json', import.meta.url), 'utf8');
  const sample = JSON.parse(raw);
  const requests = [];
  const oldEndpoint = embedUrl('publish.twitter.com', sample.url.replace('https://x.com/', 'https://twitter.com/'));
  const newEndpoint = embedUrl('publish.x.com', sample.url.replace('https://x.com/', 'https://twitter.com/'));
  const product = await lookup(sample.url, async (url, options) => {
    requests.push({ url, redirect: options.redirect });
    if (url === oldEndpoint) return redirect(newEndpoint);
    if (url === newEndpoint) return new Response(raw, { headers: { 'Content-Type': 'application/json' } });
    throw new Error('Unexpected synthetic API lookup request: ' + url);
  });
  assert.equal(requests.length, 2);
  assert.equal(product.id, normalize(sample.url).id);
  assert.equal(product.currency, 'KRW');
  assert.equal(product.priceKrw, 10000);
  assert.equal(product.shippingKrw, 3000);
  assert.equal(product.status, 'quoted');
  const quote = quoteForProduct(product, 38);
  assert.notEqual(quote, null);
  assert.equal(quote.priceKrw, 10000);
  assert.equal(quote.shippingKrw, 3000);
});
