const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const codecsPath = path.join(__dirname, '..', 'text-codecs.js');
const codecs = require(codecsPath);
const jsyaml = require('js-yaml');
const Papa = require('papaparse');
const marked = require('marked');
const TurndownService = require('turndown');

function valueOf(result) {
  assert.equal(result.ok, true, result.message);
  assert.equal(result.message, '');
  return result.value;
}

function assertChineseFailure(result) {
  assert.equal(result.ok, false);
  assert.equal(result.value, '');
  assert.match(result.message, /[\u3400-\u9FFF]/u);
  assert.doesNotMatch(result.message, /Unexpected|Invalid|Error|Syntax|token|position/i);
}

test('exports every codec through CommonJS and browser TextCodecs', () => {
  const functionNames = [
    'encodeUtf8Base64', 'decodeUtf8Base64', 'bytesToBase64', 'base64ToBytes',
    'toBase64Url', 'fromBase64Url', 'parseDataUrl', 'buildDataUrl',
    'encodeUrlComponent', 'decodeUrlComponent', 'encodeFullUrl', 'decodeFullUrl',
    'parseQuery', 'buildQuery', 'encodeHtmlEntities', 'decodeHtmlEntities',
    'escapeUnicode', 'unescapeUnicode', 'formatJson', 'minifyJson', 'validateJson',
    'sortJsonKeys', 'escapeJsonString', 'unescapeJsonString',
    'jsonToJavaScriptObjectText', 'yamlToJson', 'jsonToYaml', 'convertDelimited',
    'queryToJson', 'jsonToQuery', 'markdownToHtml', 'htmlToMarkdown',
    'formatXml', 'minifyXml', 'convertStructured', 'normalizeHex', 'groupHex',
    'reverseHexBytes', 'utf8ToHex', 'hexToUtf8', 'hexToBinary', 'binaryToHex',
    'hexToDecimal', 'decimalToHex', 'toCByteArray', 'toJavaScriptByteArray'
  ];

  for (const name of functionNames) {
    assert.equal(typeof codecs[name], 'function', `${name} should be exported`);
  }

  const source = fs.readFileSync(codecsPath, 'utf8');
  const context = {
    TextEncoder,
    TextDecoder,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64')
  };
  vm.runInNewContext(source, context);
  assert.equal(typeof context.TextCodecs.encodeUtf8Base64, 'function');
  assert.equal(
    context.TextCodecs.decodeUtf8Base64(
      context.TextCodecs.encodeUtf8Base64('浏览器🙂').value
    ).value,
    '浏览器🙂'
  );
});

test('converts unexpected public input exceptions to stable Chinese failures', () => {
  const hostileInput = {
    [Symbol.toPrimitive]() {
      throw new Error('platform details must stay private');
    }
  };
  for (const operation of [
    codecs.encodeHtmlEntities,
    codecs.formatJson,
    codecs.normalizeHex
  ]) {
    assertChineseFailure(operation(hostileInput));
  }
});

test('round-trips Chinese, emoji, BOM, and arbitrary bytes through Base64', () => {
  const text = '\uFEFF中文🙂';
  const encoded = valueOf(codecs.encodeUtf8Base64(text));
  assert.equal(valueOf(codecs.decodeUtf8Base64(encoded)), text);

  const bytes = Uint8Array.from([0, 1, 2, 127, 128, 255]);
  const binary = valueOf(codecs.bytesToBase64(bytes));
  assert.deepEqual(Array.from(valueOf(codecs.base64ToBytes(binary))), Array.from(bytes));
});

test('converts standard and URL-safe Base64 with optional padding', () => {
  assert.equal(valueOf(codecs.toBase64Url('++//AA==')), '--__AA');
  assert.equal(valueOf(codecs.toBase64Url('++//AA==', { padding: true })), '--__AA==');
  assert.equal(valueOf(codecs.fromBase64Url('--__AA')), '++//AA==');
  assert.equal(valueOf(codecs.fromBase64Url('--__AA', { padding: false })), '++//AA');
  assert.equal(valueOf(codecs.base64ToBytes('5Lit\u00A0\u30005paH')).length, 6);
});

