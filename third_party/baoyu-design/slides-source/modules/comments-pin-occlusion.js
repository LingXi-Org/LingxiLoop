// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCommentsPinOcclusion(runtime2) {
  var COMMENT_PIN_BUTTON, COMMENT_PIN_OCCLUDER_SELECTOR;
  function commentPinButtonRect(x, y) {
    let below = window.innerHeight - (y + COMMENT_PIN_BUTTON.gap), above = y - COMMENT_PIN_BUTTON.gap, flip4 = below < 320 && above > below && (above >= 240 || below < 240 && above >= 48), left = Math.min(Math.max(x, 0), Math.max(0, window.innerWidth - COMMENT_PIN_BUTTON.size - COMMENT_PIN_BUTTON.edge)), top = flip4 ? y - COMMENT_PIN_BUTTON.gap - COMMENT_PIN_BUTTON.size : y + COMMENT_PIN_BUTTON.gap;
    return {
      left,
      top,
      right: left + COMMENT_PIN_BUTTON.size,
      bottom: top + COMMENT_PIN_BUTTON.size
    };
  }
  function collectCommentPinOccluders(root = document) {
    let rects = [];
    for (let element of root.querySelectorAll(COMMENT_PIN_OCCLUDER_SELECTOR)) {
      if ((0, runtime2.isOverlayClosed)(element) || element.checkVisibility?.({
        visibilityProperty: !0
      }) === !1)
        continue;
      let rect = element.getBoundingClientRect();
      rect.width > 0 && rect.height > 0 && rects.push({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      });
    }
    return rects;
  }
  function commentPinOccluded(x, y, occluders) {
    let rect = commentPinButtonRect(x, y);
    return occluders.some((occluder) => rect.left < occluder.right && rect.right > occluder.left && rect.top < occluder.bottom && rect.bottom > occluder.top);
  }
  function observeBodyChildren(callback, doc = document) {
    if (typeof MutationObserver > "u")
      return () => {
      };
    let observer = new MutationObserver(callback);
    return observer.observe(doc.body, {
      childList: !0
    }), () => observer.disconnect();
  }
  function observeCommentLayoutShifts(target, callback) {
    let onTransitionEnd = (event) => void (/^(height|width|transform|top|left|right|bottom|inset|flex-basis)/.test(event.propertyName) && !(event.target instanceof Element && event.target.closest(".mc-peer-cursors")) && callback());
    target?.addEventListener("transitionend", onTransitionEnd, !0), target?.addEventListener("load", callback, !0);
    let fonts = typeof document < "u" ? document.fonts : void 0;
    return fonts?.addEventListener?.("loadingdone", callback), () => {
      target?.removeEventListener("transitionend", onTransitionEnd, !0), target?.removeEventListener("load", callback, !0), fonts?.removeEventListener?.("loadingdone", callback);
    };
  }
  function createCommentPinReporter(report, enabled = () => !0) {
    let bySource = /* @__PURE__ */ new Map(), last = null, flush = () => {
      let merged = {
        ...bySource.get("grid"),
        ...bySource.get("slide")
      }, key = JSON.stringify(merged);
      key !== last && (last = key, report(merged));
    };
    return {
      set(source, positions) {
        if (enabled()) {
          if (positions !== null)
            bySource.set(source, positions);
          else if (!bySource.delete(source))
            return;
          bySource.size === 0 ? queueMicrotask(() => void (bySource.size === 0 && enabled() && flush())) : flush();
        }
      },
      reset() {
        bySource.clear(), last = null;
      },
      forget() {
        last = null;
      }
    };
  }
  return bindRuntimeValue(runtime2, "COMMENT_PIN_BUTTON", () => COMMENT_PIN_BUTTON, (value) => {
    COMMENT_PIN_BUTTON = value;
  }), bindRuntimeValue(runtime2, "COMMENT_PIN_OCCLUDER_SELECTOR", () => COMMENT_PIN_OCCLUDER_SELECTOR, (value) => {
    COMMENT_PIN_OCCLUDER_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "commentPinButtonRect", () => commentPinButtonRect), bindRuntimeValue(runtime2, "collectCommentPinOccluders", () => collectCommentPinOccluders), bindRuntimeValue(runtime2, "commentPinOccluded", () => commentPinOccluded), bindRuntimeValue(runtime2, "observeBodyChildren", () => observeBodyChildren), bindRuntimeValue(runtime2, "observeCommentLayoutShifts", () => observeCommentLayoutShifts), bindRuntimeValue(runtime2, "createCommentPinReporter", () => createCommentPinReporter), () => {
    (0, runtime2.initializeUiPropertyFocus)(), COMMENT_PIN_BUTTON = {
      size: 36,
      gap: 4,
      edge: 8
    }, COMMENT_PIN_OCCLUDER_SELECTOR = [
      ...runtime2.OPEN_OVERLAY_SELECTOR.split(", ").filter((selector) => selector !== "[data-mc-scrim]"),
      "[data-mc-strip]",
      "[" + runtime2.FIND_BAR_ATTRIBUTE + "]",
      "[data-slides-pager] > *",
      "[data-tb-foot]",
      ".mc-follow-note"
    ].join(", ");
  };
}
export {
  installCommentsPinOcclusion
};
