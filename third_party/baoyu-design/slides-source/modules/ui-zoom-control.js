// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiZoomControl(runtime2) {
  var reactRF, jsxh6, ZOOM_PRESETS, zoomLabel, formatZoomPercent, zoomBelowLimitMessage, zoomAboveLimitMessage, fitZoomIcon, isValidZoomScale;
  function ZoomControl({ getScale: getScale2, onPickScale, onFit, getLimits, fitLabel = (0, runtime2.formatMessage)({
      defaultMessage: "适配",
      id: "xb3yNn3BZj"
    }), tip = zoomLabel(), disabled: disabled2 = !1, disabledTip, tipSide, "data-testid": dataTestid = "mc-zoom", readout = !1, subscribeScale, onStepZoom, undo, zoomRowsDisabled = !1, zoomRowsDisabledTip, viewToggles = [], pickOne, actions = [] }) {
    let [value, value2] = reactRF.useState(1), [value3, value4] = reactRF.useState(() => readout ? getScale2() : 1), ref = reactRF.useRef(!1);
    reactRF.useLayoutEffect(() => {
      if (!(!readout || subscribeScale === void 0))
        return subscribeScale((input) => {
          value4(input), ref.current && (value2(input), value6(getLimits?.() ?? {}));
        });
    }, [readout, subscribeScale]);
    let [value5, value6] = reactRF.useState({}), value7 = isValidZoomScale(value), value8 = value5.minScale == null ? -1 / 0 : Math.round(value5.minScale * 100), value9 = value5.maxScale == null ? 1 / 0 : Math.round(value5.maxScale * 100), callback = (input) => {
      ref.current = input, input && (value2(getScale2()), value6(getLimits?.() ?? {}));
    }, value10 = typeof navigator < "u" && /Mac|iPhone|iPad/.test(navigator.platform), callback2 = (input) => jsxh6.jsx("span", {
      "aria-hidden": "true",
      className: "pointer-coarse:hidden text-footnote text-muted",
      children: input
    }), value11 = zoomRowsDisabledTip === void 0 ? void 0 : zoomRowsDisabled ? zoomRowsDisabledTip : null, value12 = jsxh6.jsxs(jsxh6.Fragment, {
      children: [
        onStepZoom !== void 0 ? jsxh6.jsxs(jsxh6.Fragment, {
          children: [
            jsxh6.jsx(runtime2.Menu.Item, {
              disabled: zoomRowsDisabled || value7 >= value9,
              disabledReason: value11,
              trailing: callback2(value10 ? "⌘+" : (0, runtime2.literalMessage)( "Ctrl +")),
              "aria-keyshortcuts": value10 ? "Meta+=" : "Control+=",
              onClick: () => onStepZoom(1),
              children: (0, runtime2.formatMessage)({
                defaultMessage: "放大",
                id: "89ldVlyNRB"
              })
            }),
            jsxh6.jsx(runtime2.Menu.Item, {
              disabled: zoomRowsDisabled || value7 <= value8,
              disabledReason: value11,
              trailing: callback2(value10 ? "⌘−" : (0, runtime2.literalMessage)( "Ctrl −")),
              "aria-keyshortcuts": value10 ? "Meta+-" : "Control+-",
              onClick: () => onStepZoom(-1),
              children: (0, runtime2.formatMessage)({
                defaultMessage: "缩小",
                id: "/OavqnPe44"
              })
            })
          ]
        }) : null,
        jsxh6.jsx(runtime2.Menu.Item, {
          disabled: zoomRowsDisabled,
          disabledReason: value11,
          onClick: onFit,
          children: fitLabel
        }),
        jsxh6.jsx(runtime2.Menu.Separator, {}),
        jsxh6.jsxs(runtime2.Menu.Group, {
          children: [
            ZOOM_PRESETS.every((input) => Math.round(input * 100) !== value7) ? jsxh6.jsx(runtime2.Menu.GroupLabel, {
              children: jsxh6.jsx("span", {
                className: "tabular-nums",
                children: (0, runtime2.formatMessage)({
                  defaultMessage: "当前 {percent}%",
                  id: "oFFhO2lVSV"
                }, {
                  percent: value7
                })
              })
            }) : null,
            ZOOM_PRESETS.map((input) => {
              let value13 = Math.round(input * 100), value14 = value13 < value8 ? "below" : value13 > value9 ? "above" : null, value15 = zoomRowsDisabled ? value11 ?? null : value14 === null ? null : value14 === "below" ? value5.minTip ?? zoomBelowLimitMessage() : value5.maxTip ?? zoomAboveLimitMessage();
              return jsxh6.jsx(runtime2.Menu.Item, {
                checkedRole: "radio",
                checked: value13 === value7,
                disabled: zoomRowsDisabled || value14 !== null,
                disabledReason: value15,
                onClick: () => onPickScale(input),
                children: formatZoomPercent(value13)
              }, input);
            })
          ]
        }),
        viewToggles.length > 0 ? jsxh6.jsxs(jsxh6.Fragment, {
          children: [
            jsxh6.jsx(runtime2.Menu.Separator, {}),
            viewToggles.flatMap((input) => [
              input.divided === !0 ? jsxh6.jsx(runtime2.Menu.Separator, {}, input.label + " divider") : null,
              jsxh6.jsx(runtime2.Menu.Item, {
                checkedRole: "checkbox",
                checked: input.checked,
                disabled: typeof input.disabledReason == "string",
                disabledReason: input.disabledReason,
                shortcut: input.shortcut,
                "aria-describedby": input.describedBy,
                onClick: input.onToggle,
                children: input.label
              }, input.label)
            ])
          ]
        }) : null,
        pickOne !== void 0 ? jsxh6.jsxs(jsxh6.Fragment, {
          children: [
            jsxh6.jsx(runtime2.Menu.Separator, {}),
            jsxh6.jsxs(runtime2.Menu.Submenu, {
              children: [
                jsxh6.jsx(runtime2.Menu.SubmenuTrigger, {
                  trailing: pickOne.antOnly === !0 ? jsxh6.jsx(runtime2.Badge, {
                    variant: "neutral",
                    children: "仅限 Ant"
                  }) : void 0,
                  hint: pickOne.options.find((input) => input.checked)?.label,
                  children: pickOne.label
                }),
                jsxh6.jsx(runtime2.Menu.Popup, {
                  children: jsxh6.jsx(runtime2.Menu.Group, {
                    children: pickOne.options.map((input) => jsxh6.jsx(runtime2.Menu.Item, {
                      checkedRole: "radio",
                      checked: input.checked,
                      description: input.note,
                      onClick: input.onPick,
                      children: input.label
                    }, input.label))
                  })
                })
              ]
            })
          ]
        }) : null,
        undo !== void 0 ? jsxh6.jsxs(jsxh6.Fragment, {
          children: [
            jsxh6.jsx(runtime2.Menu.Separator, {}),
            jsxh6.jsx(runtime2.Menu.Item, {
              disabled: !undo.canUndo(),
              disabledReason: (0, runtime2.formatMessage)({
                defaultMessage: "暂无可撤销的操作",
                id: "AdEug02E/V"
              }),
              shortcut: "cmd+z",
              onClick: () => undo.undo(),
              children: (0, runtime2.formatMessage)({
                defaultMessage: "撤销",
                id: "MTX0qSwEI5"
              })
            }),
            jsxh6.jsx(runtime2.Menu.Item, {
              disabled: !undo.canRedo(),
              disabledReason: (0, runtime2.formatMessage)({
                defaultMessage: "暂无可重做的操作",
                id: "dOz8+YZ1K1"
              }),
              shortcut: "shift+cmd+z",
              onClick: () => undo.redo(),
              children: (0, runtime2.formatMessage)({
                defaultMessage: "重做",
                id: "WGqPtdaUiD"
              })
            })
          ]
        }) : null,
        actions.length > 0 ? jsxh6.jsxs(jsxh6.Fragment, {
          children: [
            jsxh6.jsx(runtime2.Menu.Separator, {}),
            actions.map((input) => jsxh6.jsx(runtime2.Menu.Item, {
              disabled: typeof input.disabledReason == "string",
              disabledReason: input.disabledReason ?? null,
              onClick: input.onSelect,
              children: input.label
            }, input.label))
          ]
        }) : null
      ]
    });
    return readout ? jsxh6.jsx(runtime2.ToolbarPopover, {
      readout: formatZoomPercent(isValidZoomScale(value3)),
      readoutSizer: formatZoomPercent(100),
      label: zoomLabel(),
      tip,
      disabled: disabled2,
      disabledTip,
      side: tipSide,
      "data-testid": dataTestid,
      onOpenChange: callback,
      children: value12
    }) : jsxh6.jsx(runtime2.ToolbarPopover, {
      glyph: fitZoomIcon,
      iconOnly: !0,
      label: zoomLabel(),
      tip,
      disabled: disabled2,
      disabledTip,
      side: tipSide,
      "data-testid": dataTestid,
      onOpenChange: callback,
      children: value12
    });
  }
  return bindRuntimeValue(runtime2, "reactRF", () => reactRF, (value) => {
    reactRF = value;
  }), bindRuntimeValue(runtime2, "jsxh6", () => jsxh6, (value) => {
    jsxh6 = value;
  }), bindRuntimeValue(runtime2, "ZOOM_PRESETS", () => ZOOM_PRESETS, (value) => {
    ZOOM_PRESETS = value;
  }), bindRuntimeValue(runtime2, "zoomLabel", () => zoomLabel, (value) => {
    zoomLabel = value;
  }), bindRuntimeValue(runtime2, "formatZoomPercent", () => formatZoomPercent, (value) => {
    formatZoomPercent = value;
  }), bindRuntimeValue(runtime2, "zoomBelowLimitMessage", () => zoomBelowLimitMessage, (value) => {
    zoomBelowLimitMessage = value;
  }), bindRuntimeValue(runtime2, "zoomAboveLimitMessage", () => zoomAboveLimitMessage, (value) => {
    zoomAboveLimitMessage = value;
  }), bindRuntimeValue(runtime2, "fitZoomIcon", () => fitZoomIcon, (value) => {
    fitZoomIcon = value;
  }), bindRuntimeValue(runtime2, "isValidZoomScale", () => isValidZoomScale, (value) => {
    isValidZoomScale = value;
  }), bindRuntimeValue(runtime2, "ZoomControl", () => ZoomControl), () => {
    (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiPropertyIcons)(), reactRF = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxh6 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2], zoomLabel = () => (0, runtime2.formatMessage)({
      defaultMessage: "缩放",
      id: "+KLeF6NxPf"
    }), formatZoomPercent = (percent) => (0, runtime2.formatMessage)({
      defaultMessage: "{percent}%",
      id: "euJ5RaA9+c"
    }, {
      percent
    }), zoomBelowLimitMessage = () => (0, runtime2.formatMessage)({
      defaultMessage: "已低于缩放下限，无法再缩小",
      id: "YN9OxTGJai"
    }), zoomAboveLimitMessage = () => (0, runtime2.formatMessage)( {
      defaultMessage: "已超出缩放上限，无法再放大",
      id: "38SD+H0shj"
    }), fitZoomIcon = jsxh6.jsx(runtime2.ZoomInIcon, {}), isValidZoomScale = (scale) => Number.isFinite(scale) && scale > 0 ? Math.max(1, Math.round(scale * 100)) : 100;
  };
}
export {
  installUiZoomControl
};
