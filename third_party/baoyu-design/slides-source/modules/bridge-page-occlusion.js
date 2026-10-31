// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installBridgePageOcclusion(runtime2) {
  var ReactPageOcclusion;
  function calculatePageOcclusionBottom(layout) {
    return layout.presenting || layout.workingBottom === null ? 0 : Math.max(0, Math.round(layout.viewportH - layout.workingBottom)) + Math.max(0, Math.round(layout.band));
  }
  function PageOcclusionReporter({ band, presenting, settle, speaksForPage }) {
    let ref = ReactPageOcclusion.useRef(null), ref2 = ReactPageOcclusion.useRef(null), ref3 = ReactPageOcclusion.useRef(null), ref4 = ReactPageOcclusion.useRef(null), observedFoot = ReactPageOcclusion.useRef(null), ref5 = ReactPageOcclusion.useRef({
      band,
      presenting,
      speaks: speaksForPage
    }), callback = ReactPageOcclusion.useCallback(() => {
      let { band: current, presenting: current2, speaks: current3 } = ref5.current;
      if (!current3)
        return;
      let value = ref.current ?? ref2.current, value2 = calculatePageOcclusionBottom({
        viewportH: document.documentElement.clientHeight,
        workingBottom: value === null ? null : value.getBoundingClientRect().bottom,
        band: current,
        presenting: current2
      }), foot = current2 ? null : document.querySelector("[data-tb-foot]");
      foot && foot !== observedFoot.current && ref4.current !== null && (observedFoot.current !== null && ref4.current.unobserve(observedFoot.current), ref4.current.observe(foot), observedFoot.current = foot);
      let chatSlot = current2 ? null : document.querySelector("[data-chat-slot]");
      foot && (0, runtime2.alignChatSlot)(foot, chatSlot);
      let footRect = foot?.getBoundingClientRect(), slotRect = chatSlot?.getBoundingClientRect();
      (0, runtime2.setHostFootState)({
        inset: value2,
        ground: current2 || ref3.current === null ? null : (0, runtime2.readHostBackgroundColor)(ref3.current),
        center: footRect === void 0 || footRect.width === 0 ? null : footRect.left + footRect.width / 2,
        slot: slotRect === void 0 || slotRect.width === 0 ? null : {
          x: slotRect.left + slotRect.width / 2,
          y: document.documentElement.clientHeight - (slotRect.top + slotRect.height / 2),
          ...chatSlot?.hasAttribute("data-chat-slot-wide") === !0 && {
            width: slotRect.width
          }
        }
      });
    }, []), callback2 = ReactPageOcclusion.useCallback(() => {
      if (ref4.current?.disconnect(), ref4.current = null, !ref5.current.speaks || typeof ResizeObserver > "u")
        return;
      let observer = new ResizeObserver(callback);
      ref4.current = observer, observer.observe(document.documentElement), ref.current !== null && observer.observe(ref.current), ref2.current !== null && observer.observe(ref2.current), observedFoot.current = null;
    }, [callback]), callback3 = ReactPageOcclusion.useCallback((input) => {
      ref.current = input, callback2();
    }, [callback2]), callback4 = ReactPageOcclusion.useCallback((input) => {
      ref2.current = input, callback2();
    }, [callback2]), callback5 = ReactPageOcclusion.useCallback((input) => {
      ref3.current = input, callback2();
    }, [callback2]);
    return ReactPageOcclusion.useEffect(() => {
      ref5.current = {
        band,
        presenting,
        speaks: speaksForPage
      }, ref4.current === null && callback2(), callback();
    }, [band, presenting, speaksForPage, settle, callback2, callback]), ReactPageOcclusion.useEffect(() => {
      if (!speaksForPage)
        return;
      let value = typeof MutationObserver > "u" ? null : new MutationObserver(callback);
      value?.observe(document.documentElement, {
        attributes: !0,
        attributeFilter: ["data-theme", "data-mode", "class", "style"]
      });
      let value2 = typeof matchMedia == "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
      return typeof value2?.addEventListener == "function" && value2.addEventListener("change", callback), () => {
        value?.disconnect(), typeof value2?.removeEventListener == "function" && value2.removeEventListener("change", callback);
      };
    }, [speaksForPage, callback]), ReactPageOcclusion.useEffect(() => () => {
      ref4.current?.disconnect(), ref4.current = null, ref5.current.speaks && (0, runtime2.setHostFootState)(null);
    }, []), {
      stage: callback3,
      canvasView: callback4,
      groundProbe: callback5
    };
  }
  return bindRuntimeValue(runtime2, "ReactPageOcclusion", () => ReactPageOcclusion, (value) => {
    ReactPageOcclusion = value;
  }), bindRuntimeValue(runtime2, "calculatePageOcclusionBottom", () => calculatePageOcclusionBottom), bindRuntimeValue(runtime2, "PageOcclusionReporter", () => PageOcclusionReporter), () => {
    (0, runtime2.initializeExternalLinks)(), ReactPageOcclusion = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
  };
}
export {
  installBridgePageOcclusion
};
