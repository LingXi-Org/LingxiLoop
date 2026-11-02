// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostArtifactClipboard(runtime2) {
  var reactNH0, ARTIFACT_CLIPBOARD_ATTRIBUTE, ARTIFACT_CLIPBOARD_PATTERN, artifactClipboardFallback, pictureCopy, ARTIFACT_COPY_MARK_ATTRIBUTE;
  function writePictureClipboard(mark, text, picture) {
    if (!(0, runtime2.canWriteRichClipboard)())
      return;
    let [generation, startedAt] = [
      (0, runtime2.getInternalClipboardGeneration)(),
      Date.now()
    ], current = () => (0, runtime2.getInternalClipboardGeneration)() === generation && (document.hasFocus() || Date.now() - startedAt < 2e3), rendered = (0, runtime2.downloadsCapabilityAvailable)().then((available) => available ? picture() : null).then(async (png) => {
      if (png === null || !current())
        return null;
      let html = "<img " + mark + ' alt="' + escapeClipboardHtml(text) + '" src="data:' + escapeClipboardHtml(png.type) + ";base64," + encodeClipboardUtf8(new Uint8Array(await png.arrayBuffer())) + '">';
      return current() ? {
        "image/png": png,
        "text/html": new Blob([html], {
          type: "text/html"
        })
      } : null;
    }).catch(() => null), payloads = {
      "image/png": rendered.then((data) => data && (data["image/png"] ?? null)),
      "text/html": rendered.then((data) => data && (data["text/html"] ?? null))
    };
    text !== "" && (payloads["text/plain"] = Promise.resolve(new Blob([text], {
      type: "text/plain"
    }))), window.navigator.vendor.startsWith("Apple") ? setTimeout(() => void (0, runtime2.writeRichClipboard)(payloads)) : (0, runtime2.writeRichClipboard)(payloads);
  }
  function encodeClipboardUtf8(text) {
    let value = typeof text == "string" ? new TextEncoder().encode(text) : text, text2 = "";
    for (let index4 = 0; index4 < value.length; index4 += 32768)
      text2 += String.fromCharCode(...value.subarray(index4, index4 + 32768));
    return btoa(text2);
  }
  function decodeClipboardUtf8(encoded) {
    try {
      let value = atob(encoded), value2 = new Uint8Array(value.length);
      for (let index4 = 0; index4 < value.length; index4++)
        value2[index4] = value.charCodeAt(index4);
      return new TextDecoder().decode(value2);
    } catch {
      return;
    }
  }
  function escapeClipboardHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function writeArtifactClipboard(event, kind, payload) {
    let clipboardData = event.clipboardData;
    if (!clipboardData)
      return !1;
    let state = {
      appifact: 1,
      kind,
      data: payload.data
    }, marker;
    try {
      marker = ARTIFACT_CLIPBOARD_ATTRIBUTE + '="' + encodeClipboardUtf8(JSON.stringify(state)) + '"', clipboardData.setData("text/plain", payload.text), clipboardData.setData("text/html", "<span " + marker + ">" + escapeClipboardHtml(payload.text) + "</span>");
    } catch {
      return !1;
    }
    return artifactClipboardFallback = payload.text === "" ? void 0 : {
      kind,
      data: payload.data,
      text: payload.text
    }, (0, runtime2.setInternalClipboard)({
      kind,
      data: payload.data
    }), pictureCopy = payload.pictureAlone === !0 ? {
      mark: ARTIFACT_COPY_MARK_ATTRIBUTE + '="' + Math.random().toString(36).slice(2) + '"',
      kind,
      data: payload.data
    } : void 0, payload.picture !== void 0 && writePictureClipboard(pictureCopy?.mark ?? marker, payload.text, payload.picture), !0;
  }
  function readArtifactClipboard(event, useTextFallback = !0) {
    let clipboardData = event.clipboardData;
    if (!clipboardData)
      return;
    let value = clipboardData.getData("text/html"), value2 = value === "" ? null : ARTIFACT_CLIPBOARD_PATTERN.exec(value);
    if (value2?.[1] !== void 0) {
      let value3 = decodeClipboardUtf8(value2[1]);
      if (value3 !== void 0)
        try {
          let value4 = JSON.parse(value3);
          if (typeof value4 == "object" && value4 !== null && value4.appifact === 1 && typeof value4.kind == "string" && Object.hasOwn(value4, "data"))
            return {
              kind: value4.kind,
              data: value4.data
            };
        } catch {
        }
    }
    if (pictureCopy !== void 0 && value.includes(pictureCopy.mark))
      return {
        kind: pictureCopy.kind,
        data: pictureCopy.data
      };
    if (useTextFallback && artifactClipboardFallback !== void 0 && artifactClipboardFallback.text !== "" && clipboardData.getData("text/plain") === artifactClipboardFallback.text)
      return {
        kind: artifactClipboardFallback.kind,
        data: artifactClipboardFallback.data
      };
  }
  function clipboardTextIsFileNames(files, text) {
    let value = text.trim();
    if (value === "" || /^https?:\/\/\S+$/.test(value))
      return !0;
    let values = new Set(files.map((input) => input.name));
    return value.split(/\r\n|\r|\n/).every((input) => values.has(clipboardFileBaseName(input)));
  }
  function clipboardFileBaseName(path) {
    let value = path.trim().replace(/^"(.*)"$/, "$1");
    if (!/^(file:\/\/|\/|\\\\|[A-Za-z]:[\\/])/i.test(value))
      return value;
    if (/^file:/i.test(value))
      try {
        value = decodeURIComponent(value);
      } catch {
      }
    return value.slice(Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\")) + 1);
  }
  function isClipboardEditingTarget(target) {
    return typeof HTMLElement > "u" || !(target instanceof HTMLElement) ? !1 : target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
  }
  function hasDocumentTextSelection() {
    let value = typeof document > "u" ? null : document.getSelection();
    return value !== null && !value.isCollapsed;
  }
  function useArtifactClipboard(options) {
    let ref = reactNH0.useRef(options);
    ref.current = options;
    let value = options.enabled !== !1;
    reactNH0.useEffect(() => {
      if (!value)
        return;
      let callback = (event) => event.defaultPrevented || isClipboardEditingTarget(event.target) || hasDocumentTextSelection() || (0, runtime2.hasOpenOverlay)(), callback2 = (event) => {
        if (callback(event))
          return;
        let value2 = ref.current.onCopy?.();
        value2 !== void 0 && (event.preventDefault(), writeArtifactClipboard(event, ref.current.kind, value2));
      }, callback3 = (event) => {
        if (callback(event))
          return;
        let value2 = ref.current.onCut?.();
        value2 !== void 0 && (event.preventDefault(), writeArtifactClipboard(event, ref.current.kind, value2) && value2.commit());
      }, callback4 = (event) => {
        if (event.defaultPrevented || isClipboardEditingTarget(event.target) || (0, runtime2.hasOpenOverlay)())
          return;
        let value2 = readArtifactClipboard(event), items = [...event.clipboardData?.files ?? []], value4 = items.filter(ref.current.acceptFile ?? runtime2.isImageFile);
        if (value2 !== void 0) {
          if (value2.kind !== ref.current.kind || !ref.current.onPaste)
            return;
          event.preventDefault(), ref.current.onPaste(value2.data, value4);
          return;
        }
        let value3 = event.clipboardData?.getData("text/plain") ?? "";
        if (value4.length > 0 && ref.current.onPasteFiles && clipboardTextIsFileNames(items, value3) && ref.current.onPasteFiles(value4)) {
          event.preventDefault();
          return;
        }
        value3 !== "" && ref.current.onPasteText && ref.current.onPasteText(value3) && event.preventDefault();
      };
      return document.addEventListener("copy", callback2), document.addEventListener("cut", callback3), document.addEventListener("paste", callback4), () => {
        document.removeEventListener("copy", callback2), document.removeEventListener("cut", callback3), document.removeEventListener("paste", callback4);
      };
    }, [value]);
  }
  function copyArtifactToClipboard(kind, payload) {
    let flag = !1, callback = (event) => {
      event.preventDefault(), flag = writeArtifactClipboard(event, kind, payload);
    }, activeElement2 = document.activeElement, value = document.createElement("textarea");
    value.value = payload.text === "" ? " " : payload.text, value.style.position = "fixed", value.style.opacity = "0", document.body.appendChild(value), value.select(), document.addEventListener("copy", callback, {
      capture: !0,
      once: !0
    });
    try {
      document.execCommand("copy");
    } catch {
    }
    return document.removeEventListener("copy", callback, {
      capture: !0
    }), value.remove(), activeElement2 instanceof HTMLElement && activeElement2.isConnected && activeElement2.focus({
      preventScroll: !0
    }), flag;
  }
  return bindRuntimeValue(runtime2, "reactNH0", () => reactNH0, (value) => {
    reactNH0 = value;
  }), bindRuntimeValue(runtime2, "ARTIFACT_CLIPBOARD_ATTRIBUTE", () => ARTIFACT_CLIPBOARD_ATTRIBUTE, (value) => {
    ARTIFACT_CLIPBOARD_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "ARTIFACT_CLIPBOARD_PATTERN", () => ARTIFACT_CLIPBOARD_PATTERN, (value) => {
    ARTIFACT_CLIPBOARD_PATTERN = value;
  }), bindRuntimeValue(runtime2, "encodeClipboardUtf8", () => encodeClipboardUtf8), bindRuntimeValue(runtime2, "ARTIFACT_COPY_MARK_ATTRIBUTE", () => ARTIFACT_COPY_MARK_ATTRIBUTE, (value) => {
    ARTIFACT_COPY_MARK_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "writePictureClipboard", () => writePictureClipboard), bindRuntimeValue(runtime2, "decodeClipboardUtf8", () => decodeClipboardUtf8), bindRuntimeValue(runtime2, "escapeClipboardHtml", () => escapeClipboardHtml), bindRuntimeValue(runtime2, "artifactClipboardFallback", () => artifactClipboardFallback, (value) => {
    artifactClipboardFallback = value;
  }), bindRuntimeValue(runtime2, "writeArtifactClipboard", () => writeArtifactClipboard), bindRuntimeValue(runtime2, "readArtifactClipboard", () => readArtifactClipboard), bindRuntimeValue(runtime2, "clipboardTextIsFileNames", () => clipboardTextIsFileNames), bindRuntimeValue(runtime2, "clipboardFileBaseName", () => clipboardFileBaseName), bindRuntimeValue(runtime2, "isClipboardEditingTarget", () => isClipboardEditingTarget), bindRuntimeValue(runtime2, "hasDocumentTextSelection", () => hasDocumentTextSelection), bindRuntimeValue(runtime2, "useArtifactClipboard", () => useArtifactClipboard), bindRuntimeValue(runtime2, "copyArtifactToClipboard", () => copyArtifactToClipboard), () => {
    (0, runtime2.initializeImageDownsampling)(), (0, runtime2.initializeUiPropertyFocus)(), reactNH0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), ARTIFACT_CLIPBOARD_ATTRIBUTE = "data-appifact-object", ARTIFACT_CLIPBOARD_PATTERN = new RegExp(ARTIFACT_CLIPBOARD_ATTRIBUTE + '="([A-Za-z0-9+/=]+)"'), ARTIFACT_COPY_MARK_ATTRIBUTE = "data-appifact-copy";
  };
}
export {
  installHostArtifactClipboard
};
