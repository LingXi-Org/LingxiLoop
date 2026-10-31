// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiArtifactLoadBoundary(runtime2) {
  var reactGQ, jsxX1, ARTIFACT_LOAD_FAILURE_MESSAGE, ARTIFACT_LOAD_DELAY_MS;
  function ArtifactSkeleton({ className }) {
    return jsxX1.jsx("span", {
      "aria-hidden": "true",
      className: "contents",
      children: jsxX1.jsx(runtime2.SkeletonPrimitive, {
        className: (0, runtime2.joinClassNames)("block", className)
      })
    });
  }
  function ArtifactLoadingSpinner({ className }) {
    return jsxX1.jsx("span", {
      className: (0, runtime2.joinClassNames)("inline-flex", className),
      children: jsxX1.jsx(runtime2.Spinner, {
        label: "正在加载"
      })
    });
  }
  function ArtifactLoadBoundary({ doc, skeleton, skeletonFlush, held = !1, exposed = !0, children }) {
    let callback = () => {
      let value5 = typeof doc.loadState == "function" ? doc.loadState() : "live";
      return value5 === "loading" || value5 === "failed" ? value5 : "live";
    }, [value, value2] = reactGQ.useState(callback), [value3, value4] = reactGQ.useState(""), ref = reactGQ.useRef(null), ref2 = reactGQ.useRef(!1), ref3 = reactGQ.useRef(!0);
    return reactGQ.useEffect(() => (ref2.current = !1, ref3.current = !0, value2(callback()), doc.subscribeLoad?.(() => {
      let value5 = callback();
      value5 === "loading" && ref.current !== null && (ref2.current = document.activeElement === ref.current), value2(value5);
    })), [doc]), reactGQ.useEffect(() => {
      if (value !== "failed") {
        value === "live" && (ref2.current = !1, ref3.current = !0), value4("");
        return;
      }
      let activeElement2 = document.activeElement, value5 = document.hasFocus() && (activeElement2 === null || activeElement2 === document.body || activeElement2 === document.documentElement);
      ref2.current && value5 && ref.current?.focus({
        preventScroll: !0
      });
    }, [value]), reactGQ.useEffect(() => {
      if (value !== "failed" || !exposed || !ref3.current)
        return;
      let value6 = setTimeout(() => {
        ref3.current = !1, value4(ARTIFACT_LOAD_FAILURE_MESSAGE);
      }, ARTIFACT_LOAD_DELAY_MS), value7 = setTimeout(() => value4(""), ARTIFACT_LOAD_DELAY_MS + runtime2.ANNOUNCEMENT_CLEAR_MS);
      return () => {
        clearTimeout(value6), clearTimeout(value7);
      };
    }, [value, exposed]), value === "live" && !held ? jsxX1.jsx(jsxX1.Fragment, {
      children
    }) : jsxX1.jsxs("div", {
      className: (0, runtime2.joinClassNames)("mc-loadgate relative h-full min-h-40 w-full", !(skeletonFlush && skeleton != null) && "pt-[var(--tb-overlay-h,0px)]"),
      "aria-busy": value !== "failed",
      children: [
        skeleton ?? jsxX1.jsx(ArtifactSkeleton, {
          className: "m-6 h-48 rounded-lg"
        }),
        jsxX1.jsx("span", {
          className: "sr-only",
          role: "status",
          "aria-live": "polite",
          "aria-atomic": "true",
          "data-kit": "load-status",
          children: value3
        }),
        jsxX1.jsx("div", {
          className: "pointer-events-none absolute inset-x-0 top-[calc(var(--tb-overlay-h,0px)+1rem)] flex justify-center",
          children: value !== "failed" ? jsxX1.jsx(ArtifactLoadingSpinner, {}) : jsxX1.jsxs("span", {
            className: "pointer-events-auto inline-flex items-center gap-2 rounded-md border border-border-line bg-panel px-3 py-1.5 text-xs text-fg-muted shadow-sm",
            children: [
              ARTIFACT_LOAD_FAILURE_MESSAGE,
              jsxX1.jsx(runtime2.TextLink, {
                ref,
                onClick: () => {
                  ref3.current = !0, doc.save?.();
                },
                children: "重试"
              })
            ]
          })
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "reactGQ", () => reactGQ, (value) => {
    reactGQ = value;
  }), bindRuntimeValue(runtime2, "jsxX1", () => jsxX1, (value) => {
    jsxX1 = value;
  }), bindRuntimeValue(runtime2, "ArtifactSkeleton", () => ArtifactSkeleton), bindRuntimeValue(runtime2, "ArtifactLoadingSpinner", () => ArtifactLoadingSpinner), bindRuntimeValue(runtime2, "ARTIFACT_LOAD_FAILURE_MESSAGE", () => ARTIFACT_LOAD_FAILURE_MESSAGE, (value) => {
    ARTIFACT_LOAD_FAILURE_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "ARTIFACT_LOAD_DELAY_MS", () => ARTIFACT_LOAD_DELAY_MS, (value) => {
    ARTIFACT_LOAD_DELAY_MS = value;
  }), bindRuntimeValue(runtime2, "ArtifactLoadBoundary", () => ArtifactLoadBoundary), () => {
    (0, runtime2.initializeNumberScrubNoop)(), (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiAnnouncements)(), reactGQ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxX1 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), ARTIFACT_LOAD_FAILURE_MESSAGE = "The latest content failed to load", ARTIFACT_LOAD_DELAY_MS = 100;
  };
}
export {
  installUiArtifactLoadBoundary
};
