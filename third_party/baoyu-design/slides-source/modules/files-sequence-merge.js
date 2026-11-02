// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesSequenceMerge(runtime2) {
  var stringArraysEqual;
  function longestCommonSubsequence(left, right) {
    let rightMembers = new Set(right), leftMembers = new Set(left), leftCommon = left.filter((input) => rightMembers.has(input)), rightCommon = right.filter((input) => leftMembers.has(input)), leftLength = leftCommon.length, rightLength = rightCommon.length, lengthTable = Array.from({
      length: leftLength + 1
    }, () => Array(rightLength + 1).fill(0));
    for (let value = leftLength - 1; value >= 0; value--)
      for (let value2 = rightLength - 1; value2 >= 0; value2--)
        lengthTable[value][value2] = leftCommon[value] === rightCommon[value2] ? lengthTable[value + 1][value2 + 1] + 1 : Math.max(lengthTable[value + 1][value2], lengthTable[value][value2 + 1]);
    let values = /* @__PURE__ */ new Set(), index4 = 0, index22 = 0;
    for (; index4 < leftLength && index22 < rightLength; )
      leftCommon[index4] === rightCommon[index22] ? (values.add(leftCommon[index4]), index4++, index22++) : lengthTable[index4 + 1][index22] >= lengthTable[index4][index22 + 1] ? index4++ : index22++;
    return rightCommon.filter((input) => !values.has(input));
  }
  return bindRuntimeValue(runtime2, "stringArraysEqual", () => stringArraysEqual, (value) => {
    stringArraysEqual = value;
  }), bindRuntimeValue(runtime2, "longestCommonSubsequence", () => longestCommonSubsequence), () => {
    stringArraysEqual = (items, items2) => items.length === items2.length && items.every((input, options) => input === items2[options]);
  };
}
export {
  installFilesSequenceMerge
};
