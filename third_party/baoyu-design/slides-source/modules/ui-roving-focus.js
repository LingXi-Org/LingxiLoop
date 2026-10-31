// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiRovingFocus(runtime2) {
  var DEFAULT_ROVING_TAB_STOPS, ROVING_FOCUS_SELECTOR, ROVING_INPUT_TAG_PATTERN;
  function createRovingKeyHandler(command, { tabStops: options = DEFAULT_ROVING_TAB_STOPS } = {}) {
    return (0, runtime2.initializeKitFieldUndo)(), (event) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.nativeEvent.isComposing)
        return;
      let { target: value, currentTarget: value2 } = event;
      if (!value2.contains(value) || (0, runtime2.hasOpenOverlay)())
        return;
      if (ROVING_INPUT_TAG_PATTERN.test(value.tagName) || value.isContentEditable) {
        event.key === "Escape" && event.keyCode !== 229 && (0, runtime2.isKitField)(value) && command() && event.preventDefault();
        return;
      }
      if (event.key === "Tab") {
        if (options === "each") {
          let value9 = visibleRovingFocusElements(value2), value10 = value9.findIndex((input) => input === value || input.contains(value));
          if (!(event.shiftKey ? value10 <= 0 : value10 === -1 || value10 >= value9.length - 1))
            return;
        }
        command() && event.preventDefault();
        return;
      }
      let value3 = event.key === "ArrowLeft", value4 = event.key === "ArrowRight";
      if (!value3 && !value4 && event.key !== "Home" && event.key !== "End")
        return;
      let value5 = visibleRovingFocusElements(value2);
      if (value5.length === 0)
        return;
      let value6 = value5.findIndex((input) => input === value || input.contains(value)), value7 = event.key === "Home" ? 0 : event.key === "End" ? value5.length - 1 : value6 === -1 ? 0 : (value6 + (value4 ? 1 : -1) + value5.length) % value5.length;
      event.preventDefault();
      let value8 = value5[value7];
      value8.focus({
        preventScroll: !0
      }), (0, runtime2.scrollToolbarButtonIntoView)(value2, value8);
    };
  }
  function visibleRovingFocusElements(container) {
    return Array.from(container.querySelectorAll(ROVING_FOCUS_SELECTOR)).filter((input) => input.getClientRects().length > 0);
  }
  return bindRuntimeValue(runtime2, "DEFAULT_ROVING_TAB_STOPS", () => DEFAULT_ROVING_TAB_STOPS, (value) => {
    DEFAULT_ROVING_TAB_STOPS = value;
  }), bindRuntimeValue(runtime2, "ROVING_FOCUS_SELECTOR", () => ROVING_FOCUS_SELECTOR, (value) => {
    ROVING_FOCUS_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "ROVING_INPUT_TAG_PATTERN", () => ROVING_INPUT_TAG_PATTERN, (value) => {
    ROVING_INPUT_TAG_PATTERN = value;
  }), bindRuntimeValue(runtime2, "createRovingKeyHandler", () => createRovingKeyHandler), bindRuntimeValue(runtime2, "visibleRovingFocusElements", () => visibleRovingFocusElements), () => {
    DEFAULT_ROVING_TAB_STOPS = "one", ROVING_FOCUS_SELECTOR = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', ROVING_INPUT_TAG_PATTERN = /^(INPUT|TEXTAREA|SELECT)$/;
  };
}
export {
  installUiRovingFocus
};
