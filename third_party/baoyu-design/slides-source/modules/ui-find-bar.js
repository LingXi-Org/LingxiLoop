// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiFindBar(runtime2) {
  var reactsq, FIND_BAR_ATTRIBUTE, FIND_BAR_EDIT_SHORTCUTS, findBarKeyHandlers, findBarListenerWindows, NON_TEXT_FIND_INPUT_PATTERN, FIND_BAR_LABEL, FIND_PREVIOUS_LABEL, FIND_NEXT_LABEL, FIND_CLOSE_LABEL, FIND_PLACEHOLDER, FIND_NO_MATCHES_LABEL, jsxDY, FIND_BAR_STYLE, FIND_BAR_INPUT_STYLE, FIND_BAR_COUNT_STYLE, FIND_BAR_LIVE_REGION_STYLE;
  function matchesLatinShortcut(event, letter) {
    return event.key.toLowerCase() === letter ? !0 : event.code === "Key" + letter.toUpperCase() && /^[\p{L}\p{M}]$/u.test(event.key) && !/\p{Script=Latin}/u.test(event.key);
  }
  function registerFindBarKeyHandler(element, handler) {
    return findBarKeyHandlers.set(element, handler), () => void findBarKeyHandlers.delete(element);
  }
  function captureFindBarKey(event) {
    let target = event.target, value = typeof target?.closest == "function" ? target.closest("[" + FIND_BAR_ATTRIBUTE + "]") : null;
    if (value === null || target === null || event.key === "F6")
      return;
    let flag = !1;
    try {
      flag = event.type === "keydown" && findBarKeyHandlers.get(value)?.(event) === !0;
    } catch {
      flag = !1;
    }
    if (flag === !1 && (target.tagName === "INPUT" || matchesLatinShortcut(event, "s") && isPrimaryShortcutModifier(event, (0, runtime2.isApplePlatform)())))
      return;
    event.stopImmediatePropagation();
    let value2 = !event.ctrlKey && !event.metaKey && !event.altKey && !/^F\d+$/.test(event.key) && event.key !== "Tab" && event.key !== "Enter" && event.key !== " ", value3 = (event.ctrlKey || event.metaKey) && !event.altKey && FIND_BAR_EDIT_SHORTCUTS.some((input) => matchesLatinShortcut(event, input));
    !flag && event.type === "keydown" && (value2 || value3) && event.preventDefault();
  }
  function captureFindBarClipboard(event) {
    let target = event.target;
    target === null || typeof target.closest != "function" || target.tagName === "INPUT" || target.closest("[" + FIND_BAR_ATTRIBUTE + "]") !== null && (event.stopImmediatePropagation(), event.preventDefault());
  }
  function installFindBarEventGuards(ownWindow) {
    if (!findBarListenerWindows.has(ownWindow)) {
      findBarListenerWindows.add(ownWindow);
      for (let value of ["keydown", "keyup", "keypress"])
        ownWindow.addEventListener(value, captureFindBarKey, !0);
      for (let value of ["cut", "copy", "paste"])
        ownWindow.addEventListener(value, captureFindBarClipboard, !0);
    }
  }
  function isPrimaryShortcutModifier(event, isMac) {
    return !event.altKey && (isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
  }
  function isFindShortcut(event, isMac = (0, runtime2.isApplePlatform)()) {
    return isPrimaryShortcutModifier(event, isMac) && !event.shiftKey && matchesLatinShortcut(event, "f");
  }
  function addUnpatchedEventListener(target, eventType, listener, options) {
    let value = listener;
    try {
      return EventTarget.prototype.addEventListener.call(target, eventType, value, options), () => EventTarget.prototype.removeEventListener.call(target, eventType, value, options);
    } catch {
      return target.addEventListener(eventType, value, options), () => target.removeEventListener(eventType, value, options);
    }
  }
  function createFindKeyHandler(commands, isOurs = (input) => input.isTrusted, enabled = () => !0) {
    return (event) => {
      try {
        let value = !enabled();
        if (event.eventPhase === 1 !== value || !isOurs(event) || event.defaultPrevented)
          return;
        if (event.isComposing) {
          (isFindShortcut(event) || findStepShortcut(event) !== void 0) && event.preventDefault();
          return;
        }
        let callback = () => {
          event.preventDefault(), value && event.stopImmediatePropagation();
        };
        if (isFindShortcut(event)) {
          commands.findKey() && callback();
          return;
        }
        let value2 = findStepShortcut(event);
        if (value2 === void 0 || event.key !== "F3" && commands.ownsStepChord?.(event) === !0)
          return;
        if (!commands.isOpen()) {
          commands.findKey() && callback();
          return;
        }
        callback(), commands.step(value2, event);
      } catch {
        return;
      }
    };
  }
  function findStepShortcut(event, isMac = (0, runtime2.isApplePlatform)()) {
    if (event.key === "F3" ? !event.altKey && !event.metaKey && !event.ctrlKey : isPrimaryShortcutModifier(event, isMac) && matchesLatinShortcut(event, "g"))
      return event.shiftKey ? -1 : 1;
  }
  function isTextEditingElement(element) {
    let tagName = element.tagName;
    return tagName === "TEXTAREA" || element.isContentEditable === !0 || tagName === "INPUT" && !NON_TEXT_FIND_INPUT_PATTERN.test(element.type);
  }
  function blurEditingTargetForFind(page = document, keepSelector, editSelector) {
    let activeElement2 = page.activeElement;
    activeElement2 === null || activeElement2.closest("[" + FIND_BAR_ATTRIBUTE + "]") !== null || !isTextEditingElement(activeElement2) && (editSelector === void 0 || activeElement2.closest(editSelector) === null) || (keepSelector === void 0 || activeElement2.closest(keepSelector) === null) && activeElement2.blur();
  }
  function findCountAnnouncement(current, total, capped, label) {
    return total === 0 ? "无匹配项" : String(current) + " / " + String(total) + (capped ? "或更多" : "") + (label === void 0 ? "" : ", " + label);
  }
  function findCountReadout(status) {
    return status.query === "" || status.searching ? "" : String(status.current) + "/" + String(status.total) + (status.capped ? "+" : "");
  }
  function FindBar(props) {
    let { onMounted } = props;
    return reactsq.useEffect(() => (onMounted(!0), () => onMounted(!1)), [onMounted]), props.open ? jsxDY.jsx(OpenFindBar, {
      ...props
    }) : null;
  }
  function preserveFindStatusWhileSearching(getStatus) {
    let value = null;
    return () => {
      let value2 = getStatus();
      return value2.query === "" ? value = null : value2.searching || (value = value2), value2.searching && value !== null ? value : value2;
    };
  }
  function OpenFindBar({ subscribe: subscribe2, getStatus, fieldRef, onQuery, onStep, onClose }) {
    let memo4 = reactsq.useMemo(() => preserveFindStatusWhileSearching(getStatus), [getStatus]), value = reactsq.useSyncExternalStore(subscribe2, memo4), [value2, value3] = reactsq.useState(""), ref = reactsq.useRef(null), ref2 = reactsq.useRef(() => !1);
    ref2.current = (event) => {
      if (event.isComposing || event.keyCode === 229)
        return !1;
      let current = fieldRef.current, value6 = event.key === "Enter" && event.target === current ? event.shiftKey ? -1 : 1 : findStepShortcut(event);
      if (event.key === "Escape")
        onClose();
      else if (value6 !== void 0)
        onStep(value6);
      else if (isFindShortcut(event))
        current?.focus(), current?.select();
      else
        return !1;
      return event.preventDefault(), !0;
    }, reactsq.useEffect(() => ref.current === null ? void 0 : registerFindBarKeyHandler(ref.current, (input) => ref2.current(input)), []);
    let callback = (event) => {
      event.target.closest(runtime2.TEXT_EDITABLE_SELECTOR) === null && event.preventDefault();
    }, value4 = value.total === 0, value5 = value.query === "" ? FIND_PLACEHOLDER : value.searching ? void 0 : FIND_NO_MATCHES_LABEL;
    return jsxDY.jsx(runtime2.CdsRoot, {
      density: "compact",
      render: jsxDY.jsx(runtime2.Surface, {
        elevation: runtime2.PANEL_ELEVATION,
        role: "search",
        "aria-label": FIND_BAR_LABEL,
        "data-mc-chrome": "",
        [FIND_BAR_ATTRIBUTE]: "",
        style: FIND_BAR_STYLE,
        ref,
        onMouseDown: callback
      }),
      children: jsxDY.jsxs(runtime2.TooltipProvider, {
        children: [
          jsxDY.jsx(runtime2.TextInput, {
            ref: fieldRef,
            value: value2,
            onChange: (event) => {
              value3(event.target.value), event.nativeEvent.isComposing || onQuery(event.target.value);
            },
            onCompositionEnd: (input) => onQuery(input.currentTarget.value),
            placeholder: FIND_BAR_LABEL,
            "aria-label": FIND_BAR_LABEL,
            autoComplete: "off",
            spellCheck: !1,
            maxLength: 200,
            className: "pointer-coarse:h-10",
            style: FIND_BAR_INPUT_STYLE
          }),
          jsxDY.jsxs("span", {
            role: "status",
            "aria-atomic": "true",
            className: "text-muted text-caption",
            style: FIND_BAR_COUNT_STYLE,
            children: [
              jsxDY.jsx("span", {
                "aria-hidden": "true",
                children: findCountReadout(value)
              }),
              jsxDY.jsx("span", {
                style: FIND_BAR_LIVE_REGION_STYLE,
                children: findCountReadout(value) === "" ? "" : findCountAnnouncement(value.current, value.total, value.capped, value.place)
              })
            ]
          }),
          jsxDY.jsx(runtime2.ToolbarButton, {
            iconOnly: !0,
            icon: "ArrowUp",
            label: FIND_PREVIOUS_LABEL,
            disabled: value4,
            disabledTip: value5,
            onClick: () => onStep(-1)
          }),
          jsxDY.jsx(runtime2.ToolbarButton, {
            iconOnly: !0,
            icon: "ArrowDown",
            label: FIND_NEXT_LABEL,
            disabled: value4,
            disabledTip: value5,
            onClick: () => onStep(1)
          }),
          jsxDY.jsx(runtime2.ToolbarButton, {
            iconOnly: !0,
            icon: "X",
            label: FIND_CLOSE_LABEL,
            onClick: onClose
          })
        ]
      })
    });
  }
  return bindRuntimeValue(runtime2, "reactsq", () => reactsq, (value) => {
    reactsq = value;
  }), bindRuntimeValue(runtime2, "FIND_BAR_ATTRIBUTE", () => FIND_BAR_ATTRIBUTE, (value) => {
    FIND_BAR_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "matchesLatinShortcut", () => matchesLatinShortcut), bindRuntimeValue(runtime2, "FIND_BAR_EDIT_SHORTCUTS", () => FIND_BAR_EDIT_SHORTCUTS, (value) => {
    FIND_BAR_EDIT_SHORTCUTS = value;
  }), bindRuntimeValue(runtime2, "findBarKeyHandlers", () => findBarKeyHandlers, (value) => {
    findBarKeyHandlers = value;
  }), bindRuntimeValue(runtime2, "registerFindBarKeyHandler", () => registerFindBarKeyHandler), bindRuntimeValue(runtime2, "captureFindBarKey", () => captureFindBarKey), bindRuntimeValue(runtime2, "captureFindBarClipboard", () => captureFindBarClipboard), bindRuntimeValue(runtime2, "findBarListenerWindows", () => findBarListenerWindows, (value) => {
    findBarListenerWindows = value;
  }), bindRuntimeValue(runtime2, "installFindBarEventGuards", () => installFindBarEventGuards), bindRuntimeValue(runtime2, "isPrimaryShortcutModifier", () => isPrimaryShortcutModifier), bindRuntimeValue(runtime2, "isFindShortcut", () => isFindShortcut), bindRuntimeValue(runtime2, "addUnpatchedEventListener", () => addUnpatchedEventListener), bindRuntimeValue(runtime2, "createFindKeyHandler", () => createFindKeyHandler), bindRuntimeValue(runtime2, "findStepShortcut", () => findStepShortcut), bindRuntimeValue(runtime2, "NON_TEXT_FIND_INPUT_PATTERN", () => NON_TEXT_FIND_INPUT_PATTERN, (value) => {
    NON_TEXT_FIND_INPUT_PATTERN = value;
  }), bindRuntimeValue(runtime2, "isTextEditingElement", () => isTextEditingElement), bindRuntimeValue(runtime2, "blurEditingTargetForFind", () => blurEditingTargetForFind), bindRuntimeValue(runtime2, "FIND_BAR_LABEL", () => FIND_BAR_LABEL, (value) => {
    FIND_BAR_LABEL = value;
  }), bindRuntimeValue(runtime2, "FIND_PREVIOUS_LABEL", () => FIND_PREVIOUS_LABEL, (value) => {
    FIND_PREVIOUS_LABEL = value;
  }), bindRuntimeValue(runtime2, "FIND_NEXT_LABEL", () => FIND_NEXT_LABEL, (value) => {
    FIND_NEXT_LABEL = value;
  }), bindRuntimeValue(runtime2, "FIND_CLOSE_LABEL", () => FIND_CLOSE_LABEL, (value) => {
    FIND_CLOSE_LABEL = value;
  }), bindRuntimeValue(runtime2, "FIND_PLACEHOLDER", () => FIND_PLACEHOLDER, (value) => {
    FIND_PLACEHOLDER = value;
  }), bindRuntimeValue(runtime2, "FIND_NO_MATCHES_LABEL", () => FIND_NO_MATCHES_LABEL, (value) => {
    FIND_NO_MATCHES_LABEL = value;
  }), bindRuntimeValue(runtime2, "findCountAnnouncement", () => findCountAnnouncement), bindRuntimeValue(runtime2, "jsxDY", () => jsxDY, (value) => {
    jsxDY = value;
  }), bindRuntimeValue(runtime2, "FIND_BAR_STYLE", () => FIND_BAR_STYLE, (value) => {
    FIND_BAR_STYLE = value;
  }), bindRuntimeValue(runtime2, "FIND_BAR_INPUT_STYLE", () => FIND_BAR_INPUT_STYLE, (value) => {
    FIND_BAR_INPUT_STYLE = value;
  }), bindRuntimeValue(runtime2, "FIND_BAR_COUNT_STYLE", () => FIND_BAR_COUNT_STYLE, (value) => {
    FIND_BAR_COUNT_STYLE = value;
  }), bindRuntimeValue(runtime2, "FIND_BAR_LIVE_REGION_STYLE", () => FIND_BAR_LIVE_REGION_STYLE, (value) => {
    FIND_BAR_LIVE_REGION_STYLE = value;
  }), bindRuntimeValue(runtime2, "findCountReadout", () => findCountReadout), bindRuntimeValue(runtime2, "FindBar", () => FindBar), bindRuntimeValue(runtime2, "preserveFindStatusWhileSearching", () => preserveFindStatusWhileSearching), bindRuntimeValue(runtime2, "OpenFindBar", () => OpenFindBar), () => {
    (0, runtime2.initializeUiInputs210)(), reactsq = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeUiPropertyFocus)(), FIND_BAR_ATTRIBUTE = "data-mc-find", FIND_BAR_EDIT_SHORTCUTS = ["x", "c", "v", "z", "y", "a", "d"], findBarKeyHandlers = /* @__PURE__ */ new WeakMap(), findBarListenerWindows = /* @__PURE__ */ new WeakSet(), typeof window < "u" && installFindBarEventGuards(window), NON_TEXT_FIND_INPUT_PATTERN = /^(range|checkbox|radio|button|submit|reset|color|file|image)$/, FIND_BAR_LABEL = "在页面中查找", FIND_PREVIOUS_LABEL = "上一个匹配项", FIND_NEXT_LABEL = "下一个匹配项", FIND_CLOSE_LABEL = "关闭查找栏", FIND_PLACEHOLDER = "输入以搜索", FIND_NO_MATCHES_LABEL = "无匹配项", jsxDY = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), FIND_BAR_STYLE = {
      position: "absolute",
      top: "max(var(--tb-overlay-h, 0px), 8px)",
      insetInlineEnd: 12,
      zIndex: 49,
      display: "flex",
      alignItems: "center",
      gap: 4,
      padding: 5,
      width: 320,
      maxWidth: "calc(100% - 24px)"
    }, FIND_BAR_INPUT_STYLE = {
      flex: "1 1 0",
      minWidth: 0
    }, FIND_BAR_COUNT_STYLE = {
      minWidth: "3.5em",
      textAlign: "end",
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap"
    }, FIND_BAR_LIVE_REGION_STYLE = {
      position: "absolute",
      width: 1,
      height: 1,
      overflow: "hidden",
      clipPath: "inset(50%)",
      whiteSpace: "nowrap"
    };
  };
}
export {
  installUiFindBar
};
