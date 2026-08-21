const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
}

test('separates date offsets from unit conversion instead of disabling one form', () => {
  const html = read('DateTimeTool.html');

  assert.match(html, /id="timecalc_offsetModeBtn"/);
  assert.match(html, /id="timecalc_convertModeBtn"/);
  assert.match(html, /id="timecalc_offsetPanel"[^>]*role="tabpanel"/);
  assert.match(html, /id="timecalc_convertPanel"[^>]*role="tabpanel"[^>]*hidden/);
  assert.doesNotMatch(html, /id="timecalc_convertMode"/);
  assert.doesNotMatch(html, /\.disabled\s*=\s*enabled/);

  for (const unit of ['Years', 'Months', 'Days', 'Hours', 'Minutes', 'Seconds']) {
    assert.match(html, new RegExp(`id="timecalc_convert${unit}"`));
  }
  assert.match(html, /function timecalc_setMode\(mode\)/);
  assert.match(html, /timecalc_mode !== 'convert'/);
  assert.match(html, /years:\s*365\s*\*\s*24\s*\*\s*60\s*\*\s*60/);
  assert.match(html, /months:\s*365\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\/\s*12/);
});

test('disables decorative text selection while preserving data and Links text', () => {
  const css = read('shared-ui.css');

  assert.match(css, /body\s*\{[^}]*user-select:\s*none/s);
  assert.match(css, /input,[\s\S]*textarea,[\s\S]*\[contenteditable="true"\],[\s\S]*#externallinks-ui\s*\{[^}]*user-select:\s*text/s);
});