test('rejects malformed Base64, bad padding, non-canonical bits, and invalid UTF-8', () => {
  for (const input of ['*invalid*', 'Zg=', 'Zg===', 'Z=g=', 'Zh==', 'A']) {
    assertChineseFailure(codecs.base64ToBytes(input));
  }
  assertChineseFailure(codecs.fromBase64Url('Zh'));
  assertChineseFailure(codecs.fromBase64Url('a+b/'));
  assertChineseFailure(codecs.decodeUtf8Base64('/w=='));
});

test('parses Base64 Data URLs and preserves file metadata', () => {
  const result = valueOf(codecs.parseDataUrl(
    'data:image/png;charset=utf-8;name=%E6%8A%A5%E5%91%8A.png;base64,AAEC/w=='
  ));
  assert.equal(result.mimeType, 'image/png');
  assert.deepEqual(result.parameters, {
    charset: 'utf-8',
    name: '报告.png'
  });
  assert.equal(result.base64, 'AAEC/w==');
  assert.deepEqual(Array.from(result.bytes), [0, 1, 2, 255]);

  const special = valueOf(codecs.parseDataUrl(
    'data:text/plain;__proto__=safe;base64,QQ=='
  ));
  assert.equal(Object.hasOwn(special.parameters, '__proto__'), true);
  assert.equal(special.parameters.__proto__, 'safe');
});

test('builds complete Data URLs and rejects invalid Data URL syntax or MIME', () => {
  const built = valueOf(codecs.buildDataUrl(
    Uint8Array.from([0, 1, 2, 255]),
    'application/octet-stream',
    { charset: 'binary', parameters: { name: 'a b.bin' } }
  ));
  assert.equal(
    built,
    'data:application/octet-stream;charset=binary;name=a%20b.bin;base64,AAEC/w=='
  );
  assertChineseFailure(codecs.parseDataUrl('data:text/plain,not-base64'));
  assertChineseFailure(codecs.parseDataUrl('data:bad mime;base64,QQ=='));
  assertChineseFailure(codecs.buildDataUrl(new Uint8Array(), 'bad mime'));
});

test('keeps URL component and full URL encoding semantics distinct', () => {
  assert.equal(valueOf(codecs.encodeUrlComponent('a&b=c 中文')), 'a%26b%3Dc%20%E4%B8%AD%E6%96%87');
  assert.equal(
    valueOf(codecs.encodeFullUrl('https://a.test/a b?q=中文&x=1')),
    'https://a.test/a%20b?q=%E4%B8%AD%E6%96%87&x=1'
  );
  assert.equal(
    valueOf(codecs.decodeFullUrl('https://a.test/a%20b?q=%E4%B8%AD%E6%96%87&x=1')),
    'https://a.test/a b?q=中文&x=1'
  );
  assertChineseFailure(codecs.decodeUrlComponent('%E4'));
  assertChineseFailure(codecs.decodeFullUrl('%E4'));
});

test('parses full URLs, question-prefixed input, and pure queries without losing duplicates', () => {
  const expected = [
    { key: 'a', value: '1' },
    { key: 'a', value: '二' },
    { key: 'empty', value: '' },
    { key: 'space', value: 'a b' }
  ];
  assert.deepEqual(
    valueOf(codecs.parseQuery('https://example.test/p?a=1&a=%E4%BA%8C&empty=&space=a+b#top')),
    expected
  );
  assert.deepEqual(valueOf(codecs.parseQuery('?a=1&a=2')), [
    { key: 'a', value: '1' },
    { key: 'a', value: '2' }
  ]);
  assert.deepEqual(valueOf(codecs.parseQuery('a=1')), [{ key: 'a', value: '1' }]);
  assert.deepEqual(
    valueOf(codecs.parseQuery('https://x.test/path#frag?x=1')),
    []
  );
  assert.deepEqual(
    valueOf(codecs.parseQuery('https://x.test/path?a=1#frag?x=2')),
    [{ key: 'a', value: '1' }]
  );
  assert.deepEqual(
    valueOf(codecs.parseQuery('a=1#frag?x=2')),
    [{ key: 'a', value: '1' }]
  );
});

