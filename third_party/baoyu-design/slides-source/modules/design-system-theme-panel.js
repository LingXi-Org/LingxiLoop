// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDesignSystemThemePanel(runtime2) {
  var reactForThemePanel, jsxForThemePanel, reactForThemeTabFlag, SLOT_BACKGROUND_LABEL, SLOT_TEXT_LABEL, SLOT_MUTED_TEXT_LABEL, SLOT_ACCENT_LABEL, SLOT_OTHER_LABEL, ROLE_LABELS, INVERSE_GROUP_TITLES, INVERSE_SLOT_TITLES, STATUS_SLOT_LABELS, ORIGINAL_LOOK_TITLE, COLORS_TITLE, COLORS_POOR_CONTRAST_LABEL;
  const isInverse = (slot) => slot.role.includes("inverse"), isPage = (slot) => (0, runtime2.isPageSlot)(slot.id), slotNumber = (id) => /-(\d+)$/.exec(id)?.[1], numberedTitle = (name, number) => number !== void 0 ?(0, runtime2.formatMessage)({
    defaultMessage: "{name}（{number}）",id: "A/lvplMuPR"
  }, { name, number }) : name, numberedName = (name, number) => number !== void 0 ?(0, runtime2.formatMessage)({
    defaultMessage: "{name} {number}",id: "uMgXDbc3X2"
  }, { name, number }) : name;
  function slotLabel(slot, others) {
    let [, meaning, part] = /^status-([a-z]+)(?:-([a-z]+))?/.exec(slot.id) ?? [];
    if (meaning !== void 0) {
      let labels = Object.hasOwn(STATUS_SLOT_LABELS, meaning) ? STATUS_SLOT_LABELS[meaning] : void 0;
    return numberedName(labels === void 0 ? ROLE_LABELS.status : part === "soft" ? labels.soft : part === "text" ? labels.text :part === "on" ? labels.on : labels.base, slotNumber(slot.id));
    }
    return slot.role === "other" ? numberedName (SLOT_OTHER_LABEL,others.indexOf(slot) > 0 ? String(others.indexOf(slot) + 1) : void 0) : numberedName( ROLE_LABELS[slot.role], slotNumber(slot.id));
  }
  const inverseGroupLabel = (analysis) => !analysis.colors.some(isPage) && analysis.uses.some((use) => use.prop === "ground" && analysis.colors.some((slot) => slot.id === use.slot && isInverse(slot))) ? "slides" : "boxes", slotTitle = (slot, others, inverseGroup) => isInverse(slot) ? numberedName (INVERSE_SLOT_TITLES[isPage(slot) ? "slides" : inverseGroup][slot.role], slotNumber(slot.id)) : slotLabel(slot, others), MAX_OTHER_SLOTS = 4, MAX_PREVIEW_SLIDE_SIZE = 1e5, slideTooBig = (slide) => JSON.stringify(slide, (_key, value) => typeof value == "string" && value.startsWith("data:") ? "" : value).length > MAX_PREVIEW_SLIDE_SIZE;
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
      searchLabel: runtime2.SEARCH_FONTS_LABEL,
      onOpenChange: (open4) => open4 && (0, runtime2.ensureGoogleFonts)(runtime2.fontFamilyChoices),
      mutedPlaceholder: face === void 0,
      value: (0, runtime2.fontFamilyChoiceValue)(familyOf(face), faces),
      placeholder: face === void 0 ? runtime2.MIXED_LABEL : "",
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
      }, original = restyle.hasOriginal && previous !== void 0 ? (0, runtime2.customLook)(runtime2.ORIGINAL_LOOK, ORIGINAL_LOOK_TITLE, previous.colors, previous.text, previousFaceCss) : current === void 0 ? (0, runtime2.customLook)(runtime2.ORIGINAL_LOOK, ORIGINAL_LOOK_TITLE, Object.fromEntries(style.colors.map((slot) => [slot.id, slot.value])), Object.fromEntries(style.text.map((slot) => [slot.id, slot])), familyCss) : void 0;
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
      className: "flex h-full flex-col overflow-y-auto pb-1 [--pp-label-w:72px] [[data-cds-fizzy-lake~=panels]_&]:[--pp-label-w:4.75rem] " + runtime2.HIDDEN_NATIVE_SCROLLBAR_CLASS,
      children: [
        jsxForThemePanel.jsxs(runtime2.PropertySection, {
          title: (0, runtime2.formatMessage)({
            defaultMessage: "设计系统",
            id: "NneytVUlJk"
          }),
          children: [
            jsxForThemePanel.jsx(runtime2.ThemeLookPicker, {
              looks,
              current: currentChoice,
              ...looks.length === 1 && firstLook !== void 0 && firstLook.themes.length < 2 ? {
                disabledReason: systems.length > 0 ? "此演示文稿只有一个设计系统。请让智能体添加其他设计系统。" : "此演示文稿没有设计系统。请让智能体添加设计系统。"
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
              jsxForThemePanel.jsx("span", {
                "aria-hidden": "true",
                children: COLORS_TITLE
              }),
              jsxForThemePanel.jsx("span", {
                className: "sr-only",
                children: COLORS_POOR_CONTRAST_LABEL
              })
            ]
          }) : COLORS_TITLE,
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
              return inverse.length > 0 ? [pages ? "slides" : inverseGroupLabel(style), ...inverse] : [];
            })
          ].map((entry) => {
            if (typeof entry == "string")
              return jsxForThemePanel.jsx(runtime2.PropertySection, { title: INVERSE_GROUP_TITLES[ entry], subsection: !0 }, entry);
            let label = slotLabel(entry, others), contrast = slotContrast(style, entry), results = contrast !== void 0 ? (0, runtime2.colorContrastResults)(entry.value, contrast) : void 0;
            return jsxForThemePanel.jsxs("div", {
              children: [
                jsxForThemePanel.jsx(runtime2.ColorTextPropertyRow, {
                  label,
                  title:(0, runtime2.formatMessage)({
                    defaultMessage: "{name}：{count} 处使用",
                    id: "Xdg6ymxDUc"
                  }, {
                    n:entry.count,
                    count: String(entry.count),
                    name: slotTitle (entry, others, inverseGroupLabel(style))
                  }),
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
          title: (0, runtime2.formatMessage)({
            defaultMessage: "字体",
            id: "WfzMTdpXbA"
          }),
          children: ["heading", "body"].map((which) => {
            let face = style.families[which];
            return jsxForThemePanel.jsx(runtime2.PropertySection, {
              subsection: !0,
              ...group("font-" + which),
              title: sampleTitle(which === "heading" ? (0, runtime2.formatMessage)({
                defaultMessage: "标题",
                id: "sjcI9NhA7x"
              }) : (0, runtime2.formatMessage)({
                defaultMessage : "正文",
                id: "Ag8Xn7ziGA"
              }), { fontFamily: familyCss(face), fontWeight: 400, fontSize: 16 }, (0, runtime2.lookFaceLabel)(face) ?? "混合"),
              summary: mutedSummary((0, runtime2.lookFaceLabel)(face) ?? (0, runtime2.formatMessage)({
                defaultMessage: "混合",
                id: "hcCRX3Rqwh"
              })),
              children: fontRow(runtime2.FONT_LABEL, face, (picked, deckFace) => restyle.family(which, picked, deckFace))
            }, which);
          })
        }),
        textSlots.length > 0 ? jsxForThemePanel.jsx(runtime2.PropertySection, {
          title: (0, runtime2.formatMessage)({
            defaultMessage: "文字样式",
            id: "MbnpZJV3iH"
          }),
          children: textSlots.map((slot, index4) => jsxForThemePanel.jsxs(runtime2.PropertySection, {
            subsection: !0,
            ...group("text-" + slot.id),
            title: sampleTitle(numberedTitle((0, runtime2.textRoleLabel)(slot.role), slotNumber(slot.id)), {
              fontFamily: familyCss(slot.family),
              fontWeight: slot.fontWeight,
              fontStyle: slot.italic ? "italic" : "normal",
              letterSpacing: (0, runtime2.letterSpacingEm)(slot),
              textTransform: TEXT_TRANSFORMS.find((transform) => transform === slot.textTransform),
              fontSize: previewSizes[index4]
            }, (0, runtime2.fontVariantLabel)(slot.fontWeight, slot.italic) + ", " + String(slot.fontSize) + " px"),
            summary: mutedSummary((0, runtime2.formatMessage)({
              defaultMessage: "{face} · {size} px",
              id: "a9CT7YF7mU"
            }, {
              face: (0, runtime2.fontVariantLabel)(slot.fontWeight, slot.italic),
              size: String(slot.fontSize)
            })),
            children: [
              fontRow(runtime2.FONT_LABEL, slot.family, (picked, deckFace) => restyle.textStyle(slot.id, { family: picked }, deckFace !== void 0 ? { face: deckFace } : {})),
              jsxForThemePanel.jsx(runtime2.SelectPropertyRow, {
                label: runtime2.WEIGHT_LABEL,
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
                label: runtime2.FONT_SIZE_LABEL,
                value: slot.fontSize,
                min: 8,
                max: 400,
                unit: (0, runtime2.literalMessage)( "px"),
                ...scrubbed(slot.id, "fontSize")
              }),
              jsxForThemePanel.jsx(runtime2.PropertyRow, {
                label: runtime2.SPACING_LABEL,
                title: runtime2.SPACING_TITLE,
                onPress: (row) => row.querySelector("input")?.focus(),
                children: jsxForThemePanel.jsxs("div", {
                  className: "grid min-w-0 flex-1 grid-cols-2 gap-2",
                  children: [
                    jsxForThemePanel.jsx(runtime2.PropertyNumberInput, {
                      "aria-label": runtime2.LINE_HEIGHT_LABEL,
                      title: runtime2.LINE_HEIGHT_LABEL,
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
                      "aria-label": runtime2.LETTER_SPACING_NAME,
                      title: runtime2.LETTER_SPACING_LABEL,
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
    (0, runtime2.initializeSlideRenderer)(), (0, runtime2.initializeRenderingTheme)(), jsxForThemePanel = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), reactForThemePanel = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactForThemeTabFlag = reactForThemePanel, SLOT_BACKGROUND_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "背景",
      id: "sEAiImDhqd"
    }), SLOT_TEXT_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "文本",
      id: "EYAjU8tej2"
    }), SLOT_MUTED_TEXT_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "次要文字",
      id: "/jdBUrZ/pj"
    }), SLOT_ACCENT_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "强调色",
      id: "fowct23Jy8"
    }), SLOT_OTHER_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "其他",
      id: "3UNhbWBLS4"
    }), ROLE_LABELS = {
      background: SLOT_BACKGROUND_LABEL,
      surface: (0, runtime2.formatMessage)({
        defaultMessage: "表面",
        id: "+1+O+RkC8E"
      }),
      text: SLOT_TEXT_LABEL,
      muted: SLOT_MUTED_TEXT_LABEL,
      border: (0, runtime2.formatMessage)({
        defaultMessage: "线条",
        id: "RKT0wnBdAd"
      }),
      accent: SLOT_ACCENT_LABEL,
      "accent-soft": (0, runtime2.formatMessage)({
        defaultMessage: "强调色浅色",
        id: "NaXzuRLueg"
      }),
      "on-accent": (0, runtime2.formatMessage)({
        defaultMessage: "强调色上的文字",
        id: "aiF6CNajER"
      }),
      inverse: SLOT_BACKGROUND_LABEL,
      "on-inverse": SLOT_TEXT_LABEL,
      "on-inverse-muted": SLOT_MUTED_TEXT_LABEL,
      "inverse-accent": SLOT_ACCENT_LABEL,
      status: (0, runtime2.formatMessage)({
        defaultMessage: "状态",
        id: "FvokRGnXKz"
      }),
      other: SLOT_OTHER_LABEL
    }, INVERSE_GROUP_TITLES = {
      slides: (0, runtime2.untranslatedMessage)("对比色幻灯片"),
      boxes: (0, runtime2.untranslatedMessage)("对比色文本框")
    }, INVERSE_SLOT_TITLES = {
      slides: {
        inverse: (0, runtime2.untranslatedMessage)("对比色幻灯片，背景"),
        "on-inverse": (0, runtime2.untranslatedMessage)("对比色幻灯片，文本"),
        "on-inverse-muted": (0, runtime2.untranslatedMessage)("对比色幻灯片，次要文本"),
        "inverse-accent": (0, runtime2.untranslatedMessage)("对比色幻灯片，强调色")
      },
      boxes: {
        inverse: (0, runtime2.untranslatedMessage)("对比色文本框，背景"),
        "on-inverse": (0, runtime2.untranslatedMessage)("对比色文本框，文本"),
        "on-inverse-muted": (0, runtime2.untranslatedMessage)("对比色文本框，次要文本"),
        "inverse-accent": (0, runtime2.untranslatedMessage)("对比色文本框，强调色")
      }
    }, STATUS_SLOT_LABELS = {
      good: {
        base: (0, runtime2.formatMessage)({
          defaultMessage: "成功",
          id: "hL4mTvdSuZ"
        }),
        soft: (0, runtime2.formatMessage)({
          defaultMessage: "成功浅色",
          id: "RKXQvWLpiC"
        }),
        text: (0, runtime2.formatMessage)({
          defaultMessage: "成功文字",
          id: "pQCooAPhW1"
        }),
        on: (0, runtime2.formatMessage)({
          defaultMessage: "成功色上的文字",
          id: "ij3GQCih1L"
        })
      },
      warn: {
        base: (0, runtime2.formatMessage)({
          defaultMessage: "警告",
          id: "c8iT5Sq//v"
        }),
        soft: (0, runtime2.formatMessage)({
          defaultMessage: "警告浅色",
          id: "EhAz7acNq6"
        }),
        text: (0, runtime2.formatMessage)({
          defaultMessage: "警告文字",
          id: "vNZ2nIFotS"
        }),
        on: (0, runtime2.formatMessage)({
          defaultMessage: "警告色上的文字",
          id: "+fQ+D3MqtR"
        })
      },
      bad: {
        base: (0, runtime2.formatMessage)({
          defaultMessage: "错误",
          id: "l7SceJfG8Q"
        }),
        soft: (0, runtime2.formatMessage)({
          defaultMessage: "错误浅色",
          id: "CaxM0EfQfM"
        }),
        text: (0, runtime2.formatMessage)({
          defaultMessage: "错误文字",
          id: "74PkdilKmN"
        }),
        on: (0, runtime2.formatMessage)({
          defaultMessage: "错误色上的文字",
          id: "Bfs4RDTgCF"
        })
      },
      info: {
        base: (0, runtime2.formatMessage)({
          defaultMessage: "提示",
          id: "rbXiIVUpCW"
        }),
        soft: (0, runtime2.formatMessage)({
          defaultMessage: "信息浅色",
          id: "1XG16AaDOf"
        }),
        text: (0, runtime2.formatMessage)({
          defaultMessage: "信息文字",
          id: "eiy5VJvYTy"
        }),
        on: (0, runtime2.formatMessage)({
          defaultMessage: "信息色上的文字",
          id: "7X1f3YV4gr"
        })
      }
    }, ORIGINAL_LOOK_TITLE = (0, runtime2.untranslatedMessage)("原始样式"), COLORS_TITLE = (0, runtime2.formatMessage)({
      defaultMessage: "颜色",
      id: "EQSy5MzMAz"
    }), COLORS_POOR_CONTRAST_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "颜色，对比度不足",
      id: "fkYdFxicZr"
    });
  };
}
export {
  installDesignSystemThemePanel
};
