// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiArtifactFind(runtime2) {
  var react_6, reactDOMSo0, EMPTY_FIND_STATUS, FIND_MODAL_SELECTOR;
  function createFindController(adapter, options = {}) {
    let value = options.debounceMs ?? 120, values = /* @__PURE__ */ new Set(), value2 = EMPTY_FIND_STATUS, items = [], value3 = -1, value4, text = "", value5, value6, value7, flag = !1, callback = (input) => {
      value2 = input;
      for (let value9 of [...values])
        value9(value2);
    }, callback2 = (input) => input === void 0 ? void 0 : adapter.describe?.(input), callback3 = () => {
      value4 !== void 0 && clearTimeout(value4), value4 = void 0;
    }, callback4 = async (input = 1) => {
      value7?.abort();
      let controller = new AbortController();
      value7 = controller;
      let values2 = /* @__PURE__ */ new Set();
      for (; !controller.signal.aborted && !flag; ) {
        let value9 = items[value3];
        if (value9 === void 0 || values2.has(value9.key))
          return;
        values2.add(value9.key), value5 = value9.key;
        let value10;
        try {
          value10 = await adapter.reveal(value9, controller.signal);
        } catch {
          return;
        }
        if (controller.signal.aborted || flag || items[value3]?.key !== value9.key)
          return;
        if (value10 !== !1) {
          adapter.paint(items, value3);
          return;
        }
        items = items.filter((input2) => input2.key !== value9.key), value3 = items.length === 0 ? -1 : input === 1 ? value3 % items.length : (value3 - 1 + items.length) % items.length, callback({
          ...value2,
          total: items.length,
          current: value3 + 1,
          place: callback2(items[value3])
        }), adapter.paint(items, value3);
      }
    }, callback5 = async () => {
      callback3(), value6?.abort();
      let controller = new AbortController();
      value6 = controller;
      let query = value2.query, value9;
      try {
        value9 = await adapter.search(query, controller.signal);
      } catch {
        value9 = [];
      }
      if (controller.signal.aborted || flag || query !== value2.query)
        return;
      let value10 = query !== text, value11 = value10 ? void 0 : items[value3]?.key, value12 = value9.length > 1e3;
      items = value12 ? value9.slice(0, 1e3) : value9, (value10 || items.length === 0) && (value5 = void 0), text = query;
      let value13 = value11 === void 0 ? -1 : items.findIndex((input) => input.key === value11);
      value3 = items.length === 0 ? -1 : value13 !== -1 ? value13 : value10 ? 0 : Math.min(Math.max(value3, 0), items.length - 1), callback({
        query,
        total: items.length,
        current: value3 + 1,
        capped: value12,
        searching: !1,
        place: callback2(items[value3])
      }), adapter.paint(items, value3), value10 && callback4();
    }, callback6 = () => {
      if (callback3(), value <= 0) {
        callback5();
        return;
      }
      value4 = setTimeout(() => void callback5(), value);
    }, callback7 = () => {
      callback3(), text = "", value6?.abort(), value7?.abort(), items = [], value3 = -1, adapter.clear();
    }, value8 = adapter.subscribe?.(() => {
      !flag && value2.query !== "" && callback6();
    });
    return {
      setQuery(input) {
        if (!(flag || input === value2.query)) {
          if (input === "") {
            callback7(), callback(EMPTY_FIND_STATUS);
            return;
          }
          value6?.abort(), value7?.abort(), callback({
            ...value2,
            query: input,
            searching: !0
          }), callback6();
        }
      },
      step(input) {
        if (!(flag || value2.query === "")) {
          if (value2.query !== text) {
            value4 !== void 0 && callback5();
            return;
          }
          items.length !== 0 && (items[value3]?.key === value5 && (value3 = (value3 + input + items.length) % items.length), callback({
            ...value2,
            current: value3 + 1,
            place: callback2(items[value3])
          }), adapter.paint(items, value3), callback4(input));
        }
      },
      clear() {
        flag || (callback7(), value2 !== EMPTY_FIND_STATUS && callback(EMPTY_FIND_STATUS));
      },
      status: () => value2,
      subscribe(input) {
        return values.add(input), () => void values.delete(input);
      },
      dispose() {
        flag || (callback7(), flag = !0, value8?.(), values.clear());
      }
    };
  }
  function hasFindBlockingModal(page) {
    return !!page.fullscreenElement || [...page.querySelectorAll(FIND_MODAL_SELECTOR)].some((input) => !(0, runtime2.isOverlayClosed)(input));
  }
  function isEditingLink(page) {
    return page.activeElement?.closest("[data-link-mode]") != null;
  }
  function isArtifactRootInert(page) {
    return page.getElementById("root")?.hasAttribute("inert") === !0;
  }
  function dismissLinkEditorForFind(page) {
    let value = page.defaultView?.KeyboardEvent;
    if (value === void 0)
      return;
    let value2 = new value("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: !0,
      cancelable: !0
    }), activeElement2 = page.activeElement, value3 = activeElement2?.closest(runtime2.OPEN_OVERLAY_SELECTOR) ?? null;
    activeElement2 !== null && value3 !== null && value3 !== activeElement2 && (0, runtime2.isTextEditingElement)(activeElement2) && activeElement2.blur(), (value3 !== null && page.activeElement !== activeElement2 ? value3 : activeElement2 ?? page.body).dispatchEvent(value2), value2.preventDefault();
  }
  function useArtifactFind({ adapter: options, enabled, isOurs, ownsStepChord, viewMoves, restoreFocus, returnTo }) {
    let [value, value2] = react_6.useState(!1), [value3, value4] = react_6.useState(!1), ref = react_6.useRef(null), ref2 = react_6.useRef(null), ref3 = react_6.useRef(null), ref4 = react_6.useRef(0), ref5 = react_6.useRef(0), ref6 = react_6.useRef({
      adapter: options,
      isOpen: value,
      enabled,
      isOurs,
      ownsStepChord,
      viewMoves,
      restoreFocus,
      returnTo
    });
    react_6.useEffect(() => {
      ref6.current = {
        adapter: options,
        isOpen: value,
        enabled,
        isOurs,
        ownsStepChord,
        viewMoves,
        restoreFocus,
        returnTo
      };
    });
    let [{ controller: value5, changes: value6 }] = react_6.useState(() => {
      (0, runtime2.installFindBarEventGuards)(window);
      let state = {};
      return {
        controller: createFindController({
          search: (input, options2) => ref6.current.adapter.search(input, options2),
          reveal: (input, options2) => ref6.current.adapter.reveal(input, options2),
          paint: (input, options2) => ref6.current.adapter.paint(input, options2),
          clear: () => ref6.current.adapter.clear(),
          describe: (input) => ref6.current.adapter.describe?.(input),
          subscribe: (input) => (state.notify = input, () => void (state.notify = void 0))
        }),
        changes: state
      };
    });
    react_6.useEffect(() => options.subscribe?.(() => value6.notify?.()), [options, value6]), react_6.useEffect(() => () => {
      ref4.current++, value5.clear();
    }, [value5]);
    let callback = react_6.useCallback(() => {
      let current = ref6.current, isOpen = current.isOpen, activeElement2 = document.activeElement;
      try {
        typeof activeElement2?.closest == "function" && activeElement2.closest("[" + runtime2.FIND_BAR_ATTRIBUTE + "]") !== null || (ref2.current = typeof activeElement2?.focus == "function" ? activeElement2 : null, ref3.current = ref2.current === null ? null : current.returnTo?.(ref2.current) ?? null, ref5.current = current.viewMoves?.() ?? 0), isOpen || reactDOMSo0.flushSync(() => value2(!0));
        let current2 = ref.current;
        if (current2 !== null && activeElement2?.tagName === "IFRAME" && (activeElement2.blur(), window.focus()), current2?.focus(), current2 !== null && document.activeElement === current2)
          return current2.select(), !0;
      } catch {
      }
      return isOpen || value2(!1), !1;
    }, []), callback2 = react_6.useCallback(() => ref6.current.enabled && !hasFindBlockingModal(document), []), callback3 = react_6.useCallback((input) => {
      if (ref6.current.isOurs?.(input) === !1)
        return !1;
      let value7 = ++ref4.current;
      if (!callback2() || isEditingLink(document))
        return !0;
      if ((0, runtime2.hasOpenOverlay)(document)) {
        let index4 = 0, callback10 = () => {
          if (value7 !== ref4.current || !callback2())
            return;
          let flag = !1;
          try {
            (0, runtime2.hasOpenOverlay)(document) ? index4 > 0 && index4 % 6 === 0 && index4 <= 18 && dismissLinkEditorForFind(document) : isArtifactRootInert(document) || (flag = callback());
          } catch {
            flag = !1;
          }
          !flag && ++index4 < 40 && window.requestAnimationFrame(callback10);
        };
        return dismissLinkEditorForFind(document), window.requestAnimationFrame(callback10), !0;
      }
      return isArtifactRootInert(document) ? !0 : callback();
    }, [callback, callback2]), callback4 = react_6.useCallback((input) => {
      !hasFindBlockingModal(document) && !isArtifactRootInert(document) && !isEditingLink(document) && value5.step(input);
    }, [value5]), callback5 = react_6.useCallback((event) => {
      let value7 = event.defaultPrevented ? void 0 : (0, runtime2.findStepShortcut)(event);
      if (!(value7 === void 0 || ref6.current.isOurs?.(event.target) === !1) && !(event.key !== "F3" && ref6.current.ownsStepChord?.(event) === !0)) {
        if (!ref6.current.isOpen) {
          callback3(event.target) && event.preventDefault();
          return;
        }
        event.preventDefault(), callback4(value7);
      }
    }, [callback3, callback4]), callback6 = react_6.useCallback((input) => {
      let current = ref6.current;
      if (!current.isOpen)
        return;
      value5.clear();
      let current2 = ref2.current, current3 = ref3.current;
      ref2.current = null, ref3.current = null;
      let activeElement2 = document.activeElement, value7 = input && (activeElement2 === null || activeElement2 === document.body || activeElement2.closest("[" + runtime2.FIND_BAR_ATTRIBUTE + "]") !== null), value8 = value7 ? current3?.() ?? null : null, value9 = value8 ?? (value7 && current3 === null ? current2 : null), value10 = (current.viewMoves?.() ?? 0) !== ref5.current, value11 = value7 && value9?.isConnected === !0 && !value10 ? value9 : null;
      value11?.focus(value11 === value8 ? {
        preventScroll: !0
      } : void 0);
      let activeElement22 = document.activeElement, value12 = value11 !== null && activeElement22 !== null && activeElement22 !== document.body && activeElement22.closest("[" + runtime2.FIND_BAR_ATTRIBUTE + "]") === null;
      value2(!1), value7 && !value12 && current.restoreFocus?.();
    }, [value5]), callback7 = react_6.useCallback(() => callback6(!0), [callback6]), callback8 = react_6.useCallback(() => void callback3(null), [callback3]);
    (0, runtime2.useHostFindCommand)(value3, callback8), react_6.useEffect(() => {
      enabled || callback6(!1);
    }, [enabled, callback6]), react_6.useEffect(() => {
      let callback10 = (event) => {
        try {
          if (event.isComposing) {
            ((0, runtime2.isFindShortcut)(event) || (0, runtime2.findStepShortcut)(event) !== void 0) && ref6.current.isOurs?.(event.target) !== !1 && event.preventDefault();
            return;
          }
          (0, runtime2.isFindShortcut)(event) ? callback3(event.target) && event.preventDefault() : callback5(event);
        } catch {
          return;
        }
      };
      return window.addEventListener("keydown", callback10, !0), () => window.removeEventListener("keydown", callback10, !0);
    }, [callback3, callback5]);
    let callback9 = react_6.useCallback((input, options2, context = (input2) => input2()) => {
      let value7 = (0, runtime2.createFindKeyHandler)({
        findKey: () => callback3(null),
        isOpen: () => ref6.current.isOpen,
        step: (input2, options3) => context(() => callback4(input2), options3),
        ownsStepChord: (input2) => ref6.current.ownsStepChord?.(input2) === !0
      }, void 0, options2), items = [
        (0, runtime2.addUnpatchedEventListener)(input, "keydown", value7, !0),
        (0, runtime2.addUnpatchedEventListener)(input, "keydown", value7, !1)
      ];
      return () => items.forEach((input2) => input2());
    }, [callback3, callback4]);
    return react_6.useMemo(() => ({
      isOpen: value,
      open: callback8,
      close: callback7,
      step: callback4,
      attach: callback9,
      bar: {
        open: value,
        subscribe: value5.subscribe,
        getStatus: value5.status,
        fieldRef: ref,
        onQuery: value5.setQuery,
        onStep: callback4,
        onClose: callback7,
        onMounted: value4
      }
    }), [value, callback8, callback7, callback4, callback9, value5]);
  }
  return bindRuntimeValue(runtime2, "react_6", () => react_6, (value) => {
    react_6 = value;
  }), bindRuntimeValue(runtime2, "reactDOMSo0", () => reactDOMSo0, (value) => {
    reactDOMSo0 = value;
  }), bindRuntimeValue(runtime2, "EMPTY_FIND_STATUS", () => EMPTY_FIND_STATUS, (value) => {
    EMPTY_FIND_STATUS = value;
  }), bindRuntimeValue(runtime2, "createFindController", () => createFindController), bindRuntimeValue(runtime2, "FIND_MODAL_SELECTOR", () => FIND_MODAL_SELECTOR, (value) => {
    FIND_MODAL_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "hasFindBlockingModal", () => hasFindBlockingModal), bindRuntimeValue(runtime2, "isEditingLink", () => isEditingLink), bindRuntimeValue(runtime2, "isArtifactRootInert", () => isArtifactRootInert), bindRuntimeValue(runtime2, "dismissLinkEditorForFind", () => dismissLinkEditorForFind), bindRuntimeValue(runtime2, "useArtifactFind", () => useArtifactFind), () => {
    react_6 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactDOMSo0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), (0, runtime2.initializeUiPropertyFocus)(), EMPTY_FIND_STATUS = {
      query: "",
      total: 0,
      current: 0,
      capped: !1,
      searching: !1
    }, FIND_MODAL_SELECTOR = '[data-cds="Dialog"], [role="alertdialog"]:not([aria-modal="false"]), [role="dialog"][aria-modal="true"]';
  };
}
export {
  installUiArtifactFind
};
