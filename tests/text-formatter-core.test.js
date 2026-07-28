const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const vm = require('node:vm');

const corePath = path.join(__dirname, '..', 'text-formatter-core.js');
const {
  failure,
  runTransform,
  success,
  TRANSFORMS
} = require(corePath);

const EXISTING_TRANSFORM_IDS = [
  'removeEmptyLines',
  'removeSpaces',
  'trimLines',
  'collapseSpaces',
  'removeAllLineBreaks',
  'removeInterruptedBreaks',
  'dedupeLines',
  'sortLines',
  'addLineNumbers',
  'removeLineNumbers',
  'upperCase',
  'lowerCase',
  'pascalCase',
  'camelCase',
  'snakeCase',
  'kebabCase',
  'spaceCase',
  'urlEncode',
  'urlDecode',
  'base64Encode',
  'base64Decode',
  'jsonFormat',
  'jsonMinify',
  'verticalLayout',
  'horizontalLayout',
  'hexFormat1Byte',
  'hexFormat4Byte',
  'hexFormat4ByteLe',
  'hexFormat8Byte',
  'hexFormat8ByteLe',
  'hexReverse'
];

const NEW_TRANSFORM_IDS = [
  'removeAllWhitespace',
  'removeControlCharacters',
  'normalizeLineBreaks',
  'collapseBlankLines',
  'fullWidthToHalfWidth',
  'halfWidthToFullWidth',
  'chinesePunctuationToEnglish',
  'englishPunctuationToChinese',
  'reverseLines',
  'shuffleLines',
  'filterLines',
  'prefixLines',
  'suffixLines',
  'quoteLines',
  'splitByDelimiter',
  'joinByDelimiter',
  'constantCase',
  'dotCase',
  'titleCase',
  'sentenceCase',
  'capitalizeWords',
  'invertCase'
];

function valueOf(id, input, options) {
  const result = runTransform(id, input, options);
  assert.equal(result.ok, true, `${id} should succeed: ${result.message}`);
  assert.equal(typeof result.message, 'string');
  return result.value;
}

function assertFailure(result, message) {
  assert.deepEqual(result, {
    ok: false,
    value: '',
    message
  });
}

test('exports a unified TextFormatter transform API for CommonJS', () => {
  assert.deepEqual(success('done'), { ok: true, value: 'done', message: '' });
  assert.deepEqual(success('done', '完成'), { ok: true, value: 'done', message: '完成' });
  assert.deepEqual(failure('失败'), { ok: false, value: '', message: '失败' });
  assert.equal(typeof runTransform, 'function');
  assert.equal(Object.getPrototypeOf(TRANSFORMS), null);
  assert.equal(Object.isFrozen(TRANSFORMS), true);
  assert.throws(() => {
    Object.defineProperty(TRANSFORMS, 'constructor', {
      value: () => success('injected')
    });
  }, TypeError);

  for (const id of [...EXISTING_TRANSFORM_IDS, ...NEW_TRANSFORM_IDS]) {
    assert.equal(typeof TRANSFORMS[id], 'function', `${id} should be registered`);
  }
});

test('exposes the same API as browser global TextFormatterCore', () => {
  const source = fs.readFileSync(corePath, 'utf8');
  const context = {
    TextEncoder,
    TextDecoder,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary')
  };

  vm.runInNewContext(source, context);

  assert.equal(typeof context.TextFormatterCore.runTransform, 'function');
  assert.equal(
    context.TextFormatterCore.runTransform('camelCase', 'browser global').value,
    'browserGlobal'
  );
  const encoded = context.TextFormatterCore.runTransform('base64Encode', '中文😀');
  assert.equal(encoded.value, '5Lit5paH8J+YgA==');
  assert.equal(
    context.TextFormatterCore.runTransform('base64Decode', encoded.value).value,
    '中文😀'
  );
  const bomText = '\uFEFFA';
  const bomEncoded = context.TextFormatterCore.runTransform('base64Encode', bomText).value;
  assert.equal(context.TextFormatterCore.runTransform('base64Decode', bomEncoded).value, bomText);
  assert.equal(context.TextFormatterCore.runTransform('base64Decode', '/w==').ok, false);

  const bufferContext = { Buffer };
  vm.runInNewContext(source, bufferContext);
  const bufferEncoded = bufferContext.TextFormatterCore.runTransform('base64Encode', bomText).value;
  assert.equal(bufferEncoded, bomEncoded);
  assert.equal(
    bufferContext.TextFormatterCore.runTransform('base64Decode', bufferEncoded).value,
    bomText
  );
});