test('builds sorted or unsorted query strings while preserving duplicate keys', () => {
  const entries = [
    { key: 'b', value: '2' },
    { key: 'a', value: 'x y' },
    { key: 'a', value: '一' }
  ];
  assert.equal(valueOf(codecs.buildQuery(entries)), 'b=2&a=x%20y&a=%E4%B8%80');
  assert.equal(
    valueOf(codecs.buildQuery(entries, { sort: true, leadingQuestionMark: true })),
    '?a=x%20y&a=%E4%B8%80&b=2'
  );
  assertChineseFailure(codecs.parseQuery('a=%E4'));
  assertChineseFailure(codecs.buildQuery([{ key: 'a' }]));
});

test('encodes and decodes named, decimal, and hexadecimal HTML entities', () => {
  const source = `& < > " '`;
  assert.equal(
    valueOf(codecs.encodeHtmlEntities(source)),
    '&amp; &lt; &gt; &quot; &#39;'
  );
  assert.equal(
    valueOf(codecs.decodeHtmlEntities('&amp; &#60; &#x3E; &quot; &apos; &unknown;')),
    `& < > " ' &unknown;`
  );
});

test('escapes BMP and supplementary Unicode and rejects invalid escape sequences', () => {
  const escaped = '\\u0041\\u4E2D\\uD83D\\uDE00\\u000A';
  assert.equal(valueOf(codecs.escapeUnicode('A中😀\n')), escaped);
  assert.equal(valueOf(codecs.unescapeUnicode(escaped)), 'A中😀\n');
  assert.equal(valueOf(codecs.unescapeUnicode('plain\\\\slash')), 'plain\\slash');
  for (const input of ['\\u12', '\\x41', '\\uD83D\\u0041', '\\uDE00']) {
    assertChineseFailure(codecs.unescapeUnicode(input));
  }
});

test('formats, minifies, and validates JSON with stable Chinese errors', () => {
  assert.equal(valueOf(codecs.formatJson('{"a":1,"b":[true]}')), [
    '{',
    '  "a": 1,',
    '  "b": [',
    '    true',
    '  ]',
    '}'
  ].join('\n'));
  assert.equal(valueOf(codecs.minifyJson(' { "a": 1 } ')), '{"a":1}');
  assert.equal(valueOf(codecs.validateJson('{"ok":true}')), '{"ok":true}');

  const malformedInputs = [
    { input: '{"a":}', position: 5 },
    { input: '[1,', position: 3 },
    { input: '{"a":"\\x"}', position: 7 },
    { input: '{"a":1} trailing', position: 8 }
  ];
  const operations = [
    codecs.formatJson,
    codecs.minifyJson,
    codecs.validateJson,
    codecs.sortJsonKeys,
    codecs.jsonToJavaScriptObjectText,
    (input) => codecs.jsonToYaml(input, jsyaml),
    codecs.jsonToQuery
  ];
  for (const operation of operations) {
    for (const { input, position } of malformedInputs) {
      const result = operation(input);
      assertChineseFailure(result);
      assert.equal(result.message, `JSON 格式错误，位置 ${position}`);
    }
  }
});

