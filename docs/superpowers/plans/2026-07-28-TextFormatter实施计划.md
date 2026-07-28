# TextFormatter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 TextFormatter 重组为七类可维护功能，补充 Base64 文件、URL/Web、Markdown、结构化数据和 Hex 能力，并修复菜单与输入边界问题。

**Architecture:** 将纯转换逻辑拆到 CommonJS/浏览器双用的独立模块，通过统一 `{ok, value, message}` 结果返回；HTML 只保留结构，`text-formatter.js` 负责状态和 DOM。第三方解析库固定版本并由构建脚本复制到 `dist/vendor`。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node `node:test`、marked 18.0.7、turndown 7.2.4、js-yaml 5.2.2、Papa Parse 5.5.4。

---

### Task 1: 建立测试入口和依赖

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/text-formatter-core.test.js`

- [ ] **Step 1: 添加失败的模块加载测试**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

test("TextFormatterCore exposes a transform registry", () => {
  const core = require("../text-formatter-core.js");
  assert.equal(typeof core.runTransform, "function");
  assert.ok(core.TRANSFORMS.removeEmptyLines);
});
```

- [ ] **Step 2: 验证测试因模块不存在而失败**

Run: `node --test tests/text-formatter-core.test.js`

Expected: FAIL，错误包含 `Cannot find module '../text-formatter-core.js'`。

- [ ] **Step 3: 固定依赖并增加测试脚本**

Run:

```powershell
npm install marked@18.0.7 turndown@7.2.4 js-yaml@5.2.2 papaparse@5.5.4
```

在 `package.json` 的 `scripts` 中增加：

```json
"test": "node --test tests/*.test.js"
```

- [ ] **Step 4: 提交依赖和失败测试**

```powershell
git add package.json package-lock.json tests/text-formatter-core.test.js
git commit -m "test: add TextFormatter test harness"
```

### Task 2: 建立统一转换核心并回归现有功能

**Files:**
- Create: `text-formatter-core.js`
- Modify: `tests/text-formatter-core.test.js`

- [ ] **Step 1: 增加现有清洗和命名转换测试**

```js
test("existing cleaning and naming transforms remain compatible", () => {
  const core = require("../text-formatter-core.js");
  assert.equal(core.runTransform("removeEmptyLines", "a\n\nb").value, "a\nb");
  assert.equal(core.runTransform("trimLines", " a \n b ").value, "a\nb");
  assert.equal(core.runTransform("camelCase", "user name").value, "userName");
  assert.equal(core.runTransform("snakeCase", "UserName").value, "user_name");
});

test("unknown transforms return a friendly failure", () => {
  const core = require("../text-formatter-core.js");
  assert.deepEqual(core.runTransform("missing", "abc"), {
    ok: false,
    value: "",
    message: "不支持的文本处理操作"
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test`

Expected: FAIL，`runTransform` 或 `TRANSFORMS` 尚不存在。

- [ ] **Step 3: 实现双环境模块和统一结果**

模块包装：

```js
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TextFormatterCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const success = (value, message = "") => ({ ok: true, value, message });
  const failure = (message) => ({ ok: false, value: "", message });

  const TRANSFORMS = {
    removeEmptyLines: text => success(text.split(/\r?\n/).filter(line => line.trim()).join("\n")),
    trimLines: text => success(text.split(/\r?\n/).map(line => line.trim()).join("\n"))
  };

  function runTransform(id, input, options = {}) {
    const transform = TRANSFORMS[id];
    if (!transform) return failure("不支持的文本处理操作");
    try {
      return transform(String(input ?? ""), options);
    } catch (error) {
      return failure(error && error.message ? error.message : "处理失败");
    }
  }

  return { TRANSFORMS, runTransform, success, failure };
});
```

补齐现有 31 个转换，保持当前正常行为；同时修复横转竖不应把问号视为默认分隔符。

- [ ] **Step 4: 增加新增清理、行处理和命名测试**

覆盖：

```js
assert.equal(core.runTransform("removeAllWhitespace", "a b\nc\t").value, "abc");
assert.equal(core.runTransform("reverseLines", "a\nb\nc").value, "c\nb\na");
assert.equal(core.runTransform("dedupeLines", " A \na\nB", {
  ignoreCase: true,
  trimBeforeCompare: true
}).value, " A \nB");
assert.equal(core.runTransform("constantCase", "User Name").value, "USER_NAME");
assert.equal(core.runTransform("invertCase", "Ab中").value, "aB中");
```

- [ ] **Step 5: 实现新增纯文本转换并运行测试**

Run: `npm test`

Expected: PASS。

- [ ] **Step 6: 提交核心转换**

