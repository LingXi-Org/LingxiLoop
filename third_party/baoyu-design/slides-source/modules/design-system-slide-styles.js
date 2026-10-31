// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDesignSystemSlideStyles(runtime2) {
  const THEME = "neutral", nonLatinPattern = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u, noFamilies = /* @__PURE__ */ new Set(), seriesCache = /* @__PURE__ */ new WeakMap(), usesCache = /* @__PURE__ */ new WeakMap(), rgb = (color) => (0, runtime2.hexColorRgb)(color);
  function normalizedHex(color) {
    if (color === void 0)
      return;
    let value = ((0, runtime2.resolveSlideColor)(color.trim()) ?? color.trim()).toLowerCase(), hex = /^#[0-9a-f]{3,4}$/.test(value) ? "#" + [...value.slice(1)].map((digit) => digit + digit).join("") : value;
    if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/.test(hex))
      return hex.length === 9 && hex.endsWith("ff") ? hex.slice(0, 7) : hex;
  }
  const opaqueHex = (color) => {
    let hex = normalizedHex(color);
    return hex !== void 0 && hex.length === 7 ? hex : void 0;
  };
  function restyleFaceOf(family) {
    if (family !== void 0)
      return typeof family == "string" ? family === "helvetica" ? { name: "Helvetica", generic: "sans" } : { name: "", generic: family } : {
        name: family.family,
        generic: family.fallback === "helvetica" ? "sans" : family.fallback,
        ...family.webSafe !== void 0 ? { backup: family.webSafe } : {}
      };
  }
  function restyleFaceFontFamily(face, declared) {
    if (face.name === "" || !runtime2.customFontFamilyPattern.test(face.name))
      return face.generic;
    let backup = face.backup !== void 0 ? (0, runtime2.resolveBasicFontFamily)(face.backup) : void 0;
    if (declared.has(face.name.toLowerCase()))
      return {
        family: face.name,
        fallback: face.generic,
        ...backup !== void 0 ? { webSafe: backup } : {}
      };
    let alias = (0, runtime2.resolveFontFamilyAlias)(face.name);
    return alias !== void 0 ? {
      ...alias,
      ...backup !== void 0 && backup !== alias.family ? { webSafe: backup } : {}
    } : face.generic;
  }
  function textNodeLook(node) {
    let combo = (0, runtime2.nodeTypographyCombo)(node, THEME), family = restyleFaceOf(combo.fontFamily);
    return {
      ...family !== void 0 ? { family } : {},
      fontSize: combo.fontSize,
      fontWeight: combo.fontWeight,
      italic: combo.italic,
      lineHeight: combo.lineHeight,
      letterSpacing: combo.letterSpacing,
      ...combo.textTransform !== void 0 ? { textTransform: combo.textTransform } : {}
    };
  }
  function styleBagLook(style) {
    let family = restyleFaceOf(style.fontFamily), body = (0, runtime2.typeScaleForRole)("body", THEME);
    return {
      ...family !== void 0 ? { family } : {},
      fontSize: style.fontSize ?? body.fontSize,
      fontWeight: style.fontWeight ?? body.fontWeight,
      italic: style.fontStyle === "italic",
      lineHeight: style.lineHeight ?? body.lineHeight,
      letterSpacing: style.letterSpacing ?? 0
    };
  }
  function withTextLook(node, look, declared) {
    let scale = (0, runtime2.typeScaleForRole)(node.role, THEME), { fontSize: _fontSize, fontWeight: _fontWeight, lineHeight: _lineHeight, letterSpacing: _letterSpacing, fontStyle: _fontStyle, textTransform: _textTransform, fontFamily: _fontFamily, ...rest } = node.style ?? {}, transform = look.textTransform === "uppercase" || look.textTransform === "lowercase" || look.textTransform === "capitalize" ? look.textTransform : void 0, style = {
      ...rest,
      ...look.fontSize !== scale.fontSize ? { fontSize: look.fontSize } : {},
      ...look.fontWeight !== scale.fontWeight ? { fontWeight: look.fontWeight } : {},
      ...look.lineHeight !== scale.lineHeight ? { lineHeight: look.lineHeight } : {},
      ...look.letterSpacing !== 0 ? { letterSpacing: look.letterSpacing } : {},
      ...look.italic ? { fontStyle: "italic" } : {},
      ...transform !== void 0 ? { textTransform: transform } : {},
      ...look.family !== void 0 ? { fontFamily: restyleFaceFontFamily(look.family, declared) } : {}
    };
    return { ...node, style };
  }
  const isLadderRole = (role) => role === "h1" || role === "h2" || role === "h3" || role === "display";
  function walkNode(node, ground, visitor, pages) {
    let slots = {}, recolor = (value, prop, slotName, on, small2 = !1) => {
      let hex = normalizedHex(value);
      if (hex === void 0)
        return value;
      let mark = node.slots !== void 0 && Object.hasOwn(node.slots, slotName) ? node.slots[slotName] : void 0, keep = visitor.keep.has(rgb(hex)), next2 = visitor.color({
        value: hex,
        prop,
        on,
        page: pages[0],
        ...small2 ? { small: small2 } : {},
        ...keep ? { keep } : {},
        ...mark !== void 0 ? { mark } : {}
      });
      if (next2 === void 0)
        return value;
      let slot = visitor.after != null ? movedSlot(visitor.after, prop, next2, pages[1]) : void 0;
      return slot !== void 0 && (slots[slotName] = slot), next2.value === hex ? value : next2.value;
    }, recolorGradient = (gradient, prop, slotName, on) => ({
      ...gradient,
      stops: gradient.stops.map((stop, index4) => ({
        ...stop,
        color: recolor(stop.color, prop, slotName + String(index4), on) ?? stop.color
      }))
    }), inner = opaqueHex(node.style?.backgroundColor) ?? ground, small = node.kind === "text" ? (0, runtime2.nodeTypographyCombo)(node, THEME).fontSize < runtime2.LARGE_TEXT_THRESHOLD : node.kind === "table" ? styleBagLook(node.style ?? {}).fontSize < runtime2.LARGE_TEXT_THRESHOLD : !1, style = node.style, nextStyle = style === void 0 ? void 0 : {
      ...style,
      ...style.backgroundColor !== void 0 ? {
        backgroundColor: recolor(style.backgroundColor, node.kind === "shape" && node.shape === "line" ? "line" : "fill", "background", ground)
      } : {},
      ...style.borderColor !== void 0 ? {
        borderColor: recolor(style.borderColor, "line", "border", ground)
      } : {},
      ...style.color !== void 0 ? { color: recolor(style.color, "text", "color", inner, small) } : {},
      ...style.textDecorationColor !== void 0 ? {
        textDecorationColor: recolor(style.textDecorationColor, "text", "decoration", inner, small)
      } : {},
      ...style.textStrokeColor !== void 0 ? {
        textStrokeColor: recolor(style.textStrokeColor, "text", "outline", inner, small)
      } : {},
      ...style.backgroundGradient !== void 0 ? {
        backgroundGradient: recolorGradient(style.backgroundGradient, "fill", "stop", ground)
      } : {}
    }, next = nextStyle !== void 0 ? { ...node, style: nextStyle } : node, relook = (use) => {
      let result = visitor.text({
        ...use,
        ...node.slots?.type !== void 0 ? { mark: node.slots.type } : {}
      });
      return result?.slot !== void 0 && visitor.after != null && (0, runtime2.memoryTextSlotFor)(visitor.after, result.look) !== result.slot && (slots.type = result.slot), result?.look;
    };
    if (next.kind === "text") {
      let role = (0, runtime2.findTypographyStyle)(next, visitor.styles, THEME)?.role ?? (isLadderRole(next.role) ? next.role : void 0), look = textNodeLook(next), relooked = relook({ ...look, ...role !== void 0 ? { role } : {} }), kept = relooked !== void 0 && nonLatinPattern.test(next.text) ? {
        ...relooked,
        ...look.family !== void 0 ? { family: look.family } : {}
      } : relooked;
      next = {
        ...kept !== void 0 && JSON.stringify(kept) !== JSON.stringify(look) ? withTextLook(next, kept, visitor.declared) : next,
        ...next.color !== void 0 ? { color: recolor(next.color, "text", "color", inner, small) } : {},
        ...next.marks !== void 0 ? {
          marks: next.marks.map((mark, index4) => mark.color !== void 0 ? {
            ...mark,
            color: recolor(mark.color, "text", "run" + String(index4), inner, small)
          } : mark)
        } : {},
        ...next.fill?.kind === "gradient" ? {
          fill: {
            ...next.fill,
            gradient: recolorGradient(next.fill.gradient, "text", "ink", inner)
          }
        } : {}
      };
    } else if (next.kind === "icon")
      next = {
        ...next,
        ...next.color !== void 0 ? { color: recolor(next.color, "text", "color", inner) } : {}
      };
    else if (next.kind === "shape")
      next = {
        ...next,
        ...next.stroke !== void 0 ? { stroke: recolor(next.stroke, "line", "stroke", ground) } : {}
      };
    else if (next.kind === "table") {
      let rowStyles = next.rowStyles, latin = !next.rows.some((row) => row.some((cell) => nonLatinPattern.test(cell))), family = next.style?.fontFamily !== void 0 && latin ? relook({ ...styleBagLook(next.style), role: "body" })?.family : void 0;
      next = {
        ...next,
        ...family !== void 0 ? {
          style: {
            ...next.style,
            fontFamily: restyleFaceFontFamily(family, visitor.declared)
          }
        } : {},
        ...next.cellStyles !== void 0 ? {
          cellStyles: Object.fromEntries(Object.entries(next.cellStyles).map(([key, cell]) => [
            key,
            {
              ...cell,
              color: recolor(cell.color, "text", "cell" + key.replace(".", "-"), opaqueHex(rowStyles?.[key.split(".")[0] ?? ""]?.background) ?? inner, small) ?? cell.color
            }
          ]))
        } : {},
        ...rowStyles !== void 0 ? {
          rowStyles: Object.fromEntries(Object.entries(rowStyles).map(([key, row]) => [
            key,
            {
              ...row,
              background: recolor(row.background, "fill", "row" + key, inner) ?? row.background
            }
          ]))
        } : {}
      };
    } else if ((0, runtime2.isFlowContainer)(next))
      next = {
        ...next,
        children: next.children.map((child) => walkNode(child, inner, visitor, pages))
      };
    else if (next.kind === "overlay") {
      let layerGround = opaqueHex(next.base.style?.backgroundColor) ?? inner, { slots: baseSlots, ...base } = walkNode({
        ...next.base,
        ...node.slots !== void 0 ? { slots: node.slots } : {}
      }, inner, visitor, pages);
      Object.assign(slots, visitor.after === void 0 ? {} : baseSlots), next = {
        ...next,
        base,
        layers: next.layers.map((layer) => ({
          ...layer,
          node: walkNode(layer.node, layerGround, visitor, pages)
        }))
      };
    }
    return visitor.after === void 0 ? next : withSlots(next, slots);
  }
  function movedSlot(memory, prop, next, page) {
    let remembered = (0, runtime2.memorySlotFor)(memory, prop, rgb(next.value), page);
    return Object.hasOwn(memory.colors, next.slot) ? remembered !== next.slot ? next.slot : void 0 : remembered !== void 0 ? runtime2.OWN_PALETTE_SLOT : void 0;
  }
  function deckSeries(slides) {
    let cached = seriesCache.get(slides);
    if (cached !== void 0)
      return cached;
    let series = (0, runtime2.deckSeriesColors)(slides.map((slide) => {
      let uses = [];
      return walkSlide(slide, {
        color: (use) => void uses.push(use),
        text: () => {
        },
        styles: [],
        declared: noFamilies,
        keep: noFamilies
      }), uses;
    }), void 0);
    return seriesCache.set(slides, series), series;
  }
  function withSlots(carrier, slots) {
    let { slots: _old, ...rest } = carrier, entries = Object.entries(slots).slice(0, runtime2.maxNodeSlots);
    return entries.length > 0 ? { ...rest, slots: Object.fromEntries(entries) } : rest;
  }
  function frameGround(frames, index4, fallback) {
    let frame = frames[index4];
    if (frame === void 0)
      return fallback;
    let bounds = (0, runtime2.frameBounds)(frame.x, frame.y), [x, y] = [bounds.x + bounds.w / 2, bounds.y + bounds.h / 2];
    for (let before = index4 - 1; before >= 0; before--) {
      let under = frames[before];
      if (under === void 0)
        continue;
      let fill = opaqueHex(under.node.style?.backgroundColor), box = (0, runtime2.frameBounds)(under.x, under.y);
      if (fill !== void 0 && box.w > 0 && box.h > 0 && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h)
        return fill;
    }
    return fallback;
  }
  function walkSlide(slide, visitor) {
    let bg = normalizedHex(slide.bg) ?? "#ffffff", ground = visitor.color({
      value: bg,
      prop: "ground",
      page: rgb(bg),
      ...slide.slots?.ground !== void 0 ? { mark: slide.slots.ground } : {}
    }), pages = [rgb(bg), rgb(ground?.value ?? bg)], groundSlot = ground !== void 0 && visitor.after != null ? movedSlot(visitor.after, "ground", ground, pages[1]) : void 0, slots = groundSlot !== void 0 ? { ground: groundSlot } : {}, next = {
      ...slide,
      ...ground !== void 0 && ground.value !== bg ? { bg: ground.value } : {},
      frames: slide.frames.map((frame, index4) => ({
        ...frame,
        node: walkNode(frame.node, frameGround(slide.frames, index4, rgb(bg)), visitor, pages)
      }))
    };
    return visitor.after === void 0 ? next : withSlots(next, slots);
  }
  function collectDeckStyleUses(slides) {
    let cached = usesCache.get(slides);
    if (cached !== void 0)
      return cached;
    let colors = [], texts = [], visitor = {
      color: (use) => void colors.push(use),
      text: (use) => void texts.push(use),
      styles: (0, runtime2.inferDeckTypographyStyles)(slides, THEME),
      declared: noFamilies,
      keep: deckSeries(slides)
    };
    for (let slide of slides)
      walkSlide(slide, visitor);
    let uses = { colors, texts };
    return usesCache.set(slides, uses), uses;
  }
  function analyzeDeckRestyle(slides, system, memory) {
    let { colors, texts } = collectDeckStyleUses(slides);
    return (0, runtime2.analyzeDeckStyles)(colors, texts, system, memory);
  }
  function createSlideRestyler(plan, options) {
    let visitor = {
      color: (use) => (0, runtime2.restyledColor)(plan, use),
      text: (use) => (0, runtime2.restyledText)(plan, use),
      styles: (0, runtime2.inferDeckTypographyStyles)(options.slides, THEME),
      declared: options.declared,
      after: options.after,
      keep: deckSeries(options.slides)
    };
    return (slide) => {
      let next = walkSlide(slide, visitor);
      return JSON.stringify(next) === JSON.stringify(slide) ? slide : next;
    };
  }
  function restylePlanFamilies(plan) {
    let families = /* @__PURE__ */ new Map();
    for (let face of [
      ...Object.values(plan.text).map((change) => change.to.family),
      ...Object.values(plan.faces)
    ])
      face !== void 0 && face.name !== "" && families.set(face.name.toLowerCase(), face);
    return [...families.values()];
  }
  return bindRuntimeValue(runtime2, "restyleFaceOf", () => restyleFaceOf), bindRuntimeValue(runtime2, "restyleFaceFontFamily", () => restyleFaceFontFamily), bindRuntimeValue(runtime2, "collectDeckStyleUses", () => collectDeckStyleUses), bindRuntimeValue(runtime2, "analyzeDeckRestyle", () => analyzeDeckRestyle), bindRuntimeValue(runtime2, "createSlideRestyler", () => createSlideRestyler), bindRuntimeValue(runtime2, "restylePlanFamilies", () => restylePlanFamilies), () => {
    (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeStyleSchema)(), (0, runtime2.initializeHtmlCompiler)(), (0, runtime2.initializeModelGeometry)(), (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeTypographyInference)();
  };
}
export {
  installDesignSystemSlideStyles
};
