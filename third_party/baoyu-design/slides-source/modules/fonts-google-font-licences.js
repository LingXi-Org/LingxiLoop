// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFontsGoogleFontLicences(runtime2) {
  var knownLicences, listFiles, defaultListRetryDelays, listRetryDelays, listFetchTimeoutMs, listLoadTimeoutMs, loadsByDir, failedAtByDir, failureCooldownMs, GOOGLE_FONT_LISTS_DIR, initializeGoogleFontLicences;
  function familyKey(family) {
    return family.toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function commentSafe(text) {
    return text.replace(/--+(!?)>/g, "- $1>").replace(/<!-/g, "< !-").replace(/^(-?)>/, "$1 >");
  }
  async function decodeGzipBase64Json(base64) {
    return new Response(new Blob([Uint8Array.from(atob(base64), (input) => input.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
  }
  function familyLookup(families) {
    let byKey = new Map(families.map((input) => [familyKey(input), input]));
    return (input) => typeof input == "string" && /^[\x20-\x7e]{1,64}$/.test(input) ? byKey.get(familyKey(input)) : void 0;
  }
  function noticesOf(table, families) {
    return new Map(families.flatMap((family) => {
      if (!Object.hasOwn(table.families, family))
        return [];
      let [textIndex, copyright] = table.families[family];
      return [
        [
          family,
          {
            licence: table.texts[textIndex][0],
            notice: copyright + `

` + table.texts[textIndex][1]
          }
        ]
      ];
    }));
  }
  function readLicenceLists(families, reserved, notices) {
    let isStringList = (input) => Array.isArray(input) && input.every((value) => typeof value == "string"), reservedFamilies = typeof reserved == "object" && reserved !== null ? reserved.families : void 0, isRecord2 = (input) => typeof input == "object" && input !== null && !Array.isArray(input), table = notices, textsValid = Array.isArray(table.texts) && table.texts.every((input) => Array.isArray(input) && knownLicences.includes(input[0]) && typeof input[1] == "string"), familiesValid = isRecord2(table.families) && Object.values(table.families).every((input) => Array.isArray(input) && Number.isInteger(input[0]) && table.texts[input[0]] !== void 0 && typeof input[1] == "string");
    if (!isStringList(families) || !isStringList(reservedFamilies) || !textsValid || !familiesValid)
      throw Error("licence lists malformed");
    let checked5 = table, listed = familyLookup(families), reservedSet = new Set(reservedFamilies);
    return {
      listed,
      cleared: (input) => {
        let family = listed(input);
        return family !== void 0 && !reservedSet.has(family) && Object.hasOwn(checked5.families, family) ? family : void 0;
      },
      noticesOf: (input) => noticesOf(checked5, input)
    };
  }
  async function fetchListFile(url) {
    let attempt = () => fetch(url, {
      credentials: "same-origin",
      signal: AbortSignal.timeout(listFetchTimeoutMs)
    }).catch((error) => error instanceof Error && error.name === "TimeoutError" ? "timeout" : "failed"), answer = await attempt(), timedOut = answer === "timeout";
    for (let [index4, delay] of listRetryDelays.entries()) {
      let denied = typeof answer != "string" && (answer.status === 401 || answer.status === 403);
      if (!denied && typeof answer != "string" && answer.status < 500 || index4 > 0 && (timedOut || !denied))
        break;
      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      }), answer = await attempt(), timedOut ||= answer === "timeout";
    }
    if (typeof answer == "string")
      throw Error("fetch " + answer);
    if (!answer.ok)
      throw Error("fetch " + String(answer.status));
    return answer.json();
  }
  async function loadGoogleFontLicences(options) {
    let get = options.get ?? fetchListFile, load = async () => {
      let [families, reserved, notices] = await Promise.all([listFiles.families, listFiles.reserved, listFiles.notices].map((input) => get(options.dir + input))), gzip = typeof notices == "object" && notices !== null ? notices.gzip : void 0;
      if (typeof gzip != "string")
        throw Error("notices malformed");
      return readLicenceLists(families, reserved, await decodeGzipBase64Json(gzip));
    };
    if (options.get === void 0 && !loadsByDir.has(options.dir) && Date.now() - (failedAtByDir.get(options.dir) ?? 0) < failureCooldownMs)
      return null;
    let timer, waitMs = options.deadline === void 0 ? listLoadTimeoutMs : Math.max(0, options.deadline - Date.now()), timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), waitMs);
    });
    try {
      let pending = options.get === void 0 ? loadsByDir.get(options.dir) : void 0;
      pending === void 0 && (pending = load(), options.get === void 0 && loadsByDir.set(options.dir, pending));
      let current = pending;
      return pending.catch(() => {
        loadsByDir.get(options.dir) === current && (loadsByDir.delete(options.dir), failedAtByDir.set(options.dir, Date.now()));
      }), await Promise.race([pending, timeout]);
    } catch {
      return null;
    } finally {
      timer !== void 0 && clearTimeout(timer);
    }
  }
  function googleFontNoticeText(preamble, notices) {
    return notices.size === 0 ? "" : preamble + `

` + [...notices].map(([family, value]) => family + `

` + value.notice.trim() + `
`).join(`
`);
  }
  function fontFamilyListPhrase(families) {
    return families.length === 1 ? "the font " + String(families[0]) + " is" : "the fonts " + families.slice(0, -1).join(", ") + " and " + String(families[families.length - 1]) + " are";
  }
  function heldBackFontsNote(families, kind = "link") {
    let single = families.length === 1, effect = kind === "link" ? (single ? "its text keeps that typeface" : "their text keeps those typefaces") + " only while online" : (single ? "its" : "their") + " text uses a fallback font";
    return fontFamilyListPhrase(families) + " not included in the file, for licensing reasons; " + effect;
  }
  function fontNoticeComment(text) {
    return text === "" ? "" : `<!--
` + commentSafe(text) + `
-->
`;
  }
  return bindRuntimeValue(runtime2, "loadGoogleFontLicences", () => loadGoogleFontLicences), bindRuntimeValue(runtime2, "googleFontNoticeText", () => googleFontNoticeText), bindRuntimeValue(runtime2, "heldBackFontsNote", () => heldBackFontsNote), bindRuntimeValue(runtime2, "fontNoticeComment", () => fontNoticeComment), bindRuntimeValue(runtime2, "fontFamilyListPhrase", () => fontFamilyListPhrase), bindRuntimeValue(runtime2, "GOOGLE_FONT_LISTS_DIR", () => GOOGLE_FONT_LISTS_DIR, (value) => {
    GOOGLE_FONT_LISTS_DIR = value;
  }), bindRuntimeValue(runtime2, "initializeGoogleFontLicences", () => initializeGoogleFontLicences, (value) => {
    initializeGoogleFontLicences = value;
  }), () => {
    listFetchTimeoutMs = 8e3, listLoadTimeoutMs = 15e3, failureCooldownMs = 1e4, initializeGoogleFontLicences = (0, runtime2.initializeOnce)(() => {
      knownLicences = ["OFL-1.1", "OFL-1.0", "Apache-2.0", "UFL-1.0"], listFiles = {
        families: "google-fonts-families.json",
        reserved: "google-fonts-reserved.json",
        notices: "google-fonts-notices.json"
      }, defaultListRetryDelays = [1500, 6e3], listRetryDelays = defaultListRetryDelays, loadsByDir = /* @__PURE__ */ new Map(), failedAtByDir = /* @__PURE__ */ new Map();
    }), GOOGLE_FONT_LISTS_DIR = "artifact-type/reference/";
  };
}
export {
  installFontsGoogleFontLicences
};