test('reports JSON positions without depending on platform exception text', () => {
  const source = fs.readFileSync(codecsPath, 'utf8');
  const nativeJson = JSON;
  const context = {
    JSON: {
      parse(input) {
        try {
          return nativeJson.parse(input);
        } catch (error) {
          throw new SyntaxError('opaque');
        }
      },
      stringify: (...args) => nativeJson.stringify(...args)
    }
  };
  vm.runInNewContext(source, context);

  assert.equal(
    context.TextCodecs.validateJson('{"a":}').message,
    'JSON 格式错误，位置 5'
  );
  assert.equal(
    context.TextCodecs.validateJson('[1,').message,
    'JSON 格式错误，位置 3'
  );
  assert.equal(
    context.TextCodecs.validateJson('{"a":"\\x"}').message,
    'JSON 格式错误，位置 7'
  );
  assert.equal(
    context.TextCodecs.validateJson('{"a":1} trailing').message,
    'JSON 格式错误，位置 8'
  );
});

test('sorts JSON object keys recursively without reordering arrays', () => {
  const input = '{"z":{"b":1,"a":2},"a":[{"d":4,"c":3},2]}';
  const sorted = JSON.parse(valueOf(codecs.sortJsonKeys(input)));
  assert.deepEqual(Object.keys(sorted), ['a', 'z']);
  assert.deepEqual(Object.keys(sorted.a[0]), ['c', 'd']);
  assert.deepEqual(Object.keys(sorted.z), ['a', 'b']);
  assert.deepEqual(sorted.a[1], 2);
});

test('escapes JSON strings and produces valid JavaScript object text', () => {
  const source = '引号"\n斜杠\\';
  const escaped = valueOf(codecs.escapeJsonString(source));
  assert.equal(valueOf(codecs.unescapeJsonString(escaped)), source);

  const javascript = valueOf(codecs.jsonToJavaScriptObjectText(
    '{"plain":1,"not-valid":"x","nested":{"ok":true}}'
  ));
  assert.match(javascript, /^\{/);
  assert.match(javascript, /\bplain: 1/);
  assert.match(javascript, /"not-valid": "x"/);
  assert.deepEqual(Function(`"use strict"; return (${javascript});`)(), {
    plain: 1,
    'not-valid': 'x',
    nested: { ok: true }
  });

  const special = valueOf(codecs.jsonToJavaScriptObjectText('{"__proto__":"safe"}'));
  const specialObject = Function(`"use strict"; return (${special});`)();
  assert.equal(Object.hasOwn(specialObject, '__proto__'), true);
  assert.equal(specialObject.__proto__, 'safe');
  assertChineseFailure(codecs.unescapeJsonString('\\x'));
});

test('converts YAML through an injected js-yaml implementation and reports missing libraries', () => {
  const json = valueOf(codecs.yamlToJson('name: 中文\nitems:\n  - 1\n  - 2\n', jsyaml));
  assert.deepEqual(JSON.parse(json), { name: '中文', items: [1, 2] });
  const yaml = valueOf(codecs.jsonToYaml('{"name":"中文","items":[1,2]}', jsyaml));
  assert.deepEqual(jsyaml.load(yaml), { name: '中文', items: [1, 2] });
  assert.deepEqual(codecs.yamlToJson('a: 1'), {
    ok: false,
    value: '',
    message: 'YAML 解析库未加载'
  });
  assert.deepEqual(codecs.jsonToYaml('{"a":1}'), {
    ok: false,
    value: '',
    message: 'YAML 解析库未加载'
  });
});

test('converts quoted delimiters and embedded newlines through injected Papa Parse', () => {
  const csv = 'name,note\r\nAlice,"hello,\nworld"\r\nBob,"say ""hi"""';
  const tsv = valueOf(codecs.convertDelimited(csv, ',', '\t', Papa));
  const parsed = Papa.parse(tsv, { delimiter: '\t' }).data;
  assert.deepEqual(parsed, [
    ['name', 'note'],
    ['Alice', 'hello,\nworld'],
    ['Bob', 'say "hi"']
  ]);
  assert.deepEqual(codecs.convertDelimited('a,b', ',', '\t'), {
    ok: false,
    value: '',
    message: 'CSV 解析库未加载'
  });
  assertChineseFailure(codecs.convertDelimited('"unterminated', ',', '\t', Papa));
});

test('round-trips duplicate query keys through JSON arrays', () => {
  const json = valueOf(codecs.queryToJson('?tag=a&tag=b&single=1'));
  assert.deepEqual(JSON.parse(json), { tag: ['a', 'b'], single: '1' });
  assert.equal(valueOf(codecs.jsonToQuery(json)), 'tag=a&tag=b&single=1');
  assertChineseFailure(codecs.jsonToQuery('{"nested":{"a":1}}'));
});

test('adapts Markdown converters and reports missing injected libraries', () => {
  const html = valueOf(codecs.markdownToHtml('# 标题\n\n**粗体**', marked));
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /<strong>粗体<\/strong>/);
  const markdown = valueOf(codecs.htmlToMarkdown('<h1>标题</h1><p><strong>粗体</strong></p>', TurndownService));
  assert.match(markdown, /^标题\n=+/);
  assert.match(markdown, /\*\*粗体\*\*/);
  assert.deepEqual(codecs.markdownToHtml('# x'), {
    ok: false,
    value: '',
    message: 'Markdown 解析库未加载'
  });
  assert.deepEqual(codecs.htmlToMarkdown('<p>x</p>'), {
    ok: false,
    value: '',
    message: 'HTML 转 Markdown 库未加载'
  });
});

