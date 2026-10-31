// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorSlideMessages(runtime2) {
  var SPEAKER_NOTES_LABEL, NO_SPEAKER_NOTES_MESSAGE, SPEAKER_NOTES_DESCRIPTION, SHOW_SPEAKER_NOTES_LABEL, HIDE_SPEAKER_NOTES_LABEL, PREVIOUS_SLIDE_LABEL, NEXT_SLIDE_LABEL, formatSlidePositionLabel, HELD_SLIDE_MESSAGE, MOVE_SEVERAL_SLIDES_REASON, COPY_SLIDE_LINK_LABEL, FIRST_SLIDE_LABEL, LAST_SLIDE_LABEL, HELD_SLIDE_EDIT_MESSAGE;
  return bindRuntimeValue(runtime2, "SPEAKER_NOTES_LABEL", () => SPEAKER_NOTES_LABEL), bindRuntimeValue(runtime2, "NO_SPEAKER_NOTES_MESSAGE", () => NO_SPEAKER_NOTES_MESSAGE), bindRuntimeValue(runtime2, "SPEAKER_NOTES_DESCRIPTION", () => SPEAKER_NOTES_DESCRIPTION), bindRuntimeValue(runtime2, "SHOW_SPEAKER_NOTES_LABEL", () => SHOW_SPEAKER_NOTES_LABEL), bindRuntimeValue(runtime2, "HIDE_SPEAKER_NOTES_LABEL", () => HIDE_SPEAKER_NOTES_LABEL), bindRuntimeValue(runtime2, "PREVIOUS_SLIDE_LABEL", () => PREVIOUS_SLIDE_LABEL), bindRuntimeValue(runtime2, "NEXT_SLIDE_LABEL", () => NEXT_SLIDE_LABEL), bindRuntimeValue(runtime2, "formatSlidePositionLabel", () => formatSlidePositionLabel), bindRuntimeValue(runtime2, "HELD_SLIDE_MESSAGE", () => HELD_SLIDE_MESSAGE), bindRuntimeValue(runtime2, "MOVE_SEVERAL_SLIDES_REASON", () => MOVE_SEVERAL_SLIDES_REASON), bindRuntimeValue(runtime2, "COPY_SLIDE_LINK_LABEL", () => COPY_SLIDE_LINK_LABEL), bindRuntimeValue(runtime2, "FIRST_SLIDE_LABEL", () => FIRST_SLIDE_LABEL), bindRuntimeValue(runtime2, "LAST_SLIDE_LABEL", () => LAST_SLIDE_LABEL), bindRuntimeValue(runtime2, "HELD_SLIDE_EDIT_MESSAGE", () => HELD_SLIDE_EDIT_MESSAGE), () => {
    SPEAKER_NOTES_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "演讲者备注",
      id: "wOBsrGpQ+G"
    }), NO_SPEAKER_NOTES_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此页没有备注。",
      id: "KKsmxm2BqJ"
    }), SPEAKER_NOTES_DESCRIPTION = (0, runtime2.formatMessage)({
      defaultMessage: "演讲者备注不会显示在幻灯片上。",
      id: "mt3hWuTwsC"
    }), SHOW_SPEAKER_NOTES_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "显示演讲者备注",
      id: "qyRV+O5zh/"
    }), HIDE_SPEAKER_NOTES_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "隐藏演讲者备注",
      id: "oJn6AxY6XN"
    }), PREVIOUS_SLIDE_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "上一页",
      id: "RAC0z3rueN"
    }), NEXT_SLIDE_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "下一页",
      id: "Bsd19FvMud"
    }), formatSlidePositionLabel = (index4, count) => (0, runtime2.formatMessage)({
      defaultMessage: "第 {n} / {count} 页",
      id: "od7Ph2VuvE"
    }, {
      n: String(index4 + 1),
      count: String(count)
    }), HELD_SLIDE_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "请先修复已保存的内容，再进行编辑",
      id: "hP1WzcqMMV"
    }), MOVE_SEVERAL_SLIDES_REASON = (0, runtime2.formatMessage)({
      defaultMessage: "拖动以移动多张幻灯片",
      id: "Lv++GmhFLL"
    }), COPY_SLIDE_LINK_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "复制此页链接",
      id: "7YeuLjtsBz"
    }), FIRST_SLIDE_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "第一页",
      id: "Dxhw6LOzAg"
    }), LAST_SLIDE_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "最后一页",
      id: "NprfXvNHw4"
    }), HELD_SLIDE_EDIT_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "请先修复此页已保存的内容，再进行编辑。",
      id: "FxwKUvTxcE"
    });
  };
}
export {
  installEditorSlideMessages
};
