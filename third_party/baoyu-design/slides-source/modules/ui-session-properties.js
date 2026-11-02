// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiSessionProperties(runtime2) {
  var reactD9, jsxpJ, SELECTION_HOVER_CLASS, SESSION_POPOVER_CLOSE_DELAY_MS, isTextInputEventTarget, SESSION_POPUP_SELECTOR, SESSION_POPUP_ATTRIBUTES, SESSION_POPUP_ITEM_SELECTORS, SESSION_POPUP_PRESSED_SELECTOR, SESSION_POPUP_ENABLED_SELECTOR, sessionPopupInitialFocus, preserveSessionSelection, IMAGE_CHECKERBOARD_BACKGROUND;
  function useSessionPopupKeyboardFocus(open4, toggle) {
    let [value, value2] = reactD9.useState(!1), ref = reactD9.useRef(null), callback = () => sessionPopupInitialFocus(ref.current);
    return {
      byKey: value,
      body: ref,
      initialFocus: callback,
      keyed: {
        onKeyDown: (event) => {
          if (event.key === "Enter" || event.key === " ")
            value2(!0);
          else if (event.key === "ArrowDown" && !event.defaultPrevented && !event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
            let currentTarget = event.currentTarget;
            for (let value3 of document.querySelectorAll(runtime2.OPEN_OVERLAY_SELECTOR))
              if (!(value3.matches("[data-mc-scrim]") || (0, runtime2.isOverlayClosed)(value3)) && !(currentTarget instanceof Node && value3.contains(currentTarget)) && !(open4 && ref.current !== null && value3.contains(ref.current)))
                return;
            if (open4) {
              let value3 = ref.current?.closest("[data-mc-popover]") ?? null, value4 = callback() ?? (value3 !== null ? (0, runtime2.collectFocusableDescendants)(value3)[0] ?? null : null);
              if (value4 === null)
                return;
              event.preventDefault(), value2(!0), value4.focus();
              return;
            }
            event.preventDefault(), value2(!0), toggle();
          }
        },
        onPointerDown: () => value2(!1)
      }
    };
  }
  function SessionPropertyPopover({ testid, title, icon, readout, disabled: disabled2, align: align2 = "left", popoverClassName, editsAreUndoSteps, children }) {
    let [value, value2] = reactD9.useState(!1), { byKey, body, initialFocus, keyed } = useSessionPopupKeyboardFocus(value, () => value2(!0)), value3 = typeof icon == "string" ? icon : jsxpJ.jsx(runtime2.PropertyIcon, {
      icon
    }), value4 = readout === void 0 ? jsxpJ.jsx(runtime2.ToolbarStripButton, {
      "data-testid": testid,
      icon: value3,
      title,
      "aria-label": title,
      className: value ? SELECTION_HOVER_CLASS : void 0,
      disabled: disabled2,
      ...keyed
    }) : jsxpJ.jsx(runtime2.ToolbarStripButton, {
      "data-testid": testid,
      icon: value3,
      title,
      "aria-label": title,
      className: value ? SELECTION_HOVER_CLASS : void 0,
      disabled: disabled2,
      chevron: !0,
      ...keyed,
      children: jsxpJ.jsx("span", {
        className: "tabular-nums",
        children: readout
      })
    });
    return jsxpJ.jsx("span", {
      className: "relative inline-flex",
      children: jsxpJ.jsx(runtime2.PropertyPopup, {
        open: value,
        onOpen: () => value2(!0),
        onClose: () => value2(!1),
        trigger: value4,
        align: align2,
        focusOnOpen: byKey,
        initialFocus,
        keepFocus: !0,
        padding: "none",
        className: (0, runtime2.joinClassNames)("p-2", popoverClassName),
        editsAreUndoSteps,
        children: jsxpJ.jsx("div", {
          ref: body,
          "data-session-strip": "",
          onKeyDownCapture: runtime2.popupPointerEvent,
          children: typeof children == "function" ? children(() => value2(!1)) : children
        })
      })
    });
  }
  function SessionChoicePopover({ testid, title, face, value, options, onChange, disabled: disabled2 }) {
    return jsxpJ.jsx(SessionPropertyPopover, {
      testid,
      title,
      icon: face,
      popoverClassName: "min-w-0!",
      disabled: disabled2,
      children: (input) => jsxpJ.jsx("div", {
        role: "group",
        "aria-label": title,
        "data-icon-row": "",
        className: "flex items-center gap-1",
        onKeyDown: (0, runtime2.createOptionListKeyHandler)("button", {
          across: !0
        }),
        children: options.map((input2) => jsxpJ.jsx(runtime2.ToolbarStripButton, {
          "data-testid": testid ? testid + "-" + input2.value : void 0,
          icon: typeof input2.icon == "string" ? input2.icon : jsxpJ.jsx(runtime2.Icon, {
            customIcon: input2.icon,
            size: "auto",
            className: "shrink-0"
          }),
          title: input2.disabledReason ?? input2.label,
          "aria-label": input2.label,
          "aria-pressed": input2.disabledReason !== void 0 ? void 0 : input2.value === value,
          disabled: input2.disabledReason !== void 0,
          onClick: () => {
            input(), input2.value !== value && onChange(input2.value);
          }
        }, input2.value))
      })
    });
  }
  function SessionTextStylePopover({ testid, value, chipText, options, onChange, custom, systemHeader }) {
    let [value2, value3] = reactD9.useState(!1), { byKey, body, initialFocus, keyed } = useSessionPopupKeyboardFocus(value2, () => value3(!0)), value4 = options.length > 0 || systemHeader != null, [value5, value6] = reactD9.useState("system"), value7 = value4 ? value5 : "custom", value8 = options.some((input) => input.group !== void 0) || options.length > runtime2.OPTION_LIST_MAX_HEIGHT, [value9, value10] = reactD9.useState("");
    !value2 && value9 !== "" && value10("");
    let value11 = value8 ? value9.trim().toLowerCase() : "", value12 = options.filter((input) => (0, runtime2.optionMatchesQuery)(value11, input.text, input.hint, input.subgroup, input.group)), value13 = options.reduce((input, options2, context) => {
      let value16 = options2.group !== void 0 && options2.group !== options[context - 1]?.group;
      return input + 1 + (value16 ? 1 : 0) + (options2.subgroup !== void 0 && (value16 || options2.subgroup !== options[context - 1]?.subgroup) ? 1 : 0);
    }, 0), value14 = value4 ? Math.max(SESSION_POPOVER_CLOSE_DELAY_MS, 52 + (systemHeader != null ? 40 : 0) + (value8 ? 36 : 0) + Math.min(384, 32 * value13)) : void 0, value15 = jsxpJ.jsx(runtime2.ToolbarStripButton, {
      "data-testid": testid,
      "data-mc-bordered": "",
      title: "文字样式",
      chevron: !0,
      className: (0, runtime2.joinClassNames)("rounded-lg border border-border-line px-2", value2 && SELECTION_HOVER_CLASS),
      ...keyed,
      children: jsxpJ.jsxs("span", {
        className: "inline-flex items-center gap-1.5",
        children: [
          jsxpJ.jsx(runtime2.KitIcon, {
            name: "TextAa",
            size: 13,
            className: "text-muted"
          }),
          jsxpJ.jsx("span", {
            className: "min-w-14 max-w-40 truncate text-left",
            children: chipText
          })
        ]
      })
    });
    return jsxpJ.jsx("span", {
      "data-mc-style-chip": "",
      className: "relative inline-flex",
      children: jsxpJ.jsx(runtime2.PropertyPopup, {
        open: value2,
        onOpen: () => value3(!0),
        onClose: () => value3(!1),
        trigger: value15,
        align: "left",
        focusOnOpen: byKey,
        initialFocus,
        keepFocus: !0,
        padding: "none",
        planHeight: value14,
        className: "w-60 p-2 pointer-coarse:w-auto pointer-coarse:min-w-60",
        children: jsxpJ.jsxs("div", {
          ref: body,
          "data-session-strip": "",
          onKeyDownCapture: runtime2.popupPointerEvent,
          children: [
            value4 ? jsxpJ.jsx(runtime2.ColorHexInput, {
              value: value7,
              onChange: value6
            }) : null,
            value7 === "system" ? jsxpJ.jsxs("div", {
              role: "group",
              "aria-label": "文字样式",
              children: [
                systemHeader,
                jsxpJ.jsxs("div", {
                  "data-search-scope": "",
                  onKeyDown: (0, runtime2.createOptionListKeyHandler)('[data-kit="MenuItem"]'),
                  children: [
                    value8 ? jsxpJ.jsx(runtime2.OptionList, {
                      value: value9,
                      onChange: value10,
                      label: runtime2.STYLE_SEARCH_LABEL,
                      rowSelector: '[data-kit="MenuItem"]',
                      onEnterIndex: () => (0, runtime2.optionTypeaheadMatch)(value11, value12.map((input) => input.text)),
                      "data-testid": testid ? testid + "-search" : void 0
                    }) : null,
                    value12.length === 0 ? jsxpJ.jsx("p", {
                      role: "status",
                      className: "px-2 py-1 text-footnote text-muted",
                      children: runtime2.NO_COLOR_MATCHES_LABEL
                    }) : null,
                    jsxpJ.jsx("div", {
                      className: "kit-scrollbar max-h-[min(24rem,max(6rem,calc(var(--available-height,100vh)_-_8rem)))] overflow-y-auto",
                      children: value12.map((input, options2) => {
                        let value16 = input.group !== void 0 && input.group !== value12[options2 - 1]?.group, value17 = input.subgroup !== void 0 && (value16 || input.subgroup !== value12[options2 - 1]?.subgroup);
                        return jsxpJ.jsxs(reactD9.Fragment, {
                          children: [
                            value16 ? jsxpJ.jsx(runtime2.ColorPickerHeader, {
                              text: input.group,
                              title: !0
                            }) : null,
                            value17 ? jsxpJ.jsx(runtime2.ColorPickerHeader, {
                              text: input.subgroup
                            }) : null,
                            jsxpJ.jsx(runtime2.PropertyMenuItem, {
                              checked: input.value === value,
                              title: input.title,
                              "data-testid": testid ? testid + "-" + input.value : void 0,
                              onClick: () => {
                                value3(!1), input.value !== value && onChange(input.value);
                              },
                              children: jsxpJ.jsxs("span", {
                                className: "flex min-w-0 flex-1 items-center gap-0.5",
                                style: {
                                  lineHeight: "27px"
                                },
                                children: [
                                  jsxpJ.jsx("span", {
                                    className: "flex min-w-0 overflow-x-clip pe-1 [font-variation-settings:normal]",
                                    children: input.label
                                  }),
                                  input.hint !== void 0 ? jsxpJ.jsx("span", {
                                    className: "shrink-0 text-footnote text-muted",
                                    children: input.hint
                                  }) : null
                                ]
                              })
                            })
                          ]
                        }, input.value);
                      })
                    })
                  ]
                })
              ]
            }) : "body" in custom ? jsxpJ.jsx("div", {
              className: "flex flex-col gap-2",
              "aria-label": "自定义文字样式",
              children: custom.body
            }) : jsxpJ.jsx(CustomTextStylePanel, {
              c: custom
            })
          ]
        })
      })
    });
  }
  function CustomTextStylePanel({ c }) {
    return jsxpJ.jsxs("div", {
      className: "flex flex-col gap-2",
      "aria-label": "自定义文字样式",
      children: [
        jsxpJ.jsx("div", {
          className: "flex",
          children: jsxpJ.jsx(runtime2.Select, {
            "aria-label": "字体",
            items: c.family.options,
            value: c.family.value,
            onChange: c.family.onChange,
            searchable: c.family.searchable,
            searchLabel: "搜索字体",
            quietCaptions: !0,
            onOpenChange: c.family.onOpenChange,
            popupAttrs: SESSION_POPUP_ATTRIBUTES
          })
        }),
        jsxpJ.jsxs("div", {
          className: "grid grid-cols-2 gap-2",
          children: [
            jsxpJ.jsx(runtime2.Select, {
              "aria-label": "字重",
              items: (0, runtime2.fontVariantChoices)(c.face.faces, c.face),
              value: (0, runtime2.fontVariantKey)(c.face.weight, c.face.italic),
              onOpenChange: c.face.onOpenChange,
              onChange: (input) => {
                let value = (0, runtime2.parseFontVariantKey)(input);
                value !== void 0 && c.face.onChange(value.weight, value.italic);
              },
              popupAttrs: SESSION_POPUP_ATTRIBUTES
            }),
            jsxpJ.jsx(runtime2.PropertyNumberInput, {
              "aria-label": "字号",
              unit: "px",
              title: "字号（像素），留空使用样式默认值",
              clearable: !0,
              ...c.size
            }),
            jsxpJ.jsx(runtime2.PropertyNumberInput, {
              prefix: jsxpJ.jsx(runtime2.PropertyIcon, {
                icon: runtime2.LINE_HEIGHT_ICON
              }),
              "aria-label": "行高",
              title: "行高（字号的倍数）",
              clearable: !0,
              ...c.lineHeight,
              step: c.lineHeight.step ?? 0.05
            }),
            jsxpJ.jsx(runtime2.PropertyNumberInput, {
              prefix: jsxpJ.jsx(runtime2.PropertyIcon, {
                icon: "LetterSpacing"
              }),
              "aria-label": "字间距",
              unit: "px",
              title: "字间距（像素）",
              clearable: !0,
              ...c.letterSpacing,
              step: c.letterSpacing.step ?? 0.5
            })
          ]
        })
      ]
    });
  }
  function SessionColorPopover(props) {
    let [value, value2] = reactD9.useState(!1), ref = reactD9.useRef(props.onOpenChange);
    ref.current = props.onOpenChange, reactD9.useEffect(() => ref.current?.(value), [value]);
    let { byKey, body, initialFocus, keyed } = useSessionPopupKeyboardFocus(value, () => value2(!0)), value3 = props.custom !== void 0 && props.swatches.some((input) => input.empty !== !0 && input.name !== "default"), value4 = jsxpJ.jsx(runtime2.ToolbarStripButton, {
      "data-testid": props.testid,
      title: props.title,
      "aria-label": props.title,
      icon: jsxpJ.jsx(SessionSwatchDot, {
        css: props.paint
      }),
      className: value ? SELECTION_HOVER_CLASS : void 0,
      ...keyed
    });
    return jsxpJ.jsx("span", {
      className: "relative inline-flex",
      children: jsxpJ.jsx(runtime2.PropertyPopup, {
        open: value,
        onOpen: () => value2(!0),
        onClose: () => value2(!1),
        trigger: value4,
        align: "left",
        focusOnOpen: byKey,
        initialFocus,
        keepFocus: !0,
        padding: "none",
        planHeight: value3 || props.kind !== void 0 ? runtime2.COLOR_PICKER_POPOVER_HEIGHT : void 0,
        className: runtime2.COLOR_PICKER_POPOVER_CLASS,
        editsAreUndoSteps: props.editsAreUndoSteps,
        children: jsxpJ.jsx("div", {
          ref: body,
          "data-session-strip": "",
          onKeyDownCapture: runtime2.popupPointerEvent,
          onMouseDown: preserveSessionSelection,
          children: jsxpJ.jsx(runtime2.SwatchPalette, {
            testid: props.testid,
            title: props.title,
            swatches: props.swatches,
            current: props.value,
            onSwatch: (input) => {
              props.onSwatch(input);
              let value5 = props.custom?.contrast;
              if (value5 === void 0 || props.custom?.quietSwatch === !0)
                return;
              let value6 = props.swatches.find((input2) => input2.name === input)?.color;
              value6 !== void 0 && (0, runtime2.announceLiveMessage)(() => {
                let value7 = (0, runtime2.colorContrastResults)(value6, value5);
                return value7 === void 0 ? null : (0, runtime2.contrastDisplayInfo)(value7).spoken;
              });
            },
            onPicked: () => value2(!1),
            fold: !0,
            color: props.custom !== void 0 ? {
              value: props.custom.seed,
              unset: props.custom.unset,
              opaque: props.custom.opaque,
              onChange: props.custom.onChange,
              onPickEnd: props.custom.onPickEnd,
              contrast: props.custom.contrast
            } : void 0,
            kind: props.kind,
            face: props.face
          })
        })
      })
    });
  }
  function SessionSwatchDot({ css }) {
    return jsxpJ.jsx("span", {
      "aria-hidden": "true",
      "data-swatch-dot": "",
      className: (0, runtime2.joinClassNames)("inline-block h-4 w-4 shrink-0 rounded-[4px] border border-border-strong pointer-coarse:h-5 pointer-coarse:w-5", css === void 0 && "border-dashed"),
      style: (0, runtime2.swatchPreviewStyle)(css)
    });
  }
  function isScrollbarMouseDown(event) {
    let target = event.target;
    return target.scrollHeight > target.clientHeight && event.nativeEvent.offsetX >= target.clientWidth;
  }
  function SessionNumberField({ testid, title, label, icon, value, min: min2, max: max2, maxReason, hint, onValue }) {
    let [value2, value3] = reactD9.useState(null), ref = reactD9.useRef(null), callback = (input) => {
      input !== void 0 && Math.round(input) !== value && onValue(Math.round(input));
    };
    return jsxpJ.jsx("span", {
      "data-testid": testid,
      className: "inline-flex w-[76px]",
      children: jsxpJ.jsx(runtime2.PropertyNumberInput, {
        prefix: jsxpJ.jsx(runtime2.PropertyIcon, {
          icon
        }),
        "aria-label": label,
        title: value >= max2 ? maxReason ?? title : hint !== void 0 ? title + ". " + hint : title,
        value: value2 ?? value,
        min: min2,
        max: max2,
        step: 1,
        onValue: callback,
        onScrub: (input) => {
          ref.current = input, value3(input);
        },
        onScrubEnd: () => {
          let current = ref.current;
          ref.current = null, value3(null), callback(current ?? void 0);
        }
      })
    });
  }
  function SessionImageReplaceButton({ src, title, onClick, disabled: disabled2 }) {
    return jsxpJ.jsx(runtime2.ToolbarStripButton, {
      "data-testid": "frame-image-replace",
      title,
      "aria-label": title,
      disabled: disabled2,
      onClick,
      className: "px-1",
      children: src !== void 0 ? jsxpJ.jsx("img", {
        alt: "",
        "aria-hidden": "true",
        src,
        draggable: !1,
        style: {
          background: IMAGE_CHECKERBOARD_BACKGROUND
        },
        className: "h-5 w-5 shrink-0 rounded-[4px] border border-border-strong object-cover pointer-coarse:h-7 pointer-coarse:w-7"
      }) : jsxpJ.jsx("span", {
        "aria-hidden": "true",
        className: "inline-block h-5 w-5 rounded-[4px] border border-dashed border-border-strong pointer-coarse:h-7 pointer-coarse:w-7"
      })
    });
  }
  return bindRuntimeValue(runtime2, "reactD9", () => reactD9, (value) => {
    reactD9 = value;
  }), bindRuntimeValue(runtime2, "jsxpJ", () => jsxpJ, (value) => {
    jsxpJ = value;
  }), bindRuntimeValue(runtime2, "SELECTION_HOVER_CLASS", () => SELECTION_HOVER_CLASS, (value) => {
    SELECTION_HOVER_CLASS = value;
  }), bindRuntimeValue(runtime2, "SESSION_POPOVER_CLOSE_DELAY_MS", () => SESSION_POPOVER_CLOSE_DELAY_MS, (value) => {
    SESSION_POPOVER_CLOSE_DELAY_MS = value;
  }), bindRuntimeValue(runtime2, "isTextInputEventTarget", () => isTextInputEventTarget, (value) => {
    isTextInputEventTarget = value;
  }), bindRuntimeValue(runtime2, "SESSION_POPUP_SELECTOR", () => SESSION_POPUP_SELECTOR, (value) => {
    SESSION_POPUP_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "SESSION_POPUP_ATTRIBUTES", () => SESSION_POPUP_ATTRIBUTES, (value) => {
    SESSION_POPUP_ATTRIBUTES = value;
  }), bindRuntimeValue(runtime2, "useSessionPopupKeyboardFocus", () => useSessionPopupKeyboardFocus), bindRuntimeValue(runtime2, "SESSION_POPUP_ITEM_SELECTORS", () => SESSION_POPUP_ITEM_SELECTORS, (value) => {
    SESSION_POPUP_ITEM_SELECTORS = value;
  }), bindRuntimeValue(runtime2, "SESSION_POPUP_PRESSED_SELECTOR", () => SESSION_POPUP_PRESSED_SELECTOR, (value) => {
    SESSION_POPUP_PRESSED_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "SESSION_POPUP_ENABLED_SELECTOR", () => SESSION_POPUP_ENABLED_SELECTOR, (value) => {
    SESSION_POPUP_ENABLED_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "sessionPopupInitialFocus", () => sessionPopupInitialFocus, (value) => {
    sessionPopupInitialFocus = value;
  }), bindRuntimeValue(runtime2, "SessionPropertyPopover", () => SessionPropertyPopover), bindRuntimeValue(runtime2, "SessionChoicePopover", () => SessionChoicePopover), bindRuntimeValue(runtime2, "SessionTextStylePopover", () => SessionTextStylePopover), bindRuntimeValue(runtime2, "CustomTextStylePanel", () => CustomTextStylePanel), bindRuntimeValue(runtime2, "SessionColorPopover", () => SessionColorPopover), bindRuntimeValue(runtime2, "preserveSessionSelection", () => preserveSessionSelection, (value) => {
    preserveSessionSelection = value;
  }), bindRuntimeValue(runtime2, "SessionSwatchDot", () => SessionSwatchDot), bindRuntimeValue(runtime2, "isScrollbarMouseDown", () => isScrollbarMouseDown), bindRuntimeValue(runtime2, "SessionNumberField", () => SessionNumberField), bindRuntimeValue(runtime2, "IMAGE_CHECKERBOARD_BACKGROUND", () => IMAGE_CHECKERBOARD_BACKGROUND, (value) => {
    IMAGE_CHECKERBOARD_BACKGROUND = value;
  }), bindRuntimeValue(runtime2, "SessionImageReplaceButton", () => SessionImageReplaceButton), () => {
    (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiAnnouncements)(), (0, runtime2.initializeUiColorPicker)(), (0, runtime2.initializeUiPropertySearch)(), (0, runtime2.initializeColorSelect)(), (0, runtime2.initializeUiContrast)(), (0, runtime2.initializeUiContrastControls)(), (0, runtime2.initializeUiPropertyIcons)(), (0, runtime2.initializeUiNumberControls2)(), (0, runtime2.initializeUiPropertyPopover2)(), (0, runtime2.initializeUiPropertyFocus)(), (0, runtime2.initializeSelect)(), (0, runtime2.initializeFontVariants)(), reactD9 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeUiInspectorIcons)(), (0, runtime2.initializeUiPropertyLabels)(), jsxpJ = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SELECTION_HOVER_CLASS = "bg-fill-ghost-hover", SESSION_POPOVER_CLOSE_DELAY_MS = 180, isTextInputEventTarget = (target) => target instanceof Element && target.closest(runtime2.TEXT_EDITABLE_SELECTOR) !== null, SESSION_POPUP_SELECTOR = '[data-session-strip="popup"]', SESSION_POPUP_ATTRIBUTES = {
      "data-session-strip": "popup"
    }, SESSION_POPUP_ITEM_SELECTORS = [
      '[data-kit="MenuItem"]',
      "[data-swatch]",
      "[data-icon-row] button"
    ], SESSION_POPUP_PRESSED_SELECTOR = SESSION_POPUP_ITEM_SELECTORS.map((input) => input + '[aria-pressed="true"]:not(:disabled)').join(", "), SESSION_POPUP_ENABLED_SELECTOR = SESSION_POPUP_ITEM_SELECTORS.map((input) => input + ":not(:disabled)").join(", "), sessionPopupInitialFocus = (popup) => popup?.querySelector(SESSION_POPUP_PRESSED_SELECTOR) ?? popup?.querySelector(SESSION_POPUP_ENABLED_SELECTOR) ?? null, preserveSessionSelection = (event) => {
      !isTextInputEventTarget(event.target) && !isScrollbarMouseDown(event) && event.preventDefault();
    }, IMAGE_CHECKERBOARD_BACKGROUND = "repeating-conic-gradient(#a8a6a0 0% 25%, #d2d0ca 0% 50%) 0 / 8px 8px padding-box";
  };
}
export {
  installUiSessionProperties
};
