// Reconstructed native fullscreen/animation helpers (MIT); see ../README.md.
// Keep the fullscreen call synchronous with the original user gesture.
import { bindRuntimeValue } from "../module-helpers.js";
export function installPresentationPlayer(runtime2) {
  let React, jsx, portal, presentationModeActive = false, pendingPresentationFullscreenRequest = null;
  function ensurePresentationFullscreen() {
    if (pendingPresentationFullscreenRequest !== null)
      return pendingPresentationFullscreenRequest;
    let value = (0, runtime2.requestFullscreen)(document.documentElement).then((source) => (pendingPresentationFullscreenRequest === value && (pendingPresentationFullscreenRequest = null), source.kind === "entered" && !presentationModeActive && (0, runtime2.exitFullscreen)(), source));
    return pendingPresentationFullscreenRequest = value, value;
  }
  function requestPresentationFullscreen() {
    return ensurePresentationFullscreen();
  }
  function replayClickedNodeAnimation(slide, element) {
    if (!slide)
      return;
    let value = element.closest("[data-frame-id]")?.getAttribute("data-frame-id"), attribute = element.getAttribute("data-node-path");
    if (value == null || attribute === null)
      return;
    let value2 = slide.frames.find((input) => input.id === value);
    if (!value2)
      return;
    let value3 = resolveDottedNodePath(value2.node, attribute);
    if (!value3 || value3.style === void 0)
      return;
    let value4 = (0, runtime2.nodeStyleKind)(value3);
    if (value4 !== void 0)
      return {
        bag: value3.style,
        kind: value4
      };
  }
  function resolveDottedNodePath(node, path) {
    if (path === "")
      return node;
    let current = node;
    for (let value of path.split(".")) {
      if (!current)
        return;
      let value2 = Number(value), value3 = (0, runtime2.nodeChildren)(current);
      if (!Number.isInteger(value2) || value2 < 0 || value3 === void 0)
        return;
      current = value3[value2];
    }
    return current;
  }
  function PresentationView(props) {
    const [state, setState] = React.useState(runtime2.presentationModulesReady ? 'ready' : 'loading');
    const [attempt, retry] = React.useReducer(n => n + 1, 0);
    const layer = React.useRef(null);
    const exit = React.useRef(props.onExit);
    exit.current = props.onExit;
    const ready = state === 'ready';
    React.useLayoutEffect(() => {
      presentationModeActive = true;
      return () => { presentationModeActive = false; pendingPresentationFullscreenRequest = null; runtime2.exitFullscreen(); };
    }, []);
    React.useEffect(() => {
      if (runtime2.presentationModulesReady) { setState('ready');return; }
      let disposed = false;
      setState('loading');
      runtime2.loadPresentationModules().then(() => { if (!disposed) setState('ready'); }, () => { if (!disposed) setState('failed'); });
      return () => { disposed = true; };
    }, [attempt]);
    React.useLayoutEffect(() => {
      if (ready || !layer.current) return;
      const node = layer.current, restore = runtime2.inertPresentationSiblings(node);
      node.querySelector('button')?.focus({preventScroll:true});
      const key = event => {
        if (event.key === 'Escape') { event.preventDefault();event.stopPropagation();exit.current(props.startIndex); }
        if (event.key === 'Tab') {
          const buttons = [...node.querySelectorAll('button')];
          const next = buttons[(buttons.indexOf(document.activeElement) + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length];
          event.preventDefault();next?.focus();
        }
      };
      node.addEventListener('keydown', key);
      return () => { node.removeEventListener('keydown', key);restore(); };
    }, [ready, state, props.startIndex]);
    if (ready) return jsx.jsx(runtime2.LoadedPresentationView, props);
    return portal.createPortal(jsx.jsx('div', {ref:layer,role:'dialog','aria-modal':true,'aria-label':'准备放映',
      className:'fixed inset-0 z-[100] flex items-center justify-center bg-black text-white',
      children:jsx.jsx(runtime2.CdsRoot, {mode:'dark',children:jsx.jsxs('div', {className:'flex flex-col items-center gap-4 p-6',children:[
        jsx.jsx('p', {role:state === 'failed' ? 'alert' : 'status',children:state === 'failed' ? '放映暂时无法加载，请重试。' : '正在准备放映…'}),
        state === 'failed' ? jsx.jsx(runtime2.Button, {onClick:retry,children:'重试'}) : null,
        jsx.jsx(runtime2.Button, {onClick:() => props.onExit(props.startIndex),children:'返回编辑'})
      ]})})}), document.body);
  }
  bindRuntimeValue(runtime2, "ensurePresentationFullscreen", () => ensurePresentationFullscreen);
  bindRuntimeValue(runtime2, "requestPresentationFullscreen", () => requestPresentationFullscreen);
  bindRuntimeValue(runtime2, "replayClickedNodeAnimation", () => replayClickedNodeAnimation);
  bindRuntimeValue(runtime2, "resolveDottedNodePath", () => resolveDottedNodePath);
  bindRuntimeValue(runtime2, "presentationModeActive", () => presentationModeActive, value => { presentationModeActive = value; });
  bindRuntimeValue(runtime2, "pendingPresentationFullscreenRequest", () => pendingPresentationFullscreenRequest, value => { pendingPresentationFullscreenRequest = value; });
  bindRuntimeValue(runtime2, 'PresentationView', () => PresentationView);
  return () => {
    React = runtime2.loadReactNamespace();jsx = runtime2.loadJsxNamespace();portal = runtime2.loadReactDomNamespace();
  };
}
