// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installMediaPlaybackTurn(runtime2) {
  var PlaybackTurnReact, PlaybackTurnReactDom, PlaybackTurnJsx, PlaybackTurnContext, initializePlaybackTurn;
  function usePlaybackTurn({ what, selected, off, instead, tryPause, paused = !1, ambient = !1 }) {
    let shared = PlaybackTurnReact.useContext(PlaybackTurnContext), [own, setOwn] = PlaybackTurnReact.useState(void 0), { at, set } = ambient ? { at: own, set: setOwn } : shared, id = PlaybackTurnReact.useId(), asked = at === id, wasSelected = PlaybackTurnReact.useRef(selected);
    PlaybackTurnReact.useEffect(() => {
      asked && (off || !ambient && wasSelected.current && !selected) && set(void 0), ambient ? shared.at === id && shared.set(void 0) : setOwn(void 0), wasSelected.current = selected;
    }, [asked, off, selected, set, ambient, shared, id]);
    let latest = PlaybackTurnReact.useRef({
      what,
      asked,
      instead,
      tryPause,
      paused
    });
    latest.current = { what, asked, instead, tryPause, paused };
    let stoppedWithMessage = PlaybackTurnReact.useRef(!1), unmounted = PlaybackTurnReact.useRef(!1);
    PlaybackTurnReact.useEffect(() => (unmounted.current = !1, () => void (unmounted.current = !0)), []), PlaybackTurnReact.useEffect(() => {
      if (asked)
        return stoppedWithMessage.current || (0, runtime2.announceLiveMessage)("Playing " + latest.current.what + "."), () => {
          !stoppedWithMessage.current && !unmounted.current && (0, runtime2.announceLiveMessage)("Stopped " + latest.current.what + "."), stoppedWithMessage.current = !1;
        };
    }, [asked]);
    let toastId = PlaybackTurnReact.useRef(0);
    PlaybackTurnReact.useEffect(() => () => (0, runtime2.closeToast)(toastId.current), []);
    let play = PlaybackTurnReact.useCallback(() => {
      (0, runtime2.closeToast)(toastId.current), latest.current.instead?.() !== !0 ? PlaybackTurnReactDom.flushSync(() => set(id)) : latest.current.paused && (0, runtime2.announceLiveMessage)("Playing " + latest.current.what + ".");
    }, [set, id]), stop = PlaybackTurnReact.useCallback((message, link) => {
      if (latest.current.asked) {
        if (stoppedWithMessage.current = message !== void 0, (0, runtime2.closeToast)(toastId.current), message !== void 0 && link !== void 0) {
          let toast = toastId.current = (0, runtime2.showActionToast)(message, PlaybackTurnJsx.jsx(runtime2.Button, {
            size: "sm",
            variant: "secondary",
            onClick: () => {
              (0, runtime2.closeToast)(toast), (0, runtime2.openExternalLink)(link.href);
            },
            children: link.label
          }));
        } else
          message !== void 0 && (0, runtime2.showToast)(message);
        set(void 0);
      }
    }, [set]), pause = PlaybackTurnReact.useCallback(() => latest.current.tryPause?.() === !0 ? (0, runtime2.announceLiveMessage)("Paused " + latest.current.what + ".") : stop(), [stop]);
    return { at, asked, play, pause, stop };
  }
  return bindRuntimeValue(runtime2, "usePlaybackTurn", () => usePlaybackTurn), bindRuntimeValue(runtime2, "PlaybackTurnReact", () => PlaybackTurnReact, (value) => {
    PlaybackTurnReact = value;
  }), bindRuntimeValue(runtime2, "PlaybackTurnReactDom", () => PlaybackTurnReactDom, (value) => {
    PlaybackTurnReactDom = value;
  }), bindRuntimeValue(runtime2, "PlaybackTurnJsx", () => PlaybackTurnJsx, (value) => {
    PlaybackTurnJsx = value;
  }), bindRuntimeValue(runtime2, "PlaybackTurnContext", () => PlaybackTurnContext, (value) => {
    PlaybackTurnContext = value;
  }), bindRuntimeValue(runtime2, "initializePlaybackTurn", () => initializePlaybackTurn, (value) => {
    initializePlaybackTurn = value;
  }), () => {
    initializePlaybackTurn = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeExternalLinks)(), (0, runtime2.initializeUiAnnouncements)(), PlaybackTurnReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), PlaybackTurnReactDom = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), PlaybackTurnJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), PlaybackTurnContext = PlaybackTurnReact.createContext({
        at: void 0,
        set: () => {
        }
      });
    });
  };
}
export {
  installMediaPlaybackTurn
};
