// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiToolbarFoot(runtime2) {
  var reactPresentationSheet, PRESENTATION_ATTRIBUTE, reactFloatingToolbar, CHAT_SLOT_COVER_INSET, CHAT_SLOT_COVER_SETTLE_MS, CHAT_SLOT_COVER_RECHECKS, CHAT_SLOT_COVER_EVENTS, CHAT_SLOT_COVER_LAZY_EVENTS, XHTML_NAMESPACE, jsxChatToggleSlot, CHAT_SLOT_OPEN_WIDTH, reactChatSlot, FRAME_BAR_TIP_KEY, FRAME_BAR_TIP_GAP, reactArmedTool, reactPlaceChatSlot, reactToolbarHitAreas, TOOLBAR_HIT_MAX, TOOLBAR_HIT_SLOT_GAP, rangesOverlap, clampToolbarHit, toolbarHitElements, jsxFloatingToolbar, FOOT_INSET_MARGIN, FOOT_TOOLBAR_PAD_CLASS, FOOT_TOOLBAR_SHEET_PAD_CLASS, FloatingToolbar, reactFootReveal, FOOT_REVEAL_RELEASE_MS, FOOT_REVEAL_TRANSITION_CLASSES, FOOT_REVEAL_JOIN_MS, FOOT_REVEAL_ENTER_CLASSES, footRevealed, footRevealedAt, footRevealNow, setFootRevealTimeout, footRevealListeners;
  function subscribePresentationAttribute(listener) {
    if (typeof MutationObserver > "u")
      return () => {
      };
    let observer = new MutationObserver(listener);
    return observer.observe(document.documentElement, {
      attributes: !0,
      attributeFilter: [PRESENTATION_ATTRIBUTE]
    }), () => observer.disconnect();
  }
  function usePresentationSheetOpen() {
    return reactPresentationSheet.useSyncExternalStore(subscribePresentationAttribute, () => document.documentElement.getAttribute(PRESENTATION_ATTRIBUTE) === "sheet", () => !1);
  }
  function watchChatSlotCover(slot, onChange) {
    let ownerDocument2 = slot.ownerDocument, win = ownerDocument2.defaultView;
    if (win === null)
      return () => {
      };
    let behindSlot = /* @__PURE__ */ new WeakSet(), slotSeen = !1, lastCover = !1, coverAt = (x, y) => {
      let stack = ownerDocument2.elementsFromPoint?.(x, y) ?? [], slotIndex = stack.indexOf(slot);
      if (slotIndex >= 0) {
        slotSeen = !0;
        for (let element of stack.slice(slotIndex + 1))
          behindSlot.add(element);
      }
      if (!slotSeen)
        return !1;
      let cover = !1;
      for (let element of stack) {
        if (element === slot || element.contains(slot))
          break;
        if (behindSlot.has(element) || isLiveRegionElement(element))
          continue;
        let kind = chatSlotCoverKind(element, win);
        if (kind === !0 || kind === "veil" && cover === "dimmed")
          return !0;
        kind === "veil" && (cover = "dimmed");
      }
      return cover;
    }, checkedAt = -1 / 0, stopped = !1, check = () => {
      if (stopped)
        return;
      checkedAt = win.performance.now();
      let bounds = slot.getBoundingClientRect(), [left, right, top, bottom] = [
        bounds.left + CHAT_SLOT_COVER_INSET,
        bounds.right - CHAT_SLOT_COVER_INSET,
        bounds.top + CHAT_SLOT_COVER_INSET,
        bounds.bottom - CHAT_SLOT_COVER_INSET
      ], probes = bounds.width === 0 ? [] : [
        [(left + right) / 2, (top + bottom) / 2],
        [left, top],
        [right, top],
        [left, bottom],
        [right, bottom]
      ], covers = probes.map(([x, y]) => coverAt(x, y)), next = covers.every((cover) => cover === !1) ? !1 : covers.every((cover) => cover === "dimmed") ? "dimmed" : !0;
      next !== lastCover && (lastCover = next, onChange(next));
    }, frame = 0, timer = 0, rechecks = 0, recheckLater = () => {
      timer !== 0 || stopped || (timer = win.setTimeout(() => {
        timer = 0, rechecks -= 1, check(), (lastCover !== !1 || rechecks > 0) && recheckLater();
      }, CHAT_SLOT_COVER_SETTLE_MS));
    }, onEvent = () => schedule(!0), onLazyEvent = () => schedule(!1), schedule = (eager) => {
      if (rechecks = CHAT_SLOT_COVER_RECHECKS, frame === 0) {
        if (!eager && (timer !== 0 || win.performance.now() - checkedAt < CHAT_SLOT_COVER_SETTLE_MS)) {
          recheckLater();
          return;
        }
        frame = win.requestAnimationFrame(() => {
          frame = 0, check(), recheckLater();
        });
      }
    };
    for (let type of CHAT_SLOT_COVER_EVENTS)
      ownerDocument2.addEventListener(type, onEvent, {
        capture: !0,
        passive: !0
      });
    for (let type of CHAT_SLOT_COVER_LAZY_EVENTS)
      ownerDocument2.addEventListener(type, onLazyEvent, {
        capture: !0,
        passive: !0
      });
    win.addEventListener("resize", onLazyEvent);
    let bodyObserver = new win.MutationObserver(onEvent);
    return bodyObserver.observe(ownerDocument2.body, {
      childList: !0
    }), onEvent(), () => {
      stopped = !0;
      for (let type of CHAT_SLOT_COVER_EVENTS)
        ownerDocument2.removeEventListener(type, onEvent, {
          capture: !0
        });
      for (let type of CHAT_SLOT_COVER_LAZY_EVENTS)
        ownerDocument2.removeEventListener(type, onLazyEvent, {
          capture: !0
        });
      win.removeEventListener("resize", onLazyEvent), bodyObserver.disconnect(), win.cancelAnimationFrame(frame), win.clearTimeout(timer);
    };
  }
  function isLiveRegionElement(element) {
    return element.closest('[aria-live], [role="status"], [role="alert"], [role="log"], [data-cds="Toast"]') !== null;
  }
  function chatSlotCoverKind(element, win) {
    let style = win.getComputedStyle(element);
    if (style.opacity === "0" || element.hasAttribute("data-ending-style"))
      return !1;
    if (element.namespaceURI !== XHTML_NAMESPACE || element.matches("img, canvas, video, iframe, object, embed, input, textarea, select") || [...element.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? "").trim() !== ""))
      return !0;
    let clearBackground = /^(transparent)?$|^rgba\(.*,\s*0(\.0+)?\)$|\/\s*0(\.0+)?%?\)$/.test(style.backgroundColor), isNone = (value) => value === void 0 || value === "" || value === "none", hasBorder = [
      style.borderTopWidth,
      style.borderRightWidth,
      style.borderBottomWidth,
      style.borderLeftWidth
    ].some((width) => parseFloat(width) > 0), backdrop = style.backdropFilter ?? style.webkitBackdropFilter, plain = !hasBorder && isNone(style.backgroundImage) && isNone(style.boxShadow) && isNone(backdrop);
    return plain && clearBackground ? !1 : plain && /^rgba\(0, 0, 0, 0\.[3-6]\d*\)$/.test(style.backgroundColor) ? "veil" : !0;
  }
  function ChatToggleSlot({ word = !1,
    opens = !0,
    endsRow = !1 }) {
    (0, runtime2.useHoldHostChatToggle)();
    let draftWide = (0, runtime2.useFrameChatDraft)() && opens, ref = reactFloatingToolbar.useRef(null);
    return reactFloatingToolbar.useEffect(() => {
      let slot = ref.current;
      if (slot === null)
    return;
      let release = null, stop = watchChatSlotCover(slot, (cover) => {
        let previous = release;
        release = cover === !1 ? null : (0, runtime2.coverHostChatSlot)(cover), previous?.(), slot.toggleAttribute("data-chat-slot-hidden", cover === !0);
      });
      return () => {
        stop(), release?.();
      };
    }, [word]), word ? jsxChatToggleSlot.jsx("span", {
      ref,
      "aria-hidden": "true",
      "data-chat-slot": "",
      "data-chat-slot-wide": "",
      "data-chat-slot-opens": opens ? "" : void 0,
      className: `inline-block h-control shrink-0 transition-[width,margin] duration-base ease-out motion-reduce:transition-none ${draftWide ? "w-20" : "w-16"} ${draftWide && endsRow ? "-me-2" : ""}`
    }, "word") : jsxChatToggleSlot.jsx("span", {
      ref,
      "aria-hidden": "true",
      "data-chat-slot": "",
      className: "inline-block size-control shrink-0"
    }, "icon");
  }
  function reportFrameBarTip(toolbar, { words, onWords, post }) {
    let ownerDocument2 = toolbar.ownerDocument, win = ownerDocument2.defaultView;
    if (win === null)
      return () => {
      };
    let lastPosted = "null", frame = 0, listed = () => words()?.has(runtime2.MENU_CUT_HOST_WORD) === !0, findTip = () => {
      if (!listed())
        return null;
      let tips = ownerDocument2.querySelectorAll('[role="tooltip"]:not([data-ending-style])'), bounds = tips.length === 0 ? null : toolbar.getBoundingClientRect();
      if (bounds === null)
        return null;
      for (let tip of tips) {
        if (tip.checkVisibility?.({
          visibilityProperty: !0
        }) === !1)
          continue;
        let box = (tip.parentElement?.getAttribute("data-cds") === "Tooltip" ? tip.parentElement : tip).getBoundingClientRect(), center = box.left + box.width / 2;
        if (!(box.width === 0 || Math.abs(box.bottom - bounds.top) > FRAME_BAR_TIP_GAP || center < bounds.left || center > bounds.right))
          return {
            x: Math.round(box.left),
            y: Math.round(box.top),
            width: Math.round(box.width),
            height: Math.round(box.height),
            radius: Math.round(Number.parseFloat(win.getComputedStyle(tip).borderTopLeftRadius) || 0)
          };
      }
      return null;
    }, engaged = () => toolbar.matches(":hover") || ownerDocument2.hasFocus() && toolbar.contains(ownerDocument2.activeElement), tick = () => {
      let box = findTip(), serialized = JSON.stringify(box);
      serialized !== lastPosted && (lastPosted = serialized, post({
        [FRAME_BAR_TIP_KEY]: !0,
        box
      }, win)), frame = listed() && (box !== null || engaged()) ? win.requestAnimationFrame(tick) : 0;
    }, start = () => {
      frame === 0 && listed() && (frame = win.requestAnimationFrame(tick));
    };
    toolbar.addEventListener("pointerover", start), toolbar.addEventListener("focusin", start);
    let unsubscribe = onWords(() => void (engaged() && start()));
    return () => {
      unsubscribe(), toolbar.removeEventListener("pointerover", start), toolbar.removeEventListener("focusin", start), win.cancelAnimationFrame(frame), frame = 0, lastPosted !== "null" && post({
        [FRAME_BAR_TIP_KEY]: !0,
        box: null
      }, win), lastPosted = "null";
    };
  }
  function usePutDownArmedToolOnBlur(armedTool) {
    let offersChat = (0, runtime2.useHostOffersChatToggle)(), frameChat = (0, runtime2.useFrameChatAvailable)(), watching = (offersChat || frameChat) && armedTool?.armed === !0, putDown = reactArmedTool.useRef(armedTool?.putDown);
    putDown.current = armedTool?.putDown, reactArmedTool.useEffect(() => {
      if (!watching)
        return;
      let focused = document.hasFocus();
      return (0, runtime2.subscribeDocumentFocus)(() => {
        let lost = focused && !document.hasFocus();
        focused = document.hasFocus(), lost && putDown.current?.();
      });
    }, [watching]);
  }
  function footInsetFromRect(rect, viewportHeight) {
    return rect.width === 0 || rect.height === 0 ? null : Math.max(0, Math.round(viewportHeight - rect.top + FOOT_INSET_MARGIN));
  }
  function useReportFootInset(ref, atFoot) {
    let id = reactChatSlot.useId();
    reactChatSlot.useEffect(() => {
      let current = ref.current;
      if (!atFoot || current === null)
        return;
      let report = () => {
        current.hasAttribute("data-tb-foot") && alignChatSlot(current, current.querySelector("[data-chat-slot]")),
        (0, runtime2.setHostFootSlotInset)(id, footInsetFromRect(current.getBoundingClientRect(), document.documentElement.clientHeight));
      };
      report();
      let observer = typeof ResizeObserver > "u" ? null : new ResizeObserver(report);
      return observer?.observe(current), observer?.observe(document.documentElement), () => {
        observer?.disconnect(), (0, runtime2.setHostFootSlotInset)(id, null);
      };
    }, [ref, atFoot, id]);
  }
  function revealFoot() {
    if (!footRevealed) {
      footRevealed = !0, footRevealedAt = footRevealNow();
      for (let listener of footRevealListeners)
        listener();
    }
  }
  function subscribeFootReveal(listener) {
    return footRevealListeners.add(listener), () => {
      footRevealListeners.delete(listener);
    };
  }
  function useFootToolbarReveal({ shown, chatMayCome, slotReported, releaseBy = FOOT_REVEAL_RELEASE_MS }) {
    let revealed = reactFootReveal.useSyncExternalStore(subscribeFootReveal, () => footRevealed, () => footRevealed), ready2 = shown && (!chatMayCome || slotReported || footRevealNow() >= releaseBy), held = shown && !revealed && !ready2;
    return reactFootReveal.useEffect(() => {
      ready2 && revealFoot();
    }, [ready2]), reactFootReveal.useEffect(() => {
      if (!(!shown || footRevealed))
        return setFootRevealTimeout(revealFoot, Math.max(0, releaseBy - footRevealNow()));
    }, [shown, releaseBy]), {
      held,
      className: held ? FOOT_REVEAL_TRANSITION_CLASSES + " pointer-events-none opacity-0" : FOOT_REVEAL_ENTER_CLASSES,
      joins: revealed && footRevealNow() - footRevealedAt > FOOT_REVEAL_JOIN_MS ? FOOT_REVEAL_ENTER_CLASSES : ""
    };
  }
  function chatSlotReportedWidth(slot, width) {
    return slot.hasAttribute("data-chat-slot-opens") ? CHAT_SLOT_OPEN_WIDTH : Math.min(width, CHAT_SLOT_OPEN_WIDTH - 1);
  }
  function chatSlotGeometry(toolbar, slot, viewportHeight) {
    return {
      center: toolbar.width === 0 ? null : toolbar.left + toolbar.width / 2,
      slot: slot === null || slot.width === 0 ? null : {
        x: slot.left + slot.width / 2,
        y: viewportHeight - (slot.top + slot.height / 2),
        ...slot.reportedWidth !== void 0 && {
          width: slot.reportedWidth
        }
      }
    };
  }
  function subpixelTranslate(x, y) {
    let [value, value2] = [Math.round(x) - x, Math.round(y) - y];
    return value === 0 && value2 === 0 ? null : String(value) + "px " + String(value2) + "px";
  }
  function alignChatSlot(toolbar, slot) {
    if ((slot?.getAnimations?.().length ?? 0) > 0)
      return;
    toolbar.style.translate = "";
    let bounds = slot?.getBoundingClientRect();
    bounds !== void 0 && bounds.width !== 0 && (toolbar.style.translate = subpixelTranslate(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) ?? "");
  }
  function usePlaceChatSlot(toolbar, enabled) {
    reactPlaceChatSlot.useEffect(() => {
      if (!enabled || toolbar === null)
        return;
      let ownerDocument2 = toolbar.ownerDocument, ResizeObserverClass = ownerDocument2.defaultView?.ResizeObserver, MutationObserverClass = ownerDocument2.defaultView?.MutationObserver, report = () => {
        let slot2 = toolbar.querySelector("[data-chat-slot]");
        toolbar.hasAttribute("data-tb-foot") && alignChatSlot(toolbar, slot2);
        let bounds = slot2?.getBoundingClientRect();
        (0, runtime2.setHostFootState)(chatSlotGeometry(toolbar.getBoundingClientRect(), slot2 === null || bounds === void 0 ? null : {
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          ... slot2.hasAttribute("data-chat-slot-wide") && {
            reportedWidth: chatSlotReportedWidth(slot2, bounds.width)
          }
        }, ownerDocument2.documentElement.clientHeight));
      };
      report();
      let mutationObserver = MutationObserverClass === void 0 ? null : new MutationObserverClass(report);
      mutationObserver?.observe(ownerDocument2.documentElement, {
        attributes: !0,
        attributeFilter: ["data-mc-presentation"]
      }), mutationObserver?.observe(toolbar, {
        childList: !0,
        subtree: !0,
        attributes: !0,
        attributeFilter: ["class", "hidden", "data-chat-slot-opens"]
      });
      let parent = toolbar.parentElement, grandparent = parent?.parentElement ?? null, resizeObserver = ResizeObserverClass === void 0 ? null : new ResizeObserverClass(report);
      resizeObserver?.observe(toolbar), parent !== null && resizeObserver?.observe(parent), grandparent !== null && resizeObserver?.observe(grandparent), resizeObserver?.observe(ownerDocument2.documentElement);
      let slot = toolbar.querySelector("[data-chat-slot]");
      return slot !== null && resizeObserver?.observe(slot), () => {
        resizeObserver?.disconnect(), mutationObserver?.disconnect(), toolbar.hasAttribute("data-tb-foot") && alignChatSlot(toolbar, null), (0, runtime2.setHostFootState)(null);
      };
    }, [toolbar, enabled]);
  }
  function toolbarHitInsets(box, boxes, toolbar) {
    let others = boxes.filter((other) => other !== box), sameRow = others.filter((other) => rangesOverlap(other.top, other.bottom, box.top, box.bottom)), sameColumn = others.filter((other) => rangesOverlap(other.left, other.right, box.left, box.right)), leftLimit = (other) => other.kind === "control" ? (box.left + other.right) / 2 : other.kind === "line" ? (other.left + other.right) / 2 : other.right, rightLimit = (other) => other.kind === "control" ? (box.right + other.left) / 2 : other.kind === "line" ? (other.left + other.right) / 2 : other.left - TOOLBAR_HIT_SLOT_GAP, after = sameRow.filter((other) => other.left >= box.right - 1).sort((first, second) => first.left - second.left), next = after[0]?.kind === "line" && after[1]?.kind === "slot" ? after[1] : after[0];
    return {
      left: clampToolbarHit(box.left - Math.max(toolbar.left, ...sameRow.filter((other) => other.right <= box.left + 1).map(leftLimit))),
      right: clampToolbarHit(Math.min(toolbar.right, next === void 0 ? toolbar.right : rightLimit(next)) - box.right),
      top: clampToolbarHit(box.top - Math.max(toolbar.top, ...sameColumn.filter((other) => other.bottom <= box.top).map((other) => (box.top + other.bottom) / 2))),
      bottom: clampToolbarHit(Math.min(toolbar.bottom, ...sameColumn.filter((other) => other.top >= box.bottom).map((other) => (box.bottom + other.top) / 2)) - box.bottom)
    };
  }
  function toolbarHitTarget(element) {
    return element.matches(":disabled") ? element.closest('[aria-disabled="true"]') : element;
  }
  function clearToolbarHit(element) {
    element.removeAttribute("data-tb-hit");
    for (let side2 of ["left", "right", "top", "bottom", "round"])
      element.style.removeProperty("--tb-hit-" + side2);
  }
  function layoutToolbarHitAreas(toolbar, win) {
    let bounds = toolbar.getBoundingClientRect(), kindOf = (element) => element.matches(".tb-divider") ? "line" : element.matches("[data-chat-slot]") ? "slot" : "control", boxes = Array.from(toolbar.querySelectorAll("button, a[href], .tb-divider, [data-chat-slot]")).filter((element) => element.getClientRects().length > 0).map((element) => {
      let {
        left,
        right,
        top,
        bottom
      } = element.getBoundingClientRect();
      return {
        el: element,
        kind: kindOf(element),
        left,
        right,
        top,
        bottom
      };
    }), radius = win.getComputedStyle(toolbar).borderTopLeftRadius, laidOut = /* @__PURE__ */ new Set();
    for (let box of boxes) {
      let target = box.kind === "control" ? toolbarHitTarget(box.el) : null;
      if (target === null)
        continue;
      let insets = toolbarHitInsets(box, boxes, bounds), [atLeft, atRight] = [
        box.left - insets.left <= bounds.left,
        box.right + insets.right >= bounds.right
      ], [atTop, atBottom] = [
        box.top - insets.top <= bounds.top,
        box.bottom + insets.bottom >= bounds.bottom
      ], corner = (round2) => round2 ? radius : "0";
      target.setAttribute("data-tb-hit", "");
      for (let side2 of ["left", "right", "top", "bottom"])
        target.style.setProperty("--tb-hit-" + side2, String(insets[side2]) + "px");
      target.style.setProperty("--tb-hit-round", [atTop && atLeft, atTop && atRight, atBottom && atRight, atBottom && atLeft].map(corner).join(" ")), laidOut.add(target);
    }
    for (let element of toolbarHitElements(toolbar))
      laidOut.has(element) || clearToolbarHit(element);
  }
  function useToolbarHitAreas(ref, enabled) {
    reactToolbarHitAreas.useEffect(() => {
      let toolbar = ref.current, win = toolbar?.ownerDocument.defaultView;
      if (!enabled || toolbar == null || win == null)
        return;
      let layout = () => layoutToolbarHitAreas(toolbar, win);
      layout();
      let resizeObserver = win.ResizeObserver === void 0 ? null : new win.ResizeObserver(layout);
      resizeObserver?.observe(toolbar);
      let mutationObserver = win.MutationObserver === void 0 ? null : new win.MutationObserver(layout);
      return mutationObserver?.observe(toolbar, {
        subtree: !0,
        childList: !0,
        characterData: !0,
        attributes: !0,
        attributeFilter: ["class", "hidden", "disabled"]
      }), () => {
        resizeObserver?.disconnect(), mutationObserver?.disconnect();
        for (let element of toolbarHitElements(toolbar))
          clearToolbarHit(element);
      };
    }, [ref, enabled]);
  }
  return bindRuntimeValue(runtime2, "reactPresentationSheet", () => reactPresentationSheet, (value) => {
    reactPresentationSheet = value;
  }), bindRuntimeValue(runtime2, "PRESENTATION_ATTRIBUTE", () => PRESENTATION_ATTRIBUTE, (value) => {
    PRESENTATION_ATTRIBUTE = value;
  }), bindRuntimeValue(runtime2, "subscribePresentationAttribute", () => subscribePresentationAttribute), bindRuntimeValue(runtime2, "usePresentationSheetOpen", () => usePresentationSheetOpen), bindRuntimeValue(runtime2, "reactFloatingToolbar", () => reactFloatingToolbar, (value) => {
    reactFloatingToolbar = value;
  }), bindRuntimeValue(runtime2, "watchChatSlotCover", () => watchChatSlotCover), bindRuntimeValue(runtime2, "CHAT_SLOT_COVER_INSET", () => CHAT_SLOT_COVER_INSET, (value) => {
    CHAT_SLOT_COVER_INSET = value;
  }), bindRuntimeValue(runtime2, "CHAT_SLOT_COVER_SETTLE_MS", () => CHAT_SLOT_COVER_SETTLE_MS, (value) => {
    CHAT_SLOT_COVER_SETTLE_MS = value;
  }), bindRuntimeValue(runtime2, "CHAT_SLOT_COVER_RECHECKS", () => CHAT_SLOT_COVER_RECHECKS, (value) => {
    CHAT_SLOT_COVER_RECHECKS = value;
  }), bindRuntimeValue(runtime2, "CHAT_SLOT_COVER_EVENTS", () => CHAT_SLOT_COVER_EVENTS, (value) => {
    CHAT_SLOT_COVER_EVENTS = value;
  }), bindRuntimeValue(runtime2, "CHAT_SLOT_COVER_LAZY_EVENTS", () => CHAT_SLOT_COVER_LAZY_EVENTS, (value) => {
    CHAT_SLOT_COVER_LAZY_EVENTS = value;
  }), bindRuntimeValue(runtime2, "isLiveRegionElement", () => isLiveRegionElement), bindRuntimeValue(runtime2, "chatSlotCoverKind", () => chatSlotCoverKind), bindRuntimeValue(runtime2, "XHTML_NAMESPACE", () => XHTML_NAMESPACE, (value) => {
    XHTML_NAMESPACE = value;
  }), bindRuntimeValue(runtime2, "jsxChatToggleSlot", () => jsxChatToggleSlot, (value) => {
    jsxChatToggleSlot = value;
  }), bindRuntimeValue(runtime2, "CHAT_SLOT_OPEN_WIDTH", () => CHAT_SLOT_OPEN_WIDTH, (value) => {
    CHAT_SLOT_OPEN_WIDTH = value;
  }), bindRuntimeValue(runtime2, "ChatToggleSlot", () => ChatToggleSlot), bindRuntimeValue(runtime2, "reactChatSlot", () => reactChatSlot, (value) => {
    reactChatSlot = value;
  }), bindRuntimeValue(runtime2, "FRAME_BAR_TIP_KEY", () => FRAME_BAR_TIP_KEY, (value) => {
    FRAME_BAR_TIP_KEY = value;
  }), bindRuntimeValue(runtime2, "FRAME_BAR_TIP_GAP", () => FRAME_BAR_TIP_GAP, (value) => {
    FRAME_BAR_TIP_GAP = value;
  }), bindRuntimeValue(runtime2, "reportFrameBarTip", () => reportFrameBarTip), bindRuntimeValue(runtime2, "reactArmedTool", () => reactArmedTool, (value) => {
    reactArmedTool = value;
  }), bindRuntimeValue(runtime2, "usePutDownArmedToolOnBlur", () => usePutDownArmedToolOnBlur), bindRuntimeValue(runtime2, "reactPlaceChatSlot", () => reactPlaceChatSlot, (value) => {
    reactPlaceChatSlot = value;
  }), bindRuntimeValue(runtime2, "chatSlotReportedWidth", () => chatSlotReportedWidth), bindRuntimeValue(runtime2, "chatSlotGeometry", () => chatSlotGeometry), bindRuntimeValue(runtime2, "subpixelTranslate", () => subpixelTranslate), bindRuntimeValue(runtime2, "alignChatSlot", () => alignChatSlot), bindRuntimeValue(runtime2, "usePlaceChatSlot", () => usePlaceChatSlot), bindRuntimeValue(runtime2, "reactToolbarHitAreas", () => reactToolbarHitAreas, (value) => {
    reactToolbarHitAreas = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_HIT_MAX", () => TOOLBAR_HIT_MAX, (value) => {
    TOOLBAR_HIT_MAX = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_HIT_SLOT_GAP", () => TOOLBAR_HIT_SLOT_GAP, (value) => {
    TOOLBAR_HIT_SLOT_GAP = value;
  }), bindRuntimeValue(runtime2, "rangesOverlap", () => rangesOverlap, (value) => {
    rangesOverlap = value;
  }), bindRuntimeValue(runtime2, "clampToolbarHit", () => clampToolbarHit, (value) => {
    clampToolbarHit = value;
  }), bindRuntimeValue(runtime2, "toolbarHitInsets", () => toolbarHitInsets), bindRuntimeValue(runtime2, "toolbarHitTarget", () => toolbarHitTarget), bindRuntimeValue(runtime2, "toolbarHitElements", () => toolbarHitElements, (value) => {
    toolbarHitElements = value;
  }), bindRuntimeValue(runtime2, "clearToolbarHit", () => clearToolbarHit), bindRuntimeValue(runtime2, "layoutToolbarHitAreas", () => layoutToolbarHitAreas), bindRuntimeValue(runtime2, "useToolbarHitAreas", () => useToolbarHitAreas), bindRuntimeValue(runtime2, "jsxFloatingToolbar", () => jsxFloatingToolbar, (value) => {
    jsxFloatingToolbar = value;
  }), bindRuntimeValue(runtime2, "FOOT_INSET_MARGIN", () => FOOT_INSET_MARGIN, (value) => {
    FOOT_INSET_MARGIN = value;
  }), bindRuntimeValue(runtime2, "FOOT_TOOLBAR_PAD_CLASS", () => FOOT_TOOLBAR_PAD_CLASS, (value) => {
    FOOT_TOOLBAR_PAD_CLASS = value;
  }), bindRuntimeValue(runtime2, "FOOT_TOOLBAR_SHEET_PAD_CLASS", () => FOOT_TOOLBAR_SHEET_PAD_CLASS, (value) => {
    FOOT_TOOLBAR_SHEET_PAD_CLASS = value;
  }), bindRuntimeValue(runtime2, "FloatingToolbar", () => FloatingToolbar, (value) => {
    FloatingToolbar = value;
  }), bindRuntimeValue(runtime2, "footInsetFromRect", () => footInsetFromRect), bindRuntimeValue(runtime2, "useReportFootInset", () => useReportFootInset), bindRuntimeValue(runtime2, "reactFootReveal", () => reactFootReveal, (value) => {
    reactFootReveal = value;
  }), bindRuntimeValue(runtime2, "FOOT_REVEAL_RELEASE_MS", () => FOOT_REVEAL_RELEASE_MS, (value) => {
    FOOT_REVEAL_RELEASE_MS = value;
  }), bindRuntimeValue(runtime2, "FOOT_REVEAL_TRANSITION_CLASSES", () => FOOT_REVEAL_TRANSITION_CLASSES, (value) => {
    FOOT_REVEAL_TRANSITION_CLASSES = value;
  }), bindRuntimeValue(runtime2, "FOOT_REVEAL_JOIN_MS", () => FOOT_REVEAL_JOIN_MS, (value) => {
    FOOT_REVEAL_JOIN_MS = value;
  }), bindRuntimeValue(runtime2, "FOOT_REVEAL_ENTER_CLASSES", () => FOOT_REVEAL_ENTER_CLASSES, (value) => {
    FOOT_REVEAL_ENTER_CLASSES = value;
  }), bindRuntimeValue(runtime2, "footRevealed", () => footRevealed, (value) => {
    footRevealed = value;
  }), bindRuntimeValue(runtime2, "footRevealedAt", () => footRevealedAt, (value) => {
    footRevealedAt = value;
  }), bindRuntimeValue(runtime2, "footRevealNow", () => footRevealNow, (value) => {
    footRevealNow = value;
  }), bindRuntimeValue(runtime2, "setFootRevealTimeout", () => setFootRevealTimeout, (value) => {
    setFootRevealTimeout = value;
  }), bindRuntimeValue(runtime2, "footRevealListeners", () => footRevealListeners, (value) => {
    footRevealListeners = value;
  }), bindRuntimeValue(runtime2, "revealFoot", () => revealFoot), bindRuntimeValue(runtime2, "subscribeFootReveal", () => subscribeFootReveal), bindRuntimeValue(runtime2, "useFootToolbarReveal", () => useFootToolbarReveal),() => {
    reactPresentationSheet = (0,runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace) (), 1), PRESENTATION_ATTRIBUTE = "data-mc-presentation", reactFloatingToolbar =(0,runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace) (), 1), CHAT_SLOT_COVER_INSET = 4, CHAT_SLOT_COVER_SETTLE_MS = 100, CHAT_SLOT_COVER_RECHECKS = 3, CHAT_SLOT_COVER_EVENTS = [
      "pointerdown",
      "pointerup",
      "keydown",
      "keyup",
      "toggle"
    ], CHAT_SLOT_COVER_LAZY_EVENTS = [
      "pointermove",
      "focusin",
      "scroll",
      "wheel",
      "animationstart",
      "transitionrun"
    ], XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml", jsxChatToggleSlot = (0, runtime2.toModuleNamespace)((0,runtime2.loadJsxNamespace) (), 1), CHAT_SLOT_OPEN_WIDTH = 80, reactChatSlot =(0,runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace) (), 1), FRAME_BAR_TIP_KEY = "__frame_bar_tip", FRAME_BAR_TIP_GAP = 8, reactArmedTool = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactPlaceChatSlot = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), reactToolbarHitAreas = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), TOOLBAR_HIT_MAX = 10, TOOLBAR_HIT_SLOT_GAP = 4.5, rangesOverlap = (start, end, otherStart, otherEnd) => start < otherEnd && otherStart < end, clampToolbarHit = (value) => Math.min(Math.max(value, 0), TOOLBAR_HIT_MAX), toolbarHitElements = (toolbar) => Array.from(toolbar.querySelectorAll("[data-tb-hit]")), jsxFloatingToolbar = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), FOOT_INSET_MARGIN = 8, FOOT_TOOLBAR_PAD_CLASS = "pb-[calc(var(--mc-foot-gap)+var(--mc-foot-inset,0px))]", FOOT_TOOLBAR_SHEET_PAD_CLASS = "[:root[data-mc-presentation=sheet]_&]:pb-[var(--mc-foot-gap)]", FloatingToolbar = reactChatSlot.forwardRef(function({ label, collapsed = !1, density = "compact", atFoot = !1,
      armedTool,
      "data-tb-foot": footAttribute, className, children, ...rest }, ref) {
      let ref2 = reactChatSlot.useRef(null), callback = reactChatSlot.useCallback((element) => {
        ref2.current = element, typeof ref == "function" ? ref(element) : ref !== null && (ref.current = element);
      }, [ref]); useReportFootInset(ref2, atFoot);
      let reportsTip = atFoot || footAttribute !== void 0;
      return reactChatSlot.useEffect(() => reportsTip && ref2.current !== null ? reportFrameBarTip(ref2.current, {
        words: runtime2.hostWords,
        onWords: runtime2.subscribeHostSaveChrome,
        post: (message, win) => (0, runtime2.postToHost)(message, win)
      }) : void 0, [reportsTip]), usePutDownArmedToolOnBlur(armedTool), useToolbarHitAreas(ref2, footAttribute !== void 0), jsxFloatingToolbar.jsx(runtime2.CdsRoot, {
        density,
        render: jsxFloatingToolbar.jsx(runtime2.Surface, {
          elevation: runtime2.PANEL_ELEVATION,
          ref: callback,
          role: "toolbar",
          "aria-label": label,
          "data-mc-chrome": "",
          "data-tb-foot": footAttribute,
          className: (0, runtime2.joinClassNames)("p-px", className),
          ...rest
        }),
        children: jsxFloatingToolbar.jsx(runtime2.TooltipProvider, {
          children: jsxFloatingToolbar.jsx(runtime2.ToolbarFloatingContext.Provider, {
            value: collapsed,
            children
          })
        })
      });
    }), reactFootReveal = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), FOOT_REVEAL_RELEASE_MS = 2e3, FOOT_REVEAL_TRANSITION_CLASSES = "transition-opacity duration-base ease-out motion-reduce:transition-none", FOOT_REVEAL_JOIN_MS = 300, FOOT_REVEAL_ENTER_CLASSES = FOOT_REVEAL_TRANSITION_CLASSES + " starting:opacity-0", footRevealed = !1, footRevealedAt = -1 / 0, footRevealNow = () => performance.now(), setFootRevealTimeout = (callback, delay) => {
      let timer = setTimeout(callback, delay);
      return () => clearTimeout(timer);
    }, footRevealListeners = /* @__PURE__ */ new Set();
  };
}
export {
  installUiToolbarFoot
};
