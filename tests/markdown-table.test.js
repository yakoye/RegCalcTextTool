const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const modulePath = path.join(__dirname, '..', 'markdown-table.js');
const table = require(modulePath);

function valueOf(result) {
  assert.equal(result.ok, true, result.message);
  assert.equal(result.message, '');
  return result.value;
}

function cellAt(model, row, column) {
  return model.cells.find((cell) => cell.row === row && cell.column === column);
}

test('exports the table API through CommonJS and browser MarkdownTable', () => {
  const names = [
    'createTableModel', 'normalizeTableModel',
    'addRow', 'removeRow', 'addColumn', 'removeColumn',
    'mergeCells', 'splitCell',
    'parseGfmTable', 'toGfmTable', 'parseDelimitedTable', 'toDelimitedTable',
    'parseHtmlTable', 'toHtmlTable'
  ];
  for (const name of names) {
    assert.equal(typeof table[name], 'function', name);
  }

  const context = {};
  vm.runInNewContext(fs.readFileSync(modulePath, 'utf8'), context);
  for (const name of names) {
    assert.equal(typeof context.MarkdownTable[name], 'function', name);
  }
});

test('creates and normalizes a complete immutable table model', () => {
  const model = table.createTableModel(2, 3);
  assert.deepEqual(model, {
    rows: 2,
    columns: 3,
    headerRows: 1,
    alignments: ['left', 'left', 'left'],
    cells: [
      { row: 0, column: 0, value: '', rowSpan: 1, colSpan: 1, coveredBy: null },
      { row: 0, column: 1, value: '', rowSpan: 1, colSpan: 1, coveredBy: null },
      { row: 0, column: 2, value: '', rowSpan: 1, colSpan: 1, coveredBy: null },
      { row: 1, column: 0, value: '', rowSpan: 1, colSpan: 1, coveredBy: null },
      { row: 1, column: 1, value: '', rowSpan: 1, colSpan: 1, coveredBy: null },
      { row: 1, column: 2, value: '', rowSpan: 1, colSpan: 1, coveredBy: null }
    ]
  });

  const sparse = {
    rows: 2,
    columns: 2,
    headerRows: 0,
    alignments: ['center'],
    cells: [{ row: 0, column: 0, value: 42 }]
  };
  const before = structuredClone(sparse);
  const normalized = valueOf(table.normalizeTableModel(sparse));
  assert.deepEqual(sparse, before);
  assert.deepEqual(normalized.alignments, ['center', 'left']);
  assert.equal(normalized.cells.length, 4);
  assert.equal(cellAt(normalized, 0, 0).value, '42');
  assert.notEqual(normalized.cells[0], sparse.cells[0]);
});

test('normalizes spans and rejects conflicting or malformed models', () => {
  const normalized = valueOf(table.normalizeTableModel({
    rows: 2,
    columns: 3,
    headerRows: 1,
    alignments: ['left', 'center', 'right'],
    cells: [
      { row: 0, column: 0, value: 'wide', rowSpan: 2, colSpan: 2 },
      { row: 0, column: 1, coveredBy: { row: 0, column: 0 } },
      { row: 1, column: 0, coveredBy: [0, 0] },
      { row: 1, column: 1, coveredBy: { row: 0, column: 0 } }
    ]
  }));
  assert.deepEqual(cellAt(normalized, 0, 0), {
    row: 0,
    column: 0,
    value: 'wide',
    rowSpan: 2,
    colSpan: 2,
    coveredBy: null
  });
  assert.deepEqual(cellAt(normalized, 1, 1).coveredBy, { row: 0, column: 0 });

  const conflict = table.normalizeTableModel({
    rows: 1,
    columns: 2,
    cells: [
      { row: 0, column: 0, value: 'a', colSpan: 2 },
      { row: 0, column: 1, value: 'b' }
    ]
  });
  assert.deepEqual(conflict, {
    ok: false,
    value: '',
    message: '表格单元格跨度发生冲突'
  });
  assert.equal(table.normalizeTableModel({
    rows: 1,
    columns: 1,
    cells: [{ row: 0, column: 0, rowSpan: 2 }]
  }).message, '单元格跨度超出表格范围');
  assert.deepEqual(table.createTableModel(-1, 2), {
    ok: false,
    value: '',
    message: '表格行列数必须是非负整数'
  });
});

