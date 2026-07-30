# TextFormatter 布局与序列生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 TextFormatter 操作区移动到文本框上方，增强下拉视觉，并为序列生成增加紧凑布局和十六进制输出。

**Architecture:** 保持现有单页 HTML 和 UMD 模块边界。`text-generators.js` 负责进制验证与格式化，`text-formatter.js` 负责设置迁移和条件显示，HTML/CSS 只负责语义顺序与响应式表现。

**Tech Stack:** HTML、CSS、原生 JavaScript、Node.js `node:test`、Playwright CLI。

---

### Task 1: 十六进制序列核心

**Files:**
- Modify: `text-generators.js`
- Test: `tests/text-generators.test.js`

- [ ] **Step 1: 写失败测试**

增加断言：`radix: 16` 将 `10..12`、位数 `4` 输出为 `0x000A,0x000B,0x000C`，负数输出 `-0x000A`，非法进制返回稳定中文错误。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/text-generators.test.js`

Expected: 十六进制输出和非法进制测试失败。

- [ ] **Step 3: 实现最小逻辑**

在参数校验中接受 `10` 和 `16`，默认 `10`；格式化函数根据进制选择十进制字符串或大写十六进制字符串，并将 `0x` 放在补零后的数字之前。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/text-generators.test.js`

Expected: PASS。

### Task 2: UI 结构和设置

**Files:**
- Modify: `TextFormatterTool.html`
- Modify: `text-formatter.js`
- Test: `tests/text-formatter-ui.test.js`

- [ ] **Step 1: 写失败测试**

断言操作框和参数框出现在 `tc-text-workspace` 之前；HTML 包含 `sequence_radix`；设置清洗默认进制为 `10`；自定义分隔符容器使用 `hidden` 条件控制。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/text-formatter-ui.test.js`

Expected: DOM 顺序、进制字段和条件隐藏测试失败。

- [ ] **Step 3: 调整 DOM 与状态**

移动操作框、参数框和状态栏到文本工作区前；增加十进制/十六进制下拉框；给自定义分隔符标签增加稳定 ID；读取、保存 `radix`；切换分隔方式时同时设置标签 `hidden` 和输入框 `disabled`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/text-formatter-ui.test.js`

Expected: PASS。

### Task 3: 下拉视觉和响应式序列布局

**Files:**
- Modify: `shared-ui.css`
- Test: `tests/text-formatter-ui.test.js`

- [ ] **Step 1: 写失败测试**

断言分类 summary 隐藏原生 marker、具有显式箭头伪元素和展开旋转状态；序列网格包含专用列宽；640px 下为两列、360px 下为单列。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/text-formatter-ui.test.js`

Expected: CSS 结构断言失败。

- [ ] **Step 3: 实现样式**

分类 summary 改成带边框、背景和箭头的下拉控件；序列桌面端使用紧凑固定列，移动端两列，超窄端一列；隐藏字段不占网格空间；菜单保持内部滚动。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/text-formatter-ui.test.js`

Expected: PASS。

### Task 4: 文档、浏览器回归和发布

**Files:**
- Modify: `README.md`
- Modify: `AboutTool.html`

- [ ] **Step 1: 更新中文说明**

记录 TextFormatter 操作区上移、分类下拉视觉、条件自定义分隔符和十六进制序列功能。

- [ ] **Step 2: 全量验证**

Run: `npm test`

Expected: 全部测试通过。

Run: `npm run build`

Expected: `Static site built to dist`。

- [ ] **Step 3: 浏览器验证**

在 1440px、640px、390px 和 320px 宽度下验证无横向溢出；分类菜单可滚动；自定义分隔符仅在自定义模式显示；十六进制序列输出正确。

- [ ] **Step 4: 提交、合并并推送**

提交功能分支，快进合并到 `main`，重新运行测试和构建，然后推送 `origin/main`。
