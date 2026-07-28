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

  const defaults = valueOf(codecs.parseDataUrl('data:;base64,QQ=='));
  assert.equal(defaults.mimeType, 'text/plain');
  assert.deepEqual(defaults.parameters, { charset: 'US-ASCII' });
  assert.deepEqual(Array.from(defaults.bytes), [65]);

  const upperCaseScheme = valueOf(codecs.parseDataUrl(
    'DATA:text/plain;base64,QQ=='
  ));
  assert.equal(upperCaseScheme.mimeType, 'text/plain');
  assert.deepEqual(Array.from(upperCaseScheme.bytes), [65]);
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
  assert.equal(
    valueOf(codecs.buildDataUrl(Uint8Array.from([65]), '')),
    'data:application/octet-stream;base64,QQ=='
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
  assert.deepEqual(valueOf(codecs.parseQuery('//x.test/path')), []);
  assert.deepEqual(
    valueOf(codecs.parseQuery('//x.test/path?a=1')),
    [{ key: 'a', value: '1' }]
  );
  assert.deepEqual(valueOf(codecs.parseQuery('mailto:user@example.com')), []);
  assert.deepEqual(
    valueOf(codecs.parseQuery('mailto:user@example.com?subject=Hello')),
    [{ key: 'subject', value: 'Hello' }]
  );
  assert.deepEqual(valueOf(codecs.parseQuery('urn:isbn:9780131103627')), []);
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
  assert.equal(
    valueOf(codecs.decodeHtmlEntities(
      '&nbsp; &copy; &#0; &#128; &#x80; &#xD800; &#x110000; &unknown;'
    )),
    '\u00A0 © \uFFFD € € \uFFFD \uFFFD &unknown;'
  );
});

