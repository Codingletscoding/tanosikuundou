const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');

const nonASCII = /[^\x00-\x7f]/g;
const unicode = text => text.replace(nonASCII, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
const entities = text => Array.from(text, char => char.charCodeAt(0) < 128 ? char : '&#x' + char.codePointAt(0).toString(16) + ';').join('');
const parseJS = source => parse(source, { sourceType: 'script', plugins: ['jsx'] });

function walk(node, visit, parent) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(item => walk(item, visit, parent)); return; }
  if (node.type) visit(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (!['loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) walk(value, visit, node);
  }
}

// Compare parsed values, rather than spelling, including decoded JSX entities.
function semanticAST(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(semanticAST);
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    if (node.type === 'TemplateElement' && key === 'value') result.value = { cooked: value.cooked };
    else if (node.type === 'RegExpLiteral' && key === 'pattern') result.pattern = unicode(value);
    else result[key] = semanticAST(value);
  }
  return result;
}

function encodeJS(source) {
  const before = parseJS(source), jsxRanges = [];
  walk(before, (node, parent) => {
    if (node.type === 'TaggedTemplateExpression' && node.quasi.quasis.some(part => /[^\x00-\x7f]/.test(part.value.raw))) {
      throw new Error('Tagged template raw text requires a separate conversion.');
    }
    if (node.type === 'JSXIdentifier' && /[^\x00-\x7f]/.test(node.name)) throw new Error('Non-ASCII JSX names require a separate conversion.');
    if (node.type === 'RegExpLiteral' && /\\+[^\x00-\x7f]/.test(node.pattern)) throw new Error('Escaped non-ASCII regex text requires a separate conversion.');
    if (node.type === 'JSXText' || (node.type === 'StringLiteral' && parent?.type === 'JSXAttribute')) jsxRanges.push([node.start, node.end]);
  });
  jsxRanges.sort((a, b) => a[0] - b[0]);
  let offset = 0, output = '';
  for (const [start, end] of jsxRanges) {
    output += unicode(source.slice(offset, start)) + entities(source.slice(start, end));
    offset = end;
  }
  output += unicode(source.slice(offset));
  assert.deepEqual(semanticAST(parseJS(output)), semanticAST(before), 'Encoding must preserve the program AST.');
  return output;
}

function encodeHTML(source) {
  return source
    .replace(/<title>([^<]*)<\/title>/, (_, title) => '<title>' + entities(title) + '</title>')
    .replace(/<style>([\s\S]*?)<\/style>/g, (_, css) => '<style>' + css.replace(nonASCII, char => '\\' + char.charCodeAt(0).toString(16) + ' ') + '</style>');
}

if (require.main === module) {
  const root = path.join(__dirname, '..'), check = process.argv.includes('--check');
  // Prepare and validate every file before writing any of them.
  const outputs = ['script.js', 'ja.js', 'i18n.js', 'index.html'].map(file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const output = file.endsWith('.js') ? encodeJS(source) : encodeHTML(source);
    assert(!/[^\x00-\x7f]/.test(output), file + ' still contains unescaped text.');
    if (check) assert.equal(output, source, file + ' needs npm run encode:frontend');
    return { file, output };
  });
  if (!check) outputs.forEach(({ file, output }) => fs.writeFileSync(path.join(root, file), output));
  console.log(check ? 'Frontend encoding verified.' : 'Frontend text encoded; JavaScript semantics verified.');
}

module.exports = { encodeJS, encodeHTML };