test('merges and splits rectangular cells without mutating the source', () => {
  const model = table.createTableModel(3, 3);
  cellAt(model, 0, 0).value = '主单元格';
  const before = structuredClone(model);
  const merged = valueOf(table.mergeCells(model, {
    startRow: 0,
    endRow: 1,
    startColumn: 0,
    endColumn: 1
  }));
  assert.deepEqual(model, before);
  assert.equal(cellAt(merged, 0, 0).rowSpan, 2);
  assert.equal(cellAt(merged, 0, 0).colSpan, 2);
  assert.deepEqual(cellAt(merged, 1, 1).coveredBy, { row: 0, column: 0 });

  const split = valueOf(table.splitCell(merged, 1, 1));
  assert.equal(cellAt(split, 0, 0).value, '主单元格');
  for (const point of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const cell = cellAt(split, point[0], point[1]);
    assert.equal(cell.rowSpan, 1);
    assert.equal(cell.colSpan, 1);
    assert.equal(cell.coveredBy, null);
  }
  assert.equal(cellAt(split, 1, 1).value, '');
  assert.deepEqual(merged, valueOf(table.mergeCells(model, {
    startRow: 0,
    endRow: 1,
    startColumn: 0,
    endColumn: 1
  })));
});

test('rejects invalid merge ranges and existing merges crossing the selection', () => {
  const model = table.createTableModel(3, 3);
  const merged = valueOf(table.mergeCells(model, {
    startRow: 0,
    endRow: 1,
    startColumn: 0,
    endColumn: 1
  }));
  assert.equal(table.mergeCells(merged, {
    startRow: 1,
    endRow: 2,
    startColumn: 1,
    endColumn: 2
  }).message, '所选范围穿过已有合并单元格');
  assert.equal(table.mergeCells(model, {
    startRow: 1,
    endRow: 0,
    startColumn: 0,
    endColumn: 1
  }).message, '合并范围无效');
  assert.equal(table.splitCell(model, 0, 0).message, '所选单元格未合并');
});

test('adds and removes rows and columns through merged regions immutably', () => {
  const model = table.createTableModel(3, 3);
  cellAt(model, 0, 0).value = '保留';
  const merged = valueOf(table.mergeCells(model, {
    startRow: 0,
    endRow: 1,
    startColumn: 0,
    endColumn: 1
  }));
  const before = structuredClone(merged);

  const withRow = valueOf(table.addRow(merged, 1));
  assert.equal(withRow.rows, 4);
  assert.equal(cellAt(withRow, 0, 0).rowSpan, 3);
  assert.equal(merged.rows, 3);

  const withColumn = valueOf(table.addColumn(withRow, 1));
  assert.equal(withColumn.columns, 4);
  assert.equal(cellAt(withColumn, 0, 0).colSpan, 3);
  assert.deepEqual(withColumn.alignments, ['left', 'left', 'left', 'left']);

  const withoutRow = valueOf(table.removeRow(withColumn, 0));
  assert.equal(withoutRow.rows, 3);
  assert.equal(cellAt(withoutRow, 0, 0).value, '保留');
  assert.equal(cellAt(withoutRow, 0, 0).rowSpan, 2);

  const withoutColumn = valueOf(table.removeColumn(withoutRow, 0));
  assert.equal(withoutColumn.columns, 3);
  assert.equal(cellAt(withoutColumn, 0, 0).value, '保留');
  assert.equal(cellAt(withoutColumn, 0, 0).colSpan, 2);
  assert.deepEqual(merged, before);
});

