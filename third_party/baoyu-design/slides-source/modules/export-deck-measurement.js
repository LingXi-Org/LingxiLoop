// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportDeckMeasurement(runtime2) {
  var deckMeasurementExports, reactForExportDeckMeasurement, reactDOMClientForExportDeckMeasurement, IDENTITY_TRANSFORM, ZERO_CORNER_RADII, MEASUREMENT_TOLERANCE, CANVAS_FONT_STYLE_KEYS, initializeDeckMeasurement;
  function textHorizontalHold(stack, childIndex, parentPath) {
    let value = stack.children[childIndex], value2 = stack.justify ?? "start", value3 = stack.children.length === 1;
    if (stack.dir === "v") {
      let value4 = ("place" in value ? value.place?.alignSelf : void 0) ?? stack.align;
      return value4 === "center" ? {
        parent: parentPath,
        how: value4
      } : value4 === "end" ? {
        parent: parentPath,
        how: "right"
      } : void 0;
    }
    if (value3)
      return value2 === "center" || value2 === "around" || value2 === "evenly" ? {
        parent: parentPath,
        how: "center"
      } : value2 === "end" ? {
        parent: parentPath,
        how: "right"
      } : void 0;
    if (childIndex === stack.children.length - 1 && !stack.children.some((source) => source.kind === "spacer") && (value2 === "end" || value2 === "between"))
      return {
        parent: parentPath,
        how: "right",
        row: {
          children: stack.children.length,
          gap: stack.gap
        }
      };
  }
  function applyHeldTextPosition(surface, hold, rectangle, slideRectangle) {
    let callback = (input) => surface.querySelector('[data-node-path="' + input + '"]'), value = callback(hold.parent);
    if (value === null)
      return;
    let value2 = contentRectangleWithinSlide(value, slideRectangle), [items, items2] = [
      rectangle.x - value2.x,
      value2.x + value2.w - rectangle.x - rectangle.w
    ];
    if (items > MEASUREMENT_TOLERANCE) {
      if (hold.row !== void 0) {
        let value3 = Array.from({
          length: hold.row.children
        }, (input, options) => callback((hold.parent === "" ? "" : hold.parent + ".") + String(options))).map((input) => input === null ? NaN : rectangleWithinSlide(input, slideRectangle, IDENTITY_TRANSFORM).w);
        if (!(value2.w - value3.reduce((input, options) => input + options, 0) - hold.row.gap * (value3.length - 1) > MEASUREMENT_TOLERANCE))
          return;
      }
      if (hold.how === "center" ? Math.abs(items - items2) <= MEASUREMENT_TOLERANCE : Math.abs(items2) <= MEASUREMENT_TOLERANCE)
        return hold.how;
    }
  }
  function collectMeasuredModelNodes(node, path = "", opacity = 1, visible = !0, clip, transform = IDENTITY_TRANSFORM, grounds) {
    if (node.kind === "spacer")
      return [];
    let value = opacity * (node.style?.opacity ?? 1), value2 = node.style?.visibility === void 0 ? visible : node.style.visibility !== "hidden", value3 = node.style?.mixBlendMode, value4 = value3 !== void 0 && value3 !== "normal" ? value3 : clip, value5 = node.kind === "shape" ? {
      rotate: node.rotate,
      scale: void 0
    } : node.style?.transform, state = {
      rot: transform.rot + (value5?.rotate ?? 0),
      scl: transform.scl * (value5?.scale ?? 1)
    }, state2 = {
      node,
      path,
      opacity: value,
      shown: value2,
      ...value4 !== void 0 ? {
        blend: value4
      } : {},
      turn: state,
      ...grounds !== void 0 ? {
        across: grounds
      } : {}
    }, callback = (input, options) => collectMeasuredModelNodes(input, path === "" ? String(options) : path + "." + String(options), value, value2, value4, state, node.kind === "stack" ? textHorizontalHold(node, options, path) : void 0);
    return node.kind === "stack" || node.kind === "grid" ? [state2, ...node.children.flatMap(callback)] : node.kind === "overlay" ? [
      state2,
      ...[node.base, ...node.layers.map((input) => input.node)].flatMap(callback)
    ] : [state2];
  }
  function textLineMetrics(element, transform) {
    let value = parseFloat(getComputedStyle(element).lineHeight) * transform.scl;
    if (!(value > 0))
      return;
    let value2 = element.ownerDocument.createRange();
    value2.selectNodeContents(element);
    let value3 = transform.rot * Math.PI / 180, value4 = [...value2.getClientRects()].filter((input) => input.width > 0 && input.height > 0).map((input) => (input.top + input.height / 2) * Math.cos(value3) - (input.left + input.width / 2) * Math.sin(value3));
    if (value4.length !== 0)
      return {
        range: value2,
        down: value4,
        lineHeight: value
      };
  }
  function oneLineTextWidth(element, transform) {
    let value = textLineMetrics(element, transform);
    if (value === void 0 || Math.max(...value.down) - Math.min(...value.down) > value.lineHeight / 2)
      return;
    let bounds = value.range.getBoundingClientRect(), value2 = transform.rot * Math.PI / 180, [items, items2] = [
      Math.abs(Math.cos(value2)),
      Math.abs(Math.sin(value2))
    ];
    if (Math.abs(items * items - items2 * items2) < 0.5)
      return;
    let value3 = (bounds.width * items - bounds.height * items2) / (items * items - items2 * items2);
    if (value3 > 0)
      return value3;
  }
  function textLinesHeight(element, transform) {
    let value = textLineMetrics(element, transform);
    if (value === void 0)
      return;
    let value2 = [...value.down].sort((input, options) => input - options);
    return value2.filter((input, options) => options === 0 || input - value2[options - 1] > value.lineHeight / 2).length * value.lineHeight;
  }
  function hugsMeasuredLines(expected, measured) {
    return expected !== void 0 && Math.abs(measured - expected) <= 2;
  }
  function hasSolePlainText(node) {
    if (node.kind !== "stack" || node.children.length !== 1)
      return !1;
    let value = node.children[0];
    return value.kind === "text" && value.text.trim() !== "" && value.list === void 0 && value.lineLists === void 0 && value.hangingIndent === void 0 && value.style?.transform === void 0 && value.style?.visibility === void 0 && value.style?.mixBlendMode === void 0;
  }
  function measureListMarker(element) {
    let ownerDocument2 = element.ownerDocument, value = getComputedStyle(element), value2 = ownerDocument2.createElement("canvas").getContext("2d");
    if (!value2)
      return;
    value2.font = [
      value.fontStyle,
      value.fontWeight,
      value.fontSize,
      value.fontFamily
    ].join(" ");
    let fontBoundingBoxAscent = value2.measureText("x").fontBoundingBoxAscent, value3;
    return {
      ascent: fontBoundingBoxAscent,
      advance: (input, options, context) => {
        if (value3 === void 0) {
          value3 = ownerDocument2.createElement("span");
          for (let value4 of CANVAS_FONT_STYLE_KEYS)
            value3.style[value4] = value[value4];
          Object.assign(value3.style, {
            position: "fixed",
            top: "0",
            left: "0",
            visibility: "hidden",
            whiteSpace: "pre"
          }), ownerDocument2.body.appendChild(value3);
        }
        return Object.assign(value3.style, {
          fontFamily: context ?? value.fontFamily,
          fontVariantNumeric: options ? "tabular-nums" : "normal",
          letterSpacing: !options && parseFloat(value.letterSpacing) < 0 ? "normal" : value.letterSpacing
        }), value3.textContent = input, value3.getBoundingClientRect().width;
      },
      done: () => value3?.remove()
    };
  }
  function measureListMetrics(element, node, transform, slideRectangle, measureMarker = measureListMarker) {
    let element2 = element.querySelector(node === "bullet" ? "ul" : "ol");
    if (element2 === null)
      return {};
    let paddingInlineStart = getComputedStyle(element2).paddingInlineStart, value = /^[\d.]+px$/.test(paddingInlineStart) ? parseFloat(paddingInlineStart) : 0, value2 = element2.hasAttribute("data-css-list");
    if (!(value > 0) && !value2)
      return {};
    let value3 = value2 ? {
      listOutside: !0
    } : {
      listGutter: value
    }, value4 = measureMarker(element2);
    if (value4 === void 0)
      return value3;
    try {
      if (node === "bullet") {
        let value7 = Math.floor(Math.round(value4.ascent) * 2 / 3) + 7;
        return {
          ...value3,
          ...value7 > 0 ? {
            listHang: value7
          } : {}
        };
      }
      let callback = (input, options, context) => {
        let value7 = Array.from({
          length: 10
        }, (input2, options2) => value4.advance(String(options2), options, context)), value8 = value4.advance(input, options, context), index4 = 0;
        for (let count = 1; count <= transform; count++)
          index4 = Math.max(index4, value8 + [...String(count)].reduce((input2, options2) => input2 + value7[Number(options2)], 0));
        return index4;
      }, value5 = callback(". ", !0), value6 = Math.max(callback(".", !1), callback(".", !1, JSON.stringify(slideRectangle) + ", Arial, sans-serif"), callback(".", !1, "Arial, sans-serif"));
      return {
        ...value3,
        ...value5 > 0 ? {
          listHang: value5
        } : {},
        ...value6 > 0 ? {
          listNumberWidth: value6
        } : {}
      };
    } finally {
      value4.done();
    }
  }
  function clippedCornerRadii(element, node, rectangle, slideRectangle, transform) {
    let state = {
      tl: 0,
      tr: 0,
      br: 0,
      bl: 0
    };
    if (transform.rot !== 0 || transform.scl !== 1)
      return state;
    let callback = (input, options) => Math.abs(input - options) <= 1, callback2 = (input) => {
      let value = parseFloat(input);
      return Number.isFinite(value) && value > 0 ? value : 0;
    };
    for (let parentElement = element.parentElement; parentElement !== null; parentElement = parentElement === node ? null : parentElement.parentElement) {
      let value = getComputedStyle(parentElement);
      if (value.overflowX === "visible" || value.overflowX === "")
        continue;
      let value2 = rectangleWithinSlide(parentElement, rectangle), state2 = {
        left: callback2(value.borderLeftWidth),
        top: callback2(value.borderTopWidth),
        right: callback2(value.borderRightWidth),
        bottom: callback2(value.borderBottomWidth)
      }, value3 = (0, runtime2.insetRect)(value2, state2), state3 = {
        tl: callback2(value.borderTopLeftRadius),
        tr: callback2(value.borderTopRightRadius),
        br: callback2(value.borderBottomRightRadius),
        bl: callback2(value.borderBottomLeftRadius)
      }, value4 = Math.min(1, value2.w / (state3.tl + state3.tr || 1), value2.w / (state3.bl + state3.br || 1), value2.h / (state3.tl + state3.bl || 1), value2.h / (state3.tr + state3.br || 1)), callback3 = (input, options, context) => Math.max(0, input * value4 - (options + context) / 2), [items, items2, items3, items4] = [
        callback(slideRectangle.x, value3.x),
        callback(slideRectangle.y, value3.y),
        callback(slideRectangle.x + slideRectangle.w, value3.x + value3.w),
        callback(slideRectangle.y + slideRectangle.h, value3.y + value3.h)
      ];
      items && items2 && (state.tl = Math.max(state.tl, callback3(state3.tl, state2.left, state2.top))), items3 && items2 && (state.tr = Math.max(state.tr, callback3(state3.tr, state2.right, state2.top))), items3 && items4 && (state.br = Math.max(state.br, callback3(state3.br, state2.right, state2.bottom))), items && items4 && (state.bl = Math.max(state.bl, callback3(state3.bl, state2.left, state2.bottom)));
    }
    return state;
  }
  function ancestorGrounds(path, grounds) {
    let items = [];
    for (let value = path; value !== void 0; value = value === "" ? void 0 : value.slice(0, Math.max(0, value.lastIndexOf(".")))) {
      let entry = grounds.get(value);
      if (!(entry === void 0 || entry.blend !== void 0 || !(entry.opacity > 0)))
        for (let value2 of [
          entry.style?.backgroundGradient?.stops[0]?.color,
          entry.style?.backgroundColor
        ])
          value2 !== void 0 && items.push({
            color: value2,
            ...entry.opacity < 1 ? {
              opacity: entry.opacity
            } : {}
          });
    }
    return items;
  }
  function mergeCornerRounding(radii, clip) {
    let state = {
      tl: Math.max(radii.tl, clip.tl),
      tr: Math.max(radii.tr, clip.tr),
      br: Math.max(radii.br, clip.br),
      bl: Math.max(radii.bl, clip.bl)
    }, value = Math.max(radii.tl, radii.tr, radii.br, radii.bl) <= 0 && Math.max(state.tl, state.tr, state.br, state.bl) > 0 ? {
      clipRounded: !0
    } : {};
    return state.tr === state.tl && state.br === state.tl && state.bl === state.tl ? state.tl > 0 ? {
      radius: state.tl,
      ...value
    } : {} : {
      corners: state,
      ...value
    };
  }
  function measureBoxLeaf(node, element, rectangle, slideRectangle, leaves, opacity, transform = IDENTITY_TRANSFORM) {
    let style = node.style;
    if (style === void 0 || node.kind === "shape" || node.kind === "html")
      return;
    let value = node.kind === "img" && (0, runtime2.imageHasPoster)(node), value2 = style.backgroundColor !== void 0 ? (0, runtime2.cssToPptxColor)(style.backgroundColor) : void 0, value3 = style.backgroundGradient !== void 0 || value2 !== void 0 && (value2.transparency ?? 0) < 100;
    if (value && (!value3 || node.fit !== "contain" || opacity !== void 0))
      return;
    let value4 = value ? void 0 : style.borderStyle, value5 = node.kind === "table" && node.rows.length > 0 ? ["right", "bottom"].filter((input) => style.borderSides === void 0 || style.borderSides.split(" ").includes(input)) : void 0, value6 = value4 !== void 0 && value4 !== "none" && value5?.length !== 0;
    if (style.backgroundColor === void 0 && style.backgroundGradient === void 0 && !value6)
      return;
    let element2 = element.querySelector('[data-node-path="' + rectangle + '"]');
    if (!element2)
      return;
    let value7 = rectangleWithinSlide(element2, slideRectangle, transform), value8 = node.kind === "table" ? {
      x: value7.x,
      y: value7.y,
      w: value7.w,
      h: value7.h
    } : value7;
    if (value8.w <= 0 || value8.h <= 0)
      return;
    let value9 = mergeCornerRounding((0, runtime2.borderRadiiByCorner)(style), clippedCornerRadii(element2, element, slideRectangle, value8, transform)), value10 = style.boxShadow?.find((input) => input.inset !== !0) ?? (value ? void 0 : style.boxShadow?.[0]);
    return {
      kind: "box",
      rect: value8,
      ...style.backgroundColor !== void 0 ? {
        fill: style.backgroundColor
      } : {},
      ...style.backgroundGradient !== void 0 ? {
        gradient: style.backgroundGradient
      } : {},
      ...value6 ? {
        border: {
          style: value4,
          ...style.borderWidth !== void 0 ? {
            width: style.borderWidth
          } : {},
          ...style.borderColor !== void 0 ? {
            color: style.borderColor
          } : {},
          ...value5 !== void 0 ? {
            sides: value5.join(" ")
          } : style.borderSides !== void 0 ? {
            sides: style.borderSides
          } : {},
          ...style.borderTopWidth !== void 0 || style.borderRightWidth !== void 0 || style.borderBottomWidth !== void 0 || style.borderLeftWidth !== void 0 ? {
            widths: value5 !== void 0 ? {
              right: style.borderRightWidth,
              bottom: style.borderBottomWidth
            } : {
              top: style.borderTopWidth,
              right: style.borderRightWidth,
              bottom: style.borderBottomWidth,
              left: style.borderLeftWidth
            }
          } : {}
        }
      } : {},
      ...value9,
      ...value10 !== void 0 ? {
        shadow: value10
      } : {},
      ...leaves < 1 ? {
        opacity: leaves
      } : {},
      ...opacity !== void 0 ? {
        blend: opacity
      } : {}
    };
  }
  function multiplyCanvasOpacity(context, opacity) {
    opacity >= 1 || (context.setTransform(1, 0, 0, 1, 0, 0), context.globalCompositeOperation = "destination-in", context.fillStyle = "#000", context.globalAlpha = Math.max(0, opacity), context.fillRect(0, 0, context.canvas.width, context.canvas.height));
  }
  function rasterizeHtmlLeaf(element, css, rectangle, opacity) {
    let value = Math.max(1, Math.round(rectangle.w)), value2 = Math.max(1, Math.round(rectangle.h)), value3 = Math.min(2, 2048 / Math.max(value, value2)), value4 = document.createElement("canvas");
    value4.width = Math.max(1, Math.round(value * value3)), value4.height = Math.max(1, Math.round(value2 * value3));
    let value5 = value4.getContext("2d");
    if (!value5)
      return;
    let value6 = Math.min(value4.width, value4.height) * 0.9;
    value5.font = String(value6) + "px mc-anthropicons", value5.textAlign = "center", value5.textBaseline = "middle", value5.fillStyle = (0, runtime2.resolveSlideColor)(element.color) ?? (0, runtime2.slideTextColor)(css), value5.fillText(runtime2.iconFontGlyphs[element.icon], value4.width / 2, value4.height / 2 + value6 * 0.04), multiplyCanvasOpacity(value5, opacity);
    try {
      return value4.toDataURL("image/png");
    } catch {
      return;
    }
  }
  function rasterizeShapeLeaf(node, rectangle, opacity) {
    let value = Math.max(1, Math.round(rectangle.w)), value2 = Math.max(1, Math.round(rectangle.h)), value3 = node.shape === "connector" ? Math.max(0, Math.ceil((0, runtime2.connectorArrowInset)(node.strokeWidth) - Math.min(value, value2) / 2)) : 0, value4 = Math.min(2, 2048 / Math.max(value + 2 * value3, value2 + 2 * value3)), value5 = document.createElement("canvas");
    value5.width = Math.max(1, Math.round((value + 2 * value3) * value4)), value5.height = Math.max(1, Math.round((value2 + 2 * value3) * value4));
    let value6 = value5.getContext("2d");
    if (!value6)
      return;
    let { width, height: height2 } = value5, value7 = (0, runtime2.shapeOutline)(node.style), value8 = node.style?.backgroundColor, value9 = value7?.color, value10 = (value7?.width ?? 0) * value4, value11 = value3 > 0 ? {
      ...rectangle,
      x: rectangle.x - value3,
      y: rectangle.y - value3,
      w: rectangle.w + 2 * value3,
      h: rectangle.h + 2 * value3
    } : rectangle;
    if (node.shape === "connector") {
      let value12 = node.strokeWidth ?? runtime2.defaultShapeStrokeWidth, value13 = (0, runtime2.connectorGeometry)(value, value2, node);
      value6.translate(value3 * value4, value3 * value4);
      let value14 = (0, runtime2.resolveSlideColor)(node.stroke) ?? "#000000";
      value6.strokeStyle = value6.fillStyle = (0, runtime2.stripHexAlpha)(value14), value6.lineWidth = value12 * value4, value6.lineCap = "round", value6.lineJoin = "round", node.dashed === !0 && value6.setLineDash([value12 * 3 * value4, value12 * 2 * value4]), value6.beginPath(), (0, runtime2.shortenConnectorShaftForHeads)(value13, value12).forEach(([input, input2], options) => options === 0 ? value6.moveTo(input * value4, input2 * value4) : value6.lineTo(input * value4, input2 * value4)), value6.stroke(), value6.setLineDash([]);
      for (let value15 of value13.heads) {
        let [value16, value17] = (0, runtime2.connectorArrowHeadWings)(value15, value12);
        value6.beginPath(), value6.moveTo(value16[0] * value4, value16[1] * value4), value6.lineTo(value15.tip[0] * value4, value15.tip[1] * value4), value6.lineTo(value17[0] * value4, value17[1] * value4), value15.kind === "open" ? value6.stroke() : (value6.closePath(), value6.fill());
      }
      multiplyCanvasOpacity(value6, opacity * (0, runtime2.cssColorOpacity)(value14));
      try {
        return {
          dataUri: value5.toDataURL("image/png"),
          rect: value11
        };
      } catch {
        return;
      }
    }
    (() => {
      value6.beginPath();
      let shape = node.shape, value12 = (0, runtime2.borderRadiiByCorner)(node.style);
      if (shape === "rect" && Math.max(value12.tl, value12.tr, value12.br, value12.bl) > 0) {
        let callback = (input) => Math.max(0, Math.min(input * value4 - value10 / 2, (width - value10) / 2, (height2 - value10) / 2));
        value6.roundRect(value10 / 2, value10 / 2, width - value10, height2 - value10, [
          callback(value12.tl),
          callback(value12.tr),
          callback(value12.br),
          callback(value12.bl)
        ]);
      } else
        shape === "rect" || shape === "line" ? value6.rect(value10 / 2, value10 / 2, width - value10, height2 - value10) : shape === "ellipse" ? value6.ellipse(width / 2, height2 / 2, (width - value10) / 2, (height2 - value10) / 2, 0, 0, Math.PI * 2) : ((runtime2.shapeClipPaths[shape] ?? "").split(" ").map((input) => input.split(",").map(Number)).forEach(([input, input2], options) => {
          let value13 = (input ?? 0) / 100 * width, value14 = (input2 ?? 0) / 100 * height2;
          options === 0 ? value6.moveTo(value13, value14) : value6.lineTo(value13, value14);
        }), value6.closePath());
    })(), value8 !== void 0 && (value6.fillStyle = value8, value6.fill()), value10 > 0 && value9 !== void 0 && (value6.strokeStyle = value9, value6.lineWidth = value10, value6.lineJoin = "round", value7?.line === "dashed" ? value6.setLineDash([value10 * 3, value10 * 2]) : value7?.line === "dotted" && (value6.setLineDash([0, value10 * 2]), value6.lineCap = "round"), value6.stroke()), multiplyCanvasOpacity(value6, opacity);
    try {
      return {
        dataUri: value5.toDataURL("image/png"),
        rect: value11
      };
    } catch {
      return;
    }
  }
  function rectangleWithinSlide(element, slideRectangle, transform = IDENTITY_TRANSFORM) {
    let bounds = element.getBoundingClientRect(), value = (transform.rot % 360 + 360) % 360;
    if (value === 0 && transform.scl === 1)
      return {
        x: bounds.left - slideRectangle.left,
        y: bounds.top - slideRectangle.top,
        w: bounds.width,
        h: bounds.height
      };
    let value2 = element, value3 = typeof value2.offsetWidth == "number", value4 = value3 ? null : getComputedStyle(element), value5 = (value3 ? value2.offsetWidth : parseFloat(value4?.width ?? "") || bounds.width) * transform.scl, value6 = (value3 ? value2.offsetHeight : parseFloat(value4?.height ?? "") || bounds.height) * transform.scl;
    return {
      x: bounds.left + bounds.width / 2 - slideRectangle.left - value5 / 2,
      y: bounds.top + bounds.height / 2 - slideRectangle.top - value6 / 2,
      w: value5,
      h: value6,
      ...value !== 0 ? {
        rotate: value
      } : {}
    };
  }
  function contentRectangleWithinSlide(element, slideRectangle, transform = IDENTITY_TRANSFORM) {
    let value = rectangleWithinSlide(element, slideRectangle, transform), value2 = getComputedStyle(element), callback = (input) => (parseFloat(input) || 0) * transform.scl, value3 = callback(value2.borderLeftWidth) + Math.max(0, callback(value2.paddingLeft) + Math.min(0, callback(value2.textIndent))), value4 = callback(value2.borderTopWidth) + callback(value2.paddingTop), value5 = callback(value2.borderRightWidth) + callback(value2.paddingRight), value6 = callback(value2.borderBottomWidth) + callback(value2.paddingBottom);
    return (0, runtime2.insetRect)(value, {
      left: value3,
      top: value4,
      right: value5,
      bottom: value6
    });
  }
  async function waitForImages(container) {
    let items = [...container.querySelectorAll("img")];
    await Promise.all(items.map((input) => input.decode().catch(() => {
    })));
  }
  async function rasterizeSvgImages(measuredDeck) {
    for (let value of measuredDeck.slides)
      for (let value2 of value.leaves) {
        if (value2.kind !== "img")
          continue;
        let dataUri = value2.dataUri;
        if (!(dataUri === void 0 || !dataUri.startsWith("data:image/svg+xml")))
          try {
            let value3 = new Image();
            await new Promise((input, options) => {
              let value12 = setTimeout(() => options(Error("svg decode timeout")), 1e4);
              value3.onload = () => {
                clearTimeout(value12), input();
              }, value3.onerror = () => {
                clearTimeout(value12), options(Error("svg decode failed"));
              }, value3.src = dataUri;
            });
            let value4 = value3.naturalWidth > 0 && value3.naturalHeight > 0, value5 = value4 ? value3.naturalWidth : Math.max(1, value2.rect.w), value6 = value4 ? value3.naturalHeight : Math.max(1, value2.rect.h), value7 = Math.min(2, 2048 / Math.max(1, Math.max(value2.rect.w, value2.rect.h))), value8 = Math.max(1, Math.round(value2.rect.w * value7)), value9 = Math.max(1, Math.round(value8 * value6 / Math.max(1, value5)));
            value9 > 2048 && (value8 = Math.max(1, Math.round(value8 * 2048 / value9)), value9 = 2048);
            let value10 = document.createElement("canvas");
            value10.width = value8, value10.height = value9;
            let value11 = value10.getContext("2d");
            if (value11 === null)
              continue;
            value11.drawImage(value3, 0, 0, value8, value9), value11.getImageData(0, 0, 1, 1), value2.dataUri = value10.toDataURL("image/png"), value2.naturalW = value8, value2.naturalH = value9;
          } catch {
          }
      }
  }
  async function replaceRasterFallbacks(measuredDeck, requests) {
    if (requests.length === 0)
      return;
    let value = await (0, runtime2.captureHtmlEmbeds)(requests.map((input) => input.req));
    for (let value2 of requests) {
      let entry = value.get(value2.req.key), value3 = measuredDeck.slides[value2.slide]?.leaves[value2.leaf];
      entry === void 0 || value3 === void 0 || (measuredDeck.slides[value2.slide].leaves[value2.leaf] = {
        kind: "img",
        rect: value3.rect,
        dataUri: entry.dataUri,
        fit: "contain",
        alt: "网页嵌入内容",
        naturalW: entry.w,
        naturalH: entry.h,
        ...value2.round
      });
    }
  }
  function deckUsesFontFamily(slides, family) {
    let value = family.trim().toLowerCase(), callback = (source) => {
      let value2 = source.kind === "text" || source.kind === "table" ? source.style?.fontFamily : void 0;
      return typeof value2 == "object" && value2.family.trim().toLowerCase() === value || ((0, runtime2.nodeChildren)(source) ?? []).some(callback);
    };
    return slides.some((input) => input.frames.some((input2) => callback(input2.node)));
  }
  async function measureDeck(slides, assets, faces, options) {
    let value = document.createElement("div");
    value.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;z-index:-1000;overflow:hidden;width:0;height:0;", value.setAttribute("data-appifact-content", ""), document.body.appendChild(value);
    let value2 = reactDOMClientForExportDeckMeasurement.createRoot(value);
    try {
      (0, runtime2.renderReactSynchronously)(value2, reactForExportDeckMeasurement.createElement("div", null, assets.map((input, options2) => reactForExportDeckMeasurement.createElement("div", {
        key: input.id,
        "data-measure-slide": String(options2)
      }, reactForExportDeckMeasurement.createElement(runtime2.SlideSurface, {
        slide: input,
        assets: faces,
        animate: !1
      }))))), value.offsetHeight;
      let value3 = options?.fontsReadyMs === void 0 ? void 0 : Date.now() + options.fontsReadyMs, value4 = await (0, runtime2.waitForDocumentFonts)(document.fonts, options?.fontsReadyMs), value5 = document.fonts.load("90px mc-anthropicons").catch(() => {
      });
      await (value3 === void 0 ? value5 : (0, runtime2.promiseWithTimeout)(value5, Math.max(100, value3 - Date.now()))), await waitForImages(value), document.visibilityState === "visible" && await new Promise((input) => {
        let value8 = setTimeout(input, 1e3);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          clearTimeout(value8), input();
        }));
      });
      let value6 = await (0, runtime2.captureDeckBackgrounds)(assets, (input) => value.querySelector('[data-measure-slide="' + String(input) + '"]')?.firstElementChild ?? null, rectangleWithinSlide), value7 = (0, runtime2.uniqueFontFamilyNames)(value4).filter((input) => deckUsesFontFamily(assets, input)), items = [
        ...value7.length > 0 ? [(0, runtime2.fontTimeoutWarning)(value7, "sized")] : [],
        ...value6.notes
      ], state = {
        title: slides,
        slides: [],
        ...items.length > 0 ? {
          exportNotes: items
        } : {},
        ...value7.length > 0 ? {
          lateFamilies: value7
        } : {}
      }, items2 = [];
      return assets.forEach((input, options2) => {
        let value8 = value.querySelector('[data-measure-slide="' + String(options2) + '"]')?.firstElementChild;
        if (!value8) {
          state.slides.push({
            bg: input.bg,
            leaves: [],
            ...input.notes !== void 0 ? {
              notes: input.notes
            } : {}
          });
          return;
        }
        let bounds = value8.getBoundingClientRect(), items3 = [], entry = value6.pictures.get(options2);
        for (let value9 of input.frames) {
          if (entry?.frameIds.has(value9.id) === !0)
            continue;
          let element = value8.querySelector('[data-frame-id="' + value9.id + '"]');
          if (!element)
            continue;
          let callback = (input2) => {
            let value14 = parseFloat(getComputedStyle(input2).getPropertyValue("--fit"));
            return Number.isFinite(value14) && value14 > 0 && value14 < 1 ? value14 : 1;
          }, value10 = collectMeasuredModelNodes(value9.node), entries = new Map(value10.map((input2) => [
            input2.path,
            {
              style: input2.node.style,
              opacity: input2.shown ? input2.opacity : 0,
              ...input2.blend !== void 0 ? {
                blend: input2.blend
              } : {}
            }
          ])), value11, value12, value13, callback2 = () => {
            value11 !== void 0 && items3.push(value11), value11 = void 0;
          };
          for (let { node: value14, path: value15, opacity: value16, shown: value17, blend: value18, turn: value19, across: value20 } of value10) {
            if (!value17 || value16 <= 0) {
              callback2();
              continue;
            }
            let value21 = measureBoxLeaf(value14, element, value15, bounds, value16, value18, value19);
            if (value14.kind !== "text" && callback2(), value21 !== void 0 && hasSolePlainText(value14)) {
              value11 = value21;
              let element2 = element.querySelector('[data-node-path="' + value15 + '"]');
              value12 = element2 !== null ? contentRectangleWithinSlide(element2, bounds, value19) : void 0;
              let value22 = value14.dir === "v" ? value14.justify : value14.align;
              value13 = value22 === "center" || value22 === "around" || value22 === "evenly" ? "middle" : value22 === "end" ? "bottom" : void 0;
            } else
              value21 !== void 0 && value14.kind !== "text" && items3.push(value21);
            if (!(value14.kind === "stack" || value14.kind === "grid" || value14.kind === "overlay"))
              if (value14.kind === "text") {
                let value22 = value14.text.trim() === "" ? null : element.querySelector('[data-text-path="' + value15 + '"]');
                (value21 !== void 0 || value22 === null) && callback2();
                let value23 = value21 ?? value11, value24 = value21 === void 0 && value11 !== void 0, value25 = value24 ? value12 : void 0;
                if (value11 = void 0, value22 === null) {
                  value21 !== void 0 && items3.push(value21);
                  continue;
                }
                let value26 = contentRectangleWithinSlide(value22, bounds, value19), value27 = oneLineTextWidth(value22, value19), value28 = value23 === void 0 && value27 !== void 0 && value20 !== void 0 && value19.rot % 360 === 0 && value19.scl === 1 ? applyHeldTextPosition(element, value20, value26, bounds) : void 0, value29 = value23 !== void 0 ? textLinesHeight(value22, value19) : void 0, value30 = value24 && hugsMeasuredLines(value29, value26.h) ? value13 : void 0, style = value14.style;
                items3.push({
                  kind: "text",
                  ...value23 !== void 0 ? {
                    box: value23
                  } : {},
                  ...value27 !== void 0 ? {
                    lineWidth: value27
                  } : {},
                  ...value28 !== void 0 ? {
                    heldSide: value28
                  } : {},
                  ...value29 !== void 0 ? {
                    linesHeight: value29
                  } : {},
                  ...value30 !== void 0 ? {
                    boxAnchor: value30
                  } : {},
                  ...value25 !== void 0 ? {
                    boxInner: value25
                  } : {},
                  rect: value26,
                  role: value14.role,
                  text: value14.text,
                  color: value14.color,
                  align: value14.align,
                  ...value14.marks !== void 0 ? {
                    marks: value14.marks
                  } : {},
                  ...value14.list !== void 0 ? {
                    list: value14.list,
                    ...measureListMetrics(value22, value14.list, (0, runtime2.textLinesAsRuns)(value14).length, (0, runtime2.pptxFontFace)(value14.role, style?.fontFamily))
                  } : {},
                  ...value14.lineLists !== void 0 ? {
                    lineLists: (0, runtime2.textLineLists)(value14),
                    listsBy: Object.fromEntries(["bullet", "number"].map((kind) => [
                      kind,
                      measureListMetrics(value22, kind, value14.lineLists.length, (0, runtime2.pptxFontFace)(value14.role, style?.fontFamily))
                    ]))
                  } : {},
                  ...style?.fontSize !== void 0 ? {
                    fontSize: style.fontSize
                  } : {},
                  ...style?.fontWeight !== void 0 ? {
                    fontWeight: style.fontWeight
                  } : {},
                  ...style?.fontStyle === "italic" ? {
                    italic: !0
                  } : {},
                  ...style?.textDecorationLine === "underline" ? {
                    underline: {
                      ...style.textDecorationStyle !== void 0 ? {
                        style: style.textDecorationStyle
                      } : {},
                      ...style.textDecorationColor !== void 0 ? {
                        color: style.textDecorationColor
                      } : {}
                    }
                  } : {},
                  ...style?.textDecorationLine === "line-through" ? {
                    strike: !0
                  } : {},
                  ...style?.fontFamily !== void 0 ? {
                    fontFamily: style.fontFamily
                  } : {},
                  ...style?.lineHeight !== void 0 ? {
                    lineHeight: style.lineHeight
                  } : {},
                  ...style?.letterSpacing !== void 0 && style.letterSpacing !== 0 ? {
                    letterSpacing: style.letterSpacing
                  } : {},
                  ...style?.textTransform !== void 0 && style.textTransform !== "none" ? {
                    textTransform: style.textTransform
                  } : {},
                  ...value14.wrap === "nowrap" ? {
                    nowrap: !0
                  } : {},
                  ...value16 < 1 ? {
                    opacity: value16
                  } : {},
                  ...value14.fit !== void 0 ? {
                    fit: value14.fit
                  } : {},
                  ...(value14.fit ?? runtime2.defaultTextFit) === "shrink" && callback(value22) < 1 ? {
                    fitScale: callback(value22)
                  } : {},
                  ...value14.fill !== void 0 ? {
                    textFill: value14.fill
                  } : {}
                });
              } else if (value14.kind === "icon") {
                let element2 = element.querySelector('[data-icon-path="' + value15 + '"]');
                if (!element2)
                  continue;
                let value22 = rectangleWithinSlide(element2, bounds, value19), value23 = rasterizeHtmlLeaf(value14, input.bg, value22, value16);
                if (value23 === void 0)
                  continue;
                items3.push({
                  kind: "img",
                  rect: value22,
                  dataUri: value23,
                  fit: "contain",
                  alt: value14.icon,
                  naturalW: Math.max(1, Math.round(value22.w)),
                  naturalH: Math.max(1, Math.round(value22.h)),
                  ...mergeCornerRounding(ZERO_CORNER_RADII, clippedCornerRadii(element2, element, bounds, value22, value19))
                });
              } else if (value14.kind === "shape") {
                let element2 = element.querySelector('[data-node-path="' + value15 + '"]');
                if (!element2)
                  continue;
                let value22 = rasterizeShapeLeaf(value14, rectangleWithinSlide(element2, bounds, value19), value16);
                if (value22 === void 0)
                  continue;
                let { dataUri: value23, rect: value24 } = value22;
                items3.push({
                  kind: "img",
                  rect: value24,
                  dataUri: value23,
                  fit: "contain",
                  alt: value14.shape,
                  naturalW: Math.max(1, Math.round(value24.w)),
                  naturalH: Math.max(1, Math.round(value24.h)),
                  ...mergeCornerRounding(ZERO_CORNER_RADII, clippedCornerRadii(element2, element, bounds, value24, value19))
                });
              } else if (value14.kind === "table") {
                let element2 = element.querySelector('[data-node-path="' + value15 + '"]');
                if (!element2)
                  continue;
                let value22 = value14.rows.map((input2, options3) => {
                  let element3 = element2.querySelector(':scope > [data-cell="' + String(options3) + '.0"]');
                  return element3 ? rectangleWithinSlide(element3, bounds, value19).h : 0;
                }), value23 = getComputedStyle(element2), value24 = (parseFloat(value23.paddingTop) || 0) > 0 || (parseFloat(value23.paddingLeft) || 0) > 0, value25 = parseFloat(value23.borderTopWidth) || 0, value26 = rectangleWithinSlide(element2, bounds, value19), state2 = {
                  x: value26.x,
                  y: value26.y,
                  w: value26.w,
                  h: value26.h
                }, value27 = mergeCornerRounding((0, runtime2.borderRadiiByCorner)(value14.style), clippedCornerRadii(element2, element, bounds, state2, value19)), value28 = value25 > 0 && (value24 || value27.radius !== void 0 || value27.corners !== void 0);
                value28 && items3.push({
                  kind: "box",
                  rect: state2,
                  border: {
                    style: "solid",
                    width: value25 * value19.scl,
                    color: value23.borderTopColor,
                    sides: "top left"
                  },
                  ...value27,
                  ...value16 < 1 ? {
                    opacity: value16
                  } : {}
                });
                let value29 = contentRectangleWithinSlide(element2, bounds, value19);
                items3.push({
                  kind: "table",
                  rect: {
                    ...value29,
                    w: Math.max(1, value29.w),
                    h: Math.max(1, value29.h)
                  },
                  ...value27.radius !== void 0 || value27.corners !== void 0 ? {
                    frame: {
                      rect: state2,
                      borders: {
                        left: (parseFloat(value23.borderLeftWidth) || 0) * value19.scl,
                        top: value25 * value19.scl,
                        right: (parseFloat(value23.borderRightWidth) || 0) * value19.scl,
                        bottom: (parseFloat(value23.borderBottomWidth) || 0) * value19.scl
                      },
                      ...value27
                    }
                  } : {},
                  ...value28 ? {
                    openTopLeft: !0
                  } : {},
                  ...value22.length > 0 && value22.every((input2) => input2 > 0) ? {
                    rowHeights: value22
                  } : {},
                  rows: value14.rows,
                  cols: value14.cols,
                  header: value14.header,
                  colWidths: value14.colWidths,
                  colAligns: value14.colAligns,
                  cellStyles: value14.cellStyles,
                  rowStyles: value14.rowStyles,
                  cellPadding: value14.cellPadding,
                  headerWeight: value14.headerWeight,
                  role: value14.role,
                  ...value14.style?.fontFamily !== void 0 ? {
                    fontFamily: value14.style.fontFamily
                  } : {},
                  ...value14.style?.fontSize !== void 0 ? {
                    fontSize: value14.style.fontSize
                  } : {},
                  ...value14.style?.color !== void 0 ? {
                    color: value14.style.color
                  } : {},
                  ...ancestorGrounds(value15, entries).length > 0 ? {
                    backgrounds: ancestorGrounds(value15, entries)
                  } : {},
                  ...(value14.fit ?? runtime2.defaultTextFit) === "shrink" && callback(element2) < 1 ? {
                    fitScale: callback(element2)
                  } : {}
                });
              } else if (value14.kind === "html") {
                let element2 = element.querySelector('[data-node-path="' + value15 + '"]');
                if (!element2)
                  continue;
                let value22 = rectangleWithinSlide(element2, bounds, value19);
                items2.push({
                  slide: options2,
                  leaf: items3.length,
                  req: {
                    key: String(options2) + "/" + value9.id,
                    html: value14.html,
                    w: value22.w,
                    h: value22.h
                  },
                  round: mergeCornerRounding(ZERO_CORNER_RADII, clippedCornerRadii(element2, element, bounds, value22, value19))
                }), items3.push({
                  kind: "text",
                  rect: value22,
                  role: "caption",
                  text: "[Interactive web embed — view it in the original presentation]",
                  align: "center",
                  embedPlaceholder: !0
                });
              } else {
                let value22;
                if (value22 !== void 0) {
                  let element3 = element.querySelector('[data-img-path="' + value15 + '"]');
                  if (!element3)
                    continue;
                  let value25 = rectangleWithinSlide(element3, bounds, value19);
                  items3.push({
                    kind: "box",
                    rect: value25,
                    fill: "#141413",
                    ...value16 < 1 ? {
                      opacity: value16
                    } : {}
                  }), items3.push({
                    kind: "text",
                    rect: value25,
                    role: "caption",
                    color: "#ffffff",
                    align: "center",
                    ...value22
                  });
                  continue;
                }
                if (!(0, runtime2.imageHasPoster)(value14))
                  continue;
                let element2 = element.querySelector('[data-img-path="' + value15 + '"]');
                if (!element2)
                  continue;
                let value23 = element2 instanceof HTMLImageElement ? element2 : element2.querySelector("img"), value24 = value14.crop !== void 0 && value23 !== null && value23 !== element2 && value23.style.maxWidth === "none", watchUrl = null, state2 = {
                  kind: "img",
                  rect: rectangleWithinSlide(element2, bounds, value19),
                  dataUri: value14.asset !== void 0 ? faces.get(value14.asset) : value14.src,
                  fit: value14.fit,
                  ...value24 ? {
                    crop: value14.crop
                  } : {},
                  alt: value14.alt,
                  ...value16 < 1 ? {
                    opacity: value16
                  } : {},
                  ...watchUrl !== null ? {
                    href: watchUrl
                  } : {}
                };
                Object.assign(state2, mergeCornerRounding((0, runtime2.borderRadiiByCorner)(value14.style), clippedCornerRadii(element2, element, bounds, state2.rect, value19))), value23 !== null && value23.naturalWidth > 0 && (state2.naturalW = value23.naturalWidth, state2.naturalH = value23.naturalHeight);
                let style = value14.style;
                style?.borderStyle !== void 0 && style.borderStyle !== "none" && (state2.border = {
                  style: style.borderStyle,
                  ...style.borderWidth !== void 0 ? {
                    width: style.borderWidth
                  } : {},
                  ...style.borderColor !== void 0 ? {
                    color: style.borderColor
                  } : {},
                  ...style.borderSides !== void 0 ? {
                    sides: style.borderSides
                  } : {},
                  ...style.borderTopWidth !== void 0 || style.borderRightWidth !== void 0 || style.borderBottomWidth !== void 0 || style.borderLeftWidth !== void 0 ? {
                    widths: {
                      top: style.borderTopWidth,
                      right: style.borderRightWidth,
                      bottom: style.borderBottomWidth,
                      left: style.borderLeftWidth
                    }
                  } : {}
                }), style?.boxShadow?.[0] !== void 0 && style.boxShadow[0] !== value21?.shadow && (state2.shadow = style.boxShadow[0]), items3.push(state2);
              }
          }
          callback2();
        }
        state.slides.push({
          bg: input.bg,
          leaves: items3,
          ...input.notes !== void 0 ? {
            notes: input.notes
          } : {},
          ...entry !== void 0 ? {
            backdrop: entry.dataUri,
            ground: entry.ground
          } : {}
        });
      }), await rasterizeSvgImages(state), await replaceRasterFallbacks(state, items2), state;
    } finally {
      value2.unmount(), value.remove();
    }
  }
  return bindRuntimeValue(runtime2, "deckMeasurementExports", () => deckMeasurementExports, (value) => {
    deckMeasurementExports = value;
  }), bindRuntimeValue(runtime2, "textHorizontalHold", () => textHorizontalHold), bindRuntimeValue(runtime2, "applyHeldTextPosition", () => applyHeldTextPosition), bindRuntimeValue(runtime2, "collectMeasuredModelNodes", () => collectMeasuredModelNodes), bindRuntimeValue(runtime2, "textLineMetrics", () => textLineMetrics), bindRuntimeValue(runtime2, "oneLineTextWidth", () => oneLineTextWidth), bindRuntimeValue(runtime2, "textLinesHeight", () => textLinesHeight), bindRuntimeValue(runtime2, "hugsMeasuredLines", () => hugsMeasuredLines), bindRuntimeValue(runtime2, "hasSolePlainText", () => hasSolePlainText), bindRuntimeValue(runtime2, "measureListMarker", () => measureListMarker), bindRuntimeValue(runtime2, "measureListMetrics", () => measureListMetrics), bindRuntimeValue(runtime2, "clippedCornerRadii", () => clippedCornerRadii), bindRuntimeValue(runtime2, "ancestorGrounds", () => ancestorGrounds), bindRuntimeValue(runtime2, "mergeCornerRounding", () => mergeCornerRounding), bindRuntimeValue(runtime2, "measureBoxLeaf", () => measureBoxLeaf), bindRuntimeValue(runtime2, "multiplyCanvasOpacity", () => multiplyCanvasOpacity), bindRuntimeValue(runtime2, "rasterizeHtmlLeaf", () => rasterizeHtmlLeaf), bindRuntimeValue(runtime2, "rasterizeShapeLeaf", () => rasterizeShapeLeaf), bindRuntimeValue(runtime2, "rectangleWithinSlide", () => rectangleWithinSlide), bindRuntimeValue(runtime2, "contentRectangleWithinSlide", () => contentRectangleWithinSlide), bindRuntimeValue(runtime2, "waitForImages", () => waitForImages), bindRuntimeValue(runtime2, "rasterizeSvgImages", () => rasterizeSvgImages), bindRuntimeValue(runtime2, "replaceRasterFallbacks", () => replaceRasterFallbacks), bindRuntimeValue(runtime2, "deckUsesFontFamily", () => deckUsesFontFamily), bindRuntimeValue(runtime2, "measureDeck", () => measureDeck), bindRuntimeValue(runtime2, "reactForExportDeckMeasurement", () => reactForExportDeckMeasurement, (value) => {
    reactForExportDeckMeasurement = value;
  }), bindRuntimeValue(runtime2, "reactDOMClientForExportDeckMeasurement", () => reactDOMClientForExportDeckMeasurement, (value) => {
    reactDOMClientForExportDeckMeasurement = value;
  }), bindRuntimeValue(runtime2, "IDENTITY_TRANSFORM", () => IDENTITY_TRANSFORM, (value) => {
    IDENTITY_TRANSFORM = value;
  }), bindRuntimeValue(runtime2, "ZERO_CORNER_RADII", () => ZERO_CORNER_RADII, (value) => {
    ZERO_CORNER_RADII = value;
  }), bindRuntimeValue(runtime2, "MEASUREMENT_TOLERANCE", () => MEASUREMENT_TOLERANCE, (value) => {
    MEASUREMENT_TOLERANCE = value;
  }), bindRuntimeValue(runtime2, "CANVAS_FONT_STYLE_KEYS", () => CANVAS_FONT_STYLE_KEYS, (value) => {
    CANVAS_FONT_STYLE_KEYS = value;
  }), bindRuntimeValue(runtime2, "initializeDeckMeasurement", () => initializeDeckMeasurement, (value) => {
    initializeDeckMeasurement = value;
  }), () => {
    deckMeasurementExports = {}, (0, runtime2.defineLiveExports)(deckMeasurementExports, {
      measureDeck: () => measureDeck
    }), MEASUREMENT_TOLERANCE = 2, initializeDeckMeasurement = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeVideoLinks)(), (0, runtime2.initializeRichTextDom)(), (0, runtime2.initializeSlideRenderer)(), (0, runtime2.initializeModelSelection)(), (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeIconFont)(), (0, runtime2.initializeEmbedCapture)(), (0, runtime2.initializeSynchronousReactRender)(), (0, runtime2.initializePptxExport)(), (0, runtime2.initializeBackgroundCapture)(), (0, runtime2.initializeCaptureFallback)(), reactForExportDeckMeasurement = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactDOMClientForExportDeckMeasurement = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomClientNamespace)(), 1), IDENTITY_TRANSFORM = {
        rot: 0,
        scl: 1
      }, ZERO_CORNER_RADII = {
        tl: 0,
        tr: 0,
        br: 0,
        bl: 0
      }, CANVAS_FONT_STYLE_KEYS = [
        "fontStyle",
        "fontWeight",
        "fontStretch",
        "fontSize",
        "fontFamily",
        "fontKerning",
        "fontFeatureSettings",
        "fontVariationSettings",
        "letterSpacing"
      ];
    });
  };
}
export { installExportDeckMeasurement };
