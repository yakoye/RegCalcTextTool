(function () {
  let toastTimer = null;

  window.toolboxToast = function toolboxToast(message) {
    let toast = document.querySelector(".toolbox-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toolbox-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
  };

  window.toolboxCopyText = async function toolboxCopyText(text, okMessage) {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    window.toolboxToast(okMessage || "已复制");
    return true;
  };
})();
