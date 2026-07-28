(function (root, factory) {
  const api = factory(root && root.DOMParser);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MarkdownTable = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (defaultDOMParser) {
  'use strict';

  const ALIGNMENTS = new Set(['left', 'center', 'right']);
  const success = (value, message = '') => ({ ok: true, value, message });
  const failure = (message) => ({ ok: false, value: '', message });

  function isDimension(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function emptyCell(row, column) {
    return {
      row,
      column,
      value: '',
      rowSpan: 1,
      colSpan: 1,
      coveredBy: null
    };
  }

  function createModel(rows, columns, headerRows, alignments, cells) {
    return { rows, columns, headerRows, alignments, cells };
  }

  function createTableModel(rows, columns) {
    if (!isDimension(rows) || !isDimension(columns)) {
      return failure('表格行列数必须是非负整数');
    }
    const cells = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        cells.push(emptyCell(row, column));
      }
    }
    return createModel(
      rows,
      columns,
      rows > 0 ? 1 : 0,
      Array(columns).fill('left'),
      cells
    );
  }

  function positionKey(row, column) {
    return `${row}:${column}`;
  }

  function coveredPosition(value) {
    if (Array.isArray(value) && value.length >= 2) {
      return { row: value[0], column: value[1] };
    }
    if (value && typeof value === 'object') {
      return { row: value.row, column: value.column };
    }
    return null;
  }

  function normalizeTableModelImpl(model) {
    if (!model || typeof model !== 'object') {
      return failure('表格模型无效');
    }
    const { rows, columns } = model;
    if (!isDimension(rows) || !isDimension(columns)) {
      return failure('表格行列数必须是非负整数');
    }
    const headerRows = model.headerRows === undefined ? (rows > 0 ? 1 : 0) : model.headerRows;
    if (!Number.isInteger(headerRows) || headerRows < 0 || headerRows > rows) {
      return failure('表头行数超出表格范围');
    }
    if (model.alignments !== undefined && !Array.isArray(model.alignments)) {
      return failure('表格对齐设置无效');
    }
    const alignments = Array.from({ length: columns }, (_, column) => {
      const alignment = model.alignments && model.alignments[column];
      return ALIGNMENTS.has(alignment) ? alignment : 'left';
    });
    if (model.cells !== undefined && !Array.isArray(model.cells)) {
      return failure('表格单元格数据无效');
    }

    const sourceByPosition = new Map();
    for (const source of model.cells || []) {
      if (
        !source
        || typeof source !== 'object'
        || !Number.isInteger(source.row)
        || !Number.isInteger(source.column)
        || source.row < 0
        || source.row >= rows
        || source.column < 0
        || source.column >= columns
      ) {
        return failure('单元格位置超出表格范围');
      }
      const key = positionKey(source.row, source.column);
      if (sourceByPosition.has(key)) {
        return failure('表格存在重复单元格');
      }
      sourceByPosition.set(key, source);
    }

    const occupancy = Array.from({ length: rows }, () => Array(columns).fill(null));
    const masters = new Map();
    const primarySources = Array.from(sourceByPosition.values())
      .filter((source) => source.coveredBy == null)
      .sort((left, right) => left.row - right.row || left.column - right.column);

    for (const source of primarySources) {
      const rowSpan = source.rowSpan === undefined ? 1 : source.rowSpan;
      const colSpan = source.colSpan === undefined ? 1 : source.colSpan;
      if (
        !Number.isInteger(rowSpan)
        || rowSpan < 1
        || !Number.isInteger(colSpan)
        || colSpan < 1
      ) {
        return failure('单元格跨度必须是正整数');
      }
      if (source.row + rowSpan > rows || source.column + colSpan > columns) {
        return failure('单元格跨度超出表格范围');
      }
      const key = positionKey(source.row, source.column);
      for (let row = source.row; row < source.row + rowSpan; row += 1) {
        for (let column = source.column; column < source.column + colSpan; column += 1) {
          if (occupancy[row][column] !== null) {
            return failure('表格单元格跨度发生冲突');
          }
          occupancy[row][column] = key;
        }
      }
      masters.set(key, {
        row: source.row,
        column: source.column,
        value: String(source.value == null ? '' : source.value),
        rowSpan,
        colSpan,
        coveredBy: null
      });
    }

    for (const source of sourceByPosition.values()) {
      if (source.coveredBy == null) {
        continue;
      }
      const pointer = coveredPosition(source.coveredBy);
      if (
        !pointer
        || !Number.isInteger(pointer.row)
        || !Number.isInteger(pointer.column)
      ) {
        return failure('被覆盖单元格引用无效');
      }
      const key = positionKey(pointer.row, pointer.column);
      if (!masters.has(key) || occupancy[source.row][source.column] !== key) {
        return failure('被覆盖单元格引用无效');
      }
    }

    const cells = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const key = occupancy[row][column];
        if (key === null) {
          cells.push(emptyCell(row, column));
        } else {
          const master = masters.get(key);
          cells.push(
            master.row === row && master.column === column
              ? { ...master }
              : {
                  row,
                  column,
                  value: '',
                  rowSpan: 1,
                  colSpan: 1,
                  coveredBy: { row: master.row, column: master.column }
                }
          );
        }
      }
    }
    return success(createModel(rows, columns, headerRows, alignments, cells));
  }

  function normalizedModel(model) {
    const result = normalizeTableModelImpl(model);
    return result.ok ? result.value : result;
  }

  function primaryCells(model) {
    return model.cells
      .filter((cell) => cell.coveredBy === null)
      .map((cell) => ({ ...cell }));
  }

  function rebuildModel(rows, columns, headerRows, alignments, cells) {
    return normalizeTableModelImpl({
      rows,
      columns,
      headerRows,
      alignments,
      cells
    });
  }

  function addRowImpl(model, index) {
    const normalized = normalizedModel(model);
    if (normalized.ok === false) {
      return normalized;
    }
    if (!Number.isInteger(index) || index < 0 || index > normalized.rows) {
      return failure('添加行位置超出表格范围');
    }
    const cells = primaryCells(normalized).map((cell) => {
      if (index <= cell.row) {
        cell.row += 1;
      } else if (index < cell.row + cell.rowSpan) {
        cell.rowSpan += 1;
      }
      return cell;
    });
    return rebuildModel(
      normalized.rows + 1,
      normalized.columns,
      normalized.headerRows + (index < normalized.headerRows ? 1 : 0),
      normalized.alignments.slice(),
      cells
    );
  }

  function removeRowImpl(model, index) {
    const normalized = normalizedModel(model);
    if (normalized.ok === false) {
      return normalized;
    }
    if (!Number.isInteger(index) || index < 0 || index >= normalized.rows) {
      return failure('删除行位置超出表格范围');
    }
    const cells = [];
    for (const original of primaryCells(normalized)) {
      const cell = { ...original };
      const endRow = cell.row + cell.rowSpan - 1;
      if (index < cell.row) {
        cell.row -= 1;
        cells.push(cell);
      } else if (index > endRow) {
        cells.push(cell);
      } else if (cell.rowSpan > 1) {
        cell.rowSpan -= 1;
        cells.push(cell);
      }
    }
    return rebuildModel(
      normalized.rows - 1,
      normalized.columns,
      normalized.headerRows - (index < normalized.headerRows ? 1 : 0),
      normalized.alignments.slice(),
      cells
    );
  }

  function addColumnImpl(model, index) {
    const normalized = normalizedModel(model);
    if (normalized.ok === false) {
      return normalized;
    }
    if (!Number.isInteger(index) || index < 0 || index > normalized.columns) {
      return failure('添加列位置超出表格范围');
    }
    const cells = primaryCells(normalized).map((cell) => {
      if (index <= cell.column) {
        cell.column += 1;
      } else if (index < cell.column + cell.colSpan) {
        cell.colSpan += 1;
      }
      return cell;
    });
    const alignments = normalized.alignments.slice();
    alignments.splice(index, 0, 'left');
    return rebuildModel(
      normalized.rows,
      normalized.columns + 1,
      normalized.headerRows,
      alignments,
      cells
    );
  }

  function removeColumnImpl(model, index) {
    const normalized = normalizedModel(model);
    if (normalized.ok === false) {
      return normalized;
    }
    if (!Number.isInteger(index) || index < 0 || index >= normalized.columns) {
      return failure('删除列位置超出表格范围');
    }
    const cells = [];
    for (const original of primaryCells(normalized)) {
      const cell = { ...original };
      const endColumn = cell.column + cell.colSpan - 1;
      if (index < cell.column) {
        cell.column -= 1;
        cells.push(cell);
      } else if (index > endColumn) {
        cells.push(cell);
      } else if (cell.colSpan > 1) {
        cell.colSpan -= 1;
        cells.push(cell);
      }
    }
    const alignments = normalized.alignments.slice();
    alignments.splice(index, 1);
    return rebuildModel(
      normalized.rows,
      normalized.columns - 1,
      normalized.headerRows,
      alignments,
      cells
    );
  }

  function validRange(range, rows, columns) {
    return (
      range
      && typeof range === 'object'
      && Number.isInteger(range.startRow)
      && Number.isInteger(range.endRow)
      && Number.isInteger(range.startColumn)
      && Number.isInteger(range.endColumn)
      && range.startRow >= 0
      && range.startColumn >= 0
      && range.startRow <= range.endRow
      && range.startColumn <= range.endColumn
      && range.endRow < rows
      && range.endColumn < columns
    );
  }

  function regionsIntersect(cell, range) {
    return (
      cell.row <= range.endRow
      && cell.row + cell.rowSpan - 1 >= range.startRow
      && cell.column <= range.endColumn
      && cell.column + cell.colSpan - 1 >= range.startColumn
    );
  }

  function rangeContainsCell(range, cell) {
    return (
      cell.row >= range.startRow
      && cell.column >= range.startColumn
      && cell.row + cell.rowSpan - 1 <= range.endRow
      && cell.column + cell.colSpan - 1 <= range.endColumn
    );
  }

  function mergeCellsImpl(model, range) {
    const normalized = normalizedModel(model);
    if (normalized.ok === false) {
      return normalized;
    }
    if (!validRange(range, normalized.rows, normalized.columns)) {
      return failure('合并范围无效');
    }
    if (
      range.startRow === range.endRow
      && range.startColumn === range.endColumn
    ) {
      return failure('合并范围至少需要两个单元格');
    }
    const cells = primaryCells(normalized);
    for (const cell of cells) {
      if (regionsIntersect(cell, range) && !rangeContainsCell(range, cell)) {
        return failure('所选范围穿过已有合并单元格');
      }
    }
    const anchor = normalized.cells.find((cell) => (
      cell.row === range.startRow && cell.column === range.startColumn
    ));
    const retained = cells.filter((cell) => !rangeContainsCell(range, cell));
    retained.push({
      row: range.startRow,
      column: range.startColumn,
      value: anchor.value,
      rowSpan: range.endRow - range.startRow + 1,
      colSpan: range.endColumn - range.startColumn + 1,
      coveredBy: null
    });
    return rebuildModel(
      normalized.rows,
      normalized.columns,
      normalized.headerRows,
      normalized.alignments.slice(),
      retained
    );
  }

  function splitCellImpl(model, row, column) {
    const normalized = normalizedModel(model);
    if (normalized.ok === false) {
      return normalized;
    }
    if (
      !Number.isInteger(row)
      || !Number.isInteger(column)
      || row < 0
      || row >= normalized.rows
      || column < 0
      || column >= normalized.columns
    ) {
      return failure('拆分位置超出表格范围');
    }
    const selected = normalized.cells.find((cell) => (
      cell.row === row && cell.column === column
    ));
    const masterPosition = selected.coveredBy || { row, column };
    const master = normalized.cells.find((cell) => (
      cell.row === masterPosition.row && cell.column === masterPosition.column
    ));
    if (master.rowSpan === 1 && master.colSpan === 1) {
      return failure('所选单元格未合并');
    }
    const cells = primaryCells(normalized).filter((cell) => (
      cell.row !== master.row || cell.column !== master.column
    ));
    cells.push({ ...master, rowSpan: 1, colSpan: 1 });
    return rebuildModel(
      normalized.rows,
      normalized.columns,
      normalized.headerRows,
      normalized.alignments.slice(),
      cells
    );
  }

  function splitGfmRow(line) {
    let source = line.trim();
    if (source.startsWith('|')) {
      source = source.slice(1);
    }
    if (source.endsWith('|')) {
      let slashCount = 0;
      for (let index = source.length - 2; index >= 0 && source[index] === '\\'; index -= 1) {
        slashCount += 1;
      }
      if (slashCount % 2 === 0) {
        source = source.slice(0, -1);
      }
    }

    const values = [];
    let value = '';
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (character === '\\' && source[index + 1] === '|') {
        value += '|';
        index += 1;
      } else if (character === '|') {
        values.push(value.trim().replace(/<br\s*\/?>/giu, '\n'));
        value = '';
      } else {
        value += character;
      }
    }
    values.push(value.trim().replace(/<br\s*\/?>/giu, '\n'));
    return values;
  }

  function alignmentFromMarker(marker) {
    const value = marker.trim();
    if (!/^:?-{3,}:?$/u.test(value)) {
      return null;
    }
    if (value.startsWith(':') && value.endsWith(':')) {
      return 'center';
    }
    if (value.endsWith(':')) {
      return 'right';
    }
    return 'left';
  }

  function parseGfmTableImpl(input) {
    const text = String(input == null ? '' : input)
      .replace(/\r\n?/gu, '\n')
      .trim();
    if (text === '') {
      return failure('GFM 表格格式无效');
    }
    const lines = text.split('\n').filter((line) => line.trim() !== '');
    if (lines.length < 2 || !lines.some((line) => line.includes('|'))) {
      return failure('GFM 表格格式无效');
    }
    const header = splitGfmRow(lines[0]);
    const markers = splitGfmRow(lines[1]);
    if (header.length !== markers.length) {
      return failure('GFM 表格列数不一致');
    }
    const alignments = markers.map(alignmentFromMarker);
    if (alignments.some((alignment) => alignment === null)) {
      return failure('GFM 对齐行格式无效');
    }
    const values = [header];
    for (let index = 2; index < lines.length; index += 1) {
      const row = splitGfmRow(lines[index]);
      if (row.length !== header.length) {
        return failure('GFM 表格列数不一致');
      }
      values.push(row);
    }
    const cells = [];
    for (let row = 0; row < values.length; row += 1) {
      for (let column = 0; column < header.length; column += 1) {
        cells.push({
          ...emptyCell(row, column),
          value: values[row][column]
        });
      }
    }
    return rebuildModel(values.length, header.length, 1, alignments, cells);
  }

  function expandedCellValue(model, cell) {
    if (!cell.coveredBy) {
      return cell.value;
    }
    const master = model.cells[
      cell.coveredBy.row * model.columns + cell.coveredBy.column
    ];
    return master ? master.value : '';
  }

  function escapeGfmCell(value) {
    return String(value)
      .replace(/\r\n?/gu, '\n')
      .replace(/\|/gu, '\\|')
      .replace(/\n/gu, '<br>');
  }

  function toGfmTableImpl(model) {
    const normalized = normalizedModel(model);
    if (normalized.ok === false) {
      return normalized;
    }
    if (normalized.rows === 0 || normalized.columns === 0) {
      return failure('空表无法导出为 GFM');
    }
    const output = [];
    const alignmentRow = `| ${normalized.alignments.map((alignment) => {
      if (alignment === 'center') {
        return ':---:';
      }
      if (alignment === 'right') {
        return '---:';
      }
      return ':---';
    }).join(' | ')} |`;
    if (normalized.headerRows === 0) {
      output.push(`| ${Array(normalized.columns).fill('').join(' | ')} |`);
      output.push(alignmentRow);
    }
    for (let row = 0; row < normalized.rows; row += 1) {
      const values = [];
      for (let column = 0; column < normalized.columns; column += 1) {
        const cell = normalized.cells[row * normalized.columns + column];
        values.push(escapeGfmCell(expandedCellValue(normalized, cell)));
      }
      output.push(`| ${values.join(' | ')} |`);
      if (row === 0 && normalized.headerRows > 0) {
        output.push(alignmentRow);
      }
    }
    return success(output.join('\n'));
  }

  function parseDelimitedRows(text, delimiter) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (inQuotes) {
        if (character === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          inQuotes = false;
        } else {
          field += character;
        }
      } else if (character === '"' && field === '') {
        inQuotes = true;
      } else if (text.startsWith(delimiter, index)) {
        row.push(field);
        field = '';
        index += delimiter.length - 1;
      } else if (character === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += character;
      }
    }
    if (inQuotes) {
      return failure('分隔表格引号未闭合');
    }
    row.push(field);
    rows.push(row);
    if (
      text.endsWith('\n')
      && rows.length > 1
      && rows[rows.length - 1].length === 1
      && rows[rows.length - 1][0] === ''
    ) {
      rows.pop();
    }
    return success(rows);
  }

  function delimiterError(delimiter) {
    if (
      typeof delimiter !== 'string'
      || Array.from(delimiter).length !== 1
      || /[\r\n]/u.test(delimiter)
    ) {
      return '分隔符必须是单个字符';
    }
    return delimiter === '"' ? '双引号不能作为分隔符' : '';
  }

  function parseDelimitedTableImpl(input, delimiter = '\t') {
    const text = String(input == null ? '' : input).replace(/\r\n?/gu, '\n');
    if (text === '') {
      return failure('分隔表格内容不能为空');
    }
    const invalidDelimiter = delimiterError(delimiter);
    if (invalidDelimiter) {
      return failure(invalidDelimiter);
    }
    const parsed = parseDelimitedRows(text, delimiter);
    if (!parsed.ok) {
      return parsed;
    }
    const rows = parsed.value;
    const columns = Math.max(...rows.map((row) => row.length));
    const cells = [];
    for (let row = 0; row < rows.length; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        cells.push({
          ...emptyCell(row, column),
          value: rows[row][column] === undefined ? '' : rows[row][column]
        });
      }
    }
    return rebuildModel(
      rows.length,
      columns,
      rows.length > 0 ? 1 : 0,
      Array(columns).fill('left'),
      cells
    );
  }

  function escapeDelimitedField(value, delimiter) {
    const text = String(value).replace(/\r\n?/gu, '\n');
    if (text === '') {
      return '""';
    }
    if (text.includes(delimiter) || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/gu, '""')}"`;
    }
    return text;
  }

  function toDelimitedTableImpl(model, delimiter = '\t') {
    const normalized = normalizedModel(model);
    if (normalized.ok === false) {
      return normalized;
    }
    const invalidDelimiter = delimiterError(delimiter);
    if (invalidDelimiter) {
      return failure(invalidDelimiter);
    }
    if (normalized.rows === 0 || normalized.columns === 0) {
      return failure('空表无法导出为分隔文本');
    }
    const rows = [];
    for (let row = 0; row < normalized.rows; row += 1) {
      const fields = [];
      for (let column = 0; column < normalized.columns; column += 1) {
        const cell = normalized.cells[row * normalized.columns + column];
        fields.push(escapeDelimitedField(
          expandedCellValue(normalized, cell),
          delimiter
        ));
      }
      rows.push(fields.join(delimiter));
    }
    return success(rows.join('\n'));
  }

  function parseHtmlDocument(text, adapter) {
    if (adapter && typeof adapter.parse === 'function') {
      return success(adapter.parse(text));
    }
    if (adapter && typeof adapter.parseFromString === 'function') {
      return success(adapter.parseFromString(text, 'text/html'));
    }
    let Parser = defaultDOMParser;
    if (adapter !== undefined) {
      if (typeof adapter === 'function') {
        Parser = adapter;
      } else if (adapter && typeof adapter.DOMParser === 'function') {
        Parser = adapter.DOMParser;
      } else {
        Parser = null;
      }
    }
    if (typeof Parser !== 'function') {
      return failure('当前环境不支持 HTML 表格解析');
    }
    const parser = new Parser();
    return success(parser.parseFromString(text, 'text/html'));
  }

  function firstTable(document) {
    if (!document) {
      return null;
    }
    if (typeof document.querySelector === 'function') {
      return document.querySelector('table');
    }
    if (typeof document.getElementsByTagName === 'function') {
      const tables = document.getElementsByTagName('table');
      return tables && tables.length > 0 ? tables[0] : null;
    }
    const name = String(document.localName || document.nodeName || '').toLowerCase();
    return name === 'table' ? document : null;
  }

  function lowerNodeName(node) {
    return String(node && (node.localName || node.nodeName || '')).toLowerCase();
  }

  function htmlNodeText(node) {
    if (!node) {
      return '';
    }
    if (node.nodeType === 3 || node.nodeType === 4) {
      return String(node.nodeValue == null ? (node.data == null ? '' : node.data) : node.nodeValue);
    }
    if (lowerNodeName(node) === 'br') {
      return '\n';
    }
    if (node.childNodes && typeof node.childNodes.length === 'number') {
      return Array.from(node.childNodes, htmlNodeText).join('');
    }
    return typeof node.textContent === 'string' ? node.textContent : '';
  }

  function cellSpan(cell, attribute, property, allowZero = false) {
    let value = null;
    if (cell && typeof cell.getAttribute === 'function') {
      value = cell.getAttribute(attribute);
    }
    if (value == null || value === '') {
      value = cell && cell[property] !== undefined ? cell[property] : 1;
    }
    const number = Number(value);
    return (
      Number.isInteger(number)
      && (number > 0 || (allowZero && number === 0))
    ) ? number : null;
  }

  function zeroRowSpan(rows, rowIndex) {
    const row = rows[rowIndex];
    const group = row && (row.parentElement || row.parentNode);
    const groupName = lowerNodeName(group);
    if (!['thead', 'tbody', 'tfoot'].includes(groupName)) {
      return rows.length - rowIndex;
    }
    let endRow = rowIndex;
    while (
      endRow + 1 < rows.length
      && (rows[endRow + 1].parentElement || rows[endRow + 1].parentNode) === group
    ) {
      endRow += 1;
    }
    return endRow - rowIndex + 1;
  }

  function htmlCellAlignment(cell) {
    let alignment = '';
    if (cell && typeof cell.getAttribute === 'function') {
      alignment = cell.getAttribute('align') || '';
    }
    alignment = alignment || (cell && cell.align) || (
      cell && cell.style && cell.style.textAlign
    ) || '';
    const normalized = String(alignment).trim().toLowerCase();
    return ALIGNMENTS.has(normalized) ? normalized : 'left';
  }

  function tableRows(table) {
    if (table.rows && typeof table.rows.length === 'number') {
      return Array.from(table.rows);
    }
    if (typeof table.getElementsByTagName === 'function') {
      return Array.from(table.getElementsByTagName('tr'));
    }
    return [];
  }

  function rowCells(row) {
    if (row.cells && typeof row.cells.length === 'number') {
      return Array.from(row.cells);
    }
    if (row.children && typeof row.children.length === 'number') {
      return Array.from(row.children).filter((child) => {
        const name = lowerNodeName(child);
        return name === 'td' || name === 'th';
      });
    }
    return [];
  }

  function parseHtmlTableImpl(input, adapter) {
    const text = String(input == null ? '' : input);
    const parsed = parseHtmlDocument(text, adapter);
    if (!parsed.ok) {
      return parsed;
    }
    const table = firstTable(parsed.value);
    if (!table) {
      return failure('HTML 中未找到表格');
    }
    const rows = tableRows(table);
    if (rows.length === 0) {
      return failure('HTML 表格内容为空');
    }

    let headerRows = 0;
    for (const row of rows) {
      const cells = rowCells(row);
      if (cells.length > 0 && cells.every((cell) => lowerNodeName(cell) === 'th')) {
        headerRows += 1;
      } else {
        break;
      }
    }

    const occupancy = Array.from({ length: rows.length }, () => []);
    const masters = [];
    const alignmentEntries = [];
    let columns = 0;
    for (let row = 0; row < rows.length; row += 1) {
      let nextColumn = 0;
      for (const cell of rowCells(rows[row])) {
        while (occupancy[row][nextColumn] !== undefined) {
          nextColumn += 1;
        }
        const explicitColumn = cell && Number.isInteger(cell.column) ? cell.column : nextColumn;
        const column = explicitColumn;
        const declaredRowSpan = cellSpan(cell, 'rowspan', 'rowSpan', true);
        const rowSpan = declaredRowSpan === 0
          ? zeroRowSpan(rows, row)
          : declaredRowSpan;
        const colSpan = cellSpan(cell, 'colspan', 'colSpan');
        if (rowSpan === null || colSpan === null) {
          return failure('HTML 单元格跨度无效');
        }
        if (row + rowSpan > rows.length) {
          return failure('HTML 单元格跨度超出表格范围');
        }
        const key = positionKey(row, column);
        for (let occupiedRow = row; occupiedRow < row + rowSpan; occupiedRow += 1) {
          for (
            let occupiedColumn = column;
            occupiedColumn < column + colSpan;
            occupiedColumn += 1
          ) {
            if (occupancy[occupiedRow][occupiedColumn] !== undefined) {
              return failure('HTML 单元格跨度发生冲突');
            }
            occupancy[occupiedRow][occupiedColumn] = key;
          }
        }
        masters.push({
          row,
          column,
          value: htmlNodeText(cell).replace(/\r\n?/gu, '\n'),
          rowSpan,
          colSpan,
          coveredBy: null
        });
        alignmentEntries.push({
          column,
          colSpan,
          alignment: htmlCellAlignment(cell)
        });
        columns = Math.max(columns, column + colSpan);
        nextColumn = column + colSpan;
      }
    }
    if (columns === 0) {
      return failure('HTML 表格内容为空');
    }
    const alignments = Array(columns).fill('left');
    for (const entry of alignmentEntries) {
      if (entry.alignment === 'left') {
        continue;
      }
      for (let column = entry.column; column < entry.column + entry.colSpan; column += 1) {
        if (alignments[column] === 'left') {
          alignments[column] = entry.alignment;
        }
      }
    }
    return rebuildModel(rows.length, columns, headerRows, alignments, masters);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/gu, '&amp;')
      .replace(/</gu, '&lt;')
      .replace(/>/gu, '&gt;')
      .replace(/"/gu, '&quot;')
      .replace(/'/gu, '&#39;')
      .replace(/\r\n?/gu, '\n')
      .replace(/\n/gu, '<br>');
  }

  function htmlRow(model, row, indent) {
    const tag = row < model.headerRows ? 'th' : 'td';
    const cells = [];
    for (let column = 0; column < model.columns; column += 1) {
      const cell = model.cells[row * model.columns + column];
      if (cell.coveredBy) {
        continue;
      }
      const attributes = [];
      if (cell.rowSpan > 1) {
        attributes.push(`rowspan="${cell.rowSpan}"`);
      }
      if (cell.colSpan > 1) {
        attributes.push(`colspan="${cell.colSpan}"`);
      }
      const alignment = model.alignments[column];
      if (alignment && alignment !== 'left') {
        attributes.push(`align="${alignment}"`);
      }
      const suffix = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
      cells.push(`${indent}  <${tag}${suffix}>${escapeHtml(cell.value)}</${tag}>`);
    }
    return [`${indent}<tr>`, ...cells, `${indent}</tr>`];
  }

  function toHtmlTableImpl(model) {
    const normalized = normalizedModel(model);
    if (normalized.ok === false) {
      return normalized;
    }
    if (normalized.rows === 0 || normalized.columns === 0) {
      return failure('空表无法导出为 HTML');
    }
    const lines = ['<table>'];
    const crossesHeaderBoundary = normalized.cells.some((cell) => (
      cell.coveredBy === null
      && cell.row < normalized.headerRows
      && cell.row + cell.rowSpan > normalized.headerRows
    ));
    if (crossesHeaderBoundary) {
      for (let row = 0; row < normalized.rows; row += 1) {
        lines.push(...htmlRow(normalized, row, '  '));
      }
    } else if (normalized.headerRows > 0) {
      lines.push('  <thead>');
      for (let row = 0; row < normalized.headerRows; row += 1) {
        lines.push(...htmlRow(normalized, row, '    '));
      }
      lines.push('  </thead>');
      if (normalized.headerRows < normalized.rows) {
        lines.push('  <tbody>');
        for (let row = normalized.headerRows; row < normalized.rows; row += 1) {
          lines.push(...htmlRow(normalized, row, '    '));
        }
        lines.push('  </tbody>');
      }
    } else {
      lines.push('  <tbody>');
      for (let row = 0; row < normalized.rows; row += 1) {
        lines.push(...htmlRow(normalized, row, '    '));
      }
      lines.push('  </tbody>');
    }
    lines.push('</table>');
    return success(lines.join('\n'));
  }

  function publicOperation(operation, caughtMessage) {
    return function (...args) {
      try {
        return operation(...args);
      } catch (error) {
        return failure(caughtMessage);
      }
    };
  }

  const api = {
    createTableModel: publicOperation(createTableModel, '创建表格失败'),
    normalizeTableModel: publicOperation(normalizeTableModelImpl, '表格模型无效'),
    addRow: publicOperation(addRowImpl, '添加表格行失败'),
    removeRow: publicOperation(removeRowImpl, '删除表格行失败'),
    addColumn: publicOperation(addColumnImpl, '添加表格列失败'),
    removeColumn: publicOperation(removeColumnImpl, '删除表格列失败'),
    mergeCells: publicOperation(mergeCellsImpl, '合并单元格失败'),
    splitCell: publicOperation(splitCellImpl, '拆分单元格失败'),
    parseGfmTable: publicOperation(parseGfmTableImpl, 'GFM 表格解析失败'),
    toGfmTable: publicOperation(toGfmTableImpl, 'GFM 表格导出失败'),
    parseDelimitedTable: publicOperation(parseDelimitedTableImpl, '分隔表格解析失败'),
    toDelimitedTable: publicOperation(toDelimitedTableImpl, '分隔表格导出失败'),
    parseHtmlTable: publicOperation(parseHtmlTableImpl, 'HTML 表格解析失败'),
    toHtmlTable: publicOperation(toHtmlTableImpl, 'HTML 表格导出失败')
  };

  return Object.freeze(api);
});
