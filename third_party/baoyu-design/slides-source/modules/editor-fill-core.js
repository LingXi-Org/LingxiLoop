// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
// Canvas text fill stays synchronous; panel widgets load only while opened.
export function installEditorFillCore(runtime2) {
  var reactForThemeTabFlag, jsxq_, FILL_COLOR_LABEL, FILL_GRADIENT_LABEL, FILL_IMAGE_LABEL, COVER_LABEL, CONTAIN_LABEL, customFaceLabel;
function useFillEditor(options) {
    let [value, value2] = runtime2.reactw8.useState(null), [value3, value4] = runtime2.reactw8.useState(!1), ref = runtime2.reactw8.useRef(null), ref2 = runtime2.reactw8.useRef({
      updateNodes: options?.updateNodes,
      mounted: !1
    });
    if (ref2.current.updateNodes = options?.updateNodes, runtime2.reactw8.useEffect(() => (ref2.current.mounted = !0, () => void (ref2.current.mounted = !1)), []), options === void 0)
      return {};
    let { node, slideBg, swatches, fillMixed, updateNodes, liveUpdateNodes, end, pickImage } = options, value5 = fillMixed ? void 0 : node.fill, callback = (input) => (source) => source.kind === "text" ? input(source) : source, callback2 = (input) => updateNodes(callback((input2) => (0, runtime2.setTextFill)(input2, input))), callback3 = (input) => liveUpdateNodes(callback((input2) => (0, runtime2.setTextFill)(input2, input))), value6 = value5?.kind === "gradient" ? value5.gradient : void 0, state = {
      kind: "slides-text",
      bag: void 0,
      disabled: !1,
      swatches,
      clearKeys: void 0,
      mixedKeys: void 0,
      unifiedColorPopover: !0,
      clear: () => callback2(void 0),
      commit: (input, options2) => callback2(options2 === void 0 ? void 0 : {
        kind: "gradient",
        gradient: options2
      }),
      live: (input, options2) => callback3({
        kind: "gradient",
        gradient: options2
      }),
      liveEnd: end
    }, callback4 = (input) => {
      pickImage !== void 0 && (value4(!0), pickImage(input).then((input2) => {
        if (!ref2.current.mounted || ref2.current.updateNodes === void 0) {
          input2 !== void 0 && (0, runtime2.showToast)((0, runtime2.formatMessage)({ defaultMessage: "图片加载期间文字已更改，请重新选择文字和图片。", id: "S5SbLHHbjZ" }));
          return;
        }
        if (value4(!1), input2 !== void 0) {
          if (!(0, runtime2.isRenderableImageSource)(input2)) {
            (0, runtime2.showToast)((0, runtime2.formatMessage)({ defaultMessage: "此图片无法用于填充文字，请先上传，或压缩为较小的 PNG/JPEG 图片。", id: "Yrq04FoMbW" }));
            return;
          }
          value2(null), ref2.current.updateNodes(callback((input3) => (0, runtime2.setTextFill)(input3, {
            kind: "image",
            src: input2,
            ...input3.fill?.kind === "image" && input3.fill.size !== void 0 ? {
              size: input3.fill.size
            } : {}
          })));
        }
      }, (input2) => {
        ref2.current.mounted && value4(!1), console.warn("slides: adding a picture to a text failed: " + (0, runtime2.failureKindForLog)(input2)), (0, runtime2.showToast)((0, runtime2.formatMessage)({ defaultMessage: "添加图片失败：{reason}", id: "Wu5qYtPjZP" }, { reason: (0, runtime2.exportFailureReason)(input2) }));
      }));
    }, value7 = value ?? value5?.kind ?? "color";
    return fillMixed ? {} : {
      kind: {
        value: value7,
        label: (0, runtime2.formatMessage)({
          defaultMessage: "填充类型",
          id: "kSbwUcdoR2"
        }),
        options: [
          {
            value: "color",
            label: FILL_COLOR_LABEL
          },
          {
            value: "gradient",
            label: FILL_GRADIENT_LABEL
          },
          {
            value: "image",
            label: FILL_IMAGE_LABEL
          }
        ],
        onChange: (input) => {
          value2(input === "image" && value5?.kind !== "image" ? "image" : null), input === "color" && value5 !== void 0 && callback2(void 0), input === "gradient" && value6 === void 0 && callback2({
            kind: "gradient",
            gradient: defaultFillGradient((0, runtime2.resolveSlideColor)(node.color), slideBg)
          });
        }
      },
      face: value7 === "gradient" && value6 !== void 0 ? jsxq_.jsx("div", {
        "data-testid": "sl-text-gradient-panel",
        children: jsxq_.jsx(runtime2.GradientPickerStyleEditor, {
          rec: value6,
          propKey: "backgroundGradient",
          ed: state
        })
      }) : value7 === "image" ? jsxq_.jsxs("div", {
        className: "flex flex-col",
        "data-testid": "sl-text-image-panel",
        children: [
          jsxq_.jsx(runtime2.PropertyRow, {
            label: (0, runtime2.formatMessage)({ defaultMessage: "图片", id: "liKHyCUvte" }),
            children: jsxq_.jsxs("div", {
              className: "flex min-w-0 flex-1 items-center gap-2",
              children: [
                jsxq_.jsx(runtime2.PropertyColorPreview, {
                  className: "h-8 w-8 shrink-0",
                  children: value5?.kind === "image" ? jsxq_.jsx("img", {
                    src: value5.src,
                    alt: "",
                    className: "absolute inset-0 h-full w-full object-cover"
                  }) : null
                }),
                jsxq_.jsx(runtime2.Button, {
                  variant: "secondary",
                  disabled: pickImage === void 0 || value3,
                  title: pickImage === void 0 ? (0, runtime2.formatMessage)({ defaultMessage: "当前视图不支持添加图片", id: "+I7G/PK4ww" }) : void 0,
                  onClick: () => ref.current?.click(),
                  children: value3 ? (0, runtime2.formatMessage)({ defaultMessage: "正在加载…", id: "R9lO4+Qqqs" }) : value5?.kind === "image" ? (0, runtime2.formatMessage)({ defaultMessage: "替换…", id: "wfL2e8x4pC" }) : (0, runtime2.formatMessage)({ defaultMessage: "选择图片…", id: "378zI5e83/" })
                }),
                jsxq_.jsx("input", {
                  ref,
                  type: "file",
                  accept: "image/*",
                  className: "hidden",
                  onChange: (input) => {
                    let value8 = input.currentTarget.files?.[0];
                    input.currentTarget.value = "", value8 && callback4(value8);
                  }
                })
              ]
            })
          }),
          jsxq_.jsx(runtime2.ChoicePropertyRow, {
            label: (0, runtime2.formatMessage)({ defaultMessage: "尺寸", id: "itWSquQBZ5" }),
            value: value5?.kind === "image" ? value5.size ?? "cover" : "cover",
            disabled: value5?.kind !== "image",
            title: value5?.kind !== "image" ? (0, runtime2.formatMessage)({ defaultMessage: "请先选择图片", id: "c/ej7FZAxQ" }) : void 0,
            options: [
              {
                value: "cover",
                label: COVER_LABEL
              },
              {
                value: "contain",
                label: CONTAIN_LABEL
              }
            ],
            onChange: (input) => {
              value5?.kind === "image" && callback2({
                kind: "image",
                src: value5.src,
                ...input === "contain" ? {
                  size: "contain"
                } : {}
              });
            }
          })
        ]
      }) : null
    };
  }
function defaultFillGradient(color, slideBg) {
    let value = (0, runtime2.stripHexAlpha)(color ?? (0, runtime2.slideTextColor)(slideBg)), value2 = runtime2.renderingNamedColors.clay ?? "#d97757", value3 = value.toLowerCase() === value2.toLowerCase() ? "#ffffff" : value2;
    return {
      angle: 90,
      stops: [
        {
          color: value,
          pos: 0
        },
        {
          color: mixHexColors(value, value3, 0.6),
          pos: 100
        }
      ]
    };
  }
function mixHexColors(from, to2, amount) {
    let callback = (input, options) => parseInt(input.slice(1 + options * 2, 3 + options * 2), 16);
    return "#" + [0, 1, 2].map((input) => Math.round(callback(from, input) + (callback(to2, input) - callback(from, input)) * amount).toString(16).padStart(2, "0")).join("");
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
  function LazyProperties({active = true, view, ...props}) {
    const React = runtime2.loadReactNamespace();
    const [state, setState] = React.useState(runtime2.propertiesModulesReady ? 'ready' : 'loading');
    const [attempt, retry] = React.useReducer(n => n + 1, 0);
    React.useEffect(() => {
      if (!active) return;
      if (runtime2.propertiesModulesReady) { setState('ready');return; }
      let disposed = false;setState('loading');
      runtime2.loadPropertiesModules().then(() => { if (!disposed) setState('ready'); }, () => { if (!disposed) setState('failed'); });
      return () => { disposed = true; };
    }, [active, attempt]);
    if (!active) return null;
    if (state === 'ready') return jsxq_.jsx(view === 'theme' ? runtime2.LoadedThemePanel : runtime2.LoadedSelectionInspector, props);
    return jsxq_.jsxs('div', {className:'p-4 text-sm text-fg-muted',children:[
      jsxq_.jsx('p', {role:state === 'failed' ? 'alert' : 'status',children:state === 'failed' ? '属性暂时无法加载，请重试。' : '正在准备属性…'}),
      state === 'failed' ? jsxq_.jsx(runtime2.Button, {onClick:retry,children:'重试'}) : null
    ]});
  }
  function SelectionInspector(props) { return jsxq_.jsx(LazyProperties, {...props, view:'properties'}); }
  function ThemePanel(props) { return jsxq_.jsx(LazyProperties, {...props, view:'theme'}); }

  return bindRuntimeValue(runtime2, "reactForThemeTabFlag", () => reactForThemeTabFlag), bindRuntimeValue(runtime2, "useThemeTabEnabled", () => useThemeTabEnabled), bindRuntimeValue(runtime2, "jsxq_", () => jsxq_, (value) => {
    jsxq_ = value;
  }), bindRuntimeValue(runtime2, "useFillEditor", () => useFillEditor), bindRuntimeValue(runtime2, "defaultFillGradient", () => defaultFillGradient), bindRuntimeValue(runtime2, "mixHexColors", () => mixHexColors), bindRuntimeValue(runtime2, "customFaceLabel", () => customFaceLabel), bindRuntimeValue(runtime2, "FILL_COLOR_LABEL", () => FILL_COLOR_LABEL), bindRuntimeValue(runtime2, "FILL_GRADIENT_LABEL", () => FILL_GRADIENT_LABEL), bindRuntimeValue(runtime2, "FILL_IMAGE_LABEL", () => FILL_IMAGE_LABEL), bindRuntimeValue(runtime2, "COVER_LABEL", () => COVER_LABEL), bindRuntimeValue(runtime2, "CONTAIN_LABEL", () => CONTAIN_LABEL), bindRuntimeValue(runtime2, 'SelectionInspector', () => SelectionInspector), bindRuntimeValue(runtime2, 'ThemePanel', () => ThemePanel), () => { (0, runtime2.initializeUiInspectorIcons)(), (0, runtime2.initializeStyleSchema)(), reactForThemeTabFlag = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxq_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), FILL_COLOR_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "颜色", id: "aO2sd/ASsJ" }), FILL_GRADIENT_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "渐变", id: "LUSKhaHwto" }), FILL_IMAGE_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "图片", id: "nboRLjzNa6" }), COVER_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "覆盖", id: "Im0bbVAXaS" }), CONTAIN_LABEL = (0, runtime2.formatMessage)({ defaultMessage: "完整显示", id: "aPBlQtePo5" }), customFaceLabel = (face) => (0, runtime2.formatMessage)({ defaultMessage: "自定义{face}", id: "cU7d5yek9U" }, { face }); };
}
