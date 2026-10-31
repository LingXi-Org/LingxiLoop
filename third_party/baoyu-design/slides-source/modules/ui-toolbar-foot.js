// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiToolbarFoot(runtime2) {
  var reactPresentationSheet, PRESENTATION_ATTRIBUTE, jsxChatToggleSlot, reactFloatingToolbar, jsxFloatingToolbar, FOOT_INSET_MARGIN, FOOT_TOOLBAR_PAD_CLASS, FOOT_TOOLBAR_SHEET_PAD_CLASS, FloatingToolbar, reactFootReveal, FOOT_REVEAL_RELEASE_MS, FOOT_REVEAL_TRANSITION_CLASSES, FOOT_REVEAL_JOIN_MS, FOOT_REVEAL_ENTER_CLASSES, footRevealed, footRevealedAt, footRevealNow, setFootRevealTimeout, footRevealListeners, reactChatSlot;
  function subscribePresentationAttribute(listener) {
    if (typeof MutationObserver > "u")
      return () => {
      };
    let observer = new MutationObserver(listener);
    return observer.observe(document.documentElement, {
      attributes: !0,
      attributeFilter: [PRESENTATION_ATTRIBUTE]
    }), () => observer.disconnect();
  }
  function usePresentationSheetOpen() {
    return reactPresentationSheet.useSyncExternalStore(subscribePresentationAttribute, () => document.documentElement.getAttribute(PRESENTATION_ATTRIBUTE) === "sheet", () => !1);
  }
  function ChatToggleSlot({ word = !1 }) {
    return (0, runtime2.useHoldHostChatToggle)(), word ? jsxChatToggleSlot.jsx("span", {
      "aria-hidden": "true",
      "data-chat-slot": "",
      "data-chat-slot-wide": "",
      className: "inline-block h-8 w-16 shrink-0"
    }) : jsxChatToggleSlot.jsx("span", {
      "aria-hidden": "true",
      "data-chat-slot": "",
      className: "inline-block size-8 shrink-0"
    });
  }
  function footInsetFromRect(rect, viewportHeight) {
    return rect.width === 0 || rect.height === 0 ? null : Math.max(0, Math.round(viewportHeight - rect.top + FOOT_INSET_MARGIN));
  }
  function useReportFootInset(ref, atFoot) {
    let id = reactFloatingToolbar.useId();
    reactFloatingToolbar.useEffect(() => {
      let current = ref.current;
      if (!atFoot || current === null)
        return;
      let report = () => {
        (0, runtime2.setHostFootSlotInset)(id, footInsetFromRect(current.getBoundingClientRect(), document.documentElement.clientHeight));
      };
      report();
      let observer = typeof ResizeObserver > "u" ? null : new ResizeObserver(report);
      return observer?.observe(current), observer?.observe(document.documentElement), () => {
        observer?.disconnect(), (0, runtime2.setHostFootSlotInset)(id, null);
      };
    }, [ref, atFoot, id]);
  }
  function revealFoot() {
    if (!footRevealed) {
      footRevealed = !0, footRevealedAt = footRevealNow();
      for (let listener of footRevealListeners)
        listener();
    }
  }
  function subscribeFootReveal(listener) {
    return footRevealListeners.add(listener), () => {
      footRevealListeners.delete(listener);
    };
  }
  function useFootToolbarReveal({ shown, chatMayCome, slotReported, releaseBy = FOOT_REVEAL_RELEASE_MS }) {
    let revealed = reactFootReveal.useSyncExternalStore(subscribeFootReveal, () => footRevealed, () => footRevealed), ready2 = shown && (!chatMayCome || slotReported || footRevealNow() >= releaseBy), held = shown && !revealed && !ready2;
    return reactFootReveal.useEffect(() => {
      ready2 && revealFoot();
    }, [ready2]), reactFootReveal.useEffect(() => {
      if (!(!shown || footRevealed))
        return setFootRevealTimeout(revealFoot, Math.max(0, releaseBy - footRevealNow()));
    }, [shown, releaseBy]), {
      held,
      className: held ? FOOT_REVEAL_TRANSITION_CLASSES + " pointer-events-none opacity-0" : FOOT_REVEAL_ENTER_CLASSES,
      joins: revealed && footRevealNow() - footRevealedAt > FOOT_REVEAL_JOIN_MS ? FOOT_REVEAL_ENTER_CLASSES : ""
    };
  }
  function chatSlotGeometry(toolbar, slot, viewportHeight) {
    return {
      center: toolbar.width === 0 ? null : toolbar.left + toolbar.width / 2,
      slot: slot === null || slot.width === 0 ? null : {
        x: slot.left + slot.width / 2,
        y: viewportHeight - (slot.top + slot.height / 2),
        ...slot.wide === !0 && {
          width: slot.width
        }
      }
    };
  }
  function subpixelTranslate(x, y) {
    let [value, value2] = [Math.round(x) - x, Math.round(y) - y];
    return value === 0 && value2 === 0 ? null : String(value) + "px " + String(value2) + "px";
  }
  function alignChatSlot(toolbar, slot) {
    toolbar.style.translate = "";
    let bounds = slot?.getBoundingClientRect();
    bounds !== void 0 && bounds.width !== 0 && (toolbar.style.translate = subpixelTranslate(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) ?? "");
  }
  function usePlaceChatSlot(toolbar, enabled) {
    reactChatSlot.useEffect(() => {
      if (!enabled || toolbar === null)
        return;
      let ownerDocument2 = toolbar.ownerDocument, ResizeObserverClass = ownerDocument2.defaultView?.ResizeObserver, MutationObserverClass = ownerDocument2.defaultView?.MutationObserver, report = () => {
        let slot2 = toolbar.querySelector("[data-chat-slot]");
        toolbar.hasAttribute("data-tb-foot") && alignChatSlot(toolbar, slot2);
        let bounds = slot2?.getBoundingClientRect();
        (0, runtime2.setHostFootState)(chatSlotGeometry(toolbar.getBoundingClientRect(), bounds === void 0 ? null : {
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          wide: slot2?.hasAttribute("data-chat-slot-wide") === !0
        }, ownerDocument2.documentElement.clientHeight));
      };
      report();
      let mutationObserver = MutationObserverClass === void 0 ? null : new MutationObserverClass(report);
      mutationObserver?.observe(ownerDocument2.documentElement, {
        attributes: !0,
        attributeFilter: ["data-mc-presentation"]
      });
      let parent = toolbar.parentElement, grandparent = parent?.parentElement ?? null, resizeObserver = ResizeObserverClass === void 0 ? null : new ResizeObserverClass(report);
      resizeObserver?.observe(toolbar), parent !== null && resizeObserver?.observe(parent), grandparent !== null && resizeObserver?.observe(grandparent), resizeObserver?.observe(ownerDocument2.documentElement);
      let slot = toolbar.querySelector("[data-chat-slot]");
      return slot !== null && resizeObserver?.observe(slot), () => {
        resizeObserver?.disconnect(), mutationObserver?.disconnect(), toolbar.hasAttribute("data-tb-foot") && alignChatSlot(toolbar, null), (0, runtime2.setHostFootState)(null);
      };
    }, [toolbar, enabled]);
  }
  return bindRuntimeValue(runtime2, "reactPresentationSheet", () => reactPresentationSheet, (value) => {
    reactPresentationSheet = value;
  }), bindRuntimeValue(runtime2, "PRESENTATION_ATTRIBUTE", () => PRESENTATION_ATTRIBUTE, (value) => {
    PRESENTATION_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "subscribePresentationAttribute", () => subscribePresentationAttribute), bindRuntimeValue(runtime2, "usePresentationSheetOpen", () => usePresentationSheetOpen), bindRuntimeValue(runtime2, "jsxChatToggleSlot", () => jsxChatToggleSlot, (value) => {
    jsxChatToggleSlot = value;
  }), bindRuntimeValue(runtime2, "ChatToggleSlot", () => ChatToggleSlot), bindRuntimeValue(runtime2, "reactFloatingToolbar", () => reactFloatingToolbar, (value) => {
    reactFloatingToolbar = value;
  }), bindRuntimeValue(runtime2, "jsxFloatingToolbar", () => jsxFloatingToolbar, (value) => {
    jsxFloatingToolbar = value;
  }), bindRuntimeValue(runtime2, "FOOT_INSET_MARGIN", () => FOOT_INSET_MARGIN, (value) => {
    FOOT_INSET_MARGIN = value;
  }), bindRuntimeValue(runtime2, "FOOT_TOOLBAR_PAD_CLASS", () => FOOT_TOOLBAR_PAD_CLASS, (value) => {
    FOOT_TOOLBAR_PAD_CLASS = value;
  }), bindRuntimeValue(runtime2, "FOOT_TOOLBAR_SHEET_PAD_CLASS", () => FOOT_TOOLBAR_SHEET_PAD_CLASS, (value) => {
    FOOT_TOOLBAR_SHEET_PAD_CLASS = value;
  }), bindRuntimeValue(runtime2, "FloatingToolbar", () => FloatingToolbar, (value) => {
    FloatingToolbar = value;
  }), bindRuntimeValue(runtime2, "footInsetFromRect", () => footInsetFromRect), bindRuntimeValue(runtime2, "useReportFootInset", () => useReportFootInset), bindRuntimeValue(runtime2, "reactFootReveal", () => reactFootReveal, (value) => {
    reactFootReveal = value;
  }), bindRuntimeValue(runtime2, "FOOT_REVEAL_RELEASE_MS", () => FOOT_REVEAL_RELEASE_MS, (value) => {
    FOOT_REVEAL_RELEASE_MS = value;
  }), bindRuntimeValue(runtime2, "FOOT_REVEAL_TRANSITION_CLASSES", () => FOOT_REVEAL_TRANSITION_CLASSES, (value) => {
    FOOT_REVEAL_TRANSITION_CLASSES = value;
  }), bindRuntimeValue(runtime2, "FOOT_REVEAL_JOIN_MS", () => FOOT_REVEAL_JOIN_MS, (value) => {
    FOOT_REVEAL_JOIN_MS = value;
  }), bindRuntimeValue(runtime2, "FOOT_REVEAL_ENTER_CLASSES", () => FOOT_REVEAL_ENTER_CLASSES, (value) => {
    FOOT_REVEAL_ENTER_CLASSES = value;
  }), bindRuntimeValue(runtime2, "footRevealed", () => footRevealed, (value) => {
    footRevealed = value;
  }), bindRuntimeValue(runtime2, "footRevealedAt", () => footRevealedAt, (value) => {
    footRevealedAt = value;
  }), bindRuntimeValue(runtime2, "footRevealNow", () => footRevealNow, (value) => {
    footRevealNow = value;
  }), bindRuntimeValue(runtime2, "setFootRevealTimeout", () => setFootRevealTimeout, (value) => {
    setFootRevealTimeout = value;
  }), bindRuntimeValue(runtime2, "footRevealListeners", () => footRevealListeners, (value) => {
    footRevealListeners = value;
  }), bindRuntimeValue(runtime2, "revealFoot", () => revealFoot), bindRuntimeValue(runtime2, "subscribeFootReveal", () => subscribeFootReveal), bindRuntimeValue(runtime2, "useFootToolbarReveal", () => useFootToolbarReveal), bindRuntimeValue(runtime2, "chatSlotGeometry", () => chatSlotGeometry), bindRuntimeValue(runtime2, "subpixelTranslate", () => subpixelTranslate), bindRuntimeValue(runtime2, "alignChatSlot", () => alignChatSlot), bindRuntimeValue(runtime2, "reactChatSlot", () => reactChatSlot, (value) => {
    reactChatSlot = value;
  }), bindRuntimeValue(runtime2, "usePlaceChatSlot", () => usePlaceChatSlot), () => {
    reactPresentationSheet = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), PRESENTATION_ATTRIBUTE = "data-mc-presentation", jsxChatToggleSlot = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), reactFloatingToolbar = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxFloatingToolbar = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), FOOT_INSET_MARGIN = 8, FOOT_TOOLBAR_PAD_CLASS = "pb-[calc(var(--mc-foot-gap)+var(--mc-foot-inset,0px))]", FOOT_TOOLBAR_SHEET_PAD_CLASS = "[:root[data-mc-presentation=sheet]_&]:pb-[var(--mc-foot-gap)]", FloatingToolbar = reactFloatingToolbar.forwardRef(function({ label, collapsed = !1, density = "compact", atFoot = !1, className, children, ...rest }, ref) {
      let ref2 = reactFloatingToolbar.useRef(null), callback = reactFloatingToolbar.useCallback((element) => {
        ref2.current = element, typeof ref == "function" ? ref(element) : ref !== null && (ref.current = element);
      }, [ref]);
      return useReportFootInset(ref2, atFoot), jsxFloatingToolbar.jsx(runtime2.CdsRoot, {
        density,
        render: jsxFloatingToolbar.jsx(runtime2.Surface, {
          elevation: runtime2.PANEL_ELEVATION,
          ref: callback,
          role: "toolbar",
          "aria-label": label,
          "data-mc-chrome": "",
          className: (0, runtime2.joinClassNames)("p-px", className),
          ...rest
        }),
        children: jsxFloatingToolbar.jsx(runtime2.TooltipProvider, {
          children: jsxFloatingToolbar.jsx(runtime2.ToolbarFloatingContext.Provider, {
            value: collapsed,
            children
          })
        })
      });
    }), reactFootReveal = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), FOOT_REVEAL_RELEASE_MS = 2e3, FOOT_REVEAL_TRANSITION_CLASSES = "transition-opacity duration-base ease-out motion-reduce:transition-none", FOOT_REVEAL_JOIN_MS = 300, FOOT_REVEAL_ENTER_CLASSES = FOOT_REVEAL_TRANSITION_CLASSES + " starting:opacity-0", footRevealed = !1, footRevealedAt = -1 / 0, footRevealNow = () => performance.now(), setFootRevealTimeout = (callback, delay) => {
      let timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    }, footRevealListeners = /* @__PURE__ */ new Set(), reactChatSlot = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
  };
}
export {
  installUiToolbarFoot
};
