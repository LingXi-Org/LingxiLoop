// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPropertyLabels(runtime2) {
  var CHAT_ABOUT_LABEL, RESET_LABEL, resetLabelFor, MORE_ACTIONS_LABEL, addToSectionLabel, ADD_LABEL, DEFAULT_CLOSE_LABEL, TYPE_LABEL, labelWithValue, MIXED_LABEL, COLOR_LABEL, COLOR_SEARCH_LABEL, NO_COLOR_MATCHES_LABEL, IN_THIS_ARTBOARD_LABEL, IN_THESE_ARTBOARDS_LABEL, SLIDE_COLORS_LABEL, IN_THIS_DESIGN_LABEL, ALL_FONTS_LABEL, STYLE_SEARCH_LABEL, INCREASE_LABEL, DECREASE_LABEL, increaseLabelFor, decreaseLabelFor, INHERITED_LABEL, lowercaseUnlessTranslated, perPartsLabel, UNIFIED_VALUES_DISABLED_REASON, boxPartLabels, labeledPartLabels, labelPart, SELECT_SOMETHING_HINT, ratioToOneLabel, ratioOnGroundLabel, CONTRAST_PASSES_LABEL, CONTRAST_FAILS_LABEL, joinClauses, COLOR_FIX_LABEL, UNDONE_LABEL, REDONE_LABEL, NOTHING_TO_UNDO_LABEL, NOTHING_TO_REDO_LABEL, initializeUiPropertyLabels;
  function numberChangeRefusalMessage(label, unit) {
    return label !== void 0 ? unit ? (0, runtime2.formatMessage) ({
      defaultMessage: "未作更改。{name} 只接受以 {unit} 为单位的数字。",
      id: "jbNP4X54l1"
    }, { name:label, unit }) : (0, runtime2.formatMessage) ({
      defaultMessage: "未作更改。{name} 只接受数字。",
      id: "UpYEbvbR82"
    }, { name: label }) :unit ? (0, runtime2.formatMessage)({
      defaultMessage: "未作更改。此字段只接受以 {unit} 为单位的数字。",
      id: "xPAxxbXFk9"
    }, { unit }) : (0, runtime2.formatMessage)({
      defaultMessage: "未作更改。此字段只接受数字。",
      id: "6nvHq2W6u/"
    });
  }
  function partsToggleLabel(open4, kind, label, parts) {
    let lowered = lowercaseUnlessTranslated(label);
    if (parts !== void 0) {
      let loweredParts = lowercaseUnlessTranslated(parts);
      return open4 ? (0, runtime2.formatMessage)({ defaultMessage: "隐藏{label}的{parts}", id: "hH9QcDyUgZ" }, { label: lowered, parts: loweredParts }) : (0, runtime2.formatMessage)({ defaultMessage: "编辑{label}的{parts}", id: "l9NcYDRB8d" }, { label: lowered, parts: loweredParts });
    }
    return kind === "corner" ? open4 ? (0, runtime2.formatMessage)({ defaultMessage: "隐藏{label}的各角设置", id: "cavTbGrUBW" }, { label: lowered }) : (0, runtime2.formatMessage)({ defaultMessage: "编辑{label}的各角设置", id: "5XJQJvB6v6" }, { label: lowered }) : open4 ? (0, runtime2.formatMessage)({ defaultMessage: "隐藏{label}的各边设置", id: "rmYNsipb7X" }, { label: lowered }) : (0, runtime2.formatMessage)({ defaultMessage: "编辑{label}的各边设置", id: "UXRXIiXB5T" }, { label : lowered });
  }
  function additionalPassingGroundsMessage(count) {
    return count > 0 ?(0, runtime2.formatMessage) ({
      defaultMessage: "另有 {count} 个背景通过",
      id: "awLDpgEc0l"
    }, { n: count,count : String(count) }) : void 0;
  }
  function contrastResultSummary(result) {
    return result.passes ? (0, runtime2.formatMessage)({
      defaultMessage: "对比度良好，在{ground}上为 {ratio}",
      id: "HeukW1Ry3I"
    }, { ratio : result.ratio, ground: result.ground }) : (0, runtime2.formatMessage) ({
      defaultMessage: "对比度不足，在{ground}上为 {ratio}，低于 {min}",
      id: "gChosp61b4"
    }, { ratio: result.ratio, ground:result.ground, min : result.min });
  }
  function contrastResultDetails(result) {
    let failing = result.alsoFailing ?? [], joinGrounds = (first, next) => (0, runtime2.formatMessage)({ defaultMessage: "{first}和{next}", id: "LAZmtbhqVS" }, { first, next }), alsoBelow = failing.length > 0 ? (0, runtime2.formatMessage) ({
      defaultMessage: "在{grounds}上同样低于 {min}",
      id: "Qo9mqPqZ36"
    }, { min: result.min, grounds: failing.reduce(joinGrounds) }) : void 0;
    return joinClauses(joinClauses(contrastResultSummary(result), alsoBelow), additionalPassingGroundsMessage(result.alsoPassing ?? 0));
  }
  function contrastResultCountSummary(result) {
    let failing = result.alsoFailing ?? 0, alsoTooLow = failing > 0 ?(0, runtime2.formatMessage) ({
      defaultMessage: "在另外 {count} 个背景上同样过低",
      id: "c6fYa9yJjr"
    }, { n: failing, count : String(failing) }) : void 0;
    return joinClauses(joinClauses(contrastResultSummary(result), alsoTooLow), additionalPassingGroundsMessage(result.alsoPassing ?? 0));
  }
  function contrastFixDescription(fix) {
    return (0, runtime2.formatMessage)({
      defaultMessage: "将颜色改为 {hex}，在{ground}上的对比度为 {ratio}",
      id: "Q1xgpNX611"
    }, { hex: fix.hex, ratio: fix.ratio, ground: fix.ground });
  }
  return bindRuntimeValue(runtime2, "numberChangeRefusalMessage", () => numberChangeRefusalMessage), bindRuntimeValue(runtime2, "partsToggleLabel", () => partsToggleLabel), bindRuntimeValue(runtime2, "additionalPassingGroundsMessage", () => additionalPassingGroundsMessage), bindRuntimeValue(runtime2, "contrastResultSummary", () => contrastResultSummary), bindRuntimeValue(runtime2, "contrastResultDetails", () => contrastResultDetails), bindRuntimeValue(runtime2, "contrastResultCountSummary", () => contrastResultCountSummary), bindRuntimeValue(runtime2, "contrastFixDescription", () => contrastFixDescription), bindRuntimeValue(runtime2, "CHAT_ABOUT_LABEL", () => CHAT_ABOUT_LABEL), bindRuntimeValue(runtime2, "RESET_LABEL", () =>
    RESET_LABEL), bindRuntimeValue(runtime2, "resetLabelFor", () => resetLabelFor), bindRuntimeValue(runtime2, "MORE_ACTIONS_LABEL", () =>
    MORE_ACTIONS_LABEL), bindRuntimeValue(runtime2, "addToSectionLabel", () => addToSectionLabel), bindRuntimeValue(runtime2, "ADD_LABEL", () => ADD_LABEL), bindRuntimeValue(runtime2, "DEFAULT_CLOSE_LABEL", () => DEFAULT_CLOSE_LABEL), bindRuntimeValue(runtime2, "TYPE_LABEL", () => TYPE_LABEL), bindRuntimeValue(runtime2, "labelWithValue", () => labelWithValue), bindRuntimeValue(runtime2, "MIXED_LABEL", () => MIXED_LABEL), bindRuntimeValue(runtime2, "COLOR_LABEL", () => COLOR_LABEL), bindRuntimeValue(runtime2, "COLOR_SEARCH_LABEL", () => COLOR_SEARCH_LABEL), bindRuntimeValue(runtime2, "NO_COLOR_MATCHES_LABEL", () => NO_COLOR_MATCHES_LABEL), bindRuntimeValue(runtime2, "SLIDE_COLORS_LABEL", () => SLIDE_COLORS_LABEL), bindRuntimeValue(runtime2, "STYLE_SEARCH_LABEL", () => STYLE_SEARCH_LABEL), bindRuntimeValue(runtime2, "INCREASE_LABEL", () => INCREASE_LABEL), bindRuntimeValue(runtime2, "DECREASE_LABEL", () => DECREASE_LABEL), bindRuntimeValue(runtime2, "increaseLabelFor", () =>
    increaseLabelFor), bindRuntimeValue(runtime2, "decreaseLabelFor", () => decreaseLabelFor), bindRuntimeValue(runtime2, "INHERITED_LABEL", () =>
    INHERITED_LABEL), bindRuntimeValue(runtime2, "lowercaseUnlessTranslated", () =>
    lowercaseUnlessTranslated), bindRuntimeValue(runtime2, "perPartsLabel", () => perPartsLabel), bindRuntimeValue(runtime2, "UNIFIED_VALUES_DISABLED_REASON", () => UNIFIED_VALUES_DISABLED_REASON), bindRuntimeValue(runtime2, "boxPartLabels", () => boxPartLabels), bindRuntimeValue(runtime2, "labeledPartLabels", () => labeledPartLabels), bindRuntimeValue(runtime2, "labelPart", () => labelPart), bindRuntimeValue(runtime2, "SELECT_SOMETHING_HINT", () => SELECT_SOMETHING_HINT), bindRuntimeValue(runtime2, "ratioToOneLabel", () => ratioToOneLabel), bindRuntimeValue(runtime2, "ratioOnGroundLabel", () => ratioOnGroundLabel), bindRuntimeValue(runtime2, "CONTRAST_PASSES_LABEL", () => CONTRAST_PASSES_LABEL), bindRuntimeValue(runtime2, "CONTRAST_FAILS_LABEL", () => CONTRAST_FAILS_LABEL), bindRuntimeValue(runtime2, "joinClauses", () => joinClauses), bindRuntimeValue(runtime2, "COLOR_FIX_LABEL", () => COLOR_FIX_LABEL), bindRuntimeValue(runtime2, "initializeUiPropertyLabels", () => initializeUiPropertyLabels, (value) => {
    initializeUiPropertyLabels = value;
  }), () => {
    CHAT_ABOUT_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "讨论…",
      id: "LWkM8TbGUL"
    }),
    RESET_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "重置",
      id: "uC8AuMAr1G"
    }), resetLabelFor = (label) => label ? (0, runtime2.formatMessage)({ defaultMessage: "重置{label}", id: "ZrkbpTLAWj" }, { label }) : RESET_LABEL, MORE_ACTIONS_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "更多操作",
      id: "tw4tu+cROx"
    }), addToSectionLabel = (label) => (0, runtime2.formatMessage)({ defaultMessage: "添加到{section}", id: "5SpBb0/7Kb" }, { section: label }), ADD_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "添加",
      id: "CdiY+oU7MK"
    }), DEFAULT_CLOSE_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "关闭",
      id: "uc0LFOfvqq"
    }), TYPE_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "类型",
      id: "npqQ4KlxxD"
    }), labelWithValue = (label, value) => (0, runtime2.formatMessage)({ defaultMessage: "{label}：{value}", id: "KFgBpRrXro" }, { label, value }), MIXED_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "混合",
      id: "47BT/trNm6"
    }), COLOR_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "颜色",
      id: "O9fADBbGrn"
    }), COLOR_SEARCH_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "搜索颜色",
      id: "vqlqNDdtM5"
    }), NO_COLOR_MATCHES_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "无匹配项",
      id: "CYdEyxcXEH"
    }), IN_THIS_ARTBOARD_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "此画板中",
      id: "TYBXt+mvWi"
    }), IN_THESE_ARTBOARDS_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "这些画板中",
      id: "JJeV+pvHXA"
    }), SLIDE_COLORS_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "当前幻灯片",
      id: "op/ir28ocK"
    }), IN_THIS_DESIGN_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "此设计中",
      id: "BWseCCjsoZ"
    }), ALL_FONTS_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "所有字体",
      id: "ppESCFQ3Px"
    }), STYLE_SEARCH_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "搜索样式",
      id: "buYtcuctK4"
    }), INCREASE_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "增加",
      id: "NbN0euR9U+"
    }), DECREASE_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "减少",
      id: "umGNPuJ0RM"
    }), increaseLabelFor = (name) => name ? (0, runtime2.formatMessage)({ defaultMessage: "增大{name}", id: "em8QZXy0r8" }, { name }) : INCREASE_LABEL, decreaseLabelFor = (name) => name ? (0, runtime2.formatMessage)({ defaultMessage: "减小{name}", id: "v0hgjhuYFL" }, { name }) : DECREASE_LABEL, INHERITED_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "继承",
      id: "U1QCVqSkR3"
    }), lowercaseUnlessTranslated = (label) => (0, runtime2.pageMessagesLanguage)() === void 0 ? label.toLowerCase() : label, perPartsLabel = (kind) => kind === "corner" ? (0, runtime2.formatMessage)({
      defaultMessage: "分别设置圆角",
      id: "HzJqC4yFlL"
    }) : (0, runtime2.formatMessage)({
      defaultMessage: "分别设置各边",
      id: "7VuvkfGGhO"
    }), UNIFIED_VALUES_DISABLED_REASON = (0, runtime2.formatMessage)({
      defaultMessage: "数值不同，统一数值后可使用一个输入框编辑",
      id: "YALxCHZb1v"
    }), boxPartLabels = (kind) => kind === "corner" ? [
      (0, runtime2.formatMessage)({
        defaultMessage: "左上",
        id: "8RqJS+cCy6"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "右上",
        id: "pwpEuRwSR+"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "右下",
        id: "IwS0Yb+Zqh"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "左下",
        id: "hhU+Aothwk"
      })
    ] : [
      (0, runtime2.formatMessage)({
        defaultMessage: "上",
        id: "ysxfTargNx"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "右",
        id: "c+1t8cg/4Z"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "下",
        id: "8LOaPwiGBX"
      }),
      (0, runtime2.formatMessage)({
        defaultMessage: "左",
        id: "y+qz2GG7/x"
      })
    ], labeledPartLabels = (kind, label) => kind === "corner" ? [
      (0, runtime2.formatMessage)({ defaultMessage: "{label}左上", id: "S2y3BFFeVm" }, { label }),
      (0, runtime2.formatMessage)({ defaultMessage: "{label}右上", id: "gmJsdqFBfA" }, { label }),
      (0, runtime2.formatMessage)({ defaultMessage: "{label}右下", id: "K1it3/YmaQ" }, { label }),
      (0, runtime2.formatMessage)({ defaultMessage: "{label}左下", id: "aXMPzPJ76c" }, { label })
    ] : [
      (0, runtime2.formatMessage)({ defaultMessage: "{label}上", id: "zVJRtlm7X3" }, { label }),
      (0, runtime2.formatMessage)({ defaultMessage: "{label}右", id: "E5jKBfpT2r" }, { label }),
      (0, runtime2.formatMessage)({ defaultMessage: "{label}下", id: "C+N+TTJ0Uf" }, { label }),
      (0, runtime2.formatMessage)({ defaultMessage: "{label}左", id: "vZEhXZiENM" }, { label })
    ], labelPart = (label, part) => (0, runtime2.formatMessage)({ defaultMessage: "{label}{part}", id: "Mls7eCd0Ol" }, { label, part: lowercaseUnlessTranslated(part) }), SELECT_SOMETHING_HINT = (0, runtime2.formatMessage)({
      defaultMessage: "在画布上选择对象以查看其属性。",
      id: "KtdOxUtVYj"
    }), ratioToOneLabel = (figure) => (0, runtime2.formatMessage)({ defaultMessage: "{figure} : 1", id: "1m1EKfbKf9" }, { figure }), ratioOnGroundLabel = (ratio, ground) => (0, runtime2.formatMessage)({ defaultMessage: "在{ground}上为 {ratio}", id: "TuyCasSrnv" }, { ratio, ground }), CONTRAST_PASSES_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "对比度良好",
      id: "ylGIDhHpbY"
    }), CONTRAST_FAILS_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "对比度不足",
      id: "2gnySVfZWn"
    }), joinClauses = (first, next) => next === void 0 ? first : (0, runtime2.formatMessage)({ defaultMessage: "{first}；{next}", id: "HPzviZevWw" }, { first, next }), COLOR_FIX_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "请选择易于辨认的颜色",
      id: "QQg1S3RBhA"
    }), UNDONE_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "已撤销",
      id: "agI0nIPay3"
    }), REDONE_LABEL =(0, runtime2.formatMessage)( {
      defaultMessage: "已重做",
      id: "q/ONqJmjyw"
    }), NOTHING_TO_UNDO_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "没有可撤销的操作",
      id: "fU13Dfuc/0"
    }), NOTHING_TO_REDO_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "暂无可重做的操作",
      id: "r9DoYi/Hm8"
    }), initializeUiPropertyLabels = (0, runtime2.initializeOnce)(() => {
    });
  };
}
export {
  installUiPropertyLabels
};
