(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    let heImpl = null;
    let saxImpl = null;
    try {
      heImpl = require('he');
    } catch (error) {
      heImpl = null;
    }
    try {
      saxImpl = require('sax');
    } catch (error) {
      saxImpl = null;
    }
    module.exports = factory(
      heImpl,
      saxImpl,
      root && root.DOMParser,
      root && root.XMLSerializer
    );
  } else {
    root.TextCodecs = factory(
      root && root.he,
      root && root.sax,
      root && root.DOMParser,
      root && root.XMLSerializer
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  defaultHe,
  defaultSax,
  defaultDOMParser,
  defaultXMLSerializer
) {
  'use strict';

  const success = (value, message = '') => ({ ok: true, value, message });
  const failure = (message) => ({ ok: false, value: '', message });
  const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const MIME_TOKEN = "[A-Za-z0-9!#$&^_.+'*+-]+";
  const MIME_PATTERN = new RegExp(`^${MIME_TOKEN}/${MIME_TOKEN}$`);
  const PARAMETER_NAME_PATTERN = new RegExp(`^${MIME_TOKEN}$`);
  const MAX_JSON_SCAN_DEPTH = 512;
  const MAX_STRUCTURED_DEPTH = 256;
  const MAX_STRUCTURED_NODES = 100000;
  const MAX_STRUCTURED_OUTPUT_BYTES = 5 * 1024 * 1024;
  const MAX_YAML_ALIASES = 100;

  function asText(input) {
    return String(input == null ? '' : input);
  }

  function asByteArray(input) {
    if (input instanceof Uint8Array) {
      return input;
    }
    if (
      input != null
      && typeof input !== 'string'
      && typeof input.length === 'number'
    ) {
      const values = Array.from(input);
      if (values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
        return Uint8Array.from(values);
      }
    }
    return null;
  }

  function encodeBytes(bytes) {
    if (typeof btoa === 'function') {
      let binary = '';
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
      }
      return btoa(binary);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    throw new Error('base64-unavailable');
  }

  function decodeBase64Bytes(normalized) {
    if (typeof atob === 'function') {
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    }
    if (typeof Buffer !== 'undefined') {
      return Uint8Array.from(Buffer.from(normalized, 'base64'));
    }
    throw new Error('base64-unavailable');
  }

  function normalizeBase64(input, urlSafe) {
    let text = asText(input).replace(/\s/gu, '');
    const validCharacters = urlSafe
      ? /^[A-Za-z0-9_-]*={0,2}$/
      : /^[A-Za-z0-9+/]*={0,2}$/;

    if (!validCharacters.test(text)) {
      return null;
    }
    if (text.includes('=') && text.length % 4 !== 0) {
      return null;
    }
    if (urlSafe) {
      text = text.replace(/-/g, '+').replace(/_/g, '/');
    }

    const remainder = text.length % 4;
    if (remainder === 1) {
      return null;
    }
    if (remainder === 2) {
      text += '==';
    } else if (remainder === 3) {
      text += '=';
    }

    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)
    ) {
      return null;
    }

    if (
      text.endsWith('==')
      && (BASE64_ALPHABET.indexOf(text.charAt(text.length - 3)) & 0x0F) !== 0
    ) {
      return null;
    }
    if (
      text.endsWith('=')
      && !text.endsWith('==')
      && (BASE64_ALPHABET.indexOf(text.charAt(text.length - 2)) & 0x03) !== 0
    ) {
      return null;
    }

    return text;
  }

  function bytesToBase64(input) {
    const bytes = asByteArray(input);
    if (!bytes) {
      return failure('字节数据格式无效');
    }
    try {
      return success(encodeBytes(bytes));
    } catch (error) {
      return failure('当前环境不支持 Base64 编码');
    }
  }

  function base64ToBytes(input) {
    const normalized = normalizeBase64(input, false);
    if (normalized === null) {
      return failure('Base64 格式无效');
    }
    try {
      return success(decodeBase64Bytes(normalized));
    } catch (error) {
      return failure('Base64 解码失败');
    }
  }

  function utf8Encode(input) {
    if (typeof TextEncoder === 'function') {
      return new TextEncoder().encode(asText(input));
    }
    if (typeof Buffer !== 'undefined') {
      return Uint8Array.from(Buffer.from(asText(input), 'utf8'));
    }
    throw new Error('utf8-unavailable');
  }

  function utf8Decode(bytes, fatal) {
    if (typeof TextDecoder === 'function') {
      return new TextDecoder('utf-8', {
        fatal,
        ignoreBOM: true
      }).decode(bytes);
    }
    if (typeof Buffer !== 'undefined' && !fatal) {
      return Buffer.from(bytes).toString('utf8');
    }
    throw new Error('utf8-unavailable');
  }

  function encodeUtf8Base64(input) {
    try {
      return bytesToBase64(utf8Encode(input));
    } catch (error) {
      return failure('当前环境不支持 UTF-8 编码');
    }
  }

  function decodeUtf8Base64(input) {
    const decoded = base64ToBytes(input);
    if (!decoded.ok) {
      return decoded;
    }
    try {
      return success(utf8Decode(decoded.value, true));
    } catch (error) {
      return failure('Base64 内容不是有效的 UTF-8 文本');
    }
  }

  function usePadding(options, defaultValue) {
    if (options && Object.prototype.hasOwnProperty.call(options, 'padding')) {
      return Boolean(options.padding);
    }
    if (options && Object.prototype.hasOwnProperty.call(options, 'omitPadding')) {
      return !options.omitPadding;
    }
    return defaultValue;
  }

  function toBase64Url(input, options = {}) {
    const normalized = normalizeBase64(input, false);
    if (normalized === null) {
      return failure('Base64 格式无效');
    }
    let output = normalized.replace(/\+/g, '-').replace(/\//g, '_');
    if (!usePadding(options, false)) {
      output = output.replace(/=+$/, '');
    }
    return success(output);
  }

  function fromBase64Url(input, options = {}) {
    const normalized = normalizeBase64(input, true);
    if (normalized === null) {
      return failure('URL-safe Base64 格式无效');
    }
    return success(usePadding(options, true) ? normalized : normalized.replace(/=+$/, ''));
  }

  function decodeDataUrlParameter(value) {
    return decodeURIComponent(value);
  }

  function encodeDataUrlParameter(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (character) => (
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    ));
  }

  function parseDataUrl(input) {
    const text = asText(input);
    const match = /^data:([^,]*),(.*)$/isu.exec(text);
    if (!match) {
      return failure('Data URL 格式无效');
    }

    const metadata = match[1].split(';');
    const declaredMimeType = metadata.shift();
    const mimeType = declaredMimeType || 'text/plain';
    if (!MIME_PATTERN.test(mimeType)) {
      return failure('Data URL 的 MIME 类型无效');
    }
    if (metadata.length === 0 || metadata.pop().toLowerCase() !== 'base64') {
      return failure('Data URL 必须使用 Base64 编码');
    }

    const parameters = {};
    try {
      for (const item of metadata) {
        const separator = item.indexOf('=');
        if (separator <= 0) {
          return failure('Data URL 参数格式无效');
        }
        const name = item.slice(0, separator).toLowerCase();
        const rawValue = item.slice(separator + 1);
        if (
          !PARAMETER_NAME_PATTERN.test(name)
          || Object.prototype.hasOwnProperty.call(parameters, name)
        ) {
          return failure('Data URL 参数格式无效');
        }
        Object.defineProperty(parameters, name, {
          value: decodeDataUrlParameter(rawValue),
          enumerable: true,
          configurable: true,
          writable: true
        });
      }
      if (
        declaredMimeType === ''
        && !Object.prototype.hasOwnProperty.call(parameters, 'charset')
      ) {
        Object.defineProperty(parameters, 'charset', {
          value: 'US-ASCII',
          enumerable: true,
          configurable: true,
          writable: true
        });
      }
    } catch (error) {
      return failure('Data URL 参数格式无效');
    }

    const decoded = base64ToBytes(match[2]);
    if (!decoded.ok) {
      return failure('Data URL 中的 Base64 格式无效');
    }
    const base64 = encodeBytes(decoded.value);
    return success({
      mimeType: mimeType.toLowerCase(),
      parameters,
      bytes: decoded.value,
      base64
    });
  }

  function buildDataUrl(input, mimeType, options = {}) {
    const bytes = asByteArray(input);
    const normalizedMime = asText(mimeType) || 'application/octet-stream';
    if (!bytes) {
      return failure('字节数据格式无效');
    }
    if (!MIME_PATTERN.test(normalizedMime)) {
      return failure('MIME 类型无效');
    }

    const metadata = [];
    const parameters = options && options.parameters;
    if (options && options.charset !== undefined) {
      metadata.push(['charset', options.charset]);
    }
    if (parameters !== undefined) {
      if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
        return failure('Data URL 参数格式无效');
      }
      for (const [name, value] of Object.entries(parameters)) {
        if (name.toLowerCase() === 'charset' && options.charset !== undefined) {
          continue;
        }
        metadata.push([name, value]);
      }
    }

    const seen = new Set();
    const serialized = [];
    for (const [rawName, rawValue] of metadata) {
      const name = asText(rawName).toLowerCase();
      if (
        !PARAMETER_NAME_PATTERN.test(name)
        || seen.has(name)
        || rawValue === undefined
        || rawValue === null
      ) {
        return failure('Data URL 参数格式无效');
      }
      seen.add(name);
      serialized.push(`${name}=${encodeDataUrlParameter(asText(rawValue))}`);
    }

    const encoded = bytesToBase64(bytes);
    if (!encoded.ok) {
      return encoded;
    }
    const suffix = serialized.length > 0 ? `;${serialized.join(';')}` : '';
    return success(`data:${normalizedMime.toLowerCase()}${suffix};base64,${encoded.value}`);
  }

  function encodeUrlComponent(input) {
    try {
      return success(encodeURIComponent(asText(input)));
    } catch (error) {
      return failure('URL 参数编码失败');
    }
  }

  function decodeUrlComponent(input) {
    try {
      return success(decodeURIComponent(asText(input)));
    } catch (error) {
      return failure('URL 参数解码失败：输入格式无效');
    }
  }

  function encodeFullUrl(input) {
    try {
      return success(encodeURI(asText(input)));
    } catch (error) {
      return failure('完整 URL 编码失败');
    }
  }

  function decodeFullUrl(input) {
    try {
      return success(decodeURI(asText(input)));
    } catch (error) {
      return failure('完整 URL 解码失败：输入格式无效');
    }
  }

  function decodeQueryPart(input) {
    return decodeURIComponent(input.replace(/\+/g, ' '));
  }

  function parseQuery(input) {
    const text = asText(input);
    const isFullUri = /^(?:\/\/|[A-Za-z][A-Za-z0-9+.-]*:)/.test(text);
    let query;

    if (isFullUri && typeof URL === 'function') {
      try {
        query = new URL(
          text,
          text.startsWith('//') ? 'http://query.invalid' : undefined
        ).search.slice(1);
      } catch (error) {
        return failure('完整 URI 格式无效');
      }
    } else {
      const hash = text.indexOf('#');
      query = hash >= 0 ? text.slice(0, hash) : text;
      const questionMark = query.indexOf('?');
      if (questionMark >= 0) {
        query = query.slice(questionMark + 1);
      } else if (isFullUri) {
        query = '';
      }
    }
    if (query === '') {
      return success([]);
    }

    const entries = [];
    try {
      for (const item of query.split('&')) {
        if (item === '') {
          continue;
        }
        const separator = item.indexOf('=');
        const key = separator < 0 ? item : item.slice(0, separator);
        const value = separator < 0 ? '' : item.slice(separator + 1);
        entries.push({
          key: decodeQueryPart(key),
          value: decodeQueryPart(value)
        });
      }
    } catch (error) {
      return failure('查询参数格式无效');
    }
    return success(entries);
  }

  function normalizeQueryEntries(entries) {
    if (!Array.isArray(entries)) {
      return null;
    }
    const normalized = [];
    for (const entry of entries) {
      let key;
      let value;
      if (Array.isArray(entry) && entry.length >= 2) {
        [key, value] = entry;
      } else if (
        entry
        && typeof entry === 'object'
        && Object.prototype.hasOwnProperty.call(entry, 'key')
        && Object.prototype.hasOwnProperty.call(entry, 'value')
      ) {
        ({ key, value } = entry);
      } else {
        return null;
      }
      if (key === undefined || value === undefined || typeof key === 'symbol' || typeof value === 'symbol') {
        return null;
      }
      normalized.push({ key: asText(key), value: asText(value) });
    }
    return normalized;
  }

  function buildQuery(entries, options = {}) {
    let normalized = normalizeQueryEntries(entries);
    if (!normalized) {
      return failure('查询参数条目格式无效');
    }
    if (options && options.sort) {
      normalized = normalized
        .map((entry, index) => ({ ...entry, index }))
        .sort((left, right) => (
          left.key < right.key ? -1 : left.key > right.key ? 1 : left.index - right.index
        ));
    }
    const query = normalized
      .map(({ key, value }) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    const leadingQuestionMark = Boolean(
      options && (options.leadingQuestionMark || options.questionMark)
    );
    return success(leadingQuestionMark && query ? `?${query}` : query);
  }

  function encodeHtmlEntities(input) {
    return success(asText(input).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]));
  }

  function decodeHtmlEntities(input, heImpl = defaultHe) {
    const text = asText(input);
    if (heImpl && typeof heImpl.decode === 'function') {
      try {
        return success(asText(heImpl.decode(text)));
      } catch (error) {
        return failure('HTML 实体解码失败');
      }
    }
    if (
      typeof document !== 'undefined'
      && document
      && typeof document.createElement === 'function'
    ) {
      try {
        const textarea = document.createElement('textarea');
        const entityPattern = /&(?:#[xX][0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);/gu;
        return success(text.replace(entityPattern, (entity) => {
          textarea.innerHTML = entity;
          return asText(textarea.value);
        }));
      } catch (error) {
        return failure('HTML 实体解码失败');
      }
    }
    return failure('HTML 实体解析库未加载');
  }

  function escapeUnicode(input) {
    let output = '';
    const text = asText(input);
    for (let index = 0; index < text.length; index += 1) {
      output += `\\u${text.charCodeAt(index).toString(16).toUpperCase().padStart(4, '0')}`;
    }
    return success(output);
  }

  function unescapeUnicode(input) {
    const text = asText(input);
    let output = '';
    for (let index = 0; index < text.length;) {
      if (text.charAt(index) !== '\\') {
        output += text.charAt(index);
        index += 1;
        continue;
      }
      if (index + 1 >= text.length) {
        return failure('Unicode 转义格式无效');
      }
      const escapeType = text.charAt(index + 1);
      if (escapeType === '\\' || escapeType === '/') {
        output += escapeType;
        index += 2;
        continue;
      }
      const simpleEscapes = {
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t'
      };
      if (Object.prototype.hasOwnProperty.call(simpleEscapes, escapeType)) {
        output += simpleEscapes[escapeType];
        index += 2;
        continue;
      }
      if (escapeType !== 'u' || !/^[0-9A-Fa-f]{4}$/.test(text.slice(index + 2, index + 6))) {
        return failure('Unicode 转义格式无效');
      }

      const first = Number.parseInt(text.slice(index + 2, index + 6), 16);
      if (first >= 0xD800 && first <= 0xDBFF) {
        if (
          text.slice(index + 6, index + 8) !== '\\u'
          || !/^[0-9A-Fa-f]{4}$/.test(text.slice(index + 8, index + 12))
        ) {
          return failure('Unicode 转义格式无效');
        }
        const second = Number.parseInt(text.slice(index + 8, index + 12), 16);
        if (second < 0xDC00 || second > 0xDFFF) {
          return failure('Unicode 转义格式无效');
        }
        output += String.fromCharCode(first, second);
        index += 12;
        continue;
      }
      if (first >= 0xDC00 && first <= 0xDFFF) {
        return failure('Unicode 转义格式无效');
      }
      output += String.fromCharCode(first);
      index += 6;
    }
    return success(output);
  }

  function canonicalJsonNumber(input) {
    const match = /^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/u.exec(input);
    if (!match) {
      return null;
    }
    const fraction = match[3] || '';
    let digits = `${match[2]}${fraction}`.replace(/^0+/u, '');
    if (digits === '') {
      return '0';
    }
    const exponentText = match[4] || '0';
    if (exponentText.replace(/^[+-]?0*/u, '').length > 6) {
      return null;
    }
    let exponent = Number(exponentText) - fraction.length;
    while (digits.endsWith('0')) {
      digits = digits.slice(0, -1);
      exponent += 1;
    }
    return `${match[1]}${digits}e${exponent}`;
  }

  function isSafeJsonNumberToken(raw) {
    const value = Number(raw);
    if (
      !Number.isFinite(value)
      || (Number.isInteger(value) && !Number.isSafeInteger(value))
    ) {
      return false;
    }
    const sourceCanonical = canonicalJsonNumber(raw);
    const valueCanonical = canonicalJsonNumber(String(value));
    return sourceCanonical !== null && sourceCanonical === valueCanonical;
  }

  function findJsonError(text) {
    let index = 0;
    let depthExceeded = false;
    let unsafeNumberPosition = -1;
    let lastNode = null;
    let lastStringValue = '';
    let astNodeCount = 0;
    let sizeExceeded = false;

    function setLastNode(node) {
      astNodeCount += 1;
      if (astNodeCount > MAX_STRUCTURED_NODES) {
        sizeExceeded = true;
        lastNode = null;
        return false;
      }
      lastNode = node;
      return true;
    }

    function skipWhitespace() {
      while (
        index < text.length
        && (
          text.charAt(index) === ' '
          || text.charAt(index) === '\t'
          || text.charAt(index) === '\n'
          || text.charAt(index) === '\r'
        )
      ) {
        index += 1;
      }
    }

    function parseString() {
      const start = index;
      index += 1;
      while (index < text.length) {
        const character = text.charAt(index);
        const code = text.charCodeAt(index);
        if (character === '"') {
          index += 1;
          lastStringValue = JSON.parse(text.slice(start, index));
          return -1;
        }
        if (code <= 0x1F) {
          return index;
        }
        if (character !== '\\') {
          index += 1;
          continue;
        }

        index += 1;
        if (index >= text.length) {
          return text.length;
        }
        const escapeType = text.charAt(index);
        if ('"\\/bfnrt'.includes(escapeType)) {
          index += 1;
          continue;
        }
        if (escapeType !== 'u') {
          return index;
        }
        index += 1;
        for (let digit = 0; digit < 4; digit += 1) {
          if (index >= text.length) {
            return text.length;
          }
          if (!/[0-9A-Fa-f]/.test(text.charAt(index))) {
            return index;
          }
          index += 1;
        }
      }
      return text.length;
    }

    function parseLiteral(literal) {
      for (let offset = 0; offset < literal.length; offset += 1) {
        if (index >= text.length) {
          return text.length;
        }
        if (text.charAt(index) !== literal.charAt(offset)) {
          return index;
        }
        index += 1;
      }
      return -1;
    }

    function parseNumber() {
      const start = index;
      if (text.charAt(index) === '-') {
        index += 1;
      }
      if (index >= text.length) {
        return text.length;
      }

      if (text.charAt(index) === '0') {
        index += 1;
        if (/[0-9]/.test(text.charAt(index))) {
          return index;
        }
      } else if (/[1-9]/.test(text.charAt(index))) {
        while (/[0-9]/.test(text.charAt(index))) {
          index += 1;
        }
      } else {
        return index;
      }

      if (text.charAt(index) === '.') {
        index += 1;
        if (!/[0-9]/.test(text.charAt(index))) {
          return index;
        }
        while (/[0-9]/.test(text.charAt(index))) {
          index += 1;
        }
      }

      if (text.charAt(index) === 'e' || text.charAt(index) === 'E') {
        index += 1;
        if (text.charAt(index) === '+' || text.charAt(index) === '-') {
          index += 1;
        }
        if (!/[0-9]/.test(text.charAt(index))) {
          return index;
        }
        while (/[0-9]/.test(text.charAt(index))) {
          index += 1;
        }
      }
      const raw = text.slice(start, index);
      if (unsafeNumberPosition < 0 && !isSafeJsonNumberToken(raw)) {
        unsafeNumberPosition = start;
      }
      return setLastNode({ type: 'number', raw }) ? -1 : index;
    }

    function parseArray(depth) {
      if (depth > MAX_JSON_SCAN_DEPTH) {
        depthExceeded = true;
        return index;
      }
      index += 1;
      skipWhitespace();
      if (text.charAt(index) === ']') {
        index += 1;
        return setLastNode({ type: 'array', items: [] }) ? -1 : index;
      }

      const items = [];
      while (index <= text.length) {
        const valueError = parseValue(depth);
        if (valueError >= 0) {
          return valueError;
        }
        items.push(lastNode);
        skipWhitespace();
        if (text.charAt(index) === ']') {
          index += 1;
          return setLastNode({ type: 'array', items }) ? -1 : index;
        }
        if (text.charAt(index) !== ',') {
          return index;
        }
        index += 1;
        skipWhitespace();
      }
      return text.length;
    }

    function parseObject(depth) {
      if (depth > MAX_JSON_SCAN_DEPTH) {
        depthExceeded = true;
        return index;
      }
      index += 1;
      skipWhitespace();
      if (text.charAt(index) === '}') {
        index += 1;
        return setLastNode({ type: 'object', entries: [] }) ? -1 : index;
      }

      const entries = [];
      while (index <= text.length) {
        if (text.charAt(index) !== '"') {
          return index;
        }
        const keyError = parseString();
        if (keyError >= 0) {
          return keyError;
        }
        const key = lastStringValue;
        skipWhitespace();
        if (text.charAt(index) !== ':') {
          return index;
        }
        index += 1;
        const valueError = parseValue(depth);
        if (valueError >= 0) {
          return valueError;
        }
        entries.push({ key, value: lastNode });
        skipWhitespace();
        if (text.charAt(index) === '}') {
          index += 1;
          return setLastNode({ type: 'object', entries }) ? -1 : index;
        }
        if (text.charAt(index) !== ',') {
          return index;
        }
        index += 1;
        skipWhitespace();
      }
      return text.length;
    }

    function parseValue(depth) {
      skipWhitespace();
      const character = text.charAt(index);
      if (character === '"') {
        const stringError = parseString();
        if (stringError < 0) {
          return setLastNode({ type: 'string', value: lastStringValue }) ? -1 : index;
        }
        return stringError;
      }
      if (character === '{') {
        return parseObject(depth + 1);
      }
      if (character === '[') {
        return parseArray(depth + 1);
      }
      if (character === 't') {
        const literalError = parseLiteral('true');
        if (literalError < 0) {
          return setLastNode({ type: 'literal', raw: 'true' }) ? -1 : index;
        }
        return literalError;
      }
      if (character === 'f') {
        const literalError = parseLiteral('false');
        if (literalError < 0) {
          return setLastNode({ type: 'literal', raw: 'false' }) ? -1 : index;
        }
        return literalError;
      }
      if (character === 'n') {
        const literalError = parseLiteral('null');
        if (literalError < 0) {
          return setLastNode({ type: 'literal', raw: 'null' }) ? -1 : index;
        }
        return literalError;
      }
      if (character === '-' || /[0-9]/.test(character)) {
        return parseNumber();
      }
      return index;
    }

    const valueError = parseValue(0);
    if (valueError >= 0) {
      return {
        position: valueError,
        depthExceeded,
        unsafeNumberPosition,
        sizeExceeded,
        ast: null
      };
    }
    skipWhitespace();
    return {
      position: index === text.length ? text.length : index,
      depthExceeded,
      unsafeNumberPosition,
      sizeExceeded,
      ast: index === text.length ? lastNode : null
    };
  }

  function jsonFailure(input) {
    const scan = findJsonError(asText(input));
    const detail = scan.depthExceeded ? '：嵌套层级过深' : '';
    return failure(`JSON 格式错误，位置 ${scan.position}${detail}`);
  }

  function utf8ByteLength(input) {
    const text = asText(input);
    let bytes = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code <= 0x7F) {
        bytes += 1;
      } else if (code <= 0x7FF) {
        bytes += 2;
      } else if (
        code >= 0xD800
        && code <= 0xDBFF
        && index + 1 < text.length
        && text.charCodeAt(index + 1) >= 0xDC00
        && text.charCodeAt(index + 1) <= 0xDFFF
      ) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    }
    return bytes;
  }

  function estimateJsonStringBytes(input) {
    const text = asText(input);
    let bytes = 2;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code === 0x22 || code === 0x5C) {
        bytes += 2;
      } else if (code <= 0x1F) {
        bytes += code === 0x08 || code === 0x09 || code === 0x0A
          || code === 0x0C || code === 0x0D ? 2 : 6;
      } else if (code <= 0x7F) {
        bytes += 1;
      } else if (code <= 0x7FF) {
        bytes += 2;
      } else if (
        code >= 0xD800
        && code <= 0xDBFF
        && index + 1 < text.length
        && text.charCodeAt(index + 1) >= 0xDC00
        && text.charCodeAt(index + 1) <= 0xDFFF
      ) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
      if (bytes > MAX_STRUCTURED_OUTPUT_BYTES) {
        return bytes;
      }
    }
    return bytes;
  }

  function inspectStructuredValue(root, options = {}) {
    const active = new WeakSet();
    const stack = [{ value: root, depth: 0, exit: false }];
    let pendingNodes = 1;
    let nodeCount = 0;
    let estimatedBytes = 0;

    while (stack.length > 0) {
      const frame = stack.pop();
      const value = frame.value;
      if (frame.exit) {
        active.delete(value);
        continue;
      }
      pendingNodes -= 1;
      nodeCount += 1;
      if (nodeCount > MAX_STRUCTURED_NODES) {
        return { ok: false, reason: 'size' };
      }
      if (frame.depth > MAX_STRUCTURED_DEPTH) {
        return { ok: false, reason: 'depth' };
      }

      if (value === null) {
        estimatedBytes += 4;
      } else if (typeof value === 'string') {
        estimatedBytes += estimateJsonStringBytes(value);
      } else if (typeof value === 'number') {
        if (
          !options.allowUnsafeNumbers
          && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
        ) {
          return { ok: false, reason: 'number' };
        }
        estimatedBytes += 32;
      } else if (typeof value === 'boolean') {
        estimatedBytes += 5;
      } else if (typeof value !== 'object') {
        return { ok: false, reason: 'size' };
      } else {
        if (active.has(value)) {
          return { ok: false, reason: 'cycle' };
        }
        active.add(value);
        stack.push({ value, depth: frame.depth, exit: true });

        const isArray = Array.isArray(value);
        const keys = isArray ? null : Object.keys(value);
        const childCount = isArray ? value.length : keys.length;
        if (
          !Number.isSafeInteger(childCount)
          || childCount > MAX_STRUCTURED_NODES
          || nodeCount + pendingNodes + childCount > MAX_STRUCTURED_NODES
        ) {
          return { ok: false, reason: 'size' };
        }
        estimatedBytes += 2 + Math.max(0, childCount - 1);
        for (let index = childCount - 1; index >= 0; index -= 1) {
          const key = isArray ? index : keys[index];
          if (!isArray) {
            estimatedBytes += estimateJsonStringBytes(key) + 1;
          }
          stack.push({
            value: value[key],
            depth: frame.depth + 1,
            exit: false
          });
        }
        pendingNodes += childCount;
      }

      if (estimatedBytes > MAX_STRUCTURED_OUTPUT_BYTES) {
        return { ok: false, reason: 'size' };
      }
    }
    return { ok: true, estimatedBytes, nodeCount };
  }

  function structuredBudgetFailure(format, reason) {
    if (reason === 'depth') {
      return failure(`${format} 嵌套层级过深`);
    }
    if (reason === 'number') {
      return failure(`${format} 数值超出安全范围`);
    }
    if (reason === 'cycle') {
      return failure(`${format} 数据包含循环引用`);
    }
    return failure(`${format} 数据规模过大`);
  }

  function structuredTextResult(text, format) {
    return utf8ByteLength(text) > MAX_STRUCTURED_OUTPUT_BYTES
      ? structuredBudgetFailure(format, 'size')
      : success(text);
  }

  function parseJsonDocument(input, options = {}) {
    const text = asText(input);
    if (utf8ByteLength(text) > MAX_STRUCTURED_OUTPUT_BYTES) {
      return {
        ok: false,
        result: structuredBudgetFailure('JSON', 'size')
      };
    }
    const scan = findJsonError(text);
    if (scan.sizeExceeded) {
      return {
        ok: false,
        result: structuredBudgetFailure('JSON', 'size')
      };
    }
    if (options.requireSafeNumbers && scan.unsafeNumberPosition >= 0) {
      return {
        ok: false,
        result: failure(`JSON 数值超出安全范围，位置 ${scan.unsafeNumberPosition}`)
      };
    }
    try {
      const value = JSON.parse(text);
      const budget = inspectStructuredValue(value, {
        allowUnsafeNumbers: !options.requireSafeNumbers
      });
      if (!budget.ok) {
        return {
          ok: false,
          result: structuredBudgetFailure('JSON', budget.reason)
        };
      }
      return {
        ok: true,
        text,
        value,
        ast: scan.ast
      };
    } catch (error) {
      return {
        ok: false,
        result: jsonFailure(text)
      };
    }
  }

  function jsonSpace(options) {
    if (typeof options === 'number') {
      return Math.max(0, Math.min(10, Math.trunc(options)));
    }
    if (options && Number.isFinite(options.space)) {
      return Math.max(0, Math.min(10, Math.trunc(options.space)));
    }
    return 2;
  }

  function jsonAstObjectKey(key, javascriptObjectKeys) {
    if (
      javascriptObjectKeys
      && /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key)
    ) {
      return key === '__proto__' ? '["__proto__"]' : key;
    }
    return JSON.stringify(key);
  }

  function serializeJsonAst(root, options = {}) {
    const space = options.space || 0;
    const indentation = (depth) => ' '.repeat(space * depth);

    function serialize(node, depth) {
      if (node.type === 'number' || node.type === 'literal') {
        return node.raw;
      }
      if (node.type === 'string') {
        return JSON.stringify(node.value);
      }

      const isArray = node.type === 'array';
      let children = isArray
        ? node.items
        : node.entries.map((entry, index) => ({ ...entry, index }));
      if (!isArray && options.sortKeys) {
        children = children.sort((left, right) => (
          left.key < right.key ? -1 : left.key > right.key ? 1 : left.index - right.index
        ));
      }
      if (children.length === 0) {
        return isArray ? '[]' : '{}';
      }

      const serialized = children.map((child) => {
        const value = serialize(isArray ? child : child.value, depth + 1);
        if (isArray) {
          return value;
        }
        const key = jsonAstObjectKey(child.key, options.javascriptObjectKeys);
        return `${key}:${space > 0 ? ' ' : ''}${value}`;
      });
      if (space === 0) {
        return `${isArray ? '[' : '{'}${serialized.join(',')}${isArray ? ']' : '}'}`;
      }
      const childIndentation = indentation(depth + 1);
      return [
        isArray ? '[' : '{',
        serialized.map((item) => `${childIndentation}${item}`).join(',\n'),
        `${indentation(depth)}${isArray ? ']' : '}'}`
      ].join('\n');
    }

    return serialize(root, 0);
  }

  function formatJson(input, options = {}) {
    const parsed = parseJsonDocument(input);
    if (!parsed.ok) {
      return parsed.result;
    }
    return structuredTextResult(
      serializeJsonAst(parsed.ast, { space: jsonSpace(options) }),
      'JSON'
    );
  }

  function minifyJson(input) {
    const parsed = parseJsonDocument(input);
    if (!parsed.ok) {
      return parsed.result;
    }
    return structuredTextResult(serializeJsonAst(parsed.ast), 'JSON');
  }

  function validateJson(input) {
    const parsed = parseJsonDocument(input);
    if (!parsed.ok) {
      return parsed.result;
    }
    return success(parsed.text);
  }

  function sortJsonKeys(input, options = {}) {
    const parsed = parseJsonDocument(input);
    if (!parsed.ok) {
      return parsed.result;
    }
    return structuredTextResult(
      serializeJsonAst(parsed.ast, {
        space: jsonSpace(options),
        sortKeys: true
      }),
      'JSON'
    );
  }

  function escapeJsonString(input) {
    const quoted = JSON.stringify(asText(input));
    return success(quoted.slice(1, -1));
  }

  function unescapeJsonString(input) {
    try {
      return success(JSON.parse(`"${asText(input)}"`));
    } catch (error) {
      return failure('JSON 字符串转义格式无效');
    }
  }

  function jsonToJavaScriptObjectText(input, options = {}) {
    const parsed = parseJsonDocument(input);
    if (!parsed.ok) {
      return parsed.result;
    }
    return structuredTextResult(
      serializeJsonAst(parsed.ast, {
        space: jsonSpace(options),
        javascriptObjectKeys: true
      }),
      'JSON'
    );
  }

  function yamlToJson(input, yamlImpl, options = {}) {
    if (!yamlImpl || typeof yamlImpl.load !== 'function') {
      return failure('YAML 解析库未加载');
    }
    const text = asText(input);
    if (utf8ByteLength(text) > MAX_STRUCTURED_OUTPUT_BYTES) {
      return failure('YAML 数据规模过大');
    }
    try {
      const value = yamlImpl.load(text, {
        maxAliases: MAX_YAML_ALIASES,
        maxDepth: MAX_STRUCTURED_DEPTH,
        maxTotalMergeKeys: MAX_STRUCTURED_NODES
      });
      const budget = inspectStructuredValue(value);
      if (!budget.ok) {
        return structuredBudgetFailure('YAML', budget.reason);
      }
      return structuredTextResult(
        JSON.stringify(value, null, jsonSpace(options)),
        'YAML'
      );
    } catch (error) {
      return failure('YAML 格式错误或数据规模过大');
    }
  }

  function jsonToYaml(input, yamlImpl, options = {}) {
    if (!yamlImpl || typeof yamlImpl.dump !== 'function') {
      return failure('YAML 解析库未加载');
    }
    const parsed = parseJsonDocument(input, { requireSafeNumbers: true });
    if (!parsed.ok) {
      return parsed.result;
    }
    try {
      return structuredTextResult(
        asText(yamlImpl.dump(parsed.value, options.yaml || {})),
        'YAML'
      );
    } catch (error) {
      return failure('YAML 生成失败');
    }
  }

  function isValidDelimiter(delimiter) {
    return (
      typeof delimiter === 'string'
      && delimiter.length > 0
      && !/["\r\n\uFEFF]/u.test(delimiter)
    );
  }

  function convertDelimited(input, fromDelimiter, toDelimiter, Papa) {
    if (!Papa || typeof Papa.parse !== 'function' || typeof Papa.unparse !== 'function') {
      return failure('CSV 解析库未加载');
    }
    if (
      !isValidDelimiter(fromDelimiter)
      || !isValidDelimiter(toDelimiter)
    ) {
      return failure('分隔符格式无效');
    }
    try {
      const parsed = Papa.parse(asText(input), {
        delimiter: fromDelimiter,
        skipEmptyLines: false
      });
      if (
        !parsed
        || !Array.isArray(parsed.data)
        || (Array.isArray(parsed.errors) && parsed.errors.length > 0)
      ) {
        return failure('分隔数据格式错误');
      }
      return success(Papa.unparse(parsed.data, {
        delimiter: toDelimiter,
        newline: '\n'
      }));
    } catch (error) {
      return failure('分隔数据转换失败');
    }
  }

  function queryToJson(input, options = {}) {
    const parsed = parseQuery(input);
    if (!parsed.ok) {
      return parsed;
    }
    const output = Object.create(null);
    for (const { key, value } of parsed.value) {
      if (!Object.prototype.hasOwnProperty.call(output, key)) {
        output[key] = value;
      } else if (Array.isArray(output[key])) {
        output[key].push(value);
      } else {
        output[key] = [output[key], value];
      }
    }
    return success(JSON.stringify(output, null, jsonSpace(options)));
  }

  function isQueryScalar(value) {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value);
  }

  function jsonToQuery(input, options = {}) {
    const parsed = parseJsonDocument(input, { requireSafeNumbers: true });
    if (!parsed.ok) {
      return parsed.result;
    }
    const value = parsed.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return failure('查询参数 JSON 必须是对象');
    }

    const entries = [];
    for (const [key, item] of Object.entries(value)) {
      const values = Array.isArray(item) ? item : [item];
      if (!values.every(isQueryScalar)) {
        return failure('查询参数值只能是基本类型或基本类型数组');
      }
      for (const entryValue of values) {
        entries.push({ key, value: entryValue === null ? '' : asText(entryValue) });
      }
    }
    return buildQuery(entries, options);
  }

  function markdownToHtml(input, markedImpl) {
    const parse = markedImpl && (
      typeof markedImpl.parse === 'function'
        ? markedImpl.parse.bind(markedImpl)
        : typeof markedImpl.marked === 'function'
          ? markedImpl.marked.bind(markedImpl)
          : typeof markedImpl === 'function'
            ? markedImpl
            : null
    );
    if (!parse) {
      return failure('Markdown 解析库未加载');
    }
    try {
      const output = parse(asText(input));
      if (
        output !== null
        && (typeof output === 'object' || typeof output === 'function')
        && typeof output.then === 'function'
      ) {
        Promise.resolve(output).catch(() => {});
        return failure('不支持异步 Markdown 解析器');
      }
      return success(asText(output));
    } catch (error) {
      return failure('Markdown 格式转换失败');
    }
  }

  function htmlToMarkdown(input, TurndownServiceCtor) {
    if (typeof TurndownServiceCtor !== 'function') {
      return failure('HTML 转 Markdown 库未加载');
    }
    try {
      const service = new TurndownServiceCtor();
      if (!service || typeof service.turndown !== 'function') {
        return failure('HTML 转 Markdown 库未加载');
      }
      return success(asText(service.turndown(asText(input))));
    } catch (error) {
      return failure('HTML 转 Markdown 失败');
    }
  }

  function nodeChildren(node) {
    return node && node.childNodes ? Array.from(node.childNodes) : [];
  }

  function removeNode(node) {
    if (node && node.parentNode && typeof node.parentNode.removeChild === 'function') {
      node.parentNode.removeChild(node);
    }
  }

  function inspectXmlDocument(document, pretty) {
    const root = document && document.nodeType === 9
      ? document
      : document && document.documentElement;
    if (!root) {
      return { ok: false, reason: 'size' };
    }
    const seen = new WeakSet();
    const stack = [{ node: root, depth: root.nodeType === 9 ? -1 : 0 }];
    let nodeCount = 0;
    let estimatedBytes = 0;

    while (stack.length > 0) {
      const { node, depth } = stack.pop();
      if (!node || (typeof node !== 'object' && typeof node !== 'function')) {
        return { ok: false, reason: 'size' };
      }
      if (seen.has(node)) {
        return { ok: false, reason: 'cycle' };
      }
      seen.add(node);
      nodeCount += 1;
      if (nodeCount > MAX_STRUCTURED_NODES) {
        return { ok: false, reason: 'size' };
      }
      if (depth > MAX_STRUCTURED_DEPTH) {
        return { ok: false, reason: 'depth' };
      }

      if (node.nodeType === 1 || (node.nodeType === undefined && node.nodeName)) {
        const name = asText(node.nodeName);
        estimatedBytes += utf8ByteLength(name) * 2 + 5;
        const rawAttributes = node.attributes;
        if (
          rawAttributes
          && Number.isFinite(Number(rawAttributes.length))
          && Number(rawAttributes.length) > MAX_STRUCTURED_NODES
        ) {
          return { ok: false, reason: 'size' };
        }
        const attributes = rawAttributes ? Array.from(rawAttributes) : [];
        if (attributes.length > MAX_STRUCTURED_NODES) {
          return { ok: false, reason: 'size' };
        }
        for (const attribute of attributes) {
          estimatedBytes += utf8ByteLength(attribute.name) + utf8ByteLength(attribute.value) + 4;
        }
        if (pretty && depth > 0) {
          estimatedBytes += depth * 4 + 2;
        }
      } else if ([3, 4, 7, 8].includes(node.nodeType)) {
        estimatedBytes += utf8ByteLength(node.nodeValue);
      }
      if (estimatedBytes > MAX_STRUCTURED_OUTPUT_BYTES) {
        return { ok: false, reason: 'size' };
      }

      if (
        node.childNodes
        && Number.isFinite(Number(node.childNodes.length))
        && Number(node.childNodes.length) > MAX_STRUCTURED_NODES
      ) {
        return { ok: false, reason: 'size' };
      }
      let children = nodeChildren(node);
      if (
        children.length === 0
        && node.nodeType === 9
        && node.documentElement
      ) {
        children = [node.documentElement];
      }
      if (
        children.length > MAX_STRUCTURED_NODES
        || nodeCount + stack.length + children.length > MAX_STRUCTURED_NODES
      ) {
        return { ok: false, reason: 'size' };
      }
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({ node: children[index], depth: depth + 1 });
      }
    }
    return { ok: true };
  }

  function prepareXmlNode(node, document, depth, pretty, inheritedPreserve) {
    if (!node) {
      return;
    }
    if (node.nodeType === 9) {
      for (const child of nodeChildren(node)) {
        prepareXmlNode(child, document, depth, pretty, false);
      }
      return;
    }
    if (node.nodeType !== 1) {
      return;
    }

    const xmlSpace = typeof node.getAttribute === 'function' ? node.getAttribute('xml:space') : '';
    const preserve = inheritedPreserve || xmlSpace === 'preserve';
    const originalChildren = nodeChildren(node);
    const hasTextContent = originalChildren.some((child) => (
      child.nodeType === 3 && !/^\s*$/u.test(asText(child.nodeValue))
    ));

    if (!preserve && !hasTextContent) {
      for (const child of originalChildren) {
        if (child.nodeType === 3 && /^\s*$/u.test(asText(child.nodeValue))) {
          removeNode(child);
        }
      }
    }

    for (const child of nodeChildren(node)) {
      if (child.nodeType === 1) {
        prepareXmlNode(child, document, depth + 1, pretty, preserve || hasTextContent);
      }
    }

    const children = nodeChildren(node);
    const canIndent = (
      pretty
      && !preserve
      && !hasTextContent
      && children.length > 0
      && children.some((child) => child.nodeType === 1 || child.nodeType === 7 || child.nodeType === 8)
      && document
      && typeof document.createTextNode === 'function'
      && typeof node.insertBefore === 'function'
      && typeof node.appendChild === 'function'
    );
    if (!canIndent) {
      return;
    }
    for (const child of children) {
      node.insertBefore(document.createTextNode(`\n${'  '.repeat(depth + 1)}`), child);
    }
    node.appendChild(document.createTextNode(`\n${'  '.repeat(depth)}`));
  }

  function saxLocation(parser) {
    const rawLine = Number(parser && parser.line);
    const rawColumn = Number(parser && parser.column);
    const rawPosition = Number(parser && parser.position);
    return {
      line: Number.isInteger(rawLine) && rawLine >= 0 ? rawLine + 1 : 1,
      column: Number.isInteger(rawColumn) && rawColumn >= 0 ? rawColumn + 1 : 1,
      position: Number.isInteger(rawPosition) && rawPosition >= 0 ? rawPosition : 0
    };
  }

  function xmlValidationFailure(location) {
    const safeLocation = location || { line: 1, column: 1, position: 0 };
    return failure(
      `XML 格式错误，行 ${safeLocation.line}，列 ${safeLocation.column}`
      + `，位置 ${safeLocation.position}`
    );
  }

  function validateXmlWithSax(text, SaxImpl) {
    if (!SaxImpl || typeof SaxImpl.parser !== 'function') {
      return { ok: false, missing: true };
    }
    let parser;
    let firstError = null;
    let depth = 0;
    let rootCount = 0;
    let rawAttributeNames = null;
    let expandedAttributeNames = null;
    const recordError = () => {
      if (!firstError) {
        firstError = saxLocation(parser);
      }
    };
    try {
      parser = SaxImpl.parser(true, {
        xmlns: true,
        strictEntities: true,
        position: true,
        trim: false,
        normalize: false
      });
      parser.onerror = recordError;
      parser.onopentagstart = () => {
        rawAttributeNames = new Set();
        expandedAttributeNames = new Set();
      };
      parser.onattribute = (attribute) => {
        const rawName = asText(attribute && attribute.name);
        const expandedName = `${
          asText(attribute && attribute.uri)
        }\u0000${asText(attribute && (attribute.local || attribute.name))}`;
        if (
          rawAttributeNames.has(rawName)
          || expandedAttributeNames.has(expandedName)
        ) {
          recordError();
        }
        rawAttributeNames.add(rawName);
        expandedAttributeNames.add(expandedName);
      };
      parser.onopentag = () => {
        if (depth === 0) {
          rootCount += 1;
          if (rootCount > 1) {
            recordError();
          }
        }
        depth += 1;
      };
      parser.onclosetag = () => {
        depth = Math.max(0, depth - 1);
      };
      parser.ontext = (value) => {
        if (asText(value).includes(']]>') || (depth === 0 && /\S/u.test(value))) {
          recordError();
        }
      };
      parser.write(text).close();
      if (rootCount !== 1) {
        recordError();
      }
    } catch (error) {
      recordError();
    }
    return firstError ? { ok: false, location: firstError } : { ok: true };
  }

  function convertXml(
    input,
    DOMParserCtor,
    XMLSerializerCtor,
    SaxImpl,
    pretty
  ) {
    const text = asText(input);
    if (utf8ByteLength(text) > MAX_STRUCTURED_OUTPUT_BYTES) {
      return failure('XML 数据规模过大');
    }
    if (!SaxImpl || typeof SaxImpl.parser !== 'function') {
      return failure('XML 验证库未加载');
    }
    const validation = validateXmlWithSax(text, SaxImpl);
    if (!validation.ok) {
      return validation.missing
        ? failure('XML 验证库未加载')
        : xmlValidationFailure(validation.location);
    }
    if (typeof DOMParserCtor !== 'function' || typeof XMLSerializerCtor !== 'function') {
      return failure('XML 解析器未加载');
    }
    try {
      const parser = new DOMParserCtor();
      const parsed = parser.parseFromString(text, 'application/xml');
      const budget = inspectXmlDocument(parsed, pretty);
      if (!budget.ok) {
        return structuredBudgetFailure('XML', budget.reason);
      }
      const document = typeof parsed.cloneNode === 'function' ? parsed.cloneNode(true) : parsed;
      prepareXmlNode(document, document, 0, pretty, false);
      const serializer = new XMLSerializerCtor();
      return structuredTextResult(
        asText(serializer.serializeToString(document)),
        'XML'
      );
    } catch (error) {
      return failure('XML 格式转换失败');
    }
  }

  function xmlConversionLibraries(DOMParserCtor, XMLSerializerCtor, SaxImpl) {
    if (DOMParserCtor && typeof DOMParserCtor === 'object' && XMLSerializerCtor === undefined) {
      SaxImpl = DOMParserCtor.sax;
      XMLSerializerCtor = DOMParserCtor.XMLSerializer;
      DOMParserCtor = DOMParserCtor.DOMParser;
    }
    return {
      DOMParserCtor: DOMParserCtor === undefined ? defaultDOMParser : DOMParserCtor,
      XMLSerializerCtor: XMLSerializerCtor === undefined
        ? defaultXMLSerializer
        : XMLSerializerCtor,
      SaxImpl: SaxImpl || defaultSax
    };
  }

  function formatXml(input, DOMParserCtor, XMLSerializerCtor, SaxImpl) {
    const libraries = xmlConversionLibraries(
      DOMParserCtor,
      XMLSerializerCtor,
      SaxImpl
    );
    return convertXml(
      input,
      libraries.DOMParserCtor,
      libraries.XMLSerializerCtor,
      libraries.SaxImpl,
      true
    );
  }

  function minifyXml(input, DOMParserCtor, XMLSerializerCtor, SaxImpl) {
    const libraries = xmlConversionLibraries(
      DOMParserCtor,
      XMLSerializerCtor,
      SaxImpl
    );
    return convertXml(
      input,
      libraries.DOMParserCtor,
      libraries.XMLSerializerCtor,
      libraries.SaxImpl,
      false
    );
  }

  const STRUCTURED_CONVERTERS = Object.freeze(Object.assign(Object.create(null), {
    jsonFormat: (input, libraries, options) => formatJson(input, options),
    formatJson: (input, libraries, options) => formatJson(input, options),
    jsonMinify: (input) => minifyJson(input),
    minifyJson: (input) => minifyJson(input),
    jsonValidate: (input) => validateJson(input),
    validateJson: (input) => validateJson(input),
    jsonSortKeys: (input, libraries, options) => sortJsonKeys(input, options),
    sortJsonKeys: (input, libraries, options) => sortJsonKeys(input, options),
    jsonEscapeString: (input) => escapeJsonString(input),
    jsonUnescapeString: (input) => unescapeJsonString(input),
    jsonToJavaScriptObjectText: (input, libraries, options) => (
      jsonToJavaScriptObjectText(input, options)
    ),
    yamlToJson: (input, libraries, options) => yamlToJson(input, libraries.jsyaml, options),
    jsonToYaml: (input, libraries, options) => jsonToYaml(input, libraries.jsyaml, options),
    csvToTsv: (input, libraries) => convertDelimited(input, ',', '\t', libraries.Papa),
    tsvToCsv: (input, libraries) => convertDelimited(input, '\t', ',', libraries.Papa),
    queryToJson: (input, libraries, options) => queryToJson(input, options),
    jsonToQuery: (input, libraries, options) => jsonToQuery(input, options),
    markdownToHtml: (input, libraries) => markdownToHtml(input, libraries.marked),
    htmlToMarkdown: (input, libraries) => htmlToMarkdown(input, libraries.TurndownService),
    xmlFormat: (input, libraries) => (
      formatXml(
        input,
        libraries.DOMParser,
        libraries.XMLSerializer,
        libraries.sax
      )
    ),
    xmlMinify: (input, libraries) => (
      minifyXml(
        input,
        libraries.DOMParser,
        libraries.XMLSerializer,
        libraries.sax
      )
    )
  }));

  function convertStructured(id, input, libraries = {}, options = {}) {
    if (
      typeof id !== 'string'
      || !Object.prototype.hasOwnProperty.call(STRUCTURED_CONVERTERS, id)
    ) {
      return failure('不支持的数据格式操作');
    }
    try {
      return STRUCTURED_CONVERTERS[id](asText(input), libraries || {}, options || {});
    } catch (error) {
      return failure('数据格式转换失败');
    }
  }

  function normalizeHex(input, options = {}) {
    const mode = options && options.mode ? options.mode : 'strict';
    const text = asText(input);
    let hex = '';

    if (mode === 'strict') {
      if (text === '') {
        return success('');
      }
      if (!/^(?:0x)?[0-9A-Fa-f]+$/i.test(text)) {
        return failure('Hex 格式无效');
      }
      hex = text.replace(/^0x/i, '');
    } else if (mode === 'clean') {
      if (text === '') {
        return success('');
      }
      if (!/^[0-9A-Fa-fXx\s,_]+$/u.test(text)) {
        return failure('Hex 格式无效');
      }
      const groups = text.split(/[\s,_]+/u).filter(Boolean);
      for (const group of groups) {
        if (!/^(?:0x)?[0-9A-Fa-f]+$/i.test(group)) {
          return failure('Hex 格式无效');
        }
      }
      hex = groups.map((group) => group.replace(/^0x/i, '')).join('');
    } else {
      return failure('Hex 处理模式无效');
    }

    if (hex.length % 2 !== 0) {
      return failure('Hex 必须包含完整字节');
    }
    return success(hex.toUpperCase());
  }

  function hexBytes(input, options) {
    const normalized = normalizeHex(input, options);
    if (!normalized.ok) {
      return normalized;
    }
    const bytes = [];
    for (let index = 0; index < normalized.value.length; index += 2) {
      bytes.push(normalized.value.slice(index, index + 2));
    }
    return success(bytes);
  }

  function groupHex(input, byteCount, littleEndian, options = {}) {
    if (!Number.isInteger(byteCount) || byteCount <= 0) {
      return failure('Hex 分组大小无效');
    }
    const parsed = hexBytes(input, options);
    if (!parsed.ok) {
      return parsed;
    }
    if (parsed.value.length % byteCount !== 0) {
      return failure('Hex 字节数不能被分组大小整除');
    }
    const output = [];
    for (let index = 0; index < parsed.value.length; index += byteCount) {
      const group = parsed.value.slice(index, index + byteCount);
      if (littleEndian) {
        group.reverse();
      }
      output.push(`0x${group.join('')}`);
    }
    return success(output.join(', '));
  }

  function reverseHexBytes(input, options = {}) {
    const parsed = hexBytes(input, options);
    return parsed.ok ? success(parsed.value.reverse().join('')) : parsed;
  }

  function utf8ToHex(input) {
    try {
      return success(Array.from(utf8Encode(input), (byte) => (
        byte.toString(16).toUpperCase().padStart(2, '0')
      )).join(''));
    } catch (error) {
      return failure('当前环境不支持 UTF-8 编码');
    }
  }

  function hexToUint8Array(input, options = {}) {
    const parsed = hexBytes(input, options);
    if (!parsed.ok) {
      return parsed;
    }
    return success(Uint8Array.from(parsed.value, (byte) => Number.parseInt(byte, 16)));
  }

  function hexToUtf8(input, fatal = true, options = {}) {
    if (fatal && typeof fatal === 'object') {
      options = fatal;
      fatal = options.fatal !== false;
    }
    const parsed = hexToUint8Array(input, options);
    if (!parsed.ok) {
      return parsed;
    }
    try {
      return success(utf8Decode(parsed.value, fatal !== false));
    } catch (error) {
      return failure('Hex 不是有效的 UTF-8 文本');
    }
  }

  function hexToBinary(input, options = {}) {
    const parsed = hexBytes(input, options);
    if (!parsed.ok) {
      return parsed;
    }
    return success(parsed.value.map((byte) => (
      Number.parseInt(byte, 16).toString(2).padStart(8, '0')
    )).join(''));
  }

  function binaryToHex(input) {
    const text = asText(input);
    if (!/^[01\s]*$/u.test(text)) {
      return failure('二进制格式无效');
    }
    const binary = text.replace(/\s/gu, '');
    if (binary.length % 8 !== 0) {
      return failure('二进制必须包含完整字节');
    }
    let output = '';
    for (let index = 0; index < binary.length; index += 8) {
      output += Number.parseInt(binary.slice(index, index + 8), 2)
        .toString(16)
        .toUpperCase()
        .padStart(2, '0');
    }
    return success(output);
  }

  function hexToDecimal(input) {
    const text = asText(input);
    if (!/^(?:0x)?[0-9A-Fa-f]+$/i.test(text)) {
      return failure('Hex 整数格式无效');
    }
    try {
      const digits = text.replace(/^0x/i, '');
      return success(BigInt(`0x${digits}`).toString(10));
    } catch (error) {
      return failure('Hex 整数格式无效');
    }
  }

  function decimalToHex(input) {
    const text = asText(input);
    if (!/^[0-9]+$/.test(text)) {
      return failure('十进制整数格式无效');
    }
    try {
      return success(BigInt(text).toString(16).toUpperCase());
    } catch (error) {
      return failure('十进制整数格式无效');
    }
  }

  function formattedByteArray(input, prefix, suffix, options = {}) {
    const parsed = hexBytes(input, options);
    if (!parsed.ok) {
      return parsed;
    }
    return success(`${prefix}${parsed.value.map((byte) => `0x${byte}`).join(', ')}${suffix}`);
  }

  function toCByteArray(input, options = {}) {
    return formattedByteArray(input, '{ ', ' }', options);
  }

  function toJavaScriptByteArray(input, options = {}) {
    return formattedByteArray(input, '[', ']', options);
  }

  function publicConversion(conversion) {
    return function (...args) {
      try {
        const result = conversion(...args);
        if (
          result
          && typeof result.ok === 'boolean'
          && Object.prototype.hasOwnProperty.call(result, 'value')
          && typeof result.message === 'string'
        ) {
          return result;
        }
        return failure('文本转换失败');
      } catch (error) {
        return failure('文本转换失败');
      }
    };
  }

  const publicConversions = {
    encodeUtf8Base64,
    decodeUtf8Base64,
    bytesToBase64,
    base64ToBytes,
    toBase64Url,
    fromBase64Url,
    parseDataUrl,
    buildDataUrl,
    encodeUrlComponent,
    decodeUrlComponent,
    encodeFullUrl,
    decodeFullUrl,
    parseQuery,
    buildQuery,
    encodeHtmlEntities,
    decodeHtmlEntities,
    escapeUnicode,
    unescapeUnicode,
    formatJson,
    minifyJson,
    validateJson,
    sortJsonKeys,
    escapeJsonString,
    unescapeJsonString,
    jsonToJavaScriptObjectText,
    yamlToJson,
    jsonToYaml,
    convertDelimited,
    queryToJson,
    jsonToQuery,
    markdownToHtml,
    htmlToMarkdown,
    formatXml,
    minifyXml,
    convertStructured,
    normalizeHex,
    groupHex,
    reverseHexBytes,
    utf8ToHex,
    hexToUtf8,
    hexToBinary,
    binaryToHex,
    hexToDecimal,
    decimalToHex,
    toCByteArray,
    toJavaScriptByteArray
  };

  const api = Object.create(null);
  for (const [name, conversion] of Object.entries(publicConversions)) {
    api[name] = publicConversion(conversion);
  }
  return Object.freeze(api);
});
