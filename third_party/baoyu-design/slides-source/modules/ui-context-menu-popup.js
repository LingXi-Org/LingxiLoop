// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiContextMenuPopup(runtime2) {
  var reactN_, jsxo20, reactsQ, jsxwX, CONTEXT_MENU_MARGIN;
  function ContextMenuPopup({ at, onClose, children, title, "aria-label": ariaLabel, anchor, className, minWidth, popupAttrs, returnFocus, focusFirstItem = !1 }) {
    let value = at !== null;
    (0, runtime2.usePopupOpenFocus)(value && focusFirstItem);
    let ref = reactsQ.useRef(null), ref2 = reactsQ.useRef(onClose);
    ref2.current = onClose;
    let closeFocusRef = reactsQ.useRef(null);
    reactsQ.useLayoutEffect(() => {
      closeFocusRef.current = value ? null : document.hasFocus();
    }, [value]);
    let [value2, value3] = reactsQ.useState(!1), ref3 = reactsQ.useRef(null);
    reactsQ.useLayoutEffect(() => {
      at && (ref3.current = {
        at,
        children,
        title,
        name: title ?? ariaLabel,
        anchor: anchor ?? "point"
      }, value3(!0));
    }, [at, children, title, ariaLabel, anchor]);
    let value4 = at ? {
      at,
      children,
      title,
      name: title ?? ariaLabel,
      anchor: anchor ?? "point"
    } : ref3.current, value5 = value4?.anchor === "tap", value6 = value4?.at.x, value7 = value4?.at.y, memo4 = reactsQ.useMemo(() => {
      if (value6 === void 0 || value7 === void 0)
        return;
      let state = {
        x: value6,
        y: value7,
        left: value6,
        top: value7,
        right: value6,
        bottom: value7,
        width: 0,
        height: 0,
        toJSON: () => ({
          x: value6,
          y: value7,
          width: 0,
          height: 0
        })
      };
      return {
        getBoundingClientRect: () => state
      };
    }, [value6, value7]), ref4 = reactsQ.useRef(null), openerRef = reactsQ.useRef(null);
    reactsQ.useLayoutEffect(() => {
      if (!value)
        return;
      let activeElement2 = document.activeElement;
      value2 && (activeElement2 === document.body || (ref.current?.contains(activeElement2) ?? !1)) || (openerRef.current = activeElement2, ref4.current = activeElement2 instanceof HTMLElement && activeElement2 !== document.body ? activeElement2 : null);
    }, [value, value2]), reactsQ.useEffect(() => {
      if (!value || !focusFirstItem)
        return;
      let value8 = requestAnimationFrame(() => {
        let current = ref.current;
        if (current === null)
          return;
        let activeElement2 = document.activeElement;
        if (activeElement2 !== null && activeElement2 !== document.body && activeElement2 !== current && !current.contains(activeElement2) && activeElement2 !== openerRef.current)
          return;
        let element = current.querySelector('[role^="menuitem"]:not([aria-disabled="true"]):not([data-disabled])');
        element !== null && element.focus();
      });
      return () => cancelAnimationFrame(value8);
    }, [value, focusFirstItem]);
    let wheelDistanceRef = reactsQ.useRef(0);
    reactsQ.useEffect(() => {
      value && (wheelDistanceRef.current = 0);
    }, [value, value6, value7]), reactsQ.useEffect(() => {
      if (!value && !value2)
        return;
      let close = () => ref2.current(), popupFor = (event) => event.target instanceof Node && ref.current?.parentElement?.contains(event.target) === !0 ? ref.current : null, onWheel = (event) => {
        let popup = popupFor(event);
        popup !== null && (wheelDistanceRef.current += event.ctrlKey || event.deltaMode !== 0 ? 1 / 0 : Math.hypot(event.deltaX, event.deltaY), wheelDistanceRef.current > 8 && (0, runtime2.wheelThroughPopup)(event, popup, close));
      }, stopPressThrough, onPointerDown = (event) => {
        event.button !== 0 && popupFor(event) !== null && (stopPressThrough = (0, runtime2.pressThroughOnDrag)(event, close));
      }, onContextMenu = (event) => {
        popupFor(event) !== null && (event.preventDefault(), event.stopPropagation());
      };
      return window.addEventListener("wheel", onWheel, {
        capture: !0,
        passive: !1
      }), window.addEventListener("pointerdown", onPointerDown, !0), window.addEventListener("contextmenu", onContextMenu, !0), () => {
        stopPressThrough?.(), window.removeEventListener("wheel", onWheel, !0), window.removeEventListener("pointerdown", onPointerDown, !0), window.removeEventListener("contextmenu", onContextMenu, !0);
      };
    }, [value, value2]);
    let documentHasFocus = (0, runtime2.useDocumentHasFocus)(value), collisionPadding = (0, runtime2.useFootInsetCollisionPadding)(value);
    return jsxwX.jsxs(jsxwX.Fragment, {
      children: [
        value ? jsxwX.jsx(runtime2.PopupScrim, {
          onClose: () => ref2.current()
        }) : null,
        jsxwX.jsx(runtime2.Menu.Root, {
          open: value,
          modal: !1,
          highlightItemOnHover: documentHasFocus,
          onOpenChange: (input, options) => {
            if (!input) {
              if (options.reason === "outside-press") {
                let value8 = options.event?.target;
                if (value8 instanceof Element && value8.hasAttribute("data-mc-scrim")) {
                  options.cancel();
                  return;
                }
              }
              ref2.current();
            }
          },
          onOpenChangeComplete: (input) => {
            input || value3(!1);
          },
          children: jsxwX.jsxs(runtime2.Menu.Popup, {
            ref,
            anchor: memo4,
            side: "bottom",
            align: value5 ? "center" : "start",
            sideOffset: value5 ? CONTEXT_MENU_MARGIN : 0,
            collisionPadding,
            "aria-label": value4?.name,
            ...popupAttrs,
            "data-mc-chrome": "",
            "data-mc-menu": "",
            finalFocus: () => {
              if (!(closeFocusRef.current ?? document.hasFocus()))
                return !1;
              let activeElement2 = document.activeElement;
              if (activeElement2 instanceof HTMLElement && activeElement2 !== document.body && !(ref.current?.contains(activeElement2) ?? !1))
                return !1;
              let value8 = ref4.current?.isConnected === !0 ? ref4.current : null;
              return (returnFocus !== void 0 ? returnFocus(value8) : value8)?.focus({
                preventScroll: !0
              }), !1;
            },
            onContextMenu: (event) => {
              event.preventDefault(), event.stopPropagation();
            },
            onKeyDown: (input) => {
              input.key !== "Tab" && !input.metaKey && !input.ctrlKey && input.stopPropagation();
            },
            className,
            style: minWidth !== void 0 ? {
              minWidth
            } : void 0,
            children: [
              value4?.title !== void 0 ? jsxwX.jsx(runtime2.Menu.Header, {
                className: "truncate",
                children: value4.title
              }) : null,
              value4?.children
            ]
          })
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "reactN_", () => reactN_, (value) => {
    reactN_ = value;
  }), bindRuntimeValue(runtime2, "jsxo20", () => jsxo20, (value) => {
    jsxo20 = value;
  }), bindRuntimeValue(runtime2, "reactsQ", () => reactsQ, (value) => {
    reactsQ = value;
  }), bindRuntimeValue(runtime2, "jsxwX", () => jsxwX, (value) => {
    jsxwX = value;
  }), bindRuntimeValue(runtime2, "CONTEXT_MENU_MARGIN", () => CONTEXT_MENU_MARGIN, (value) => {
    CONTEXT_MENU_MARGIN = value;
  }), bindRuntimeValue(runtime2, "ContextMenuPopup", () => ContextMenuPopup), () => {
    reactN_ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxo20 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), (0, runtime2.initializeUiPointerMedia)(), (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiPropertyPopover2)(), (0, runtime2.initializeUiPropertyPopover)(), reactsQ = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxwX = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), CONTEXT_MENU_MARGIN = 14;
  };
}
export {
  installUiContextMenuPopup
};
