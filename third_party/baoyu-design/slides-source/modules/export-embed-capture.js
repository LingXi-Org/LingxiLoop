// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportEmbedCapture(runtime2) {
  var embedCaptureScale, maxEmbedCaptureEdge, embedCaptureTimeoutMs, embedCaptureSettleMs, embedCaptureDeadlineMs, embedCaptureBatchSize, initializeEmbedCapture;
  function embedCaptureDimensions(width, height2) {
    let scale = Math.min(embedCaptureScale, maxEmbedCaptureEdge / Math.max(1, Math.max(width, height2)));
    return {
      w: Math.max(1, Math.round(width * scale)),
      h: Math.max(1, Math.round(height2 * scale))
    };
  }
  async function captureHtmlEmbeds(requests) {
    let captures = /* @__PURE__ */ new Map(), validRequests = requests.filter((input) => input.html !== "" && input.w > 0 && input.h > 0);
    if (validRequests.length === 0 || typeof document > "u" || ((0, runtime2.installEmbedRuntimeGuard)(runtime2.slideEmbedGuardConfig), (0, runtime2.embedsDisabled)(runtime2.slideEmbedGuardConfig)))
      return captures;
    let captureLease = await !1;
    try {
      captureLease.clear && await captureEmbedFramesOffscreen(captures, validRequests);
    } finally {
      captureLease.done();
    }
    return captures;
  }
  async function captureEmbedFramesOffscreen(requests, captureLease) {
    let value = document.createElement("div");
    value.style.cssText = "position:fixed;left:0;top:0;z-index:-1;opacity:0;pointer-events:none;", document.body.appendChild(value);
    let items = [], value2 = (0, runtime2.subscribeEmbedsDisabled)(runtime2.slideEmbedGuardConfig, () => {
      for (let value3 of items)
        value3.failed = !0, value3.mounted.dispose();
    }), callback = (input) => {
      let value3 = document.createElement("div");
      value3.style.cssText = "position:absolute;left:0;top:0;width:" + String(input.w) + "px;height:" + String(input.h) + "px;", value.appendChild(value3);
      let state = {
        req: input,
        mounted: null,
        // assigned right below, before anything reads it
        wrapper: value3,
        failed: !1
      };
      return state.mounted = (0, runtime2.createEmbedFrame)({
        html: input.html,
        allowScripts: runtime2.allowEmbedScripts,
        markerAttr: runtime2.htmlEmbedMarkerAttribute,
        title: "导出渲染（沙箱隔离的网页内容）",
        renderTimeoutMs: embedCaptureDeadlineMs,
        onNavigated: () => {
          state.failed = !0, state.mounted.dispose();
        }
      }), value3.appendChild(state.mounted.iframe), items.push(state), state;
    }, callback2 = async (input) => {
      try {
        if (input.failed || !input.mounted.host.ready)
          return;
        let value3 = embedCaptureDimensions(input.req.w, input.req.h), value4 = await input.mounted.host.render(0, {}, value3.w, value3.h);
        if (value4 === null || input.failed)
          return;
        let value5 = document.createElement("canvas");
        value5.width = value4.width, value5.height = value4.height;
        let value6 = value5.getContext("2d");
        if (value6 === null)
          return;
        let value7 = value6.createImageData(value4.width, value4.height);
        value7.data.set(value4.pixels), value6.putImageData(value7, 0, 0), requests.set(input.req.key, {
          dataUri: value5.toDataURL("image/png"),
          w: value4.width,
          h: value4.height
        });
      } catch {
      }
    };
    try {
      for (let index4 = 0; index4 < captureLease.length && !(0, runtime2.embedsDisabled)(runtime2.slideEmbedGuardConfig); index4 += embedCaptureBatchSize) {
        let value3 = captureLease.slice(index4, index4 + embedCaptureBatchSize).map(callback), value4 = Date.now() + embedCaptureTimeoutMs;
        await Promise.all(value3.map(async (input) => {
          for (; !input.mounted.host.ready && !input.failed && Date.now() < value4; )
            await new Promise((input2) => setTimeout(input2, 50));
        })), await new Promise((input) => setTimeout(input, embedCaptureSettleMs)), await Promise.all(value3.map(callback2));
        for (let value5 of value3)
          value5.mounted.dispose(), value5.wrapper.remove();
      }
    } finally {
      value2();
      for (let value3 of items)
        value3.mounted.dispose();
      value.remove();
    }
  }
  return bindRuntimeValue(runtime2, "embedCaptureDimensions", () => embedCaptureDimensions), bindRuntimeValue(runtime2, "captureHtmlEmbeds", () => captureHtmlEmbeds), bindRuntimeValue(runtime2, "captureEmbedFramesOffscreen", () => captureEmbedFramesOffscreen), bindRuntimeValue(runtime2, "embedCaptureScale", () => embedCaptureScale, (value) => {
    embedCaptureScale = value;
  }), bindRuntimeValue(runtime2, "maxEmbedCaptureEdge", () => maxEmbedCaptureEdge, (value) => {
    maxEmbedCaptureEdge = value;
  }), bindRuntimeValue(runtime2, "embedCaptureTimeoutMs", () => embedCaptureTimeoutMs, (value) => {
    embedCaptureTimeoutMs = value;
  }), bindRuntimeValue(runtime2, "embedCaptureSettleMs", () => embedCaptureSettleMs, (value) => {
    embedCaptureSettleMs = value;
  }), bindRuntimeValue(runtime2, "embedCaptureDeadlineMs", () => embedCaptureDeadlineMs, (value) => {
    embedCaptureDeadlineMs = value;
  }), bindRuntimeValue(runtime2, "embedCaptureBatchSize", () => embedCaptureBatchSize, (value) => {
    embedCaptureBatchSize = value;
  }), bindRuntimeValue(runtime2, "initializeEmbedCapture", () => initializeEmbedCapture, (value) => {
    initializeEmbedCapture = value;
  }), () => {
    embedCaptureScale = 2, maxEmbedCaptureEdge = 4096, embedCaptureTimeoutMs = 3e3, embedCaptureSettleMs = 250, embedCaptureDeadlineMs = 4e3, embedCaptureBatchSize = 8, initializeEmbedCapture = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeEmbeds)(), (0, runtime2.initializeSlideRenderer)();
    });
  };
}
export {
  installExportEmbedCapture
};
