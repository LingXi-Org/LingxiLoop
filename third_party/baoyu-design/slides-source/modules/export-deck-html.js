// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportDeckHtml(runtime2) {
  var deckHtmlExports, WEB_FONT_OFFLINE_NOTE, WEB_FONT_BUDGET_NOTE, LIVE_EXPORTED_EMBEDS, EXPORTED_FONT_BUDGET, HTML_REBUILD_TIMEOUT_MS, FONT_PACK_TIMEOUT_MS, HOSTED_HTML_OVERHEAD_BYTES, UNSAFE_EXPORT_ELEMENT_SELECTOR, EXPORT_LENGTH_STYLE_PATTERN, EXPORTED_PAGE_LABEL_MAX, EXPORTED_CANVAS_WIDTH, EXPORTED_CANVAS_HEIGHT, EXPORTED_HTML_CSP, BASIC_PAGE_ROOT_CSS, IMPORTABLE_PAGE_ROOT_CSS, BASIC_PAGE_LAYOUT_CSS, IMPORTABLE_PAGE_LAYOUT_CSS, PAGE_PAGER_CSS, BASIC_PAGE_MOBILE_CSS, IMPORTABLE_PAGE_MOBILE_CSS, PAGE_STAGE_CSS, BASIC_PAGE_PRINT_CSS, IMPORTABLE_PAGE_PRINT_CSS, htmlFontNoticePreamble, initializeDeckHtml;
  function imagesReducedNote(count, maxBytes) {
    return String(count) + (count === 1 ? " picture was" : " pictures were") + " reduced to fit the " + String(Math.round(maxBytes / 1024 / 1024)) + " MB export limit";
  }
  async function fitHtmlPictures(pages, buildHtml, collectImages, options) {
    let value = buildHtml(pages), state = {
      pages,
      html: value
    }, value2 = hostedPageBytes(value) + 1 - options.maxBytes;
    if (value2 <= 0)
      return state;
    try {
      let value3 = await (0, runtime2.shrinkExportImages)(pages, await collectImages(), {
        mustSave: value2,
        wantSave: value2 + (options.packing ? EXPORTED_FONT_BUDGET : 0),
        deadline: options.deadline === void 0 ? void 0 : options.deadline - HTML_REBUILD_TIMEOUT_MS,
        wantDeadline: options.deadline === void 0 || !options.packing ? void 0 : options.deadline - HTML_REBUILD_TIMEOUT_MS - FONT_PACK_TIMEOUT_MS - runtime2.resourceFetchRetryBudgetMs,
        encode: options.encode,
        opaque: options.opaque
      });
      if (!value3.fits)
        return state;
      let value4 = buildHtml(value3.pages);
      return hostedPageBytes(value4) + 1 > options.maxBytes ? state : {
        pages: value3.pages,
        html: value4,
        note: imagesReducedNote(value3.reduced, options.maxBytes)
      };
    } catch {
      return state;
    }
  }
  async function renderDeckHtml(title, slides, assets, { importerReady: options = !1, inlineWebFonts = !1, maxBytes = 1 / 0, shrinkImages = !1, deadline, encodeImage, opaqueImage, fontsReadyMs, nameMissingFonts, fontLicences } = {}) {
    let value = await (0, runtime2.mountSlidesOffscreen)(slides, assets, {
      fontsReadyMs,
      nameMissingFonts
    }), { host, warnings } = value;
    value.lateFamilies.length > 0 && warnings.push((0, runtime2.fontTimeoutWarning)(value.lateFamilies, "sized")), value.missingFamilies.length > 0 && warnings.push((0, runtime2.fontUnavailableWarning)(value.missingFamilies, "sized"));
    let value2 = value.lateFamilies.length > 0 ? {
      late: !0
    } : {};
    try {
      (0, runtime2.notePageMissingFonts)(value2, value.missingFamilies, () => host.textContent ?? "");
      let value3 = await (0, runtime2.rasterizeEmbedFrames)(host, slides, warnings);
      (0, runtime2.labelUncapturedEmbeds)(host, slides, value3);
      let items = [];
      for (let index4 = 0; index4 < slides.length; index4++)
        items.push(serializeSlide(value.surface(index4), value3.get(index4), options));
      let value4 = getComputedStyle(host), value5 = "font:" + (value4.font || "16px system-ui, sans-serif") + ";color:" + (value4.color || "#141413"), value6 = (0, runtime2.documentStylesheetCss)(), value7 = splitFontImports(value6), value8 = (0, runtime2.fontUsageHints)(value7.css, items.join(`
`) + value5), value9 = (0, runtime2.removeRuntimeFontFaces)(await (0, runtime2.inlineLocalFonts)((0, runtime2.removeUnusedFontFaces)(value7.css, value8), warnings, void 0, value2, value.missingFamilies)), state = {
        title,
        fontLinks: value7.links,
        css: value9,
        rootStyle: value5,
        slides: items,
        motion: motionConfig(slides),
        importerReady: options,
        pageInfo: slides.map(exportedPageInfo)
      }, value10 = inlineWebFonts && value7.links.length > 0, licencesLoad = value10 ? fontLicences !== void 0 ? Promise.resolve(fontLicences) : (0, runtime2.loadGoogleFontLicences)({
        dir: runtime2.GOOGLE_FONT_LISTS_DIR,
        deadline: deadline === void 0 ? void 0 : deadline - HTML_REBUILD_TIMEOUT_MS - runtime2.resourceFetchRetryBudgetMs
      }) : void 0, value11, value12;
      if (shrinkImages && maxBytes !== 1 / 0) {
        let value13 = await fitHtmlPictures(items, (input) => buildDeckPage({
          ...state,
          slides: input
        }), () => (0, runtime2.collectExportImages)(slides.map((input, options2) => value.surface(options2)), value3, runtime2.SLIDE_WIDTH), {
          maxBytes,
          packing: value10,
          deadline,
          encode: encodeImage,
          opaque: opaqueImage
        });
        items = value13.pages, value11 = value13.html, value12 = value13.note;
      } else
        value11 = buildDeckPage(state);
      if (value10) {
        let text = "";
        for (let index4 = 0; index4 < slides.length; index4++)
          text += value.surface(index4).textContent ?? "";
        let lists = await licencesLoad ?? null, linkedCleared = [
          ...new Set(value7.links.flatMap(runtime2.googleFontUrlFamilies).flatMap((family) => {
            if (!value8.includes(family.toLowerCase()))
              return [];
            let cleared = lists?.cleared(family);
            return cleared === void 0 ? [] : [cleared];
          }))
        ], linkedNotices = lists?.noticesOf(linkedCleared) ?? /* @__PURE__ */ new Map(), noticeOf = (family) => {
          let cleared = lists?.cleared(family), notice = cleared === void 0 ? void 0 : linkedNotices.get(cleared);
          return cleared === void 0 || notice === void 0 ? void 0 : [cleared, notice];
        }, value13 = await (0, runtime2.inlineGoogleFontFaces)(value6, {
          text,
          budget: packedFontBudget(value11, maxBytes),
          deadline: deadline === void 0 ? void 0 : deadline - HTML_REBUILD_TIMEOUT_MS - runtime2.resourceFetchRetryBudgetMs,
          familyNamed: (input) => value8.includes(input),
          mayCarry: (family) => noticeOf(family) !== void 0,
          familyRoom: maxBytes === 1 / 0 ? void 0 : (family) => {
            let notice = noticeOf(family);
            return notice === void 0 ? 1 / 0 : hostedHtmlBytes((0, runtime2.fontNoticeComment)((0, runtime2.googleFontNoticeText)(htmlFontNoticePreamble, new Map([notice]))));
          }
        });
        value13.requested && (value2.webRequested = !0);
        let listsMissing = lists === null && value13.heldBack.length > 0;
        (value13.unavailable || listsMissing) && (warnings.push(WEB_FONT_OFFLINE_NOTE), value2.missing = value2.missingWebFetch = !0, (0, runtime2.noteWebFontFailures)(value2, value13.failures), listsMissing && (value2.missingWebLists = !0)), value13.overBudget && lists !== null && (warnings.push(WEB_FONT_BUDGET_NOTE), value2.overBudget = !0), lists !== null && value13.heldBack.length > 0 && warnings.push((0, runtime2.heldBackFontsNote)(value13.heldBack));
        let carriedNotices = lists === null ? /* @__PURE__ */ new Map() : lists.noticesOf(value13.carried.flatMap((family) => {
          let cleared = lists.cleared(family);
          return cleared === void 0 ? [] : [cleared];
        }));
        value13.css !== "" && (value11 = buildDeckPage({
          ...state,
          slides: items,
          css: value9 + `
` + value13.css,
          fontNotices: (0, runtime2.googleFontNoticeText)(htmlFontNoticePreamble, carriedNotices)
        }));
      }
      return {
        html: value11,
        warnings: Array.from(new Set(warnings)),
        fontFindings: value2,
        reducedNote: value12
      };
    } finally {
      value.dispose();
    }
  }
  function splitFontImports(css) {
    let values = /* @__PURE__ */ new Set(), value = css.replace(runtime2.googleFontsImportRegex, (input, options, context) => (values.add(context), ""));
    return {
      links: [...values],
      css: value
    };
  }
  function motionSchedule(slides, live = LIVE_EXPORTED_EMBEDS) {
    return slides.map((input) => {
      let items = [];
      for (let index4 = 0; index4 <= (0, runtime2.slideBuildCount)(input); index4++)
        items.push({
          hidden: [...(0, runtime2.hiddenBuildFrameIds)(input, index4)],
          events: index4 === 0 ? [] : (0, runtime2.slideBuildStepEffects)(input, index4).map((input2) => ({
            id: input2.frame.id,
            dir: input2.dir,
            effect: input2.effect
          })),
          auto: index4 === 0 ? !1 : (0, runtime2.slideBuildStepIsAutomatic)(input, index4)
        });
      let value = live ? input.frames.filter((input2) => input2.node.kind === "html").map((input2) => ({
        id: input2.id,
        srcdoc: (0, runtime2.buildEmbedSrcdoc)(input2.node.html, {
          allowScripts: runtime2.allowEmbedScripts
        })
      })) : [];
      return {
        ...input.transition !== void 0 ? {
          transition: input.transition
        } : {},
        bg: (0, runtime2.slideBackgroundColor)(input.bg),
        steps: items,
        embeds: value
      };
    });
  }
  function motionConfig(slides) {
    let state = {};
    for (let value of runtime2.buildEffectValues)
      state[value] = (0, runtime2.buildEffectTransition)(value);
    return {
      w: runtime2.SLIDE_WIDTH,
      h: runtime2.SLIDE_HEIGHT,
      buildMs: runtime2.buildEffectDurationMs,
      exitEasing: runtime2.buildExitEasing,
      effects: state,
      transMs: {
        ...runtime2.slideTransitionDurations
      },
      transEase: runtime2.slideTransitionEasing,
      live: LIVE_EXPORTED_EMBEDS,
      slides: motionSchedule(slides)
    };
  }
  function inlineSafeJson(value) {
    return JSON.stringify(value).replaceAll("<", "\\u003c");
  }
  function hostedHtmlBytes(html) {
    let value = 0;
    for (let index4 = 0; index4 < html.length; index4++) {
      let value2 = html.charCodeAt(index4);
      if (value2 < 128)
        value += 1;
      else if (value2 < 2048)
        value += 2;
      else if (value2 >= 55296 && value2 < 56320 && index4 + 1 < html.length && (html.charCodeAt(index4 + 1) & 64512) === 56320) {
        value += 4, index4 += 1;
        continue;
      } else
        value += 3;
      value2 === 34 || value2 === 92 || value2 === 10 || value2 === 13 || value2 === 9 ? value += 1 : (value2 === 60 || value2 < 32) && (value += 5);
    }
    return value;
  }
  function hostedPageBytes(html) {
    return HOSTED_HTML_OVERHEAD_BYTES + hostedHtmlBytes(html);
  }
  function packedFontBudget(html, maxBytes) {
    if (maxBytes === 1 / 0)
      return runtime2.defaultFontInliningBudget;
    let value = maxBytes - hostedPageBytes(html) - 1;
    return value <= 0 ? 0 : Math.min(runtime2.defaultFontInliningBudget, value);
  }
  function resolveInlineVars(source, clone) {
    let value = source.ownerDocument?.defaultView;
    if (!value)
      return;
    let items = [
      source,
      ...Array.from(source.querySelectorAll("*"))
    ], items2 = [
      clone,
      ...Array.from(clone.querySelectorAll("*"))
    ];
    if (items.length === items2.length)
      for (let index4 = 0; index4 < items2.length; index4++) {
        let style = items2[index4].style;
        if (style === void 0 || style.length === 0)
          continue;
        let value2 = Array.from(style), value3;
        if (style.getPropertyValue("box-sizing") === "" && value2.some((input) => EXPORT_LENGTH_STYLE_PATTERN.test(input))) {
          value3 ??= value.getComputedStyle(items[index4]);
          let value4 = value3.getPropertyValue("box-sizing");
          value4 !== "" && style.setProperty("box-sizing", value4);
        }
        for (let value4 of value2) {
          if (value4.startsWith("--")) {
            style.removeProperty(value4);
            continue;
          }
          let value5 = style.getPropertyValue(value4);
          if (value5 !== "" && !value5.includes("var("))
            continue;
          value3 ??= value.getComputedStyle(items[index4]);
          let value6 = value3.getPropertyValue(value4);
          value6 !== "" && style.setProperty(value4, value6, style.getPropertyPriority(value4));
        }
      }
  }
  function serializeSlide(surface, assets, importerReady = !1) {
    let value = surface.cloneNode(!0);
    importerReady && (resolveInlineVars(surface, value), value.classList.add("slide"), value.setAttribute("data-canvas-width", EXPORTED_CANVAS_WIDTH), value.setAttribute("data-canvas-height", EXPORTED_CANVAS_HEIGHT)), (0, runtime2.replaceEmbedPlaceholders)(value, assets);
    for (let value2 of Array.from(value.querySelectorAll(UNSAFE_EXPORT_ELEMENT_SELECTOR)))
      value2.remove();
    for (let value2 of [
      value,
      ...Array.from(value.querySelectorAll("*"))
    ])
      for (let value3 of Array.from(value2.attributes))
        (/^on/i.test(value3.name) || /^(?:href|src|xlink:href|action|formaction)$/i.test(value3.name) && /^javascript:/i.test(value3.value.replace(/[\u0000-\u0020]/g, ""))) && value2.removeAttribute(value3.name);
    for (let value2 of Array.from(value.querySelectorAll("style")))
      value2.textContent = escapeStyleClosingTag(value2.textContent ?? "");
    for (let value2 of Array.from(value.querySelectorAll("a[title]:not([href])"))) {
      let value3 = /(?:^|\s)(https?:\/\/\S+)$/i.exec(value2.getAttribute("title") ?? "")?.[1] ?? "";
      (0, runtime2.isSafeHyperlink)(value3) && (value2.setAttribute("href", value3), value2.setAttribute("target", "_blank"), value2.setAttribute("rel", "noopener noreferrer"), value2.setAttribute("title", value3), value2.style.cursor = "pointer");
    }
    return value.removeAttribute("data-uncommentable"), value.outerHTML;
  }
  function exportedPageInfo(slide) {
    let value = (0, runtime2.slideTitleSnippet)(slide, EXPORTED_PAGE_LABEL_MAX), value2 = (slide.notes ?? "").trim();
    return {
      ...value !== "" && {
        label: value
      },
      ...value2 !== "" && {
        notes: value2
      }
    };
  }
  function exportedPageAttributes(info = {}) {
    return ' data-document-role="page"' + (info.label === void 0 ? "" : ' data-label="' + escapeHtmlAttribute(info.label) + '"') + (info.notes === void 0 ? "" : ' data-speaker-notes="' + escapeHtmlAttribute(info.notes) + '"');
  }
  function escapeHtmlAttribute(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeStyleClosingTag(css) {
    return css.replaceAll("</", "\\3C/");
  }
  function pageCss(importerReady) {
    return [
      ...importerReady ? IMPORTABLE_PAGE_ROOT_CSS : BASIC_PAGE_ROOT_CSS,
      ...importerReady ? IMPORTABLE_PAGE_LAYOUT_CSS : BASIC_PAGE_LAYOUT_CSS,
      ...PAGE_PAGER_CSS,
      importerReady ? IMPORTABLE_PAGE_MOBILE_CSS : BASIC_PAGE_MOBILE_CSS,
      ...PAGE_STAGE_CSS,
      importerReady ? IMPORTABLE_PAGE_PRINT_CSS : BASIC_PAGE_PRINT_CSS
    ].join(`
`);
  }
  function inlineDeckRuntimeSource() {
    let value = (0, runtime2.deckPageRuntimeSource)();
    if (/<\/script|<\!--/i.test(value))
      throw Error("page runtime source is not inline-safe");
    return value;
  }
  function buildDeckPage(options) {
    let length = options.slides.length, value = options.importerReady === !0;
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="` + EXPORTED_HTML_CSP + `">
<meta name="viewport" content="width=device-width, initial-scale=1">
` + (value ? `<meta name="hz:slide-selector" content=".slide">
<meta name="hz:canvas-width" content="` + EXPORTED_CANVAS_WIDTH + `">
<meta name="hz:canvas-height" content="` + EXPORTED_CANVAS_HEIGHT + `">
` : "") + "<title>" + escapeHtmlAttribute(options.title) + `</title>
` + options.fontLinks.map((input) => '<link rel="stylesheet" href="' + escapeHtmlAttribute(input) + `">
`).join("") + `<style>
` + escapeStyleClosingTag(options.css) + `
</style>
` + (0, runtime2.fontNoticeComment)(options.fontNotices ?? "") + `<style>
` + pageCss(value) + `
</style>
<script type="application/json" id="deck-motion">` + inlineSafeJson(options.motion) + `<\/script>
<script>(` + inlineDeckRuntimeSource() + `)(JSON.parse(document.getElementById("deck-motion").textContent));<\/script>
</head>
<body>
<main data-appifact-content style="` + escapeHtmlAttribute(options.rootStyle) + `">
` + options.slides.map((input, options2) => '<section class="deck-slide" id="' + String(options2 + 1) + '" aria-roledescription="slide" aria-label="Slide ' + String(options2 + 1) + " / " + String(length) + '"' + (value ? exportedPageAttributes(options.pageInfo?.[options2]) : "") + '><div class="deck-fit"><div class="deck-scaler">' + input + `</div></div></section>
`).join("") + `</main>
<div class="deck-pager" aria-hidden="true"></div>
</body>
</html>
`;
  }
  function htmlFilename(title) {
    return (0, runtime2.exportFilename)(title, "html");
  }
  return bindRuntimeValue(runtime2, "deckHtmlExports", () => deckHtmlExports, (value) => {
    deckHtmlExports = value;
  }), bindRuntimeValue(runtime2, "imagesReducedNote", () => imagesReducedNote), bindRuntimeValue(runtime2, "fitHtmlPictures", () => fitHtmlPictures), bindRuntimeValue(runtime2, "renderDeckHtml", () => renderDeckHtml), bindRuntimeValue(runtime2, "splitFontImports", () => splitFontImports), bindRuntimeValue(runtime2, "motionSchedule", () => motionSchedule), bindRuntimeValue(runtime2, "motionConfig", () => motionConfig), bindRuntimeValue(runtime2, "inlineSafeJson", () => inlineSafeJson), bindRuntimeValue(runtime2, "hostedHtmlBytes", () => hostedHtmlBytes), bindRuntimeValue(runtime2, "hostedPageBytes", () => hostedPageBytes), bindRuntimeValue(runtime2, "packedFontBudget", () => packedFontBudget), bindRuntimeValue(runtime2, "resolveInlineVars", () => resolveInlineVars), bindRuntimeValue(runtime2, "serializeSlide", () => serializeSlide), bindRuntimeValue(runtime2, "exportedPageInfo", () => exportedPageInfo), bindRuntimeValue(runtime2, "exportedPageAttributes", () => exportedPageAttributes), bindRuntimeValue(runtime2, "escapeHtmlAttribute", () => escapeHtmlAttribute), bindRuntimeValue(runtime2, "escapeStyleClosingTag", () => escapeStyleClosingTag), bindRuntimeValue(runtime2, "pageCss", () => pageCss), bindRuntimeValue(runtime2, "inlineDeckRuntimeSource", () => inlineDeckRuntimeSource), bindRuntimeValue(runtime2, "buildDeckPage", () => buildDeckPage), bindRuntimeValue(runtime2, "htmlFilename", () => htmlFilename), bindRuntimeValue(runtime2, "WEB_FONT_OFFLINE_NOTE", () => WEB_FONT_OFFLINE_NOTE, (value) => {
    WEB_FONT_OFFLINE_NOTE = value;
  }), bindRuntimeValue(runtime2, "WEB_FONT_BUDGET_NOTE", () => WEB_FONT_BUDGET_NOTE, (value) => {
    WEB_FONT_BUDGET_NOTE = value;
  }), bindRuntimeValue(runtime2, "LIVE_EXPORTED_EMBEDS", () => LIVE_EXPORTED_EMBEDS, (value) => {
    LIVE_EXPORTED_EMBEDS = value;
  }), bindRuntimeValue(runtime2, "EXPORTED_FONT_BUDGET", () => EXPORTED_FONT_BUDGET, (value) => {
    EXPORTED_FONT_BUDGET = value;
  }), bindRuntimeValue(runtime2, "HTML_REBUILD_TIMEOUT_MS", () => HTML_REBUILD_TIMEOUT_MS, (value) => {
    HTML_REBUILD_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "FONT_PACK_TIMEOUT_MS", () => FONT_PACK_TIMEOUT_MS, (value) => {
    FONT_PACK_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "HOSTED_HTML_OVERHEAD_BYTES", () => HOSTED_HTML_OVERHEAD_BYTES, (value) => {
    HOSTED_HTML_OVERHEAD_BYTES = value;
  }), bindRuntimeValue(runtime2, "UNSAFE_EXPORT_ELEMENT_SELECTOR", () => UNSAFE_EXPORT_ELEMENT_SELECTOR, (value) => {
    UNSAFE_EXPORT_ELEMENT_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "EXPORT_LENGTH_STYLE_PATTERN", () => EXPORT_LENGTH_STYLE_PATTERN, (value) => {
    EXPORT_LENGTH_STYLE_PATTERN = value;
  }), bindRuntimeValue(runtime2, "EXPORTED_PAGE_LABEL_MAX", () => EXPORTED_PAGE_LABEL_MAX, (value) => {
    EXPORTED_PAGE_LABEL_MAX = value;
  }), bindRuntimeValue(runtime2, "EXPORTED_CANVAS_WIDTH", () => EXPORTED_CANVAS_WIDTH, (value) => {
    EXPORTED_CANVAS_WIDTH = value;
  }), bindRuntimeValue(runtime2, "EXPORTED_CANVAS_HEIGHT", () => EXPORTED_CANVAS_HEIGHT, (value) => {
    EXPORTED_CANVAS_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "EXPORTED_HTML_CSP", () => EXPORTED_HTML_CSP, (value) => {
    EXPORTED_HTML_CSP = value;
  }), bindRuntimeValue(runtime2, "BASIC_PAGE_ROOT_CSS", () => BASIC_PAGE_ROOT_CSS, (value) => {
    BASIC_PAGE_ROOT_CSS = value;
  }), bindRuntimeValue(runtime2, "IMPORTABLE_PAGE_ROOT_CSS", () => IMPORTABLE_PAGE_ROOT_CSS, (value) => {
    IMPORTABLE_PAGE_ROOT_CSS = value;
  }), bindRuntimeValue(runtime2, "BASIC_PAGE_LAYOUT_CSS", () => BASIC_PAGE_LAYOUT_CSS, (value) => {
    BASIC_PAGE_LAYOUT_CSS = value;
  }), bindRuntimeValue(runtime2, "IMPORTABLE_PAGE_LAYOUT_CSS", () => IMPORTABLE_PAGE_LAYOUT_CSS, (value) => {
    IMPORTABLE_PAGE_LAYOUT_CSS = value;
  }), bindRuntimeValue(runtime2, "PAGE_PAGER_CSS", () => PAGE_PAGER_CSS, (value) => {
    PAGE_PAGER_CSS = value;
  }), bindRuntimeValue(runtime2, "BASIC_PAGE_MOBILE_CSS", () => BASIC_PAGE_MOBILE_CSS, (value) => {
    BASIC_PAGE_MOBILE_CSS = value;
  }), bindRuntimeValue(runtime2, "IMPORTABLE_PAGE_MOBILE_CSS", () => IMPORTABLE_PAGE_MOBILE_CSS, (value) => {
    IMPORTABLE_PAGE_MOBILE_CSS = value;
  }), bindRuntimeValue(runtime2, "PAGE_STAGE_CSS", () => PAGE_STAGE_CSS, (value) => {
    PAGE_STAGE_CSS = value;
  }), bindRuntimeValue(runtime2, "BASIC_PAGE_PRINT_CSS", () => BASIC_PAGE_PRINT_CSS, (value) => {
    BASIC_PAGE_PRINT_CSS = value;
  }), bindRuntimeValue(runtime2, "IMPORTABLE_PAGE_PRINT_CSS", () => IMPORTABLE_PAGE_PRINT_CSS, (value) => {
    IMPORTABLE_PAGE_PRINT_CSS = value;
  }), bindRuntimeValue(runtime2, "htmlFontNoticePreamble", () => htmlFontNoticePreamble, (value) => {
    htmlFontNoticePreamble = value;
  }), bindRuntimeValue(runtime2, "initializeDeckHtml", () => initializeDeckHtml, (value) => {
    initializeDeckHtml = value;
  }), () => {
    deckHtmlExports = {}, (0, runtime2.defineLiveExports)(deckHtmlExports, {
      htmlFilename: () => htmlFilename,
      renderDeckHtml: () => renderDeckHtml
    }), WEB_FONT_OFFLINE_NOTE = "a web font could not be included in the file; its text keeps that typeface only while online", WEB_FONT_BUDGET_NOTE = "some web fonts were too large to include in the file; their text keeps those typefaces only while online", LIVE_EXPORTED_EMBEDS = !0, EXPORTED_FONT_BUDGET = 1048576, HTML_REBUILD_TIMEOUT_MS = 2e3, FONT_PACK_TIMEOUT_MS = 4e3, HOSTED_HTML_OVERHEAD_BYTES = 131072, UNSAFE_EXPORT_ELEMENT_SELECTOR = "script,noscript,iframe,object,embed,frame,template,xmp,plaintext,noembed,noframes,base,link,meta,animate,set,video,audio,source,track", EXPORTED_PAGE_LABEL_MAX = 80, EXPORTED_HTML_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data: blob:; media-src 'none'; frame-src about:; child-src about:; worker-src 'none'; connect-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'", BASIC_PAGE_MOBILE_CSS = "@media (max-aspect-ratio:1/1){html{scroll-snap-type:y proximity}.deck-slide{height:auto;padding:6px 0;scroll-snap-stop:normal}.deck-slide:first-child{padding-top:0}}", IMPORTABLE_PAGE_MOBILE_CSS = "@media (max-aspect-ratio:1/1){html.deck-js{scroll-snap-type:y proximity}.deck-js .deck-slide{height:auto;padding:6px 0;scroll-snap-stop:normal}.deck-js .deck-slide:first-child{padding-top:0}}", BASIC_PAGE_PRINT_CSS = "@media print{html,body{background:none;overflow:visible;height:auto;color-scheme:light}.deck-slide{display:block;height:auto;padding:0;break-after:page;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact}.deck-slide:last-child{break-after:auto;page-break-after:auto}.deck-fit{width:auto;height:auto}.deck-scaler{transform:none}.deck-pager{display:none}iframe{display:none!important}}", IMPORTABLE_PAGE_PRINT_CSS = "@media print{html,html.deck-js,body{background:none;overflow:visible;height:auto;color-scheme:light}:root .deck-slide{display:block;height:auto;padding:0;break-after:page;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact}:root .deck-slide:last-child{break-after:auto;page-break-after:auto}:root .deck-fit{width:auto;height:auto}:root .deck-scaler{transform:none}.deck-pager{display:none}iframe{display:none!important}}", initializeDeckHtml = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeEmbeds)(), (0, runtime2.initializeGoogleFontLicences)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeBuildEffects)(), (0, runtime2.initializeSlideRenderer)(), (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeFontFetching)(), (0, runtime2.initializeCaptureFallback)(), (0, runtime2.initializePdfCapture)(), (0, runtime2.initializeImageShrinking)(), (0, runtime2.initializeFontInlining)(), htmlFontNoticePreamble = "The font files embedded in this page (the data: URLs in the @font-face rules above, each in place of a fonts.gstatic.com address) are the files Google Fonts served when the page was saved, byte for byte. Google Fonts serves subsets of a family, one file per range of characters, so they may not be a family’s complete files. The license of each family follows; each family stays under its own license. If you pass this file on, keep this comment in it.", EXPORT_LENGTH_STYLE_PATTERN = /^padding|^border(-\w+)*-width$/, EXPORTED_CANVAS_WIDTH = String(runtime2.SLIDE_WIDTH), EXPORTED_CANVAS_HEIGHT = String(runtime2.SLIDE_HEIGHT), BASIC_PAGE_ROOT_CSS = [
        "html{overflow:hidden auto;scroll-snap-type:y mandatory;scrollbar-width:none;background:#000;color-scheme:dark}",
        "html::-webkit-scrollbar{display:none}",
        "body{margin:0;background:#000;overflow:visible}",
        "main{color-scheme:light}"
      ], IMPORTABLE_PAGE_ROOT_CSS = [
        "html{background:#000;color-scheme:dark}",
        "html.deck-js{overflow:hidden auto;scroll-snap-type:y mandatory;scrollbar-width:none}",
        "html.deck-js::-webkit-scrollbar{display:none}",
        "body{margin:0;background:#000;overflow:visible}",
        "main{color-scheme:light}"
      ], BASIC_PAGE_LAYOUT_CSS = [
        ".deck-slide{height:100vh;height:100dvh;display:flex;align-items:center;justify-content:center;overflow:hidden;scroll-snap-align:start;scroll-snap-stop:always}",
        ".deck-fit{flex:none;position:relative;width:calc(" + EXPORTED_CANVAS_WIDTH + "px*var(--deck-s,.5));height:calc(" + EXPORTED_CANVAS_HEIGHT + "px*var(--deck-s,.5));overflow:hidden}",
        ".deck-scaler{width:" + EXPORTED_CANVAS_WIDTH + "px;height:" + EXPORTED_CANVAS_HEIGHT + "px;transform:scale(var(--deck-s,.5));transform-origin:0 0}"
      ], IMPORTABLE_PAGE_LAYOUT_CSS = [
        ".deck-slide{display:block;width:" + EXPORTED_CANVAS_WIDTH + "px;height:" + EXPORTED_CANVAS_HEIGHT + "px}",
        ".deck-fit{position:relative;width:" + EXPORTED_CANVAS_WIDTH + "px;height:" + EXPORTED_CANVAS_HEIGHT + "px;overflow:hidden}",
        ".deck-scaler{width:" + EXPORTED_CANVAS_WIDTH + "px;height:" + EXPORTED_CANVAS_HEIGHT + "px}",
        ".deck-js .deck-slide{width:auto;height:100vh;height:100dvh;display:flex;align-items:center;justify-content:center;overflow:hidden;scroll-snap-align:start;scroll-snap-stop:always}",
        ".deck-js .deck-fit{flex:none;width:calc(" + EXPORTED_CANVAS_WIDTH + "px*var(--deck-s));height:calc(" + EXPORTED_CANVAS_HEIGHT + "px*var(--deck-s))}",
        ".deck-js .deck-scaler{transform:scale(var(--deck-s));transform-origin:0 0}"
      ], PAGE_PAGER_CSS = [
        ".deck-pager{position:fixed;z-index:3;right:16px;bottom:16px;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.7);color:#fff;font:12px/1.5 system-ui,sans-serif;font-variant-numeric:tabular-nums;opacity:0;transition:opacity .3s;pointer-events:none}",
        ".deck-pager[data-on]{opacity:1}"
      ], PAGE_STAGE_CSS = [
        "@media screen{html.deck-stage{overflow:hidden}.deck-stage body{overflow:hidden}.deck-stage main{position:fixed;inset:0}.deck-stage .deck-slide{position:absolute;inset:0;height:auto;padding:0;z-index:1}.deck-stage .deck-slide[data-off]{opacity:0;pointer-events:none;z-index:0}.deck-stage .deck-slide[data-leaving]{z-index:2;pointer-events:none}.deck-stage [data-build-hidden],.deck-stage [data-magic-hidden],.deck-stage [data-embed-under],.deck-stage [data-embed-dead] [data-embed-pic]{visibility:hidden}.deck-stage [data-embed-dead-label]{display:flex}}",
        "[data-embed-dead-label]{display:none}",
        "@page{size:" + EXPORTED_CANVAS_WIDTH + "px " + EXPORTED_CANVAS_HEIGHT + "px;margin:0}"
      ];
    });
  };
}
export {
  installExportDeckHtml
};
