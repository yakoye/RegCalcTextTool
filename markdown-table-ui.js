async function copyTextWithFallback(options) {
  const config = options || {};
  if (typeof config.copyText === "function") {
    try {
      return await config.copyText() !== false;
    } catch (_error) {
      // Continue to the local selection fallback.
    }
  } else if (typeof config.clipboardWrite === "function") {
    try {
      await config.clipboardWrite();
      return true;
    } catch (_error) {
      // Continue to the local selection fallback.
    }
  }
  try {
    return typeof config.fallbackCopy === "function"
      && config.fallbackCopy() === true;
  } catch (_error) {
    return false;
  }
}

(function () {
  "use strict";

  if (typeof window === "undefined") return;
  const api = window.MarkdownTable;
  if (!api) return;
  const MAX_VISUAL_CELLS = 2500;

  const state = {
    model: api.createTableModel(3, 3),
    selected: new Set(),
    cellIndex: new Map()
  };

  function key(row, column) {
    return `${row}:${column}`;
  }

  function stateMasterCell(cell) {
    if (!cell || !cell.coveredBy) return cell;
    const coveredBy = Array.isArray(cell.coveredBy)
      ? cell.coveredBy
      : [cell.coveredBy.row, cell.coveredBy.column];
    return state.cellIndex.get(key(Number(coveredBy[0]), Number(coveredBy[1]))) || cell;
  }

  function setStatus(message, isError) {
    const status = document.getElementById("markdown_table_status");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-error", Boolean(isError));
  }

  function toast(message) {
    if (typeof window.toolboxToast === "function") window.toolboxToast(message);
    else setStatus(message, false);
  }

  function commitCell(row, column, value) {
    const cell = stateMasterCell(state.cellIndex.get(key(row, column)));
    if (!cell) return;
    cell.value = value;
  }

  function selectionRange() {
    if (!state.selected.size) return null;
    const occupied = new Set();
    for (const item of state.selected) {
      const [row, column] = item.split(":").map(Number);
      const cell = stateMasterCell(state.cellIndex.get(key(row, column)));
      if (!cell) continue;
      for (let cellRow = cell.row; cellRow < cell.row + cell.rowSpan; cellRow += 1) {
        for (
          let cellColumn = cell.column;
          cellColumn < cell.column + cell.colSpan;
          cellColumn += 1
        ) {
          occupied.add(key(cellRow, cellColumn));
        }
      }
    }
    const points = Array.from(occupied, (item) => item.split(":").map(Number));
    const rows = points.map((point) => point[0]);
    const columns = points.map((point) => point[1]);
    const range = {
      startRow: Math.min(...rows),
      endRow: Math.max(...rows),
      startColumn: Math.min(...columns),
      endColumn: Math.max(...columns)
    };
    const expected = (range.endRow - range.startRow + 1) *
      (range.endColumn - range.startColumn + 1);
    return expected === occupied.size ? range : null;
  }

  function selectedAnchor() {
    const first = state.selected.values().next().value;
    if (!first) return { row: state.model.rows - 1, column: state.model.columns - 1 };
    const [row, column] = first.split(":").map(Number);
    return { row, column };
  }

  function updateModel(result, successMessage) {
    if (!result || result.ok === false) {
      setStatus((result && result.message) || "表格操作失败", true);
      return false;
    }
    const nextModel = result.value || result;
    if (nextModel.rows * nextModel.columns > MAX_VISUAL_CELLS) {
      setStatus(`可视化编辑最多支持 ${MAX_VISUAL_CELLS} 个单元格`, true);
      return false;
    }
    state.model = nextModel;
    state.selected.clear();
    render();
    setStatus(successMessage || "", false);
    return true;
  }

  function render() {
    const host = document.getElementById("markdown_table_grid");
    if (!host) return;
    const fragment = document.createDocumentFragment();
    const cellsByPosition = new Map(
      state.model.cells.map((cell) => [key(cell.row, cell.column), cell])
    );
    state.cellIndex = cellsByPosition;
    host.style.setProperty("--table-columns", String(state.model.columns));

    const corner = document.createElement("div");
    corner.className = "markdown-table-corner";
    corner.textContent = "#";
    corner.style.gridColumn = "1";
    corner.style.gridRow = "1";
    fragment.appendChild(corner);

    for (let column = 0; column < state.model.columns; column += 1) {
      const header = document.createElement("label");
      header.className = "markdown-table-column-header";
      header.style.gridColumn = String(column + 2);
      header.style.gridRow = "1";
      header.textContent = `列 ${column + 1}`;
      const alignment = document.createElement("select");
      alignment.setAttribute("aria-label", `第 ${column + 1} 列对齐方式`);
      [
        ["left", "左对齐"],
        ["center", "居中"],
        ["right", "右对齐"]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        alignment.appendChild(option);
      });
      alignment.value = state.model.alignments[column] || "left";
      alignment.addEventListener("change", () => {
        const model = JSON.parse(JSON.stringify(state.model));
        model.alignments[column] = alignment.value;
        updateModel(api.normalizeTableModel(model), "对齐方式已更新");
      });
      header.appendChild(alignment);
      fragment.appendChild(header);
    }

    for (let row = 0; row < state.model.rows; row += 1) {
      const rowLabel = document.createElement("div");
      rowLabel.className = "markdown-table-row-header";
      rowLabel.style.gridColumn = "1";
      rowLabel.style.gridRow = String(row + 2);
      rowLabel.textContent = String(row + 1);
      fragment.appendChild(rowLabel);

      for (let column = 0; column < state.model.columns; column += 1) {
        const cell = cellsByPosition.get(key(row, column));
        if (!cell || cell.coveredBy) continue;

        const wrapper = document.createElement("div");
        wrapper.className = "markdown-table-cell";
        wrapper.style.gridColumn = `${column + 2} / span ${cell.colSpan || 1}`;
        wrapper.style.gridRow = `${row + 2} / span ${cell.rowSpan || 1}`;

        const select = document.createElement("input");
        select.type = "checkbox";
        select.className = "markdown-table-cell-select";
        select.checked = state.selected.has(key(row, column));
        select.setAttribute("aria-label", `选择第 ${row + 1} 行第 ${column + 1} 列`);
        select.addEventListener("change", () => {
          const master = key(row, column);
          if (select.checked) state.selected.add(master);
          else state.selected.delete(master);
          wrapper.classList.toggle("is-selected", select.checked);
        });

        const editor = document.createElement("textarea");
        editor.rows = 2;
        editor.value = cell.value || "";
        editor.setAttribute("aria-label", `第 ${row + 1} 行第 ${column + 1} 列`);
        editor.addEventListener("input", () => commitCell(row, column, editor.value));

        wrapper.classList.toggle("is-selected", select.checked);
        wrapper.append(select, editor);
        fragment.appendChild(wrapper);
      }
    }

    host.replaceChildren(fragment);
    const headerToggle = document.getElementById("markdown_table_header");
    if (headerToggle) headerToggle.checked = Number(state.model.headerRows || 0) > 0;
  }

  function importValue(kind) {
    const source = document.getElementById("markdown_table_source").value;
    if (!source.trim()) {
      setStatus("请先粘贴要导入的表格", true);
      return;
    }
    let result;
    if (kind === "gfm") result = api.parseGfmTable(source);
    else if (kind === "html") result = api.parseHtmlTable(source);
    else result = api.parseDelimitedTable(source, "\t");
    if (updateModel(result, "表格已导入")) toast("表格已导入");
  }

  function exportValue(kind) {
    let result;
    if (kind === "html") result = api.toHtmlTable(state.model);
    else if (kind === "tsv") result = api.toDelimitedTable(state.model, "\t");
    else result = api.toGfmTable(state.model);
    if (!result || result.ok === false) {
      setStatus((result && result.message) || "表格导出失败", true);
      return;
    }
    const label = kind === "html" ? "HTML" : (kind === "tsv" ? "TSV" : "Markdown");
    if (
      window.TextFormatterUI
      && typeof window.TextFormatterUI.setOutput === "function"
    ) {
      if (
        window.TextFormatterUI.setOutput(
          result.value,
          `${label} 已生成到结果`
        ) === false
      ) {
        setStatus("本地保存失败，已关闭", true);
        return;
      }
    } else {
      const output = document.getElementById("textconvert_output");
      output.value = result.value;
    }
    setStatus(`${label} 已生成到结果`, false);
    toast("表格已生成");
  }

  async function copyOutput() {
    const output = document.getElementById("textconvert_output");
    if (!output.value) {
      setStatus("暂无可复制结果", true);
      return;
    }
    const hasSharedCopy = typeof window.toolboxCopyText === "function";
    const copied = await copyTextWithFallback({
      copyText: hasSharedCopy
        ? () => window.toolboxCopyText(output.value, "已复制")
        : null,
      clipboardWrite: !hasSharedCopy
        ? () => navigator.clipboard.writeText(output.value)
        : null,
      fallbackCopy() {
        output.focus();
        output.select();
        return document.execCommand("copy") === true;
      }
    });
    if (!copied) {
      setStatus("复制失败", true);
      return;
    }
    if (!hasSharedCopy) toast("已复制");
    setStatus("结果已复制", false);
  }

  function handleAction(action) {
    const anchor = selectedAnchor();
    if (action === "add-row") {
      updateModel(api.addRow(state.model, anchor.row + 1), "已添加行");
    } else if (action === "remove-row") {
      updateModel(api.removeRow(state.model, anchor.row), "已删除行");
    } else if (action === "add-column") {
      updateModel(api.addColumn(state.model, anchor.column + 1), "已添加列");
    } else if (action === "remove-column") {
      updateModel(api.removeColumn(state.model, anchor.column), "已删除列");
    } else if (action === "merge") {
      const range = selectionRange();
      if (!range || state.selected.size < 2) {
        setStatus("请选择至少两个连续的矩形单元格", true);
        return;
      }
      updateModel(api.mergeCells(state.model, range), "所选单元格已合并");
    } else if (action === "split") {
      if (state.selected.size !== 1) {
        setStatus("请选择一个合并单元格进行拆分", true);
        return;
      }
      updateModel(api.splitCell(state.model, anchor.row, anchor.column), "单元格已拆分");
    } else if (action === "import-gfm") importValue("gfm");
    else if (action === "import-html") importValue("html");
    else if (action === "import-tsv") importValue("tsv");
    else if (action === "clear-source") {
      document.getElementById("markdown_table_source").value = "";
      setStatus("导入内容已清空", false);
    } else if (action === "export-gfm") exportValue("gfm");
    else if (action === "export-html") exportValue("html");
    else if (action === "export-tsv") exportValue("tsv");
    else if (action === "copy") copyOutput();
  }

  window.addEventListener("DOMContentLoaded", () => {
    const section = document.getElementById("markdown_table_section");
    if (!section) return;
    section.addEventListener("click", (event) => {
      const button = event.target.closest("[data-table-action]");
      if (button) handleAction(button.dataset.tableAction);
    });
    document.getElementById("markdown_table_header").addEventListener("change", (event) => {
      const model = JSON.parse(JSON.stringify(state.model));
      model.headerRows = event.target.checked ? 1 : 0;
      updateModel(api.normalizeTableModel(model), "表头设置已更新");
    });
    render();
  });
})();

if (typeof module === "object" && module.exports) {
  module.exports = Object.freeze({ copyTextWithFallback });
}
