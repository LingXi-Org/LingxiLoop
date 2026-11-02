// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDocumentsStashRecoveryMessage(runtime2) {
  var STASH_DISCARD_LABEL;
  function stashedSlideRestoreConfirmation(context) {
    if (context.gone && context.moved)
      return {
        message: (0, runtime2.formatMessage)({
          defaultMessage: "使用未保存的编辑恢复已删除的幻灯片？",
          id: "Fjklh0goq7"
        }),
        discardLabel: STASH_DISCARD_LABEL
      };
    let slideNo = String(context.slideNo);
    return context.moved ? {
      message: context.slideNo > 0 ? (0, runtime2.formatMessage)({
        defaultMessage: "第 {n} 页已有更新，恢复未保存的编辑将覆盖较新版本。",
        id: "E3ITRcC+nK"
      }, {
        n: slideNo
      }) : (0, runtime2.formatMessage)({
        defaultMessage: "这张已移出文稿的幻灯片已有更新，恢复未保存的编辑将覆盖较新版本。",
        id: "5HRmJmddk3"
      }),
      discardLabel: (0, runtime2.formatMessage)({
        defaultMessage: "保留较新版本",
        id: "7FO4NJilhy"
      })
    } : {
      message: context.slideNo > 0 ? (0, runtime2.formatMessage)({
        defaultMessage: "恢复第 {n} 页未保存的编辑？",
        id: "rI/LYv0Ejz"
      }, {
        n: slideNo
      }) : (0, runtime2.formatMessage)({
        defaultMessage: "恢复已移出文稿的幻灯片上未保存的编辑？",
        id: "Z80iCb9Lx3"
      }),
      discardLabel: STASH_DISCARD_LABEL
    };
  }
  return bindRuntimeValue(runtime2, "STASH_DISCARD_LABEL", () => STASH_DISCARD_LABEL, (value) => {
    STASH_DISCARD_LABEL = value;
  }), bindRuntimeValue(runtime2, "stashedSlideRestoreConfirmation", () => stashedSlideRestoreConfirmation), () => {
    STASH_DISCARD_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "放弃",
      id: "Syf7OOpAC2"
    });
  };
}
export {
  installDocumentsStashRecoveryMessage
};
