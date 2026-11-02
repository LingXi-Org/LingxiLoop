// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDesignSystemThemePanel(runtime2) {
  var reactForThemePanel, jsxForThemePanel, reactForThemeTabFlag;
  const ROLE_LABELS = {
    background: "Background",
    surface: "Surface",
    text: "Text",
    muted: "Muted text",
    border: "Lines",
    accent: "Accent",
    "accent-soft": "Accent tint",
    "on-accent": "On accent",
    inverse: "Background",
    "on-inverse": "Text",
    "on-inverse-muted": "Muted text",
    "inverse-accent": "Accent",
    status: "Status",
    other: "Other"
  }, [CONTRAST_SLIDES, CONTRAST_BOXES] = ["Contrast slides", "Contrast boxes"], isInverse = (slot) => slot.role.includes("inverse"), isPage = (slot) => (0, runtime2.isPageSlot)(slot.id), STATUS_LABELS = {
    good: "成功",
    warn: "警告",
    bad: "错误",
    info: "提示",
    soft: "浅色",
    text: "文字",
    on: "，其上的文字"
  }, LADDER_LABELS = {
    display: "大标题",
    h1: "一级标题",
    h2: "二级标题",
    h3: "三级标题",
    lead: "导语",
    eyebrow: "眉题",
    body: "正文",
    caption: "说明文字"
  }, slotNumber = (id) => /-(\d+)$/.exec(id)?.[1], slotNumberSuffix = (id) => slotNumber(id) !== void 0 ? " (" + slotNumber(id) + ")" : "", slotNumberSpaced = (id) => slotNumber(id) !== void 0 ? " " + slotNumber(id) : "";
  function slotLabel(slot, others) {
    let [, meaning, part] = /^status-([a-z]+)(?:-([a-z]+))?/.exec(slot.id) ?? [], status = (key) => key !== void 0 && Object.hasOwn(STATUS_LABELS, key) ? STATUS_LABELS[key] : void 0;
    return meaning !== void 0 ? (status(meaning) ?? "Status") + (status(part) ?? "") + slotNumberSpaced(slot.id) : slot.role === "other" ? "Other" + (others.indexOf(slot) > 0 ? " " + String(others.indexOf(slot) + 1) : "") : ROLE_LABELS[slot.role] + slotNumberSpaced(slot.id);
  }
  const inverseGroupLabel = (analysis) => !analysis.colors.some(isPage) && analysis.uses.some((use) => use.prop === "ground" && analysis.colors.some((slot) => slot.id === use.slot && isInverse(slot))) ? CONTRAST_SLIDES : CONTRAST_BOXES, slotTitle = (slot, others, inverseLabel) => isInverse(slot) ? (isPage(slot) ? CONTRAST_SLIDES : inverseLabel) + ", " + slotLabel(slot, others).toLowerCase() : slotLabel(slot, others), MAX_OTHER_SLOTS = 4, MAX_PREVIEW_SLIDE_SIZE = 1e5, slideTooBig = (slide) => JSON.stringify(slide, (_key, value) => typeof value == "string" && value.startsWith("data:") ? "" : value).length > MAX_PREVIEW_SLIDE_SIZE;
  function shownColorSlots(colors) {
    let ordered = [...colors.filter(isPage), ...colors.filter((slot) => !isPage(slot))], hidden = (slot, index4) => /-alt\d*$/.test(slot.id) || slot.mix !== void 0 && (0, runtime2.unpageSlot)(slot.id) !== slot.role || ordered.slice(0, index4).some((other) => other.count > 0 && other.role === slot.role && other.value === slot.value), shown = ordered.filter((slot, index4) => slot.count > 0 && !hidden(slot, index4));
    return {
      slots: shown.filter((slot) => slot.role !== "other"),
      others: shown.filter((slot) => slot.role === "other").sort((a, b) => b.count - a.count).slice(0, MAX_OTHER_SLOTS)
    };
  }
  function slotSwatches(rows, slot) {
    let index4 = slot.token !== void 0 ? rows.findIndex((row) => row.name === slot.token && row.value.toLowerCase() === slot.value) : -1;
    if (index4 <= 0)
      return rows;
    let first = rows[index4];
    return first !== void 0 ? [first, ...rows.slice(0, index4), ...rows.slice(index4 + 1)] : rows;
  }
  function slotContrast(analysis, slot) {
    let uses = analysis.uses.filter((use) => use.slot === slot.id && use.prop === "text" && use.on !== void 0), groundSlot = (color) => analysis.colors.find((entry) => entry.id === analysis.uses.find((use) => (use.prop === "ground" || use.prop === "fill") && use.value.slice(0, 7) === color)?.slot), grounds = [
      ...new Set(uses.flatMap((use) => use.on !== void 0 ? [use.on] : []))
    ].map((color) => {
      let ground = groundSlot(color);
      return {
        css: ground?.value ?? color,
        label: ground !== void 0 ? slotTitle(ground, [], inverseGroupLabel(analysis)) : color.toUpperCase()
      };
    });
    return grounds.length > 0 ? {
      against: grounds,
      role: uses.some((use) => use.small === !0) ? "text" : "largeText"
    } : void 0;
  }
  const TEXT_TRANSFORMS = ["uppercase", "lowercase", "capitalize"], textPatch = (prop, value) => {
    let patch = {};
    return patch[prop] = value, patch;
  };
  function ThemePanel({ restyle, slide, assets, designColors, faces, facesFull, fonts, editsAreUndoSteps }) {
    let sections = (0, runtime2.useSectionMemory)("slides"), remembered = (id) => ({
      collapsed: !sections.open(id),
      onToggle: () => sections.toggle(id)
    }), { style, systems, current, theme } = restyle, rows = (0, runtime2.useDeckColorChoices)(designColors).rows, [openGroups, setOpenGroups] = reactForThemePanel.useState([]), group = (id) => ({
      collapsed: !openGroups.includes(id),
      onToggle: () => setOpenGroups(openGroups.includes(id) ? openGroups.filter((entry) => entry !== id) : [...openGroups, id])
    }), mutedSummary = (text) => jsxForThemePanel.jsx("span", {
      className: "truncate text-footnote text-muted",
      children: text
    }), sampleTitle = (text, css, spoken) => jsxForThemePanel.jsxs(jsxForThemePanel.Fragment, {
      children: [
        jsxForThemePanel.jsx("span", {
          "aria-hidden": "true",
          className: "leading-[1.3] text-primary",
          style: css,
          children: text
        }),
        jsxForThemePanel.jsx("span", {
          className: "sr-only",
          children: text + ", " + spoken
        })
      ]
    }), textSlots = style.text.filter((slot) => slot.count > 0).sort((a, b) => runtime2.TYPE_LADDER_ROLES.indexOf(a.role) - runtime2.TYPE_LADDER_ROLES.indexOf(b.role) || Number(slotNumber(a.id) ?? 1) - Number(slotNumber(b.id) ?? 1)), previewSizes = (0, runtime2.previewFontSizes)(textSlots.map((slot) => slot.fontSize)), declared = new Set((faces ?? []).map((face) => face.family.toLowerCase())), familyOf = (face) => face !== void 0 ? (0, runtime2.restyleFaceFontFamily)(face, declared) : void 0, fontRow = (label, face, onPick) => jsxForThemePanel.jsx(runtime2.SelectPropertyRow, {
      label,
      options: (0, runtime2.fontFamilyOptions)(faces, familyOf(face), facesFull),
      searchable: !0,
      searchLabel: "搜索字体",
      onOpenChange: (open4) => open4 && (0, runtime2.ensureGoogleFonts)(runtime2.fontFamilyChoices),
      value: (0, runtime2.fontFamilyChoiceValue)(familyOf(face), faces),
      placeholder: face === void 0 ? "混合" : "",
      onChange: (value) => {
        let patch = (0, runtime2.fontFamilyPatchFromChoice)(value, faces, familyOf(face)), picked = (0, runtime2.restyleFaceOf)(patch.fontFamily);
        picked !== void 0 && onPick(picked, patch.face);
      }
    }), systemLooks = reactForThemePanel.useMemo(() => systems.map((system) => (0, runtime2.systemLook)(system.style, (face) => {
      let file = system.faces.find((entry) => entry.family.toLowerCase() === face?.name.toLowerCase());
      return face === void 0 ? void 0 : (0, runtime2.fontFamilyCss)(file !== void 0 ? {
        family: (0, runtime2.peekFontFamily)(file.src),
        fallback: face.generic
      } : (0, runtime2.restyleFaceFontFamily)(face, /* @__PURE__ */ new Set())).fontFamily;
    })), [systems]), familyCss = (face) => {
      let family = familyOf(face);
      return family !== void 0 ? (0, runtime2.fontFamilyCss)(family).fontFamily : void 0;
    }, looks = reactForThemePanel.useMemo(() => {
      let previous = style.memory?.[1], previousFaceCss = (face) => {
        let file = ((0, runtime2.normalizeFontFaces)(previous?.faces) ?? []).find((entry) => entry.family.toLowerCase() === face?.name.toLowerCase());
        return face === void 0 || file === void 0 || declared.has(face.name.toLowerCase()) ? familyCss(face) : (0, runtime2.fontFamilyCss)({
          family: file.src !== void 0 ? (0, runtime2.peekFontFamily)(file.src) : file.family,
          fallback: face.generic
        }).fontFamily;
      }, original = restyle.hasOriginal && previous !== void 0 ? (0, runtime2.customLook)(runtime2.ORIGINAL_LOOK, "原始样式", previous.colors, previous.text, previousFaceCss) : current === void 0 ? (0, runtime2.customLook)(runtime2.ORIGINAL_LOOK, "原始样式", Object.fromEntries(style.colors.map((slot) => [slot.id, slot.value])), Object.fromEntries(style.text.map((slot) => [slot.id, slot])), familyCss) : void 0;
      return [...original !== void 0 ? [original] : [], ...systemLooks];
    }, [systemLooks, style, current, restyle.hasOriginal, faces]), { preview } = restyle, tooBig = reactForThemePanel.useMemo(() => slide !== void 0 && slideTooBig(slide), [slide]), draw = reactForThemePanel.useCallback((choice, width) => slide !== void 0 && !tooBig ? jsxForThemePanel.jsx("span", {
      "data-appifact-content": "",
      className: "absolute inset-0 block",
      children: jsxForThemePanel.jsx(runtime2.SlideCanvas, {
        slide: preview(choice.key, choice.theme)(slide),
        assets,
        width,
        animate: !1,
        structure: !1
      })
    }) : null, [slide, tooBig, assets, preview]), currentChoice = current !== void 0 ? { key: current.key, ...theme !== void 0 ? { theme } : {} } : { key: runtime2.ORIGINAL_LOOK }, { slots, others } = shownColorSlots(style.colors), contrastFails = [...slots, ...others].some((slot) => {
      let need = slotContrast(style, slot);
      return need !== void 0 && (0, runtime2.colorContrastResults)(slot.value, need)?.some((result) => !result.passes) === !0;
    }), scrubbed = (slot, prop) => ({
      onValue: (value) => void (value !== void 0 && restyle.textStyle(slot, textPatch(prop, value))),
      onScrub: (value) => restyle.textStyle(slot, textPatch(prop, value), { live: !0 }),
      onScrubEnd: () => restyle.end()
    }), firstLook = looks[0];
    return style.over === !0 ? jsxForThemePanel.jsx("div", {
      "data-testid": "sl-theme-tab",
      className: "pt-3 pr-md pl-lg text-footnote text-muted",
      children: "此演示文稿使用了超过 512 种颜色，当前面板无法处理，请让助手调整样式。"
    }) : jsxForThemePanel.jsxs("div", {
      "data-testid": "sl-theme-tab",
      className: "flex h-full flex-col overflow-y-auto pb-1 [--pp-label-w:72px] " + runtime2.HIDDEN_NATIVE_SCROLLBAR_CLASS,
      children: [
        jsxForThemePanel.jsxs(runtime2.PropertySection, {
          title: "设计系统",
          children: [
            jsxForThemePanel.jsx(runtime2.ThemeLookPicker, {
              looks,
              current: currentChoice,
              ...looks.length === 1 && firstLook !== void 0 && firstLook.themes.length < 2 ? {
                disabledReason: systems.length > 0 ? "This presentation has one design system. Ask the agent to add another." : "This presentation has no design system. Ask the agent to add one."
              } : {},
              onPick: (choice) => restyle.pickLook(choice.key, choice.theme),
              onPeek: (choice) => restyle.peek(choice?.key, choice?.theme),
              draw,
              editsAreUndoSteps
            }),
            style.strays > 0 && current !== void 0 ? jsxForThemePanel.jsx(runtime2.PropertyRow, {
              label: "",
              title: "部分幻灯片仍使用旧颜色和字体，点击将其更新为 " + current.title + "的样式。",
              children: jsxForThemePanel.jsx(runtime2.Button, {
                size: "sm",
                variant: "secondary",
                onClick: () => restyle.pickLook(current.key, theme),
                children: "应用到所有幻灯片"
              })
            }) : null
          ]
        }),
        jsxForThemePanel.jsx(runtime2.PropertySection, {
          title: contrastFails ? jsxForThemePanel.jsxs(jsxForThemePanel.Fragment, {
            children: [
              "颜色",
              jsxForThemePanel.jsxs("span", {
                className: "sr-only",
                children: [", ", runtime2.CONTRAST_FAILS_LABEL.toLowerCase()]
              })
            ]
          }) : "颜色",
          ...remembered("colors"),
          summary: jsxForThemePanel.jsx(runtime2.SwatchStrip, {
            ...contrastFails ? { warn: runtime2.CONTRAST_FAILS_LABEL } : {},
            colors: [...slots.filter((slot) => !isInverse(slot)), ...others].map((slot) => slot.value)
          }),
          children: [
            ...slots.filter((slot) => !isInverse(slot)),
            ...others,
            ...[!0, !1].flatMap((pages) => {
              let inverse = slots.filter((slot) => isInverse(slot) && isPage(slot) === pages);
              return inverse.length > 0 ? [pages ? CONTRAST_SLIDES : inverseGroupLabel(style), ...inverse] : [];
            })
          ].map((entry) => {
            if (typeof entry == "string")
              return jsxForThemePanel.jsx(runtime2.PropertySection, { title: entry, subsection: !0 }, entry);
            let label = slotLabel(entry, others), contrast = slotContrast(style, entry), results = contrast !== void 0 ? (0, runtime2.colorContrastResults)(entry.value, contrast) : void 0;
            return jsxForThemePanel.jsxs("div", {
              children: [
                jsxForThemePanel.jsx(runtime2.ColorTextPropertyRow, {
                  label,
                  title: slotTitle(entry, others, inverseGroupLabel(style)) + ": " + String(entry.count) + (entry.count, " 处使用"),
                  editsAreUndoSteps,
                  contrast,
                  value: entry.value,
                  swatches: slotSwatches(rows, entry),
                  popoverTitle: runtime2.COLOR_LABEL,
                  onChange: (color) => {
                    let next = color !== void 0 ? (0, runtime2.slideColorOrUndefined)(color) : void 0;
                    next !== void 0 && restyle.color(entry.id, next.toLowerCase());
                  },
                  onLive: (color) => {
                    let next = (0, runtime2.slideColorOrUndefined)(color);
                    next !== void 0 && restyle.color(entry.id, next.toLowerCase(), !0);
                  },
                  onLiveEnd: () => restyle.end()
                }),
                results?.some((result) => !result.passes) === !0 ? jsxForThemePanel.jsx(runtime2.PropertyRow, {
                  label: "",
                  className: "-mt-0.5 pb-1 [--prop-row-h:0px]",
                  children: jsxForThemePanel.jsx(runtime2.ContrastLockup, {
                    fg: entry.value,
                    results
                  })
                }) : null
              ]
            }, entry.id);
          })
        }),
        jsxForThemePanel.jsx(runtime2.PropertySection, {
          title: "字体",
          children: ["heading", "body"].map((which) => {
            let face = style.families[which], faceLabel = (0, runtime2.lookFaceLabel)(face) ?? "Mixed";
            return jsxForThemePanel.jsx(runtime2.PropertySection, {
              subsection: !0,
              ...group("font-" + which),
              title: sampleTitle(which === "heading" ? "标题" : "正文", { fontFamily: familyCss(face), fontWeight: 400, fontSize: 16 }, faceLabel),
              summary: mutedSummary(faceLabel),
              children: fontRow("字体", face, (picked, deckFace) => restyle.family(which, picked, deckFace))
            }, which);
          })
        }),
        textSlots.length > 0 ? jsxForThemePanel.jsx(runtime2.PropertySection, {
          title: "文字样式",
          children: textSlots.map((slot, index4) => jsxForThemePanel.jsxs(runtime2.PropertySection, {
            subsection: !0,
            ...group("text-" + slot.id),
            title: sampleTitle(LADDER_LABELS[slot.role] + slotNumberSuffix(slot.id), {
              fontFamily: familyCss(slot.family),
              fontWeight: slot.fontWeight,
              fontStyle: slot.italic ? "italic" : "normal",
              letterSpacing: (0, runtime2.letterSpacingEm)(slot),
              textTransform: TEXT_TRANSFORMS.find((transform) => transform === slot.textTransform),
              fontSize: previewSizes[index4]
            }, (0, runtime2.fontVariantLabel)(slot.fontWeight, slot.italic) + ", " + String(slot.fontSize) + " px"),
            summary: mutedSummary((0, runtime2.fontVariantLabel)(slot.fontWeight, slot.italic) + " · " + String(slot.fontSize) + " px"),
            children: [
              fontRow("字体", slot.family, (picked, deckFace) => restyle.textStyle(slot.id, { family: picked }, deckFace !== void 0 ? { face: deckFace } : {})),
              jsxForThemePanel.jsx(runtime2.SelectPropertyRow, {
                label: "字重",
                options: (0, runtime2.fontVariantChoices)((0, runtime2.resolvedFontVariants)(familyOf(slot.family), slot.role, fonts), { weight: slot.fontWeight, italic: slot.italic }),
                value: (0, runtime2.fontVariantKey)(slot.fontWeight, slot.italic),
                placeholder: (0, runtime2.fontVariantLabel)(slot.fontWeight, slot.italic),
                onChange: (value) => {
                  let variant = (0, runtime2.parseFontVariantKey)(value);
                  variant !== void 0 && restyle.textStyle(slot.id, {
                    fontWeight: variant.weight,
                    italic: variant.italic
                  });
                }
              }),
              jsxForThemePanel.jsx(runtime2.NumberPropertyRow, {
                label: "尺寸",
                value: slot.fontSize,
                min: 8,
                max: 400,
                unit: "px",
                ...scrubbed(slot.id, "fontSize")
              }),
              jsxForThemePanel.jsx(runtime2.PropertyRow, {
                label: "间距",
                title: "行高 · 字间距",
                onPress: (row) => row.querySelector("input")?.focus(),
                children: jsxForThemePanel.jsxs("div", {
                  className: "grid min-w-0 flex-1 grid-cols-2 gap-2",
                  children: [
                    jsxForThemePanel.jsx(runtime2.PropertyNumberInput, {
                      "aria-label": "行高",
                      title: "行高",
                      prefix: jsxForThemePanel.jsx(runtime2.PropertyIcon, {
                        icon: runtime2.LINE_HEIGHT_ICON
                      }),
                      value: slot.lineHeight,
                      min: 0.5,
                      max: 4,
                      step: 0.05,
                      steppers: !1,
                      ...scrubbed(slot.id, "lineHeight")
                    }),
                    jsxForThemePanel.jsx(runtime2.PropertyNumberInput, {
                      "aria-label": "字间距",
                      title: "字间距（像素）",
                      prefix: jsxForThemePanel.jsx(runtime2.PropertyIcon, {
                        icon: "LetterSpacing"
                      }),
                      value: slot.letterSpacing,
                      min: -24,
                      max: 32,
                      step: 0.5,
                      steppers: !1,
                      ...scrubbed(slot.id, "letterSpacing")
                    })
                  ]
                })
              })
            ]
          }, slot.id))
        }) : null,
        jsxForThemePanel.jsx(runtime2.ScrollbarOverlay, {})
      ]
    });
  }
  const THEME_TAB_FLAG = "slides_theme_tab";
  function useThemeTabEnabled() {
    let [enabled, setEnabled] = reactForThemeTabFlag.useState(!1);
    return reactForThemeTabFlag.useEffect(() => {
      let live = !0;
      return (0, runtime2.getFeatureFlagAsync)(THEME_TAB_FLAG, !1).then((value) => {
        live && setEnabled(value);
      }), () => {
        live = !1;
      };
    }, []), enabled;
  }
  return bindRuntimeValue(runtime2, "reactForThemePanel", () => reactForThemePanel), bindRuntimeValue(runtime2, "jsxForThemePanel", () => jsxForThemePanel), bindRuntimeValue(runtime2, "ThemePanel", () => ThemePanel), bindRuntimeValue(runtime2, "reactForThemeTabFlag", () => reactForThemeTabFlag), bindRuntimeValue(runtime2, "useThemeTabEnabled", () => useThemeTabEnabled), () => {
    (0, runtime2.initializeSlideRenderer)(), (0, runtime2.initializeRenderingTheme)(), jsxForThemePanel = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), reactForThemePanel = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactForThemeTabFlag = reactForThemePanel;
  };
}
export {
  installDesignSystemThemePanel
};