test('updates header rows at insertion boundaries and supports an empty table', () => {
  const model = table.createTableModel(1, 1);
  const insertedHeader = valueOf(table.addRow(model, 0));
  assert.equal(insertedHeader.headerRows, 2);
  const insertedBody = valueOf(table.addRow(model, 1));
  assert.equal(insertedBody.headerRows, 1);
  assert.equal(valueOf(table.removeRow(model, 0)).headerRows, 0);

  const noRows = valueOf(table.removeRow(model, 0));
  const empty = valueOf(table.removeColumn(noRows, 0));
  assert.deepEqual(empty, {
    rows: 0,
    columns: 0,
    headerRows: 0,
    alignments: [],
    cells: []
  });
  assert.equal(table.removeRow(empty, 0).message, '删除行位置超出表格范围');
  assert.equal(table.addColumn(model, 2).message, '添加列位置超出表格范围');
});

test('round-trips GFM cells, alignments, escaped pipes, and line breaks', () => {
  const parsed = valueOf(table.parseGfmTable([
    '| 名称 | 说明\\|备注 | 状态 |',
    '| :--- | :---: | ---: |',
    '| A | 第一行<br>第二行 | 完成 |',
    '| B | x<br/>y<br />z | 等待 |'
  ].join('\n')));
  assert.equal(parsed.rows, 3);
  assert.equal(parsed.columns, 3);
  assert.equal(parsed.headerRows, 1);
  assert.deepEqual(parsed.alignments, ['left', 'center', 'right']);
  assert.equal(cellAt(parsed, 0, 1).value, '说明|备注');
  assert.equal(cellAt(parsed, 1, 1).value, '第一行\n第二行');
  assert.equal(cellAt(parsed, 2, 1).value, 'x\ny\nz');

  const output = valueOf(table.toGfmTable(parsed));
  assert.match(output, /^\| 名称 \| 说明\\\|备注 \| 状态 \|$/m);
  assert.match(output, /^\| :--- \| :---: \| ---: \|$/m);
  assert.match(output, /\| A \| 第一行<br>第二行 \| 完成 \|/);
  assert.deepEqual(valueOf(table.parseGfmTable(output)), parsed);
});

test('exports an empty GFM header when the model has no header rows', () => {
  const model = table.createTableModel(2, 2);
  model.headerRows = 0;
  model.alignments = ['center', 'right'];
  cellAt(model, 0, 0).value = 'A';
  cellAt(model, 0, 1).value = 'B';
  cellAt(model, 1, 0).value = 'C';
  cellAt(model, 1, 1).value = 'D';

  assert.equal(valueOf(table.toGfmTable(model)), [
    '|  |  |',
    '| :---: | ---: |',
    '| A | B |',
    '| C | D |'
  ].join('\n'));
});

test('uses the first row as the GFM header while preserving additional header rows', () => {
  const model = table.createTableModel(3, 1);
  model.headerRows = 2;
  cellAt(model, 0, 0).value = '表头一';
  cellAt(model, 1, 0).value = '表头二';
  cellAt(model, 2, 0).value = '数据';

  assert.equal(valueOf(table.toGfmTable(model)), [
    '| 表头一 |',
    '| :--- |',
    '| 表头二 |',
    '| 数据 |'
  ].join('\n'));
});

test('exports merged cells to GFM by repeating the master value', () => {
  const model = table.createTableModel(2, 2);
  cellAt(model, 0, 0).value = '合并|内容\n第二行';
  const merged = valueOf(table.mergeCells(model, {
    startRow: 0,
    endRow: 0,
    startColumn: 0,
    endColumn: 1
  }));
  const output = valueOf(table.toGfmTable(merged));
  assert.match(
    output,
    /^\| 合并\\\|内容<br>第二行 \| 合并\\\|内容<br>第二行 \|$/m
  );
});