test('returns a friendly failure for unknown and prototype-chain transform IDs', () => {
  const expected = {
    ok: false,
    value: '',
    message: '不支持的文本处理操作'
  };

  assert.deepEqual(runTransform('missing', 'abc'), expected);
  assert.deepEqual(runTransform('constructor', 'abc'), expected);
  assert.deepEqual(runTransform('__proto__', 'abc'), expected);
  assert.deepEqual(runTransform(1, 'abc'), expected);
  assert.deepEqual(runTransform(Symbol('removeEmptyLines'), 'abc'), expected);
  assert.deepEqual(runTransform({
    [Symbol.toPrimitive]() {
      throw new Error('must not coerce transform ID');
    }
  }, 'abc'), expected);
});

test('converts thrown transform errors to a Chinese failure result', () => {
  const result = runTransform('shuffleLines', 'a\nb', {
    random() {
      throw new Error('boom');
    }
  });
  assertFailure(result, '文本处理失败');
});

test('returns stable Chinese failures for malformed URL and JSON input', () => {
  assertFailure(runTransform('urlDecode', '%E4'), 'URL 解码失败：输入格式无效');

  for (const id of ['jsonFormat', 'jsonMinify']) {
    const result = runTransform(id, '{"a":1} trailing');
    assert.equal(result.ok, false);
    assert.equal(result.value, '');
    assert.match(result.message, /^JSON 解析失败(?:，位置 \d+)?$/);
    assert.doesNotMatch(result.message, /Unexpected|token|position/i);
  }
});

test('strictly validates Base64 syntax, canonical bits, and UTF-8', () => {
  const invalidInputs = [
    '*invalid*',
    'Zg=',
    'Zg===',
    'Z=g=',
    'Zh==',
    '/w=='
  ];

  for (const input of invalidInputs) {
    assertFailure(
      runTransform('base64Decode', input),
      'Base64 解码失败：输入不是有效的标准 Base64 或 UTF-8 文本'
    );
  }

  assert.equal(valueOf('base64Decode', ''), '');
  assert.equal(valueOf('base64Decode', 'Zg'), 'f');
  assert.equal(valueOf('base64Decode', 'Zg=='), 'f');
  assert.equal(valueOf('base64Decode', '5Lit \r\n\t5paH'), '中文');
  assert.equal(valueOf('base64Decode', '5Lit\u00A0\u30005paH'), '中文');
  const text = '中文😀';
  assert.equal(valueOf('base64Decode', valueOf('base64Encode', text)), text);
  const bomText = '\uFEFFA';
  assert.equal(valueOf('base64Decode', valueOf('base64Encode', bomText)), bomText);
});

test('keeps existing cleaning transforms compatible and handles CRLF', () => {
  assert.equal(valueOf('removeEmptyLines', 'a\r\n \r\nb'), 'a\nb');
  assert.equal(valueOf('removeSpaces', 'a b\tc'), 'ab\tc');
  assert.equal(valueOf('trimLines', ' a \r\n\tb\t'), 'a\nb');
  assert.equal(valueOf('collapseSpaces', 'a \t b \r\n c'), 'a b\nc');
  assert.equal(valueOf('removeAllLineBreaks', 'a\r\nb\rc\nd'), 'abcd');
  assert.equal(valueOf('removeInterruptedBreaks', '第一行\r\n继续。\r\n新句'), '第一行继续。\n新句');
  assert.equal(valueOf('sortLines', 'b\r\na'), 'a\nb');
  assert.equal(valueOf('addLineNumbers', 'a\r\nb'), '1. a\n2. b');
  assert.equal(valueOf('removeLineNumbers', '1. a\r\n 2） b'), 'a\nb');
});

test('deduplicates lines with optional case and trim comparison', () => {
  assert.equal(valueOf('dedupeLines', 'A\r\nA\r\na'), 'A\na');
  assert.equal(
    valueOf('dedupeLines', ' A \r\na\r\nB', {
      ignoreCase: true,
      trimBeforeCompare: true
    }),
    ' A \nB'
  );
  assert.equal(
    valueOf('dedupeLines', 'Å\nå\n𠀀', { ignoreCase: true }),
    'Å\n𠀀'
  );
});

test('keeps existing naming transforms and handles acronyms, numbers, punctuation, and Chinese', () => {
  assert.equal(valueOf('upperCase', 'Ab中'), 'AB中');
  assert.equal(valueOf('lowerCase', 'Ab中'), 'ab中');
  assert.equal(valueOf('pascalCase', 'http_server 2-value'), 'HttpServer2Value');
  assert.equal(valueOf('camelCase', 'XMLHttpRequest2 URL'), 'xmlHttpRequest2Url');
  assert.equal(valueOf('snakeCase', 'XMLHttpRequest2-中文 Value'), 'xml_http_request_2_中文_value');
  assert.equal(valueOf('kebabCase', 'User_name,ID42'), 'user-name-id-42');
  assert.equal(valueOf('spaceCase', 'UserName_ID42'), 'user name id 42');
  assert.equal(valueOf('snakeCase', 'Ångström𠀀Value'), 'ångström_𠀀_value');
  assert.equal(valueOf('pascalCase', 'élève 𠀀 åland'), 'Élève𠀀Åland');
  assert.equal(valueOf('camelCase', '𠀀 value'), '𠀀Value');
});

