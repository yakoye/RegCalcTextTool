(() => {
  "use strict";

  const DESKTOP_VERSION = "0.1.4";
  const NATURAL_WIDTH = 588;
  const MIN_SCALE = 0.62;
  const MAX_SCALE = 1.70;
  const STATE_KEY = "regcalc64DesktopStateV1";

  const frame = document.getElementById("regcalc-frame");
  const helpBtn = document.getElementById("help-btn");
  const topmostBtn = document.getElementById("topmost-btn");
  const minimizeBtn = document.getElementById("minimize-btn");
  const closeBtn = document.getElementById("close-btn");
  const resizeHandle = document.getElementById("resize-handle");

  let naturalHeight = 620;
  let lastScale = 1;
  let layoutFrame = 0;

  function hostMessage(message) {
    try {
      if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage(String(message));
      }
    } catch (_) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function saveState(state) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state || {})); }
    catch (_) {}
  }

  function postToTool(message) {
    if (frame && frame.contentWindow) frame.contentWindow.postMessage(message, "*");
  }

  function computeScale() {
    const width = Math.max(1, document.documentElement.clientWidth || window.innerWidth || NATURAL_WIDTH);
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, width / NATURAL_WIDTH));
  }

  function applyLayout() {
    layoutFrame = 0;
    const scale = computeScale();
    lastScale = scale;
    postToTool({ type: "REGCALC64_SET_SCALE", scale });

    const viewportHeight = Math.max(1, document.documentElement.clientHeight || window.innerHeight || 1);
    const neededHeight = naturalHeight * scale;
    postToTool({ type: "REGCALC64_SET_SCROLL", enabled: neededHeight > viewportHeight + 1 });
  }

  function scheduleLayout() {
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(applyLayout);
  }

  function setTopmostVisual(enabled) {
    const active = !!enabled;
    topmostBtn.classList.toggle("is-active", active);
    topmostBtn.setAttribute("aria-pressed", active ? "true" : "false");
    topmostBtn.title = active ? "Disable always on top" : "Always on top";
  }

  frame.addEventListener("load", () => {
    postToTool({ type: "REGCALC64_EXTENSION_META", version: DESKTOP_VERSION });
    postToTool({ type: "REGCALC64_APPLY_STATE", state: loadState() });
    scheduleLayout();
    setTimeout(scheduleLayout, 60);
    setTimeout(() => postToTool({ type: "REGCALC64_EXTENSION_META", version: DESKTOP_VERSION }), 80);
  });

  window.addEventListener("message", (event) => {
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data || {};

    if (data.type === "regcalc-popup-size") {
      const h = Number(data.naturalHeight);
      if (Number.isFinite(h) && h > 100) naturalHeight = h;
      scheduleLayout();
      return;
    }
    if (data.type === "REGCALC64_STATE_CHANGED") {
      saveState(data.state || {});
      return;
    }
    if (data.type === "REGCALC64_HEADER_DRAG_START") {
      hostMessage("window:drag");
      return;
    }
  });

  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener("message", (event) => {
      const message = String(event.data || "");
      if (message === "topmost:1") setTopmostVisual(true);
      if (message === "topmost:0") setTopmostVisual(false);
    });
  }

  helpBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    postToTool({ type: "REGCALC64_SHOW_HELP" });
  });

  topmostBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    hostMessage("window:toggle-topmost");
  });

  minimizeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    hostMessage("window:minimize");
  });

  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    hostMessage("window:close");
  });

  resizeHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    hostMessage("window:resize-br");
  });

  window.addEventListener("resize", scheduleLayout);
  window.addEventListener("load", () => {
    scheduleLayout();
    hostMessage("window:get-topmost");
  });

  Object.defineProperty(window, "regcalc64DesktopScale", {
    get: () => lastScale,
    configurable: false
  });
})();