test('exports a large merged table without linear master-cell searches', () => {
  const size = 32;
  const model = table.createTableModel(size, size);
  cellAt(model, 0, 0).value = '合并值';
  const merged = valueOf(table.mergeCells(model, {
    startRow: 0,
    endRow: size - 1,
    startColumn: 0,
    endColumn: size - 1
  }));
  const originalFind = Array.prototype.find;
  let findCalls = 0;
  let gfm;
  let delimited;
  Array.prototype.find = function (...args) {
    findCalls += 1;
    return originalFind.apply(this, args);
  };
  try {
    gfm = valueOf(table.toGfmTable(merged));
    delimited = valueOf(table.toDelimitedTable(merged));
  } finally {
    Array.prototype.find = originalFind;
  }

  assert.equal(findCalls, 0);
  const expectedGfmRow = `| ${Array(size).fill('合并值').join(' | ')} |`;
  const gfmLines = gfm.split('\n');
  assert.equal(gfmLines.length, size + 1);
  assert.equal(gfmLines[0], expectedGfmRow);
  assert.equal(gfmLines[2], expectedGfmRow);
  const expectedDelimitedRow = Array(size).fill('合并值').join('\t');
  assert.deepEqual(
    delimited.split('\n'),
    Array(size).fill(expectedDelimitedRow)
  );
});

test('rejects malformed and empty GFM tables with stable Chinese failures', () => {
  assert.deepEqual(table.parseGfmTable('not a table'), {
    ok: false,
    value: '',
    message: 'GFM 表格格式无效'
  });
  assert.equal(table.parseGfmTable('| A | B |\n| --- |\n| 1 | 2 |').message, 'GFM 表格列数不一致');
  assert.equal(table.parseGfmTable('| A |\n| nope |\n| B |').message, 'GFM 对齐行格式无效');
  assert.deepEqual(table.toGfmTable(table.createTableModel(0, 0)), {
    ok: false,
    value: '',
    message: '空表无法导出为 GFM'
  });
});

test('parses quoted delimited text with embedded delimiters and newlines', () => {
  const parsed = valueOf(table.parseDelimitedTable([
    '名称\t说明',
    'A\t"含\t制表符"',
    'B\t"第一行',
    '第二行"',
    'C\t"他说""好"""'
  ].join('\n'), '\t'));
  assert.equal(parsed.rows, 4);
  assert.equal(parsed.columns, 2);
  assert.equal(parsed.headerRows, 1);
  assert.equal(cellAt(parsed, 1, 1).value, '含\t制表符');
  assert.equal(cellAt(parsed, 2, 1).value, '第一行\n第二行');
  assert.equal(cellAt(parsed, 3, 1).value, '他说"好"');

  const ragged = valueOf(table.parseDelimitedTable('a,b\n1\n2,3,4', ','));
  assert.equal(ragged.columns, 3);
  assert.equal(cellAt(ragged, 1, 1).value, '');
  assert.equal(cellAt(ragged, 0, 2).value, '');
});

test('parses and exports a supplementary-plane delimiter as one code point', () => {
  const delimiter = '💠';
  const source = [
    '名称💠说明',
    'A💠"内含💠分隔符"',
    'B💠普通'
  ].join('\n');
  const parsed = valueOf(table.parseDelimitedTable(source, delimiter));
  assert.equal(parsed.rows, 3);
  assert.equal(parsed.columns, 2);
  assert.equal(cellAt(parsed, 1, 1).value, '内含💠分隔符');
  assert.equal(valueOf(table.toDelimitedTable(parsed, delimiter)), source);
});

test('round-trips supported delimiters and rejects the RFC4180 quote character', () => {
  const model = table.createTableModel(2, 2);
  cellAt(model, 0, 0).value = '名称';
  cellAt(model, 0, 1).value = '说明';
  cellAt(model, 1, 0).value = 'A,B';
  cellAt(model, 1, 1).value = '他说"好"';
  const exported = valueOf(table.toDelimitedTable(model, ','));
  assert.deepEqual(valueOf(table.parseDelimitedTable(exported, ',')), model);

  const expected = {
    ok: false,
    value: '',
    message: '双引号不能作为分隔符'
  };
  assert.deepEqual(table.parseDelimitedTable('A"B', '"'), expected);
  assert.deepEqual(table.toDelimitedTable(model, '"'), expected);
});

