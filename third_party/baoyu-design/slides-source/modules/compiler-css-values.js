// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCompilerCssValues(runtime2) {
  var forbiddenCssTokenPattern, cssPropertyNamePattern, cssUrlTokenPattern, cssNumberTokenPattern, cssIdentifierTokenPattern, namedCssColorHex, cssColorHexPattern, parsedGradientMetadata, gradientSourceMetadata, horizontalPositionKeywords, verticalPositionKeywords, cssBorderStyleAliases, borderWidthKeywords, cssFilterFunctionSpecs, supportedHtmlCssProperties, acceptedNoOpCssPropertyPatterns, unsupportedCssPropertyHints, cssCanonicalPropertyNames, gradientContainsAlpha, formatFlexFactor, gradientHasCustomRadialGeometry, initializeCssValueParser;
  function parseSingleCssName(text) {
    let value = /^\s*(?:"([^"]*)"|'([^']*)'|([^'"\s]+))\s*$/.exec(text), value2 = (value?.[1] ?? value?.[2] ?? value?.[3])?.trim();
    if (value2 !== void 0 && value2 !== "" && !/[\s"'\\<>{}()]/.test(value2))
      return value2;
  }
  function parseCssDeclarations(css, warn) {
    let declarations = [], start = 0, quote, depth = 0;
    for (let index4 = 0; index4 < css.length; index4++) {
      let value = css[index4];
      if (quote !== void 0) {
        value === quote && (quote = void 0);
        continue;
      }
      value === '"' || value === "'" ? quote = value : value === "(" ? start++ : value === ")" ? start = Math.max(0, start - 1) : value === ";" && start === 0 && (declarations.push(css.slice(depth, index4)), depth = index4 + 1);
    }
    declarations.push(css.slice(depth)), (quote !== void 0 || start > 0) && (warn("unbalanced " + (quote !== void 0 ? "quote" : "parenthesis") + " in style — the last declaration was dropped"), declarations.pop());
    let entries = /* @__PURE__ */ new Map();
    for (let value of declarations) {
      if (value.trim() === "")
        continue;
      let value2 = value.indexOf(":");
      if (value2 < 0) {
        warn('"' + compactDiagnosticValue(value) + '" is not a property: value declaration');
        continue;
      }
      let value3 = value.slice(0, value2).trim().toLowerCase(), value4 = value.slice(value2 + 1).trim();
      if (!cssPropertyNamePattern.test(value3)) {
        warn('"' + compactDiagnosticValue(value3) + '" is not a CSS property name');
        continue;
      }
      if (/!\s*important\s*$/i.test(value4)) {
        warn(value3 + ": !important is not in this format (inline styles already win) — dropped");
        continue;
      }
      if (value4 === "") {
        warn(value3 + ": empty value");
        continue;
      }
      let value5 = value3 === "background" || value3 === "background-image" ? value4.replace(cssUrlTokenPattern, "IMG") : value4;
      if (forbiddenCssTokenPattern.test(value5) || value5.length > 2048) {
        warn(value3 + ": value uses syntax this format does not admit (url/var/calc-like references, braces, @, backslashes) — dropped");
        continue;
      }
      entries.delete(value3), entries.set(value3, value4);
    }
    return [...entries].map(([input, input2]) => ({
      prop: input,
      value: input2
    }));
  }
  function compactDiagnosticValue(text, maxLength = 40) {
    let value = text.replace(/\s+/g, " ").trim();
    return value.length > maxLength ? value.slice(0, maxLength - 1) + "…" : value;
  }
  function tokenizeCssValue(css) {
    let tokens = [], position = 0, source = css;
    for (; position < source.length; ) {
      let value = source[position];
      if (/\s/.test(value)) {
        position++;
        continue;
      }
      if (value === ",") {
        tokens.push({
          t: "comma",
          raw: ","
        }), position++;
        continue;
      }
      if (value === "/") {
        tokens.push({
          t: "slash",
          raw: "/"
        }), position++;
        continue;
      }
      if (value === '"' || value === "'") {
        let value4 = source.indexOf(value, position + 1);
        if (value4 < 0) {
          tokens.push({
            t: "bad",
            raw: source.slice(position)
          });
          break;
        }
        tokens.push({
          t: "str",
          v: source.slice(position + 1, value4),
          raw: source.slice(position, value4 + 1)
        }), position = value4 + 1;
        continue;
      }
      if (value === "#") {
        let value4 = /^#[0-9a-fA-F]+/.exec(source.slice(position));
        if (value4) {
          tokens.push({
            t: "hash",
            v: value4[0].toLowerCase(),
            raw: value4[0]
          }), position += value4[0].length;
          continue;
        }
      }
      let value2 = cssNumberTokenPattern.exec(source.slice(position));
      if (value2 && (value !== "-" || /[\d.]/.test(source[position + 1] ?? ""))) {
        let value4 = position + value2[0].length, value5 = /^(%|[a-zA-Z]+)/.exec(source.slice(value4)), value6 = value5 ? value5[0].toLowerCase() : "";
        value5 && (value4 += value5[0].length);
        let value7 = Number(value2[0]);
        tokens.push(Number.isFinite(value7) ? {
          t: "num",
          n: value7,
          unit: value6,
          raw: source.slice(position, value4)
        } : {
          t: "bad",
          raw: source.slice(position, value4)
        }), position = value4;
        continue;
      }
      let value3 = cssIdentifierTokenPattern.exec(source.slice(position));
      if (value3) {
        let value4 = position + value3[0].length;
        if (source[value4] === "(") {
          let index4 = 0, value5 = value4;
          for (; value5 < source.length; value5++)
            if (source[value5] === "(")
              index4++;
            else if (source[value5] === ")" && (index4--, index4 === 0))
              break;
          if (value5 >= source.length) {
            tokens.push({
              t: "bad",
              raw: source.slice(position)
            });
            break;
          }
          tokens.push({
            t: "fn",
            name: value3[0].toLowerCase(),
            args: source.slice(value4 + 1, value5),
            raw: source.slice(position, value5 + 1)
          }), position = value5 + 1;
          continue;
        }
        tokens.push({
          t: "ident",
          v: value3[0].toLowerCase(),
          raw: value3[0]
        }), position = value4;
        continue;
      }
      tokens.push({
        t: "bad",
        raw: value
      }), position++;
    }
    return tokens;
  }
  function splitCssTokenGroups(tokens) {
    let groups = [[]];
    for (let value of tokens)
      value.t === "comma" ? groups.push([]) : groups[groups.length - 1].push(value);
    return groups;
  }
  function cssTokenPixels(token) {
    if (!(token === void 0 || token.t !== "num" || !Number.isFinite(token.n)) && (token.unit === "px" || token.unit === ""))
      return token.n;
  }
  function cssTokenSize(token) {
    if (!(token === void 0 || token.t !== "num" || !Number.isFinite(token.n))) {
      if (token.unit === "%")
        return {
          pct: token.n
        };
      if (token.unit === "px" || token.unit === "")
        return {
          px: token.n
        };
    }
  }
  function cssTokenRatio(token) {
    if (!(token === void 0 || token.t !== "num" || !Number.isFinite(token.n))) {
      if (token.unit === "%")
        return token.n / 100;
      if (token.unit === "")
        return token.n;
    }
  }
  function cssTokenDegrees(token) {
    if (!(token === void 0 || token.t !== "num" || !Number.isFinite(token.n)))
      switch (token.unit) {
        case "deg":
          return token.n;
        case "turn":
          return token.n * 360;
        case "rad":
          return token.n * 180 / Math.PI;
        case "grad":
          return token.n * 0.9;
        case "":
          return token.n === 0 ? 0 : void 0;
        default:
          return;
      }
  }
  function clampColorByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }
  function colorByteHex(value) {
    return clampColorByte(value).toString(16).padStart(2, "0");
  }
  function hslToHex(hue, saturation, lightness) {
    let value = (hue % 360 + 360) % 360 / 360, value2 = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation, value3 = 2 * lightness - value2, callback = (input) => {
      let value4 = input;
      return value4 < 0 && (value4 += 1), value4 > 1 && (value4 -= 1), value4 < 0.16666666666666666 ? value3 + (value2 - value3) * 6 * value4 : value4 < 0.5 ? value2 : value4 < 0.6666666666666666 ? value3 + (value2 - value3) * (0.6666666666666666 - value4) * 6 : value3;
    };
    return [
      callback(value + 0.3333333333333333) * 255,
      callback(value) * 255,
      callback(value - 0.3333333333333333) * 255
    ];
  }
  function normalizeCssColorHex(color) {
    let value = color.trim().toLowerCase();
    if (value === "")
      return;
    if (cssColorHexPattern.test(value)) {
      let value8 = value.slice(1);
      return (value8.length === 3 || value8.length === 4) && (value8 = [...value8].map((input) => input + input).join("")), value8.length === 8 && value8.endsWith("ff") && (value8 = value8.slice(0, 6)), "#" + value8;
    }
    if (Object.hasOwn(namedCssColorHex, value))
      return namedCssColorHex[value];
    if ((0, runtime2.normalizeCssColor)(value) === void 0)
      return;
    let value2 = tokenizeCssValue(value), value3 = value2[0];
    if (value2.length !== 1 || value3 === void 0 || value3.t !== "fn")
      return;
    let value4 = tokenizeCssValue(value3.args).filter((input) => input.t !== "comma" && input.t !== "slash"), callback = (input, options) => {
      if (!(input === void 0 || input.t !== "num")) {
        if (input.unit === "%")
          return input.n / 100 * options;
        if (input.unit === "")
          return input.n;
      }
    }, value5 = value4.length === 4 ? cssTokenRatio(value4[3]) : 1;
    if (value5 === void 0)
      return;
    let value6;
    if (value3.name === "rgb" || value3.name === "rgba") {
      let value8 = callback(value4[0], 255), value9 = callback(value4[1], 255), value10 = callback(value4[2], 255);
      if (value8 === void 0 || value9 === void 0 || value10 === void 0)
        return;
      value6 = [value8, value9, value10];
    } else if (value3.name === "hsl" || value3.name === "hsla") {
      let value8 = value4[0]?.t === "num" ? cssTokenDegrees(value4[0]) ?? (value4[0].unit === "" ? value4[0].n : void 0) : void 0, value9 = callback(value4[1], 1), value10 = callback(value4[2], 1);
      if (value8 === void 0 || value9 === void 0 || value10 === void 0)
        return;
      value6 = hslToHex(value8, Math.max(0, Math.min(1, value9)), Math.max(0, Math.min(1, value10)));
    } else
      return;
    let value7 = Math.max(0, Math.min(1, value5));
    return "#" + colorByteHex(value6[0]) + colorByteHex(value6[1]) + colorByteHex(value6[2]) + (value7 < 1 ? colorByteHex(value7 * 255) : "");
  }
  function parseCssColorTokens(tokens) {
    if (tokens.length === 1)
      return normalizeCssColorHex(tokens[0].raw);
  }
  function parseCssPositionTokens(tokens) {
    if (tokens.length < 1 || tokens.length > 2)
      return;
    let callback = (input, options) => {
      if (input.t === "ident")
        return Object.hasOwn(options, input.v) ? options[input.v] : void 0;
      if (input.t === "num" && (input.unit === "%" || input.n === 0 && input.unit === ""))
        return input.n;
    }, [value, value2] = tokens;
    if (value2 === void 0) {
      let value5 = value.t === "ident" && value.v !== "center" ? callback(value, verticalPositionKeywords) : void 0;
      if (value5 !== void 0)
        return {
          x: 50,
          y: value5
        };
      let value6 = callback(value, horizontalPositionKeywords);
      return value6 === void 0 ? void 0 : {
        x: value6,
        y: 50
      };
    }
    value.t === "ident" && value2.t === "ident" && (Object.hasOwn(verticalPositionKeywords, value.v) && value.v !== "center" || Object.hasOwn(horizontalPositionKeywords, value2.v) && value2.v !== "center") && ([value, value2] = [value2, value]);
    let value3 = callback(value, horizontalPositionKeywords), value4 = callback(value2, verticalPositionKeywords);
    if (!(value3 === void 0 || value4 === void 0))
      return {
        x: value3,
        y: value4
      };
  }
  function gradientLineLength(box, angle) {
    let value = angle * Math.PI / 180;
    return Math.abs(box.w * Math.sin(value)) + Math.abs(box.h * Math.cos(value));
  }
  function radialGradientDimensions(box, shape, extent, center) {
    let callback = (input) => Math.max(-100, Math.min(200, input)), [items, items2] = [
      callback(center?.x ?? 50) / 100 * box.w,
      callback(center?.y ?? 50) / 100 * box.h
    ], [items3, items4] = [
      Math.max(Math.abs(items), Math.abs(box.w - items)),
      Math.max(Math.abs(items2), Math.abs(box.h - items2))
    ], [items5, items6] = [
      Math.min(Math.abs(items), Math.abs(box.w - items)),
      Math.min(Math.abs(items2), Math.abs(box.h - items2))
    ];
    return shape === "circle" ? extent === "closest-side" ? Math.min(items5, items6) : extent === "farthest-side" ? Math.max(items3, items4) : extent === "closest-corner" ? Math.hypot(items5, items6) : Math.hypot(items3, items4) : extent === "closest-side" ? items5 : extent === "farthest-side" ? items3 : (extent === "closest-corner" ? items5 : items3) * Math.SQRT2;
  }
  function resolveCssGradientStopPositions(stops, positions) {
    let items = [...positions], length = items.length;
    items[0] ??= 0, items[length - 1] ??= 100;
    let value = -1 / 0;
    for (let index4 = 0; index4 < length; index4++)
      items[index4] !== void 0 && (value = items[index4] = Math.max(items[index4], value));
    for (let count = 1, index4 = 0; count < length; count++)
      if (items[count] !== void 0) {
        for (let value2 = index4 + 1; value2 < count; value2++)
          items[value2] = items[index4] + (items[count] - items[index4]) * (value2 - index4) / (count - index4);
        index4 = count;
      }
    return stops.map((input, options) => ({
      color: input,
      pos: items[options]
    }));
  }
  function interpolateGradientColors(fromColor, toColor, ratio) {
    let callback = (items3) => [1, 3, 5, 7].map((input) => items3.length > input ? parseInt(items3.slice(input, input + 2), 16) : 255), [items, items2] = [callback(fromColor), callback(toColor)], value = items[3] + (items2[3] - items[3]) * ratio;
    return "#" + [
      ...[0, 1, 2].map((input) => value === 0 ? 0 : Math.round((items[input] * items[3] + (items2[input] * items2[3] - items[input] * items[3]) * ratio) / value)),
      ...Math.round(value) === 255 ? [] : [Math.round(value)]
    ].map((input) => input.toString(16).padStart(2, "0")).join("");
  }
  function clipGradientStopsToRange(stops) {
    let callback = (input) => {
      let index4 = 0;
      for (; index4 + 1 < stops.length && stops[index4 + 1].pos <= input; )
        index4++;
      let [items2, items3] = [stops[index4], stops[index4 + 1]];
      return items3 === void 0 || input <= items2.pos ? items2.color : interpolateGradientColors(items2.color, items3.color, (input - items2.pos) / (items3.pos - items2.pos));
    }, value = stops.filter((input) => input.pos >= 0 && input.pos <= 100).map((input) => ({
      color: input.color,
      pos: Math.round(input.pos * 100) / 100
    })), items = [
      ...stops[0].pos < 0 && value[0]?.pos !== 0 ? [
        {
          color: callback(0),
          pos: 0
        }
      ] : [],
      ...value,
      ...stops[stops.length - 1].pos > 100 && value[value.length - 1]?.pos !== 100 ? [
        {
          color: callback(100),
          pos: 100
        }
      ] : []
    ];
    return items.length === 1 ? [
      {
        color: items[0].color,
        pos: 0
      },
      {
        color: items[0].color,
        pos: 100
      }
    ] : items;
  }
  function diagonalGradientAngle(angle, box) {
    let value = Math.atan(box.h / box.w) * 180 / Math.PI;
    return (Math.round((angle === 45 ? value : angle === 135 ? 180 - value : angle === 225 ? 180 + value : 360 - value) * 100) / 100 % 360 + 360) % 360;
  }
  function parseCssGradient(token, box) {
    if (token.t !== "fn")
      return;
    let value = token.name === "radial-gradient", value2 = token.name === "repeating-linear-gradient";
    if (!value && !value2 && token.name !== "linear-gradient")
      return;
    let value3 = splitCssTokenGroups(tokenizeCssValue(token.args)), count = 180, value4 = value3[0] ?? [], index4 = 0, text = "ellipse", value5, value6;
    if (value) {
      if (value4.length > 0 && value4[0].t === "ident" && !normalizeCssColorHex(value4[0].raw)) {
        index4 = 1;
        let values = /* @__PURE__ */ new Set();
        for (let index32 = 0; index32 < value4.length; index32++) {
          let value11 = value4[index32];
          if (value11.t !== "ident")
            return;
          let value12 = value11.v === "circle" || value11.v === "ellipse" ? "shape" : value11.v === "farthest-corner" || runtime2.radialGradientExtentValues.includes(value11.v) ? "extent" : value11.v === "at" ? "at" : void 0;
          if (value12 === void 0 || values.has(value12))
            return;
          if (values.add(value12), value12 === "shape")
            text = value11.v;
          else if (value12 === "extent")
            value5 = value11.v === "farthest-corner" ? void 0 : value11.v;
          else {
            if (value6 = parseCssPositionTokens(value4.slice(index32 + 1)), value6 === void 0)
              return;
            break;
          }
        }
      }
    } else if (value4.length > 0) {
      let value11 = value4[0];
      if (value11.t === "num" && value4.length === 1 && !normalizeCssColorHex(value11.raw)) {
        let value12 = cssTokenDegrees(value11);
        if (value12 === void 0)
          return;
        count = (value12 % 360 + 360) % 360, index4 = 1;
      } else if (value11.t === "ident" && value11.v === "to") {
        let value12 = value4.slice(1).map((input) => input.t === "ident" ? input.v : "?").sort().join(" "), value13 = {
          top: 0,
          right: 90,
          bottom: 180,
          left: 270,
          "right top": 45,
          "bottom right": 135,
          "bottom left": 225,
          "left top": 315
        }[value12];
        if (value13 === void 0)
          return;
        count = box !== void 0 && value13 % 90 !== 0 ? diagonalGradientAngle(value13, box) : value13, index4 = 1;
      }
    }
    let items = [], items2 = [], index22 = 0, flag = !1, callback = (input) => {
      let value11 = input.unit === "%" || input.n === 0 && input.unit === "";
      if (box === void 0)
        return value11 ? input.n : void 0;
      let value12 = value11 || input.unit !== "px" ? 0 : value ? radialGradientDimensions(box, text, value5, value6) : gradientLineLength(box, count), value13 = value11 ? input.n : value12 < 1 ? NaN : Math.round(input.n / value12 * 1e4) / 100;
      if (!Number.isNaN(value13))
        return flag ||= !value11, Math.max(-1e6, Math.min(1e6, value13));
    }, callback2 = (input) => {
      if (input.t !== "num")
        return;
      let value11 = value2 ? void 0 : callback(input), value12 = input.n === 0 && input.unit === "" ? 0 : value2 ? input.unit === "px" && input.n >= 0 ? input.n : void 0 : value11 === void 0 ? void 0 : Math.max(0, Math.min(100, value11));
      if (value12 !== void 0 && (index22 = Math.max(index22, value12)), value12 !== void 0)
        return index22;
    };
    for (let value11 of value3.slice(index4)) {
      if (value11.length === 0 || value11.length > 3)
        return;
      let value12 = normalizeCssColorHex(value11[0].raw);
      if (value12 === void 0)
        return;
      for (let value13 of value11.length === 1 ? [void 0] : value11.slice(1)) {
        let value14 = value13 === void 0 ? void 0 : callback2(value13);
        if (value13 !== void 0 && value14 === void 0)
          return;
        items.push(value14 === void 0 ? {
          color: value12
        } : {
          color: value12,
          pos: value14
        }), items2.push(value13?.t === "num" && !value2 ? callback(value13) : void 0);
      }
    }
    if (items.length < 2 || items.length > 8)
      return;
    let length = items.length, value7;
    if (value2) {
      if (value7 = items[length - 1].pos, value7 === void 0 || value7 < runtime2.gradientRepeatLengthSchema.lo || value7 > runtime2.gradientRepeatLengthSchema.hi)
        return;
      for (let value11 of items)
        value11.pos !== void 0 && (value11.pos = value11.pos / value7 * 100);
    }
    items[0].pos ??= 0, items[length - 1].pos ??= 100;
    for (let count2 = 1, index32 = 0; count2 < length; count2++)
      if (items[count2].pos !== void 0) {
        for (let value11 = index32 + 1; value11 < count2; value11++)
          items[value11].pos = items[index32].pos + (items[count2].pos - items[index32].pos) * (value11 - index32) / (count2 - index32);
        index32 = count2;
      }
    let value8 = box !== void 0 && !value2 && items2.some((input) => input !== void 0 && (input < 0 || input > 100)) && value5 === void 0 ? clipGradientStopsToRange(resolveCssGradientStopPositions(items.map((input) => input.color), items2)) : items.map((input) => ({
      color: input.color,
      pos: flag ? Math.round(input.pos * 100) / 100 : input.pos
    })), value9 = value6 === void 0 || value6.x === 50 && value6.y === 50, callback3 = (input) => Math.max(-100, Math.min(200, input)), value10 = value ? {
      angle: 180,
      radial: !0,
      ...text === "ellipse" ? {
        shape: text
      } : {},
      ...value5 !== void 0 ? {
        extent: value5
      } : {},
      ...value9 ? {} : {
        at: {
          x: callback3(value6.x),
          y: callback3(value6.y)
        }
      },
      stops: value8
    } : value7 !== void 0 ? {
      angle: count,
      repeat: value7,
      stops: value8
    } : {
      angle: count,
      stops: value8
    };
    return box !== void 0 && !flag && parsedGradientMetadata.set(value10, {
      first: items[0].color,
      seeThrough: gradientContainsAlpha({
        stops: items
      })
    }), value10;
  }
  function parseCssShadow(tokens, allowInset) {
    let value = tokens;
    if (value.some((input) => input.t === "comma"))
      return;
    let flag = !1, value2, items = [];
    for (let value7 of value) {
      if (value7.t === "ident" && value7.v === "inset") {
        flag = !0;
        continue;
      }
      let value8 = cssTokenPixels(value7);
      if (value8 !== void 0) {
        items.push(value8);
        continue;
      }
      let value9 = normalizeCssColorHex(value7.raw);
      if (value9 !== void 0 && value2 === void 0) {
        value2 = value9;
        continue;
      }
      return;
    }
    if (items.length < 2 || items.length > (allowInset ? 4 : 3) || value2 === void 0 || flag && !allowInset)
      return;
    let [value3, value4, value5 = 0, value6 = 0] = items;
    return allowInset ? flag ? {
      x: value3,
      y: value4,
      blur: value5,
      spread: value6,
      inset: !0,
      color: value2
    } : {
      x: value3,
      y: value4,
      blur: value5,
      spread: value6,
      color: value2
    } : {
      x: value3,
      y: value4,
      blur: value5,
      color: value2
    };
  }
  function parseCssBorder(tokens) {
    let state = {};
    for (let value of tokens) {
      let value2 = cssTokenPixels(value);
      if (value2 !== void 0 && state.width === void 0) {
        state.width = value2;
        continue;
      }
      if (value.t === "ident" && Object.hasOwn(borderWidthKeywords, value.v) && state.width === void 0) {
        state.width = borderWidthKeywords[value.v];
        continue;
      }
      if (value.t === "ident" && Object.hasOwn(cssBorderStyleAliases, value.v) && state.style === void 0) {
        state.style = cssBorderStyleAliases[value.v];
        continue;
      }
      let value3 = normalizeCssColorHex(value.raw);
      if (value3 !== void 0 && state.color === void 0) {
        state.color = value3;
        continue;
      }
      return;
    }
    return state;
  }
  function normalizeSignedDegrees(angle) {
    let value = ((angle + 180) % 360 + 360) % 360 - 180;
    return value === -180 ? 180 : value;
  }
  function parseCssTransform(tokens) {
    let state = {}, flag = !1, flag2 = !1;
    if (tokens.length === 1 && tokens[0].t === "ident" && tokens[0].v === "none")
      return {
        centerX: flag,
        centerY: flag2,
        value: {}
      };
    let flag3 = !1, index4 = 0, callback = (input, options) => {
      Object.hasOwn(state, input) && (flag3 = !0), state[input] = options;
    };
    for (let value of tokens) {
      if (value.t !== "fn")
        return;
      let value2 = value.name.startsWith("translate") ? 0 : value.name === "rotate" ? 1 : value.name === "scale" ? 2 : 3;
      value2 < index4 && (flag3 = !0), index4 = value2;
      let value3 = tokenizeCssValue(value.args).filter((input) => input.t !== "comma"), callback2 = (input, options) => {
        if (input !== void 0)
          return input.t === "num" && input.unit === "%" ? input.n !== -50 ? void 0 : (options === "x" ? flag = !0 : flag2 = !0, 0) : cssTokenPixels(input);
      };
      switch (value.name) {
        case "translate": {
          let value4 = callback2(value3[0], "x"), value5 = value3.length > 1 ? callback2(value3[1], "y") : 0;
          if (value4 === void 0 || value5 === void 0)
            return;
          value4 !== 0 && callback("translateX", value4), value5 !== 0 && callback("translateY", value5);
          break;
        }
        case "translatex": {
          let value4 = callback2(value3[0], "x");
          if (value4 === void 0 || value3.length !== 1)
            return;
          value4 !== 0 && callback("translateX", value4);
          break;
        }
        case "translatey": {
          let value4 = callback2(value3[0], "y");
          if (value4 === void 0 || value3.length !== 1)
            return;
          value4 !== 0 && callback("translateY", value4);
          break;
        }
        case "rotate": {
          let value4 = cssTokenDegrees(value3[0]);
          if (value4 === void 0 || value3.length !== 1)
            return;
          callback("rotate", normalizeSignedDegrees(value4));
          break;
        }
        case "scale": {
          let value4 = cssTokenRatio(value3[0]);
          if (value4 === void 0 || value3.length > 2 || value3.length === 2 && cssTokenRatio(value3[1]) !== value4)
            return;
          callback("scale", value4);
          break;
        }
        case "skew": {
          let value4 = cssTokenDegrees(value3[0]);
          if (value4 === void 0 || value3.length > 2)
            return;
          if (callback("skewX", value4), value3.length === 2) {
            let value5 = cssTokenDegrees(value3[1]);
            if (value5 === void 0)
              return;
            callback("skewY", value5);
          }
          break;
        }
        case "skewx":
        case "skewy": {
          let value4 = cssTokenDegrees(value3[0]);
          if (value4 === void 0 || value3.length !== 1)
            return;
          callback(value.name === "skewx" ? "skewX" : "skewY", value4);
          break;
        }
        default:
          return;
      }
    }
    if (!flag3)
      return {
        centerX: flag,
        centerY: flag2,
        value: state
      };
  }
  function parseCssFilter(tokens) {
    let state = {};
    if (tokens.length === 1 && tokens[0].t === "ident" && tokens[0].v === "none")
      return {};
    for (let value of tokens) {
      if (value.t !== "fn")
        return;
      let value2 = cssFilterFunctionSpecs[value.name];
      if (value2 === void 0 || Object.hasOwn(state, value2.field))
        return;
      let value3 = tokenizeCssValue(value.args);
      if (value3.length !== 1)
        return;
      let value4 = value2.kind === "px" ? cssTokenPixels(value3[0]) : value2.kind === "deg" ? cssTokenDegrees(value3[0]) : cssTokenRatio(value3[0]);
      if (value4 === void 0)
        return;
      state[value2.field] = value2.kind === "deg" ? (value4 % 360 + 360) % 360 : value4;
    }
    return state;
  }
  function expandCssBoxValues(tokens, parse) {
    let value = tokens.map(parse);
    if (value.length < 1 || value.length > 4 || value.some((input) => input === void 0))
      return;
    let [value2, value3 = value2, value4 = value2, value5 = value3] = value;
    return [value2, value3, value4, value5];
  }
  function parseCssFlex(tokens) {
    if (tokens.length === 1 && tokens[0].t === "ident")
      return tokens[0].v === "none" ? {
        grow: 0,
        shrink: 0,
        basis: "auto"
      } : tokens[0].v === "auto" ? {
        grow: 1,
        shrink: 1,
        basis: "auto"
      } : tokens[0].v === "initial" ? {
        grow: 0,
        shrink: 1,
        basis: "auto"
      } : void 0;
    let callback = (input) => input.t === "num" && input.unit === "", value = tokens[2], value2 = tokens.length === 3 && tokens.every(callback) && value?.t === "num" && value.n === 0 ? tokens.slice(0, 2) : tokens, value3 = value2.filter(callback), value4 = value2.filter((input) => !callback(input));
    if (value3.length < 1 || value3.length > 2 || value4.length > 1)
      return;
    let state = {
      grow: value3[0].n,
      shrink: value3.length === 2 ? value3[1].n : 1,
      basis: 0
    }, value5 = value4[0];
    if (value5 !== void 0)
      if (value5.t === "ident" && value5.v === "auto")
        state.basis = "auto";
      else if (value5.t === "num" && value5.unit === "%" && value5.n === 0)
        state.basis = 0;
      else {
        let value6 = cssTokenPixels(value5);
        if (value6 === void 0)
          return;
        state.basis = value6;
      }
    return state;
  }
  function parseCssGridTracks(tokens) {
    let items = [], callback = (input) => {
      if (input.t === "ident" && input.v === "auto")
        return "auto";
      if (input.t === "num" && input.unit === "fr")
        return {
          fr: input.n
        };
      let value = cssTokenPixels(input);
      if (value !== void 0)
        return {
          px: value
        };
    };
    for (let value of tokens) {
      if (value.t === "fn" && value.name === "repeat") {
        let value3 = splitCssTokenGroups(tokenizeCssValue(value.args)), value4 = value3[0]?.[0];
        if (value3.length !== 2 || value3[0].length !== 1 || value4 === void 0 || value4.t !== "num" || value4.unit !== "" || !Number.isInteger(value4.n) || value4.n < 1 || value4.n > 24)
          return;
        let value5 = value3[1].map(callback);
        if (value5.some((input) => input === void 0) || items.length + value4.n * value5.length > 24)
          return;
        for (let index4 = 0; index4 < value4.n; index4++)
          items.push(...value5);
        continue;
      }
      let value2 = callback(value);
      if (value2 === void 0 || items.length >= 24)
        return;
      items.push(value2);
    }
    if (items.length !== 0)
      return items;
  }
  function parseCssFontFamilies(tokens) {
    let items = [];
    for (let value of splitCssTokenGroups(tokens)) {
      if (value.length === 0)
        return;
      if (value.length === 1 && value[0].t === "str") {
        items.push(value[0].v.trim());
        continue;
      }
      if (value.every((input) => input.t === "ident" || input.t === "num" && input.unit === "" && Number.isInteger(input.n))) {
        items.push(value.map((input) => input.raw).join(" "));
        continue;
      }
      return;
    }
    if (items.length > 0)
      return items;
  }
  function parseCssFontShorthand(tokens) {
    let index4 = 0, state = {};
    for (; index4 < tokens.length; index4++) {
      let value3 = tokens[index4];
      if (value3.t === "ident" && (value3.v === "italic" || value3.v === "oblique"))
        state.style = "italic";
      else {
        if (value3.t === "ident" && value3.v === "normal")
          continue;
        if (value3.t === "ident" && value3.v === "bold")
          state.weight = 700;
        else if (value3.t === "num" && value3.unit === "" && value3.n >= 100 && value3.n <= 900 && tokens[index4 + 1]?.t === "num")
          state.weight = value3.n;
        else
          break;
      }
    }
    let value = cssTokenPixels(tokens[index4]);
    if (value === void 0)
      return;
    if (index4++, tokens[index4]?.t === "slash") {
      let value3 = tokens[index4 + 1];
      if (value3 === void 0 || value3.t !== "num" || value3.unit !== "")
        return;
      state.lineHeight = value3.n, index4 += 2;
    }
    let value2 = parseCssFontFamilies(tokens.slice(index4));
    if (value2 !== void 0)
      return {
        ...state,
        size: value,
        family: value2
      };
  }
  function parseCssFontWeight(tokens) {
    let value = tokens[0];
    if (!(tokens.length !== 1 || value === void 0)) {
      if (value.t === "num" && value.unit === "" && value.n >= 100 && value.n <= 900 && value.n % 100 === 0)
        return value.n;
      if (value.t === "ident" && value.v === "bold")
        return 700;
      if (value.t === "ident" && value.v === "normal")
        return 400;
    }
  }
  function canonicalCssPropertyName(property) {
    if (cssCanonicalPropertyNames === void 0) {
      cssCanonicalPropertyNames = /* @__PURE__ */ new Map();
      for (let [value, value2] of Object.entries(supportedHtmlCssProperties)) {
        value.includes(" ") || cssCanonicalPropertyNames.set(value, value);
        for (let value3 of value2.alias ?? [])
          cssCanonicalPropertyNames.set(value3, value);
      }
    }
    return cssCanonicalPropertyNames.get(property);
  }
  function cssPropertyValueHint(property) {
    let value = canonicalCssPropertyName(property);
    return value === void 0 ? "" : " — " + property + " is " + supportedHtmlCssProperties[value].v;
  }
  function formatCssNumber(value) {
    if (!Number.isFinite(value))
      return "0";
    let value2 = Math.round(value * 100) / 100;
    return value2 === 0 ? "0" : String(value2);
  }
  function formatCssPixels(value) {
    let value2 = formatCssNumber(value);
    return value2 === "0" ? "0" : value2 + "px";
  }
  function serializeCssGradient(gradient) {
    let value = gradient.radial !== !0 ? gradient.repeat : void 0, value2 = gradient.stops.map((input) => (normalizeCssColorHex(input.color) ?? input.color) + " " + (value !== void 0 ? formatCssPixels(input.pos / 100 * value) : formatCssNumber(input.pos) + "%")).join(", ");
    return value !== void 0 ? "repeating-linear-gradient(" + formatCssNumber(gradient.angle) + "deg, " + value2 + ")" : gradient.radial === !0 ? (0, runtime2.radialGradientPrefix)(gradient) + value2 + ")" : "linear-gradient(" + formatCssNumber(gradient.angle) + "deg, " + value2 + ")";
  }
  function serializeCssShadow(shadow) {
    let items = [
      formatCssPixels(shadow.x),
      formatCssPixels(shadow.y),
      formatCssPixels(shadow.blur)
    ];
    return shadow.spread !== void 0 && shadow.spread !== 0 && items.push(formatCssPixels(shadow.spread)), (shadow.inset === !0 ? "inset " : "") + items.join(" ") + " " + (normalizeCssColorHex(shadow.color) ?? shadow.color);
  }
  function serializeCssTransform(transform) {
    let items = [];
    return (transform.translateX !== void 0 || transform.translateY !== void 0) && items.push("translate(" + formatCssPixels(transform.translateX ?? 0) + ", " + formatCssPixels(transform.translateY ?? 0) + ")"), transform.rotate !== void 0 && items.push("rotate(" + formatCssNumber(transform.rotate) + "deg)"), transform.scale !== void 0 && items.push("scale(" + formatCssNumber(transform.scale) + ")"), (transform.skewX !== void 0 || transform.skewY !== void 0) && items.push("skew(" + formatCssNumber(transform.skewX ?? 0) + "deg, " + formatCssNumber(transform.skewY ?? 0) + "deg)"), items.join(" ");
  }
  function serializeCssFilter(filter) {
    let items = [];
    return filter.blur !== void 0 && items.push("blur(" + formatCssPixels(filter.blur) + ")"), filter.brightness !== void 0 && items.push("brightness(" + formatCssNumber(filter.brightness) + ")"), filter.contrast !== void 0 && items.push("contrast(" + formatCssNumber(filter.contrast) + ")"), filter.saturate !== void 0 && items.push("saturate(" + formatCssNumber(filter.saturate) + ")"), filter.grayscale !== void 0 && items.push("grayscale(" + formatCssNumber(filter.grayscale) + ")"), filter.sepia !== void 0 && items.push("sepia(" + formatCssNumber(filter.sepia) + ")"), filter.invert !== void 0 && items.push("invert(" + formatCssNumber(filter.invert) + ")"), filter.hueRotate !== void 0 && items.push("hue-rotate(" + formatCssNumber(filter.hueRotate) + "deg)"), items.join(" ");
  }
  return bindRuntimeValue(runtime2, "parseSingleCssName", () => parseSingleCssName), bindRuntimeValue(runtime2, "parseCssDeclarations", () => parseCssDeclarations), bindRuntimeValue(runtime2, "compactDiagnosticValue", () => compactDiagnosticValue), bindRuntimeValue(runtime2, "tokenizeCssValue", () => tokenizeCssValue), bindRuntimeValue(runtime2, "splitCssTokenGroups", () => splitCssTokenGroups), bindRuntimeValue(runtime2, "cssTokenPixels", () => cssTokenPixels), bindRuntimeValue(runtime2, "cssTokenSize", () => cssTokenSize), bindRuntimeValue(runtime2, "cssTokenRatio", () => cssTokenRatio), bindRuntimeValue(runtime2, "cssTokenDegrees", () => cssTokenDegrees), bindRuntimeValue(runtime2, "clampColorByte", () => clampColorByte), bindRuntimeValue(runtime2, "colorByteHex", () => colorByteHex), bindRuntimeValue(runtime2, "hslToHex", () => hslToHex), bindRuntimeValue(runtime2, "normalizeCssColorHex", () => normalizeCssColorHex), bindRuntimeValue(runtime2, "parseCssColorTokens", () => parseCssColorTokens), bindRuntimeValue(runtime2, "parseCssPositionTokens", () => parseCssPositionTokens), bindRuntimeValue(runtime2, "gradientLineLength", () => gradientLineLength), bindRuntimeValue(runtime2, "radialGradientDimensions", () => radialGradientDimensions), bindRuntimeValue(runtime2, "resolveCssGradientStopPositions", () => resolveCssGradientStopPositions), bindRuntimeValue(runtime2, "interpolateGradientColors", () => interpolateGradientColors), bindRuntimeValue(runtime2, "clipGradientStopsToRange", () => clipGradientStopsToRange), bindRuntimeValue(runtime2, "diagonalGradientAngle", () => diagonalGradientAngle), bindRuntimeValue(runtime2, "parseCssGradient", () => parseCssGradient), bindRuntimeValue(runtime2, "parseCssShadow", () => parseCssShadow), bindRuntimeValue(runtime2, "parseCssBorder", () => parseCssBorder), bindRuntimeValue(runtime2, "normalizeSignedDegrees", () => normalizeSignedDegrees), bindRuntimeValue(runtime2, "parseCssTransform", () => parseCssTransform), bindRuntimeValue(runtime2, "parseCssFilter", () => parseCssFilter), bindRuntimeValue(runtime2, "expandCssBoxValues", () => expandCssBoxValues), bindRuntimeValue(runtime2, "parseCssFlex", () => parseCssFlex), bindRuntimeValue(runtime2, "parseCssGridTracks", () => parseCssGridTracks), bindRuntimeValue(runtime2, "parseCssFontFamilies", () => parseCssFontFamilies), bindRuntimeValue(runtime2, "parseCssFontShorthand", () => parseCssFontShorthand), bindRuntimeValue(runtime2, "parseCssFontWeight", () => parseCssFontWeight), bindRuntimeValue(runtime2, "canonicalCssPropertyName", () => canonicalCssPropertyName), bindRuntimeValue(runtime2, "cssPropertyValueHint", () => cssPropertyValueHint), bindRuntimeValue(runtime2, "formatCssNumber", () => formatCssNumber), bindRuntimeValue(runtime2, "formatCssPixels", () => formatCssPixels), bindRuntimeValue(runtime2, "serializeCssGradient", () => serializeCssGradient), bindRuntimeValue(runtime2, "serializeCssShadow", () => serializeCssShadow), bindRuntimeValue(runtime2, "serializeCssTransform", () => serializeCssTransform), bindRuntimeValue(runtime2, "serializeCssFilter", () => serializeCssFilter), bindRuntimeValue(runtime2, "forbiddenCssTokenPattern", () => forbiddenCssTokenPattern, (value) => {
    forbiddenCssTokenPattern = value;
  }), bindRuntimeValue(runtime2, "cssPropertyNamePattern", () => cssPropertyNamePattern, (value) => {
    cssPropertyNamePattern = value;
  }), bindRuntimeValue(runtime2, "cssUrlTokenPattern", () => cssUrlTokenPattern, (value) => {
    cssUrlTokenPattern = value;
  }), bindRuntimeValue(runtime2, "cssNumberTokenPattern", () => cssNumberTokenPattern, (value) => {
    cssNumberTokenPattern = value;
  }), bindRuntimeValue(runtime2, "cssIdentifierTokenPattern", () => cssIdentifierTokenPattern, (value) => {
    cssIdentifierTokenPattern = value;
  }), bindRuntimeValue(runtime2, "namedCssColorHex", () => namedCssColorHex, (value) => {
    namedCssColorHex = value;
  }), bindRuntimeValue(runtime2, "cssColorHexPattern", () => cssColorHexPattern, (value) => {
    cssColorHexPattern = value;
  }), bindRuntimeValue(runtime2, "parsedGradientMetadata", () => parsedGradientMetadata, (value) => {
    parsedGradientMetadata = value;
  }), bindRuntimeValue(runtime2, "gradientSourceMetadata", () => gradientSourceMetadata, (value) => {
    gradientSourceMetadata = value;
  }), bindRuntimeValue(runtime2, "horizontalPositionKeywords", () => horizontalPositionKeywords, (value) => {
    horizontalPositionKeywords = value;
  }), bindRuntimeValue(runtime2, "verticalPositionKeywords", () => verticalPositionKeywords, (value) => {
    verticalPositionKeywords = value;
  }), bindRuntimeValue(runtime2, "cssBorderStyleAliases", () => cssBorderStyleAliases, (value) => {
    cssBorderStyleAliases = value;
  }), bindRuntimeValue(runtime2, "borderWidthKeywords", () => borderWidthKeywords, (value) => {
    borderWidthKeywords = value;
  }), bindRuntimeValue(runtime2, "cssFilterFunctionSpecs", () => cssFilterFunctionSpecs, (value) => {
    cssFilterFunctionSpecs = value;
  }), bindRuntimeValue(runtime2, "supportedHtmlCssProperties", () => supportedHtmlCssProperties, (value) => {
    supportedHtmlCssProperties = value;
  }), bindRuntimeValue(runtime2, "acceptedNoOpCssPropertyPatterns", () => acceptedNoOpCssPropertyPatterns, (value) => {
    acceptedNoOpCssPropertyPatterns = value;
  }), bindRuntimeValue(runtime2, "unsupportedCssPropertyHints", () => unsupportedCssPropertyHints, (value) => {
    unsupportedCssPropertyHints = value;
  }), bindRuntimeValue(runtime2, "cssCanonicalPropertyNames", () => cssCanonicalPropertyNames, (value) => {
    cssCanonicalPropertyNames = value;
  }), bindRuntimeValue(runtime2, "formatFlexFactor", () => formatFlexFactor, (value) => {
    formatFlexFactor = value;
  }), bindRuntimeValue(runtime2, "gradientContainsAlpha", () => gradientContainsAlpha, (value) => {
    gradientContainsAlpha = value;
  }), bindRuntimeValue(runtime2, "gradientHasCustomRadialGeometry", () => gradientHasCustomRadialGeometry, (value) => {
    gradientHasCustomRadialGeometry = value;
  }), bindRuntimeValue(runtime2, "initializeCssValueParser", () => initializeCssValueParser, (value) => {
    initializeCssValueParser = value;
  }), () => {
    gradientSourceMetadata = (input) => parsedGradientMetadata.get(input), formatFlexFactor = (value) => value >= 0 && value < 1e6 ? String(Math.round(value * 1e6) / 1e6) : formatCssNumber(value), gradientContainsAlpha = (input) => input.stops.some((input2) => {
      let value = normalizeCssColorHex(input2.color);
      return value === void 0 || value.length === 9 && !/ff$/i.test(value);
    }), gradientHasCustomRadialGeometry = (input) => input.radial === !0 && (input.shape !== void 0 || input.extent !== void 0 || input.at !== void 0), initializeCssValueParser = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeStyleSchema)(), forbiddenCssTokenPattern = /[<>@{}\\\0]|\/\*|(?:url|var|attr|env|expression|image-set|image|element|src|counters?|cross-fade|paint|format|local)\s*\(/i, cssPropertyNamePattern = /^-?[a-z][a-z0-9-]*$/, cssUrlTokenPattern = /^url\(\s*(?:"[^"()]*"|'[^'()]*'|[^'"()\s]+)\s*\)/i, cssNumberTokenPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i, cssIdentifierTokenPattern = /^-?[a-zA-Z_][\w-]*/, namedCssColorHex = {
        aliceblue: "#f0f8ff",
        antiquewhite: "#faebd7",
        aqua: "#00ffff",
        aquamarine: "#7fffd4",
        azure: "#f0ffff",
        beige: "#f5f5dc",
        bisque: "#ffe4c4",
        black: "#000000",
        blanchedalmond: "#ffebcd",
        blue: "#0000ff",
        blueviolet: "#8a2be2",
        brown: "#a52a2a",
        burlywood: "#deb887",
        cadetblue: "#5f9ea0",
        chartreuse: "#7fff00",
        chocolate: "#d2691e",
        coral: "#ff7f50",
        cornflowerblue: "#6495ed",
        cornsilk: "#fff8dc",
        crimson: "#dc143c",
        cyan: "#00ffff",
        darkblue: "#00008b",
        darkcyan: "#008b8b",
        darkgoldenrod: "#b8860b",
        darkgray: "#a9a9a9",
        darkgreen: "#006400",
        darkgrey: "#a9a9a9",
        darkkhaki: "#bdb76b",
        darkmagenta: "#8b008b",
        darkolivegreen: "#556b2f",
        darkorange: "#ff8c00",
        darkorchid: "#9932cc",
        darkred: "#8b0000",
        darksalmon: "#e9967a",
        darkseagreen: "#8fbc8f",
        darkslateblue: "#483d8b",
        darkslategray: "#2f4f4f",
        darkslategrey: "#2f4f4f",
        darkturquoise: "#00ced1",
        darkviolet: "#9400d3",
        deeppink: "#ff1493",
        deepskyblue: "#00bfff",
        dimgray: "#696969",
        dimgrey: "#696969",
        dodgerblue: "#1e90ff",
        firebrick: "#b22222",
        floralwhite: "#fffaf0",
        forestgreen: "#228b22",
        fuchsia: "#ff00ff",
        gainsboro: "#dcdcdc",
        ghostwhite: "#f8f8ff",
        gold: "#ffd700",
        goldenrod: "#daa520",
        gray: "#808080",
        green: "#008000",
        greenyellow: "#adff2f",
        grey: "#808080",
        honeydew: "#f0fff0",
        hotpink: "#ff69b4",
        indianred: "#cd5c5c",
        indigo: "#4b0082",
        ivory: "#fffff0",
        khaki: "#f0e68c",
        lavender: "#e6e6fa",
        lavenderblush: "#fff0f5",
        lawngreen: "#7cfc00",
        lemonchiffon: "#fffacd",
        lightblue: "#add8e6",
        lightcoral: "#f08080",
        lightcyan: "#e0ffff",
        lightgoldenrodyellow: "#fafad2",
        lightgray: "#d3d3d3",
        lightgreen: "#90ee90",
        lightgrey: "#d3d3d3",
        lightpink: "#ffb6c1",
        lightsalmon: "#ffa07a",
        lightseagreen: "#20b2aa",
        lightskyblue: "#87cefa",
        lightslategray: "#778899",
        lightslategrey: "#778899",
        lightsteelblue: "#b0c4de",
        lightyellow: "#ffffe0",
        lime: "#00ff00",
        limegreen: "#32cd32",
        linen: "#faf0e6",
        magenta: "#ff00ff",
        maroon: "#800000",
        mediumaquamarine: "#66cdaa",
        mediumblue: "#0000cd",
        mediumorchid: "#ba55d3",
        mediumpurple: "#9370db",
        mediumseagreen: "#3cb371",
        mediumslateblue: "#7b68ee",
        mediumspringgreen: "#00fa9a",
        mediumturquoise: "#48d1cc",
        mediumvioletred: "#c71585",
        midnightblue: "#191970",
        mintcream: "#f5fffa",
        mistyrose: "#ffe4e1",
        moccasin: "#ffe4b5",
        navajowhite: "#ffdead",
        navy: "#000080",
        oldlace: "#fdf5e6",
        olive: "#808000",
        olivedrab: "#6b8e23",
        orange: "#ffa500",
        orangered: "#ff4500",
        orchid: "#da70d6",
        palegoldenrod: "#eee8aa",
        palegreen: "#98fb98",
        paleturquoise: "#afeeee",
        palevioletred: "#db7093",
        papayawhip: "#ffefd5",
        peachpuff: "#ffdab9",
        peru: "#cd853f",
        pink: "#ffc0cb",
        plum: "#dda0dd",
        powderblue: "#b0e0e6",
        purple: "#800080",
        rebeccapurple: "#663399",
        red: "#ff0000",
        rosybrown: "#bc8f8f",
        royalblue: "#4169e1",
        saddlebrown: "#8b4513",
        salmon: "#fa8072",
        sandybrown: "#f4a460",
        seagreen: "#2e8b57",
        seashell: "#fff5ee",
        sienna: "#a0522d",
        silver: "#c0c0c0",
        skyblue: "#87ceeb",
        slateblue: "#6a5acd",
        slategray: "#708090",
        slategrey: "#708090",
        snow: "#fffafa",
        springgreen: "#00ff7f",
        steelblue: "#4682b4",
        tan: "#d2b48c",
        teal: "#008080",
        thistle: "#d8bfd8",
        tomato: "#ff6347",
        transparent: "#00000000",
        turquoise: "#40e0d0",
        violet: "#ee82ee",
        wheat: "#f5deb3",
        white: "#ffffff",
        whitesmoke: "#f5f5f5",
        yellow: "#ffff00",
        yellowgreen: "#9acd32"
      }, cssColorHexPattern = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/, parsedGradientMetadata = /* @__PURE__ */ new WeakMap(), horizontalPositionKeywords = {
        left: 0,
        center: 50,
        right: 100
      }, verticalPositionKeywords = {
        top: 0,
        center: 50,
        bottom: 100
      }, cssBorderStyleAliases = {
        none: "none",
        hidden: "none",
        solid: "solid",
        dashed: "dashed",
        dotted: "dotted",
        double: "double"
      }, borderWidthKeywords = {
        thin: 1,
        medium: 3,
        thick: 5
      }, cssFilterFunctionSpecs = {
        blur: {
          field: "blur",
          kind: "px"
        },
        brightness: {
          field: "brightness",
          kind: "frac"
        },
        contrast: {
          field: "contrast",
          kind: "frac"
        },
        saturate: {
          field: "saturate",
          kind: "frac"
        },
        grayscale: {
          field: "grayscale",
          kind: "frac"
        },
        sepia: {
          field: "sepia",
          kind: "frac"
        },
        invert: {
          field: "invert",
          kind: "frac"
        },
        "hue-rotate": {
          field: "hueRotate",
          kind: "deg"
        }
      }, supportedHtmlCssProperties = {
        position: {
          v: "absolute | relative",
          on: "any; absolute pins to the slide or a position:relative div"
        },
        "left top right bottom": {
          v: "LEN | PCT | auto; left/top also calc(PCT ± LEN)",
          on: "pinned only (relative does not offset)",
          alias: ["left", "top", "right", "bottom", "inset"]
        },
        "width height": {
          v: "LEN | auto | PCT (pinned, td/th, or along a flex row/column = that share)",
          on: "any",
          alias: ["width", "height"]
        },
        "min-width": {
          v: "LEN | min-content | max-content",
          on: "div child"
        },
        "min-height max-width max-height": {
          v: "LEN",
          on: "div child",
          alias: ["min-height", "max-width", "max-height"]
        },
        display: {
          v: "flex | grid | none (no display = column)",
          on: "section div"
        },
        "flex-direction": {
          v: "row | column [-reverse]",
          on: "flex box",
          alias: ["flex-flow"]
        },
        "flex-wrap": {
          v: "wrap | nowrap",
          on: "row div"
        },
        gap: {
          v: "LEN [LEN] 0–512",
          on: "section div",
          alias: [
            "row-gap",
            "column-gap",
            "grid-gap",
            "grid-row-gap",
            "grid-column-gap"
          ]
        },
        "align-items": {
          v: "ALIGN",
          on: "section div",
          alias: ["place-items"]
        },
        "justify-content": {
          v: "start | center | end | space-between | space-around | space-evenly",
          on: "flex box, not grid"
        },
        "justify-items": {
          v: "ALIGN, no baseline",
          on: "grid box"
        },
        "align-self": {
          v: "ALIGN | auto",
          on: "div child",
          alias: ["place-self"]
        },
        "justify-self": {
          v: "ALIGN | auto, no baseline",
          on: "grid child"
        },
        flex: {
          v: "none | auto | N [N] [LEN | 0% | auto] (flex:1 = equal share; empty div + flex:1 = spacer)",
          on: "div child"
        },
        "flex-grow flex-shrink": {
          v: "N",
          on: "div child",
          alias: ["flex-grow", "flex-shrink"]
        },
        "flex-basis": {
          v: "LEN | auto",
          on: "div child"
        },
        "grid-template-columns grid-template-rows": {
          v: "(LEN | Nfr | auto | repeat(INT, …))+ ≤24 tracks — no minmax, auto-fill, names, areas",
          on: "grid box",
          alias: ["grid-template-columns", "grid-template-rows"]
        },
        "grid-column grid-row": {
          v: "span INT only (cells fill in source order)",
          on: "grid child",
          alias: ["grid-column", "grid-row", "grid-column-end", "grid-row-end"]
        },
        "aspect-ratio": {
          v: "N | N / N",
          on: "div child"
        },
        padding: {
          v: "LEN 0–256 ×1–4",
          on: "section div text table; td/th: one per table, ≤64",
          alias: [
            "padding-top",
            "padding-right",
            "padding-bottom",
            "padding-left",
            "padding-inline",
            "padding-block"
          ]
        },
        overflow: {
          v: "hidden | visible",
          on: "div",
          alias: ["overflow-x", "overflow-y"]
        },
        "font-family": {
          v: "FAMILY",
          on: "text table; on body/section/div it inherits"
        },
        "font-size": {
          v: "LEN 8–400 (Npt converts)",
          on: "text table; inherits into p/li, not h1–h3"
        },
        "font-weight": {
          v: "100–900 (whole hundreds) | normal | bold",
          on: "text th; span (≥600 = bold)"
        },
        "font-style": {
          v: "normal | italic",
          on: "text span"
        },
        font: {
          v: "[italic] [weight] LEN[/N] FAMILY",
          on: "text"
        },
        "line-height": {
          v: "N | PCT | LEN (0.5–4× the font-size)",
          on: "text"
        },
        "letter-spacing": {
          v: "LEN | Nem (−24–32px) | normal",
          on: "text"
        },
        "text-align": {
          v: "left | center | right | justify (not td)",
          on: "text td/th"
        },
        "text-transform": {
          v: "none | uppercase | lowercase | capitalize",
          on: "text"
        },
        "white-space": {
          v: "normal | nowrap",
          on: "text"
        },
        "text-decoration": {
          v: "none | underline | line-through [solid | double | dotted | dashed | wavy] [COLOR]",
          on: "text; span: underline only",
          alias: [
            "text-decoration-line",
            "text-decoration-style",
            "text-decoration-color"
          ]
        },
        "font-variant-numeric": {
          v: "normal | tabular-nums",
          on: "text"
        },
        "-webkit-text-stroke": {
          v: "LEN 0–8 COLOR",
          on: "text",
          alias: ["-webkit-text-stroke-width", "-webkit-text-stroke-color"]
        },
        color: {
          v: "COLOR",
          on: "text span td/th x-icon x-connector hr"
        },
        background: {
          v: "COLOR | [repeating-]linear-gradient(ANGLE | to SIDE, COLOR [PCT [PCT]], … 2–8 stops; repeating: px stops) | radial-gradient([circle|ellipse] [at X% Y%], …); one gradient[, COLOR under it]",
          on: "section div text img table x-icon; tr: COLOR; x-shape/hr = flat fill",
          alias: ["background-color", "background-image"]
        },
        "background-clip": {
          v: "text (+ -webkit-text-fill-color: transparent): glyphs take the gradient | url(IMG) [center / cover|contain]; color = fallback; span: -webkit-text-fill-color: currentcolor",
          on: "text",
          alias: [
            "-webkit-background-clip",
            "-webkit-text-fill-color",
            "background-size",
            "background-position",
            "background-repeat"
          ]
        },
        border: {
          v: "[LEN 0–16, else 1] solid | dashed | dotted | double | none [COLOR, else black] — one stroke; the style word is required",
          on: "div text img table x-icon; = the stroke on x-shape hr x-connector (≤32)",
          alias: ["border-width", "border-style", "border-color"]
        },
        "border-top -right -bottom -left": {
          v: "as border | none; one style+color, any widths",
          on: "div text img table x-icon",
          alias: ["border-top", "border-right", "border-bottom", "border-left"]
        },
        "border-radius": {
          v: "LEN | PCT ×1–4 (TL TR BR BL); 50%=pill",
          on: "div text img table; rect x-shape"
        },
        "box-shadow": {
          v: "[inset] LEN LEN [LEN [LEN]] COLOR, … ≤8 (x y ±64, blur ≤160, spread ±32)",
          on: "div text img table x-icon x-shape"
        },
        "text-shadow": {
          v: "LEN LEN [LEN] COLOR, … ≤8 (blur ≤64)",
          on: "text table"
        },
        opacity: {
          v: "N 0–1",
          on: "any"
        },
        transform: {
          v: "translate(LEN[, LEN]) | translateX|Y(LEN | -50%), rotate(ANGLE), scale(N 0.5–2), skew[X|Y](ANGLE ±60) — any subset in that order, each once",
          on: "any but x-connector; x-shape: rotate only",
          alias: ["rotate"]
        },
        "filter backdrop-filter": {
          v: "blur(LEN ≤20) brightness|contrast(N 0–2) saturate(N 0–3) grayscale|sepia|invert(N 0–1) hue-rotate(ANGLE) — any subset",
          on: "div text img x-shape",
          alias: ["filter", "backdrop-filter", "-webkit-backdrop-filter"]
        },
        "mix-blend-mode": {
          v: "normal | multiply | screen | overlay | darken | lighten",
          on: "div text img x-shape"
        },
        "object-fit": {
          v: "cover | contain",
          on: "img"
        }
      }, acceptedNoOpCssPropertyPatterns = {
        margin: /^0(px)?(\s+0(px)?){0,3}$/i,
        "margin-top": /^0(px)?$/i,
        "margin-right": /^0(px)?$/i,
        "margin-bottom": /^0(px)?$/i,
        "margin-left": /^0(px)?$/i,
        "box-sizing": /^border-box$/i,
        "grid-template": /^none$/i
      }, unsupportedCssPropertyHints = {
        margin: "use the parent's gap or padding; margin auto = justify-content / align-self or a flex:1 spacer (margin:0 is accepted)",
        "z-index": "later children paint on top (source order)",
        float: "use display:flex on the parent",
        "align-content": "use align-items / justify-content",
        "place-content": "use align-items / justify-content",
        order: "reorder the children",
        "grid-area": "use grid-column: span N (cells place in source order)",
        "grid-template-areas": "use grid-template-columns and grid-column: span N",
        "grid-auto-flow": "row auto-flow only — reorder the children",
        "grid-auto-rows": "use grid-template-rows",
        "grid-auto-columns": "use grid-template-columns",
        "grid-column-start": "use grid-column: span N",
        "grid-row-start": "use grid-row: span N",
        "word-break": "size the box to its longest word",
        "overflow-wrap": "size the box to its longest word",
        hyphens: "size the box to its longest word",
        "text-overflow": "nothing clips — budget the height",
        "line-clamp": "nothing clips — shorten the text",
        "text-indent": "use padding-left",
        "text-wrap": "size the box (white-space:nowrap for one line)",
        "vertical-align": "use align-items on the parent",
        transition: "motion is data-build-in / data-build-out",
        animation: "motion is data-build-in / data-build-out",
        visibility: "remove the element, or hidden on the section",
        cursor: "nothing is interactive here",
        "pointer-events": "nothing is interactive here",
        "list-style": "ul = bullets, ol = numbers",
        "list-style-type": "ul = bullets, ol = numbers",
        outline: "use border",
        "outline-offset": "use border",
        "font-variant": "font-variant-numeric: tabular-nums only",
        "font-feature-settings": "font-variant-numeric: tabular-nums only",
        "font-variation-settings": "use font-weight",
        "font-stretch": "not available",
        "text-decoration-thickness": "not available",
        "text-underline-offset": "not available",
        "writing-mode": "rotate a pinned <p> with transform: rotate(-90deg)",
        direction: "not available",
        columns: "use display:flex",
        "column-count": "use display:flex",
        clip: "use overflow:hidden on a div",
        "clip-path": "use border-radius / overflow:hidden",
        mask: "not available",
        "object-position": "object-fit centers",
        "image-rendering": "not available",
        "table-layout": "column widths are width:N% on the first row's cells",
        "border-collapse": "tables draw hairlines",
        "border-spacing": "tables draw hairlines",
        content: "write the text",
        "border-top-width": "use border-top: LEN style COLOR",
        "border-right-width": "use border-right: …",
        "border-bottom-width": "use border-bottom: …",
        "border-left-width": "use border-left: …",
        "border-top-color": "use border-top: …",
        "border-top-style": "use border-top: …",
        "border-top-left-radius": "one border-radius for all corners",
        "border-top-right-radius": "one border-radius for all corners",
        "border-bottom-left-radius": "one border-radius for all corners",
        "border-bottom-right-radius": "one border-radius for all corners",
        "border-image": "not available",
        "box-decoration-break": "not available",
        "scroll-behavior": "nothing scrolls",
        "user-select": "not available",
        "will-change": "not needed",
        "backface-visibility": "not available",
        perspective: "2-D transforms only",
        "transform-origin": "transforms are about the centre",
        "accent-color": "no forms here",
        appearance: "no forms here",
        "inset-inline": "use left/right",
        "inset-block": "use top/bottom"
      };
    });
  };
}
export {
  installCompilerCssValues
};
