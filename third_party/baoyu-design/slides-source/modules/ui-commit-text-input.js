// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiCommitTextInput(runtime2) {
  var reactJW, jsxlp0;
  function CommitTextInput({ value, onCommit, onCancel, onChange, selectOnOpen = !0, className, placeholder, onKeyDown, onBlur, ...remainingProps }) {
    let [value2, value3] = reactJW.useState(value), ref = reactJW.useRef(!1), ref2 = reactJW.useRef(!1), ref3 = reactJW.useRef(!1), ref4 = reactJW.useRef(null);
    reactJW.useEffect(() => {
      let current = ref4.current;
      current !== null && (current.focus({
        preventScroll: !0
      }), selectOnOpen ? current.select() : current.setSelectionRange(current.value.length, current.value.length));
    }, [selectOnOpen]);
    let callback = () => {
      if (!ref3.current) {
        if (ref3.current = !0, ref.current) {
          ref.current = !1, onCancel?.();
          return;
        }
        onCommit(value2, ref2.current ? "enter" : "blur");
      }
    }, value4 = value2 !== "" ? value2 : placeholder ?? "";
    return jsxlp0.jsx("input", {
      ...remainingProps,
      ref: ref4,
      className: (0, runtime2.joinClassNames)("kit-rn-in", className),
      value: value2,
      placeholder,
      spellCheck: !1,
      autoComplete: "off",
      size: Math.max(2, value4.length + 1),
      onChange: (input) => {
        value3(input.currentTarget.value), onChange?.(input.currentTarget.value);
      },
      onBlur: (input) => {
        onBlur?.(input), callback();
      },
      onKeyDown: (event) => {
        onKeyDown?.(event), event.stopPropagation(), !(event.nativeEvent.isComposing || event.keyCode === 229) && (event.key === "Enter" ? (event.preventDefault(), ref2.current = !0, event.currentTarget.blur()) : event.key === "Escape" && (event.preventDefault(), ref.current = !0, event.currentTarget.blur()));
      }
    });
  }
  return bindRuntimeValue(runtime2, "reactJW", () => reactJW, (value) => {
    reactJW = value;
  }), bindRuntimeValue(runtime2, "jsxlp0", () => jsxlp0, (value) => {
    jsxlp0 = value;
  }), bindRuntimeValue(runtime2, "CommitTextInput", () => CommitTextInput), () => {
    (0, runtime2.initializeUiNumberControls2)(), reactJW = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxlp0 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installUiCommitTextInput
};