test('rejects invalid delimited input without throwing', () => {
  assert.equal(table.parseDelimitedTable('', '\t').message, '分隔表格内容不能为空');
  assert.equal(table.parseDelimitedTable('a,b', '').message, '分隔符必须是单个字符');
  assert.equal(table.parseDelimitedTable('"未结束', ',').message, '分隔表格引号未闭合');
  const hostile = {
    toString() {
      throw new Error('private platform detail');
    }
  };
  assert.deepEqual(table.parseGfmTable(hostile), {
    ok: false,
    value: '',
    message: 'GFM 表格解析失败'
  });
});

test('exports delimited text with RFC4180-style field escaping', () => {
  const model = table.createTableModel(2, 4);
  cellAt(model, 0, 0).value = '普通';
  cellAt(model, 0, 1).value = '含\t制表符';
  cellAt(model, 0, 2).value = '他说"好"';
  cellAt(model, 0, 3).value = '第一行\n第二行';
  cellAt(model, 1, 0).value = 'A';
  cellAt(model, 1, 1).value = 'B';
  cellAt(model, 1, 2).value = 'C';
  cellAt(model, 1, 3).value = 'D';

  assert.equal(valueOf(table.toDelimitedTable(model)), [
    '普通\t"含\t制表符"\t"他说""好"""\t"第一行\n第二行"',
    'A\tB\tC\tD'
  ].join('\n'));
  assert.equal(
    valueOf(table.toDelimitedTable(model, ',')),
    [
      '普通,含\t制表符,"他说""好""","第一行\n第二行"',
      'A,B,C,D'
    ].join('\n')
  );
});

test('repeats merged master values when exporting delimited text', () => {
  const model = table.createTableModel(2, 2);
  cellAt(model, 0, 0).value = '合并\t值';
  const merged = valueOf(table.mergeCells(model, {
    startRow: 0,
    endRow: 0,
    startColumn: 0,
    endColumn: 1
  }));
  assert.equal(
    valueOf(table.toDelimitedTable(merged)),
    '"合并\t值"\t"合并\t值"\n""\t""'
  );
});

test('rejects invalid delimited export input with stable Chinese failures', () => {
  assert.deepEqual(table.toDelimitedTable(table.createTableModel(0, 0)), {
    ok: false,
    value: '',
    message: '空表无法导出为分隔文本'
  });
  assert.deepEqual(table.toDelimitedTable(null), {
    ok: false,
    value: '',
    message: '表格模型无效'
  });
  for (const delimiter of ['', '::', '\n', null]) {
    assert.deepEqual(table.toDelimitedTable(table.createTableModel(1, 1), delimiter), {
      ok: false,
      value: '',
      message: '分隔符必须是单个字符'
    });
  }
});

test('round-trips a single-column table whose final row is empty', () => {
  const model = table.createTableModel(2, 1);
  cellAt(model, 0, 0).value = 'A';
  const exported = valueOf(table.toDelimitedTable(model));
  assert.equal(exported, 'A\n""');
  assert.deepEqual(valueOf(table.parseDelimitedTable(exported)), model);
});

test('round-trips a one-cell table whose value is empty', () => {
  const model = table.createTableModel(1, 1);
  const exported = valueOf(table.toDelimitedTable(model));
  assert.equal(exported, '""');
  assert.deepEqual(valueOf(table.parseDelimitedTable(exported)), model);
});

test('writes and round-trips multiple empty fields explicitly', () => {
  const model = table.createTableModel(1, 3);
  const exported = valueOf(table.toDelimitedTable(model));
  assert.equal(exported, '""\t""\t""');
  assert.deepEqual(valueOf(table.parseDelimitedTable(exported)), model);
});

test('keeps treating a trailing newline in hand-written TSV as file termination', () => {
  const parsed = valueOf(table.parseDelimitedTable('A\n'));
  assert.equal(parsed.rows, 1);
  assert.equal(parsed.columns, 1);
  assert.equal(cellAt(parsed, 0, 0).value, 'A');
});

function textNode(value) {
  return { nodeType: 3, nodeValue: value, childNodes: [] };
}

