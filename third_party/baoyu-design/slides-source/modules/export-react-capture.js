// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportReactCapture(runtime2) {
  var CaptureReact, CaptureReactDom, CaptureErrorBoundary, initializeSynchronousReactRender;
  function renderReactSynchronously(root, element) {
    let result = {
      threw: !1,
      error: void 0
    };
    if (CaptureReactDom.flushSync(() => root.render(CaptureReact.createElement(CaptureErrorBoundary, {
      onError: (input) => {
        result.threw = !0, result.error = input;
      }
    }, element))), result.threw)
      throw result.error;
  }
  return bindRuntimeValue(runtime2, "renderReactSynchronously", () => renderReactSynchronously), bindRuntimeValue(runtime2, "CaptureReact", () => CaptureReact, (value) => {
    CaptureReact = value;
  }), bindRuntimeValue(runtime2, "CaptureReactDom", () => CaptureReactDom, (value) => {
    CaptureReactDom = value;
  }), bindRuntimeValue(runtime2, "CaptureErrorBoundary", () => CaptureErrorBoundary, (value) => {
    CaptureErrorBoundary = value;
  }), bindRuntimeValue(runtime2, "initializeSynchronousReactRender", () => initializeSynchronousReactRender, (value) => {
    initializeSynchronousReactRender = value;
  }), () => {
    initializeSynchronousReactRender = (0, runtime2.initializeOnce)(() => {
      CaptureReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), CaptureReactDom = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), CaptureErrorBoundary = class extends CaptureReact.Component {
        state = {
          failed: !1
        };
        static getDerivedStateFromError() {
          return {
            failed: !0
          };
        }
        componentDidCatch(input) {
          this.props.onError(input);
        }
        render() {
          return this.state.failed ? null : this.props.children;
        }
      };
    });
  };
}
export {
  installExportReactCapture
};
