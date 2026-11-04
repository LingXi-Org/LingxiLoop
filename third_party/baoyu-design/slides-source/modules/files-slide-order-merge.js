// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesSlideOrderMerge(runtime2) {
  var uniqueSlideOrder, joinLostEditSentences, CRASH_STASH_RETENTION_VALUES, SAVE_REFUSAL_MESSAGES;
  function formatLostSlideEditsMessage(paths, options = {}) {
    let firstPath = paths[0], single = paths.length === 1, values = {
      name: firstPath.path.slice(firstPath.path.lastIndexOf("/") + 1),
      why: String( firstPath.why)
    }, countValues = {
      ...values,
      n: paths.length,
      count: String( paths.length)
    }, untilSaved = options.stashed === !0 ? single ? (0, runtime2.formatMessage)({
      defaultMessage: "在此之前它未保存，会在此浏览器中保留最多 {count} 天。",
      id: "Ikm4d6U/VX"
    }, CRASH_STASH_RETENTION_VALUES) : (0, runtime2.formatMessage) ({
      defaultMessage: "在此之前它们未保存，会在此浏览器中保留最多 {count} 天。",
      id: "qhlRFSh3DK"
    }, CRASH_STASH_RETENTION_VALUES) :single ? (0, runtime2.formatMessage)({
      defaultMessage: "在此之前它未保存，仅在此标签页保持打开时保留。",
      id: "CuyyxuZ6x7"
    }) : (0, runtime2.formatMessage)({
      defaultMessage: "在此之前它们未保存，仅在此标签页保持打开时保留。",
      id : "q3xzpVFazX"
    });
    return options.restSaved === !1 ? joinLostEditSentences (single ?(0, runtime2.formatMessage)({
      defaultMessage: "另外，“{name}”无法按原样保存：{why}。",
      id: "Dp/5XDc2y4"
    }, values) :(0, runtime2.formatMessage)({
      defaultMessage: "另外，有 {count} 个文件无法按原样保存。第一个为“{name}”：{why}。",
      id: "v0txWwQUWf"
    }, countValues), untilSaved) : joinLostEditSentences (single ?(0, runtime2.formatMessage)({
      defaultMessage: "其余内容均已保存，但“{name}”未保存：{why}。",
      id: "8YbRhkI5qq"
    }, values) :(0, runtime2.formatMessage)({
      defaultMessage: "其余内容均已保存，但有 {count} 个文件未保存。第一个为“{name}”：{why}。",
      id: "gfWTf60RmN"
    }, countValues), untilSaved);
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
  return bindRuntimeValue(runtime2, "joinLostEditSentences", () => joinLostEditSentences, (value) => {
    joinLostEditSentences = value;
  }), bindRuntimeValue(runtime2, "CRASH_STASH_RETENTION_VALUES", () => CRASH_STASH_RETENTION_VALUES, (value) => {
    CRASH_STASH_RETENTION_VALUES = value;
  }), bindRuntimeValue(runtime2, "SAVE_REFUSAL_MESSAGES", () => SAVE_REFUSAL_MESSAGES, (value) => {
    SAVE_REFUSAL_MESSAGES = value;
  }), bindRuntimeValue(runtime2, "formatLostSlideEditsMessage", () => formatLostSlideEditsMessage), bindRuntimeValue(runtime2, "uniqueSlideOrder", () => uniqueSlideOrder, (value) => {
    uniqueSlideOrder = value;
  }), bindRuntimeValue(runtime2, "mergeSlideOrderWithReplay", () => mergeSlideOrderWithReplay), () => {
    joinLostEditSentences = (first, next) => (0, runtime2.formatMessage)({
      defaultMessage: "{first} {next}",
      id: "NrLKGHrExs"
    }, {
      first,
      next
    }), CRASH_STASH_RETENTION_VALUES = {
      n: runtime2.CRASH_STASH_MAX_AGE_MS / 864e5,
      count: String(runtime2.CRASH_STASH_MAX_AGE_MS / 864e5)
    }, SAVE_REFUSAL_MESSAGES = {
      not_writer: (0, runtime2.formatMessage)({
        defaultMessage: "未保存：你已不再拥有此处的编辑权限。请向所有者申请权限后重新加载，获得权限后即可保存你的编辑。",
        id: "vcFwtZ5ncD"
      }),
      not_declared: (0, runtime2.formatMessage)({
        defaultMessage: "未保存：此页面不支持保存。",
        id: "hNSk7UgZLG"
      }),
      capability_disabled: (0, runtime2.formatMessage)({
        defaultMessage: "未保存：此页面当前无法保存。请重新加载后重试。",
        id: "1S+RIx1JXe"
      }),
      too_large: (0, runtime2.formatMessage)({
        defaultMessage: "未保存：此更改过大，无法保存。请缩小后重试。",
        id: "84c0YMjzJV"
      }),
      read_only_path: (0, runtime2.formatMessage)({
        defaultMessage: "未保存：此文件属于编辑器本身，无法更改。",
        id: "JNkFwbrqxz"
      })
    },
    uniqueSlideOrder = (input) => [...new Set(input)];
  };
}
export {
  installFilesSlideOrderMerge
};
