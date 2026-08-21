const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseHTML } = require('linkedom');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'TextFormatterTool.html');
const controllerPath = path.join(root, 'text-formatter.js');
const cssPath = path.join(root, 'shared-ui.css');

function readSourceText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssRule(source, selector) {
  const match = source.match(
    new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 's')
  );
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
}

function cssMediaBlock(source, maxWidth) {
  const marker = new RegExp(`@media\\s*\\(max-width:\\s*${maxWidth}px\\)\\s*\\{`);
  const match = marker.exec(source);
  assert.ok(match, `missing max-width ${maxWidth}px media query`);
  const openingBrace = source.indexOf('{', match.index);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(match.index, index + 1);
  }
  assert.fail(`unclosed max-width ${maxWidth}px media query`);
}

const CORE_ACTIONS = [
  'removeEmptyLines', 'removeSpaces', 'trimLines', 'collapseSpaces',
  'removeAllLineBreaks', 'removeInterruptedBreaks', 'dedupeLines', 'sortLines',
  'addLineNumbers', 'removeLineNumbers', 'upperCase', 'lowerCase',
  'pascalCase', 'camelCase', 'snakeCase', 'kebabCase', 'spaceCase',
  'urlEncode', 'urlDecode', 'base64Encode', 'base64Decode',
  'jsonFormat', 'jsonMinify', 'verticalLayout', 'horizontalLayout',
  'hexFormat1Byte', 'hexFormat4Byte', 'hexFormat4ByteLe',
  'hexFormat8Byte', 'hexFormat8ByteLe', 'hexReverse',
  'removeAllWhitespace', 'removeControlCharacters', 'normalizeLineBreaks',
  'collapseBlankLines', 'fullWidthToHalfWidth', 'halfWidthToFullWidth',
  'chinesePunctuationToEnglish', 'englishPunctuationToChinese',
  'reverseLines', 'shuffleLines', 'filterLines', 'prefixLines', 'suffixLines',
  'quoteLines', 'splitByDelimiter', 'joinByDelimiter', 'constantCase',
  'dotCase', 'titleCase', 'sentenceCase', 'capitalizeWords', 'invertCase'
];

const CODEC_CAPABILITIES = [
  'encodeUtf8Base64', 'decodeUtf8Base64', 'bytesToBase64', 'base64ToBytes',
  'toBase64Url', 'fromBase64Url', 'parseDataUrl', 'buildDataUrl',
  'encodeUrlComponent', 'decodeUrlComponent', 'encodeFullUrl', 'decodeFullUrl',
  'parseQuery', 'buildQuery', 'encodeHtmlEntities', 'decodeHtmlEntities',
  'escapeUnicode', 'unescapeUnicode', 'formatJson', 'minifyJson',
  'validateJson', 'sortJsonKeys', 'escapeJsonString', 'unescapeJsonString',
  'jsonToJavaScriptObjectText', 'yamlToJson', 'jsonToYaml', 'convertDelimited',
  'queryToJson', 'jsonToQuery', 'markdownToHtml', 'htmlToMarkdown',
  'formatXml', 'minifyXml', 'convertStructured', 'normalizeHex', 'groupHex',
  'reverseHexBytes', 'utf8ToHex', 'hexToUtf8', 'hexToBinary', 'binaryToHex',
  'hexToDecimal', 'decimalToHex', 'toCByteArray', 'toJavaScriptByteArray'
];

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    calls,
    getItem(key) {
      calls.push(['getItem', key]);
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      calls.push(['setItem', key, String(value)]);
      values.set(key, String(value));
    },
    removeItem(key) {
      calls.push(['removeItem', key]);
      values.delete(key);
    },
    value(key) {
      return values.get(key);
    },
    has(key) {
      return values.has(key);
    }
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function enableSelectValueAssignment(window) {
  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    'value'
  );
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set(value) {
      const expected = String(value);
      for (const option of this.options) {
        option.selected = false;
      }
      const match = Array.from(this.options).find((option) => option.value === expected);
      if (match) match.selected = true;
    }
  });
}

function enableActiveElementTracking(window) {
  let activeElement = null;
  Object.defineProperty(window.document, 'activeElement', {
    configurable: true,
    get() {
      return activeElement;
    }
  });
  return (element, onFocus = () => {}) => {
    const nativeFocus = element.focus;
    element.focus = function focusTrackedElement() {
      activeElement = this;
      onFocus();
      if (nativeFocus) nativeFocus.call(this);
    };
  };
}

function createInitializedTextFormatterWindow() {
  const TextFormatterUI = require(controllerPath);
  const { window } = parseHTML(readSourceText(htmlPath));
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createStorage()
  });
  window.toolboxToast = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  enableSelectValueAssignment(window);
  const trackFocus = enableActiveElementTracking(window);
  TextFormatterUI.init(window);
  return { window, trackFocus };
}

function openTextFormatterGroup(window, group) {
  group.open = true;
  group.dispatchEvent(new window.Event('toggle'));
}

function dispatchEscape(window) {
  const escape = new window.Event('keydown');
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  window.document.dispatchEvent(escape);
}

test('normalizes temporary CRLF source copies before regex assertions', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'text-formatter-crlf-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const sourceCopies = [
    ['fixture.html', '<main>\r\n  <script src="tool.js"></script>\r\n</main>\r\n'],
    ['fixture.js', 'function first() {\r\n  return true;\r\n}\r\n\r\nfunction second() {}\r\n'],
    ['fixture.css', '.fixture {\r\n  border: 0;\r\n}\r\n']
  ];

  for (const [fileName, content] of sourceCopies) {
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, content);
    assert.equal(readSourceText(filePath), content.replace(/\r\n/g, '\n'));
  }
});