test('uses a browser textarea to decode standard named HTML entities', () => {
  const source = fs.readFileSync(codecsPath, 'utf8');
  const textarea = {
    value: '',
    set innerHTML(input) {
      this.value = input
        .replace(/&eacute;/g, 'é')
        .replace(/&trade;/g, '™');
    }
  };
  const context = {
    document: {
      createElement(name) {
        assert.equal(name, 'textarea');
        return textarea;
      }
    }
  };
  vm.runInNewContext(source, context);
  assert.equal(
    context.TextCodecs.decodeHtmlEntities('&eacute; &trade; &unknown;').value,
    'é ™ &unknown;'
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

test('bounds JSON error scanning depth without regressing ordinary nesting', () => {
  const tooDeep = codecs.validateJson('['.repeat(10000));
  assert.equal(tooDeep.ok, false);
  assert.equal(tooDeep.value, '');
  assert.match(
    tooDeep.message,
    /^JSON 格式错误，位置 \d+：嵌套层级过深$/
  );

  const ordinary = `${'['.repeat(32)}0${']'.repeat(32)}`;
  assert.equal(valueOf(codecs.validateJson(ordinary)), ordinary);
  assert.deepEqual(codecs.validateJson('['.repeat(32)), {
    ok: false,
    value: '',
    message: 'JSON 格式错误，位置 32'
  });
});

test('rejects JSON numbers that cannot round-trip safely through JavaScript Number', () => {
  const operations = [
    codecs.formatJson,
    codecs.minifyJson,
    codecs.validateJson,
    codecs.sortJsonKeys,
    codecs.jsonToJavaScriptObjectText,
    (input) => codecs.jsonToYaml(input, jsyaml),
    codecs.jsonToQuery
  ];
  for (const input of ['9007199254740993', '-9007199254740993', '1e400']) {
    for (const operation of operations) {
      assert.deepEqual(operation(input), {
        ok: false,
        value: '',
        message: 'JSON 数值超出安全范围，位置 0'
      });
    }
  }

  assert.equal(
    valueOf(codecs.minifyJson('9007199254740991')),
    '9007199254740991'
  );
  assert.equal(
    valueOf(codecs.minifyJson('-9007199254740991')),
    '-9007199254740991'
  );
});

test('rejects deeply nested valid JSON before recursive key sorting', () => {
  const deepJson = `${'['.repeat(3000)}0${']'.repeat(3000)}`;
  assert.deepEqual(codecs.sortJsonKeys(deepJson), {
    ok: false,
    value: '',
    message: 'JSON 嵌套层级过深'
  });
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
  const aliased = valueOf(codecs.yamlToJson(
    'base: &base\n  - a\n  - b\ncopy: *base\n',
    jsyaml
  ));
  assert.deepEqual(JSON.parse(aliased), {
    base: ['a', 'b'],
    copy: ['a', 'b']
  });

  const aliasBomb = [
    'base: &base [x]',
    'items:',
    ...Array.from({ length: 101 }, () => '  - *base')
  ].join('\n');
  const bombResult = codecs.yamlToJson(aliasBomb, jsyaml);
  assert.equal(bombResult.ok, false);
  assert.match(bombResult.message, /YAML.*数据规模过大/u);

  const aliases = ['a', 'b', 'c', 'd', 'e', 'f'];
  const expandedBomb = ['a: &a [x]'];
  for (let index = 1; index < aliases.length; index += 1) {
    const previous = `*${aliases[index - 1]}`;
    expandedBomb.push(
      `${aliases[index]}: &${aliases[index]} [${Array(10).fill(previous).join(', ')}]`
    );
  }
  assert.deepEqual(codecs.yamlToJson(expandedBomb.join('\n'), jsyaml), {
    ok: false,
    value: '',
    message: 'YAML 数据规模过大'
  });
  assert.deepEqual(codecs.yamlToJson('a: &a\n  self: *a\n', jsyaml), {
    ok: false,
    value: '',
    message: 'YAML 数据包含循环引用'
  });

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
  for (const delimiter of ['', '"', '\r', '\n', '\uFEFF', 'x"']) {
    assert.deepEqual(codecs.convertDelimited('a,b', delimiter, '\t', Papa), {
      ok: false,
      value: '',
      message: '分隔符格式无效'
    });
    assert.deepEqual(codecs.convertDelimited('a,b', ',', delimiter, Papa), {
      ok: false,
      value: '',
      message: '分隔符格式无效'
    });
  }
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
  assert.deepEqual(codecs.markdownToHtml('# x', {
    parse() {
      return Promise.resolve('<h1>x</h1>');
    }
  }), {
    ok: false,
    value: '',
    message: '不支持异步 Markdown 解析器'
  });
});

function createXmlDocument(depth = 2, includeBusinessParserError = false) {
  class XmlNode {
    constructor(nodeType, nodeName, nodeValue = '', attributes = {}) {
      this.nodeType = nodeType;
      this.nodeName = nodeName;
      this.localName = nodeName;
      this.nodeValue = nodeValue;
      this.namespaceURI = null;
      this.parentNode = null;
      this.childNodes = [];
      this.attributes = Object.entries(attributes).map(([name, value]) => ({
        name,
        value
      }));
    }

    get textContent() {
      if (this.nodeType === 3) {
        return this.nodeValue;
      }
      return this.childNodes.map((child) => child.textContent).join('');
    }

    getAttribute(name) {
      const attribute = this.attributes.find((item) => item.name === name);
      return attribute ? attribute.value : '';
    }

    appendChild(child) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }

    insertBefore(child, reference) {
      child.parentNode = this;
      const index = this.childNodes.indexOf(reference);
      this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
      return child;
    }

    removeChild(child) {
      const index = this.childNodes.indexOf(child);
      if (index >= 0) {
        this.childNodes.splice(index, 1);
        child.parentNode = null;
      }
      return child;
    }

    cloneNode(deep) {
      const attributes = Object.fromEntries(
        this.attributes.map((attribute) => [attribute.name, attribute.value])
      );
      const clone = new XmlNode(this.nodeType, this.nodeName, this.nodeValue, attributes);
      clone.namespaceURI = this.namespaceURI;
      if (deep) {
        for (const child of this.childNodes) {
          clone.appendChild(child.cloneNode(true));
        }
      }
      return clone;
    }
  }

  class XmlDocument extends XmlNode {
    constructor() {
      super(9, '#document');
    }

    get documentElement() {
      return this.childNodes.find((child) => child.nodeType === 1) || null;
    }

    createTextNode(value) {
      return new XmlNode(3, '#text', value);
    }

    getElementsByTagName(name) {
      const matches = [];
      const stack = [...this.childNodes];
      while (stack.length > 0) {
        const node = stack.pop();
        if (node.nodeType === 1 && node.nodeName === name) {
          matches.push(node);
        }
        stack.push(...node.childNodes);
      }
      return matches;
    }

    cloneNode(deep) {
      const clone = new XmlDocument();
      if (deep) {
        for (const child of this.childNodes) {
          clone.appendChild(child.cloneNode(true));
        }
      }
      return clone;
    }
  }

  const document = new XmlDocument();
  const root = document.appendChild(new XmlNode(1, 'root', '', { id: 'x' }));
  let parent = root;
  for (let level = 1; level < depth; level += 1) {
    parent.appendChild(document.createTextNode('\n  '));
    parent = parent.appendChild(new XmlNode(1, level === 1 ? 'item' : 'level'));
  }
  parent.appendChild(document.createTextNode('1'));
  if (includeBusinessParserError) {
    root.appendChild(document.createTextNode('\n  '));
    root.appendChild(new XmlNode(1, 'parsererror')).appendChild(
      document.createTextNode('business value')
    );
  }
  root.appendChild(document.createTextNode('\n'));
  return document;
}

class XmlTreeSerializer {
  serializeToString(document) {
    function serialize(node) {
      if (node.nodeType === 9) {
        return node.childNodes.map(serialize).join('');
      }
      if (node.nodeType === 3) {
        return node.nodeValue;
      }
      const attributes = node.attributes
        .map((attribute) => ` ${attribute.name}="${attribute.value}"`)
        .join('');
      if (node.childNodes.length === 0) {
        return `<${node.nodeName}${attributes}/>`;
      }
      return `<${node.nodeName}${attributes}>${
        node.childNodes.map(serialize).join('')
      }</${node.nodeName}>`;
    }
    return serialize(document);
  }
}

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

test('formats realistic XML trees and allows a business parsererror descendant', () => {
  class TreeParser {
    parseFromString() {
      return createXmlDocument(2, true);
    }
  }
  assert.equal(
    valueOf(codecs.formatXml('<ignored/>', TreeParser, XmlTreeSerializer)),
    '<root id="x">\n  <item>1</item>\n  <parsererror>business value</parsererror>\n</root>'
  );
  assert.equal(
    valueOf(codecs.minifyXml('<ignored/>', TreeParser, XmlTreeSerializer)),
    '<root id="x"><item>1</item><parsererror>business value</parsererror></root>'
  );
});

test('rejects deeply nested XML before recursive formatting', () => {
  class DeepParser {
    parseFromString() {
      return createXmlDocument(300);
    }
  }
  assert.deepEqual(codecs.formatXml('<ignored/>', DeepParser, XmlTreeSerializer), {
    ok: false,
    value: '',
    message: 'XML 嵌套层级过深'
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
