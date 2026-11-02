// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installModuleInterop(runtime2) {
  var createObject, getPrototypeOf, defineProperty, getOwnPropertyNames, hasOwnProperty, commonJSNamespaceCache, esmNamespaceCache, toModuleNamespace, initializeCommonJS, identity, defineLiveExports, initializeOnce, dynamicRequire;
  function readBoundProperty(input) {
    return this[input];
  }
  function replaceExportGetter(input, options) {
    this[input] = identity.bind(null, options);
  }
  return bindRuntimeValue(runtime2, "createObject", () => createObject, (value) => {
    createObject = value;
  }), bindRuntimeValue(runtime2, "getPrototypeOf", () => getPrototypeOf, (value) => {
    getPrototypeOf = value;
  }), bindRuntimeValue(runtime2, "defineProperty", () => defineProperty, (value) => {
    defineProperty = value;
  }), bindRuntimeValue(runtime2, "getOwnPropertyNames", () => getOwnPropertyNames, (value) => {
    getOwnPropertyNames = value;
  }), bindRuntimeValue(runtime2, "hasOwnProperty", () => hasOwnProperty, (value) => {
    hasOwnProperty = value;
  }), bindRuntimeValue(runtime2, "readBoundProperty", () => readBoundProperty), bindRuntimeValue(runtime2, "commonJSNamespaceCache", () => commonJSNamespaceCache, (value) => {
    commonJSNamespaceCache = value;
  }), bindRuntimeValue(runtime2, "esmNamespaceCache", () => esmNamespaceCache, (value) => {
    esmNamespaceCache = value;
  }), bindRuntimeValue(runtime2, "toModuleNamespace", () => toModuleNamespace, (value) => {
    toModuleNamespace = value;
  }), bindRuntimeValue(runtime2, "initializeCommonJS", () => initializeCommonJS, (value) => {
    initializeCommonJS = value;
  }), bindRuntimeValue(runtime2, "identity", () => identity, (value) => {
    identity = value;
  }), bindRuntimeValue(runtime2, "replaceExportGetter", () => replaceExportGetter), bindRuntimeValue(runtime2, "defineLiveExports", () => defineLiveExports, (value) => {
    defineLiveExports = value;
  }), bindRuntimeValue(runtime2, "initializeOnce", () => initializeOnce, (value) => {
    initializeOnce = value;
  }), bindRuntimeValue(runtime2, "dynamicRequire", () => dynamicRequire, (value) => {
    dynamicRequire = value;
  }), () => {
    createObject = Object.create, {
      getPrototypeOf,
      defineProperty,
      getOwnPropertyNames
    } = Object, hasOwnProperty = Object.prototype.hasOwnProperty, toModuleNamespace = (input, options, context) => {
      var value = input != null && typeof input == "object";
      if (value) {
        var value2 = options ? commonJSNamespaceCache ??= /* @__PURE__ */ new WeakMap() : esmNamespaceCache ??= /* @__PURE__ */ new WeakMap(), entry = value2.get(input);
        if (entry)
          return entry;
      }
      context = input != null ? createObject(getPrototypeOf(input)) : {};
      let value3 = options || !input || !input.__esModule || !hasOwnProperty.call(input, "default") ? defineProperty(context, "default", {
        value: input,
        enumerable: !0
      }) : context;
      if (input && typeof input == "object" || typeof input == "function")
        for (let value4 of getOwnPropertyNames(input))
          hasOwnProperty.call(value3, value4) || defineProperty(value3, value4, {
            get: readBoundProperty.bind(input, value4),
            enumerable: !0
          });
      return value && value2.set(input, value3), value3;
    }, initializeCommonJS = (input, options) => () => (options || input((options = {
      exports: {}
    }).exports, options), options.exports), identity = (input) => input, defineLiveExports = (input, options) => {
      for (var value in options)
        defineProperty(input, value, {
          get: options[value],
          enumerable: !0,
          configurable: !0,
          set: replaceExportGetter.bind(options, value)
        });
    }, initializeOnce = (input, options, failure) => () => {
      if (input)
        try {
          options = input(input = 0);
        } catch (error) {
          failure = [error];
        }
      if (failure)
        throw failure[0];
      return options;
    }, dynamicRequire = ((input) => typeof require < "u" ? require : typeof Proxy < "u" ? new Proxy(input, {
      get: (input2, options) => (typeof require < "u" ? require : input2)[options]
    }) : input)(function(input) {
      if (typeof require < "u")
        return require.apply(this, arguments);
      throw Error('Dynamic require of "' + input + '" is not supported');
    });
  };
}
export {
  installModuleInterop
};
