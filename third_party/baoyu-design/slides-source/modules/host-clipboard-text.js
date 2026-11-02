// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostClipboardText(runtime2) {
  var internalClipboardValue, getInternalClipboard, clipboardListenerDocuments, internalClipboardGeneration, getInternalClipboardGeneration;
  function setInternalClipboard(value) {
    if (internalClipboardGeneration += 1, internalClipboardValue = value, value === void 0 || clipboardListenerDocuments.has(document))
      return;
    clipboardListenerDocuments.add(document);
    let callback = () => setInternalClipboard(void 0);
    document.addEventListener("copy", callback, !0), document.addEventListener("cut", callback, !0);
    let dropOnRealBlur = () => {
      (0, runtime2.usesImmediateModalRelease)() && !document.hasFocus() && (internalClipboardValue = void 0);
    };
    window.addEventListener("blur", () => void setTimeout(dropOnRealBlur));
  }
  function canWriteRichClipboard(win = window) {
    return typeof win.ClipboardItem == "function" && typeof win.navigator.clipboard?.write == "function";
  }
  async function writeRichClipboard(payloads, win = window) {
    let Item = win.ClipboardItem;
    if (!canWriteRichClipboard(win) || Item === void 0)
      return "refused";
    let clipboard = win.navigator.clipboard, resolved = Promise.all(Object.entries(payloads).map(async ([type, payload]) => [
      type,
      await payload
    ])).then((entries) => entries.every((entry) => entry[1] !== null) ? Object.fromEntries(entries) : null, () => null), pending = Object.fromEntries(Object.keys(payloads).map((type) => [
      type,
      resolved.then((data) => data?.[type] ?? Promise.reject(Error("nothing to copy")))
    ]));
    for (let payload of Object.values(pending))
      payload.catch(() => {
      });
    try {
      return await clipboard.write([new Item(pending)]), await resolved !== null ? "copied" : "nothing";
    } catch {
      let data = await resolved;
      if (data === null)
        return "nothing";
      try {
        return await clipboard.write([new Item(data)]), "copied";
      } catch {
        return "refused";
      }
    }
  }
  async function copyTextToClipboard(text) {
    try {
      return await navigator.clipboard.writeText(text), setInternalClipboard(void 0), !0;
    } catch {
    }
    try {
      let focused = document.activeElement, value = document.createElement("textarea");
      value.value = text, value.style.position = "fixed", value.style.opacity = "0", document.body.appendChild(value), value.select();
      try {
        return document.execCommand("copy");
      } finally {
        value.remove();
        let active = document.activeElement;
        typeof HTMLElement < "u" && focused instanceof HTMLElement && focused.isConnected && !focused.isContentEditable && (active === null || active === document.body) && focused.focus({
          preventScroll: !0
        });
      }
    } catch {
      return !1;
    }
  }
  return bindRuntimeValue(runtime2, "internalClipboardValue", () => internalClipboardValue, (value) => {
    internalClipboardValue = value;
  }), bindRuntimeValue(runtime2, "getInternalClipboard", () => getInternalClipboard, (value) => {
    getInternalClipboard = value;
  }), bindRuntimeValue(runtime2, "clipboardListenerDocuments", () => clipboardListenerDocuments, (value) => {
    clipboardListenerDocuments = value;
  }), bindRuntimeValue(runtime2, "setInternalClipboard", () => setInternalClipboard), bindRuntimeValue(runtime2, "copyTextToClipboard", () => copyTextToClipboard), bindRuntimeValue(runtime2, "internalClipboardGeneration", () => internalClipboardGeneration, (value) => {
    internalClipboardGeneration = value;
  }), bindRuntimeValue(runtime2, "getInternalClipboardGeneration", () => getInternalClipboardGeneration, (value) => {
    getInternalClipboardGeneration = value;
  }), bindRuntimeValue(runtime2, "canWriteRichClipboard", () => canWriteRichClipboard), bindRuntimeValue(runtime2, "writeRichClipboard", () => writeRichClipboard), () => {
    (0, runtime2.initializeUiPropertyLabels)(), getInternalClipboard = () => internalClipboardValue, internalClipboardGeneration = 0, getInternalClipboardGeneration = () => internalClipboardGeneration, clipboardListenerDocuments = /* @__PURE__ */ new WeakSet();
  };
}
export {
  installHostClipboardText
};
