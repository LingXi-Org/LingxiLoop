// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEmbedsReactFrame(runtime2) {
  var EmbedFrameReact, EmbedFrameJsx, initializeEmbedFrameComponent, initializeEmbeds;
  function EmbedFrame({ html, allowScripts, markerAttr, title, onNavigated, onHost, interactive, state, onSave, isOwnWrite }) {
    let ref = EmbedFrameReact.useRef(null), [value, value2] = EmbedFrameReact.useState(0), ref2 = EmbedFrameReact.useRef(html);
    ref2.current !== html && (ref2.current = html, value2((input) => input + 1));
    let ref3 = EmbedFrameReact.useRef({
      onNavigated,
      onHost,
      interactive,
      onSave,
      isOwnWrite
    });
    ref3.current = {
      onNavigated,
      onHost,
      interactive,
      onSave,
      isOwnWrite
    };
    let ref4 = EmbedFrameReact.useRef(state), ref5 = EmbedFrameReact.useRef(!1), ref6 = EmbedFrameReact.useRef(null);
    EmbedFrameReact.useEffect(() => {
      if (state === void 0)
        return;
      let value5 = ref3.current.isOwnWrite?.(state) === !0;
      value5 && !ref5.current || state === ref4.current || (ref5.current = !value5, ref4.current = state, ref6.current?.state(state));
    }, [state]);
    let value3 = interactive !== void 0, value4 = onSave !== void 0, ref7 = EmbedFrameReact.useRef(title);
    ref7.current = title;
    let ref8 = EmbedFrameReact.useRef(null);
    return EmbedFrameReact.useEffect(() => {
      let current = ref.current;
      if (current === null)
        return;
      let value5 = (0, runtime2.createEmbedFrame)({
        html: ref2.current,
        allowScripts,
        markerAttr,
        title: ref7.current,
        onNavigated: () => ref3.current.onNavigated(),
        onRelocated: () => value2((input) => input + 1),
        ...ref4.current !== void 0 ? {
          state: ref4.current
        } : {},
        ...value4 ? {
          onSave: (input) => {
            ref4.current = input, ref5.current = !1, ref3.current.onSave?.(input);
          }
        } : {},
        ...value3 ? {
          interactive: {
            onPress: (input) => ref3.current.interactive?.onPress(input),
            onKey: (input) => ref3.current.interactive?.onKey(input),
            onWheel: (input) => ref3.current.interactive?.onWheel(input)
          }
        } : {}
      });
      return ref8.current = value5.iframe, ref6.current = value5.host, current.appendChild(value5.iframe), ref3.current.onHost(value5.host), value5.refused && ref3.current.interactive?.onRefused(), () => {
        ref3.current.onHost(null), ref8.current = null, ref6.current = null, value5.dispose();
      };
    }, [value, allowScripts, markerAttr, value3, value4]), EmbedFrameReact.useEffect(() => {
      ref8.current !== null && (ref8.current.title = title);
    }, [title]), EmbedFrameJsx.jsx("div", {
      ref,
      style: {
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...value3 ? {} : {
          pointerEvents: "none"
        }
      }
    });
  }
  return bindRuntimeValue(runtime2, "EmbedFrame", () => EmbedFrame), bindRuntimeValue(runtime2, "EmbedFrameReact", () => EmbedFrameReact, (value) => {
    EmbedFrameReact = value;
  }), bindRuntimeValue(runtime2, "EmbedFrameJsx", () => EmbedFrameJsx, (value) => {
    EmbedFrameJsx = value;
  }), bindRuntimeValue(runtime2, "initializeEmbedFrameComponent", () => initializeEmbedFrameComponent, (value) => {
    initializeEmbedFrameComponent = value;
  }), bindRuntimeValue(runtime2, "initializeEmbeds", () => initializeEmbeds, (value) => {
    initializeEmbeds = value;
  }), () => {
    initializeEmbedFrameComponent = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeEmbedFrameHost)(), EmbedFrameReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), EmbedFrameJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    }), initializeEmbeds = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeEmbedDocument)(), (0, runtime2.initializeEmbedRuntimeScript)(), (0, runtime2.initializeEmbedFrameHost)(), (0, runtime2.initializeEmbedSanitizer)(), initializeEmbedFrameComponent();
    });
  };
}
export {
  installEmbedsReactFrame
};
