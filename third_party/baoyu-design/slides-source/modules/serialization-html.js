// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installSerializationHtml(runtime2) {
  var SlideHtmlWriter, roundSerializedNumber, serializedFontFallbacks, quoteFontFamily, textRoleHtmlTags, cssPropertySerializationOrder, cssPropertyOrderMap, initializeHtmlWriter;
  function serializeAxisPosition(axis, designSize) {
    let value = axis.anchor === "fill" ? designSize !== void 0 ? Math.max(0, designSize - 2 * axis.margin) : void 0 : axis.size;
    switch (axis.anchor) {
      case "trailing":
        return designSize !== void 0 && value !== void 0 ? {
          at: designSize - axis.margin - value,
          size: value
        } : void 0;
      case "center":
        return designSize !== void 0 && value !== void 0 ? {
          at: designSize / 2 + axis.offset - value / 2,
          size: value
        } : void 0;
      default:
        return value !== void 0 ? {
          at: axis.margin,
          size: value
        } : {
          at: axis.margin
        };
    }
  }
  function escapeSlideHtmlText(text, preserveSpaces = !1) {
    let value = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\t\r\f]/g, " ").replace(/ {2,}/g, (items) => " " + " ".repeat(items.length - 1));
    return preserveSpaces && (value = value.replace(/(^|\n) /g, "$1 ").replace(/ ($|\n)/g, " $1")), value.replace(/\u00a0/g, "&nbsp;");
  }
  function escapeSlideHtmlAttribute(text) {
    return escapeSlideHtmlText(text).replace(/"/g, "&quot;");
  }
  function serializeSlideColor(color) {
    if (color === void 0)
      return;
    let namedColor = runtime2.namedSlideColors[color];
    return namedColor !== void 0 ? namedColor.toLowerCase() : (0, runtime2.normalizeCssColorHex)(color) ?? color.toLowerCase();
  }
  function serializeStyleAttribute(properties) {
    let nonemptyProperties = properties.filter(([, input]) => input !== "");
    return nonemptyProperties.length === 0 ? "" : ' style="' + escapeSlideHtmlAttribute(nonemptyProperties.map(([input, input2]) => input + ":" + input2).join("; ")) + '"';
  }
  function serializeGapDeclarations(node) {
    let items = roundSerializedNumber(node.gap) !== 0 ? [["gap", (0, runtime2.formatCssPixels)(node.gap)]] : [], rowGap = (0, runtime2.effectiveRowGap)(node);
    return roundSerializedNumber(rowGap) !== roundSerializedNumber(node.gap) && items.push(["row-gap", (0, runtime2.formatCssPixels)(rowGap)]), items;
  }
  function serializeAxisStyle(axis, nearProperty, farProperty, sizeProperty, centers) {
    let items = [];
    switch (axis.anchor) {
      case "leading":
        items.push([nearProperty, (0, runtime2.formatCssPixels)(axis.margin)]);
        break;
      case "trailing":
        items.push([farProperty, (0, runtime2.formatCssPixels)(axis.margin)]);
        break;
      case "fill":
        items.push([nearProperty, (0, runtime2.formatCssPixels)(axis.margin)], [farProperty, (0, runtime2.formatCssPixels)(axis.margin)]);
        break;
      case "center":
        items.push([
          nearProperty,
          roundSerializedNumber(axis.offset) === 0 ? "50%" : "calc(50% " + (axis.offset < 0 ? "- " : "+ ") + (0, runtime2.formatCssNumber)(Math.abs(axis.offset)) + "px)"
        ]), centers.push("-50%");
        break;
    }
    return axis.anchor !== "center" && centers.push("0"), axis.anchor !== "fill" && axis.size !== void 0 ? items.push([sizeProperty, (0, runtime2.formatCssPixels)(axis.size)]) : axis.anchor !== "fill" && axis.sizePct !== void 0 && (axis.anchor !== "center" && roundSerializedNumber(axis.sizePct) === 100 && roundSerializedNumber(axis.margin) === 0 ? items.push([
      axis.anchor === "leading" ? farProperty : nearProperty,
      (0, runtime2.formatCssPixels)(axis.margin)
    ]) : items.push([
      sizeProperty,
      (0, runtime2.formatCssNumber)(axis.sizePct) + "%"
    ])), items;
  }
  function serializeFrameStyle(frame) {
    let centers = [], xProperties = serializeAxisStyle(frame.x, "left", "right", "width", centers), yProperties = serializeAxisStyle(frame.y, "top", "bottom", "height", centers), properties = new Map([...xProperties, ...yProperties]);
    frame.node.kind === "table" && (properties.delete("height"), frame.y.anchor === "fill" && properties.delete("bottom"));
    let items = [["position", "absolute"]];
    for (let value2 of [
      "top",
      "right",
      "bottom",
      "left",
      "width",
      "height"
    ]) {
      let entry = properties.get(value2);
      entry !== void 0 && items.push([value2, entry]);
    }
    let value = centers[0] === "-50%" && centers[1] === "-50%" ? "translate(-50%, -50%)" : centers[0] === "-50%" ? "translateX(-50%)" : centers[1] === "-50%" ? "translateY(-50%)" : void 0;
    return {
      decls: items,
      translate: value
    };
  }
  function serializeThemeFontFamily(family, themeFamilies) {
    let value = family === "sans" || family === "serif" ? themeFamilies?.[family] : void 0;
    return value !== void 0 ? quoteFontFamily(value.family) + ", " + serializedFontFallbacks[family] : serializedFontFallbacks[family];
  }
  function serializeTypographyStyle(style, role, themeFamilies) {
    let properties = [];
    if (style === void 0 && role === void 0)
      return properties;
    let family = style?.fontFamily;
    family !== void 0 && (typeof family == "string" ? properties.push([
      "font-family",
      family === "helvetica" ? "Helvetica, sans-serif" : serializeThemeFontFamily(family, themeFamilies)
    ]) : properties.push([
      "font-family",
      quoteFontFamily(family.family) + ", " + (family.webSafe !== void 0 ? quoteFontFamily(family.webSafe) + ", " : "") + serializedFontFallbacks[family.fallback]
    ])), style?.fontSize !== void 0 && properties.push([
      "font-size",
      (0, runtime2.formatCssPixels)(style.fontSize)
    ]), style?.fontWeight !== void 0 && properties.push([
      "font-weight",
      String(Math.max(100, Math.min(900, Math.round(style.fontWeight / 100) * 100)))
    ]), style?.fontStyle !== void 0 && properties.push(["font-style", style.fontStyle]), style?.lineHeight !== void 0 && properties.push([
      "line-height",
      (0, runtime2.formatCssNumber)(style.lineHeight)
    ]), style?.letterSpacing !== void 0 && properties.push([
      "letter-spacing",
      (0, runtime2.formatCssPixels)(style.letterSpacing)
    ]), role?.align !== void 0 && role.align !== "start" && properties.push([
      "text-align",
      role.align === "center" ? "center" : role.align === "justify" ? "justify" : "right"
    ]), style?.textTransform !== void 0 && properties.push(["text-transform", style.textTransform]), role?.wrap === "nowrap" && properties.push(["white-space", "nowrap"]);
    let value = style?.textDecorationLine, value2 = style?.textDecorationStyle, value3 = style?.textDecorationColor;
    (value !== void 0 || value2 !== void 0 || value3 !== void 0) && properties.push([
      "text-decoration",
      [value ?? "underline", value2, serializeSlideColor(value3)].filter((input) => input !== void 0).join(" ")
    ]), style?.fontVariantNumeric !== void 0 && properties.push(["font-variant-numeric", style.fontVariantNumeric]), (style?.textStrokeWidth !== void 0 || style?.textStrokeColor !== void 0) && properties.push([
      "-webkit-text-stroke",
      [
        style.textStrokeWidth !== void 0 ? (0, runtime2.formatCssPixels)(style.textStrokeWidth) : void 0,
        serializeSlideColor(style.textStrokeColor)
      ].filter((input) => input !== void 0).join(" ")
    ]), role?.color !== void 0 && properties.push(["color", serializeSlideColor(role.color)]);
    let value4 = role?.fill;
    return value4 !== void 0 && (value4.kind === "gradient" || (0, runtime2.isRenderableImageSource)(value4.src)) && (properties.push([
      "background",
      value4.kind === "gradient" ? (0, runtime2.serializeCssGradient)(value4.gradient) : "url(" + value4.src + ") center / " + (value4.size ?? "cover") + " no-repeat"
    ]), properties.push(["-webkit-background-clip", "text"], ["background-clip", "text"], ["-webkit-text-fill-color", "transparent"])), properties;
  }
  function serializeNodeStyle(style, nodeKind) {
    let properties = [], backgroundColor = style?.backgroundColor, gradient = style?.backgroundGradient;
    backgroundColor !== void 0 && gradient !== void 0 ? properties.push(["background-color", serializeSlideColor(backgroundColor)], ["background-image", (0, runtime2.serializeCssGradient)(gradient)]) : backgroundColor !== void 0 ? properties.push(["background", serializeSlideColor(backgroundColor)]) : gradient !== void 0 && properties.push([
      "background",
      (0, runtime2.serializeCssGradient)(gradient)
    ]);
    let value = style !== void 0 ? [
      ["top", style.borderTopWidth],
      ["right", style.borderRightWidth],
      ["bottom", style.borderBottomWidth],
      ["left", style.borderLeftWidth]
    ] : [];
    if (style !== void 0 && value.some(([, input]) => input !== void 0)) {
      if (style.borderStyle !== void 0 && style.borderStyle !== "none") {
        let value4 = " " + (style.borderStyle ?? "solid") + " " + (serializeSlideColor(style.borderColor) ?? "#000000"), value5 = style.borderSides === void 0 ? null : " " + style.borderSides + " ";
        for (let [value6, value7] of value) {
          let value8 = value7 ?? (style.borderWidth !== void 0 && (value5 === null || value5.includes(" " + value6 + " ")) ? style.borderWidth : 0);
          value8 > 0 && properties.push([
            "border-" + value6,
            (0, runtime2.formatCssPixels)(value8) + value4
          ]);
        }
      }
    } else if ((style?.borderWidth !== void 0 || style?.borderStyle !== void 0 || style?.borderColor !== void 0) && !(style.borderStyle === "none" || style.borderWidth === 0)) {
      let value4 = (0, runtime2.formatCssPixels)(style.borderWidth ?? 1) + " " + (style.borderStyle ?? "solid") + " " + (serializeSlideColor(style.borderColor) ?? "#000000");
      if (style.borderSides === void 0)
        properties.push(["border", value4]);
      else
        for (let value5 of style.borderSides.split(" "))
          properties.push(["border-" + value5, value4]);
    }
    if (style !== void 0 && (style.borderTopLeftRadius !== void 0 || style.borderTopRightRadius !== void 0 || style.borderBottomRightRadius !== void 0 || style.borderBottomLeftRadius !== void 0)) {
      let value4 = style.borderRadius ?? 0;
      properties.push([
        "border-radius",
        [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius
        ].map((input) => (0, runtime2.formatCssPixels)(input ?? value4)).join(" ")
      ]);
    } else
      style?.borderRadius !== void 0 && properties.push([
        "border-radius",
        (0, runtime2.formatCssPixels)(style.borderRadius)
      ]);
    style?.opacity !== void 0 && properties.push(["opacity", (0, runtime2.formatCssNumber)(style.opacity)]), style?.boxShadow !== void 0 && properties.push([
      "box-shadow",
      style.boxShadow.map(runtime2.serializeCssShadow).join(", ")
    ]), style?.textShadow !== void 0 && properties.push([
      "text-shadow",
      style.textShadow.map(runtime2.serializeCssShadow).join(", ")
    ]);
    let value2 = style?.transform !== void 0 ? (0, runtime2.serializeCssTransform)(style.transform) : "", value3 = [nodeKind, value2].filter((input) => input !== void 0 && input !== "").join(" ");
    if (value3 !== "" && properties.push(["transform", value3]), style?.filter !== void 0) {
      let value4 = (0, runtime2.serializeCssFilter)(style.filter);
      value4 !== "" && properties.push(["filter", value4]);
    }
    if (style?.backdropFilter !== void 0) {
      let value4 = (0, runtime2.serializeCssFilter)(style.backdropFilter);
      value4 !== "" && properties.push(["backdrop-filter", value4]);
    }
    style?.mixBlendMode !== void 0 && properties.push(["mix-blend-mode", style.mixBlendMode]), style?.overflow !== void 0 && properties.push(["overflow", style.overflow]);
    let items = [
      style?.paddingTop,
      style?.paddingRight,
      style?.paddingBottom,
      style?.paddingLeft
    ];
    if (items.some((input) => input !== void 0)) {
      let [value4, value5, value6, value7] = items.map((input) => input ?? 0), value8 = value4 === value6 && value5 === value7 ? value4 === value5 ? [value4] : [value4, value5] : value5 === value7 ? [value4, value5, value6] : [value4, value5, value6, value7];
      properties.push([
        "padding",
        value8.map(runtime2.formatCssPixels).join(" ")
      ]);
    }
    return properties;
  }
  function serializeNodePlacement(node) {
    let placement = node.place, properties = [];
    if (placement === void 0)
      return properties;
    if (placement.grow !== void 0 || placement.shrink !== void 0 || placement.basis !== void 0) {
      let value2 = placement.grow ?? 0, value3 = placement.shrink ?? 1, basis = placement.basis;
      basis === void 0 ? properties.push([
        "flex",
        value3 === 1 ? (0, runtime2.formatFlexFactor)(value2) + " 1 auto" : (0, runtime2.formatFlexFactor)(value2) + " " + (0, runtime2.formatFlexFactor)(value3) + " auto"
      ]) : roundSerializedNumber(basis) === 0 && value3 === 1 ? properties.push(["flex", (0, runtime2.formatFlexFactor)(value2)]) : properties.push([
        "flex",
        (0, runtime2.formatFlexFactor)(value2) + " " + (0, runtime2.formatFlexFactor)(value3) + " " + (roundSerializedNumber(basis) === 0 ? "0px" : (0, runtime2.formatCssPixels)(basis))
      ]);
    }
    placement.alignSelf !== void 0 && properties.push(["align-self", placement.alignSelf]);
    let value = node.kind === "text" || node.kind === "stack" || node.kind === "grid" || node.kind === "table" || node.kind === "overlay";
    return value && placement.minW !== void 0 && placement.maxW !== void 0 && roundSerializedNumber(placement.minW) === roundSerializedNumber(placement.maxW) ? (properties.push(["width", (0, runtime2.formatCssPixels)(placement.minW)]), placement.minWFit !== void 0 && properties.push(["min-width", placement.minWFit])) : (placement.minWFit !== void 0 ? properties.push(["min-width", placement.minWFit]) : placement.minW !== void 0 && properties.push([
      "min-width",
      (0, runtime2.formatCssPixels)(placement.minW)
    ]), placement.maxW !== void 0 && properties.push([
      "max-width",
      (0, runtime2.formatCssPixels)(placement.maxW)
    ])), node.kind !== "table" && (value && placement.minH !== void 0 && placement.maxH !== void 0 && roundSerializedNumber(placement.minH) === roundSerializedNumber(placement.maxH) ? properties.push([
      "height",
      (0, runtime2.formatCssPixels)(placement.minH)
    ]) : (placement.minH !== void 0 && properties.push([
      "min-height",
      (0, runtime2.formatCssPixels)(placement.minH)
    ]), placement.maxH !== void 0 && properties.push([
      "max-height",
      (0, runtime2.formatCssPixels)(placement.maxH)
    ])), placement.aspect !== void 0 && properties.push([
      "aspect-ratio",
      (0, runtime2.formatCssNumber)(placement.aspect)
    ])), placement.colSpan !== void 0 && properties.push(["grid-column", "span " + String(placement.colSpan)]), placement.rowSpan !== void 0 && properties.push(["grid-row", "span " + String(placement.rowSpan)]), placement.justifySelf !== void 0 && properties.push(["justify-self", placement.justifySelf]), properties;
  }
  function serializeTextRun(run, spaceEdge = "none", cssMode = !1) {
    let html = escapeSlideHtmlText(run.text);
    return (spaceEdge === "first" || spaceEdge === "both") && html.startsWith(" ") && (html = "&nbsp;" + html.slice(1)), (spaceEdge === "last" || spaceEdge === "both") && html.endsWith(" ") && (html = html.slice(0, -1) + "&nbsp;"), run.underline && (html = "<u>" + html + "</u>"), run.italic && (html = "<i>" + html + "</i>"), run.bold && (html = "<b>" + html + "</b>"), run.color !== void 0 && (html = '<span style="color:' + serializeSlideColor(run.color) + (cssMode ? "; -webkit-text-fill-color:currentcolor" : "") + '">' + html + "</span>"), run.href !== void 0 && (html = '<a href="' + escapeSlideHtmlAttribute(run.href) + '">' + html + "</a>"), html;
  }
  function serializeTextRuns(runs, cssMode = !1) {
    return runs.map((input, options) => serializeTextRun(input, runs.length === 1 ? "both" : options === 0 ? "first" : options === runs.length - 1 ? "last" : "none", cssMode)).join("");
  }
  function serializeRichText(text, marks, cssMode = !1) {
    return (0, runtime2.textLinesAsRuns)({
      text,
      marks
    }).map((input) => serializeTextRuns(input, cssMode)).join("<br>");
  }
  function serializeBuildEffect(build) {
    return build.effect + " " + String(build.order) + (build.auto === !0 ? " auto" : "");
  }
  function serializeGridTrack(track) {
    return track === "auto" ? "auto" : "fr" in track ? (0, runtime2.formatFlexFactor)(track.fr) + "fr" : (0, runtime2.formatCssPixels)(track.px);
  }
  function isGradientBackgroundSlide(slide) {
    let value = slide.frames[0];
    return value !== void 0 && isFullBleedFrame(value, !0) && value.node.kind === "stack" && value.node.children.length === 0 && value.node.style?.backgroundGradient !== void 0 && Object.keys(value.node.style).every((input) => input === "backgroundGradient" || input === "backgroundColor") && value.build === void 0;
  }
  function isFullBleedFrame(frame, allowGradient) {
    let callback = (input) => input.anchor === "fill" && roundSerializedNumber(input.margin) === 0;
    if (!callback(frame.x) || !callback(frame.y))
      return !1;
    let style = frame.node.style;
    if (style === void 0)
      return !0;
    let values = /* @__PURE__ */ new Set([
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "overflow"
    ]);
    return allowGradient ? !0 : Object.keys(style).every((input) => values.has(input));
  }
  function orderCssProperties(properties) {
    return [...properties].sort((input, options) => (cssPropertyOrderMap.get(input[0]) ?? 999) - (cssPropertyOrderMap.get(options[0]) ?? 999));
  }
  function deduplicateCssProperties(properties) {
    let properties2 = /* @__PURE__ */ new Map();
    for (let [value, value2] of properties)
      properties2.set(value, value2);
    return [...properties2];
  }
  function serializeSlideHtml(deck, slide) {
    let writer = new SlideHtmlWriter(deck);
    return writer.slide(slide), writer.text();
  }
  function serializeDeckHead(deck, title) {
    let writer = new SlideHtmlWriter({
      theme: "neutral",
      order: [],
      slides: {},
      assets: {},
      ...deck
    });
    return writeDeckHead(writer, deck, title), writer.text();
  }
  function writeDeckHead(writer, deck, title) {
    writer.line(0, "<head>"), writer.line(1, "<title>" + escapeSlideHtmlText(title) + "</title>");
    let items = [], items2 = [];
    for (let value of deck.faces ?? [])
      "href" in value ? items.includes(value.href) || items.push(value.href) : items2.push('@font-face{font-family:"' + value.family + '";src:url(' + value.src + ")}");
    for (let value of ["sans", "serif"]) {
      let value2 = deck.fonts?.[value];
      value2 !== void 0 && ("href" in value2 ? items.includes(value2.href) || items.push(value2.href) : items2.push('@font-face{font-family:"' + value2.family + '";src:url(' + value2.src + ")}"));
    }
    for (let value of items)
      writer.line(1, '<link rel="stylesheet" href="' + escapeSlideHtmlAttribute(value) + '">');
    items2.length > 0 && writer.line(1, "<style>" + items2.join("") + "</style>"), writer.line(0, "</head>");
  }
  function serializeDeckHtml(deck, title) {
    let writer = new SlideHtmlWriter(deck);
    writer.sectionAt = new Map((0, runtime2.anchoredSectionsInOrder)(deck.sections, deck.order).map((input) => [input.start, input])), writer.line(0, "<!doctype html>"), writer.line(0, "<html>"), writeDeckHead(writer, deck, title), writer.line(0, "<body>");
    for (let value of deck.order) {
      let value2 = deck.slides[value];
      value2 !== void 0 && writer.slide(value2);
    }
    return writer.line(0, "</body>"), writer.line(0, "</html>"), writer.text();
  }
  return bindRuntimeValue(runtime2, "serializeAxisPosition", () => serializeAxisPosition), bindRuntimeValue(runtime2, "escapeSlideHtmlText", () => escapeSlideHtmlText), bindRuntimeValue(runtime2, "escapeSlideHtmlAttribute", () => escapeSlideHtmlAttribute), bindRuntimeValue(runtime2, "serializeSlideColor", () => serializeSlideColor), bindRuntimeValue(runtime2, "serializeStyleAttribute", () => serializeStyleAttribute), bindRuntimeValue(runtime2, "serializeAxisStyle", () => serializeAxisStyle), bindRuntimeValue(runtime2, "serializeFrameStyle", () => serializeFrameStyle), bindRuntimeValue(runtime2, "serializeThemeFontFamily", () => serializeThemeFontFamily), bindRuntimeValue(runtime2, "serializeTypographyStyle", () => serializeTypographyStyle), bindRuntimeValue(runtime2, "serializeNodeStyle", () => serializeNodeStyle), bindRuntimeValue(runtime2, "serializeNodePlacement", () => serializeNodePlacement), bindRuntimeValue(runtime2, "serializeTextRun", () => serializeTextRun), bindRuntimeValue(runtime2, "serializeTextRuns", () => serializeTextRuns), bindRuntimeValue(runtime2, "serializeRichText", () => serializeRichText), bindRuntimeValue(runtime2, "SlideHtmlWriter", () => SlideHtmlWriter, (value) => {
    SlideHtmlWriter = value;
  }), bindRuntimeValue(runtime2, "serializeBuildEffect", () => serializeBuildEffect), bindRuntimeValue(runtime2, "serializeGridTrack", () => serializeGridTrack), bindRuntimeValue(runtime2, "isGradientBackgroundSlide", () => isGradientBackgroundSlide), bindRuntimeValue(runtime2, "isFullBleedFrame", () => isFullBleedFrame), bindRuntimeValue(runtime2, "orderCssProperties", () => orderCssProperties), bindRuntimeValue(runtime2, "deduplicateCssProperties", () => deduplicateCssProperties), bindRuntimeValue(runtime2, "serializeSlideHtml", () => serializeSlideHtml), bindRuntimeValue(runtime2, "serializeDeckHead", () => serializeDeckHead), bindRuntimeValue(runtime2, "writeDeckHead", () => writeDeckHead), bindRuntimeValue(runtime2, "serializeDeckHtml", () => serializeDeckHtml), bindRuntimeValue(runtime2, "roundSerializedNumber", () => roundSerializedNumber, (value) => {
    roundSerializedNumber = value;
  }), bindRuntimeValue(runtime2, "serializedFontFallbacks", () => serializedFontFallbacks, (value) => {
    serializedFontFallbacks = value;
  }), bindRuntimeValue(runtime2, "quoteFontFamily", () => quoteFontFamily, (value) => {
    quoteFontFamily = value;
  }), bindRuntimeValue(runtime2, "textRoleHtmlTags", () => textRoleHtmlTags, (value) => {
    textRoleHtmlTags = value;
  }), bindRuntimeValue(runtime2, "cssPropertySerializationOrder", () => cssPropertySerializationOrder, (value) => {
    cssPropertySerializationOrder = value;
  }), bindRuntimeValue(runtime2, "cssPropertyOrderMap", () => cssPropertyOrderMap, (value) => {
    cssPropertyOrderMap = value;
  }), bindRuntimeValue(runtime2, "initializeHtmlWriter", () => initializeHtmlWriter, (value) => {
    initializeHtmlWriter = value;
  }), () => {
    SlideHtmlWriter = class {
      deck;
      out = [];
      scale;
      neutral;
      sectionAt = /* @__PURE__ */ new Map();
      lists;
      constructor(input) {
        this.deck = input, this.neutral = input.theme === "neutral", this.scale = this.neutral ? runtime2.neutralTypeScale : runtime2.anthropicTypeScale;
      }
      line(input, options) {
        this.out.push("  ".repeat(input) + options);
      }
      text() {
        return this.out.join(`
`) + `
`;
      }
      roleDecls(input) {
        let value = input.list !== void 0 || input.lineLists !== void 0 ? "p" : textRoleHtmlTags[input.role], value2 = this.scale[input.role], value3 = runtime2.neutralTypeScale[value === "p" ? "body" : value], items = [], style = input.style;
        !this.neutral && value2.serifDisplay && style?.fontFamily === void 0 && items.push([
          "font-family",
          serializeThemeFontFamily("serif", this.deck.fonts)
        ]), style?.fontSize === void 0 && value2.fontSize !== value3.fontSize && items.push([
          "font-size",
          (0, runtime2.formatCssPixels)(value2.fontSize)
        ]);
        let value4 = Math.round(value2.fontWeight / 100) * 100;
        return style?.fontWeight === void 0 && value4 !== value3.fontWeight && items.push(["font-weight", String(value4)]), style?.lineHeight === void 0 && value2.lineHeight !== value3.lineHeight && items.push([
          "line-height",
          (0, runtime2.formatCssNumber)(value2.lineHeight)
        ]), items;
      }
      connector(input, options, context, value, extra, detail, argument) {
        let value2 = input.strokeWidth ?? runtime2.defaultShapeStrokeWidth, items = [];
        input.stroke !== void 0 && items.push(["color", serializeSlideColor(input.stroke)]), value2 !== runtime2.defaultShapeStrokeWidth && items.push(["border-width", (0, runtime2.formatCssPixels)(value2)]), input.dashed === !0 && items.push(["border-style", "dashed"]);
        let value3 = (input.head !== void 0 && input.head !== "end" ? ' head="' + input.head + '"' : "") + (input.headStart !== void 0 ? ' head-start="' + input.headStart + '"' : "") + (input.headEnd !== void 0 ? ' head-end="' + input.headEnd + '"' : "") + (input.route !== void 0 && input.route !== "straight" ? ' route="' + input.route + '"' : "");
        if (!(value !== void 0 && value.x.anchor === "leading" && value.y.anchor === "leading" && value.x.size !== void 0 && value.y.size !== void 0)) {
          let value7 = value === void 0 ? [...extra] : [...detail];
          value === void 0 ? (input.w !== void 0 && value7.push(["width", (0, runtime2.formatCssPixels)(input.w)]), input.h !== void 0 && value7.push(["height", (0, runtime2.formatCssPixels)(input.h)])) : argument !== void 0 && value7.push(["transform", argument]);
          let value8 = input.from !== void 0 && input.from !== "tl" ? ' from="' + input.from + '"' : "";
          this.line(options, "<x-connector" + value8 + value3 + context + serializeStyleAttribute(orderCssProperties(deduplicateCssProperties([...value7, ...items]))) + "></x-connector>");
          return;
        }
        let margin = value.x.margin, margin2 = value.y.margin, { start: value4, end: value5 } = (0, runtime2.connectorEndpoints)(value.x.size, value.y.size, input.from, input.strokeWidth), value6 = ' x1="' + (0, runtime2.formatCssNumber)(margin + value4[0]) + '" y1="' + (0, runtime2.formatCssNumber)(margin2 + value4[1]) + '" x2="' + (0, runtime2.formatCssNumber)(margin + value5[0]) + '" y2="' + (0, runtime2.formatCssNumber)(margin2 + value5[1]) + '"' + value3;
        this.line(options, "<x-connector" + value6 + context + serializeStyleAttribute(orderCssProperties(items)) + "></x-connector>");
      }
      node(table, options, items = [], value = "", extra, detail) {
        let value2 = serializeNodePlacement(table);
        table.slots !== void 0 && (value += ' data-slots="' + (0, runtime2.formatNodeSlots)(table.slots) + '"');
        let callback = (input) => items.some(([input2]) => input2 === input), value3 = callback("left") && callback("right"), value4 = callback("top") && callback("bottom");
        switch (table.kind) {
          case "text": {
            let baseTag = textRoleHtmlTags[table.role], value5 = table.list === "bullet" ? "ul" : table.list === "number" ? "ol" : table.lineLists !== void 0 ? "div" : baseTag;
            value5 !== baseTag && baseTag !== "p" && (value = ' data-role="' + baseTag + '"' + value), table.lineLists !== void 0 && (value = " data-text" + (table.listIndent !== void 0 ? '="' + (0, runtime2.formatCssNumber)(table.listIndent) + '"' : "") + value), table.fit !== void 0 && (value += ' data-fit="' + table.fit + '"');
            let value6 = this.roleDecls(table), value7 = serializeTypographyStyle(table.style, table, this.deck.fonts), value8 = (0, runtime2.textListGutter)(table, this.lists), value9 = (table.style?.paddingTop ?? table.style?.paddingRight ?? table.style?.paddingBottom) !== void 0, value10 = value8 !== void 0 && value9 && table.style?.paddingLeft === void 0 ? {
              ...table.style,
              paddingLeft: value8
            } : table.style, value11 = deduplicateCssProperties([
              ...items,
              ...value2,
              ...value6,
              ...value7,
              ...serializeNodeStyle(value10, extra)
            ]), value12 = serializeStyleAttribute(orderCssProperties(value11)), filled = table.fill !== void 0, writeItems = (depth, lines) => lines.forEach((line) => this.line(depth, "<li>" + serializeTextRuns(line, filled) + "</li>"));
            if (table.list !== void 0)
              this.line(options, "<" + value5 + value + value12 + ">"), writeItems(options + 1, (0, runtime2.textLinesAsRuns)(table)), this.line(options, "</" + value5 + ">");
            else if (table.lineLists !== void 0) {
              this.line(options, "<" + value5 + value + value12 + ">");
              for (let group of (0, runtime2.groupTextLinesByList)(table)) {
                if (group.list === null) {
                  this.line(options + 1, "<p>" + group.lines.map((line) => serializeTextRuns(line, filled)).join("<br>") + "</p>");
                  continue;
                }
                let listTag = group.list === "bullet" ? "ul" : "ol";
                this.line(options + 1, "<" + listTag + ">"), writeItems(options + 2, group.lines), this.line(options + 1, "</" + listTag + ">");
              }
              this.line(options, "</" + value5 + ">");
            } else
              this.line(options, "<" + value5 + value + value12 + ">" + serializeRichText(table.text, table.marks, table.fill !== void 0) + "</" + value5 + ">");
            return;
          }
          case "img": {
            let value5 = table.src ?? (table.asset !== void 0 ? this.deck.assets[table.asset] : void 0), value6 = (0, runtime2.normalizeVideoLink)(table.videoLink), value7 = table.video !== void 0 ? ' data-video="' + escapeSlideHtmlAttribute(table.video) + '"' + (table.videoStart === "click" ? ' data-video-start="click"' : table.videoDelay !== void 0 ? ' data-video-delay="' + String(table.videoDelay) + '"' : "") + (table.videoSound === "on" ? ' data-video-sound="on"' : "") + (table.videoLoop === "off" ? ' data-video-loop="off"' : "") + (table.videoStill === "clip" ? ' data-video-still="clip"' : "") : value6 !== void 0 ? " data-video-" + value6.provider + '="' + escapeSlideHtmlAttribute(value6.id) + '"' + (value6.start !== void 0 ? ' data-video-at="' + String(value6.start) + '"' : "") + ((0, runtime2.isVideoStillStamp)(table.videoStill) ? ' data-video-still="' + escapeSlideHtmlAttribute(table.videoStill) + '"' : "") : "", items2 = [...items, ...value2];
            if (table.w !== void 0 && !value3 && !callback("width") && items2.push(["width", (0, runtime2.formatCssPixels)(table.w)]), table.h !== void 0 && !value4 && !callback("height") && items2.push(["height", (0, runtime2.formatCssPixels)(table.h)]), value5 === void 0) {
              table.fit === "contain" && items2.push(["object-fit", "contain"]), items2.push(...serializeNodeStyle(table.style, extra)), this.line(options, '<img alt="' + escapeSlideHtmlAttribute(table.alt) + '"' + value7 + value + serializeStyleAttribute(orderCssProperties(deduplicateCssProperties(items2))) + ">");
              return;
            }
            let value8 = table.video === void 0 && value6 === void 0 ? (0, runtime2.decodeSvgDataUrl)(value5) : void 0, value9 = value8 !== void 0 && (0, runtime2.validateSvgMarkup)(value8) === void 0 ? (0, runtime2.parseSvgDimensions)(value8) : void 0;
            if (value9 !== void 0) {
              items2.push(...serializeNodeStyle(table.style, extra));
              let value10 = Object.keys(value9.attrs).map((input) => input.toLowerCase()), value11 = value10.includes("xmlns") ? "" : ' xmlns="http://www.w3.org/2000/svg"';
              !value10.includes("xmlns:xlink") && /\bxlink:/i.test(value8) && (value11 += ' xmlns:xlink="http://www.w3.org/1999/xlink"');
              for (let [value12, value13] of Object.entries(value9.attrs)) {
                let value14 = value12.toLowerCase();
                value14 === "style" || value14 === "width" || value14 === "height" || value14 === "id" || value14 === "data-slots" || value14.startsWith("data-build-") || (value11 += " " + value12 + '="' + escapeSlideHtmlAttribute(value13) + '"');
              }
              table.alt !== "" && value9.attrs["aria-label"] === void 0 && (value11 += ' aria-label="' + escapeSlideHtmlAttribute(table.alt) + '"'), this.line(options, "<svg" + value11 + value + serializeStyleAttribute(orderCssProperties(deduplicateCssProperties(items2))) + ">" + value9.inner + "</svg>");
              return;
            }
            table.fit === "contain" ? items2.push(["object-fit", "contain"]) : table.crop !== void 0 && !value5.startsWith("data:image/svg+xml") && (value += ' data-crop="' + (0, runtime2.serializeImageCrop)(table.crop) + '"'), items2.push(...serializeNodeStyle(table.style, extra)), this.line(options, '<img src="' + escapeSlideHtmlAttribute(value5) + '" alt="' + escapeSlideHtmlAttribute(table.alt) + '"' + value7 + value + serializeStyleAttribute(orderCssProperties(deduplicateCssProperties(items2))) + ">");
            return;
          }
          case "icon": {
            if (!runtime2.slideHtmlIconNames.includes(table.icon)) {
              this.line(options, "<!-- a brand icon (" + table.icon + ") has no HTML spelling — dropped -->");
              return;
            }
            let items2 = [...items, ...value2];
            table.color !== void 0 && items2.push(["color", serializeSlideColor(table.color)]), table.w !== void 0 && !value3 && !callback("width") && items2.push(["width", (0, runtime2.formatCssPixels)(table.w)]), table.h !== void 0 && !value4 && !callback("height") && items2.push(["height", (0, runtime2.formatCssPixels)(table.h)]), items2.push(...serializeNodeStyle(table.style, extra)), this.line(options, '<x-icon name="' + table.icon + '"' + value + serializeStyleAttribute(orderCssProperties(deduplicateCssProperties(items2))) + "></x-icon>");
            return;
          }
          case "shape": {
            if (table.shape === "connector") {
              this.connector(table, options, value, detail, value2, items, extra);
              return;
            }
            let items2 = [...items, ...value2];
            table.w !== void 0 && !value3 && !callback("width") && items2.push(["width", (0, runtime2.formatCssPixels)(table.w)]), table.h !== void 0 && !value4 && !callback("height") && items2.push(["height", (0, runtime2.formatCssPixels)(table.h)]);
            let value5 = [
              extra,
              table.rotate !== void 0 && table.rotate !== 0 ? "rotate(" + (0, runtime2.formatCssNumber)(table.rotate) + "deg)" : void 0
            ].filter((input) => input !== void 0).join(" ");
            items2.push(...serializeNodeStyle(table.style, value5 === "" ? void 0 : value5));
            let value6 = (0, runtime2.shapeZeroWidthOutlineColor)(table.style);
            value6 !== void 0 && items2.push([
              "border",
              "0 solid " + ((0, runtime2.normalizeCssColorHex)(value6) ?? "#000000")
            ]), this.line(options, '<x-shape kind="' + table.shape + '"' + value + serializeStyleAttribute(orderCssProperties(deduplicateCssProperties(items2))) + "></x-shape>");
            return;
          }
          case "spacer": {
            let value5 = deduplicateCssProperties([
              ...items,
              ...value2.length > 0 ? value2 : [["flex", "1"]],
              ...extra !== void 0 ? [["transform", extra]] : []
            ]);
            this.line(options, "<div" + value + serializeStyleAttribute(orderCssProperties(value5)) + "></div>");
            return;
          }
          case "stack":
          case "grid": {
            table.group === !0 && (value += " data-group"), table.kind === "stack" && table.artifact !== void 0 && table.children.length > 0 && (value += ' data-artifact="' + escapeSlideHtmlAttribute(table.artifact) + '"');
            let items2 = [...items, ...value2];
            table.kind === "stack" ? (items2.push(["display", "flex"], ["flex-direction", table.dir === "h" ? "row" : "column"]), table.wrap === !0 && table.dir === "h" && items2.push(["flex-wrap", "wrap"]), items2.push(...serializeGapDeclarations(table)), table.align !== "stretch" && items2.push(["align-items", table.align]), table.justify !== void 0 && table.justify !== "start" && items2.push([
              "justify-content",
              {
                center: "center",
                end: "end",
                between: "space-between",
                around: "space-around",
                evenly: "space-evenly"
              }[table.justify]
            ])) : (items2.push(["display", "grid"], [
              "grid-template-columns",
              table.columns.map(serializeGridTrack).join(" ")
            ]), table.rows !== void 0 && items2.push([
              "grid-template-rows",
              table.rows.map(serializeGridTrack).join(" ")
            ]), items2.push(...serializeGapDeclarations(table)), table.alignItems !== void 0 && table.alignItems !== "stretch" && items2.push(["align-items", table.alignItems]), table.justifyItems !== void 0 && table.justifyItems !== "stretch" && items2.push(["justify-items", table.justifyItems])), items2.push(...serializeNodeStyle(table.style, extra)), this.line(options, "<div" + value + serializeStyleAttribute(orderCssProperties(deduplicateCssProperties(items2))) + ">");
            for (let value5 of table.children)
              this.node(value5, options + 1);
            this.line(options, "</div>");
            return;
          }
          case "overlay": {
            table.group === !0 && (value += " data-group");
            let base = table.base, value5 = (base.kind === "stack" || base.kind === "grid") && serializeNodePlacement(base).length === 0, value6 = value2;
            if (value5) {
              let items2 = [
                ["position", "relative"],
                ...items,
                ...value6
              ];
              base.kind === "stack" ? (items2.push(["display", "flex"], ["flex-direction", base.dir === "h" ? "row" : "column"]), base.wrap === !0 && base.dir === "h" && items2.push(["flex-wrap", "wrap"]), items2.push(...serializeGapDeclarations(base)), base.align !== "stretch" && items2.push(["align-items", base.align]), base.justify !== void 0 && base.justify !== "start" && items2.push([
                "justify-content",
                {
                  center: "center",
                  end: "end",
                  between: "space-between",
                  around: "space-around",
                  evenly: "space-evenly"
                }[base.justify]
              ])) : (items2.push(["display", "grid"], [
                "grid-template-columns",
                base.columns.map(serializeGridTrack).join(" ")
              ]), base.rows !== void 0 && items2.push([
                "grid-template-rows",
                base.rows.map(serializeGridTrack).join(" ")
              ]), items2.push(...serializeGapDeclarations(base)), base.alignItems !== void 0 && base.alignItems !== "stretch" && items2.push(["align-items", base.alignItems]), base.justifyItems !== void 0 && base.justifyItems !== "stretch" && items2.push(["justify-items", base.justifyItems])), items2.push(...serializeNodeStyle(base.style ?? table.style, extra)), this.line(options, "<div" + value + serializeStyleAttribute(orderCssProperties(deduplicateCssProperties(items2))) + ">");
              for (let value9 of base.children)
                this.node(value9, options + 1);
            } else {
              let items2 = [
                ["position", "relative"],
                ...items,
                ...value6,
                ...serializeNodeStyle(table.style, extra)
              ];
              this.line(options, "<div" + value + serializeStyleAttribute(orderCssProperties(deduplicateCssProperties(items2))) + ">"), this.node(base, options + 1);
            }
            let callback2 = (input) => {
              let value9 = [...items, ...value2].find(([input2]) => input2 === input)?.[1];
              if (value9 !== void 0 && /^-?[\d.]+px$/.test(value9))
                return Number(value9.slice(0, -2));
            }, value7 = detail !== void 0 ? serializeAxisPosition(detail.x, detail.spanW)?.size : callback2("width"), value8 = detail !== void 0 ? serializeAxisPosition(detail.y, detail.spanH)?.size : callback2("height");
            for (let value9 of table.layers) {
              let value10 = serializeFrameStyle({
                id: "",
                x: value9.x,
                y: value9.y,
                node: value9.node
              });
              this.node(value9.node, options + 1, value10.decls, "", value10.translate, {
                x: value9.x,
                y: value9.y,
                spanW: value7,
                spanH: value8
              });
            }
            this.line(options, "</div>");
            return;
          }
          case "table": {
            let items2 = [...items, ...value2];
            table.style?.fontSize === void 0 && table.role !== void 0 && table.role !== "body" && items2.push([
              "font-size",
              (0, runtime2.formatCssPixels)(this.scale[table.role].fontSize)
            ]), items2.push(...serializeTypographyStyle(table.style, void 0, this.deck.fonts)), table.style?.color !== void 0 && items2.push(["color", serializeSlideColor(table.style.color)]), items2.push(...serializeNodeStyle(table.style, extra)), table.fit !== void 0 && (value += ' data-fit="' + table.fit + '"'), this.line(options, "<table" + value + serializeStyleAttribute(orderCssProperties(deduplicateCssProperties(items2))) + ">"), table.rows.forEach((input, options2) => {
              let value5 = input.map((input2, options3) => {
                let value7 = table.header && options2 === 0 ? "th" : "td", items3 = [], cellPadding = table.cellPadding;
                if (cellPadding?.x !== void 0 && cellPadding.y !== void 0 ? items3.push([
                  "padding",
                  cellPadding.x === cellPadding.y ? (0, runtime2.formatCssPixels)(cellPadding.y) : (0, runtime2.formatCssPixels)(cellPadding.y) + " " + (0, runtime2.formatCssPixels)(cellPadding.x)
                ]) : cellPadding?.y !== void 0 ? items3.push([
                  "padding-block",
                  (0, runtime2.formatCssPixels)(cellPadding.y)
                ]) : cellPadding?.x !== void 0 && items3.push([
                  "padding-inline",
                  (0, runtime2.formatCssPixels)(cellPadding.x)
                ]), value7 === "th" && table.headerWeight !== void 0 && items3.push([
                  "font-weight",
                  String(table.headerWeight)
                ]), options2 === 0 && table.colWidths !== void 0) {
                  let value10 = table.colWidths.reduce((input3, options4) => input3 + options4, 0);
                  items3.push([
                    "width",
                    String(Math.round(table.colWidths[options3] / value10 * 100)) + "%"
                  ]);
                }
                let value8 = table.colAligns?.[options3];
                value8 !== void 0 && value8 !== "start" && items3.push([
                  "text-align",
                  value8 === "center" ? "center" : "right"
                ]);
                let value9 = table.cellStyles?.[String(options2) + "." + String(options3)];
                return value9 !== void 0 && items3.push([
                  "color",
                  serializeSlideColor(value9.color)
                ]), "<" + value7 + serializeStyleAttribute(items3) + ">" + escapeSlideHtmlText(input2, !0).replace(/\n/g, "<br>") + "</" + value7 + ">";
              }), value6 = table.rowStyles?.[String(options2)];
              this.line(options + 1, "<tr" + serializeStyleAttribute(value6 !== void 0 ? [
                [
                  "background",
                  serializeSlideColor(value6.background)
                ]
              ] : []) + ">" + value5.join("") + "</tr>");
            }), this.line(options, "</table>");
            return;
          }
          case "html": {
            if (items.length === 0) {
              this.line(options, "<!-- a web embed inside a container has no HTML spelling — dropped -->");
              return;
            }
            let centeredEdge = (axis, span, nearProperty, farProperty) => {
              let position = axis?.anchor === "center" ? serializeAxisPosition(axis, span) : void 0;
              if (!(position?.size === void 0 || span === void 0))
                return position.at < 0 && span - position.at - position.size >= 0 ? [
                  farProperty,
                  (0, runtime2.formatCssPixels)(span - position.at - position.size)
                ] : [nearProperty, (0, runtime2.formatCssPixels)(position.at)];
            }, leftEdge = centeredEdge(detail?.x, detail?.spanW, "left", "right"), topEdge = centeredEdge(detail?.y, detail?.spanH, "top", "bottom"), embedDecls = items.map((entry) => entry[0] === "left" ? leftEdge ?? entry : entry[0] === "top" ? topEdge ?? entry : entry);
            this.line(options, "<x-embed" + value + serializeStyleAttribute(orderCssProperties(deduplicateCssProperties(embedDecls))) + ">" + table.html.replace(/<\/x-embed/gi, "<\\/x-embed") + "</x-embed>");
            return;
          }
        }
      }
      slide(input) {
        this.lists = input.lists;
        let { id: value, frames: value2 } = input, items = [], value3 = value2[0], items2 = [
          "background",
          serializeSlideColor(input.bg) ?? "#ffffff"
        ], slots = input.slots;
        if (value3 !== void 0 && value3.id === (0, runtime2.deterministicEmbedId)(value, 0) && isGradientBackgroundSlide(input) && value3.node.kind === "stack" && value3.node.style?.backgroundGradient !== void 0) {
          let color = value3.node.style.backgroundGradient.stops[0].color, value7 = serializeSlideColor(input.bg) ?? color;
          value7 === color && !(0, runtime2.gradientContainsAlpha)(value3.node.style.backgroundGradient) ? items2 = [
            "background",
            (0, runtime2.serializeCssGradient)(value3.node.style.backgroundGradient)
          ] : (items.push(["background-color", value7]), items2 = [
            "background-image",
            (0, runtime2.serializeCssGradient)(value3.node.style.backgroundGradient)
          ]), value3.node.slots !== void 0 && (slots = {
            ...value3.node.slots,
            ...input.slots
          }), value2 = value2.slice(1);
        }
        items.push(items2);
        let entries = /* @__PURE__ */ new Map();
        input.frames.forEach((input2, options) => entries.set(input2.id, options));
        let callback = (input2) => {
          let entry2 = entries.get(input2.id);
          return entry2 !== void 0 && input2.id === (0, runtime2.deterministicEmbedId)(value, entry2);
        }, value4 = -1;
        for (let index4 = 0; index4 < value2.length; index4++) {
          let value7 = value2[index4];
          if (callback(value7) && isFullBleedFrame(value7, !1) && (value7.node.kind === "stack" || value7.node.kind === "grid") && value7.build === void 0 && value7.node.place === void 0) {
            value4 = index4;
            break;
          }
        }
        let value5 = value4 >= 0 ? value2[value4].node : void 0;
        value5 !== void 0 && (value5.kind === "stack" || value5.kind === "grid") && (value5.kind === "stack" ? (items.push(["display", "flex"], ["flex-direction", value5.dir === "h" ? "row" : "column"]), value5.wrap === !0 && value5.dir === "h" && items.push(["flex-wrap", "wrap"]), items.push(...serializeGapDeclarations(value5)), value5.align !== "stretch" && items.push(["align-items", value5.align]), value5.justify !== void 0 && value5.justify !== "start" && items.push([
          "justify-content",
          {
            center: "center",
            end: "end",
            between: "space-between",
            around: "space-around",
            evenly: "space-evenly"
          }[value5.justify]
        ])) : (items.push(["display", "grid"], [
          "grid-template-columns",
          value5.columns.map(serializeGridTrack).join(" ")
        ]), value5.rows !== void 0 && items.push([
          "grid-template-rows",
          value5.rows.map(serializeGridTrack).join(" ")
        ]), items.push(...serializeGapDeclarations(value5)), value5.alignItems !== void 0 && value5.alignItems !== "stretch" && items.push(["align-items", value5.alignItems]), value5.justifyItems !== void 0 && value5.justifyItems !== "stretch" && items.push(["justify-items", value5.justifyItems])), items.push(...serializeNodeStyle(value5.style)));
        let value6 = ' id="' + escapeSlideHtmlAttribute(value) + '"', entry = this.sectionAt.get(value);
        entry !== void 0 && (value6 += ' data-section="' + escapeSlideHtmlAttribute(entry.description) + '"'), input.transition !== void 0 && (value6 += ' data-transition="' + input.transition + '"'), input.skipped === !0 && (value6 += " hidden"), slots !== void 0 && (value6 += ' data-slots="' + (0, runtime2.formatNodeSlots)(slots) + '"'), this.line(0, "<section" + value6 + serializeStyleAttribute(orderCssProperties(items)) + ">"), value2.forEach((input2, options) => {
          if (options === value4) {
            let node = input2.node;
            for (let value9 of node.children)
              this.node(value9, 1);
            return;
          }
          let value7 = serializeFrameStyle(input2), value8 = callback(input2) ? "" : ' id="' + escapeSlideHtmlAttribute(input2.id) + '"';
          input2.build?.in !== void 0 && (value8 += ' data-build-in="' + serializeBuildEffect(input2.build.in) + '"'), input2.build?.out !== void 0 && (value8 += ' data-build-out="' + serializeBuildEffect(input2.build.out) + '"'), this.node(input2.node, 1, value7.decls, value8, value7.translate, {
            x: input2.x,
            y: input2.y,
            spanW: runtime2.SLIDE_WIDTH,
            spanH: runtime2.SLIDE_HEIGHT
          });
        }), input.notes !== void 0 && this.line(1, "<aside>" + escapeSlideHtmlText(input.notes, !0).replace(/\n/g, "<br>") + "</aside>"), this.line(0, "</section>");
      }
    }, roundSerializedNumber = (input) => Math.round(input * 100) / 100, quoteFontFamily = (input) => /^[A-Za-z][A-Za-z-]*$/.test(input) ? input : "'" + input + "'", initializeHtmlWriter = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeCssValueParser)(), (0, runtime2.initializeHtmlCompiler)(), (0, runtime2.initializeRichTextDom)(), (0, runtime2.initializeVideoLinks)(), (0, runtime2.initializeSections)(), (0, runtime2.initializeSlideTypeScales)(), serializedFontFallbacks = {
        sans: "sans-serif",
        serif: "serif",
        mono: "monospace",
        helvetica: "sans-serif"
      }, textRoleHtmlTags = {
        display: "h1",
        h1: "h1",
        h2: "h2",
        h3: "h3",
        lead: "p",
        eyebrow: "p",
        body: "p",
        caption: "p"
      }, cssPropertySerializationOrder = [
        "position",
        "top",
        "right",
        "bottom",
        "left",
        "width",
        "height",
        "display",
        "flex-direction",
        "flex-wrap",
        "gap",
        "row-gap",
        "align-items",
        "justify-content",
        "justify-items",
        "grid-template-columns",
        "grid-template-rows",
        "flex",
        "align-self",
        "min-width",
        "max-width",
        "min-height",
        "max-height",
        "aspect-ratio",
        "grid-column",
        "grid-row",
        "justify-self",
        "padding",
        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "line-height",
        "letter-spacing",
        "text-align",
        "text-transform",
        "white-space",
        "text-decoration",
        "font-variant-numeric",
        "-webkit-text-stroke",
        "color",
        "background",
        "background-color",
        "background-image",
        "-webkit-background-clip",
        "background-clip",
        "-webkit-text-fill-color",
        "border",
        "border-top",
        "border-right",
        "border-bottom",
        "border-left",
        "border-radius",
        "object-fit",
        "opacity",
        "box-shadow",
        "text-shadow",
        "transform",
        "filter",
        "backdrop-filter",
        "mix-blend-mode",
        "overflow"
      ], cssPropertyOrderMap = new Map(cssPropertySerializationOrder.map((input, options) => [input, options]));
    });
  };
}
export {
  installSerializationHtml
};
