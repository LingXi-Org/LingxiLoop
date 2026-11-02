// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorSpeakerNotes(runtime2) {
  var ReactSpeakerNotesEditor, SpeakerNotesEditorJsx, MIN_SPEAKER_NOTES_EDITOR_HEIGHT, DEFAULT_SPEAKER_NOTES_EDITOR_HEIGHT;
  function clampSpeakerNotesEditorHeight(height2) {
    return Math.max(MIN_SPEAKER_NOTES_EDITOR_HEIGHT, Math.min(Math.round(window.innerHeight * 0.5), Math.round(height2)));
  }
  function setSlideSpeakerNotes(slide, notes) {
    let updatedSlide = {
      ...slide
    };
    return notes === void 0 ? delete updatedSlide.notes : updatedSlide.notes = notes, updatedSlide;
  }
  function SpeakerNotesEditor({ slide, height: height2, onResize, onResizeStart, heightFor, atScreenBottom = !1, readOnly = !1, onLiveChange, onGestureEnd, onRelease }) {
    let ref = ReactSpeakerNotesEditor.useRef(null), value = (0, runtime2.useImeGuard)(), callback = () => {
      let current = ref.current;
      ref.current = null, current !== null && onGestureEnd(current);
    }, ref2 = ReactSpeakerNotesEditor.useRef(callback);
    ref2.current = callback, ReactSpeakerNotesEditor.useEffect(() => () => ref2.current(), []), ReactSpeakerNotesEditor.useEffect(() => {
      ref.current !== null && ref.current.id !== slide.id && ref2.current();
    }, [slide.id]), ReactSpeakerNotesEditor.useEffect(() => {
      if (!readOnly)
        return;
      let current = ref.current;
      ref.current = null, current !== null && current.id === slide.id && slide.notes !== current.notes && (onLiveChange(setSlideSpeakerNotes(slide, current.notes)), onGestureEnd(current));
    }, [readOnly, slide, onLiveChange, onGestureEnd]);
    let ref3 = ReactSpeakerNotesEditor.useRef(height2), state = {
      onResizeStart: () => {
        ref3.current = clampSpeakerNotesEditorHeight(height2), onResizeStart?.();
      },
      onResize: (input) => onResize(clampSpeakerNotesEditorHeight(heightFor ? heightFor(ref3.current, -input, MIN_SPEAKER_NOTES_EDITOR_HEIGHT, clampSpeakerNotesEditorHeight(1 / 0)) : ref3.current - input)),
      onResizeEnd: () => {
      }
    }, value2 = atScreenBottom ? "var(--sl-safe-b, 0px)" : "0px";
    return SpeakerNotesEditorJsx.jsxs("div", {
      "data-notes-tray": "",
      className: "relative flex shrink-0 flex-col border-t border-border-line bg-panel",
      style: {
        height: "calc(" + String(clampSpeakerNotesEditorHeight(height2)) + "px + " + value2 + ")",
        paddingBottom: value2
      },
      children: [
        SpeakerNotesEditorJsx.jsx(runtime2.PanelResizeHandle, {
          name: "notes",
          label: "调整演讲者备注区域大小",
          now: clampSpeakerNotesEditorHeight(height2),
          min: MIN_SPEAKER_NOTES_EDITOR_HEIGHT,
          max: clampSpeakerNotesEditorHeight(1 / 0),
          valueText: String(clampSpeakerNotesEditorHeight(height2)) + " pixels tall",
          gesture: state,
          onHome: () => onResize(MIN_SPEAKER_NOTES_EDITOR_HEIGHT),
          onEnd: () => onResize(clampSpeakerNotesEditorHeight(1 / 0)),
          onReset: () => onResize(DEFAULT_SPEAKER_NOTES_EDITOR_HEIGHT)
        }),
        SpeakerNotesEditorJsx.jsx("textarea", {
          value: slide.notes ?? "",
          readOnly,
          maxLength: runtime2.maxSlideNotesLength,
          placeholder: readOnly ? (0, runtime2.formatMessage)({
            defaultMessage: "此页没有演讲者备注。",
            id: "v2wTzhZqQa"
          }) : runtime2.SPEAKER_NOTES_DESCRIPTION,
          "aria-label": "演讲者备注",
          className: "min-h-0 flex-1 resize-none bg-transparent px-3 pb-2 pt-2.5 text-sm outline-none placeholder:text-fg-muted",
          onFocus: () => {
            ref.current = slide;
          },
          onChange: (event) => {
            (ref.current === null || ref.current.id !== slide.id) && (ref.current = slide);
            let value3 = event.target.value, state2 = {
              ...slide
            };
            value3.trim() === "" ? delete state2.notes : state2.notes = value3, onLiveChange(state2);
          },
          onBlur: callback,
          onCompositionEnd: value.onCompositionEnd,
          onKeyDown: (event) => {
            if (event.key === "Escape") {
              if (value.fromIme(event)) {
                event.stopPropagation();
                return;
              }
              event.preventDefault(), callback(), onRelease?.(), event.currentTarget.ownerDocument.activeElement === event.currentTarget && event.currentTarget.blur();
            }
          }
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "ReactSpeakerNotesEditor", () => ReactSpeakerNotesEditor, (value) => {
    ReactSpeakerNotesEditor = value;
  }), bindRuntimeValue(runtime2, "SpeakerNotesEditorJsx", () => SpeakerNotesEditorJsx, (value) => {
    SpeakerNotesEditorJsx = value;
  }), bindRuntimeValue(runtime2, "MIN_SPEAKER_NOTES_EDITOR_HEIGHT", () => MIN_SPEAKER_NOTES_EDITOR_HEIGHT, (value) => {
    MIN_SPEAKER_NOTES_EDITOR_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "clampSpeakerNotesEditorHeight", () => clampSpeakerNotesEditorHeight), bindRuntimeValue(runtime2, "DEFAULT_SPEAKER_NOTES_EDITOR_HEIGHT", () => DEFAULT_SPEAKER_NOTES_EDITOR_HEIGHT, (value) => {
    DEFAULT_SPEAKER_NOTES_EDITOR_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "setSlideSpeakerNotes", () => setSlideSpeakerNotes), bindRuntimeValue(runtime2, "SpeakerNotesEditor", () => SpeakerNotesEditor), () => {
    ReactSpeakerNotesEditor = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeSlideRenderer)(), SpeakerNotesEditorJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), MIN_SPEAKER_NOTES_EDITOR_HEIGHT = 72, DEFAULT_SPEAKER_NOTES_EDITOR_HEIGHT = 104;
  };
}
export {
  installEditorSpeakerNotes
};
