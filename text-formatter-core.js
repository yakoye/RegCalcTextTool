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
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .replace(/([0-9A-Za-z])([\u3400-\u9FFF])/g, '$1 $2')
    .replace(/([\u3400-\u9FFF])([0-9A-Za-z])/g, '$1 $2')
    .split(/[^0-9A-Za-z\u3400-\u9FFF]+/)
    .filter(Boolean);

  const lower = (word) => word.toLowerCase();
  const upper = (word) => word.toUpperCase();
  const capitalize = (word) => (
    word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ''
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
    const compact = text.replace(/\s+/g, '');
    if (
      compact.length % 4 === 1
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2,3})?$/.test(compact)
    ) {
      throw new Error('无效的 Base64 文本');
    }

    if (typeof TextDecoder === 'function' && typeof atob === 'function') {
      const binary = atob(compact);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(compact, 'base64').toString('utf8');
    }
    throw new Error('当前环境不支持 Base64 解码');
  };

  const replaceEnglishQuotes = (text) => {
    let doubleQuoteOpen = true;
    let singleQuoteOpen = true;

    return text.replace(/["']/g, (character) => {
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

  const TRANSFORMS = {
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
          comparison = comparison.toLocaleLowerCase();
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
      return success(output.charAt(0).toLowerCase() + output.slice(1));
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
      text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
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
      const random = options.random || Math.random;

      for (let index = output.length - 1; index > 0; index -= 1) {
        const target = Math.floor(random() * (index + 1));
        [output[index], output[target]] = [output[target], output[index]];
      }

      return success(output.join('\n'));
    },

    filterLines: (text, options) => {
      const query = String(options.query ?? '');
      let matches;

      if (options.regex) {
        const flags = options.flags ?? (options.ignoreCase ? 'i' : '');
        const pattern = new RegExp(query, flags);
        matches = (line) => {
          pattern.lastIndex = 0;
          return pattern.test(line);
        };
      } else if (options.ignoreCase) {
        const normalizedQuery = query.toLocaleLowerCase();
        matches = (line) => line.toLocaleLowerCase().includes(normalizedQuery);
      } else {
        matches = (line) => line.includes(query);
      }

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
      const delimiter = options.delimiter ?? ',';
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
      const delimiter = String(options.delimiter ?? ',');
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
      return success(output.charAt(0).toUpperCase() + output.slice(1));
    },

    capitalizeWords: (text) => success(
      text.replace(/(^|[^0-9A-Za-z\u3400-\u9FFF])([A-Za-z])/g, (
        match,
        boundary,
        character
      ) => boundary + character.toUpperCase())
    ),

    invertCase: (text) => success(
      text.replace(/[A-Za-z]/g, (character) => (
        character === character.toUpperCase()
          ? character.toLowerCase()
          : character.toUpperCase()
      ))
    )
  };

  function runTransform(id, input, options = {}) {
    if (!Object.prototype.hasOwnProperty.call(TRANSFORMS, id)) {
      return failure('不支持的文本处理操作');
    }

    try {
      const transform = TRANSFORMS[id];
      return transform(String(input ?? ''), options || {});
    } catch (error) {
      const reason = error && error.message ? error.message : '未知原因';
      return failure(`文本处理失败：${reason}`);
    }
  }

  return {
    success,
    failure,
    TRANSFORMS,
    runTransform
  };
});