```powershell
git add text-formatter-core.js tests/text-formatter-core.test.js
git commit -m "feat: expand TextFormatter core transforms"
```

### Task 3: 实现编码、Web、结构化数据和 Hex

**Files:**
- Create: `text-codecs.js`
- Create: `tests/text-codecs.test.js`

- [ ] **Step 1: 增加 Base64、URL 和 Hex 失败测试**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const codecs = require("../text-codecs.js");

test("UTF-8 Base64 round trip", () => {
  const encoded = codecs.encodeUtf8Base64("中文🙂");
  assert.equal(codecs.decodeUtf8Base64(encoded.value).value, "中文🙂");
});

test("URL component and full URL use different semantics", () => {
  assert.equal(codecs.encodeUrlComponent("a&b").value, "a%26b");
  assert.equal(
    codecs.encodeFullUrl("https://a.test/a b?q=中文").value,
    "https://a.test/a%20b?q=%E4%B8%AD%E6%96%87"
  );
});

test("strict Hex rejects bad and incomplete input", () => {
  assert.equal(codecs.normalizeHex("0x12 GG", { mode: "strict" }).ok, false);
  assert.equal(codecs.groupHex("001122", 4, false, { mode: "clean" }).ok, false);
});
```

- [ ] **Step 2: 验证测试因模块不存在而失败**

Run: `node --test tests/text-codecs.test.js`

Expected: FAIL，错误包含 `Cannot find module '../text-codecs.js'`。

- [ ] **Step 3: 实现二进制安全 Base64 和 URL 工具**

公开接口：

```js
{
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
  unescapeUnicode
}
```

Node 测试使用 `Buffer`，浏览器使用 `Uint8Array`、`TextEncoder` 和 `TextDecoder`。非法 Base64、非法百分号编码和非法 Unicode 转义返回中文失败结果。

- [ ] **Step 4: 实现 JSON、YAML、CSV、Markdown 适配器**

适配器从参数接收第三方实现，避免测试依赖浏览器全局：

```js
function convertStructured(id, input, libraries = {}) {
  if (id === "jsonFormat") return formatJson(input);
  if (id === "yamlToJson") return yamlToJson(input, libraries.jsyaml);
  if (id === "csvToTsv") return convertDelimited(input, ",", "\t", libraries.Papa);
  if (id === "markdownToHtml") return markdownToHtml(input, libraries.marked);
  if (id === "htmlToMarkdown") return htmlToMarkdown(input, libraries.TurndownService);
  return failure("不支持的数据格式操作");
}
```

JSON 错误信息提取 `position` 并生成“JSON 格式错误，位置 N”。第三方库缺失时返回“对应解析库未加载”。

- [ ] **Step 5: 实现严格 Hex 和字节转换**

公开接口：

```js
{
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
}
```

`groupHex` 必须验证 `bytes.length % groupSize === 0`，不能丢弃尾部。

- [ ] **Step 6: 运行全部测试**

Run: `npm test`

Expected: PASS。

- [ ] **Step 7: 提交编码模块**

```powershell
git add text-codecs.js tests/text-codecs.test.js
git commit -m "feat: add TextFormatter codecs and format converters"
```

### Task 4: 实现可视化表格与 Markdown 双向转换

**Files:**
- Create: `markdown-table.js`
- Create: `tests/markdown-table.test.js`

- [ ] **Step 1: 增加 GFM 导入导出失败测试**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const table = require("../markdown-table.js");

test("GFM table round trip preserves cells, alignment and line breaks", () => {
  const model = table.parseGfmTable([
    "| 名称 | 说明 |",
    "| :--- | ---: |",
    "| A | 第一行<br>第二行 |"
  ].join("\n"));
  assert.equal(model.ok, true);
  assert.deepEqual(model.value.alignments, ["left", "right"]);
  assert.equal(model.value.cells[3].value, "第一行\n第二行");
  assert.match(table.toGfmTable(model.value).value, /第一行<br>第二行/);
});
```

- [ ] **Step 2: 增加合并单元格导出测试**

```js
test("GFM repeats merged content while HTML keeps spans", () => {
  const model = table.createTableModel(2, 2);
  model.cells[0].value = "合并";
  const merged = table.mergeCells(model, { startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 });
  assert.equal(merged.ok, true);
  assert.match(table.toGfmTable(merged.value).value, /\| 合并 \| 合并 \|/);
  assert.match(table.toHtmlTable(merged.value).value, /colspan="2"/);
});
```

- [ ] **Step 3: 运行测试并确认失败**

Run: `node --test tests/markdown-table.test.js`

Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现表格数据模型**

公开接口：

