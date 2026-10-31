// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installPresentationPlayer(runtime2) {
  var ReactPresentation, PresentationReactDom, PresentationJsx, PRESENTATION_CONTROLS_HIDE_DELAY_MS, PRESENTATION_FOCUSABLE_SELECTOR, PRESENTATION_NAVIGATION_KEYS, presentationModeActive, pendingPresentationFullscreenRequest;
  function isPresentationNavigationKey(key, slideCount) {
    if (PRESENTATION_NAVIGATION_KEYS.has(key))
      return !0;
    let number = Number(key);
    return Number.isInteger(number) && number >= 1 && number <= slideCount;
  }
  function ensurePresentationFullscreen() {
    if (pendingPresentationFullscreenRequest !== null)
      return pendingPresentationFullscreenRequest;
    let value = (0, runtime2.requestFullscreen)(document.documentElement).then((source) => (pendingPresentationFullscreenRequest === value && (pendingPresentationFullscreenRequest = null), source.kind === "entered" && !presentationModeActive && (0, runtime2.exitFullscreen)(), source));
    return pendingPresentationFullscreenRequest = value, value;
  }
  function requestPresentationFullscreen() {
    return ensurePresentationFullscreen();
  }
  function createSpeakerSlideMessage(slides, index4, step, since) {
    let value = Math.max(0, Math.min(slides.length - 1, index4)), value2 = slides[value], value3 = (0, runtime2.slideTitleSnippet)(slides[value + 1], 80), value4 = value2 === void 0 ? 0 : (0, runtime2.slideBuildCount)(value2);
    return {
      type: "slide",
      index: value,
      count: slides.length,
      since,
      step,
      notes: (0, runtime2.truncateUtf16Safely)((value2?.notes ?? "").trim(), runtime2.maxSlideNotesLength),
      ...value3 === "" ? {} : {
        next: value3
      },
      canPrev: step > 0 || value > 0,
      canNext: step < value4 || value < slides.length - 1 || !1
    };
  }
  function frameAttributeSelector(frameId) {
    return '[data-frame-id="' + frameId.replace(/["\\]/g, "") + '"]';
  }
  function presentationPrefersReducedMotion() {
    return typeof window.matchMedia == "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function PresentationView({ slides, assets, startIndex, onExit, onIndexChange, dockNotes = !1, fontCss, heldSlide, editNotes, remote = !1, fullscreenRequest }) {
    let [value, value2] = ReactPresentation.useState(() => ({
      index: Math.max(0, Math.min(slides.length - 1, startIndex)),
      step: 0
    })), value3 = slides.map((input) => input.id), ref = ReactPresentation.useRef({
      ids: value3,
      stageId: value3[value.index]
    }), value4 = value;
    if (!(0, runtime2.presentationOrdersEqual)(value3, ref.current.ids)) {
      let current = ref.current, value27 = (0, runtime2.preservePresentationSlideIndex)(current.ids, value3, current.stageId, value.index);
      (value27 !== value.index || value3[value27] !== current.stageId) && (value4 = {
        index: value27,
        step: value3[value27] === current.stageId ? value.step : 0
      });
    }
    ReactPresentation.useLayoutEffect(() => {
      (value4.index !== value.index || value4.step !== value.step) && value2(value4), ref.current = {
        ids: value3,
        stageId: value3[value4.index]
      };
    });
    let index4 = value4.index, [value5, value6] = ReactPresentation.useState(null), [value7, value8] = ReactPresentation.useState(0.5), [value9, value10] = ReactPresentation.useState(!0), [value11, value12] = ReactPresentation.useState(!0), ref2 = ReactPresentation.useRef(void 0), ref3 = ReactPresentation.useRef(!1), focusKeeper = ReactPresentation.useRef(null), ref4 = ReactPresentation.useRef(null), ref5 = ReactPresentation.useRef(null), ref6 = ReactPresentation.useRef(null), ref7 = ReactPresentation.useRef(null), ref8 = ReactPresentation.useRef(null), ref9 = ReactPresentation.useRef(null), pagingButtonAt = (x, y) => [
      ...ref4.current?.querySelectorAll("[data-present-paging]") ?? []
    ].find((button) => {
      let box = button.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    }), pagingPress = ReactPresentation.useRef(void 0), value13 = (0, runtime2.useSpeakerNotesSession)(), [value14, value15] = ReactPresentation.useState(() => value13 !== null ? "window" : dockNotes ? "panel" : "off"), value16 = (0, runtime2.useCoarsePointer)(), [value17, value18] = ReactPresentation.useState(!1), ref10 = ReactPresentation.useRef(Date.now()), [value19] = ReactPresentation.useState(() => (0, runtime2.fullscreenAvailable)()), [value20, value21] = ReactPresentation.useState(() => (0, runtime2.getFullscreenElement)() !== null), [value22, value23] = ReactPresentation.useState(!1), ref11 = ReactPresentation.useRef(value20), ref12 = ReactPresentation.useRef(!1);
    ref12.current = value22;
    let ref13 = ReactPresentation.useRef(0), ref14 = ReactPresentation.useRef(!1), ref15 = ReactPresentation.useRef(!1), ref16 = ReactPresentation.useRef(fullscreenRequest === "next" && (0, runtime2.fullscreenAvailable)()), callback = ReactPresentation.useCallback(() => {
      ref14.current = !0, (0, runtime2.exitFullscreen)();
    }, []), callback2 = ReactPresentation.useCallback((source, options) => {
      source.kind === "entered" && (ref11.current = !0, ref13.current = Date.now()), source.kind === "denied" && options && value23(!0);
    }, []), callback3 = ReactPresentation.useCallback(() => {
      ref2.current !== void 0 && clearTimeout(ref2.current), ref2.current = setTimeout(() => {
        let current = ref4.current;
        ref3.current && focusKeeper.current === null && current !== null && current.contains(current.ownerDocument.activeElement) || value10(!1);
      }, 1800);
    }, []), callback4 = ReactPresentation.useCallback(() => {
      value10(!0), value12(!0), callback3();
    }, [callback3]), ref17 = ReactPresentation.useRef(value4);
    ref17.current = value4;
    let ref18 = ReactPresentation.useRef(value5);
    ref18.current = value5;
    let ref19 = ReactPresentation.useRef(slides);
    ref19.current = slides;
    let ref20 = ReactPresentation.useRef(0), callback5 = ReactPresentation.useCallback((input) => {
      let value27 = input >= 0 ? 1 : -1, current = ref19.current;
      if (current.length === 0)
        return;
      let current2 = ref17.current;
      ref18.current !== null && value6(null);
      let value28 = Math.max(0, Math.min(current.length - 1, current2.index));
      if (value28 !== current2.index) {
        value2({
          index: value28,
          step: 0
        });
        return;
      }
      let state = {
        index: value28,
        step: Math.min(current2.step, (0, runtime2.slideBuildCount)(current[value28]))
      };
      state.step !== current2.step && value2(state);
      let value29 = current[state.index];
      if (value29 !== void 0)
        if (value27 === 1) {
          if (state.step < (0, runtime2.slideBuildCount)(value29)) {
            value2({
              index: state.index,
              step: state.step + 1
            });
            return;
          }
          if (state.index >= current.length - 1)
            return;
          let state2 = {
            index: state.index + 1,
            step: 0
          };
          value29.transition !== void 0 && !presentationPrefersReducedMotion() && value6({
            from: state,
            to: state2,
            kind: value29.transition,
            back: !1,
            key: ++ref20.current
          }), value2(state2);
        } else {
          if (state.step > 0) {
            value2({
              index: state.index,
              step: state.step - 1
            });
            return;
          }
          if (state.index <= 0)
            return;
          let value30 = current[state.index - 1], state2 = {
            index: state.index - 1,
            step: (0, runtime2.slideBuildCount)(value30)
          };
          value30.transition !== void 0 && !presentationPrefersReducedMotion() && value6({
            from: state,
            to: state2,
            kind: value30.transition,
            back: !0,
            key: ++ref20.current
          }), value2(state2);
        }
    }, []), callback6 = ReactPresentation.useCallback((input) => {
      value6(null), value2({
        index: Math.max(0, Math.min(ref19.current.length - 1, input)),
        step: 0
      });
    }, []);
    ReactPresentation.useLayoutEffect(() => {
      let current = ref9.current;
      if (!current)
        return;
      let callback15 = () => value8(Math.min(current.clientWidth / runtime2.SLIDE_WIDTH, current.clientHeight / runtime2.SLIDE_HEIGHT));
      callback15();
      let observer = new ResizeObserver(callback15);
      return observer.observe(current), () => observer.disconnect();
    }, []), ReactPresentation.useEffect(() => {
      ref9.current?.focus({
        preventScroll: !0
      });
    }, []);
    let value24 = slides[index4] !== void 0;
    ReactPresentation.useLayoutEffect(() => {
      let current = ref8.current;
      if (!value24 || !current)
        return;
      let restore = (0, runtime2.inertPresentationSiblings)(current);
      return current.ownerDocument.documentElement.setAttribute("data-presenting", ""), () => {
        restore(), current.ownerDocument.documentElement.removeAttribute("data-presenting");
      };
    }, [value24]);
    let ref21 = ReactPresentation.useRef(index4);
    ref21.current = index4;
    let ref22 = ReactPresentation.useRef(callback5);
    ref22.current = callback5;
    let advance = ReactPresentation.useCallback((target) => {
      let played = !1;
      return played || ref22.current(1), played;
    }, []), spaceAdvanced = ReactPresentation.useRef(!1), ref23 = ReactPresentation.useRef(callback6);
    ref23.current = callback6;
    let ref24 = ReactPresentation.useRef(onExit);
    ref24.current = onExit, ReactPresentation.useEffect(() => {
      onIndexChange?.(index4);
    }, [index4, onIndexChange]), ReactPresentation.useLayoutEffect(() => {
      presentationModeActive = !0;
      let callback15 = (input) => {
        ref11.current = input !== null, value21(input !== null);
      }, value27 = (0, runtime2.subscribeFullscreenChange)((input) => {
        if (callback4(), callback15(input), input !== null) {
          ref14.current = !1, ref15.current = !1, ref16.current = !1, value23(!1);
          return;
        }
        let value28 = ref13.current !== 0 && Date.now() - ref13.current >= PRESENTATION_CONTROLS_HIDE_DELAY_MS && !ref14.current && !ref15.current && document.hasFocus();
        ref16.current = ref15.current, ref14.current = !1, ref15.current = !1, ref13.current = 0, value28 && ref24.current(ref21.current);
      });
      return callback15((0, runtime2.getFullscreenElement)()), () => {
        presentationModeActive = !1, pendingPresentationFullscreenRequest = null, value27(), (0, runtime2.exitFullscreen)();
      };
    }, [callback4]);
    let ref25 = ReactPresentation.useRef(!0);
    ReactPresentation.useEffect(() => (ref25.current = !0, () => {
      ref25.current = !1;
    }), []);
    let callback7 = ReactPresentation.useCallback((input, options) => {
      input.then((input2) => {
        ref25.current && callback2(input2, options);
      });
    }, [callback2]), ref26 = ReactPresentation.useRef(typeof fullscreenRequest == "object" ? fullscreenRequest : null);
    ReactPresentation.useEffect(() => {
      ref26.current !== null && callback7(ref26.current, !0);
    }, [callback7]);
    let callback8 = ReactPresentation.useCallback(() => {
      if (callback4(), ref16.current = !1, ref15.current = !1, (0, runtime2.getFullscreenElement)() !== null) {
        callback();
        return;
      }
      ref12.current || callback7(ensurePresentationFullscreen(), !0);
    }, [callback4, callback7, callback]), ref27 = ReactPresentation.useRef(callback8);
    ref27.current = callback8;
    let callback9 = ReactPresentation.useCallback(() => ((0, runtime2.getFullscreenElement)() !== null && (ref15.current = !1), !ref16.current || (ref16.current = !1, (0, runtime2.getFullscreenElement)() !== null || ref12.current) ? !1 : (callback4(), callback7(ensurePresentationFullscreen(), !1), !0)), [callback4, callback7]), ref28 = ReactPresentation.useRef(callback9);
    ref28.current = callback9;
    let callback10 = ReactPresentation.useCallback(() => {
      ref15.current = (0, runtime2.getFullscreenElement)() !== null || ref11.current;
    }, []), ref29 = ReactPresentation.useRef(slides.length);
    ref29.current = slides.length, ReactPresentation.useEffect(() => {
      callback4();
      let toastButton = (target) => target instanceof Element ? target.closest('[data-cds="Toast"] button:not(:disabled)') : null, toastFocusVisible = !1, leftFocus = null, callback15 = (event) => {
        if (focusKeeper.current = null, event.repeat || (spaceAdvanced.current = !1), event.key === "Tab" && !event.ctrlKey && !event.metaKey && ref8.current) {
          let current = ref8.current, ownerDocument2 = current.ownerDocument, activeElement2 = ownerDocument2.activeElement;
          if (activeElement2 !== null && activeElement2 !== ownerDocument2.body && activeElement2 !== ownerDocument2.documentElement && !current.contains(activeElement2))
            return;
          let focusables = Array.from(current.querySelectorAll(PRESENTATION_FOCUSABLE_SELECTOR)).filter((input) => input.tabIndex >= 0 && !input.hasAttribute("disabled") && !input.hasAttribute(runtime2.playerBeforeAttribute) && input.closest('[hidden], [inert], [aria-hidden="true"]') === null && ownerDocument2.defaultView?.getComputedStyle(input).display !== "none");
          if (event.preventDefault(), focusables.length === 0)
            return;
          let at = activeElement2 === null ? -1 : focusables.indexOf(activeElement2), stride = event.shiftKey ? focusables.length - 1 : 1, target = event.shiftKey ? at <= 0 ? focusables.length - 1 : at - 1 : at < 0 || at === focusables.length - 1 ? 0 : at + 1, focusFrom = (tried, first) => {
            if (!(!first && ownerDocument2.activeElement !== activeElement2))
              for (; tried < focusables.length; tried++, target = (target + stride) % focusables.length) {
                let candidate = focusables[target];
                if ((0, runtime2.focusVideoPlayerElement)(candidate), ownerDocument2.activeElement === candidate)
                  return;
                if (first && candidate.tagName === "IFRAME")
                  return void setTimeout(focusFrom, 0, tried, !1);
              }
          };
          focusFrom(0, !0);
          return;
        }
        if (event.target instanceof Element && ref8.current?.contains(event.target) && (0, runtime2.speakerNotesOwnNavigationKey)(event)) {
          event.stopPropagation();
          return;
        }
        if (!(event.key === " " && ref3.current && event.target instanceof Node && ref4.current?.contains(event.target) === !0) && !(event.key === " " && event.target instanceof Element && event.target.closest("[data-video-control] button:not(:disabled)") !== null) && !(event.key === " " && toastFocusVisible && toastButton(event.target) !== null)) {
          if (event.key === " " && event.target instanceof Element && event.target.hasAttribute("data-takes-space-key")) {
            event.preventDefault(), spaceAdvanced.current = !0;
            return;
          }
          if (!event.repeat && !(event.metaKey || event.ctrlKey || event.altKey) && isPresentationNavigationKey(event.key, ref29.current) && ref28.current()) {
            event.preventDefault();
            return;
          }
          switch (event.key) {
            case "ArrowRight":
            case "ArrowDown":
            case "PageDown":
            case " ":
              if (event.preventDefault(), event.repeat && spaceAdvanced.current)
                break;
              spaceAdvanced.current = advance(event.target);
              break;
            case "ArrowLeft":
            case "ArrowUp":
            case "PageUp":
              event.preventDefault(), ref22.current(-1);
              break;
            case "Home":
              event.preventDefault(), ref23.current(0);
              break;
            case "End":
              event.preventDefault(), ref23.current(ref29.current - 1);
              break;
            case "Escape":
              event.preventDefault(), ref24.current(ref21.current);
              break;
            case "f":
            case "F":
              if (event.repeat || event.metaKey || event.ctrlKey || event.altKey)
                break;
              event.preventDefault(), ref27.current();
              break;
            default: {
              let digit = Number(event.key);
              Number.isInteger(digit) && digit >= 1 && digit <= ref29.current && ref23.current(digit - 1);
            }
          }
        }
      }, onFocusIn = (event) => {
        event.target !== leftFocus && (toastFocusVisible = toastButton(event.target)?.matches(":focus-visible") === !0), leftFocus = null;
      }, onFocusOut = (event) => {
        leftFocus = event.target instanceof Node && event.target.ownerDocument?.activeElement === event.target ? event.target : null;
      }, onPointerDown = (event) => {
        event.target instanceof Element && event.target.closest('[data-cds="Toast"]') !== null && (toastFocusVisible = !1);
      };
      return window.addEventListener("keydown", callback15, !0), window.addEventListener("focusin", onFocusIn, !0), window.addEventListener("focusout", onFocusOut, !0), window.addEventListener("pointerdown", onPointerDown, !0), () => {
        window.removeEventListener("keydown", callback15, !0), window.removeEventListener("focusin", onFocusIn, !0), window.removeEventListener("focusout", onFocusOut, !0), window.removeEventListener("pointerdown", onPointerDown, !0), ref2.current !== void 0 && clearTimeout(ref2.current);
      };
    }, [callback4]);
    let callback11 = ReactPresentation.useCallback((input) => createSpeakerSlideMessage(ref19.current, input, ref17.current.step, ref10.current), []), ref30 = ReactPresentation.useRef(assets);
    ref30.current = assets;
    let ref31 = ReactPresentation.useRef(fontCss);
    ref31.current = fontCss;
    let ref32 = ReactPresentation.useRef(editNotes);
    ref32.current = editNotes;
    let ref33 = ReactPresentation.useRef(null), callback12 = ReactPresentation.useCallback(() => {
      let current = ref33.current;
      ref33.current = null, current !== null && ref32.current?.end(current);
    }, []), ref34 = ReactPresentation.useRef(editNotes);
    ReactPresentation.useEffect(() => {
      let current = ref34.current;
      if (ref34.current = editNotes, editNotes !== void 0 || current === void 0 || ref33.current === null)
        return;
      let current2 = ref33.current;
      ref33.current = null, current.end(current2);
    }, [editNotes]);
    let callback13 = ReactPresentation.useCallback((input) => PresentationJsx.jsx(runtime2.slideSnapshotsEnabledContext.Provider, {
      value: !0,
      children: PresentationJsx.jsx(runtime2.SpeakerNotesPanel, {
        first: callback11(ref21.current),
        link: (0, runtime2.speakerPortLink)(input.peer),
        win: input.win,
        slides: ref19.current,
        assets: ref30.current,
        fontCss: ref31.current,
        canEdit: ref32.current !== void 0,
        ...heldSlide !== void 0 ? {
          heldSlide
        } : {}
      }, ref10.current)
    }), [callback11, heldSlide]);
    ReactPresentation.useLayoutEffect(() => {
      if (value13 === null)
        return;
      let view = value13.view;
      return value13.render(callback13(view)), view.port.onmessage = (input) => {
        let value27 = (0, runtime2.parseSpeakerNavigateMessage)(input.data), value28 = (0, runtime2.parseSpeakerJumpMessage)(input.data), value29 = (0, runtime2.parseSpeakerNotesMessage)(input.data);
        if (value27 !== null && value27.delta > 0)
          advance();
        else if (value27 !== null)
          ref22.current(value27.delta);
        else if (value28 !== null)
          ref23.current(value28.index);
        else if ((0, runtime2.parseSpeakerExitMessage)(input.data) !== null)
          ref24.current(ref21.current);
        else if ((0, runtime2.parseSpeakerNotesEndMessage)(input.data) !== null)
          callback12();
        else if (value29 !== null) {
          let value30 = ref19.current.find((input2) => input2.id === value29.id), current = ref32.current;
          if (value30 === void 0 || current === void 0)
            return;
          ref33.current?.id !== value30.id && (callback12(), ref33.current = value30), current.live((0, runtime2.setSlideSpeakerNotes)(value30, value29.text.trim() === "" ? void 0 : value29.text));
        }
      }, value15("window"), () => {
        view.port.onmessage = null, value13.render(null), callback12(), value15((input) => input === "window" ? "off" : input);
      };
    }, [value13, callback13, callback12]);
    let callback14 = ReactPresentation.useCallback(() => {
      if (callback4(), value13 !== null) {
        value13.close();
        return;
      }
      if (value14 === "panel") {
        value15("off");
        return;
      }
      let value27 = (0, runtime2.getFullscreenElement)() !== null || ref11.current;
      if (value16 || !value27 && (0, runtime2.isFullscreenOrEntering)()) {
        value15("panel");
        return;
      }
      ref15.current = value27, (0, runtime2.openSpeakerNotes)().kind !== "opened" && (ref15.current = !1, value18(!0), value15("panel"));
    }, [callback4, value13, value14, value16]);
    ReactPresentation.useEffect(() => {
      value13?.view.port.postMessage(callback11(index4));
    }, [value13, index4, value4.step, slides, callback11]);
    let remoteHostRef = ReactPresentation.useRef(null);
    ReactPresentation.useEffect(() => {
      if (!remote)
        return;
      let host = (0, runtime2.createRemoteStageHost)({
        at() {
          let { index: at, count, step = 0, canPrev = !1, canNext = !1 } = callback11(ref21.current), show = ref10.current;
          return {
            show,
            id: ref19.current[at]?.id ?? "",
            index: at,
            count,
            step,
            elapsed: Math.max(0, Date.now() - show),
            canPrev,
            canNext
          };
        },
        go: (delta) => PresentationReactDom.flushSync(() => void (delta > 0 ? advance() : ref22.current(delta))),
        goTo(slideId) {
          let at = ref19.current.findIndex((slide) => slide.id === slideId);
          at >= 0 && PresentationReactDom.flushSync(() => ref23.current(at));
        }
      }), onPageShow = (event) => void (event.persisted && host.back());
      return remoteHostRef.current = host, window.addEventListener("pagehide", host.away), window.addEventListener("pageshow", onPageShow), () => {
        window.removeEventListener("pagehide", host.away), window.removeEventListener("pageshow", onPageShow), remoteHostRef.current = null, host.end();
      };
    }, [remote, callback11, advance]), ReactPresentation.useEffect(() => {
      remoteHostRef.current?.moved();
    }, [slides, index4, value4.step]), ReactPresentation.useEffect(() => {
      value13 !== null && value13.render(callback13(value13.view));
    }, [value13, slides, assets, fontCss, editNotes, callback13]);
    let ref35 = ReactPresentation.useRef(null), ref36 = ReactPresentation.useRef(slides[index4]);
    ref36.current = slides[index4];
    let ref37 = ReactPresentation.useRef(null), value25 = slides[index4] !== void 0;
    ReactPresentation.useEffect(() => {
      let current = ref35.current;
      if (!current)
        return;
      let value27 = (0, runtime2.createSlideAnimationEngine)({
        root: current,
        resolveBag: (input) => replayClickedNodeAnimation(ref36.current, input)
      });
      return ref37.current = value27, () => {
        value27.dispose(), ref37.current = null;
      };
    }, [value25]), ReactPresentation.useEffect(() => {
      ref37.current?.refresh();
    }, [value4, slides]);
    let ref38 = ReactPresentation.useRef(null), ref39 = ReactPresentation.useRef([]), ref40 = ReactPresentation.useRef(void 0);
    ReactPresentation.useLayoutEffect(() => {
      let current = ref35.current, value27 = ref19.current[value4.index];
      if (current === null || value27 === void 0)
        return;
      let callback15 = (input) => current.querySelector(frameAttributeSelector(input)), value28 = (0, runtime2.hiddenBuildFrameIds)(value27, value4.step), current2 = ref38.current;
      if (current2 !== null && current2.index === value4.index && current2.step === value4.step) {
        let values = new Set(ref39.current.filter((input) => input.playState === "running").map((input) => input.effect?.target));
        for (let value31 of value27.frames) {
          let value32 = callback15(value31.id);
          value32 !== null && !values.has(value32) && (value32.style.visibility = value28.has(value31.id) ? "hidden" : "");
        }
        return;
      }
      ref38.current = value4;
      for (let value31 of ref39.current)
        value31.cancel();
      ref39.current = [];
      for (let value31 of value27.frames) {
        let value32 = callback15(value31.id);
        value32 !== null && (value32.style.visibility = value28.has(value31.id) ? "hidden" : "");
      }
      if (current2 !== null && current2.index === value4.index && value4.step === current2.step + 1 && !presentationPrefersReducedMotion())
        for (let value31 of (0, runtime2.slideBuildStepEffects)(value27, value4.step)) {
          let value32 = callback15(value31.frame.id);
          if (value32 === null)
            continue;
          let value33 = (0, runtime2.buildEffectTransition)(value31.effect), value34 = value32.style.transform !== "" && value32.style.transform !== "none" ? value32.style.transform : "", state = {
            transform: (value34 + " " + value33.transform).trim() || "none",
            opacity: 0
          }, state2 = {
            transform: value34 === "" ? "none" : value34,
            opacity: 1
          };
          if (value32.style.visibility = "", value31.dir === "in")
            ref39.current.push(value32.animate([state, state2], {
              duration: runtime2.buildEffectDurationMs,
              easing: value33.easing,
              fill: "none"
            }));
          else {
            let value35 = value32.animate([state2, state], {
              duration: runtime2.buildEffectDurationMs,
              easing: runtime2.buildExitEasing,
              fill: "none"
            });
            value35.finished.then(() => {
              value32.style.visibility = "hidden";
            }, () => {
            }), ref39.current.push(value35);
          }
        }
      ref40.current !== void 0 && clearTimeout(ref40.current);
      let value29 = current2 !== null && current2.index === value4.index && value4.step < current2.step, value30 = value4.step + 1;
      if (!value29 && value30 <= (0, runtime2.slideBuildCount)(value27) && (0, runtime2.slideBuildStepIsAutomatic)(value27, value30)) {
        let value31 = current2 !== null && current2.index === value4.index ? runtime2.buildEffectDurationMs + 140 : 600;
        ref40.current = setTimeout(() => {
          let current3 = ref17.current;
          current3.index === value4.index && current3.step === value4.step && value2({
            index: value4.index,
            step: value30
          });
        }, value31);
      }
    }, [value4, slides]), ReactPresentation.useEffect(() => () => {
      ref40.current !== void 0 && clearTimeout(ref40.current);
    }, []);
    let value26 = slides[index4];
    return value26 ? PresentationReactDom.createPortal(PresentationJsx.jsxs("div", {
      ref: ref8,
      tabIndex: -1,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "演示文稿",
      "data-appifact-content": "",
      className: "fixed inset-0 z-50 flex flex-col bg-black outline-none",
      onPointerMove: (input) => {
        let current = ref7.current;
        ref7.current = [input.clientX, input.clientY], input.buttons === 0 && (current === null || current[0] !== input.clientX || current[1] !== input.clientY) && callback4();
      },
      onPointerDownCapture: (input) => {
        ref5.current = input.pointerType, pagingPress.current = pagingButtonAt(input.clientX, input.clientY);
      },
      onPointerCancelCapture: (input) => {
        ref5.current = null, (input.pointerType === "touch" || input.pointerType === "pen") && callback4();
      },
      onClickCapture: () => {
        ref6.current = ref5.current, ref5.current = null;
      },
      onClick: (input) => {
        let current = ref6.current;
        if (callback9())
          return;
        let button = pagingButtonAt(input.clientX, input.clientY);
        if (current === "mouse" && button !== void 0 && button === pagingPress.current)
          return button.click();
        let value27 = ref4.current?.getBoundingClientRect(), value28 = value27 !== void 0 && input.clientX >= value27.left && input.clientX <= value27.right && input.clientY >= value27.top && input.clientY <= value27.bottom;
        (current === "touch" || current === "pen" || value28) && callback4();
        let bounds = input.currentTarget.getBoundingClientRect();
        input.clientX < bounds.left + bounds.width / 2 ? callback5(-1) : advance();
      },
      children: [
        PresentationJsx.jsxs("div", {
          ref: ref9,
          tabIndex: -1,
          role: "application",
          "aria-label": "幻灯片放映",
          className: "relative min-h-0 flex-1 outline-none",
          children: [
            PresentationJsx.jsxs("div", {
              style: {
                position: "absolute",
                left: "50%",
                top: "50%",
                "--slide-scale": value7,
                width: runtime2.SLIDE_WIDTH,
                height: runtime2.SLIDE_HEIGHT,
                transform: "translate(-50%, -50%) scale(" + String(value7) + ")",
                overflow: "hidden"
              },
              children: [
                PresentationJsx.jsx("div", {
                  ref: ref35,
                  style: {
                    position: "absolute",
                    inset: 0,
                    isolation: "isolate"
                  },
                  children: PresentationJsx.jsx(runtime2.slideSnapshotsEnabledContext.Provider, {
                    value: !1,
                    children: PresentationJsx.jsx(runtime2.SlideSurface, {
                      slide: value26,
                      assets,
                      links: "open",
                      onLinkOpen: callback10,
                      underlay: value5 !== null && value5.kind === "magic" && slides[value5.from.index] !== void 0 && slides[value5.from.index].bg !== value26.bg ? PresentationJsx.jsx("div", {
                        "data-bg-veil": "",
                        style: {
                          position: "absolute",
                          inset: 0,
                          background: (0, runtime2.slideBackgroundColor)(slides[value5.from.index].bg)
                        }
                      }, value5.key) : void 0
                    })
                  })
                }),
                value5 !== null ? PresentationJsx.jsx(PresentationSlideTransition, {
                  trans: value5,
                  slides,
                  assets,
                  scale: value7,
                  mainRef: ref35,
                  onDone: () => value6(null)
                }, value5.key) : null
              ]
            }),
            PresentationJsx.jsx(runtime2.SlideNavigationAnnouncement, {
              slideKey: value26.id,
              announceMount: !0,
              message: () => (0, runtime2.formatPresentationSlideAnnouncement)(index4, slides.length, (0, runtime2.slideTitleSnippet)(value26))
            }),
            PresentationJsx.jsx(runtime2.LiveAnnouncer, {}),
            PresentationJsx.jsxs("div", {
              ref: ref4,
              "data-present-pager": "",
              className: "absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/85 p-2 text-xs text-white shadow-lg transition-opacity duration-300 select-none pointer-coarse:gap-0.5 pointer-coarse:text-body " + (value14 === "panel" ? "bottom-5" : "bottom-[calc(1.25rem+var(--sl-safe-b,0px))]"),
              style: {
                opacity: value9 ? 1 : 0,
                pointerEvents: value11 ? "auto" : "none"
              },
              onTransitionEnd: () => {
                value9 || value12(!1);
              },
              onFocus: (event) => {
                event.target !== focusKeeper.current && (ref3.current = event.target.matches(":focus-visible")), focusKeeper.current = null, callback4();
              },
              onBlur: (event) => {
                let kept = event.target.ownerDocument.activeElement === event.target;
                focusKeeper.current = kept ? event.target : null, kept || (ref3.current = !1), callback3();
              },
              onPointerDown: () => {
                ref3.current = !1;
              },
              onClick: (input) => {
                input.stopPropagation(), callback4();
              },
              children: [
                PresentationJsx.jsx(PresentationControlButton, {
                  icon: "CaretLeft",
                  label: runtime2.PREVIOUS_SLIDE_LABEL,
                  paging: !0,
                  onClick: () => callback5(-1)
                }),
                PresentationJsx.jsxs("span", {
                  className: "min-w-12 px-1 text-center tabular-nums whitespace-nowrap pointer-coarse:min-w-15",
                  children: [
                    index4 + 1,
                    PresentationJsx.jsxs("span", {
                      className: "text-white/50",
                      children: [" / ", slides.length]
                    })
                  ]
                }),
                PresentationJsx.jsx(PresentationControlButton, {
                  icon: "CaretRight",
                  label: runtime2.NEXT_SLIDE_LABEL,
                  paging: !0,
                  onClick: () => void advance()
                }),
                PresentationJsx.jsx("span", {
                  className: "mx-1 h-3.5 w-px bg-white/20"
                }),
                (0, runtime2.slidesHaveSpeakerNotes)(slides) || value14 !== "off" ? PresentationJsx.jsx(PresentationControlButton, {
                  icon: "BookText",
                  label: value14 === "off" ? value20 && !value16 && !value17 ? (0, runtime2.formatMessage)({
                    defaultMessage: "显示演讲者备注（退出全屏，点击幻灯片可返回）",
                    id: "m1i1GAlRMC"
                  }) : runtime2.SHOW_SPEAKER_NOTES_LABEL : value14 === "window" ? (0, runtime2.formatMessage)({
                    defaultMessage: "关闭演讲者备注窗口",
                    id: "gHWsKkT8vx"
                  }) : runtime2.HIDE_SPEAKER_NOTES_LABEL,
                  pressed: value14 !== "off",
                  onClick: callback14
                }) : null,
                value19 ? PresentationJsx.jsx(PresentationControlButton, {
                  icon: value20 ? "Collapse" : "Expand",
                  label: value20 ? (0, runtime2.formatMessage)({
                    defaultMessage: "退出全屏（F）",
                    id: "pfcQ3IrBzR"
                  }) : value22 ? (0, runtime2.formatMessage)({
                    defaultMessage: "此处不支持全屏",
                    id: "OEroDCgOt3"
                  }) : (0, runtime2.formatMessage)({
                    defaultMessage: "全屏（F）",
                    id: "S4estI6rGO"
                  }),
                  unavailable: value22 && !value20,
                  keys: "F",
                  onClick: callback8
                }) : null,
                PresentationJsx.jsx(PresentationControlButton, {
                  icon: "X",
                  label: (0, runtime2.formatMessage)({
                    defaultMessage: "退出（Esc）",
                    id: "O+1RKzTrkV"
                  }),
                  onClick: () => onExit(index4)
                })
              ]
            })
          ]
        }),
        value14 === "panel" ? PresentationJsx.jsx(PresentationNotesDock, {
          msg: callback11(index4),
          onClick: (input) => input.stopPropagation()
        }) : null
      ]
    }), document.body) : null;
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
  function PresentationControlButton({ icon, label, paging, pressed: pressed3, unavailable, keys, onClick }) {
    let value = (0, runtime2.useCoarsePointer)();
    return PresentationJsx.jsx(runtime2.CdsRoot, {
      mode: "dark",
      className: "contents",
      children: PresentationJsx.jsx(runtime2.Button, {
        iconOnly: !0,
        variant: "ghost",
        size: value ? void 0 : "xs",
        icon,
        "aria-label": label,
        "data-present-paging": paging === !0 ? "" : void 0,
        pressed: pressed3,
        "aria-disabled": unavailable === !0 ? !0 : void 0,
        "aria-keyshortcuts": keys,
        className: "aria-disabled:opacity-disabled aria-disabled:[&_[data-cds-part=paint]]:bg-transparent!",
        onClick
      })
    });
  }
  function PresentationNotesDock({ msg, onClick }) {
    let [value, value2] = ReactPresentation.useState(() => Date.now());
    ReactPresentation.useEffect(() => {
      let value5 = setInterval(() => value2(Date.now()), 1e3);
      return () => clearInterval(value5);
    }, []);
    let ref = ReactPresentation.useRef(null);
    ReactPresentation.useLayoutEffect(() => {
      ref.current !== null && (ref.current.scrollTop = 0);
    }, [msg.index]);
    let value3 = msg.index >= msg.count - 1, value4 = [
      (0, runtime2.formatSlidePositionLabel)(msg.index, msg.count),
      (0, runtime2.formatSpeakerElapsedTime)(value - (msg.since ?? value)),
      value3 ? runtime2.LAST_SLIDE_LABEL : msg.next !== void 0 ? (0, runtime2.formatMessage)({ defaultMessage: "下一页：{title}", id: "s6cclcbEb8" }, { title: msg.next }) : ""
    ].filter((input) => input !== "");
    return PresentationJsx.jsxs(runtime2.CdsRoot, {
      mode: "dark",
      render: PresentationJsx.jsx("div", {
        className: "flex h-[30vh] flex-none flex-col border-t bg-surface-panel text-primary",
        onClick
      }),
      children: [
        PresentationJsx.jsx("div", {
          className: "flex-none px-6 pt-2 pb-1 text-xs tracking-wide text-muted tabular-nums",
          children: PresentationJsx.jsx("div", {
            className: "mx-auto max-w-[720px] truncate",
            children: value4.join(" · ")
          })
        }),
        PresentationJsx.jsx("div", {
          ref,
          tabIndex: 0,
          role: "region",
          "aria-label": "备注",
          "data-notes-scroll": "",
          className: "min-h-0 flex-1 overflow-y-auto px-6 pb-[calc(1rem+var(--sl-safe-b,0px))] text-sm leading-relaxed whitespace-pre-wrap outline-none focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-white/30 focus-visible:ring-inset forced-colors:focus-visible:-outline-offset-2",
          children: PresentationJsx.jsx("div", {
            className: "mx-auto max-w-[720px]",
            children: msg.notes === "" ? PresentationJsx.jsx("span", {
              className: "text-muted",
              children: runtime2.NO_SPEAKER_NOTES_MESSAGE
            }) : msg.notes
          })
        })
      ]
    });
  }
  function presentationElementRect(element, originRect, scale) {
    let rect = element.getBoundingClientRect();
    return {
      x: (rect.left - originRect.left) / scale,
      y: (rect.top - originRect.top) / scale,
      w: rect.width / scale,
      h: rect.height / scale
    };
  }
  function presentationRectInlineStyle(rect) {
    return {
      left: String(rect.x) + "px",
      top: String(rect.y) + "px",
      right: "自动",
      bottom: "自动",
      width: String(rect.w) + "px",
      height: String(rect.h) + "px",
      transform: "none"
    };
  }
  function presentationRectsApproximatelyEqual(left, right) {
    return Math.abs(left.x - right.x) < 0.5 && Math.abs(left.y - right.y) < 0.5 && Math.abs(left.w - right.w) < 0.5 && Math.abs(left.h - right.h) < 0.5;
  }
  function PresentationSlideTransition({ trans, slides, assets, scale, mainRef, onDone }) {
    let ref = ReactPresentation.useRef(null), ref2 = ReactPresentation.useRef(onDone);
    ref2.current = onDone;
    let value = slides[trans.from.index], value2 = slides[trans.to.index];
    return ReactPresentation.useLayoutEffect(() => {
      let current = ref.current, current2 = mainRef.current;
      if (current === null || current2 === null || value === void 0 || value2 === void 0) {
        ref2.current();
        return;
      }
      let value3 = runtime2.slideTransitionDurations[trans.kind], state = {
        duration: value3,
        easing: runtime2.slideTransitionEasing,
        fill: "forwards"
      }, items = [], callback = (element, options) => element.querySelector(frameAttributeSelector(options)), value4 = (0, runtime2.hiddenBuildFrameIds)(value, trans.from.step), value5 = (0, runtime2.hiddenBuildFrameIds)(value2, trans.to.step);
      for (let value7 of value.frames) {
        let value8 = callback(current, value7.id);
        value8 !== null && (value4.has(value7.id) || (0, runtime2.countNodeEmbeds)(value7.node) > 0) && (value8.style.visibility = "hidden");
      }
      if (trans.kind === "fade")
        items.push(current.animate([
          {
            opacity: 1
          },
          {
            opacity: 0
          }
        ], state));
      else if (trans.kind === "push") {
        let value7 = trans.back ? -runtime2.SLIDE_WIDTH : runtime2.SLIDE_WIDTH;
        items.push(current.animate([
          {
            transform: "translateX(0px)"
          },
          {
            transform: "translateX(" + String(-value7) + "px)"
          }
        ], state)), items.push(current2.animate([
          {
            transform: "translateX(" + String(value7) + "px)"
          },
          {
            transform: "translateX(0px)"
          }
        ], state));
      } else {
        let element = current2.querySelector("[data-bg-veil]");
        element !== null && items.push(element.animate([
          {
            opacity: 1
          },
          {
            opacity: 0
          }
        ], state));
        let bounds = current.getBoundingClientRect(), bounds2 = current2.getBoundingClientRect(), values = new Set(value2.frames.map((input) => input.id)), values2 = /* @__PURE__ */ new Set();
        for (let value7 of value.frames) {
          if (value4.has(value7.id))
            continue;
          let value8 = callback(current, value7.id);
          if (value8 === null)
            continue;
          let value9 = values.has(value7.id) && !value5.has(value7.id) ? callback(current2, value7.id) : null;
          if (value9 === null) {
            (0, runtime2.countNodeEmbeds)(value7.node) === 0 && items.push(value8.animate([
              {
                opacity: 1
              },
              {
                opacity: 0
              }
            ], state));
            continue;
          }
          values2.add(value7.id), value8.style.visibility = "hidden";
          let value10 = presentationElementRect(value8, bounds, scale), value11 = presentationElementRect(value9, bounds2, scale);
          presentationRectsApproximatelyEqual(value10, value11) || items.push(value9.animate([
            presentationRectInlineStyle(value10),
            presentationRectInlineStyle(value11)
          ], state));
        }
        for (let value7 of value2.frames) {
          if (values2.has(value7.id) || value5.has(value7.id))
            continue;
          let value8 = callback(current2, value7.id);
          value8 !== null && items.push(value8.animate([
            {
              opacity: 0
            },
            {
              opacity: 1
            }
          ], state));
        }
      }
      let flag = !1, callback2 = () => {
        flag || (flag = !0, ref2.current());
      };
      Promise.allSettled(items.map((input) => input.finished)).then(callback2);
      let value6 = setTimeout(callback2, value3 + 250);
      return () => {
        flag = !0, clearTimeout(value6);
        for (let value7 of items)
          value7.cancel();
      };
    }, [trans]), value === void 0 || value2 === void 0 ? null : PresentationJsx.jsx("div", {
      ref,
      inert: !0,
      style: {
        position: "absolute",
        inset: 0,
        pointerEvents: "none"
      },
      children: PresentationJsx.jsx(runtime2.SlideSurface, {
        slide: value,
        assets,
        animate: !1,
        structure: !1,
        links: "open",
        bgOverride: trans.kind === "magic" ? "transparent" : void 0
      })
    });
  }
  return bindRuntimeValue(runtime2, "ReactPresentation", () => ReactPresentation, (value) => {
    ReactPresentation = value;
  }), bindRuntimeValue(runtime2, "PresentationReactDom", () => PresentationReactDom, (value) => {
    PresentationReactDom = value;
  }), bindRuntimeValue(runtime2, "PresentationJsx", () => PresentationJsx, (value) => {
    PresentationJsx = value;
  }), bindRuntimeValue(runtime2, "PRESENTATION_CONTROLS_HIDE_DELAY_MS", () => PRESENTATION_CONTROLS_HIDE_DELAY_MS, (value) => {
    PRESENTATION_CONTROLS_HIDE_DELAY_MS = value;
  }), bindRuntimeValue(runtime2, "PRESENTATION_FOCUSABLE_SELECTOR", () => PRESENTATION_FOCUSABLE_SELECTOR, (value) => {
    PRESENTATION_FOCUSABLE_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "PRESENTATION_NAVIGATION_KEYS", () => PRESENTATION_NAVIGATION_KEYS, (value) => {
    PRESENTATION_NAVIGATION_KEYS = value;
  }), bindRuntimeValue(runtime2, "isPresentationNavigationKey", () => isPresentationNavigationKey), bindRuntimeValue(runtime2, "presentationModeActive", () => presentationModeActive, (value) => {
    presentationModeActive = value;
  }), bindRuntimeValue(runtime2, "pendingPresentationFullscreenRequest", () => pendingPresentationFullscreenRequest, (value) => {
    pendingPresentationFullscreenRequest = value;
  }), bindRuntimeValue(runtime2, "ensurePresentationFullscreen", () => ensurePresentationFullscreen), bindRuntimeValue(runtime2, "requestPresentationFullscreen", () => requestPresentationFullscreen), bindRuntimeValue(runtime2, "createSpeakerSlideMessage", () => createSpeakerSlideMessage), bindRuntimeValue(runtime2, "frameAttributeSelector", () => frameAttributeSelector), bindRuntimeValue(runtime2, "presentationPrefersReducedMotion", () => presentationPrefersReducedMotion), bindRuntimeValue(runtime2, "PresentationView", () => PresentationView), bindRuntimeValue(runtime2, "replayClickedNodeAnimation", () => replayClickedNodeAnimation), bindRuntimeValue(runtime2, "resolveDottedNodePath", () => resolveDottedNodePath), bindRuntimeValue(runtime2, "PresentationControlButton", () => PresentationControlButton), bindRuntimeValue(runtime2, "PresentationNotesDock", () => PresentationNotesDock), bindRuntimeValue(runtime2, "presentationElementRect", () => presentationElementRect), bindRuntimeValue(runtime2, "presentationRectInlineStyle", () => presentationRectInlineStyle), bindRuntimeValue(runtime2, "presentationRectsApproximatelyEqual", () => presentationRectsApproximatelyEqual), bindRuntimeValue(runtime2, "PresentationSlideTransition", () => PresentationSlideTransition), () => {
    (0, runtime2.initializeSlideRenderer)(), (0, runtime2.initializeSlideSnapshots)(), ReactPresentation = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), PresentationReactDom = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), PresentationJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), PRESENTATION_CONTROLS_HIDE_DELAY_MS = 3e3, PRESENTATION_FOCUSABLE_SELECTOR = "button, [href], input, select, textarea, summary, iframe, [contenteditable], [tabindex]", PRESENTATION_NAVIGATION_KEYS = /* @__PURE__ */ new Set([
      "ArrowRight",
      "ArrowDown",
      "PageDown",
      " ",
      "ArrowLeft",
      "ArrowUp",
      "PageUp",
      "Home",
      "End"
    ]), presentationModeActive = !1, pendingPresentationFullscreenRequest = null;
  };
}
export {
  installPresentationPlayer
};
