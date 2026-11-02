// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorThumbnailApp(runtime2) {
  var ReactSlidesThumbnail, SlidesThumbnailJsx, DEFAULT_THUMBNAIL_THEME;
  function chooseThumbnailCoverSlide(slides, coverId) {
    let hasFrames = (input) => input.frames.length > 0, cover = coverId !== void 0 ? slides.find((input) => input.id === coverId) : void 0;
    return (cover !== void 0 && hasFrames(cover) ? cover : void 0) ?? slides.find((input) => input.skipped !== !0 && hasFrames(input)) ?? slides.find(hasFrames);
  }
  function SlidesThumbnailApp() {
    let memo4 = ReactSlidesThumbnail.useMemo(() => new runtime2.SlidesDocumentStore(), []), value = ReactSlidesThumbnail.useSyncExternalStore(ReactSlidesThumbnail.useCallback((input) => memo4.subscribe(input), [memo4]), () => memo4.getSnapshot()), value2 = ReactSlidesThumbnail.useSyncExternalStore(ReactSlidesThumbnail.useCallback((input) => memo4.doc.subscribe(() => input()), [memo4]), () => memo4.doc.title() || document.title), value3 = ReactSlidesThumbnail.useSyncExternalStore(ReactSlidesThumbnail.useCallback((input) => "subscribeLoad" in memo4.doc ? memo4.doc.subscribeLoad(input) : () => {
    }, [memo4]), () => !("loadState" in memo4.doc) || memo4.doc.loadState() === "live"), memo22 = ReactSlidesThumbnail.useMemo(() => (0, runtime2.buildDeckThemeCss)(value.fonts, value.faces), [value.fonts, value.faces]), ref = ReactSlidesThumbnail.useRef(void 0);
    return value3 && ref.current === void 0 && (ref.current = chooseThumbnailCoverSlide(value.slides, value.cover)), SlidesThumbnailJsx.jsx(SlidesThumbnailSlide, {
      slide: ref.current,
      assets: value.assets,
      fontCss: memo22,
      title: value3 ? value2 : void 0
    });
  }
  function SlidesThumbnailSlide({ slide, assets, fontCss, title }) {
    let ref = ReactSlidesThumbnail.useRef(null), [value, value2] = ReactSlidesThumbnail.useState(1);
    ReactSlidesThumbnail.useLayoutEffect(() => {
      let current = ref.current;
      if (!current)
        return;
      let callback = () => value2(Math.min(current.clientWidth / runtime2.SLIDE_WIDTH, current.clientHeight / runtime2.SLIDE_HEIGHT) || 1);
      callback();
      let observer = new ResizeObserver(callback);
      return observer.observe(current), () => observer.disconnect();
    }, []);
    let value3 = (0, runtime2.slideBackgroundColor)(slide?.bg ?? DEFAULT_THUMBNAIL_THEME);
    return SlidesThumbnailJsx.jsxs("div", {
      ref,
      "data-appifact-content": "",
      "data-slides-cover": "",
      style: {
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: value3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      },
      children: [
        SlidesThumbnailJsx.jsx("style", {
          children: runtime2.SLIDES_PRINT_STYLES
        }),
        fontCss !== "" ? SlidesThumbnailJsx.jsx("style", {
          children: fontCss
        }) : null,
        SlidesThumbnailJsx.jsx("div", {
          style: {
            width: runtime2.SLIDE_WIDTH * value,
            height: runtime2.SLIDE_HEIGHT * value,
            flex: "none"
          },
          children: SlidesThumbnailJsx.jsx("div", {
            style: {
              width: runtime2.SLIDE_WIDTH,
              height: runtime2.SLIDE_HEIGHT,
              transform: "scale(" + String(value) + ")",
              transformOrigin: "top left"
            },
            children: slide !== void 0 ? SlidesThumbnailJsx.jsx(runtime2.SlideSurface, {
              slide,
              assets,
              animate: !1
            }) : title !== void 0 ? SlidesThumbnailJsx.jsx(SlidesTitleCover, {
              title
            }) : null
          })
        })
      ]
    });
  }
  function SlidesTitleCover({ title }) {
    let value = (0, runtime2.renderingTypeScaleForRole)("display");
    return SlidesThumbnailJsx.jsx("div", {
      "data-slides-title-cover": "",
      style: {
        width: runtime2.SLIDE_WIDTH,
        height: runtime2.SLIDE_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 160,
        boxSizing: "border-box"
      },
      children: SlidesThumbnailJsx.jsx("div", {
        style: {
          fontFamily: value.fontFamily,
          fontSize: value.fontSize,
          fontWeight: value.fontWeight,
          lineHeight: value.lineHeight,
          ...value.serifDisplay ? {
            fontVariationSettings: "'opsz' 48"
          } : null,
          color: (0, runtime2.slideTextColor)(DEFAULT_THUMBNAIL_THEME),
          textAlign: "center",
          overflowWrap: "anywhere",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden"
        },
        children: title
      })
    });
  }
  return bindRuntimeValue(runtime2, "ReactSlidesThumbnail", () => ReactSlidesThumbnail, (value) => {
    ReactSlidesThumbnail = value;
  }), bindRuntimeValue(runtime2, "SlidesThumbnailJsx", () => SlidesThumbnailJsx, (value) => {
    SlidesThumbnailJsx = value;
  }), bindRuntimeValue(runtime2, "DEFAULT_THUMBNAIL_THEME", () => DEFAULT_THUMBNAIL_THEME, (value) => {
    DEFAULT_THUMBNAIL_THEME = value;
  }), bindRuntimeValue(runtime2, "chooseThumbnailCoverSlide", () => chooseThumbnailCoverSlide), bindRuntimeValue(runtime2, "SlidesThumbnailApp", () => SlidesThumbnailApp), bindRuntimeValue(runtime2, "SlidesThumbnailSlide", () => SlidesThumbnailSlide), bindRuntimeValue(runtime2, "SlidesTitleCover", () => SlidesTitleCover), () => {
    (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeSlideRenderer)(), ReactSlidesThumbnail = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeRenderingTheme)(), SlidesThumbnailJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), DEFAULT_THUMBNAIL_THEME = "ivory-warm";
  };
}
export {
  installEditorThumbnailApp
};
