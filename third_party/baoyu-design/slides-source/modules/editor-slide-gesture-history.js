// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorSlideGestureHistory(runtime2) {
  function createSlideGestureHistory(options) {
    let value = null, index4 = 0;
    return {
      gestureFrame(input) {
        (value === null || value.stored === input) && (value = {
          units: options.latest(),
          slide: JSON.stringify(input),
          stored: input
        });
      },
      gestureEnd: () => void (value = null),
      command(input, options2, context, value2) {
        let value3 = options.onScreen(input), value4 = value;
        value = null;
        let value5 = value2 === void 0 ? options.latest() : value4 !== null && value4.slide === JSON.stringify(value2) ? value4.units : null, value6 = value2 === void 0 ? void 0 : options.latest(), value7 = index4 += 1;
        value2 === void 0 && queueMicrotask(() => void (value7 === index4 && (value6 = options.latest())));
        let flag = !1, callback = (input2) => () => {
          let value8 = flag;
          flag = !0;
          let value9 = input2 === "undo" ? value5 : value6 ?? value5;
          if (!context(input2) || !value8 || !value3 || value9 === null)
            return;
          let value10 = options.selectable(input);
          value10 !== void 0 && options.select((0, runtime2.filterValidSelections)(value10, value9));
        };
        return {
          label: options2,
          do: callback("do"),
          undo: callback("undo")
        };
      }
    };
  }
  return bindRuntimeValue(runtime2, "createSlideGestureHistory", () => createSlideGestureHistory), () => {
    (0, runtime2.initializeModelSelection)();
  };
}
export {
  installEditorSlideGestureHistory
};
