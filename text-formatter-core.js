(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TextFormatterCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const success = (value, message = '') => ({ ok: true, value, message });
  const failure = (message) => ({ ok: false, value: '', message });
  const normalizeLineBreaks = (text) => text.replace(/\r\n?|\n/g, '\n');
  const splitLines = (text) => normalizeLineBreaks(text).split('\n');

  const words = (text) => String(text)
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replace(/([\p{Ll}\p{M}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{L}\p{M}*)(\p{N})/gu, '$1 $2')
    .replace(/(\p{N})(\p{L})/gu, '$1 $2')
    .replace(/([\p{Script=Latin}\p{N}])(\p{Script=Han})/gu, '$1 $2')
    .replace(/(\p{Script=Han})([\p{Script=Latin}\p{N}])/gu, '$1 $2')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);

  const lower = (word) => word.toLowerCase();
  const upper = (word) => word.toUpperCase();
  const changeFirstCodePoint = (text, change) => {
    const codePoints = Array.from(text);
    if (codePoints.length === 0) {
      return '';
    }
    return change(codePoints[0]) + codePoints.slice(1).join('');
  };
  const capitalize = (word) => (
    word ? changeFirstCodePoint(word.toLowerCase(), upper) : ''
  );
  const pascalCase = (text) => words(text).map(capitalize).join('');

  const cleanHex = (text) => text.replace(/0x/gi, '').replace(/[^0-9A-Fa-f]/g, '');
  const splitHexBytes = (hex) => hex.match(/.{1,2}/g) || [];
  const formatHexGroups = (text, byteCount, littleEndian) => {
    const bytes = splitHexBytes(cleanHex(text));
    const groups = [];

    for (let index = 0; index < bytes.length; index += byteCount) {
      const group = bytes.slice(index, index + byteCount);
      if (group.length < byteCount) {
        break;
      }
      groups.push(`0x${(littleEndian ? group.reverse() : group).join('').toUpperCase()}`);
    }

    return groups.join(', ');
  };

  const encodeBase64 = (text) => {
    if (typeof TextEncoder === 'function' && typeof btoa === 'function') {
      const bytes = new TextEncoder().encode(text);
      let binary = '';
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return btoa(binary);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(text, 'utf8').toString('base64');
    }
    throw new Error('当前环境不支持 Base64 编码');
  };

  const decodeBase64 = (text) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    if (
      text.length % 4 !== 0
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)
    ) {
      throw new Error('无效的 Base64 文本');
    }

    if (
      text.endsWith('==')
      && (alphabet.indexOf(text.charAt(text.length - 3)) & 0x0F) !== 0
    ) {
      throw new Error('无效的 Base64 文本');
    }
    if (
      text.endsWith('=')
      && !text.endsWith('==')
      && (alphabet.indexOf(text.charAt(text.length - 2)) & 0x03) !== 0
    ) {
      throw new Error('无效的 Base64 文本');
    }

    let bytes;
    if (typeof atob === 'function') {
      const binary = atob(text);
      bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } else if (typeof Buffer !== 'undefined') {
      bytes = Buffer.from(text, 'base64');
    } else {
      throw new Error('当前环境不支持 Base64 解码');
    }

    if (typeof TextDecoder === 'function') {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    if (typeof Buffer !== 'undefined') {
      const buffer = Buffer.from(bytes);
      const decoded = buffer.toString('utf8');
      if (!Buffer.from(decoded, 'utf8').equals(buffer)) {
        throw new Error('Base64 内容不是有效的 UTF-8 文本');
      }
      return decoded;
    }
    throw new Error('当前环境不支持 UTF-8 解码');
  };

  const replaceEnglishQuotes = (text) => {
    let doubleQuoteOpen = true;
    let singleQuoteOpen = true;
    const withApostrophes = text.replace(
      /([\p{L}\p{N}])'(?=[\p{L}\p{N}])/gu,
      '$1’'
    );

    return withApostrophes.replace(/["']/g, (character) => {
      if (character === '"') {
        const replacement = doubleQuoteOpen ? '“' : '”';
        doubleQuoteOpen = !doubleQuoteOpen;
        return replacement;
      }
      const replacement = singleQuoteOpen ? '‘' : '’';
      singleQuoteOpen = !singleQuoteOpen;
      return replacement;
    });
  };

  const TRANSFORMS = Object.freeze(Object.assign(Object.create(null), {
    removeEmptyLines: (text) => success(
      splitLines(text).filter((line) => line.trim() !== '').join('\n')
    ),

    removeSpaces: (text) => success(text.replace(/ /g, '')),

    trimLines: (text) => success(splitLines(text).map((line) => line.trim()).join('\n')),

    collapseSpaces: (text) => success(
      normalizeLineBreaks(text).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n')
    ),

    removeAllLineBreaks: (text) => success(text.replace(/\r\n?|\n/g, '')),

    removeInterruptedBreaks: (text) => success(
      normalizeLineBreaks(text).replace(/([^.!?。！？\u201D\u2019\]）】])\n+/g, '$1')
    ),

    dedupeLines: (text, options) => {
      const seen = new Set();
      const output = [];

      splitLines(text).forEach((line) => {
        let comparison = options.trimBeforeCompare ? line.trim() : line;
        if (options.ignoreCase) {
          comparison = comparison.toLowerCase();
        }
        if (!seen.has(comparison)) {
          seen.add(comparison);
          output.push(line);
        }
      });

      return success(output.join('\n'));
    },

    sortLines: (text) => success(
      splitLines(text).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')).join('\n')
    ),

    addLineNumbers: (text) => success(
      splitLines(text).map((line, index) => `${index + 1}. ${line}`).join('\n')
    ),

    removeLineNumbers: (text) => success(
      splitLines(text).map((line) => line.replace(/^\s*\d+[.）、)]\s*/, '')).join('\n')
    ),

    upperCase: (text) => success(text.toUpperCase()),
    lowerCase: (text) => success(text.toLowerCase()),
    pascalCase: (text) => success(pascalCase(text)),

    camelCase: (text) => {
      const output = pascalCase(text);
      return success(changeFirstCodePoint(output, lower));
    },

    snakeCase: (text) => success(words(text).map(lower).join('_')),
    kebabCase: (text) => success(words(text).map(lower).join('-')),
    spaceCase: (text) => success(words(text).map(lower).join(' ')),

    urlEncode: (text) => success(encodeURIComponent(text)),

    urlDecode: (text) => success(decodeURIComponent(text)),

    base64Encode: (text) => success(encodeBase64(text)),

    base64Decode: (text) => success(decodeBase64(text)),

    jsonFormat: (text) => success(JSON.stringify(JSON.parse(text), null, 2)),

    jsonMinify: (text) => success(JSON.stringify(JSON.parse(text))),

    verticalLayout: (text) => success(text.split(/[\s,，]+/).filter(Boolean).join('\n')),

    horizontalLayout: (text) => success(
      splitLines(text).filter((line) => line.trim() !== '').join(' ')
    ),

    hexFormat1Byte: (text) => success(formatHexGroups(text, 1, false)),
    hexFormat4Byte: (text) => success(formatHexGroups(text, 4, false)),
    hexFormat4ByteLe: (text) => success(formatHexGroups(text, 4, true)),
    hexFormat8Byte: (text) => success(formatHexGroups(text, 8, false)),
    hexFormat8ByteLe: (text) => success(formatHexGroups(text, 8, true)),
    hexReverse: (text) => success(splitHexBytes(cleanHex(text)).join(' ').toUpperCase()),

    removeAllWhitespace: (text) => success(text.replace(/\s/g, '')),

    removeControlCharacters: (text) => success(
      text
        .replace(/\p{Cc}/gu, (character) => (
          character === '\t' || character === '\n' || character === '\r' ? character : ''
        ))
        .replace(/[\u061C\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    ),

    normalizeLineBreaks: (text) => success(normalizeLineBreaks(text)),

    collapseBlankLines: (text) => {
      const output = [];
      let previousWasBlank = false;

      splitLines(text).forEach((line) => {
        const isBlank = line.trim() === '';
        if (!isBlank || !previousWasBlank) {
          output.push(isBlank ? '' : line);
        }
        previousWasBlank = isBlank;
      });

      return success(output.join('\n'));
    },

    fullWidthToHalfWidth: (text) => success(
      text
        .replace(/\u3000/g, ' ')
        .replace(/[\uFF01-\uFF5E]/g, (character) => (
          String.fromCharCode(character.charCodeAt(0) - 0xFEE0)
        ))
    ),

    halfWidthToFullWidth: (text) => success(
      text
        .replace(/ /g, '\u3000')
        .replace(/[!-\u007E]/g, (character) => (
          String.fromCharCode(character.charCodeAt(0) + 0xFEE0)
        ))
    ),

    chinesePunctuationToEnglish: (text) => success(
      text
        .replace(/……/g, '...')
        .replace(/——/g, '--')
        .replace(/[，。！？；：（）【】《》〈〉“”‘’、￥]/g, (character) => ({
          '，': ',',
          '。': '.',
          '！': '!',
          '？': '?',
          '；': ';',
          '：': ':',
          '（': '(',
          '）': ')',
          '【': '[',
          '】': ']',
          '《': '<',
          '》': '>',
          '〈': '<',
          '〉': '>',
          '“': '"',
          '”': '"',
          '‘': "'",
          '’': "'",
          '、': ',',
          '￥': '$'
        })[character])
    ),

    englishPunctuationToChinese: (text) => success(
      replaceEnglishQuotes(text)
        .replace(/\.\.\./g, '……')
        .replace(/--/g, '——')
        .replace(/,/g, '，')
        .replace(/\./g, '。')
        .replace(/!/g, '！')
        .replace(/\?/g, '？')
        .replace(/;/g, '；')
        .replace(/:/g, '：')
        .replace(/\(/g, '（')
        .replace(/\)/g, '）')
        .replace(/\[/g, '【')
        .replace(/\]/g, '】')
        .replace(/</g, '《')
        .replace(/>/g, '》')
        .replace(/\$/g, '￥')
    ),

    reverseLines: (text) => success(splitLines(text).reverse().join('\n')),

    shuffleLines: (text, options) => {
      const output = splitLines(text);
      const random = options.random === undefined ? Math.random : options.random;
      if (typeof random !== 'function') {
        return failure('随机数生成器必须是函数');
      }

      for (let index = output.length - 1; index > 0; index -= 1) {
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
        [output[index], output[target]] = [output[target], output[index]];
      }

      return success(output.join('\n'));
    },

    filterLines: (text, options) => {
      if (options.query === undefined || options.query === null || options.query === '') {
        return failure('筛选文本不能为空');
      }
      if (typeof options.query !== 'string') {
        return failure('筛选文本必须是字符串');
      }

      const query = options.ignoreCase ? options.query.toLowerCase() : options.query;
      const matches = options.ignoreCase
        ? (line) => line.toLowerCase().includes(query)
        : (line) => line.includes(query);

      return success(
        splitLines(text)
          .filter((line) => (options.invert ? !matches(line) : matches(line)))
          .join('\n')
      );
    },

    prefixLines: (text, options) => {
      const prefix = String(options.prefix ?? '');
      return success(splitLines(text).map((line) => prefix + line).join('\n'));
    },

    suffixLines: (text, options) => {
      const suffix = String(options.suffix ?? '');
      return success(splitLines(text).map((line) => line + suffix).join('\n'));
    },

    quoteLines: (text, options) => {
      const quote = String(options.quote ?? '"');
      const openQuote = String(options.openQuote ?? options.leftQuote ?? quote);
      const closeQuote = String(options.closeQuote ?? options.rightQuote ?? quote);
      return success(splitLines(text).map((line) => openQuote + line + closeQuote).join('\n'));
    },

    splitByDelimiter: (text, options) => {
      const delimiter = options.delimiter === undefined ? ',' : options.delimiter;
      if (typeof delimiter !== 'string') {
        return failure('分隔符必须是字符串');
      }
      if (delimiter === '') {
        return failure('分隔符不能为空');
      }
      let parts = text.split(delimiter);
      if (options.trim) {
        parts = parts.map((part) => part.trim());
      }
      if (options.filterEmpty) {
        parts = parts.filter((part) => part !== '');
      }
      return success(parts.join('\n'));
    },

    joinByDelimiter: (text, options) => {
      const delimiter = options.delimiter === undefined ? ',' : options.delimiter;
      if (typeof delimiter !== 'string') {
        return failure('分隔符必须是字符串');
      }
      if (delimiter === '') {
        return failure('分隔符不能为空');
      }
      let lines = splitLines(text);
      if (options.trim) {
        lines = lines.map((line) => line.trim());
      }
      if (options.filterEmpty) {
        lines = lines.filter((line) => line !== '');
      }
      return success(lines.join(delimiter));
    },

    constantCase: (text) => success(words(text).map(upper).join('_')),
    dotCase: (text) => success(words(text).map(lower).join('.')),
    titleCase: (text) => success(words(text).map(capitalize).join(' ')),

    sentenceCase: (text) => {
      const output = words(text).map(lower).join(' ');
      return success(changeFirstCodePoint(output, upper));
    },

    capitalizeWords: (text) => success(
      text.replace(/(^|[^\p{L}\p{M}\p{N}])(\p{L})/gu, (
        match,
        boundary,
        character
      ) => boundary + character.toUpperCase())
    ),

    invertCase: (text) => success(
      text.replace(/\p{L}/gu, (character) => (
        character === character.toUpperCase()
          ? character.toLowerCase()
          : character.toUpperCase()
      ))
    )
  }));

  function caughtFailureMessage(id, error) {
    if (id === 'urlDecode') {
      return 'URL 解码失败：输入格式无效';
    }
    if (id === 'base64Decode') {
      return 'Base64 解码失败：输入不是有效的标准 Base64 或 UTF-8 文本';
    }
    if (id === 'jsonFormat' || id === 'jsonMinify') {
      const match = String(error && error.message).match(/\bposition\s+(\d+)\b/i);
      return match ? `JSON 解析失败，位置 ${match[1]}` : 'JSON 解析失败';
    }
    return '文本处理失败';
  }

  function runTransform(id, input, options = {}) {
    if (!Object.prototype.hasOwnProperty.call(TRANSFORMS, id)) {
      return failure('不支持的文本处理操作');
    }

    try {
      const transform = TRANSFORMS[id];
      return transform(String(input ?? ''), options || {});
    } catch (error) {
      return failure(caughtFailureMessage(id, error));
    }
  }

  return {
    success,
    failure,
    TRANSFORMS,
    runTransform
  };
});
