// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPropertyLabels(runtime2) {
  var RESET_LABEL, MORE_ACTIONS_LABEL, addToSectionLabel, ADD_LABEL, DEFAULT_CLOSE_LABEL, TYPE_LABEL, MIXED_LABEL, COLOR_LABEL, COLOR_SEARCH_LABEL, NO_COLOR_MATCHES_LABEL, SLIDE_COLORS_LABEL, STYLE_SEARCH_LABEL, INCREASE_LABEL, DECREASE_LABEL, INHERITED_LABEL, PER_SIDE_LABEL, PER_CORNER_LABEL, EDIT_LABEL, HIDE_LABEL, UNIFIED_VALUES_DISABLED_REASON, SIDE_LABELS, CORNER_LABELS_rc0, CONTRAST_GROUND_PREPOSITION, CONTRAST_PASSES_LABEL, CONTRAST_FAILS_LABEL, COLOR_FIX_LABEL, initializeUiPropertyLabels;
  function numberChangeRefusalMessage(label, unit) {
    return "Nothing changed. " + (label ?? "This field") + " takes a number " + (unit ? "in " + unit : "only") + ".";
  }
  function additionalPassingGroundsMessage(count) {
    return count > 0 ? "; " + String(count) + (count === 1 ? " more ground passes" : " more grounds pass") : "";
  }
  function contrastResultSummary(result) {
    return (result.passes ? CONTRAST_PASSES_LABEL : CONTRAST_FAILS_LABEL) + ", " + result.ratio + " " + CONTRAST_GROUND_PREPOSITION + " " + result.ground + (result.passes ? "" : ", below " + result.min);
  }
  function contrastResultDetails(result) {
    let value = contrastResultSummary(result), value2 = result.alsoFailing ?? [];
    return value2.length > 0 && (value += "; also below " + result.min + " on " + value2.join(" and ")), value + additionalPassingGroundsMessage(result.alsoPassing ?? 0);
  }
  function contrastResultCountSummary(result) {
    let value = result.alsoFailing ?? 0;
    return contrastResultSummary(result) + (value > 0 ? "; also too low on " + String(value) + (value === 1 ? " more ground" : " more grounds") : "") + additionalPassingGroundsMessage(result.alsoPassing ?? 0);
  }
  function contrastFixDescription(fix) {
    return "Changes the color to " + fix.hex + ", contrast " + fix.ratio + " on " + fix.ground;
  }
  return bindRuntimeValue(runtime2, "numberChangeRefusalMessage", () => numberChangeRefusalMessage), bindRuntimeValue(runtime2, "additionalPassingGroundsMessage", () => additionalPassingGroundsMessage), bindRuntimeValue(runtime2, "contrastResultSummary", () => contrastResultSummary), bindRuntimeValue(runtime2, "contrastResultDetails", () => contrastResultDetails), bindRuntimeValue(runtime2, "contrastResultCountSummary", () => contrastResultCountSummary), bindRuntimeValue(runtime2, "contrastFixDescription", () => contrastFixDescription), bindRuntimeValue(runtime2, "RESET_LABEL", () => RESET_LABEL, (value) => {
    RESET_LABEL = value;
  }), bindRuntimeValue(runtime2, "MORE_ACTIONS_LABEL", () => MORE_ACTIONS_LABEL, (value) => {
    MORE_ACTIONS_LABEL = value;
  }), bindRuntimeValue(runtime2, "addToSectionLabel", () => addToSectionLabel, (value) => {
    addToSectionLabel = value;
  }), bindRuntimeValue(runtime2, "ADD_LABEL", () => ADD_LABEL, (value) => {
    ADD_LABEL = value;
  }), bindRuntimeValue(runtime2, "DEFAULT_CLOSE_LABEL", () => DEFAULT_CLOSE_LABEL, (value) => {
    DEFAULT_CLOSE_LABEL = value;
  }), bindRuntimeValue(runtime2, "TYPE_LABEL", () => TYPE_LABEL, (value) => {
    TYPE_LABEL = value;
  }), bindRuntimeValue(runtime2, "MIXED_LABEL", () => MIXED_LABEL, (value) => {
    MIXED_LABEL = value;
  }), bindRuntimeValue(runtime2, "COLOR_LABEL", () => COLOR_LABEL, (value) => {
    COLOR_LABEL = value;
  }), bindRuntimeValue(runtime2, "COLOR_SEARCH_LABEL", () => COLOR_SEARCH_LABEL, (value) => {
    COLOR_SEARCH_LABEL = value;
  }), bindRuntimeValue(runtime2, "NO_COLOR_MATCHES_LABEL", () => NO_COLOR_MATCHES_LABEL, (value) => {
    NO_COLOR_MATCHES_LABEL = value;
  }), bindRuntimeValue(runtime2, "SLIDE_COLORS_LABEL", () => SLIDE_COLORS_LABEL, (value) => {
    SLIDE_COLORS_LABEL = value;
  }), bindRuntimeValue(runtime2, "STYLE_SEARCH_LABEL", () => STYLE_SEARCH_LABEL, (value) => {
    STYLE_SEARCH_LABEL = value;
  }), bindRuntimeValue(runtime2, "INCREASE_LABEL", () => INCREASE_LABEL, (value) => {
    INCREASE_LABEL = value;
  }), bindRuntimeValue(runtime2, "DECREASE_LABEL", () => DECREASE_LABEL, (value) => {
    DECREASE_LABEL = value;
  }), bindRuntimeValue(runtime2, "INHERITED_LABEL", () => INHERITED_LABEL, (value) => {
    INHERITED_LABEL = value;
  }), bindRuntimeValue(runtime2, "PER_SIDE_LABEL", () => PER_SIDE_LABEL, (value) => {
    PER_SIDE_LABEL = value;
  }), bindRuntimeValue(runtime2, "PER_CORNER_LABEL", () => PER_CORNER_LABEL, (value) => {
    PER_CORNER_LABEL = value;
  }), bindRuntimeValue(runtime2, "EDIT_LABEL", () => EDIT_LABEL, (value) => {
    EDIT_LABEL = value;
  }), bindRuntimeValue(runtime2, "HIDE_LABEL", () => HIDE_LABEL, (value) => {
    HIDE_LABEL = value;
  }), bindRuntimeValue(runtime2, "UNIFIED_VALUES_DISABLED_REASON", () => UNIFIED_VALUES_DISABLED_REASON, (value) => {
    UNIFIED_VALUES_DISABLED_REASON = value;
  }), bindRuntimeValue(runtime2, "SIDE_LABELS", () => SIDE_LABELS, (value) => {
    SIDE_LABELS = value;
  }), bindRuntimeValue(runtime2, "CORNER_LABELS_rc0", () => CORNER_LABELS_rc0, (value) => {
    CORNER_LABELS_rc0 = value;
  }), bindRuntimeValue(runtime2, "CONTRAST_GROUND_PREPOSITION", () => CONTRAST_GROUND_PREPOSITION, (value) => {
    CONTRAST_GROUND_PREPOSITION = value;
  }), bindRuntimeValue(runtime2, "CONTRAST_PASSES_LABEL", () => CONTRAST_PASSES_LABEL, (value) => {
    CONTRAST_PASSES_LABEL = value;
  }), bindRuntimeValue(runtime2, "CONTRAST_FAILS_LABEL", () => CONTRAST_FAILS_LABEL, (value) => {
    CONTRAST_FAILS_LABEL = value;
  }), bindRuntimeValue(runtime2, "COLOR_FIX_LABEL", () => COLOR_FIX_LABEL, (value) => {
    COLOR_FIX_LABEL = value;
  }), bindRuntimeValue(runtime2, "initializeUiPropertyLabels", () => initializeUiPropertyLabels, (value) => {
    initializeUiPropertyLabels = value;
  }), () => {
    RESET_LABEL = "Reset", MORE_ACTIONS_LABEL = "更多操作", addToSectionLabel = (label) => "添加到" + label, ADD_LABEL = "Add", DEFAULT_CLOSE_LABEL = "Close", TYPE_LABEL = "Type", MIXED_LABEL = "Mixed", COLOR_LABEL = "Color", COLOR_SEARCH_LABEL = "搜索颜色", NO_COLOR_MATCHES_LABEL = "无匹配项", SLIDE_COLORS_LABEL = "当前幻灯片", STYLE_SEARCH_LABEL = "搜索样式", INCREASE_LABEL = "Increase", DECREASE_LABEL = "Decrease", INHERITED_LABEL = "inherited", PER_SIDE_LABEL = "分别设置各边", PER_CORNER_LABEL = "分别设置圆角", EDIT_LABEL = "Edit", HIDE_LABEL = "Hide", UNIFIED_VALUES_DISABLED_REASON = "数值不同，统一数值后可使用一个输入框编辑", CONTRAST_GROUND_PREPOSITION = "on", CONTRAST_PASSES_LABEL = "对比度良好", CONTRAST_FAILS_LABEL = "对比度不足", COLOR_FIX_LABEL = "请选择易于辨认的颜色", initializeUiPropertyLabels = (0, runtime2.initializeOnce)(() => {
      SIDE_LABELS = ["Top", "Right", "Bottom", "Left"], CORNER_LABELS_rc0 = [
        "左上",
        "右上",
        "右下",
        "左下"
      ];
    });
  };
}
export {
  installUiPropertyLabels
};
