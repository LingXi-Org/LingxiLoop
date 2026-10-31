// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDesignSystemSystemFonts(runtime2) {
  var reactForSystemFonts;
  const noSystems = [], listeners = /* @__PURE__ */ new Set(), fontDescriptors = { weight: "100 900" }, loadedFiles = /* @__PURE__ */ new Map(), requestedFiles = /* @__PURE__ */ new Set();
  let record, systems = noSystems, activeFaces = [], peekEnabled = !1;
  const isRecord2 = (value) => typeof value == "object" && value !== null;
  function tokenFontRows(tokens) {
    let type = isRecord2(tokens) ? tokens.type : void 0, fonts = isRecord2(type) ? type.fonts : void 0;
    return (Array.isArray(fonts) ? fonts.slice(0, 64) : []).flatMap((row) => isRecord2(row) && typeof row.family == "string" && runtime2.customFontFamilyPattern.test(row.family) && typeof row.file == "string" && row.style !== "italic" ? [
      {
        family: row.family,
        file: row.file,
        weight: String(row.weight ?? "400")
      }
    ] : []);
  }
  function systemFontFaces(system, tokens, files) {
    let picked = /* @__PURE__ */ new Map(), used = new Set([
      ...[...system.headings, ...Object.values(system.ladder)].map((style) => style?.family),
      system.families.heading,
      system.families.body
    ].map((family) => family?.name.toLowerCase()));
    for (let row of tokenFontRows(tokens).filter((row2) => used.has(row2.family.toLowerCase()))) {
      let src = files.find((path) => path.endsWith("/" + row.file.slice(row.file.lastIndexOf("/") + 1)));
      if (src === void 0)
        continue;
      let weights = system.styles.filter((style) => style.family?.name.toLowerCase() === row.family.toLowerCase()).map((style) => style.fontWeight).sort((a, b) => a - b), off = row.weight.includes(" ") ? -1 : Math.abs(Number(row.weight) - (weights[Math.floor(weights.length / 2)] ?? 400));
      off < (picked.get(row.family)?.off ?? 1 / 0) && picked.set(row.family, { src, off });
    }
    return [...picked].map(([family, entry]) => ({ family, src: entry.src }));
  }
  const fontFilePaths = (value) => (Array.isArray(value) ? value : []).filter((path) => typeof path == "string" && runtime2.designSystemFontPathPattern.test(path));
  function themeSystemsOf(value) {
    let entries = isRecord2(value) ? value.systems : void 0, list = (Array.isArray(entries) ? entries.slice(0, 8) : []).flatMap((entry) => {
      if (!isRecord2(entry) || typeof entry.title != "string" || typeof entry.namespace != "string")
        return [];
      let title = entry.title.replace(/\s+[-\u2013\u2014]\s+design system$/i, ""), style = (0, runtime2.analyzeDesignSystem)(entry.tokens, {
        key: entry.namespace,
        title
      });
      return style.themes.length === 0 ? [] : [
        {
          key: entry.namespace,
          title,
          style,
          faces: systemFontFaces(style, entry.tokens, fontFilePaths(entry.fontFiles))
        }
      ];
    });
    return (0, runtime2.restyleCandidateSystems)(list);
  }
  function setDeckDesignSystemsRecord(value) {
    if (value !== record) {
      record = value, systems = void 0;
      for (let listener of listeners)
        listener();
    }
  }
  const subscribe2 = (listener) => (listeners.add(listener), () => void listeners.delete(listener)), currentSystems = () => systems ??= themeSystemsOf(record), noCurrentSystems = () => noSystems, useThemeSystems = (enabled) => reactForSystemFonts.useSyncExternalStore(subscribe2, enabled ? currentSystems : noCurrentSystems, enabled ? currentSystems : noCurrentSystems), peekFontFamily = (src) => "Peek " + (0, runtime2.hashArtifactState)(src);
  function loadSystemFontFiles(faces) {
    if (!(typeof FontFace > "u"))
      for (let face of faces) {
        let src = face.src;
        src === void 0 || requestedFiles.has(src) || (requestedFiles.add(src), fetch(src).then((response) => response.ok ? response.arrayBuffer() : Promise.reject(Error(String(response.status)))).then((bytes) => {
          loadedFiles.set(src, { family: face.family, bytes }), syncDocumentFonts();
        }).catch(() => void requestedFiles.delete(src)));
      }
  }
  function syncDocumentFonts() {
    if (document.fonts !== void 0)
      for (let [src, file] of loadedFiles)
        activeFaces.some((face) => face.src === src) ? document.fonts.add(file.own ??= new FontFace(file.family, file.bytes, fontDescriptors)) : file.own !== void 0 && document.fonts.delete(file.own), peekEnabled && document.fonts.add(file.peek ??= new FontFace(peekFontFamily(src), file.bytes, fontDescriptors));
  }
  function setActiveSystemFaces(faces) {
    activeFaces = faces, syncDocumentFonts();
  }
  function enablePeekFonts() {
    peekEnabled = !0, syncDocumentFonts();
  }
  function loadFaceStylesheets(faces) {
    for (let href of faces.flatMap((face) => face.href !== void 0 ? [
      face.href,
      ...(0, runtime2.optionalGoogleFontStylesheetUrls)(face.href, runtime2.defaultGoogleFontWeights)
    ] : []))
      [...document.head.querySelectorAll("link")].some((link) => link.getAttribute("href") === href) || document.head.appendChild(Object.assign(document.createElement("link"), {
        rel: "stylesheet",
        href
      }));
  }
  return bindRuntimeValue(runtime2, "reactForSystemFonts", () => reactForSystemFonts), bindRuntimeValue(runtime2, "setDeckDesignSystemsRecord", () => setDeckDesignSystemsRecord), bindRuntimeValue(runtime2, "useThemeSystems", () => useThemeSystems), bindRuntimeValue(runtime2, "peekFontFamily", () => peekFontFamily), bindRuntimeValue(runtime2, "loadSystemFontFiles", () => loadSystemFontFiles), bindRuntimeValue(runtime2, "setActiveSystemFaces", () => setActiveSystemFaces), bindRuntimeValue(runtime2, "enablePeekFonts", () => enablePeekFonts), bindRuntimeValue(runtime2, "loadFaceStylesheets", () => loadFaceStylesheets), () => {
    (0, runtime2.initializeStyleSchema)(), (0, runtime2.initializeSlideModel)(), reactForSystemFonts = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
  };
}
export {
  installDesignSystemSystemFonts
};