function elementNode(name, children = []) {
  return {
    nodeType: 1,
    localName: name,
    nodeName: name.toUpperCase(),
    childNodes: children,
    textContent: children.map((child) => child.nodeValue || child.textContent || '').join('')
  };
}

function htmlCell(name, children, options = {}) {
  return {
    ...elementNode(name, children),
    rowSpan: options.rowSpan === undefined ? 1 : options.rowSpan,
    colSpan: options.colSpan === undefined ? 1 : options.colSpan,
    align: options.align || '',
    style: { textAlign: options.textAlign || '' },
    getAttribute(attribute) {
      if (attribute === 'rowspan' && options.rowSpan !== undefined) return String(options.rowSpan);
      if (attribute === 'colspan' && options.colSpan !== undefined) return String(options.colSpan);
      if (attribute === 'align') return options.align || null;
      return null;
    }
  };
}

function documentWithTable(rows) {
  const tableNode = { rows };
  return {
    querySelector(selector) {
      return selector === 'table' ? tableNode : null;
    }
  };
}

function attachRowGroup(name, rows) {
  const group = { localName: name, nodeName: name.toUpperCase(), rows };
  for (const row of rows) {
    row.parentElement = group;
  }
  return group;
}

test('parses HTML tables through an injected DOMParser and restores spans', () => {
  const rows = [
    {
      cells: [
        htmlCell('th', [textNode('名称')], { rowSpan: 2 }),
        htmlCell('th', [textNode('说明')], { colSpan: 2, align: 'center' })
      ]
    },
    {
      cells: [
        htmlCell('td', [elementNode('script', [textNode('alert(1)')])]),
        htmlCell('td', [textNode('第一行'), elementNode('br'), textNode('第二行')])
      ]
    }
  ];
  let parseType = '';
  class FakeDOMParser {
    parseFromString(_source, type) {
      parseType = type;
      return documentWithTable(rows);
    }
  }

  const model = valueOf(table.parseHtmlTable('<table>ignored by adapter</table>', {
    DOMParser: FakeDOMParser
  }));
  assert.equal(parseType, 'text/html');
  assert.equal(model.rows, 2);
  assert.equal(model.columns, 3);
  assert.equal(model.headerRows, 1);
  assert.equal(cellAt(model, 0, 0).rowSpan, 2);
  assert.deepEqual(cellAt(model, 1, 0).coveredBy, { row: 0, column: 0 });
  assert.equal(cellAt(model, 0, 1).colSpan, 2);
  assert.equal(model.alignments[1], 'center');
  assert.equal(model.alignments[2], 'center');
  assert.equal(cellAt(model, 1, 1).value, 'alert(1)');
  assert.equal(cellAt(model, 1, 2).value, '第一行\n第二行');
});

test('extends HTML rowspan zero to the end of its current row group', () => {
  const firstGroupRows = [
    {
      cells: [
        htmlCell('td', [textNode('跨组内')], { rowSpan: 0 }),
        htmlCell('td', [textNode('A')])
      ]
    },
    { cells: [htmlCell('td', [textNode('B')])] }
  ];
  const secondGroupRows = [{
    cells: [
      htmlCell('td', [textNode('C')]),
      htmlCell('td', [textNode('D')])
    ]
  }];
  attachRowGroup('tbody', firstGroupRows);
  attachRowGroup('tbody', secondGroupRows);
  const rows = [...firstGroupRows, ...secondGroupRows];
  class GroupedParser {
    parseFromString() {
      return documentWithTable(rows);
    }
  }

  const model = valueOf(table.parseHtmlTable('<table></table>', GroupedParser));
  assert.equal(cellAt(model, 0, 0).rowSpan, 2);
  assert.deepEqual(cellAt(model, 1, 0).coveredBy, { row: 0, column: 0 });
  assert.equal(cellAt(model, 2, 0).value, 'C');
});