```js
{
  createTableModel(rows, columns),
  normalizeTableModel(model),
  addRow(model, index),
  removeRow(model, index),
  addColumn(model, index),
  removeColumn(model, index),
  mergeCells(model, range),
  splitCell(model, row, column),
  parseGfmTable(text),
  toGfmTable(model),
  parseDelimitedTable(text),
  toHtmlTable(model)
}
```

数据模型使用 `rowSpan`、`colSpan` 和 `coveredBy`；所有修改返回新的规范化模型，不直接破坏调用方原对象。

- [ ] **Step 5: 实现 GFM 规则**

导出：

- `|` 写为 `\|`
- 换行写为 `<br>`
- 合并区域把主单元格内容重复到每个覆盖位置
- 对齐行使用 `:---`、`:---:`、`---:`

导入：

- 识别转义后的 `\|`
- `<br>`、`<br/>` 和 `<br />` 还原为换行
- 没有合并元数据时创建普通单元格

- [ ] **Step 6: 实现 HTML 输出和浏览器导入适配**

`toHtmlTable` 输出 `rowspan`、`colspan` 和 `<br>`，并对文本进行 HTML 实体转义。浏览器端由 `text-formatter.js` 使用 `DOMParser` 把 HTML 表格解析为模型，恢复跨度。

- [ ] **Step 7: 运行测试并提交**

Run: `npm test`

Expected: PASS。

```powershell
git add markdown-table.js tests/markdown-table.test.js
git commit -m "feat: add Markdown table editor model"
```

### Task 5: 修复并扩展序列生成

**Files:**
- Create: `text-generators.js`
- Create: `tests/text-generators.test.js`

- [ ] **Step 1: 增加序列边界测试**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const generators = require("../text-generators.js");

test("sequence supports padding and descending ranges", () => {
  assert.equal(generators.generateSequence({
    start: 3, end: 1, width: 3, order: "range", separator: ","
  }).value, "003,002,001");
});

