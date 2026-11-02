// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiArtifactToolbar(runtime2) {
  var reactA6, jsx_5, TOOLBAR_WIDE_BREAKPOINT, TOOLBAR_COMPACT_BREAKPOINT, TOOLBAR_FULL_BREAKPOINT, TOOLBAR_QUIET_SELECTOR, TOOLBAR_CONTENT_SELECTOR, TOOLBAR_LAYOUT_ROLES, isToolbarSaveIndicator, toggleAttributeIfChanged, TOOLBAR_WORD_LOCK_MARGIN, TOOLBAR_PADDLE_CLASS, TOOLBAR_FOCUSABLE_SELECTOR, TOOLBAR_REFIT_EVENT;
  function hasVisibleToolbarContent(element, options = {}) {
    let attribute = element.getAttribute("role");
    if (options.skip?.(element) || options.pinFixed && element.classList.contains("tb-pin-scroll"))
      return !1;
    if (element.hasAttribute("data-tb-shows") && !element.closest("[hidden]"))
      return !0;
    if (element.matches(TOOLBAR_QUIET_SELECTOR) || attribute === "separator")
      return !1;
    if (element.matches(TOOLBAR_CONTENT_SELECTOR) || attribute !== null && !TOOLBAR_LAYOUT_ROLES.has(attribute))
      return !0;
    for (let value of element.childNodes)
      if (value.nodeType === 3 && value.textContent?.trim() || value.nodeType === 1 && hasVisibleToolbarContent(value, options))
        return !0;
    return !1;
  }
  function toolbarContentCount(element, options) {
    let index4 = 0;
    for (let value of element.children)
      index4 += value.matches("[data-tb-seat], .contents") ? toolbarContentCount(value, options) : hasVisibleToolbarContent(value, options) ? 1 : 0;
    return index4;
  }
  function collectToolbarLeaves(element, options) {
    let list = [];
    for (let value of element.children)
      value.matches("[data-tb-seat], .contents") ? list.push(...collectToolbarLeaves(value, options)) : hasVisibleToolbarContent(value, options) && list.push(...value.getClientRects().length > 0 ? [value] : collectToolbarLeaves(value, options));
    return list;
  }
  function toolbarLeadFloor(card, leaf) {
    let element = leaf.closest(".tb-scroll");
    if (!element)
      return 0;
    let bounds = card.getBoundingClientRect(), bounds2 = element.getBoundingClientRect(), value = leaf.getBoundingClientRect().right + element.scrollLeft - bounds.left + (parseFloat(getComputedStyle(element).paddingRight) || 0) + (bounds.right - bounds2.right);
    return Math.max(0, Math.ceil(value * 100) / 100);
  }
  function updateToolbarHug(toolbar) {
    let card = toolbar.querySelector(".tb-card-start");
    if (!card)
      return;
    let options = {
      pinFixed: toolbar.hasAttribute("data-pin-fixed")
    }, slots = [...card.querySelectorAll(".tb-scroll > .tb-slot")], count = 0;
    for (let value of slots)
      count += toolbarContentCount(value, options);
    let leaves = count > 0 && count < 3 ? slots.flatMap((input) => collectToolbarLeaves(input, options)) : [], lead = leaves.find((input) => input.matches(TOOLBAR_FOCUSABLE_SELECTOR) || input.querySelector(TOOLBAR_FOCUSABLE_SELECTOR) !== null) ?? leaves[0] ?? null;
    toggleAttributeIfChanged(card, "data-tb-hug", lead !== null);
    let floor2 = lead === null ? 0 : toolbarLeadFloor(card, lead), lockWords = card.querySelector(".tb-lock-words"), style = getComputedStyle(toolbar), width = toolbar.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0), rem = parseFloat(getComputedStyle(toolbar.ownerDocument.documentElement).fontSize) || 16;
    lockWords !== null && lead !== null && (lead.contains(lockWords) || lockWords.compareDocumentPosition(lead) & 4) && width <= 26 * rem - 0.5 && lockWords.getClientRects().length > 0 && (floor2 -= lockWords.getBoundingClientRect().width + (parseFloat(getComputedStyle(lockWords.parentElement ?? lockWords).columnGap) || 0));
    let leadFloor = lead === null ? "" : String(Math.max(0, Math.ceil(floor2 * 100) / 100)) + "px", hugCover = lead !== null && leaves.indexOf(lead) < leaves.length - 1 ? toolbar.ownerDocument.defaultView?.matchMedia?.("(pointer: coarse)").matches ? "64" : "48" : "", changed = card.style.getPropertyValue("--tb-lead-floor") !== leadFloor || (card.getAttribute("data-tb-hug-cover") ?? "") !== hugCover;
    card.style.getPropertyValue("--tb-lead-floor") !== leadFloor && (leadFloor ? card.style.setProperty("--tb-lead-floor", leadFloor) : card.style.removeProperty("--tb-lead-floor")), (card.getAttribute("data-tb-hug-cover") ?? "") !== hugCover && (hugCover ? card.setAttribute("data-tb-hug-cover", hugCover) : card.removeAttribute("data-tb-hug-cover")), changed && card.querySelector(".tb-scroll")?.dispatchEvent(new (card.ownerDocument.defaultView?.Event ?? Event)(TOOLBAR_REFIT_EVENT));
  }
  function updateToolbarEmptyState(toolbar) {
    let state = {
      pinFixed: toolbar.hasAttribute("data-pin-fixed")
    };
    for (let value of toolbar.querySelectorAll(".tb-slot, .tb-end-strip, .tb-tail, .tb-publish"))
      toggleAttributeIfChanged(value, "data-tb-empty", !hasVisibleToolbarContent(value, state));
    for (let value of toolbar.querySelectorAll(".tb-tail"))
      toggleAttributeIfChanged(value, "data-tb-only-dot", !hasVisibleToolbarContent(value, {
        ...state,
        skip: isToolbarSaveIndicator
      }));
    for (let value of toolbar.querySelectorAll(".tb-publish"))
      toggleAttributeIfChanged(value, "data-tb-has-save", [...value.querySelectorAll("[data-tb-save]")].some((input) => hasVisibleToolbarContent(input, state)));
    for (let value of toolbar.querySelectorAll(".tb-card"))
      toggleAttributeIfChanged(value, "data-tb-empty", !hasVisibleToolbarContent(value, state));
    let element = toolbar.querySelector(".tb-card-start");
    if (element) {
      let index4 = 0;
      for (let value of element.querySelectorAll(".tb-scroll > .tb-slot"))
        index4 += toolbarContentCount(value, state);
      toggleAttributeIfChanged(element, "data-tb-floor", index4 >= 3);
    }
  }
  function updateToolbarWordLock(toolbar) {
    let element = toolbar.querySelector(".tb-card-start .tb-scroll");
    if (!element)
      return;
    if (!element.querySelector(".tb-lock-words"))
      return element.removeAttribute("data-tb-lock-words");
    if (element.scrollLeft > 1 && !element.hasAttribute("data-tb-lock-words"))
      return;
    let element2 = element.querySelector(".tb-yields"), value = element2 ? "yield" : "";
    element.getAttribute("data-tb-lock-words") !== value && element.setAttribute("data-tb-lock-words", value);
    let value2 = element2 != null && element2.clientWidth < TOOLBAR_WORD_LOCK_MARGIN && element2.scrollWidth > element2.clientWidth;
    (element.scrollWidth > element.clientWidth + 1 || value2) && element.removeAttribute("data-tb-lock-words");
  }
  function effectiveToolbarDensity(density = "compact") {
    return (0, runtime2.useCoarsePointer)() ? "comfortable" : density;
  }
  function useToolbarInsets() {
    let [value, value2] = reactA6.useState(0), [value3, value4] = reactA6.useState(0), [value5, value6] = reactA6.useState(null);
    return reactA6.useLayoutEffect(() => {
      let value7 = null;
      for (let value11 = value5?.parentElement; value11 && !value7; value11 = value11.parentElement)
        value7 = value11.querySelector(":scope > .tb-root");
      if (!value5 || !value7) {
        value2(0), value4(0);
        return;
      }
      let value8 = value7, callback = () => {
        if (!value8.hasAttribute("data-tb-overlay")) {
          value2(0), value4(0);
          return;
        }
        let bounds = value8.getBoundingClientRect();
        value2(Math.max(0, Math.round(bounds.bottom - value5.getBoundingClientRect().top)));
        let value11 = [...value8.querySelectorAll(".tb-card")].map((input) => input.getBoundingClientRect()).filter((input) => input.width > 0).flatMap((input) => [
          input.left - bounds.left,
          bounds.right - input.right
        ]);
        value4(value11.length > 0 ? Math.max(0, Math.round(Math.min(...value11))) : 0);
      };
      callback();
      let value9 = typeof MutationObserver > "u" ? null : new MutationObserver(callback);
      value9?.observe(value8, {
        attributes: !0,
        attributeFilter: ["data-tb-overlay"]
      });
      let value10 = typeof ResizeObserver > "u" ? null : new ResizeObserver(callback);
      return value10?.observe(value8), value10?.observe(value5), () => {
        value9?.disconnect(), value10?.disconnect();
      };
    }, [value5]), [value, value6, value3];
  }
  function ArtifactToolbarDivider() {
    return jsx_5.jsx("span", {
      "aria-hidden": "true",
      className: "tb-divider mx-0.5 h-[18px] w-px shrink-0 self-center bg-border-line"
    });
  }
  function SaveStatusDot({ state }) {
    if (state.status === "error" || state.status === "readonly")
      return jsx_5.jsx(SaveProblemStatus, {
        state
      });
    let value = state.status === "saving", value2 = state.status === "dirty";
    return jsx_5.jsxs("span", {
      role: "status",
      title: value ? "正在保存…" : value2 ? "编辑暂存在编辑器中，应用后保存" : "每次更改都会自动保存",
      className: "inline-flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-fg-muted",
      children: [
        jsx_5.jsx("span", {
          className: "h-1.5 w-1.5 shrink-0 rounded-full " + (value || value2 ? "bg-fill-warning" : "bg-fill-success")
        }),
        jsx_5.jsx("span", {
          className: "tb-status-text truncate",
          children: value ? "正在保存…" : value2 ? "未保存的编辑" : "已自动保存"
        })
      ]
    });
  }
  function SaveStatusControl({ state, onRetry, tipSide = "bottom" }) {
    let value = reactA6.useSyncExternalStore(runtime2.subscribeHostSaveChrome, runtime2.hostDrawsSave, () => !1), value2 = reactA6.useSyncExternalStore(runtime2.subscribeHostSaveChrome, runtime2.hostTakesRetry, () => !1), [value3, value4] = reactA6.useState(!1), [value5, value6] = reactA6.useState(!1), [value7, value8] = reactA6.useState(!1), status = state.status, value9 = status === "saving" || status === "dirty" || status === "loading";
    value7 && !value9 && status !== "error" && value8(!1);
    let value10 = value3 || value5 || value7 && value9;
    if (value && (status !== "error" || value2) && !value10)
      return null;
    let value11 = status === "loading" || status === "cached" ? "loading" : status === "error" ? "error" : status === "dirty" || status === "saving" ? "pending" : "synced", value12 = value11 === "synced" && !value10, value13 = state.message ?? (value11 === "pending" ? "Syncing…" : value11 === "error" ? "Couldn’t sync — click to retry" : "All changes synced"), value14 = status === "error" || status === "dirty";
    return jsx_5.jsx(runtime2.Tooltip, {
      content: value13,
      side: tipSide,
      align: "end",
      multiline: !0,
      hoverable: !1,
      closeOnClick: !1,
      children: jsx_5.jsx("button", {
        type: "button",
        "aria-disabled": value14 ? void 0 : !0,
        onClick: () => {
          value14 && (status === "error" && value8(!0), onRetry());
        },
        onFocus: () => value4(!0),
        onBlur: () => value4(!1),
        onPointerEnter: () => value6(!0),
        onPointerLeave: () => value6(!1),
        "aria-label": value13,
        "data-sync": value11,
        "data-quiet": value12 ? "" : void 0,
        "data-testid": "sync-dot",
        className: "tb-sync-dot",
        children: jsx_5.jsx("span", {
          "aria-hidden": "true",
          className: "tb-sync-dot-mark"
        })
      })
    });
  }
  function SaveProblemStatus({ state }) {
    let value = reactA6.useSyncExternalStore(runtime2.subscribeHostSaveChrome, runtime2.hostDrawsReadOnly, () => !1);
    if (state.status === "error") {
      let value2 = state.message ?? "Couldn’t save";
      return jsx_5.jsxs("span", {
        role: "status",
        title: value2,
        className: "inline-flex max-w-80 shrink-0 items-center gap-1.5 truncate rounded-full bg-bad/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-bad",
        children: [
          jsx_5.jsx("span", {
            className: "h-1.5 w-1.5 shrink-0 rounded-full bg-fill-danger"
          }),
          jsx_5.jsx("span", {
            className: "tb-status-text truncate",
            children: value2
          })
        ]
      });
    }
    return state.status === "readonly" ? value ? null : jsx_5.jsxs("span", {
      role: "status",
      title: state.message ?? "只读",
      className: "tb-lock inline-flex shrink-0 items-center gap-1.5 px-1 text-body whitespace-nowrap text-fg-muted",
      children: [
        jsx_5.jsx(runtime2.Icon, {
          name: "Lock",
          size: "auto",
          className: "shrink-0"
        }),
        jsx_5.jsx("span", {
          className: "tb-lock-words truncate",
          children: "只读"
        })
      ]
    }) : null;
  }
  function toolbarScrollPageTarget(direction, scrollLeft, viewportWidth, scrollWidth, margin) {
    let value = Math.max(0, scrollWidth - viewportWidth), value2 = Math.max(viewportWidth - 2 * margin, 48), value3 = scrollLeft + direction * value2;
    return direction === 1 && value - value3 <= margin && (value3 = value), direction === -1 && value3 <= margin && (value3 = 0), Math.min(value, Math.max(0, value3));
  }
  function isFocusVisible(element) {
    try {
      return element.matches(":focus-visible");
    } catch {
      return !1;
    }
  }
  function ToolbarScrollPaddle({ dir, onPress, onLetGo }) {
    let value = dir === -1 ? "Scroll toolbar left" : "Scroll toolbar right";
    return jsx_5.jsx("div", {
      "data-tb-paddle": "",
      onClick: (input) => onPress(input.detail === 0),
      className: (0, runtime2.joinClassNames)(TOOLBAR_PADDLE_CLASS, dir === -1 ? "left-0" : "right-0"),
      children: jsx_5.jsx(runtime2.Button, {
        iconOnly: !0,
        size: "xs",
        variant: "ghost",
        icon: dir === -1 ? "CaretLeft" : "CaretRight",
        "aria-label": value,
        tooltip: !1,
        onBlur: onLetGo,
        onPointerDown: onLetGo
      })
    });
  }
  function ToolbarScrollArea({ leading, revealLeading, atEnd = !1, children }) {
    let ref = reactA6.useRef(null), ref2 = reactA6.useRef(null), [value, value2] = reactA6.useState(!1), [value3, value4] = reactA6.useState(!1), value5 = (0, runtime2.useCoarsePointer)(), ref3 = reactA6.useRef(void 0), ref4 = reactA6.useRef(!1), ref5 = reactA6.useRef(!1), targetRef = reactA6.useRef(null);
    reactA6.useEffect(() => {
      revealLeading != null && revealLeading !== ref3.current && (targetRef.current = null, ref.current?.scrollTo({
        left: 0,
        behavior: "smooth"
      })), ref3.current = revealLeading;
    }, [revealLeading]);
    let hasPagingRoom = reactA6.useCallback((width) => width >= (value5 ? ref2.current?.closest("[data-touch-targets='square']") ? 116 : 122 : 72), [value5]), callback = reactA6.useCallback(() => {
      let current = ref.current;
      if (!current)
        return;
      targetRef.current !== null && Math.abs(current.scrollLeft - targetRef.current) <= 1 && (targetRef.current = null);
      let width = ref2.current?.clientWidth ?? current.clientWidth, value6 = width >= (value5 ? 80 : 48), value7 = value6 && current.scrollLeft > 1, value8 = value6 && current.scrollLeft + current.clientWidth < current.scrollWidth - 1;
      value7 && value8 && !hasPagingRoom(width) && (value7 = value8 = !1);
      let hugCard = atEnd ? null : ref2.current?.closest(".tb-card-start[data-tb-hug-cover]");
      if (hugCard) {
        let cardWidth = hugCard.getBoundingClientRect().width, leadFloor = parseFloat(hugCard.style.getPropertyValue("--tb-lead-floor")) || 0;
        cardWidth >= leadFloor - 0.5 && cardWidth < leadFloor + Number(hugCard.getAttribute("data-tb-hug-cover")) - 0.5 && (value7 = value8 = !1);
      }
      let current2 = ref2.current, activeElement2 = current.ownerDocument.activeElement, value9 = activeElement2?.closest("[data-tb-paddle]");
      if (current2 && activeElement2 && value9 && value9.parentElement === current2 && (ref4.current || isFocusVisible(activeElement2))) {
        let value10 = value9 === current2.lastElementChild, target = targetRef.current, stillMoving = !(target !== null && (value10 ? target >= current.scrollWidth - current.clientWidth - 1 : target <= 1)) && (value10 ? current.scrollLeft + current.clientWidth < current.scrollWidth - 1 : current.scrollLeft > 1);
        if (!(value10 ? value8 : value7) && stillMoving) {
          let stripBounds = current2.getBoundingClientRect(), focusables = (0, runtime2.collectFocusableDescendants)(current).filter((input) => !input.hasAttribute("data-base-ui-focus-guard")), visibleFocusables = focusables.filter((input) => {
            let bounds = input.getBoundingClientRect();
            return bounds.width > 1 && bounds.left >= stripBounds.left && bounds.right <= stripBounds.right;
          }), ordered = (list) => value10 ? [...list].reverse() : list;
          for (let [element, preventScroll] of [
            ...ordered(visibleFocusables).map((input) => [input, !0]),
            ...ordered(focusables).map((input) => [input, !1])
          ]) {
            ref5.current = preventScroll;
            try {
              element.focus({
                preventScroll
              });
            } finally {
              ref5.current = !1;
            }
            if (!value9.contains(current.ownerDocument.activeElement)) {
              (0, runtime2.suppressEnterClicksUntilRelease)();
              break;
            }
          }
        } else if (!(value10 ? value8 : value7)) {
          let value11 = (0, runtime2.collectFocusableDescendants)(current);
          ref5.current = !0;
          try {
            for (let value12 of value10 ? value11.reverse() : value11)
              if (!value12.hasAttribute("data-base-ui-focus-guard") && (value12.focus({
                preventScroll: !0
              }), !value9.contains(current.ownerDocument.activeElement))) {
                (0, runtime2.suppressEnterClicksUntilRelease)();
                break;
              }
          } finally {
            ref5.current = !1;
          }
        }
      }
      value2(value7), value4(value8);
    }, [atEnd, value5, hasPagingRoom]);
    reactA6.useEffect(() => {
      let current = ref.current;
      if (!current)
        return;
      callback();
      let ancestor = current.closest(".tb-root"), index4 = 0, observer = new ResizeObserver(() => {
        callback(), cancelAnimationFrame(index4), ancestor && (index4 = requestAnimationFrame(() => {
          updateToolbarWordLock(ancestor), updateToolbarHug(ancestor);
        }));
      });
      observer.observe(current);
      for (let value7 of current.children)
        observer.observe(value7);
      let value6 = ancestor?.querySelector(".tb-card-end");
      ancestor && observer.observe(ancestor), value6 && observer.observe(value6);
      let callback4 = (event) => {
        if (event.ctrlKey && current.closest("[data-tb-overlay]") || current.scrollWidth <= current.clientWidth)
          return;
        let value7 = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        value7 !== 0 && (targetRef.current = null, current.scrollLeft += value7, event.preventDefault());
      };
      current.addEventListener("wheel", callback4, {
        passive: !1
      });
      let callback5 = (event) => {
        let target = event.target, current2 = ref2.current;
        if (!current2 || ref5.current || !(target instanceof Element) || target.hasAttribute("data-base-ui-focus-guard") || !isFocusVisible(target))
          return;
        targetRef.current = null;
        let bounds = target.getBoundingClientRect();
        if (bounds.width <= 1)
          return;
        let bounds2 = current2.getBoundingClientRect(), callback6 = (input) => current2.querySelector(":scope > " + input)?.getBoundingClientRect().width ?? 0, value7 = callback6("[data-tb-paddle]"), value8 = bounds2.width - 2 * (value7 + callback6("[data-tb-fade]")) >= bounds.width ? value7 + callback6("[data-tb-fade]") : value7, value9 = bounds2.left + value8, value10 = bounds2.right - value8, value11 = bounds.left < value9 || bounds.width > value10 - value9 ? bounds.left - value9 : bounds.right > value10 ? bounds.right - value10 : 0;
        if (Math.round(value11) === 0)
          return;
        let value12 = current.scrollWidth - current.clientWidth, value13 = current.scrollLeft + value11;
        value13 <= value8 && bounds.right - value11 + value13 <= value10 ? value13 = 0 : value12 - value13 <= value8 && bounds.left - value11 - (value12 - value13) >= value9 && (value13 = value12), current.scrollLeft = Math.round(value13);
      };
      current.addEventListener("focusin", callback5), current.addEventListener(TOOLBAR_REFIT_EVENT, callback);
      let clearTarget = () => {
        targetRef.current = null;
      };
      return current.addEventListener("pointerdown", clearTarget), current.addEventListener("scrollend", clearTarget), () => {
        cancelAnimationFrame(index4), observer.disconnect(), current.removeEventListener("wheel", callback4), current.removeEventListener("focusin", callback5), current.removeEventListener(TOOLBAR_REFIT_EVENT, callback), current.removeEventListener("pointerdown", clearTarget), current.removeEventListener("scrollend", clearTarget);
      };
    }, [callback]);
    let callback2 = () => {
      ref4.current = !1;
    }, callback3 = (input, options) => {
      let current = ref.current;
      if (!current)
        return;
      let value6 = ref2.current?.querySelector(":scope > [data-tb-paddle]"), value7 = ref2.current?.querySelector(":scope > span[aria-hidden]"), value8 = (value6?.offsetWidth ?? 24) + (value7?.offsetWidth ?? 24), value9 = ref2.current?.clientWidth ?? current.clientWidth, value10 = current.clientWidth - value9;
      ref4.current = options;
      let maxScroll = Math.max(0, current.scrollWidth - current.clientWidth), left = toolbarScrollPageTarget(input, current.scrollLeft, value9, current.scrollWidth - value10, value8);
      !hasPagingRoom(value9) && left > 0 && left < maxScroll && (left = input === 1 ? maxScroll : 0), targetRef.current = left, current.scrollTo({
        left,
        behavior: "smooth"
      });
    };
    return jsx_5.jsxs("div", {
      ref: ref2,
      className: (0, runtime2.joinClassNames)("relative flex min-w-0 items-center self-stretch", atEnd ? "tb-end-strip" : "flex-1"),
      children: [
        jsx_5.jsxs("div", {
          ref,
          onScroll: callback,
          className: "tb-scroll flex min-w-0 flex-1 items-center gap-1 self-stretch overflow-x-auto pointer-coarse:gap-1.5",
          children: [
            leading != null ? jsx_5.jsx("span", {
              "data-tb-cluster": "",
              className: "tb-slot flex shrink-0 items-center gap-1 pointer-coarse:gap-1.5",
              children: leading
            }) : null,
            jsx_5.jsx("div", {
              className: "tb-slot flex min-w-max items-center gap-1 pointer-coarse:gap-1.5",
              children
            })
          ]
        }),
        value ? jsx_5.jsxs(jsx_5.Fragment, {
          children: [
            jsx_5.jsx(ToolbarScrollPaddle, {
              dir: -1,
              onPress: (input) => callback3(-1, input),
              onLetGo: callback2
            }),
            jsx_5.jsx("span", {
              "aria-hidden": "true",
              "data-tb-fade": "start",
              className: "pointer-events-none absolute inset-y-0 left-6 z-10 w-6 pointer-coarse:left-10"
            })
          ]
        }) : null,
        value3 ? jsx_5.jsxs(jsx_5.Fragment, {
          children: [
            jsx_5.jsx("span", {
              "aria-hidden": "true",
              "data-tb-fade": "end",
              className: "pointer-events-none absolute inset-y-0 right-6 z-10 w-6 pointer-coarse:right-10"
            }),
            jsx_5.jsx(ToolbarScrollPaddle, {
              dir: 1,
              onPress: (input) => callback3(1, input),
              onLetGo: callback2
            })
          ]
        }) : null
      ]
    });
  }
  function ToolbarSaveControls({ saveState, saveMode = "manual", onSave, syncDot = !1, editing, onToggleEdit }) {
    let value = saveState.status === "readonly", value2 = saveState.status === "dirty" || saveState.status === "error", value3 = !value2 || saveState.status === "saving", value4 = saveState.status === "saving", value5 = value4 ? "Saving…" : "Save", value6 = value4 ? value5 : value2 ? "Publish your changes — every open view updates" : "Everything is published", value7 = (0, runtime2.useDisabledButtonDescription)({
      disabled: value3,
      name: value5,
      reason: value6
    }), ref = reactA6.useRef(null);
    return (0, runtime2.useDeferredTooltipFocus)(ref, value3), jsx_5.jsxs(jsx_5.Fragment, {
      children: [
        !value && onToggleEdit ? jsx_5.jsx(runtime2.ToolbarButton, {
          icon: "Edit",
          label: "编辑",
          tip: editing ? "完成编辑，返回实时视图" : "编辑",
          pressed: editing === !0,
          onClick: onToggleEdit,
          "data-testid": "dc-mode-edit"
        }) : null,
        !value && syncDot ? jsx_5.jsx(SaveStatusControl, {
          state: saveState,
          onRetry: onSave
        }) : null,
        !value && saveMode === "manual" && !syncDot ? jsx_5.jsx(runtime2.Tooltip, {
          content: value6,
          shortcut: value2 ? "cmd+s" : void 0,
          side: "bottom",
          align: "end",
          hoverable: !1,
          children: jsx_5.jsxs("span", {
            ref,
            tabIndex: value3 ? 0 : -1,
            ...value7.props,
            "data-tb-save": "",
            className: "inline-flex shrink-0 rounded outline-none focus-visible:outline-hidden focus-visible:shadow-focus",
            children: [
              jsx_5.jsx(runtime2.Button, {
                variant: value2 ? "primary" : "secondary",
                disabled: value3,
                onClick: onSave,
                "aria-label": value5,
                ...value7.inner,
                children: value5
              }),
              value7.mirror
            ]
          })
        }) : null
      ]
    });
  }
  function ToolbarSurface({ floating, ...remainingProps }) {
    return floating ? jsx_5.jsx(runtime2.Surface, {
      elevation: runtime2.PANEL_ELEVATION,
      ...remainingProps
    }) : jsx_5.jsx("div", {
      ...remainingProps
    });
  }
  function ArtifactToolbar({ title, saveState, saveMode = "manual", syncDot = !1, onSave, undo, publishControls = !0, pinned, trailing, leading, afterUndo, undoButtons = !0, leadingFlat = !1, density = "compact", touchTargets, readOnly, quietReadOnlyReason, variant = "docked", children, extrasEnd }) {
    let [, value] = reactA6.useState(0);
    reactA6.useEffect(() => undo?.subscribe(() => value((input) => input + 1)), [undo]);
    let value2 = readOnly === !0 || saveState.status === "readonly", value3 = reactA6.useSyncExternalStore(runtime2.subscribeHostSaveChrome, runtime2.hostDrawsReadOnly, () => !1), value4 = effectiveToolbarDensity(density), value5 = touchTargets === "square" ? value4 : density, ref = reactA6.useRef(null), [value6, value7] = reactA6.useState(!1), [value8, value9] = reactA6.useState(!1), value10 = (0, runtime2.useCoarsePointer)(), value11 = variant === "floating";
    return reactA6.useLayoutEffect(() => {
      let current = ref.current;
      if (!current)
        return;
      let callback = () => {
        let value13 = getComputedStyle(current), value14 = current.clientWidth - parseFloat(value13.paddingLeft || "0") - parseFloat(value13.paddingRight || "0");
        value7(current.clientWidth > 0 && value14 <= TOOLBAR_WIDE_BREAKPOINT), value9(current.clientWidth > 0 && value14 <= (value10 ? TOOLBAR_FULL_BREAKPOINT : TOOLBAR_COMPACT_BREAKPOINT)), value11 && (current.parentElement?.style.setProperty("--tb-overlay-h", String(current.offsetHeight) + "px"), ancestor?.style.setProperty("--tb-row-h", String(current.offsetHeight) + "px"));
      }, ancestor = current.closest("[data-mc-paned]"), value12 = typeof ResizeObserver < "u" ? new ResizeObserver(callback) : null;
      return value12?.observe(current), callback(), () => {
        value12?.disconnect(), ancestor?.style.removeProperty("--tb-row-h"), current.parentElement?.style.removeProperty("--tb-overlay-h");
      };
    }, [value10, value11]), reactA6.useLayoutEffect(() => {
      ref.current && (updateToolbarEmptyState(ref.current), updateToolbarWordLock(ref.current));
    }), reactA6.useLayoutEffect(() => {
      ref.current && updateToolbarHug(ref.current);
    }, []), reactA6.useLayoutEffect(() => {
      let current = ref.current;
      if (!current || typeof MutationObserver > "u")
        return;
      let index4 = 0, observer = new MutationObserver(() => {
        cancelAnimationFrame(index4), index4 = requestAnimationFrame(() => {
          updateToolbarEmptyState(current), updateToolbarWordLock(current), updateToolbarHug(current);
        });
      });
      return observer.observe(current, {
        subtree: !0,
        childList: !0,
        characterData: !0,
        attributes: !0,
        attributeFilter: [
          "hidden",
          "aria-hidden",
          "data-quiet",
          "data-pin-fixed"
        ]
      }), () => {
        observer.disconnect(), cancelAnimationFrame(index4);
      };
    }, []), jsx_5.jsx(runtime2.CdsRoot, {
      density: value5,
      render: jsx_5.jsx("header", {
        ref,
        "data-collapsed": value6 ? "" : void 0,
        "data-pin-fixed": value8 ? "" : void 0,
        "data-touch-targets": touchTargets,
        "data-tb-overlay": value11 ? "" : void 0,
        className: (0, runtime2.joinClassNames)("tb-root flex shrink-0 items-center", value11 ? "absolute inset-x-0 top-0 z-toolbar" : "h-10 gap-1 px-1 shadow-[inset_0_-1px_0_0_var(--t-border)] pointer-coarse:h-12 pointer-coarse:gap-1.5 pointer-coarse:px-2")
      }),
      children: jsx_5.jsx(runtime2.TooltipProvider, {
        children: jsx_5.jsx(runtime2.ToolbarFloatingContext.Provider, {
          value: value6,
          children: jsx_5.jsxs(runtime2.ToolbarQuietContext.Provider, {
            value: value2,
            children: [
              jsx_5.jsx(ToolbarSurface, {
                floating: value11 && !leadingFlat,
                className: "tb-card tb-card-start flex min-w-0 items-center",
                children: jsx_5.jsx(ToolbarScrollArea, {
                  revealLeading: saveState.status === "readonly" && !value3 || saveState.status === "error" && !syncDot ? saveState.status : void 0,
                  leading: jsx_5.jsxs(jsx_5.Fragment, {
                    children: [
                      leading,
                      undo && !value2 && undoButtons ? jsx_5.jsxs(jsx_5.Fragment, {
                        children: [
                          jsx_5.jsx(runtime2.ToolbarButton, {
                            iconOnly: !0,
                            icon: "ArrowCounterClockwise",
                            label: "撤销",
                            disabledTip: "暂无可撤销的操作",
                            shortcut: "cmd+z",
                            disabled: !undo.canUndo(),
                            onClick: () => undo.undo()
                          }),
                          jsx_5.jsx(runtime2.ToolbarButton, {
                            iconOnly: !0,
                            icon: "ArrowClockwise",
                            label: "重做",
                            disabledTip: "暂无可重做的操作",
                            shortcut: "shift+cmd+z",
                            disabled: !undo.canRedo(),
                            onClick: () => undo.redo()
                          })
                        ]
                      }) : null,
                      afterUndo,
                      saveState.status === "readonly" && quietReadOnlyReason !== void 0 && saveState.message === quietReadOnlyReason ? null : syncDot ? saveState.status === "readonly" ? jsx_5.jsx(SaveProblemStatus, {
                        state: saveState
                      }) : null : saveMode === "auto" ? jsx_5.jsx(SaveStatusDot, {
                        state: saveState
                      }) : jsx_5.jsx(SaveProblemStatus, {
                        state: saveState
                      })
                    ]
                  }),
                  children
                })
              }),
              jsx_5.jsxs(ToolbarSurface, {
                floating: value11,
                className: "tb-card tb-card-end ml-auto flex items-center gap-1 pointer-coarse:gap-1.5",
                children: [
                  extrasEnd != null ? jsx_5.jsx(ToolbarScrollArea, {
                    atEnd: !0,
                    children: extrasEnd
                  }) : null,
                  pinned != null && value8 || trailing != null ? jsx_5.jsxs("span", {
                    className: "tb-tail flex items-center gap-1 pointer-coarse:gap-1.5",
                    children: [
                      pinned != null && value8 ? jsx_5.jsx("span", {
                        "data-tb-cluster": "",
                        className: "tb-pin-fixed flex shrink-0 items-center gap-1 empty:hidden pointer-coarse:gap-1.5",
                        children: pinned
                      }) : null,
                      trailing != null ? jsx_5.jsx("span", {
                        "data-tb-cluster": "",
                        className: "tb-slot flex items-center gap-1 pointer-coarse:gap-1.5",
                        children: trailing
                      }) : null
                    ]
                  }) : null,
                  publishControls ? jsx_5.jsx("span", {
                    className: "tb-publish flex shrink-0 items-center gap-1 pointer-coarse:gap-1.5",
                    children: jsx_5.jsx(ToolbarSaveControls, {
                      saveState,
                      saveMode,
                      syncDot,
                      onSave
                    })
                  }) : null
                ]
              })
            ]
          })
        })
      })
    });
  }
  function ChatToolbarButton({ chat, onScreen = !0, disabled: disabled2 = !1, word = !1 }) {
    return (0, runtime2.useClaimHostChatToggle)(onScreen), word ? jsx_5.jsx(ChatWordButton, {
      chat,
      disabled: disabled2
    }) : jsx_5.jsx(runtime2.ToolbarButton, {
      ref: chat.ref,
      iconOnly: !0,
      icon: chat.pressed ? "ChatsFilled" : "Chats",
      label: chat.unread ? "对话，有新回复" : "对话",
      tip: "对话",
      tipSide: "top",
      tipShut: chat.tipShut,
      pressed: chat.pressed,
      disabled: disabled2,
      indicator: chat.unread ? jsx_5.jsx(runtime2.Pulse, {}) : void 0,
      "data-chat-button": "",
      ...chat.handlers
    });
  }
  function ChatWordButton({ chat, disabled: disabled2 }) {
    return jsx_5.jsxs("span", {
      className: "relative inline-flex shrink-0",
      children: [
        jsx_5.jsx(runtime2.Button, {
          ref: chat.ref,
          className: "w-16",
          variant: "ghost",
          pressed: chat.pressed,
          disabled: disabled2,
          "aria-label": chat.unread ? "对话，有新回复" : "对话",
          "data-chat-button": "",
          "data-comment-pass": "",
          "data-uncommentable": "",
          ...chat.handlers,
          children: "对话"
        }),
        chat.unread ? jsx_5.jsx("span", {
          "aria-hidden": "true",
          className: "pointer-events-none absolute top-0.5 right-0.5 flex",
          children: jsx_5.jsx(runtime2.Pulse, {})
        }) : null
      ]
    });
  }
  function ChatToolbarGroup({ joins, gap = "gap-0.5", divider = !0, ...rest }) {
    let [value] = reactA6.useState(joins);
    return jsx_5.jsxs("span", {
      className: (0, runtime2.joinClassNames)("flex shrink-0 items-center", gap, value),
      children: [
        divider ? jsx_5.jsx(ArtifactToolbarDivider, {}) : null,
        jsx_5.jsx(ChatToolbarButton, {
          ...rest
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "reactA6", () => reactA6, (value) => {
    reactA6 = value;
  }), bindRuntimeValue(runtime2, "jsx_5", () => jsx_5, (value) => {
    jsx_5 = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_WIDE_BREAKPOINT", () => TOOLBAR_WIDE_BREAKPOINT, (value) => {
    TOOLBAR_WIDE_BREAKPOINT = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_COMPACT_BREAKPOINT", () => TOOLBAR_COMPACT_BREAKPOINT, (value) => {
    TOOLBAR_COMPACT_BREAKPOINT = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_FULL_BREAKPOINT", () => TOOLBAR_FULL_BREAKPOINT, (value) => {
    TOOLBAR_FULL_BREAKPOINT = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_QUIET_SELECTOR", () => TOOLBAR_QUIET_SELECTOR, (value) => {
    TOOLBAR_QUIET_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_CONTENT_SELECTOR", () => TOOLBAR_CONTENT_SELECTOR, (value) => {
    TOOLBAR_CONTENT_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "TOOLBAR_LAYOUT_ROLES", () => TOOLBAR_LAYOUT_ROLES, (value) => {
    TOOLBAR_LAYOUT_ROLES = value;
  }), bindRuntimeValue(runtime2, "hasVisibleToolbarContent", () => hasVisibleToolbarContent), bindRuntimeValue(runtime2, "toolbarContentCount", () => toolbarContentCount), bindRuntimeValue(runtime2, "collectToolbarLeaves", () => collectToolbarLeaves), bindRuntimeValue(runtime2, "TOOLBAR_FOCUSABLE_SELECTOR", () => TOOLBAR_FOCUSABLE_SELECTOR, (value) => {
    TOOLBAR_FOCUSABLE_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "toolbarLeadFloor", () => toolbarLeadFloor), bindRuntimeValue(runtime2, "updateToolbarHug", () => updateToolbarHug), bindRuntimeValue(runtime2, "TOOLBAR_REFIT_EVENT", () => TOOLBAR_REFIT_EVENT, (value) => {
    TOOLBAR_REFIT_EVENT = value;
  }), bindRuntimeValue(runtime2, "isToolbarSaveIndicator", () => isToolbarSaveIndicator, (value) => {
    isToolbarSaveIndicator = value;
  }), bindRuntimeValue(runtime2, "toggleAttributeIfChanged", () => toggleAttributeIfChanged, (value) => {
    toggleAttributeIfChanged = value;
  }), bindRuntimeValue(runtime2, "updateToolbarEmptyState", () => updateToolbarEmptyState), bindRuntimeValue(runtime2, "TOOLBAR_WORD_LOCK_MARGIN", () => TOOLBAR_WORD_LOCK_MARGIN, (value) => {
    TOOLBAR_WORD_LOCK_MARGIN = value;
  }), bindRuntimeValue(runtime2, "updateToolbarWordLock", () => updateToolbarWordLock), bindRuntimeValue(runtime2, "effectiveToolbarDensity", () => effectiveToolbarDensity), bindRuntimeValue(runtime2, "useToolbarInsets", () => useToolbarInsets), bindRuntimeValue(runtime2, "ArtifactToolbarDivider", () => ArtifactToolbarDivider), bindRuntimeValue(runtime2, "SaveStatusDot", () => SaveStatusDot), bindRuntimeValue(runtime2, "SaveStatusControl", () => SaveStatusControl), bindRuntimeValue(runtime2, "SaveProblemStatus", () => SaveProblemStatus), bindRuntimeValue(runtime2, "toolbarScrollPageTarget", () => toolbarScrollPageTarget), bindRuntimeValue(runtime2, "TOOLBAR_PADDLE_CLASS", () => TOOLBAR_PADDLE_CLASS, (value) => {
    TOOLBAR_PADDLE_CLASS = value;
  }), bindRuntimeValue(runtime2, "isFocusVisible", () => isFocusVisible), bindRuntimeValue(runtime2, "ToolbarScrollPaddle", () => ToolbarScrollPaddle), bindRuntimeValue(runtime2, "ToolbarScrollArea", () => ToolbarScrollArea), bindRuntimeValue(runtime2, "ToolbarSaveControls", () => ToolbarSaveControls), bindRuntimeValue(runtime2, "ToolbarSurface", () => ToolbarSurface), bindRuntimeValue(runtime2, "ArtifactToolbar", () => ArtifactToolbar), bindRuntimeValue(runtime2, "ChatToolbarButton", () => ChatToolbarButton), bindRuntimeValue(runtime2, "ChatWordButton", () => ChatWordButton), bindRuntimeValue(runtime2, "ChatToolbarGroup", () => ChatToolbarGroup), () => {
    (0, runtime2.initializeUiPropertyRow3)(), (0, runtime2.initializeUiInputs210)(), reactA6 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeUiPropertyPopover2)(), (0, runtime2.initializeUiPointerMedia)(), jsx_5 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), TOOLBAR_WIDE_BREAKPOINT = 1e3, TOOLBAR_COMPACT_BREAKPOINT = 896, TOOLBAR_FULL_BREAKPOINT = 1072, TOOLBAR_QUIET_SELECTOR = "[hidden], [aria-hidden='true'], [data-quiet], [data-tb-paddle], [data-tb-fade], .tb-divider", TOOLBAR_CONTENT_SELECTOR = "button, input, select, textarea, a[href], img, svg, video, canvas, [data-cds]:not([data-cds='Surface']), [data-tb-status], [data-tb-shows]", TOOLBAR_LAYOUT_ROLES = /* @__PURE__ */ new Set([
      "presentation",
      "none",
      "group",
      "toolbar",
      "separator",
      "region"
    ]), TOOLBAR_FOCUSABLE_SELECTOR = "button, a[href], input, select, textarea, [role='button']", TOOLBAR_REFIT_EVENT = "tb-refit", isToolbarSaveIndicator = (element) => element.matches(".tb-sync-dot, [data-tb-save]"), toggleAttributeIfChanged = (element, attribute, enabled) => {
      enabled !== element.hasAttribute(attribute) && element.toggleAttribute(attribute, enabled);
    }, TOOLBAR_WORD_LOCK_MARGIN = 48, TOOLBAR_PADDLE_CLASS = "absolute inset-y-0 z-10 flex w-6 items-center justify-center pointer-coarse:w-10";
  };
}
export {
  installUiArtifactToolbar
};
