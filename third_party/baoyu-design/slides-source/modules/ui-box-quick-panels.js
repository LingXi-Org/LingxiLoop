// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiBoxQuickPanels(runtime2) {
  var reactU_, jsxk5, BORDER_SIDE_MENU_ORDER, BORDER_SIDE_NAMES, BORDER_SIDE_TOGGLE_LABELS, BORDER_SIDE_WIDTH_LABELS, BORDER_SIDE_WIDTH_TITLES, BORDER_SIDE_SHORT_LABELS, BORDER_STYLE_VALUES, BORDER_STYLE_LABELS, BORDER_STYLE_ICONS, QUICK_PANEL_CLASS, QUICK_PANEL_POPOVER_POSITION, QUICK_PANEL_HINT_CLASS, CORNER_KEYS, CORNER_SHORT_LABELS, CORNER_RADIUS_LABELS, SIDE_SPACING_LABELS;
  function preserveQuickPanelSelection(event) {
    event.target.closest(runtime2.TEXT_EDITABLE_SELECTOR) || event.preventDefault();
  }
  function QuickPanelButton({ icon, label, pressed: pressed3, disabledReason, hint, onClick }) {
    return jsxk5.jsx(runtime2.ToolbarStripButton, {
      icon: jsxk5.jsx(runtime2.PropertyIcon, {
        icon
      }),
      "aria-label": label,
      "aria-pressed": pressed3,
      title: disabledReason ?? hint,
      disabled: disabledReason !== void 0,
      onClick
    });
  }
  function BorderQuickPanel({ style, width, sides: sides2, color, onChange, onLive, onLiveEnd, supports, widths }) {
    let value = widths !== void 0 ? BORDER_SIDE_NAMES.map((input) => widths.value[input] ?? 0).filter((input) => input > 0) : [], value2 = new Set(value).size > 1, [value3, value4] = reactU_.useState(sides2 !== void 0 || value2), value5 = (style ?? "none") === "none", value6 = sides2 ?? BORDER_SIDE_NAMES, value7 = supports.sides === !0 && (value3 || sides2 !== void 0 || value2), callback = (input) => {
      let value8 = BORDER_SIDE_NAMES.filter((input2) => input2 === input ? !value6.includes(input) : value6.includes(input2));
      onChange({
        sides: value8.length === BORDER_SIDE_NAMES.length ? void 0 : value8
      });
    }, weightLabel = (0, runtime2.formatMessage)({
      defaultMessage: "边框粗细",
      id: "LEOVTMc7aU"
    }), callback2 = () => jsxk5.jsx(QuickPanelButton, {
      icon: runtime2.BORDER_SIDES_ICON,
      label: (0, runtime2.formatMessage)({
        defaultMessage: "分别设置边框",
        id: "GZq2EzZuHe"
      }),
      pressed: value7,
      hint: widths !== void 0 ? (0, runtime2.formatMessage)({
        defaultMessage: "分别设置各边宽度",
        id: "K7px0sma1M"
      }) : (0, runtime2.formatMessage)({
        defaultMessage : "选择显示哪些边",
        id: "6BTAFzj5vh"
      }),
      disabledReason: supports.sides === !0 ? value5 ? (0, runtime2.formatMessage)({
        defaultMessage: "请先选择边框样式",
        id: "LjbPMmCba/"
      }) : void 0 : supports.sides,
      onClick: () => {
        value7 ? (value4(!1), (sides2 !== void 0 || value2) && onChange({
          sides: void 0
        })) : value4(!0);
      }
    });
    return jsxk5.jsxs("div", {
      className: QUICK_PANEL_CLASS,
      onMouseDown: preserveQuickPanelSelection,
      "data-quick-panel": "border",
      children: [
        jsxk5.jsx(runtime2.SegmentedControl, {
          "aria-label": (0, runtime2.formatMessage)({
            defaultMessage: "边框样式",
            id: "6HT+Uweqvu"
          }),
          fullWidth: !0,
          value: style ?? "none",
          onChange: (input) => onChange({
            style: input
          }),
          segments: BORDER_STYLE_VALUES.map((input) => ({
            value: input,
            ...input === "none" ? {
              icon: "Prohibit"
            } : {
              label: jsxk5.jsxs(jsxk5.Fragment, {
                children: [
                  jsxk5.jsx(runtime2.PropertyIcon, {
                    icon: BORDER_STYLE_ICONS[input]
                  }),
                  jsxk5.jsx("span", {
                    className: "sr-only",
                    children: BORDER_STYLE_LABELS[input]
                  })
                ]
              })
            },
            tooltip: BORDER_STYLE_LABELS[input],
            disabled: !supports.styles.includes(input),
            disabledReason: supports.styleReason
          }))
        }),
        jsxk5.jsxs("fieldset", {
          disabled: value5,
          className: (0, runtime2.joinClassNames)("m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0", value5 && "opacity-60"),
          children: [
            jsxk5.jsx("div", {
              className: "min-w-0",
              children: color
            }),
            jsxk5.jsx("div", {
              className: "grid grid-cols-[1fr_1fr_auto] items-center gap-1.5",
              role: "group",
              "aria-label": value7 && widths !== void 0 ? (0, runtime2.formatMessage)({
                defaultMessage: "各边宽度",
                id: "qMAeOb0Fux"
              }) : void 0,
              children: value7 && widths !== void 0 ? BORDER_SIDE_MENU_ORDER.map((input, options) => input === null ? options === 2 ? jsxk5.jsx(reactU_.Fragment, {
                children: callback2()
              }, "toggle") : jsxk5.jsx("span", {}, "gap") : jsxk5.jsx(runtime2.PropertyNumberInput, {
                prefix: BORDER_SIDE_SHORT_LABELS[input],
                "aria-label": BORDER_SIDE_WIDTH_LABELS[input],
                title: BORDER_SIDE_WIDTH_TITLES[input],
                value: widths.value[input],
                min: 0,
                max: supports.widthMax,
                step: 1,
                disabled: value5,
                onValue: (input2) => widths.onChange({
                  [input]: input2 ?? 0
                }),
                onScrub: widths.onLive ? (input2) => widths.onLive({
                  [input]: input2
                }) : void 0,
                onScrubEnd: widths.onLiveEnd
              }, input)) : jsxk5.jsxs(jsxk5.Fragment, {
                children: [
                  jsxk5.jsx("div", {
                    className: "col-span-2 min-w-0",
                    children: jsxk5.jsx(runtime2.PropertyNumberInput, {
                      prefix: jsxk5.jsx(runtime2.PropertyIcon, {
                        icon: runtime2.BORDER_WEIGHT_ICON
                      }),
                      "aria-label": weightLabel,
                      unit: "px",
                      title: weightLabel,
                      value: value2 ? void 0 : width,
                      min: 1,
                      max: supports.widthMax,
                      step: 1,
                      clearable: !value2,
                      placeholder: value2 ? void 0 : "0",
                      hint: value2 ? runtime2.MIXED_LABEL : void 0,
                      disabled: value5,
                      onValue: (input) => {
                        (input !== void 0 || !value2) && onChange({
                          width: input
                        });
                      },
                      onScrub: onLive ? (input) => onLive({
                        width: input
                      }) : void 0,
                      onScrubEnd: onLiveEnd
                    })
                  }),
                  callback2()
                ]
              })
            }),
            value7 && widths === void 0 && jsxk5.jsx("div", {
              className: "grid grid-cols-4 gap-0.5 rounded-md bg-fill-field p-0.5",
              role: "group",
              "aria-label": (0, runtime2.formatMessage)({
                defaultMessage: "边",
                id: "ikVP/7XN7e"
              }),
              children: BORDER_SIDE_NAMES.map((input) => {
                let value8 = value6.includes(input), value9 = value8 && value6.length === 1;
                return jsxk5.jsx(runtime2.ToolbarStripButton, {
                  "aria-label": BORDER_SIDE_TOGGLE_LABELS[input],
                  "aria-pressed": value8,
                  className: "justify-center",
                  disabled: value5 || value9,
                  title: value9 ? (0, runtime2.formatMessage)({
                    defaultMessage: "将样式设为“无”即可移除边框",
                    id : "S62DrOUgwb"
                  }) : BORDER_SIDE_TOGGLE_LABELS[input],
                  onClick: () => callback(input),
                  children: BORDER_SIDE_SHORT_LABELS[input]
                }, input);
              })
            })
          ]
        })
      ]
    });
  }
  function CornerRadiusField(binding, corner, max2, fallback) {
    return jsxk5.jsx(runtime2.PropertyNumberInput, {
      prefix: CORNER_SHORT_LABELS[ corner],
      "aria-label": CORNER_RADIUS_LABELS[corner],
      title: CORNER_RADIUS_LABELS[corner],
      value: binding.value[corner],
      min: 0,
      max: max2,
      step: 1,
      clearable: !0,
      placeholder: String(fallback ?? 0),
      onValue: (input) => binding.onChange({
        [corner]: input
      }),
      onScrub: binding.onLive ? (input) => binding.onLive?.({
        [corner]: input
      }) : void 0,
      onScrubEnd: binding.onLiveEnd
    });
  }
  function CornerQuickPanel({ radius, max: max2, onChange, onLive, onLiveEnd, individualReason, corners }) {
    let value = corners !== void 0 && new Set(CORNER_KEYS.map((input) => corners.value[input])).size > 1, [value2, value3] = reactU_.useState(value), value4 = corners !== void 0 && value2, radiusLabel = (0, runtime2.formatMessage)({
      defaultMessage: "圆角",
      id: "KNLHV0wZu+"
    }), value5 = jsxk5.jsx(QuickPanelButton, {
      icon: runtime2.INDIVIDUAL_CORNERS_ICON,
      label: (0, runtime2.formatMessage)({
        defaultMessage: "分别设置圆角",
        id: "i832/c/Qew"
      }),
      pressed: value4,
      hint: (0, runtime2.formatMessage)({
        defaultMessage: "分别设置各个圆角",
        id: "nAshckYqbP"
      }),
      disabledReason: corners === void 0 ? individualReason ?? (0, runtime2.formatMessage)({
        defaultMessage: "所有圆角使用相同半径",
        id: "gGbVgB60Yo"
      }) : void 0,
      onClick: () => {
        value4 && value && corners !== void 0 && onChange(Math.max(...CORNER_KEYS.map((input) => corners.value[input] ?? 0))), value3(!value4);
      }
    });
    return jsxk5.jsx("div", {
      className: QUICK_PANEL_CLASS,
      onMouseDown: preserveQuickPanelSelection,
      "data-quick-panel": "corner",
      children: value4 && corners !== void 0 ? jsxk5.jsxs("div", {
        className: "grid grid-cols-[1fr_1fr_auto] items-center gap-1.5",
        children: [
          CornerRadiusField(corners, "tl", max2, radius),
          CornerRadiusField(corners, "tr", max2, radius),
          value5,
          CornerRadiusField(corners, "bl", max2, radius),
          CornerRadiusField(corners, "br", max2, radius),
          jsxk5.jsx("span", {})
        ]
      }) : jsxk5.jsxs("div", {
        className: "flex items-center gap-1.5",
        children: [
          jsxk5.jsx("div", {
            className: "min-w-0 flex-1",
            children: jsxk5.jsx(runtime2.PropertyNumberInput, {
              "aria-label": radiusLabel,
              unit: "px",
              title: radiusLabel,
              value: value ? void 0 : radius,
              min: 0,
              max: max2,
              step: 1,
              clearable: !value,
              placeholder: value ? void 0 : "0",
              hint: value ? runtime2.MIXED_LABEL : void 0,
              onValue: onChange,
              onScrub: onLive,
              onScrubEnd: onLiveEnd
            })
          }),
          value5
        ]
      })
    });
  }
  function SpacingQuickPanel({ padding, max: max2, onChange, onLive, onLiveEnd, margin }) {
    return jsxk5.jsxs("div", {
      className: QUICK_PANEL_CLASS,
      onMouseDown: preserveQuickPanelSelection,
      "data-quick-panel": "spacing",
      children: [
        jsxk5.jsx(SideSpacingFields, {
          kind: "padding",
          max: max2,
          binding: {
            value: padding,
            onChange,
            onLive,
            onLiveEnd
          }
        }),
        margin !== void 0 && jsxk5.jsx(SideSpacingFields, {
          kind: "margin",
          max: margin.max ?? max2,
          binding: margin
        })
      ]
    });
  }
  function SideSpacingFields({
    kind, max: max2, binding }) {
    let labels = SIDE_SPACING_LABELS[kind], { value, onChange, onLive, onLiveEnd } = binding, [value2, value3] = reactU_.useState(value.left !== value.right || value.top !== value.bottom), callback = (input, options, context) => {
      let value5 = context.map((input2) => value[input2]), value6 = value5.every((input2) => input2 === value5[0]), callback2 = (input2) => Object.fromEntries(context.map((input3) => [input3, input2]));
      return jsxk5.jsx(runtime2.PropertyNumberInput, {
        prefix: input,
        "aria-label": options,
        title: options,
        value: value6 ? value5[0] : void 0,
        placeholder: value6 ? "0" : void 0,
        hint: value6 ? void 0 : runtime2.MIXED_LABEL,
        min: 0,
        max: max2,
        step: 1,
        clearable: value6,
        onValue: (input2) => {
          (input2 !== void 0 || value6) && onChange(callback2(input2));
        },
        onScrub: onLive ? (input2) => onLive(callback2(input2)) : void 0,
        onScrubEnd: onLiveEnd
      }, context.join());
    }, value4 = jsxk5.jsx(QuickPanelButton, {
      icon: runtime2.BORDER_SIDES_ICON,
      label: labels.each,
      pressed: value2,
      hint: (0, runtime2.formatMessage)({
        defaultMessage: "分别设置各边",
        id: "nINrXHBnXf"
      }),
      onClick: () => value3(!value2)
    });
    return jsxk5.jsxs("div", {
      className: "flex flex-col gap-1.5",
      role: "group",
      "aria-label": labels. title,
      children: [
        jsxk5.jsx("div", {
          className: QUICK_PANEL_HINT_CLASS,
          children: labels. title
        }),
        jsxk5.jsx("div", {
          className: "grid grid-cols-[1fr_1fr_auto] items-center gap-1.5",
          children: value2 ? jsxk5.jsxs(jsxk5.Fragment, {
            children: [
              callback(BORDER_SIDE_SHORT_LABELS.top, labels.top, ["top"]),
              callback(BORDER_SIDE_SHORT_LABELS.right, labels.right, ["right"]),
              value4,
              callback(BORDER_SIDE_SHORT_LABELS.bottom, labels.bottom, ["bottom"]),
              callback(BORDER_SIDE_SHORT_LABELS.left, labels.left, ["left"]),
              jsxk5.jsx("span", {})
            ]
          }) : jsxk5.jsxs(jsxk5.Fragment, {
            children: [
              callback((0, runtime2.formatMessage)({
                defaultMessage:"横",
                id: "lB0zdKVM1J"
              }), labels.x, ["left", "right"]),
              callback((0, runtime2.formatMessage)({
                defaultMessage:"竖",
                id: "baX2Ikd3Hw"
              }), labels.y, ["top", "bottom"]),
              value4
            ]
          })
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "reactU_", () => reactU_, (value) => {
    reactU_ = value;
  }), bindRuntimeValue(runtime2, "jsxk5", () => jsxk5, (value) => {
    jsxk5 = value;
  }), bindRuntimeValue(runtime2, "BORDER_SIDE_MENU_ORDER", () => BORDER_SIDE_MENU_ORDER, (value) => {
    BORDER_SIDE_MENU_ORDER = value;
  }), bindRuntimeValue(runtime2, "BORDER_SIDE_NAMES", () => BORDER_SIDE_NAMES, (value) => {
    BORDER_SIDE_NAMES = value;
  }), bindRuntimeValue(runtime2, "BORDER_SIDE_TOGGLE_LABELS", () => BORDER_SIDE_TOGGLE_LABELS, (value) => {
    BORDER_SIDE_TOGGLE_LABELS = value;
  }), bindRuntimeValue(runtime2, "BORDER_SIDE_WIDTH_LABELS", () => BORDER_SIDE_WIDTH_LABELS, (value) => {
    BORDER_SIDE_WIDTH_LABELS = value;
  }), bindRuntimeValue(runtime2, "BORDER_SIDE_WIDTH_TITLES", () => BORDER_SIDE_WIDTH_TITLES, (value) => {
    BORDER_SIDE_WIDTH_TITLES = value;
  }), bindRuntimeValue(runtime2, "BORDER_SIDE_SHORT_LABELS", () => BORDER_SIDE_SHORT_LABELS, (value) => {
    BORDER_SIDE_SHORT_LABELS = value;
  }), bindRuntimeValue(runtime2, "BORDER_STYLE_VALUES", () => BORDER_STYLE_VALUES, (value) => {
    BORDER_STYLE_VALUES = value;
  }), bindRuntimeValue(runtime2, "BORDER_STYLE_LABELS", () => BORDER_STYLE_LABELS, (value) => {
    BORDER_STYLE_LABELS = value;
  }), bindRuntimeValue(runtime2, "BORDER_STYLE_ICONS", () => BORDER_STYLE_ICONS, (value) => {
    BORDER_STYLE_ICONS = value;
  }), bindRuntimeValue(runtime2, "preserveQuickPanelSelection", () => preserveQuickPanelSelection), bindRuntimeValue(runtime2, "QUICK_PANEL_CLASS", () => QUICK_PANEL_CLASS, (value) => {
    QUICK_PANEL_CLASS = value;
  }), bindRuntimeValue(runtime2, "QUICK_PANEL_POPOVER_POSITION", () => QUICK_PANEL_POPOVER_POSITION, (value) => {
    QUICK_PANEL_POPOVER_POSITION = value;
  }), bindRuntimeValue(runtime2, "QUICK_PANEL_HINT_CLASS", () => QUICK_PANEL_HINT_CLASS, (value) => {
    QUICK_PANEL_HINT_CLASS = value;
  }), bindRuntimeValue(runtime2, "QuickPanelButton", () => QuickPanelButton), bindRuntimeValue(runtime2, "BorderQuickPanel", () => BorderQuickPanel), bindRuntimeValue(runtime2, "CORNER_KEYS", () => CORNER_KEYS, (value) => {
    CORNER_KEYS = value;
  }), bindRuntimeValue(runtime2, "CORNER_SHORT_LABELS", () => CORNER_SHORT_LABELS, (value) => {
    CORNER_SHORT_LABELS = value;
  }), bindRuntimeValue(runtime2, "CORNER_RADIUS_LABELS", () => CORNER_RADIUS_LABELS, (value) => {
    CORNER_RADIUS_LABELS = value;
  }), bindRuntimeValue(runtime2, "SIDE_SPACING_LABELS", () => SIDE_SPACING_LABELS, (value) => {
    SIDE_SPACING_LABELS = value;
  }), bindRuntimeValue(runtime2, "CornerRadiusField", () => CornerRadiusField), bindRuntimeValue(runtime2, "CornerQuickPanel", () => CornerQuickPanel), bindRuntimeValue(runtime2, "SpacingQuickPanel", () => SpacingQuickPanel), bindRuntimeValue(runtime2, "SideSpacingFields", () => SideSpacingFields), () => {
    (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiNumberControls2)(), (0, runtime2.initializeUiPropertyFocus)(), reactU_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeUiInspectorIcons)(), jsxk5 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), BORDER_SIDE_MENU_ORDER = ["top", "right", null, "bottom", "left", null], BORDER_SIDE_NAMES = ["top", "right", "bottom", "left"], BORDER_SIDE_SHORT_LABELS = {
      top: (0, runtime2.formatMessage)({
        defaultMessage: "上",
        id: "Ad3HV3/Ktn"
      }),
      right: (0, runtime2.formatMessage)({
        defaultMessage: "右",
        id: "Nw80/FHKnY"
      }),
      bottom: (0, runtime2.formatMessage)({
        defaultMessage: "下",
        id: "FxOPiex7F+"
      }),
      left: (0, runtime2.formatMessage)({
        defaultMessage: "左",
        id: "VHxl391EeO"
      })
    }, BORDER_SIDE_TOGGLE_LABELS = {
      top: (0, runtime2.formatMessage)({
        defaultMessage: "上边框",
        id: "5kGqjoz6Ii"
      }),
      right: (0, runtime2.formatMessage)({
        defaultMessage: "右边框",
        id: "rLRYXRecig"
      }),
      bottom: (0, runtime2.formatMessage)({
        defaultMessage: "下边框",
        id: "rtNFlohlWM"
      }),
      left: (0, runtime2.formatMessage)({
        defaultMessage: "左边框",
        id: "u0T5SBmoFa"
      })
    }, BORDER_SIDE_WIDTH_LABELS = {
      top: (0, runtime2.formatMessage)({
        defaultMessage: "上边框宽度",
        id: "4A9cg8zoNZ"
      }),
      right: (0, runtime2.formatMessage)({
        defaultMessage: "右边框宽度",
        id: "vEIEg8jerm"
      }),
      bottom: (0, runtime2.formatMessage)({
        defaultMessage: "下边框宽度",
        id: "EyEV0CBc/u"
      }),
      left: (0, runtime2.formatMessage)({
        defaultMessage: "左边框宽度",
        id: "wBy2kCZ0Bp"
      })
    }, BORDER_SIDE_WIDTH_TITLES = {
      top: (0, runtime2.formatMessage)({
        defaultMessage: "上边框宽度（px；0 = 无）",
        id: "67J7eKoI20"
      }),
      right: (0, runtime2.formatMessage)({
        defaultMessage: "右边框宽度（px；0 = 无）",
        id: "7MFX/7+SSw"
      }),
      bottom: (0, runtime2.formatMessage)({
        defaultMessage: "下边框宽度（px；0 = 无）",
        id: "2HmO1XPLOz"
      }),
      left: (0, runtime2.formatMessage)({
        defaultMessage: "左边框宽度（px；0 = 无）",
        id: "3PJNHYsNRw"
      })
    }, BORDER_STYLE_VALUES = ["none", "solid", "dashed", "dotted"], BORDER_STYLE_LABELS = {
      none: (0, runtime2.formatMessage)({
        defaultMessage: "无",
        id: "z2BhdOE2oG"
      }),
      solid: (0, runtime2.formatMessage)({
        defaultMessage: "实线",
        id: "+sTjkzoQa0"
      }),
      dashed: (0, runtime2.formatMessage)({
        defaultMessage: "虚线",
        id: "Am7DiWXaxJ"
      }),
      dotted: (0, runtime2.formatMessage)({
        defaultMessage: "点线",
        id: "HQmkq5qTb9"
      })
    }, BORDER_STYLE_ICONS = {
      solid: runtime2.BORDER_SOLID_ICON,
      dashed: runtime2.BORDER_DASHED_ICON,
      dotted: runtime2.BORDER_DOTTED_ICON
    }, QUICK_PANEL_CLASS = "flex w-[184px] flex-col gap-1.5", QUICK_PANEL_POPOVER_POSITION = {
      side: "right",
      anchor: (input) => input.closest("[data-quick-panel]")
    }, QUICK_PANEL_HINT_CLASS = "px-0.5 pt-0.5 text-footnote text-muted select-none", CORNER_KEYS = ["tl", "tr", "bl", "br"], CORNER_SHORT_LABELS = {
      tl: (0, runtime2.formatMessage)({
        defaultMessage: "左上",
        id: "XVvwDZKGt7"
      }),
      tr: (0, runtime2.formatMessage)({
        defaultMessage: "右上",
        id: "q/IvsBUvqA"
      }),
      bl: (0, runtime2.formatMessage)({
        defaultMessage: "左下",
        id: "jB2Sw/gJcg"
      }),
      br: (0, runtime2.formatMessage)({
        defaultMessage: "右下",
        id: "6nWSj0hnIn"
      })
    }, CORNER_RADIUS_LABELS = {
      tl: (0, runtime2.formatMessage)({
        defaultMessage: "左上圆角",
        id: "I7ncw0H5bB"
      }),
      tr: (0, runtime2.formatMessage)({
        defaultMessage: "右上圆角",
        id: "defsQ//mpa"
      }),
      bl: (0, runtime2.formatMessage)({
        defaultMessage: "左下圆角",
        id: "wt94VDoQvv"
      }),
      br: (0, runtime2.formatMessage)({
        defaultMessage: "右下圆角",
        id: "v7m8D0eoKg"
      })
    }, SIDE_SPACING_LABELS = {
      padding: {
        title: (0, runtime2.formatMessage)({
          defaultMessage: "内边距",
          id: "sMSgUadC6O"
        }),
        each: (0, runtime2.formatMessage)({
          defaultMessage: "分别设置内边距",
          id: "IC8jbqtbVh"
        }),
        top: (0, runtime2.formatMessage)({
          defaultMessage: "上内边距",
          id: "GJr56rD+GW"
        }),
        right: (0, runtime2.formatMessage)({
          defaultMessage: "右内边距",
          id: "2J+PwemHMY"
        }),
        bottom: (0, runtime2.formatMessage)({
          defaultMessage: "下内边距",
          id: "mJ7iRiW33k"
        }),
        left: (0, runtime2.formatMessage)({
          defaultMessage: "左内边距",
          id: "fiXMLoMTFz"
        }),
        x: (0, runtime2.formatMessage)({
          defaultMessage: "左右内边距",
          id: "7KrYz3l9+S"
        }),
        y: (0, runtime2.formatMessage)({
          defaultMessage: "上下内边距",
          id: "N7r6aHdHhP"
        })
      },
      margin: {
        title: (0, runtime2.formatMessage)({
          defaultMessage: "外边距",
          id: "d0EyG0C4yM"
        }),
        each: (0, runtime2.formatMessage)({
          defaultMessage: "分别设置外边距",
          id: "QNMN8PyUjI"
        }),
        top: (0, runtime2.formatMessage)({
          defaultMessage: "上外边距",
          id: "p5Q7hZntgk"
        }),
        right: (0, runtime2.formatMessage)({
          defaultMessage: "右外边距",
          id: "wveSkHfCjO"
        }),
        bottom: (0, runtime2.formatMessage)({
          defaultMessage: "下外边距",
          id: "zm6R9psM/W"
        }),
        left: (0, runtime2.formatMessage)({
          defaultMessage: "左外边距",
          id: "5yQUyDtMk6"
        }),
        x: (0, runtime2.formatMessage)({
          defaultMessage: "左右外边距",
          id: "yx5SQd7rmT"
        }),
        y: (0, runtime2.formatMessage)({
          defaultMessage: "上下外边距",
          id: "mTEOMAWGd6"
        })
      }
    };
  };
}
export {
  installUiBoxQuickPanels
};
