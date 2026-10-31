// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesSlideOrderMerge(runtime2) {
  var uniqueSlideOrder;
  function formatLostSlideEditsMessage(paths, options = {}) {
    let basename = (input) => input.slice(input.lastIndexOf("/") + 1), firstPath = paths[0], single = paths.length === 1, retention = options.stashed === !0 ? "kept in this browser for up to " + runtime2.CRASH_STASH_RETENTION_LABEL : "kept only while this tab stays open", message = " Until then " + (single ? "it is" : "they are") + " not saved, and " + retention + ".";
    return options.restSaved === !1 ? (single ? 'Also, "' + basename(firstPath.path) + '" cannot be saved as it is: ' : "Also, " + String(paths.length) + ' files cannot be saved as they are. The first, "' + basename(firstPath.path) + '": ') + firstPath.why + "." + message : (single ? 'Everything else is saved, but "' + basename(firstPath.path) + '" is not: ' : "Everything else is saved, but " + String(paths.length) + ' files are not. The first, "' + basename(firstPath.path) + '": ') + firstPath.why + "." + message;
  }
  function mergeSlideOrderWithReplay(base, mine, theirs) {
    let order = (0, runtime2.mergeOrderedStringList)(base, mine, theirs), baseOrder = uniqueSlideOrder(base), mineOrder = uniqueSlideOrder(mine), theirOrder = uniqueSlideOrder(theirs);
    if ((0, runtime2.stringArraysEqual)(mineOrder, baseOrder) || (0, runtime2.stringArraysEqual)(theirOrder, baseOrder))
      return {
        order,
        replayed: [],
        lost: []
      };
    let values = new Set(order), values2 = new Set(baseOrder), values3 = new Set(theirOrder), value = (0, runtime2.longestCommonSubsequence)(baseOrder, mineOrder).filter((input) => values.has(input)), values4 = new Set((0, runtime2.longestCommonSubsequence)(baseOrder, theirOrder)), value2 = value.filter((input) => values4.has(input)), value3 = value.filter((input) => !values4.has(input));
    if (value3.length === 0)
      return {
        order,
        replayed: [],
        lost: value2
      };
    let values5 = new Set(value3), values6 = new Set(order.filter((input) => values2.has(input) && !values4.has(input) && !values5.has(input) || !values2.has(input) && !values3.has(input))), callback = (input) => values4.has(input) || !values2.has(input) && values3.has(input), value4 = order.filter((input) => !values5.has(input));
    for (let value5 of mineOrder) {
      if (!values5.has(value5))
        continue;
      let index4 = 0;
      for (let value6 = mineOrder.indexOf(value5) - 1; value6 >= 0; value6--) {
        let value7 = mineOrder[value6];
        if (!values6.has(value7))
          continue;
        let value8 = value4.indexOf(value7);
        if (value8 >= 0) {
          index4 = value8 + 1;
          break;
        }
      }
      for (; index4 < value4.length && callback(value4[index4]) && (!values4.has(value4[index4]) || value4[index4] < value5); )
        index4 += 1;
      value4.splice(index4, 0, value5), values6.add(value5);
    }
    return {
      order: value4,
      replayed: value3,
      lost: value2
    };
  }
  return bindRuntimeValue(runtime2, "formatLostSlideEditsMessage", () => formatLostSlideEditsMessage), bindRuntimeValue(runtime2, "uniqueSlideOrder", () => uniqueSlideOrder, (value) => {
    uniqueSlideOrder = value;
  }), bindRuntimeValue(runtime2, "mergeSlideOrderWithReplay", () => mergeSlideOrderWithReplay), () => {
    uniqueSlideOrder = (input) => [...new Set(input)];
  };
}
export {
  installFilesSlideOrderMerge
};