test('extends HTML rowspan zero to the table end when no row group is identifiable', () => {
  const rows = [
    {
      cells: [
        htmlCell('td', [textNode('跨表')], { rowSpan: 0 }),
        htmlCell('td', [textNode('A')])
      ]
    },
    { cells: [htmlCell('td', [textNode('B')])] },
    { cells: [htmlCell('td', [textNode('C')])] }
  ];
  class UngroupedParser {
    parseFromString() {
      return documentWithTable(rows);
    }
  }

  const model = valueOf(table.parseHtmlTable('<table></table>', UngroupedParser));
  assert.equal(cellAt(model, 0, 0).rowSpan, 3);
  assert.deepEqual(cellAt(model, 2, 0).coveredBy, { row: 0, column: 0 });
  assert.equal(cellAt(model, 2, 1).value, 'C');
});

test('uses browser DOMParser by default in the UMD build', () => {
  const rows = [{ cells: [htmlCell('td', [textNode('浏览器')])] }];
  let calls = 0;
  class BrowserDOMParser {
    parseFromString() {
      calls += 1;
      return documentWithTable(rows);
    }
  }
  const context = { DOMParser: BrowserDOMParser };
  vm.runInNewContext(fs.readFileSync(modulePath, 'utf8'), context);
  const parsed = context.MarkdownTable.parseHtmlTable('<table></table>');
  assert.equal(parsed.ok, true, parsed.message);
  assert.equal(parsed.value.cells[0].value, '浏览器');
  assert.equal(calls, 1);
});

test('serializes safe HTML with headers, spans, alignment, and line breaks', () => {
  const model = table.createTableModel(3, 3);
  model.alignments[0] = 'center';
  cellAt(model, 0, 0).value = '<script>alert("x")</script>&';
  cellAt(model, 1, 0).value = '第一行\n第二行';
  const headerMerge = valueOf(table.mergeCells(model, {
    startRow: 0,
    endRow: 0,
    startColumn: 0,
    endColumn: 1
  }));
  const merged = valueOf(table.mergeCells(headerMerge, {
    startRow: 1,
    endRow: 2,
    startColumn: 0,
    endColumn: 0
  }));
  const html = valueOf(table.toHtmlTable(merged));
  assert.match(html, /<thead>/);
  assert.match(html, /<tbody>/);
  assert.match(html, /<th[^>]*colspan="2"[^>]*>/);
  assert.match(html, /<td[^>]*rowspan="2"[^>]*>第一行<br>第二行<\/td>/);
  assert.match(html, /align="center"/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;&amp;/);
  assert.doesNotMatch(html, /<script>/);
});

test('keeps a rowspan continuous when a merge crosses the header boundary', () => {
  const model = table.createTableModel(2, 1);
  cellAt(model, 0, 0).value = '跨区';
  const merged = valueOf(table.mergeCells(model, {
    startRow: 0,
    endRow: 1,
    startColumn: 0,
    endColumn: 0
  }));
  const html = valueOf(table.toHtmlTable(merged));
  assert.match(html, /<th rowspan="2">跨区<\/th>/);
  assert.doesNotMatch(html, /<thead>|<tbody>/);
});

test('rejects missing tables, unavailable parsers, and invalid HTML spans', () => {
  class NoTableParser {
    parseFromString() {
      return { querySelector: () => null };
    }
  }
  assert.deepEqual(table.parseHtmlTable('<div>不是表格</div>', {
    DOMParser: NoTableParser
  }), {
    ok: false,
    value: '',
    message: 'HTML 中未找到表格'
  });
  assert.equal(table.parseHtmlTable('<table></table>', {}).message, '当前环境不支持 HTML 表格解析');

  class OverflowParser {
    parseFromString() {
      return documentWithTable([{
        cells: [htmlCell('td', [textNode('x')], { rowSpan: 2 })]
      }]);
    }
  }
  assert.equal(table.parseHtmlTable('<table></table>', OverflowParser).message, 'HTML 单元格跨度超出表格范围');
  assert.deepEqual(table.toHtmlTable(table.createTableModel(0, 0)), {
    ok: false,
    value: '',
    message: '空表无法导出为 HTML'
  });
});
