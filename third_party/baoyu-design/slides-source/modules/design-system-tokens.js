// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDesignSystemTokens(runtime2) {
  var designSystemsCapabilityName, designTokenNamePattern, clampColorChannel, colorChannelToHex, linearSrgbToSrgb, defaultPaletteTitle, numericTokenSuffixPattern, designColorTokenPattern, designSystemSingleGroupCache, maxTypographyDesignTokens, maxTypographyTokenGroups, maxTypographyTokenFamilies, maxDesignSystemFontFiles, maxTypographyTokenGroupNameLength, cssTypeTokenLengthPattern, safeFontTokenStringPattern, genericFontFamilyPattern, roundTypeTokenValue, typeTokenLengthPixels, fontWeightLabels, initializeDesignTokenParser;
  function parseColorNumberOrPercent(text, percentBase) {
    if (text === "none")
      return 0;
    let value = /^(-?\d*\.?\d+(?:e-?\d+)?)(%?)$/.exec(text);
    if (value !== null)
      return value[2] === "%" ? Number(value[1]) / 100 * percentBase : Number(value[1]);
  }
  function parseColorHueDegrees(hue) {
    let value = /^(-?\d*\.?\d+)(deg|rad|grad|turn)?$/.exec(hue === "none" ? "0" : hue);
    if (value !== null)
      return (Number(value[1]) * (value[2] === "rad" ? 180 / Math.PI : value[2] === "grad" ? 0.9 : value[2] === "turn" ? 360 : 1) % 360 + 360) % 360;
  }
  function splitColorFunctionChannels(value, functionName) {
    let value2 = new RegExp("^" + functionName + "\\((.*)\\)$").exec(value);
    if (value2 === null)
      return;
    let value3 = value2[1].trim().split(/\s*[,/]\s*|\s+/);
    if (value3.length === 3 || value3.length === 4)
      return value3;
  }
  function oklabToSrgb(lightness, a, b) {
    let value = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3, value2 = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3, value3 = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      linearSrgbToSrgb(4.0767416621 * value - 3.3077115913 * value2 + 0.2309699292 * value3),
      linearSrgbToSrgb(-1.2684380046 * value + 2.6097574011 * value2 - 0.3413193965 * value3),
      linearSrgbToSrgb(-0.0041960863 * value - 0.7034186147 * value2 + 1.707614701 * value3)
    ];
  }
  function labToSrgb(lightness, a, b) {
    let value = (lightness + 16) / 116, value2 = value + a / 500, value3 = value - b / 200, callback = (input) => input ** 3 > 0.008856451679035631 ? input ** 3 : (116 * input - 16) / 903.2962962962963, [items, items2, items3] = [
      callback(value2) * 0.96422,
      (lightness > 8 ? value ** 3 : lightness / 903.2962962962963) * 1,
      callback(value3) * 0.82521
    ], value4 = 0.9555766 * items - 0.0230393 * items2 + 0.0631636 * items3, value5 = -0.0282895 * items + 1.0099416 * items2 + 0.0210077 * items3, value6 = 0.0122982 * items - 0.020483 * items2 + 1.3299098 * items3;
    return [
      linearSrgbToSrgb(3.2404542 * value4 - 1.5371385 * value5 - 0.4985314 * value6),
      linearSrgbToSrgb(-0.969266 * value4 + 1.8760108 * value5 + 0.041556 * value6),
      linearSrgbToSrgb(0.0556434 * value4 - 0.2040259 * value5 + 1.0572252 * value6)
    ];
  }
  function normalizeDesignTokenColor(color) {
    let value = color.trim().toLowerCase();
    if (value.length > 96)
      return;
    let value2 = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value)?.[1];
    if (value2 !== void 0) {
      let value8 = value2.length <= 4 ? [...value2].map((input) => input + input).join("") : value2;
      return "#" + (value8.endsWith("ff") && value8.length === 8 ? value8.slice(0, 6) : value8);
    }
    let value3 = /^(rgba?|hsla?|oklch|oklab|lab|lch)\(/.exec(value)?.[1], value4 = value3 !== void 0 ? splitColorFunctionChannels(value, value3) : void 0;
    if (value3 === void 0 || value4 === void 0)
      return;
    let value5 = value4[3] !== void 0 ? parseColorNumberOrPercent(value4[3], 1) : 1, value6;
    if (value3 === "rgb" || value3 === "rgba") {
      let [items, items2, items3] = [
        parseColorNumberOrPercent(value4[0], 255),
        parseColorNumberOrPercent(value4[1], 255),
        parseColorNumberOrPercent(value4[2], 255)
      ];
      items !== void 0 && items2 !== void 0 && items3 !== void 0 && (value6 = [items / 255, items2 / 255, items3 / 255]);
    } else if (value3 === "hsl" || value3 === "hsla") {
      let [items, items2, items3] = [
        parseColorHueDegrees(value4[0]),
        parseColorNumberOrPercent(value4[1].replace(/%$/, ""), 100),
        parseColorNumberOrPercent(value4[2].replace(/%$/, ""), 100)
      ];
      if (items !== void 0 && items2 !== void 0 && items3 !== void 0) {
        let [items4, items5] = [
          clampColorChannel(items2 / 100),
          clampColorChannel(items3 / 100)
        ], callback = (input) => {
          let value8 = (input + items / 30) % 12;
          return items5 - items4 * Math.min(items5, 1 - items5) * Math.max(-1, Math.min(value8 - 3, 9 - value8, 1));
        };
        value6 = [callback(0), callback(8), callback(4)];
      }
    } else if (value3 === "oklab" || value3 === "oklch") {
      let value8 = parseColorNumberOrPercent(value4[0], 1), value9 = parseColorNumberOrPercent(value4[1], 0.4), value10 = value3 === "oklab" ? parseColorNumberOrPercent(value4[2], 0.4) : void 0;
      if (value3 === "oklch") {
        let value11 = parseColorHueDegrees(value4[2]);
        value9 !== void 0 && value11 !== void 0 && ([value9, value10] = [
          Math.max(0, value9) * Math.cos(value11 * Math.PI / 180),
          Math.max(0, value9) * Math.sin(value11 * Math.PI / 180)
        ]);
      }
      value8 !== void 0 && value9 !== void 0 && value10 !== void 0 && (value6 = oklabToSrgb(clampColorChannel(value8), value9, value10));
    } else {
      let value8 = parseColorNumberOrPercent(value4[0], 100), value9 = parseColorNumberOrPercent(value4[1], value3 === "lab" ? 125 : 150), value10 = value3 === "lab" ? parseColorNumberOrPercent(value4[2], 125) : void 0;
      if (value3 === "lch") {
        let value11 = parseColorHueDegrees(value4[2]);
        value9 !== void 0 && value11 !== void 0 && ([value9, value10] = [
          Math.max(0, value9) * Math.cos(value11 * Math.PI / 180),
          Math.max(0, value9) * Math.sin(value11 * Math.PI / 180)
        ]);
      }
      value8 !== void 0 && value9 !== void 0 && value10 !== void 0 && (value6 = labToSrgb(Math.max(0, Math.min(100, value8)), value9, value10));
    }
    if (value6 === void 0 || value5 === void 0 || value6.some((input) => !Number.isFinite(input)))
      return;
    let value7 = "#" + colorChannelToHex(value6[0]) + colorChannelToHex(value6[1]) + colorChannelToHex(value6[2]);
    return value5 >= 1 ? value7 : value7 + colorChannelToHex(value5);
  }
  function commonTokenNamePrefix(names) {
    if (names.length < 2)
      return "";
    let value = names[0], text = "";
    for (let value2 = value.indexOf("-"); value2 > 0; value2 = value.indexOf("-", value2 + 1)) {
      let value3 = value.slice(0, value2 + 1);
      if (!names.every((items) => items.startsWith(value3) && items.length > value3.length))
        break;
      names.some((input) => tokenHasGroupSuffix(input, value3)) && (text = value3);
    }
    return text;
  }
  function tokenGroupName(name, prefix = "") {
    let value = prefix !== "" && name.startsWith(prefix) && name.length > prefix.length ? name.slice(prefix.length) : name, value2 = numericTokenSuffixPattern.exec(value);
    if (value2 !== null && value2[1] !== void 0 && value2[1] !== "")
      return value2[1];
    let value3 = value.indexOf("-");
    return value3 > 0 ? value.slice(0, value3) : value;
  }
  function tokenHasGroupSuffix(name, prefix = "") {
    let value = prefix !== "" && name.startsWith(prefix) && name.length > prefix.length ? name.slice(prefix.length) : name;
    return tokenGroupName(name, prefix) !== value;
  }
  function groupColorTokenNames(names) {
    let value = commonTokenNamePrefix(names), entries = /* @__PURE__ */ new Map();
    for (let value2 of names) {
      let value3 = tokenGroupName(value2, value), entry = entries.get(value3);
      entry === void 0 && entries.set(value3, entry = []), entry.push(value2);
    }
    let items = [], items2 = [];
    for (let [value2, value3] of entries)
      value3.some((input) => tokenHasGroupSuffix(input, value)) ? items.push({
        label: value2,
        names: value3
      }) : items2.push(...value3);
    let entries2 = new Map(names.map((input, options) => [input, options]));
    return items2.sort((input, options) => (entries2.get(input) ?? 0) - (entries2.get(options) ?? 0)), items2.length > 0 ? [
      {
        label: defaultPaletteTitle,
        names: items2
      },
      ...items
    ] : items;
  }
  function normalizeTokenName(name) {
    if (typeof name != "string")
      return;
    let value = name.replace(/^(--|\.)/, "");
    if (designTokenNamePattern.test(value))
      return value;
  }
  function boundedNonemptyString(value, maxLength) {
    if (typeof value != "string" || value.trim() === "")
      return;
    let value2 = value.trim();
    return value2.length > maxLength ? Array.from(value2).slice(0, maxLength).join("") : value2;
  }
  function designSystemName(tokens) {
    return boundedNonemptyString(tokens?.name, 80);
  }
  function createDesignSystemPalette(title, url, mode, colors, typography = []) {
    if (colors.length === 0 && typography.length === 0)
      return;
    let value = boundedNonemptyString(url, 2e3), value2 = boundedNonemptyString(mode, 80);
    return {
      title: boundedNonemptyString(title, 80) ?? "设计系统",
      ...value !== void 0 && /^https:\/\//.test(value) ? {
        url: value
      } : {},
      ...value2 !== void 0 ? {
        theme: value2
      } : {},
      colors,
      ...typography.length > 0 ? {
        type: typography
      } : {}
    };
  }
  function designSystemColorGrouping(system, color) {
    return designSystemHasSingleColorGroup(system) ? {
      group: system.title
    } : {
      group: system.title,
      subgroup: color.group
    };
  }
  function designSystemHasSingleColorGroup(system) {
    let entry = designSystemSingleGroupCache.get(system);
    return entry === void 0 && designSystemSingleGroupCache.set(system, entry = system.colors.every((input) => input.group === system.colors[0].group)), entry;
  }
  function designSystemTypeGrouping(system, typography) {
    let value = system.type ?? [];
    return value.every((input) => input.group === value[0].group) ? {
      group: system.title
    } : {
      group: system.title,
      subgroup: typography.group
    };
  }
  function normalizeDesignSystemPayload(payload) {
    if (typeof payload != "object" || payload === null)
      return;
    let value = payload;
    return parseDesignTokens(value.tokens, {
      title: boundedNonemptyString(value.title, 80),
      url: boundedNonemptyString(value.url, 2e3)
    });
  }
  function normalizeDesignSystems(payload) {
    if (typeof payload != "object" || payload === null)
      return [];
    let value = payload;
    if (value.systems === void 0 && (typeof value.color == "object" && value.color !== null || typeof value.type == "object" && value.type !== null))
      return normalizeDesignSystems({
        v: 1,
        systems: [
          {
            tokens: payload
          }
        ]
      });
    if (value.v !== void 0 && value.v !== 1 || !Array.isArray(value.systems))
      return [];
    let value2 = value.systems.map(normalizeDesignSystemPayload).filter((input) => input !== void 0), items = [];
    for (let value3 of value2) {
      if (items.length >= 4)
        break;
      let title = value3.title;
      for (let count = 2; items.some((input) => input.title === title) || title !== value3.title && value2.some((input) => input.title === title); count++)
        title = value3.title + " " + String(count);
      items.push(title === value3.title ? value3 : {
        ...value3,
        title
      });
    }
    return items;
  }
  function parseColorDesignTokens(tokens, metadata = {}, theme) {
    let value = tokens?.color;
    if (typeof value != "object" || value === null || !Array.isArray(value.tokens))
      return;
    let value2 = Array.isArray(value.themes) ? value.themes.map((input) => input) : [], value3 = value2.map((input) => typeof input?.id == "string" ? input.id.toLowerCase() : void 0).filter((input) => input !== void 0), entries = /* @__PURE__ */ new Map();
    value3.forEach((input, options) => void (entries.has(input) || entries.set(input, options)));
    let entries2 = /* @__PURE__ */ new Map();
    for (let value7 of value.tokens) {
      let value8 = value7, value9 = normalizeTokenName(value8?.name);
      if (value9 === void 0 || entries2.has(value9))
        continue;
      let value10 = value8?.value, value11 = typeof value10 == "string" ? value10 : void 0;
      if (typeof value10 == "object" && value10 !== null && !Array.isArray(value10)) {
        let entries4 = new Map(Object.entries(value10).map(([input, input2]) => [
          input.toLowerCase(),
          input2
        ])), value12 = 1 / 0;
        for (let [value13, value14] of entries4) {
          if (typeof value14 != "string")
            continue;
          let entry = entries.get(value13);
          (entry !== void 0 ? entry < value12 : value12 === 1 / 0 && value11 === void 0) && (value11 = value14, entry !== void 0 && (value12 = entry));
        }
      }
      entries2.set(value9, typeof value11 == "string" ? value11.trim() : "");
    }
    let callback = (input, options) => {
      let value7 = /^\{(.+)\}$/.exec(input)?.[1];
      if (value7 === void 0)
        return normalizeDesignTokenColor(input);
      let entry = entries2.get(normalizeTokenName(value7) ?? "");
      if (entry !== void 0 && options < 16)
        return callback(entry, options + 1);
    }, entries3 = /* @__PURE__ */ new Map(), state = {
      total: entries2.size,
      unresolved: 0,
      truncated: 0
    };
    for (let [value7, value8] of entries2) {
      let value9 = callback(value8, 0);
      value9 === void 0 ? state.unresolved++ : entries3.size >= 600 ? state.truncated++ : entries3.set(value7, value9);
    }
    theme !== void 0 && Object.assign(theme, state);
    let value4 = [...entries2].filter(([input, input2]) => entries3.has(input) || designColorTokenPattern.test(input2)).map(([input]) => input), value5 = groupColorTokenNames(value4).flatMap((input) => input.names.flatMap((input2) => entries3.has(input2) ? [
      {
        name: input2,
        value: entries3.get(input2),
        group: input.label
      }
    ] : [])), value6 = value2.find((input) => typeof input?.id == "string");
    return createDesignSystemPalette(boundedNonemptyString(metadata.title, 80) ?? designSystemName(tokens), metadata.url, typeof value6?.name == "string" ? value6.name : value6?.id, value5);
  }
  function parseDesignTokens(tokens, metadata = {}, theme) {
    let value = parseColorDesignTokens(tokens, metadata, theme), value2 = parseTypographyDesignTokens(tokens), system = value2.length === 0 ? value : value !== void 0 ? { ...value, type: value2 } : createDesignSystemPalette(boundedNonemptyString(metadata.title, 80) ?? designSystemName(tokens), metadata.url, void 0, [], value2);
    if (system === void 0)
      return;
    let families = designSystemTypeFamilies(tokens), fontFiles = designSystemFontFileFamilies(tokens);
    return {
      ...system,
      ...families.length > 0 ? { families } : {},
      ...fontFiles.length > 0 ? { fontFiles } : {}
    };
  }
  function parseTypeTokenFamilyMap(families) {
    let entries = /* @__PURE__ */ new Map();
    if (typeof families != "object" || families === null || Array.isArray(families))
      return entries;
    for (let [key, stack] of Object.entries(families)) {
      if (entries.size >= maxTypographyTokenFamilies)
        break;
      let name = key.trim().toLowerCase();
      designTokenNamePattern.test(name) && typeof stack == "string" && isSafeFontTokenString(stack.trim()) && entries.set(name, stack.trim());
    }
    return entries;
  }
  function designSystemTypeFamilies(tokens) {
    let type = tokens?.type;
    return [...parseTypeTokenFamilyMap(type?.families).values()].map(parseTypeTokenFontFamily);
  }
  function designSystemFontFileFamilies(tokens) {
    let type = tokens?.type, fonts = type?.fonts, families = /* @__PURE__ */ new Map();
    for (let entry of Array.isArray(fonts) ? fonts.slice(0, maxDesignSystemFontFiles) : []) {
      let { family, file } = typeof entry == "object" && entry !== null ? entry : {};
      typeof family != "string" || typeof file != "string" || file.trim() === "" || family.length > 80 || families.has(family.trim().toLowerCase()) || families.set(family.trim().toLowerCase(), family.trim());
    }
    return [...families.values()];
  }
  function isSafeFontTokenString(value) {
    if (!safeFontTokenStringPattern.test(value) || value.includes("/*") || value.includes("*/"))
      return !1;
    let value2 = null;
    for (let value3 of value)
      value2 === null ? value2 = value3 === '"' || value3 === "'" ? value3 : null : value3 === value2 && (value2 = null);
    return value2 === null;
  }
  function parseTypeTokenLength(value) {
    if (typeof value == "number")
      return Number.isFinite(value) && Math.abs(value) < 1e4 ? {
        n: roundTypeTokenValue(value),
        unit: "px"
      } : void 0;
    if (typeof value != "string")
      return;
    let value2 = value.trim().toLowerCase();
    if (value2 === "0")
      return {
        n: 0,
        unit: "px"
      };
    let value3 = cssTypeTokenLengthPattern.exec(value2);
    if (value3 !== null)
      return {
        n: Number(value3[1]),
        unit: value3[2]
      };
  }
  function isGenericFontFamily(family) {
    return genericFontFamilyPattern.test(family);
  }
  function parseTypeTokenFontFamily(value) {
    let value2 = /^\s*(?:"([^"]{1,80})"|'([^']{1,80})'|([A-Za-z0-9 _-]{1,80}))/.exec(value), value3 = (value.split(",").pop() ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase(), value4 = /mono/.test(value3) ? "mono" : /(^|ui-)serif$/.test(value3) ? "serif" : "sans";
    return {
      name: (value2?.[1] ?? value2?.[2] ?? value2?.[3] ?? "").trim(),
      stack: value,
      generic: value4
    };
  }
  function parseTypographyDesignTokens(tokens) {
    let value = tokens?.type;
    if (typeof value != "object" || value === null)
      return [];
    let entries = parseTypeTokenFamilyMap(value.families), callback = (input) => typeof input == "string" && entries.has(input.trim().toLowerCase()) ? input.trim().toLowerCase() : "", items = [], values = /* @__PURE__ */ new Set(), index4 = 0;
    for (let value2 of Array.isArray(value.groups) ? value.groups : []) {
      if (index4 >= maxTypographyTokenGroups)
        break;
      if (typeof value2 != "object" || value2 === null || Array.isArray(value2))
        continue;
      let value3 = value2;
      index4++;
      let value4 = (typeof value3.name == "string" ? [...value3.name].slice(0, maxTypographyTokenGroupNameLength).join("") : "") || "Type", value5 = callback(value3.family);
      for (let value6 of Array.isArray(value3.styles) ? value3.styles : []) {
        if (values.size >= maxTypographyDesignTokens)
          break;
        if (typeof value6 != "object" || value6 === null || Array.isArray(value6))
          continue;
        let value7 = value6, value8 = typeof value7.name == "string" ? value7.name.trim().replace(/^\./, "") : "", value9 = parseTypeTokenLength(value7.fontSize);
        if (!designTokenNamePattern.test(value8) || values.has(value8) || value9 === void 0)
          continue;
        values.add(value8);
        let value10 = roundTypeTokenValue(typeTokenLengthPixels(value9));
        if (value10 <= 0)
          continue;
        let value11 = typeof value7.lineHeight == "string" ? value7.lineHeight.trim() : value7.lineHeight, value12 = typeof value11 == "number" ? value11 : typeof value11 == "string" && /^\d(?:\.\d{1,6})?$/.test(value11) ? Number(value11) : void 0, count = 1.4;
        if (value12 !== void 0 && value12 > 0 && value12 < 10)
          count = roundTypeTokenValue(value12);
        else if (typeof value11 != "string" || value12 === void 0) {
          let value17 = parseTypeTokenLength(value11);
          value17 !== void 0 && (count = value17.n >= 0 ? roundTypeTokenValue(typeTokenLengthPixels(value17) / value10) : 1.3);
        }
        let fontWeight = value7.fontWeight, value13 = typeof fontWeight == "number" && Number.isInteger(fontWeight) && fontWeight >= 1 && fontWeight <= 1e3 ? fontWeight : typeof fontWeight == "string" ? fontWeight.trim() === "bold" ? 700 : /^(?:[1-9]\d{0,2}|1000)(?:\s+(?:[1-9]\d{0,2}|1000))?$/.test(fontWeight.trim()) ? Number(fontWeight.trim().split(/\s+/)[0]) : 400 : 400, value14 = parseTypeTokenLength(value7.letterSpacing), value15 = value14 === void 0 ? 0 : roundTypeTokenValue(value14.unit === "em" ? value14.n * value10 : value14.unit === "%" ? value14.n / 100 * value10 : value14.unit === "rem" ? value14.n * 16 : value14.n), value16 = callback(value7.family) || value5;
        items.push({
          name: value8,
          group: value4,
          fontSize: value10,
          lineHeight: count,
          fontWeight: value13,
          letterSpacing: value15,
          italic: value7.fontStyle === "italic",
          ...value16 !== "" ? {
            family: parseTypeTokenFontFamily(entries.get(value16))
          } : {}
        });
      }
    }
    return items;
  }
  function typographyTokenSubtitle(typography) {
    let callback = (input) => String(Math.round(input * 10) / 10);
    return (typography.family !== void 0 && typography.family.name !== "" ? typography.family.name + " · " : "") + callback(typography.fontSize) + "/" + String(Math.round(typography.fontSize * typography.lineHeight)) + " · " + (fontWeightLabels[typography.fontWeight] ?? String(typography.fontWeight)) + (typography.italic ? " · italic" : "");
  }
  return bindRuntimeValue(runtime2, "parseColorNumberOrPercent", () => parseColorNumberOrPercent), bindRuntimeValue(runtime2, "parseColorHueDegrees", () => parseColorHueDegrees), bindRuntimeValue(runtime2, "splitColorFunctionChannels", () => splitColorFunctionChannels), bindRuntimeValue(runtime2, "oklabToSrgb", () => oklabToSrgb), bindRuntimeValue(runtime2, "labToSrgb", () => labToSrgb), bindRuntimeValue(runtime2, "normalizeDesignTokenColor", () => normalizeDesignTokenColor), bindRuntimeValue(runtime2, "commonTokenNamePrefix", () => commonTokenNamePrefix), bindRuntimeValue(runtime2, "tokenGroupName", () => tokenGroupName), bindRuntimeValue(runtime2, "tokenHasGroupSuffix", () => tokenHasGroupSuffix), bindRuntimeValue(runtime2, "groupColorTokenNames", () => groupColorTokenNames), bindRuntimeValue(runtime2, "normalizeTokenName", () => normalizeTokenName), bindRuntimeValue(runtime2, "boundedNonemptyString", () => boundedNonemptyString), bindRuntimeValue(runtime2, "designSystemName", () => designSystemName), bindRuntimeValue(runtime2, "createDesignSystemPalette", () => createDesignSystemPalette), bindRuntimeValue(runtime2, "designSystemColorGrouping", () => designSystemColorGrouping), bindRuntimeValue(runtime2, "designSystemHasSingleColorGroup", () => designSystemHasSingleColorGroup), bindRuntimeValue(runtime2, "designSystemTypeGrouping", () => designSystemTypeGrouping), bindRuntimeValue(runtime2, "normalizeDesignSystemPayload", () => normalizeDesignSystemPayload), bindRuntimeValue(runtime2, "normalizeDesignSystems", () => normalizeDesignSystems), bindRuntimeValue(runtime2, "parseColorDesignTokens", () => parseColorDesignTokens), bindRuntimeValue(runtime2, "parseDesignTokens", () => parseDesignTokens), bindRuntimeValue(runtime2, "parseTypeTokenFamilyMap", () => parseTypeTokenFamilyMap), bindRuntimeValue(runtime2, "designSystemTypeFamilies", () => designSystemTypeFamilies), bindRuntimeValue(runtime2, "designSystemFontFileFamilies", () => designSystemFontFileFamilies), bindRuntimeValue(runtime2, "maxDesignSystemFontFiles", () => maxDesignSystemFontFiles), bindRuntimeValue(runtime2, "isSafeFontTokenString", () => isSafeFontTokenString), bindRuntimeValue(runtime2, "parseTypeTokenLength", () => parseTypeTokenLength), bindRuntimeValue(runtime2, "isGenericFontFamily", () => isGenericFontFamily), bindRuntimeValue(runtime2, "parseTypeTokenFontFamily", () => parseTypeTokenFontFamily), bindRuntimeValue(runtime2, "parseTypographyDesignTokens", () => parseTypographyDesignTokens), bindRuntimeValue(runtime2, "typographyTokenSubtitle", () => typographyTokenSubtitle), bindRuntimeValue(runtime2, "designSystemsCapabilityName", () => designSystemsCapabilityName, (value) => {
    designSystemsCapabilityName = value;
  }), bindRuntimeValue(runtime2, "designTokenNamePattern", () => designTokenNamePattern, (value) => {
    designTokenNamePattern = value;
  }), bindRuntimeValue(runtime2, "clampColorChannel", () => clampColorChannel, (value) => {
    clampColorChannel = value;
  }), bindRuntimeValue(runtime2, "colorChannelToHex", () => colorChannelToHex, (value) => {
    colorChannelToHex = value;
  }), bindRuntimeValue(runtime2, "linearSrgbToSrgb", () => linearSrgbToSrgb, (value) => {
    linearSrgbToSrgb = value;
  }), bindRuntimeValue(runtime2, "defaultPaletteTitle", () => defaultPaletteTitle, (value) => {
    defaultPaletteTitle = value;
  }), bindRuntimeValue(runtime2, "numericTokenSuffixPattern", () => numericTokenSuffixPattern, (value) => {
    numericTokenSuffixPattern = value;
  }), bindRuntimeValue(runtime2, "designColorTokenPattern", () => designColorTokenPattern, (value) => {
    designColorTokenPattern = value;
  }), bindRuntimeValue(runtime2, "designSystemSingleGroupCache", () => designSystemSingleGroupCache, (value) => {
    designSystemSingleGroupCache = value;
  }), bindRuntimeValue(runtime2, "maxTypographyDesignTokens", () => maxTypographyDesignTokens, (value) => {
    maxTypographyDesignTokens = value;
  }), bindRuntimeValue(runtime2, "maxTypographyTokenGroups", () => maxTypographyTokenGroups, (value) => {
    maxTypographyTokenGroups = value;
  }), bindRuntimeValue(runtime2, "maxTypographyTokenFamilies", () => maxTypographyTokenFamilies, (value) => {
    maxTypographyTokenFamilies = value;
  }), bindRuntimeValue(runtime2, "maxTypographyTokenGroupNameLength", () => maxTypographyTokenGroupNameLength, (value) => {
    maxTypographyTokenGroupNameLength = value;
  }), bindRuntimeValue(runtime2, "cssTypeTokenLengthPattern", () => cssTypeTokenLengthPattern, (value) => {
    cssTypeTokenLengthPattern = value;
  }), bindRuntimeValue(runtime2, "safeFontTokenStringPattern", () => safeFontTokenStringPattern, (value) => {
    safeFontTokenStringPattern = value;
  }), bindRuntimeValue(runtime2, "genericFontFamilyPattern", () => genericFontFamilyPattern, (value) => {
    genericFontFamilyPattern = value;
  }), bindRuntimeValue(runtime2, "roundTypeTokenValue", () => roundTypeTokenValue, (value) => {
    roundTypeTokenValue = value;
  }), bindRuntimeValue(runtime2, "typeTokenLengthPixels", () => typeTokenLengthPixels, (value) => {
    typeTokenLengthPixels = value;
  }), bindRuntimeValue(runtime2, "fontWeightLabels", () => fontWeightLabels, (value) => {
    fontWeightLabels = value;
  }), bindRuntimeValue(runtime2, "initializeDesignTokenParser", () => initializeDesignTokenParser, (value) => {
    initializeDesignTokenParser = value;
  }), () => {
    designSystemsCapabilityName = "design-systems", clampColorChannel = (input) => Math.max(0, Math.min(1, input)), colorChannelToHex = (input) => Math.round(clampColorChannel(input) * 255).toString(16).padStart(2, "0"), linearSrgbToSrgb = (input) => input <= 31308e-7 ? 12.92 * input : 1.055 * Math.pow(input, 0.4166666666666667) - 0.055, defaultPaletteTitle = "Palette", maxTypographyDesignTokens = 80, maxTypographyTokenGroups = 12, maxTypographyTokenFamilies = 12, maxDesignSystemFontFiles = 4096, maxTypographyTokenGroupNameLength = 120, roundTypeTokenValue = (input) => Math.round(input * 1e3) / 1e3, typeTokenLengthPixels = (input) => input.unit === "rem" || input.unit === "em" ? input.n * 16 : input.n, initializeDesignTokenParser = (0, runtime2.initializeOnce)(() => {
      designTokenNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/, numericTokenSuffixPattern = /^(.*?)-\d{1,4}$/, designColorTokenPattern = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgba?|hsla?|oklch|oklab|lab|lch|color)\([0-9a-z.,%/ \-]{1,60}\)|\{.+\})$/i, designSystemSingleGroupCache = /* @__PURE__ */ new WeakMap(), cssTypeTokenLengthPattern = /^(-?\d{1,4}(?:\.\d{1,6})?)(px|rem|em|%)$/, safeFontTokenStringPattern = /^[^;{}<>()\\\r\n\f]{1,200}$/, genericFontFamilyPattern = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|emoji|math|fangsong|-apple-system|blinkmacsystemfont)$/i, fontWeightLabels = {
        300: "细体",
        330: "书籍体",
        400: "常规",
        430: "文本",
        500: "中等",
        600: "半粗",
        700: "加粗",
        800: "重体"
      };
    });
  };
}
export {
  installDesignSystemTokens
};
