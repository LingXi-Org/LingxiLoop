// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiPointerMedia(runtime2) {
  var reactAC, COARSE_POINTER_QUERY, SMALL_COARSE_POINTER_QUERY, initializeUiPointerMedia;
  function useMediaQuery(input) {
    let callback = reactAC.useCallback((input2) => {
      if (typeof matchMedia != "function")
        return () => {
        };
      let value = matchMedia(input);
      return value.addEventListener("change", input2), () => value.removeEventListener("change", input2);
    }, [input]);
    return reactAC.useSyncExternalStore(callback, () => typeof matchMedia == "function" && matchMedia(input).matches, () => !1);
  }
  function useCoarsePointer() {
    return useMediaQuery(COARSE_POINTER_QUERY);
  }
  function useSmallCoarsePointer() {
    return useMediaQuery(SMALL_COARSE_POINTER_QUERY);
  }
  return bindRuntimeValue(runtime2, "useMediaQuery", () => useMediaQuery), bindRuntimeValue(runtime2, "useCoarsePointer", () => useCoarsePointer), bindRuntimeValue(runtime2, "useSmallCoarsePointer", () => useSmallCoarsePointer), bindRuntimeValue(runtime2, "reactAC", () => reactAC, (value) => {
    reactAC = value;
  }), bindRuntimeValue(runtime2, "COARSE_POINTER_QUERY", () => COARSE_POINTER_QUERY, (value) => {
    COARSE_POINTER_QUERY = value;
  }), bindRuntimeValue(runtime2, "SMALL_COARSE_POINTER_QUERY", () => SMALL_COARSE_POINTER_QUERY, (value) => {
    SMALL_COARSE_POINTER_QUERY = value;
  }), bindRuntimeValue(runtime2, "initializeUiPointerMedia", () => initializeUiPointerMedia, (value) => {
    initializeUiPointerMedia = value;
  }), () => {
    COARSE_POINTER_QUERY = "(pointer: coarse)", SMALL_COARSE_POINTER_QUERY = "(pointer: coarse) and (max-width: 599px)", initializeUiPointerMedia = (0, runtime2.initializeOnce)(() => {
      reactAC = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
    });
  };
}
export {
  installUiPointerMedia
};
