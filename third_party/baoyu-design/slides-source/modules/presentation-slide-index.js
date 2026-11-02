// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installPresentationSlideIndex(runtime2) {
  var presentationOrdersEqual;
  function preservePresentationSlideIndex(previousOrder, order, slideId, fallbackIndex) {
    if (order.length === 0)
      return 0;
    let clampIndex = (input) => Math.max(0, Math.min(order.length - 1, input));
    if (slideId === void 0)
      return clampIndex(fallbackIndex);
    let index4 = order.indexOf(slideId);
    if (index4 >= 0)
      return index4;
    let previousIndex = previousOrder.indexOf(slideId);
    if (previousIndex < 0)
      return clampIndex(fallbackIndex);
    for (let count = 1; count < previousOrder.length; count++)
      for (let value of [previousIndex + count, previousIndex - count]) {
        if (value < 0 || value >= previousOrder.length)
          continue;
        let value2 = order.indexOf(previousOrder[value]);
        if (value2 >= 0)
          return value2;
      }
    return clampIndex(fallbackIndex);
  }
  return bindRuntimeValue(runtime2, "preservePresentationSlideIndex", () => preservePresentationSlideIndex), bindRuntimeValue(runtime2, "presentationOrdersEqual", () => presentationOrdersEqual, (value) => {
    presentationOrdersEqual = value;
  }), () => {
    presentationOrdersEqual = (left, right) => left.length === right.length && left.every((input, options) => input === right[options]);
  };
}
export {
  installPresentationSlideIndex
};