test('keeps legacy URL, Base64, JSON, and Hex success behavior', () => {
  assert.equal(valueOf('urlEncode', '中文 a'), '%E4%B8%AD%E6%96%87%20a');
  assert.equal(valueOf('urlDecode', '%E4%B8%AD%E6%96%87%20a'), '中文 a');
  assert.equal(valueOf('base64Encode', '中文'), '5Lit5paH');
  assert.equal(valueOf('base64Decode', '5Lit5paH'), '中文');
  assert.equal(valueOf('jsonFormat', '{"a":1}'), '{\n  "a": 1\n}');
  assert.equal(valueOf('jsonMinify', '{\n  "a": 1\n}'), '{"a":1}');
  assert.equal(valueOf('hexFormat1Byte', '80 01 02 00'), '0x80, 0x01, 0x02, 0x00');
  assert.equal(valueOf('hexFormat4Byte', '12345678 90ABCDEF'), '0x12345678, 0x90ABCDEF');
  assert.equal(valueOf('hexFormat4ByteLe', '12345678'), '0x78563412');
  assert.equal(valueOf('hexFormat8Byte', '1122334455667788'), '0x1122334455667788');
  assert.equal(valueOf('hexFormat8ByteLe', '1122334455667788'), '0x8877665544332211');
  assert.equal(valueOf('hexReverse', '0x12345678'), '12 34 56 78');
});

test('vertical layout splits only on whitespace and commas and filters empty items', () => {
  assert.equal(valueOf('verticalLayout', 'why?  now,,okay，结束'), 'why?\nnow\nokay\n结束');
  assert.equal(valueOf('horizontalLayout', 'a\r\n\r\n b '), 'a  b ');
});

test('supports the added cleaning and character normalization transforms', () => {
  assert.equal(valueOf('removeAllWhitespace', 'a b\r\nc\t\u3000d'), 'abcd');
  assert.equal(
    valueOf(
      'removeControlCharacters',
      '\u0000A\tB\nC\rD\u200D\u200B\uFEFF\u061C\u200E\u200F\u202A\u202E\u2066\u2069\u007F'
    ),
    'A\tB\nC\rD\u200D'
  );
  assert.equal(valueOf('normalizeLineBreaks', 'a\r\nb\rc\nd'), 'a\nb\nc\nd');
  assert.equal(valueOf('collapseBlankLines', 'a\r\n\r\n \r\nb\n\n\nc'), 'a\n\nb\n\nc');
  assert.equal(valueOf('fullWidthToHalfWidth', 'ＡＢＣ１２３！　中文'), 'ABC123! 中文');
  assert.equal(valueOf('halfWidthToFullWidth', 'ABC 123!中文'), 'ＡＢＣ　１２３！中文');
  assert.equal(valueOf('chinesePunctuationToEnglish', '你好，世界！“是”。'), '你好,世界!"是".');
  assert.equal(valueOf('englishPunctuationToChinese', '你好,世界!"是".'), '你好，世界！“是”。');
  assert.equal(valueOf('chinesePunctuationToEnglish', '《方案》……￥10——'), '<方案>...$10--');
  assert.equal(valueOf('englishPunctuationToChinese', '<方案>...$10--'), '《方案》……￥10——');
  assert.equal(
    valueOf('englishPunctuationToChinese', `"don't" and 'quote'`),
    '“don’t” and ‘quote’'
  );
  assert.equal(
    valueOf('englishPunctuationToChinese', `James' said 'tis 'quoted'`),
    'James’ said ’tis ‘quoted’'
  );
  assert.equal(
    valueOf('englishPunctuationToChinese', `rock 'n' roll began in the '90s with 'quotes'`),
    'rock ’n’ roll began in the ’90s with ‘quotes’'
  );
});

test('converts large quote-heavy text in linear time', () => {
  const segment = "'word' ";
  const input = segment.repeat(6000);
  const expected = '‘word’ '.repeat(6000);
  const startedAt = performance.now();
  const output = valueOf('englishPunctuationToChinese', input);
  const elapsed = performance.now() - startedAt;

  assert.equal(output, expected);
  assert.ok(elapsed < 2000, `quote conversion took ${elapsed.toFixed(0)}ms`);
});

