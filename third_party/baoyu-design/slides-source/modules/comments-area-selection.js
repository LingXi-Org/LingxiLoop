// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsAreaSelection(runtime2) {
  var ReactSlideComments, CommentAreaJsx, ReactCommentSelection, COMMENT_AREA_RESIZE_MIN_PX, ReactDocumentCommentMode, documentCommentModeSnapshot, useDocumentCommentMode;
  function subscribeDocumentCommentMode(onChange) {
    let observer = new MutationObserver(onChange);
    return observer.observe(document.documentElement, {
      attributes: !0,
      attributeFilter: ["data-comment-mode"]
    }), () => observer.disconnect();
  }
  function CommentAreaSelectionOutline({ rect, origin, handle, onHandlePointerDown, kind }) {
    return CommentAreaJsx.jsxs(CommentAreaJsx.Fragment, {
      children: [
        CommentAreaJsx.jsx("div", {
          "aria-hidden": !0,
          "data-testid": "comment-area-outline",
          "data-kind": kind,
          className: "pointer-events-none absolute border border-dashed border-editor-comment-target",
          style: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          }
        }),
        origin ? CommentAreaJsx.jsx("div", {
          "aria-hidden": !0,
          "data-testid": "comment-area-origin",
          className: "pointer-events-none absolute rounded-full ring-6 ring-inset ring-editor-comment-target",
          style: {
            left: origin.x - 5,
            top: origin.y - 5,
            width: 10,
            height: 10,
            outline: "2px solid transparent",
            outlineOffset: -2
          }
        }) : null,
        origin && handle ? CommentAreaJsx.jsx("div", {
          "data-area-handle": "",
          className: "absolute rounded-full",
          style: {
            left: origin.x - 9,
            top: origin.y - 9,
            width: 18,
            height: 18,
            cursor: "nwse-resize"
          },
          onPointerDown: onHandlePointerDown
        }) : null
      ]
    });
  }
  function useCommentAreaDrag(input) {
    let [value, value2] = ReactCommentSelection.useState(null), ref = ReactCommentSelection.useRef(input);
    ref.current = input;
    let ref2 = ReactCommentSelection.useRef(null), callback = () => {
      ref2.current?.cleanup(), ref2.current = null, value2(null);
    };
    return ReactCommentSelection.useEffect(() => () => ref2.current?.cleanup(), []), {
      marquee: value,
      drawing: () => ref2.current !== null,
      start: (input2, options, context) => {
        let current = ref.current, value3 = current.stage(), value4 = context ?? current.toLocal(input2.clientX, input2.clientY);
        if (!value3 || value4 == null)
          return !1;
        callback();
        let pointerId = input2.pointerId;
        try {
          options.setPointerCapture(pointerId);
        } catch {
        }
        let callback2 = () => {
          callback(), ref.current.onNothing();
        }, callback3 = (input3) => Math.hypot(input3.clientX - input2.clientX, input3.clientY - input2.clientY) > ref.current.slopPx, flag = !1, callback4 = (input3) => {
          if (input3.pointerId !== pointerId)
            return;
          if (!(input3.buttons & 1))
            return callback2();
          if (!flag && !callback3(input3))
            return;
          !flag && !context && ref.current.onLive?.(), flag = !0;
          let bounds = value3.getBoundingClientRect();
          value2({
            pin: value4,
            x1: input3.clientX - bounds.left,
            y1: input3.clientY - bounds.top,
            resizing: context !== void 0
          });
        }, callback5 = (input3) => {
          if (input3.pointerId !== pointerId)
            return;
          callback();
          let current2 = ref.current;
          if (input3.button !== 0)
            return current2.onNothing();
          if (!callback3(input3))
            return context || current2.onClick(input3), current2.onNothing();
          let value5 = current2.toLocal(input3.clientX, input3.clientY), value6 = current2.toClient(value4);
          if (value5 == null || !value6 || Math.abs(input3.clientX - value6.x) < COMMENT_AREA_RESIZE_MIN_PX || Math.abs(input3.clientY - value6.y) < COMMENT_AREA_RESIZE_MIN_PX)
            return current2.onNothing();
          current2.onArea({
            c0: value4,
            c1: value5,
            at: context ? value6 : {
              x: input3.clientX,
              y: input3.clientY
            },
            resizing: context !== void 0
          });
        }, callback6 = (event) => {
          event.key !== "Escape" || !ref2.current || (event.preventDefault(), event.stopPropagation(), callback2());
        }, callback7 = (input3) => {
          input3.pointerId === pointerId && callback2();
        };
        return window.addEventListener("pointermove", callback4, !0), window.addEventListener("pointerup", callback5, !0), window.addEventListener("pointercancel", callback7, !0), window.addEventListener("keydown", callback6, !0), window.addEventListener("blur", callback2), ref2.current = {
          id: pointerId,
          cleanup: () => {
            window.removeEventListener("pointermove", callback4, !0), window.removeEventListener("pointerup", callback5, !0), window.removeEventListener("pointercancel", callback7, !0), window.removeEventListener("keydown", callback6, !0), window.removeEventListener("blur", callback2);
            try {
              options.hasPointerCapture(pointerId) && options.releasePointerCapture(pointerId);
            } catch {
            }
          }
        }, !0;
      },
      cancel: callback
    };
  }
  function useCommentMoveKeyHighlight(input, options) {
    let [value, value2] = ReactCommentSelection.useState(null), ref = ReactCommentSelection.useRef(null), ref2 = ReactCommentSelection.useRef({
      composing: input,
      scope: options
    });
    ref2.current = {
      composing: input,
      scope: options
    };
    let callback = () => {
      let current = ref.current;
      value2(ref2.current.composing && current?.scope === ref2.current.scope ? current.rect : null);
    }, callback2 = () => {
      ref.current = null, value2(null);
    };
    return ReactCommentSelection.useEffect(() => {
      input || callback2();
    }, [input]), ReactCommentSelection.useEffect(callback, [options]), {
      drawn: value,
      show: value2,
      hold: (input2, options2) => {
        ref.current = {
          rect: input2,
          scope: options2
        };
      },
      restore: callback,
      clear: callback2
    };
  }
  return bindRuntimeValue(runtime2, "ReactSlideComments", () => ReactSlideComments, (value) => {
    ReactSlideComments = value;
  }), bindRuntimeValue(runtime2, "CommentAreaJsx", () => CommentAreaJsx, (value) => {
    CommentAreaJsx = value;
  }), bindRuntimeValue(runtime2, "CommentAreaSelectionOutline", () => CommentAreaSelectionOutline), bindRuntimeValue(runtime2, "ReactCommentSelection", () => ReactCommentSelection, (value) => {
    ReactCommentSelection = value;
  }), bindRuntimeValue(runtime2, "COMMENT_AREA_RESIZE_MIN_PX", () => COMMENT_AREA_RESIZE_MIN_PX, (value) => {
    COMMENT_AREA_RESIZE_MIN_PX = value;
  }), bindRuntimeValue(runtime2, "useCommentAreaDrag", () => useCommentAreaDrag), bindRuntimeValue(runtime2, "useCommentMoveKeyHighlight", () => useCommentMoveKeyHighlight), bindRuntimeValue(runtime2, "ReactDocumentCommentMode", () => ReactDocumentCommentMode, (value) => {
    ReactDocumentCommentMode = value;
  }), bindRuntimeValue(runtime2, "documentCommentModeSnapshot", () => documentCommentModeSnapshot, (value) => {
    documentCommentModeSnapshot = value;
  }), bindRuntimeValue(runtime2, "subscribeDocumentCommentMode", () => subscribeDocumentCommentMode), bindRuntimeValue(runtime2, "useDocumentCommentMode", () => useDocumentCommentMode, (value) => {
    useDocumentCommentMode = value;
  }), () => {
    (0, runtime2.initializeCaptureFallback)(), (0, runtime2.initializeSlideRenderer)(), ReactSlideComments = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), CommentAreaJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), ReactCommentSelection = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), COMMENT_AREA_RESIZE_MIN_PX = 12, ReactDocumentCommentMode = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), documentCommentModeSnapshot = () => document.documentElement.hasAttribute("data-comment-mode"), useDocumentCommentMode = () => ReactDocumentCommentMode.useSyncExternalStore(subscribeDocumentCommentMode, documentCommentModeSnapshot);
  };
}
export {
  installCommentsAreaSelection
};
