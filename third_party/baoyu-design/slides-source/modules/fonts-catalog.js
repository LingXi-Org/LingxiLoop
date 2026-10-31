// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFontsCatalog(runtime2) {
  var webSafeFontCatalog, googleFontCatalog, fontFamilyChoices, knownFontFamilyMap, defaultGoogleFontWeights, loadableFontFamilyPattern, webSafeFontFamilyPattern, initializeFontCatalog;
  function knownFontFamily(family) {
    return knownFontFamilyMap.get(family.trim().toLowerCase());
  }
  function googleFontStylesheetUrl_MG0(family) {
    let font = knownFontFamily(family), weightQuery = font ? ":wght@" + (font.weights ?? [400, 500, 600, 700]).join(";") : "";
    return "https://fonts.googleapis.com/css2?family=" + (font?.family ?? family.trim()).replace(/ +/g, "+") + weightQuery + "&display=swap";
  }
  function ensureGoogleFonts(families, document2 = document) {
    for (let value of families) {
      if (webSafeFontFamilyPattern.test(value) || !loadableFontFamilyPattern.test(value))
        continue;
      let value2 = googleFontStylesheetUrl_MG0(value);
      if (document2.head.querySelector('link[href="' + value2 + '"]'))
        continue;
      let value3 = document2.createElement("link");
      value3.rel = "stylesheet", value3.href = value2, document2.head.appendChild(value3);
    }
  }
  return bindRuntimeValue(runtime2, "knownFontFamily", () => knownFontFamily), bindRuntimeValue(runtime2, "googleFontStylesheetUrl_MG0", () => googleFontStylesheetUrl_MG0), bindRuntimeValue(runtime2, "ensureGoogleFonts", () => ensureGoogleFonts), bindRuntimeValue(runtime2, "webSafeFontCatalog", () => webSafeFontCatalog, (value) => {
    webSafeFontCatalog = value;
  }), bindRuntimeValue(runtime2, "googleFontCatalog", () => googleFontCatalog, (value) => {
    googleFontCatalog = value;
  }), bindRuntimeValue(runtime2, "fontFamilyChoices", () => fontFamilyChoices, (value) => {
    fontFamilyChoices = value;
  }), bindRuntimeValue(runtime2, "knownFontFamilyMap", () => knownFontFamilyMap, (value) => {
    knownFontFamilyMap = value;
  }), bindRuntimeValue(runtime2, "defaultGoogleFontWeights", () => defaultGoogleFontWeights, (value) => {
    defaultGoogleFontWeights = value;
  }), bindRuntimeValue(runtime2, "loadableFontFamilyPattern", () => loadableFontFamilyPattern, (value) => {
    loadableFontFamilyPattern = value;
  }), bindRuntimeValue(runtime2, "webSafeFontFamilyPattern", () => webSafeFontFamilyPattern, (value) => {
    webSafeFontFamilyPattern = value;
  }), bindRuntimeValue(runtime2, "initializeFontCatalog", () => initializeFontCatalog, (value) => {
    initializeFontCatalog = value;
  }), () => {
    initializeFontCatalog = (0, runtime2.initializeOnce)(() => {
      webSafeFontCatalog = [
        {
          family: "Arial",
          generic: "sans"
        },
        {
          family: "Helvetica",
          generic: "sans"
        },
        {
          family: "Georgia",
          generic: "serif"
        },
        {
          family: "Times New Roman",
          generic: "serif"
        },
        {
          family: "Garamond",
          generic: "serif"
        },
        {
          family: "Courier New",
          generic: "mono"
        },
        {
          family: "Verdana",
          generic: "sans"
        },
        {
          family: "Tahoma",
          generic: "sans"
        },
        {
          family: "Trebuchet MS",
          generic: "sans"
        }
      ], googleFontCatalog = [
        {
          family: "Inter",
          generic: "sans",
          wght: [100, 900],
          italic: !0
        },
        {
          family: "Roboto",
          generic: "sans",
          weights: [400, 500, 700],
          wght: [100, 900],
          italic: !0
        },
        {
          family: "Open Sans",
          generic: "sans",
          wght: [300, 800],
          italic: !0
        },
        {
          family: "Lato",
          generic: "sans",
          weights: [400, 700],
          statics: [100, 300, 400, 700, 900],
          italic: !0
        },
        {
          family: "Montserrat",
          generic: "sans",
          wght: [100, 900],
          italic: !0
        },
        {
          family: "Poppins",
          generic: "sans",
          statics: [100, 200, 300, 400, 500, 600, 700, 800, 900],
          italic: !0
        },
        {
          family: "Raleway",
          generic: "sans",
          wght: [100, 900],
          italic: !0
        },
        {
          family: "Nunito",
          generic: "sans",
          wght: [200, 1e3],
          italic: !0
        },
        {
          family: "Playfair Display",
          generic: "serif",
          wght: [400, 900],
          italic: !0
        },
        {
          family: "Merriweather",
          generic: "serif",
          weights: [400, 700],
          wght: [300, 900],
          italic: !0
        },
        {
          family: "Work Sans",
          generic: "sans",
          wght: [100, 900],
          italic: !0
        },
        {
          family: "DM Sans",
          generic: "sans",
          wght: [100, 1e3],
          italic: !0
        },
        {
          family: "Manrope",
          generic: "sans",
          wght: [200, 800],
          italic: !1
        },
        {
          family: "Space Grotesk",
          generic: "sans",
          wght: [300, 700],
          italic: !1
        },
        {
          family: "Lora",
          generic: "serif",
          wght: [400, 700],
          italic: !0
        },
        {
          family: "Bebas Neue",
          generic: "sans",
          weights: [400],
          statics: [400],
          italic: !1
        },
        {
          family: "Caveat",
          generic: "sans",
          wght: [400, 700],
          italic: !1
        }
      ], fontFamilyChoices = googleFontCatalog.map((input) => input.family), knownFontFamilyMap = new Map(googleFontCatalog.map((input) => [
        input.family.toLowerCase(),
        input
      ])), defaultGoogleFontWeights = Object.fromEntries(googleFontCatalog.map((input) => [
        input.family.toLowerCase(),
        {
          ...input.wght !== void 0 ? {
            wght: input.wght
          } : {
            statics: input.statics ?? [400]
          },
          italic: input.italic
        }
      ])), loadableFontFamilyPattern = /^[A-Za-z0-9][A-Za-z0-9 ]*$/, webSafeFontFamilyPattern = /^(?:ui-)?(?:serif|sans-serif|monospace|rounded|cursive|fantasy|system-ui|math|emoji|fangsong)$/;
    });
  };
}
export {
  installFontsCatalog
};
