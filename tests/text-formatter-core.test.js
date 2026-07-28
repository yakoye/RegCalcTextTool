const test = require('node:test');
const assert = require('node:assert/strict');

const { runTransform, TRANSFORMS } = require('../text-formatter-core.js');

test('exports the TextFormatter transform API', () => {
  assert.equal(typeof runTransform, 'function');
  assert.ok(TRANSFORMS.removeEmptyLines);
});