test("sequence rejects more than 10000 values", () => {
  const result = generators.generateSequence({ start: 1, end: 10001 });
  assert.equal(result.ok, false);
  assert.match(result.message, /10000/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/text-generators.test.js`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现序列生成器**

参数：

```js
{
  start: 1,
  end: 50,
  width: 0,
  count: null,
  order: "range",
  separator: "\n"
}
```

验证开始、结束、位数和数量均为安全整数；`width` 范围 0 至 10；实际生成量不超过 10000；乱序使用 Fisher-Yates。

- [ ] **Step 4: 运行测试并提交**

Run: `npm test`

Expected: PASS。

```powershell
git add text-generators.js tests/text-generators.test.js
git commit -m "feat: validate and modularize sequence generation"
```

### Task 6: 重建七类 UI 和文件 Base64 工作流

**Files:**
- Modify: `TextFormatterTool.html`
- Create: `text-formatter.js`
- Modify: `shared-ui.css`

- [ ] **Step 1: 用配置渲染七个分类**

在 `text-formatter.js` 定义：

```js
const TEXT_TOOL_GROUPS = [
  { id: "clean", name: "文本清理", actions: [] },
  { id: "lines", name: "行与列表", actions: [] },
  { id: "case", name: "大小写与命名", actions: [] },
  { id: "encode", name: "编码与转义", actions: [] },
  { id: "data", name: "数据格式化", actions: [] },
  { id: "hex", name: "Hex 与字节", actions: [] },
  { id: "generate", name: "生成器", actions: [] }
];
```

每个 action 至少包含 `id`、`label`、`description`、`panel`。立即转换调用核心函数；`panel` 指向 Base64、URL 参数、行筛选、Hex 模式或序列参数面板。

- [ ] **Step 2: 修复菜单结构**

HTML 结构使用：

```html
<div class="tc-menu" hidden>
  <button class="tc-menu-item" type="button">
    <span class="tc-menu-label"></span>
    <span class="tc-menu-desc"></span>
  </button>
</div>
```

规则：

- `.tc-menu` 一层边框
- `.tc-menu-item` 无外框，仅有相邻项分隔线
- 删除 `[data-tip]::after`
- 手机和桌面均通过常驻 `.tc-menu-desc` 显示说明

- [ ] **Step 3: 增加 Base64 文件面板**

控件：

- 文件选择
- 拖放区
- 当前来源和文件信息
- 纯 Base64/Data URL 选项
- 标准/URL-safe 选项
- MIME 类型
- 下载文件名
- 编码、解码、预览、下载、清空按钮

文件读取使用 `file.arrayBuffer()`；结果仅保存在内存变量，不调用 `localStorage.setItem`。

- [ ] **Step 4: 增加状态、复制、继续处理和统计**

调用：

```js
toolboxToast("处理完成");
toolboxCopyText(output.value, "已复制");
```

页面显示 `字符 N · 行 N · UTF-8 N 字节`。错误放在 `role="status"` 的状态行。

- [ ] **Step 5: 增加表格编辑面板**

“数据格式化”内增加“表格与 Markdown”参数面板：

- 可编辑网格
- 添加和删除行列
- 合并和拆分
- 表头行开关
- 每列对齐方式
- 粘贴 TSV
- 导入 GFM
- 导入 HTML 表格
- 输出 GFM
- 输出 HTML
- 复制输出

单元格使用 `<textarea>` 或可访问的文本输入控件，不使用 `contenteditable` 保存隐式 HTML。手机端网格放在局部横向滚动容器内，不让整个页面横向溢出。

- [ ] **Step 6: 调整本地偏好**

使用 `toolbox.textformatter.settings.v1` 保存：

```js
{
  expandedGroupId: "",
  hexMode: "strict",
  saveText: false,
  sequence: {
    width: 0,
    order: "range",
    separatorMode: "newline"
  }
}
```

首次读取旧键但不继续自动保存；用户关闭“保存文本”或清空时移除旧键。

- [ ] **Step 7: 提交 UI**

```powershell
git add TextFormatterTool.html text-formatter.js markdown-table.js shared-ui.css
git commit -m "feat: rebuild TextFormatter workflow and menus"
```

### Task 7: 固定浏览器库并接入静态构建

**Files:**
- Modify: `scripts/build-static.js`
- Modify: `TextFormatterTool.html`

- [ ] **Step 1: 定义构建时依赖复制表**

```js
const vendorFiles = [
  ["node_modules/marked/lib/marked.umd.js", "vendor/marked/marked.umd.js"],
  ["node_modules/turndown/lib/turndown.browser.umd.js", "vendor/turndown/turndown.umd.js"],
  ["node_modules/js-yaml/dist/browser/js-yaml.umd.min.js", "vendor/js-yaml/js-yaml.min.js"],
  ["node_modules/papaparse/papaparse.min.js", "vendor/papaparse/papaparse.min.js"]
];
```

复制前验证源文件存在，缺失时构建失败并显示具体路径。

- [ ] **Step 2: 在 TextFormatter 页面按顺序加载**

```html
<script src="vendor/marked/marked.umd.js"></script>
<script src="vendor/turndown/turndown.umd.js"></script>
<script src="vendor/js-yaml/js-yaml.min.js"></script>
<script src="vendor/papaparse/papaparse.min.js"></script>
<script src="text-formatter-core.js"></script>
<script src="text-codecs.js"></script>
<script src="text-generators.js"></script>
<script src="markdown-table.js"></script>
<script defer src="text-formatter.js"></script>
```

- [ ] **Step 3: 运行测试和构建**

Run:

```powershell
npm test
npm run build
```

Expected: 测试全部 PASS；构建输出 `Static site built to dist`；四个第三方脚本存在于 `dist/vendor`。

- [ ] **Step 4: 提交构建配置**

```powershell
git add scripts/build-static.js TextFormatterTool.html
git commit -m "build: bundle TextFormatter browser libraries"
```

### Task 8: 浏览器回归、文档和阶段提交

**Files:**
- Modify: `README.md`
- Modify: `AboutTool.html`

- [ ] **Step 1: 使用桌面视口验证**

检查：

- 七类菜单可开关且互斥
- 菜单无边框嵌套
- 说明不覆盖其他菜单项
- 31 个旧操作正常
- Base64 文件和图片正反向可用
- URL 两种模式结果不同且正确
- JSON、YAML、CSV、Markdown 可处理
- 表格网格可添加删除行列、合并和拆分
- GFM 导出会重复合并内容并使用 `<br>` 保存换行
- HTML 表格导出和导入保留合并关系
- GFM 表格可导入网格并再次导出
- Hex 非法输入明确失败

- [ ] **Step 2: 使用 390×844 手机视口验证**

检查：

- 页面不横向滚动
- 菜单项可点击
- 参数面板不超出屏幕
- 原文和结果上下排列
- Base64 长结果不撑宽页面

- [ ] **Step 3: 更新中文文档**

README 和 About 增加七类说明、Base64 文件安全说明、URL/Web 功能、边界修复和版本记录，不写英文 changelog。

- [ ] **Step 4: 最终验证**

Run:

```powershell
npm test
npm run build
git diff --check
git status --short
```

Expected: 测试和构建成功；`git diff --check` 无输出；状态只包含本阶段预期文件。

- [ ] **Step 5: 提交 TextFormatter 阶段**

```powershell
git add README.md AboutTool.html
git commit -m "docs: document expanded TextFormatter"
```
