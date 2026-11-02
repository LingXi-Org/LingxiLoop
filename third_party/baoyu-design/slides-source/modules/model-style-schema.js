// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelStyleSchema(runtime2) {
  var isSlideNodeStyleKind, documentTextNodeKinds, documentBlockNodeKinds, documentTableNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideImageNodeKinds, slideIconNodeKinds, slideContainerNodeKinds, slideTableNodeKinds, slideShapeNodeKinds, concatenateNodeKinds, allStyleNodeKinds, transformableNodeKinds, typographyNodeKinds, paintEffectNodeKinds, documentStyleNodeKinds, fontStyleValues, textAlignValues, textTransformValues, textDecorationLineValues, textDecorationStyleValues, fontFamilyFallbackValues, customFontFamilyPattern, reservedFontFamilies, fontVariantNumericValues, borderStyleValues, borderSidesValues, blendModeValues, positionValues, floatValues, displayValues, visibilityValues, overflowValues, pointerEventsValues, cursorValues, easingValues, animationDirectionValues, cssFontFamilyFallbacks, lengthSchema, numberSchema, integerSchema, enumSchema, colorSchema, maxShadowCount, radialGradientExtentValues, filterComponentSchemas, transformComponentSchemas, stylePropertyNames, paintEffectProperties, animatableStyleProperties, hoverStyleProperties, nonTransformAnimationProperties, stylePropertyNameSet, paintEffectPropertySet, animatableStylePropertySet, hoverStylePropertySet, stylePropertyDefinitions, stylePropertyRegistry, transformForbiddenNodeKinds, maxCssValueLength, unsafeCssValuePattern, cssHexColorPattern, cssNamedColors, cssUnsignedNumberSource, cssOptionalWhitespaceSource, cssRequiredWhitespaceSource, legacyRgbColorPattern, modernRgbColorPattern, legacyHslColorPattern, modernHslColorPattern, isAllowedCustomFontFamily, hasOwnStyleProperty, shadowOffsetSchema, shadowBlurSchema, shadowSpreadSchema, defaultShadowBounds, filterBounds, transformBounds, gradientAngleSchema, gradientStopPositionSchema, radialGradientCenterSchema, gradientRepeatLengthSchema, minGradientStops, maxGradientStops, cssPixelSizeSchema, cssPercentSizeSchema, transitionDurationSchema, transitionDelaySchema, animationDurationSchema, animationDelaySchema, animationIterationsSchema, animationKeyframePositionSchema, minAnimationKeyframes, maxAnimationKeyframes, maxAnimationComplexity, transformTranslationCostScale, transformAngleCostScale, transformScaleCostScale, cssPixels, transitionPropertyCssNames, paintContainmentDependentProperties, paintContainmentSupported, dynamicStyleAttribute, initializeStyleSchema;
  function buildStylePropertyRegistry() {
    let registry = /* @__PURE__ */ Object.create(null);
    for (let value of stylePropertyNames) {
      let value2 = stylePropertyDefinitions[value];
      registry[value] = {
        value: value2.v,
        slidesValue: value2.slides,
        shapeValue: value2.shape,
        applies: value2.on,
        routed: value2.routed ?? [],
        effect: paintEffectPropertySet.has(value),
        hover: hoverStylePropertySet.has(value),
        animatable: animatableStylePropertySet.has(value)
      };
    }
    return registry;
  }
  function stylePropertyAppliesToNode(property, nodeKind) {
    return property === "transform" && transformForbiddenNodeKinds.includes(nodeKind) ? !1 : stylePropertyRegistry[property].applies.includes(nodeKind);
  }
  function stylePropertyValueSchema(property, nodeKind) {
    let definition = stylePropertyRegistry[property];
    return nodeKind === "slides-shape" && definition.shapeValue !== void 0 ? definition.shapeValue : nodeKind !== void 0 && definition.slidesValue !== void 0 && isSlideNodeStyleKind(nodeKind) ? definition.slidesValue : definition.value;
  }
  function sanitizeCssValue(value) {
    if (typeof value != "string")
      return;
    let trimmed = value.trim();
    if (!(trimmed.length === 0 || trimmed.length > maxCssValueLength) && !unsafeCssValuePattern.test(trimmed))
      return trimmed;
  }
  function isPlainStyleRecord(value) {
    return typeof value == "object" && value !== null && !Array.isArray(value);
  }
  function normalizeNumericStyleValue(schema, value) {
    if (typeof value != "number" || !Number.isFinite(value))
      return;
    if (schema.kind === "int") {
      let value2 = Math.round(value / schema.step) * schema.step;
      return Math.min(schema.hi, Math.max(schema.lo, value2));
    }
    let clamped = Math.min(schema.hi, Math.max(schema.lo, value));
    return schema.kind === "len" ? Math.round(clamped * 10) / 10 : Math.round(clamped * 1e4) / 1e4;
  }
  function numericStyleValueOrDefault(schema, value, fallback) {
    return value === void 0 ? fallback : normalizeNumericStyleValue(schema, value);
  }
  function normalizeEnumStyleValue(values, value) {
    if (typeof value != "string")
      return;
    let trimmed = value.trim();
    if (!(trimmed.length === 0 || trimmed.length > maxCssValueLength) && values.includes(trimmed))
      return trimmed;
  }
  function normalizeCssColor(color) {
    let sanitized = sanitizeCssValue(color);
    if (sanitized === void 0)
      return;
    let normalized = sanitized.toLowerCase();
    if (!(cssNamedColors.has(normalized) || cssHexColorPattern.test(normalized) || legacyRgbColorPattern.test(normalized) || modernRgbColorPattern.test(normalized) || legacyHslColorPattern.test(normalized) || modernHslColorPattern.test(normalized)))
      return;
    let css = globalThis.CSS;
    if (!(css !== void 0 && typeof css.supports == "function" && !css.supports("color", normalized)))
      return normalized;
  }
  function normalizeFontFamily_KR_(font) {
    let generic = normalizeEnumStyleValue(fontFamilyFallbackValues, font);
    if (generic !== void 0)
      return generic;
    if (!isPlainStyleRecord(font))
      return;
    let { family, webSafe } = font, fallback = normalizeEnumStyleValue(fontFamilyFallbackValues, font.fallback);
    if (!(!isAllowedCustomFontFamily(family) || fallback === void 0)) {
      if (webSafe === void 0)
        return {
          family,
          fallback
        };
      if (isAllowedCustomFontFamily(webSafe))
        return {
          family,
          fallback,
          webSafe
        };
    }
  }
  function numericSchemaBounds(schema) {
    return {
      min: schema.lo,
      max: schema.hi
    };
  }
  function componentSchemaBounds(components) {
    let bounds = {};
    for (let value of components)
      bounds[value.field] = numericSchemaBounds(value.cls);
    return bounds;
  }
  function shadowSchemaBounds(schema) {
    return schema?.kind === "shadow" && schema.blur !== void 0 ? {
      ...defaultShadowBounds,
      blur: numericSchemaBounds(schema.blur)
    } : defaultShadowBounds;
  }
  function normalizeShadows(shadows, allowSpread, blurSchema) {
    let values = Array.isArray(shadows) ? shadows : [shadows];
    if (values.length === 0 || values.length > 8)
      return;
    let result = [];
    for (let value of values) {
      let value2 = normalizeShadow(value, allowSpread, blurSchema);
      if (value2 === void 0)
        return;
      result.push(value2);
    }
    return result;
  }
  function normalizeShadow(shadow, allowSpread, blurSchema = shadowBlurSchema) {
    if (!isPlainStyleRecord(shadow))
      return;
    let x = numericStyleValueOrDefault(shadowOffsetSchema, shadow.x, 0), y = numericStyleValueOrDefault(shadowOffsetSchema, shadow.y, 0), blur = numericStyleValueOrDefault(blurSchema, shadow.blur, 0), color = normalizeCssColor(shadow.color);
    if (x === void 0 || y === void 0 || blur === void 0 || color === void 0)
      return;
    if (!allowSpread)
      return {
        x,
        y,
        blur,
        color
      };
    let spread = numericStyleValueOrDefault(shadowSpreadSchema, shadow.spread, 0);
    if (spread !== void 0)
      return shadow.inset === !0 ? {
        x,
        y,
        blur,
        spread,
        inset: !0,
        color
      } : {
        x,
        y,
        blur,
        spread,
        color
      };
  }
  function normalizeGradient(gradient, allowRepeating = !1) {
    if (!isPlainStyleRecord(gradient))
      return;
    let angle = numericStyleValueOrDefault(gradientAngleSchema, gradient.angle, 180);
    if (angle === void 0)
      return;
    let stops = gradient.stops;
    if (!Array.isArray(stops) || stops.length < minGradientStops || stops.length > maxGradientStops)
      return;
    let stopCount = stops.length, normalizedStops = [];
    for (let index4 = 0; index4 < stopCount; index4 += 1) {
      let value = stops[index4];
      if (!isPlainStyleRecord(value))
        return;
      let value2 = normalizeCssColor(value.color), value3 = numericStyleValueOrDefault(gradientStopPositionSchema, value.pos, index4 / (stopCount - 1) * 100);
      if (value2 === void 0 || value3 === void 0)
        return;
      normalizedStops.push({
        color: value2,
        pos: value3
      });
    }
    normalizedStops.sort((input, options) => input.pos - options.pos);
    let hasRepeat = allowRepeating && gradient.repeat !== void 0, repeat = hasRepeat ? normalizeNumericStyleValue(gradientRepeatLengthSchema, gradient.repeat) : void 0;
    if (hasRepeat && repeat === void 0)
      return;
    let lastStop = normalizedStops[stopCount - 1];
    repeat !== void 0 && gradient.radial !== !0 && lastStop.pos < 100 && (stopCount < maxGradientStops ? normalizedStops.push({
      color: lastStop.color,
      pos: 100
    }) : normalizedStops[stopCount - 1] = {
      color: lastStop.color,
      pos: 100
    });
    let at;
    if (isPlainStyleRecord(gradient.at)) {
      let value = normalizeNumericStyleValue(radialGradientCenterSchema, gradient.at.x), value2 = normalizeNumericStyleValue(radialGradientCenterSchema, gradient.at.y);
      value !== void 0 && value2 !== void 0 && (value !== 50 || value2 !== 50) && (at = {
        x: value,
        y: value2
      });
    }
    let extent = radialGradientExtentValues.includes(gradient.extent) ? gradient.extent : void 0;
    return {
      angle,
      ...gradient.radial === !0 ? {
        radial: !0
      } : {},
      ...gradient.shape === "ellipse" ? {
        shape: "ellipse"
      } : {},
      ...extent !== void 0 ? {
        extent
      } : {},
      ...at !== void 0 ? {
        at
      } : {},
      ...repeat !== void 0 ? {
        repeat
      } : {},
      stops: normalizedStops
    };
  }
  function radialGradientPrelude(gradient) {
    let extent = radialGradientExtentValues.find((input) => input === gradient.extent), center = gradient.at, position = isPlainStyleRecord(center) && typeof center.x == "number" && typeof center.y == "number" && Number.isFinite(center.x) && Number.isFinite(center.y) ? `at ${center.x}% ${center.y}%` : void 0;
    return [
      gradient.shape === "ellipse" ? "ellipse" : "circle",
      extent,
      position
    ].filter((input) => input !== void 0).join(" ");
  }
  function radialGradientPrefix(gradient) {
    let value = radialGradientPrelude(gradient);
    return value === "ellipse" ? "radial-gradient(" : "radial-gradient(" + value + ", ";
  }
  function normalizeStyleComponents(components, values) {
    if (!isPlainStyleRecord(values))
      return;
    let result = /* @__PURE__ */ Object.create(null), fieldCount = 0;
    for (let value of components) {
      if (!hasOwnStyleProperty(values, value.field))
        continue;
      let value2 = normalizeNumericStyleValue(value.cls, values[value.field]);
      if (value2 === void 0)
        return;
      result[value.field] = value2, fieldCount += 1;
    }
    if (fieldCount > 0)
      return result;
  }
  function normalizeCssSize(size4) {
    if (!isPlainStyleRecord(size4))
      return;
    let hasPixels = hasOwnStyleProperty(size4, "px"), hasPercent = hasOwnStyleProperty(size4, "pct");
    if (hasPixels === hasPercent)
      return;
    if (hasPixels) {
      let value2 = normalizeNumericStyleValue(cssPixelSizeSchema, size4.px);
      return value2 === void 0 ? void 0 : {
        px: value2
      };
    }
    let value = normalizeNumericStyleValue(cssPercentSizeSchema, size4.pct);
    if (value !== void 0)
      return {
        pct: value
      };
  }
  function normalizeTransition(transition) {
    if (!isPlainStyleRecord(transition))
      return;
    let value, properties = transition.properties;
    if (properties === void 0 || properties === "all")
      value = [...animatableStyleProperties];
    else {
      let value5 = Array.isArray(properties) ? properties : [properties];
      if (value5.length === 0 || value5.length > animatableStyleProperties.length)
        return;
      let items = [];
      for (let value6 of value5) {
        let value7 = normalizeEnumStyleValue(animatableStyleProperties, value6);
        if (value7 === void 0)
          return;
        items.includes(value7) || items.push(value7);
      }
      value = items;
    }
    let value2 = numericStyleValueOrDefault(transitionDurationSchema, transition.duration, 200), value3 = numericStyleValueOrDefault(transitionDelaySchema, transition.delay, 0), value4 = transition.easing === void 0 ? "ease" : normalizeEnumStyleValue(easingValues, transition.easing);
    if (!(value2 === void 0 || value3 === void 0 || value4 === void 0))
      return {
        properties: value,
        duration: value2,
        delay: value3,
        easing: value4
      };
  }
  function normalizeStylePropertyValue(property, value, nodeKind) {
    let value2 = stylePropertyValueSchema(property, nodeKind);
    switch (value2.kind) {
      case "len":
      case "num":
      case "int":
        return normalizeNumericStyleValue(value2, value);
      case "enum":
        return normalizeEnumStyleValue(value2.values, value);
      case "color":
        return normalizeCssColor(value);
      case "fontFamily":
        return normalizeFontFamily_KR_(value);
      case "shadow":
        return normalizeShadows(value, value2.spread, value2.blur);
      case "gradient":
        return normalizeGradient(value, value2.repeat === !0);
      case "filter":
        return normalizeStyleComponents(filterComponentSchemas, value);
      case "transform":
        return normalizeStyleComponents(transformComponentSchemas, value);
      case "size":
        return normalizeCssSize(value);
      case "transition":
        return normalizeTransition(value);
      case "animation":
        return;
    }
  }
  function animationPaintComplexity(animation) {
    let items = [], items2 = [];
    for (let value5 of animation.keyframes) {
      let style = value5.style;
      nonTransformAnimationProperties.some((input) => style[input] !== void 0) && items.push(value5.at), style.transform !== void 0 && items2.push({
        at: value5.at,
        t: style.transform
      });
    }
    let value = animation.iterations === "infinite" || animation.iterations > 1, value2 = value && animation.direction !== "alternate";
    if (value && transformAnimationExceedsBudget(items2, value2)) {
      for (let value5 of items2)
        items.includes(value5.at) || items.push(value5.at);
      items.sort((input, options) => input - options);
    }
    if (items.length === 0)
      return !0;
    if (value && animation.delay > 0)
      return !1;
    items[0] !== 0 && items.unshift(0), items[items.length - 1] !== 100 && items.push(100);
    let value3 = items.length - 1;
    if (value2 && (value3 += 1), animation.duration / value3 < maxAnimationComplexity)
      return !1;
    let value4;
    for (let value5 of items) {
      if (value4 !== void 0 && (value5 - value4) / 100 * animation.duration < maxAnimationComplexity)
        return !1;
      value4 = value5;
    }
    return !0;
  }
  function transformComponentsForComplexity(transform) {
    if (!isPlainStyleRecord(transform))
      return;
    let callback = (input, options) => {
      if (input === void 0)
        return options;
      if (typeof input == "number")
        return Number.isFinite(input) ? input : void 0;
      if (typeof input == "string" && /^-?\d+(?:\.\d+)?(?:px)?$/.test(input.trim()))
        return Number.parseFloat(input);
    }, value = callback(transform.translateX, 0), value2 = callback(transform.translateY, 0), value3 = callback(transform.scale, 1);
    if (value === void 0 || value2 === void 0 || value3 === void 0)
      return;
    let value4 = callback(transform.scaleX, value3), value5 = callback(transform.scaleY, value3), value6 = callback(transform.rotate, 0), value7 = callback(transform.skewX, 0), value8 = callback(transform.skewY, 0);
    if (!(value4 === void 0 || value5 === void 0 || value6 === void 0 || value7 === void 0 || value8 === void 0))
      return {
        tx: value,
        ty: value2,
        sx: value4,
        sy: value5,
        rot: value6,
        skx: value7,
        sky: value8
      };
  }
  function logarithmicScaleDistance(scale, otherScale) {
    return scale === otherScale ? 0 : scale <= 0 || otherScale <= 0 ? Number.POSITIVE_INFINITY : Math.abs(Math.log(scale) - Math.log(otherScale));
  }
  function transformComplexityDistance(transform, otherTransform) {
    return Math.hypot(transform.tx - otherTransform.tx, transform.ty - otherTransform.ty) / transformTranslationCostScale + Math.abs(transform.rot - otherTransform.rot) / transformAngleCostScale + (Math.abs(transform.skx - otherTransform.skx) + Math.abs(transform.sky - otherTransform.sky)) / transformAngleCostScale + (logarithmicScaleDistance(transform.sx, otherTransform.sx) + logarithmicScaleDistance(transform.sy, otherTransform.sy)) / transformScaleCostScale;
  }
  function transformAnimationExceedsBudget(keyframes, maximumComplexity) {
    if (keyframes.length === 0)
      return !1;
    if (keyframes[0].at !== 0 || keyframes[keyframes.length - 1].at !== 100)
      return !0;
    let items = [];
    for (let value of keyframes) {
      let value2 = transformComponentsForComplexity(value.t);
      if (value2 === void 0)
        return !0;
      items.push(value2);
    }
    let index4 = 0;
    for (let count = 1; count < items.length; count += 1)
      if (index4 += transformComplexityDistance(items[count - 1], items[count]), index4 >= 1)
        return !0;
    return maximumComplexity && index4 + transformComplexityDistance(items[items.length - 1], items[0]) >= 1;
  }
  function normalizeAnimationStyle(style, allowsProperty, nodeKind) {
    if (style === void 0)
      return {
        dropped: 0
      };
    if (!isPlainStyleRecord(style))
      return {
        dropped: 1
      };
    let value = /* @__PURE__ */ Object.create(null), index4 = 0, index22 = 0;
    for (let value2 of animatableStyleProperties) {
      if (!hasOwnStyleProperty(style, value2))
        continue;
      if (!allowsProperty(value2)) {
        index4 += 1;
        continue;
      }
      let value3 = normalizeStylePropertyValue(value2, style[value2], nodeKind);
      if (value3 === void 0 || value2 === "boxShadow" && value3.length !== 1) {
        index4 += 1;
        continue;
      }
      value[value2] = value3, index22 += 1;
    }
    return {
      bag: index22 > 0 ? value : void 0,
      dropped: index4
    };
  }
  function normalizeStyleAnimation(animation, allowsProperty, nodeKind) {
    if (animation === void 0)
      return {
        dropped: 0
      };
    if (!isPlainStyleRecord(animation))
      return {
        dropped: 1
      };
    let keyframes = animation.keyframes;
    if (!Array.isArray(keyframes) || keyframes.length < minAnimationKeyframes || keyframes.length > maxAnimationKeyframes)
      return {
        dropped: 1
      };
    let index4 = 0, items = [];
    for (let value6 of keyframes) {
      if (!isPlainStyleRecord(value6))
        return {
          dropped: index4 + 1
        };
      let value7 = normalizeNumericStyleValue(animationKeyframePositionSchema, value6.at);
      if (value7 === void 0)
        return {
          dropped: index4 + 1
        };
      let value8 = normalizeAnimationStyle(value6.style, allowsProperty, nodeKind);
      index4 += value8.dropped, items.push({
        at: value7,
        style: value8.bag ?? /* @__PURE__ */ Object.create(null)
      });
    }
    items.sort((input, options) => input.at - options.at);
    let value = numericStyleValueOrDefault(animationDurationSchema, animation.duration, 1e3), value2 = numericStyleValueOrDefault(animationDelaySchema, animation.delay, 0), value3;
    animation.iterations === void 0 ? value3 = 1 : animation.iterations === "infinite" ? value3 = "infinite" : value3 = normalizeNumericStyleValue(animationIterationsSchema, animation.iterations);
    let value4 = animation.direction === void 0 ? "normal" : normalizeEnumStyleValue(animationDirectionValues, animation.direction), value5 = animation.easing === void 0 ? "ease" : normalizeEnumStyleValue(easingValues, animation.easing);
    if (value === void 0 || value2 === void 0 || value3 === void 0 || value4 === void 0 || value5 === void 0)
      return {
        dropped: index4 + 1
      };
    let state = {
      keyframes: items,
      duration: value,
      delay: value2,
      iterations: value3,
      direction: value4,
      easing: value5
    };
    return animationPaintComplexity(state) ? {
      value: state,
      dropped: index4
    } : {
      dropped: index4 + 1
    };
  }
  function normalizeHoverStyle(hover, nodeKind) {
    if (!isPlainStyleRecord(hover))
      return {
        dropped: 1
      };
    let value = /* @__PURE__ */ Object.create(null), index4 = 0, index22 = 0;
    for (let value2 of hoverStyleProperties) {
      if (!hasOwnStyleProperty(hover, value2))
        continue;
      if (!stylePropertyAppliesToNode(value2, nodeKind)) {
        index4 += 1;
        continue;
      }
      let value3 = normalizeStylePropertyValue(value2, hover[value2], nodeKind);
      if (value3 === void 0) {
        index4 += 1;
        continue;
      }
      value[value2] = value3, index22 += 1;
    }
    for (let value2 of Object.keys(hover))
      hoverStylePropertySet.has(value2) || (index4 += 1);
    return {
      bag: index22 > 0 ? value : void 0,
      dropped: index4
    };
  }
  function normalizeStyleBag(style, nodeKind) {
    if (style === void 0)
      return {
        dropped: 0
      };
    if (!isPlainStyleRecord(style))
      return {
        dropped: 1
      };
    let bag = /* @__PURE__ */ Object.create(null), dropped = 0, kept = 0;
    for (let value of stylePropertyNames) {
      if (!hasOwnStyleProperty(style, value))
        continue;
      if (!stylePropertyAppliesToNode(value, nodeKind)) {
        dropped += 1;
        continue;
      }
      if (value === "animation") {
        let value3 = normalizeStyleAnimation(style[value], (input) => stylePropertyAppliesToNode(input, nodeKind), nodeKind);
        dropped += value3.dropped, value3.value !== void 0 && (bag[value] = value3.value, kept += 1);
        continue;
      }
      let value2 = normalizeStylePropertyValue(value, style[value], nodeKind);
      if (value2 === void 0) {
        dropped += 1;
        continue;
      }
      bag[value] = value2, kept += 1;
    }
    if (hasOwnStyleProperty(style, "hover")) {
      let value = normalizeHoverStyle(style.hover, nodeKind);
      dropped += value.dropped, value.bag !== void 0 && (bag.hover = value.bag, kept += 1);
    }
    for (let value of Object.keys(style))
      value === "hover" || stylePropertyNameSet.has(value) || (dropped += 1);
    return {
      bag: kept > 0 ? bag : void 0,
      dropped
    };
  }
  function shadowsToCss(shadows, allowSpread) {
    return shadows.map((input) => allowSpread ? `${input.inset === !0 ? "inset " : ""}${cssPixels(input.x)} ${cssPixels(input.y)} ${cssPixels(input.blur)} ${cssPixels(input.spread ?? 0)} ${input.color}` : `${cssPixels(input.x)} ${cssPixels(input.y)} ${cssPixels(input.blur)} ${input.color}`).join(", ");
  }
  function gradientToCss(gradient) {
    if (gradient.repeat !== void 0 && gradient.radial !== !0) {
      let callback = (input) => `${Math.round(input / 100 * gradient.repeat * 100) / 100}px`, value2 = gradient.stops.map((input) => `${input.color} ${callback(input.pos)}`).join(", ");
      return `repeating-linear-gradient(${gradient.angle}deg, ${value2})`;
    }
    let value = gradient.stops.map((input) => `${input.color} ${input.pos}%`).join(", ");
    return gradient.radial === !0 ? `${radialGradientPrefix(gradient)}${value})` : `linear-gradient(${gradient.angle}deg, ${value})`;
  }
  function filterToCss(filter) {
    let items = [];
    for (let value of filterComponentSchemas) {
      let value2 = filter[value.field];
      value2 !== void 0 && items.push(`${value.fn}(${value2}${value.unit})`);
    }
    return items.length > 0 ? items.join(" ") : "none";
  }
  function transformToCss(transform) {
    let items = [];
    return (transform.translateX !== void 0 || transform.translateY !== void 0) && items.push(`translate(${cssPixels(transform.translateX ?? 0)}, ${cssPixels(transform.translateY ?? 0)})`), transform.rotate !== void 0 && items.push(`rotate(${transform.rotate}deg)`), transform.scale !== void 0 && items.push(`scale(${transform.scale})`), (transform.skewX !== void 0 || transform.skewY !== void 0) && items.push(`skew(${transform.skewX ?? 0}deg, ${transform.skewY ?? 0}deg)`), items.length > 0 ? items.join(" ") : "none";
  }
  function cssSizeToString(size4) {
    return "px" in size4 ? cssPixels(size4.px) : `${size4.pct}%`;
  }
  function transitionToCss(transition) {
    return transition.properties.map((input) => `${transitionPropertyCssNames[input]} ${transition.duration}ms ${transition.easing} ${transition.delay}ms`).join(", ");
  }
  function writeCssStyleProperty(css, property, value) {
    switch (property) {
      case "fontSize":
      case "letterSpacing":
      case "marginTop":
      case "marginRight":
      case "marginBottom":
      case "marginLeft":
      case "paddingTop":
      case "paddingRight":
      case "paddingBottom":
      case "paddingLeft":
      case "borderWidth":
      case "borderRadius":
      case "top":
      case "right":
      case "bottom":
      case "left":
        css[property] = cssPixels(value);
        return;
      case "fontWeight":
      case "lineHeight":
      case "opacity":
      case "zIndex":
        css[property] = value;
        return;
      case "fontFamily": {
        let value2 = value;
        css.fontFamily = typeof value2 == "string" ? cssFontFamilyFallbacks[value2] : '"' + value2.family + '", ' + (value2.webSafe !== void 0 ? '"' + value2.webSafe + '", ' : "") + cssFontFamilyFallbacks[value2.fallback];
        return;
      }
      case "backgroundGradient":
        css.backgroundImage = gradientToCss(value);
        return;
      case "boxShadow":
        css.boxShadow = shadowsToCss(value, !0);
        return;
      case "textShadow":
        css.textShadow = shadowsToCss(value, !1);
        return;
      case "filter":
        css.filter = filterToCss(value);
        return;
      case "backdropFilter": {
        let value2 = filterToCss(value);
        css.backdropFilter = value2, css.WebkitBackdropFilter = value2;
        return;
      }
      case "textStrokeWidth":
        css.WebkitTextStrokeWidth = cssPixels(value), css.paintOrder = "stroke";
        return;
      case "textStrokeColor":
        css.WebkitTextStrokeColor = value;
        return;
      case "borderSides": {
        let value2 = css.borderWidth ?? "medium", value3 = " " + value + " ";
        css.borderWidth = ["top", "right", "bottom", "left"].map((input) => value3.includes(" " + input + " ") ? value2 : "0").join(" ");
        return;
      }
      case "borderTopWidth":
      case "borderRightWidth":
      case "borderBottomWidth":
      case "borderLeftWidth": {
        let value2 = (css.borderWidth === void 0 ? ["0"] : String(css.borderWidth).split(" ")).map((input) => input === "medium" ? "0" : input), value3 = value2.length === 4 ? value2 : [value2[0], value2[0], value2[0], value2[0]];
        value3[{
          borderTopWidth: 0,
          borderRightWidth: 1,
          borderBottomWidth: 2,
          borderLeftWidth: 3
        }[property]] = cssPixels(value), css.borderWidth = value3.join(" ");
        return;
      }
      case "borderTopLeftRadius":
      case "borderTopRightRadius":
      case "borderBottomRightRadius":
      case "borderBottomLeftRadius": {
        let value2 = css.borderRadius === void 0 ? ["0"] : String(css.borderRadius).split(" "), value3 = value2.length === 4 ? value2 : [value2[0], value2[0], value2[0], value2[0]];
        value3[{
          borderTopLeftRadius: 0,
          borderTopRightRadius: 1,
          borderBottomRightRadius: 2,
          borderBottomLeftRadius: 3
        }[property]] = cssPixels(value), css.borderRadius = value3.join(" ");
        return;
      }
      case "transform":
        css.transform = transformToCss(value);
        return;
      case "width":
      case "height":
      case "minWidth":
      case "minHeight":
      case "maxWidth":
      case "maxHeight":
        css[property] = cssSizeToString(value);
        return;
      case "transition":
        css.transition = transitionToCss(value);
        return;
      case "animation":
        return;
      default:
        css[property] = value;
        return;
    }
  }
  function supportsPaintContainment() {
    let CSS2 = globalThis.CSS;
    return CSS2 === void 0 || typeof CSS2.supports != "function" ? !0 : (paintContainmentSupported ??= CSS2.supports("contain", "paint"), paintContainmentSupported);
  }
  function styleBagToCss(style, nodeKind) {
    let css = {}, bag = style;
    for (let value of stylePropertyNames) {
      if (value === "animation" || !hasOwnStyleProperty(bag, value) || !stylePropertyAppliesToNode(value, nodeKind) || paintContainmentDependentProperties.includes(value) && !supportsPaintContainment())
        continue;
      let value2 = normalizeStylePropertyValue(value, bag[value], nodeKind);
      value2 !== void 0 && writeCssStyleProperty(css, value, value2);
    }
    return css;
  }
  function hoverStyleToCss(style, nodeKind) {
    let hover = style.hover;
    if (!isPlainStyleRecord(hover))
      return;
    let css = {};
    for (let value of hoverStyleProperties) {
      if (!hasOwnStyleProperty(hover, value) || nodeKind !== void 0 && !stylePropertyAppliesToNode(value, nodeKind))
        continue;
      let value2 = normalizeStylePropertyValue(value, hover[value], nodeKind);
      value2 !== void 0 && writeCssStyleProperty(css, value, value2);
    }
    if (Object.keys(css).length > 0)
      return css;
  }
  function styleAnimationToKeyframes(style, nodeKind) {
    let allowsProperty = nodeKind === void 0 ? () => !0 : (input) => stylePropertyAppliesToNode(input, nodeKind), animation = normalizeStyleAnimation(style.animation, allowsProperty, nodeKind).value;
    if (animation === void 0)
      return;
    let keyframes = [];
    for (let value of animation.keyframes) {
      let state2 = {
        offset: value.at / 100
      }, style2 = value.style;
      for (let value2 of animatableStyleProperties)
        hasOwnStyleProperty(style2, value2) && writeCssStyleProperty(state2, value2, style2[value2]);
      keyframes.push(state2);
    }
    let state = {
      duration: animation.duration,
      delay: animation.delay,
      iterations: animation.iterations === "infinite" ? Number.POSITIVE_INFINITY : animation.iterations,
      direction: animation.direction,
      easing: animation.easing
    };
    return {
      keyframes,
      options: state
    };
  }
  function hasPaintEffects(style) {
    let value = style;
    if (value.animation !== void 0)
      return !0;
    let value2 = isPlainStyleRecord(value.hover) ? value.hover : void 0;
    for (let value3 of paintEffectProperties)
      if (value[value3] !== void 0 || value2 !== void 0 && value2[value3] !== void 0)
        return !0;
    return !1;
  }
  function paintEffectCost(style) {
    if (!hasPaintEffects(style))
      return 0;
    let value = style, value2 = isPlainStyleRecord(value.hover) ? value.hover : void 0, index4 = 0;
    for (let value3 of ["boxShadow", "textShadow"])
      for (let value4 of [value[value3], value2?.[value3]])
        Array.isArray(value4) && value4.length > 1 && (index4 += value4.length - 1);
    return 1 + index4;
  }
  return bindRuntimeValue(runtime2, "buildStylePropertyRegistry", () => buildStylePropertyRegistry), bindRuntimeValue(runtime2, "stylePropertyAppliesToNode", () => stylePropertyAppliesToNode), bindRuntimeValue(runtime2, "stylePropertyValueSchema", () => stylePropertyValueSchema), bindRuntimeValue(runtime2, "sanitizeCssValue", () => sanitizeCssValue), bindRuntimeValue(runtime2, "isPlainStyleRecord", () => isPlainStyleRecord), bindRuntimeValue(runtime2, "normalizeNumericStyleValue", () => normalizeNumericStyleValue), bindRuntimeValue(runtime2, "numericStyleValueOrDefault", () => numericStyleValueOrDefault), bindRuntimeValue(runtime2, "normalizeEnumStyleValue", () => normalizeEnumStyleValue), bindRuntimeValue(runtime2, "normalizeCssColor", () => normalizeCssColor), bindRuntimeValue(runtime2, "normalizeFontFamily_KR_", () => normalizeFontFamily_KR_), bindRuntimeValue(runtime2, "numericSchemaBounds", () => numericSchemaBounds), bindRuntimeValue(runtime2, "componentSchemaBounds", () => componentSchemaBounds), bindRuntimeValue(runtime2, "shadowSchemaBounds", () => shadowSchemaBounds), bindRuntimeValue(runtime2, "normalizeShadows", () => normalizeShadows), bindRuntimeValue(runtime2, "normalizeShadow", () => normalizeShadow), bindRuntimeValue(runtime2, "normalizeGradient", () => normalizeGradient), bindRuntimeValue(runtime2, "radialGradientPrelude", () => radialGradientPrelude), bindRuntimeValue(runtime2, "radialGradientPrefix", () => radialGradientPrefix), bindRuntimeValue(runtime2, "normalizeStyleComponents", () => normalizeStyleComponents), bindRuntimeValue(runtime2, "normalizeCssSize", () => normalizeCssSize), bindRuntimeValue(runtime2, "normalizeTransition", () => normalizeTransition), bindRuntimeValue(runtime2, "normalizeStylePropertyValue", () => normalizeStylePropertyValue), bindRuntimeValue(runtime2, "animationPaintComplexity", () => animationPaintComplexity), bindRuntimeValue(runtime2, "transformComponentsForComplexity", () => transformComponentsForComplexity), bindRuntimeValue(runtime2, "logarithmicScaleDistance", () => logarithmicScaleDistance), bindRuntimeValue(runtime2, "transformComplexityDistance", () => transformComplexityDistance), bindRuntimeValue(runtime2, "transformAnimationExceedsBudget", () => transformAnimationExceedsBudget), bindRuntimeValue(runtime2, "normalizeAnimationStyle", () => normalizeAnimationStyle), bindRuntimeValue(runtime2, "normalizeStyleAnimation", () => normalizeStyleAnimation), bindRuntimeValue(runtime2, "normalizeHoverStyle", () => normalizeHoverStyle), bindRuntimeValue(runtime2, "normalizeStyleBag", () => normalizeStyleBag), bindRuntimeValue(runtime2, "shadowsToCss", () => shadowsToCss), bindRuntimeValue(runtime2, "gradientToCss", () => gradientToCss), bindRuntimeValue(runtime2, "filterToCss", () => filterToCss), bindRuntimeValue(runtime2, "transformToCss", () => transformToCss), bindRuntimeValue(runtime2, "cssSizeToString", () => cssSizeToString), bindRuntimeValue(runtime2, "transitionToCss", () => transitionToCss), bindRuntimeValue(runtime2, "writeCssStyleProperty", () => writeCssStyleProperty), bindRuntimeValue(runtime2, "supportsPaintContainment", () => supportsPaintContainment), bindRuntimeValue(runtime2, "styleBagToCss", () => styleBagToCss), bindRuntimeValue(runtime2, "hoverStyleToCss", () => hoverStyleToCss), bindRuntimeValue(runtime2, "styleAnimationToKeyframes", () => styleAnimationToKeyframes), bindRuntimeValue(runtime2, "hasPaintEffects", () => hasPaintEffects), bindRuntimeValue(runtime2, "paintEffectCost", () => paintEffectCost), bindRuntimeValue(runtime2, "isSlideNodeStyleKind", () => isSlideNodeStyleKind, (value) => {
    isSlideNodeStyleKind = value;
  }), bindRuntimeValue(runtime2, "documentTextNodeKinds", () => documentTextNodeKinds, (value) => {
    documentTextNodeKinds = value;
  }), bindRuntimeValue(runtime2, "documentBlockNodeKinds", () => documentBlockNodeKinds, (value) => {
    documentBlockNodeKinds = value;
  }), bindRuntimeValue(runtime2, "documentTableNodeKinds", () => documentTableNodeKinds, (value) => {
    documentTableNodeKinds = value;
  }), bindRuntimeValue(runtime2, "documentTableCellNodeKinds", () => documentTableCellNodeKinds, (value) => {
    documentTableCellNodeKinds = value;
  }), bindRuntimeValue(runtime2, "slideTextNodeKinds", () => slideTextNodeKinds, (value) => {
    slideTextNodeKinds = value;
  }), bindRuntimeValue(runtime2, "slideImageNodeKinds", () => slideImageNodeKinds, (value) => {
    slideImageNodeKinds = value;
  }), bindRuntimeValue(runtime2, "slideIconNodeKinds", () => slideIconNodeKinds, (value) => {
    slideIconNodeKinds = value;
  }), bindRuntimeValue(runtime2, "slideContainerNodeKinds", () => slideContainerNodeKinds, (value) => {
    slideContainerNodeKinds = value;
  }), bindRuntimeValue(runtime2, "slideTableNodeKinds", () => slideTableNodeKinds, (value) => {
    slideTableNodeKinds = value;
  }), bindRuntimeValue(runtime2, "slideShapeNodeKinds", () => slideShapeNodeKinds, (value) => {
    slideShapeNodeKinds = value;
  }), bindRuntimeValue(runtime2, "concatenateNodeKinds", () => concatenateNodeKinds, (value) => {
    concatenateNodeKinds = value;
  }), bindRuntimeValue(runtime2, "allStyleNodeKinds", () => allStyleNodeKinds, (value) => {
    allStyleNodeKinds = value;
  }), bindRuntimeValue(runtime2, "transformableNodeKinds", () => transformableNodeKinds, (value) => {
    transformableNodeKinds = value;
  }), bindRuntimeValue(runtime2, "typographyNodeKinds", () => typographyNodeKinds, (value) => {
    typographyNodeKinds = value;
  }), bindRuntimeValue(runtime2, "paintEffectNodeKinds", () => paintEffectNodeKinds, (value) => {
    paintEffectNodeKinds = value;
  }), bindRuntimeValue(runtime2, "documentStyleNodeKinds", () => documentStyleNodeKinds, (value) => {
    documentStyleNodeKinds = value;
  }), bindRuntimeValue(runtime2, "fontStyleValues", () => fontStyleValues, (value) => {
    fontStyleValues = value;
  }), bindRuntimeValue(runtime2, "textAlignValues", () => textAlignValues, (value) => {
    textAlignValues = value;
  }), bindRuntimeValue(runtime2, "textTransformValues", () => textTransformValues, (value) => {
    textTransformValues = value;
  }), bindRuntimeValue(runtime2, "textDecorationLineValues", () => textDecorationLineValues, (value) => {
    textDecorationLineValues = value;
  }), bindRuntimeValue(runtime2, "textDecorationStyleValues", () => textDecorationStyleValues, (value) => {
    textDecorationStyleValues = value;
  }), bindRuntimeValue(runtime2, "fontFamilyFallbackValues", () => fontFamilyFallbackValues, (value) => {
    fontFamilyFallbackValues = value;
  }), bindRuntimeValue(runtime2, "customFontFamilyPattern", () => customFontFamilyPattern, (value) => {
    customFontFamilyPattern = value;
  }), bindRuntimeValue(runtime2, "reservedFontFamilies", () => reservedFontFamilies, (value) => {
    reservedFontFamilies = value;
  }), bindRuntimeValue(runtime2, "fontVariantNumericValues", () => fontVariantNumericValues, (value) => {
    fontVariantNumericValues = value;
  }), bindRuntimeValue(runtime2, "borderStyleValues", () => borderStyleValues, (value) => {
    borderStyleValues = value;
  }), bindRuntimeValue(runtime2, "borderSidesValues", () => borderSidesValues, (value) => {
    borderSidesValues = value;
  }), bindRuntimeValue(runtime2, "blendModeValues", () => blendModeValues, (value) => {
    blendModeValues = value;
  }), bindRuntimeValue(runtime2, "positionValues", () => positionValues, (value) => {
    positionValues = value;
  }), bindRuntimeValue(runtime2, "floatValues", () => floatValues, (value) => {
    floatValues = value;
  }), bindRuntimeValue(runtime2, "displayValues", () => displayValues, (value) => {
    displayValues = value;
  }), bindRuntimeValue(runtime2, "visibilityValues", () => visibilityValues, (value) => {
    visibilityValues = value;
  }), bindRuntimeValue(runtime2, "overflowValues", () => overflowValues, (value) => {
    overflowValues = value;
  }), bindRuntimeValue(runtime2, "pointerEventsValues", () => pointerEventsValues, (value) => {
    pointerEventsValues = value;
  }), bindRuntimeValue(runtime2, "cursorValues", () => cursorValues, (value) => {
    cursorValues = value;
  }), bindRuntimeValue(runtime2, "easingValues", () => easingValues, (value) => {
    easingValues = value;
  }), bindRuntimeValue(runtime2, "animationDirectionValues", () => animationDirectionValues, (value) => {
    animationDirectionValues = value;
  }), bindRuntimeValue(runtime2, "cssFontFamilyFallbacks", () => cssFontFamilyFallbacks, (value) => {
    cssFontFamilyFallbacks = value;
  }), bindRuntimeValue(runtime2, "lengthSchema", () => lengthSchema, (value) => {
    lengthSchema = value;
  }), bindRuntimeValue(runtime2, "numberSchema", () => numberSchema, (value) => {
    numberSchema = value;
  }), bindRuntimeValue(runtime2, "integerSchema", () => integerSchema, (value) => {
    integerSchema = value;
  }), bindRuntimeValue(runtime2, "enumSchema", () => enumSchema, (value) => {
    enumSchema = value;
  }), bindRuntimeValue(runtime2, "colorSchema", () => colorSchema, (value) => {
    colorSchema = value;
  }), bindRuntimeValue(runtime2, "maxShadowCount", () => maxShadowCount, (value) => {
    maxShadowCount = value;
  }), bindRuntimeValue(runtime2, "radialGradientExtentValues", () => radialGradientExtentValues, (value) => {
    radialGradientExtentValues = value;
  }), bindRuntimeValue(runtime2, "filterComponentSchemas", () => filterComponentSchemas, (value) => {
    filterComponentSchemas = value;
  }), bindRuntimeValue(runtime2, "transformComponentSchemas", () => transformComponentSchemas, (value) => {
    transformComponentSchemas = value;
  }), bindRuntimeValue(runtime2, "stylePropertyNames", () => stylePropertyNames, (value) => {
    stylePropertyNames = value;
  }), bindRuntimeValue(runtime2, "paintEffectProperties", () => paintEffectProperties, (value) => {
    paintEffectProperties = value;
  }), bindRuntimeValue(runtime2, "animatableStyleProperties", () => animatableStyleProperties, (value) => {
    animatableStyleProperties = value;
  }), bindRuntimeValue(runtime2, "hoverStyleProperties", () => hoverStyleProperties, (value) => {
    hoverStyleProperties = value;
  }), bindRuntimeValue(runtime2, "nonTransformAnimationProperties", () => nonTransformAnimationProperties, (value) => {
    nonTransformAnimationProperties = value;
  }), bindRuntimeValue(runtime2, "stylePropertyNameSet", () => stylePropertyNameSet, (value) => {
    stylePropertyNameSet = value;
  }), bindRuntimeValue(runtime2, "paintEffectPropertySet", () => paintEffectPropertySet, (value) => {
    paintEffectPropertySet = value;
  }), bindRuntimeValue(runtime2, "animatableStylePropertySet", () => animatableStylePropertySet, (value) => {
    animatableStylePropertySet = value;
  }), bindRuntimeValue(runtime2, "hoverStylePropertySet", () => hoverStylePropertySet, (value) => {
    hoverStylePropertySet = value;
  }), bindRuntimeValue(runtime2, "stylePropertyDefinitions", () => stylePropertyDefinitions, (value) => {
    stylePropertyDefinitions = value;
  }), bindRuntimeValue(runtime2, "stylePropertyRegistry", () => stylePropertyRegistry, (value) => {
    stylePropertyRegistry = value;
  }), bindRuntimeValue(runtime2, "transformForbiddenNodeKinds", () => transformForbiddenNodeKinds, (value) => {
    transformForbiddenNodeKinds = value;
  }), bindRuntimeValue(runtime2, "maxCssValueLength", () => maxCssValueLength, (value) => {
    maxCssValueLength = value;
  }), bindRuntimeValue(runtime2, "unsafeCssValuePattern", () => unsafeCssValuePattern, (value) => {
    unsafeCssValuePattern = value;
  }), bindRuntimeValue(runtime2, "cssHexColorPattern", () => cssHexColorPattern, (value) => {
    cssHexColorPattern = value;
  }), bindRuntimeValue(runtime2, "cssNamedColors", () => cssNamedColors, (value) => {
    cssNamedColors = value;
  }), bindRuntimeValue(runtime2, "cssUnsignedNumberSource", () => cssUnsignedNumberSource, (value) => {
    cssUnsignedNumberSource = value;
  }), bindRuntimeValue(runtime2, "cssOptionalWhitespaceSource", () => cssOptionalWhitespaceSource, (value) => {
    cssOptionalWhitespaceSource = value;
  }), bindRuntimeValue(runtime2, "cssRequiredWhitespaceSource", () => cssRequiredWhitespaceSource, (value) => {
    cssRequiredWhitespaceSource = value;
  }), bindRuntimeValue(runtime2, "legacyRgbColorPattern", () => legacyRgbColorPattern, (value) => {
    legacyRgbColorPattern = value;
  }), bindRuntimeValue(runtime2, "modernRgbColorPattern", () => modernRgbColorPattern, (value) => {
    modernRgbColorPattern = value;
  }), bindRuntimeValue(runtime2, "legacyHslColorPattern", () => legacyHslColorPattern, (value) => {
    legacyHslColorPattern = value;
  }), bindRuntimeValue(runtime2, "modernHslColorPattern", () => modernHslColorPattern, (value) => {
    modernHslColorPattern = value;
  }), bindRuntimeValue(runtime2, "isAllowedCustomFontFamily", () => isAllowedCustomFontFamily, (value) => {
    isAllowedCustomFontFamily = value;
  }), bindRuntimeValue(runtime2, "hasOwnStyleProperty", () => hasOwnStyleProperty, (value) => {
    hasOwnStyleProperty = value;
  }), bindRuntimeValue(runtime2, "shadowOffsetSchema", () => shadowOffsetSchema, (value) => {
    shadowOffsetSchema = value;
  }), bindRuntimeValue(runtime2, "shadowBlurSchema", () => shadowBlurSchema, (value) => {
    shadowBlurSchema = value;
  }), bindRuntimeValue(runtime2, "shadowSpreadSchema", () => shadowSpreadSchema, (value) => {
    shadowSpreadSchema = value;
  }), bindRuntimeValue(runtime2, "defaultShadowBounds", () => defaultShadowBounds, (value) => {
    defaultShadowBounds = value;
  }), bindRuntimeValue(runtime2, "filterBounds", () => filterBounds, (value) => {
    filterBounds = value;
  }), bindRuntimeValue(runtime2, "transformBounds", () => transformBounds, (value) => {
    transformBounds = value;
  }), bindRuntimeValue(runtime2, "gradientAngleSchema", () => gradientAngleSchema, (value) => {
    gradientAngleSchema = value;
  }), bindRuntimeValue(runtime2, "gradientStopPositionSchema", () => gradientStopPositionSchema, (value) => {
    gradientStopPositionSchema = value;
  }), bindRuntimeValue(runtime2, "radialGradientCenterSchema", () => radialGradientCenterSchema, (value) => {
    radialGradientCenterSchema = value;
  }), bindRuntimeValue(runtime2, "gradientRepeatLengthSchema", () => gradientRepeatLengthSchema, (value) => {
    gradientRepeatLengthSchema = value;
  }), bindRuntimeValue(runtime2, "minGradientStops", () => minGradientStops, (value) => {
    minGradientStops = value;
  }), bindRuntimeValue(runtime2, "maxGradientStops", () => maxGradientStops, (value) => {
    maxGradientStops = value;
  }), bindRuntimeValue(runtime2, "cssPixelSizeSchema", () => cssPixelSizeSchema, (value) => {
    cssPixelSizeSchema = value;
  }), bindRuntimeValue(runtime2, "cssPercentSizeSchema", () => cssPercentSizeSchema, (value) => {
    cssPercentSizeSchema = value;
  }), bindRuntimeValue(runtime2, "transitionDurationSchema", () => transitionDurationSchema, (value) => {
    transitionDurationSchema = value;
  }), bindRuntimeValue(runtime2, "transitionDelaySchema", () => transitionDelaySchema, (value) => {
    transitionDelaySchema = value;
  }), bindRuntimeValue(runtime2, "animationDurationSchema", () => animationDurationSchema, (value) => {
    animationDurationSchema = value;
  }), bindRuntimeValue(runtime2, "animationDelaySchema", () => animationDelaySchema, (value) => {
    animationDelaySchema = value;
  }), bindRuntimeValue(runtime2, "animationIterationsSchema", () => animationIterationsSchema, (value) => {
    animationIterationsSchema = value;
  }), bindRuntimeValue(runtime2, "animationKeyframePositionSchema", () => animationKeyframePositionSchema, (value) => {
    animationKeyframePositionSchema = value;
  }), bindRuntimeValue(runtime2, "minAnimationKeyframes", () => minAnimationKeyframes, (value) => {
    minAnimationKeyframes = value;
  }), bindRuntimeValue(runtime2, "maxAnimationKeyframes", () => maxAnimationKeyframes, (value) => {
    maxAnimationKeyframes = value;
  }), bindRuntimeValue(runtime2, "maxAnimationComplexity", () => maxAnimationComplexity, (value) => {
    maxAnimationComplexity = value;
  }), bindRuntimeValue(runtime2, "transformTranslationCostScale", () => transformTranslationCostScale, (value) => {
    transformTranslationCostScale = value;
  }), bindRuntimeValue(runtime2, "transformAngleCostScale", () => transformAngleCostScale, (value) => {
    transformAngleCostScale = value;
  }), bindRuntimeValue(runtime2, "transformScaleCostScale", () => transformScaleCostScale, (value) => {
    transformScaleCostScale = value;
  }), bindRuntimeValue(runtime2, "cssPixels", () => cssPixels, (value) => {
    cssPixels = value;
  }), bindRuntimeValue(runtime2, "transitionPropertyCssNames", () => transitionPropertyCssNames, (value) => {
    transitionPropertyCssNames = value;
  }), bindRuntimeValue(runtime2, "paintContainmentDependentProperties", () => paintContainmentDependentProperties, (value) => {
    paintContainmentDependentProperties = value;
  }), bindRuntimeValue(runtime2, "paintContainmentSupported", () => paintContainmentSupported, (value) => {
    paintContainmentSupported = value;
  }), bindRuntimeValue(runtime2, "dynamicStyleAttribute", () => dynamicStyleAttribute, (value) => {
    dynamicStyleAttribute = value;
  }), bindRuntimeValue(runtime2, "initializeStyleSchema", () => initializeStyleSchema, (value) => {
    initializeStyleSchema = value;
  }), () => {
    isSlideNodeStyleKind = (input) => input.startsWith("slides-"), concatenateNodeKinds = (...input) => input.flat(), lengthSchema = (input, options) => ({
      kind: "len",
      lo: input,
      hi: options
    }), numberSchema = (input, options) => ({
      kind: "num",
      lo: input,
      hi: options
    }), integerSchema = (input, options, context) => ({
      kind: "int",
      lo: input,
      hi: options,
      step: context
    }), enumSchema = (input) => ({
      kind: "enum",
      values: input
    }), maxShadowCount = 8, maxCssValueLength = 64, cssUnsignedNumberSource = "(?:\\d{1,6}(?:\\.\\d{1,6})?|\\.\\d{1,6})", cssOptionalWhitespaceSource = "[ \\t\\n\\r\\f]*", cssRequiredWhitespaceSource = "[ \\t\\n\\r\\f]+", isAllowedCustomFontFamily = (input) => typeof input == "string" && customFontFamilyPattern.test(input) && !reservedFontFamilies.has(input.toLowerCase()), hasOwnStyleProperty = (input, options) => Object.prototype.hasOwnProperty.call(input, options), minGradientStops = 2, maxGradientStops = 8, minAnimationKeyframes = 2, maxAnimationKeyframes = 8, maxAnimationComplexity = 333, transformTranslationCostScale = 100, transformAngleCostScale = 30, cssPixels = (input) => `${input}px`, dynamicStyleAttribute = "data-style-dynamic", initializeStyleSchema = (0, runtime2.initializeOnce)(() => {
      documentTextNodeKinds = ["paragraph", "heading", "codeBlock"], documentBlockNodeKinds = [
        ...documentTextNodeKinds,
        "blockquote",
        "bulletList",
        "orderedList",
        "image"
      ], documentTableNodeKinds = ["table"], documentTableCellNodeKinds = ["table", "tableCell", "tableHeader"], slideTextNodeKinds = ["slides-text"], slideImageNodeKinds = ["slides-img"], slideIconNodeKinds = ["slides-icon"], slideContainerNodeKinds = ["slides-stack"], slideTableNodeKinds = ["slides-table"], slideShapeNodeKinds = ["slides-shape"], allStyleNodeKinds = concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideImageNodeKinds, slideIconNodeKinds, slideContainerNodeKinds, slideTableNodeKinds, slideShapeNodeKinds), transformableNodeKinds = concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideImageNodeKinds, slideIconNodeKinds, slideContainerNodeKinds, slideTableNodeKinds), typographyNodeKinds = concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideTableNodeKinds), paintEffectNodeKinds = concatenateNodeKinds(documentBlockNodeKinds, documentTableNodeKinds, slideTextNodeKinds, slideImageNodeKinds, slideIconNodeKinds, slideContainerNodeKinds, slideTableNodeKinds, slideShapeNodeKinds), documentStyleNodeKinds = concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds), fontStyleValues = ["normal", "italic"], textAlignValues = ["left", "center", "right", "justify"], textTransformValues = ["none", "uppercase", "lowercase", "capitalize"], textDecorationLineValues = ["none", "underline", "line-through"], textDecorationStyleValues = [
        "solid",
        "double",
        "dotted",
        "dashed",
        "wavy"
      ], fontFamilyFallbackValues = ["sans", "serif", "mono", "helvetica"], customFontFamilyPattern = /^[A-Za-z][A-Za-z0-9 _-]{0,39}$/, reservedFontFamilies = /* @__PURE__ */ new Set([
        "inherit",
        "initial",
        "unset",
        "revert",
        "revert-layer",
        "default",
        "serif",
        "sans-serif",
        "monospace",
        "cursive",
        "fantasy",
        "system-ui",
        "math",
        "emoji",
        "fangsong",
        "ui-serif",
        "ui-sans-serif",
        "ui-monospace",
        "ui-rounded"
      ]), fontVariantNumericValues = ["normal", "tabular-nums"], borderStyleValues = ["none", "solid", "dashed", "dotted", "double"], borderSidesValues = [
        "top",
        "right",
        "bottom",
        "left",
        "top right",
        "top bottom",
        "top left",
        "right bottom",
        "right left",
        "bottom left",
        "top right bottom",
        "top right left",
        "top bottom left",
        "right bottom left"
      ], blendModeValues = [
        "normal",
        "multiply",
        "screen",
        "overlay",
        "darken",
        "lighten"
      ], positionValues = ["static", "relative", "absolute", "sticky", "fixed"], floatValues = ["none", "left", "right"], displayValues = ["block", "inline-block", "flex", "grid", "none"], visibilityValues = ["visible", "hidden"], overflowValues = ["visible", "hidden", "clip", "auto", "scroll"], pointerEventsValues = ["auto", "none"], cursorValues = [
        "default",
        "pointer",
        "text",
        "move",
        "grab",
        "grabbing",
        "crosshair",
        "not-allowed",
        "zoom-in",
        "zoom-out",
        "help",
        "wait"
      ], easingValues = ["linear", "ease", "ease-in", "ease-out", "ease-in-out"], animationDirectionValues = ["normal", "reverse", "alternate"], cssFontFamilyFallbacks = {
        sans: "ui-sans-serif, system-ui, sans-serif",
        serif: "ui-serif, Georgia, serif",
        mono: "ui-monospace, Menlo, Consolas, monospace",
        helvetica: "Helvetica Neue, Helvetica, Arial, sans-serif"
      }, colorSchema = {
        kind: "color"
      }, radialGradientExtentValues = [
        "closest-side",
        "closest-corner",
        "farthest-side"
      ], filterComponentSchemas = [
        {
          field: "blur",
          cls: lengthSchema(0, 20),
          fn: "blur",
          unit: "px"
        },
        {
          field: "brightness",
          cls: numberSchema(0, 2),
          fn: "brightness",
          unit: ""
        },
        {
          field: "contrast",
          cls: numberSchema(0, 2),
          fn: "contrast",
          unit: ""
        },
        {
          field: "saturate",
          cls: numberSchema(0, 3),
          fn: "saturate",
          unit: ""
        },
        {
          field: "grayscale",
          cls: numberSchema(0, 1),
          fn: "grayscale",
          unit: ""
        },
        {
          field: "sepia",
          cls: numberSchema(0, 1),
          fn: "sepia",
          unit: ""
        },
        {
          field: "invert",
          cls: numberSchema(0, 1),
          fn: "invert",
          unit: ""
        },
        {
          field: "hueRotate",
          cls: numberSchema(0, 360),
          fn: "hue-rotate",
          unit: "deg"
        }
      ], transformComponentSchemas = [
        {
          field: "translateX",
          cls: lengthSchema(-4096, 4096)
        },
        {
          field: "translateY",
          cls: lengthSchema(-4096, 4096)
        },
        {
          field: "rotate",
          cls: numberSchema(-180, 180)
        },
        {
          field: "scale",
          cls: numberSchema(0.5, 2)
        },
        {
          field: "skewX",
          cls: numberSchema(-60, 60)
        },
        {
          field: "skewY",
          cls: numberSchema(-60, 60)
        }
      ], stylePropertyNames = [
        "fontSize",
        "fontWeight",
        "fontStyle",
        "lineHeight",
        "letterSpacing",
        "textAlign",
        "textTransform",
        "textDecorationLine",
        "textDecorationStyle",
        "textDecorationColor",
        "fontFamily",
        "fontVariantNumeric",
        "color",
        "backgroundColor",
        "backgroundGradient",
        "marginTop",
        "marginRight",
        "marginBottom",
        "marginLeft",
        "paddingTop",
        "paddingRight",
        "paddingBottom",
        "paddingLeft",
        "borderWidth",
        "borderStyle",
        "borderColor",
        "borderSides",
        "borderTopWidth",
        "borderRightWidth",
        "borderBottomWidth",
        "borderLeftWidth",
        "borderRadius",
        "borderTopLeftRadius",
        "borderTopRightRadius",
        "borderBottomRightRadius",
        "borderBottomLeftRadius",
        "opacity",
        "boxShadow",
        "textShadow",
        "textStrokeWidth",
        "textStrokeColor",
        "filter",
        "backdropFilter",
        "transform",
        "mixBlendMode",
        "position",
        "top",
        "right",
        "bottom",
        "left",
        "zIndex",
        "float",
        "display",
        "visibility",
        "overflow",
        "pointerEvents",
        "cursor",
        "width",
        "height",
        "minWidth",
        "minHeight",
        "maxWidth",
        "maxHeight",
        "transition",
        "animation"
      ], paintEffectProperties = [
        "boxShadow",
        "textShadow",
        "filter",
        "backdropFilter",
        "mixBlendMode"
      ], animatableStyleProperties = [
        "transform",
        "opacity",
        "color",
        "backgroundColor",
        "filter",
        "boxShadow"
      ], hoverStyleProperties = [
        "color",
        "backgroundColor",
        "backgroundGradient",
        "borderColor",
        "textDecorationLine",
        "textDecorationStyle",
        "textDecorationColor",
        "opacity",
        "boxShadow",
        "textShadow",
        "filter",
        "cursor"
      ], nonTransformAnimationProperties = [
        "opacity",
        "color",
        "backgroundColor",
        "filter",
        "boxShadow"
      ], stylePropertyNameSet = new Set(stylePropertyNames), paintEffectPropertySet = new Set(paintEffectProperties), animatableStylePropertySet = new Set(animatableStyleProperties), hoverStylePropertySet = new Set(hoverStyleProperties), stylePropertyDefinitions = {
        fontSize: {
          v: lengthSchema(8, 128),
          slides: lengthSchema(8, 400),
          on: typographyNodeKinds
        },
        fontWeight: {
          v: integerSchema(100, 900, 100),
          on: typographyNodeKinds
        },
        fontStyle: {
          v: enumSchema(fontStyleValues),
          on: typographyNodeKinds
        },
        lineHeight: {
          v: numberSchema(0.75, 4),
          slides: numberSchema(0.5, 4),
          on: typographyNodeKinds
        },
        letterSpacing: {
          v: lengthSchema(-4, 32),
          slides: lengthSchema(-24, 32),
          on: typographyNodeKinds
        },
        textAlign: {
          v: enumSchema(textAlignValues),
          on: concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTableNodeKinds),
          routed: slideTextNodeKinds
        },
        textTransform: {
          v: enumSchema(textTransformValues),
          on: typographyNodeKinds
        },
        textDecorationLine: {
          v: enumSchema(textDecorationLineValues),
          on: typographyNodeKinds
        },
        textDecorationStyle: {
          v: enumSchema(textDecorationStyleValues),
          on: typographyNodeKinds
        },
        textDecorationColor: {
          v: colorSchema,
          on: typographyNodeKinds
        },
        fontFamily: {
          v: enumSchema(fontFamilyFallbackValues),
          slides: {
            kind: "fontFamily"
          },
          on: typographyNodeKinds
        },
        fontVariantNumeric: {
          v: enumSchema(fontVariantNumericValues),
          on: typographyNodeKinds
        },
        color: {
          v: colorSchema,
          on: concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTableNodeKinds),
          routed: concatenateNodeKinds(slideTextNodeKinds, slideIconNodeKinds)
        },
        backgroundColor: {
          v: colorSchema,
          on: allStyleNodeKinds
        },
        backgroundGradient: {
          v: {
            kind: "gradient"
          },
          slides: {
            kind: "gradient",
            repeat: !0
          },
          on: concatenateNodeKinds(documentBlockNodeKinds, slideTextNodeKinds, slideImageNodeKinds, slideContainerNodeKinds, slideTableNodeKinds)
        },
        marginTop: {
          v: lengthSchema(0, 256),
          on: documentBlockNodeKinds
        },
        marginRight: {
          v: lengthSchema(0, 256),
          on: documentBlockNodeKinds
        },
        marginBottom: {
          v: lengthSchema(0, 256),
          on: documentBlockNodeKinds
        },
        marginLeft: {
          v: lengthSchema(0, 256),
          on: documentBlockNodeKinds
        },
        paddingTop: {
          v: lengthSchema(0, 256),
          on: concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideContainerNodeKinds, slideTableNodeKinds)
        },
        paddingRight: {
          v: lengthSchema(0, 256),
          on: concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideContainerNodeKinds, slideTableNodeKinds)
        },
        paddingBottom: {
          v: lengthSchema(0, 256),
          on: concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideContainerNodeKinds, slideTableNodeKinds)
        },
        paddingLeft: {
          v: lengthSchema(0, 256),
          on: concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideContainerNodeKinds, slideTableNodeKinds)
        },
        borderWidth: {
          v: lengthSchema(0, 16),
          shape: lengthSchema(0, 32),
          on: allStyleNodeKinds
        },
        borderStyle: {
          v: enumSchema(borderStyleValues),
          on: allStyleNodeKinds
        },
        borderColor: {
          v: colorSchema,
          on: allStyleNodeKinds
        },
        borderSides: {
          v: enumSchema(borderSidesValues),
          on: transformableNodeKinds
        },
        borderTopWidth: {
          v: lengthSchema(0, 16),
          on: transformableNodeKinds
        },
        borderRightWidth: {
          v: lengthSchema(0, 16),
          on: transformableNodeKinds
        },
        borderBottomWidth: {
          v: lengthSchema(0, 16),
          on: transformableNodeKinds
        },
        borderLeftWidth: {
          v: lengthSchema(0, 16),
          on: transformableNodeKinds
        },
        borderRadius: {
          v: lengthSchema(0, 256),
          on: concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideImageNodeKinds, slideContainerNodeKinds, slideTableNodeKinds, slideShapeNodeKinds)
        },
        borderTopLeftRadius: {
          v: lengthSchema(0, 256),
          on: concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideImageNodeKinds, slideContainerNodeKinds, slideTableNodeKinds, slideShapeNodeKinds)
        },
        borderTopRightRadius: {
          v: lengthSchema(0, 256),
          on: concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideImageNodeKinds, slideContainerNodeKinds, slideTableNodeKinds, slideShapeNodeKinds)
        },
        borderBottomRightRadius: {
          v: lengthSchema(0, 256),
          on: concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideImageNodeKinds, slideContainerNodeKinds, slideTableNodeKinds, slideShapeNodeKinds)
        },
        borderBottomLeftRadius: {
          v: lengthSchema(0, 256),
          on: concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideTextNodeKinds, slideImageNodeKinds, slideContainerNodeKinds, slideTableNodeKinds, slideShapeNodeKinds)
        },
        opacity: {
          v: numberSchema(0, 1),
          on: allStyleNodeKinds
        },
        boxShadow: {
          v: {
            kind: "shadow",
            spread: !0
          },
          slides: {
            kind: "shadow",
            spread: !0,
            blur: lengthSchema(0, 160)
          },
          on: paintEffectNodeKinds
        },
        textShadow: {
          v: {
            kind: "shadow",
            spread: !1
          },
          on: concatenateNodeKinds(documentTextNodeKinds, slideTextNodeKinds, slideTableNodeKinds)
        },
        textStrokeWidth: {
          v: lengthSchema(0, 8),
          on: concatenateNodeKinds(documentTextNodeKinds, slideTextNodeKinds, slideTableNodeKinds)
        },
        textStrokeColor: {
          v: colorSchema,
          on: concatenateNodeKinds(documentTextNodeKinds, slideTextNodeKinds, slideTableNodeKinds)
        },
        filter: {
          v: {
            kind: "filter"
          },
          on: paintEffectNodeKinds
        },
        backdropFilter: {
          v: {
            kind: "filter"
          },
          on: paintEffectNodeKinds
        },
        transform: {
          v: {
            kind: "transform"
          },
          on: transformableNodeKinds,
          routed: slideShapeNodeKinds
        },
        mixBlendMode: {
          v: enumSchema(blendModeValues),
          on: paintEffectNodeKinds
        },
        position: {
          v: enumSchema(positionValues),
          on: documentStyleNodeKinds
        },
        top: {
          v: lengthSchema(-4096, 4096),
          on: documentStyleNodeKinds
        },
        right: {
          v: lengthSchema(-4096, 4096),
          on: documentStyleNodeKinds
        },
        bottom: {
          v: lengthSchema(-4096, 4096),
          on: documentStyleNodeKinds
        },
        left: {
          v: lengthSchema(-4096, 4096),
          on: documentStyleNodeKinds
        },
        zIndex: {
          v: integerSchema(-999, 999, 1),
          on: documentStyleNodeKinds
        },
        float: {
          v: enumSchema(floatValues),
          on: documentStyleNodeKinds
        },
        display: {
          v: enumSchema(displayValues),
          on: documentStyleNodeKinds
        },
        visibility: {
          v: enumSchema(visibilityValues),
          on: allStyleNodeKinds
        },
        overflow: {
          v: enumSchema(overflowValues),
          on: concatenateNodeKinds(documentBlockNodeKinds, documentTableCellNodeKinds, slideContainerNodeKinds)
        },
        pointerEvents: {
          v: enumSchema(pointerEventsValues),
          on: allStyleNodeKinds
        },
        cursor: {
          v: enumSchema(cursorValues),
          on: allStyleNodeKinds
        },
        width: {
          v: {
            kind: "size"
          },
          on: documentStyleNodeKinds
        },
        height: {
          v: {
            kind: "size"
          },
          on: documentStyleNodeKinds
        },
        minWidth: {
          v: {
            kind: "size"
          },
          on: documentStyleNodeKinds
        },
        minHeight: {
          v: {
            kind: "size"
          },
          on: documentStyleNodeKinds
        },
        maxWidth: {
          v: {
            kind: "size"
          },
          on: documentStyleNodeKinds
        },
        maxHeight: {
          v: {
            kind: "size"
          },
          on: documentStyleNodeKinds
        },
        transition: {
          v: {
            kind: "transition"
          },
          on: allStyleNodeKinds
        },
        animation: {
          v: {
            kind: "animation"
          },
          on: allStyleNodeKinds
        }
      }, stylePropertyRegistry = buildStylePropertyRegistry(), transformForbiddenNodeKinds = ["table", "tableCell", "tableHeader"], unsafeCssValuePattern = /[;{}@<>"'\\\n\r\f\0]|\/\*|(?:url|expression|image-set|image|element|cross-fade|paint|var|env|attr|src|counters?)\s*\(/i, cssHexColorPattern = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/, cssNamedColors = /* @__PURE__ */ new Set([
        "transparent",
        "currentcolor",
        "aliceblue",
        "antiquewhite",
        "aqua",
        "aquamarine",
        "azure",
        "beige",
        "bisque",
        "black",
        "blanchedalmond",
        "blue",
        "blueviolet",
        "brown",
        "burlywood",
        "cadetblue",
        "chartreuse",
        "chocolate",
        "coral",
        "cornflowerblue",
        "cornsilk",
        "crimson",
        "cyan",
        "darkblue",
        "darkcyan",
        "darkgoldenrod",
        "darkgray",
        "darkgrey",
        "darkgreen",
        "darkkhaki",
        "darkmagenta",
        "darkolivegreen",
        "darkorange",
        "darkorchid",
        "darkred",
        "darksalmon",
        "darkseagreen",
        "darkslateblue",
        "darkslategray",
        "darkslategrey",
        "darkturquoise",
        "darkviolet",
        "deeppink",
        "deepskyblue",
        "dimgray",
        "dimgrey",
        "dodgerblue",
        "firebrick",
        "floralwhite",
        "forestgreen",
        "fuchsia",
        "gainsboro",
        "ghostwhite",
        "gold",
        "goldenrod",
        "gray",
        "grey",
        "green",
        "greenyellow",
        "honeydew",
        "hotpink",
        "indianred",
        "indigo",
        "ivory",
        "khaki",
        "lavender",
        "lavenderblush",
        "lawngreen",
        "lemonchiffon",
        "lightblue",
        "lightcoral",
        "lightcyan",
        "lightgoldenrodyellow",
        "lightgray",
        "lightgrey",
        "lightgreen",
        "lightpink",
        "lightsalmon",
        "lightseagreen",
        "lightskyblue",
        "lightslategray",
        "lightslategrey",
        "lightsteelblue",
        "lightyellow",
        "lime",
        "limegreen",
        "linen",
        "magenta",
        "maroon",
        "mediumaquamarine",
        "mediumblue",
        "mediumorchid",
        "mediumpurple",
        "mediumseagreen",
        "mediumslateblue",
        "mediumspringgreen",
        "mediumturquoise",
        "mediumvioletred",
        "midnightblue",
        "mintcream",
        "mistyrose",
        "moccasin",
        "navajowhite",
        "navy",
        "oldlace",
        "olive",
        "olivedrab",
        "orange",
        "orangered",
        "orchid",
        "palegoldenrod",
        "palegreen",
        "paleturquoise",
        "palevioletred",
        "papayawhip",
        "peachpuff",
        "peru",
        "pink",
        "plum",
        "powderblue",
        "purple",
        "rebeccapurple",
        "red",
        "rosybrown",
        "royalblue",
        "saddlebrown",
        "salmon",
        "sandybrown",
        "seagreen",
        "seashell",
        "sienna",
        "silver",
        "skyblue",
        "slateblue",
        "slategray",
        "slategrey",
        "snow",
        "springgreen",
        "steelblue",
        "tan",
        "teal",
        "thistle",
        "tomato",
        "turquoise",
        "violet",
        "wheat",
        "white",
        "whitesmoke",
        "yellow",
        "yellowgreen"
      ]), legacyRgbColorPattern = new RegExp("^rgba?\\(" + cssOptionalWhitespaceSource + cssUnsignedNumberSource + "%?" + cssOptionalWhitespaceSource + "," + cssOptionalWhitespaceSource + cssUnsignedNumberSource + "%?" + cssOptionalWhitespaceSource + "," + cssOptionalWhitespaceSource + cssUnsignedNumberSource + "%?" + cssOptionalWhitespaceSource + "(?:," + cssOptionalWhitespaceSource + cssUnsignedNumberSource + "%?" + cssOptionalWhitespaceSource + ")?\\)$"), modernRgbColorPattern = new RegExp("^rgba?\\(" + cssOptionalWhitespaceSource + cssUnsignedNumberSource + "%?" + cssRequiredWhitespaceSource + cssUnsignedNumberSource + "%?" + cssRequiredWhitespaceSource + cssUnsignedNumberSource + "%?" + cssOptionalWhitespaceSource + "(?:/" + cssOptionalWhitespaceSource + cssUnsignedNumberSource + "%?" + cssOptionalWhitespaceSource + ")?\\)$"), legacyHslColorPattern = new RegExp("^hsla?\\(" + cssOptionalWhitespaceSource + "-?" + cssUnsignedNumberSource + "(?:deg)?" + cssOptionalWhitespaceSource + "," + cssOptionalWhitespaceSource + cssUnsignedNumberSource + "%" + cssOptionalWhitespaceSource + "," + cssOptionalWhitespaceSource + cssUnsignedNumberSource + "%" + cssOptionalWhitespaceSource + "(?:," + cssOptionalWhitespaceSource + cssUnsignedNumberSource + "%?" + cssOptionalWhitespaceSource + ")?\\)$"), modernHslColorPattern = new RegExp("^hsla?\\(" + cssOptionalWhitespaceSource + "-?" + cssUnsignedNumberSource + "(?:deg)?" + cssRequiredWhitespaceSource + cssUnsignedNumberSource + "%" + cssRequiredWhitespaceSource + cssUnsignedNumberSource + "%" + cssOptionalWhitespaceSource + "(?:/" + cssOptionalWhitespaceSource + cssUnsignedNumberSource + "%?" + cssOptionalWhitespaceSource + ")?\\)$"), shadowOffsetSchema = lengthSchema(-64, 64), shadowBlurSchema = lengthSchema(0, 64), shadowSpreadSchema = lengthSchema(-32, 32), defaultShadowBounds = {
        x: numericSchemaBounds(shadowOffsetSchema),
        y: numericSchemaBounds(shadowOffsetSchema),
        blur: numericSchemaBounds(shadowBlurSchema),
        spread: numericSchemaBounds(shadowSpreadSchema)
      }, filterBounds = componentSchemaBounds(filterComponentSchemas), transformBounds = componentSchemaBounds(transformComponentSchemas), gradientAngleSchema = numberSchema(0, 360), gradientStopPositionSchema = numberSchema(0, 100), radialGradientCenterSchema = numberSchema(-100, 200), gradientRepeatLengthSchema = lengthSchema(2, 2048), cssPixelSizeSchema = lengthSchema(0, 4096), cssPercentSizeSchema = numberSchema(1, 100), transitionDurationSchema = numberSchema(0, 5e3), transitionDelaySchema = numberSchema(0, 5e3), animationDurationSchema = numberSchema(200, 1e4), animationDelaySchema = numberSchema(0, 5e3), animationIterationsSchema = integerSchema(1, 1e3, 1), animationKeyframePositionSchema = numberSchema(0, 100), transformScaleCostScale = Math.LN2, transitionPropertyCssNames = {
        transform: "transform",
        opacity: "opacity",
        color: "color",
        backgroundColor: "background-color",
        filter: "filter",
        boxShadow: "box-shadow"
      }, paintContainmentDependentProperties = [
        "position",
        "top",
        "right",
        "bottom",
        "left",
        "zIndex",
        "float"
      ];
    });
  };
}
export {
  installModelStyleSchema
};
