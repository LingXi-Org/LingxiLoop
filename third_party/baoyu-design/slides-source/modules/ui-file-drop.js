// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiFileDrop(runtime2) {
  var reactpC;
  function dataTransferHasFiles(dataTransfer) {
    return dataTransfer !== null && Array.from(dataTransfer.types).includes("Files");
  }
  function createFileDropHandlers(options) {
    let callback = (input) => options.internal?.current !== !0 && dataTransferHasFiles(input.dataTransfer);
    return {
      onDragEnter: (event) => {
        callback(event) && (event.preventDefault(), !options.disabled && (options.depth.current += 1, options.setOver(!0)));
      },
      onDragOver: (event) => {
        callback(event) && (event.preventDefault(), event.dataTransfer.dropEffect = options.disabled ? "none" : "copy", !options.disabled && (options.depth.current = Math.max(options.depth.current, 1), options.setOver(!0)));
      },
      onDragLeave: (input) => {
        callback(input) && (options.depth.current = Math.max(0, options.depth.current - 1), options.depth.current === 0 && options.setOver(!1));
      },
      onDrop: (event) => {
        if (!callback(event) || (options.depth.current = 0, options.setOver(!1), event.preventDefault(), options.disabled))
          return;
        let value = Array.from(event.dataTransfer.files), value2 = options.accept === void 0 ? value : value.filter(options.accept);
        options.accept !== void 0 && value2.length === 0 || options.onFiles(value2, event);
      }
    };
  }
  function installInternalFileDragTracking(target, onDrop, internalDragRef) {
    let value = target, callback = () => {
      internalDragRef.current = !0;
    }, callback2 = () => {
      internalDragRef.current = !1;
    }, callback3 = () => {
      internalDragRef.current = !1, onDrop();
    }, callback4 = (input) => {
      let value2 = input, value3 = value2.clientX > 0 && value2.clientY > 0 && value2.clientX < value.innerWidth && value2.clientY < value.innerHeight;
      value2.relatedTarget === null && !value3 && callback3();
    }, callback5 = (input) => {
      let value2 = input, dataTransfer = value2.dataTransfer;
      internalDragRef.current || value2.defaultPrevented || !dataTransferHasFiles(dataTransfer) || (value2.preventDefault(), value2.type === "dragover" && (dataTransfer.dropEffect = "none"));
    };
    return target.addEventListener("dragstart", callback, !0), target.addEventListener("dragend", callback2, !0), target.addEventListener("mousemove", callback2, !0), target.addEventListener("drop", onDrop, !0), target.addEventListener("dragleave", callback4, !0), target.addEventListener("blur", callback3), target.addEventListener("dragover", callback5), target.addEventListener("drop", callback5), target.addEventListener("drop", callback2), () => {
      target.removeEventListener("dragstart", callback, !0), target.removeEventListener("dragend", callback2, !0), target.removeEventListener("mousemove", callback2, !0), target.removeEventListener("drop", onDrop, !0), target.removeEventListener("dragleave", callback4, !0), target.removeEventListener("blur", callback3), target.removeEventListener("dragover", callback5), target.removeEventListener("drop", callback5), target.removeEventListener("drop", callback2);
    };
  }
  function useFileDrop(options) {
    let [value, value2] = reactpC.useState(!1), ref = reactpC.useRef(0), ref2 = reactpC.useRef(!1);
    reactpC.useEffect(() => installInternalFileDragTracking(window, () => {
      ref.current = 0, value2(!1);
    }, ref2), []), reactpC.useEffect(() => {
      options.disabled && (ref.current = 0, value2(!1));
    }, [options.disabled]);
    let memo4 = reactpC.useMemo(() => createFileDropHandlers({
      disabled: options.disabled,
      onFiles: options.onFiles,
      accept: options.accept,
      depth: ref,
      internal: ref2,
      setOver: value2
    }), [options.disabled, options.onFiles, options.accept]);
    return {
      over: value,
      targetProps: memo4
    };
  }
  return bindRuntimeValue(runtime2, "reactpC", () => reactpC, (value) => {
    reactpC = value;
  }), bindRuntimeValue(runtime2, "dataTransferHasFiles", () => dataTransferHasFiles), bindRuntimeValue(runtime2, "createFileDropHandlers", () => createFileDropHandlers), bindRuntimeValue(runtime2, "installInternalFileDragTracking", () => installInternalFileDragTracking), bindRuntimeValue(runtime2, "useFileDrop", () => useFileDrop), () => {
    reactpC = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
  };
}
export {
  installUiFileDrop
};
