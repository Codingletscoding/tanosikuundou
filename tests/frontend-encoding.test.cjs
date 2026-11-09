const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { encodeJS, encodeHTML } = require('../tools/encode-frontend.cjs');

test('encoded strings, templates and regular expressions retain Chinese and emoji values', () => {
  const source = '// 中文備註\nglobalThis.result = ["課程🏸", `教練 ${"姓名"}`, /[中文]/u.test("中"), /訓練/.test("訓練")];';
  const encoded = encodeJS(source);
  assert(!/[^\x00-\x7f]/.test(encoded));
  const before = {}, after = {};
  vm.runInNewContext(source, before); vm.runInNewContext(encoded, after);
  assert.equal(JSON.stringify(after.result), JSON.stringify(before.result));
  assert.equal(encodeJS(encoded), encoded);
});

test('JSX text and attributes use character references while expressions use JavaScript escapes', () => {
  const encoded = encodeJS('const view = <p aria-label="課程">課程 <b>{"教練"}</b>🏸</p>;');
  assert(encoded.includes('aria-label="&#x8ab2;&#x7a0b;"'));
  assert(encoded.includes('"\\u6559\\u7df4"'));
  assert(!/[^\x00-\x7f]/.test(encoded));
  assert.equal(encodeJS(encoded), encoded);
});

test('raw tagged templates are rejected instead of changing their observable value', () => {
  assert.throws(() => encodeJS('const value = String.raw`中文`;'), /Tagged template/);
});

test('HTML titles and CSS selectors retain decoded text with no literal Chinese', () => {
  const encoded = encodeHTML('<title>樂動羽球</title><style>[data-label="操作"]{color:red}</style>');
  assert(encoded.includes('&#x6a02;'));
  assert(encoded.includes('\\64cd \\4f5c '));
  assert(!/[^\x00-\x7f]/.test(encoded));
  assert.equal(encodeHTML(encoded), encoded);
});
