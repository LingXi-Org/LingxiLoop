// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDeliveryBrowserDownload(runtime2) {
  function downloadBlobInBrowser(blob, filename) {
    let url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url, anchor.download = filename, document.body.appendChild(anchor), anchor.click(), anchor.remove(), setTimeout(() => URL.revokeObjectURL(url), 6e4);
  }
  return bindRuntimeValue(runtime2, "downloadBlobInBrowser", () => downloadBlobInBrowser), () => {
  };
}
export {
  installDeliveryBrowserDownload
};
