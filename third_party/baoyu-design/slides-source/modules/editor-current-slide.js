// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorCurrentSlide(runtime2) {
  var SLIDE_PLACE_FRAGMENT_PREFIX, slidePlaceFragment, PANELS_PREFERENCE_PREFIX, CAMERA_PREFERENCE_PREFIX, SLIDE_NUMBER_FRAGMENT;
  function currentSlideStorageKey(memoryScope = "", prefix = "slides-current/") {
    let path = typeof location > "u" ? "/" : location.pathname;
    return prefix + (0, runtime2.artifactStashKey)(path).slice((0, runtime2.artifactStashKey)("").length) + (memoryScope ? "/" + memoryScope : "");
  }
  function readCurrentSlidePreference(memoryScope) {
    try {
      let value = sessionStorage.getItem(currentSlideStorageKey(memoryScope));
      if (value === null)
        return;
      let value2 = /^([\w-]*)@(\d{1,4})$/.exec(value);
      return value2 !== null ? {
        id: value2[1],
        at: Number(value2[2])
      } : {
        id: value
      };
    } catch {
      return;
    }
  }
  function slideAtClampedIndex(order, index4) {
    return order[Math.min(index4, order.length - 1)];
  }
  function resolveRememberedCurrentSlide(order, memoryScope, rememberDeleted = !0) {
    let storedPreference = readCurrentSlidePreference(memoryScope);
    if (storedPreference === void 0)
      return {
        id: order[0] ?? null,
        exact: !1,
        at: 0,
        home: null
      };
    if (order.includes(storedPreference.id))
      return {
        id: storedPreference.id,
        exact: !0,
        at: order.indexOf(storedPreference.id),
        home: null
      };
    let value = rememberDeleted ? (storedPreference.at !== void 0 ? slideAtClampedIndex(order, storedPreference.at) : void 0) ?? order[0] ?? null : null;
    return {
      id: value,
      exact: !1,
      at: value !== null ? order.indexOf(value) : storedPreference.at ?? 0,
      home: storedPreference.id
    };
  }
  function rememberedCurrentSlideId(order, memoryScope) {
    let remembered = resolveRememberedCurrentSlide(order, memoryScope);
    return remembered.exact || remembered.home === null ? remembered.id : null;
  }
  function writeCurrentSlidePreference(slideId, index4, memoryScope) {
    try {
      sessionStorage.setItem(currentSlideStorageKey(memoryScope), slideId + "@" + String(index4));
    } catch {
    }
  }
  function readEditorPanelsPreference(memoryScope) {
    try {
      let stored = JSON.parse(sessionStorage.getItem(currentSlideStorageKey(memoryScope, PANELS_PREFERENCE_PREFIX)) ?? "null");
      if (typeof stored != "object" || stored === null || !("notes" in stored && "notesH" in stored && "properties" in stored && "strip" in stored))
        return;
      let { notes, notesH, properties, strip } = stored;
      return typeof notes != "boolean" || typeof properties != "boolean" || typeof strip != "boolean" && strip !== null || typeof notesH != "number" || !Number.isFinite(notesH) ? void 0 : { notes, notesH, properties, strip };
    } catch {
      return;
    }
  }
  function writeEditorPanelsPreference(preference, memoryScope) {
    try {
      sessionStorage.setItem(currentSlideStorageKey(memoryScope, PANELS_PREFERENCE_PREFIX), JSON.stringify(preference));
    } catch {
    }
  }
  function isFiniteNumber(value) {
    return typeof value == "number" && Number.isFinite(value);
  }
  function readCanvasCameraPreference(memoryScope) {
    try {
      let stored = JSON.parse(sessionStorage.getItem(currentSlideStorageKey(memoryScope, CAMERA_PREFERENCE_PREFIX)) ?? "null");
      if (typeof stored != "object" || stored === null || !("canvas" in stored && "view" in stored) || typeof stored.canvas != "boolean")
        return;
      let view = stored.view;
      if (view === null)
        return {
          canvas: stored.canvas,
          view: null
        };
      if (typeof view != "object" || !("x" in view && "y" in view && "scale" in view))
        return;
      let { x, y, scale } = view;
      return isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(scale) && scale > 0 ? {
        canvas: stored.canvas,
        view: { x, y, scale }
      } : void 0;
    } catch {
      return;
    }
  }
  function writeCanvasCameraPreference(preference, memoryScope) {
    try {
      sessionStorage.setItem(currentSlideStorageKey(memoryScope, CAMERA_PREFERENCE_PREFIX), JSON.stringify(preference));
    } catch {
    }
  }
  function resolveSlidePlaceFragment(fragment, order, allowNumber) {
    if (!fragment.startsWith(SLIDE_PLACE_FRAGMENT_PREFIX))
      return;
    let hash = fragment.slice(SLIDE_PLACE_FRAGMENT_PREFIX.length).split(".", 1)[0];
    return SLIDE_NUMBER_FRAGMENT.test(hash) ? allowNumber && Number(hash) >= 1 ? slideAtClampedIndex(order, Number(hash) - 1) : void 0 : order.find((input) => (0, runtime2.hashScopedSlideId)(input) === hash);
  }
  function newLinkedSlideId(order, placeLink, allowNumber) {
    if (placeLink?.why === "new")
      return resolveSlidePlaceFragment(placeLink.place, order, allowNumber);
  }
  function initialCurrentSlideId(order, placeLink, allowNumber) {
    let camera = readCanvasCameraPreference();
    return newLinkedSlideId(order, placeLink, allowNumber) ?? (camera?.canvas === !0 || camera?.view != null ? null : rememberedCurrentSlideId(order));
  }
  return bindRuntimeValue(runtime2, "currentSlideStorageKey", () => currentSlideStorageKey), bindRuntimeValue(runtime2, "readCurrentSlidePreference", () => readCurrentSlidePreference), bindRuntimeValue(runtime2, "readEditorPanelsPreference", () => readEditorPanelsPreference), bindRuntimeValue(runtime2, "writeEditorPanelsPreference", () => writeEditorPanelsPreference), bindRuntimeValue(runtime2, "readCanvasCameraPreference", () => readCanvasCameraPreference), bindRuntimeValue(runtime2, "writeCanvasCameraPreference", () => writeCanvasCameraPreference), bindRuntimeValue(runtime2, "slideAtClampedIndex", () => slideAtClampedIndex), bindRuntimeValue(runtime2, "resolveRememberedCurrentSlide", () => resolveRememberedCurrentSlide), bindRuntimeValue(runtime2, "rememberedCurrentSlideId", () => rememberedCurrentSlideId), bindRuntimeValue(runtime2, "writeCurrentSlidePreference", () => writeCurrentSlidePreference), bindRuntimeValue(runtime2, "SLIDE_PLACE_FRAGMENT_PREFIX", () => SLIDE_PLACE_FRAGMENT_PREFIX, (value) => {
    SLIDE_PLACE_FRAGMENT_PREFIX = value;
  }), bindRuntimeValue(runtime2, "slidePlaceFragment", () => slidePlaceFragment, (value) => {
    slidePlaceFragment = value;
  }), bindRuntimeValue(runtime2, "resolveSlidePlaceFragment", () => resolveSlidePlaceFragment), bindRuntimeValue(runtime2, "newLinkedSlideId", () => newLinkedSlideId), bindRuntimeValue(runtime2, "initialCurrentSlideId", () => initialCurrentSlideId), () => {
    PANELS_PREFERENCE_PREFIX = "slides-panels/", CAMERA_PREFERENCE_PREFIX = "slides-camera/", SLIDE_PLACE_FRAGMENT_PREFIX = "slide-", SLIDE_NUMBER_FRAGMENT = /^\d{1,4}$/, slidePlaceFragment = (input) => SLIDE_PLACE_FRAGMENT_PREFIX + (0, runtime2.hashScopedSlideId)(input);
  };
}
export {
  installEditorCurrentSlide
};
