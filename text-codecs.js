(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TextCodecs = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const success = (value, message = '') => ({ ok: true, value, message });
  const failure = (message) => ({ ok: false, value: '', message });
  const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const MIME_TOKEN = "[A-Za-z0-9!#$&^_.+'*+-]+";
  const MIME_PATTERN = new RegExp(`^${MIME_TOKEN}/${MIME_TOKEN}$`);
  const PARAMETER_NAME_PATTERN = new RegExp(`^${MIME_TOKEN}$`);

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
    const match = /^data:([^,]*),(.*)$/su.exec(text);
    if (!match) {
      return failure('Data URL 格式无效');
    }

    const metadata = match[1].split(';');
    const mimeType = metadata.shift();
    if (!mimeType || !MIME_PATTERN.test(mimeType)) {
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
    const normalizedMime = asText(mimeType);
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
    let query = asText(input);
    const questionMark = query.indexOf('?');
    if (questionMark >= 0) {
      query = query.slice(questionMark + 1);
    } else if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(query)) {
      query = '';
    }
    const hash = query.indexOf('#');
    if (hash >= 0) {
      query = query.slice(0, hash);
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

  function decodeHtmlEntities(input) {
    const named = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'"
    };
    const output = asText(input).replace(
      /&(#(?:x[0-9A-Fa-f]+|[0-9]+)|amp|lt|gt|quot|apos);/gi,
      (entity, body) => {
        if (body.charAt(0) !== '#') {
          return named[body.toLowerCase()];
        }
        const hexadecimal = body.charAt(1).toLowerCase() === 'x';
        const value = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
        if (
          !Number.isInteger(value)
          || value < 0
          || value > 0x10FFFF
          || (value >= 0xD800 && value <= 0xDFFF)
        ) {
          return entity;
        }
        return String.fromCodePoint(value);
      }
    );
    return success(output);
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

  function jsonFailure(error) {
    const match = asText(error && error.message).match(/\bposition\s+(\d+)\b/i);
    return failure(match ? `JSON 格式错误，位置 ${match[1]}` : 'JSON 格式错误');
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

  function formatJson(input, options = {}) {
    try {
      return success(JSON.stringify(JSON.parse(asText(input)), null, jsonSpace(options)));
    } catch (error) {
      return jsonFailure(error);
    }
  }

  function minifyJson(input) {
    try {
      return success(JSON.stringify(JSON.parse(asText(input))));
    } catch (error) {
      return jsonFailure(error);
    }
  }

  function validateJson(input) {
    const text = asText(input);
    try {
      JSON.parse(text);
      return success(text);
    } catch (error) {
      return jsonFailure(error);
    }
  }

  function sortJsonValue(value) {
    if (Array.isArray(value)) {
      return value.map(sortJsonValue);
    }
    if (value && typeof value === 'object') {
      const output = Object.create(null);
      for (const key of Object.keys(value).sort()) {
        output[key] = sortJsonValue(value[key]);
      }
      return output;
    }
    return value;
  }

  function sortJsonKeys(input, options = {}) {
    try {
      const value = sortJsonValue(JSON.parse(asText(input)));
      return success(JSON.stringify(value, null, jsonSpace(options)));
    } catch (error) {
      return jsonFailure(error);
    }
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
    const formatted = formatJson(input, options);
    if (!formatted.ok) {
      return formatted;
    }
    return success(formatted.value.replace(
      /^(\s*)"([A-Za-z_$][A-Za-z0-9_$]*)":/gm,
      (match, indentation, key) => (
        key === '__proto__' ? `${indentation}["__proto__"]:` : `${indentation}${key}:`
      )
    ));
  }

  function yamlToJson(input, yamlImpl, options = {}) {
    if (!yamlImpl || typeof yamlImpl.load !== 'function') {
      return failure('YAML 解析库未加载');
    }
    try {
      const value = yamlImpl.load(asText(input));
      return success(JSON.stringify(value, null, jsonSpace(options)));
    } catch (error) {
      return failure('YAML 格式错误');
    }
  }

  function jsonToYaml(input, yamlImpl, options = {}) {
    if (!yamlImpl || typeof yamlImpl.dump !== 'function') {
      return failure('YAML 解析库未加载');
    }
    let value;
    try {
      value = JSON.parse(asText(input));
    } catch (error) {
      return jsonFailure(error);
    }
    try {
      return success(yamlImpl.dump(value, options.yaml || {}));
    } catch (error) {
      return failure('YAML 生成失败');
    }
  }

  function convertDelimited(input, fromDelimiter, toDelimiter, Papa) {
    if (!Papa || typeof Papa.parse !== 'function' || typeof Papa.unparse !== 'function') {
      return failure('CSV 解析库未加载');
    }
    if (
      typeof fromDelimiter !== 'string'
      || fromDelimiter.length === 0
      || typeof toDelimiter !== 'string'
      || toDelimiter.length === 0
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
    let value;
    try {
      value = JSON.parse(asText(input));
    } catch (error) {
      return jsonFailure(error);
    }
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
      return success(asText(parse(asText(input))));
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

  function hasXmlParserError(document) {
    if (!document || !document.documentElement) {
      return true;
    }
    const rootName = asText(document.documentElement.nodeName).toLowerCase();
    if (rootName === 'parsererror') {
      return true;
    }
    try {
      return (
        typeof document.getElementsByTagName === 'function'
        && document.getElementsByTagName('parsererror').length > 0
      );
    } catch (error) {
      return true;
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

  function convertXml(input, DOMParserCtor, XMLSerializerCtor, pretty) {
    if (typeof DOMParserCtor !== 'function' || typeof XMLSerializerCtor !== 'function') {
      return failure('XML 解析器未加载');
    }
    try {
      const parser = new DOMParserCtor();
      const parsed = parser.parseFromString(asText(input), 'application/xml');
      if (hasXmlParserError(parsed)) {
        return failure('XML 格式错误');
      }
      const document = typeof parsed.cloneNode === 'function' ? parsed.cloneNode(true) : parsed;
      prepareXmlNode(document, document, 0, pretty, false);
      const serializer = new XMLSerializerCtor();
      return success(serializer.serializeToString(document));
    } catch (error) {
      return failure('XML 格式转换失败');
    }
  }

  function formatXml(input, DOMParserCtor, XMLSerializerCtor) {
    if (DOMParserCtor && typeof DOMParserCtor === 'object' && XMLSerializerCtor === undefined) {
      XMLSerializerCtor = DOMParserCtor.XMLSerializer;
      DOMParserCtor = DOMParserCtor.DOMParser;
    }
    return convertXml(input, DOMParserCtor, XMLSerializerCtor, true);
  }

  function minifyXml(input, DOMParserCtor, XMLSerializerCtor) {
    if (DOMParserCtor && typeof DOMParserCtor === 'object' && XMLSerializerCtor === undefined) {
      XMLSerializerCtor = DOMParserCtor.XMLSerializer;
      DOMParserCtor = DOMParserCtor.DOMParser;
    }
    return convertXml(input, DOMParserCtor, XMLSerializerCtor, false);
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
      formatXml(input, libraries.DOMParser, libraries.XMLSerializer)
    ),
    xmlMinify: (input, libraries) => (
      minifyXml(input, libraries.DOMParser, libraries.XMLSerializer)
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
