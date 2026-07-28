const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

test('loads the Markdown table model before its TextFormatter UI controller', () => {
  const html = fs.readFileSync(path.join(root, 'TextFormatterTool.html'), 'utf8');
  const modelScript = html.indexOf('src="markdown-table.js"');
  const formatterScript = html.indexOf('src="text-formatter.js"');
  const uiScript = html.indexOf('src="markdown-table-ui.js"');
  assert.ok(modelScript >= 0);
  assert.ok(formatterScript > modelScript);
  assert.ok(uiScript > formatterScript);
  assert.match(html, /id="markdown_table_grid"/);
  assert.match(html, /data-panel="table"/);
  assert.match(html, /data-table-action="import-gfm"/);
  assert.match(html, /data-table-action="import-html"/);
  assert.match(html, /data-table-action="import-tsv"/);
  assert.match(html, /data-table-action="merge"/);
  assert.match(html, /data-table-action="split"/);
  assert.match(html, /data-table-action="export-tsv"/);
});

test('does not persist Markdown table source or cell data', () => {
  const controller = fs.readFileSync(path.join(root, 'markdown-table-ui.js'), 'utf8');
  assert.doesNotMatch(controller, /localStorage/);
  assert.match(controller, /toGfmTable/);
  assert.match(controller, /toHtmlTable/);
  assert.match(controller, /parseHtmlTable/);
  assert.match(controller, /toDelimitedTable/);
  assert.match(controller, /MAX_VISUAL_CELLS\s*=\s*2500/);
  assert.doesNotMatch(controller, /dispatchEvent\s*\(/);
  assert.match(controller, /TextFormatterUI\.setOutput/);
});

function loadSharedUi(execResult) {
  const source = fs.readFileSync(path.join(root, 'shared-ui.js'), 'utf8');
  const created = [];
  const document = {
    body: {
      scrollHeight: 0,
      appendChild(element) {
        created.push(element);
      },
      removeChild() {}
    },
    documentElement: { scrollHeight: 0 },
    querySelector(selector) {
      if (selector === '.toolbox-toast') {
        return created.find((element) => element.className === 'toolbox-toast') || null;
      }
      return null;
    },
    createElement(tagName) {
      return {
        tagName,
        className: '',
        textContent: '',
        style: {},
        classList: { add() {}, remove() {} },
        setAttribute() {},
        select() {}
      };
    },
    execCommand() {
      return execResult;
    },
    addEventListener() {}
  };
  const window = {
    parent: null,
    document,
    addEventListener() {},
    setTimeout() { return 1; }
  };
  window.parent = window;
  const context = {
    window,
    document,
    navigator: {
      clipboard: {
        async writeText() {
          throw new Error('denied');
        }
      }
    },
    setTimeout() { return 1; },
    clearTimeout() {}
  };
  vm.runInNewContext(source, context);
  return { window, created };
}

test('shared copy fallback returns false and reports failure when execCommand fails', async () => {
  const failed = loadSharedUi(false);
  assert.equal(await failed.window.toolboxCopyText('copy me', '已复制'), false);
  assert.equal(
    failed.created.find((element) => element.className === 'toolbox-toast').textContent,
    '复制失败'
  );

  const succeeded = loadSharedUi(true);
  assert.equal(await succeeded.window.toolboxCopyText('copy me', '已复制'), true);
  assert.equal(
    succeeded.created.find((element) => element.className === 'toolbox-toast').textContent,
    '已复制'
  );
});

test('Markdown table copy checks false results and exposes a failure status', async () => {
  const ui = require(path.join(root, 'markdown-table-ui.js'));
  assert.equal(
    await ui.copyTextWithFallback({
      copyText: async () => false,
      clipboardWrite: async () => {},
      fallbackCopy: () => true
    }),
    false
  );
  assert.equal(
    await ui.copyTextWithFallback({
      clipboardWrite: async () => {
        throw new Error('denied');
      },
      fallbackCopy: () => false
    }),
    false
  );
  assert.equal(
    await ui.copyTextWithFallback({
      clipboardWrite: async () => {},
      fallbackCopy: () => false
    }),
    true
  );

  const controller = fs.readFileSync(path.join(root, 'markdown-table-ui.js'), 'utf8');
  assert.match(controller, /setStatus\("复制失败", true\)/);
  assert.match(controller, /document\.execCommand\("copy"\)\s*===\s*true/);
});

test('Markdown table export respects a failed TextFormatter persistence flush', () => {
  const controller = fs.readFileSync(path.join(root, 'markdown-table-ui.js'), 'utf8');
  assert.match(
    controller,
    /TextFormatterUI\.setOutput\([\s\S]*?\)\s*===\s*false[\s\S]*?本地保存失败，已关闭/
  );
});
