// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModelTypeScales(runtime2) {
  var anthropicTypeScale, neutralTypeScale, namedSlideColors, initializeSlideTypeScales;
  return bindRuntimeValue(runtime2, "anthropicTypeScale", () => anthropicTypeScale, (value) => {
    anthropicTypeScale = value;
  }), bindRuntimeValue(runtime2, "neutralTypeScale", () => neutralTypeScale, (value) => {
    neutralTypeScale = value;
  }), bindRuntimeValue(runtime2, "namedSlideColors", () => namedSlideColors, (value) => {
    namedSlideColors = value;
  }), bindRuntimeValue(runtime2, "initializeSlideTypeScales", () => initializeSlideTypeScales, (value) => {
    initializeSlideTypeScales = value;
  }), () => {
    initializeSlideTypeScales = (0, runtime2.initializeOnce)(() => {
      anthropicTypeScale = {
        display: {
          fontSize: 128,
          fontWeight: 300,
          lineHeight: 1.15,
          serifDisplay: !0
        },
        h1: {
          fontSize: 112,
          fontWeight: 300,
          lineHeight: 1.2,
          serifDisplay: !0
        },
        h2: {
          fontSize: 96,
          fontWeight: 300,
          lineHeight: 1.2,
          serifDisplay: !0
        },
        h3: {
          fontSize: 72,
          fontWeight: 300,
          lineHeight: 1.2,
          serifDisplay: !0
        },
        lead: {
          fontSize: 44,
          fontWeight: 430,
          lineHeight: 1.4
        },
        eyebrow: {
          fontSize: 36,
          fontWeight: 500,
          lineHeight: 1.2
        },
        body: {
          fontSize: 32,
          fontWeight: 430,
          lineHeight: 1.4
        },
        caption: {
          fontSize: 24,
          fontWeight: 430,
          lineHeight: 1.4
        }
      }, neutralTypeScale = {
        display: {
          fontSize: 128,
          fontWeight: 600,
          lineHeight: 1.05
        },
        h1: {
          fontSize: 96,
          fontWeight: 600,
          lineHeight: 1.1
        },
        h2: {
          fontSize: 64,
          fontWeight: 600,
          lineHeight: 1.15
        },
        h3: {
          fontSize: 44,
          fontWeight: 600,
          lineHeight: 1.2
        },
        lead: {
          fontSize: 40,
          fontWeight: 400,
          lineHeight: 1.35
        },
        eyebrow: {
          fontSize: 24,
          fontWeight: 600,
          lineHeight: 1.2
        },
        body: {
          fontSize: 32,
          fontWeight: 400,
          lineHeight: 1.4
        },
        caption: {
          fontSize: 24,
          fontWeight: 400,
          lineHeight: 1.4
        }
      }, namedSlideColors = {
        slate: "#141413",
        ivory: "#FAF9F5",
        "ivory-warm": "#F5F4ED",
        clay: "#D97757",
        oat: "#E3DACC",
        white: "#FFFFFF",
        "text-secondary": "#3D3D3A",
        "text-tertiary": "#73726C"
      };
    });
  };
}
export {
  installModelTypeScales
};
