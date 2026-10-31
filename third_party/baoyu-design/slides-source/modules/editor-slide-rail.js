// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorSlideRail(runtime2) {
  var SlideRailJsx, INHERIT_RAIL_THUMB_WIDTH_CLASS, RAIL_THUMB_DIMENSIONS_STYLE, READ_ONLY_PRESENTATION_MESSAGE, SLIDE_ALREADY_AT_DESTINATION_MESSAGE, SELECT_ONE_SLIDE_TO_COPY_LINK_MESSAGE, UNSKIP_SLIDE_LABEL, HIDE_SLIDE_THUMBNAILS_LABEL, ADD_SLIDE_LABEL, RAIL_COLUMN_WIDTH_CLASS, RAIL_COLUMN_THUMB_WIDTH, getRailScrollButtonPadding, preventRailMouseDownDefault, getRailScrollBehavior, RAIL_HOVER_ACTIONS_CLASS, RAIL_PAGE_BUTTON_CLASS, RAIL_THUMB_BORDER_CLASS, RAIL_PAGE_GRADIENT_CLASS, RAIL_SELECTION_RING_CLASS, THUMBNAIL_BADGE_CLASS, THUMBNAIL_BADGE_SURFACE_CLASS, THUMBNAIL_ICON_BADGE_CLASS, THUMBNAIL_ACTION_BUTTON_CLASS, SKIPPED_THUMBNAIL_ACTION_OFFSET_CLASS, SLIDE_VIEW_SWITCH_NAVIGATION_KEYS, disabledActionFromReason;
  function SlideCreationRailPlaceholder({ column }) {
    return SlideRailJsx.jsxs("div", {
      "aria-hidden": "true",
      className: (0, runtime2.joinClassNames)("sl-creation-under pointer-events-none absolute inset-0 flex", column && "flex-col", INHERIT_RAIL_THUMB_WIDTH_CLASS),
      children: [
        SlideRailJsx.jsx("div", {
          className: column ? "h-1" : "w-1"
        }),
        SlideRailJsx.jsx("div", {
          className: (0, runtime2.joinClassNames)("rounded-md p-1", INHERIT_RAIL_THUMB_WIDTH_CLASS),
          children: SlideRailJsx.jsx("div", {
            className: (0, runtime2.joinClassNames)("sl-creation-box overflow-hidden rounded-sm bg-panel", INHERIT_RAIL_THUMB_WIDTH_CLASS),
            children: SlideRailJsx.jsx("div", {
              className: (0, runtime2.joinClassNames)("mc-claude-box", INHERIT_RAIL_THUMB_WIDTH_CLASS),
              style: RAIL_THUMB_DIMENSIONS_STYLE
            })
          })
        })
      ]
    });
  }
  function SlideCreationRailCell({ id, active, delayMs, leaving, arrived, column }) {
    return SlideRailJsx.jsxs("div", {
      "aria-hidden": "true",
      "data-creation-cell": id,
      "data-arrived-box": arrived ? "" : void 0,
      className: (0, runtime2.joinClassNames)("flex shrink-0", column && "flex-col", INHERIT_RAIL_THUMB_WIDTH_CLASS),
      children: [
        SlideRailJsx.jsx("div", {
          className: column ? "h-1" : "w-1"
        }),
        SlideRailJsx.jsx("div", {
          className: (0, runtime2.joinClassNames)("rounded-md p-1", INHERIT_RAIL_THUMB_WIDTH_CLASS),
          children: SlideRailJsx.jsx("div", {
            className: (0, runtime2.joinClassNames)("sl-creation-box overflow-hidden rounded-sm bg-panel", INHERIT_RAIL_THUMB_WIDTH_CLASS, delayMs !== void 0 && "sl-creation-grow", leaving && "sl-creation-leave"),
            style: delayMs !== void 0 ? {
              animationDelay: String(delayMs) + "ms"
            } : void 0,
            children: SlideRailJsx.jsx("div", {
              className: (0, runtime2.joinClassNames)("mc-claude-box", active && "mc-claude-sheen", INHERIT_RAIL_THUMB_WIDTH_CLASS),
              style: RAIL_THUMB_DIMENSIONS_STYLE
            })
          })
        })
      ]
    });
  }
  function adjustMoveIndexAfterRemoval(fromIndex, toIndex) {
    return fromIndex < toIndex ? toIndex - 1 : toIndex;
  }
  function calculateRailPageScroll(direction, currentScroll, viewportWidth, scrollWidth, thumbnailWidth, padding) {
    let value = Math.max(0, scrollWidth - viewportWidth), value2 = Math.max(thumbnailWidth, Math.min(3 * thumbnailWidth, viewportWidth - thumbnailWidth)), value3 = currentScroll + direction * value2;
    return direction === 1 && currentScroll <= 1 && (value3 -= padding), direction === -1 && currentScroll >= value - 1 && (value3 += padding), direction === 1 && value - value3 < thumbnailWidth && (value3 = value), direction === -1 && value3 < thumbnailWidth && (value3 = 0), Math.min(value, Math.max(0, value3));
  }
  function scrollRailThumbnailIntoView(rail, thumbnail, expanded, behavior, column = !1) {
    let railRect = rail.getBoundingClientRect(), thumbnailRect = thumbnail.getBoundingClientRect();
    if (column) {
      let paddingTop = parseFloat(getComputedStyle(rail).scrollPaddingTop) || 0, margin = Math.max(0, Math.min(Math.max(expanded ? thumbnailRect.height : 0, paddingTop), (railRect.height - thumbnailRect.height) / 2)), delta = thumbnailRect.top < railRect.top + margin ? thumbnailRect.top - railRect.top - margin : thumbnailRect.bottom > railRect.bottom - margin ? thumbnailRect.bottom - railRect.bottom + margin : 0;
      Math.abs(delta) >= 1 && rail.scrollTo({
        top: rail.scrollTop + delta,
        behavior
      });
      return;
    }
    let value = (expanded ? thumbnailRect.width : 0) + getRailScrollButtonPadding(), value2 = Math.max(0, Math.min(value, (railRect.width - thumbnailRect.width) / 2)), value3 = thumbnailRect.left < railRect.left + value2 ? thumbnailRect.left - railRect.left - value2 : thumbnailRect.right > railRect.right - value2 ? thumbnailRect.right - railRect.right + value2 : 0;
    Math.abs(value3) >= 1 && rail.scrollTo({
      left: rail.scrollLeft + value3,
      behavior
    });
  }
  function formatSlideThumbnailLabel(slide, index4, thumbnail, openComments = 0) {
    let name = (0, runtime2.slideDisplayLabel)(slide);
    return "幻灯片 " + String(index4 + 1) + (slide.skipped === !0 ? " (skipped)" : "") + (thumbnail ? "（封面缩略图）" : "") + (name !== void 0 ? ": " + name : "") + formatOpenCommentCount(openComments);
  }
  function SlideThumbnailRail({ slides, look, assets, currentId, onSelect, onAdd, onDuplicate, onCopy, onDelete, onMove, onDuplicateAt, onToggleSkip, onSetCover, onCopyLink, coverId, heldSlide, onCollapse, onEnterSlide, gridOpen = !1, onSetGridOpen, notesOpen = !1, onToggleNotes, rootRef, readOnly = !1, commentCounts, peersDeck, resize, pending, personPaged = 0, actionsDensity, placement = "bottom", overPage = !1, actionRow = !0, several }) {
    let column = placement === "left", selection = several?.selection, quiet = several?.quiet, isSelected = (id) => selection?.has(id) ?? id === currentId, selectedCount = selection?.selected.length ?? 1, lastCountRef = runtime2.ReactGrid.useRef(selectedCount);
    runtime2.ReactGrid.useEffect(() => {
      let previous = lastCountRef.current;
      lastCountRef.current = selectedCount, previous !== selectedCount && (selectedCount > 1 ? (0, runtime2.announceLiveMessage)((selectedCount === slides.length ? "All " : "") + String(selectedCount) + " 页已选中", {
        ifIdle: !0
      }) : previous > 1 && currentId !== null && quiet !== !0 && (0, runtime2.announceLiveMessage)("仅幻灯片 " + String(callback(currentId, slides.findIndex((slide) => slide.id === currentId)) + 1) + " selected", {
        ifIdle: !0
      }));
    }, [selectedCount, slides, currentId, quiet]);
    let multiIds = runtime2.ReactGrid.useMemo(() => selection !== void 0 && selection.selected.length > 1 ? slides.filter((slide) => selection.has(slide.id)).map((slide) => slide.id) : [], [selection, slides]), value = (0, runtime2.useSlidePresence)(peersDeck, slides), value2 = runtime2.ReactGrid.useId(), memo4 = runtime2.ReactGrid.useMemo(() => new Map((pending?.cells ?? []).map((input, options) => [
      input.id,
      options
    ])), [pending?.cells]), callback = (input, options) => memo4.get(input) ?? options, callback2 = (input, options) => SlideRailJsx.jsx(SlideCreationRailCell, {
      id: input,
      column,
      arrived: slides.some((input2) => input2.id === input),
      active: pending?.active === input,
      delayMs: pending?.growing === !0 && (options > 0 || pending.growFirst) ? Math.min(options * runtime2.CREATION_CELL_STAGGER_MS, runtime2.CREATION_REVEAL_HOLD_MS) : void 0,
      leaving: pending?.leaving === !0
    }, "box:" + input), callback3 = (input) => {
      let value20 = pending?.cells ?? [], callback17 = (input2) => input2 !== void 0 && slides.some((input3) => input3.id === input2.id), value21 = input === void 0 ? value20.length : memo4.get(input) ?? 0, value22 = value21;
      for (; value22 > 0 && !callback17(value20[value22 - 1]); )
        value22--;
      return value20.slice(value22, value21).map((input2, options) => callback2(input2.id, value22 + options));
    }, callback4 = (input) => pending?.cells.some((input2) => input2.id === input && input2.as === "box") === !0, value3 = pending === void 0 || slides.some((input) => !callback4(input.id)), [value4, value5] = runtime2.ReactGrid.useState(null), [value6, value7] = runtime2.ReactGrid.useState(null);
    value4 !== null && !slides.some((slide) => slide.id === value4) && (value5(null), value7(null));
    let draggedIds = value4 === null ? [] : multiIds.includes(value4) ? multiIds : [value4], [value8, value9] = runtime2.ReactGrid.useState(null), [value10, value11] = runtime2.ReactGrid.useState(!1), ref = runtime2.ReactGrid.useRef(0), ref2 = runtime2.ReactGrid.useRef(null), count = 1500, ref3 = runtime2.ReactGrid.useRef(null);
    ref3.current = value8;
    let ref4 = runtime2.ReactGrid.useRef(null), ref5 = runtime2.ReactGrid.useRef(null), [lookVisible, setLookVisible] = runtime2.ReactGrid.useState();
    runtime2.ReactGrid.useLayoutEffect(() => {
      let current = ref5.current;
      if (look === void 0 || current === null) {
        setLookVisible(void 0);
        return;
      }
      let bounds = current.getBoundingClientRect(), nearView = (element) => {
        let rect = element.getBoundingClientRect();
        return rect.right > bounds.left - rect.width && rect.left < bounds.right + rect.width && rect.bottom > bounds.top - rect.height && rect.top < bounds.bottom + rect.height;
      };
      setLookVisible(new Set(Array.from(current.querySelectorAll('[role="option"]')).filter(nearView).map((element) => element.getAttribute("aria-posinset"))));
    }, [look]), runtime2.ReactGrid.useEffect(() => {
      let current = ref5.current;
      if (!current)
        return;
      let callback17 = (event) => {
        let target = event.target;
        target instanceof HTMLElement && value11(target.matches(":focus-visible") || target.closest('[data-kit="thumb-actions"]') !== null);
      }, callback18 = (input) => {
        let relatedTarget = input.relatedTarget;
        (!(relatedTarget instanceof Node) || !current.contains(relatedTarget)) && value11(!1);
      };
      return current.addEventListener("focusin", callback17), current.addEventListener("focusout", callback18), () => {
        current.removeEventListener("focusin", callback17), current.removeEventListener("focusout", callback18);
      };
    }, []);
    let ref6 = runtime2.ReactGrid.useRef(0), ref7 = runtime2.ReactGrid.useRef({
      x: 0,
      y: 0
    }), ref8 = runtime2.ReactGrid.useRef(!1), ref9 = runtime2.ReactGrid.useRef(0);
    runtime2.ReactGrid.useEffect(() => {
      readOnly && (clearTimeout(ref9.current), ref8.current = !1, value5(null), value7(null));
    }, [readOnly]);
    let ref10 = runtime2.ReactGrid.useRef(!1), ref11 = runtime2.ReactGrid.useRef(null), callback5 = runtime2.ReactGrid.useCallback((input) => {
      ref11.current = input, typeof rootRef == "function" ? rootRef(input) : rootRef && (rootRef.current = input);
    }, [rootRef]), resizeOptions = column ? void 0 : resize, layout = (0, runtime2.useSlideRailLayout)(ref11, resizeOptions, ref5, () => ref4.current), { maxW, gesture, setThumbW, takeAutoHold, forgetAutoHold } = layout, thumbW = column ? RAIL_COLUMN_THUMB_WIDTH : layout.thumbW, memo22 = runtime2.ReactGrid.useMemo(() => ({
      transform: "scale(calc(var(" + runtime2.RAIL_THUMB_WIDTH_CSS_VARIABLE + ") / " + String(thumbW) + "))",
      transformOrigin: "top left"
    }), [thumbW]), [value12, value13] = runtime2.ReactGrid.useState(!1), [value14, value15] = runtime2.ReactGrid.useState(!1), callback6 = runtime2.ReactGrid.useCallback(() => {
      let current = ref5.current;
      current && (value13(!column && current.scrollLeft > 1), value15(!column && current.scrollLeft + current.clientWidth < current.scrollWidth - 1));
    }, [column]), ref12 = runtime2.ReactGrid.useRef(!1), ref13 = runtime2.ReactGrid.useRef(!1), callback7 = runtime2.ReactGrid.useCallback((input, options) => {
      forgetAutoHold();
      let current = ref5.current, current2 = ref4.current;
      !current || !current2 || scrollRailThumbnailIntoView(current, current2, !input, options ? "auto" : getRailScrollBehavior(), column);
    }, [forgetAutoHold, column]), value16 = currentId !== null && callback4(currentId);
    runtime2.ReactGrid.useEffect(() => {
      let current = ref12.current;
      ref12.current = !1;
      let value20 = !ref13.current;
      if (ref13.current = !0, ref3.current !== null)
        return;
      callback7(current, value20);
      let current2 = ref5.current, activeElement2 = document.activeElement, value21 = ref2.current !== null && activeElement2 !== null && ref2.current.contains(activeElement2), value22 = Date.now() - ref.current < count && (activeElement2 === null || activeElement2 === document.body || !activeElement2.isConnected || value21);
      ref.current = 0, ref2.current = null, current2 && ref4.current && (value22 || activeElement2 instanceof HTMLElement && current2.contains(activeElement2) && activeElement2 !== ref4.current) && ref4.current.focus({
        preventScroll: !0
      });
    }, [currentId, value16]);
    let ref14 = runtime2.ReactGrid.useRef(Number.NaN);
    runtime2.ReactGrid.useLayoutEffect(() => {
      let value20 = takeAutoHold(thumbW), current = ref5.current;
      if (!(!value20 || !current)) {
        if (ref3.current !== null) {
          ref14.current = current.scrollLeft;
          return;
        }
        value20.onMount && !value20.held ? callback7(!1, !0) : (current.scrollLeft = (0, runtime2.calculateAnchoredRailScroll)(value20, thumbW, !value20.onMount), ref14.current = current.scrollLeft);
      }
    }, [thumbW, takeAutoHold, callback7]);
    let callback8 = runtime2.ReactGrid.useCallback(() => {
      let current = ref5.current;
      current && !(Math.abs(current.scrollLeft - ref14.current) <= 1) && forgetAutoHold();
    }, [forgetAutoHold]);
    runtime2.ReactGrid.useEffect(() => {
      let current = ref5.current;
      if (current)
        return current.addEventListener("scroll", callback8, {
          passive: !0
        }), () => current.removeEventListener("scroll", callback8);
    }, [callback8]);
    let callback9 = (input) => {
      ref15.current = !0, selection !== void 0 && selection.click(input, runtime2.PLAIN_SELECTION_MODIFIERS), (selection === void 0 || input === currentId) && onSelect(input);
    }, focusSlide = (input) => {
      if (selection === void 0 || !multiIds.includes(input))
        return callback9(input);
      ref15.current = !0, selection.promote(input);
    }, value17 = pending?.follow ?? null, value18 = pending !== void 0, ref15 = runtime2.ReactGrid.useRef(!1), ref16 = runtime2.ReactGrid.useRef(personPaged);
    runtime2.ReactGrid.useEffect(() => {
      ref15.current = !1;
      let current = ref5.current;
      if (!current || !value18)
        return;
      let callback17 = () => {
        ref15.current = !0;
      };
      return current.addEventListener("touchmove", callback17, {
        passive: !0
      }), () => current.removeEventListener("touchmove", callback17);
    }, [value18]), runtime2.ReactGrid.useEffect(() => {
      personPaged !== ref16.current && (ref16.current = personPaged, ref15.current = !0);
    }, [personPaged]), runtime2.ReactGrid.useEffect(() => {
      let current = ref5.current;
      if (value17 === null || ref15.current || !current)
        return;
      let element = current.querySelector('[data-creation-cell="' + (typeof CSS < "u" && typeof CSS.escape == "function" ? CSS.escape(value17) : value17) + '"]');
      element && (forgetAutoHold(), scrollRailThumbnailIntoView(current, element, !0, getRailScrollBehavior(), column));
    }, [value17, forgetAutoHold, column]), runtime2.ReactGrid.useEffect(() => {
      let current = ref5.current, value20 = current?.parentElement;
      if (!current || !value20)
        return;
      let callback17 = (event) => {
        if (column) {
          !event.ctrlKey && event.deltaY !== 0 && current.scrollHeight > current.clientHeight && (ref15.current = !0);
          return;
        }
        if (event.ctrlKey || current.scrollWidth <= current.clientWidth)
          return;
        let value21 = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        value21 !== 0 && (current.scrollLeft += value21, callback8(), ref15.current = !0, event.preventDefault());
      };
      value20.addEventListener("wheel", callback17, {
        passive: column
      }), current.addEventListener("scroll", callback6, {
        passive: !0
      });
      let observer = new ResizeObserver(callback6);
      return observer.observe(current), () => {
        value20.removeEventListener("wheel", callback17), current.removeEventListener("scroll", callback6), observer.disconnect();
      };
    }, [callback6, callback8, column]), runtime2.ReactGrid.useEffect(callback6, [
      callback6,
      slides.length,
      pending?.cells.length,
      thumbW
    ]);
    let callback10 = (input) => {
      let current = ref5.current;
      if (!current)
        return;
      ref15.current = !0, forgetAutoHold();
      let firstElementChild = current.firstElementChild, value20 = firstElementChild instanceof HTMLElement ? firstElementChild.offsetWidth : runtime2.MIN_RAIL_THUMB_WIDTH;
      current.scrollTo({
        left: calculateRailPageScroll(input, current.scrollLeft, current.clientWidth, current.scrollWidth, value20, getRailScrollButtonPadding()),
        behavior: getRailScrollBehavior()
      });
    };
    runtime2.ReactGrid.useEffect(() => {
      if (value4 === null)
        return;
      let current = ref5.current, current2 = ref11.current;
      if (!current || !current2)
        return;
      let count2 = 48, count3 = 32, count4 = 3, callback17 = (event) => {
        if (!ref8.current) {
          let current3 = ref7.current;
          (Math.abs(event.clientX - current3.x) > count4 || Math.abs(event.clientY - current3.y) > count4) && (ref8.current = !0);
        }
        if (event.preventDefault(), event.dataTransfer !== null && (event.dataTransfer.dropEffect = ref10.current ? "copy" : "move"), ref6.current = column ? event.clientY : event.clientX, !ref8.current)
          return;
        let bounds = current.getBoundingClientRect(), value20 = Math.max(0, column ? bounds.bottom - event.clientY : bounds.right - event.clientX), value21 = Math.max(0, column ? event.clientY - bounds.top : event.clientX - bounds.left), axis = column ? "scrollTop" : "scrollLeft";
        value20 < count2 ? (current[axis] += Math.ceil((count2 - value20) / count2 * count3), callback8()) : value21 < count2 && (current[axis] -= Math.ceil((count2 - value21) / count2 * count3), callback8());
      }, callback18 = () => {
        if (!ref8.current)
          return;
        let current3 = ref6.current, value20 = current.querySelectorAll('[draggable="true"], [data-arrived-box]'), length = value20.length;
        for (let index4 = 0; index4 < value20.length; index4++) {
          let value21 = value20.item(index4);
          if (value21 === null)
            continue;
          let bounds = value21.getBoundingClientRect();
          if (current3 < (column ? bounds.top + bounds.height / 2 : bounds.left + bounds.width / 2)) {
            length = index4;
            break;
          }
        }
        value7(length);
      }, callback19 = (event) => {
        event.preventDefault();
      }, callback20 = (input) => {
        let relatedTarget = input.relatedTarget;
        relatedTarget instanceof Node && current2.contains(relatedTarget) || (ref8.current = !1, value7(null));
      };
      return current2.addEventListener("dragover", callback17), current2.addEventListener("drop", callback19), current2.addEventListener("dragleave", callback20), current.addEventListener("scroll", callback18, {
        passive: !0
      }), () => {
        current2.removeEventListener("dragover", callback17), current2.removeEventListener("drop", callback19), current2.removeEventListener("dragleave", callback20), current.removeEventListener("scroll", callback18), value7(null);
      };
    }, [value4, callback8, column]);
    let callback11 = (input) => {
      if (!input && !readOnly && value4 !== null && value6 !== null && several !== void 0 && draggedIds.length > 1) {
        let order = slides.map((slide) => slide.id);
        ref10.current ? several.onDuplicateSlidesAt(draggedIds, value6) : (0, runtime2.moveIdsToIndex)(order, draggedIds, value6).some((id, index4) => id !== order[index4]) && several.onMoveSlides(draggedIds, value6);
      } else if (!input && !readOnly && value4 !== null && value6 !== null)
        if (ref10.current)
          onDuplicateAt(value4, value6);
        else {
          let value20 = slides.findIndex((input2) => input2.id === value4), value21 = adjustMoveIndexAfterRemoval(value20, value6);
          value20 >= 0 && value21 !== value20 && onMove(value4, value21);
        }
      value5(null), value7(null);
    }, marqueeEnabled = selection !== void 0 && !overPage && pending === void 0, marquee = (0, runtime2.useSlideRailMarquee)({
      scroller: ref5,
      stageThumb: ref4,
      enabled: marqueeEnabled,
      column,
      sel: selection,
      slides,
      currentId,
      onTaken: (id) => {
        ref15.current = !0, ref12.current = id !== currentId;
      }
    }), showsSelected = (id) => marquee.swept !== null ? marquee.swept.includes(id) : isSelected(id), callback12 = (event) => {
      let selectAll = selection !== void 0 && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "a";
      if (event.defaultPrevented || !selectAll && (event.metaKey || event.ctrlKey || event.altKey) || !value3 && event.target === event.currentTarget)
        return;
      if (selectAll) {
        event.preventDefault(), selection?.all();
        return;
      }
      if (event.key === "Tab")
        return value11(!0);
      if (event.key === "Escape" && selection !== void 0 && selection.selected.length > 1) {
        event.preventDefault(), selection.collapse();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && onEnterSlide !== void 0 && event.target.getAttribute("role") === "option") {
        event.preventDefault(), onEnterSlide();
        return;
      }
      if ((0, runtime2.isContextMenuKey)(event)) {
        event.preventDefault();
        let value23 = ref4.current?.getBoundingClientRect();
        if (currentId !== null && value23) {
          let value24 = event.target.closest('[data-kit="thumb-actions"]') !== null;
          value9({
            x: value23.left + Math.min(40, value23.width / 2),
            y: value23.top + Math.min(24, value23.height / 2),
            id: currentId,
            keyboard: !0,
            button: value24
          });
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (event.target.closest('[data-kit="thumb-actions"]') !== null)
          return;
        !readOnly && currentId !== null && slides.length > 1 && (event.preventDefault(), ref.current = Date.now(), ref2.current = null, several !== void 0 && multiIds.length > 1 ? several.onDeleteSlides(multiIds) : onDelete(currentId));
        return;
      }
      let value20 = slides.findIndex((input) => input.id === currentId), value21 = event.key === "ArrowLeft" || column && event.key === "ArrowUp" ? value20 - 1 : event.key === "ArrowRight" || column && event.key === "ArrowDown" ? value20 + 1 : event.key === "Home" ? 0 : event.key === "End" ? slides.length - 1 : null;
      if (value21 === null)
        return;
      event.preventDefault();
      let value22 = slides[Math.max(0, Math.min(slides.length - 1, value21))], extend = event.shiftKey && selection !== void 0;
      value22 && (value22.id !== currentId || !extend && multiIds.length > 1) && (event.target.closest('[data-kit="thumb-actions"]') !== null && (ref.current = Date.now(), ref2.current = null), extend ? (ref15.current = !0, selection?.extend(value22.id)) : callback9(value22.id));
    }, value19 = value8 ? slides.findIndex((input) => input.id === value8.id) : -1, menuIds = value8 === null ? [] : multiIds.includes(value8.id) ? multiIds : [value8.id];
    runtime2.ReactGrid.useEffect(() => {
      value8 !== null && value19 < 0 && value9(null);
    }, [value8, value19]);
    let callback13 = (input) => input.keyboard === !0 || input.inStrip === !0, callback14 = (input) => {
      let current = ref4.current;
      current === null || !callback13(input) || !document.hasFocus() || ((input.keyboard === !0 && input.button === !0 && ref3.current === input ? current.querySelector('[data-kit="thumb-actions"] button') : null) ?? current).focus({
        preventScroll: !0,
        focusVisible: input.keyboard === !0
      });
    }, callback15 = () => {
      ref3.current !== null && callback14(ref3.current), value9(null);
    }, callback16 = (input) => () => {
      let current = ref3.current, value20 = current !== null && callback13(current);
      value20 && queueMicrotask(() => callback14(current)), value9(null), value20 && (ref.current = Date.now(), ref2.current = document.activeElement?.closest("[data-mc-menu]") ?? null), input();
    }, toolbar = SlideRailJsx.jsx(SlideRailToolbar, {
      readOnly,
      onAdd,
      notesOpen,
      onToggleNotes,
      gridOpen,
      onSetGridOpen,
      onCollapse,
      placement,
      density: actionsDensity
    });
    return SlideRailJsx.jsxs("aside", {
      ref: callback5,
      "data-slides-rail-panel": column && !overPage ? "" : void 0,
      "data-slides-rail-drag": value4 !== null ? "" : void 0,
      className: (0, runtime2.joinClassNames)("relative flex shrink-0 flex-col border-border-line", !overPage && "bg-panel", "pb-[var(--sl-safe-b,0px)]", column ? (0, runtime2.joinClassNames)(RAIL_COLUMN_WIDTH_CLASS, "h-full min-h-0", !overPage && "border-r") : "w-full border-t"),
      style: {
        [runtime2.RAIL_THUMB_WIDTH_CSS_VARIABLE]: thumbW
      },
      children: [
        resizeOptions ? SlideRailJsx.jsx(runtime2.PanelResizeHandle, {
          name: "rail",
          label: "调整幻灯片缩略图大小",
          now: thumbW,
          min: runtime2.MIN_RAIL_THUMB_WIDTH,
          max: maxW,
          gesture,
          disabled: maxW <= runtime2.MIN_RAIL_THUMB_WIDTH,
          unavailableTip: notesOpen ? (0, runtime2.formatMessage)({
            defaultMessage: "空间不足，无法显示更大的缩略图。可尝试关闭演讲者备注。",
            id: "adHSoleI3A"
          }) : (0, runtime2.formatMessage)({
            defaultMessage: "空间不足，无法显示更大的缩略图",
            id: "BSOl2tTDic"
          }),
          onHome: () => setThumbW(runtime2.MIN_RAIL_THUMB_WIDTH),
          onEnd: () => setThumbW(1 / 0),
          onReset: () => setThumbW(runtime2.MIN_RAIL_THUMB_WIDTH),
          grabClassName: "justify-center pointer-coarse:flex pointer-coarse:left-24 pointer-coarse:right-[8.25rem]",
          grabTargetClassName: "max-w-full"
        }) : null,
        column ? SlideRailJsx.jsx("div", {
          className: (0, runtime2.joinClassNames)("shrink-0 border-b border-border-line", overPage && "invisible"),
          children: toolbar
        }) : actionRow ? toolbar : null,
        SlideRailJsx.jsxs("div", {
          className: (0, runtime2.joinClassNames)("group/rail relative isolate", column && "flex min-h-0 flex-1 flex-col", INHERIT_RAIL_THUMB_WIDTH_CLASS),
          children: [
            SlideRailJsx.jsxs("div", {
              ref: ref5,
              ...value3 ? {
                role: "listbox",
                "aria-label": "演示文稿",
                "aria-orientation": column ? "vertical" : "horizontal",
                "aria-multiselectable": selection !== void 0 ? !0 : void 0
              } : {
                tabIndex: -1
              },
              onKeyDown: callback12,
              onClick: (event) => {
                !marquee.ownsClick() && multiIds.length > 1 && event.target.closest('[role="option"]') === null && selection?.collapse();
              },
              className: (0, runtime2.joinClassNames)("flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", selection !== void 0 && "select-none", column ? "scroll-fade-y min-h-0 flex-1 flex-col items-center overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-2" : "min-w-0 overflow-x-auto px-3 py-2", INHERIT_RAIL_THUMB_WIDTH_CLASS),
              children: [
                slides.map((input, options) => SlideRailJsx.jsxs(runtime2.ReactGrid.Fragment, {
                  children: [
                    pending !== void 0 ? callback3(input.id) : null,
                    callback4(input.id) ? callback2(input.id, memo4.get(input.id) ?? options) : SlideRailJsx.jsxs("div", {
                      "data-creation-cell": pending !== void 0 ? input.id : void 0,
                      className: (0, runtime2.joinClassNames)("flex shrink-0", column && "flex-col", INHERIT_RAIL_THUMB_WIDTH_CLASS, pending?.fresh === input.id && "sl-creation-fresh relative"),
                      children: [
                        pending?.fresh === input.id ? SlideRailJsx.jsx(SlideCreationRailPlaceholder, {
                          column
                        }) : null,
                        SlideRailJsx.jsx("div", {
                          "data-drop-gap": "",
                          className: (0, runtime2.joinClassNames)(column ? "h-1 rounded-sm" : "w-1 rounded-sm", value6 === options && value4 !== null && "bg-app-accent"),
                          onDragOver: (event) => {
                            event.preventDefault(), value4 !== null && ref8.current && value7(options);
                          }
                        }),
                        SlideRailJsx.jsx("div", {
                          ref: input.id === currentId ? ref4 : void 0,
                          draggable: !readOnly,
                          onDragStart: (event) => {
                            if (readOnly || selection !== void 0 && (event.shiftKey || event.metaKey || event.ctrlKey)) {
                              event.preventDefault();
                              return;
                            }
                            ref10.current = event.altKey, event.dataTransfer.effectAllowed = event.altKey ? "copy" : "move", ref6.current = column ? event.clientY : event.clientX, ref7.current = {
                              x: event.clientX,
                              y: event.clientY
                            }, ref8.current = !1;
                            let id = input.id;
                            clearTimeout(ref9.current), ref9.current = setTimeout(() => {
                              value5(id), value7(null);
                            }, 0);
                          },
                          onDragEnd: (input2) => {
                            clearTimeout(ref9.current), ref8.current = !1, callback11(input2.dataTransfer?.dropEffect === "none");
                          },
                          onDragOver: (event) => {
                            if (event.preventDefault(), value4 === null || !ref8.current)
                              return;
                            let bounds = event.currentTarget.getBoundingClientRect();
                            value7((column ? event.clientY < bounds.top + bounds.height / 2 : event.clientX < bounds.left + bounds.width / 2) ? options : options + 1);
                          },
                          onClick: (event) => {
                            if (ref12.current = input.id !== currentId, selection === void 0 || !(event.shiftKey || (0, runtime2.hasToggleModifier)(event)))
                              return callback9(input.id);
                            ref15.current = !0;
                            let collapsing = selection.has(input.id) && selection.selected.length > 1, refocus = collapsing && input.id !== currentId;
                            ref12.current = collapsing ? input.id === currentId : input.id !== currentId, selection.click(input.id, event), refocus && ref4.current?.focus({
                              preventScroll: !0
                            });
                          },
                          onContextMenu: (event) => {
                            event.preventDefault(), focusSlide(input.id);
                            let state = {
                              x: event.clientX,
                              y: event.clientY,
                              id: input.id,
                              inStrip: ref5.current?.contains(document.activeElement) === !0
                            };
                            value9((input2) => input2 !== null && input2.keyboard === !0 && input2.id === input.id ? input2 : state);
                          },
                          role: "option",
                          "data-slide-id": input.id,
                          "aria-selected": isSelected(input.id),
                          "aria-current": selection !== void 0 && input.id === currentId ? "true" : void 0,
                          "aria-posinset": callback(input.id, options) + 1,
                          "aria-setsize": pending ? pending.cells.length : slides.length,
                          "aria-label": formatSlideThumbnailLabel(input, callback(input.id, options), input.id === coverId, commentCounts?.get(input.id)),
                          "aria-describedby": value.has(input.id) ? value2 + input.id : void 0,
                          title: input.skipped === !0 ? RAIL_SELECTION_RING_CLASS : void 0,
                          tabIndex: input.id === currentId ? 0 : -1,
                          className: (0, runtime2.joinClassNames)("group relative cursor-default rounded-md p-1 transition-colors", selection !== void 0 && "select-none", INHERIT_RAIL_THUMB_WIDTH_CLASS, "outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-app-accent", input.id !== currentId && "hover:bg-bg-warm/60", value4 === input.id && !ref10.current && "opacity-40", value4 !== input.id && draggedIds.includes(input.id) && !ref10.current && "opacity-40"),
                          children: SlideRailJsx.jsxs("div", {
                            className: (0, runtime2.joinClassNames)("relative overflow-hidden rounded-sm outline-3 outline-offset-2 transition-transform duration-150 ease-out motion-reduce:transition-none", !column && "origin-bottom", INHERIT_RAIL_THUMB_WIDTH_CLASS, input.id === currentId && !column && "scale-[calc(1_+_6.2_/_var(--sl-thumb-w))]", showsSelected(input.id) ? "outline-fill-accent" : "outline-transparent"),
                            children: [
                              SlideRailJsx.jsx("div", {
                                className: (0, runtime2.joinClassNames)("overflow-clip", INHERIT_RAIL_THUMB_WIDTH_CLASS, input.skipped === !0 && "opacity-40"),
                                style: RAIL_THUMB_DIMENSIONS_STYLE,
                                "aria-hidden": "true",
                                children: SlideRailJsx.jsx("div", {
                                  className: INHERIT_RAIL_THUMB_WIDTH_CLASS,
                                  style: memo22,
                                  children: SlideRailJsx.jsx(runtime2.SlideCanvas, {
                                    slide: look !== void 0 && lookVisible?.has(String(callback(input.id, options) + 1)) === !0 ? look(input) : input,
                                    assets,
                                    width: thumbW,
                                    animate: !1,
                                    editorChrome: !readOnly,
                                    structure: !1
                                  })
                                })
                              }),
                              SlideRailJsx.jsxs("span", {
                                "aria-hidden": "true",
                                "data-mc-chrome": "",
                                className: "absolute bottom-1 left-1 flex items-center gap-1",
                                children: [
                                  SlideRailJsx.jsxs("span", {
                                    className: (0, runtime2.joinClassNames)(THUMBNAIL_BADGE_CLASS, THUMBNAIL_BADGE_SURFACE_CLASS, input.id === currentId ? "text-fg" : "text-fg-muted"),
                                    children: [
                                      callback(input.id, options) + 1,
                                      input.id === coverId ? SlideRailJsx.jsx(ThumbnailIndicator, {}) : null
                                    ]
                                  }),
                                  SlideRailJsx.jsx(SlideCommentCountBadge, {
                                    count: commentCounts?.get(input.id) ?? 0
                                  })
                                ]
                              }),
                              SlideRailJsx.jsx(runtime2.SlidePresenceBadge, {
                                on: value.get(input.id),
                                id: value2 + input.id,
                                also: input.skipped === !0 ? RAIL_SELECTION_RING_CLASS : void 0
                              }),
                              input.skipped === !0 ? SlideRailJsx.jsx(SkippedSlideBadge, {
                                why: readOnly ? READ_ONLY_PRESENTATION_MESSAGE : heldSlide?.(input.id) !== void 0 ? runtime2.HELD_SLIDE_MESSAGE : void 0,
                                onUnskip: () => onToggleSkip(input.id)
                              }) : null,
                              SlideRailJsx.jsx(ThumbnailActionsButton, {
                                label: multiIds.includes(input.id) ? "操作：" + String(multiIds.length) + " 页幻灯片" : "幻灯片 " + String(callback(input.id, options) + 1) + "操作",
                                current: input.id === currentId,
                                expanded: value8?.id === input.id,
                                skipped: input.skipped === !0,
                                className: (0, runtime2.joinClassNames)(value8?.id === input.id || value10 && input.id === currentId ? "flex" : "hidden pointer-fine:group-hover:flex", input.id === currentId && "pointer-coarse:flex"),
                                onOpen: (input2, options2, context) => {
                                  focusSlide(input.id);
                                  let option = (context.closest('[role="option"]') ?? context).getBoundingClientRect();
                                  value9({
                                    x: input2.left + input2.width / 2,
                                    y: column ? option.bottom : option.top,
                                    id: input.id,
                                    tap: !0,
                                    keyboard: options2,
                                    button: !0,
                                    inStrip: ref5.current?.contains(document.activeElement) === !0
                                  });
                                }
                              })
                            ]
                          })
                        })
                      ]
                    })
                  ]
                }, input.id)),
                pending !== void 0 ? callback3(void 0) : null,
                SlideRailJsx.jsx("div", {
                  className: column ? "flex min-h-1 w-full flex-1 flex-col px-1.5" : "flex min-w-1 flex-1",
                  onDragOver: (event) => {
                    event.preventDefault(), value4 !== null && ref8.current && value7(slides.length);
                  },
                  children: SlideRailJsx.jsx("div", {
                    "data-drop-gap": "",
                    className: (0, runtime2.joinClassNames)(column ? "h-1 rounded-sm" : "w-1 rounded-sm", value6 === slides.length && value4 !== null && "bg-app-accent")
                  })
                })
              ]
            }),
            marqueeEnabled ? SlideRailJsx.jsx("div", {
              ref: marquee.band,
              "data-strip-marquee": "",
              "aria-hidden": "true",
              style: {
                display: "none"
              },
              className: "pointer-events-none absolute z-30 bg-accent-muted outline-1 -outline-offset-1 outline-fill-accent"
            }) : null,
            value4 === null && value12 ? SlideRailJsx.jsx(RailPageButton, {
              dir: -1,
              onPage: callback10
            }) : null,
            value4 === null && value14 ? SlideRailJsx.jsx(RailPageButton, {
              dir: 1,
              onPage: callback10
            }) : null
          ]
        }),
        SlideRailJsx.jsx(runtime2.ContextMenuPopup, {
          at: value8 && value19 >= 0 ? value8 : null,
          anchor: value8?.tap ? "tap" : "point",
          "aria-label": value19 >= 0 && value8 ? menuIds.length > 1 ? "操作：" + String(menuIds.length) + " 页幻灯片" : "幻灯片 " + String(callback(value8.id, value19) + 1) + "操作" : void 0,
          focusFirstItem: value8?.keyboard === !0,
          onClose: callback15,
          children: value8 && value19 >= 0 ? SlideRailJsx.jsx(SlideContextMenu, {
            id: value8.id,
            index: value19,
            count: slides.length,
            skipped: slides[value19]?.skipped === !0,
            isCover: value8.id === coverId,
            readOnly,
            heldSlide,
            via: callback16,
            group: several !== void 0 && menuIds.length > 1 ? {
              ids: menuIds,
              allSkipped: menuIds.every((id) => slides.find((slide) => slide.id === id)?.skipped === !0),
              onDuplicate: several.onDuplicateSlides,
              onCopy: several.onCopySlides,
              onDelete: several.onDeleteSlides,
              onSetSkipped: several.onSetSlidesSkipped,
              moveReason: runtime2.MOVE_SEVERAL_SLIDES_REASON
            } : void 0,
            onDuplicate,
            onCopy,
            onDelete,
            onToggleSkip,
            onSetCover,
            onCopyLink,
            onAdd: callback13(value8) ? () => onAdd({
              returnFocus: () => ref4.current
            }) : () => onAdd(),
            onMove,
            column
          }) : null
        })
      ]
    });
  }
  function RailPageButton({ dir, onPage }) {
    let value = SlideRailJsx.jsx("span", {
      "aria-hidden": "true",
      className: (0, runtime2.joinClassNames)(RAIL_PAGE_GRADIENT_CLASS, dir === -1 ? "left-0 bg-gradient-to-r pointer-coarse:w-14" : "right-0 bg-gradient-to-l pointer-coarse:w-14")
    });
    return SlideRailJsx.jsxs(SlideRailJsx.Fragment, {
      children: [
        dir === 1 ? value : null,
        SlideRailJsx.jsx("button", {
          type: "button",
          tabIndex: -1,
          "aria-label": dir === -1 ? "向左滚动幻灯片" : "向右滚动幻灯片",
          onMouseDown: preventRailMouseDownDefault,
          onClick: () => onPage(dir),
          className: (0, runtime2.joinClassNames)(RAIL_PAGE_BUTTON_CLASS, dir === -1 ? "left-0" : "right-0"),
          children: SlideRailJsx.jsx("span", {
            className: RAIL_THUMB_BORDER_CLASS,
            children: SlideRailJsx.jsx(runtime2.KitIcon, {
              name: dir === -1 ? "CaretLeft" : "CaretRight",
              size: 14
            })
          })
        }),
        dir === -1 ? value : null
      ]
    });
  }
  function ThumbnailIndicator() {
    return SlideRailJsx.jsx("span", {
      title: (0, runtime2.formatMessage)({
        defaultMessage: "缩略图",
        id: "fcxk3auk8K"
      }),
      className: "inline-flex",
      children: SlideRailJsx.jsx(runtime2.KitIcon, {
        name: "Image",
        size: 10
      })
    });
  }
  function SlideCommentCountBadge({ count, className, style }) {
    let value = Number.isFinite(count) ? Math.floor(count) : 0;
    return value <= 0 ? null : SlideRailJsx.jsx("span", {
      "aria-hidden": "true",
      "data-mc-chrome": "",
      "data-kit": "comment-count",
      className: (0, runtime2.joinClassNames)(THUMBNAIL_BADGE_CLASS, "pointer-events-none rounded-full bg-fill-accent text-on-accent shadow-sm", className),
      style,
      children: value > 9 ? "9+" : value
    });
  }
  function formatOpenCommentCount(count) {
    return count > 0 ? ", " + String(count) + " 条未解决评论" : "";
  }
  function SkippedSlideBadge({ why, onUnskip, style }) {
    let value = why === void 0;
    return SlideRailJsx.jsx("span", {
      title: "",
      className: "absolute right-0 bottom-0 flex",
      style,
      children: SlideRailJsx.jsx(runtime2.TooltipWrapper, {
        tip: why ?? UNSKIP_SLIDE_LABEL,
        children: SlideRailJsx.jsx("button", {
          type: "button",
          tabIndex: -1,
          "aria-disabled": value ? void 0 : !0,
          "aria-label": UNSKIP_SLIDE_LABEL,
          onMouseDown: value ? preventRailMouseDownDefault : void 0,
          onPointerDown: value ? (input) => input.stopPropagation() : void 0,
          onClick: value ? (input) => {
            input.stopPropagation(), onUnskip();
          } : void 0,
          className: (0, runtime2.joinClassNames)("group/skip flex items-end justify-end p-1", THUMBNAIL_ACTION_BUTTON_CLASS, !value && "pointer-events-none"),
          children: SlideRailJsx.jsx("span", {
            className: (0, runtime2.joinClassNames)(THUMBNAIL_ICON_BADGE_CLASS, THUMBNAIL_BADGE_SURFACE_CLASS, "text-fg-muted", value && "group-hover/skip:bg-bg-warm group-hover/skip:text-fg"),
            children: SlideRailJsx.jsx(runtime2.KitIcon, {
              name: "EyeSlash",
              size: 12
            })
          })
        })
      })
    });
  }
  function ThumbnailActionsButton({ label, current, expanded, skipped, inv = 1, className, onOpen, onMouseDown }) {
    return SlideRailJsx.jsx("div", {
      "data-kit": "thumb-actions",
      className: (0, runtime2.joinClassNames)("absolute bottom-0 z-10", skipped && SKIPPED_THUMBNAIL_ACTION_OFFSET_CLASS, className),
      style: {
        right: "calc(var(--more-shift, 0px) * " + String(inv) + ")",
        transform: inv === 1 ? void 0 : "scale(" + String(inv) + ")",
        transformOrigin: "right bottom"
      },
      children: SlideRailJsx.jsx("button", {
        type: "button",
        tabIndex: current ? 0 : -1,
        "aria-haspopup": "menu",
        "aria-expanded": expanded,
        "aria-label": label,
        onPointerDown: (input) => input.stopPropagation(),
        onMouseDown,
        onDoubleClick: (input) => input.stopPropagation(),
        onKeyDown: (event) => {
          event.repeat && (event.key === "Enter" || event.key === " ") && event.preventDefault();
        },
        onClick: (input) => {
          input.stopPropagation(), onOpen((input.currentTarget.firstElementChild ?? input.currentTarget).getBoundingClientRect(), (0, runtime2.isKeyboardOrPrimaryActivation)(input), input.currentTarget);
        },
        className: (0, runtime2.joinClassNames)("group/more flex h-8 w-8 cursor-default items-end justify-end p-1 outline-hidden pointer-coarse:h-10 pointer-coarse:w-10", skipped && "pr-0"),
        children: SlideRailJsx.jsx("span", {
          className: (0, runtime2.joinClassNames)(THUMBNAIL_ICON_BADGE_CLASS, THUMBNAIL_BADGE_SURFACE_CLASS, "text-fg group-hover/more:bg-bg-warm group-aria-expanded/more:bg-bg-warm group-focus-visible/more:shadow-[0_0_0_2px_var(--t-app-accent)] group-focus-visible/more:ring-0"),
          children: SlideRailJsx.jsx(runtime2.KitIcon, {
            name: "DotsHorizontal",
            size: 12
          })
        })
      })
    });
  }
  function SlideRailToolbar({ readOnly, onAdd, notesOpen = !1, onToggleNotes, notesDisabledReason, gridOpen = !1, slideShortcut, canvasShortcut = gridOpen ? void 0 : "shift+cmd+0", onSetGridOpen, onCollapse, collapseDisabledReason, density = "compact", placement = "bottom", sidebar }) {
    let beside = placement !== "bottom", collapseButton = onCollapse && collapseDisabledReason !== void 0 ? SlideRailJsx.jsx(runtime2.Button, {
      iconOnly: !0,
      variant: "ghost",
      icon: beside ? "Sidebar" : "CaretDown",
      "aria-label": HIDE_SLIDE_THUMBNAILS_LABEL,
      disabled: !0,
      disabledReason: collapseDisabledReason,
      onClick: onCollapse
    }) : onCollapse ? SlideRailJsx.jsx(runtime2.Button, {
      iconOnly: !0,
      variant: "ghost",
      icon: beside ? "Sidebar" : "CaretDown",
      "aria-label": HIDE_SLIDE_THUMBNAILS_LABEL,
      "data-slides-rail-hide": "",
      onClick: onCollapse
    }) : null, showButton = sidebar !== void 0 ? SlideRailJsx.jsx(runtime2.Button, {
      iconOnly: !0,
      variant: "ghost",
      icon: "Sidebar",
      "aria-label": (0, runtime2.formatMessage)({
        defaultMessage: "显示幻灯片缩略图",
        id: "ypdKDA1W5l"
      }),
      "data-slides-rail-show": "",
      onClick: sidebar.onShow,
      onPointerEnter: sidebar.onPointerEnter,
      onPointerLeave: sidebar.onPointerLeave
    }) : null;
    return SlideRailJsx.jsx(runtime2.CdsRoot, {
      density,
      className: "contents",
      children: SlideRailJsx.jsxs("div", {
        "data-rail-actions": "",
        className: (0, runtime2.joinClassNames)("flex items-center", beside ? (0, runtime2.joinClassNames)("pointer-coarse:gap-1", placement === "left" && "pointer-coarse:flex-wrap") : "justify-between", placement === "left" ? "pt-4 pb-2 pl-4 pe-lg pointer-coarse:pt-[17px] pointer-coarse:pl-[17px] pointer-coarse:pe-0" : placement === "bottom" && "px-2 pt-1.5 pb-1"),
        children: [
          SlideRailJsx.jsxs("div", {
            className: (0, runtime2.joinClassNames)("flex items-center", beside ? "pointer-coarse:gap-1" : "gap-1"),
            children: [
              placement === "card" ? showButton : beside ? collapseButton : null,
              readOnly ? null : SlideRailJsx.jsx(runtime2.TooltipWrapper, {
                tip: ADD_SLIDE_LABEL,
                children: SlideRailJsx.jsx(runtime2.Button, {
                  iconOnly: !0,
                  variant: "ghost",
                  icon: "Add",
                  "aria-label": ADD_SLIDE_LABEL,
                  onClick: () => onAdd()
                })
              }),
              onToggleNotes && notesDisabledReason !== void 0 ? SlideRailJsx.jsx(runtime2.TooltipWrapper, {
                tip: notesDisabledReason,
                children: SlideRailJsx.jsx(runtime2.Button, {
                  iconOnly: !0,
                  variant: "ghost",
                  icon: "BookText",
                  "aria-label": "演讲者备注",
                  pressed: notesOpen,
                  disabled: !0,
                  onClick: onToggleNotes
                })
              }) : onToggleNotes ? SlideRailJsx.jsx(runtime2.Button, {
                iconOnly: !0,
                variant: "ghost",
                icon: "BookText",
                "aria-label": "演讲者备注",
                tooltip: notesOpen ? runtime2.HIDE_SPEAKER_NOTES_LABEL : runtime2.SHOW_SPEAKER_NOTES_LABEL,
                pressed: notesOpen,
                onClick: onToggleNotes
              }) : null
            ]
          }),
          SlideRailJsx.jsxs("div", {
            className: "flex items-center gap-1.5",
            children: [
              onSetGridOpen ? SlideRailJsx.jsx(SlidesViewSwitch, {
                gridOpen,
                slideShortcut,
                canvasShortcut,
                onSetGridOpen
              }) : null,
              beside ? null : collapseButton
            ]
          })
        ]
      })
    });
  }
  function SlidesViewSwitch({ gridOpen, slideShortcut, canvasShortcut, onSetGridOpen }) {
    return SlideRailJsx.jsx("div", {
      "data-slides-view-switch": "",
      className: "flex",
      onKeyDownCapture: (event) => {
        let value = event.target instanceof HTMLElement && event.target.getAttribute("role") === "radio" ? event.target : null;
        if (value === null)
          return;
        let value2 = SLIDE_VIEW_SWITCH_NAVIGATION_KEYS[event.key];
        if (event.altKey || event.ctrlKey || event.metaKey) {
          event.key.startsWith("Arrow") && event.stopPropagation();
          return;
        }
        if (value2 !== void 0) {
          event.preventDefault(), event.stopPropagation();
          let value3 = Array.from(event.currentTarget.querySelectorAll('[role="radio"]:not([data-disabled])')), value4 = value3.indexOf(value);
          if (value4 < 0)
            return;
          let value5 = value2 === "first" ? 0 : value2 === "last" ? value3.length - 1 : (value4 + (value2 === "prev" ? -1 : 1) + value3.length) % value3.length;
          value3[value5]?.focus();
        } else
          event.key === "Enter" && !event.shiftKey && (event.preventDefault(), event.stopPropagation(), event.repeat || value.click());
      },
      children: SlideRailJsx.jsx(runtime2.SegmentedControl, {
        "aria-label": "视图",
        segments: [
          {
            value: "slide",
            icon: "Stop",
            tooltip: (0, runtime2.formatMessage)({
              defaultMessage: "幻灯片",
              id: "8fQNwQ/60L"
            }),
            ...slideShortcut !== void 0 ? {
              shortcut: slideShortcut
            } : {}
          },
          {
            value: "grid",
            icon: "Grid",
            tooltip: (0, runtime2.formatMessage)({
              defaultMessage: "画布",
              id: "o+j4MlVDZH"
            }),
            ...canvasShortcut !== void 0 ? {
              shortcut: canvasShortcut
            } : {}
          }
        ],
        value: gridOpen ? "grid" : "slide",
        onChange: (input) => onSetGridOpen(input === "grid")
      })
    });
  }
  function SlideContextMenu({ id, index: index4, count, skipped, isCover, readOnly, heldSlide, via, group, onNewSection, newSectionDisabledReason, onDuplicate, onCopy, onDelete, onToggleSkip, onSetCover, onCopyLink, onAdd, onMove, column = !1 }) {
    let value = group !== void 0 && group.ids.length > 1 ? group.ids : void 0, value2 = value?.length ?? 1, value4 = value ? value.some((input) => heldSlide?.(input) !== void 0) : heldSlide?.(id) !== void 0, value5 = value ? (0, runtime2.formatMessage)({
      defaultMessage: "其中一页的已保存内容需要修复，暂时无法编辑",
      id: "g1zqqtIleP"
    }) : runtime2.HELD_SLIDE_MESSAGE, copyHeldReason = value ? (0, runtime2.formatMessage)({
      defaultMessage: "其中一页的已保存内容需要修复，暂时无法复制",
      id: "Z2z0W2ELL6"
    }) : (0, runtime2.formatMessage)({
      defaultMessage: "请先修复已保存的内容，再进行复制",
      id: "MOAnvu8ara"
    }), value6 = value ? group.moveReason : void 0;
    return SlideRailJsx.jsxs(SlideRailJsx.Fragment, {
      children: [
        SlideRailJsx.jsx(runtime2.Menu.Item, {
          shortcut: runtime2.EDIT_COMMAND_DEFINITIONS.duplicate.shortcut,
          ...disabledActionFromReason(readOnly ? READ_ONLY_PRESENTATION_MESSAGE : value4 ? copyHeldReason : void 0),
          onClick: via(() => value ? group.onDuplicate(value) : onDuplicate(id)),
          children: (0, runtime2.formatMessage)({
            defaultMessage: "{n, plural, =1 {创建此页副本} other {创建 # 页副本}}",
            id: "bscvBsL+Qw"
          }, {
            n: value2
          })
        }),
        SlideRailJsx.jsx(runtime2.Menu.Item, {
          shortcut: runtime2.EDIT_COMMAND_DEFINITIONS.copy.shortcut,
          ...disabledActionFromReason(value4 ? copyHeldReason : void 0),
          onClick: via(() => value ? group.onCopy(value) : onCopy(id)),
          children: (0, runtime2.formatMessage)({
            defaultMessage: "{n, plural, =1 {复制幻灯片} other {复制 # 页幻灯片}}",
            id: "2Veb0MqBrk"
          }, {
            n: value2
          })
        }),
        onCopyLink ? SlideRailJsx.jsx(runtime2.Menu.Item, {
          shortcut: value ? void 0 : runtime2.COPY_SLIDE_LINK_SHORTCUT,
          ...disabledActionFromReason(value ? SELECT_ONE_SLIDE_TO_COPY_LINK_MESSAGE : void 0),
          onClick: via(() => onCopyLink(id)),
          children: runtime2.COPY_SLIDE_LINK_LABEL
        }) : null,
        SlideRailJsx.jsx(runtime2.Menu.Item, {
          ...disabledActionFromReason(readOnly ? READ_ONLY_PRESENTATION_MESSAGE : value4 ? value5 : void 0),
          onClick: via(() => value ? group.onSetSkipped(value, !group.allSkipped) : onToggleSkip(id)),
          children: (value ? group.allSkipped : skipped) ? (0, runtime2.formatMessage)({
            defaultMessage: "{n, plural, =1 {取消跳过此页} other {取消跳过 # 页}}",
            id: "tZvg6X+wsk"
          }, {
            n: value2
          }) : (0, runtime2.formatMessage)({
            defaultMessage: "{n, plural, =1 {跳过此页} other {跳过 # 页}}",
            id: "SEyCeMJ6WP"
          }, {
            n: value2
          })
        }),
        onSetCover ? SlideRailJsx.jsx(runtime2.Menu.Item, {
          ...disabledActionFromReason(readOnly ? READ_ONLY_PRESENTATION_MESSAGE : isCover ? SLIDE_ALREADY_AT_DESTINATION_MESSAGE : void 0),
          onClick: via(() => onSetCover(id)),
          children: (0, runtime2.formatMessage)({
            defaultMessage: "设为封面缩略图",
            id: "CQJcEperBZ"
          })
        }) : null,
        onNewSection ? SlideRailJsx.jsx(runtime2.Menu.Item, {
          ...disabledActionFromReason(readOnly ? READ_ONLY_PRESENTATION_MESSAGE : newSectionDisabledReason),
          onClick: via(onNewSection),
          children: (0, runtime2.formatMessage)({
            defaultMessage: "{n, plural, =1 {移至新章节} other {将 # 页移至新章节}}",
            id: "B3ydqITUEY"
          }, {
            n: value2
          })
        }) : null,
        SlideRailJsx.jsx(runtime2.Menu.Separator, {}),
        SlideRailJsx.jsx(runtime2.Menu.Item, {
          ...disabledActionFromReason(readOnly ? READ_ONLY_PRESENTATION_MESSAGE : void 0),
          onClick: via(onAdd),
          children: (0, runtime2.formatMessage)({
            defaultMessage: "在后面添加幻灯片",
            id: "PM5gvanyTL"
          })
        }),
        SlideRailJsx.jsx(runtime2.Menu.Item, {
          ...disabledActionFromReason(readOnly ? READ_ONLY_PRESENTATION_MESSAGE : value6 ?? (index4 === 0 ? (0, runtime2.formatMessage)({
            defaultMessage: "已经是第一页",
            id: "U4hHhcy4Ph"
          }) : void 0)),
          onClick: via(() => onMove(id, index4 - 1)),
          children: column ? "上移" : "左移"
        }),
        SlideRailJsx.jsx(runtime2.Menu.Item, {
          ...disabledActionFromReason(readOnly ? READ_ONLY_PRESENTATION_MESSAGE : value6 ?? (index4 >= count - 1 ? (0, runtime2.formatMessage)({
            defaultMessage: "已经是最后一页",
            id: "kdTtnSEm95"
          }) : void 0)),
          onClick: via(() => onMove(id, index4 + 1)),
          children: column ? "下移" : "右移"
        }),
        SlideRailJsx.jsx(runtime2.Menu.Separator, {}),
        SlideRailJsx.jsx(runtime2.Menu.Item, {
          variant: "danger",
          shortcut: runtime2.EDIT_COMMAND_DEFINITIONS.delete.shortcut,
          ...disabledActionFromReason(readOnly ? READ_ONLY_PRESENTATION_MESSAGE : count - value2 < 1 ? (0, runtime2.formatMessage)({
            defaultMessage: "演示文稿至少需要一页",
            id: "vtUQy6ifmj"
          }) : value4 ? value5 : void 0),
          onClick: via(() => value ? group.onDelete(value) : onDelete(id)),
          children: (0, runtime2.formatMessage)({
            defaultMessage: "{n, plural, =1 {删除此页} other {删除 # 页}}",
            id: "M0qjT7Xfsj"
          }, {
            n: value2
          })
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "SlideRailJsx", () => SlideRailJsx, (value) => {
    SlideRailJsx = value;
  }), bindRuntimeValue(runtime2, "SlideCreationRailPlaceholder", () => SlideCreationRailPlaceholder), bindRuntimeValue(runtime2, "SlideCreationRailCell", () => SlideCreationRailCell), bindRuntimeValue(runtime2, "INHERIT_RAIL_THUMB_WIDTH_CLASS", () => INHERIT_RAIL_THUMB_WIDTH_CLASS, (value) => {
    INHERIT_RAIL_THUMB_WIDTH_CLASS = value;
  }), bindRuntimeValue(runtime2, "RAIL_THUMB_DIMENSIONS_STYLE", () => RAIL_THUMB_DIMENSIONS_STYLE, (value) => {
    RAIL_THUMB_DIMENSIONS_STYLE = value;
  }), bindRuntimeValue(runtime2, "READ_ONLY_PRESENTATION_MESSAGE", () => READ_ONLY_PRESENTATION_MESSAGE, (value) => {
    READ_ONLY_PRESENTATION_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "SLIDE_ALREADY_AT_DESTINATION_MESSAGE", () => SLIDE_ALREADY_AT_DESTINATION_MESSAGE, (value) => {
    SLIDE_ALREADY_AT_DESTINATION_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "SELECT_ONE_SLIDE_TO_COPY_LINK_MESSAGE", () => SELECT_ONE_SLIDE_TO_COPY_LINK_MESSAGE, (value) => {
    SELECT_ONE_SLIDE_TO_COPY_LINK_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "UNSKIP_SLIDE_LABEL", () => UNSKIP_SLIDE_LABEL, (value) => {
    UNSKIP_SLIDE_LABEL = value;
  }), bindRuntimeValue(runtime2, "HIDE_SLIDE_THUMBNAILS_LABEL", () => HIDE_SLIDE_THUMBNAILS_LABEL, (value) => {
    HIDE_SLIDE_THUMBNAILS_LABEL = value;
  }), bindRuntimeValue(runtime2, "ADD_SLIDE_LABEL", () => ADD_SLIDE_LABEL, (value) => {
    ADD_SLIDE_LABEL = value;
  }), bindRuntimeValue(runtime2, "RAIL_COLUMN_WIDTH_CLASS", () => RAIL_COLUMN_WIDTH_CLASS, (value) => {
    RAIL_COLUMN_WIDTH_CLASS = value;
  }), bindRuntimeValue(runtime2, "RAIL_COLUMN_THUMB_WIDTH", () => RAIL_COLUMN_THUMB_WIDTH, (value) => {
    RAIL_COLUMN_THUMB_WIDTH = value;
  }), bindRuntimeValue(runtime2, "adjustMoveIndexAfterRemoval", () => adjustMoveIndexAfterRemoval), bindRuntimeValue(runtime2, "getRailScrollButtonPadding", () => getRailScrollButtonPadding, (value) => {
    getRailScrollButtonPadding = value;
  }), bindRuntimeValue(runtime2, "calculateRailPageScroll", () => calculateRailPageScroll), bindRuntimeValue(runtime2, "preventRailMouseDownDefault", () => preventRailMouseDownDefault, (value) => {
    preventRailMouseDownDefault = value;
  }), bindRuntimeValue(runtime2, "getRailScrollBehavior", () => getRailScrollBehavior, (value) => {
    getRailScrollBehavior = value;
  }), bindRuntimeValue(runtime2, "scrollRailThumbnailIntoView", () => scrollRailThumbnailIntoView), bindRuntimeValue(runtime2, "RAIL_HOVER_ACTIONS_CLASS", () => RAIL_HOVER_ACTIONS_CLASS, (value) => {
    RAIL_HOVER_ACTIONS_CLASS = value;
  }), bindRuntimeValue(runtime2, "RAIL_PAGE_BUTTON_CLASS", () => RAIL_PAGE_BUTTON_CLASS, (value) => {
    RAIL_PAGE_BUTTON_CLASS = value;
  }), bindRuntimeValue(runtime2, "RAIL_THUMB_BORDER_CLASS", () => RAIL_THUMB_BORDER_CLASS, (value) => {
    RAIL_THUMB_BORDER_CLASS = value;
  }), bindRuntimeValue(runtime2, "RAIL_PAGE_GRADIENT_CLASS", () => RAIL_PAGE_GRADIENT_CLASS, (value) => {
    RAIL_PAGE_GRADIENT_CLASS = value;
  }), bindRuntimeValue(runtime2, "RAIL_SELECTION_RING_CLASS", () => RAIL_SELECTION_RING_CLASS, (value) => {
    RAIL_SELECTION_RING_CLASS = value;
  }), bindRuntimeValue(runtime2, "formatSlideThumbnailLabel", () => formatSlideThumbnailLabel), bindRuntimeValue(runtime2, "SlideThumbnailRail", () => SlideThumbnailRail), bindRuntimeValue(runtime2, "RailPageButton", () => RailPageButton), bindRuntimeValue(runtime2, "ThumbnailIndicator", () => ThumbnailIndicator), bindRuntimeValue(runtime2, "THUMBNAIL_BADGE_CLASS", () => THUMBNAIL_BADGE_CLASS, (value) => {
    THUMBNAIL_BADGE_CLASS = value;
  }), bindRuntimeValue(runtime2, "THUMBNAIL_BADGE_SURFACE_CLASS", () => THUMBNAIL_BADGE_SURFACE_CLASS, (value) => {
    THUMBNAIL_BADGE_SURFACE_CLASS = value;
  }), bindRuntimeValue(runtime2, "THUMBNAIL_ICON_BADGE_CLASS", () => THUMBNAIL_ICON_BADGE_CLASS, (value) => {
    THUMBNAIL_ICON_BADGE_CLASS = value;
  }), bindRuntimeValue(runtime2, "SlideCommentCountBadge", () => SlideCommentCountBadge), bindRuntimeValue(runtime2, "formatOpenCommentCount", () => formatOpenCommentCount), bindRuntimeValue(runtime2, "THUMBNAIL_ACTION_BUTTON_CLASS", () => THUMBNAIL_ACTION_BUTTON_CLASS, (value) => {
    THUMBNAIL_ACTION_BUTTON_CLASS = value;
  }), bindRuntimeValue(runtime2, "SKIPPED_THUMBNAIL_ACTION_OFFSET_CLASS", () => SKIPPED_THUMBNAIL_ACTION_OFFSET_CLASS, (value) => {
    SKIPPED_THUMBNAIL_ACTION_OFFSET_CLASS = value;
  }), bindRuntimeValue(runtime2, "SkippedSlideBadge", () => SkippedSlideBadge), bindRuntimeValue(runtime2, "ThumbnailActionsButton", () => ThumbnailActionsButton), bindRuntimeValue(runtime2, "SlideRailToolbar", () => SlideRailToolbar), bindRuntimeValue(runtime2, "SLIDE_VIEW_SWITCH_NAVIGATION_KEYS", () => SLIDE_VIEW_SWITCH_NAVIGATION_KEYS, (value) => {
    SLIDE_VIEW_SWITCH_NAVIGATION_KEYS = value;
  }), bindRuntimeValue(runtime2, "SlidesViewSwitch", () => SlidesViewSwitch), bindRuntimeValue(runtime2, "disabledActionFromReason", () => disabledActionFromReason, (value) => {
    disabledActionFromReason = value;
  }), bindRuntimeValue(runtime2, "SlideContextMenu", () => SlideContextMenu), () => {
    SlideRailJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), INHERIT_RAIL_THUMB_WIDTH_CLASS = "[--sl-thumb-w:inherit]", RAIL_THUMB_DIMENSIONS_STYLE = {
      width: "calc(var(" + runtime2.RAIL_THUMB_WIDTH_CSS_VARIABLE + ") * 1px)",
      height: "calc(var(" + runtime2.RAIL_THUMB_WIDTH_CSS_VARIABLE + ") * " + String(runtime2.SLIDE_HEIGHT / runtime2.SLIDE_WIDTH) + "px)"
    }, READ_ONLY_PRESENTATION_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "只读，无法在此编辑演示文稿",
      id: "wRvg+06Epx"
    }), SLIDE_ALREADY_AT_DESTINATION_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此页已经是封面缩略图",
      id: "ueqJFNwE4g"
    }), SELECT_ONE_SLIDE_TO_COPY_LINK_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "请只选择一页以复制链接",
      id: "Wvd8nxASOO"
    }), getRailScrollButtonPadding = () => window.matchMedia("(pointer: coarse)").matches ? 56 : 40, preventRailMouseDownDefault = (event) => event.preventDefault(), getRailScrollBehavior = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", RAIL_HOVER_ACTIONS_CLASS = "opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-has-[:focus-visible]/rail:opacity-100 pointer-coarse:opacity-100", RAIL_PAGE_BUTTON_CLASS = (0, runtime2.joinClassNames)("group absolute inset-y-0 z-20 flex w-7 cursor-default items-center justify-center pointer-coarse:w-10", "pointer-events-none group-hover/rail:pointer-events-auto group-has-[:focus-visible]/rail:pointer-events-auto pointer-coarse:pointer-events-auto", RAIL_HOVER_ACTIONS_CLASS), RAIL_THUMB_BORDER_CLASS = "inline-flex h-8 w-5 items-center justify-center rounded-md bg-panel/90 text-fg-muted shadow-sm ring-1 ring-border-line group-hover:bg-panel group-hover:text-fg", RAIL_PAGE_GRADIENT_CLASS = (0, runtime2.joinClassNames)("pointer-events-none absolute inset-y-0 z-10 w-10 from-panel/45 to-transparent", RAIL_HOVER_ACTIONS_CLASS), RAIL_SELECTION_RING_CLASS = (0, runtime2.formatMessage)({
      defaultMessage: "已跳过，不参与放映、导出和打印",
      id: "sf5vja1Cho"
    }), UNSKIP_SLIDE_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "取消跳过此页",
      id: "vJwMzpwLcj"
    }), HIDE_SLIDE_THUMBNAILS_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "隐藏幻灯片缩略图",
      id: "mVZsYVZwNi"
    }), ADD_SLIDE_LABEL = (0, runtime2.formatMessage)({
      defaultMessage: "添加幻灯片",
      id: "V8HonhGReX"
    }), THUMBNAIL_BADGE_CLASS = "flex min-w-4 items-center justify-center gap-0.5 px-1 text-[9px] leading-4", THUMBNAIL_BADGE_SURFACE_CLASS = "rounded-sm bg-panel/90 shadow-sm ring-1 ring-border-line", THUMBNAIL_ICON_BADGE_CLASS = "flex h-4 w-4 items-center justify-center", THUMBNAIL_ACTION_BUTTON_CLASS = "h-7 w-6 pointer-coarse:h-10 pointer-coarse:w-10", SKIPPED_THUMBNAIL_ACTION_OFFSET_CLASS = "[--more-shift:1.5rem] pointer-coarse:[--more-shift:2.5rem]", SLIDE_VIEW_SWITCH_NAVIGATION_KEYS = {
      ArrowLeft: "prev",
      ArrowUp: "prev",
      ArrowRight: "next",
      ArrowDown: "next",
      Home: "first",
      End: "last"
    }, disabledActionFromReason = (input) => ({
      disabled: input !== void 0,
      disabledReason: input ?? null
    }), RAIL_COLUMN_WIDTH_CLASS = "w-48", RAIL_COLUMN_THUMB_WIDTH = 148;
  };
}
export {
  installEditorSlideRail
};
