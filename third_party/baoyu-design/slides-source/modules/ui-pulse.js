// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPulse(runtime2) {
  var PulseJsx, initializePulse;
  function Pulse({ color = "var(--cds-fill-accent)", animate = !0, hollow = !1, className }) {
    return PulseJsx.jsx("span", {
      "data-cds": "Pulse",
      className: (0, runtime2.cn)("block size-[calc(0.375rem*var(--cds-rem-scale,1))] rounded-full", animate ? "motion-safe:animate-pulse" : "", className),
      style: hollow ? {
        boxShadow: `inset 0 0 0 1px ${color}, 0 0 0 0.5px var(--cds-page-bg)`
      } : {
        background: color,
        boxShadow: "0 0 0 0.5px var(--cds-page-bg)"
      }
    });
  }
  return bindRuntimeValue(runtime2, "Pulse", () => Pulse), bindRuntimeValue(runtime2, "PulseJsx", () => PulseJsx, (value) => {
    PulseJsx = value;
  }), bindRuntimeValue(runtime2, "initializePulse", () => initializePulse, (value) => {
    initializePulse = value;
  }), () => {
    initializePulse = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), PulseJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    });
  };
}
export {
  installUiPulse
};
