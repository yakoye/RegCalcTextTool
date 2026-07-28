const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const generatorsPath = path.join(__dirname, '..', 'text-generators.js');
const generators = require(generatorsPath);

function valueOf(options) {
  const result = generators.generateSequence(options);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.message, '');
  return result.value;
}

function assertFailure(options, message) {
  assert.deepEqual(generators.generateSequence(options), {
    ok: false,
    value: '',
    message
  });
}

test('exports generateSequence through CommonJS and browser TextGenerators', () => {
  assert.equal(typeof generators.generateSequence, 'function');

  const source = fs.readFileSync(generatorsPath, 'utf8');
  const context = {};
  vm.runInNewContext(source, context);

  assert.equal(typeof context.TextGenerators.generateSequence, 'function');
  assert.equal(
    context.TextGenerators.generateSequence({
      start: 1,
      end: 3,
      separator: ','
    }).value,
    '1,2,3'
  );
});

test('uses the planned 1 through 50 defaults for empty options', () => {
  assert.equal(
    valueOf({}),
    Array.from({ length: 50 }, (_, index) => index + 1).join('\n')
  );
  assert.equal(valueOf(), Array.from({ length: 50 }, (_, index) => index + 1).join('\n'));
});

test('rejects null, array, and scalar options', () => {
  for (const options of [null, [], 1, 'options', true]) {
    assertFailure(options, '序列参数必须是对象');
  }
});

test('generates 01 through 99 with two-digit padding', () => {
  const output = valueOf({
    start: 1,
    end: 99,
    width: 2,
    separator: ','
  }).split(',');

  assert.equal(output.length, 99);
  assert.equal(output[0], '01');
  assert.equal(output.at(-1), '99');
});

test('generates 001 through 300 with three-digit padding', () => {
  const output = valueOf({
    start: 1,
    end: 300,
    width: 3,
    separator: ','
  }).split(',');

  assert.equal(output.length, 300);
  assert.equal(output[0], '001');
  assert.equal(output.at(-1), '300');
});

test('generates 0020 through 0385 with four-digit padding', () => {
  const output = valueOf({
    start: 20,
    end: 385,
    width: 4,
    separator: ','
  }).split(',');

  assert.equal(output.length, 366);
  assert.equal(output[0], '0020');
  assert.equal(output.at(-1), '0385');
});

test('keeps the natural descending direction from 100 through 001', () => {
  const output = valueOf({
    start: 100,
    end: 1,
    width: 3,
    order: 'range',
    separator: ','
  }).split(',');

  assert.equal(output.length, 100);
  assert.equal(output[0], '100');
  assert.equal(output.at(-1), '001');
});

test('sorts asc and desc orders by numeric value', () => {
  assert.equal(valueOf({
    start: 11,
    end: 2,
    order: 'asc',
    separator: ','
  }), '2,3,4,5,6,7,8,9,10,11');
  assert.equal(valueOf({
    start: 2,
    end: 11,
    order: 'desc',
    separator: ','
  }), '11,10,9,8,7,6,5,4,3,2');
});

test('applies count after ordering and truncates without extending a range', () => {
  assert.equal(valueOf({
    start: 1,
    end: 5,
    count: 2,
    order: 'desc',
    separator: ','
  }), '5,4');
  assert.equal(valueOf({
    start: 1,
    end: 2,
    count: 5,
    separator: ','
  }), '1,2');
});

test('accepts count 10000 without extending a shorter range', () => {
  assert.equal(valueOf({
    start: 7,
    end: 7,
    count: 10000
  }), '7');
});

test('supports an empty separator and a single-value range', () => {
  assert.equal(valueOf({
    start: 1,
    end: 3,
    separator: ''
  }), '123');
  assert.equal(valueOf({
    start: 7,
    end: 7,
    width: 3,
    order: 'random',
    separator: ',',
    random: () => {
      throw new Error('a single value must not need randomness');
    }
  }), '007');
});

test('pads negative magnitudes without counting the sign', () => {
  assert.equal(valueOf({
    start: -3,
    end: 1,
    width: 3,
    separator: ','
  }), '-003,-002,-001,000,001');
});

test('preserves safe-integer extremes and rejects unsafe endpoints', () => {
  assert.equal(valueOf({
    start: Number.MAX_SAFE_INTEGER - 1,
    end: Number.MAX_SAFE_INTEGER,
    separator: ','
  }), '9007199254740990,9007199254740991');
  assert.equal(valueOf({
    start: Number.MIN_SAFE_INTEGER,
    end: Number.MIN_SAFE_INTEGER + 1,
    separator: ','
  }), '-9007199254740991,-9007199254740990');

  assertFailure({
    start: Number.MAX_SAFE_INTEGER + 1,
    end: 1
  }, '开始值必须是安全整数');
  assertFailure({
    start: 1,
    end: Number.MIN_SAFE_INTEGER - 1
  }, '结束值必须是安全整数');
});

