const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('loads the Markdown table model before its TextFormatter UI controller', () => {
  const html = fs.readFileSync(path.join(root, 'TextFormatterTool.html'), 'utf8');
  const modelScript = html.indexOf('src="markdown-table.js"');
  const uiScript = html.indexOf('src="markdown-table-ui.js"');
  assert.ok(modelScript >= 0);
  assert.ok(uiScript > modelScript);
  assert.match(html, /id="markdown_table_grid"/);
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
});
