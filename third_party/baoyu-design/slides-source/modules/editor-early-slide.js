// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorEarlySlide(runtime2) {
  var ReactEarlySlide, LOCAL_WORDS_STYLES, SLIDES_PRINT_STYLES, EarlySlideJsx, emptyEarlySlideSource, getEarlySlideSource, EarlySlideErrorBoundary, EARLY_SLIDE_PAINT_TIMEOUT_MS;
  function EarlySlideFallback({ doc, fallback, sidePad = 0 }) {
    let value = getEarlySlideSource(doc), value2 = ReactEarlySlide.useSyncExternalStore(value.subscribeEarly, value.earlySlide, value.earlySlide);
    return value2 === void 0 ? EarlySlideJsx.jsx(EarlySlideJsx.Fragment, {
      children: fallback
    }) : EarlySlideJsx.jsx(EarlySlideErrorBoundary, {
      fallback,
      children: EarlySlideJsx.jsx(EarlySlideView, {
        early: value2,
        sidePad
      })
    }, value2.id);
  }
  function waitForEarlySlidePaint() {
    return typeof document > "u" || document.visibilityState !== "visible" || typeof requestAnimationFrame != "function" ? Promise.resolve() : new Promise((input) => {
      let value = setTimeout(input, EARLY_SLIDE_PAINT_TIMEOUT_MS);
      document.addEventListener("visibilitychange", () => input(), {
        once: !0
      }), requestAnimationFrame(() => void setTimeout(() => {
        clearTimeout(value), input();
      }, 0));
    });
  }
  function EarlySlideView({ early, sidePad = 0 }) {
    let { content } = early;
    (0, runtime2.setRenderingTheme)(content.theme);
    let memo4 = ReactEarlySlide.useMemo(() => (0, runtime2.buildDeckThemeCss)(content.fonts, content.faces), [content.fonts, content.faces]), memo22 = ReactEarlySlide.useMemo(() => new Map(Object.entries(content.assets)), [content.assets]), [value, value2, value3] = (0, runtime2.useToolbarInsets)(), ref = ReactEarlySlide.useRef(null), callback = ReactEarlySlide.useCallback((input) => {
      ref.current = input, value2(input);
    }, [value2]), [value4, value5] = ReactEarlySlide.useState({
      w: 0,
      h: 0
    });
    ReactEarlySlide.useLayoutEffect(() => {
      let current = ref.current;
      if (!current)
        return;
      current.setAttribute("inert", "");
      let callback2 = () => value5({
        w: current.clientWidth,
        h: current.clientHeight
      });
      callback2();
      let observer = new ResizeObserver(callback2);
      return observer.observe(current), () => observer.disconnect();
    }, []);
    let pad = Math.max(value3, sidePad), value6 = (0, runtime2.fitSlideEditorViewport)({
      w: value4.w,
      h: Math.max(0, value4.h - value),
      top: value,
      ...pad > 0 ? {
        sidePad: pad
      } : {}
    });
    return EarlySlideJsx.jsxs("div", {
      ref: callback,
      "aria-hidden": !0,
      "data-slides-early": "",
      className: "absolute inset-0 overflow-hidden",
      children: [
        EarlySlideJsx.jsx("style", {
          children: SLIDES_PRINT_STYLES
        }),
        memo4 !== "" ? EarlySlideJsx.jsx("style", {
          children: memo4
        }) : null,
        value4.w > 0 ? EarlySlideJsx.jsx("div", {
          style: {
            position: "absolute",
            left: -value6.x * value6.scale,
            top: -value6.y * value6.scale,
            width: runtime2.SLIDE_WIDTH,
            height: runtime2.SLIDE_HEIGHT,
            transform: "scale(" + String(value6.scale) + ")",
            transformOrigin: "top left"
          },
          children: EarlySlideJsx.jsx(runtime2.SlideSurface, {
            slide: content.slides[early.id],
            assets: memo22,
            animate: !1
          })
        }) : null
      ]
    });
  }
  return bindRuntimeValue(runtime2, "ReactEarlySlide", () => ReactEarlySlide, (value) => {
    ReactEarlySlide = value;
  }), bindRuntimeValue(runtime2, "LOCAL_WORDS_STYLES", () => LOCAL_WORDS_STYLES, (value) => {
    LOCAL_WORDS_STYLES = value;
  }), bindRuntimeValue(runtime2, "SLIDES_PRINT_STYLES", () => SLIDES_PRINT_STYLES, (value) => {
    SLIDES_PRINT_STYLES = value;
  }), bindRuntimeValue(runtime2, "EarlySlideJsx", () => EarlySlideJsx, (value) => {
    EarlySlideJsx = value;
  }), bindRuntimeValue(runtime2, "emptyEarlySlideSource", () => emptyEarlySlideSource, (value) => {
    emptyEarlySlideSource = value;
  }), bindRuntimeValue(runtime2, "getEarlySlideSource", () => getEarlySlideSource, (value) => {
    getEarlySlideSource = value;
  }), bindRuntimeValue(runtime2, "EarlySlideFallback", () => EarlySlideFallback), bindRuntimeValue(runtime2, "EarlySlideErrorBoundary", () => EarlySlideErrorBoundary, (value) => {
    EarlySlideErrorBoundary = value;
  }), bindRuntimeValue(runtime2, "EARLY_SLIDE_PAINT_TIMEOUT_MS", () => EARLY_SLIDE_PAINT_TIMEOUT_MS, (value) => {
    EARLY_SLIDE_PAINT_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "waitForEarlySlidePaint", () => waitForEarlySlidePaint), bindRuntimeValue(runtime2, "EarlySlideView", () => EarlySlideView), () => {
    ReactEarlySlide = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeSlideRenderer)(), LOCAL_WORDS_STYLES = [
      "[data-local-words],[data-local-glyph]{position:relative;}",
      "[data-local-words]::before{content:attr(data-local-words);}",
      "[data-local-words]>span{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);}",
      "[data-local-hold]::before{position:absolute;inset:0;overflow:hidden;}",
      "[data-local-hold]>span{position:static;width:auto;height:auto;overflow:visible;}",
      "[data-local-glyph]{color:transparent;}",
      "[data-local-glyph]::before{content:attr(data-local-glyph);position:absolute;inset:0;color:var(--drawn-ink,CanvasText);}",
      "@media (forced-colors:active){[data-local-glyph],[data-local-glyph]::before{forced-color-adjust:none;}[data-local-glyph]::before{color:CanvasText;}}"
    ], SLIDES_PRINT_STYLES = [
      ...LOCAL_WORDS_STYLES,
      "[data-local-words],[data-local-glyph]{-webkit-user-select:none;user-select:none;}",
      "[data-local-hold]::before{white-space:nowrap;text-overflow:ellipsis;text-decoration:inherit;}",
      ".slides-card-title[data-local-hold]::before{bottom:auto;z-index:1;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;overflow-wrap:anywhere;background:var(--card-ground);}",
      "@page{size:1920px 1080px;margin:0;}",
      ".slides-print-sheet{display:none;}",
      "@media print{",
      "  #root{display:none !important;}",
      "  [data-mc-chrome]{display:none !important;}",
      "  .slides-print-sheet{display:block !important;}",
      "  .slides-print-slide{break-after:page;page-break-after:always;break-inside:avoid;}",
      "  .slides-print-slide:last-child{break-after:auto;page-break-after:auto;}",
      "}"
    ].join(`
`), (0, runtime2.initializeRenderingTheme)(), EarlySlideJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), emptyEarlySlideSource = {
      earlySlide: () => {
      },
      subscribeEarly: () => () => {
      }
    }, getEarlySlideSource = (document2) => typeof document2.earlySlide == "function" ? document2 : emptyEarlySlideSource, EarlySlideErrorBoundary = class extends ReactEarlySlide.Component {
      state = {
        failed: !1
      };
      static getDerivedStateFromError() {
        return {
          failed: !0
        };
      }
      componentDidCatch(input) {
        try {
          typeof reportError == "function" && reportError(input);
        } catch {
        }
      }
      render() {
        return this.state.failed ? this.props.fallback : this.props.children;
      }
    }, EARLY_SLIDE_PAINT_TIMEOUT_MS = 100;
  };
}
export {
  installEditorEarlySlide
};