test('supports line ordering, filtering, affixes, quoting, splitting, and joining', () => {
  assert.equal(valueOf('reverseLines', 'a\r\nb\r\nc'), 'c\nb\na');
  assert.equal(
    valueOf('shuffleLines', 'a\nb\nc', { random: () => 0 }),
    'b\nc\na'
  );
  assert.equal(
    valueOf('filterLines', 'Alpha\r\nbeta\r\nalphabet', {
      query: 'alpha',
      ignoreCase: true
    }),
    'Alpha\nalphabet'
  );
  assert.equal(valueOf('prefixLines', 'a\r\nb', { prefix: '> ' }), '> a\n> b');
  assert.equal(valueOf('suffixLines', 'a\r\nb', { suffix: ';' }), 'a;\nb;');
  assert.equal(valueOf('quoteLines', 'a\r\nb', { quote: "'" }), "'a'\n'b'");
  assert.equal(valueOf('splitByDelimiter', 'a, b,,c', { delimiter: ',', trim: true }), 'a\nb\n\nc');
  assert.equal(valueOf('joinByDelimiter', 'a\r\nb\r\nc', { delimiter: ' | ' }), 'a | b | c');
});

test('validates shuffle random values without losing line content', () => {
  const invalidRandomValues = [-0.1, 1, NaN, Infinity, -Infinity, '0.5'];

  for (const randomValue of invalidRandomValues) {
    assertFailure(
      runTransform('shuffleLines', 'a\nb\nc', { random: () => randomValue }),
      '随机数生成器必须返回 0（含）到 1（不含）之间的有限数'
    );
  }
  assertFailure(
    runTransform('shuffleLines', 'a\nb', { random: 0.5 }),
    '随机数生成器必须是函数'
  );

  const lines = Array.from({ length: 2000 }, (_, index) => `第${index}行😀`);
  const shuffled = valueOf('shuffleLines', lines.join('\n'), { random: () => 0.75 }).split('\n');
  assert.equal(shuffled.length, lines.length);
  assert.deepEqual(new Set(shuffled), new Set(lines));
  assert.equal(valueOf('shuffleLines', ''), '');
});

test('validates line filters and treats regex-looking queries as plain text', () => {
  assertFailure(
    runTransform('filterLines', 'a\nb', { query: '', invert: true }),
    '筛选文本不能为空'
  );
  assertFailure(
    runTransform('filterLines', 'a\nb', { query: {} }),
    '筛选文本必须是字符串'
  );
  assert.equal(
    valueOf('filterLines', 'a+\naaa\nA+', {
      query: 'a+',
      ignoreCase: true,
      regex: true
    }),
    'a+\nA+'
  );
  assert.equal(valueOf('filterLines', '', { query: 'x' }), '');
});

test('validates delimiters and preserves emoji and supplementary characters', () => {
  for (const id of ['splitByDelimiter', 'joinByDelimiter']) {
    assertFailure(runTransform(id, '😀𠀀', { delimiter: '' }), '分隔符不能为空');
    assertFailure(runTransform(id, '😀𠀀', { delimiter: null }), '分隔符必须是字符串');
  }

  assert.equal(
    valueOf('splitByDelimiter', '甲😀乙😀𠀀', { delimiter: '😀' }),
    '甲\n乙\n𠀀'
  );
  assert.equal(
    valueOf('joinByDelimiter', '甲\n乙\n𠀀', { delimiter: '😀' }),
    '甲😀乙😀𠀀'
  );
  assert.equal(valueOf('splitByDelimiter', '', { delimiter: ',' }), '');
  assert.equal(valueOf('joinByDelimiter', '', { delimiter: ',' }), '');
});

test('supports constant, dot, title, sentence, capitalize, and invert case', () => {
  assert.equal(valueOf('constantCase', 'XMLHttpRequest2 中文'), 'XML_HTTP_REQUEST_2_中文');
  assert.equal(valueOf('dotCase', 'XMLHttpRequest2 中文'), 'xml.http.request.2.中文');
  assert.equal(valueOf('titleCase', 'hello_world API中文'), 'Hello World Api 中文');
  assert.equal(valueOf('sentenceCase', 'hello_world API中文'), 'Hello world api 中文');
  assert.equal(valueOf('capitalizeWords', 'hello WORLD-test'), 'Hello WORLD-Test');
  assert.equal(valueOf('capitalizeWords', '第2章'), '第2章');
  assert.equal(valueOf('capitalizeWords', '版本v2'), '版本V2');
  assert.equal(valueOf('capitalizeWords', 'ABC中文123'), 'ABC中文123');
  assert.equal(valueOf('capitalizeWords', '中文hello world'), '中文Hello World');
  assert.equal(valueOf('invertCase', 'AbZ中123'), 'aBz中123');
  assert.equal(valueOf('titleCase', 'élève ÅLAND 𠀀'), 'Élève Åland 𠀀');
  assert.equal(valueOf('capitalizeWords', 'élève åland-𠀀字'), 'Élève Åland-𠀀字');
  assert.equal(valueOf('invertCase', 'Åé𠀀'), 'åÉ𠀀');
  assert.equal(valueOf('constantCase', ''), '');
});
