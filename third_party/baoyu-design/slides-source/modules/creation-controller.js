// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCreationController(runtime2) {
  var ReactCreationController, QUIET_SLIDE_CREATION_STATE, slideCreationTimers, INITIAL_CREATION_PRESENTATION_STATE, creationPlacementsEqual, creationCellsEqual, formatCreationStartAnnouncement, creationReducedMotionMediaQuery, getCreationReducedMotionMediaQuery, creationPrefersReducedMotion;
  function deriveSlideCreationState(input) {
    if (!input.on || !input.creating || input.over)
      return QUIET_SLIDE_CREATION_STATE;
    let awaitedIds = input.outline.filter((input2) => !input2.here && !input2.seenBefore).map((input2) => input2.id), presentSlides = input.outline.filter((input2) => input2.here);
    if (input.outline.length === 0) {
      let state = {
        awaited: awaitedIds,
        toReveal: [],
        listed: 0,
        greySlide: !0,
        addSlideOnStage: !input.stripOpen
      };
      return input.working ? {
        phase: "skeleton",
        ...state,
        cells: input.stripOpen ? [
          {
            id: "@first",
            as: "box"
          }
        ] : null,
        cursor: !0
      } : input.inGrace ? {
        phase: "grace",
        ...state,
        cells: null,
        cursor: !1
      } : QUIET_SLIDE_CREATION_STATE;
    }
    let value = presentSlides.filter((input2) => input.hadBox.has(input2.id) && !input.revealed.has(input2.id)).map((input2) => input2.id), value2 = input.writing && awaitedIds.length > 0 || value.length > 0, value3 = input.working && input.mayPoint;
    if (!value2) {
      let value8 = input.stripOpen ? presentSlides.map((input2) => ({
        id: input2.id,
        as: "slide"
      })) : null;
      return value3 && input.hadBox.size > 0 ? {
        phase: "done",
        cells: value8,
        awaited: awaitedIds,
        toReveal: value,
        listed: 0,
        cursor: !0,
        greySlide: !1,
        addSlideOnStage: !1
      } : QUIET_SLIDE_CREATION_STATE;
    }
    let value4 = input.outline.filter((input2) => input2.here || input.writing && !input2.seenBefore).map((input2) => ({
      id: input2.id,
      as: input2.here && !value.includes(input2.id) ? "slide" : "box"
    })), value5 = input.outline[0], value6 = value5 !== void 0 && value.includes(value5.id) && (input.current === null || input.current === value5.id), value7 = presentSlides.length === 0 || value6;
    return {
      phase: presentSlides.length === 0 ? "outline" : "arriving",
      cells: input.stripOpen ? value4 : null,
      awaited: awaitedIds,
      toReveal: value,
      listed: input.mayPoint && awaitedIds.length > 0 ? (input.writing ? awaitedIds.length : 0) + value.length : 0,
      cursor: value3,
      greySlide: value7,
      addSlideOnStage: value7 && !input.stripOpen
    };
  }
  function creationViewsEqual(left, right) {
    if (left === right)
      return !0;
    for (let value of Object.keys(left))
      if (value === "place" ? !creationPlacementsEqual(left.place, right.place) : value === "cells" ? !creationCellsEqual(left.cells, right.cells) : left[value] !== right[value])
        return !1;
    return !0;
  }
  function createSlideCreationController(timers = slideCreationTimers) {
    let subscribers = /* @__PURE__ */ new Set(), pendingTimers = /* @__PURE__ */ new Set(), sequenceTimers = /* @__PURE__ */ new Set(), enabled = !1, creating = !1, finished = !1, initialDeckEmpty = !1, externalChangesObserved = !1, outline = [], title = "", readOnly = !1, stripOpen = !0, reducedMotion = !1, currentSlideId = null, hostWorking = !1, hostWorkingObserved = !1, hostWorkingUntil = -1, outlineWaitUntil = -1, lastExternalComposeAt = -1 / 0, lastNewSlideAt = -1 / 0, externalComposeNoticeShown = !1, initialGraceUntil = -1, revealedSlideIds = /* @__PURE__ */ new Set(), placeholderSlideIds = /* @__PURE__ */ new Set(), emptyStageShown = !1, hasListedSlides = !1, sequenceBusy = !1, cursorPlacement = null, cursorGlideMs = 0, activeCellId = null, growing = !1, titleVisible = !1, sheetPhase = "none", landingSlideId = null, freshSlideId = null, ending = !1, showLeftover = !1, cursorHiddenForInactivity = !1, frozenEndingState = null, returningToEmptyDeck = !1, emptyDeckSequence = 0, arrivingFromEmptyDeck = !1, emptyDeckTransitionPhase = 0, ordinaryEmptyDeckShown = !1, batchedReveal = null, creationState = QUIET_SLIDE_CREATION_STATE, view = INITIAL_CREATION_PRESENTATION_STATE;
    function resetSequenceState() {
      sequenceBusy = !1, cursorPlacement = null, activeCellId = null, landingSlideId = null, freshSlideId = null, sheetPhase = "none", ending = !1, showLeftover = !1, cursorHiddenForInactivity = !1, frozenEndingState = null, growing = !1, titleVisible = !1, batchedReveal = null, returningToEmptyDeck = !1, emptyDeckSequence++, arrivingFromEmptyDeck = !1, emptyDeckTransitionPhase = 0;
    }
    let guardSequenceError = (input) => (...input2) => {
      try {
        input(...input2);
      } catch (value) {
        console.error("slides: the creation sequence ended on an error", value), cancelAllTimers(), resetSequenceState(), finished = !0, creationState = QUIET_SLIDE_CREATION_STATE;
        let value2 = view;
        if (view = INITIAL_CREATION_PRESENTATION_STATE, value2 === INITIAL_CREATION_PRESENTATION_STATE)
          return;
        for (let value3 of [...subscribers])
          try {
            value3();
          } catch {
          }
      }
    }, scheduleSequenceTimer = (input, options, context = pendingTimers) => {
      let value = timers.set(guardSequenceError(() => {
        pendingTimers.delete(value), sequenceTimers.delete(value), options();
      }), input);
      context.add(value), context !== pendingTimers && pendingTimers.add(value);
    }, timerGeneration = 0, cancelSequenceTimers = () => {
      timerGeneration++;
      for (let value of sequenceTimers)
        timers.clear(value), pendingTimers.delete(value);
      sequenceTimers.clear();
    }, cancelAllTimers = () => {
      timerGeneration++;
      for (let value of pendingTimers)
        timers.clear(value);
      pendingTimers.clear(), sequenceTimers.clear();
    }, hasUnrevealedPlaceholderSlides = () => hostWorkingObserved && outline.some((input) => input.here && placeholderSlideIds.has(input.id) && !revealedSlideIds.has(input.id)), hasNewSlidesToReveal = () => freshSlideId !== null || outline.some((input) => input.here ? placeholderSlideIds.has(input.id) && !revealedSlideIds.has(input.id) : !input.seenBefore), recentExternalCreationActive = () => !hostWorkingObserved && timers.now() - lastNewSlideAt < runtime2.CREATION_STALE_TIMEOUT_MS && hasNewSlidesToReveal(), creationWorking = () => hostWorking || timers.now() < hostWorkingUntil || hasUnrevealedPlaceholderSlides() || recentExternalCreationActive(), creationWriting = () => creationWorking() || (hostWorkingObserved ? timers.now() < outlineWaitUntil : timers.now() - lastExternalComposeAt < runtime2.CREATION_SESSION_MAX_AGE_MS), isOutlineEmpty = () => !outline.some((input) => input.here), currentCreationInput = () => ({
      on: enabled && !readOnly,
      creating,
      over: finished,
      outline,
      working: creationWorking(),
      writing: creationWriting(),
      mayPoint: initialDeckEmpty || externalChangesObserved,
      inGrace: timers.now() < initialGraceUntil,
      revealed: revealedSlideIds,
      hadBox: placeholderSlideIds,
      stripOpen,
      current: currentSlideId
    }), logCreationState = (input) => console.debug("slides: the creation sequence is on for this load; " + input);
    function advanceEmptyDeckTransition(input) {
      emptyDeckTransitionPhase === 0 || emptyDeckTransitionPhase >= input || (emptyDeckTransitionPhase = input, growing = input === 2 && stripOpen, scheduleSequenceTimer(input === 2 ? stripOpen ? runtime2.CREATION_OUTLINE_HOLD_MS : 0 : runtime2.CREATION_EMPTY_DECK_FADE_MS, input === 2 ? () => advanceEmptyDeckTransition(3) : completeEmptyDeckTransition), refreshView(), input === 3 && advanceRevealSequence());
    }
    function completeEmptyDeckTransition() {
      emptyDeckTransitionPhase === 3 && (emptyDeckTransitionPhase = 0, arrivingFromEmptyDeck = !1, refreshView());
    }
    function refreshView() {
      let value = ending && frozenEndingState !== null ? frozenEndingState : deriveSlideCreationState(currentCreationInput());
      (emptyDeckTransitionPhase === 1 || emptyDeckTransitionPhase === 2) && !isOutlineEmpty() && (emptyDeckTransitionPhase = 3, growing = !1, scheduleSequenceTimer(runtime2.CREATION_EMPTY_DECK_FADE_MS, completeEmptyDeckTransition)), (emptyDeckTransitionPhase === 1 || emptyDeckTransitionPhase === 2) && (ending || !value.greySlide) && (emptyDeckTransitionPhase = 0, growing = !1, arrivingFromEmptyDeck = !1);
      let value2 = enabled && !readOnly && creating && isOutlineEmpty();
      if (returningToEmptyDeck && (value.phase !== "quiet" || !isOutlineEmpty()) && (returningToEmptyDeck = !1, emptyDeckSequence++), !hostWorkingObserved && !readOnly && !finished && value.phase === "quiet" && view.cursor)
        return beginEndingSequence();
      (value.phase === "skeleton" || value.phase === "grace") && (emptyStageShown = !0), value.phase === "quiet" && value2 && !returningToEmptyDeck && (ordinaryEmptyDeckShown = !0, emptyStageShown = !1), !value.greySlide && !isOutlineEmpty() && (ordinaryEmptyDeckShown = !1), value.greySlide && ordinaryEmptyDeckShown && (ordinaryEmptyDeckShown = !1, arrivingFromEmptyDeck = !reducedMotion, logCreationState(value.phase === "skeleton" ? "the host said working after the ordinary empty deck was shown" : "the slide list arrived after the ordinary empty deck was shown"), arrivingFromEmptyDeck && (emptyDeckTransitionPhase = isOutlineEmpty() ? 1 : 3, scheduleSequenceTimer(runtime2.CREATION_EMPTY_DECK_FADE_MS, emptyDeckTransitionPhase === 1 ? () => advanceEmptyDeckTransition(2) : completeEmptyDeckTransition))), creationState = value;
      let value3 = emptyDeckTransitionPhase === 1 || emptyDeckTransitionPhase === 2, value4 = value.phase === "quiet", value5 = value.cursor || (cursorHiddenForInactivity || ending || returningToEmptyDeck) && cursorPlacement !== null, value6 = value4 && !returningToEmptyDeck && !arrivingFromEmptyDeck && !value2 ? INITIAL_CREATION_PRESENTATION_STATE : {
        phase: value.phase,
        cells: emptyDeckTransitionPhase === 1 ? null : value.cells,
        listed: value3 ? 0 : value.listed,
        cursor: value.cursor && !cursorHiddenForInactivity && !value3,
        greySlide: value.greySlide && !value3,
        addSlideOnStage: value.addSlideOnStage && !value3,
        place: (!value4 || returningToEmptyDeck) && value5 && !value3 ? cursorPlacement : null,
        glideMs: reducedMotion ? 0 : cursorGlideMs,
        tag: value.phase === "skeleton" && !value3 ? "tips" : "name",
        active: value.cursor && !cursorHiddenForInactivity && !ending && !value3 && cursorPlacement?.on === "cell" && cursorPlacement.id === activeCellId ? activeCellId : null,
        growing: growing && !reducedMotion,
        title,
        titleOn: titleVisible && value.phase === "outline",
        sheet: value3 ? "none" : value4 ? returningToEmptyDeck ? "grey" : "none" : sheetPhase !== "none" ? sheetPhase : value.greySlide ? "grey" : "none",
        landing: landingSlideId,
        fresh: freshSlideId,
        leftover: showLeftover,
        cursorHidden: cursorHiddenForInactivity || ending || returningToEmptyDeck,
        toEmptyDeck: returningToEmptyDeck,
        fromEmptyDeck: arrivingFromEmptyDeck,
        sheetIn: emptyDeckTransitionPhase === 3,
        holdsEmptyDeck: value2
      };
      if (!creationViewsEqual(view, value6)) {
        view = value6;
        for (let value7 of [...subscribers])
          value7();
      }
    }
    function finishCreation() {
      cancelAllTimers();
      let value = view.sheet === "grey" && isOutlineEmpty() && !reducedMotion;
      resetSequenceState(), finished = !0, returningToEmptyDeck = value, refreshView();
      let value2 = ++emptyDeckSequence;
      returningToEmptyDeck && scheduleSequenceTimer(runtime2.CREATION_EMPTY_DECK_FADE_MS, () => {
        value2 === emptyDeckSequence && (returningToEmptyDeck = !1, refreshView());
      });
    }
    function beginEndingSequence() {
      if (ending || finished)
        return;
      if (creationState.phase === "quiet")
        return finishCreation();
      cancelAllTimers();
      for (let value3 of outline)
        value3.here && revealedSlideIds.add(value3.id);
      let value = isOutlineEmpty();
      frozenEndingState = {
        ...creationState,
        cells: creationState.cells?.map((input) => outline.some((input2) => input2.id === input.id && input2.here) ? {
          id: input.id,
          as: "slide"
        } : input) ?? null,
        toReveal: [],
        cursor: !1,
        greySlide: creationState.greySlide && value,
        addSlideOnStage: creationState.addSlideOnStage && value
      }, sequenceBusy = !1, batchedReveal = null, growing = !1, titleVisible = !1, activeCellId = null, freshSlideId = null, sheetPhase = "none", landingSlideId = null, ending = !0, refreshView();
      let value2 = frozenEndingState.awaited.length > 0;
      scheduleSequenceTimer(value2 ? runtime2.CREATION_COMPLETION_SETTLE_MS : runtime2.CREATION_CURSOR_FADE_MS + 50, () => {
        if (!value2)
          return finishCreation();
        showLeftover = !0, refreshView(), scheduleSequenceTimer(runtime2.CREATION_CURSOR_GLIDE_MS, finishCreation);
      });
    }
    function extendHostWorkingGrace() {
      hostWorking || !hostWorkingObserved || (hostWorkingUntil = Math.max(hostWorkingUntil, timers.now() + runtime2.REMOTE_CHANGE_HOLD_MS), outlineWaitUntil = Math.max(outlineWaitUntil, timers.now() + runtime2.CREATION_OUTLINE_WAIT_MS), scheduleActivityExpiry());
    }
    function markSlideRevealed(input) {
      let value = hasUnrevealedPlaceholderSlides();
      revealedSlideIds.add(input), freshSlideId = input, value && !hasUnrevealedPlaceholderSlides() && extendHostWorkingGrace();
    }
    let scheduleNextReveal = (input) => scheduleSequenceTimer(input, () => {
      sequenceBusy = !1, freshSlideId = null, advanceRevealSequence();
    }, sequenceTimers);
    function advanceRevealSequence() {
      if (finished || ending || sequenceBusy || emptyDeckTransitionPhase === 1 || emptyDeckTransitionPhase === 2 || !enabled || !creating)
        return;
      let value = deriveSlideCreationState(currentCreationInput());
      if (value.phase === "quiet" || value.phase === "grace" || value.phase === "skeleton") {
        let value9 = hasListedSlides && outline.every((input) => input.here || input.seenBefore);
        value.phase === "quiet" && value9 && !creationWorking() && (creationState.phase === "quiet" ? finishCreation() : beginEndingSequence()), value.phase === "skeleton" && cursorPlacement === null && (cursorPlacement = {
          on: "slide"
        }, refreshView());
        return;
      }
      let value2 = outline.find((input) => input.here && placeholderSlideIds.has(input.id) && !revealedSlideIds.has(input.id)), value3 = value.awaited.length > 0 && creationWriting() ? outline.find((input) => !input.here && !input.seenBefore) : void 0, value4 = value2 ?? value3;
      if (value4 === void 0)
        return refreshView();
      let value5 = outline[0]?.id === value4.id, callback = (input) => !input.here && outline[0]?.id === input.id && value.greySlide && title !== "" ? {
        on: "title"
      } : stripOpen ? {
        on: "cell",
        id: input.id
      } : {
        on: "slide"
      };
      if (reducedMotion) {
        for (let value10 of value.toReveal)
          revealedSlideIds.add(value10);
        let value9 = [...outline].reverse().find((input) => input.here);
        cursorPlacement = value.cursor ? value3 !== void 0 ? callback(value3) : stripOpen && value9 !== void 0 ? {
          on: "cell",
          id: value9.id
        } : {
          on: "slide"
        } : null, titleVisible = cursorPlacement?.on === "title", activeCellId = value.cursor && cursorPlacement?.on === "cell" ? cursorPlacement.id : null, cursorGlideMs = 0, freshSlideId = null, refreshView(), value3 === void 0 && !creationWorking() && beginEndingSequence();
        return;
      }
      let value6 = value4.here && value5 && value.greySlide;
      if (value4.here && !value6 && value.toReveal.length > 1 && batchedReveal === null && (batchedReveal = {
        step: Math.min(runtime2.CREATION_SLIDE_ARRIVAL_MS, runtime2.CREATION_IDLE_PAUSE_MS / value.toReveal.length),
        until: timers.now() + runtime2.CREATION_IDLE_PAUSE_MS
      }), value.toReveal.length === 0 && (batchedReveal = null), value4.here && !value6 && batchedReveal !== null) {
        if (sequenceBusy = !0, timers.now() >= batchedReveal.until) {
          for (let value9 of value.toReveal)
            revealedSlideIds.add(value9);
          return extendHostWorkingGrace(), batchedReveal = null, freshSlideId = null, sequenceBusy = !1, refreshView(), advanceRevealSequence();
        }
        return value.cursor && (cursorPlacement = stripOpen ? {
          on: "cell",
          id: value4.id
        } : {
          on: "slide"
        }, cursorGlideMs = 0, activeCellId = null), markSlideRevealed(value4.id), refreshView(), scheduleNextReveal(batchedReveal.step);
      }
      let value7 = callback(value4), value8 = creationPlacementsEqual(cursorPlacement, value7);
      if (value.cursor && !value8 && !(value6 && cursorPlacement?.on !== "cell")) {
        sequenceBusy = !0, cursorGlideMs = cursorPlacement === null ? 0 : value7.on === "cell" && cursorPlacement.on === "cell" ? runtime2.CREATION_INITIAL_GLIDE_MS : runtime2.CREATION_CURSOR_CORNER_GLIDE_MS, cursorPlacement = value7, activeCellId = null, refreshView(), scheduleSequenceTimer(cursorGlideMs, () => {
          sequenceBusy = !1, value7.on === "cell" && (activeCellId = value7.id), value7.on === "title" && (titleVisible = !0), refreshView(), advanceRevealSequence();
        }, sequenceTimers);
        return;
      }
      if (!value4.here)
        return refreshView();
      if (sequenceBusy = !0, value6)
        return beginFirstSlideLanding(value4.id);
      markSlideRevealed(value4.id), refreshView(), scheduleNextReveal(runtime2.CREATION_CURSOR_GLIDE_MS + runtime2.CREATION_EMPTY_DECK_HOLD_MS);
    }
    function beginFirstSlideLanding(input) {
      landingSlideId = input;
      let value = titleVisible ? runtime2.CREATION_TITLE_FADE_OUT_MS + runtime2.CREATION_POST_PAINT_DELAY_MS : 0;
      titleVisible = !1, refreshView();
      let value2 = timerGeneration, flag = !1, value3 = guardSequenceError(() => {
        flag || value2 !== timerGeneration || landingSlideId !== input || (flag = !0, animateFirstSlideLanding(input, value));
      });
      if (!timers.painted)
        return value3();
      timers.painted(value3), scheduleSequenceTimer(runtime2.CREATION_FIRST_SLIDE_HOLD_MS, value3, sequenceTimers);
    }
    function animateFirstSlideLanding(input, options) {
      scheduleSequenceTimer(options, () => {
        sheetPhase = "ground", refreshView(), scheduleSequenceTimer(runtime2.CREATION_SHEET_GROUND_MS, () => {
          let value = stripOpen && creationWorking() && !cursorHiddenForInactivity;
          value ? (cursorPlacement = {
            on: "cell",
            id: input
          }, cursorGlideMs = runtime2.CREATION_CURSOR_CORNER_GLIDE_MS, activeCellId = null, refreshView()) : cursorPlacement?.on === "title" && (cursorPlacement = {
            on: "slide"
          }, cursorGlideMs = 0, refreshView()), scheduleSequenceTimer(value ? runtime2.CREATION_CURSOR_CORNER_GLIDE_MS + runtime2.CREATION_POST_PAINT_DELAY_MS : 0, () => {
            sheetPhase = "lifting", refreshView(), scheduleSequenceTimer(runtime2.CREATION_SHEET_LIFT_MS + runtime2.CREATION_CURSOR_SHOW_DELAY_MS, () => finishSlideLanding(input), sequenceTimers);
          }, sequenceTimers);
        }, sequenceTimers);
      }, sequenceTimers);
    }
    function finishSlideLanding(input) {
      sheetPhase = "none", landingSlideId = null, markSlideRevealed(input), refreshView(), scheduleNextReveal(runtime2.CREATION_CURSOR_GLIDE_MS + runtime2.CREATION_EMPTY_DECK_HOLD_MS);
    }
    let activityExpiryTimer;
    function scheduleActivityExpiry() {
      if (activityExpiryTimer !== void 0 && (timers.clear(activityExpiryTimer), pendingTimers.delete(activityExpiryTimer), activityExpiryTimer = void 0), finished || ending || !enabled || !creating)
        return;
      let value = timers.now(), value2 = [
        hostWorkingUntil,
        hostWorkingObserved ? outlineWaitUntil : lastExternalComposeAt + runtime2.CREATION_SESSION_MAX_AGE_MS,
        hostWorkingObserved ? -1 : lastNewSlideAt + runtime2.CREATION_STALE_TIMEOUT_MS,
        initialGraceUntil
      ].filter((input) => input > value);
      if (value2.length === 0 || hostWorking)
        return;
      let value3 = timers.set(guardSequenceError(() => {
        pendingTimers.delete(value3), activityExpiryTimer = void 0, reconcileActivity();
      }), Math.min(...value2) - value + 1);
      activityExpiryTimer = value3, pendingTimers.add(value3);
    }
    function reconcileActivity() {
      if (finished || ending || !enabled || !creating)
        return refreshView();
      let value = deriveSlideCreationState(currentCreationInput());
      if ((creationState.phase === "skeleton" || creationState.phase === "grace") && value.phase === "quiet") {
        creationState.phase === "grace" && logCreationState("no word from the host within the short wait: the ordinary empty deck"), returningToEmptyDeck = !reducedMotion;
        let value2 = ++emptyDeckSequence;
        return returningToEmptyDeck || (cursorPlacement = null), refreshView(), returningToEmptyDeck && scheduleSequenceTimer(runtime2.CREATION_EMPTY_DECK_FADE_MS, () => {
          value2 === emptyDeckSequence && (returningToEmptyDeck = !1, cursorPlacement = null, refreshView());
        }), scheduleActivityExpiry();
      }
      if (creationState.phase !== "quiet" && (!creationWriting() || creationState.phase === "done" && !creationWorking()))
        return beginEndingSequence();
      creationState.cursor && !creationWorking() && creationWriting() && creationState.phase !== "done" && (cursorHiddenForInactivity = !0), creationWorking() && (cursorHiddenForInactivity = !1), creationState.phase === "grace" && value.phase === "skeleton" && logCreationState("the host said working within the short wait"), value.phase === "skeleton" && cursorPlacement === null && (cursorPlacement = {
        on: "slide"
      }), refreshView(), advanceRevealSequence(), scheduleActivityExpiry();
    }
    let controller = {
      get: () => view,
      subscribe(input) {
        return subscribers.add(input), () => void subscribers.delete(input);
      },
      loaded(input, items, context) {
        cancelAllTimers(), activityExpiryTimer = void 0, enabled = input, readOnly = context, outline = items, finished = !1, initialDeckEmpty = items.every((input2) => !input2.here), externalChangesObserved = !1, revealedSlideIds = new Set(items.filter((input2) => input2.here).map((input2) => input2.id)), placeholderSlideIds = new Set(items.filter((input2) => !input2.here && !input2.seenBefore).map((input2) => input2.id)), creating = initialDeckEmpty || placeholderSlideIds.size > 0, emptyStageShown = !1, hasListedSlides = items.length > 0, resetSequenceState(), ordinaryEmptyDeckShown = !1, hostWorkingObserved = hostWorking, hostWorkingUntil = -1, outlineWaitUntil = -1, lastExternalComposeAt = -1 / 0, lastNewSlideAt = -1 / 0, externalComposeNoticeShown = !1, initialGraceUntil = items.length === 0 ? timers.now() + runtime2.CREATION_OUTLINE_RETRY_MS : -1;
        let value = view;
        if (creationState = QUIET_SLIDE_CREATION_STATE, view = INITIAL_CREATION_PRESENTATION_STATE, value !== INITIAL_CREATION_PRESENTATION_STATE)
          for (let value2 of [...subscribers])
            value2();
        enabled && creating && !readOnly && logCreationState((items.length === 0 ? "an empty deck" : "listed slides still to come") + (hostWorking ? ", and the host already says the agent is working" : ", and the host has not said the agent is working")), reconcileActivity();
      },
      composed(items, options, context) {
        let value = outline;
        if (outline = items, title = context, finished || !enabled || !creating)
          return refreshView();
        let values = new Set(value.filter((input) => input.here).map((input) => input.id)), value2 = items.some((input) => input.here && !values.has(input.id)) || items.length !== value.length || items.some((input, options2) => value[options2]?.id !== input.id);
        if (ending) {
          for (let value4 of items)
            value4.here && revealedSlideIds.add(value4.id);
          let value3 = isOutlineEmpty();
          return frozenEndingState !== null && (frozenEndingState = {
            ...frozenEndingState,
            greySlide: frozenEndingState.greySlide && value3,
            addSlideOnStage: frozenEndingState.addSlideOnStage && value3,
            cells: frozenEndingState.cells?.map((input) => items.some((input2) => input2.id === input.id && input2.here) ? {
              id: input.id,
              as: "slide"
            } : input) ?? null
          }), refreshView();
        }
        if (!hasListedSlides && items.length > 0 && !options)
          return finishCreation();
        if (options && value2) {
          lastExternalComposeAt = timers.now(), externalChangesObserved = !0;
          let values2 = new Set(value.map((input) => input.id));
          items.some((input) => !input.seenBefore && (input.here ? placeholderSlideIds.has(input.id) && !values.has(input.id) : !values2.has(input.id))) && (lastNewSlideAt = timers.now(), hostWorkingObserved || (cursorHiddenForInactivity = !1), !hostWorkingObserved && !readOnly && !externalComposeNoticeShown && logCreationState("the host has not said working: the agent’s cursor follows saves from outside this tab"), externalComposeNoticeShown = !0);
        }
        for (let value3 of items)
          !value3.here && !value3.seenBefore && placeholderSlideIds.add(value3.id);
        if (!hasListedSlides && items.length > 0) {
          hasListedSlides = !0, initialGraceUntil = -1, emptyStageShown && items[0] !== void 0 && placeholderSlideIds.add(items[0].id);
          let value3 = emptyDeckTransitionPhase !== 1 && emptyDeckTransitionPhase !== 2 && emptyStageShown && stripOpen && !reducedMotion && items.length > 1;
          emptyDeckTransitionPhase !== 1 && emptyDeckTransitionPhase !== 2 && (growing = value3);
          let value4 = items[0]?.here === !0;
          sequenceBusy = value3 && !value4, refreshView(), value3 && scheduleSequenceTimer(runtime2.CREATION_OUTLINE_HOLD_MS, () => {
            growing = !1, value4 || (sequenceBusy = !1), refreshView(), advanceRevealSequence();
          }, sequenceTimers), sequenceBusy || advanceRevealSequence();
        } else
          cursorPlacement?.on === "cell" && !items.some((input) => input.id === cursorPlacement.id) && (hostWorkingObserved || hasNewSlidesToReveal()) && (cursorPlacement = null, activeCellId = null), refreshView(), advanceRevealSequence();
        scheduleActivityExpiry();
      },
      activity(input) {
        let value = input === "working";
        value !== hostWorking && (value || (hostWorkingUntil = timers.now() + runtime2.REMOTE_CHANGE_HOLD_MS, outlineWaitUntil = timers.now() + runtime2.CREATION_OUTLINE_WAIT_MS), hostWorking = value, value && (hostWorkingObserved = !0), reconcileActivity());
      },
      surroundings(input) {
        if (input.readOnly === readOnly && input.stripOpen === stripOpen && input.calm === reducedMotion && input.current === currentSlideId)
          return;
        let value = input.stripOpen && !stripOpen;
        if (readOnly = input.readOnly, stripOpen = input.stripOpen, reducedMotion = input.calm, input.current !== currentSlideId) {
          landingSlideId !== null && input.current !== landingSlideId && (cancelSequenceTimers(), growing = !1, revealedSlideIds.add(landingSlideId), landingSlideId = null, sheetPhase = "none", sequenceBusy = !1, freshSlideId = null);
          let value2 = currentSlideId === null && outline[0]?.id === input.current;
          input.current !== null && !value2 && placeholderSlideIds.has(input.current) && outline.some((input2) => input2.id === input.current && input2.here) && revealedSlideIds.add(input.current);
        }
        currentSlideId = input.current, value && cursorPlacement?.on === "slide" && creationState.phase !== "skeleton" && (hostWorkingObserved || hasNewSlidesToReveal()) && (cursorPlacement = null), refreshView(), advanceRevealSequence();
      },
      person(input) {
        finished || !enabled || !creating || (input === "structure" || !hasListedSlides) && finishCreation();
      },
      counting: () => creationState.listed > 0,
      stageTouched() {
        if (finished || ending)
          return;
        if (landingSlideId !== null) {
          let value2 = landingSlideId;
          return cancelSequenceTimers(), growing = !1, stripOpen && creationWorking() && !cursorHiddenForInactivity && (cursorPlacement = {
            on: "cell",
            id: value2
          }), cursorGlideMs = 0, finishSlideLanding(value2);
        }
        let value = outline[0];
        value?.here !== !0 || !creationState.greySlide || revealedSlideIds.has(value.id) || (cancelSequenceTimers(), growing = !1, titleVisible = !1, sequenceBusy = !0, cursorPlacement = stripOpen && creationWorking() && !cursorHiddenForInactivity ? {
          on: "cell",
          id: value.id
        } : null, cursorGlideMs = 0, finishSlideLanding(value.id));
      },
      dispose() {
        cancelAllTimers(), subscribers.clear();
      }
    };
    return {
      ...controller,
      loaded: guardSequenceError(controller.loaded),
      composed: guardSequenceError(controller.composed),
      activity: guardSequenceError(controller.activity),
      surroundings: guardSequenceError(controller.surroundings),
      person: guardSequenceError(controller.person),
      stageTouched: guardSequenceError(controller.stageTouched)
    };
  }
  function connectSlideCreationController(controller, document2, codec, turnBusy, onChange) {
    let callback = () => {
      let value3 = document2.metaFields()?.title;
      return typeof value3 == "string" ? value3 : "";
    }, flag = !0, callback2 = (input) => {
      try {
        callback3(input);
      } catch (value3) {
        console.error("slides: the creation sequence could not read the document and has ended", value3);
        try {
          codec.loaded(!1, [], !0);
        } catch {
        }
      }
    }, callback3 = (input) => {
      let value3 = controller.loadState?.();
      if (value3 === "loading" || value3 === "failed") {
        flag = !0;
        return;
      }
      if (flag) {
        flag = !1;
        let value4 = turnBusy(), value5 = controller.readOnly?.() === !0;
        value4 && !value5 && codec.activity(onChange()), codec.loaded(value4, document2.slideOutline(), value5), codec.composed(document2.slideOutline(), !1, callback());
      } else
        codec.composed(document2.slideOutline(), input, callback());
    };
    callback2(!1);
    let value = controller.subscribe((input) => callback2(input?.remote === !0)), value2 = controller.subscribeLoad ? controller.subscribeLoad(() => callback2(!1)) : void 0;
    return () => {
      value(), value2?.();
    };
  }
  function useSlideCreation(options) {
    let { doc: document2, codec } = options, memo4 = ReactCreationController.useMemo(() => createSlideCreationController(), [document2]);
    ReactCreationController.useEffect(() => () => memo4.dispose(), [memo4]);
    let value = (0, runtime2.wasCreationSequenceFlagRequested)(), callback = ReactCreationController.useCallback((input) => document2.subscribeLoad ? document2.subscribeLoad(() => input()) : document2.subscribe(() => input()), [document2]), value2 = ReactCreationController.useSyncExternalStore(callback, () => document2.loadState?.() !== "loading" && document2.loadState?.() !== "failed", () => !1), value3 = value && !options.readOnly && value2 && (0, runtime2.creationSequenceEnabled)();
    ReactCreationController.useEffect(() => {
      if (!value3)
        return memo4.activity("unknown");
      let callback2 = () => memo4.activity(runtime2.agentActivityStore.get());
      return callback2(), runtime2.agentActivityStore.subscribe(callback2);
    }, [memo4, value3]), ReactCreationController.useEffect(() => connectSlideCreationController(document2, codec, memo4, () => value && (0, runtime2.creationSequenceEnabled)(), () => runtime2.agentActivityStore.get()), [document2, codec, memo4, value]);
    let value4 = ReactCreationController.useSyncExternalStore(subscribeCreationReducedMotion, creationPrefersReducedMotion, () => !1);
    ReactCreationController.useEffect(() => memo4.surroundings({
      readOnly: options.readOnly,
      stripOpen: options.stripOpen,
      calm: value4,
      current: options.current
    }), [memo4, options.readOnly, options.stripOpen, value4, options.current]);
    let value5 = ReactCreationController.useSyncExternalStore(memo4.subscribe, memo4.get, memo4.get), { spoken, markSaid } = useCreationStartAnnouncement(value5.phase, value5.listed);
    return ReactCreationController.useMemo(() => ({
      view: value5,
      person: memo4.person,
      stageTouched: memo4.stageTouched,
      mayDraw: value3,
      willCount: () => memo4.counting() && !spoken(),
      startSaid: markSaid
    }), [value5, memo4, value3, spoken, markSaid]);
  }
  function useCreationStartAnnouncement(phase, count) {
    let ref = ReactCreationController.useRef(!1), callback = ReactCreationController.useCallback(() => ref.current, []), callback2 = ReactCreationController.useCallback(() => void (ref.current = !0), []);
    return ReactCreationController.useEffect(() => {
      let value = reduceCreationStartAnnouncement(ref.current, phase, count);
      if (value.say === void 0) {
        ref.current = value.said;
        return;
      }
      let say = value.say, flag = !0, value2, callback3 = () => {
        ref.current || ((0, runtime2.announceLiveMessage)(() => flag ? (ref.current = !0, formatCreationStartAnnouncement(say)) : null, {
          ifIdle: !0
        }), value2 = setTimeout(callback3, runtime2.CREATION_CURSOR_DEPART_MS));
      };
      return callback3(), () => {
        flag = !1, clearTimeout(value2);
      };
    }, [count, phase]), ReactCreationController.useMemo(() => ({
      spoken: callback,
      markSaid: callback2
    }), [callback, callback2]);
  }
  function reduceCreationStartAnnouncement(said, phase, count) {
    return phase === "quiet" ? {
      said: !1
    } : count === 0 || said ? {
      said
    } : {
      said: !0,
      say: count
    };
  }
  function subscribeCreationReducedMotion(input) {
    return getCreationReducedMotionMediaQuery()?.addEventListener?.("change", input), () => getCreationReducedMotionMediaQuery()?.removeEventListener?.("change", input);
  }
  return bindRuntimeValue(runtime2, "ReactCreationController", () => ReactCreationController, (value) => {
    ReactCreationController = value;
  }), bindRuntimeValue(runtime2, "QUIET_SLIDE_CREATION_STATE", () => QUIET_SLIDE_CREATION_STATE, (value) => {
    QUIET_SLIDE_CREATION_STATE = value;
  }), bindRuntimeValue(runtime2, "deriveSlideCreationState", () => deriveSlideCreationState), bindRuntimeValue(runtime2, "slideCreationTimers", () => slideCreationTimers, (value) => {
    slideCreationTimers = value;
  }), bindRuntimeValue(runtime2, "INITIAL_CREATION_PRESENTATION_STATE", () => INITIAL_CREATION_PRESENTATION_STATE, (value) => {
    INITIAL_CREATION_PRESENTATION_STATE = value;
  }), bindRuntimeValue(runtime2, "creationPlacementsEqual", () => creationPlacementsEqual, (value) => {
    creationPlacementsEqual = value;
  }), bindRuntimeValue(runtime2, "creationCellsEqual", () => creationCellsEqual, (value) => {
    creationCellsEqual = value;
  }), bindRuntimeValue(runtime2, "creationViewsEqual", () => creationViewsEqual), bindRuntimeValue(runtime2, "createSlideCreationController", () => createSlideCreationController), bindRuntimeValue(runtime2, "connectSlideCreationController", () => connectSlideCreationController), bindRuntimeValue(runtime2, "useSlideCreation", () => useSlideCreation), bindRuntimeValue(runtime2, "useCreationStartAnnouncement", () => useCreationStartAnnouncement), bindRuntimeValue(runtime2, "reduceCreationStartAnnouncement", () => reduceCreationStartAnnouncement), bindRuntimeValue(runtime2, "formatCreationStartAnnouncement", () => formatCreationStartAnnouncement, (value) => {
    formatCreationStartAnnouncement = value;
  }), bindRuntimeValue(runtime2, "creationReducedMotionMediaQuery", () => creationReducedMotionMediaQuery, (value) => {
    creationReducedMotionMediaQuery = value;
  }), bindRuntimeValue(runtime2, "getCreationReducedMotionMediaQuery", () => getCreationReducedMotionMediaQuery, (value) => {
    getCreationReducedMotionMediaQuery = value;
  }), bindRuntimeValue(runtime2, "subscribeCreationReducedMotion", () => subscribeCreationReducedMotion), bindRuntimeValue(runtime2, "creationPrefersReducedMotion", () => creationPrefersReducedMotion, (value) => {
    creationPrefersReducedMotion = value;
  }), () => {
    ReactCreationController = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeUiAnnouncements)(), QUIET_SLIDE_CREATION_STATE = Object.freeze({
      phase: "quiet",
      cells: null,
      awaited: [],
      toReveal: [],
      listed: 0,
      cursor: !1,
      greySlide: !1,
      addSlideOnStage: !1
    }), slideCreationTimers = {
      now: () => Date.now(),
      set: (input, options) => setTimeout(input, options),
      clear: (input) => clearTimeout(input),
      painted: (input) => typeof requestAnimationFrame == "function" ? void requestAnimationFrame(() => requestAnimationFrame(input)) : void setTimeout(input, 0)
    }, INITIAL_CREATION_PRESENTATION_STATE = Object.freeze({
      phase: "quiet",
      cells: null,
      listed: 0,
      cursor: !1,
      greySlide: !1,
      addSlideOnStage: !1,
      place: null,
      glideMs: 0,
      tag: "name",
      active: null,
      growing: !1,
      title: "",
      titleOn: !1,
      sheet: "none",
      landing: null,
      fresh: null,
      leftover: !1,
      cursorHidden: !1,
      toEmptyDeck: !1,
      fromEmptyDeck: !1,
      sheetIn: !1,
      holdsEmptyDeck: !1
    }), creationPlacementsEqual = (input, options) => input === options || input !== null && options !== null && input.on === options.on && (input.on !== "cell" || input.id === options.id), creationCellsEqual = (items, items2) => items === items2 || items !== null && items2 !== null && items.length === items2.length && items.every((input, options) => input.id === items2[options].id && input.as === items2[options].as), formatCreationStartAnnouncement = (count) => "The agent is adding " + String(count) + (count === 1 ? " slide" : " 页幻灯片"), getCreationReducedMotionMediaQuery = () => creationReducedMotionMediaQuery ??= typeof matchMedia == "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null, creationPrefersReducedMotion = () => getCreationReducedMotionMediaQuery()?.matches === !0;
  };
}
export {
  installCreationController
};
