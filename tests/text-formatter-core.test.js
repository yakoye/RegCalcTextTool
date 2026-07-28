const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

test('exports a unified TextFormatter transform API for CommonJS', () => {
  assert.deepEqual(success('done'), { ok: true, value: 'done', message: '' });
  assert.deepEqual(success('done', '完成'), { ok: true, value: 'done', message: '完成' });
  assert.deepEqual(failure('失败'), { ok: false, value: '', message: '失败' });
  assert.equal(typeof runTransform, 'function');

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
});

test('converts thrown transform errors to a Chinese failure result', () => {
  const result = runTransform('shuffleLines', 'a\nb', {
    random() {
      throw new Error('boom');
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.value, '');
  assert.match(result.message, /^文本处理失败：boom$/);
});

test('returns failures for malformed URL, Base64, and JSON input', () => {
  const invalidInputs = [
    ['urlDecode', '%E4'],
    ['base64Decode', '*invalid*'],
    ['jsonFormat', '{bad}'],
    ['jsonMinify', '{bad}']
  ];

  for (const [id, input] of invalidInputs) {
    const result = runTransform(id, input);
    assert.equal(result.ok, false, `${id} should fail`);
    assert.equal(result.value, '');
    assert.match(result.message, /^文本处理失败：/, `${id} should return a Chinese message`);
  }
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
});

test('keeps existing naming transforms and handles acronyms, numbers, punctuation, and Chinese', () => {
  assert.equal(valueOf('upperCase', 'Ab中'), 'AB中');
  assert.equal(valueOf('lowerCase', 'Ab中'), 'ab中');
  assert.equal(valueOf('pascalCase', 'http_server 2-value'), 'HttpServer2Value');
  assert.equal(valueOf('camelCase', 'XMLHttpRequest2 URL'), 'xmlHttpRequest2Url');
  assert.equal(valueOf('snakeCase', 'XMLHttpRequest2-中文 Value'), 'xml_http_request_2_中文_value');
  assert.equal(valueOf('kebabCase', 'User_name,ID42'), 'user-name-id-42');
  assert.equal(valueOf('spaceCase', 'UserName_ID42'), 'user name id 42');
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
  assert.equal(valueOf('removeControlCharacters', '\u0000a\tb\nc\u0007\u007f'), 'a\tb\nc');
  assert.equal(valueOf('normalizeLineBreaks', 'a\r\nb\rc\nd'), 'a\nb\nc\nd');
  assert.equal(valueOf('collapseBlankLines', 'a\r\n\r\n \r\nb\n\n\nc'), 'a\n\nb\n\nc');
  assert.equal(valueOf('fullWidthToHalfWidth', 'ＡＢＣ１２３！　中文'), 'ABC123! 中文');
  assert.equal(valueOf('halfWidthToFullWidth', 'ABC 123!中文'), 'ＡＢＣ　１２３！中文');
  assert.equal(valueOf('chinesePunctuationToEnglish', '你好，世界！“是”。'), '你好,世界!"是".');
  assert.equal(valueOf('englishPunctuationToChinese', '你好,世界!"是".'), '你好，世界！“是”。');
  assert.equal(valueOf('chinesePunctuationToEnglish', '《方案》……￥10——'), '<方案>...$10--');
  assert.equal(valueOf('englishPunctuationToChinese', '<方案>...$10--'), '《方案》……￥10——');
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

test('supports constant, dot, title, sentence, capitalize, and invert case', () => {
  assert.equal(valueOf('constantCase', 'XMLHttpRequest2 中文'), 'XML_HTTP_REQUEST_2_中文');
  assert.equal(valueOf('dotCase', 'XMLHttpRequest2 中文'), 'xml.http.request.2.中文');
  assert.equal(valueOf('titleCase', 'hello_world API中文'), 'Hello World Api 中文');
  assert.equal(valueOf('sentenceCase', 'hello_world API中文'), 'Hello world api 中文');
  assert.equal(valueOf('capitalizeWords', 'hello WORLD-test'), 'Hello WORLD-Test');
  assert.equal(valueOf('invertCase', 'AbZ中123'), 'aBz中123');
});
