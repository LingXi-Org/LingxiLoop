// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelTypography(runtime2) {
  var emptyTypographyStyles, systemTypographyStylesCache, inferredBodyRolePriority, clampTypographyValue, initializeTypographyInference;
  function typeScaleForRole(role, theme) {
    return (theme === "neutral" ? runtime2.neutralTypeScale : runtime2.anthropicTypeScale)[role];
  }
  function typographyFontKey(font, role, theme) {
    return font === void 0 ? theme === "neutral" ? "system" : typeScaleForRole(role, theme).serifDisplay ? "theme-serif" : "theme-sans" : font === "helvetica" ? "face:helvetica" : typeof font == "string" ? font : "face:" + font.family.toLowerCase();
  }
  function typographyComboKey(combo, theme, fontKey = typographyFontKey(combo.fontFamily, combo.role, theme)) {
    let items = [
      fontKey,
      combo.fontSize,
      combo.lineHeight
    ];
    return theme === "neutral" && items.push(combo.letterSpacing, combo.textTransform ?? ""), items.join("-").toLowerCase().replace(/\./g, "p").replace(/[^a-z0-9-]+/g, "_").replace(/[-_]+$/, "");
  }
  function nodeTypographyCombo(node, theme) {
    let value = typeScaleForRole(node.role, theme), value2 = node.style ?? {};
    return {
      role: node.role,
      fontFamily: value2.fontFamily,
      fontSize: value2.fontSize ?? value.fontSize,
      fontWeight: value2.fontWeight ?? value.fontWeight,
      italic: value2.fontStyle === "italic",
      lineHeight: value2.lineHeight ?? value.lineHeight,
      letterSpacing: value2.letterSpacing ?? 0,
      textTransform: value2.textTransform !== void 0 && value2.textTransform !== "none" ? value2.textTransform : void 0
    };
  }
  function systemTypographyStyles(theme) {
    let entry = systemTypographyStylesCache.get(theme);
    return entry === void 0 && (entry = runtime2.textRoles.map((input) => {
      let value = typeScaleForRole(input, theme);
      return {
        role: input,
        fontFamily: void 0,
        fontSize: value.fontSize,
        fontWeight: value.fontWeight,
        italic: !1,
        lineHeight: value.lineHeight,
        letterSpacing: 0,
        id: input,
        name: runtime2.textRoleLabels[input],
        hint: String(value.fontSize),
        count: 0,
        source: "ladder"
      };
    }), systemTypographyStylesCache.set(theme, entry)), entry;
  }
  function* iterateDeckTextNodes(slides) {
    let callback = function* (source) {
      source.kind === "text" && (yield source);
      for (let value of (0, runtime2.nodeChildren)(source) ?? [])
        yield* callback(value);
    };
    for (let value of slides)
      for (let value2 of value.frames)
        yield* callback(value2.node);
  }
  function typographyIsEmphasized(combo) {
    return combo.fontWeight >= 600 || combo.textTransform === "uppercase" || combo.letterSpacing > 0;
  }
  function inferTypographyRoles(combo, headingThreshold) {
    let value = combo.fontSize >= 40 ? "lead" : combo.fontSize < 28 ? "caption" : "body", value2 = combo.fontWeight >= 600 && combo.fontSize > 30 && combo.fontSize < headingThreshold ? ["h3"] : typographyIsEmphasized(combo) && combo.fontSize <= 30 ? ["eyebrow"] : [];
    return [.../* @__PURE__ */ new Set([...value2, value, "body"])];
  }
  function mostFrequentValue(counts, compare) {
    return [...counts.entries()].sort((input, options) => options[1] - input[1] || compare(input[0], options[0]))[0][0];
  }
  function dominantTypographyCombo(combinations, theme, rank = () => 0) {
    return [...combinations].sort((input, options) => rank(input) - rank(options) || options.count - input.count || options.combo.fontSize - input.combo.fontSize || compareTypographyComboKeys(input, options, theme))[0];
  }
  function compareTypographyComboKeys(combo, otherCombo, theme) {
    let value = typographyComboKey(combo.combo, theme), value2 = typographyComboKey(otherCombo.combo, theme);
    return value < value2 ? -1 : value > value2 ? 1 : 0;
  }
  function inferDeckTypographyStyles(slides, theme) {
    if (theme !== "neutral")
      return systemTypographyStyles(theme);
    let entries = /* @__PURE__ */ new Map();
    for (let value8 of iterateDeckTextNodes(slides)) {
      let value9 = nodeTypographyCombo(value8, theme), value10 = typographyComboKey(value9, theme), value11 = entries.get(value10) ?? {
        combo: value9,
        count: 0,
        roles: /* @__PURE__ */ new Map(),
        weights: /* @__PURE__ */ new Map(),
        italics: /* @__PURE__ */ new Map()
      };
      value11.count += 1, value11.roles.set(value8.role, (value11.roles.get(value8.role) ?? 0) + 1), value11.weights.set(value9.fontWeight, (value11.weights.get(value9.fontWeight) ?? 0) + 1), value11.italics.set(value9.italic, (value11.italics.get(value9.italic) ?? 0) + 1), entries.set(value10, value11);
    }
    if (entries.size === 0)
      return systemTypographyStyles(theme);
    let value = [...entries.values()].map((input) => {
      let value8 = mostFrequentValue(input.roles, (input2, options) => runtime2.textRoles.indexOf(input2) - runtime2.textRoles.indexOf(options)), fontWeight = typeScaleForRole(value8, theme).fontWeight, value9 = mostFrequentValue(input.weights, (input2, options) => input2 === fontWeight ? -1 : options === fontWeight ? 1 : input2 - options), value10 = mostFrequentValue(input.italics, (input2) => input2 ? 1 : -1);
      return {
        ...input,
        combo: {
          ...input.combo,
          role: value8,
          fontWeight: value9,
          italic: value10
        }
      };
    }), entries2 = /* @__PURE__ */ new Map(), callback = (input, options) => {
      options !== void 0 && !entries2.has(input) && entries2.set(input, options);
    }, value2 = value.filter((input) => input.combo.role === "h1" || input.combo.role === "display"), value3 = [...value2].sort((input, options) => options.combo.fontSize - input.combo.fontSize || options.count - input.count || compareTypographyComboKeys(input, options, theme))[0], value4 = value2.filter((input) => input !== value3), value5 = dominantTypographyCombo(value4, theme);
    value3 !== void 0 && value5 !== void 0 && value4.every((input) => value3.combo.fontSize > input.combo.fontSize) ? (callback("display", value3), callback("h1", value5)) : callback("h1", dominantTypographyCombo(value2, theme)), callback("h2", dominantTypographyCombo(value.filter((input) => input.combo.role === "h2"), theme)), callback("h3", dominantTypographyCombo(value.filter((input) => input.combo.role === "h3"), theme));
    let values = /* @__PURE__ */ new Set(), value6 = entries2.get("h2")?.combo.fontSize ?? entries2.get("h1")?.combo.fontSize ?? 1 / 0, value7 = value.filter((input) => input.combo.role !== "display" && input.combo.role !== "h1" && input.combo.role !== "h2" && input.combo.role !== "h3");
    for (let value8 of inferredBodyRolePriority) {
      if (entries2.has(value8))
        continue;
      let callback2 = (input) => inferTypographyRoles(input.combo, value6).indexOf(value8) * 2 + (value8 !== "h3" && value8 !== "eyebrow" && typographyIsEmphasized(input.combo) ? 1 : 0), value9 = dominantTypographyCombo(value7.filter((input) => !values.has(input) && inferTypographyRoles(input.combo, value6).includes(value8)), theme, callback2);
      value9 !== void 0 && (entries2.set(value8, value9), values.add(value9));
    }
    if (!entries2.has("body")) {
      let value8 = ["caption", "lead"].find((input) => entries2.has(input) && !typographyIsEmphasized(entries2.get(input).combo));
      value8 !== void 0 && (entries2.set("body", entries2.get(value8)), entries2.delete(value8));
    }
    let entry = entries2.get("body"), entry2 = entries2.get("caption");
    return entry !== void 0 && entry2 !== void 0 && entry.combo.fontSize < entry2.combo.fontSize && (entries2.set("body", entry2), entries2.set("caption", entry)), runtime2.textRoles.filter((input) => entries2.has(input)).map((input) => {
      let entry3 = entries2.get(input);
      return {
        ...entry3.combo,
        role: input,
        id: input,
        name: runtime2.textRoleLabels[input],
        hint: String(entry3.combo.fontSize),
        count: entry3.count,
        source: "deck"
      };
    });
  }
  function fontFamilyLabel(font) {
    return typeof font == "string" ? font.charAt(0).toUpperCase() + font.slice(1) : font.family;
  }
  function typographyStylesSignature(styles, theme) {
    return styles.map((input) => input.id + ":" + typographyComboKey(input, theme) + ":" + String(input.fontWeight) + (input.italic ? "i" : "")).join("|");
  }
  function nodeTypographyLabel(node, theme) {
    let value = nodeTypographyCombo(node, theme);
    return (value.fontFamily !== void 0 ? fontFamilyLabel(value.fontFamily) : theme === "neutral" ? "System" : typeScaleForRole(node.role, theme).serifDisplay ? "Serif" : "Sans") + " · " + String(value.fontSize);
  }
  function defaultBodyTypographyStyle(styles) {
    let value = styles.filter((input) => input.count > 0), value2 = value.filter((input) => input.role === "lead" || input.role === "caption").sort((input, options) => options.count - input.count || input.fontSize - options.fontSize);
    return value.find((input) => input.role === "body") ?? value2[0] ?? value.find((input) => input.role === "eyebrow") ?? [...value].sort((input, options) => options.count - input.count)[0] ?? null;
  }
  function typographyEmphasisMatches(combo, otherCombo) {
    return combo.fontWeight >= 600 == otherCombo.fontWeight >= 600 && combo.italic === otherCombo.italic;
  }
  function findTypographyStyle(node, styles, theme) {
    let value = nodeTypographyCombo(node, theme), value2 = typographyComboKey(value, theme), callback = (input) => input.fontWeight === value.fontWeight && input.italic === value.italic, callback2 = (input) => input.find((input2) => callback(input2) && input2.letterSpacing === value.letterSpacing) ?? input.find(callback) ?? input.find((input2) => typographyEmphasisMatches(value, input2)) ?? input[0], value3 = callback2(styles.filter((input) => typographyComboKey(input, theme) === value2));
    if (value3 !== void 0)
      return value3;
    let value4 = typographyComboKey(value, theme, "system");
    return callback2(styles.filter((input) => typographyUsesSystemFont(input, theme) && typographyComboKey(input, theme, "system") === value4)) ?? null;
  }
  function findExactTypographyStyle(node, styles, theme) {
    let value = findTypographyStyle(node, styles, theme);
    return value !== null && typographyEmphasisMatches(nodeTypographyCombo(node, theme), value) ? value : null;
  }
  function matchingTypographyNodes(node, slides, styles, theme) {
    let value = findExactTypographyStyle(node, styles, theme), value2 = nodeTypographyCombo(node, theme), value3 = typographyComboKey(value2, theme), callback = (input) => {
      if (value !== null)
        return findExactTypographyStyle(input, styles, theme) === value;
      let value4 = nodeTypographyCombo(input, theme);
      return findExactTypographyStyle(input, styles, theme) === null && typographyComboKey(value4, theme) === value3 && typographyEmphasisMatches(value4, value2);
    };
    return {
      style: value,
      mixed: slides.some((input) => !callback(input))
    };
  }
  function clearTypographyOverrides(node, style, theme) {
    let { fontSize: value, fontWeight: value2, lineHeight: value3, letterSpacing: value4, textTransform: value5, fontFamily: value6, ...value7 } = node.style ?? {}, value8 = typographyUsesSystemFont(style, theme) && value6 !== void 0 ? {
      ...value7,
      fontFamily: value6
    } : value7, state = {
      ...node
    };
    return Object.keys(value8).length === 0 ? delete state.style : state.style = value8, applyTypographyStyle(state, style, theme);
  }
  function typographyEmphasisVariant(node, styles, theme) {
    let value = findTypographyStyle(node, styles, theme);
    if (value === null)
      return;
    let value2 = nodeTypographyCombo(node, theme).fontWeight >= 600, value3 = typographyComboKey(value, theme, typographyUsesSystemFont(value, theme) ? "system" : void 0);
    return (styles.find((input) => input !== value && typographyComboKey(input, theme, typographyUsesSystemFont(input, theme) ? "system" : void 0) === value3 && input.italic === value.italic && input.fontWeight >= 600 !== value2) ?? value).fontWeight;
  }
  function resolveNodeTypographyStyle(node, styles, fallbackStyles, theme, exact = !1) {
    let value = exact ? findExactTypographyStyle : findTypographyStyle, value2 = value(node, styles, theme) ?? void 0;
    return theme !== "neutral" ? value2?.source === "system" ? value2 : void 0 : value2 ?? value(node, fallbackStyles, theme) ?? fallbackStyles.find((dataset) => dataset.source === "deck" && dataset.id === node.role);
  }
  function resolveTypographyEmphasisVariant(node, styles, fallbackStyles, theme) {
    return typographyEmphasisVariant(node, styles, theme) ?? typographyEmphasisVariant(node, fallbackStyles, theme);
  }
  function typographyUsesSystemFont(style, theme) {
    return style.fontFamily !== void 0 || !("source" in style) ? !1 : style.source === "system" || style.source === "ladder" && theme === "neutral";
  }
  function applyTypographyStyle(node, style, theme) {
    let value = "source" in style && style.source === "system", value2 = value ? node.role : style.role, value3 = typeScaleForRole(value2, theme), state = {
      ...node.style
    }, callback = (input, options, context) => {
      context ? delete state[input] : state[input] = options;
    };
    callback("fontSize", style.fontSize, style.fontSize === value3.fontSize), callback("lineHeight", style.lineHeight, style.lineHeight === value3.lineHeight);
    let value4 = typographyUsesSystemFont(style, theme), value5 = nodeTypographyCombo(node, theme), value6 = typographyComboKey(value5, theme, value4 ? "system" : void 0) === typographyComboKey(style, theme, value4 ? "system" : void 0) && (value ? value5.fontWeight === style.fontWeight && value5.italic === style.italic : typographyEmphasisMatches(value5, style)) ? value5.fontWeight : style.fontWeight;
    callback("fontWeight", value6, value6 === value3.fontWeight), callback("fontStyle", "italic", !style.italic), (theme === "neutral" || value) && callback("letterSpacing", style.letterSpacing, style.letterSpacing === 0), theme === "neutral" && callback("textTransform", style.textTransform, style.textTransform === void 0), style.fontFamily !== void 0 ? state.fontFamily = style.fontFamily : value4 || delete state.fontFamily;
    let state2 = {
      ...node,
      role: value2
    };
    return Object.keys(state).length === 0 ? delete state2.style : state2.style = state, state2;
  }
  function collectDeckFontFamilies(faces, families) {
    let entries = /* @__PURE__ */ new Map();
    for (let value of [
      ...faces ?? [],
      ...Object.values(families ?? {})
    ])
      value !== void 0 && !entries.has(value.family.toLowerCase()) && entries.set(value.family.toLowerCase(), value.family);
    return entries;
  }
  function modelFontFromDesignToken(font, knownFamilies) {
    if (font === void 0)
      return;
    if (!(runtime2.customFontFamilyPattern.test(font.name) && !(0, runtime2.isGenericFontFamily)(font.name) && !/^(inherit|initial|unset|revert|revert-layer|default)$/i.test(font.name)))
      return font.generic;
    let entry = knownFamilies.get(font.name.toLowerCase());
    return entry !== void 0 ? {
      family: entry,
      fallback: font.generic
    } : (0, runtime2.resolveFontFamilyAlias)(font.name) ?? font.generic;
  }
  function designSystemTypographyStyles(systems, theme, knownFamilies = /* @__PURE__ */ new Map()) {
    let value = (0, runtime2.designSystemTypeRows)(systems);
    if (value.length === 0)
      return emptyTypographyStyles;
    let callback = (input) => typographyComboKey(input, theme, typographyUsesSystemFont(input, theme) ? "system" : void 0) + ":" + String(input.fontWeight) + (input.italic ? "i" : "") + ":" + String(input.letterSpacing), values = /* @__PURE__ */ new Set(), items = [];
    for (let value2 of value) {
      let style = value2.style, state = {
        role: "body",
        fontFamily: modelFontFromDesignToken(style.family, knownFamilies),
        fontSize: clampTypographyValue(Math.round(style.fontSize * 10) / 10, 8, 400),
        fontWeight: clampTypographyValue(Math.round(style.fontWeight / 100) * 100, 100, 900),
        italic: style.italic,
        lineHeight: clampTypographyValue(Math.round(style.lineHeight * 100) / 100, 0.5, 4),
        letterSpacing: clampTypographyValue(Math.round(style.letterSpacing * 10) / 10, -24, 32)
      }, state2 = {
        ...state,
        id: value2.id,
        name: style.name,
        hint: String(state.fontSize),
        count: 0,
        source: "system",
        group: value2.group,
        ...value2.subgroup !== void 0 ? {
          subgroup: value2.subgroup
        } : {},
        title: style.name + " · " + value2.subtitle
      };
      values.has(callback(state2)) || (values.add(callback(state2)), items.push(state2));
    }
    return items;
  }
  return bindRuntimeValue(runtime2, "typeScaleForRole", () => typeScaleForRole), bindRuntimeValue(runtime2, "typographyFontKey", () => typographyFontKey), bindRuntimeValue(runtime2, "typographyComboKey", () => typographyComboKey), bindRuntimeValue(runtime2, "nodeTypographyCombo", () => nodeTypographyCombo), bindRuntimeValue(runtime2, "systemTypographyStyles", () => systemTypographyStyles), bindRuntimeValue(runtime2, "iterateDeckTextNodes", () => iterateDeckTextNodes), bindRuntimeValue(runtime2, "typographyIsEmphasized", () => typographyIsEmphasized), bindRuntimeValue(runtime2, "inferTypographyRoles", () => inferTypographyRoles), bindRuntimeValue(runtime2, "mostFrequentValue", () => mostFrequentValue), bindRuntimeValue(runtime2, "dominantTypographyCombo", () => dominantTypographyCombo), bindRuntimeValue(runtime2, "compareTypographyComboKeys", () => compareTypographyComboKeys), bindRuntimeValue(runtime2, "inferDeckTypographyStyles", () => inferDeckTypographyStyles), bindRuntimeValue(runtime2, "fontFamilyLabel", () => fontFamilyLabel), bindRuntimeValue(runtime2, "typographyStylesSignature", () => typographyStylesSignature), bindRuntimeValue(runtime2, "nodeTypographyLabel", () => nodeTypographyLabel), bindRuntimeValue(runtime2, "defaultBodyTypographyStyle", () => defaultBodyTypographyStyle), bindRuntimeValue(runtime2, "typographyEmphasisMatches", () => typographyEmphasisMatches), bindRuntimeValue(runtime2, "findTypographyStyle", () => findTypographyStyle), bindRuntimeValue(runtime2, "findExactTypographyStyle", () => findExactTypographyStyle), bindRuntimeValue(runtime2, "matchingTypographyNodes", () => matchingTypographyNodes), bindRuntimeValue(runtime2, "clearTypographyOverrides", () => clearTypographyOverrides), bindRuntimeValue(runtime2, "typographyEmphasisVariant", () => typographyEmphasisVariant), bindRuntimeValue(runtime2, "resolveNodeTypographyStyle", () => resolveNodeTypographyStyle), bindRuntimeValue(runtime2, "resolveTypographyEmphasisVariant", () => resolveTypographyEmphasisVariant), bindRuntimeValue(runtime2, "typographyUsesSystemFont", () => typographyUsesSystemFont), bindRuntimeValue(runtime2, "applyTypographyStyle", () => applyTypographyStyle), bindRuntimeValue(runtime2, "collectDeckFontFamilies", () => collectDeckFontFamilies), bindRuntimeValue(runtime2, "modelFontFromDesignToken", () => modelFontFromDesignToken), bindRuntimeValue(runtime2, "designSystemTypographyStyles", () => designSystemTypographyStyles), bindRuntimeValue(runtime2, "emptyTypographyStyles", () => emptyTypographyStyles, (value) => {
    emptyTypographyStyles = value;
  }), bindRuntimeValue(runtime2, "systemTypographyStylesCache", () => systemTypographyStylesCache, (value) => {
    systemTypographyStylesCache = value;
  }), bindRuntimeValue(runtime2, "inferredBodyRolePriority", () => inferredBodyRolePriority, (value) => {
    inferredBodyRolePriority = value;
  }), bindRuntimeValue(runtime2, "clampTypographyValue", () => clampTypographyValue, (value) => {
    clampTypographyValue = value;
  }), bindRuntimeValue(runtime2, "initializeTypographyInference", () => initializeTypographyInference, (value) => {
    initializeTypographyInference = value;
  }), () => {
    clampTypographyValue = (input, options, context) => Math.min(context, Math.max(options, input)), initializeTypographyInference = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeDesignTokenParser)(), (0, runtime2.initializeDesignSystemsStore)(), (0, runtime2.initializeStyleSchema)(), (0, runtime2.initializeSlideTypeScales)(), (0, runtime2.initializeHtmlCompiler)(), emptyTypographyStyles = [], systemTypographyStylesCache = /* @__PURE__ */ new Map(), inferredBodyRolePriority = ["h3", "eyebrow", "lead", "caption", "body"];
    });
  };
}
export {
  installModelTypography
};