test('validates start, end, width, and count as safe integers', () => {
  for (const start of [1.5, NaN, Infinity, '1', null]) {
    assertFailure({ start, end: 2 }, '开始值必须是安全整数');
  }
  for (const end of [1.5, NaN, -Infinity, '2', null]) {
    assertFailure({ start: 1, end }, '结束值必须是安全整数');
  }
  for (const width of [1.5, NaN, Infinity, '2', null]) {
    assertFailure({ width }, '补零位数必须是安全整数');
  }
  for (const count of [1.5, NaN, Infinity, '2']) {
    assertFailure({ count }, '生成数量必须是安全整数或 null');
  }
});

test('limits width to 0 through 10 and count to null or 1 through 10000', () => {
  assert.equal(valueOf({ start: 1, end: 1, width: 0 }), '1');
  assert.equal(valueOf({ start: 1, end: 1, width: 10 }), '0000000001');

  for (const width of [-1, 11]) {
    assertFailure({ width }, '补零位数必须在 0 到 10 之间');
  }
  for (const count of [0, -1, 10001]) {
    assertFailure({ count }, '生成数量必须在 1 到 10000 之间，或使用 null');
  }
  assert.equal(valueOf({ start: 1, end: 1, count: null }), '1');
});

test('allows 10000 generated values and rejects any larger actual range', () => {
  const output = valueOf({
    start: 1,
    end: 10000,
    separator: ','
  }).split(',');

  assert.equal(output.length, 10000);
  assert.equal(output[0], '1');
  assert.equal(output.at(-1), '10000');
  assertFailure({
    start: 1,
    end: 10001
  }, '序列实际生成数量不能超过 10000');
  assertFailure({
    start: 1,
    end: 10001,
    count: 1
  }, '序列实际生成数量不能超过 10000');
  assertFailure({
    start: Number.MIN_SAFE_INTEGER,
    end: Number.MAX_SAFE_INTEGER
  }, '序列实际生成数量不能超过 10000');
});

test('validates order without coercing unknown values', () => {
  for (const order of ['ascending', '', null, 1, Symbol('range')]) {
    assertFailure({ order }, '顺序必须是 range、asc、desc 或 random');
  }
});

test('uses injected randomness in a deterministic Fisher-Yates shuffle', () => {
  const randomValues = [0.5, 0, 0.75];
  let calls = 0;
  const output = valueOf({
    start: 1,
    end: 4,
    order: 'random',
    separator: ',',
    random() {
      const value = randomValues[calls];
      calls += 1;
      return value;
    }
  });

  assert.equal(output, '4,2,1,3');
  assert.equal(calls, 3);
});

test('validates injected random functions and their return values', () => {
  assertFailure({
    start: 1,
    end: 2,
    order: 'random',
    random: 0.5
  }, '随机数生成器必须是函数');

  for (const randomValue of [-0.1, 1, NaN, Infinity, -Infinity, '0.5']) {
    assertFailure({
      start: 1,
      end: 2,
      order: 'random',
      random: () => randomValue
    }, '随机数生成器必须返回 0（含）到 1（不含）之间的有限数');
  }
});

test('accepts CR, LF, and CRLF separators without normalization', () => {
  assert.equal(valueOf({ start: 1, end: 2, separator: '\r' }), '1\r2');
  assert.equal(valueOf({ start: 1, end: 2, separator: '\n' }), '1\n2');
  assert.equal(valueOf({ start: 1, end: 2, separator: '\r\n' }), '1\r\n2');
});

test('requires a string separator and accepts long ASCII and emoji values', () => {
  for (const separator of [null, 1, {}, Symbol('separator')]) {
    assertFailure({ separator }, '分隔符必须是字符串');
  }

  for (const separator of ['x'.repeat(512), '🙂'.repeat(128)]) {
    assert.equal(valueOf({
      start: 1,
      end: 2,
      separator
    }), `1${separator}2`);
  }
});

test('converts unexpected option and random exceptions to a stable Chinese failure', () => {
  const hostileOptions = {};
  Object.defineProperty(hostileOptions, 'start', {
    get() {
      throw new Error('platform details must stay private');
    }
  });

  assertFailure(hostileOptions, '序列生成失败');
  assertFailure({
    start: 1,
    end: 2,
    order: 'random',
    random() {
      throw new Error('platform details must stay private');
    }
  }, '序列生成失败');
});
