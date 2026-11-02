// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDeliveryLabels(runtime2) {
  function megabytesLabel(size4) {
    return (0, runtime2.formatMessage)({ defaultMessage: "{size} MB", id: "d7S29PX/tK" }, { size: size4 });
  }
  function kilobytesLabel(size4) {
    return (0, runtime2.formatMessage)({ defaultMessage: "{size} KB", id: "jDAZMKmBAt" }, { size: size4 });
  }
  function joinMessages(first, second) {
    return (0, runtime2.formatMessage)({ defaultMessage: "{first} {second}", id: "8U4f+v7Rxv" }, { first, second });
  }
  function formatFileSize(bytes) {
    let locale = (0, runtime2.intlLocale)("NumberFormat", "en-US");
    return bytes >= 1048576 ? megabytesLabel((Math.ceil(bytes / 1048576 * 10) / 10).toLocaleString(locale, { maximumFractionDigits: 1, useGrouping: !1 })) : kilobytesLabel(Math.ceil(bytes / 1024).toLocaleString(locale, {
      useGrouping: !1
    }));
  }
  return bindRuntimeValue(runtime2, "doneLabel", () => (0, runtime2.formatMessage)({ defaultMessage: "完成", id: "xwnTsV1myS" })), bindRuntimeValue(runtime2, "megabytesLabel", () => megabytesLabel), bindRuntimeValue(runtime2, "kilobytesLabel", () => kilobytesLabel), bindRuntimeValue(runtime2, "joinMessages", () => joinMessages), bindRuntimeValue(runtime2, "formatFileSize", () => formatFileSize), () => {
  };
}
export {
  installDeliveryLabels
};
