// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportPdfCapture(runtime2) {
  var pdfCaptureExports, PdfCaptureReact, PdfCaptureReactDomClient, pdfDefaultRasterScale, pdfDefaultJpegQuality, pdfCaptureQualityLadder, pdfMinimumCaptureTimeMs, pdfMaximumPageCaptureTimeMs, pdfFinalizationTimeReserveMs, pdfCaptureBudgetMultiplier, pdfFontsReadyTimeoutMs, pdfFontInliningBudget, maxFontFetchCacheEntries, fontFetchFallbackWarning, fontInliningBudgetWarning, localFontSourcePattern, fetchLocalFontDataUrl, uncapturedEmbedWarning, textRunBaselineDescentFactor, pdfMaximumTextRunFontSize, pdfMaximumTextCoordinate, maxCapturedSlideTextCharacters, maxCapturedTextRangeCharacters, ignoredTextCaptureElementNames, headingElementNames, pdfSlideWidthPoints, pdfSlideHeightPoints, initializePdfCapture;
  function notePageMissingFonts(findings, families, text) {
    if (families.length === 0)
      return;
    let value = text();
    for (let family of families)
      findings.missing = !0, (0, runtime2.canvasFontIsLoaded)(family, value, 400, !1) === !0 ? findings.missingInstalled = !0 : findings.missingUnloaded = !0;
  }
  bindRuntimeValue(runtime2, "notePageMissingFonts", () => notePageMissingFonts);
  function missingFontsWarning(css, deadline, fontFaces, requiredFamilies) {
    let familyKey = (input) => input.family.replace(/["']/g, "").toLowerCase(), usedFamilies = new Set(fontFaces.map(familyKey)), loadedFamilies = new Set(fontFaces.filter((state) => state.status === "loaded").map(familyKey)), requiredFamilyNames = new Set(requiredFamilies.map((input) => input.toLowerCase())), loadingFamilies = (0, runtime2.uniqueFontFamilyNames)(fontFaces.filter((state) => state.status === "error")).filter((input) => !loadedFamilies.has(input.toLowerCase())), value = (0, runtime2.googleFontImports)(css).hrefs.flatMap(runtime2.googleFontUrlFamilies).filter((input) => !usedFamilies.has(input.toLowerCase())), value2 = [...loadingFamilies, ...value].filter((input) => !requiredFamilyNames.has(input.toLowerCase()));
    if (value2.length === 0)
      return [];
    let value3 = (0, runtime2.fontUsageHints)(css, deadline()).replace(/&quot;|&#39;/g, "'"), callback = (input) => new RegExp(`(?:^|[\\s'",:;(>])` + input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + `\\s*(?:$|['",;&)}<])`).test(value3), items = [];
    for (let value4 of value2) {
      let value5 = value4.toLowerCase();
      requiredFamilyNames.has(value5) || !callback(value5) || (requiredFamilyNames.add(value5), items.push(value4));
    }
    return items;
  }
  function missingGoogleFontFamilies(css) {
    let documentFamilies = new Set([...(0, runtime2.documentFontSet)()].map((input) => input.family.replace(/["']/g, "").toLowerCase()));
    return (0, runtime2.googleFontImports)(css).hrefs.flatMap(runtime2.googleFontUrlFamilies).filter((input) => !documentFamilies.has(input.toLowerCase()));
  }
  async function waitForGoogleFontRegistration(css, deadline) {
    let initialMissing = missingGoogleFontFamilies(css).length, missing2 = initialMissing;
    for (; missing2 > 0 && Date.now() < deadline; )
      await new Promise((input) => setTimeout(input, 100)), missing2 = missingGoogleFontFamilies(css).length;
    return missing2 < initialMissing;
  }
  function throwIfExportAborted(signal) {
    if (signal?.aborted === !0)
      throw signal.reason ?? new DOMException("export cancelled", "AbortError");
  }
  function remainingCaptureTimeBudget(pageNumber, deadline, predictedCopyMs, predictedCaptureMs, completedPages = 0) {
    let remaining = deadline - (pageNumber - 1 + completedPages) * predictedCopyMs * pdfCaptureBudgetMultiplier, captureReserve = (pageNumber - 1) * (predictedCaptureMs ?? 0) * pdfCaptureBudgetMultiplier;
    return !(remaining > 0) || (predictedCaptureMs ?? 0) + captureReserve > remaining ? 0 : Math.min(pdfMaximumPageCaptureTimeMs, remaining - captureReserve);
  }
  function createAdaptiveCaptureBudget(pageCount, totalBudget, losslessBudget = Number.POSITIVE_INFINITY, overhead = 0, now = () => performance.now()) {
    let value = Number.isFinite(losslessBudget) ? pageCount : 0, value2 = Number.isFinite(losslessBudget) ? totalBudget - overhead * pdfCaptureBudgetMultiplier : totalBudget, index4 = 0, index22 = 0, index32 = 0, index42 = 0, index5 = 0, index6 = 0;
    return {
      slide() {
        index22 = now();
      },
      get overSize() {
        return index6 * pageCount > losslessBudget * index4;
      },
      limit() {
        let value3 = now();
        return remainingCaptureTimeBudget(pageCount - index4, value2 - value3, (index32 + value3 - index22) / (index4 + 1), index5 > 0 ? index42 / index5 : void 0, value);
      },
      done(input, options) {
        input !== void 0 && (index42 += input, index5++), index32 += now() - index22 - (input ?? 0), index6 += options, index4++;
      },
      get copyMs() {
        return index42;
      }
    };
  }
  function canvasImageBytes(canvas, options) {
    let dataUrl = canvas.toDataURL(options.mime, options.quality), prefix = "data:" + options.mime + ";base64,";
    if (dataUrl.startsWith(prefix))
      try {
        let value = atob(dataUrl.slice(prefix.length)), value2 = new Uint8Array(value.length);
        for (let index4 = 0; index4 < value.length; index4++)
          value2[index4] = value.charCodeAt(index4);
        return value2;
      } catch {
        return;
      }
  }
  function documentStylesheetCss() {
    let css = [];
    for (let value of Array.from(document.styleSheets)) {
      let value2;
      try {
        value2 = value.cssRules;
      } catch {
        continue;
      }
      for (let value3 of Array.from(value2))
        css.push(value3.cssText);
    }
    return css.join(`
`);
  }
  async function captureFontCss(styles, warnings, slideText, readThemeCss, includeLoading, fontFaces = !1, failedUrls = [], argument = /* @__PURE__ */ new Set()) {
    let css = documentStylesheetCss(), usageHints = (0, runtime2.fontUsageHints)(css, readThemeCss()), isUsed = (input) => usageHints.includes(input), fetchFont = async (input) => {
      if (argument.has(input))
        throw Error("failed earlier in this capture");
      return fetchLocalFontDataUrl(input).catch((input2) => {
        throw argument.add(input), input2;
      });
    }, value = await inlineLocalFonts((0, runtime2.removeUnusedFontFaces)(css, usageHints), styles, fetchFont, warnings, failedUrls);
    return includeLoading.packWebFonts !== !0 ? inlineGoogleFontsFallback(value, styles, void 0, void 0, void 0, warnings, isUsed) : captureInlineFontCss(value, styles, slideText(), {
      familyNamed: isUsed,
      batch: maxFontFetchCacheEntries,
      ...fontFaces && {
        loadedFaces: "settled"
      }
    }, fontFaces || failedUrls.length > 0, warnings);
  }
  async function captureInlineFontCss(css, warnings, text, fetchOptions = {}, localOnly = !1, state = {}) {
    let result = await (0, runtime2.inlineGoogleFontFaces)(css, {
      budget: pdfFontInliningBudget,
      ...fetchOptions,
      text
    });
    if (result.requested && (state.webRequested = !0), result.css === "" && !result.unavailable && !result.overBudget && text.trim() !== "" && !localOnly)
      return inlineGoogleFontsFallback(css, warnings, fetchOptions.fetchText, fetchOptions.fetchDataUrl, fetchOptions.faceInUse, state, fetchOptions.familyNamed);
    result.unavailable && (warnings.push(fontFetchFallbackWarning), state.missing = state.missingWebFetch = !0, (0, runtime2.noteWebFontFailures)(state, result.failures)), result.overBudget && (warnings.push(fontInliningBudgetWarning), state.overBudget = !0);
    let flag = !1;
    return css.replace(runtime2.googleFontsImportRegex, () => flag ? "" : (flag = !0, result.css));
  }
  async function inlineGoogleFontsFallback(css, warnings, fetchText = runtime2.fetchFontStylesheet, fetchDataUrl = runtime2.fetchFontDataUrl, available = runtime2.googleFontVariantAvailable, options = {}, used = () => !0) {
    let { hrefs, optional } = (0, runtime2.googleFontImports)(css);
    if (hrefs.length === 0)
      return css;
    let inlinedSheets = new Map(hrefs.map((input) => [input, ""])), unavailable = /* @__PURE__ */ new Set(), overBudget = !1, failures = {}, noteFailure = (stage, error) => {
      overBudget = failures[stage] = failures[(0, runtime2.fetchFailureKind)(error)] = !0;
    };
    return await Promise.all([...inlinedSheets.keys()].map(async (input) => {
      if (optional.has(input) && !available(input) || !(0, runtime2.googleFontUrlFamilies)(input).some((input2) => used(input2.toLowerCase()))) {
        unavailable.add(input);
        return;
      }
      options.webRequested = options.webAllFiles = !0;
      try {
        let value = await fetchText(input), entries = /* @__PURE__ */ new Map();
        for (let value2 of value.matchAll(runtime2.googleFontFileUrlRegex))
          entries.set(value2[2], "");
        await Promise.all([...entries.keys()].map(async (input2) => {
          try {
            entries.set(input2, await fetchDataUrl(input2));
          } catch (error) {
            noteFailure("file", error);
          }
        })), inlinedSheets.set(input, value.replace(runtime2.googleFontFileUrlRegex, (input2, options2, context) => entries.get(context) ? 'url("' + entries.get(context) + '")' : input2));
      } catch (error) {
        noteFailure("sheet", error);
      }
    })), overBudget && (warnings.push("a linked web font could not be fetched; its text exports in the fallback font"), options.missing = options.missingWebFetch = !0, (0, runtime2.noteWebFontFailures)(options, failures)), css.replace(runtime2.googleFontsImportRegex, (input, options2, context) => inlinedSheets.get(context) || (optional.has(context) || unavailable.has(context) ? "" : input));
  }
  async function inlineLocalFonts(css, warnings, fetchDataUrl = fetchLocalFontDataUrl, options = {}, ignoredFamilies = []) {
    let urls = /* @__PURE__ */ new Set();
    for (let value of css.matchAll(localFontSourcePattern))
      urls.add(value[3]);
    if (urls.size === 0)
      return css;
    let ignored = new Set(ignoredFamilies.map((input) => input.toLowerCase())), faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [], callback = (input) => /font-family\s*:\s*["']?([^"';}]+)/.exec(faces.find((input2) => input2.includes(input)) ?? "")?.[1]?.trim().toLowerCase(), entries = /* @__PURE__ */ new Map(), flag = !1;
    return await Promise.all([...urls].filter((input) => !ignored.has(callback(input) ?? "")).map(async (input) => {
      try {
        entries.set(input, await fetchDataUrl(input));
      } catch {
        flag = !0;
      }
    })), flag && (warnings.push("a typeface file could not be fetched; its text exports in the fallback font"), options.missing = options.missingFileFetch = !0), css.replace(localFontSourcePattern, (input, options2, context, value) => {
      let entry = entries.get(value);
      return entry === void 0 ? input : 'url("' + entry + '")';
    });
  }
  async function decodeExportImages(root) {
    let warnings = [], images = Array.from(root.querySelectorAll("img"));
    return await Promise.all(images.map((input) => input.decode().catch(() => {
      warnings.push("an image failed to decode and may render blank in the export");
    }))), warnings;
  }
  function slideForeignObjectSvg(element, css, width, replacements) {
    let clone = element.cloneNode(!0);
    for (let value2 of Array.from(clone.querySelectorAll("script")))
      value2.remove();
    replaceEmbedPlaceholders(clone, replacements);
    for (let value2 of Array.from(clone.querySelectorAll("img")))
      value2.setAttribute("decoding", "sync");
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    let callback = (input) => input.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""), value = '<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;font:' + width.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;") + '">' + callback(new XMLSerializer().serializeToString(clone)) + "</div>";
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + String(runtime2.SLIDE_WIDTH) + '" height="' + String(runtime2.SLIDE_HEIGHT) + '"><foreignObject width="' + String(runtime2.SLIDE_WIDTH) + '" height="' + String(runtime2.SLIDE_HEIGHT) + '"><style><![CDATA[' + css.replaceAll("]]>", "]]]]><![CDATA[>") + "]]></style>" + value + "</foreignObject></svg>";
  }
  function rasterizeSlideSvg(element, css, width, replacements, options) {
    let svg = slideForeignObjectSvg(element, css, width, replacements), dataUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    return new Promise((input, options2) => {
      let value = new Image(), value2 = setTimeout(() => {
        options2(Error("timed out rendering the slide"));
      }, pdfFontsReadyTimeoutMs);
      value.onerror = () => {
        clearTimeout(value2);
        let text = "";
        try {
          let element2 = new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror");
          element2?.textContent != null && (text = ": " + element2.textContent.replace(/\s+/g, " ").slice(0, 200));
        } catch {
        }
        options2(Error("the slide could not be rendered" + text));
      }, value.onload = () => {
        clearTimeout(value2);
        try {
          let value3 = document.createElement("canvas");
          value3.width = Math.round(runtime2.SLIDE_WIDTH * options.scale), value3.height = Math.round(runtime2.SLIDE_HEIGHT * options.scale);
          let value4 = value3.getContext("2d");
          if (value4 === null)
            throw Error("no 2d canvas in this host");
          value4.fillStyle = "#fff", value4.fillRect(0, 0, value3.width, value3.height), value4.drawImage(value, 0, 0, value3.width, value3.height);
          try {
            value4.getImageData(0, 0, 1, 1);
          } catch {
            throw Error("the slide uses content that can't be exported (embedded web content)");
          }
          let value5 = canvasImageBytes(value3, options);
          if (value5 === void 0)
            throw Error("this browser could not encode the slide as " + (options.mime === "image/png" ? "PNG" : "JPEG"));
          let value6 = options.lossless?.() ?? 0;
          if (!(value6 > 0)) {
            input({
              bytes: value5
            });
            return;
          }
          let value7 = performance.now();
          (0, runtime2.deflatePagePixels)(value4, value3.width, value3.height, value5.length, value6).then((input2) => input({
            bytes: value5,
            lossless: input2,
            losslessMs: performance.now() - value7
          }), (input2) => input({
            bytes: value5,
            losslessMs: performance.now() - value7,
            losslessError: input2 instanceof Error && input2.message === runtime2.compressionTimeoutMessage ? "too slow" : "unreadable"
          }));
        } catch (value3) {
          options2(value3 instanceof Error ? value3 : Error(String(value3)));
        }
      }, value.src = dataUri;
    });
  }
  async function rasterizeEmbedFrames(host, slides, warnings) {
    let captures = /* @__PURE__ */ new Map(), requests = [];
    if (slides.forEach((input, options) => {
      let value2 = host.querySelector('[data-pdf-slide="' + String(options) + '"]')?.firstElementChild;
      if (value2)
        for (let value3 of input.frames) {
          if (value3.node.kind !== "html")
            continue;
          let value4 = value2.querySelector('[data-frame-id="' + value3.id + '"] [data-node-path=""]')?.getBoundingClientRect();
          if (value4 === void 0 || value3.node.html === "" || value4.width <= 0 || value4.height <= 0) {
            warnings.push(uncapturedEmbedWarning);
            continue;
          }
          requests.push({
            key: String(options) + "/" + value3.id,
            html: value3.node.html,
            w: value4.width,
            h: value4.height,
            slide: options,
            frameId: value3.id
          });
        }
    }), requests.length === 0)
      return captures;
    let value = await (0, runtime2.captureHtmlEmbeds)(requests);
    for (let value2 of requests) {
      let entry = value.get(value2.key);
      if (entry === void 0) {
        warnings.push(uncapturedEmbedWarning);
        continue;
      }
      let entry2 = captures.get(value2.slide);
      entry2 === void 0 && (entry2 = /* @__PURE__ */ new Map(), captures.set(value2.slide, entry2)), entry2.set(value2.frameId, entry.dataUri);
    }
    return captures;
  }
  function labelUncapturedEmbeds(host, slides, captures) {
    slides.forEach((input, options) => {
      for (let value of input.frames) {
        if (value.node.kind !== "html" || captures.get(options)?.has(value.id))
          continue;
        let element = host.querySelector('[data-pdf-slide="' + String(options) + '"] [data-frame-id="' + value.id + '"] [data-node-path=""]');
        element !== null && (element.textContent = "Interactive web embed: not captured for export");
      }
    });
  }
  function replaceEmbedPlaceholders(root, captures) {
    if (captures !== void 0)
      for (let [value, value2] of captures) {
        let element = root.querySelector('[data-frame-id="' + value + '"] [data-node-path=""]');
        if (element === null)
          continue;
        let value3 = element.ownerDocument.createElement("img");
        value3.setAttribute("src", value2), value3.setAttribute("alt", "网页嵌入内容"), value3.setAttribute("style", "display:block;width:100%;height:100%"), element.replaceWith(value3);
      }
  }
  function capturedTextRunToPdf(run) {
    return {
      text: run.text,
      xPt: run.x / 2,
      yPt: pdfSlideHeightPoints - run.y / 2,
      sizePt: run.sizePx / 2,
      widthPt: run.w / 2
    };
  }
  function runWithinPdfWriterLimits(run) {
    return run.sizePt <= pdfMaximumTextRunFontSize && run.widthPt <= pdfMaximumTextCoordinate && Math.abs(run.xPt) <= pdfMaximumTextCoordinate && Math.abs(run.yPt) <= pdfMaximumTextCoordinate;
  }
  function isUtf16LowSurrogate(text, index4) {
    let value = text.charCodeAt(index4);
    return value >= 56320 && value <= 57343;
  }
  function renderedTextLineRanges(textNode, range) {
    let length = textNode.data.length, items = [], index4 = 0;
    for (let count = 1; count <= length; count++) {
      range.setStart(textNode, index4), range.setEnd(textNode, count);
      let index22 = 0;
      for (let value of Array.from(range.getClientRects()))
        value.width > 0.01 && value.height > 0.01 && index22++;
      index22 > 1 && count - 1 > index4 ? (items.push({
        start: index4,
        end: count - 1
      }), index4 = count - 1) : count - index4 >= maxCapturedTextRangeCharacters && !isUtf16LowSurrogate(textNode.data, count) && (items.push({
        start: index4,
        end: count
      }), index4 = count);
    }
    return length > index4 && items.push({
      start: index4,
      end: length
    }), items;
  }
  function collectRenderedTextRuns(root, slide, warnings, anchors, language) {
    let ownerDocument2 = root.ownerDocument, items = [], items2 = [], entries = /* @__PURE__ */ new Map(), blocksOf = (element) => element.querySelector("li") !== null ? Array.from(element.children) : [element], callback = (element) => {
      if (items2.length >= runtime2.maxPdfStructureBlocks)
        return;
      let value4 = element.getAttribute("role") === "heading" ? Number(element.getAttribute("aria-level")) : NaN, length = items2.length, element2 = element.matches("ul, ol") ? element.querySelector("li") : null;
      if (element.hasAttribute("data-icon-path"))
        items2.push({
          role: "Artifact"
        });
      else if (element2 !== null) {
        let value5 = (0, runtime2.pdfListNumbering)(getComputedStyle(element2).listStyleType);
        items2.push(value5 === void 0 ? {
          role: "L"
        } : {
          role: "L",
          numbering: value5
        });
      } else
        items2.push({
          role: headingElementNames[value4 - 1] ?? "P"
        });
      return entries.set(element, length), length;
    }, entries2 = /* @__PURE__ */ new Map(), values = /* @__PURE__ */ new Set(), index4 = 0, callback2 = (input) => {
      let parentElement = input.parentElement;
      if (parentElement === null || values.has(parentElement) || (values.add(parentElement), items2.length >= runtime2.maxPdfStructureBlocks))
        return;
      let value4 = Array.from(parentElement.children).filter((input2) => input2.hasAttribute("data-cell")), callback7 = (element) => (element.getAttribute("data-cell") ?? "").split(".").map(Number), value5 = Math.max(...value4.map((input2) => callback7(input2)[0] ?? NaN)) + 1, value6 = Math.max(...value4.map((input2) => callback7(input2)[1] ?? NaN)) + 1;
      if (!Number.isInteger(value5) || !Number.isInteger(value6) || value5 < 1 || value6 < 1 || index4 + value5 * value6 > runtime2.maxPdfStructureBlocks)
        return;
      index4 += value5 * value6;
      let value7 = parentElement.closest("[data-frame-id]")?.getAttribute("data-frame-id") ?? "", value8 = Math.max(0, Math.min(value5, Math.floor(anchors?.(value7, parentElement.getAttribute("data-node-path") ?? "") ?? 0))), length = items2.length;
      items2.push(value8 > 0 ? {
        role: "Table",
        rows: value5,
        cols: value6,
        headerRows: value8
      } : {
        role: "Table",
        rows: value5,
        cols: value6
      });
      for (let value9 of value4) {
        let [value10, value11] = callback7(value9);
        value10 !== void 0 && value11 !== void 0 && Number.isInteger(value10) && Number.isInteger(value11) && value10 >= 0 && value11 >= 0 && entries2.set(value9, {
          block: length,
          cell: value10 * value6 + value11
        });
      }
    }, callback3 = (input) => {
      let ancestor = input.closest("[data-text-path], [data-cell], [data-icon-path], [data-img-path]");
      if (ancestor === null || !root.contains(ancestor))
        return {};
      if (ancestor.hasAttribute("data-cell"))
        return entries2.has(ancestor) || callback2(ancestor), entries2.get(ancestor) ?? {};
      let block = blocksOf(ancestor).find((input2) => input2.contains(input)) ?? ancestor, value4 = entries.get(block) ?? callback(block);
      return value4 === void 0 ? {} : items2[value4].role !== "L" ? {
        block: value4
      } : {
        block: value4,
        item: Math.min(runtime2.maxPdfStructureBlocks - 1, Math.max(0, Array.prototype.indexOf.call(block.querySelectorAll("li"), input.closest("li"))))
      };
    }, flag = !1, value = ownerDocument2.createTreeWalker(root, NodeFilter.SHOW_TEXT), value2 = ownerDocument2.createRange(), entries3 = /* @__PURE__ */ new Map(), callback4 = (input) => {
      let entry = entries3.get(input);
      if (entry !== void 0)
        return entry;
      let value4 = input instanceof HTMLElement || input instanceof SVGElement ? input.style.visibility : "", value5;
      return value4 === "hidden" || value4 === "collapse" ? value5 = !0 : value4 === "visible" ? value5 = !1 : value5 = input !== root && input.parentElement !== null ? callback4(input.parentElement) : !1, entries3.set(input, value5), value5;
    }, entries4 = /* @__PURE__ */ new Map(), callback5 = (input) => {
      let entry = entries4.get(input);
      if (entry !== void 0)
        return entry;
      let value4 = parseFloat(getComputedStyle(input).opacity) <= 0 || (input !== root && input.parentElement !== null ? callback5(input.parentElement) : !1);
      return entries4.set(input, value4), value4;
    }, entries5 = /* @__PURE__ */ new Map(), entries6 = /* @__PURE__ */ new Map(), entries7 = /* @__PURE__ */ new Map(), callback6 = (input) => {
      if (input === root)
        return;
      if (entries7.has(input))
        return entries7.get(input);
      let value4 = input.parentElement !== null ? callback6(input.parentElement) : void 0, value5 = getComputedStyle(input);
      if (value5.overflowY === "clip" || value5.overflowY === "hidden") {
        let bounds = input.getBoundingClientRect(), value6 = bounds.top + (parseFloat(value5.borderTopWidth) || 0), value7 = bounds.bottom - (parseFloat(value5.borderBottomWidth) || 0);
        value4 = value4 === void 0 ? {
          top: value6,
          bottom: value7
        } : {
          top: Math.max(value4.top, value6),
          bottom: Math.min(value4.bottom, value7)
        };
      }
      return entries7.set(input, value4), value4;
    };
    for (let value4 of Array.from(root.querySelectorAll("[data-text-path], [data-cell], [data-img-path], [data-icon-path]"))) {
      if (value4.hasAttribute("data-cell")) {
        entries2.has(value4) || callback2(value4);
        continue;
      }
      if (!value4.hasAttribute("data-img-path")) {
        for (let block of blocksOf(value4))
          entries.has(block) || callback(block);
        continue;
      }
      let ancestor = value4.closest('[aria-hidden="true"]');
      if (ancestor !== null && root.contains(ancestor))
        continue;
      if ((value4.textContent ?? "").trim() !== "") {
        callback(value4);
        continue;
      }
      if (callback4(value4) || callback5(value4) || getComputedStyle(value4).display === "none")
        continue;
      let value5 = value4.tagName === "IMG" ? value4 : value4.querySelector("img"), value6 = (value5 !== null ? value5.getAttribute("alt") ?? "" : value4.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim();
      if (value6 === "")
        continue;
      let bounds = value4.getBoundingClientRect(), value7 = callback6(value4), state = {
        left: bounds.left,
        width: bounds.width,
        top: Math.max(bounds.top, value7?.top ?? -1 / 0),
        bottom: Math.min(bounds.bottom, value7?.bottom ?? 1 / 0)
      };
      if (state.width <= 0.01 || state.bottom - state.top <= 0.01)
        continue;
      let state2 = {
        xPt: (state.left - slide.left) / 2,
        yPt: pdfSlideHeightPoints - (state.bottom - slide.top) / 2,
        widthPt: state.width / 2,
        heightPt: (state.bottom - state.top) / 2
      };
      items2.length >= runtime2.maxPdfStructureBlocks || ![state2.xPt, state2.yPt, state2.widthPt, state2.heightPt].every((input) => Number.isFinite(input) && Math.abs(input) <= pdfMaximumTextCoordinate) || (entries.set(value4, items2.length), items2.push({
        role: "Figure",
        alt: value6,
        box: state2
      }));
    }
    let index22 = 0, value3, flag2 = !1;
    for (let value4 = value.nextNode(); value4 !== null; value4 = value.nextNode()) {
      let value5 = value4;
      if (value5.data.trim() === "") {
        value5.data !== "" && (flag2 = !0);
        continue;
      }
      let parentElement = value5.parentElement;
      if (parentElement === null || ignoredTextCaptureElementNames.has(parentElement.tagName))
        continue;
      if (warnings !== void 0 && warnings.size > 0) {
        let entry2 = entries6.get(parentElement);
        if (entry2 === void 0) {
          let ancestor = parentElement.closest("[data-frame-id]");
          entry2 = ancestor !== null && warnings.has(ancestor.getAttribute("data-frame-id") ?? ""), entries6.set(parentElement, entry2);
        }
        if (entry2)
          continue;
      }
      let entry = entries5.get(parentElement);
      if (entry === void 0) {
        let value8 = getComputedStyle(parentElement);
        entry = {
          ok: !callback4(parentElement) && value8.display !== "none" && !callback5(parentElement),
          sizePx: parseFloat(value8.fontSize),
          clip: callback6(parentElement)
        }, entries5.set(parentElement, entry);
      }
      if (!entry.ok || !Number.isFinite(entry.sizePx) || entry.sizePx <= 0) {
        flag2 = !0;
        continue;
      }
      if (index22 += value5.data.length, index22 > maxCapturedSlideTextCharacters) {
        flag = !0;
        break;
      }
      let value6 = language === void 0 ? null : parentElement.closest("a"), value7 = value6 !== null && root.contains(value6) ? language.get(value6) : void 0;
      for (let value8 of renderedTextLineRanges(value5, value2)) {
        let value9 = value5.data.slice(value8.start, value8.end);
        if (value9.trim() === "") {
          flag2 = !0;
          continue;
        }
        value2.setStart(value5, value8.start), value2.setEnd(value5, value8.end);
        let bounds = value2.getBoundingClientRect();
        if (bounds.width <= 0.01 || bounds.height <= 0.01) {
          flag2 = !0;
          continue;
        }
        if (entry.clip !== void 0 && (bounds.top + bounds.height / 2 > entry.clip.bottom || bounds.bottom - bounds.height / 2 < entry.clip.top)) {
          flag2 = !0;
          continue;
        }
        let value10 = bounds.left - slide.left, value11 = bounds.top - slide.top;
        if (value10 >= runtime2.SLIDE_WIDTH || value10 + bounds.width <= 0 || value11 >= runtime2.SLIDE_HEIGHT || value11 + bounds.height <= 0) {
          flag2 = !0;
          continue;
        }
        let value12 = Math.min(runtime2.SLIDE_HEIGHT, Math.max(0, value11 + bounds.height / 2 + entry.sizePx * textRunBaselineDescentFactor)), value13 = capturedTextRunToPdf({
          text: value9,
          x: value10,
          y: value12,
          sizePx: entry.sizePx,
          w: bounds.width
        });
        if (!runWithinPdfWriterLimits(value13)) {
          flag2 = !0;
          continue;
        }
        let value14 = value7 === void 0 ? callback3(parentElement) : {
          ...callback3(parentElement),
          link: value7
        }, value15 = value3 === void 0 ? "" : value3.node === value5 ? value5.data.slice(value3.end, value8.start) : value3.node.data.slice(value3.end) + value5.data.slice(0, value8.start), value16 = value3 !== void 0 && Math.abs(value12 - value3.baseline) < 0.5 * Math.max(entry.sizePx, value3.sizePx), value17 = value14.item ?? value14.cell, value18 = value3 === void 0 || value3.block !== value14.block || value3.part !== value17 || value14.block === void 0 ? void 0 : flag2 || /\s/u.test(value15) ? !0 : value3.node === value5 || value16 ? !1 : void 0;
        items.push(value18 === void 0 ? {
          ...value13,
          ...value14
        } : {
          ...value13,
          ...value14,
          spaceBefore: value18
        }), value3 = {
          block: value14.block,
          part: value17,
          node: value5,
          end: value8.end,
          baseline: value12,
          sizePx: entry.sizePx
        }, flag2 = !1;
      }
    }
    return {
      runs: items,
      blocks: items2,
      truncated: flag
    };
  }
  function renderedLinkToPdf(link) {
    let state = {
      uri: link.u,
      xPt: link.x / 2,
      yPt: pdfSlideHeightPoints - (link.y + link.h) / 2,
      widthPt: link.w / 2,
      heightPt: link.h / 2
    };
    return link.a === void 0 ? state : {
      ...state,
      anchor: link.a
    };
  }
  function renderedElementLink(element) {
    let value = element.getAttribute("href") || /(?:^|\s)(https?:\/\/\S+)$/i.exec(element.getAttribute("title") ?? "")?.[1] || "";
    return (0, runtime2.isSafeHyperlink)(value) ? value : null;
  }
  function collectRenderedLinksAndBlocks(root, anchors) {
    let value = (0, runtime2.inspectRenderedSemantics)(getComputedStyle, root, runtime2.SLIDE_WIDTH, runtime2.SLIDE_HEIGHT, {
      hrefOf: renderedElementLink,
      inlineVisibility: !0,
      ...anchors !== void 0 ? {
        anchorId: (input) => anchors.get(input) ?? anchors.set(input, anchors.size).get(input)
      } : {}
    });
    return {
      links: value.links.map(renderedLinkToPdf),
      truncated: value.truncated
    };
  }
  async function mountSlidesOffscreen(slides, assets, options = {}) {
    let host = document.createElement("div");
    host.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;z-index:-1000;overflow:hidden;width:0;height:0;", host.setAttribute("data-appifact-content", ""), document.body.appendChild(host);
    let value = PdfCaptureReactDomClient.createRoot(host), callback = () => {
      value.unmount(), host.remove();
    };
    try {
      (0, runtime2.renderReactSynchronously)(value, PdfCaptureReact.createElement("div", null, slides.map((input, options2) => PdfCaptureReact.createElement("div", {
        key: input.id,
        "data-pdf-slide": String(options2)
      }, PdfCaptureReact.createElement(runtime2.SlideSurface, {
        slide: input,
        assets,
        animate: !1
      }))))), host.offsetHeight;
      let value2 = options.fontsReadyMs === void 0 ? void 0 : Date.now() + options.fontsReadyMs, value3 = await (0, runtime2.waitForDocumentFonts)(document.fonts, options.fontsReadyMs), value4 = options.nameMissingFonts === !0 ? documentStylesheetCss() : "";
      value2 !== void 0 && options.nameMissingFonts === !0 && await waitForGoogleFontRegistration(value4, Math.min(value2, Date.now() + pdfMinimumCaptureTimeMs)) && (host.offsetHeight, value3 = await (0, runtime2.waitForDocumentFonts)(document.fonts, Math.max(0, value2 - Date.now())));
      let value5 = document.fonts.load("90px mc-anthropicons").catch(() => {
      });
      await (value2 === void 0 ? value5 : (0, runtime2.promiseWithTimeout)(value5, Math.max(0, value2 - Date.now())));
      let value6 = await decodeExportImages(host), value7 = (0, runtime2.uniqueFontFamilyNames)(value3), value8 = options.nameMissingFonts === !0 ? missingFontsWarning(value4, () => host.innerHTML, [...(0, runtime2.documentFontSet)()], value7) : [];
      return document.visibilityState === "visible" && await new Promise((input) => {
        let value9 = setTimeout(input, 1e3);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          clearTimeout(value9), input();
        }));
      }), {
        host,
        surface(input) {
          let value9 = host.querySelector('[data-pdf-slide="' + String(input) + '"]')?.firstElementChild;
          if (!value9)
            throw Error("slide " + String(input + 1) + " did not render");
          return value9;
        },
        warnings: value6,
        lateFamilies: value7,
        missingFamilies: value8,
        dispose: callback
      };
    } catch (value2) {
      throw callback(), value2;
    }
  }
  async function prepareSlidesForCapture(slides, assets, options) {
    let mounted = await mountSlidesOffscreen(slides, assets, {
      fontsReadyMs: options.fontsReadyMs,
      nameMissingFonts: options.nameMissingFonts
    });
    try {
      let value = await rasterizeEmbedFrames(mounted.host, slides, mounted.warnings);
      labelUncapturedEmbeds(mounted.host, slides, value);
      let callback = () => slides.map((input, options2) => mounted.surface(options2).textContent ?? "").join(`
`), value2 = getComputedStyle(document.body).font || "16px system-ui, sans-serif", callback2 = () => slides.map((input, options2) => mounted.surface(options2).outerHTML).join(`
`) + value2, value3 = mounted.lateFamilies.length > 0;
      value3 && mounted.warnings.push((0, runtime2.fontTimeoutWarning)(mounted.lateFamilies, "drawn")), mounted.missingFamilies.length > 0 && mounted.warnings.push((0, runtime2.fontUnavailableWarning)(mounted.missingFamilies, "drawn"));
      let value4 = value3 ? {
        late: !0
      } : {};
      notePageMissingFonts(value4, mounted.missingFamilies, callback);
      let value5 = value3 ? [...(0, runtime2.documentFontSet)()].filter((state) => state.status === "loading") : [], values = /* @__PURE__ */ new Set(), value6 = await captureFontCss(mounted.warnings, value4, callback, callback2, options, value3, mounted.missingFamilies, values);
      return {
        ...mounted,
        embedImages: value,
        fontFindings: value4,
        refreshFonts: async () => {
          for (; value5.some((state) => state.status === "loaded"); )
            value5 = value5.filter((state) => state.status === "loading"), value6 = await captureFontCss(mounted.warnings, value4, callback, callback2, options, !0, mounted.missingFamilies, values);
          value5 = value5.filter((state) => state.status === "loading");
        },
        raster: (input, options2) => rasterizeSlideSvg(mounted.surface(input), value6, value2, value.get(input), options2)
      };
    } catch (value) {
      throw mounted.dispose(), value;
    }
  }
  async function exportSlidePng(slide, assets, scale, options = {}) {
    let capture = await prepareSlidesForCapture([slide], assets, options);
    try {
      return await capture.refreshFonts(), {
        png: (await capture.raster(0, {
          mime: "image/png",
          scale
        })).bytes,
        warnings: Array.from(new Set(capture.warnings)),
        fontFindings: capture.fontFindings
      };
    } finally {
      capture.dispose();
    }
  }
  async function exportSlidesPdf(slides, assets, quality = pdfCaptureQualityLadder[0], options = {}) {
    let startedAt = performance.now(), deadline = options.deadline === void 0 ? Number.POSITIVE_INFINITY : startedAt + (options.deadline - Date.now()) - pdfFinalizationTimeReserveMs;
    throwIfExportAborted(options.signal);
    let capture = await prepareSlidesForCapture(slides, assets, options), { warnings, embedImages: value } = capture, value2 = options.losslessPages === !0 && typeof CompressionStream == "function";
    options.losslessPages === !0 && !value2 && console.warn("[pdf-export] this browser cannot compress page pixels; every slide is stored as its JPEG");
    let value3 = value2 ? createAdaptiveCaptureBudget(slides.length, deadline, options.maxBytes, performance.now() - startedAt) : void 0, state = {
      time: 0,
      size: 0,
      slow: 0,
      unreadable: []
    };
    try {
      let items = [];
      for (let index4 = 0; index4 < slides.length; index4++) {
        throwIfExportAborted(options.signal), await capture.refreshFonts(), value3?.slide();
        let value4 = capture.surface(index4), entries = /* @__PURE__ */ new Map(), items3 = [];
        try {
          let value5 = collectRenderedLinksAndBlocks(value4, entries);
          items3 = value5.links, value5.truncated && console.warn("[pdf-export] slide " + String(index4 + 1) + " has more links than the PDF keeps; the rest are not clickable");
        } catch (value5) {
          entries.clear(), console.warn("[pdf-export] slide " + String(index4 + 1) + ": links could not be measured", value5);
        }
        let items4 = [], items5 = [];
        try {
          let value5 = slides[index4], value6 = collectRenderedTextRuns(value4, value4.getBoundingClientRect(), new Set(value.get(index4)?.keys() ?? []), (input, options2) => {
            let value7 = value5.frames.find((input2) => input2.id === input), value8 = options2.split(".").filter((input2) => input2 !== "").map(Number), value9 = value7 === void 0 || value8.some((input2) => !Number.isInteger(input2) || input2 < 0) ? void 0 : (0, runtime2.nodeAtPath)(value7.node, value8);
            return value9 !== void 0 && value9.kind === "table" && value9.header ? 1 : 0;
          }, entries);
          items4 = value6.runs, items5 = value6.blocks, value6.truncated && warnings.push("slide " + String(index4 + 1) + ": text past 50,000 characters is in the image only and can't be selected, copied or searched.");
        } catch {
          warnings.push("slide " + String(index4 + 1) + ": its text could not be read, so that slide is an image only; nothing on it can be selected, copied or searched.");
        }
        try {
          let index22 = 0, value5 = value3 && (() => value3.overSize ? (state.size++, 0) : (index22 = value3.limit(), index22 === 0 && state.time++, index22)), value6 = await capture.raster(index4, {
            mime: "image/jpeg",
            ...quality,
            lossless: value5
          });
          value3?.done(value6.losslessMs, value6.lossless?.zlib.length ?? value6.bytes.length), value6.losslessError === "too slow" ? state[index22 < pdfMaximumPageCaptureTimeMs ? "time" : "slow"]++ : value6.losslessError === "unreadable" && state.unreadable.push(index4 + 1), items.push({
            jpeg: value6.bytes,
            lossless: value6.lossless,
            textRuns: items4,
            blocks: items5,
            links: items3
          });
        } catch (value5) {
          throw Error("slide " + String(index4 + 1) + ": " + (value5 instanceof Error ? value5.message : String(value5)));
        }
      }
      let items2 = [];
      if (state.time > 0 && items2.push(String(state.time) + " skipped or cut short to finish in time"), state.size > 0 && items2.push(String(state.size) + " skipped because the file was heading over the " + String(Math.round((options.maxBytes ?? 0) / 1048576)) + " MiB export limit"), state.slow > 0 && items2.push(String(state.slow) + " took more than ten seconds to compress"), state.unreadable.length > 0 && items2.push((state.unreadable.length === 1 ? "slide " : "slides ") + state.unreadable.join(", ") + " could not be read back or compressed"), items2.length > 0) {
        let value4 = state.time + state.size + state.slow + state.unreadable.length;
        console.warn("[pdf-export] no lossless copy was made for " + String(value4) + " / " + String(slides.length) + " slides (each keeps its JPEG): " + items2.join("; "));
      }
      return {
        pages: items,
        warnings: Array.from(new Set(warnings)),
        fontFindings: capture.fontFindings,
        copyMs: value3?.copyMs ?? 0
      };
    } finally {
      capture.dispose();
    }
  }
  function pdfFilename(title) {
    return (0, runtime2.exportFilename)(title, "pdf");
  }
  return bindRuntimeValue(runtime2, "pdfCaptureExports", () => pdfCaptureExports, (value) => {
    pdfCaptureExports = value;
  }), bindRuntimeValue(runtime2, "missingFontsWarning", () => missingFontsWarning), bindRuntimeValue(runtime2, "missingGoogleFontFamilies", () => missingGoogleFontFamilies), bindRuntimeValue(runtime2, "waitForGoogleFontRegistration", () => waitForGoogleFontRegistration), bindRuntimeValue(runtime2, "throwIfExportAborted", () => throwIfExportAborted), bindRuntimeValue(runtime2, "remainingCaptureTimeBudget", () => remainingCaptureTimeBudget), bindRuntimeValue(runtime2, "createAdaptiveCaptureBudget", () => createAdaptiveCaptureBudget), bindRuntimeValue(runtime2, "canvasImageBytes", () => canvasImageBytes), bindRuntimeValue(runtime2, "documentStylesheetCss", () => documentStylesheetCss), bindRuntimeValue(runtime2, "captureFontCss", () => captureFontCss), bindRuntimeValue(runtime2, "captureInlineFontCss", () => captureInlineFontCss), bindRuntimeValue(runtime2, "inlineGoogleFontsFallback", () => inlineGoogleFontsFallback), bindRuntimeValue(runtime2, "inlineLocalFonts", () => inlineLocalFonts), bindRuntimeValue(runtime2, "decodeExportImages", () => decodeExportImages), bindRuntimeValue(runtime2, "slideForeignObjectSvg", () => slideForeignObjectSvg), bindRuntimeValue(runtime2, "rasterizeSlideSvg", () => rasterizeSlideSvg), bindRuntimeValue(runtime2, "rasterizeEmbedFrames", () => rasterizeEmbedFrames), bindRuntimeValue(runtime2, "labelUncapturedEmbeds", () => labelUncapturedEmbeds), bindRuntimeValue(runtime2, "replaceEmbedPlaceholders", () => replaceEmbedPlaceholders), bindRuntimeValue(runtime2, "capturedTextRunToPdf", () => capturedTextRunToPdf), bindRuntimeValue(runtime2, "runWithinPdfWriterLimits", () => runWithinPdfWriterLimits), bindRuntimeValue(runtime2, "isUtf16LowSurrogate", () => isUtf16LowSurrogate), bindRuntimeValue(runtime2, "renderedTextLineRanges", () => renderedTextLineRanges), bindRuntimeValue(runtime2, "collectRenderedTextRuns", () => collectRenderedTextRuns), bindRuntimeValue(runtime2, "renderedLinkToPdf", () => renderedLinkToPdf), bindRuntimeValue(runtime2, "renderedElementLink", () => renderedElementLink), bindRuntimeValue(runtime2, "collectRenderedLinksAndBlocks", () => collectRenderedLinksAndBlocks), bindRuntimeValue(runtime2, "mountSlidesOffscreen", () => mountSlidesOffscreen), bindRuntimeValue(runtime2, "prepareSlidesForCapture", () => prepareSlidesForCapture), bindRuntimeValue(runtime2, "exportSlidePng", () => exportSlidePng), bindRuntimeValue(runtime2, "exportSlidesPdf", () => exportSlidesPdf), bindRuntimeValue(runtime2, "pdfFilename", () => pdfFilename), bindRuntimeValue(runtime2, "PdfCaptureReact", () => PdfCaptureReact, (value) => {
    PdfCaptureReact = value;
  }), bindRuntimeValue(runtime2, "PdfCaptureReactDomClient", () => PdfCaptureReactDomClient, (value) => {
    PdfCaptureReactDomClient = value;
  }), bindRuntimeValue(runtime2, "pdfDefaultRasterScale", () => pdfDefaultRasterScale, (value) => {
    pdfDefaultRasterScale = value;
  }), bindRuntimeValue(runtime2, "pdfDefaultJpegQuality", () => pdfDefaultJpegQuality, (value) => {
    pdfDefaultJpegQuality = value;
  }), bindRuntimeValue(runtime2, "pdfCaptureQualityLadder", () => pdfCaptureQualityLadder, (value) => {
    pdfCaptureQualityLadder = value;
  }), bindRuntimeValue(runtime2, "pdfMinimumCaptureTimeMs", () => pdfMinimumCaptureTimeMs, (value) => {
    pdfMinimumCaptureTimeMs = value;
  }), bindRuntimeValue(runtime2, "pdfMaximumPageCaptureTimeMs", () => pdfMaximumPageCaptureTimeMs, (value) => {
    pdfMaximumPageCaptureTimeMs = value;
  }), bindRuntimeValue(runtime2, "pdfFinalizationTimeReserveMs", () => pdfFinalizationTimeReserveMs, (value) => {
    pdfFinalizationTimeReserveMs = value;
  }), bindRuntimeValue(runtime2, "pdfCaptureBudgetMultiplier", () => pdfCaptureBudgetMultiplier, (value) => {
    pdfCaptureBudgetMultiplier = value;
  }), bindRuntimeValue(runtime2, "pdfFontsReadyTimeoutMs", () => pdfFontsReadyTimeoutMs, (value) => {
    pdfFontsReadyTimeoutMs = value;
  }), bindRuntimeValue(runtime2, "pdfFontInliningBudget", () => pdfFontInliningBudget, (value) => {
    pdfFontInliningBudget = value;
  }), bindRuntimeValue(runtime2, "maxFontFetchCacheEntries", () => maxFontFetchCacheEntries, (value) => {
    maxFontFetchCacheEntries = value;
  }), bindRuntimeValue(runtime2, "fontFetchFallbackWarning", () => fontFetchFallbackWarning, (value) => {
    fontFetchFallbackWarning = value;
  }), bindRuntimeValue(runtime2, "fontInliningBudgetWarning", () => fontInliningBudgetWarning, (value) => {
    fontInliningBudgetWarning = value;
  }), bindRuntimeValue(runtime2, "localFontSourcePattern", () => localFontSourcePattern, (value) => {
    localFontSourcePattern = value;
  }), bindRuntimeValue(runtime2, "fetchLocalFontDataUrl", () => fetchLocalFontDataUrl, (value) => {
    fetchLocalFontDataUrl = value;
  }), bindRuntimeValue(runtime2, "uncapturedEmbedWarning", () => uncapturedEmbedWarning, (value) => {
    uncapturedEmbedWarning = value;
  }), bindRuntimeValue(runtime2, "textRunBaselineDescentFactor", () => textRunBaselineDescentFactor, (value) => {
    textRunBaselineDescentFactor = value;
  }), bindRuntimeValue(runtime2, "pdfMaximumTextRunFontSize", () => pdfMaximumTextRunFontSize, (value) => {
    pdfMaximumTextRunFontSize = value;
  }), bindRuntimeValue(runtime2, "pdfMaximumTextCoordinate", () => pdfMaximumTextCoordinate, (value) => {
    pdfMaximumTextCoordinate = value;
  }), bindRuntimeValue(runtime2, "maxCapturedSlideTextCharacters", () => maxCapturedSlideTextCharacters, (value) => {
    maxCapturedSlideTextCharacters = value;
  }), bindRuntimeValue(runtime2, "maxCapturedTextRangeCharacters", () => maxCapturedTextRangeCharacters, (value) => {
    maxCapturedTextRangeCharacters = value;
  }), bindRuntimeValue(runtime2, "ignoredTextCaptureElementNames", () => ignoredTextCaptureElementNames, (value) => {
    ignoredTextCaptureElementNames = value;
  }), bindRuntimeValue(runtime2, "headingElementNames", () => headingElementNames, (value) => {
    headingElementNames = value;
  }), bindRuntimeValue(runtime2, "pdfSlideWidthPoints", () => pdfSlideWidthPoints, (value) => {
    pdfSlideWidthPoints = value;
  }), bindRuntimeValue(runtime2, "pdfSlideHeightPoints", () => pdfSlideHeightPoints, (value) => {
    pdfSlideHeightPoints = value;
  }), bindRuntimeValue(runtime2, "initializePdfCapture", () => initializePdfCapture, (value) => {
    initializePdfCapture = value;
  }), () => {
    pdfCaptureExports = {}, (0, runtime2.defineLiveExports)(pdfCaptureExports, {
      replaceEmbedPlaceholders: () => replaceEmbedPlaceholders,
      rasterizeEmbedFrames: () => rasterizeEmbedFrames,
      pdfFilename: () => pdfFilename,
      notePageMissingFonts: () => notePageMissingFonts,
      mountSlidesOffscreen: () => mountSlidesOffscreen,
      labelUncapturedEmbeds: () => labelUncapturedEmbeds,
      inlineLocalFonts: () => inlineLocalFonts,
      composeSlideSvg: () => slideForeignObjectSvg,
      collectDocumentCss: () => documentStylesheetCss,
      captureSlidesAsJpegs: () => exportSlidesPdf,
      captureSlideAsPng: () => exportSlidePng,
      PAGE_W_PT: () => pdfSlideWidthPoints,
      PAGE_H_PT: () => pdfSlideHeightPoints,
      CAPTURE_TIERS: () => pdfCaptureQualityLadder
    }), pdfDefaultJpegQuality = 0.9, pdfMinimumCaptureTimeMs = 2e3, pdfMaximumPageCaptureTimeMs = 1e4, pdfFinalizationTimeReserveMs = 5e3, pdfCaptureBudgetMultiplier = 1.25, pdfFontsReadyTimeoutMs = 2e4, pdfFontInliningBudget = 16777216, maxFontFetchCacheEntries = 32, fontFetchFallbackWarning = "a web font could not be fetched; some text is in the fallback font", fontInliningBudgetWarning = "the web fonts the slides use are too large to include in full; some text is in the fallback font", fetchLocalFontDataUrl = (input) => runtime2.modelStoredBlobPattern.test(input) ? (0, runtime2.fetchWithSingleRetry)((input2) => (0, runtime2.fetchStoredBlob)(input, input2, {
      ignoreRecentFailure: !0
    }), runtime2.resourceFetchTimeoutMs, !0) : (0, runtime2.fetchResourceDataUrl)(input, runtime2.resourceFetchTimeoutMs, {
      credentials: "same-origin",
      retry: !0
    }), uncapturedEmbedWarning = "a web embed could not be rendered and exported as a placeholder", textRunBaselineDescentFactor = 0.2555, pdfMaximumTextRunFontSize = 14400, maxCapturedSlideTextCharacters = 5e4, maxCapturedTextRangeCharacters = 2e3, initializePdfCapture = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeAssetStorage)(), (0, runtime2.initializePdfWriter)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeSlideRenderer)(), (0, runtime2.initializeEmbedCapture)(), (0, runtime2.initializeSynchronousReactRender)(), (0, runtime2.initializeFontFetching)(), (0, runtime2.initializeFontInlining)(), (0, runtime2.initializeCaptureFallback)(), PdfCaptureReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), PdfCaptureReactDomClient = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomClientNamespace)(), 1), pdfDefaultRasterScale = runtime2.embedCaptureScale, pdfCaptureQualityLadder = [
        {
          scale: pdfDefaultRasterScale,
          quality: pdfDefaultJpegQuality
        },
        {
          scale: 1.5,
          quality: 0.85
        },
        {
          scale: 1,
          quality: 0.8
        }
      ], localFontSourcePattern = new RegExp(`url\\((["']?)([^"')\\s]*?(_blob/[0-9a-f]{32}|` + runtime2.designSystemFontPathSource + "))\\1\\)", "g"), pdfMaximumTextCoordinate = 4 * pdfMaximumTextRunFontSize, ignoredTextCaptureElementNames = /* @__PURE__ */ new Set([
        "SCRIPT",
        "STYLE",
        "NOSCRIPT",
        "TEMPLATE"
      ]), headingElementNames = ["H1", "H2", "H3", "H4", "H5", "H6"], pdfSlideWidthPoints = runtime2.SLIDE_WIDTH / 2, pdfSlideHeightPoints = runtime2.SLIDE_HEIGHT / 2;
    });
  };
}
export {
  installExportPdfCapture
};
