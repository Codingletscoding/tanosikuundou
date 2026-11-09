const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const code = source.slice(source.indexOf('        const BRAND_BANNER_ASSET ='), source.indexOf('        const BrandBanner ='));
const asset = source.match(/const BRAND_BANNER_ASSET = '([^']+)'/)[1];
const encoded = fs.readFileSync(path.join(root, asset));

function fixture(fetcher) {
  const calls = [], blobs = [];
  const context = {
    Blob,
    fetch: async url => {
      calls.push(url);
      return fetcher ? fetcher() : { ok: true, arrayBuffer: async () => Uint8Array.from(encoded).buffer };
    },
    URL: { createObjectURL: blob => { blobs.push(blob); return 'blob:banner-test'; } }
  };
  vm.createContext(context);
  vm.runInContext(code + '\nthis.load = loadBrandBanner;', context);
  return { load: context.load, calls, blobs };
}

test('encoded banner restores the exact original PNG while direct PNG is removed', async () => {
  const f = fixture();
  assert.equal(await f.load(), 'blob:banner-test');
  assert.equal(f.blobs[0].type, 'image/png');
  const restored = Buffer.from(await f.blobs[0].arrayBuffer());
  assert.equal(crypto.createHash('sha256').update(restored).digest('hex'), 'c9da35c9e52ec065aec2348e2d149f14c74b5ffa106007afdf455887af02e70a');
  assert.equal(restored.readUInt32BE(16), 2048); assert.equal(restored.readUInt32BE(20), 768);
  assert(!encoded.subarray(0, 8).equals(restored.subarray(0, 8)));
  assert(!fs.existsSync(path.join(root, 'jj.png')));
  assert(!source.includes('jj.png'));
});

test('concurrent banners and later views share one download and one Blob URL', async () => {
  const f = fixture(), first = f.load(), second = f.load();
  assert.equal(first, second);
  await first; await f.load();
  assert.deepEqual(f.calls, [asset]); assert.equal(f.blobs.length, 1);
});

test('failed downloads can retry without caching a rejected promise', async () => {
  let ok = false;
  const f = fixture(() => ({ ok, arrayBuffer: async () => Uint8Array.from(encoded).buffer }));
  await assert.rejects(f.load(), /unavailable/); assert.equal(f.blobs.length, 0);
  ok = true; assert.equal(await f.load(), 'blob:banner-test'); assert.equal(f.calls.length, 2);
});

test('corrupted resources never become an image Blob and allow a later retry', async () => {
  const f = fixture(() => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
  for (let i = 0; i < 2; i++) await assert.rejects(f.load(), /Invalid/);
  assert.equal(f.calls.length, 2); assert.equal(f.blobs.length, 0);
});
