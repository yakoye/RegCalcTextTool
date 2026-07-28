(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TextGenerators = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_SEQUENCE_LENGTH = 10000;
  const ORDERS = new Set(['range', 'asc', 'desc', 'random']);
  const success = (value, message = '') => ({ ok: true, value, message });
  const failure = (message) => ({ ok: false, value: '', message });

  function validateOptions(options) {
    if (
      options === null
      || typeof options !== 'object'
      || Array.isArray(options)
    ) {
      return failure('序列参数必须是对象');
    }

    const startOption = options.start;
    const endOption = options.end;
    const widthOption = options.width;
    const countOption = options.count;
    const orderOption = options.order;
    const separatorOption = options.separator;
    const randomOption = options.random;

    const start = startOption === undefined ? 1 : startOption;
    const end = endOption === undefined ? 50 : endOption;
    const width = widthOption === undefined ? 0 : widthOption;
    const count = countOption === undefined ? null : countOption;
    const order = orderOption === undefined ? 'range' : orderOption;
    const separator = separatorOption === undefined ? '\n' : separatorOption;
    const random = randomOption === undefined ? Math.random : randomOption;

    if (!Number.isSafeInteger(start)) {
      return failure('开始值必须是安全整数');
    }
    if (!Number.isSafeInteger(end)) {
      return failure('结束值必须是安全整数');
    }
    if (!Number.isSafeInteger(width)) {
      return failure('补零位数必须是安全整数');
    }
    if (width < 0 || width > 10) {
      return failure('补零位数必须在 0 到 10 之间');
    }
    if (count !== null && !Number.isSafeInteger(count)) {
      return failure('生成数量必须是安全整数或 null');
    }
    if (count !== null && (count < 1 || count > MAX_SEQUENCE_LENGTH)) {
      return failure('生成数量必须在 1 到 10000 之间，或使用 null');
    }
    if (!ORDERS.has(order)) {
      return failure('顺序必须是 range、asc、desc 或 random');
    }
    if (typeof separator !== 'string') {
      return failure('分隔符必须是字符串');
    }
    if (typeof random !== 'function') {
      return failure('随机数生成器必须是函数');
    }

    return success({
      start,
      end,
      width,
      count,
      order,
      separator,
      random
    });
  }

  function shuffle(values, random) {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const randomValue = random();
      if (
        typeof randomValue !== 'number'
        || !Number.isFinite(randomValue)
        || randomValue < 0
        || randomValue >= 1
      ) {
        return failure('随机数生成器必须返回 0（含）到 1（不含）之间的有限数');
      }
      const target = Math.floor(randomValue * (index + 1));
      [values[index], values[target]] = [values[target], values[index]];
    }
    return success(values);
  }

  function formatNumber(value, width) {
    const sign = value < 0 ? '-' : '';
    return sign + String(Math.abs(value)).padStart(width, '0');
  }

  function generateSequenceImpl(options) {
    const validated = validateOptions(options);
    if (!validated.ok) {
      return validated;
    }

    const {
      start,
      end,
      width,
      count,
      order,
      separator,
      random
    } = validated.value;
    const sequenceLength = Math.abs(end - start) + 1;
    if (sequenceLength > MAX_SEQUENCE_LENGTH) {
      return failure('序列实际生成数量不能超过 10000');
    }

    const step = start <= end ? 1 : -1;
    const values = Array.from(
      { length: sequenceLength },
      (_, index) => start + (index * step)
    );

    if (order === 'asc') {
      values.sort((left, right) => left - right);
    } else if (order === 'desc') {
      values.sort((left, right) => right - left);
    } else if (order === 'random') {
      const shuffled = shuffle(values, random);
      if (!shuffled.ok) {
        return shuffled;
      }
    }

    const limited = count === null ? values : values.slice(0, count);
    return success(
      limited.map((value) => formatNumber(value, width)).join(separator)
    );
  }

  function generateSequence(options = {}) {
    try {
      return generateSequenceImpl(options);
    } catch (error) {
      return failure('序列生成失败');
    }
  }

  return {
    generateSequence
  };
});
