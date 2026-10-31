// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportPptx(runtime2) {
  var pptxGeometryExports, pptxDefaultLineHeight, exportPixelsPerInch, defaultMasterName, maxMasterNameLength, titleRolePriority, maxInferredFontSize, maxInferredBodyFontSize, minThemeColorSamples, chromaticColorThreshold, themeColorSimilarityThreshold, capitalizationWordCharacterPattern, capitalizationApostrophePattern, capitalizationCjkCharacterPattern, pptxTextPaddingRatio, pptxListNumberWidthFactor, pptxMaximumTextWidth, pptxTextHugTolerancePx, pptxTextAlignmentTolerancePx, pptxShapeTextMarginTolerancePx, pptxShapeInsetTolerancePx, pptxTextHeightTolerancePx, pptxRoundedCornerInsetRatio, pptxMinimumShapeTextRoom, pptxTextHugRoomRatio, pptxTextFillWidthRatio, pptxTextRoomAllowance, pptxBoxOverlapTolerancePx, pptxTextBoxGapTolerancePx, pptxPaddingByAlignment, pptxPaddingByLeaf, exportBorderSides, initializePptxExport;
  function rotateRectWithinParent(rect, parent) {
    if (parent.rotate === void 0 || parent.rotate % 360 === 0)
      return rect;
    let angle = parent.rotate * Math.PI / 180, centerX = parent.x + parent.w / 2, centerY = parent.y + parent.h / 2, relativeX = rect.x + rect.w / 2 - centerX, relativeY = rect.y + rect.h / 2 - centerY, rotatedCenterX = centerX + relativeX * Math.cos(angle) - relativeY * Math.sin(angle), rotatedCenterY = centerY + relativeX * Math.sin(angle) + relativeY * Math.cos(angle);
    return {
      x: rotatedCenterX - rect.w / 2,
      y: rotatedCenterY - rect.h / 2,
      w: rect.w,
      h: rect.h,
      rotate: parent.rotate
    };
  }
  function insetRect(rect, insets) {
    let leftInset = insets.left ?? 0, topInset = insets.top ?? 0;
    return rotateRectWithinParent({
      x: rect.x + leftInset,
      y: rect.y + topInset,
      w: Math.max(0, rect.w - leftInset - (insets.right ?? 0)),
      h: Math.max(0, rect.h - topInset - (insets.bottom ?? 0))
    }, rect);
  }
  function unrotateRectWithinParent(rect, parent) {
    if (parent.rotate === void 0 || parent.rotate % 360 === 0)
      return {
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h
      };
    let angle = -parent.rotate * Math.PI / 180, centerX = parent.x + parent.w / 2, centerY = parent.y + parent.h / 2, relativeX = rect.x + rect.w / 2 - centerX, relativeY = rect.y + rect.h / 2 - centerY, rotatedCenterX = centerX + relativeX * Math.cos(angle) - relativeY * Math.sin(angle), rotatedCenterY = centerY + relativeX * Math.sin(angle) + relativeY * Math.cos(angle);
    return {
      x: rotatedCenterX - rect.w / 2,
      y: rotatedCenterY - rect.h / 2,
      w: rect.w,
      h: rect.h
    };
  }
  function pptxPositionEmu(inches) {
    return inches >= 100 ? Math.round(inches * runtime2.PPTX_EMU) : inches;
  }
  function pptxLengthEmu(inches) {
    return inches * runtime2.PPTX_EMU < 100 ? 0 : Math.round(inches * runtime2.PPTX_EMU);
  }
  function pptxRectOptions(rect) {
    return {
      x: pptxPositionEmu(pxToInches(rect.x)),
      y: pptxPositionEmu(pxToInches(rect.y)),
      w: pptxPositionEmu(pxToInches(rect.w)),
      h: pptxPositionEmu(pxToInches(rect.h)),
      ...rect.rotate !== void 0 && rect.rotate % 360 !== 0 ? {
        rotate: (rect.rotate % 360 + 360) % 360
      } : {}
    };
  }
  function roundedCornerPath(width, height2, radii) {
    let callback = (input) => Number.isFinite(input) && input > 0 ? input : 0, value = Math.min(1, width / (callback(radii.tl) + callback(radii.tr) || 1), width / (callback(radii.bl) + callback(radii.br) || 1), height2 / (callback(radii.tl) + callback(radii.bl) || 1), height2 / (callback(radii.tr) + callback(radii.br) || 1)), callback2 = (input) => pxToInches(callback(input) * value), { tl: state, tr: state2, br: state3, bl: state4 } = {
      tl: callback2(radii.tl),
      tr: callback2(radii.tr),
      br: callback2(radii.br),
      bl: callback2(radii.bl)
    }, value2 = pxToInches(width), value3 = pxToInches(height2), callback3 = (input, options, context, value4) => context > 0 ? [
      {
        x: input,
        y: options,
        curve: {
          type: "arc",
          hR: context,
          wR: context,
          stAng: value4,
          swAng: 90
        }
      }
    ] : [];
    return [
      {
        x: state,
        y: 0,
        moveTo: !0
      },
      {
        x: value2 - state2,
        y: 0
      },
      ...callback3(value2, state2, state2, 270),
      {
        x: value2,
        y: value3 - state3
      },
      ...callback3(value2 - state3, value3, state3, 0),
      {
        x: state4,
        y: value3
      },
      ...callback3(0, value3 - state4, state4, 90),
      {
        x: 0,
        y: state
      },
      ...callback3(state, 0, state, 180),
      {
        close: !0
      }
    ];
  }
  function roundedBorderBandPath(width, height2, radii, borderWidths) {
    let callback = (input) => Number.isFinite(input) && input > 0 ? input : 0, value = Math.min(1, width / (callback(radii.tl) + callback(radii.tr) || 1), width / (callback(radii.bl) + callback(radii.br) || 1), height2 / (callback(radii.tl) + callback(radii.bl) || 1), height2 / (callback(radii.tr) + callback(radii.br) || 1)), items = [
      callback(borderWidths.top),
      callback(borderWidths.right),
      callback(borderWidths.bottom),
      callback(borderWidths.left)
    ], [items2, items3, items4, items5] = [
      items[3],
      items[0],
      width - items[1],
      height2 - items[2]
    ];
    if (!(items4 > items2 && items5 > items3))
      return roundedCornerPath(width, height2, radii);
    let items6 = [
      callback(radii.tl) * value,
      callback(radii.tr) * value,
      callback(radii.br) * value,
      callback(radii.bl) * value
    ], items7 = [
      {
        s: [0, items6[0]],
        e: [items6[0], 0],
        st: 180
      },
      {
        s: [width - items6[1], 0],
        e: [width, items6[1]],
        st: 270
      },
      {
        s: [width, height2 - items6[2]],
        e: [width - items6[2], height2],
        st: 0
      },
      {
        s: [items6[3], height2],
        e: [0, height2 - items6[3]],
        st: 90
      }
    ], callback2 = (input, options, context) => input - options > 0 && input - context > 0 ? [input - options, input - context] : [0, 0], items8 = [
      callback2(items6[0], items2, items3),
      callback2(items6[1], width - items4, items3),
      callback2(items6[2], width - items4, height2 - items5),
      callback2(items6[3], items2, height2 - items5)
    ], items9 = [
      {
        a: [items2, items3 + items8[0][1]],
        b: [items2 + items8[0][0], items3],
        st: 270
      },
      {
        a: [items4 - items8[1][0], items3],
        b: [items4, items3 + items8[1][1]],
        st: 0
      },
      {
        a: [items4, items5 - items8[2][1]],
        b: [items4 - items8[2][0], items5],
        st: 90
      },
      {
        a: [items2 + items8[3][0], items5],
        b: [items2, items5 - items8[3][1]],
        st: 180
      }
    ], callback3 = (input, options = !1) => ({
      x: pxToInches(input[0]),
      y: pxToInches(input[1]),
      ...options ? {
        moveTo: !0
      } : {}
    }), callback4 = (input, options, context, value3, extra) => options > 0 && context > 0 ? [
      {
        x: pxToInches(input[0]),
        y: pxToInches(input[1]),
        curve: {
          type: "arc",
          wR: pxToInches(options),
          hR: pxToInches(context),
          stAng: value3,
          swAng: extra
        }
      }
    ] : [], value2 = items.map((input) => input > 0);
    if (value2.every(Boolean)) {
      let items11 = [
        ...roundedCornerPath(width, height2, radii),
        callback3(items9[0].b, !0)
      ];
      for (let value3 of [0, 3, 2, 1])
        items11.push(...callback4(items9[value3].a, items8[value3][0], items8[value3][1], items9[value3].st, -90), callback3(items9[(value3 + 3) % 4].b));
      return [
        ...items11.slice(0, -1),
        {
          close: !0
        }
      ];
    }
    let items10 = [];
    for (let index4 = 0; index4 < 4; index4++) {
      if (!value2[index4] || value2[(index4 + 3) % 4])
        continue;
      let value3 = index4;
      for (; value2[(value3 + 1) % 4]; )
        value3 = (value3 + 1) % 4;
      items10.push(callback3(items9[index4].a, !0));
      let items11 = [];
      for (let value4 = index4; items11.push(value4), value4 !== (value3 + 1) % 4; value4 = (value4 + 1) % 4)
        ;
      for (let value4 of items11)
        items10.push(callback3(items7[value4].s), ...callback4(items7[value4].e, items6[value4], items6[value4], items7[value4].st, 90));
      for (let value4 of [...items11].reverse())
        items10.push(callback3(items9[value4].b), ...callback4(items9[value4].a, items8[value4][0], items8[value4][1], items9[value4].st, -90));
      items10.push({
        close: !0
      });
    }
    return items10;
  }
  function insetCornerRadii(radii, insets) {
    let cornerInsets = typeof insets == "number" ? {
      tl: insets,
      tr: insets,
      br: insets,
      bl: insets
    } : insets;
    return {
      tl: Math.max(0, radii.tl - cornerInsets.tl),
      tr: Math.max(0, radii.tr - cornerInsets.tr),
      br: Math.max(0, radii.br - cornerInsets.br),
      bl: Math.max(0, radii.bl - cornerInsets.bl)
    };
  }
  function roundedCornerCutout(width, height2, inner, radii) {
    let callback = (input) => Number.isFinite(input) && input > 0 ? input : 0, value = Math.min(1, width / (callback(radii.tl) + callback(radii.tr) || 1), width / (callback(radii.bl) + callback(radii.br) || 1), height2 / (callback(radii.tl) + callback(radii.bl) || 1), height2 / (callback(radii.tr) + callback(radii.br) || 1)), [items, items2, items3, items4] = [
      callback(inner.x),
      callback(inner.y),
      inner.w,
      inner.h
    ];
    if (!(items3 > 0 && items4 > 0))
      return;
    let callback2 = (input) => input * 180 / Math.PI, callback3 = (input) => Math.min(1, Math.max(-1, input)), callback4 = (input, options, context) => {
      let value4 = callback(input) * value, [value5, value6] = options ? [width - items - items3, width - items] : [items, items + items3], [value7, value8] = context ? [height2 - items2 - items4, height2 - items2] : [items2, items2 + items4];
      if (!(value4 > value5 && value4 > value7))
        return;
      let value9 = 180 + Math.max(callback2(Math.acos(callback3((value4 - Math.max(0, value5)) / value4))), callback2(Math.asin(callback3((value4 - value8) / value4))), 0), value10 = 180 + Math.min(callback2(Math.acos(callback3((value4 - value6) / value4))), callback2(Math.asin(callback3((value4 - Math.max(0, value7)) / value4))), 90);
      if (!(value10 - value9 > 1e-6))
        return;
      let callback6 = (input2) => {
        let [items7, items8] = [
          value4 + value4 * Math.cos(input2 * Math.PI / 180),
          value4 + value4 * Math.sin(input2 * Math.PI / 180)
        ];
        return [
          (options ? width - items7 : items7) - items,
          (context ? height2 - items8 : items8) - items2
        ];
      }, value11 = options !== context, value12 = options && context ? value9 + 180 : options ? 180 - value10 : context ? -value10 : value9;
      return {
        from: callback6(value11 ? value10 : value9),
        to: callback6(value11 ? value9 : value10),
        r: value4,
        stAng: (value12 % 360 + 360) % 360,
        swAng: value10 - value9
      };
    }, value2 = [
      callback4(radii.tl, !1, !1),
      callback4(radii.tr, !0, !1),
      callback4(radii.br, !0, !0),
      callback4(radii.bl, !1, !0)
    ].flatMap((input) => input !== void 0 ? [input] : []);
    if (value2.length === 0) {
      let [items7, items8] = [items + items3 / 2, items2 + items4 / 2], callback6 = (input, options, context, value4) => value4 && Math.hypot(items7 - options, items8 - context) > callback(input) * value, [items9, items10, items11, items12] = [
        callback(radii.tl) * value,
        callback(radii.tr) * value,
        callback(radii.br) * value,
        callback(radii.bl) * value
      ];
      return callback6(radii.tl, items9, items9, items7 < items9 && items8 < items9) || callback6(radii.tr, width - items10, items10, items7 > width - items10 && items8 < items10) || callback6(radii.br, width - items11, height2 - items11, items7 > width - items11 && items8 > height2 - items11) || callback6(radii.bl, items12, height2 - items12, items7 < items12 && items8 > height2 - items12) ? [] : void 0;
    }
    let callback5 = (input) => Math.abs(input[1]) < 1e-6 ? input[0] : Math.abs(input[0] - items3) < 1e-6 ? items3 + input[1] : Math.abs(input[1] - items4) < 1e-6 ? items3 + items4 + (items3 - input[0]) : 2 * items3 + items4 + (items4 - input[1]), value3 = 2 * (items3 + items4), items5 = [
      [0, [0, 0]],
      [items3, [items3, 0]],
      [items3 + items4, [items3, items4]],
      [2 * items3 + items4, [0, items4]]
    ], items6 = [
      {
        x: pxToInches(value2[0].from[0]),
        y: pxToInches(value2[0].from[1]),
        moveTo: !0
      }
    ];
    return value2.forEach((input, options) => {
      items6.push({
        x: pxToInches(input.to[0]),
        y: pxToInches(input.to[1]),
        curve: {
          type: "arc",
          wR: pxToInches(input.r),
          hR: pxToInches(input.r),
          stAng: input.stAng,
          swAng: input.swAng
        }
      });
      let value4 = value2[(options + 1) % value2.length], value5 = callback5(input.to), value6 = callback5(value4.from) + (callback5(value4.from) < value5 - 1e-6 || value2.length === 1 && callback5(value4.from) <= value5 ? value3 : 0);
      for (let [value7, value8] of [
        ...items5,
        ...items5.map(([input2, input3]) => [
          input2 + value3,
          input3
        ])
      ])
        value7 > value5 + 1e-6 && value7 < value6 - 1e-6 && items6.push({
          x: pxToInches(value8[0]),
          y: pxToInches(value8[1])
        });
      options < value2.length - 1 && items6.push({
        x: pxToInches(value4.from[0]),
        y: pxToInches(value4.from[1])
      });
    }), [
      ...items6,
      {
        close: !0
      }
    ];
  }
  function oversizedCornerCutout(width, height2, radii) {
    if (radii.tl === radii.tr && radii.tr === radii.br && radii.br === radii.bl && Math.min(width, height2) >= 2 * radii.tl)
      return;
    let value = cornerCutoutCanvas(width, height2, radii);
    return roundedCornerCutout(value.W, value.H, {
      x: value.x,
      y: value.y,
      w: width,
      h: height2
    }, radii);
  }
  function cornerCutoutCanvas(width, height2, radii) {
    let [items, items2] = [
      Math.max(width, radii.tl + radii.tr, radii.bl + radii.br),
      Math.max(height2, radii.tl + radii.bl, radii.tr + radii.br)
    ];
    return {
      W: items,
      H: items2,
      x: radii.tl > 0 || radii.bl > 0 ? 0 : items - width,
      y: radii.tl > 0 || radii.tr > 0 ? 0 : items2 - height2
    };
  }
  function borderBandRects(width, height2, radii, widths) {
    let value = cornerCutoutCanvas(width, height2, radii);
    return [
      {
        x: 0,
        y: 0,
        w: widths.left,
        h: height2
      },
      {
        x: width - widths.right,
        y: 0,
        w: widths.right,
        h: height2
      },
      {
        x: widths.left,
        y: 0,
        w: width - widths.left - widths.right,
        h: widths.top
      },
      {
        x: widths.left,
        y: height2 - widths.bottom,
        w: width - widths.left - widths.right,
        h: widths.bottom
      }
    ].filter((input) => input.w > 0 && input.h > 0).flatMap((input) => translatePptxPath(roundedCornerCutout(value.W, value.H, {
      x: value.x + input.x,
      y: value.y + input.y,
      w: input.w,
      h: input.h
    }, radii) ?? roundedCornerPath(input.w, input.h, {
      tl: 0,
      tr: 0,
      br: 0,
      bl: 0
    }), input.x, input.y));
  }
  function borderSidesHaveRoundedCorners(sides2, radii) {
    return sides2.some((input) => input === "top" ? radii.tl > 0 || radii.tr > 0 : input === "right" ? radii.tr > 0 || radii.br > 0 : input === "bottom" ? radii.br > 0 || radii.bl > 0 : radii.tl > 0 || radii.bl > 0);
  }
  function translatePptxPath(path, deltaX, deltaY) {
    return path.map((input) => "close" in input ? input : {
      ...input,
      x: input.x + pxToInches(deltaX),
      y: input.y + pxToInches(deltaY)
    });
  }
  function pptxPathToEmu(path) {
    let callback = (input) => "curve" in input ? {
      curve: {
        ...input.curve,
        wR: pptxPositionEmu(input.curve.wR),
        hR: pptxPositionEmu(input.curve.hR)
      }
    } : {};
    return path.map((input) => "close" in input ? input : {
      ...input,
      x: pptxPositionEmu(input.x),
      y: pptxPositionEmu(input.y),
      ...callback(input)
    });
  }
  function letterboxCutout(width, height2, inset, radii) {
    let [items, items2] = [
      Number.isFinite(inset.x) && inset.x > 0 ? inset.x : 0,
      Number.isFinite(inset.y) && inset.y > 0 ? inset.y : 0
    ];
    return roundedCornerCutout(width, height2, {
      x: items,
      y: items2,
      w: width - 2 * items,
      h: height2 - 2 * items2
    }, radii);
  }
  function pxToInches(px) {
    return px / exportPixelsPerInch;
  }
  function pxToPoints(px) {
    return px / 2;
  }
  function hexToPptxColor(color) {
    let hex = color.slice(1);
    (hex.length === 3 || hex.length === 4) && (hex = [...hex].map((input) => input + input).join(""));
    let color2 = hex.slice(0, 6).toUpperCase();
    if (hex.length === 8) {
      let value = parseInt(hex.slice(6, 8), 16) / 255, value2 = Math.round((1 - value) * 100);
      if (value2 > 0)
        return {
          color: color2,
          transparency: value2
        };
    }
    return {
      color: color2
    };
  }
  function readHexColorByte(hex, offset4) {
    let value = parseInt(hex.slice(offset4, offset4 + 2), 16);
    return Number.isFinite(value) ? value : 0;
  }
  function blendPptxColors(color, background, opacity) {
    let foregroundHex = (0, runtime2.stripHexAlpha)(color), backgroundHex = (0, runtime2.stripHexAlpha)(background), color2 = "";
    for (let value of [1, 3, 5]) {
      let value2 = Math.round(readHexColorByte(foregroundHex, value) * opacity + readHexColorByte(backgroundHex, value) * (1 - opacity));
      color2 += Math.min(255, Math.max(0, value2)).toString(16).padStart(2, "0");
    }
    return color2.toUpperCase();
  }
  function flattenedSlideBackground(color) {
    let resolved = (0, runtime2.resolveSlideColor)(color) ?? "#F5F4ED", alphaHex = resolved.length === 9 ? resolved.slice(7) : resolved.length === 5 ? resolved[4] + resolved[4] : "ff";
    return "#" + blendPptxColors(resolved, "#ffffff", parseInt(alphaHex, 16) / 255);
  }
  function pptxTextDecoration(decoration) {
    if (decoration === void 0)
      return {};
    let style = {
      solid: "sng",
      double: "dbl",
      dotted: "dotted",
      dashed: "dash",
      wavy: "wavy"
    }[decoration.style ?? "solid"], color = decoration.color !== void 0 ? cssToPptxColor(decoration.color) : void 0;
    if (color?.transparency !== void 0 && color.transparency >= 100)
      return {};
    let value = color === void 0 ? void 0 : color.transparency !== void 0 ? {
      color: color.color,
      transparency: color.transparency
    } : color.color;
    return {
      underline: {
        style,
        ...value !== void 0 ? {
          color: value
        } : {}
      }
    };
  }
  function cssToPptxColor(color) {
    let normalized = color.trim().toLowerCase();
    if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(normalized))
      return hexToPptxColor(normalized);
    if (normalized === "transparent")
      return {
        color: "000000",
        transparency: 100
      };
    let value = /^(rgba?|hsla?)\((.*)\)$/.exec(normalized);
    if (value === null || value[1] === void 0 || value[2] === void 0)
      return;
    let items = [];
    for (let value10 of value[2].split(/[,\s/]+/)) {
      if (value10.length === 0)
        continue;
      let value11 = value10.endsWith("%"), value12 = parseFloat(value11 ? value10.slice(0, -1) : value10.replace(/deg$/, ""));
      if (!Number.isFinite(value12))
        return;
      items.push({
        n: value12,
        pct: value11
      });
    }
    let [value2, value3, value4, value5] = items;
    if (value2 === void 0 || value3 === void 0 || value4 === void 0 || items.length > 4)
      return;
    let value6 = value5 === void 0 ? 1 : Math.min(1, Math.max(0, value5.pct ? value5.n / 100 : value5.n)), value7;
    if (value[1].startsWith("rgb")) {
      let callback = (input) => Math.min(255, Math.max(0, Math.round(input.pct ? input.n * 2.55 : input.n)));
      value7 = [callback(value2), callback(value3), callback(value4)];
    } else {
      let value10 = (value2.n % 360 + 360) % 360, value11 = Math.min(1, Math.max(0, value3.n / 100)), value12 = Math.min(1, Math.max(0, value4.n / 100)), callback = (input) => {
        let value13 = (input + value10 / 30) % 12;
        return value12 - value11 * Math.min(value12, 1 - value12) * Math.max(-1, Math.min(value13 - 3, 9 - value13, 1));
      };
      value7 = [
        Math.round(callback(0) * 255),
        Math.round(callback(8) * 255),
        Math.round(callback(4) * 255)
      ];
    }
    let value8 = value7.map((input) => input.toString(16).padStart(2, "0")).join("").toUpperCase(), value9 = Math.round((1 - value6) * 100);
    return value9 > 0 ? {
      color: value8,
      transparency: value9
    } : {
      color: value8
    };
  }
  function pptxFontFace(role, font) {
    if (font !== void 0 && typeof font != "string")
      return font.family;
    let family = font ?? ((0, runtime2.renderingTypeScaleForRole)(role).serifDisplay ? "serif" : "sans");
    return family === "serif" ? "Georgia" : family === "mono" ? "Courier New" : "Arial";
  }
  function pptxFontFamilyPitch(role, font) {
    let family = font === void 0 ? (0, runtime2.renderingTypeScaleForRole)(role).serifDisplay ? "serif" : "sans" : typeof font == "string" ? font : font.fallback;
    return family === "serif" ? 18 : family === "mono" ? 49 : 34;
  }
  function pptxTextAlignment(alignment) {
    return alignment === "center" ? "center" : alignment === "end" ? "right" : alignment === "justify" ? "justify" : "left";
  }
  function pptxFilename(title) {
    return (0, runtime2.exportFilename)(title, "pptx");
  }
  function exportedSlideTitle(slide) {
    let roleCandidates = (input) => slide.leaves.filter((source) => source.kind === "text" && source.role === input && source.list === void 0 && source.lineLists === void 0 && source.embedPlaceholder !== !0 && /\p{L}/u.test(source.text) && (source.opacity ?? 1) > 0.5);
    for (let value of titleRolePriority) {
      let value2 = roleCandidates(value);
      if (value2.length !== 0 && !(value === "display" && value2.every((input) => input.text.trim().length <= minThemeColorSamples) && titleRolePriority.slice(1).some((input) => roleCandidates(input).length > 0)))
        return value2.length === 1 ? value2[0] : void 0;
    }
  }
  function createWeightedCounter() {
    let counts = /* @__PURE__ */ new Map();
    return {
      add: (input, options = 1, context = 0) => {
        if (input === void 0)
          return;
        let value = counts.get(input) ?? {
          n: 0,
          w: 0
        };
        counts.set(input, {
          n: value.n + options,
          w: value.w + context
        });
      },
      ranked: () => [...counts].sort((input, options) => options[1].n - input[1].n || options[1].w - input[1].w).map(([input]) => input),
      count: (input) => counts.get(input)?.n ?? 0
    };
  }
  function pptxColorLuminance(color) {
    let channels = (0, runtime2.parseContrastColor)("#" + color);
    return channels === void 0 ? 0 : (0, runtime2.relativeLuminance)(channels);
  }
  function pptxColorIsChromatic(color) {
    let channels = (0, runtime2.parseContrastColor)("#" + color);
    return channels !== void 0 && Math.max(channels.r, channels.g, channels.b) - Math.min(channels.r, channels.g, channels.b) >= chromaticColorThreshold;
  }
  function medianNumber(values) {
    let sorted = [...values].sort((input, options) => input - options), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }
  function pptxColorsNear(color, otherColor) {
    return [0, 2, 4].every((input) => Math.abs(parseInt(color.slice(input, input + 2), 16) - parseInt(otherColor.slice(input, input + 2), 16)) <= themeColorSimilarityThreshold);
  }
  function pptxLargeTextHasContrast(color, background) {
    let [foreground, background2] = [
      (0, runtime2.parseContrastColor)("#" + color),
      (0, runtime2.parseContrastColor)("#" + background)
    ];
    return foreground !== void 0 && background2 !== void 0 && (0, runtime2.contrastRatio)(foreground, background2) >= runtime2.CONTRAST_MINIMUMS.largeText;
  }
  function exportLeafPaintsBackground(leaf) {
    return (leaf.kind === "img" || leaf.kind === "box" && leaf.blend === void 0 && (leaf.fill !== void 0 && visiblePptxColor(cssToPptxColor(leaf.fill)) !== void 0 || leaf.gradient !== void 0)) && (leaf.opacity ?? 1) > 0.5;
  }
  function textLeafOverlapsPaint(leaf, painted) {
    let [centerX, centerY] = [
      leaf.rect.x + leaf.rect.w / 2,
      leaf.rect.y + leaf.rect.h / 2
    ];
    return leaf.box !== void 0 && exportLeafPaintsBackground(leaf.box) || painted.some(({ rect }) => rect.x <= centerX && centerX <= rect.x + rect.w && rect.y <= centerY && centerY <= rect.y + rect.h);
  }
  function inferPptxDeckTheme(deck, ground) {
    let hexColor = (input) => hexToPptxColor(input).color, backgrounds = createWeightedCounter(), titleColors = createWeightedCounter(), fontCounts = /* @__PURE__ */ new Map(), bodyColors = createWeightedCounter(), accentColors = createWeightedCounter(), fontFaces = createWeightedCounter(), fontSizes = [];
    for (let value20 of deck.slides) {
      let value21 = hexColor(ground ?? flattenedSlideBackground(value20.bg)), value22 = value20.leaves.reduce((input, source) => input + (source.kind === "text" ? source.rect.w * source.rect.h : 0), 0);
      backgrounds.add(value21, 1, value22);
      let value23 = exportedSlideTitle(value20), items4 = [];
      for (let value24 of value20.leaves) {
        if (value24.kind === "text") {
          let value26 = hexToPptxColor((0, runtime2.resolveSlideColor)(value24.color) ?? (0, runtime2.slideTextColor)(value20.bg)), color = value26.color;
          if (titleColors.add(color), !textLeafOverlapsPaint(value24, items4) && (value24.opacity ?? 1) > 0.5 && visiblePptxColor(value26) !== void 0 && (fontCounts.has(value21) || fontCounts.set(value21, createWeightedCounter()), fontCounts.get(value21).add(color, value24.rect.w * value24.rect.h)), (titleRolePriority.includes(value24.role) ? accentColors : fontFaces).add(pptxFontFace(value24.role, value24.fontFamily)), value24.textFill?.kind === "gradient")
            for (let value27 of value24.textFill.gradient.stops)
              bodyColors.add(visiblePptxColor(cssToPptxColor(value27.color)));
          value24 === value23 && fontSizes.push({
            leaf: value24,
            ink: color,
            bg: value21
          });
        } else
          value24.kind === "table" && (titleColors.add(hexColor((0, runtime2.resolveSlideColor)(value24.color) ?? (0, runtime2.slideTextColor)(value20.bg))), fontFaces.add(pptxFontFace(value24.role ?? "body", value24.fontFamily)));
        let value25 = value24.kind === "box" ? value24 : value24.kind === "text" ? value24.box : void 0;
        if (value25 !== void 0 && (value25.opacity ?? 1) > 0.5 && value25.blend === void 0) {
          value25.fill !== void 0 && bodyColors.add(visiblePptxColor(cssToPptxColor(value25.fill)));
          for (let value26 of value25.gradient?.stops ?? [])
            bodyColors.add(visiblePptxColor(cssToPptxColor(value26.color)));
        }
        exportLeafPaintsBackground(value24) ? items4.push(value24) : value24.kind === "text" && value24.box !== void 0 && exportLeafPaintsBackground(value24.box) && items4.push(value24.box);
      }
    }
    let value = backgrounds.ranked()[0] ?? "F5F4ED", value2 = hexColor((0, runtime2.slideTextColor)("#" + value)), value3 = fontCounts.get(value)?.ranked().find((input) => pptxLargeTextHasContrast(input, value)) ?? value2, value4 = pptxColorLuminance(value) < pptxColorLuminance(value3), [value5, value6] = value4 ? [value, value3] : [value3, value], callback = (input) => blendPptxColors("#" + value3, "#" + value, input), [value7, value8] = value4 ? [callback(0.1), callback(0.75)] : [callback(0.75), callback(0.1)], value9 = createWeightedCounter();
    for (let value20 of [bodyColors, titleColors, backgrounds])
      for (let value21 of value20.ranked())
        value9.add(value21, value20.count(value21));
    let value10 = (0, runtime2.getRenderingTheme)(), value11 = [
      (0, runtime2.themeAccentColor)(value10),
      ...value10 === "anthropic" ? ["oat", "text-tertiary"] : []
    ].map((input) => hexColor((0, runtime2.resolveSlideColor)(input) ?? input)), value12 = [0.6, 0.45, 0.3, 0.2, 0.85, 0.7].map(callback), value13 = value9.ranked(), items = [];
    for (let value20 of [
      ...value13.filter(pptxColorIsChromatic),
      ...value13.filter((input) => !pptxColorIsChromatic(input)),
      ...value11,
      ...value12
    ])
      items.length < 6 && !items.includes(value20) && !["FFFFFF", "000000", value5, value6].some((input) => pptxColorsNear(value20, input)) && items.push(value20);
    for (; items.length < 6; )
      items.push(items[items.length - 1] ?? value7);
    let value14 = fontSizes.some((input) => input.bg === value) ? fontSizes.filter((input) => input.bg === value) : fontSizes, value15 = mostFrequentPptxValue(value14.map((input) => input.leaf.role)) ?? "h2", value16 = value14.filter((input) => input.leaf.role === value15), [items2, items3] = [
      (0, runtime2.renderingTypeScaleForRole)(value15),
      (0, runtime2.renderingTypeScaleForRole)("body")
    ], value17 = value16.length > 0 ? medianNumber(value16.map((input) => (input.leaf.fontSize ?? items2.fontSize) * (input.leaf.fitScale ?? 1))) : items2.fontSize, callback2 = (input) => {
      let value20 = input.y + input.h / 2 <= runtime2.SLIDE_HEIGHT / 2, value21 = value20 ? input.y + input.h + maxInferredBodyFontSize : maxInferredFontSize;
      return {
        x: input.x,
        y: value21,
        w: runtime2.SLIDE_WIDTH - maxInferredFontSize - input.x,
        h: (value20 ? runtime2.SLIDE_HEIGHT - maxInferredFontSize : input.y - maxInferredBodyFontSize) - value21
      };
    }, state = {
      w: (runtime2.SLIDE_WIDTH - 2 * maxInferredFontSize) / 4,
      h: 2 * items3.fontSize * items3.lineHeight
    }, state2 = {
      x: maxInferredFontSize,
      y: maxInferredFontSize,
      w: runtime2.SLIDE_WIDTH - 2 * maxInferredFontSize,
      h: Math.min(value17 * items2.lineHeight, runtime2.SLIDE_HEIGHT - 2 * maxInferredFontSize - maxInferredBodyFontSize - state.h)
    }, value18 = value16.length > 0 ? {
      x: medianNumber(value16.map((input) => input.leaf.rect.x)),
      y: medianNumber(value16.map((input) => input.leaf.rect.y)),
      w: medianNumber(value16.map((input) => input.leaf.rect.w)),
      h: medianNumber(value16.map((input) => input.leaf.rect.h))
    } : state2, value19 = value18.w > 0 && value18.h > 0 && callback2(value18).w >= state.w && callback2(value18).h >= state.h ? value18 : state2, state3 = {
      rect: value19,
      face: mostFrequentPptxValue(value16.map((input) => pptxFontFace(input.leaf.role, input.leaf.fontFamily))) ?? accentColors.ranked()[0] ?? pptxFontFace("h1"),
      fontSize: value17,
      lineHeight: items2.lineHeight,
      color: [
        mostFrequentPptxValue(value16.map((input) => input.ink)),
        value3
      ].find((input) => input !== void 0 && pptxLargeTextHasContrast(input, value)) ?? value2
    }, state4 = {
      rect: callback2(value19),
      face: fontFaces.ranked()[0] ?? pptxFontFace("body"),
      fontSize: items3.fontSize,
      lineHeight: items3.lineHeight,
      color: value3
    };
    return {
      colors: {
        dk1: value5,
        lt1: value6,
        dk2: value7,
        lt2: value8,
        accent1: items[0],
        accent2: items[1],
        accent3: items[2],
        accent4: items[3],
        accent5: items[4],
        accent6: items[5],
        hlink: "0563C1",
        folHlink: "954F72"
      },
      dark: value4,
      headFace: accentColors.ranked()[0] ?? pptxFontFace("h1"),
      bodyFace: state4.face,
      background: value,
      title: state3,
      body: state4
    };
  }
  function visiblePptxColor(color) {
    if (color !== void 0 && (color.transparency ?? 0) <= 50)
      return color.color;
  }
  function mostFrequentPptxValue(values) {
    let counts = createWeightedCounter();
    for (let value of values)
      counts.add(value);
    return counts.ranked()[0];
  }
  function pptxPlaceholderTextOptions(placeholder, objectName) {
    return {
      objectName,
      ...pptxRectOptions(placeholder.rect),
      fontFace: placeholder.face,
      fontSize: pxToPoints(placeholder.fontSize),
      color: placeholder.color,
      align: "left",
      valign: "top",
      margin: 0,
      wrap: !0,
      lineSpacingMultiple: placeholder.lineHeight
    };
  }
  function pptxSlideMaster(theme) {
    return {
      emptyPlaceholders: !1,
      objects: [
        {
          placeholder: {
            options: {
              name: "title",
              type: "title",
              ...pptxPlaceholderTextOptions(theme.title, "Title Placeholder 1")
            },
            text: ""
          }
        },
        {
          placeholder: {
            options: {
              name: "body",
              type: "body",
              ...pptxPlaceholderTextOptions(theme.body, "Text Placeholder 2")
            },
            text: ""
          }
        }
      ]
    };
  }
  function pptxMasterForBackdrop(theme, deck, slide) {
    let value = inferPptxDeckTheme({
      ...deck,
      slides: deck.slides.filter((input) => input.backdrop === slide.backdrop)
    }, slide.ground);
    return {
      ...theme,
      title: {
        ...theme.title,
        color: value.title.color
      },
      body: {
        ...theme.body,
        color: value.body.color
      }
    };
  }
  function createPptxPresentation(title) {
    let presentation = new runtime2.PptxPresentation();
    return presentation.title = title, presentation.author = "", presentation.company = "", presentation.subject = "", presentation;
  }
  function buildPptxPresentation(deck, options = {}) {
    let warnings = [], presentation = createPptxPresentation(deck.title);
    presentation.defineLayout({
      name: "APPIFACT",
      width: pxToInches(runtime2.SLIDE_WIDTH),
      height: pxToInches(runtime2.SLIDE_HEIGHT)
    }), presentation.layout = "APPIFACT", presentation.description = options.description ?? "";
    for (let font of options.embeddedFonts ?? [])
      presentation.addEmbeddedFont({
        typeface: font.typeface,
        style: font.style,
        data: font.data,
        pitchFamily: pptxFontFamilyPitch("body", {
          family: font.typeface,
          fallback: font.fallback
        })
      });
    let inferTheme = options.theme === !0, theme = inferTheme ? inferPptxDeckTheme(deck) : void 0;
    theme !== void 0 && (presentation.theme = {
      name: (0, runtime2.truncateUtf16Safely)(deck.title.trim(), maxMasterNameLength) || "Presentation",
      headFontFace: theme.headFace,
      bodyFontFace: theme.bodyFace,
      colors: theme.colors,
      dark: theme.dark
    }, presentation.masterSlide.background = {
      color: theme.background
    }, presentation.defineSlideMaster({
      title: defaultMasterName,
      background: {
        color: theme.background
      },
      ...pptxSlideMaster(theme)
    }), presentation.addMasterObjects(pptxSlideMaster(theme).objects));
    let entries = /* @__PURE__ */ new Map();
    for (let [value, value2] of deck.slides.entries()) {
      let value3 = value2.backdrop === void 0 ? inferTheme ? defaultMasterName : void 0 : entries.get(value2.backdrop);
      value2.backdrop !== void 0 && value3 === void 0 && (value3 = "Slide background " + String(entries.size + 1), presentation.defineSlideMaster({
        title: value3,
        background: {
          data: value2.backdrop
        },
        ...theme !== void 0 ? pptxSlideMaster(pptxMasterForBackdrop(theme, deck, value2)) : {}
      }), entries.set(value2.backdrop, value3));
      let value4 = presentation.addSlide(value3 !== void 0 ? {
        masterName: value3
      } : void 0), value5 = inferTheme && options.titlePlaceholders === !0 ? exportedSlideTitle(value2) : void 0;
      value2.backdrop === void 0 && (value4.background = {
        color: flattenedSlideBackground(value2.bg).slice(1)
      });
      for (let value6 of value2.leaves)
        value6.kind === "text" ? (value6.embedPlaceholder === !0 && warnings.push("a web embed could not be rendered and exported as a placeholder"), writePptxText(value4, value6, value2.bg, warnings, " (slide " + String(value + 1) + ")", value2.leaves, value6 === value5, options.forGoogleSlides === !0)) : value6.kind === "img" ? writePptxImage(value4, value6, warnings) : value6.kind === "box" ? writePptxBox(value4, value6, " (slide " + String(value + 1) + ")", warnings) : writePptxTable(value4, value6, value2.bg, warnings, options.forGoogleSlides === !0);
      value2.notes !== void 0 && value4.addNotes(value2.notes);
    }
    return warnings.push(...deck.exportNotes ?? []), {
      pptx: presentation,
      warnings
    };
  }
  function pptxGradientStops(stops, opacity) {
    let colors = stops.map((input) => cssToPptxColor(input.color));
    if (colors.length < 2 || colors.includes(void 0))
      return;
    let transparent = (input) => input === void 0 || (input.transparency ?? 0) >= 100;
    return stops.flatMap((input, options) => {
      let value = colors[options];
      if (!transparent(value))
        return [
          {
            position: input.pos,
            ...applyPptxOpacity(value, opacity)
          }
        ];
      let items = [
        ...new Set([colors[options - 1], colors[options + 1]].filter((input2) => !transparent(input2)).map((input2) => input2.color))
      ];
      return (items.length > 0 ? items : [value.color]).map((input2) => ({
        position: input.pos,
        color: input2,
        transparency: 100
      }));
    });
  }
  function applyPptxTextFill(fill, textOptions, leaf, warnings, location2) {
    if (fill === void 0)
      return;
    let warnOnce = {
      push: (input) => {
        warnings.includes(input) || warnings.push(input);
      }
    };
    if (fill.kind === "image") {
      warnOnce.push("image-filled text exported in its plain colour (PowerPoint text takes no picture fill here)" + location2);
      return;
    }
    let gradient = fill.gradient, value = pptxGradientStops(gradient.stops, textOptions);
    if (value === void 0) {
      warnOnce.push("text gradient exported in its plain colour (a stop color is not converted by the PPTX export)" + location2);
      return;
    }
    return gradient.radial === !0 ? warnOnce.push("radial text gradient exported as a linear ramp (PowerPoint text gradients are linear)" + location2) : gradient.repeat !== void 0 && warnOnce.push("repeating text gradient exported as one stretched ramp (PPTX gradients do not repeat)" + location2), leaf && warnOnce.push("gradient text with styled spans or list lines: PowerPoint restarts the ramp in each run, so it reads slightly differently there" + location2), {
      stops: value,
      angle: gradient.radial === !0 ? 90 : ((gradient.angle - 90) % 360 + 360) % 360
    };
  }
  function capitalizePptxText(text) {
    let text2 = "", atWordStart = !0;
    for (let value of text) {
      if (capitalizationApostrophePattern.test(value)) {
        text2 += value;
        continue;
      }
      if (capitalizationCjkCharacterPattern.test(value) || !capitalizationWordCharacterPattern.test(value)) {
        atWordStart = !0, text2 += value;
        continue;
      }
      let value2 = atWordStart ? value.toUpperCase() : value;
      text2 += value2.length === value.length ? value2 : value, atWordStart = !1;
    }
    return text2;
  }
  function pptxListOptions(list, leaf, fontSize, withinGutter = !1) {
    let positive = (input) => input !== void 0 && input > 0 && Number.isFinite(input) ? input : 0, gutter = positive(leaf.listGutter);
    if (list === void 0 || gutter === 0 && leaf.listOutside !== !0)
      return;
    let hanging = positive(leaf.listHang), indent = list === "bullet" ? hanging > 0 ? hanging + pptxTextPaddingRatio * fontSize : gutter : Math.max(gutter, hanging, pptxListNumberWidthFactor * positive(leaf.listNumberWidth)), value = Math.min(indent, withinGutter ? gutter : pptxMaximumTextWidth);
    if (value !== 0)
      return {
        marL: Math.min(Math.max(gutter, value), pptxMaximumTextWidth),
        hang: value,
        overhang: Math.max(0, value - gutter)
      };
  }
  function textBoxHugsOrFills(leaf) {
    let [width, lineWidth] = [leaf.rect.w, leaf.lineWidth];
    if (!(lineWidth === void 0 || leaf.box !== void 0 || leaf.list !== void 0 || leaf.lineLists !== void 0 || leaf.nowrap === !0 || leaf.fit === "grow" || leaf.textFill !== void 0) && (leaf.rect.rotate ?? 0) % 360 === 0)
      return Math.abs(width - lineWidth) <= pptxTextHugTolerancePx ? "hugs" : lineWidth > pptxTextFillWidthRatio * (width + pptxTextRoomAllowance(width)) ? "full" : void 0;
  }
  function writtenPptxAlignment(leaf) {
    return textBoxHugsOrFills(leaf) === "hugs" && leaf.heldSide !== void 0 ? leaf.heldSide : pptxTextAlignment(leaf.align);
  }
  function textBoxAvailableRoom(leaf, slide) {
    let rect = leaf.rect, state = {
      left: rect.x,
      right: runtime2.SLIDE_WIDTH - rect.x - rect.w
    }, callback = (input) => {
      let value = (input.rotate ?? 0) * Math.PI / 180, [items, items2] = [
        input.w * Math.abs(Math.cos(value)) + input.h * Math.abs(Math.sin(value)),
        input.w * Math.abs(Math.sin(value)) + input.h * Math.abs(Math.cos(value))
      ];
      return {
        x: input.x + (input.w - items) / 2,
        y: input.y + (input.h - items2) / 2,
        w: items,
        h: items2
      };
    };
    for (let value of slide) {
      if (value === leaf)
        continue;
      let value2 = value.kind === "box" ? value : value.kind === "text" ? value.box : void 0, value3 = value.kind === "text" && textBoxHugsOrFills(value) !== void 0 ? writtenPptxAlignment(value) : void 0, value4 = value.kind === "text" && value.box === void 0 ? pptxPaddingByLeaf(value) : {
        left: 0,
        right: 0
      }, value5 = value.kind === "text" ? pptxListOptions(value.list, value, (value.fontSize ?? (0, runtime2.renderingTypeScaleForRole)(value.role).fontSize) * (value.fitScale ?? 1))?.overhang ?? 0 : 0;
      for (let value6 of value.kind === "text" && value.box !== void 0 ? [value.rect, value.box.rect] : [value.rect]) {
        let value7 = callback(value6);
        if (Math.min(rect.y + rect.h, value7.y + value7.h) - Math.max(rect.y, value7.y) <= pptxBoxOverlapTolerancePx)
          continue;
        let [items, items2] = [
          rect.x - value7.x - value7.w,
          value7.x - rect.x - rect.w
        ], value8 = value7.x <= rect.x + 1 && value7.x + value7.w >= rect.x + rect.w - 1;
        if (value8 && value2 !== void 0 && value6 === value2.rect)
          state.left = Math.min(state.left, rect.x - value7.x - exportedBorderSideWidth(value2.border, "left")), state.right = Math.min(state.right, -items - rect.w - exportedBorderSideWidth(value2.border, "right"));
        else {
          if (value8 && value7.y <= rect.y + 1 && value7.y + value7.h >= rect.y + rect.h - 1)
            continue;
          items2 >= -pptxTextBoxGapTolerancePx ? state.right = Math.min(state.right, items2 - (value3 === "right" || value3 === "center" ? Math.max(items2 / 2, value4.left + value5) : value4.left + value5)) : items >= -pptxTextBoxGapTolerancePx && (state.left = Math.min(state.left, items - (value3 !== void 0 && value3 !== "right" ? Math.max(items / 2, value4.right) : value4.right)));
        }
      }
    }
    return state;
  }
  function pptxTextBoxPadding(leaf, slide) {
    let padding = pptxPaddingByLeaf(leaf);
    if (textBoxHugsOrFills(leaf) === void 0)
      return padding;
    let desiredRoom = pptxPaddingByAlignment(writtenPptxAlignment(leaf), Math.max(pptxTextRoomAllowance(leaf.rect.w), leaf.rect.w * pptxTextHugRoomRatio)), availableRoom = textBoxAvailableRoom(leaf, slide), left = Math.max(padding.left, Math.min(desiredRoom.left, availableRoom.left)), right = Math.max(padding.right, Math.min(desiredRoom.right, availableRoom.right));
    return writtenPptxAlignment(leaf) === "center" ? {
      left: Math.min(left, right),
      right: Math.min(left, right)
    } : {
      left,
      right
    };
  }
  function textInShapeOptions(leaf, shape, fontSize, lineHeight, warnings, location2) {
    let callback = (input, options) => ({
      left: input.x - options.x,
      top: input.y - options.y,
      right: options.x + options.w - input.x - input.w,
      bottom: options.y + options.h - input.y - input.h
    }), value = unrotateRectWithinParent(leaf.rect, shape), value2 = leaf.boxInner !== void 0 ? unrotateRectWithinParent(leaf.boxInner, shape) : value, value3 = callback(value, shape), value4 = callback(value2, shape);
    if (Math.min(value3.left, value3.top, value3.right, value3.bottom) < -pptxShapeInsetTolerancePx || leaf.linesHeight !== void 0 && leaf.linesHeight - value.h > pptxTextHeightTolerancePx)
      return;
    let value5 = callback(value, value2), callback2 = (input, options) => Math.abs(input - options) <= pptxTextAlignmentTolerancePx, value6 = leaf.lineWidth !== void 0 && Math.abs(value.w - leaf.lineWidth) <= pptxTextHugTolerancePx, value7 = value6 && Math.abs(value2.w - (leaf.lineWidth ?? 0)) <= pptxTextHugTolerancePx, value8 = location2, value9 = leaf.nowrap !== !0, [items, items2, items3] = [value3.left, value3.right, !1];
    if (value7)
      value9 = !1, callback2(items, items2) ? [value8, items3] = ["center", !0] : items < items2 ? [value8, items2] = ["left", 0] : [value8, items] = ["right", 0];
    else {
      let value19 = value6 && leaf.boxInner !== void 0 ? callback2(value5.left, value5.right) ? "center" : Math.abs(value5.left) <= pptxTextAlignmentTolerancePx ? "left" : Math.abs(value5.right) <= pptxTextAlignmentTolerancePx ? "right" : void 0 : void 0;
      value19 !== void 0 && ([value8, items, items2] = [value19, value4.left, value4.right]);
      let value20 = value19 !== void 0 ? Math.max(0, warnings - (value2.w - value.w)) : warnings;
      value8 === "right" ? items -= value20 : value8 === "center" ? [items, items2] = [items - value20 / 2, items2 - value20 / 2] : items2 -= value20;
    }
    let value10 = value7 && Math.abs(value2.h - lineHeight) <= pptxTextAlignmentTolerancePx, value11 = leaf.boxAnchor ?? "top", value12 = leaf.boxInner !== void 0 && (value11 === "middle" ? callback2(value5.top, value5.bottom) : value11 === "bottom" ? Math.abs(value5.bottom) <= pptxTextAlignmentTolerancePx : Math.abs(value5.top) <= pptxTextAlignmentTolerancePx), text = "top", [items4, items5, items6] = [value3.top, value3.bottom, !1];
    if (value10)
      [text, items4, items5, items6] = [
        "middle",
        value4.top,
        value4.bottom,
        !0
      ];
    else {
      value12 && ([text, items4, items5] = [value11, value4.top, value4.bottom]);
      let value19 = value12 ? Math.max(0, 4 - (value2.h - value.h)) : 4;
      text === "bottom" ? items4 -= value19 : text === "middle" ? [items4, items5] = [items4 - value19 / 2, items5 - value19 / 2] : items5 -= value19;
    }
    let callback3 = (input) => {
      let callback6 = (input2, options, context) => {
        let value23 = Math.min(input2, options);
        return context || input > value23 ? [input2 - value23, options - value23] : [input2 - input, options - input];
      }, [value19, value20] = value8 === "center" ? callback6(items, items2, items3) : [items - input, items2 - input], [value21, value22] = text === "middle" ? callback6(items4, items5, items6) : [items4 - input, items5 - input];
      return {
        left: Math.max(0, value19),
        top: Math.max(0, value21),
        right: Math.max(0, value20),
        bottom: Math.max(0, value22)
      };
    }, callback4 = (input, options) => ["left", "top", "right", "bottom"].every((input2) => options + input[input2] <= value3[input2] + (options > 0 && input[input2] <= pptxShapeInsetTolerancePx ? pptxShapeTextMarginTolerancePx : pptxShapeInsetTolerancePx)), callback5 = (input, options) => !value7 || shape.w - 2 * options - input.left - input.right - value.w >= warnings, value13 = fontSize * pptxRoundedCornerInsetRatio, value14 = value8 === "right" ? value3.left : value8 === "center" ? Math.min(value3.left, value3.right) : value3.right, value15 = callback3(value13), value16 = value13 > 0 && (!callback4(value15, value13) || !callback5(value15, value13) || value9 && value14 - value13 < pptxMinimumShapeTextRoom), [value17, value18] = value16 ? [callback3(0), 0] : [value15, value13];
    if (callback4(value17, value18) && callback5(value17, value18))
      return {
        ins: value17,
        align: value8,
        valign: text,
        wrap: value9,
        path: value16
      };
  }
  function writePptxText(slide, leaf, warnings, assets, background, theme, inShape = !1, forGoogleSlides = !1) {
    let value = (0, runtime2.renderingTypeScaleForRole)(leaf.role), callback = (input) => leaf.textTransform === "uppercase" ? input.toUpperCase() : leaf.textTransform === "lowercase" ? input.toLowerCase() : input, value2 = leaf.textTransform === "capitalize" ? capitalizePptxText(leaf.text) : leaf.text, value3 = (leaf.fontSize ?? value.fontSize) * (leaf.fitScale ?? 1), value4 = leaf.fontWeight ?? value.fontWeight, value5 = writtenPptxAlignment(leaf), value6 = leaf.opacity ?? 1, { color: value7, transparency: value8 } = applyPptxOpacity(hexToPptxColor((0, runtime2.resolveSlideColor)(leaf.color) ?? (0, runtime2.slideTextColor)(warnings)), value6), items = [], value9 = applyPptxTextFill(leaf.textFill, value6, leaf.marks !== void 0 || leaf.list !== void 0 || leaf.lineLists !== void 0, items, background), value10 = pptxTextRoomAllowance(leaf.rect.w), value11 = pptxTextBoxPadding(leaf, theme), value12 = pptxListOptions(leaf.list, leaf, value3), bulletIndent = (input) => input !== void 0 ? {
      indent: pxToPoints(input.marL),
      hanging: pxToPoints(input.hang)
    } : void 0, lineBulletIndent = (list) => bulletIndent(leaf.list !== void 0 ? value12 : pptxListOptions(list, leaf.listsBy?.[list] ?? {}, value3, !0)), value14 = insetRect(leaf.rect, {
      left: -value11.left - (value12?.overhang ?? 0),
      right: -value11.right,
      bottom: -4
    }), value15 = (() => {
      if (leaf.marks === void 0 && leaf.list === void 0 && leaf.lineLists === void 0)
        return callback(value2);
      let value18 = (0, runtime2.textLinesAsRuns)({
        text: value2,
        marks: leaf.marks
      }), items2 = [];
      return value18.forEach((items3, options) => {
        let value19 = items3.length > 0 ? items3 : [
          {
            text: ""
          }
        ];
        value19.forEach((input, options2) => {
          let state = {};
          if (input.bold && (state.bold = !0), input.italic && (state.italic = !0), input.underline && (state.underline = {
            style: "sng"
          }), input.color !== void 0) {
            let value20 = applyPptxOpacity(hexToPptxColor((0, runtime2.resolveSlideColor)(input.color) ?? "#141413"), value6);
            state.color = value20.color, value20.transparency !== void 0 && (state.transparency = value20.transparency);
          } else
            value9 !== void 0 && (state.gradientFill = value9);
          input.href !== void 0 && (0, runtime2.isSafeHyperlink)(input.href) && (state.hyperlink = {
            url: input.href
          });
          let lineList = leaf.list ?? leaf.lineLists?.[options] ?? null;
          lineList !== null && options2 === 0 && (state.bullet = lineList === "bullet" ? lineBulletIndent(lineList) ?? !0 : {
            type: "number",
            ...lineBulletIndent(lineList)
          }), options2 === value19.length - 1 && options < value18.length - 1 && (state.breakLine = !0), items2.push({
            text: callback(input.text),
            options: state
          });
        });
      }), items2;
    })(), callback2 = (input, options = {}) => {
      let { points: value18, ...value19 } = input;
      slide.addText(value15, {
        ...value19,
        ...value18 !== void 0 ? {
          points: value18
        } : {},
        fontFace: pptxFontFace(leaf.role, leaf.fontFamily),
        fontPitchFamily: pptxFontFamilyPitch(leaf.role, leaf.fontFamily),
        fontSize: pxToPoints(value3),
        bold: value4 >= 600,
        italic: leaf.italic === !0,
        ...pptxTextDecoration(leaf.underline),
        ...leaf.strike === !0 ? {
          strike: "sngStrike"
        } : {},
        ...leaf.letterSpacing !== void 0 ? {
          charSpacing: pxToPoints(leaf.letterSpacing)
        } : {},
        color: value7,
        transparency: value8,
        ...value9 !== void 0 && typeof value15 == "string" ? {
          gradientFill: value9
        } : {},
        align: options.align ?? value5,
        valign: options.valign ?? "top",
        fit: leaf.fit === "none" ? "none" : leaf.fit === "grow" ? "resize" : "shrink",
        wrap: options.wrap ?? leaf.nowrap !== !0,
        ...pptxLineSpacing(value3, leaf.lineHeight ?? value.lineHeight, forGoogleSlides),
        ...inShape ? {
          placeholderType: "title"
        } : {}
      });
    }, value16, callback3 = (input, options, context, value18) => {
      try {
        let value19 = textInShapeOptions(leaf, context, input === "roundRect" ? value18 : 0, value3 * (leaf.lineHeight ?? value.lineHeight), value10, value5);
        if (value19 === void 0)
          return !1;
        let { rectRadius: value20, ...value21 } = options, value22 = value19.path ? {
          ...value21,
          shape: "custGeom",
          points: pptxPathToEmu(roundedCornerPath(context.w, context.h, {
            tl: value18,
            tr: value18,
            br: value18,
            bl: value18
          }))
        } : {
          ...options,
          shape: input
        };
        return callback2({
          ...value22,
          margin: [
            pxToPoints(value19.ins.left),
            pxToPoints(value19.ins.right),
            pxToPoints(value19.ins.bottom),
            pxToPoints(value19.ins.top)
          ]
        }, {
          align: value19.align,
          valign: value19.valign,
          wrap: value19.wrap
        }), !0;
      } catch (value19) {
        return value16 = value19 instanceof Error ? value19.message : String(value19), !1;
      }
    }, flag = !1, value17;
    if (leaf.box !== void 0) {
      let value18 = leaf.list === void 0 && leaf.lineLists === void 0 && leaf.fit !== "grow" && (leaf.rect.rotate ?? 0) === (leaf.box.rect.rotate ?? 0) ? inShape ? (input, options, context) => (value17 = context, !1) : (...input) => flag = callback3(...input) : void 0;
      writePptxBox(slide, leaf.box, background, assets, value18);
    }
    for (let value18 of items)
      assets.includes(value18) || assets.push(value18);
    if (!flag)
      try {
        let value18;
        try {
          value18 = value17 !== void 0 ? textInShapeOptions(leaf, value17, 0, value3 * (leaf.lineHeight ?? value.lineHeight), value10, value5) : void 0;
        } catch (value19) {
          assets.push("a title laid over its box as a plain text box instead" + background + ": " + (value19 instanceof Error ? value19.message : String(value19)));
        }
        if (value17 !== void 0 && value18 !== void 0) {
          let { ins: value19 } = value18;
          callback2({
            ...pptxRectOptions(value17),
            margin: [
              pxToPoints(value19.left),
              pxToPoints(value19.right),
              pxToPoints(value19.bottom),
              pxToPoints(value19.top)
            ]
          }, {
            align: value18.align,
            valign: value18.valign,
            wrap: value18.wrap
          });
        } else
          callback2({
            ...pptxRectOptions(value14),
            margin: 0
          });
        value16 !== void 0 && assets.push("a text and its box exported as two objects, not one" + background + ": " + value16);
      } catch (value18) {
        assets.push("addText failed: " + (value18 instanceof Error ? value18.message : String(value18)));
      }
  }
  function writePptxImage(slide, leaf, warnings) {
    if (leaf.dataUri === void 0) {
      warnings.push("image skipped (missing asset): " + (leaf.alt || "(no alt text)"));
      return;
    }
    if (leaf.dataUri.startsWith("data:image/svg+xml")) {
      warnings.push("SVG image skipped (could not rasterize for PowerPoint): " + (leaf.alt || "(no alt text)"));
      return;
    }
    let value = leaf.opacity ?? 1, { w: value2, widthOf: value3, line: value4, sides: value5 } = pptxBorderOptions(leaf.border, warnings, "image", ": " + (leaf.alt || "(no alt text)"), value), value6 = value5 ?? (leaf.clipRounded === !0 && value4 !== void 0 && (value4.dashType ?? "solid") === "solid" ? [...exportBorderSides] : void 0), value7 = insetRect(leaf.rect, {
      left: value3("left"),
      top: value3("top"),
      right: value3("right"),
      bottom: value3("bottom")
    }), state = {
      ...value7,
      w: Math.max(1, value7.w),
      h: Math.max(1, value7.h)
    }, value8 = pxToInches(state.w), value9 = pxToInches(state.h), value10 = pptxPositionEmu(value8), value11 = pptxPositionEmu(value9), state2 = {
      type: leaf.fit,
      w: value10,
      h: value11
    };
    if (leaf.naturalW !== void 0 && leaf.naturalH !== void 0 && leaf.naturalW > 0 && leaf.naturalH > 0) {
      if (value11 = pptxPositionEmu(value8 * leaf.naturalH / leaf.naturalW), leaf.crop !== void 0 && leaf.fit === "cover") {
        let value27 = (0, runtime2.imageCropNormalizedViewport)({
          w: state.w,
          h: state.h
        }, {
          w: leaf.naturalW,
          h: leaf.naturalH
        }, leaf.crop);
        value10 = pptxLengthEmu(value8 / value27.w), value11 = pptxLengthEmu(value9 / value27.h), state2 = {
          type: "crop",
          x: pptxLengthEmu(value8 * value27.x / value27.w),
          y: pptxLengthEmu(value9 * value27.y / value27.h),
          w: pptxLengthEmu(value8),
          h: pptxLengthEmu(value9)
        };
      }
    } else
      warnings.push(leaf.fit + " exported as stretch — natural dimensions unavailable: " + (leaf.alt || "(no alt text)"));
    let value12 = Math.min(leaf.rect.w, leaf.rect.h), value13 = Math.min(leaf.radius ?? 0, value12 / 2), value14 = value13 > 0, value15 = value14 && Math.abs(leaf.rect.w - leaf.rect.h) <= 1 && value13 >= value12 / 2 - 0.5, value16 = Math.min(value3("left"), value3("top"), value3("right"), value3("bottom")), value17 = leaf.corners !== void 0 ? insetCornerRadii(leaf.corners, {
      tl: Math.min(value3("top"), value3("left")),
      tr: Math.min(value3("top"), value3("right")),
      br: Math.min(value3("bottom"), value3("right")),
      bl: Math.min(value3("bottom"), value3("left"))
    }) : insetCornerRadii({
      tl: value13,
      tr: value13,
      br: value13,
      bl: value13
    }, value16), value18 = leaf.fit === "contain" && leaf.crop === void 0 && leaf.naturalW !== void 0 && leaf.naturalH !== void 0 && leaf.naturalW > 0 && leaf.naturalH > 0 ? Math.min(state.w / leaf.naturalW, state.h / leaf.naturalH) : 0, value19 = value18 > 0 ? {
      x: Math.max(0, (state.w - leaf.naturalW * value18) / 2),
      y: Math.max(0, (state.h - leaf.naturalH * value18) / 2)
    } : {
      x: 0,
      y: 0
    }, state3 = {
      w: state.w - 2 * value19.x,
      h: state.h - 2 * value19.y
    }, value20 = Math.max(value17.tl, value17.tr, value17.br, value17.bl) > 0 && (value19.x > state3.w / 200 || value19.y > state3.h / 200) || value19.x > 1e3 * state3.w || value19.y > 1e3 * state3.h, value21 = value < 1 ? {
      transparency: Math.round((1 - value) * 100)
    } : {}, value22 = value20 ? {
      data: leaf.dataUri,
      ...pptxRectOptions(insetRect(state, {
        left: value19.x,
        top: value19.y,
        right: value19.x,
        bottom: value19.y
      })),
      altText: leaf.alt,
      ...value21
    } : {
      data: leaf.dataUri,
      ...pptxRectOptions(state),
      w: value10,
      h: value11,
      altText: leaf.alt,
      sizing: state2,
      ...value21
    }, value23 = leaf.corners ?? {
      tl: value13,
      tr: value13,
      br: value13,
      bl: value13
    }, callback = (input, options, context, value27) => {
      let value28 = cornerCutoutCanvas(leaf.rect.w, leaf.rect.h, value23);
      return roundedCornerCutout(value28.W, value28.H, {
        x: value28.x + input,
        y: value28.y + options,
        w: context,
        h: value27
      }, value23);
    }, value24;
    value20 ? value24 = leaf.clipRounded === !0 ? callback(value3("left") + value19.x, value3("top") + value19.y, state.w - 2 * value19.x, state.h - 2 * value19.y) : letterboxCutout(state.w, state.h, value19, value17) : leaf.clipRounded === !0 ? value24 = value2 > 0 ? callback(value3("left"), value3("top"), state.w, state.h) : oversizedCornerCutout(state.w, state.h, value23) : leaf.corners !== void 0 && (value24 = roundedCornerPath(state.w, state.h, value17));
    let value25 = value24?.length === 0, value26 = !value20 && (leaf.clipRounded !== !0 || value2 <= 0);
    if (value24 !== void 0 ? value22.points = value24 : value26 && value15 ? value22.rounding = !0 : value26 && value13 > value16 && (value22.rectRadius = pxToInches(value13 - value16)), leaf.shadow !== void 0) {
      let value27 = pptxShadowOptions(leaf.shadow, warnings, "image", ": " + (leaf.alt || "(no alt text)"), !0, value);
      value27 !== void 0 && (value22.shadow = value27);
    }
    leaf.href !== void 0 && (0, runtime2.isSafeHyperlink)(leaf.href) && (value22.hyperlink = {
      _rId: 0,
      url: encodePptxXmlEntities(leaf.href)
    });
    try {
      value25 || slide.addImage(value22);
    } catch (value27) {
      warnings.push("addImage failed: " + (value27 instanceof Error ? value27.message : String(value27)));
    }
    if (value4 !== void 0)
      try {
        if (value6 === void 0) {
          let value27 = insetRect(leaf.rect, {
            left: value2 / 2,
            top: value2 / 2,
            right: value2 / 2,
            bottom: value2 / 2
          }), state4 = {
            ...value27,
            w: Math.max(1, value27.w),
            h: Math.max(1, value27.h)
          }, value28 = value15 ? 0 : Math.max(0, value13 - value2 / 2);
          leaf.corners !== void 0 ? slide.addShape("custGeom", {
            ...pptxRectOptions(state4),
            points: pptxPathToEmu(roundedCornerPath(state4.w, state4.h, insetCornerRadii(leaf.corners, value2 / 2))),
            line: value4
          }) : slide.addShape(value15 ? "ellipse" : value28 > 0 ? "roundRect" : "rect", {
            ...pptxRectOptions(state4),
            ...value28 > 0 ? {
              rectRadius: pxToInches(value28)
            } : {},
            line: value4
          });
        } else {
          let value27 = leaf.corners ?? {
            tl: value13,
            tr: value13,
            br: value13,
            bl: value13
          }, value28 = leaf.clipRounded === !0 && (value4.dashType ?? "solid") === "solid";
          (value14 || leaf.corners !== void 0) && !value28 && (leaf.clipRounded !== !0 || borderSidesHaveRoundedCorners(value6, value27)) && warnings.push("a border that is not the same on all four sides of a picture with rounded or clipped corners exported as straight lines: " + (leaf.alt || "(no alt text)"));
          let value29 = value28 ? borderBandRects(leaf.rect.w, leaf.rect.h, value27, {
            left: value3("left"),
            top: value3("top"),
            right: value3("right"),
            bottom: value3("bottom")
          }) : [];
          value29.length > 0 ? slide.addShape("custGeom", {
            ...pptxRectOptions(leaf.rect),
            points: pptxPathToEmu(value29),
            fill: {
              color: value4.color,
              ...value4.transparency !== void 0 ? {
                transparency: value4.transparency
              } : {}
            }
          }) : value28 || writePptxBorderSides(slide, leaf.rect, value3, value6, value4);
        }
      } catch (value27) {
        warnings.push("addShape failed: " + (value27 instanceof Error ? value27.message : String(value27)));
      }
  }
  function applyPptxOpacity(color, opacity) {
    if (opacity >= 1)
      return color;
    let transparency = Math.round(100 - (100 - (color.transparency ?? 0)) * opacity);
    return transparency > 0 ? {
      color: color.color,
      transparency
    } : {
      color: color.color
    };
  }
  function exportedBorderSideWidth(border, side2) {
    if (border === void 0 || border.style === "none")
      return 0;
    let enabledSide = border.sides === void 0 || border.sides.split(" ").includes(side2), widths = border.widths;
    return widths !== void 0 ? widths[side2] ?? (border.width !== void 0 && enabledSide ? border.width : 0) : enabledSide ? border.width ?? 3 : 0;
  }
  function pptxBorderOptions(border, color, rect, warnings, opacity = 1) {
    let value = border !== void 0 && border.style !== "none" ? border : void 0, value2 = value?.sides?.split(" "), value3 = value?.widths, callback = (input) => exportedBorderSideWidth(border, input), value4 = value3 !== void 0 ? exportBorderSides.filter((input) => callback(input) > 0) : value2, value5 = value === void 0 ? 0 : value3 !== void 0 ? Math.max(0, ...exportBorderSides.map(callback)) : value.width ?? 3;
    if (value === void 0 || value5 <= 0)
      return {
        w: value5,
        widthOf: callback,
        sides: value4
      };
    if (value.color === void 0)
      return color.push(rect + " border skipped (currentcolor is not converted by the PPTX export)" + warnings), {
        w: value5,
        widthOf: callback,
        sides: value4
      };
    let value6 = cssToPptxColor(value.color);
    if (value6 === void 0)
      return color.push(rect + ' border skipped (color "' + value.color + '" is not converted by the PPTX export)' + warnings), {
        w: value5,
        widthOf: callback,
        sides: value4
      };
    let value7 = applyPptxOpacity(value6, opacity);
    if (value7.transparency === 100)
      return {
        w: value5,
        widthOf: callback,
        sides: value4
      };
    value.style === "double" && color.push("double border exported as solid (PPTX lines have no double style)" + warnings);
    let value8 = value.style === "dashed" ? "dash" : value.style === "dotted" ? "sysDot" : "solid";
    return {
      w: value5,
      widthOf: callback,
      sides: value4,
      line: {
        ...value7,
        width: pxToPoints(value5),
        dashType: value8
      }
    };
  }
  function writePptxBorderSides(slide, rect, sideWidth, sides2, color) {
    let { x: value, y: value2, w: value3, h: value4 } = rect;
    for (let value5 of sides2) {
      let value6 = sideWidth(value5), value7 = value6 / 2, value8 = value5 === "top" ? [value, value2 + value7, value3, 0] : value5 === "bottom" ? [value, value2 + value4 - value7, value3, 0] : value5 === "left" ? [value + value7, value2, 0, value4] : value5 === "right" ? [value + value3 - value7, value2, 0, value4] : void 0;
      value8 !== void 0 && slide.addShape("line", {
        ...pptxRectOptions(rotateRectWithinParent({
          x: value8[0],
          y: value8[1],
          w: value8[2],
          h: value8[3]
        }, rect)),
        line: {
          ...color,
          width: pxToPoints(value6)
        }
      });
    }
  }
  function pptxShadowOptions(shadow, warnings, kind, location2, allowInset, opacity = 1) {
    if (shadow.inset === !0 && !allowInset) {
      warnings.push("inset " + kind + " shadow skipped (PPTX shapes carry outer shadows only)" + location2);
      return;
    }
    let color = cssToPptxColor(shadow.color);
    if (color === void 0) {
      warnings.push(kind + ' shadow skipped (color "' + shadow.color + '" is not converted by the PPTX export)' + location2);
      return;
    }
    let value = (1 - (color.transparency ?? 0) / 100) * opacity;
    if (value <= 0)
      return;
    let value2 = pxToPoints(Math.max(0, shadow.blur + (shadow.spread ?? 0))), value3 = pxToPoints(Math.hypot(shadow.x, shadow.y)), value4 = Math.atan2(shadow.y, shadow.x) * 180 / Math.PI;
    return {
      type: shadow.inset === !0 ? "inner" : "outer",
      color: color.color,
      opacity: value,
      blur: value2 > 0 ? value2 : 1e-9,
      offset: value3 > 0 ? value3 : 1e-9,
      angle: Math.max(1, Math.round((value4 % 360 + 360) % 360) % 360)
    };
  }
  function writePptxBox(slide, leaf, location2, warnings, assets) {
    if (leaf.blend !== void 0) {
      warnings.push("box paint skipped (mix-blend-mode " + leaf.blend + " has no PowerPoint equivalent)" + location2);
      return;
    }
    let value = leaf.opacity ?? 1;
    if (value <= 0)
      return;
    let value2;
    if (leaf.gradient !== void 0) {
      let value22 = pptxGradientStops(leaf.gradient.stops, value);
      value22 !== void 0 ? (value2 = leaf.gradient.radial === !0 ? {
        type: "gradient",
        stops: value22,
        gradientPath: "circle",
        ...leaf.gradient.at !== void 0 ? {
          focus: {
            x: Math.max(0, Math.min(100, leaf.gradient.at.x)),
            y: Math.max(0, Math.min(100, leaf.gradient.at.y))
          }
        } : {}
      } : {
        type: "gradient",
        stops: value22,
        angle: ((leaf.gradient.angle - 90) % 360 + 360) % 360
      }, leaf.gradient.repeat !== void 0 && leaf.gradient.radial !== !0 && warnings.push("repeating box gradient exported as one stretched ramp (PPTX gradients do not repeat)" + location2), leaf.gradient.radial === !0 && leaf.gradient.extent !== void 0 && warnings.push("a radial gradient's " + leaf.gradient.extent + " size is not kept in PowerPoint" + location2)) : warnings.push("box gradient skipped (a stop color is not converted by the PPTX export)" + location2);
    }
    let value3;
    if (leaf.fill !== void 0) {
      let value22 = cssToPptxColor(leaf.fill);
      value22 === void 0 ? warnings.push('box fill skipped (color "' + leaf.fill + '" is not converted by the PPTX export)' + location2) : applyPptxOpacity(value22, value).transparency !== 100 && (value3 = applyPptxOpacity(value22, value));
    }
    let value4 = value2 ?? value3, value5 = value2 !== void 0 ? value3 : void 0, { w: value6, widthOf: value7, line: value8, sides: value9 } = pptxBorderOptions(leaf.border, warnings, "box", location2, value), value10 = value9 ?? (leaf.clipRounded === !0 && value8 !== void 0 && (value8.dashType ?? "solid") === "solid" ? [...exportBorderSides] : void 0), value11 = value8 !== void 0 && value10 === void 0 ? value8 : void 0, value12 = value4 === void 0 && value9 === void 0 && value10 !== void 0;
    if (value4 === void 0 && value11 === void 0 && leaf.shadow !== void 0 && !value12 && warnings.push("box shadow skipped (no fill or outline to cast it)" + location2), value4 === void 0 && value8 === void 0)
      return;
    let value13 = leaf.shadow !== void 0 && (value4 !== void 0 || value11 !== void 0) ? pptxShadowOptions(leaf.shadow, warnings, "box", location2, !1, value) : void 0, value14 = value11 !== void 0 ? value6 / 2 : 0, value15 = insetRect(leaf.rect, {
      left: value14,
      top: value14,
      right: value14,
      bottom: value14
    }), state = {
      ...value15,
      w: Math.max(1, value15.w),
      h: Math.max(1, value15.h)
    }, value16 = Math.min(Math.max(0, (leaf.radius ?? 0) - value14), state.w / 2, state.h / 2), value17 = leaf.corners !== void 0 ? insetCornerRadii(leaf.corners, value14) : void 0, value18 = Math.max(0, (leaf.radius ?? 0) - value14), value19 = leaf.clipRounded === !0 ? oversizedCornerCutout(state.w, state.h, value17 ?? {
      tl: value18,
      tr: value18,
      br: value18,
      bl: value18
    }) : void 0;
    if (value19?.length === 0)
      return;
    let value20 = value19 ?? (value17 !== void 0 ? roundedCornerPath(state.w, state.h, value17) : void 0), value21 = value20 !== void 0 ? "custGeom" : value16 > 0 ? "roundRect" : "rect", state2 = {
      ...pptxRectOptions(state),
      ...value20 !== void 0 ? {
        points: pptxPathToEmu(value20)
      } : value16 > 0 ? {
        rectRadius: pxToInches(value16)
      } : {}
    };
    if (value4 !== void 0 || value11 !== void 0)
      try {
        value5 !== void 0 && slide.addShape(value21, {
          ...state2,
          fill: value5,
          ...value13 !== void 0 ? {
            shadow: value13
          } : {}
        });
        let state3 = {
          ...state2,
          ...value4 !== void 0 ? {
            fill: value4
          } : {},
          ...value11 !== void 0 ? {
            line: value11
          } : {},
          ...value13 !== void 0 && value5 === void 0 ? {
            shadow: value13
          } : {}
        };
        assets !== void 0 && (value4 !== void 0 || value13 === void 0) && assets(value21, state3, state, value21 === "roundRect" ? value16 : 0) || slide.addShape(value21, state3);
      } catch (value22) {
        warnings.push("addShape failed: " + (value22 instanceof Error ? value22.message : String(value22)));
      }
    if (value8 !== void 0 && value10 !== void 0) {
      let value22 = value16 > 0 || leaf.corners !== void 0, value23 = (value8.dashType ?? "solid") === "solid", value24 = leaf.corners ?? {
        tl: value16,
        tr: value16,
        br: value16,
        bl: value16
      };
      value22 && !value23 && (leaf.clipRounded !== !0 || borderSidesHaveRoundedCorners(value10, value24)) && warnings.push("a dashed or dotted border that is not the same on all four sides of a box with rounded or clipped corners exported as straight lines" + location2);
      try {
        let state3 = {
          left: value7("left"),
          top: value7("top"),
          right: value7("right"),
          bottom: value7("bottom")
        }, state4 = {
          color: value8.color,
          ...value8.transparency !== void 0 ? {
            transparency: value8.transparency
          } : {}
        };
        if (value22 && value23 && leaf.clipRounded === !0) {
          let value25 = borderBandRects(leaf.rect.w, leaf.rect.h, value24, state3), value26 = value12 && leaf.shadow !== void 0 ? pptxShadowOptions(leaf.shadow, warnings, "box", location2, !1, value) : void 0;
          value25.length > 0 && slide.addShape("custGeom", {
            ...pptxRectOptions(leaf.rect),
            points: pptxPathToEmu(value25),
            fill: state4,
            ...value26 !== void 0 ? {
              shadow: value26
            } : {}
          });
        } else if (value22 && value23) {
          let value25 = roundedBorderBandPath(leaf.rect.w, leaf.rect.h, value24, state3);
          value25.length > 0 && slide.addShape("custGeom", {
            ...pptxRectOptions(leaf.rect),
            points: pptxPathToEmu(value25),
            fill: state4
          });
        } else
          writePptxBorderSides(slide, leaf.rect, value7, value10, value8);
      } catch (value25) {
        warnings.push("addShape failed: " + (value25 instanceof Error ? value25.message : String(value25)));
      }
    }
  }
  function pptxLineSpacing(fontSize, lineHeight, forGoogleSlides) {
    return forGoogleSlides ? {
      lineSpacingMultiple: lineHeight / pptxDefaultLineHeight,
      paraSpaceBefore: 0,
      paraSpaceAfter: 0
    } : {
      lineSpacing: pxToPoints(fontSize * lineHeight)
    };
  }
  function encodePptxXmlEntities(value) {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function writePptxTable(slide, leaf, background, warnings, forGoogleSlides = !1) {
    if (leaf.rows.length === 0) {
      warnings.push("table skipped (no rows after truncation)");
      return;
    }
    leaf.rect.rotate !== void 0 && warnings.push("rotated table exported unrotated (PPTX tables do not turn)");
    let value = leaf.role ?? "body", value2 = (0, runtime2.renderingTypeScaleForRole)(value), state = {
      ...value2,
      fontSize: (leaf.fontSize ?? value2.fontSize) * (leaf.fitScale ?? 1)
    }, value3 = flattenedSlideBackground(background), value4 = [...leaf.backgrounds ?? []].reverse().reduce((input, options) => {
      let value21 = cssToPptxColor(options.color), value22 = (1 - (value21?.transparency ?? 0) / 100) * Math.min(1, Math.max(0, options.opacity ?? 1));
      return value21 === void 0 ? input : "#" + (value22 >= 1 ? value21.color : blendPptxColors("#" + value21.color, input, value22));
    }, value3), value5 = (leaf.color !== void 0 ? (0, runtime2.resolveSlideColor)(leaf.color) : void 0) ?? (0, runtime2.slideTextColor)(background), value6 = pxToInches(leaf.rect.w), value7 = leaf.colWidths !== void 0 && leaf.colWidths.length === leaf.cols ? leaf.colWidths : Array.from({
      length: leaf.cols
    }, () => 1), value8 = value7.reduce((input, options) => input + options, 0), value9 = value7.map((input) => value8 > 0 ? input / value8 * value6 : value6 / value7.length), value10 = (0, runtime2.slideTextColor)(background), value11 = blendPptxColors(value10, value4, 0.08), state2 = {
      type: "solid",
      color: blendPptxColors(value10, value4, 0.22),
      pt: 1
    }, state3 = {
      type: "none"
    }, value12 = pptxLineSpacing(state.fontSize, state.lineHeight, forGoogleSlides), callback = (input, options) => {
      let value21 = leaf.cellStyles?.[String(input) + "." + String(options)]?.color;
      if (value21 === void 0)
        return;
      let value22 = (0, runtime2.resolveSlideColor)(value21);
      if (value22 !== void 0)
        return hexToPptxColor(value22).color;
    }, callback2 = (input) => {
      let value21 = leaf.rowStyles?.[String(input)]?.background, value22 = value21 !== void 0 ? (0, runtime2.resolveSlideColor)(value21) : void 0;
      if (value22 === void 0)
        return;
      let { color: value23, transparency: value24 = 0 } = hexToPptxColor(value22);
      return value24 === 0 ? value23 : blendPptxColors("#" + value23, value4, 1 - value24 / 100);
    }, frame = leaf.frame, value13 = leaf.rowHeights?.length === leaf.rows.length ? leaf.rowHeights[0] : void 0, value14;
    if (frame !== void 0 && value13 !== void 0 && leaf.header && callback2(0) === void 0) {
      let value21 = frame.corners ?? {
        tl: frame.radius ?? 0,
        tr: frame.radius ?? 0,
        br: frame.radius ?? 0,
        bl: frame.radius ?? 0
      };
      if (frame.clipRounded === !0) {
        let value22 = cornerCutoutCanvas(frame.rect.w, frame.rect.h, value21);
        value14 = roundedCornerCutout(value22.W, value22.H, {
          x: value22.x + leaf.rect.x - frame.rect.x,
          y: value22.y + leaf.rect.y - frame.rect.y,
          w: leaf.rect.w,
          h: value13
        }, value21);
      } else {
        let borders = frame.borders, value22 = Math.min(1, frame.rect.w / (value21.tl + value21.tr || 1), frame.rect.w / (value21.bl + value21.br || 1), frame.rect.h / (value21.tl + value21.bl || 1), frame.rect.h / (value21.tr + value21.br || 1)), value23 = insetCornerRadii({
          tl: value21.tl * value22,
          tr: value21.tr * value22,
          br: value21.br * value22,
          bl: value21.bl * value22
        }, {
          tl: Math.min(borders.top, borders.left),
          tr: Math.min(borders.top, borders.right),
          br: Math.min(borders.bottom, borders.right),
          bl: Math.min(borders.bottom, borders.left)
        }), [items, items2] = [
          frame.rect.w - borders.left - borders.right,
          frame.rect.h - borders.top - borders.bottom
        ], callback4 = (input, options, context) => input + options > context ? context / (input + options) : 1, [items3, items4, items5, items6] = [
          callback4(value23.tl, value23.tr, items),
          callback4(value23.bl, value23.br, items),
          callback4(value23.tl, value23.bl, items2),
          callback4(value23.tr, value23.br, items2)
        ], state5 = {
          tl: value23.tl * Math.min(items3, items5),
          tr: value23.tr * Math.min(items3, items6),
          br: value23.br * Math.min(items4, items6),
          bl: value23.bl * Math.min(items4, items5)
        };
        value14 = roundedCornerCutout(items, items2, {
          x: leaf.rect.x - frame.rect.x - borders.left,
          y: leaf.rect.y - frame.rect.y - borders.top,
          w: leaf.rect.w,
          h: value13
        }, state5);
      }
      value14 !== void 0 && value14.length > 0 && slide.addShape("custGeom", {
        ...pptxRectOptions({
          x: leaf.rect.x,
          y: leaf.rect.y,
          w: leaf.rect.w,
          h: value13
        }),
        points: pptxPathToEmu(value14),
        fill: {
          color: value11
        }
      });
    }
    let value15 = leaf.rows.map((input, options) => "#" + (callback2(options) ?? (leaf.header && options === 0 ? value11 : value4.slice(1)))), callback3 = (input) => ({
      type: "solid",
      color: blendPptxColors(value10, input, 0.22),
      pt: 1
    }), value16 = leaf.openTopLeft === !0 || value15.some((input) => input.toUpperCase() !== value4.toUpperCase()), value17 = leaf.rows.map((input, options) => {
      let value21 = callback2(options);
      return input.map((input2, options2) => {
        let value22 = leaf.colAligns?.[options2], value23 = callback(options, options2), state5 = {
          ...value12,
          ...value22 !== void 0 && value22 !== "start" ? {
            align: pptxTextAlignment(value22)
          } : {},
          ...value23 !== void 0 ? {
            color: value23
          } : {},
          bold: leaf.header && options === 0 ? (leaf.headerWeight ?? 600) >= 600 : state.fontWeight >= 600,
          ...leaf.header && options === 0 && value14 === void 0 ? {
            fill: {
              color: value11
            }
          } : {},
          ...value21 !== void 0 ? {
            fill: {
              color: value21
            }
          } : {},
          ...value16 ? {
            border: [
              options === 0 ? leaf.openTopLeft === !0 ? state3 : state2 : callback3(value15[options - 1]),
              callback3(value15[options]),
              callback3(value15[options]),
              options2 === 0 ? leaf.openTopLeft === !0 ? state3 : state2 : callback3(value15[options])
            ]
          } : {}
        };
        return {
          _type: "tablecell",
          text: input2,
          options: state5
        };
      });
    }), value18 = pxToInches(leaf.rect.x), value19 = pxToInches(leaf.rect.y);
    (value18 < 0 || value19 < 0) && warnings.push("table at a negative position exported clamped to the slide edge");
    let value20 = leaf.rowHeights !== void 0 && leaf.rowHeights.length === leaf.rows.length ? leaf.rowHeights.map(pxToInches) : void 0, state4 = {
      x: pptxLengthEmu(value18),
      y: pptxLengthEmu(value19),
      w: pptxPositionEmu(value6),
      colW: value9.map(pptxPositionEmu),
      ...value20 !== void 0 ? {
        rowH: value20.map(pptxPositionEmu),
        h: pptxPositionEmu(value20.reduce((input, options) => input + options, 0))
      } : {},
      fontFace: pptxFontFace(value, leaf.fontFamily),
      fontPitchFamily: pptxFontFamilyPitch(value, leaf.fontFamily),
      fontSize: pxToPoints(state.fontSize),
      color: hexToPptxColor(value5).color,
      valign: "top",
      border: state2,
      margin: leaf.cellPadding !== void 0 ? [0, 1, 2, 3].map((input) => pxToInches((input % 2 === 0 ? leaf.cellPadding.y : leaf.cellPadding.x) ?? state.fontSize * 0.35)) : pxToInches(state.fontSize * 0.35),
      autoPage: !1
    };
    try {
      slide.addTable(value17, state4);
    } catch (value21) {
      warnings.push("addTable failed: " + (value21 instanceof Error ? value21.message : String(value21)));
    }
  }
  async function exportPptxBlob(deck, options) {
    await runtime2.loadPptx?.();
    let { pptx: presentation, warnings } = buildPptxPresentation(deck, options);
    return {
      blob: await presentation.write({
        outputType: "blob",
        compression: !0
      }),
      warnings
    };
  }
  return bindRuntimeValue(runtime2, "pptxGeometryExports", () => pptxGeometryExports, (value) => {
    pptxGeometryExports = value;
  }), bindRuntimeValue(runtime2, "rotateRectWithinParent", () => rotateRectWithinParent), bindRuntimeValue(runtime2, "insetRect", () => insetRect), bindRuntimeValue(runtime2, "unrotateRectWithinParent", () => unrotateRectWithinParent), bindRuntimeValue(runtime2, "pptxPositionEmu", () => pptxPositionEmu), bindRuntimeValue(runtime2, "pptxLengthEmu", () => pptxLengthEmu), bindRuntimeValue(runtime2, "pptxRectOptions", () => pptxRectOptions), bindRuntimeValue(runtime2, "roundedCornerPath", () => roundedCornerPath), bindRuntimeValue(runtime2, "roundedBorderBandPath", () => roundedBorderBandPath), bindRuntimeValue(runtime2, "insetCornerRadii", () => insetCornerRadii), bindRuntimeValue(runtime2, "roundedCornerCutout", () => roundedCornerCutout), bindRuntimeValue(runtime2, "oversizedCornerCutout", () => oversizedCornerCutout), bindRuntimeValue(runtime2, "cornerCutoutCanvas", () => cornerCutoutCanvas), bindRuntimeValue(runtime2, "borderBandRects", () => borderBandRects), bindRuntimeValue(runtime2, "borderSidesHaveRoundedCorners", () => borderSidesHaveRoundedCorners), bindRuntimeValue(runtime2, "translatePptxPath", () => translatePptxPath), bindRuntimeValue(runtime2, "pptxPathToEmu", () => pptxPathToEmu), bindRuntimeValue(runtime2, "letterboxCutout", () => letterboxCutout), bindRuntimeValue(runtime2, "pxToInches", () => pxToInches), bindRuntimeValue(runtime2, "pxToPoints", () => pxToPoints), bindRuntimeValue(runtime2, "hexToPptxColor", () => hexToPptxColor), bindRuntimeValue(runtime2, "readHexColorByte", () => readHexColorByte), bindRuntimeValue(runtime2, "blendPptxColors", () => blendPptxColors), bindRuntimeValue(runtime2, "flattenedSlideBackground", () => flattenedSlideBackground), bindRuntimeValue(runtime2, "pptxTextDecoration", () => pptxTextDecoration), bindRuntimeValue(runtime2, "cssToPptxColor", () => cssToPptxColor), bindRuntimeValue(runtime2, "pptxFontFace", () => pptxFontFace), bindRuntimeValue(runtime2, "pptxFontFamilyPitch", () => pptxFontFamilyPitch), bindRuntimeValue(runtime2, "pptxTextAlignment", () => pptxTextAlignment), bindRuntimeValue(runtime2, "pptxFilename", () => pptxFilename), bindRuntimeValue(runtime2, "exportedSlideTitle", () => exportedSlideTitle), bindRuntimeValue(runtime2, "createWeightedCounter", () => createWeightedCounter), bindRuntimeValue(runtime2, "pptxColorLuminance", () => pptxColorLuminance), bindRuntimeValue(runtime2, "pptxColorIsChromatic", () => pptxColorIsChromatic), bindRuntimeValue(runtime2, "medianNumber", () => medianNumber), bindRuntimeValue(runtime2, "pptxColorsNear", () => pptxColorsNear), bindRuntimeValue(runtime2, "pptxLargeTextHasContrast", () => pptxLargeTextHasContrast), bindRuntimeValue(runtime2, "exportLeafPaintsBackground", () => exportLeafPaintsBackground), bindRuntimeValue(runtime2, "textLeafOverlapsPaint", () => textLeafOverlapsPaint), bindRuntimeValue(runtime2, "inferPptxDeckTheme", () => inferPptxDeckTheme), bindRuntimeValue(runtime2, "visiblePptxColor", () => visiblePptxColor), bindRuntimeValue(runtime2, "mostFrequentPptxValue", () => mostFrequentPptxValue), bindRuntimeValue(runtime2, "pptxPlaceholderTextOptions", () => pptxPlaceholderTextOptions), bindRuntimeValue(runtime2, "pptxSlideMaster", () => pptxSlideMaster), bindRuntimeValue(runtime2, "pptxMasterForBackdrop", () => pptxMasterForBackdrop), bindRuntimeValue(runtime2, "createPptxPresentation", () => createPptxPresentation), bindRuntimeValue(runtime2, "buildPptxPresentation", () => buildPptxPresentation), bindRuntimeValue(runtime2, "pptxGradientStops", () => pptxGradientStops), bindRuntimeValue(runtime2, "applyPptxTextFill", () => applyPptxTextFill), bindRuntimeValue(runtime2, "capitalizePptxText", () => capitalizePptxText), bindRuntimeValue(runtime2, "pptxListOptions", () => pptxListOptions), bindRuntimeValue(runtime2, "textBoxHugsOrFills", () => textBoxHugsOrFills), bindRuntimeValue(runtime2, "writtenPptxAlignment", () => writtenPptxAlignment), bindRuntimeValue(runtime2, "textBoxAvailableRoom", () => textBoxAvailableRoom), bindRuntimeValue(runtime2, "pptxTextBoxPadding", () => pptxTextBoxPadding), bindRuntimeValue(runtime2, "textInShapeOptions", () => textInShapeOptions), bindRuntimeValue(runtime2, "writePptxText", () => writePptxText), bindRuntimeValue(runtime2, "writePptxImage", () => writePptxImage), bindRuntimeValue(runtime2, "applyPptxOpacity", () => applyPptxOpacity), bindRuntimeValue(runtime2, "exportedBorderSideWidth", () => exportedBorderSideWidth), bindRuntimeValue(runtime2, "pptxBorderOptions", () => pptxBorderOptions), bindRuntimeValue(runtime2, "writePptxBorderSides", () => writePptxBorderSides), bindRuntimeValue(runtime2, "pptxShadowOptions", () => pptxShadowOptions), bindRuntimeValue(runtime2, "writePptxBox", () => writePptxBox), bindRuntimeValue(runtime2, "writePptxTable", () => writePptxTable), bindRuntimeValue(runtime2, "exportPptxBlob", () => exportPptxBlob), bindRuntimeValue(runtime2, "pptxLineSpacing", () => pptxLineSpacing), bindRuntimeValue(runtime2, "pptxDefaultLineHeight", () => pptxDefaultLineHeight, (value) => {
    pptxDefaultLineHeight = value;
  }), bindRuntimeValue(runtime2, "exportPixelsPerInch", () => exportPixelsPerInch, (value) => {
    exportPixelsPerInch = value;
  }), bindRuntimeValue(runtime2, "defaultMasterName", () => defaultMasterName, (value) => {
    defaultMasterName = value;
  }), bindRuntimeValue(runtime2, "maxMasterNameLength", () => maxMasterNameLength, (value) => {
    maxMasterNameLength = value;
  }), bindRuntimeValue(runtime2, "titleRolePriority", () => titleRolePriority, (value) => {
    titleRolePriority = value;
  }), bindRuntimeValue(runtime2, "maxInferredFontSize", () => maxInferredFontSize, (value) => {
    maxInferredFontSize = value;
  }), bindRuntimeValue(runtime2, "maxInferredBodyFontSize", () => maxInferredBodyFontSize, (value) => {
    maxInferredBodyFontSize = value;
  }), bindRuntimeValue(runtime2, "minThemeColorSamples", () => minThemeColorSamples, (value) => {
    minThemeColorSamples = value;
  }), bindRuntimeValue(runtime2, "chromaticColorThreshold", () => chromaticColorThreshold, (value) => {
    chromaticColorThreshold = value;
  }), bindRuntimeValue(runtime2, "themeColorSimilarityThreshold", () => themeColorSimilarityThreshold, (value) => {
    themeColorSimilarityThreshold = value;
  }), bindRuntimeValue(runtime2, "capitalizationWordCharacterPattern", () => capitalizationWordCharacterPattern, (value) => {
    capitalizationWordCharacterPattern = value;
  }), bindRuntimeValue(runtime2, "capitalizationApostrophePattern", () => capitalizationApostrophePattern, (value) => {
    capitalizationApostrophePattern = value;
  }), bindRuntimeValue(runtime2, "capitalizationCjkCharacterPattern", () => capitalizationCjkCharacterPattern, (value) => {
    capitalizationCjkCharacterPattern = value;
  }), bindRuntimeValue(runtime2, "pptxTextPaddingRatio", () => pptxTextPaddingRatio, (value) => {
    pptxTextPaddingRatio = value;
  }), bindRuntimeValue(runtime2, "pptxListNumberWidthFactor", () => pptxListNumberWidthFactor, (value) => {
    pptxListNumberWidthFactor = value;
  }), bindRuntimeValue(runtime2, "pptxMaximumTextWidth", () => pptxMaximumTextWidth, (value) => {
    pptxMaximumTextWidth = value;
  }), bindRuntimeValue(runtime2, "pptxTextHugTolerancePx", () => pptxTextHugTolerancePx, (value) => {
    pptxTextHugTolerancePx = value;
  }), bindRuntimeValue(runtime2, "pptxTextAlignmentTolerancePx", () => pptxTextAlignmentTolerancePx, (value) => {
    pptxTextAlignmentTolerancePx = value;
  }), bindRuntimeValue(runtime2, "pptxShapeTextMarginTolerancePx", () => pptxShapeTextMarginTolerancePx, (value) => {
    pptxShapeTextMarginTolerancePx = value;
  }), bindRuntimeValue(runtime2, "pptxShapeInsetTolerancePx", () => pptxShapeInsetTolerancePx, (value) => {
    pptxShapeInsetTolerancePx = value;
  }), bindRuntimeValue(runtime2, "pptxTextHeightTolerancePx", () => pptxTextHeightTolerancePx, (value) => {
    pptxTextHeightTolerancePx = value;
  }), bindRuntimeValue(runtime2, "pptxRoundedCornerInsetRatio", () => pptxRoundedCornerInsetRatio, (value) => {
    pptxRoundedCornerInsetRatio = value;
  }), bindRuntimeValue(runtime2, "pptxMinimumShapeTextRoom", () => pptxMinimumShapeTextRoom, (value) => {
    pptxMinimumShapeTextRoom = value;
  }), bindRuntimeValue(runtime2, "pptxTextHugRoomRatio", () => pptxTextHugRoomRatio, (value) => {
    pptxTextHugRoomRatio = value;
  }), bindRuntimeValue(runtime2, "pptxTextFillWidthRatio", () => pptxTextFillWidthRatio, (value) => {
    pptxTextFillWidthRatio = value;
  }), bindRuntimeValue(runtime2, "pptxTextRoomAllowance", () => pptxTextRoomAllowance, (value) => {
    pptxTextRoomAllowance = value;
  }), bindRuntimeValue(runtime2, "pptxBoxOverlapTolerancePx", () => pptxBoxOverlapTolerancePx, (value) => {
    pptxBoxOverlapTolerancePx = value;
  }), bindRuntimeValue(runtime2, "pptxTextBoxGapTolerancePx", () => pptxTextBoxGapTolerancePx, (value) => {
    pptxTextBoxGapTolerancePx = value;
  }), bindRuntimeValue(runtime2, "pptxPaddingByAlignment", () => pptxPaddingByAlignment, (value) => {
    pptxPaddingByAlignment = value;
  }), bindRuntimeValue(runtime2, "pptxPaddingByLeaf", () => pptxPaddingByLeaf, (value) => {
    pptxPaddingByLeaf = value;
  }), bindRuntimeValue(runtime2, "exportBorderSides", () => exportBorderSides, (value) => {
    exportBorderSides = value;
  }), bindRuntimeValue(runtime2, "initializePptxExport", () => initializePptxExport, (value) => {
    initializePptxExport = value;
  }), () => {
    pptxGeometryExports = {}, (0, runtime2.defineLiveExports)(pptxGeometryExports, {
      cssColorToPptx: () => cssToPptxColor,
      deckToPptxBlob: () => exportPptxBlob,
      insetRect: () => insetRect,
      newPresentation: () => createPptxPresentation,
      pptxFilename: () => pptxFilename,
      pptxFontFace: () => pptxFontFace,
      pxToIn: () => pxToInches
    }), exportPixelsPerInch = 144, pptxDefaultLineHeight = 1.2, defaultMasterName = "Title and body", maxMasterNameLength = 80, maxInferredFontSize = 128, maxInferredBodyFontSize = 48, minThemeColorSamples = 3, chromaticColorThreshold = 0.15, themeColorSimilarityThreshold = 24, pptxTextPaddingRatio = 0.06, pptxListNumberWidthFactor = 1.1, pptxMaximumTextWidth = 8064, pptxTextHugTolerancePx = 1.5, pptxTextAlignmentTolerancePx = 2, pptxShapeTextMarginTolerancePx = 0.5, pptxShapeInsetTolerancePx = 0.05, pptxTextHeightTolerancePx = 0.5, pptxRoundedCornerInsetRatio = 0.29289, pptxMinimumShapeTextRoom = 8, pptxTextHugRoomRatio = 0.2, pptxTextFillWidthRatio = 0.94, pptxTextRoomAllowance = (input) => Math.max(8, input * 0.03), pptxBoxOverlapTolerancePx = 1, pptxTextBoxGapTolerancePx = 2, pptxPaddingByAlignment = (input, options) => input === "right" ? {
      left: options,
      right: 0
    } : input === "center" ? {
      left: options / 2,
      right: options / 2
    } : {
      left: 0,
      right: options
    }, pptxPaddingByLeaf = (input) => pptxPaddingByAlignment(writtenPptxAlignment(input), pptxTextRoomAllowance(input.rect.w)), initializePptxExport = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeNpmDependency)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeImageCrop)(), (0, runtime2.initializeRichTextDom)(), (0, runtime2.initializeUiContrast)(), (0, runtime2.initializeRenderingTheme)(), titleRolePriority = ["display", "h1", "h2", "h3"], capitalizationWordCharacterPattern = /^[\p{Alphabetic}\p{Nd}\p{Pc}\p{M}]$/u, capitalizationApostrophePattern = /^['\u2019\u00B7\u2027]$/u, capitalizationCjkCharacterPattern = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u, exportBorderSides = ["top", "right", "bottom", "left"];
    });
  };
}
export {
  installExportPptx
};