test('uses injected XML parser and serializer constructors and detects parsererror', () => {
  let parsedType = '';
  class GoodParser {
    parseFromString(input, type) {
      parsedType = type;
      return {
        input,
        documentElement: { nodeName: 'root' },
        getElementsByTagName: () => [],
        cloneNode() {
          return this;
        }
      };
    }
  }
  class GoodSerializer {
    serializeToString(document) {
      return document.input;
    }
  }
  assert.equal(
    valueOf(codecs.formatXml('<root><item>1</item></root>', GoodParser, GoodSerializer)),
    '<root><item>1</item></root>'
  );
  assert.equal(parsedType, 'application/xml');
  assert.equal(
    valueOf(codecs.minifyXml('<root><item>1</item></root>', GoodParser, GoodSerializer)),
    '<root><item>1</item></root>'
  );

  class BadParser {
    parseFromString() {
      return {
        documentElement: { nodeName: 'parsererror' },
        getElementsByTagName: () => [{}]
      };
    }
  }
  assertChineseFailure(codecs.formatXml('<root>', BadParser, GoodSerializer));
  assert.deepEqual(codecs.minifyXml('<root/>'), {
    ok: false,
    value: '',
    message: 'XML 解析器未加载'
  });
});

test('accepts XML constructors through a libraries object', () => {
  class Parser {
    parseFromString(input) {
      return {
        input,
        documentElement: { nodeName: 'root' },
        getElementsByTagName: () => []
      };
    }
  }
  class Serializer {
    serializeToString(document) {
      return document.input;
    }
  }
  const libraries = { DOMParser: Parser, XMLSerializer: Serializer };
  assert.equal(valueOf(codecs.formatXml('<root/>', libraries)), '<root/>');
  assert.equal(valueOf(codecs.minifyXml('<root/>', libraries)), '<root/>');
});

test('dispatches structured conversions and rejects unknown or prototype-chain IDs', () => {
  const libraries = { jsyaml, Papa, marked, TurndownService };
  assert.equal(
    valueOf(codecs.convertStructured('jsonMinify', '{ "a": 1 }', libraries)),
    '{"a":1}'
  );
  assert.deepEqual(
    JSON.parse(valueOf(codecs.convertStructured('yamlToJson', 'a: 1', libraries))),
    { a: 1 }
  );
  assert.match(
    valueOf(codecs.convertStructured('markdownToHtml', '# x', libraries)),
    /<h1>x<\/h1>/
  );
  for (const id of ['missing', 'constructor', '__proto__']) {
    assert.deepEqual(codecs.convertStructured(id, 'x', libraries), {
      ok: false,
      value: '',
      message: '不支持的数据格式操作'
    });
  }
});

