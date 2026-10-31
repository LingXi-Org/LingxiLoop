// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installRenderingTheme(runtime2) {
  var ThemeReact, renderingNamedColors, renderingTheme, serifThemeFontStack, sansThemeFontStack, defaultThemeFontFamilies, googleFontImportPattern, neutralThemeFontStack, anthropicRenderedTypeScale, neutralRenderedTypeScale, defaultDeckColorNames, initializeRenderingTheme;
  function setRenderingTheme(theme) {
    renderingTheme = theme;
  }
  function getRenderingTheme() {
    return renderingTheme;
  }
  function themeAccentColor(theme = renderingTheme) {
    return theme === "neutral" ? "#9aa0a6" : runtime2.anthropicAccentColor;
  }
  function resolveSlideColor(color) {
    if (color)
      return renderingNamedColors[color] ?? (color.startsWith("#") ? color : void 0);
  }
  function stripHexAlpha(color) {
    let hex = color.slice(1);
    return (hex.length === 3 || hex.length === 4) && (hex = [...hex].map((input) => input + input).join("")), "#" + hex.slice(0, 6);
  }
  function slideTextColor(background) {
    return (0, runtime2.strongerContrastColor)(stripHexAlpha(resolveSlideColor(background) ?? "#F5F4ED"), "#FAF9F5", "#141413");
  }
  function buildDeckThemeCss(theme, faces) {
    let text = "", text2 = "", text3 = "";
    for (let value of faces ?? [])
      if ("href" in value) {
        let value2 = "@import url(" + value.href + ");";
        text.includes(value2) || (text += value2);
      } else
        text2 += "@font-face{font-family:'" + value.family + "';src:url(" + value.src + ");font-weight:100 900;font-display:swap;}";
    if (!theme)
      return addOptionalGoogleFontImports(text) + text2;
    for (let value of runtime2.themeFontFamilyKinds) {
      let value2 = theme[value];
      if (!value2)
        continue;
      let text4 = "";
      if ("href" in value2) {
        let value3 = "@import url(" + value2.href + ");";
        text.includes(value3) || (text += value3), text4 = ",'" + defaultThemeFontFamilies[value] + "'";
      } else
        text2 += "@font-face{font-family:'" + value2.family + "';src:url(" + value2.src + ");font-weight:100 900;font-display:swap;}";
      text3 += "--deck-" + value + ":'" + value2.family + "'" + text4 + ";";
    }
    return text = addOptionalGoogleFontImports(text), text3 === "" ? text + text2 : text + text2 + ":root{" + text3 + "}";
  }
  function addOptionalGoogleFontImports(css) {
    let value = css;
    for (let value2 of css.matchAll(googleFontImportPattern))
      for (let value3 of (0, runtime2.optionalGoogleFontStylesheetUrls)(value2[1], runtime2.defaultGoogleFontWeights)) {
        let value4 = "@import url(" + value3 + ");";
        value.includes(value4) || (value += value4);
      }
    return value;
  }
  function buildRenderedTypeScale(theme) {
    let value = theme === "neutral" ? runtime2.neutralTypeScale : runtime2.anthropicTypeScale, state = {};
    for (let value2 of Object.keys(value)) {
      let value3 = value[value2];
      state[value2] = {
        fontFamily: theme === "neutral" ? neutralThemeFontStack : value3.serifDisplay ? serifThemeFontStack : sansThemeFontStack,
        fontSize: value3.fontSize,
        fontWeight: value3.fontWeight,
        lineHeight: value3.lineHeight,
        ...value3.serifDisplay ? {
          serifDisplay: !0
        } : {}
      };
    }
    return state;
  }
  function renderingTypeScaleForRole(role) {
    return (renderingTheme === "neutral" ? neutralRenderedTypeScale : anthropicRenderedTypeScale)[role];
  }
  function typographyStyleCss(style) {
    let value = renderingTypeScaleForRole(style.role);
    return {
      fontFamily: style.fontFamily !== void 0 ? String((0, runtime2.styleBagToCss)({
        fontFamily: style.fontFamily
      }, "slides-text").fontFamily ?? value.fontFamily) : value.fontFamily,
      fontWeight: style.fontWeight,
      ...style.italic ? {
        fontStyle: "italic"
      } : null,
      fontSize: Math.round(13 + (Math.min(128, Math.max(24, style.fontSize)) - 24) * 7 / 104),
      ...style.textTransform !== void 0 ? {
        textTransform: style.textTransform
      } : null,
      ...style.fontFamily === void 0 && value.serifDisplay ? {
        fontVariationSettings: "'opsz' 48"
      } : null
    };
  }
  function resolvedFontVariants(font, role, themeFamilies) {
    let generic = renderingTypeScaleForRole(role).serifDisplay ? "serif" : "sans", family = typeof font == "object" ? font.family : font !== void 0 || renderingTheme === "neutral" ? (0, runtime2.firstFontFamily)(String((0, runtime2.styleBagToCss)({
      fontFamily: font ?? "sans"
    }, "slides-text").fontFamily ?? "")) : themeFamilies?.[generic]?.family ?? defaultThemeFontFamilies[generic];
    return (0, runtime2.knownFontVariants)(family) ?? (0, runtime2.fontVariantsOrDefault)(family, typeof document < "u" && document.fonts ? (0, runtime2.availableFontVariants)(Array.from(document.fonts), family) : void 0);
  }
  function fontFamilyCss(font) {
    return {
      fontFamily: String((0, runtime2.styleBagToCss)({
        fontFamily: font
      }, "slides-text").fontFamily ?? "")
    };
  }
  function textNodeBaseCss(node, background) {
    let defaults = renderingTypeScaleForRole(node.role), css = {
      fontFamily: defaults.fontFamily,
      fontSize: defaults.fontSize,
      fontWeight: defaults.fontWeight,
      lineHeight: defaults.lineHeight,
      color: resolveSlideColor(node.color) ?? slideTextColor(background),
      margin: 0,
      whiteSpace: node.wrap === "nowrap" ? "pre" : "pre-wrap",
      overflowWrap: node.wrap === "nowrap" ? "normal" : "break-word"
    };
    return defaults.serifDisplay ? (css.fontVariationSettings = "'opsz' 48", node.wrap !== "nowrap" && (css.textWrap = "balance")) : node.wrap !== "nowrap" && (css.textWrap = "pretty"), node.align === "center" ? css.textAlign = "center" : node.align === "end" ? css.textAlign = "right" : node.align === "justify" && (css.textAlign = "justify"), node.hangingIndent !== void 0 && (css.textIndent = -node.hangingIndent, css.paddingLeft = node.hangingIndent), css;
  }
  function textFillCssImage(fill) {
    if (fill !== void 0) {
      if (fill.kind === "gradient") {
        let backgroundImage = (0, runtime2.styleBagToCss)({
          backgroundGradient: fill.gradient
        }, "slides-text").backgroundImage;
        return typeof backgroundImage == "string" ? backgroundImage : void 0;
      }
      if ((0, runtime2.isRenderableImageSource)(fill.src))
        return 'url("' + fill.src + '") center / ' + (fill.size ?? "cover") + " no-repeat";
    }
  }
  function applyTextFillCss(style, fill) {
    if (fill === void 0 || fill.kind === "image" && !(0, runtime2.isRenderableImageSource)(fill.src))
      return style;
    let { backgroundColor, background, textShadow, ...restStyle } = style, image = fill.kind === "gradient" ? textFillCssImage(fill) : 'url("' + fill.src + '")';
    return image === void 0 ? style : {
      ...restStyle,
      backgroundColor: fill.kind === "image" && typeof restStyle.color == "string" ? restStyle.color : void 0,
      backgroundImage: image,
      backgroundSize: fill.kind === "image" ? fill.size ?? "cover" : void 0,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundClip: "text",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent"
    };
  }
  function slideBackgroundColor(background) {
    return resolveSlideColor(background) ?? "#F5F4ED";
  }
  function slideColorOrUndefined(color) {
    if ((0, runtime2.isSlideColor)(color))
      return color;
  }
  function namedSwatchColor(swatches, name) {
    return swatches.find((input) => input.name === name)?.color;
  }
  function selectedSwatchName(swatches, color) {
    let normalized = (resolveSlideColor(color) ?? color).toLowerCase(), swatch = swatches.find((input) => input.color === normalized);
    return swatch === void 0 ? null : swatch.picks ?? swatch.name;
  }
  function useDeckColorChoices(colors = defaultDeckColorNames, quickColors = defaultDeckColorNames) {
    let value = (0, runtime2.useDesignSystems)();
    return ThemeReact.useMemo(() => {
      if (!(0, runtime2.hasDesignSystems)(value))
        return {
          rows: colors.map((input) => ({
            name: input,
            value: input,
            label: input.toUpperCase()
          })),
          quick: colors.map((input) => ({
            name: "design:" + input,
            color: input,
            label: input.toUpperCase()
          })),
          systems: 0
        };
      let value2 = quickColors.length > 0 ? {
        label: runtime2.SLIDE_COLORS_LABEL,
        colors: quickColors
      } : void 0, value3 = (0, runtime2.designSystemColorRows)(value).map((input) => typeof input == "string" ? {
        name: input,
        color: input
      } : {
        name: input.name,
        color: input.value,
        label: input.label,
        group: input.group,
        subgroup: input.subgroup
      });
      return {
        rows: (0, runtime2.mergeDesignSystemSwatches)(value2, value3).map((input) => ({
          name: input.name,
          value: input.color,
          label: input.label,
          group: input.group,
          subgroup: input.subgroup,
          ...input.picks !== void 0 ? {
            picks: input.picks
          } : {}
        })),
        quick: (0, runtime2.mergeDesignSystemSwatches)(value2, value.flatMap((input, options) => input.colors.map((input2) => ({
          name: "ds:" + String(options) + ":" + input2.name,
          color: input2.value,
          label: input2.name,
          ...(0, runtime2.designSystemColorGrouping)(input, input2)
        })))),
        systems: value.length
      };
    }, [value, colors, quickColors]);
  }
  return bindRuntimeValue(runtime2, "setRenderingTheme", () => setRenderingTheme), bindRuntimeValue(runtime2, "getRenderingTheme", () => getRenderingTheme), bindRuntimeValue(runtime2, "themeAccentColor", () => themeAccentColor), bindRuntimeValue(runtime2, "resolveSlideColor", () => resolveSlideColor), bindRuntimeValue(runtime2, "stripHexAlpha", () => stripHexAlpha), bindRuntimeValue(runtime2, "slideTextColor", () => slideTextColor), bindRuntimeValue(runtime2, "buildDeckThemeCss", () => buildDeckThemeCss), bindRuntimeValue(runtime2, "addOptionalGoogleFontImports", () => addOptionalGoogleFontImports), bindRuntimeValue(runtime2, "buildRenderedTypeScale", () => buildRenderedTypeScale), bindRuntimeValue(runtime2, "renderingTypeScaleForRole", () => renderingTypeScaleForRole), bindRuntimeValue(runtime2, "typographyStyleCss", () => typographyStyleCss), bindRuntimeValue(runtime2, "resolvedFontVariants", () => resolvedFontVariants), bindRuntimeValue(runtime2, "fontFamilyCss", () => fontFamilyCss), bindRuntimeValue(runtime2, "textNodeBaseCss", () => textNodeBaseCss), bindRuntimeValue(runtime2, "textFillCssImage", () => textFillCssImage), bindRuntimeValue(runtime2, "applyTextFillCss", () => applyTextFillCss), bindRuntimeValue(runtime2, "slideBackgroundColor", () => slideBackgroundColor), bindRuntimeValue(runtime2, "slideColorOrUndefined", () => slideColorOrUndefined), bindRuntimeValue(runtime2, "namedSwatchColor", () => namedSwatchColor), bindRuntimeValue(runtime2, "selectedSwatchName", () => selectedSwatchName), bindRuntimeValue(runtime2, "useDeckColorChoices", () => useDeckColorChoices), bindRuntimeValue(runtime2, "ThemeReact", () => ThemeReact, (value) => {
    ThemeReact = value;
  }), bindRuntimeValue(runtime2, "renderingNamedColors", () => renderingNamedColors, (value) => {
    renderingNamedColors = value;
  }), bindRuntimeValue(runtime2, "renderingTheme", () => renderingTheme, (value) => {
    renderingTheme = value;
  }), bindRuntimeValue(runtime2, "serifThemeFontStack", () => serifThemeFontStack, (value) => {
    serifThemeFontStack = value;
  }), bindRuntimeValue(runtime2, "sansThemeFontStack", () => sansThemeFontStack, (value) => {
    sansThemeFontStack = value;
  }), bindRuntimeValue(runtime2, "defaultThemeFontFamilies", () => defaultThemeFontFamilies, (value) => {
    defaultThemeFontFamilies = value;
  }), bindRuntimeValue(runtime2, "googleFontImportPattern", () => googleFontImportPattern, (value) => {
    googleFontImportPattern = value;
  }), bindRuntimeValue(runtime2, "neutralThemeFontStack", () => neutralThemeFontStack, (value) => {
    neutralThemeFontStack = value;
  }), bindRuntimeValue(runtime2, "anthropicRenderedTypeScale", () => anthropicRenderedTypeScale, (value) => {
    anthropicRenderedTypeScale = value;
  }), bindRuntimeValue(runtime2, "neutralRenderedTypeScale", () => neutralRenderedTypeScale, (value) => {
    neutralRenderedTypeScale = value;
  }), bindRuntimeValue(runtime2, "defaultDeckColorNames", () => defaultDeckColorNames, (value) => {
    defaultDeckColorNames = value;
  }), bindRuntimeValue(runtime2, "initializeRenderingTheme", () => initializeRenderingTheme, (value) => {
    initializeRenderingTheme = value;
  }), () => {
    renderingTheme = "anthropic", serifThemeFontStack = "var(--deck-serif, Georgia), Georgia, 'Times New Roman', serif", sansThemeFontStack = "var(--deck-sans, system-ui), -apple-system, 'Helvetica Neue', sans-serif", neutralThemeFontStack = "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif", initializeRenderingTheme = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeColorSelect)(), (0, runtime2.initializeUiPropertyLabels)(), (0, runtime2.initializeUiContrast)(), (0, runtime2.initializeFontCatalog)(), (0, runtime2.initializeFontVariants)(), (0, runtime2.initializeDesignTokenParser)(), (0, runtime2.initializeDesignSystemsStore)(), (0, runtime2.initializeSlideTypeScales)(), (0, runtime2.initializeStyleSchema)(), ThemeReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), renderingNamedColors = {
        ...runtime2.namedSlideColors
      }, defaultThemeFontFamilies = {
        serif: "Georgia",
        sans: "system-ui"
      }, googleFontImportPattern = /@import url\(([^)]+)\);/g, anthropicRenderedTypeScale = buildRenderedTypeScale("anthropic"), neutralRenderedTypeScale = buildRenderedTypeScale("neutral"), defaultDeckColorNames = [];
    });
  };
}
export {
  installRenderingTheme
};
