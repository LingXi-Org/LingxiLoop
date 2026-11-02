// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorTemplateRestyling(runtime2) {
  var HEADING_TEXT_ROLES, RESTYLE_ROLE_FALLBACKS, hexColorToRgbUnit, rgbUnitToHexColor, MIN_RESTYLE_TEXT_CONTRAST, isRestyleNodeTranslucent;
  function classifyRestyleTextRole(role, label) {
    return HEADING_TEXT_ROLES.has(role) ? "heading" : role === "eyebrow" || label ? "label" : "plain";
  }
  function normalizeRestyleColor(color) {
    let normalized = (0, runtime2.resolveSlideColor)(color)?.toLowerCase();
    if (normalized !== void 0)
      return normalized.length === 4 || normalized.length === 5 ? "#" + [...normalized.slice(1)].map((input) => input + input).join("") : normalized.length === 7 || normalized.length === 9 ? normalized : (0, runtime2.stripHexAlpha)(normalized).toLowerCase();
  }
  function compositeColorOverBackground(foreground, background) {
    let alpha = foreground.length === 9 ? parseInt(foreground.slice(7, 9), 16) / 255 : 1, backgroundRgb = hexColorToRgbUnit(background);
    return hexColorToRgbUnit(foreground).map((input, options) => alpha * input + (1 - alpha) * backgroundRgb[options]);
  }
  function restyleColorContrast(foreground, background) {
    let foregroundColor = (0, runtime2.parseContrastColor)(foreground), backgroundColor = (0, runtime2.parseContrastColor)(background);
    return foregroundColor === void 0 || backgroundColor === void 0 ? 1 : (0, runtime2.contrastRatio)(foregroundColor, backgroundColor);
  }
  function colorHasOpaqueBackground(color) {
    let normalized = normalizeRestyleColor(color);
    return normalized !== void 0 && (normalized.length < 9 || parseInt(normalized.slice(7, 9), 16) > 127);
  }
  function nodeProvidesRestyleBackground(node) {
    return isRestyleNodeTranslucent(node) ? !1 : colorHasOpaqueBackground(node.style?.backgroundColor) || node.style?.backgroundGradient !== void 0 || node.kind === "img" || node.kind === "html" || node.kind === "shape" || node.kind === "overlay" && nodeProvidesRestyleBackground(node.base);
  }
  function subtreeProvidesRestyleBackground(node) {
    return nodeProvidesRestyleBackground(node) || !isRestyleNodeTranslucent(node) && ((0, runtime2.nodeChildren)(node) ?? []).some(subtreeProvidesRestyleBackground);
  }
  function* iterateUnbackedTextNodes(node) {
    if (!(nodeProvidesRestyleBackground(node) || isRestyleNodeTranslucent(node)))
      if (node.kind === "text")
        yield node;
      else if (node.kind === "overlay") {
        if (yield* iterateUnbackedTextNodes(node.base), subtreeProvidesRestyleBackground(node.base))
          return;
        for (let value of node.layers) {
          if (subtreeProvidesRestyleBackground(value.node))
            break;
          yield* iterateUnbackedTextNodes(value.node);
        }
      } else
        for (let value of (0, runtime2.nodeChildren)(node) ?? [])
          yield* iterateUnbackedTextNodes(value);
  }
  function mostCommonRestyleColor(colors) {
    let counts = /* @__PURE__ */ new Map();
    for (let value of colors) {
      let value2 = normalizeRestyleColor(value), value3 = counts.get(value2) ?? {
        first: value,
        n: 0
      };
      value3.n += 1, counts.set(value2, value3);
    }
    return [...counts.values()].sort((input, options) => options.n - input.n)[0]?.first;
  }
  function recursivelyRestyleNode(node, restyle) {
    return (0, runtime2.isFlowContainer)(node) ? restyle({
      ...node,
      children: node.children.map((input) => recursivelyRestyleNode(input, restyle))
    }) : node.kind === "overlay" ? restyle({
      ...node,
      base: recursivelyRestyleNode(node.base, restyle),
      layers: node.layers.map((input) => ({
        ...input,
        node: recursivelyRestyleNode(input.node, restyle)
      }))
    }) : restyle(node);
  }
  function createTemplateRestyler(options) {
    let { current, slides, typeStyles, theme } = options;
    if (current === void 0)
      return (input) => input;
    let value = (0, runtime2.isGradientBackgroundSlide)(current) ? current.frames[0] : void 0, callback = (input, options2) => ({
      ...input,
      bg: current.bg,
      frames: [
        ...value ? [
          {
            ...value,
            id: (0, runtime2.deterministicEmbedId)(input.id, 0)
          }
        ] : [],
        ...options2
      ]
    }), value2 = (0, runtime2.defaultBodyTypographyStyle)(typeStyles);
    if (value2 === null)
      return (input) => input.frames.length === 0 ? callback(input, []) : input;
    let value3 = typeStyles.filter((input) => input.count > 0), callback2 = (input) => value3.find((input2) => input2.id === input), callback3 = (input) => {
      let value7 = callback2(input) ?? (input === "display" ? callback2("h1") : void 0);
      if (value7 !== void 0)
        return value7;
      let value8 = (0, runtime2.typeScaleForRole)(input, theme), callback12 = (input2, options2) => ({
        role: input,
        fontFamily: input2.fontFamily,
        fontSize: Math.min(400, Math.max(8, Math.round(value8.fontSize * input2.fontSize / (0, runtime2.typeScaleForRole)(input2.role, theme).fontSize))),
        fontWeight: options2 ? input2.fontWeight : value8.fontWeight,
        italic: options2 && input2.italic,
        lineHeight: value8.lineHeight,
        letterSpacing: 0
      }), value9 = RESTYLE_ROLE_FALLBACKS[input].map(callback2).find((input2) => input2 !== void 0);
      if (HEADING_TEXT_ROLES.has(input))
        return value9 !== void 0 ? callback12(value9, !0) : callback12(value2, !1);
      let value10 = value9 ?? value2;
      return HEADING_TEXT_ROLES.has(value10.role) || input !== "eyebrow" && (value10.role === "eyebrow" || (0, runtime2.typographyIsEmphasized)(value10)) ? callback12(value10, !1) : value10;
    }, callback4 = (input) => String(normalizeRestyleColor(input.bg)?.slice(0, 7)) + ((0, runtime2.isGradientBackgroundSlide)(input) ? JSON.stringify(input.frames[0].node.style?.backgroundGradient) : ""), value4 = (normalizeRestyleColor(current.bg) ?? "#ffffff").slice(0, 7), value5 = (value?.node.style?.backgroundGradient?.stops ?? []).flatMap((input) => {
      let value7 = normalizeRestyleColor(input.color);
      return value7 !== void 0 ? [value7] : [];
    }), items = [
      ...value5.length > 0 && value5.every((items2) => items2.length === 7) ? [] : [value4],
      ...value5.map((input) => rgbUnitToHexColor(compositeColorOverBackground(input, value4)))
    ], callback5 = (input) => {
      let value7 = (0, runtime2.frameBounds)(input.x, input.y);
      return value7.x <= 0 && value7.y <= 0 && value7.x + value7.w >= runtime2.SLIDE_WIDTH && value7.y + value7.h >= runtime2.SLIDE_HEIGHT;
    }, callback6 = (source) => nodeProvidesRestyleBackground(source) || (0, runtime2.isFlowContainer)(source) && source.children.length > 0 && source.children.every(callback6) || source.kind === "overlay" && source.layers.some((input) => callback5(input) && callback6(input.node)), callback7 = (input) => callback6(input.node) && callback5(input), callback8 = (input) => {
      let value7 = (0, runtime2.isGradientBackgroundSlide)(input) ? input.frames.slice(1) : input.frames;
      return value7.some(callback7) ? [] : value7.flatMap((input2) => [
        ...iterateUnbackedTextNodes(input2.node)
      ]);
    }, value6 = [
      current,
      ...slides.filter((input) => input !== current && callback4(input) === callback4(current))
    ].flatMap(callback8).map((input) => {
      let value7 = (0, runtime2.findTypographyStyle)(input, typeStyles, theme)?.role;
      return {
        color: input.color,
        style: value7,
        ink: classifyRestyleTextRole(value7 ?? input.role, (0, runtime2.typographyIsEmphasized)((0, runtime2.nodeTypographyCombo)(input, theme)))
      };
    }), callback9 = (input) => {
      let value7 = normalizeRestyleColor(input);
      return value7 === void 0 || items.every((input2) => restyleColorContrast(value7, input2) >= MIN_RESTYLE_TEXT_CONTRAST);
    }, callback10 = (input, options2) => {
      let items2 = [
        value6.filter((input2) => input !== void 0 && input2.style === input),
        value6.filter((input2) => input2.ink === classifyRestyleTextRole(options2, !1)),
        value6
      ];
      for (let value7 of items2) {
        let value8 = value7.map((input2) => input2.color).filter(callback9);
        if (value8.length > 0)
          return mostCommonRestyleColor(value8);
      }
    }, callback11 = (source) => {
      if (source.kind !== "text" && source.kind !== "table")
        return source;
      let value7 = callback3(source.kind === "text" ? source.role : "body"), value8 = "source" in value7 ? value7.role : void 0;
      if (source.kind === "table") {
        let value11 = normalizeRestyleColor(callback10(value8, "body")), { fontFamily: value12, fontSize: value13, lineHeight: value14, fontWeight: value15, italic: value16 } = value7;
        return {
          ...source,
          style: {
            ...source.style,
            ...value12 !== void 0 ? {
              fontFamily: value12
            } : {},
            fontSize: value13,
            lineHeight: value14,
            fontWeight: value15,
            ...value16 ? {
              fontStyle: "italic"
            } : {},
            ...value11 !== void 0 ? {
              color: value11
            } : {}
          }
        };
      }
      let value9 = (0, runtime2.applyTypographyStyle)({
        ...source,
        style: {
          ...source.style,
          fontWeight: value7.fontWeight
        }
      }, value7, theme), value10 = callback10(value8, source.role);
      return value10 !== void 0 ? {
        ...value9,
        color: value10
      } : (delete value9.color, value9);
    };
    return (input) => callback(input, input.frames.map((input2) => ({
      ...input2,
      node: recursivelyRestyleNode(input2.node, callback11)
    })));
  }
  return bindRuntimeValue(runtime2, "HEADING_TEXT_ROLES", () => HEADING_TEXT_ROLES, (value) => {
    HEADING_TEXT_ROLES = value;
  }), bindRuntimeValue(runtime2, "RESTYLE_ROLE_FALLBACKS", () => RESTYLE_ROLE_FALLBACKS, (value) => {
    RESTYLE_ROLE_FALLBACKS = value;
  }), bindRuntimeValue(runtime2, "classifyRestyleTextRole", () => classifyRestyleTextRole), bindRuntimeValue(runtime2, "normalizeRestyleColor", () => normalizeRestyleColor), bindRuntimeValue(runtime2, "hexColorToRgbUnit", () => hexColorToRgbUnit, (value) => {
    hexColorToRgbUnit = value;
  }), bindRuntimeValue(runtime2, "compositeColorOverBackground", () => compositeColorOverBackground), bindRuntimeValue(runtime2, "rgbUnitToHexColor", () => rgbUnitToHexColor, (value) => {
    rgbUnitToHexColor = value;
  }), bindRuntimeValue(runtime2, "restyleColorContrast", () => restyleColorContrast), bindRuntimeValue(runtime2, "MIN_RESTYLE_TEXT_CONTRAST", () => MIN_RESTYLE_TEXT_CONTRAST, (value) => {
    MIN_RESTYLE_TEXT_CONTRAST = value;
  }), bindRuntimeValue(runtime2, "isRestyleNodeTranslucent", () => isRestyleNodeTranslucent, (value) => {
    isRestyleNodeTranslucent = value;
  }), bindRuntimeValue(runtime2, "colorHasOpaqueBackground", () => colorHasOpaqueBackground), bindRuntimeValue(runtime2, "nodeProvidesRestyleBackground", () => nodeProvidesRestyleBackground), bindRuntimeValue(runtime2, "subtreeProvidesRestyleBackground", () => subtreeProvidesRestyleBackground), bindRuntimeValue(runtime2, "iterateUnbackedTextNodes", () => iterateUnbackedTextNodes), bindRuntimeValue(runtime2, "mostCommonRestyleColor", () => mostCommonRestyleColor), bindRuntimeValue(runtime2, "recursivelyRestyleNode", () => recursivelyRestyleNode), bindRuntimeValue(runtime2, "createTemplateRestyler", () => createTemplateRestyler), () => {
    (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeHtmlWriter)(), (0, runtime2.initializeHtmlCompiler)(), (0, runtime2.initializeModelGeometry)(), (0, runtime2.initializeUiContrast)(), (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeTypographyInference)(), HEADING_TEXT_ROLES = /* @__PURE__ */ new Set(["display", "h1", "h2", "h3"]), RESTYLE_ROLE_FALLBACKS = {
      display: ["h1", "h2", "h3"],
      h1: ["display", "h2", "h3"],
      h2: ["h1", "h3", "display"],
      h3: ["h2", "h1", "display"],
      lead: ["body", "caption"],
      eyebrow: ["caption", "body"],
      body: [],
      caption: ["body", "lead"]
    }, hexColorToRgbUnit = (color) => [1, 3, 5].map((input) => parseInt(color.slice(input, input + 2), 16) / 255), rgbUnitToHexColor = (rgb) => "#" + rgb.map((input) => Math.round(input * 255).toString(16).padStart(2, "0")).join(""), MIN_RESTYLE_TEXT_CONTRAST = 3, isRestyleNodeTranslucent = (node) => (node.style?.opacity ?? 1) <= 0.5;
  };
}
export {
  installEditorTemplateRestyling
};