test('loads local libraries and controllers in dependency order without inline handlers', () => {
  const html = readSourceText(htmlPath);
  const scripts = [
    'shared-ui.js',
    'vendor/marked/marked.umd.js',
    'vendor/turndown/turndown.umd.js',
    'vendor/js-yaml/js-yaml.min.js',
    'vendor/papaparse/papaparse.min.js',
    'vendor/he/he.js',
    'vendor/sax/sax.js',
    'text-formatter-core.js',
    'text-codecs.js',
    'text-generators.js',
    'markdown-table.js',
    'text-formatter.js',
    'markdown-table-ui.js'
  ];
  let previous = -1;
  for (const script of scripts) {
    const index = html.indexOf(`src="${script}"`);
    assert.ok(index > previous, `${script} should load in dependency order`);
    assert.equal(
      fs.existsSync(path.join(root, script)),
      true,
      `${script} should be committed for GitHub Pages root publishing`
    );
    previous = index;
  }

  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /\son(?:click|change|input|drop|dragover)=/i);
  assert.doesNotMatch(html, /data-tip|textconvert_processText|localStorage/);
  assert.doesNotMatch(html, /https?:\/\/[^"' ]+\.js/i);
});

test('defines seven configured accordion groups with described actions and panels', () => {
  const controller = require(controllerPath);
  const { TEXT_TOOL_GROUPS } = controller;
  assert.equal(typeof controller.setOutput, 'function');
  assert.deepEqual(
    TEXT_TOOL_GROUPS.map(({ id, name }) => [id, name]),
    [
      ['clean', '文本清理'],
      ['lines', '行与列表'],
      ['case', '大小写与命名'],
      ['encode', '编码与转义'],
      ['data', '数据格式化'],
      ['hex', 'Hex与字节'],
      ['generate', '生成器']
    ]
  );

  const ids = new Set();
  for (const group of TEXT_TOOL_GROUPS) {
    assert.ok(group.actions.length > 0, `${group.id} should contain actions`);
    for (const action of group.actions) {
      assert.equal(typeof action.id, 'string');
      assert.ok(action.id);
      assert.equal(typeof action.label, 'string');
      assert.ok(action.label);
      assert.equal(typeof action.description, 'string');
      assert.ok(action.description);
      assert.equal(typeof action.panel, 'string');
      assert.equal(ids.has(action.id), false, `${action.id} should be unique`);
      ids.add(action.id);
    }
  }
});

test('maps every core transform and codec capability to a reachable action', () => {
  const { TEXT_TOOL_GROUPS } = require(controllerPath);
  const actions = TEXT_TOOL_GROUPS.flatMap((group) => group.actions);
  const reachable = new Set();
  for (const action of actions) {
    if (action.method) reachable.add(action.method);
    for (const capability of action.capabilities || []) reachable.add(capability);
  }

  for (const id of CORE_ACTIONS) {
    assert.equal(reachable.has(id), true, `missing core action ${id}`);
  }
  for (const id of CODEC_CAPABILITIES) {
    assert.equal(reachable.has(id), true, `missing codec capability ${id}`);
  }
  assert.equal(reachable.has('generateSequence'), true);
  assert.equal(reachable.has('MarkdownTable'), true);
});

test('renders a one-border menu with persistent descriptions and accessible controls', () => {
  const html = readSourceText(htmlPath);
  const css = readSourceText(cssPath);
  const controller = readSourceText(controllerPath);

  assert.match(html, /id="text_tool_groups"/);
  assert.match(controller, /createElement\(["']details["']\)/);
  assert.match(controller, /className\s*=\s*["']tc-menu["']/);
  assert.match(controller, /className\s*=\s*["']tc-menu-item["']/);
  assert.match(controller, /className\s*=\s*["']tc-menu-label["']/);
  assert.match(controller, /className\s*=\s*["']tc-menu-desc["']/);
  assert.match(controller, /button\.type\s*=\s*["']button["']/);
  assert.match(controller, /event\.key\s*===\s*["']Escape["']/);
  assert.match(css, /#textconvert-ui\s+\.tc-menu\s*\{[^}]*border:/s);
  assert.match(css, /#textconvert-ui\s+\.tc-menu-item\s*\{[^}]*border:\s*0/s);
  assert.doesNotMatch(css, /\[data-tip\][^{]*::after/);

  const selectAction = controller.match(
    /function selectAction\(actionItem\) \{([\s\S]*?)\n    \}\n\n    TEXT_TOOL_GROUPS/
  );
  assert.ok(selectAction);
  assert.match(selectAction[1], /closeGroups\(null\)/);
});

test('styles category summaries as explicit accessible dropdown controls', () => {
  const css = readSourceText(cssPath);
  const summary = cssRule(css, '#textconvert-ui .tc-group-summary');
  const marker = cssRule(
    css,
    '#textconvert-ui .tc-group-summary::-webkit-details-marker'
  );
  const arrow = cssRule(css, '#textconvert-ui .tc-group-summary::after');
  const openSummary = cssRule(
    css,
    '#textconvert-ui .tc-group[open] > .tc-group-summary'
  );
  const openArrow = cssRule(
    css,
    '#textconvert-ui .tc-group[open] > .tc-group-summary::after'
  );
  const hover = cssRule(css, '#textconvert-ui .tc-group-summary:hover');
  const focus = cssRule(css, '#textconvert-ui .tc-group-summary:focus-visible');

  assert.match(summary, /list-style:\s*none/);
  assert.match(summary, /display:\s*grid/);
  assert.match(
    summary,
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+\d+px/
  );
  assert.match(summary, /background:\s*rgba\(255,\s*255,\s*255,\s*0\.\d+\)/);
  assert.match(summary, /border:\s*1px\s+solid/);
  assert.match(summary, /border-radius:\s*[5-7]px/);
  assert.match(summary, /letter-spacing:\s*0/);
  assert.match(marker, /display:\s*none/);
  assert.match(arrow, /content:\s*""/);
  assert.match(arrow, /border-(?:right|bottom):\s*2px\s+solid/);
  assert.match(arrow, /transform:\s*rotate\([^)]+\)/);
  assert.match(arrow, /transition:\s*transform/);
  assert.match(openSummary, /background:\s*var\(--primary-soft\)/);
  assert.match(openSummary, /border-color:\s*var\(--primary\)/);
  assert.match(openArrow, /transform:\s*rotate\([^)]+\)/);
  assert.notEqual(
    arrow.match(/transform:\s*([^;]+)/)?.[1],
    openArrow.match(/transform:\s*([^;]+)/)?.[1]
  );
  assert.match(hover, /border-color:/);
  assert.match(hover, /background:/);
  assert.match(focus, /outline:\s*2px\s+solid/);
  assert.match(focus, /outline-offset:/);
});

test('overlays category menus with viewport-aware internal scrolling', () => {
  const html = readSourceText(htmlPath);
  const css = readSourceText(cssPath);
  const controller = readSourceText(controllerPath);
  const groups = cssRule(css, '#textconvert-ui .tc-groups');
  const menu = cssRule(css, '#textconvert-ui .tc-menu');
  const upMenu = cssRule(css, '#textconvert-ui .tc-menu.tc-menu-up');

  assert.match(groups, /overflow:\s*visible/);
  assert.match(menu, /max-height:\s*\d+px/);
  assert.match(menu, /overflow-y:\s*auto/);
  assert.match(menu, /position:\s*absolute/);
  assert.match(menu, /z-index:\s*\d+/);
  assert.match(upMenu, /bottom:\s*calc\(/);
  assert.doesNotMatch(groups, /position:\s*(?:absolute|fixed)/);
  assert.match(controller, /function positionGroupMenu\(details\)/);
  assert.match(controller, /spaceBelow\s*<\s*preferredHeight/);
  assert.match(controller, /classList\.toggle\("tc-menu-up",\s*openUp\)/);
  assert.match(controller, /function hidePanels\(\)/);

  assert.ok(
    html.indexOf('class="tc-text-workspace"') <
      html.indexOf('class="tc-operation-frame"')
  );
  assert.ok(
    html.indexOf('class="tc-operation-frame"') <
      html.indexOf('id="text_parameter_panels"')
  );
});

test('uses compact desktop sequence tracks without reserving hidden custom space', () => {
  const css = readSourceText(cssPath);
  const formatter = cssRule(css, '#textconvert-ui.textformatter-panel');
  const grid = cssRule(css, '#textconvert-ui .tc-sequence-grid');
  const customGrid = cssRule(
    css,
    '#textconvert-ui .tc-sequence-grid:has(.tc-sequence-field-custom:not([hidden]))'
  );
  const hidden = cssRule(css, '#textconvert-ui .tc-sequence-grid > [hidden]');
  const actions = cssRule(
    css,
    '#textconvert-ui .tc-parameter-panel[data-panel="sequence"] .tc-panel-actions'
  );

  assert.match(formatter, /letter-spacing:\s*0/);
  assert.doesNotMatch(css, /font-size:\s*[^;{}]*(?:vw|vmin|vmax)/);
  assert.match(grid, /grid-template-columns:/);
  assert.match(grid, /minmax\(\d+px,\s*1fr\)\s+minmax\(\d+px,\s*1fr\)/);
  assert.match(grid, /(?:58|59|60|61|62|63|64)px/);
  assert.match(grid, /(?:96|97|98|99|100|101|102|103|104|105|106|107|108)px/);
  assert.match(grid, /align-items:\s*end/);
  assert.match(customGrid, /grid-template-columns:/);
  assert.match(customGrid, /minmax\(\d+px,\s*(?:0\.\d+fr|1fr)\)\s*;/);
  assert.match(hidden, /display:\s*none\s*!important/);
  assert.match(actions, /display:\s*grid/);
  assert.match(
    actions,
    /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
  );
});

test('adapts category, sequence, and sequence action grids at narrow widths', () => {
  const css = readSourceText(cssPath);
  const at1024 = cssMediaBlock(css, 1024);
  const at640 = cssMediaBlock(css, 640);
  const at360 = cssMediaBlock(css, 360);

  for (const source of [at1024, at640]) {
    assert.match(
      cssRule(source, '#textconvert-ui .tc-sequence-grid'),
      /grid-template-columns:\s*repeat\((?:4|2),\s*minmax\(0,\s*1fr\)\)/
    );
  }
  assert.match(
    cssRule(at1024, '#textconvert-ui .tc-groups'),
    /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/
  );
  assert.match(
    cssRule(at640, '#textconvert-ui .tc-groups'),
    /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/
  );
  assert.match(
    cssRule(at360, '#textconvert-ui .tc-groups'),
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/
  );
  assert.match(
    cssRule(at360, '#textconvert-ui .tc-sequence-grid'),
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/
  );
  assert.match(
    cssRule(
      at360,
      '#textconvert-ui .tc-parameter-panel[data-panel="sequence"] .tc-panel-actions'
    ),
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/
  );
});

test('collapses outside groups only after the active click handler can finish', () => {
  const controller = readSourceText(controllerPath);
  const clickHandler = controller.match(
    /doc\.addEventListener\("click", \(event\) => \{([\s\S]*?)\n    \}\);/
  );

  assert.ok(clickHandler);
  assert.match(
    clickHandler[1],
    /if \(!groupsHost\.contains\(event\.target\)\) closeGroups\(null\)/
  );
  assert.doesNotMatch(
    controller,
    /doc\.addEventListener\("pointerdown"[\s\S]*?closeGroups\(null\)/
  );
});

test('persists only whitelisted settings and conditionally persisted text', () => {
  const {
    SETTINGS_KEY,
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    saveSettings,
    persistText
  } = require(controllerPath);
  const storage = createStorage();

  saveSettings(storage, {
    expandedGroupId: 'hex',
    hexMode: 'clean',
    saveText: true,
    sequence: {
      width: 4,
      radix: 16,
      order: 'desc',
      separatorMode: 'custom',
      start: 9,
      end: 1,
      count: 3,
      separator: '|'
    },
    input: 'secret',
    output: 'secret-result',
    fileBytes: new Uint8Array([1, 2, 3]),
    base64: 'AQID',
    fileName: 'secret.bin'
  });
  persistText(storage, { saveText: true }, 'kept input', 'kept output');

  assert.deepEqual(JSON.parse(storage.value(SETTINGS_KEY)), {
    expandedGroupId: 'hex',
    hexMode: 'clean',
    saveText: true,
    sequence: {
      width: 4,
      radix: 16,
      order: 'desc',
      separatorMode: 'custom',
      start: 9,
      end: 1,
      count: 3,
      separator: '|'
    }
  });
  assert.equal(storage.value(TEXT_INPUT_KEY), 'kept input');
  assert.equal(storage.value(TEXT_OUTPUT_KEY), 'kept output');
  assert.doesNotMatch(storage.value(SETTINGS_KEY), /secret|AQID|fileBytes|fileName|base64/);

  persistText(storage, { saveText: false }, 'discarded', 'discarded');
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
  assert.equal(storage.has(TEXT_OUTPUT_KEY), false);
});

test('uses DEFAULT_SETTINGS as the single sanitization fallback source', () => {
  const { DEFAULT_SETTINGS, sanitizeSettings } = require(controllerPath);
  const controller = readSourceText(controllerPath);
  const sanitizeBody = controller.match(
    /function sanitizeSettings\(candidate\) \{([\s\S]*?)\n  \}\n\n  function/
  );

  assert.deepEqual(sanitizeSettings(), {
    expandedGroupId: DEFAULT_SETTINGS.expandedGroupId,
    hexMode: DEFAULT_SETTINGS.hexMode,
    saveText: DEFAULT_SETTINGS.saveText,
    sequence: { ...DEFAULT_SETTINGS.sequence }
  });
  assert.ok(sanitizeBody);
  assert.match(sanitizeBody[1], /DEFAULT_SETTINGS/);
  assert.doesNotMatch(sanitizeBody[1], /:\s*"strict"|:\s*"newline"|:\s*50|:\s*1|:\s*","/);
});

test('sanitizes sequence radix and defaults legacy settings to decimal', () => {
  const { DEFAULT_SETTINGS, sanitizeSettings } = require(controllerPath);

  assert.equal(DEFAULT_SETTINGS.sequence.radix, 10);
  assert.equal(sanitizeSettings({ sequence: {} }).sequence.radix, 10);
  assert.equal(sanitizeSettings({ sequence: { radix: 10 } }).sequence.radix, 10);
  assert.equal(sanitizeSettings({ sequence: { radix: 16 } }).sequence.radix, 16);
  for (const radix of [2, 8, 36, '10', '16', null, false]) {
    assert.equal(
      sanitizeSettings({ sequence: { radix } }).sequence.radix,
      10,
      `unexpected sanitized radix for ${String(radix)}`
    );
  }
});

test('handles unavailable Storage getters and failed writes without enabling persistence', () => {
  const {
    SETTINGS_KEY,
    getStorage,
    safeSet,
    createTextOriginState,
    tryEnableTextSaving
  } = require(controllerPath);
  const host = {};
  Object.defineProperty(host, 'localStorage', {
    get() {
      throw new Error('denied');
    }
  });
  const throwingStorage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error('quota');
    },
    removeItem() {}
  };

  assert.equal(getStorage(host), null);
  assert.equal(safeSet(throwingStorage, SETTINGS_KEY, '{}'), false);
  const enabled = tryEnableTextSaving(
    throwingStorage,
    { saveText: false },
    'input',
    'output',
    createTextOriginState()
  );
  assert.equal(enabled.ok, false);
  assert.equal(enabled.settings.saveText, false);
  assert.equal(enabled.cleanupOk, false);

  const controller = readSourceText(controllerPath);
  assert.match(controller, /const storage = getStorage\(host\)/);
});

test('reports an incomplete rollback when enabling persistence writes only one text side', () => {
  const {
    SETTINGS_KEY,
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    createTextOriginState,
    tryEnableTextSaving,
    textSavingEnableFailureMessage
  } = require(controllerPath);
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (key === TEXT_OUTPUT_KEY) throw new Error('output quota');
      values.set(key, String(value));
    },
    removeItem(key) {
      if (key === TEXT_INPUT_KEY) throw new Error('input removal blocked');
      values.delete(key);
    }
  };

  const enabled = tryEnableTextSaving(
    storage,
    { saveText: false },
    'partially persisted input',
    'failed output',
    createTextOriginState()
  );

  assert.equal(enabled.ok, false);
  assert.equal(enabled.cleanupOk, false);
  assert.equal(enabled.settings.saveText, false);
  assert.equal(values.get(TEXT_INPUT_KEY), 'partially persisted input');
  assert.equal(values.has(TEXT_OUTPUT_KEY), false);
  assert.equal(JSON.parse(values.get(SETTINGS_KEY)).saveText, false);
  assert.equal(
    textSavingEnableFailureMessage(enabled),
    '保存启用失败，且部分本地记录无法清除，请清理浏览器站点数据'
  );
  assert.equal(
    textSavingEnableFailureMessage({ ok: false, cleanupOk: true }),
    '本地存储不可用，未启用文本保存'
  );
});

test('restores legacy text once in the current session before removing legacy keys', () => {
  const {
    SETTINGS_KEY,
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    loadState
  } = require(controllerPath);

  const defaultStorage = createStorage({
    textconvert_textInput: 'legacy input',
    textconvert_textOutput: 'legacy output'
  });
  const defaultState = loadState(defaultStorage);
  assert.equal(defaultState.settings.saveText, false);
  assert.equal(defaultState.input, 'legacy input');
  assert.equal(defaultState.output, 'legacy output');
  assert.equal(defaultStorage.has('textconvert_textInput'), false);
  assert.equal(defaultStorage.has('textconvert_textOutput'), false);
  assert.equal(defaultStorage.has(TEXT_INPUT_KEY), false);
  assert.equal(defaultStorage.has(TEXT_OUTPUT_KEY), false);

  const enabledStorage = createStorage({
    [SETTINGS_KEY]: JSON.stringify({
      expandedGroupId: '',
      hexMode: 'strict',
      saveText: true,
      sequence: { width: 0, order: 'range', separatorMode: 'newline' }
    }),
    textconvert_textInput: 'legacy input',
    textconvert_textOutput: 'legacy output'
  });
  const enabledState = loadState(enabledStorage);
  assert.equal(enabledState.input, 'legacy input');
  assert.equal(enabledState.output, 'legacy output');
  assert.equal(enabledStorage.value(TEXT_INPUT_KEY), 'legacy input');
  assert.equal(enabledStorage.value(TEXT_OUTPUT_KEY), 'legacy output');
  assert.equal(enabledStorage.has('textconvert_textInput'), false);
  assert.equal(enabledStorage.has('textconvert_textOutput'), false);
});

test('marks potential Base64 and Data URLs sensitive before decode attempts', () => {
  const {
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    createTextOriginState,
    isPotentialBase64Payload,
    persistText,
    persistTextTransition
  } = require(controllerPath);
  const storage = createStorage();
  const settings = { saveText: true };
  const origins = createTextOriginState();

  assert.equal(isPotentialBase64Payload('data:text/plain;base64,not-yet-valid'), true);
  assert.equal(isPotentialBase64Payload('AQID'), false);
  assert.equal(isPotentialBase64Payload('test'), false);
  assert.equal(isPotentialBase64Payload('code'), false);
  assert.equal(isPotentialBase64Payload('1234'), false);
  assert.equal(isPotentialBase64Payload('test/code/1234'), false);
  assert.equal(isPotentialBase64Payload('VGhpcyBpcyBhIHNlbnNpdGl2ZQ=='), true);
  assert.equal(isPotentialBase64Payload('VGhp cyBpcy BhIHNlbnNpdGl2ZQ=='), false);
  assert.equal(isPotentialBase64Payload(' VGhpcyBpcyBhIHNlbnNpdGl2ZQ== '), false);
  assert.equal(isPotentialBase64Payload('AAECAwQFBgcICQoLDA0ODw'), true);
  assert.equal(isPotentialBase64Payload('VGhpcyBpcy\r\nBhIHNlbnNpdGl2ZQ=='), true);
  assert.equal(isPotentialBase64Payload('VGhp\tcyBpcyBhIHNlbnNpdGl2ZQ=='), false);
  assert.equal(isPotentialBase64Payload('short'), false);
  assert.equal(isPotentialBase64Payload('ordinary text!'), false);
  assert.equal(isPotentialBase64Payload('ordinary browser text'), false);
  assert.equal(isPotentialBase64Payload('this is ordinary text'), false);
  assert.equal(isPotentialBase64Payload('ordinary\tbrowser\ttext'), false);
  assert.equal(isPotentialBase64Payload('VGhpcyBpcyBh===='), false);

  persistText(storage, settings, 'ordinary input', 'ordinary output', origins);
  const pasted = 'VGhpcyBpcyBhIHNlbnNpdGl2ZQ==';
  persistTextTransition(
    storage,
    settings,
    origins,
    {
      type: 'set-input',
      sensitive: isPotentialBase64Payload(pasted)
    },
    pasted,
    'ordinary output'
  );
  assert.equal(origins.inputSensitive, true);
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
  assert.equal(storage.value(TEXT_OUTPUT_KEY), 'ordinary output');

  // A failed decode does not create a success transition or re-persist the input.
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
});

test('routes input persistence through conservative sensitivity and debounce decisions', () => {
  const {
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    createTextOriginState,
    forceSensitiveInput,
    persistText,
    persistTextTransition,
    handleInputPersistence
  } = require(controllerPath);
  const storage = createStorage();
  const settings = { saveText: true };
  const origins = createTextOriginState();
  let scheduled = 0;
  let cancelled = 0;
  const persistence = {
    schedule() {
      scheduled += 1;
    },
    cancel() {
      cancelled += 1;
    }
  };

  persistText(storage, settings, 'previous input', 'ordinary output', origins);
  assert.deepEqual(
    handleInputPersistence(
      storage,
      settings,
      origins,
      'test',
      persistence
    ),
    { sensitive: false, storageOk: true }
  );
  assert.equal(scheduled, 1);
  assert.equal(cancelled, 0);
  assert.equal(origins.inputSensitive, false);
  persistText(storage, settings, 'test', 'ordinary output', origins);
  assert.equal(storage.value(TEXT_INPUT_KEY), 'test');

  for (const ordinary of [
    'ordinary browser text',
    'this is ordinary text',
    'ordinary\tbrowser\ttext'
  ]) {
    assert.deepEqual(
      handleInputPersistence(storage, settings, origins, ordinary, persistence),
      { sensitive: false, storageOk: true }
    );
    persistText(storage, settings, ordinary, 'ordinary output', origins);
    assert.equal(storage.value(TEXT_INPUT_KEY), ordinary);
  }

  const scheduledBeforeSensitive = scheduled;
  assert.deepEqual(
    handleInputPersistence(
      storage,
      settings,
      origins,
      'data:text/plain;base64,invalid',
      persistence
    ),
    { sensitive: true, storageOk: true }
  );
  assert.equal(scheduled, scheduledBeforeSensitive);
  assert.equal(cancelled, 1);
  assert.equal(origins.inputSensitive, true);
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
  assert.equal(storage.value(TEXT_OUTPUT_KEY), 'ordinary output');

  handleInputPersistence(storage, settings, origins, 'ordinary replacement!', persistence);
  persistText(storage, settings, 'AQID', 'ordinary output', origins);
  assert.equal(storage.value(TEXT_INPUT_KEY), 'AQID');
  assert.deepEqual(
    handleInputPersistence(storage, settings, origins, 'AQID', persistence, true),
    { sensitive: true, storageOk: true }
  );
  assert.equal(origins.inputSensitive, true);
  assert.equal(storage.has(TEXT_INPUT_KEY), false);

  persistTextTransition(
    storage,
    settings,
    origins,
    { type: 'set-input', sensitive: false },
    'AQID',
    'ordinary output'
  );
  assert.equal(storage.value(TEXT_INPUT_KEY), 'AQID');
  assert.equal(forceSensitiveInput(storage, settings, origins, persistence), true);
  assert.equal(origins.inputSensitive, true);
  assert.equal(storage.has(TEXT_INPUT_KEY), false);

  assert.deepEqual(
    handleInputPersistence(storage, settings, origins, 'AQ ID', persistence, true),
    { sensitive: true, storageOk: true }
  );
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
});

test('forces transferred input sensitive in the active Base64 panel', () => {
  const {
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    applyTransferOriginTransition,
    persistText
  } = require(controllerPath);
  const settings = { saveText: true };

  const useStorage = createStorage();
  const useOrigins = {
    inputSensitive: true,
    outputSensitive: false
  };
  applyTransferOriginTransition(useOrigins, 'use-output', true);
  assert.deepEqual(useOrigins, {
    inputSensitive: true,
    outputSensitive: false
  });
  persistText(useStorage, settings, 'AQID', 'AQID', useOrigins);
  assert.equal(useStorage.has(TEXT_INPUT_KEY), false);
  assert.equal(useStorage.value(TEXT_OUTPUT_KEY), 'AQID');

  const swapStorage = createStorage();
  const swapOrigins = {
    inputSensitive: true,
    outputSensitive: false
  };
  applyTransferOriginTransition(swapOrigins, 'swap', true);
  assert.deepEqual(swapOrigins, {
    inputSensitive: true,
    outputSensitive: true
  });
  persistText(swapStorage, settings, 'AQID', 'sensitive old input', swapOrigins);
  assert.equal(swapStorage.has(TEXT_INPUT_KEY), false);
  assert.equal(swapStorage.has(TEXT_OUTPUT_KEY), false);

  const controller = readSourceText(controllerPath);
  assert.match(
    controller,
    /applyTransferOriginTransition\(\s*textOrigins,\s*"use-output",\s*base64PanelActive/
  );
  assert.match(
    controller,
    /applyTransferOriginTransition\(\s*textOrigins,\s*"swap",\s*base64PanelActive/
  );
});

test('propagates sensitive Base64 origins through persistence transitions', () => {
  const {
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    createTextOriginState,
    persistText,
    persistTextTransition,
    clearSensitiveText
  } = require(controllerPath);
  const storage = createStorage();
  const settings = { saveText: true };
  const origins = createTextOriginState();

  persistText(storage, settings, 'ordinary input', 'ordinary output', origins);
  assert.equal(storage.value(TEXT_INPUT_KEY), 'ordinary input');
  assert.equal(storage.value(TEXT_OUTPUT_KEY), 'ordinary output');

  persistTextTransition(
    storage,
    settings,
    origins,
    { type: 'set-output', sensitive: true },
    'ordinary input',
    'c2Vuc2l0aXZl'
  );
  assert.equal(origins.outputSensitive, true);
  assert.equal(storage.value(TEXT_INPUT_KEY), 'ordinary input');
  assert.equal(storage.has(TEXT_OUTPUT_KEY), false);

  persistTextTransition(
    storage,
    settings,
    origins,
    { type: 'use-output' },
    'c2Vuc2l0aXZl',
    'c2Vuc2l0aXZl'
  );
  assert.equal(origins.inputSensitive, true);
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
  assert.equal(storage.has(TEXT_OUTPUT_KEY), false);

  persistTextTransition(
    storage,
    settings,
    origins,
    { type: 'swap' },
    'c2Vuc2l0aXZl',
    'c2Vuc2l0aXZl'
  );
  assert.equal(origins.inputSensitive, true);
  assert.equal(origins.outputSensitive, true);

  persistTextTransition(
    storage,
    settings,
    origins,
    { type: 'user-input' },
    'ordinary replacement',
    'c2Vuc2l0aXZl'
  );
  assert.equal(origins.inputSensitive, false);
  assert.equal(storage.value(TEXT_INPUT_KEY), 'ordinary replacement');
  assert.equal(storage.has(TEXT_OUTPUT_KEY), false);

  persistTextTransition(
    storage,
    settings,
    origins,
    { type: 'set-output', sensitive: false },
    'ordinary replacement',
    'ordinary transform'
  );
  assert.equal(origins.outputSensitive, false);
  assert.equal(storage.value(TEXT_OUTPUT_KEY), 'ordinary transform');

  persistTextTransition(
    storage,
    settings,
    origins,
    { type: 'set-input', sensitive: true },
    'data:application/octet-stream;base64,AQID',
    'ordinary transform'
  );
  persistTextTransition(
    storage,
    settings,
    origins,
    { type: 'set-output', sensitive: true },
    'data:application/octet-stream;base64,AQID',
    'AQID'
  );
  const cleared = clearSensitiveText(
    storage,
    origins,
    'data:application/octet-stream;base64,AQID',
    'AQID'
  );
  assert.deepEqual(cleared, { input: '', output: '', storageOk: true });
  assert.deepEqual(origins, { inputSensitive: false, outputSensitive: false });
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
  assert.equal(storage.has(TEXT_OUTPUT_KEY), false);
});

test('keeps successful transforms of sensitive input sensitive and leaves failures unchanged', () => {
  const {
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    createTextOriginState,
    createTransformOutputTransition,
    persistText,
    persistTextTransition,
    clearSensitiveText
  } = require(controllerPath);
  const storage = createStorage();
  const settings = { saveText: true };
  const origins = createTextOriginState();

  persistText(storage, settings, 'ordinary input', 'ordinary output', origins);
  persistTextTransition(
    storage,
    settings,
    origins,
    { type: 'set-input', sensitive: true },
    'AQID',
    'ordinary output'
  );
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
  assert.equal(storage.value(TEXT_OUTPUT_KEY), 'ordinary output');

  const beforeFailure = { ...origins };
  const failedTransition = createTransformOutputTransition(origins, {
    ok: false,
    value: '',
    message: '转换失败'
  });
  assert.equal(failedTransition, null);
  assert.deepEqual(origins, beforeFailure);
  assert.equal(storage.value(TEXT_OUTPUT_KEY), 'ordinary output');

  const successTransition = createTransformOutputTransition(origins, {
    ok: true,
    value: 'AQID',
    message: ''
  });
  assert.deepEqual(successTransition, {
    type: 'set-output',
    sensitive: true
  });
  persistTextTransition(
    storage,
    settings,
    origins,
    successTransition,
    'AQID',
    'AQID'
  );
  assert.deepEqual(origins, {
    inputSensitive: true,
    outputSensitive: true
  });
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
  assert.equal(storage.has(TEXT_OUTPUT_KEY), false);

  const cleared = clearSensitiveText(storage, origins, 'AQID', 'AQID');
  assert.deepEqual(cleared, { input: '', output: '', storageOk: true });
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
  assert.equal(storage.has(TEXT_OUTPUT_KEY), false);
});

test('clears sensitive Base64 text without recreating empty persisted keys', () => {
  const {
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    createTextOriginState,
    persistText,
    persistTextTransition,
    clearSensitiveTextAndPersist
  } = require(controllerPath);
  const settings = { saveText: true };
  const storage = createStorage();
  const origins = createTextOriginState();

  persistText(storage, settings, 'ordinary input', 'ordinary output', origins);
  persistTextTransition(
    storage,
    settings,
    origins,
    { type: 'set-input', sensitive: true },
    'VGhpcyBpcyBhIHNlbnNpdGl2ZQ==',
    'ordinary output'
  );
  persistTextTransition(
    storage,
    settings,
    origins,
    { type: 'set-output', sensitive: true },
    'VGhpcyBpcyBhIHNlbnNpdGl2ZQ==',
    'VGhpcyBpcyBhIHNlbnNpdGl2ZQ'
  );

  const cleared = clearSensitiveTextAndPersist(
    storage,
    settings,
    origins,
    'VGhpcyBpcyBhIHNlbnNpdGl2ZQ==',
    'VGhpcyBpcyBhIHNlbnNpdGl2ZQ'
  );
  assert.deepEqual(cleared, { input: '', output: '', storageOk: true });
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
  assert.equal(storage.has(TEXT_OUTPUT_KEY), false);

  const oneSideStorage = createStorage();
  const oneSideOrigins = createTextOriginState();
  persistText(oneSideStorage, settings, 'ordinary input', 'ordinary output', oneSideOrigins);
  persistTextTransition(
    oneSideStorage,
    settings,
    oneSideOrigins,
    { type: 'set-input', sensitive: true },
    'data:text/plain;base64,QQ==',
    'ordinary output'
  );
  clearSensitiveTextAndPersist(
    oneSideStorage,
    settings,
    oneSideOrigins,
    'data:text/plain;base64,QQ==',
    'ordinary output'
  );
  assert.equal(oneSideStorage.has(TEXT_INPUT_KEY), false);
  assert.equal(oneSideStorage.value(TEXT_OUTPUT_KEY), 'ordinary output');
});

test('persists the untouched side when clearing only input or output', () => {
  const {
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    createTextOriginState,
    clearTextSideAndPersist,
    persistText,
    persistTextTransition
  } = require(controllerPath);
  const settings = { saveText: true };

  const inputStorage = createStorage();
  const inputOrigins = createTextOriginState();
  persistText(inputStorage, settings, 'left', 'right', inputOrigins);
  persistTextTransition(
    inputStorage,
    settings,
    inputOrigins,
    { type: 'clear-input' },
    '',
    'right'
  );
  assert.equal(inputStorage.value(TEXT_INPUT_KEY), '');
  assert.equal(inputStorage.value(TEXT_OUTPUT_KEY), 'right');

  const outputStorage = createStorage();
  const outputOrigins = createTextOriginState();
  persistText(outputStorage, settings, 'left', 'right', outputOrigins);
  persistTextTransition(
    outputStorage,
    settings,
    outputOrigins,
    { type: 'clear-output' },
    'left',
    ''
  );
  assert.equal(outputStorage.value(TEXT_INPUT_KEY), 'left');
  assert.equal(outputStorage.value(TEXT_OUTPUT_KEY), '');

  const directInputStorage = createStorage();
  const directInputOrigins = createTextOriginState();
  persistText(directInputStorage, settings, 'left', 'right', directInputOrigins);
  assert.equal(
    clearTextSideAndPersist(
      directInputStorage,
      settings,
      directInputOrigins,
      'input',
      '',
      'right'
    ),
    true
  );
  assert.equal(directInputStorage.has(TEXT_INPUT_KEY), false);
  assert.equal(directInputStorage.value(TEXT_OUTPUT_KEY), 'right');

  const directOutputStorage = createStorage();
  const directOutputOrigins = createTextOriginState();
  persistText(directOutputStorage, settings, 'left', 'right', directOutputOrigins);
  assert.equal(
    clearTextSideAndPersist(
      directOutputStorage,
      settings,
      directOutputOrigins,
      'output',
      'left',
      ''
    ),
    true
  );
  assert.equal(directOutputStorage.value(TEXT_INPUT_KEY), 'left');
  assert.equal(directOutputStorage.has(TEXT_OUTPUT_KEY), false);
});

test('routes single-side clear buttons through scoped persistence transitions', () => {
  const controller = readSourceText(controllerPath);
  const inputHandler = controller.match(
    /getElementById\("text_clear_input"\)[\s\S]*?=> \{([\s\S]*?)\n    \}\);\n    doc\.getElementById\("text_clear_output"\)/
  );
  const outputHandler = controller.match(
    /getElementById\("text_clear_output"\)[\s\S]*?=> \{([\s\S]*?)\n    \}\);\n    doc\.getElementById\("text_clear_all"\)/
  );

  assert.ok(inputHandler);
  assert.match(inputHandler[1], /clearTextSideAndPersist/);
  assert.doesNotMatch(inputHandler[1], /clearPersistedText/);
  assert.ok(outputHandler);
  assert.match(outputHandler[1], /clearTextSideAndPersist/);
  assert.doesNotMatch(outputHandler[1], /clearPersistedText/);
});

test('propagates storage removal failures from sensitive and clear paths', () => {
  const {
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    createTextOriginState,
    safeRemove,
    clearPersistedText,
    clearSensitiveText,
    clearSensitiveTextAndPersist,
    clearTextSideAndPersist
  } = require(controllerPath);
  const values = new Map([
    [TEXT_INPUT_KEY, 'sensitive input'],
    [TEXT_OUTPUT_KEY, 'ordinary output']
  ]);
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem() {
      throw new Error('blocked');
    }
  };
  const settings = { saveText: true };
  const origins = {
    inputSensitive: true,
    outputSensitive: false
  };

  assert.equal(safeRemove(storage, TEXT_INPUT_KEY), false);
  assert.equal(clearPersistedText(storage), false);
  assert.deepEqual(
    clearSensitiveText(storage, origins, 'sensitive input', 'ordinary output'),
    { input: '', output: 'ordinary output', storageOk: false }
  );

  origins.inputSensitive = true;
  assert.deepEqual(
    clearSensitiveTextAndPersist(
      storage,
      settings,
      origins,
      'sensitive input',
      'ordinary output'
    ),
    { input: '', output: 'ordinary output', storageOk: false }
  );
  assert.equal(
    clearTextSideAndPersist(
      storage,
      settings,
      createTextOriginState(),
      'input',
      '',
      'ordinary output'
    ),
    false
  );
});

test('keeps Base64 file bytes in memory and clears every text storage key', () => {
  const {
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    createFileState,
    clearPersistedText
  } = require(controllerPath);
  const controller = readSourceText(controllerPath);
  const storage = createStorage({
    [TEXT_INPUT_KEY]: 'input',
    [TEXT_OUTPUT_KEY]: 'output',
    textconvert_textInput: 'legacy input',
    textconvert_textOutput: 'legacy output'
  });
  const fileState = createFileState();

  assert.deepEqual(fileState, {
    bytes: null,
    name: '',
    size: 0,
    mimeType: '',
    downloadUrl: '',
    previewUrl: ''
  });
  clearPersistedText(storage);
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
  assert.equal(storage.has(TEXT_OUTPUT_KEY), false);
  assert.equal(storage.has('textconvert_textInput'), false);
  assert.equal(storage.has('textconvert_textOutput'), false);

  assert.match(controller, /\.arrayBuffer\s*\(\s*\)/);
  assert.match(controller, /new Uint8Array\s*\(/);
  assert.match(controller, /URL\.createObjectURL/);
  assert.doesNotMatch(controller, /FileReader/);
  assert.doesNotMatch(controller, /setItem\([^,\n]*(?:file|base64|bytes|mime)/i);
});

test('accepts only the latest file read and cancels reads when cleared', async () => {
  const {
    createFileRequestController,
    readFileRequest
  } = require(controllerPath);
  const requests = createFileRequestController();
  const first = createDeferred();
  const second = createDeferred();
  const firstRead = readFileRequest({
    name: 'a.bin',
    size: 1,
    type: 'application/octet-stream',
    arrayBuffer: () => first.promise
  }, requests, 8);
  const secondRead = readFileRequest({
    name: 'b.bin',
    size: 1,
    type: 'application/octet-stream',
    arrayBuffer: () => second.promise
  }, requests, 8);

  second.resolve(Uint8Array.from([2]).buffer);
  const secondResult = await secondRead;
  first.resolve(Uint8Array.from([1]).buffer);
  const firstResult = await firstRead;
  assert.equal(secondResult.ok, true);
  assert.deepEqual(Array.from(secondResult.bytes), [2]);
  assert.equal(firstResult.cancelled, true);

  const duringClear = createDeferred();
  const clearingRead = readFileRequest({
    name: 'clear.bin',
    size: 1,
    type: 'application/octet-stream',
    arrayBuffer: () => duringClear.promise
  }, requests, 8);
  requests.cancel();
  duringClear.resolve(Uint8Array.from([3]).buffer);
  assert.equal((await clearingRead).cancelled, true);
});

test('cancels an in-flight file read before manual Base64 decode can assign bytes', async () => {
  const {
    createFileRequestController,
    readFileRequest
  } = require(controllerPath);
  const controller = readSourceText(controllerPath);
  const requests = createFileRequestController();
  const pending = createDeferred();
  const fileRead = readFileRequest({
    name: 'stale-file.bin',
    size: 1,
    type: 'application/octet-stream',
    arrayBuffer: () => pending.promise
  }, requests, 8);

  // This is the generation transition performed when manual decode starts.
  requests.cancel();
  const manualBytes = Uint8Array.from([9]);
  pending.resolve(Uint8Array.from([1]).buffer);

  assert.deepEqual(Array.from(manualBytes), [9]);
  assert.equal((await fileRead).cancelled, true);
  const decodeHandler = controller.match(
    /getElementById\("base64_decode_input"\)[\s\S]*?=> \{([\s\S]*?)\n    \}\);\n\n    doc\.getElementById\("base64_preview"\)/
  );
  assert.ok(decodeHandler);
  assert.ok(
    decodeHandler[1].indexOf('fileRequests.cancel()') <
      decodeHandler[1].indexOf('const source ='),
    'manual decode must cancel file reads before reading the source'
  );
});

test('rejects files and Base64 sources above the decoded byte limit', async () => {
  const {
    MAX_FILE_BYTES,
    MAX_BASE64_ENCODED_CHARS,
    createFileRequestController,
    readFileRequest,
    normalizeBase64SourceWhitespace,
    validateBase64DecodeSize
  } = require(controllerPath);
  let reads = 0;
  const oversized = await readFileRequest({
    name: 'large.bin',
    size: 9,
    type: 'application/octet-stream',
    arrayBuffer() {
      reads += 1;
      return Promise.resolve(new ArrayBuffer(9));
    }
  }, createFileRequestController(), 8);
  assert.equal(oversized.ok, false);
  assert.match(oversized.message, /文件不能超过/);
  assert.equal(reads, 0);

  const liedAboutSize = await readFileRequest({
    name: 'large-after-read.bin',
    size: 1,
    type: 'application/octet-stream',
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(9))
  }, createFileRequestController(), 8);
  assert.equal(liedAboutSize.ok, false);
  assert.match(liedAboutSize.message, /文件不能超过/);

  assert.equal(validateBase64DecodeSize('AAAA', 3).ok, true);
  assert.equal(validateBase64DecodeSize('AAAAAA', 3).ok, false);
  assert.equal(validateBase64DecodeSize('QUJD\nRA==', 4).ok, true);
  assert.equal(validateBase64DecodeSize('QUJD\nREU=', 4).ok, false);
  assert.equal(
    validateBase64DecodeSize('data:application/octet-stream;base64,AAAAAA', 3).ok,
    false
  );
  assert.equal(
    validateBase64DecodeSize(
      'data:application/octet-stream;base64,QUJD\r\nRA==',
      4
    ).ok,
    true
  );
  assert.equal(normalizeBase64SourceWhitespace('QUJD\r\nRA=='), 'QUJDRA==');
  assert.equal(
    normalizeBase64SourceWhitespace(
      'data:application/octet-stream;base64,QUJD\r\nRA=='
    ),
    'data:application/octet-stream;base64,QUJDRA=='
  );
  assert.equal(MAX_FILE_BYTES, 16 * 1024 * 1024);
  assert.equal(MAX_BASE64_ENCODED_CHARS, Math.ceil(MAX_FILE_BYTES / 3) * 4);

  const html = readSourceText(htmlPath);
  assert.match(html, /16\s*MiB/);
});

test('skips expensive line and UTF-8 statistics for all large text', () => {
  const {
    MAX_BASE64_ENCODED_CHARS,
    MAX_STATS_CHARACTERS,
    calculateTextStats
  } = require(controllerPath);
  let encodes = 0;
  const oversized = calculateTextStats('A'.repeat(20), 16, () => {
    encodes += 1;
    return 20;
  });
  assert.deepEqual(oversized, {
    characters: '16+',
    lines: '大文本暂略',
    bytes: '大文本暂略'
  });
  assert.equal(encodes, 0);
  assert.equal(MAX_STATS_CHARACTERS, 1024 * 1024);

  const maximumBase64 = 'A'.repeat(MAX_BASE64_ENCODED_CHARS);
  assert.deepEqual(calculateTextStats(maximumBase64, MAX_STATS_CHARACTERS, () => {
    encodes += 1;
    return maximumBase64.length;
  }), {
    characters: `${MAX_STATS_CHARACTERS}+`,
    lines: '大文本暂略',
    bytes: '大文本暂略'
  });
  assert.equal(encodes, 0);

  assert.deepEqual(calculateTextStats('普通\ntext', 16, () => 11), {
    characters: 7,
    lines: 2,
    bytes: 11
  });
  assert.deepEqual(calculateTextStats('A😀\n中', 16, () => 9), {
    characters: 4,
    lines: 2,
    bytes: 9
  });
});

test('debounces enabled persistence and performs no disabled storage work', () => {
  const {
    PERSISTENCE_DELAY_MS,
    createPersistenceScheduler
  } = require(controllerPath);
  const timers = [];
  let enabled = true;
  let writes = 0;
  const scheduler = createPersistenceScheduler({
    delay: PERSISTENCE_DELAY_MS,
    isEnabled: () => enabled,
    persist() {
      writes += 1;
      return true;
    },
    setTimer(callback, delay) {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) {
      timer.cancelled = true;
    }
  });

  scheduler.schedule();
  scheduler.schedule();
  assert.equal(writes, 0);
  assert.equal(timers[0].cancelled, true);
  assert.equal(timers[1].delay, 250);
  timers[1].callback();
  assert.equal(writes, 1);

  enabled = false;
  const timerCount = timers.length;
  scheduler.schedule();
  scheduler.flush();
  assert.equal(timers.length, timerCount);
  assert.equal(writes, 1);
});

test('routes debounce and immediate persistence failures through one shutdown handler', () => {
  const {
    SETTINGS_KEY,
    TEXT_INPUT_KEY,
    TEXT_OUTPUT_KEY,
    createPersistenceScheduler,
    handlePersistenceFailure
  } = require(controllerPath);
  const storage = createStorage({
    [TEXT_INPUT_KEY]: 'persisted input',
    [TEXT_OUTPUT_KEY]: 'persisted output'
  });
  const timers = [];
  let settings = {
    saveText: true,
    sequence: {}
  };
  const toggle = { checked: true };
  const statuses = [];
  let scheduler;
  const onFailure = () => {
    const failure = handlePersistenceFailure({
      storage,
      settings,
      persistence: scheduler,
      saveTextToggle: toggle,
      setStatus(message, isError) {
        statuses.push([message, isError]);
      }
    });
    settings = failure.settings;
  };
  scheduler = createPersistenceScheduler({
    isEnabled: () => settings.saveText,
    persist: () => false,
    onFailure,
    setTimer(callback) {
      const timer = { callback, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimer(timer) {
      timer.cancelled = true;
    }
  });

  scheduler.schedule();
  assert.doesNotThrow(() => timers[0].callback());
  assert.equal(settings.saveText, false);
  assert.equal(toggle.checked, false);
  assert.equal(storage.has(TEXT_INPUT_KEY), false);
  assert.equal(storage.has(TEXT_OUTPUT_KEY), false);
  assert.deepEqual(statuses.at(-1), ['本地保存失败，已关闭', true]);
  assert.equal(JSON.parse(storage.value(SETTINGS_KEY)).saveText, false);

  settings = { ...settings, saveText: true };
  toggle.checked = true;
  assert.equal(scheduler.flush(), false);
  assert.equal(settings.saveText, false);
  assert.equal(toggle.checked, false);
  assert.deepEqual(statuses.at(-1), ['本地保存失败，已关闭', true]);
});

test('reports cleanup failure when disabling persistence cannot update settings or remove text', () => {
  const {
    SETTINGS_KEY,
    TEXT_INPUT_KEY,
    disableTextSaving,
    handlePersistenceFailure
  } = require(controllerPath);
  const values = new Map([
    [SETTINGS_KEY, JSON.stringify({ saveText: true })],
    [TEXT_INPUT_KEY, 'still persisted']
  ]);
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem() {
      throw new Error('settings blocked');
    },
    removeItem() {
      throw new Error('records blocked');
    }
  };
  const disabled = disableTextSaving(storage, { saveText: true, sequence: {} });
  assert.equal(disabled.settings.saveText, false);
  assert.equal(disabled.ok, false);
  assert.equal(values.has(TEXT_INPUT_KEY), true);

  const toggle = { checked: true };
  const statuses = [];
  const failure = handlePersistenceFailure({
    storage,
    settings: { saveText: true, sequence: {} },
    saveTextToggle: toggle,
    setStatus(message, isError) {
      statuses.push([message, isError]);
    },
    cleanupFailure: true
  });
  assert.equal(failure.settings.saveText, false);
  assert.equal(failure.ok, false);
  assert.equal(toggle.checked, false);
  assert.deepEqual(
    statuses.at(-1),
    ['本地记录清除失败，请清理浏览器站点数据', true]
  );
});

test('catches persistence exceptions and does not throw during unload flushing', () => {
  const { createPersistenceScheduler } = require(controllerPath);
  let enabled = true;
  let failures = 0;
  const scheduler = createPersistenceScheduler({
    isEnabled: () => enabled,
    persist() {
      throw new Error('quota');
    },
    onFailure() {
      failures += 1;
      enabled = false;
    }
  });

  assert.doesNotThrow(() => scheduler.flush());
  assert.equal(failures, 1);
  assert.equal(scheduler.flush(), true);
});

test('updates only the edited statistics and flushes pending text on commands and unload', () => {
  const controller = readSourceText(controllerPath);
  const inputHandler = controller.match(
    /input\.addEventListener\("input", \(\) => \{([\s\S]*?)\n    \}\);/
  );
  const outputHandler = controller.match(
    /output\.addEventListener\("input", \(\) => \{([\s\S]*?)\n    \}\);/
  );
  assert.ok(inputHandler);
  assert.match(inputHandler[1], /updateInputStats\(\)/);
  assert.doesNotMatch(inputHandler[1], /updateOutputStats|updateStats/);
  assert.ok(outputHandler);
  assert.match(outputHandler[1], /updateOutputStats\(\)/);
  assert.doesNotMatch(outputHandler[1], /updateInputStats|updateStats/);
  assert.match(controller, /beforeunload[\s\S]*textPersistence\.flush\(\)/);
  assert.match(controller, /function handlePersistenceFailure\(options\)/);
  assert.match(controller, /onFailure:\s*handleRuntimePersistenceFailure/);
});

test('forces the input sensitive while the Base64 panel is active', () => {
  const controller = readSourceText(controllerPath);
  const showPanel = controller.match(
    /function showPanel\(actionItem\) \{([\s\S]*?)\n    \}\n\n    function libraries/
  );
  const inputHandler = controller.match(
    /input\.addEventListener\("input", \(\) => \{([\s\S]*?)\n    \}\);/
  );

  assert.ok(showPanel);
  assert.match(showPanel[1], /base64PanelActive\s*=\s*actionItem\.panel === "base64"/);
  assert.match(showPanel[1], /forceSensitiveInput/);
  assert.ok(inputHandler);
  assert.match(inputHandler[1], /base64PanelActive/);
});

test('validates Data URL download names and handles copy failures', async () => {
  const {
    safeDownloadName,
    copyTextSafely
  } = require(controllerPath);
  assert.equal(safeDownloadName('report 2026.png', 'decoded.bin'), 'report 2026.png');
  assert.equal(safeDownloadName('../secret.bin', 'decoded.bin'), 'decoded.bin');
  assert.equal(safeDownloadName('', 'decoded.bin'), 'decoded.bin');
  assert.equal(await copyTextSafely(async () => true, 'text', 'copied'), true);
  assert.equal(await copyTextSafely(async () => false, 'text', 'copied'), false);
  assert.equal(await copyTextSafely(async () => {
    throw new Error('denied');
  }, 'text', 'copied'), false);

  const controller = readSourceText(controllerPath);
  assert.match(controller, /buildDataUrl\([\s\S]*parameters:\s*\{\s*name:/);
  assert.match(controller, /parameters\.name/);
  assert.match(controller, /setStatus\("复制失败"/);
});

test('passes raw sequence numbers to TextGenerators before saving preferences', () => {
  const { buildSequenceRequest } = require(controllerPath);
  const TextGenerators = require(path.join(root, 'text-generators.js'));
  const request = buildSequenceRequest({
    start: '1',
    end: '3',
    width: '99',
    count: '',
    radix: '16',
    order: 'range',
    separatorMode: 'newline',
    separator: ','
  });

  assert.equal(request.options.width, 99);
  assert.equal(request.preference.width, 99);
  assert.equal(request.options.radix, 16);
  assert.equal(request.preference.radix, 16);
  assert.deepEqual(TextGenerators.generateSequence(request.options), {
    ok: false,
    value: '',
    message: '补零位数必须在 0 到 10 之间'
  });

  const controller = readSourceText(controllerPath);
  const generateSequence = controller.match(
    /function generateSequence\(target\) \{([\s\S]*?)\n    \}\n\n    const sequenceFields/
  );
  assert.ok(generateSequence);
  assert.ok(
    generateSequence[1].indexOf('if (!result.ok)') <
      generateSequence[1].indexOf('saveSettings(storage, settings)'),
    'sequence preferences should only be saved after generation succeeds'
  );
});

test('orders the text workspace before operation controls', () => {
  const html = readSourceText(htmlPath);
  const orderedMarkers = [
    '<header class="textformatter-header">',
    '<section class="tc-text-workspace"',
    '<div class="tc-workflow-bar">',
    '<section class="tc-operation-frame"',
    'id="text_parameter_panels"'
  ];
  let previous = -1;

  for (const marker of orderedMarkers) {
    const index = html.indexOf(marker);
    assert.ok(index > previous, `${marker} should follow the preceding main section`);
    previous = index;
  }
});

test('provides sequence fields in workflow order with decimal and hexadecimal radix', () => {
  const html = readSourceText(htmlPath);
  const panel = html.match(
    /<div class="tc-parameter-panel" data-panel="sequence" hidden>([\s\S]*?)\n      <\/div>\n\n      <div class="tc-parameter-panel/
  );
  assert.ok(panel);

  const fields = panel[1].match(
    /<div class="tc-option-grid tc-sequence-grid">([\s\S]*?)\n        <\/div>/
  );
  assert.ok(fields);
  assert.deepEqual(
    Array.from(fields[1].matchAll(/\sid="(sequence_[^"]+)"/g), (match) => match[1]),
    [
      'sequence_start',
      'sequence_end',
      'sequence_width',
      'sequence_count',
      'sequence_radix',
      'sequence_order',
      'sequence_separator_mode',
      'sequence_separator_custom_field',
      'sequence_separator_custom'
    ]
  );

  const radix = fields[1].match(/<select id="sequence_radix">([\s\S]*?)<\/select>/);
  assert.ok(radix);
  assert.match(radix[1], /<option value="10">十进制<\/option>/);
  assert.match(radix[1], /<option value="16">十六进制<\/option>/);
  assert.ok(
    radix[1].indexOf('<option value="10">十进制</option>') <
      radix[1].indexOf('<option value="16">十六进制</option>')
  );

  const actions = panel[1].match(/<div class="tc-panel-actions">([\s\S]*?)<\/div>/);
  assert.ok(actions);
  assert.deepEqual(
    Array.from(actions[1].matchAll(/\sid="([^"]+)"/g), (match) => match[1]),
    ['sequence_to_output', 'sequence_to_input']
  );
});

test('keeps the custom sequence separator hidden and disabled outside custom mode', () => {
  const html = readSourceText(htmlPath);
  const controller = readSourceText(controllerPath);
  const customField = html.match(
    /<label[^>]*id="sequence_separator_custom_field"[^>]*>[\s\S]*?<\/label>/
  );
  assert.ok(customField);
  assert.match(customField[0], /\shidden(?:\s|>)/);
  assert.match(
    customField[0],
    /<input[^>]*id="sequence_separator_custom"[^>]*\sdisabled(?:\s|>)/
  );

  const sequenceReader = controller.match(
    /function readSequenceRequest\(\) \{([\s\S]*?)\n    \}\n\n    function generateSequence/
  );
  assert.ok(sequenceReader);
  assert.match(sequenceReader[1], /radix:\s*doc\.getElementById\("sequence_radix"\)\.value/);
  assert.match(controller, /sequence_radix:\s*settings\.sequence\.radix/);
  assert.match(
    controller,
    /const customSeparatorField = doc\.getElementById\("sequence_separator_custom_field"\)/
  );

  const updateCustomSeparator = controller.match(
    /function updateCustomSeparator\(\) \{([\s\S]*?)\n    \}/
  );
  assert.ok(updateCustomSeparator);
  assert.match(
    updateCustomSeparator[1],
    /const isCustom = separatorMode\.value === "custom"/
  );
  assert.match(updateCustomSeparator[1], /customSeparatorField\.hidden = !isCustom/);
  assert.match(updateCustomSeparator[1], /customSeparator\.disabled = !isCustom/);
});

test('runs sequence settings, generation, and panel switching through the real DOM', () => {
  const TextFormatterUI = require(controllerPath);
  const storage = createStorage({
    [TextFormatterUI.SETTINGS_KEY]: JSON.stringify({
      expandedGroupId: '',
      hexMode: 'strict',
      saveText: false,
      sequence: {
        width: 0,
        order: 'range',
        separatorMode: 'newline',
        start: 1,
        end: 2,
        count: null,
        separator: ','
      }
    })
  });
  const { window } = parseHTML(readSourceText(htmlPath));
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage
  });
  window.TextGenerators = require(path.join(root, 'text-generators.js'));
  window.toolboxToast = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  enableSelectValueAssignment(window);

  TextFormatterUI.init(window);

  const document = window.document;
  const sequenceButton = document.querySelector('[data-action-id="generate-sequence"]');
  const sequencePanel = document.querySelector('[data-panel="sequence"]');
  const radix = document.getElementById('sequence_radix');
  assert.equal(radix.value, '10');
  assert.equal(
    sequenceButton.getAttribute('aria-label'),
    '序列生成：设置范围、位数、数量、进制、顺序和分隔符'
  );

  sequenceButton.click();
  assert.equal(sequencePanel.hidden, false);

  const separatorMode = document.getElementById('sequence_separator_mode');
  const customField = document.getElementById('sequence_separator_custom_field');
  const customSeparator = document.getElementById('sequence_separator_custom');
  separatorMode.value = 'custom';
  separatorMode.dispatchEvent(new window.Event('change'));
  assert.equal(customField.hidden, false);
  assert.equal(customSeparator.disabled, false);

  separatorMode.value = 'newline';
  separatorMode.dispatchEvent(new window.Event('change'));
  assert.equal(customField.hidden, true);
  assert.equal(customSeparator.disabled, true);

  document.getElementById('sequence_start').value = '10';
  document.getElementById('sequence_end').value = '12';
  radix.value = '16';
  document.getElementById('sequence_to_output').click();
  assert.equal(document.getElementById('textconvert_output').value, '0xA\n0xB\n0xC');

  document.getElementById('sequence_start').value = '15';
  document.getElementById('sequence_end').value = '16';
  document.getElementById('sequence_to_input').click();
  assert.equal(document.getElementById('textconvert_input').value, '0xF\n0x10');

  const lineGroup = document.querySelector('details.tc-group[data-group-id="lines"]');
  openTextFormatterGroup(window, lineGroup);
  assert.equal(sequencePanel.hidden, true);
  assert.equal(document.querySelector('[data-panel="line"]').hidden, true);

  document.querySelector('[data-action-id="core-dedupeLines"]').click();
  assert.equal(lineGroup.open, false);
  assert.equal(document.querySelector('[data-panel="line"]').hidden, false);
});

test('restores Escape focus only when focus was inside the open category', async (t) => {
  const { window, trackFocus } = createInitializedTextFormatterWindow();
  const document = window.document;
  const group = document.querySelector('details.tc-group[data-group-id="generate"]');
  const summary = group.querySelector('.tc-group-summary');
  const menuItem = group.querySelector('.tc-menu-item');
  const sequenceStart = document.getElementById('sequence_start');
  let focusCalls = 0;
  trackFocus(summary, () => {
    focusCalls += 1;
  });
  trackFocus(menuItem);
  trackFocus(sequenceStart);

  await t.test('menu item focus returns to its summary', () => {
    focusCalls = 0;
    openTextFormatterGroup(window, group);
    menuItem.focus();
    assert.equal(document.activeElement, menuItem);

    dispatchEscape(window);
    assert.equal(group.open, false);
    assert.equal(focusCalls, 1);
    assert.equal(document.activeElement, summary);
  });

  await t.test('sequence input focus stays outside the closed category', () => {
    focusCalls = 0;
    openTextFormatterGroup(window, group);
    group.querySelector('[data-action-id="generate-sequence"]').click();
    sequenceStart.focus();
    assert.equal(document.activeElement, sequenceStart);

    dispatchEscape(window);
    assert.equal(group.open, false);
    assert.equal(focusCalls, 0);
    assert.equal(document.activeElement, sequenceStart);
  });

  await t.test('no open category is safe and preserves focus', () => {
    focusCalls = 0;
    sequenceStart.focus();

    assert.doesNotThrow(() => dispatchEscape(window));
    assert.equal(document.querySelector('details.tc-group[open]'), null);
    assert.equal(focusCalls, 0);
    assert.equal(document.activeElement, sequenceStart);
  });
});

test('forces standard Base64 and disables variants for Data URL output', () => {
  const { syncBase64Variant } = require(controllerPath);
  const outputMode = { value: 'data-url' };
  const variant = { value: 'url', disabled: false };

  syncBase64Variant(outputMode, variant);
  assert.equal(variant.value, 'standard');
  assert.equal(variant.disabled, true);

  outputMode.value = 'plain';
  syncBase64Variant(outputMode, variant);
  assert.equal(variant.value, 'standard');
  assert.equal(variant.disabled, false);
});

test('provides text workflow, statistics, status, and Base64 file controls', () => {
  const html = readSourceText(htmlPath);
  assert.match(html, /<h3>文本处理工具 \(TextFormatter\)<\/h3>/);
  for (const id of [
    'textconvert_input', 'textconvert_output', 'text_input_stats',
    'text_output_stats', 'textformatter_status', 'text_copy_output',
    'text_use_output', 'text_swap', 'text_clear_all', 'text_save_text',
    'base64_file_input', 'base64_drop_zone', 'base64_file_info',
    'base64_output_mode', 'base64_variant', 'base64_mime',
    'base64_download_name', 'base64_encode_file', 'base64_decode_input',
    'base64_preview', 'base64_download', 'base64_clear'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(html, /id="textformatter_status"[^>]*role="status"/);
  assert.match(html, /id="base64_drop_zone"[^>]*tabindex="0"/);
  assert.match(html, /id="base64_file_input"[^>]*\shidden(?:\s|>)/);
  assert.match(html, />字符\s*<|字符/);
});

test('offers only supported numeric JSON indentation choices', () => {
  const html = readSourceText(htmlPath);
  const select = html.match(/<select id="structured_indent">([\s\S]*?)<\/select>/);
  assert.ok(select);
  assert.match(select[1], /value="2"/);
  assert.match(select[1], /value="4"/);
  assert.doesNotMatch(select[1], /value="tab"/);
});
