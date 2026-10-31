// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiBoxStyleToolbar(runtime2) {
  var jsxK7, STYLE_SIDE_NAMES, BORDER_REQUIRED_REASON, SHAPE_BORDER_SIDES_REASON, isClosedShape, BORDER_STYLE_CLEAR_PATCH, BORDER_STYLES;
  function ensureVisibleBorderStyle(before, patch, node) {
    return ![
      "borderWidth",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth"
    ].some((input) => typeof patch[input] == "number" && patch[input] > 0) || before?.borderStyle !== void 0 && before.borderStyle !== "none" ? patch : {
      ...patch,
      borderStyle: "solid",
      ...before?.borderColor === void 0 ? {
        borderColor: node
      } : {}
    };
  }
  function ensureShapeFill(node) {
    return !isClosedShape(node) || node.style?.backgroundColor !== void 0 || (0, runtime2.shapeHasOutline)(node.style) ? node : (0, runtime2.patchNodeStyle)(node, {
      backgroundColor: (0, runtime2.themeAccentColor)(),
      backgroundGradient: void 0
    });
  }
  function updateNodeShapeStyle(node, patch) {
    return isClosedShape(node) ? "backgroundColor" in patch && patch.backgroundColor === void 0 && !(0, runtime2.shapeHasOutline)(node.style) || node.kind === "shape" && node.shape === "line" && (patch.borderStyle === "dashed" || patch.borderStyle === "dotted") ? node : ensureShapeFill((0, runtime2.patchNodeStyle)(node, patch)) : (0, runtime2.patchNodeStyle)(node, patch);
  }
  function normalizedBorderPatch(patch) {
    return [
      "borderWidth",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth"
    ].some((input) => typeof patch[input] == "number" && patch[input] > 0) ? patch : {
      ...BORDER_STYLE_CLEAR_PATCH
    };
  }
  function borderColorPatch(style, color) {
    let value = (0, runtime2.borderWidthsBySide)(style);
    if (value.top > 0 || value.right > 0 || value.bottom > 0 || value.left > 0)
      return {
        borderColor: color
      };
    let value2 = style?.borderStyle !== void 0 && style.borderStyle !== "none";
    return {
      borderColor: color,
      ...value2 ? {} : {
        borderStyle: "solid"
      },
      ...(style?.borderWidth ?? 0) === 0 && !(0, runtime2.hasPerSideBorderWidths)(style) ? {
        borderWidth: 1
      } : {}
    };
  }
  function uniformVisibleBorderWidth(widths) {
    let value = STYLE_SIDE_NAMES.filter((input) => widths[input] > 0);
    if (value.length !== 0 && value.every((input) => widths[input] === widths[value[0]]))
      return widths[value[0]];
  }
  function activeBorderSides(widths) {
    let value = STYLE_SIDE_NAMES.filter((input) => widths[input] > 0);
    if (!(value.length === 0 || value.length === 4))
      return value;
  }
  function definedBorderSides(sides2) {
    let state = {};
    for (let value of STYLE_SIDE_NAMES)
      sides2[value] !== void 0 && (state[value] = sides2[value]);
    return state;
  }
  function BoxStyleToolbar({ compact, wrap = !0, swatches, io: io2, padding, corner, border = {
    sides: !0,
    widthMax: 16
  }, noneReason }) {
    let bag = io2.bag, value = bag?.backgroundColor, value2 = value !== void 0 ? swatches.find((input) => (0, runtime2.colorsEqual)(input.color, value)) : void 0, value3 = value2 === void 0 ? null : value2.picks ?? value2.name, value4 = bag?.backgroundGradient !== void 0 ? (0, runtime2.styleBagToCss)({
      backgroundGradient: bag.backgroundGradient
    }, "slides-stack").backgroundImage : void 0, value5 = typeof value4 == "string" ? value4 : void 0, value6 = bag?.borderStyle, value7 = (0, runtime2.borderWidthsBySide)(bag), value8 = value7.top > 0 || value7.right > 0 || value7.bottom > 0 || value7.left > 0, value9 = value6 === void 0 ? void 0 : value8 ? value6 === "double" ? "solid" : value6 : "none", text = "#141413", value10 = bag?.backgroundGradient, value11 = io2.kind !== void 0 && io2.fillMixed !== !0 && (0, runtime2.stylePropertyAppliesToNode)("backgroundGradient", io2.kind) ? (0, runtime2.createStyleEditor)({
      kind: io2.kind,
      bag,
      swatches: void 0,
      unifiedColorPopover: !0,
      onCommit: (input, options) => io2.commit(options),
      onLive: (input, options) => io2.live(options),
      onLiveEnd: io2.settle
    }) : void 0;
    return jsxK7.jsxs(jsxK7.Fragment, {
      children: [
        jsxK7.jsxs(runtime2.ToolbarGroup, {
          wrap,
          children: [
            jsxK7.jsx(runtime2.SessionColorPopover, {
              testid: "frame-bg-color",
              title: (0, runtime2.formatMessage)({ defaultMessage: "背景颜色", id: "eQTfdqfPAw" }),
              paint: value5 ?? value,
              swatches: [
                {
                  name: "none",
                  label: (0, runtime2.formatMessage)({ defaultMessage: "无背景", id: "OdqAKZmoCN" }),
                  color: "transparent",
                  empty: !0,
                  ...noneReason !== void 0 ? {
                    disabledReason: noneReason
                  } : {}
                },
                ...swatches
              ],
              value: value5 !== void 0 ? null : value === void 0 ? "none" : value3,
              onSwatch: (input) => {
                let value12 = swatches.find((input2) => input2.name === input);
                io2.commit({
                  backgroundColor: value12?.color,
                  backgroundGradient: void 0
                });
              },
              custom: {
                seed: value ?? "#FFFFFF",
                unset: value === void 0,
                onChange: (input) => io2.live({
                  backgroundColor: input,
                  backgroundGradient: void 0
                }),
                onPickEnd: () => io2.settle()
              },
              ...value11 !== void 0 ? {
                kind: {
                  value: value10 !== void 0 ? "gradient" : "color",
                  options: [
                    {
                      value: "color",
                      label: (0, runtime2.formatMessage)({ defaultMessage: "颜色", id: "aO2sd/ASsJ" })
                    },
                    {
                      value: "gradient",
                      label: (0, runtime2.formatMessage)({ defaultMessage: "渐变", id: "LUSKhaHwto" })
                    }
                  ],
                  onChange: (input) => {
                    input === "gradient" && value10 === void 0 && io2.commit({
                      backgroundGradient: (0, runtime2.defaultStylePropertyValue)("backgroundGradient", io2.kind)
                    }), input === "color" && value10 !== void 0 && io2.commit({
                      backgroundGradient: void 0
                    });
                  }
                },
                face: value10 !== void 0 ? jsxK7.jsx("div", {
                  "data-testid": "frame-bg-gradient-panel",
                  children: jsxK7.jsx(runtime2.GradientPickerStyleEditor, {
                    rec: value10,
                    propKey: "backgroundGradient",
                    ed: value11
                  })
                }) : null
              } : {}
            }),
            jsxK7.jsx(runtime2.SessionPropertyPopover, {
              testid: "frame-border",
              title: (0, runtime2.formatMessage)({ defaultMessage: "边框", id: "wNyfFYlQPd" }),
              icon: runtime2.BORDER_WEIGHT_ICON,
              children: jsxK7.jsx(runtime2.BorderQuickPanel, {
                style: value9,
                width: uniformVisibleBorderWidth(value7),
                sides: activeBorderSides(value7),
                color: jsxK7.jsx(runtime2.ColorPropertyRow, {
                  testid: "frame-border-color",
                  label: "边框颜色",
                  title: (0, runtime2.formatMessage)({ defaultMessage: "边框颜色", id: "8JBKFXn1Pk" }),
                  value: bag?.borderColor,
                  swatches,
                  fold: !0,
                  disabled: !value8,
                  disabledReason: (0, runtime2.formatMessage)({ defaultMessage: "请先选择边框样式", id: "hstroxBQ5k" }),
                  onChange: (input) => {
                    input !== void 0 && io2.update((input2) => borderColorPatch(input2, input));
                  },
                  onLive: (input) => io2.liveWith((input2) => borderColorPatch(input2, input)),
                  onLiveEnd: io2.settle,
                  keepFocus: !0,
                  popover: runtime2.QUICK_PANEL_POPOVER_POSITION
                }),
                onChange: (input) => {
                  if ("style" in input) {
                    if (input.style === void 0 || input.style === "none")
                      io2.commit({
                        ...BORDER_STYLE_CLEAR_PATCH
                      });
                    else {
                      let style = input.style;
                      io2.update((input2) => ({
                        borderStyle: style,
                        ...(input2?.borderWidth ?? 0) === 0 && !(0, runtime2.hasPerSideBorderWidths)(input2) ? {
                          borderWidth: 1
                        } : {},
                        ...input2?.borderColor === void 0 ? {
                          borderColor: "#141413"
                        } : {}
                      }));
                    }
                    return;
                  }
                  if ("width" in input) {
                    let value12 = input.width ?? 0;
                    if (value12 === 0) {
                      io2.commit({
                        ...BORDER_STYLE_CLEAR_PATCH
                      });
                      return;
                    }
                    io2.update((input2) => normalizedBorderPatch(ensureVisibleBorderStyle(input2, (0, runtime2.setBorderWidthsPreservingSides)(input2, value12), "#141413")));
                    return;
                  }
                  "sides" in input && input.sides === void 0 && io2.update((input2) => {
                    let value12 = (0, runtime2.borderWidthsBySide)(input2), value13 = Math.max(value12.top, value12.right, value12.bottom, value12.left);
                    return (0, runtime2.borderPatchFromWidths)({
                      top: value13,
                      right: value13,
                      bottom: value13,
                      left: value13
                    });
                  });
                },
                onLive: (input) => {
                  if (input.width !== void 0) {
                    let width = input.width;
                    io2.liveWith((input2) => normalizedBorderPatch(ensureVisibleBorderStyle(input2, (0, runtime2.setBorderWidthsPreservingSides)(input2, width), "#141413")));
                  }
                },
                onLiveEnd: io2.settle,
                widths: {
                  value: value7,
                  onChange: (input) => io2.update((input2) => normalizedBorderPatch(ensureVisibleBorderStyle(input2, (0, runtime2.borderPatchFromWidths)({
                    ...(0, runtime2.borderWidthsBySide)(input2),
                    ...definedBorderSides(input)
                  }), "#141413"))),
                  onLive: (input) => io2.liveWith((input2) => normalizedBorderPatch(ensureVisibleBorderStyle(input2, (0, runtime2.borderPatchFromWidths)({
                    ...(0, runtime2.borderWidthsBySide)(input2),
                    ...definedBorderSides(input)
                  }), "#141413"))),
                  onLiveEnd: io2.settle
                },
                supports: {
                  styles: BORDER_STYLES,
                  sides: border.sides,
                  widthMax: border.widthMax
                }
              })
            })
          ]
        }),
        compact ? null : jsxK7.jsx(runtime2.ToolbarDivider, {}),
        corner !== void 0 || padding ? jsxK7.jsxs(jsxK7.Fragment, {
          children: [
            jsxK7.jsxs(runtime2.ToolbarGroup, {
              wrap,
              children: [
                corner !== void 0 ? jsxK7.jsx(CornerStylePopover, {
                  ...corner
                }) : null,
                padding ? jsxK7.jsx(runtime2.SessionPropertyPopover, {
                  testid: "frame-spacing",
                  title: (0, runtime2.formatMessage)({ defaultMessage: "间距", id: "iwtjO765xO" }),
                  icon: runtime2.SPACING_ICON,
                  children: jsxK7.jsx(runtime2.SpacingQuickPanel, {
                    padding: {
                      top: bag?.paddingTop,
                      right: bag?.paddingRight,
                      bottom: bag?.paddingBottom,
                      left: bag?.paddingLeft
                    },
                    max: 256,
                    onChange: (input) => io2.commit(paddingStylePatch(input)),
                    onLive: (input) => io2.live(paddingStylePatch(input)),
                    onLiveEnd: io2.settle
                  })
                }) : null
              ]
            }),
            compact ? null : jsxK7.jsx(runtime2.ToolbarDivider, {})
          ]
        }) : null
      ]
    });
  }
  function paddingStylePatch(sides2) {
    let state = {};
    for (let value of STYLE_SIDE_NAMES)
      value in sides2 && (state["padding" + value[0].toUpperCase() + value.slice(1)] = sides2[value]);
    return state;
  }
  function CornerStylePopover(props) {
    return jsxK7.jsx(runtime2.SessionPropertyPopover, {
      testid: "frame-corner",
      title: (0, runtime2.formatMessage)({ defaultMessage: "圆角", id: "fag5YIqwip" }),
      icon: runtime2.CORNER_RADIUS_ICON,
      children: jsxK7.jsx(runtime2.CornerQuickPanel, {
        ...props
      })
    });
  }
  function cornerStyleBindings(binding) {
    let callback = (input) => ({
      tl: input,
      tr: input,
      br: input,
      bl: input
    }), callback2 = (input) => {
      let state = {};
      for (let value of ["tl", "tr", "br", "bl"])
        value in input && (state[value] = input[value] ?? 0);
      return state;
    };
    return {
      radius: (0, runtime2.hasPerCornerRadius)(binding.bag) ? ((input) => input.tl === input.tr && input.tl === input.br && input.tl === input.bl ? input.tl : void 0)((0, runtime2.borderRadiiByCorner)(binding.bag)) : binding.bag?.borderRadius,
      max: 256,
      onChange: (input) => binding.update(() => (0, runtime2.borderRadiusPatch)(callback(input ?? 0))),
      onLive: (input) => binding.liveWith(() => (0, runtime2.borderRadiusPatch)(callback(input))),
      onLiveEnd: binding.settle,
      corners: {
        value: (0, runtime2.borderRadiiByCorner)(binding.bag),
        onChange: (input) => binding.update((input2) => (0, runtime2.borderRadiusPatch)({
          ...(0, runtime2.borderRadiiByCorner)(input2),
          ...callback2(input)
        })),
        onLive: (input) => binding.liveWith((input2) => (0, runtime2.borderRadiusPatch)({
          ...(0, runtime2.borderRadiiByCorner)(input2),
          ...callback2(input)
        })),
        onLiveEnd: binding.settle
      }
    };
  }
  return bindRuntimeValue(runtime2, "jsxK7", () => jsxK7, (value) => {
    jsxK7 = value;
  }), bindRuntimeValue(runtime2, "STYLE_SIDE_NAMES", () => STYLE_SIDE_NAMES, (value) => {
    STYLE_SIDE_NAMES = value;
  }), bindRuntimeValue(runtime2, "ensureVisibleBorderStyle", () => ensureVisibleBorderStyle), bindRuntimeValue(runtime2, "BORDER_REQUIRED_REASON", () => BORDER_REQUIRED_REASON, (value) => {
    BORDER_REQUIRED_REASON = value;
  }), bindRuntimeValue(runtime2, "SHAPE_BORDER_SIDES_REASON", () => SHAPE_BORDER_SIDES_REASON, (value) => {
    SHAPE_BORDER_SIDES_REASON = value;
  }), bindRuntimeValue(runtime2, "isClosedShape", () => isClosedShape, (value) => {
    isClosedShape = value;
  }), bindRuntimeValue(runtime2, "ensureShapeFill", () => ensureShapeFill), bindRuntimeValue(runtime2, "updateNodeShapeStyle", () => updateNodeShapeStyle), bindRuntimeValue(runtime2, "BORDER_STYLE_CLEAR_PATCH", () => BORDER_STYLE_CLEAR_PATCH, (value) => {
    BORDER_STYLE_CLEAR_PATCH = value;
  }), bindRuntimeValue(runtime2, "normalizedBorderPatch", () => normalizedBorderPatch), bindRuntimeValue(runtime2, "borderColorPatch", () => borderColorPatch), bindRuntimeValue(runtime2, "uniformVisibleBorderWidth", () => uniformVisibleBorderWidth), bindRuntimeValue(runtime2, "activeBorderSides", () => activeBorderSides), bindRuntimeValue(runtime2, "definedBorderSides", () => definedBorderSides), bindRuntimeValue(runtime2, "BORDER_STYLES", () => BORDER_STYLES, (value) => {
    BORDER_STYLES = value;
  }), bindRuntimeValue(runtime2, "BoxStyleToolbar", () => BoxStyleToolbar), bindRuntimeValue(runtime2, "paddingStylePatch", () => paddingStylePatch), bindRuntimeValue(runtime2, "CornerStylePopover", () => CornerStylePopover), bindRuntimeValue(runtime2, "cornerStyleBindings", () => cornerStyleBindings), () => {
    (0, runtime2.initializeUiInspectorIcons)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeRenderingTheme)(), jsxK7 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), STYLE_SIDE_NAMES = ["top", "right", "bottom", "left"], BORDER_REQUIRED_REASON = (0, runtime2.formatMessage)({ defaultMessage: "请先添加边框", id: "jz/BmAs8dh" }), SHAPE_BORDER_SIDES_REASON = (0, runtime2.formatMessage)({ defaultMessage: "形状的四周使用同一条描边", id: "bnqFXl1WFV" }), isClosedShape = (source) => source.kind === "shape" && source.shape !== "connector", BORDER_STYLE_CLEAR_PATCH = {
      borderStyle: void 0,
      borderWidth: void 0,
      borderColor: void 0,
      borderSides: void 0,
      borderTopWidth: void 0,
      borderRightWidth: void 0,
      borderBottomWidth: void 0,
      borderLeftWidth: void 0
    }, BORDER_STYLES = ["none", "solid", "dashed", "dotted"];
  };
}
export {
  installUiBoxStyleToolbar
};
