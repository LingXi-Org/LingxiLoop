// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCreationOverlay(runtime2) {
  var ReactCreationOverlay, ReactCreationTips, CREATION_TIPS, CreationOverlayJsx, escapeCreationSelector, creationCoordinatesApproximatelyEqual, creationRectsApproximatelyEqual, SlideCreationOverlay;
  function getCreationTip(index4) {
    return index4 < 0 ? runtime2.CLAUDE_WORKING_LABEL : CREATION_TIPS[index4 % CREATION_TIPS.length] ?? runtime2.CLAUDE_WORKING_LABEL;
  }
  function creationTipIndexAtElapsed(elapsedMs) {
    return elapsedMs < runtime2.CREATION_TIP_INITIAL_DELAY_MS ? -1 : Math.floor((elapsedMs - runtime2.CREATION_TIP_INITIAL_DELAY_MS) / runtime2.CREATION_TIP_ROTATION_MS);
  }
  function useCreationTipIndex(enabled) {
    let [index4, setIndex] = ReactCreationTips.useState(-1);
    return ReactCreationTips.useEffect(() => {
      if (!enabled)
        return;
      let value = Date.now();
      setIndex(-1);
      let value2, callback = () => {
        let value3 = Date.now() - value;
        setIndex(creationTipIndexAtElapsed(value3));
        let value4 = value3 < runtime2.CREATION_TIP_INITIAL_DELAY_MS ? runtime2.CREATION_TIP_INITIAL_DELAY_MS - value3 : runtime2.CREATION_TIP_ROTATION_MS - (value3 - runtime2.CREATION_TIP_INITIAL_DELAY_MS) % runtime2.CREATION_TIP_ROTATION_MS;
        value2 = setTimeout(callback, value4);
      };
      return value2 = setTimeout(callback, runtime2.CREATION_TIP_INITIAL_DELAY_MS), () => clearTimeout(value2);
    }, [enabled]), index4;
  }
  return bindRuntimeValue(runtime2, "ReactCreationOverlay", () => ReactCreationOverlay, (value) => {
    ReactCreationOverlay = value;
  }), bindRuntimeValue(runtime2, "ReactCreationTips", () => ReactCreationTips, (value) => {
    ReactCreationTips = value;
  }), bindRuntimeValue(runtime2, "CREATION_TIPS", () => CREATION_TIPS, (value) => {
    CREATION_TIPS = value;
  }), bindRuntimeValue(runtime2, "getCreationTip", () => getCreationTip), bindRuntimeValue(runtime2, "creationTipIndexAtElapsed", () => creationTipIndexAtElapsed), bindRuntimeValue(runtime2, "useCreationTipIndex", () => useCreationTipIndex), bindRuntimeValue(runtime2, "CreationOverlayJsx", () => CreationOverlayJsx, (value) => {
    CreationOverlayJsx = value;
  }), bindRuntimeValue(runtime2, "escapeCreationSelector", () => escapeCreationSelector, (value) => {
    escapeCreationSelector = value;
  }), bindRuntimeValue(runtime2, "creationCoordinatesApproximatelyEqual", () => creationCoordinatesApproximatelyEqual, (value) => {
    creationCoordinatesApproximatelyEqual = value;
  }), bindRuntimeValue(runtime2, "creationRectsApproximatelyEqual", () => creationRectsApproximatelyEqual, (value) => {
    creationRectsApproximatelyEqual = value;
  }), bindRuntimeValue(runtime2, "SlideCreationOverlay", () => SlideCreationOverlay, (value) => {
    SlideCreationOverlay = value;
  }), () => {
    ReactCreationOverlay = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), ReactCreationTips = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), CREATION_TIPS = [
      (0, runtime2.formatMessage)({
        defaultMessage: "双击文字即可编辑。",
        id: "9tipWJcZvl"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "在幻灯片上发表评论，助手可据此修改。",
        id: "GexCAZHBGO"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "邀请他人查看、评论或编辑。",
        id: "iTNdf2mfji"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "在评论中使用 @ 提及他人。",
        id: "CARUAmHwZa"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "将电脑上的图片拖到幻灯片上。",
        id: "MfYKvJm3ob"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "每次编辑都会自动保存。",
        id: "ohCeQcu5Fb"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "与你共享的成员可以实时看到更改。",
        id: "F3SMIPpupt"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "拖动缩略图以调整幻灯片顺序。",
        id: "ulM22yyLKS"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "选择幻灯片上的内容即可评论。",
        id: "B66dsjItdL"
      })
    ], (0, runtime2.initializeSlideModel)(), CreationOverlayJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), escapeCreationSelector = (input) => typeof CSS < "u" && typeof CSS.escape == "function" ? CSS.escape(input) : input.replace(/["\\]/g, "\\$&"), creationCoordinatesApproximatelyEqual = (left, right) => left === right || left !== void 0 && right !== void 0 && Math.abs(left - right) < 0.25, creationRectsApproximatelyEqual = (left, right) => left === right || left !== null && right !== null && creationCoordinatesApproximatelyEqual(left.left, right.left) && creationCoordinatesApproximatelyEqual(left.top, right.top) && creationCoordinatesApproximatelyEqual(left.width, right.width) && creationCoordinatesApproximatelyEqual(left.height, right.height), SlideCreationOverlay = ReactCreationOverlay.memo(function({ view, stage, insetTop, insetBottom, insetSide, rail, railPlacement, hidden, onFit }) {
      let ref = ReactCreationOverlay.useRef(null), ref2 = ReactCreationOverlay.useRef(null), ref3 = ReactCreationOverlay.useRef(null), [value, value2] = ReactCreationOverlay.useState({
        slide: null,
        at: null,
        ground: void 0,
        overSlide: !1
      }), [value3, value4] = ReactCreationOverlay.useState(0), value5 = view.tag === "tips", value6 = (0, runtime2.useHostDrawsAgentTips)(), value7 = useCreationTipIndex(value5), ref4 = ReactCreationOverlay.useRef(null), ref5 = ReactCreationOverlay.useRef(null);
      ReactCreationOverlay.useEffect(() => {
        let callback = () => value4((input) => input + 1), value16 = typeof ResizeObserver == "function" ? new ResizeObserver(callback) : null, value17 = ref3.current?.closest(".mc-claude-cursor") ?? null;
        for (let value18 of [
          ref.current,
          stage.current,
          rail.current,
          value17
        ])
          value18 && value16?.observe(value18);
        let current = rail.current;
        return current?.addEventListener("scroll", callback, {
          capture: !0,
          passive: !0
        }), () => {
          value16?.disconnect(), current?.removeEventListener("scroll", callback, {
            capture: !0
          });
        };
      }, [
        stage,
        rail,
        railPlacement,
        view.phase,
        view.place === null,
        value.at === null,
        view.cells === null
      ]);
      let place = view.place, value8 = place?.on === "slide" && !value5 && (view.sheet === "none" || view.landing !== null && view.cells === null);
      ReactCreationOverlay.useLayoutEffect(() => {
        let value16 = ref.current?.getBoundingClientRect(), current = stage.current;
        if (!value16 || !current)
          return;
        let callback = (input) => ({
          left: input.left - value16.left,
          top: input.top - value16.top,
          width: input.width,
          height: input.height
        }), bounds = current.getBoundingClientRect(), value17 = (0, runtime2.fitSlideEditorViewport)({
          w: bounds.width,
          h: Math.max(0, bounds.height - insetTop - insetBottom),
          top: insetTop,
          sidePad: insetSide > 0 ? insetSide : void 0
        }), state = {
          left: bounds.left - value16.left - value17.x * value17.scale,
          top: bounds.top - value16.top - value17.y * value17.scale,
          width: runtime2.SLIDE_WIDTH * value17.scale,
          height: runtime2.SLIDE_HEIGHT * value17.scale
        };
        if (value5 && ref3.current) {
          let bounds2 = ref3.current.getBoundingClientRect();
          ref4.current = {
            left: bounds2.left - value16.left,
            top: bounds2.top - value16.top
          };
        }
        let value18 = null;
        if (place?.on === "slide") {
          let state2 = {
            left: state.left + 12,
            top: state.top + 12
          };
          value18 = value5 ? {
            left: state.left + state.width / 2,
            top: state.top + state.height / 2 - 24
          } : value8 ? state2 : ref4.current ?? state2;
        } else if (place?.on === "title") {
          let value21 = ref2.current ? callback(ref2.current.getBoundingClientRect()) : null;
          value18 = value21 ? {
            left: value21.left - 4,
            top: value21.top - 40
          } : null;
        } else if (place?.on === "cell") {
          let value21 = rail.current?.querySelector('[data-creation-cell="' + escapeCreationSelector(place.id) + '"]'), value22 = value21 ? callback(value21.getBoundingClientRect()) : null;
          value18 = value22 ? {
            left: value22.left + 12,
            top: value22.top + 12
          } : null;
        }
        let value19 = view.landing === null ? void 0 : value.ground;
        if (view.landing !== null && value19 === void 0) {
          let element = current.querySelector("[data-slide-surface]");
          for (let index4 = 0; element !== null && index4 < 5; index4++, element = element.firstElementChild) {
            let backgroundColor = getComputedStyle(element).backgroundColor;
            if (backgroundColor !== "" && backgroundColor !== "transparent" && !/^rgba\(.+,\s*0\)$/.test(backgroundColor)) {
              value19 = backgroundColor;
              break;
            }
          }
        }
        let value20 = current.querySelector("[data-slide-surface]") !== null;
        value20 || !onFit ? ref5.current = null : ref5.current !== value17.scale && (ref5.current = value17.scale, onFit(value17.scale)), (!creationRectsApproximatelyEqual(value.slide, state) || !creationCoordinatesApproximatelyEqual(value.at?.left, value18?.left) || !creationCoordinatesApproximatelyEqual(value.at?.top, value18?.top) || value.at === null != (value18 === null) || value.ground !== value19 || value.overSlide !== value20) && value2({
          slide: state,
          at: value18,
          ground: value19,
          overSlide: value20
        });
      });
      let value9 = place === null ? "" : place.on === "cell" ? "cell:" + place.id : value8 ? "slide:corner" : place.on, ref6 = ReactCreationOverlay.useRef({
        key: value9,
        until: 0,
        hidden: view.cursorHidden,
        fadeUntil: 0
      }), value10 = typeof performance < "u" ? performance.now() : 0;
      if (ref6.current.key !== value9) {
        let value16 = ref6.current.key === "" ? 0 : value9 === "slide:corner" ? runtime2.CREATION_CURSOR_CORNER_GLIDE_MS : view.glideMs;
        ref6.current = {
          ...ref6.current,
          key: value9,
          until: value10 + value16
        };
      }
      ref6.current.hidden !== view.cursorHidden && (ref6.current = {
        ...ref6.current,
        hidden: view.cursorHidden,
        fadeUntil: value10 + runtime2.CREATION_CURSOR_FADE_MS
      });
      let value11 = Math.max(0, Math.round(Math.max(ref6.current.until, ref6.current.fadeUntil) - value10));
      ReactCreationOverlay.useEffect(() => {
        if (value11 <= 0)
          return;
        let value16 = setTimeout(() => value4((input) => input + 1), value11 + 20);
        return () => clearTimeout(value16);
      }, [value11, value3]);
      let slide = value.slide, value12 = (view.sheet === "ground" || view.sheet === "lifting") && value.ground !== void 0, value13 = value.overSlide ? 1 : 0, value14 = slide ? {
        left: slide.left - value13,
        top: slide.top - value13,
        width: slide.width + 2 * value13,
        height: slide.height + 2 * value13,
        ...value12 ? {
          backgroundColor: value.ground
        } : {},
        transitionDuration: String(view.toEmptyDeck ? runtime2.CREATION_EMPTY_DECK_FADE_MS : view.sheet === "ground" ? runtime2.CREATION_SHEET_GROUND_MS : runtime2.CREATION_SHEET_LIFT_MS) + "ms"
      } : void 0, value15 = view.title !== "" && (view.phase === "outline" || view.landing !== null);
      return CreationOverlayJsx.jsxs(CreationOverlayJsx.Fragment, {
        children: [
          view.cursor ? CreationOverlayJsx.jsx("span", {
            className: "sr-only",
            children: runtime2.CLAUDE_WORKING_LABEL
          }) : null,
          CreationOverlayJsx.jsxs("div", {
            ref,
            "aria-hidden": "true",
            className: (0, runtime2.joinClassNames)("sl-creation-layer pointer-events-none absolute inset-0 z-20 overflow-hidden", hidden && "invisible", view.sheetIn && "sl-creation-arrive"),
            children: [
              view.sheet !== "none" && slide && !value.overSlide ? CreationOverlayJsx.jsx("div", {
                className: (0, runtime2.joinClassNames)("sl-creation-shadow absolute shadow-lg", view.toEmptyDeck && "opacity-0"),
                style: {
                  left: slide.left,
                  top: slide.top,
                  width: slide.width,
                  height: slide.height,
                  transitionDuration: String(runtime2.CREATION_EMPTY_DECK_FADE_MS) + "ms"
                }
              }) : null,
              view.sheet !== "none" && value14 ? CreationOverlayJsx.jsxs("div", {
                className: (0, runtime2.joinClassNames)("sl-creation-sheet absolute bg-editor-canvas", (view.sheet === "lifting" || view.toEmptyDeck) && "opacity-0"),
                style: value14,
                "data-sheet": view.sheet,
                children: [
                  CreationOverlayJsx.jsx("div", {
                    className: (0, runtime2.joinClassNames)("mc-claude-box absolute inset-0", value12 && "opacity-0")
                  }),
                  value15 ? CreationOverlayJsx.jsx("p", {
                    ref: ref2,
                    dir: "auto",
                    className: (0, runtime2.joinClassNames)("sl-creation-title mc-tip-shimmer absolute line-clamp-2 font-sans-display", view.titleOn ? "opacity-100" : "opacity-0"),
                    style: {
                      left: "8%",
                      right: "20%",
                      bottom: "14%",
                      fontSize: slide ? slide.width * 0.058 : void 0,
                      transitionDuration: String(view.titleOn ? runtime2.CREATION_TITLE_FADE_IN_MS : runtime2.CREATION_TITLE_FADE_OUT_MS) + "ms"
                    },
                    children: view.title
                  }) : null
                ]
              }) : null,
              value.at !== null && place !== null ? CreationOverlayJsx.jsx(runtime2.AgentCursor, {
                tint: "yellow",
                at: value.at,
                align: value5 ? "centre" : "arrow",
                glideMs: value11,
                hidden: view.cursorHidden,
                arrowRef: ref3,
                label: value5 && !value6 ? {
                  kind: "words",
                  text: getCreationTip(value7),
                  index: value7,
                  shimmer: !0,
                  outMs: runtime2.CREATION_TIP_FADE_OUT_MS,
                  inMs: runtime2.CREATION_TIP_FADE_IN_MS
                } : {
                  kind: "name",
                  text: "Agent"
                }
              }) : null
            ]
          })
        ]
      });
    });
  };
}
export {
  installCreationOverlay
};
