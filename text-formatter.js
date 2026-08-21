(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }
  root.TextFormatterUI = api;
  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", () => api.init(root));
    } else {
      api.init(root);
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SETTINGS_KEY = "toolbox.textformatter.settings.v1";
  const TEXT_INPUT_KEY = "toolbox.textformatter.input.v1";
  const TEXT_OUTPUT_KEY = "toolbox.textformatter.output.v1";
  const LEGACY_INPUT_KEY = "textconvert_textInput";
  const LEGACY_OUTPUT_KEY = "textconvert_textOutput";
  const GROUP_IDS = new Set(["", "clean", "lines", "case", "encode", "data", "hex", "generate"]);
  const HEX_MODES = new Set(["strict", "clean"]);
  const SEQUENCE_ORDERS = new Set(["range", "asc", "desc", "random"]);
  const SEQUENCE_RADICES = new Set([10, 16]);
  const SEPARATOR_MODES = new Set(["newline", "space", "comma", "custom"]);
  const MAX_FILE_BYTES = 16 * 1024 * 1024;
  const MAX_BASE64_ENCODED_CHARS = Math.ceil(MAX_FILE_BYTES / 3) * 4;
  const MAX_STATS_CHARACTERS = 1024 * 1024;
  const PERSISTENCE_DELAY_MS = 250;
  const MIN_BASE64_SENSITIVE_CHARS = 16;
  const CLEAR_FAILURE_MESSAGE = "本地记录清除失败，请清理浏览器站点数据";
  let outputBridge = null;

  const DEFAULT_SETTINGS = Object.freeze({
    expandedGroupId: "",
    hexMode: "strict",
    saveText: false,
    sequence: Object.freeze({
      width: 0,
      radix: 10,
      order: "range",
      separatorMode: "newline",
      start: 1,
      end: 50,
      count: null,
      separator: ","
    })
  });

  function action(id, label, description, panel, engine, method, extra) {
    return Object.freeze(Object.assign({
      id,
      label,
      description,
      panel,
      engine,
      method
    }, extra || {}));
  }

  function core(id, label, description, panel = "") {
    return action(`core-${id}`, label, description, panel, "core", id);
  }

  function codec(id, label, description, panel = "", extra) {
    return action(`codec-${id}`, label, description, panel, "codec", id, extra);
  }

  function structured(id, label, description) {
    return action(
      `structured-${id}`,
      label,
      description,
      "structured",
      "structured",
      id,
      id === "formatJson" ? { capabilities: ["convertStructured"] } : undefined
    );
  }

  const TEXT_DIRECT_ACTIONS = Object.freeze([
    action(
      "generate-sequence",
      "序列生成",
      "设置范围、位数、数量、进制、顺序和分隔符",
      "sequence",
      "generator",
      "generateSequence"
    )
  ]);

  const TEXT_TOOL_GROUPS = Object.freeze([
    Object.freeze({
      id: "clean",
      name: "文本清理",
      actions: Object.freeze([
        core("removeEmptyLines", "去除空行", "删除没有内容的行"),
        core("removeSpaces", "去除半角空格", "删除所有半角空格"),
        core("removeAllWhitespace", "去除全部空白", "删除空格、Tab 和换行"),
        core("trimLines", "行首尾去空白", "去掉每行开头和结尾的空白"),
        core("collapseSpaces", "合并空白", "连续空格和 Tab 合并为一个空格"),
        core("removeAllLineBreaks", "去除所有换行", "把全部行连接起来"),
        core("removeInterruptedBreaks", "修复中断换行", "拼接句中被错误断开的行"),
        core("removeControlCharacters", "去控制字符", "保留 Tab 和换行，移除其他控制字符"),
        core("normalizeLineBreaks", "统一换行", "把 CRLF 和 CR 转为 LF"),
        core("collapseBlankLines", "合并空白行", "连续空白行只保留一行"),
        core("fullWidthToHalfWidth", "全角转半角", "转换全角 ASCII 和全角空格"),
        core("halfWidthToFullWidth", "半角转全角", "转换 ASCII 和半角空格"),
        core("chinesePunctuationToEnglish", "中文标点转英文", "转换常见中文标点"),
        core("englishPunctuationToChinese", "英文标点转中文", "转换常见英文标点")
      ])
    }),
    Object.freeze({
      id: "lines",
      name: "行与列表",
      actions: Object.freeze([
        core("dedupeLines", "行去重", "按可选比较规则保留首次出现的行", "line"),
        core("sortLines", "行排序", "按中文区域字典序排序"),
        core("reverseLines", "反转行序", "把行的顺序完全反转"),
        core("shuffleLines", "随机行序", "使用随机顺序重排行"),
        core("filterLines", "筛选行", "保留或排除包含指定文本的行", "line"),
        core("addLineNumbers", "添加行号", "为每行添加 1. 2. 3. 行号"),
        core("removeLineNumbers", "移除行号", "移除常见数字行号"),
        core("prefixLines", "添加前缀", "为每行添加相同前缀", "line"),
        core("suffixLines", "添加后缀", "为每行添加相同后缀", "line"),
        core("quoteLines", "逐行加引号", "为每行添加左右引号", "line"),
        core("splitByDelimiter", "按分隔符拆行", "按指定文本拆分为多行", "line"),
        core("joinByDelimiter", "按分隔符连接", "用指定文本连接多行", "line"),
        core("verticalLayout", "横转竖", "按空白或逗号拆成多行"),
        core("horizontalLayout", "竖转横", "把非空行用空格连接")
      ])
    }),
    Object.freeze({
      id: "case",
      name: "大小写与命名",
      actions: Object.freeze([
        core("upperCase", "全部大写", "把字母转换为大写"),
        core("lowerCase", "全部小写", "把字母转换为小写"),
        core("pascalCase", "PascalCase", "大驼峰命名"),
        core("camelCase", "camelCase", "小驼峰命名"),
        core("snakeCase", "snake_case", "小写下划线命名"),
        core("kebabCase", "kebab-case", "小写短横线命名"),
        core("spaceCase", "space case", "小写空格命名"),
        core("constantCase", "CONSTANT_CASE", "大写下划线命名"),
        core("dotCase", "dot.case", "小写点分隔命名"),
        core("titleCase", "Title Case", "每个单词首字母大写"),
        core("sentenceCase", "Sentence case", "仅句首单词首字母大写"),
        core("capitalizeWords", "单词首字母大写", "保留原结构并大写单词首字母"),
        core("invertCase", "反转大小写", "逐字母交换大小写")
      ])
    }),
    Object.freeze({
      id: "encode",
      name: "编码与转义",
      actions: Object.freeze([
        codec("encodeUrlComponent", "URL 编码", "编码查询参数或路径片段"),
        codec("decodeUrlComponent", "URL 解码", "解码查询参数或路径片段"),
        codec("encodeFullUrl", "完整 URL 编码", "保留 URL 结构并编码必要字符"),
        codec("decodeFullUrl", "完整 URL 解码", "保留 URL 结构并解码内容"),
        codec("parseQuery", "Query 解析", "解析完整 URL 或查询字符串"),
        codec("buildQuery", "Query 构建", "从 JSON 条目构建查询字符串"),
        codec("encodeHtmlEntities", "HTML 实体编码", "编码 &、尖括号和引号"),
        codec("decodeHtmlEntities", "HTML 实体解码", "解码命名和数字 HTML 实体"),
        codec("escapeUnicode", "Unicode 转义", "转换为 Unicode 转义序列"),
        codec("unescapeUnicode", "Unicode 反转义", "恢复 Unicode 转义序列"),
        codec("encodeUtf8Base64", "Base64 编码", "把 UTF-8 文本编码为标准 Base64"),
        codec("decodeUtf8Base64", "Base64 解码", "严格解码 Base64 为 UTF-8 文本"),
        codec("toBase64Url", "Base64 转 URL-safe", "转换字符并移除默认填充"),
        codec("fromBase64Url", "URL-safe 转 Base64", "恢复标准 Base64 字符和填充"),
        action(
          "base64-file",
          "Base64 文件",
          "选择、拖放、编码、预览和下载文件",
          "base64",
          "file",
          "bytesToBase64",
          {
            capabilities: [
              "bytesToBase64",
              "base64ToBytes",
              "parseDataUrl",
              "buildDataUrl"
            ]
          }
        )
      ])
    }),
    Object.freeze({
      id: "data",
      name: "数据格式化",
      actions: Object.freeze([
        structured("formatJson", "JSON 格式化", "无损格式化 JSON"),
        structured("minifyJson", "JSON 压缩", "无损压缩 JSON"),
        structured("validateJson", "JSON 校验", "校验 JSON 并返回原文"),
        structured("sortJsonKeys", "JSON Key 排序", "递归排序对象 Key"),
        action(
          "structured-jsonEscapeString",
          "JSON 字符串转义",
          "转义字符串内容",
          "structured",
          "structured",
          "jsonEscapeString",
          { capabilities: ["escapeJsonString"] }
        ),
        action(
          "structured-jsonUnescapeString",
          "JSON 字符串反转义",
          "恢复字符串内容",
          "structured",
          "structured",
          "jsonUnescapeString",
          { capabilities: ["unescapeJsonString"] }
        ),
        structured("jsonToJavaScriptObjectText", "JSON 转 JS 对象文本", "生成 JavaScript 对象字面量文本"),
        structured("yamlToJson", "YAML 转 JSON", "通过 js-yaml 转换"),
        structured("jsonToYaml", "JSON 转 YAML", "通过 js-yaml 转换"),
        action(
          "structured-csvToTsv",
          "CSV 转 TSV",
          "通过 Papa Parse 转换分隔数据",
          "structured",
          "structured",
          "csvToTsv",
          { capabilities: ["convertDelimited"] }
        ),
        structured("tsvToCsv", "TSV 转 CSV", "通过 Papa Parse 转换分隔数据"),
        structured("queryToJson", "Query 转 JSON", "保留重复查询参数"),
        structured("jsonToQuery", "JSON 转 Query", "从对象或数组生成查询参数"),
        structured("markdownToHtml", "Markdown 转 HTML", "通过 marked 转换"),
        structured("htmlToMarkdown", "HTML 转 Markdown", "通过 Turndown 转换"),
        action(
          "structured-xmlFormat",
          "XML 格式化",
          "严格校验后格式化 XML",
          "structured",
          "structured",
          "xmlFormat",
          { capabilities: ["formatXml"] }
        ),
        action(
          "structured-xmlMinify",
          "XML 压缩",
          "严格校验后压缩 XML",
          "structured",
          "structured",
          "xmlMinify",
          { capabilities: ["minifyXml"] }
        ),
        action(
          "markdown-table",
          "表格与 Markdown",
          "可视化编辑并导入导出 GFM、HTML 和 TSV",
          "table",
          "table",
          "MarkdownTable"
        )
      ])
    }),
    Object.freeze({
      id: "hex",
      name: "Hex与字节",
      actions: Object.freeze([
        codec("normalizeHex", "规范化 Hex", "按 Strict 或 Clean 模式规范化", "hex"),
        codec("groupHex", "Hex 1B 分组", "校验完整字节并逐字节分组", "hex", {
          byteCount: 1,
          id: "codec-groupHex-1"
        }),
        codec("groupHex", "Hex 4B 大端", "按四字节大端分组", "hex", {
          byteCount: 4,
          id: "codec-groupHex-4-be"
        }),
        codec("groupHex", "Hex 4B 小端", "按四字节小端分组", "hex", {
          byteCount: 4,
          littleEndian: true,
          id: "codec-groupHex-4-le"
        }),
        codec("groupHex", "Hex 8B 大端", "按八字节大端分组", "hex", {
          byteCount: 8,
          id: "codec-groupHex-8-be"
        }),
        codec("groupHex", "Hex 8B 小端", "按八字节小端分组", "hex", {
          byteCount: 8,
          littleEndian: true,
          id: "codec-groupHex-8-le"
        }),
        codec("reverseHexBytes", "反转 Hex 字节", "按字节反转输入", "hex"),
        codec("utf8ToHex", "UTF-8 转 Hex", "把文本编码为 UTF-8 Hex"),
        codec("hexToUtf8", "Hex 转 UTF-8", "严格解码 UTF-8 字节", "hex"),
        codec("hexToBinary", "Hex 转二进制", "每字节输出八位二进制", "hex"),
        codec("binaryToHex", "二进制转 Hex", "把完整字节转换为 Hex"),
        codec("hexToDecimal", "Hex 转十进制", "支持任意长度非负整数"),
        codec("decimalToHex", "十进制转 Hex", "支持任意长度非负整数"),
        codec("toCByteArray", "C 字节数组", "生成 C 风格字节数组", "hex"),
        codec("toJavaScriptByteArray", "JavaScript 字节数组", "生成 JavaScript 数组", "hex")
      ])
    })
  ]);

  function integerOr(value, fallback, minimum, maximum) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
      ? parsed
      : fallback;
  }

  function sanitizeSettings(candidate) {
    const defaults = DEFAULT_SETTINGS;
    const sequenceDefaults = defaults.sequence;
    const value = candidate && typeof candidate === "object" ? candidate : {};
    const sequence = value.sequence && typeof value.sequence === "object"
      ? value.sequence
      : {};
    const count = sequence.count === null || sequence.count === "" || sequence.count === undefined
      ? sequenceDefaults.count
      : integerOr(sequence.count, sequenceDefaults.count, 1, 10000);
    return {
      expandedGroupId: GROUP_IDS.has(value.expandedGroupId)
        ? value.expandedGroupId
        : defaults.expandedGroupId,
      hexMode: HEX_MODES.has(value.hexMode) ? value.hexMode : defaults.hexMode,
      saveText: value.saveText === true ? true : defaults.saveText,
      sequence: {
        width: integerOr(sequence.width, sequenceDefaults.width, 0, 10),
        radix: SEQUENCE_RADICES.has(sequence.radix)
          ? sequence.radix
          : sequenceDefaults.radix,
        order: SEQUENCE_ORDERS.has(sequence.order)
          ? sequence.order
          : sequenceDefaults.order,
        separatorMode: SEPARATOR_MODES.has(sequence.separatorMode)
          ? sequence.separatorMode
          : sequenceDefaults.separatorMode,
        start: integerOr(
          sequence.start,
          sequenceDefaults.start,
          Number.MIN_SAFE_INTEGER,
          Number.MAX_SAFE_INTEGER
        ),
        end: integerOr(
          sequence.end,
          sequenceDefaults.end,
          Number.MIN_SAFE_INTEGER,
          Number.MAX_SAFE_INTEGER
        ),
        count,
        separator: typeof sequence.separator === "string"
          ? sequence.separator
          : sequenceDefaults.separator
      }
    };
  }

  function getStorage(host) {
    try {
      return host && host.localStorage ? host.localStorage : null;
    } catch (_error) {
      return null;
    }
  }

  function safeGet(storage, key) {
    try {
      return storage && storage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function safeSet(storage, key, value) {
    try {
      if (!storage) return false;
      storage.setItem(key, value);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function safeRemove(storage, key) {
    try {
      if (!storage) return false;
      storage.removeItem(key);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function saveSettings(storage, candidate) {
    const settings = sanitizeSettings(candidate);
    safeSet(storage, SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  }

  function clearPersistedText(storage) {
    return [TEXT_INPUT_KEY, TEXT_OUTPUT_KEY, LEGACY_INPUT_KEY, LEGACY_OUTPUT_KEY]
      .map((key) => safeRemove(storage, key))
      .every(Boolean);
  }

  function disableTextSaving(storage, candidate) {
    const settings = sanitizeSettings(Object.assign(
      {},
      candidate,
      { saveText: false }
    ));
    const settingsSaved = safeSet(storage, SETTINGS_KEY, JSON.stringify(settings));
    const textCleared = clearPersistedText(storage);
    if (!settingsSaved) safeRemove(storage, SETTINGS_KEY);
    return {
      settings,
      ok: settingsSaved && textCleared,
      settingsSaved,
      textCleared
    };
  }

  function createTextOriginState() {
    return {
      inputSensitive: false,
      outputSensitive: false
    };
  }

  function applyTextOriginTransition(origins, transition) {
    const state = origins || createTextOriginState();
    const change = transition || {};
    if (change.type === "set-input") {
      state.inputSensitive = change.sensitive === true;
    } else if (change.type === "set-output") {
      state.outputSensitive = change.sensitive === true;
    } else if (change.type === "user-input") {
      state.inputSensitive = false;
    } else if (change.type === "user-output") {
      state.outputSensitive = false;
    } else if (change.type === "use-output") {
      state.inputSensitive = state.outputSensitive;
    } else if (change.type === "swap") {
      [state.inputSensitive, state.outputSensitive] = [
        state.outputSensitive,
        state.inputSensitive
      ];
    } else if (change.type === "clear-input") {
      state.inputSensitive = false;
    } else if (change.type === "clear-output") {
      state.outputSensitive = false;
    } else if (change.type === "clear-all") {
      state.inputSensitive = false;
      state.outputSensitive = false;
    }
    return state;
  }

  function applyTransferOriginTransition(origins, type, forceInputSensitive) {
    const state = applyTextOriginTransition(origins, { type });
    if (forceInputSensitive) {
      applyTextOriginTransition(state, {
        type: "set-input",
        sensitive: true
      });
    }
    return state;
  }

  function createTransformOutputTransition(origins, result) {
    if (!result || result.ok === false) return null;
    return {
      type: "set-output",
      sensitive: Boolean(origins && origins.inputSensitive)
    };
  }

  function persistText(storage, settings, input, output, origins) {
    if (!settings || settings.saveText !== true) {
      return clearPersistedText(storage);
    }
    const state = origins || createTextOriginState();
    let persisted = true;
    if (state.inputSensitive) {
      persisted = safeRemove(storage, TEXT_INPUT_KEY) && persisted;
    } else {
      persisted = safeSet(storage, TEXT_INPUT_KEY, String(input ?? "")) && persisted;
    }
    if (state.outputSensitive) {
      persisted = safeRemove(storage, TEXT_OUTPUT_KEY) && persisted;
    } else {
      persisted = safeSet(storage, TEXT_OUTPUT_KEY, String(output ?? "")) && persisted;
    }
    persisted = safeRemove(storage, LEGACY_INPUT_KEY) && persisted;
    persisted = safeRemove(storage, LEGACY_OUTPUT_KEY) && persisted;
    return persisted;
  }

  function persistTextTransition(
    storage,
    settings,
    origins,
    transition,
    input,
    output
  ) {
    const state = applyTextOriginTransition(origins, transition);
    persistText(storage, settings, input, output, state);
    return state;
  }

  function tryEnableTextSaving(storage, candidate, input, output, origins) {
    const settings = sanitizeSettings(Object.assign({}, candidate, { saveText: true }));
    if (!safeSet(storage, SETTINGS_KEY, JSON.stringify(settings))) {
      const rollback = disableTextSaving(storage, settings);
      return {
        ok: false,
        settings: rollback.settings,
        cleanupOk: rollback.ok
      };
    }
    if (!persistText(storage, settings, input, output, origins)) {
      const rollback = disableTextSaving(storage, settings);
      return {
        ok: false,
        settings: rollback.settings,
        cleanupOk: rollback.ok
      };
    }
    return { ok: true, settings, cleanupOk: true };
  }

  function textSavingEnableFailureMessage(result) {
    return result && result.cleanupOk === false
      ? "保存启用失败，且部分本地记录无法清除，请清理浏览器站点数据"
      : "本地存储不可用，未启用文本保存";
  }

  function handlePersistenceFailure(options) {
    const config = options || {};
    try {
      if (config.persistence) config.persistence.cancel();
    } catch (_error) {
      // Persistence shutdown must not interrupt the current command.
    }
    if (config.saveTextToggle) config.saveTextToggle.checked = false;
    const result = disableTextSaving(config.storage, config.settings);
    if (typeof config.setStatus === "function") {
      config.setStatus(
        config.cleanupFailure || !result.ok
          ? CLEAR_FAILURE_MESSAGE
          : "本地保存失败，已关闭",
        true
      );
    }
    return result;
  }

  function clearSensitiveText(storage, origins, input, output) {
    const state = origins || createTextOriginState();
    let nextInput = String(input ?? "");
    let nextOutput = String(output ?? "");
    let storageOk = true;
    if (state.inputSensitive) {
      nextInput = "";
      state.inputSensitive = false;
      storageOk = safeRemove(storage, TEXT_INPUT_KEY) && storageOk;
    }
    if (state.outputSensitive) {
      nextOutput = "";
      state.outputSensitive = false;
      storageOk = safeRemove(storage, TEXT_OUTPUT_KEY) && storageOk;
    }
    return { input: nextInput, output: nextOutput, storageOk };
  }

  function clearSensitiveTextAndPersist(storage, settings, origins, input, output) {
    const state = origins || createTextOriginState();
    const inputWasSensitive = state.inputSensitive;
    const outputWasSensitive = state.outputSensitive;
    const cleared = clearSensitiveText(storage, state, input, output);
    let storageOk = cleared.storageOk;
    if (settings && settings.saveText === true) {
      if (!inputWasSensitive) {
        storageOk = safeSet(storage, TEXT_INPUT_KEY, cleared.input) && storageOk;
      }
      if (!outputWasSensitive) {
        storageOk = safeSet(storage, TEXT_OUTPUT_KEY, cleared.output) && storageOk;
      }
      storageOk = safeRemove(storage, LEGACY_INPUT_KEY) && storageOk;
      storageOk = safeRemove(storage, LEGACY_OUTPUT_KEY) && storageOk;
    }
    return Object.assign({}, cleared, { storageOk });
  }

  function clearTextSideAndPersist(
    storage,
    settings,
    origins,
    side,
    input,
    output
  ) {
    const state = origins || createTextOriginState();
    const clearInput = side === "input";
    applyTextOriginTransition(state, {
      type: clearInput ? "clear-input" : "clear-output"
    });
    let storageOk = safeRemove(
      storage,
      clearInput ? TEXT_INPUT_KEY : TEXT_OUTPUT_KEY
    );
    if (settings && settings.saveText === true) {
      const otherSensitive = clearInput
        ? state.outputSensitive
        : state.inputSensitive;
      const otherKey = clearInput ? TEXT_OUTPUT_KEY : TEXT_INPUT_KEY;
      const otherValue = clearInput ? output : input;
      storageOk = (
        otherSensitive
          ? safeRemove(storage, otherKey)
          : safeSet(storage, otherKey, String(otherValue ?? ""))
      ) && storageOk;
    }
    storageOk = safeRemove(storage, LEGACY_INPUT_KEY) && storageOk;
    storageOk = safeRemove(storage, LEGACY_OUTPUT_KEY) && storageOk;
    return storageOk;
  }

  function loadState(storage) {
    let parsed = {};
    const raw = safeGet(storage, SETTINGS_KEY);
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch (_error) {
        parsed = {};
      }
    }
    const settings = sanitizeSettings(parsed);
    let input = "";
    let output = "";
    const legacyInput = safeGet(storage, LEGACY_INPUT_KEY);
    const legacyOutput = safeGet(storage, LEGACY_OUTPUT_KEY);
    if (settings.saveText) {
      const currentInput = safeGet(storage, TEXT_INPUT_KEY);
      const currentOutput = safeGet(storage, TEXT_OUTPUT_KEY);
      input = currentInput === null ? (legacyInput ?? "") : currentInput;
      output = currentOutput === null ? (legacyOutput ?? "") : currentOutput;
      persistText(storage, settings, input, output);
    } else {
      input = legacyInput ?? "";
      output = legacyOutput ?? "";
      clearPersistedText(storage);
    }
    safeRemove(storage, LEGACY_INPUT_KEY);
    safeRemove(storage, LEGACY_OUTPUT_KEY);
    return { settings, input, output };
  }

  function createFileState() {
    return {
      bytes: null,
      name: "",
      size: 0,
      mimeType: "",
      downloadUrl: "",
      previewUrl: ""
    };
  }

  function isPotentialBase64Payload(value) {
    const text = String(value ?? "");
    if (/^\s*data:/i.test(text)) return true;
    if (/[ \t]/.test(text)) return false;
    const compact = text.replace(/[\r\n]/g, "");
    if (isOversizedBase64Candidate(compact, MAX_BASE64_ENCODED_CHARS)) return true;
    if (compact.length < MIN_BASE64_SENSITIVE_CHARS) return false;
    if (!/^(?:[A-Za-z0-9+/]*|[A-Za-z0-9_-]*)={0,2}$/.test(compact)) return false;
    const padding = (compact.match(/=+$/) || [""])[0].length;
    const unpaddedLength = compact.length - padding;
    if (unpaddedLength % 4 === 1) return false;
    return padding === 0 || compact.length % 4 === 0;
  }

  function isOversizedBase64Candidate(value, encodedLimit) {
    const text = String(value ?? "");
    if (text.length <= encodedLimit) return false;
    if (/^\s*data:/i.test(text)) return true;
    const sampleSize = 2048;
    const start = text.slice(0, sampleSize).trimStart();
    const end = text.slice(-sampleSize).trimEnd();
    return /^[A-Za-z0-9+/_-]+$/.test(start)
      && /^[A-Za-z0-9+/_=-]+$/.test(end);
  }

  function calculateTextStats(value, characterLimit = MAX_STATS_CHARACTERS, encodeLength) {
    const text = String(value ?? "");
    if (text.length > characterLimit) {
      return {
        characters: `${characterLimit}+`,
        lines: "大文本暂略",
        bytes: "大文本暂略"
      };
    }
    let bytes;
    if (typeof encodeLength === "function") {
      bytes = encodeLength(text);
    } else {
      try {
        bytes = new TextEncoder().encode(text).length;
      } catch (_error) {
        bytes = unescape(encodeURIComponent(text)).length;
      }
    }
    return {
      characters: Array.from(text).length,
      lines: text === "" ? 0 : text.split(/\r\n?|\n/).length,
      bytes
    };
  }

  function forceSensitiveInput(storage, settings, origins, persistence) {
    applyTextOriginTransition(origins, { type: "set-input", sensitive: true });
    if (persistence) persistence.cancel();
    return !settings || settings.saveText !== true
      ? true
      : safeRemove(storage, TEXT_INPUT_KEY);
  }

  function handleInputPersistence(
    storage,
    settings,
    origins,
    value,
    persistence,
    forceSensitive
  ) {
    const sensitive = forceSensitive === true || isPotentialBase64Payload(value);
    if (sensitive) {
      return {
        sensitive: true,
        storageOk: forceSensitiveInput(storage, settings, origins, persistence)
      };
    }
    applyTextOriginTransition(origins, { type: "user-input" });
    persistence.schedule();
    return { sensitive: false, storageOk: true };
  }

  function decodedBase64Size(encoded) {
    const text = String(encoded ?? "").replace(/\s+/g, "");
    const padding = (text.match(/=+$/) || [""])[0].length;
    return Math.floor((text.length * 3) / 4) - padding;
  }

  function normalizeBase64SourceWhitespace(source) {
    const text = String(source ?? "").trim();
    const comma = /^data:/i.test(text) ? text.indexOf(",") : -1;
    if (comma < 0) return text.replace(/\s+/g, "");
    return text.slice(0, comma + 1) + text.slice(comma + 1).replace(/\s+/g, "");
  }

  function validateBase64DecodeSize(source, maxBytes = MAX_FILE_BYTES) {
    const text = String(source ?? "").trim();
    const comma = /^data:/i.test(text) ? text.indexOf(",") : -1;
    const payload = (comma >= 0 ? text.slice(comma + 1) : text).replace(/\s+/g, "");
    if (payload.length > Math.ceil(maxBytes / 3) * 4
      || decodedBase64Size(payload) > maxBytes) {
      return {
        ok: false,
        message: `Base64 解码结果不能超过 ${Math.floor(maxBytes / 1024 / 1024) || maxBytes} MiB`
      };
    }
    return { ok: true, message: "" };
  }

  function createFileRequestController() {
    let generation = 0;
    return {
      begin() {
        generation += 1;
        return generation;
      },
      cancel() {
        generation += 1;
      },
      isCurrent(token) {
        return token === generation;
      }
    };
  }

  async function readFileRequest(file, controller, maxBytes = MAX_FILE_BYTES) {
    const token = controller.begin();
    if (!file) return { ok: false, cancelled: false, message: "请选择文件" };
    if (Number.isFinite(file.size) && file.size > maxBytes) {
      return {
        ok: false,
        cancelled: false,
        message: `文件不能超过 ${Math.floor(maxBytes / 1024 / 1024) || maxBytes} MiB`
      };
    }
    try {
      const buffer = await file.arrayBuffer();
      if (!controller.isCurrent(token)) return { ok: false, cancelled: true, message: "" };
      const bytes = new Uint8Array(buffer);
      if (bytes.length > maxBytes) {
        return {
          ok: false,
          cancelled: false,
          message: `文件不能超过 ${Math.floor(maxBytes / 1024 / 1024) || maxBytes} MiB`
        };
      }
      return {
        ok: true,
        cancelled: false,
        bytes,
        name: file.name || "",
        mimeType: file.type || "application/octet-stream"
      };
    } catch (_error) {
      if (!controller.isCurrent(token)) return { ok: false, cancelled: true, message: "" };
      return {
        ok: false,
        cancelled: false,
        message: "文件读取失败，请重新选择文件"
      };
    }
  }

  function createPersistenceScheduler(options) {
    const config = options || {};
    const delay = config.delay === undefined ? PERSISTENCE_DELAY_MS : config.delay;
    const setTimer = config.setTimer || setTimeout;
    const clearTimer = config.clearTimer || clearTimeout;
    let timer = null;

    function cancel() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    }

    function reportFailure() {
      try {
        if (typeof config.onFailure === "function") config.onFailure();
      } catch (_error) {
        // A failed recovery must not escape an input or unload event.
      }
    }

    function persistNow() {
      try {
        if (config.persist() !== false) return true;
      } catch (_error) {
        // Treat storage exceptions exactly like an explicit false result.
      }
      reportFailure();
      return false;
    }

    function schedule() {
      if (!config.isEnabled()) {
        cancel();
        return false;
      }
      cancel();
      timer = setTimer(() => {
        timer = null;
        if (config.isEnabled()) persistNow();
      }, delay);
      return true;
    }

    function flush() {
      cancel();
      if (!config.isEnabled()) return true;
      return persistNow();
    }

    return Object.freeze({ schedule, flush, cancel });
  }

  function safeDownloadName(value, fallback) {
    const safeFallback = String(fallback || "decoded.bin");
    const name = String(value ?? "").trim();
    if (
      !name
      || name === "."
      || name === ".."
      || name.length > 255
      || /[\\/\u0000-\u001f\u007f]/.test(name)
    ) {
      return safeFallback;
    }
    return name;
  }

  async function copyTextSafely(copy, value, message) {
    if (typeof copy !== "function") return false;
    try {
      return await copy(value, message) !== false;
    } catch (_error) {
      return false;
    }
  }

  function buildSequenceRequest(raw) {
    const source = raw || {};
    const numberValue = (value) => value === "" ? Number.NaN : Number(value);
    const separatorMode = source.separatorMode;
    const customSeparator = String(source.separator ?? "");
    let separator = "\n";
    if (separatorMode === "space") separator = " ";
    if (separatorMode === "comma") separator = ",";
    if (separatorMode === "custom") separator = customSeparator;
    const preference = {
      start: numberValue(source.start),
      end: numberValue(source.end),
      width: numberValue(source.width),
      count: source.count === "" ? null : numberValue(source.count),
      radix: numberValue(source.radix),
      order: source.order,
      separatorMode,
      separator: customSeparator
    };
    return {
      options: Object.assign({}, preference, { separator }),
      preference
    };
  }

  function syncBase64Variant(outputMode, variant) {
    const isDataUrl = outputMode.value === "data-url";
    if (isDataUrl) variant.value = "standard";
    variant.disabled = isDataUrl;
  }

  function formatValue(value) {
    if (typeof value === "string") return value;
    if (value instanceof Uint8Array) {
      return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch (_error) {
      return String(value ?? "");
    }
  }

  function init(host) {
    const doc = host.document;
    const panel = doc.getElementById("textconvert-ui");
    if (!panel || panel.dataset.initialized === "true") return;
    panel.dataset.initialized = "true";

    const storage = getStorage(host);
    const loaded = loadState(storage);
    let settings = loaded.settings;
    let selectedAction = null;
    let base64PanelActive = false;
    let persistenceCleanupFailed = false;
    const fileState = createFileState();
    const textOrigins = createTextOriginState();
    const input = doc.getElementById("textconvert_input");
    const output = doc.getElementById("textconvert_output");
    const status = doc.getElementById("textformatter_status");
    const groupsHost = doc.getElementById("text_tool_groups");
    const saveTextToggle = doc.getElementById("text_save_text");

    input.value = loaded.input;
    output.value = loaded.output;
    saveTextToggle.checked = settings.saveText;

    function setStatus(message, isError) {
      status.textContent = message || "";
      status.classList.toggle("is-error", Boolean(isError));
    }

    function toast(message) {
      if (typeof host.toolboxToast === "function") host.toolboxToast(message);
    }

    function renderStats(element, value) {
      const stats = calculateTextStats(value);
      Object.entries(stats).forEach(([name, count]) => {
        const target = element.querySelector(`[data-stat="${name}"]`);
        if (target) target.textContent = String(count);
      });
    }

    function updateStats() {
      updateInputStats();
      updateOutputStats();
    }

    function updateInputStats() {
      renderStats(doc.getElementById("text_input_stats"), input.value);
    }

    function updateOutputStats() {
      renderStats(doc.getElementById("text_output_stats"), output.value);
    }

    function persistCurrentText() {
      return persistText(storage, settings, input.value, output.value, textOrigins);
    }

    const timerHost = typeof host.setTimeout === "function" ? host : globalThis;
    let textPersistence = null;

    function handleRuntimePersistenceFailure() {
      const failure = handlePersistenceFailure({
        storage,
        settings,
        persistence: textPersistence,
        saveTextToggle,
        setStatus
      });
      settings = failure.settings;
      persistenceCleanupFailed = !failure.ok;
    }

    function handleStorageCleanupFailure() {
      const failure = handlePersistenceFailure({
        storage,
        settings,
        persistence: textPersistence,
        saveTextToggle,
        setStatus,
        cleanupFailure: true
      });
      settings = failure.settings;
      persistenceCleanupFailed = true;
      return false;
    }

    textPersistence = createPersistenceScheduler({
      delay: PERSISTENCE_DELAY_MS,
      isEnabled: () => settings.saveText,
      persist: persistCurrentText,
      onFailure: handleRuntimePersistenceFailure,
      setTimer: timerHost.setTimeout.bind(timerHost),
      clearTimer: timerHost.clearTimeout.bind(timerHost)
    });

    function saveTextValues(transition) {
      if (transition) applyTextOriginTransition(textOrigins, transition);
      return textPersistence.flush();
    }

    function scheduleTextValues(transition) {
      if (transition) applyTextOriginTransition(textOrigins, transition);
      textPersistence.schedule();
    }

    function markInputSensitive() {
      if (persistenceCleanupFailed) {
        setStatus(CLEAR_FAILURE_MESSAGE, true);
        return false;
      }
      if (!forceSensitiveInput(storage, settings, textOrigins, textPersistence)) {
        return handleStorageCleanupFailure();
      }
      return true;
    }

    function setOutput(value, message, options) {
      output.value = String(value ?? "");
      updateOutputStats();
      const transition = options && options.transition
        ? options.transition
        : {
          type: "set-output",
          sensitive: Boolean(options && options.sensitive)
        };
      const persisted = saveTextValues(transition);
      if (persisted) setStatus(message || "处理完成", false);
      return persisted;
    }

    outputBridge = setOutput;

    function closeGroups(except) {
      groupsHost.querySelectorAll("details.tc-group").forEach((details) => {
        if (details !== except) details.open = false;
        const menu = details.querySelector(".tc-menu");
        if (menu) {
          menu.hidden = !details.open;
          if (!details.open) {
            menu.classList.remove("tc-menu-up");
            menu.style.removeProperty("max-height");
          }
        }
      });
      if (!except) {
        settings.expandedGroupId = "";
        settings = saveSettings(storage, settings);
      }
    }

    function hidePanels() {
      selectedAction = null;
      base64PanelActive = false;
      groupsHost.querySelectorAll(".tc-direct-action").forEach((button) => {
        button.classList.remove("is-active");
        button.setAttribute("aria-pressed", "false");
      });
      doc.querySelectorAll(".tc-parameter-panel").forEach((item) => {
        item.hidden = true;
      });
    }

    function positionGroupMenu(details) {
      const summary = details.querySelector(".tc-group-summary");
      const menu = details.querySelector(".tc-menu");
      if (
        !details.open
        || !summary
        || !menu
        || typeof summary.getBoundingClientRect !== "function"
      ) {
        return;
      }
      const rect = summary.getBoundingClientRect();
      const viewportHeight = Number(host.innerHeight)
        || Number(doc.documentElement.clientHeight)
        || 720;
      let viewportTop = 0;
      let viewportBottom = viewportHeight;
      try {
        if (host.parent !== host && host.frameElement) {
          const frameRect = host.frameElement.getBoundingClientRect();
          const parentHeight = Number(host.parent.innerHeight) || viewportHeight;
          viewportTop = Math.max(0, -frameRect.top);
          viewportBottom = Math.min(
            viewportHeight,
            Math.max(viewportTop, parentHeight - frameRect.top)
          );
        }
      } catch (_error) {
        viewportTop = 0;
        viewportBottom = viewportHeight;
      }
      const edgeGap = 8;
      const spaceBelow = Math.max(0, viewportBottom - rect.bottom - edgeGap);
      const spaceAbove = Math.max(0, rect.top - viewportTop - edgeGap);
      const preferredHeight = Math.min(menu.scrollHeight || 220, 230);
      const openUp = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
      const availableHeight = Math.max(
        72,
        Math.floor(openUp ? spaceAbove : spaceBelow)
      );
      menu.classList.toggle("tc-menu-up", openUp);
      menu.style.maxHeight = `${Math.min(230, availableHeight)}px`;
    }

    function positionOpenGroupMenu() {
      const openGroup = groupsHost.querySelector("details.tc-group[open]");
      if (openGroup) positionGroupMenu(openGroup);
    }

    function showPanel(actionItem) {
      selectedAction = actionItem;
      base64PanelActive = actionItem.panel === "base64";
      groupsHost.querySelectorAll(".tc-direct-action").forEach((button) => {
        const active = button.dataset.actionId === actionItem.id;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      if (
        base64PanelActive
        && !forceSensitiveInput(storage, settings, textOrigins, textPersistence)
      ) {
        handleStorageCleanupFailure();
      }
      doc.querySelectorAll(".tc-parameter-panel").forEach((item) => {
        item.hidden = item.dataset.panel !== actionItem.panel;
      });
      const target = doc.querySelector(`.tc-parameter-panel[data-panel="${actionItem.panel}"]`);
      if (!target) return;
      const title = target.querySelector("[data-panel-title]");
      const description = target.querySelector("[data-panel-description]");
      if (title) title.textContent = actionItem.label;
      if (description) description.textContent = actionItem.description;
      if (actionItem.panel === "line") {
        target.querySelectorAll("[data-option-for]").forEach((field) => {
          field.hidden = !field.dataset.optionFor.split(/\s+/).includes(actionItem.method);
        });
      }
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function libraries() {
      return {
        marked: host.marked,
        TurndownService: host.TurndownService,
        jsyaml: host.jsyaml,
        Papa: host.Papa,
        DOMParser: host.DOMParser,
        XMLSerializer: host.XMLSerializer,
        sax: host.sax
      };
    }

    function lineOptions(method) {
      if (method === "dedupeLines") {
        return {
          ignoreCase: doc.getElementById("line_dedupe_ignore_case").checked,
          trimBeforeCompare: doc.getElementById("line_dedupe_trim").checked
        };
      }
      if (method === "filterLines") {
        return {
          query: doc.getElementById("line_filter_query").value,
          ignoreCase: doc.getElementById("line_filter_ignore_case").checked,
          invert: doc.getElementById("line_filter_invert").checked
        };
      }
      if (method === "prefixLines") {
        return { prefix: doc.getElementById("line_prefix").value };
      }
      if (method === "suffixLines") {
        return { suffix: doc.getElementById("line_suffix").value };
      }
      if (method === "quoteLines") {
        return {
          openQuote: doc.getElementById("line_open_quote").value,
          closeQuote: doc.getElementById("line_close_quote").value
        };
      }
      return {
        delimiter: doc.getElementById("line_delimiter").value,
        trim: doc.getElementById("line_trim_parts").checked,
        filterEmpty: doc.getElementById("line_filter_empty").checked
      };
    }

    function hexOptions() {
      return { mode: settings.hexMode };
    }

    function structuredOptions() {
      return { space: Number(doc.getElementById("structured_indent").value) };
    }

    function codecResult(actionItem, value) {
      const api = host.TextCodecs;
      const method = actionItem.method;
      if (method === "buildQuery") {
        let entries;
        try {
          entries = JSON.parse(value);
        } catch (_error) {
          return { ok: false, value: "", message: "Query 条目必须是有效 JSON" };
        }
        return api.buildQuery(entries);
      }
      if (method === "groupHex") {
        return api.groupHex(
          value,
          actionItem.byteCount,
          Boolean(actionItem.littleEndian),
          hexOptions()
        );
      }
      if (method === "hexToUtf8") {
        return api.hexToUtf8(value, true, hexOptions());
      }
      if ([
        "normalizeHex",
        "reverseHexBytes",
        "hexToBinary",
        "toCByteArray",
        "toJavaScriptByteArray"
      ].includes(method)) {
        return api[method](value, hexOptions());
      }
      return api[method](value);
    }

    function runAction(actionItem) {
      let result;
      if (!actionItem) {
        setStatus("请先选择操作", true);
        return;
      }
      if (actionItem.engine === "core") {
        if (!host.TextFormatterCore) {
          setStatus("文本处理模块未加载", true);
          return;
        }
        result = host.TextFormatterCore.runTransform(
          actionItem.method,
          input.value,
          actionItem.panel === "line" ? lineOptions(actionItem.method) : {}
        );
      } else if (actionItem.engine === "structured") {
        if (!host.TextCodecs) {
          setStatus("文本编码模块未加载", true);
          return;
        }
        result = host.TextCodecs.convertStructured(
          actionItem.method,
          input.value,
          libraries(),
          structuredOptions()
        );
      } else if (actionItem.engine === "codec") {
        if (!host.TextCodecs || typeof host.TextCodecs[actionItem.method] !== "function") {
          setStatus("文本编码模块未加载", true);
          return;
        }
        result = codecResult(actionItem, input.value);
      } else {
        showPanel(actionItem);
        return;
      }

      const outputTransition = createTransformOutputTransition(textOrigins, result);
      if (!outputTransition) {
        setStatus((result && result.message) || "处理失败，请检查输入", true);
        return;
      }
      const persisted = setOutput(
        formatValue(result.value),
        result.message || "处理完成",
        { transition: outputTransition }
      );
      if (persisted) toast("处理完成");
    }

    function selectAction(actionItem) {
      closeGroups(null);
      if (actionItem.panel) {
        showPanel(actionItem);
      } else {
        base64PanelActive = false;
        runAction(actionItem);
      }
    }

    TEXT_DIRECT_ACTIONS.forEach((actionItem) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "tc-direct-action";
      button.dataset.actionId = actionItem.id;
      button.title = actionItem.description;
      button.setAttribute("aria-label", `${actionItem.label}：${actionItem.description}`);
      button.setAttribute("aria-pressed", "false");
      button.textContent = actionItem.label;
      button.addEventListener("click", () => selectAction(actionItem));
      groupsHost.appendChild(button);
    });

    TEXT_TOOL_GROUPS.forEach((group) => {
      const details = doc.createElement("details");
      details.className = "tc-group";
      details.dataset.groupId = group.id;
      details.open = settings.expandedGroupId === group.id;

      const summary = doc.createElement("summary");
      summary.className = "tc-group-summary";
      summary.textContent = group.name;
      const count = doc.createElement("span");
      count.className = "tc-group-count";
      count.textContent = String(group.actions.length);
      summary.appendChild(count);

      const menu = doc.createElement("div");
      menu.className = "tc-menu";
      menu.hidden = !details.open;
      group.actions.forEach((actionItem) => {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "tc-menu-item";
        button.dataset.actionId = actionItem.id;
        button.title = actionItem.description;
        button.setAttribute("aria-label", `${actionItem.label}：${actionItem.description}`);
        const label = doc.createElement("span");
        label.className = "tc-menu-label";
        label.textContent = actionItem.label;
        button.appendChild(label);
        button.addEventListener("click", () => selectAction(actionItem));
        menu.appendChild(button);
      });

      details.append(summary, menu);
      details.addEventListener("toggle", () => {
        if (details.open) {
          closeGroups(details);
          hidePanels();
          settings.expandedGroupId = group.id;
        } else if (settings.expandedGroupId === group.id) {
          settings.expandedGroupId = "";
        }
        menu.hidden = !details.open;
        if (details.open) positionGroupMenu(details);
        settings = saveSettings(storage, settings);
      });
      groupsHost.appendChild(details);
      if (details.open) {
        hidePanels();
        positionGroupMenu(details);
      }
    });

    if (typeof host.addEventListener === "function") {
      host.addEventListener("resize", positionOpenGroupMenu);
      host.addEventListener("scroll", positionOpenGroupMenu, true);
    }

    panel.addEventListener("click", (event) => {
      const runButton = event.target.closest("[data-run-selected]");
      if (runButton) runAction(selectedAction);
    });

    doc.addEventListener("click", (event) => {
      if (!groupsHost.contains(event.target)) closeGroups(null);
    });
    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const openGroup = Array.from(
          groupsHost.querySelectorAll("details.tc-group")
        ).find((details) => details.open);
        const summary = openGroup &&
          openGroup.querySelector(".tc-group-summary");
        const restoreSummaryFocus = Boolean(
          openGroup && openGroup.contains(doc.activeElement)
        );
        closeGroups(null);
        if (restoreSummaryFocus && summary) summary.focus();
      }
    });

    input.addEventListener("input", () => {
      const persistenceResult = handleInputPersistence(
        storage,
        settings,
        textOrigins,
        input.value,
        textPersistence,
        base64PanelActive
      );
      if (!persistenceResult.storageOk) handleStorageCleanupFailure();
      updateInputStats();
    });
    output.addEventListener("input", () => {
      updateOutputStats();
      scheduleTextValues({ type: "user-output" });
    });

    doc.getElementById("text_copy_output").addEventListener("click", async () => {
      if (!output.value) {
        setStatus("暂无可复制结果", true);
        return;
      }
      const copied = await copyTextSafely(
        host.toolboxCopyText,
        output.value,
        "已复制结果"
      );
      if (!copied) {
        setStatus("复制失败", true);
        return;
      }
      setStatus("结果已复制", false);
    });
    doc.getElementById("text_use_output").addEventListener("click", () => {
      input.value = output.value;
      updateInputStats();
      applyTransferOriginTransition(
        textOrigins,
        "use-output",
        base64PanelActive
      );
      if (saveTextValues()) {
        setStatus("结果已作为原文", false);
      }
    });
    doc.getElementById("text_swap").addEventListener("click", () => {
      [input.value, output.value] = [output.value, input.value];
      updateStats();
      applyTransferOriginTransition(
        textOrigins,
        "swap",
        base64PanelActive
      );
      if (saveTextValues()) {
        setStatus("原文与结果已交换", false);
      }
    });
    doc.getElementById("text_clear_input").addEventListener("click", () => {
      input.value = "";
      updateInputStats();
      textPersistence.cancel();
      if (clearTextSideAndPersist(
        storage,
        settings,
        textOrigins,
        "input",
        input.value,
        output.value
      )) {
        setStatus("原文已清空", false);
      } else {
        handleStorageCleanupFailure();
      }
    });
    doc.getElementById("text_clear_output").addEventListener("click", () => {
      output.value = "";
      updateOutputStats();
      textPersistence.cancel();
      if (clearTextSideAndPersist(
        storage,
        settings,
        textOrigins,
        "output",
        input.value,
        output.value
      )) {
        setStatus("结果已清空", false);
      } else {
        handleStorageCleanupFailure();
      }
    });
    doc.getElementById("text_clear_all").addEventListener("click", () => {
      input.value = "";
      output.value = "";
      applyTextOriginTransition(textOrigins, { type: "clear-all" });
      updateStats();
      textPersistence.cancel();
      if (clearPersistedText(storage)) {
        setStatus("原文与结果已清空", false);
      } else {
        handleStorageCleanupFailure();
      }
    });
    saveTextToggle.addEventListener("change", () => {
      if (saveTextToggle.checked) {
        const enabled = tryEnableTextSaving(
          storage,
          settings,
          input.value,
          output.value,
          textOrigins
        );
        settings = enabled.settings;
        saveTextToggle.checked = enabled.ok;
        if (!enabled.ok) {
          persistenceCleanupFailed = enabled.cleanupOk === false;
          setStatus(textSavingEnableFailureMessage(enabled), true);
          return;
        }
        persistenceCleanupFailed = false;
        setStatus("已启用本地文本保存", false);
      } else {
        textPersistence.cancel();
        const disabled = disableTextSaving(storage, settings);
        settings = disabled.settings;
        saveTextToggle.checked = false;
        persistenceCleanupFailed = !disabled.ok;
        if (disabled.ok) {
          setStatus("已关闭本地文本保存并清除记录", false);
        } else {
          setStatus(CLEAR_FAILURE_MESSAGE, true);
        }
      }
    });

    doc.querySelectorAll('input[name="hex_mode"]').forEach((radio) => {
      radio.checked = radio.value === settings.hexMode;
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        settings.hexMode = radio.value;
        settings = saveSettings(storage, settings);
      });
    });

    function readSequenceRequest() {
      return buildSequenceRequest({
        start: doc.getElementById("sequence_start").value,
        end: doc.getElementById("sequence_end").value,
        width: doc.getElementById("sequence_width").value,
        count: doc.getElementById("sequence_count").value,
        radix: doc.getElementById("sequence_radix").value,
        order: doc.getElementById("sequence_order").value,
        separatorMode: doc.getElementById("sequence_separator_mode").value,
        separator: doc.getElementById("sequence_separator_custom").value
      });
    }

    function generateSequence(target) {
      if (!host.TextGenerators) {
        setStatus("序列生成模块未加载", true);
        return;
      }
      const request = readSequenceRequest();
      const result = host.TextGenerators.generateSequence(request.options);
      if (!result.ok) {
        setStatus(result.message, true);
        return;
      }
      settings.sequence = request.preference;
      settings = saveSettings(storage, settings);
      if (target === input) {
        input.value = result.value;
        updateInputStats();
        if (saveTextValues({ type: "set-input", sensitive: false })) {
          setStatus("序列已生成到原文", false);
          toast("序列生成完成");
        }
      } else {
        if (setOutput(result.value, "序列已生成到结果")) {
          toast("序列生成完成");
        }
      }
    }

    const sequenceFields = {
      sequence_start: settings.sequence.start,
      sequence_end: settings.sequence.end,
      sequence_width: settings.sequence.width,
      sequence_count: settings.sequence.count === null ? "" : settings.sequence.count,
      sequence_radix: settings.sequence.radix,
      sequence_order: settings.sequence.order,
      sequence_separator_mode: settings.sequence.separatorMode,
      sequence_separator_custom: settings.sequence.separator
    };
    Object.entries(sequenceFields).forEach(([id, value]) => {
      doc.getElementById(id).value = value;
    });
    const separatorMode = doc.getElementById("sequence_separator_mode");
    const customSeparatorField = doc.getElementById("sequence_separator_custom_field");
    const customSeparator = doc.getElementById("sequence_separator_custom");
    function updateCustomSeparator() {
      const isCustom = separatorMode.value === "custom";
      customSeparatorField.hidden = !isCustom;
      customSeparator.disabled = !isCustom;
    }
    separatorMode.addEventListener("change", updateCustomSeparator);
    doc.getElementById("sequence_to_output").addEventListener("click", () => generateSequence(output));
    doc.getElementById("sequence_to_input").addEventListener("click", () => generateSequence(input));
    updateCustomSeparator();

    function revokeUrl(property) {
      if (fileState[property]) {
        host.URL.revokeObjectURL(fileState[property]);
        fileState[property] = "";
      }
    }

    function updateFileInfo() {
      const info = doc.getElementById("base64_file_info");
      info.textContent = fileState.bytes
        ? `${fileState.name || "内存数据"} · ${fileState.size} 字节 · ${fileState.mimeType || "application/octet-stream"}`
        : "尚未选择文件";
    }

    function assignBytes(bytes, metadata) {
      revokeUrl("downloadUrl");
      revokeUrl("previewUrl");
      fileState.bytes = bytes;
      fileState.name = metadata.name || "";
      fileState.size = bytes.length;
      fileState.mimeType = metadata.mimeType || "application/octet-stream";
      doc.getElementById("base64_mime").value = fileState.mimeType;
      if (metadata.name) doc.getElementById("base64_download_name").value = metadata.name;
      doc.getElementById("base64_preview_area").hidden = true;
      updateFileInfo();
    }

    const fileRequests = createFileRequestController();

    async function loadFile(file) {
      if (!file) return;
      const result = await readFileRequest(file, fileRequests, MAX_FILE_BYTES);
      if (result.cancelled) return;
      if (!result.ok) {
        setStatus(result.message, true);
        return;
      }
      assignBytes(result.bytes, {
        name: result.name,
        mimeType: result.mimeType
      });
      setStatus("文件已读入内存", false);
    }

    const fileInput = doc.getElementById("base64_file_input");
    const dropZone = doc.getElementById("base64_drop_zone");
    const base64OutputMode = doc.getElementById("base64_output_mode");
    const base64Variant = doc.getElementById("base64_variant");
    base64OutputMode.addEventListener("change", () => {
      syncBase64Variant(base64OutputMode, base64Variant);
    });
    syncBase64Variant(base64OutputMode, base64Variant);
    fileInput.addEventListener("change", () => loadFile(fileInput.files && fileInput.files[0]));
    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fileInput.click();
      }
    });
    ["dragenter", "dragover"].forEach((name) => {
      dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        dropZone.classList.add("is-dragging");
      });
    });
    ["dragleave", "drop"].forEach((name) => {
      dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        dropZone.classList.remove("is-dragging");
      });
    });
    dropZone.addEventListener("drop", (event) => {
      loadFile(event.dataTransfer && event.dataTransfer.files[0]);
    });

    doc.getElementById("base64_encode_file").addEventListener("click", () => {
      if (!fileState.bytes) {
        setStatus("请先选择或拖放文件", true);
        return;
      }
      const codecs = host.TextCodecs;
      if (!codecs) {
        setStatus("文本编码模块未加载", true);
        return;
      }
      const outputMode = base64OutputMode.value;
      const variant = base64Variant.value;
      const mimeType = doc.getElementById("base64_mime").value;
      const downloadName = safeDownloadName(
        doc.getElementById("base64_download_name").value,
        fileState.name || "decoded.bin"
      );
      let result;
      if (outputMode === "data-url") {
        result = codecs.buildDataUrl(fileState.bytes, mimeType, {
          parameters: { name: downloadName }
        });
      } else {
        result = codecs.bytesToBase64(fileState.bytes);
        if (result.ok && variant === "url") result = codecs.toBase64Url(result.value);
      }
      if (!result.ok) {
        setStatus(result.message || "文件编码失败", true);
        return;
      }
      const persisted = setOutput(
        result.value,
        outputMode === "data-url" ? "Data URL 已生成" : "Base64 已生成",
        { sensitive: true }
      );
      if (persisted) toast("文件编码完成");
    });

    doc.getElementById("base64_decode_input").addEventListener("click", () => {
      fileRequests.cancel();
      const codecs = host.TextCodecs;
      if (!codecs) {
        setStatus("文本编码模块未加载", true);
        return;
      }
      const source = normalizeBase64SourceWhitespace(input.value);
      if (!source) {
        setStatus("请先在原文中输入 Base64 或 Data URL", true);
        return;
      }
      if (!markInputSensitive()) return;
      const sizeCheck = validateBase64DecodeSize(source, MAX_FILE_BYTES);
      if (!sizeCheck.ok) {
        setStatus(sizeCheck.message, true);
        return;
      }
      let result;
      let mimeType = doc.getElementById("base64_mime").value || "application/octet-stream";
      let downloadName = safeDownloadName(
        doc.getElementById("base64_download_name").value,
        "decoded.bin"
      );
      if (/^data:/i.test(source)) {
        result = codecs.parseDataUrl(source);
        if (result.ok) {
          mimeType = result.value.mimeType;
          downloadName = safeDownloadName(result.value.parameters.name, downloadName);
          result = { ok: true, value: result.value.bytes, message: "" };
        }
      } else {
        let normalized = { ok: true, value: source, message: "" };
        if (base64Variant.value === "url") {
          normalized = codecs.fromBase64Url(source);
        }
        result = normalized.ok ? codecs.base64ToBytes(normalized.value) : normalized;
      }
      if (!result.ok) {
        setStatus(result.message || "Base64 解码失败，请检查输入", true);
        return;
      }
      if (result.value.length > MAX_FILE_BYTES) {
        setStatus("Base64 解码结果不能超过 16 MiB", true);
        return;
      }
      assignBytes(result.value, {
        name: downloadName,
        mimeType
      });
      if (saveTextValues({ type: "set-input", sensitive: true })) {
        setStatus("Base64 已解码到内存", false);
        toast("Base64 解码完成");
      }
    });

    doc.getElementById("base64_preview").addEventListener("click", () => {
      if (!fileState.bytes) {
        setStatus("暂无可预览的文件", true);
        return;
      }
      const mimeType = doc.getElementById("base64_mime").value || fileState.mimeType;
      if (!/^image\//i.test(mimeType)) {
        setStatus("当前 MIME 不是图片类型", true);
        return;
      }
      revokeUrl("previewUrl");
      fileState.previewUrl = host.URL.createObjectURL(new Blob([fileState.bytes], {
        type: mimeType
      }));
      doc.getElementById("base64_preview_image").src = fileState.previewUrl;
      doc.getElementById("base64_preview_area").hidden = false;
      setStatus("图片预览已更新", false);
    });

    doc.getElementById("base64_download").addEventListener("click", () => {
      if (!fileState.bytes) {
        setStatus("暂无可下载的文件", true);
        return;
      }
      revokeUrl("downloadUrl");
      fileState.downloadUrl = host.URL.createObjectURL(new Blob([fileState.bytes], {
        type: doc.getElementById("base64_mime").value || fileState.mimeType
      }));
      const link = doc.createElement("a");
      link.href = fileState.downloadUrl;
      link.download = doc.getElementById("base64_download_name").value || fileState.name || "decoded.bin";
      doc.body.appendChild(link);
      link.click();
      link.remove();
      setStatus("下载已开始", false);
    });

    doc.getElementById("base64_clear").addEventListener("click", () => {
      fileRequests.cancel();
      textPersistence.cancel();
      revokeUrl("downloadUrl");
      revokeUrl("previewUrl");
      Object.assign(fileState, createFileState());
      fileInput.value = "";
      dropZone.classList.remove("is-dragging");
      doc.getElementById("base64_preview_image").removeAttribute("src");
      doc.getElementById("base64_preview_area").hidden = true;
      doc.getElementById("base64_mime").value = "application/octet-stream";
      doc.getElementById("base64_download_name").value = "decoded.bin";
      const cleared = clearSensitiveTextAndPersist(
        storage,
        settings,
        textOrigins,
        input.value,
        output.value
      );
      input.value = cleared.input;
      output.value = cleared.output;
      updateStats();
      updateFileInfo();
      if (cleared.storageOk) {
        setStatus("Base64 文件状态已清空", false);
      } else {
        handleStorageCleanupFailure();
      }
    });

    host.addEventListener("beforeunload", () => {
      try {
        if (settings.saveText) textPersistence.flush();
      } catch (_error) {
        handleRuntimePersistenceFailure();
      }
      revokeUrl("downloadUrl");
      revokeUrl("previewUrl");
    });

    updateStats();
    updateFileInfo();
  }

  return Object.freeze({
    SETTINGS_KEY,
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    MAX_FILE_BYTES,
    MAX_BASE64_ENCODED_CHARS,
    MAX_STATS_CHARACTERS,
    PERSISTENCE_DELAY_MS,
    TEXT_DIRECT_ACTIONS,
    TEXT_TOOL_GROUPS,
    DEFAULT_SETTINGS,
    sanitizeSettings,
    getStorage,
    safeSet,
    safeRemove,
    saveSettings,
    persistText,
    persistTextTransition,
    tryEnableTextSaving,
    textSavingEnableFailureMessage,
    disableTextSaving,
    handlePersistenceFailure,
    clearPersistedText,
    createTextOriginState,
    applyTransferOriginTransition,
    createTransformOutputTransition,
    clearSensitiveText,
    clearSensitiveTextAndPersist,
    clearTextSideAndPersist,
    loadState,
    createFileState,
    isPotentialBase64Payload,
    calculateTextStats,
    forceSensitiveInput,
    handleInputPersistence,
    normalizeBase64SourceWhitespace,
    validateBase64DecodeSize,
    createFileRequestController,
    readFileRequest,
    createPersistenceScheduler,
    safeDownloadName,
    copyTextSafely,
    buildSequenceRequest,
    syncBase64Variant,
    setOutput(value, message) {
      if (typeof outputBridge === "function") {
        return outputBridge(value, message) !== false;
      }
      return false;
    },
    init
  });
});
