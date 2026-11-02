// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDesignSystemStore(runtime2) {
  var DesignSystemsReact, emptyDesignSystems, designSystemsSnapshot, lastDesignSystemsPayload, lastDesignSystemsJson, designSystemsSubscribers, initializeDesignSystemsStore;
  function publishDesignSystems(payload) {
    if (payload === lastDesignSystemsPayload)
      return;
    lastDesignSystemsPayload = payload;
    let value = (0, runtime2.normalizeDesignSystems)(payload), value2 = JSON.stringify(value);
    if (value2 !== lastDesignSystemsJson) {
      lastDesignSystemsJson = value2, designSystemsSnapshot = value.length === 0 ? emptyDesignSystems : value;
      for (let value3 of designSystemsSubscribers)
        value3();
    }
  }
  function getDesignSystemsSnapshot() {
    return designSystemsSnapshot;
  }
  function subscribeDesignSystems(subscriber) {
    return designSystemsSubscribers.add(subscriber), () => void designSystemsSubscribers.delete(subscriber);
  }
  function useDesignSystems() {
    return DesignSystemsReact.useSyncExternalStore(subscribeDesignSystems, getDesignSystemsSnapshot, getDesignSystemsSnapshot);
  }
  function hasDesignSystems(systems) {
    return systems.length > 0;
  }
  function designSystemColorRows(systems) {
    return systems.flatMap((input) => input.colors.map((input2) => ({
      name: input2.name,
      value: input2.value,
      label: input2.name,
      ...(0, runtime2.designSystemColorGrouping)(input, input2)
    })));
  }
  function designSystemTypeRows(systems) {
    return systems.flatMap((input, options) => (input.type ?? []).map((input2) => ({
      id: "ds-" + String(options) + "-" + input2.name,
      system: options,
      style: input2,
      subtitle: (0, runtime2.typographyTokenSubtitle)(input2),
      ...(0, runtime2.designSystemTypeGrouping)(input, input2)
    })));
  }
  return bindRuntimeValue(runtime2, "publishDesignSystems", () => publishDesignSystems), bindRuntimeValue(runtime2, "getDesignSystemsSnapshot", () => getDesignSystemsSnapshot), bindRuntimeValue(runtime2, "subscribeDesignSystems", () => subscribeDesignSystems), bindRuntimeValue(runtime2, "useDesignSystems", () => useDesignSystems), bindRuntimeValue(runtime2, "hasDesignSystems", () => hasDesignSystems), bindRuntimeValue(runtime2, "designSystemColorRows", () => designSystemColorRows), bindRuntimeValue(runtime2, "designSystemTypeRows", () => designSystemTypeRows), bindRuntimeValue(runtime2, "DesignSystemsReact", () => DesignSystemsReact, (value) => {
    DesignSystemsReact = value;
  }), bindRuntimeValue(runtime2, "emptyDesignSystems", () => emptyDesignSystems, (value) => {
    emptyDesignSystems = value;
  }), bindRuntimeValue(runtime2, "designSystemsSnapshot", () => designSystemsSnapshot, (value) => {
    designSystemsSnapshot = value;
  }), bindRuntimeValue(runtime2, "lastDesignSystemsPayload", () => lastDesignSystemsPayload, (value) => {
    lastDesignSystemsPayload = value;
  }), bindRuntimeValue(runtime2, "lastDesignSystemsJson", () => lastDesignSystemsJson, (value) => {
    lastDesignSystemsJson = value;
  }), bindRuntimeValue(runtime2, "designSystemsSubscribers", () => designSystemsSubscribers, (value) => {
    designSystemsSubscribers = value;
  }), bindRuntimeValue(runtime2, "initializeDesignSystemsStore", () => initializeDesignSystemsStore, (value) => {
    initializeDesignSystemsStore = value;
  }), () => {
    lastDesignSystemsPayload = void 0, lastDesignSystemsJson = "[]", initializeDesignSystemsStore = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeDesignTokenParser)(), DesignSystemsReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), emptyDesignSystems = [], designSystemsSnapshot = emptyDesignSystems, designSystemsSubscribers = /* @__PURE__ */ new Set();
    });
  };
}
export {
  installDesignSystemStore
};