test('normalizes Hex in strict and clean modes without hiding invalid characters', () => {
  assert.equal(valueOf(codecs.normalizeHex('0x00aB', { mode: 'strict' })), '00AB');
  assert.equal(valueOf(codecs.normalizeHex('0x00, ab_0XCD ef', { mode: 'clean' })), '00ABCDEF');
  for (const input of ['00 AB', '0x12 GG', '12_34', '10x22']) {
    assertChineseFailure(codecs.normalizeHex(input, { mode: 'strict' }));
  }
  for (const input of ['0x12-GG', '10x22']) {
    assertChineseFailure(codecs.normalizeHex(input, { mode: 'clean' }));
  }
  assertChineseFailure(codecs.normalizeHex('ABC', { mode: 'strict' }));
  assertChineseFailure(codecs.normalizeHex('12', { mode: 'unknown' }));
});

test('groups complete 4-byte and 8-byte Hex values in big or little endian order', () => {
  const hex = '00112233445566778899AABBCCDDEEFF';
  assert.equal(
    valueOf(codecs.groupHex(hex, 4, false)),
    '0x00112233, 0x44556677, 0x8899AABB, 0xCCDDEEFF'
  );
  assert.equal(
    valueOf(codecs.groupHex(hex, 4, true)),
    '0x33221100, 0x77665544, 0xBBAA9988, 0xFFEEDDCC'
  );
  assert.equal(
    valueOf(codecs.groupHex(hex, 8, false)),
    '0x0011223344556677, 0x8899AABBCCDDEEFF'
  );
  assert.equal(
    valueOf(codecs.groupHex(hex, 8, true)),
    '0x7766554433221100, 0xFFEEDDCCBBAA9988'
  );
  assertChineseFailure(codecs.groupHex('001122', 4, false, { mode: 'clean' }));
  assertChineseFailure(codecs.groupHex('0011', 0, false));
});

test('reverses Hex bytes and converts UTF-8 with fatal decoding by default', () => {
  assert.equal(valueOf(codecs.reverseHexBytes('0x001122FF')), 'FF221100');
  const text = '\uFEFF中文🙂';
  const hex = valueOf(codecs.utf8ToHex(text));
  assert.equal(valueOf(codecs.hexToUtf8(hex)), text);
  assertChineseFailure(codecs.hexToUtf8('FF'));
  assert.equal(valueOf(codecs.hexToUtf8('FF', false)), '\uFFFD');
});

test('converts complete bytes between Hex and binary', () => {
  assert.equal(valueOf(codecs.hexToBinary('00AF10')), '000000001010111100010000');
  assert.equal(valueOf(codecs.binaryToHex('00000000 10101111 00010000')), '00AF10');
  assertChineseFailure(codecs.binaryToHex('101'));
  assertChineseFailure(codecs.binaryToHex('0000000X'));
});

test('converts arbitrarily large non-negative Hex and decimal integers with BigInt', () => {
  assert.equal(valueOf(codecs.hexToDecimal('FFFFFFFFFFFFFFFF')), '18446744073709551615');
  assert.equal(valueOf(codecs.hexToDecimal('0XFF')), '255');
  assert.equal(valueOf(codecs.decimalToHex('18446744073709551615')), 'FFFFFFFFFFFFFFFF');
  assert.equal(valueOf(codecs.decimalToHex('00010')), 'A');
  assert.equal(valueOf(codecs.decimalToHex('0')), '0');
  for (const input of ['-1', '1.5', '1e3', '']) {
    assertChineseFailure(codecs.decimalToHex(input));
  }
  assertChineseFailure(codecs.hexToDecimal('-FF'));
});

test('renders strict C and JavaScript byte arrays', () => {
  assert.equal(valueOf(codecs.toCByteArray('00aBff')), '{ 0x00, 0xAB, 0xFF }');
  assert.equal(valueOf(codecs.toJavaScriptByteArray('00aBff')), '[0x00, 0xAB, 0xFF]');
  assertChineseFailure(codecs.toCByteArray('0x0'));
});
