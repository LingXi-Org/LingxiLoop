// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
export function installPresentationSpeakerPanel(runtime2) {
  var SpeakerNotesPanelJsx, SPEAKER_NOTES_WIDE_BREAKPOINT, SPEAKER_NOTES_SCROLL_KEYS, preventSpeakerControlMouseDown, SPEAKER_NOTES_WIDE_MEDIA_QUERY, SPEAKER_NOTES_REMOTE_WIDE_MEDIA_QUERY;
function formatSpeakerElapsedTime(elapsedMs) {
    let seconds = Math.max(0, Math.floor(elapsedMs / 1e3)), minutes = Math.floor(seconds / 60);
    return String(minutes) + ":" + String(seconds % 60).padStart(2, "0");
  }
function speakerNotesOwnNavigationKey(event) {
    if (!SPEAKER_NOTES_SCROLL_KEYS.has(event.key))
      return !1;
    let scroller = event.target?.closest?.("[data-notes-scroll]");
    return scroller != null && scroller.scrollHeight > scroller.clientHeight + 1;
  }
function elapsedSpeakerClock(clock, now) {
    return clock.accum + (clock.running ? now - clock.start : 0);
  }
function SpeakerClock({ clock }) {
    let [value, value2] = runtime2.ReactSpeakerNotesPanel.useState(() => Date.now());
    return runtime2.ReactSpeakerNotesPanel.useLayoutEffect(() => {
      if (value2(Date.now()), !clock.running)
        return;
      let value3 = setInterval(() => value2(Date.now()), 500);
      return () => clearInterval(value3);
    }, [clock]), SpeakerNotesPanelJsx.jsx("span", {
      className: "sn-clock" + (clock.running ? "" : " sn-paused"),
      title: clock.running ? (0, runtime2.formatMessage)({
        defaultMessage: "已用时间",
        id: "e8zkYylKAA"
      }) : (0, runtime2.formatMessage)({
        defaultMessage: "已用时间（已暂停）",
        id: "ryIFdB+W67"
      }),
      children: formatSpeakerElapsedTime(elapsedSpeakerClock(clock, value))
    });
  }
function isSpeakerNotesWindowWide(window2, query) {
    return typeof window2.matchMedia == "function" ? window2.matchMedia(query).matches : query === SPEAKER_NOTES_WIDE_MEDIA_QUERY && window2.innerWidth >= SPEAKER_NOTES_WIDE_BREAKPOINT;
  }
function useSpeakerNotesWindowWide(window2, query) {
    let [wide, setWide] = runtime2.ReactSpeakerNotesPanel.useState(() => isSpeakerNotesWindowWide(window2, query));
    return runtime2.ReactSpeakerNotesPanel.useEffect(() => {
      let callback = () => setWide(isSpeakerNotesWindowWide(window2, query));
      callback();
      let value = typeof window2.matchMedia == "function" ? window2.matchMedia(query) : null;
      return value?.addEventListener("change", callback), window2.addEventListener("resize", callback), () => {
        value?.removeEventListener("change", callback), window2.removeEventListener("resize", callback);
      };
    }, [window2, query]), wide;
  }
function SpeakerNotesPanel({ first, link, win, slides, assets, fontCss = "", canEdit = !1, heldSlide = runtime2.slideHtmlHold, remote }) {
    let React263 = runtime2.ReactSpeakerNotesPanel, Jsx = SpeakerNotesPanelJsx, formatMessage = runtime2.formatMessage, [place, setPlace] = React263.useState(first), [editing, setEditing] = React263.useState(!1), [draft, setDraft] = React263.useState(null), draftRef = React263.useRef(draft);
    draftRef.current = draft;
    let slidesRef = React263.useRef(slides);
    slidesRef.current = slides;
    let editingRef = React263.useRef(editing);
    editingRef.current = editing;
    let sentTexts = React263.useRef([]), seenNotes = React263.useRef(void 0), resetDraft = (slide) => {
      sentTexts.current = [], seenNotes.current = slide?.notes ?? "", setDraft(slide === void 0 ? null : { id: slide.id, text: slide.notes ?? "" });
    };
    React263.useLayoutEffect(() => {
      let slide = slides[place.index], current2 = draftRef.current;
      if (slide?.id !== current2?.id)
        return resetDraft(slide);
      if (slide === void 0 || current2 === null)
        return;
      let notes = slide.notes ?? "";
      if (notes === seenNotes.current)
        return;
      seenNotes.current = notes;
      let echoed = sentTexts.current.findIndex((text) => (text.trim() === "" ? "" : text) === notes);
      if (echoed >= 0)
        return void sentTexts.current.splice(0, echoed + 1);
      notes !== current2.text && resetDraft(slide);
    }, [slides, place.index]);
    let [clock, setClock] = React263.useState(() => ({
      running: !0,
      start: first.since ?? Date.now(),
      accum: 0
    })), linkRef = React263.useRef(link), wide = useSpeakerNotesWindowWide(win, remote !== void 0 ? SPEAKER_NOTES_REMOTE_WIDE_MEDIA_QUERY : SPEAKER_NOTES_WIDE_MEDIA_QUERY);
    React263.useEffect(() => linkRef.current.listen((data) => {
      let message = (0, runtime2.parseSpeakerSlideMessage)(data);
      message !== null && setPlace(message);
    }), []);
    let toggleClock = () => {
      let now = Date.now();
      setClock((input) => input.running ? { running: !1, start: input.start, accum: input.accum + (now - input.start) } : { running: !0, start: now, accum: input.accum });
    }, resetClock = () => {
      setClock((input) => ({ ...input, start: Date.now(), accum: 0 }));
    }, blocked = React263.useRef({ prev: !1, next: !1 }), navigate = (delta) => {
      (delta === 1 ? blocked.current.next : blocked.current.prev) || linkRef.current.post({ type: "nav", delta });
    }, jump = (index4) => {
      linkRef.current.post({ type: "jump", index: index4 });
    }, exit = () => {
      linkRef.current.post({ type: "exit" });
    }, textareaRef = React263.useRef(null), startEditing = () => {
      resetDraft(slidesRef.current[place.index]), setEditing(!0);
    }, stopEditing = () => {
      setEditing(!1), linkRef.current.post({ type: "notes-end" });
    }, stopEditingRef = React263.useRef(stopEditing);
    stopEditingRef.current = stopEditing, React263.useEffect(() => {
      let textarea = textareaRef.current;
      !editing || textarea === null || (textarea.focus(), textarea.setSelectionRange(textarea.value.length, textarea.value.length));
    }, [editing]), React263.useEffect(() => {
      canEdit || !editingRef.current || (setEditing(!1), linkRef.current.post({ type: "notes-end" }));
    }, [canEdit]);
    let countRef = React263.useRef(place.count);
    countRef.current = place.count;
    let atEnd = place.index >= place.count - 1, noPrev = place.canPrev === !1, noNext = place.canNext === !1, trouble = remote?.trouble;
    blocked.current = remote === void 0 ? { prev: !1, next: !1 } : { prev: noPrev || trouble !== void 0, next: noNext || trouble !== void 0 };
    let onCloseRef = React263.useRef(remote?.onClose);
    onCloseRef.current = remote?.onClose;
    let notesRef = React263.useRef(null);
    React263.useLayoutEffect(() => {
      notesRef.current !== null && (notesRef.current.scrollTop = 0);
    }, [place.index]);
    let popout = remote === void 0;
    React263.useEffect(() => {
      popout && (win.document.title = formatMessage({ defaultMessage: "演讲者备注 · 第 {n} / {count} 页", id: "PFunK6URSx" }, { n: String(place.index + 1), count: String(place.count) }));
    }, [win, popout, place.index, place.count]), React263.useEffect(() => {
      let onKeyDown = (event) => {
        if (editingRef.current) {
          event.key === "Escape" && !event.isComposing && (event.preventDefault(), stopEditingRef.current());
          return;
        }
        let button = event.target?.closest?.("button:not(:disabled)");
        if (!(event.key === " " && button || speakerNotesOwnNavigationKey(event)))
          switch (event.key) {
            case "ArrowRight":
            case "ArrowDown":
            case "PageDown":
            case " ":
              event.preventDefault(), navigate(1);
              break;
            case "ArrowLeft":
            case "ArrowUp":
            case "PageUp":
              event.preventDefault(), navigate(-1);
              break;
            case "Home":
              event.preventDefault(), jump(0);
              break;
            case "End":
              event.preventDefault(), jump(countRef.current - 1);
              break;
            case "Escape":
              event.preventDefault(), (onCloseRef.current ?? exit)();
              break;
            default: {
              let digit = Number(event.key);
              Number.isInteger(digit) && digit >= 1 && digit <= countRef.current && jump(digit - 1);
            }
          }
      };
      return win.addEventListener("keydown", onKeyDown), () => win.removeEventListener("keydown", onKeyDown);
    }, [win]);
    let clockView = Jsx.jsx(SpeakerClock, { clock }), clockControls = Jsx.jsxs("span", {
      className: "sn-group",
      children: [
        Jsx.jsx("button", {
          type: "button",
          className: "sn-pill",
          onMouseDown: preventSpeakerControlMouseDown,
          onClick: toggleClock,
          children: clock.running ? formatMessage({ defaultMessage: "暂停", id: "5mcbL1PtIN" }) : formatMessage({ defaultMessage: "继续", id: "yD1WKbzRDS" })
        }),
        Jsx.jsx("button", {
          type: "button",
          className: "sn-pill",
          onMouseDown: preventSpeakerControlMouseDown,
          onClick: resetClock,
          children: formatMessage({ defaultMessage: "重置", id: "Xm6YRgdl7q" })
        })
      ]
    }), shown = remote?.place ?? place, position = (0, runtime2.formatSlidePositionLabel)(shown.index, shown.count), navControls = Jsx.jsxs("span", {
      className: "sn-group",
      children: [
        Jsx.jsx(SpeakerNotesControl, {
          label: formatMessage({ defaultMessage: "上一张幻灯片", id: "ykLuHvb6z3" }),
          disabledReason: noPrev ? runtime2.FIRST_SLIDE_LABEL : void 0,
          onClick: () => navigate(-1),
          children: Jsx.jsx(runtime2.KitIcon, { name: "CaretLeft", size: 16 })
        }),
        Jsx.jsx(SpeakerNotesControl, {
          label: formatMessage({ defaultMessage: "下一张幻灯片", id: "qukHgEoN+S" }),
          disabledReason: noNext ? runtime2.LAST_SLIDE_LABEL : void 0,
          onClick: () => navigate(1),
          children: Jsx.jsx(runtime2.KitIcon, { name: "CaretRight", size: 16 })
        })
      ]
    }), styles = React263.useMemo(() => Jsx.jsxs(Jsx.Fragment, {
      children: [
        Jsx.jsx("style", { children: fontCss }),
        Jsx.jsx("style", { children: runtime2.shapeStylesCss })
      ]
    }), [fontCss]), current = slides[place.index], readOnlyReason = draft === null ? formatMessage({ defaultMessage: "此处没有幻灯片。", id: "u37uVi16U0" }) : heldSlide(draft.id) !== void 0 ? runtime2.HELD_SLIDE_EDIT_MESSAGE : void 0, previous = place.index > 0 ? slides[place.index - 1] : void 0, next = atEnd ? void 0 : slides[place.index + 1], builds = remote === void 0 || current === void 0 ? 0 : (0, runtime2.slideBuildCount)(current), step = place.step ?? builds, nextLine = step < builds ? Jsx.jsx("div", {
      className: "sn-next",
      children: richMessage({ defaultMessage: "<dim>下一步：</dim>构建 {n} / {total}", id: "STeFpnka9e" }, {
        n: String(step + 1),
        total: String(builds),
        dim: (chunks) =>
        Jsx.jsx("span", { className: "sn-dim", children: chunks }, "dim")
      })
    }) : !wide && (place.next !== void 0 || atEnd) ? Jsx.jsx("div", {
      className: "sn-next",
      children: atEnd ? Jsx.jsx("span", { className: "sn-dim", children: runtime2.LAST_SLIDE_LABEL }) : richMessage({ defaultMessage: "<dim>下一页：</dim>{title}", id: "L3QmRnOZgu" }, {
        title: place.next,
        dim: (chunks) => Jsx.jsx("span", { className: "sn-dim", children: chunks }, "dim")
      })
    }) : null;
    return Jsx.jsxs("div", {
      className: "sn " + (wide ? "sn-wide" : "sn-compact") + (remote !== void 0 ? " sn-remote" : ""),
      children: [
        styles,
        Jsx.jsxs("div", {
          className: "sn-main",
          children: [
            Jsx.jsxs("div", {
              className: "sn-left",
              children: [
                Jsx.jsxs("div", {
                  className: "sn-bar",
                  children: [
                    remote !== void 0 ? Jsx.jsx(SpeakerNotesControl, {
                      label: "关闭遥控窗口",
                      onClick: remote.onClose,
                      children: Jsx.jsx(runtime2.KitIcon, { name: "X", size: 16 })
                    }) : null,
                    clockView,
                    clockControls,
                    Jsx.jsxs("span", {
                      className: "sn-group sn-pos",
                      children: [position, remote === void 0 ? navControls : null]
                    })
                  ]
                }),
                wide || remote !== void 0 ? Jsx.jsx(ResponsiveSpeakerSlidePreview, {
                  win,
                  className: "sn-slot sn-cur",
                  children: (width) => current !== void 0 ? Jsx.jsx(SpeakerSlidePreview, {
                    slide: current,
                    step: place.step,
                    assets,
                    width
                  }) : null
                }) : null,
                wide && remote !== void 0 && next !== void 0 ? Jsx.jsxs("div", {
                  className: "sn-navcol sn-upnext",
                  children: [
                    Jsx.jsxs("span", {
                      className: "sn-lbl",
                      children: [
                        (0, runtime2.formatMessage)({ defaultMessage:
                        "接下来", id: "J0Hd9xP9md" }),
                        Jsx.jsx("span", {
                          className: "sn-dim",
                          children: " · " + (0, runtime2.slideTitleSnippet)(next, 60)
                        })
                      ]
                    }),
                    Jsx.jsx(ResponsiveSpeakerSlidePreview, {
                      win,
                      className: "sn-slot",
                      children: (width) => Jsx.jsx(runtime2.SlideCanvas, {
                        slide: next,
                        assets,
                        width,
                        animate: !1,
                        structure: !1
                      })
                    })
                  ]
                }) : null,
                wide && remote === void 0 ? Jsx.jsxs("div", {
                  className: "sn-navrow",
                  children: [
                    Jsx.jsx(SpeakerAdjacentSlide, {
                      win,
                      heading: formatMessage({ defaultMessage: "上一页", id: "mW0Env/498" }),
                      goTo: (0, runtime2.formatMessage)({
                        defaultMessage: "转到上一页",
                        id: "vt23h5SYS7"
                      }),
                      slide: previous,
                      assets,
                      onClick: () => jump(place.index - 1)
                    }),
                    Jsx.jsx(SpeakerAdjacentSlide, {
                      win,
                      heading: formatMessage({ defaultMessage: "下一页", id: "sliMTlbl36" }),
                      goTo: (0, runtime2.formatMessage)({
                        defaultMessage: "转到下一页",
                        id: "lhNJz8GPOq"
                      }),
                      slide: next,
                      assets,
                      onClick: () => jump(place.index + 1)
                    })
                  ]
                }) : null
              ]
            }),
            Jsx.jsxs("div", {
              className: "sn-right",
              children: [
                Jsx.jsxs("div", {
                  className: "sn-head",
                  children: [
                    Jsx.jsx("span", { children: runtime2.SPEAKER_NOTES_LABEL }),
                    remote !== void 0 ? null : Jsx.jsxs("button", {
                      type: "button",
                      role: "switch",
                      "aria-checked": editing,
                      "aria-label": (0, runtime2.formatMessage)({
                        defaultMessage: "编辑备注",
                        id: "KHxgh4kwHv"
                      }),
                      title: canEdit ? formatMessage({
                        defaultMessage: "在此编辑备注",
                        id: "Zr+JZZBSkQ"
                      }) : runtime2.READ_ONLY_PRESENTATION_MESSAGE,
                      disabled: !canEdit,
                      className: "sn-switch",
                      onMouseDown: preventSpeakerControlMouseDown,
                      onClick: () => editing ? stopEditing() : startEditing(),
                      children: [
                        (0, runtime2.formatMessage)({ defaultMessage:"编辑", id: "8KUtEj8mtO" }), Jsx.jsx("i", { "aria-hidden": "true" })]
                    })
                  ]
                }),
                editing ? Jsx.jsx("textarea", {
                  ref: textareaRef,
                  "data-notes-scroll": "",
                  "aria-label": runtime2.NOTES_REGION_LABEL,
                  className: "sn-notes",
                  value: draft?.text ?? "",
                  readOnly: readOnlyReason !== void 0,
                  title: readOnlyReason,
                  maxLength: runtime2.maxSlideNotesLength,
                  placeholder: readOnlyReason ?? runtime2.SPEAKER_NOTES_DESCRIPTION,
                  onChange: (event) => {
                    if (draft === null || readOnlyReason !== void 0)
                      return;
                    let text = event.target.value;
                    setDraft({ id: draft.id, text }), sentTexts.current.push(text), linkRef.current.post({ type: "notes", id: draft.id, text });
                  }
                }) : Jsx.jsx("div", {
                  ref: notesRef,
                  tabIndex: 0,
                  role: "region",
                  "aria-label": runtime2.NOTES_REGION_LABEL,
                  "data-notes-scroll": "",
                  className: "sn-notes",
                  children: Jsx.jsx("div", {
                    children: place.notes === "" ? Jsx.jsx("span", {
                      className: "sn-dim",
                      children: remote?.notice ?? runtime2.NO_SPEAKER_NOTES_MESSAGE
                    }) : place.notes
                  })
                }),
                remote === void 0 ? nextLine : null
              ]
            })
          ]
        }),
        remote !== void 0 ? Jsx.jsxs(Jsx.Fragment, {
          children: [
            Jsx.jsx("div", {
              role: "status",
              children: trouble !== void 0 ? Jsx.jsx("div", { className: "sn-trouble", children: trouble }) : null
            }),
            Jsx.jsxs("div", {
              className: "sn-foot",
              children: [
                Jsx.jsxs("button", {
                  type: "button",
                  className: "sn-pad sn-pad-prev",
                  "aria-label": runtime2.PREVIOUS_SLIDE_LABEL,
                  title: trouble ?? (noPrev ? runtime2.FIRST_SLIDE_LABEL : void 0),
                  disabled: noPrev || trouble !== void 0,
                  "aria-busy": remote.pending === -1,
                  onClick: () => navigate(-1),
                  children: [
                    Jsx.jsx(runtime2.KitIcon, { name: "CaretLeft", size: 24 }),
                    Jsx.jsx("b", { children: runtime2.PREVIOUS_SLIDE_LABEL })
                  ]
                }),
                Jsx.jsxs("button", {
                  type: "button",
                  className: "sn-pad sn-pad-next",
                  title: trouble ?? (noNext ? runtime2.LAST_SLIDE_LABEL : void 0),
                  disabled: noNext || trouble !== void 0,
                  "aria-busy": remote.pending === 1,
                  onClick: () => navigate(1),
                  children: [
                    runtime2.NEXT_SLIDE_LABEL,
                    Jsx.jsx(runtime2.KitIcon, { name: "CaretRight", size: 20 })
                  ]
                })
              ]
            }),
            nextLine
          ]
        }) : null
      ]
    });
  }
function richMessage(descriptor, values) {
    let parts = (0, runtime2.formatMessage)(descriptor, values);
    return typeof parts == "string" ? parts : runtime2.ReactSpeakerNotesPanel.createElement(runtime2.ReactSpeakerNotesPanel.Fragment, null, ...parts);
  }
function SpeakerSlidePreview({ slide, step, assets, width }) {
    let ref = runtime2.ReactSpeakerNotesPanel.useRef(null);
    return runtime2.ReactSpeakerNotesPanel.useLayoutEffect(() => {
      let current = ref.current;
      if (current === null)
        return;
      let value = step === void 0 ? /* @__PURE__ */ new Set() : (0, runtime2.hiddenBuildFrameIds)(slide, step);
      for (let value2 of slide.frames) {
        let element = current.querySelector('[data-frame-id="' + value2.id.replace(/["\\]/g, "") + '"]');
        element !== null && (element.style.visibility = value.has(value2.id) ? "hidden" : "");
      }
    }, [slide, step, width]), SpeakerNotesPanelJsx.jsx("div", {
      ref,
      children: SpeakerNotesPanelJsx.jsx(runtime2.SlideCanvas, {
        slide,
        assets,
        width,
        animate: !1
      })
    });
  }
function ResponsiveSpeakerSlidePreview({ win, className, children }) {
    let ref = runtime2.ReactSpeakerNotesPanel.useRef(null), [value, value2] = runtime2.ReactSpeakerNotesPanel.useState(0);
    return runtime2.ReactSpeakerNotesPanel.useLayoutEffect(() => {
      let current = ref.current;
      if (current === null)
        return;
      let callback = () => value2(current.clientWidth);
      callback();
      let ResizeObserver2 = win.ResizeObserver;
      if (typeof ResizeObserver2 == "function") {
        let value3 = new ResizeObserver2(callback);
        return value3.observe(current), () => value3.disconnect();
      }
      return win.addEventListener("resize", callback), () => win.removeEventListener("resize", callback);
    }, [win]), SpeakerNotesPanelJsx.jsx("div", {
      ref,
      className,
      "data-appifact-content": "",
      children: value > 0 ? SpeakerNotesPanelJsx.jsx("div", {
        children: children(value)
      }) : null
    });
  }
function SpeakerAdjacentSlide({ win, heading, goTo, slide, assets, onClick }) {
    let value = (0, runtime2.slideTitleSnippet)(slide, 60);
    return SpeakerNotesPanelJsx.jsxs("div", {
      className: "sn-navcol" + (slide === void 0 ? " sn-empty" : ""),
      children: [
        SpeakerNotesPanelJsx.jsxs("span", {
          className: "sn-lbl",
          children: [
            heading,
            value !== "" ? SpeakerNotesPanelJsx.jsx("span", {
              className: "sn-dim",
              children: " · " + value
            }) : null
          ]
        }),
        SpeakerNotesPanelJsx.jsx("button", {
          type: "button",
          className: "sn-thumb",
          "aria-label": goTo,
          title: value !== "" ? value : void 0,
          disabled: slide === void 0,
          onMouseDown: preventSpeakerControlMouseDown,
          onClick,
          children: SpeakerNotesPanelJsx.jsx(ResponsiveSpeakerSlidePreview, {
            win,
            className: "sn-slot",
            children: (input) => slide !== void 0 ? SpeakerNotesPanelJsx.jsx(runtime2.SlideCanvas, {
              slide,
              assets,
              width: input,
              animate: !1,
              structure: !1
            }) : null
          })
        })
      ]
    });
  }
function SpeakerNotesControl({ label, disabledReason, onClick, children }) {
    return SpeakerNotesPanelJsx.jsx("button", {
      type: "button",
      "aria-label": label,
      title: disabledReason ?? label,
      disabled: disabledReason !== void 0,
      onMouseDown: preventSpeakerControlMouseDown,
      onClick,
      className: "sn-btn",
      children
    });
  }
  return bindRuntimeValue(runtime2, "SpeakerNotesPanelJsx", () => SpeakerNotesPanelJsx, (value) => {
    SpeakerNotesPanelJsx = value;
  }), bindRuntimeValue(runtime2, "SPEAKER_NOTES_WIDE_BREAKPOINT", () => SPEAKER_NOTES_WIDE_BREAKPOINT, (value) => {
    SPEAKER_NOTES_WIDE_BREAKPOINT = value;
  }), bindRuntimeValue(runtime2, "formatSpeakerElapsedTime", () => formatSpeakerElapsedTime), bindRuntimeValue(runtime2, "SPEAKER_NOTES_SCROLL_KEYS", () => SPEAKER_NOTES_SCROLL_KEYS, (value) => {
    SPEAKER_NOTES_SCROLL_KEYS = value;
  }), bindRuntimeValue(runtime2, "speakerNotesOwnNavigationKey", () => speakerNotesOwnNavigationKey), bindRuntimeValue(runtime2, "elapsedSpeakerClock", () => elapsedSpeakerClock), bindRuntimeValue(runtime2, "preventSpeakerControlMouseDown", () => preventSpeakerControlMouseDown, (value) => {
    preventSpeakerControlMouseDown = value;
  }), bindRuntimeValue(runtime2, "SpeakerClock", () => SpeakerClock), bindRuntimeValue(runtime2, "SPEAKER_NOTES_WIDE_MEDIA_QUERY", () => SPEAKER_NOTES_WIDE_MEDIA_QUERY, (value) => {
    SPEAKER_NOTES_WIDE_MEDIA_QUERY = value;
  }), bindRuntimeValue(runtime2, "SPEAKER_NOTES_REMOTE_WIDE_MEDIA_QUERY", () => SPEAKER_NOTES_REMOTE_WIDE_MEDIA_QUERY, (value) => {
    SPEAKER_NOTES_REMOTE_WIDE_MEDIA_QUERY = value;
  }), bindRuntimeValue(runtime2, "isSpeakerNotesWindowWide", () => isSpeakerNotesWindowWide), bindRuntimeValue(runtime2, "useSpeakerNotesWindowWide", () => useSpeakerNotesWindowWide), bindRuntimeValue(runtime2, "SpeakerNotesPanel", () => SpeakerNotesPanel), bindRuntimeValue(runtime2, "SpeakerSlidePreview", () => SpeakerSlidePreview), bindRuntimeValue(runtime2, "ResponsiveSpeakerSlidePreview", () => ResponsiveSpeakerSlidePreview), bindRuntimeValue(runtime2, "SpeakerAdjacentSlide", () => SpeakerAdjacentSlide), bindRuntimeValue(runtime2, "SpeakerNotesControl", () => SpeakerNotesControl), () => { (0, runtime2.initializeBuildEffects)(), (0, runtime2.initializeSlideRenderer)(), SpeakerNotesPanelJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SPEAKER_NOTES_WIDE_BREAKPOINT = 640, SPEAKER_NOTES_SCROLL_KEYS = /* @__PURE__ */ new Set([
      "ArrowUp",
      "ArrowDown",
      "Home",
      "End"
    ]), preventSpeakerControlMouseDown = (event) => event.preventDefault(), SPEAKER_NOTES_WIDE_MEDIA_QUERY = "(min-width: " + String(SPEAKER_NOTES_WIDE_BREAKPOINT) + "px)", SPEAKER_NOTES_REMOTE_WIDE_MEDIA_QUERY = "(min-width: 900px) and (min-height: 600px) and (orientation: landscape)"; };
}
