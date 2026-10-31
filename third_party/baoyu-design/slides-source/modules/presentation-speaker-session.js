// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installPresentationSpeakerSession(runtime2) {
  var CompactSpeakerNotesJsx, SPEAKER_NOTES_POPOUT_SIZE, activeSpeakerNotesSession, speakerNotesSessionSubscribers, speakerNotesSessionByPopout;
  function setSpeakerNotesSession(session) {
    activeSpeakerNotesSession = session;
    for (let value of Array.from(speakerNotesSessionSubscribers))
      value();
  }
  function subscribeSpeakerNotesSession(listener) {
    return speakerNotesSessionSubscribers.add(listener), () => {
      speakerNotesSessionSubscribers.delete(listener);
    };
  }
  function getSpeakerNotesSession() {
    return activeSpeakerNotesSession;
  }
  function slidesHaveSpeakerNotes(slides) {
    return slides.some((input) => (input.notes ?? "").trim() !== "");
  }
  function useSpeakerNotesSession() {
    return runtime2.ReactSpeakerNotes.useSyncExternalStore(subscribeSpeakerNotesSession, getSpeakerNotesSession, () => null);
  }
  function openSpeakerNotes() {
    let value = (0, runtime2.openPopoutView)(runtime2.SPEAKER_NOTES_POPOUT_KEY, {
      ...SPEAKER_NOTES_POPOUT_SIZE,
      title: "",
      css: runtime2.SPEAKER_NOTES_POPOUT_CSS
    });
    if (value.kind !== "opened")
      return {
        kind: value.kind
      };
    if (activeSpeakerNotesSession !== null && activeSpeakerNotesSession.view === value.view)
      return {
        kind: "opened",
        win: activeSpeakerNotesSession,
        reused: !0
      };
    let view = value.view;
    value.reused !== !0 && (view.win.document.title = runtime2.SPEAKER_NOTES_LABEL);
    let entry = speakerNotesSessionByPopout.get(view);
    entry === void 0 && (entry = runtime2.SpeakerNotesReactRoot.createRoot(view.root), speakerNotesSessionByPopout.set(view, entry));
    let value3 = entry, state = {
      view,
      render: (input) => value3.render(input),
      close: () => view.close()
    };
    return setSpeakerNotesSession(state), view.closed.then(() => {
      activeSpeakerNotesSession === state && setSpeakerNotesSession(null), setTimeout(() => value3.unmount(), 0);
    }), value.reused === !0 ? {
      kind: "opened",
      win: state,
      reused: !0
    } : {
      kind: "opened",
      win: state
    };
  }
  function CompactSpeakerNotes({ win, slide, index: index4 }) {
    runtime2.ReactSpeakerNotes.useEffect(() => {
      win.document.title = runtime2.SPEAKER_NOTES_LABEL;
    }, [win]);
    let value = (0, runtime2.slideTitleSnippet)(slide, 80), value2 = (0, runtime2.truncateUtf16Safely)((slide?.notes ?? "").trim(), runtime2.maxSlideNotesLength);
    return CompactSpeakerNotesJsx.jsx("div", {
      className: "sn sn-compact",
      children: CompactSpeakerNotesJsx.jsxs("div", {
        className: "sn-right",
        children: [
          CompactSpeakerNotesJsx.jsxs("div", {
            className: "sn-head",
            children: [
              CompactSpeakerNotesJsx.jsx("span", {
                children: runtime2.SPEAKER_NOTES_LABEL
              }),
              CompactSpeakerNotesJsx.jsx("span", {
                className: "sn-dim",
                style: {
                  fontWeight: 400
                },
                children: slide === void 0 ? (0, runtime2.formatMessage)({
                  defaultMessage: "没有幻灯片",
                  id: "qgLDVgs3Ae"
                }) : value !== "" ? value : (0, runtime2.formatMessage)({
                  defaultMessage: "第 {n} 页",
                  id: "+NCxNJIYtL"
                }, {
                  n: String(index4 + 1)
                })
              })
            ]
          }),
          CompactSpeakerNotesJsx.jsx("div", {
            tabIndex: 0,
            role: "region",
            "aria-label": "备注",
            "data-notes-scroll": "",
            className: "sn-notes",
            children: CompactSpeakerNotesJsx.jsxs("div", {
              children: [
                CompactSpeakerNotesJsx.jsx("p", {
                  className: "sn-dim",
                  style: {
                    margin: "0 0 1em",
                    fontSize: "0.75em"
                  },
                  children: (0, runtime2.formatMessage)({
                    defaultMessage: "等待放映。请在主窗口点击“放映”，演示文稿会在主窗口播放（条件允许时全屏），此窗口会同步显示计时、当前页、下一页和备注。",
                    id: "K7SNTNQpJh"
                  })
                }),
                value2 === "" ? CompactSpeakerNotesJsx.jsx("span", {
                  className: "sn-dim",
                  children: runtime2.NO_SPEAKER_NOTES_MESSAGE
                }) : value2
              ]
            })
          })
        ]
      })
    });
  }
  return bindRuntimeValue(runtime2, "CompactSpeakerNotesJsx", () => CompactSpeakerNotesJsx, (value) => {
    CompactSpeakerNotesJsx = value;
  }), bindRuntimeValue(runtime2, "SPEAKER_NOTES_POPOUT_SIZE", () => SPEAKER_NOTES_POPOUT_SIZE, (value) => {
    SPEAKER_NOTES_POPOUT_SIZE = value;
  }), bindRuntimeValue(runtime2, "activeSpeakerNotesSession", () => activeSpeakerNotesSession, (value) => {
    activeSpeakerNotesSession = value;
  }), bindRuntimeValue(runtime2, "speakerNotesSessionSubscribers", () => speakerNotesSessionSubscribers, (value) => {
    speakerNotesSessionSubscribers = value;
  }), bindRuntimeValue(runtime2, "speakerNotesSessionByPopout", () => speakerNotesSessionByPopout, (value) => {
    speakerNotesSessionByPopout = value;
  }), bindRuntimeValue(runtime2, "setSpeakerNotesSession", () => setSpeakerNotesSession), bindRuntimeValue(runtime2, "subscribeSpeakerNotesSession", () => subscribeSpeakerNotesSession), bindRuntimeValue(runtime2, "getSpeakerNotesSession", () => getSpeakerNotesSession), bindRuntimeValue(runtime2, "slidesHaveSpeakerNotes", () => slidesHaveSpeakerNotes), bindRuntimeValue(runtime2, "useSpeakerNotesSession", () => useSpeakerNotesSession), bindRuntimeValue(runtime2, "openSpeakerNotes", () => openSpeakerNotes), bindRuntimeValue(runtime2, "CompactSpeakerNotes", () => CompactSpeakerNotes), () => {
    CompactSpeakerNotesJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SPEAKER_NOTES_POPOUT_SIZE = {
      width: 1e3,
      height: 640
    }, activeSpeakerNotesSession = null, speakerNotesSessionSubscribers = /* @__PURE__ */ new Set(), speakerNotesSessionByPopout = /* @__PURE__ */ new WeakMap();
  };
}
export {
  installPresentationSpeakerSession
};
