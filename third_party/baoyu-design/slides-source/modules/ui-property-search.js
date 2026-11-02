// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPropertySearch(runtime2) {
  var jsxForUiPropertySearch, OPTION_LIST_MAX_HEIGHT, initializeUiPropertySearch;
  function optionMatchesQuery(query, ...values) {
    let value = query.trim().toLowerCase();
    return value === "" || values.some((input) => input !== void 0 && input.toLowerCase().includes(value));
  }
  function optionTypeaheadMatch(query, options) {
    let value = query.trim().toLowerCase(), callback = (input) => options.findIndex((input2) => input(input2.toLowerCase()));
    return [
      callback((input) => input === value),
      callback((input) => input.startsWith(value))
    ].find((input) => input >= 0) ?? 0;
  }
  function createOptionListKeyHandler(command, { across: options = !1 } = {}) {
    return (event) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || event.nativeEvent.isComposing)
        return;
      let value = event.key === "ArrowUp" || options && event.key === "ArrowLeft", value2 = event.key === "ArrowDown" || options && event.key === "ArrowRight";
      if (!value && !value2 && event.key !== "Home" && event.key !== "End")
        return;
      let target = event.target;
      if (!(target instanceof HTMLElement))
        return;
      let value3 = Array.from(event.currentTarget.querySelectorAll(command)).flatMap((input) => {
        if (!input.matches(":disabled"))
          return [input];
        let parentElement = input.parentElement;
        return parentElement !== null && parentElement !== event.currentTarget && parentElement.tabIndex >= 0 && parentElement.firstElementChild === input && parentElement.querySelectorAll(command).length === 1 ? [parentElement] : [];
      }), value4 = value3.indexOf(target);
      if (value4 === -1)
        return;
      let value5 = event.key === "Home" ? 0 : event.key === "End" ? value3.length - 1 : (value4 + (value2 ? 1 : -1) + value3.length) % value3.length;
      event.preventDefault(), value3[value5].focus();
    };
  }
  function OptionList({ value, onChange, label, rowSelector, onEnterIndex, className, "data-testid": dataTestid }) {
    return jsxForUiPropertySearch.jsx("div", {
      className: className ?? "mt-0.5 mb-2 w-0 min-w-full",
      children: jsxForUiPropertySearch.jsx(runtime2.TextInput, {
        value,
        onChange: (event) => onChange(event.target.value),
        onKeyDown: (event) => {
          if (event.nativeEvent.isComposing)
            return;
          let value2 = Array.from(event.currentTarget.closest("[data-search-scope]")?.querySelectorAll(rowSelector) ?? []).filter((input) => !input.matches(":disabled")), value3 = event.key === "ArrowDown" ? value2[0] : event.key === "ArrowUp" ? value2[value2.length - 1] : void 0;
          if (value3 !== void 0)
            event.preventDefault(), value3.focus();
          else if (event.key === "Enter" && value.trim() !== "" && value2.length > 0)
            event.preventDefault(), value2[onEnterIndex?.() ?? 0]?.click();
          else if (event.key === "Escape" && value !== "") {
            event.preventDefault(), event.stopPropagation(), onChange("");
            return;
          }
          event.key !== "Escape" && event.key !== "Tab" && event.stopPropagation();
        },
        slotStart: jsxForUiPropertySearch.jsx(runtime2.KitIcon, {
          name: "Search",
          size: 14,
          className: "text-muted"
        }),
        placeholder: label,
        "aria-label": label,
        clearable: !0,
        onClear: () => onChange(""),
        autoComplete: "off",
        spellCheck: !1,
        "data-testid": dataTestid,
        "data-kit-search": "",
        "data-kit": "list-search",
        className: "w-full"
      })
    });
  }
  return bindRuntimeValue(runtime2, "optionMatchesQuery", () => optionMatchesQuery), bindRuntimeValue(runtime2, "optionTypeaheadMatch", () => optionTypeaheadMatch), bindRuntimeValue(runtime2, "createOptionListKeyHandler", () => createOptionListKeyHandler), bindRuntimeValue(runtime2, "OptionList", () => OptionList), bindRuntimeValue(runtime2, "jsxForUiPropertySearch", () => jsxForUiPropertySearch, (value) => {
    jsxForUiPropertySearch = value;
  }), bindRuntimeValue(runtime2, "OPTION_LIST_MAX_HEIGHT", () => OPTION_LIST_MAX_HEIGHT, (value) => {
    OPTION_LIST_MAX_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "initializeUiPropertySearch", () => initializeUiPropertySearch, (value) => {
    initializeUiPropertySearch = value;
  }), () => {
    OPTION_LIST_MAX_HEIGHT = 12, initializeUiPropertySearch = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiPropertyIcons)(), jsxForUiPropertySearch = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    });
  };
}
export {
  installUiPropertySearch
};
