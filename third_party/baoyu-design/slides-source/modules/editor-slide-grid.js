// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorSlideGrid(runtime2) {
  var GRID_SLIDE_WIDTH, GRID_SLIDE_HEIGHT, GRID_COLUMN_GAP, GRID_ROW_GAP, GRID_MAX_COLUMNS, GRID_NOTES_HEIGHT, SlideGridJsx, SECTION_LIMIT_MESSAGE, GRID_LABEL_HEIGHT, GRID_TILE_CORNER_RADIUS, GRID_LABEL_FONT_SIZE, GRID_TOUCH_LABEL_FONT_SIZE, GRID_SELECTION_OUTSET, GRID_CHROME_GAP, GRID_TOUCH_CHROME_SIZE, EMPTY_GRID_SELECTION_SET, copiedGridSlideKey, GRID_DRAG_THRESHOLD_PX, GRID_WHEEL_PAN_FACTOR, GRID_ZOOM_ANIMATION_MS, MIN_FOCUSED_GRID_SLIDE_WIDTH, FOCUSED_GRID_SLIDE_SIDE_PADDING, GRID_RECT_SELECTION_THRESHOLD_PX, GRID_PREVIEW_SLIDE_ID, GRID_INTERACTIVE_TARGET_SELECTOR, GridSlideThumbnail;
  function calculateGridAddButtonSize(scale) {
    let gap = GRID_COLUMN_GAP * scale, size4 = Math.max(12, Math.min(32, gap / 2));
    return {
      size: size4,
      fits: gap >= size4 + 4,
      fitsTouch: gap >= 24
    };
  }
  function buildSlideGridLayout(sections, showNotes = !1) {
    let sectioned = sections.some((input) => input.section !== null), notesHeight = showNotes ? GRID_NOTES_HEIGHT : 0, index4 = 0, items = [], items2 = [], index22 = 0, index32 = 0, count = 1;
    return sections.forEach((input, options) => {
      let items3 = [];
      if (sectioned || input.ids.length === 0)
        items3.push(input.ids);
      else
        for (let index42 = 0; index42 < input.ids.length; index42 += GRID_MAX_COLUMNS)
          items3.push(input.ids.slice(index42, index42 + GRID_MAX_COLUMNS));
      let value = input.section?.id ?? "~head";
      items3.forEach((items4, options2) => {
        let length = items2.length;
        items2.push({
          key: value + ":" + String(options2),
          section: options2 === 0 ? input.section : null,
          seg: options,
          y: index32,
          ids: items4,
          continuation: options2 > 0
        }), items4.forEach((input2, options3) => {
          index22 += 1, items.push({
            id: input2,
            x: 0 + options3 * (GRID_SLIDE_WIDTH + GRID_COLUMN_GAP),
            y: index32,
            row: length,
            col: options3,
            n: index22,
            seg: options
          });
        }), count = Math.max(count, items4.length), index32 += GRID_SLIDE_HEIGHT + notesHeight + GRID_ROW_GAP;
      });
    }), {
      tiles: items,
      rows: items2,
      width: 0 + count * (GRID_SLIDE_WIDTH + GRID_COLUMN_GAP) - GRID_COLUMN_GAP,
      height: Math.max(GRID_SLIDE_HEIGHT + notesHeight, index32 - GRID_ROW_GAP),
      left: 0,
      sectioned,
      notes: notesHeight
    };
  }
  function hitTestSlideGridDrop(layout, x, y, excludedIds) {
    if (layout.rows.length === 0)
      return null;
    let value = findSlideGridRow(layout, y), value2 = layout.rows[value], value3 = GRID_SLIDE_HEIGHT + layout.notes, value4 = y - value2.y, sectioned = layout.sectioned, value5 = value4 < -GRID_ROW_GAP * 0.2 && (value === 0 || sectioned && value4 > -GRID_ROW_GAP * 0.8), value6 = value === layout.rows.length - 1 ? value4 > value3 + GRID_ROW_GAP * 0.2 : sectioned && value4 > value3 + GRID_ROW_GAP * 0.2 && value4 < value3 + GRID_ROW_GAP * 0.8;
    if (value5 || value6) {
      let value8 = value5 ? value : value + 1, value9 = value8 < layout.rows.length ? layout.rows[value8].seg : layout.rows[layout.rows.length - 1].seg + 1;
      return {
        kind: "gap",
        row: value8,
        before: null,
        gapIndex: value9
      };
    }
    let value7 = Math.round((x - layout.left + GRID_COLUMN_GAP / 2) / (GRID_SLIDE_WIDTH + GRID_COLUMN_GAP));
    return value7 = Math.max(0, Math.min(value2.ids.length, value7)), {
      kind: "tile",
      row: value,
      before: value2.ids.slice(value7).find((input) => !excludedIds.has(input)) ?? null,
      gapIndex: value2.seg
    };
  }
  function findSlideGridRow(layout, y) {
    let index4 = layout.rows.findIndex((input) => y < input.y + GRID_SLIDE_HEIGHT + layout.notes + GRID_ROW_GAP / 2);
    return index4 < 0 ? layout.rows.length - 1 : index4;
  }
  function hitTestSlideGridSectionDrop(layout, y, excludedSections) {
    let rowPositions = [
      ...layout.rows.map((input) => input.y),
      layout.height + GRID_ROW_GAP
    ], index4 = 0;
    for (rowPositions.forEach((input, options) => {
      Math.abs(y - input) < Math.abs(y - rowPositions[index4]) && (index4 = options);
    }); index4 > 0 && index4 < layout.rows.length && layout.rows[index4].continuation; )
      index4 -= 1;
    return {
      gapIndex: index4 < layout.rows.length ? layout.rows[index4].seg : excludedSections
    };
  }
  function resolveSlideGridMoveTarget(layout, sections, hit, excludedIds) {
    let row = layout.rows[hit.row];
    if (!row)
      return null;
    let section = sections[row.seg];
    if (!section)
      return null;
    let before = hit.before;
    for (let value3 = hit.row + 1; before === null && layout.rows[value3]?.continuation === !0; value3++)
      before = layout.rows[value3].ids.find((input) => !excludedIds.has(input)) ?? null;
    let value = section.ids.filter((input) => !excludedIds.has(input)), value2 = before === null ? -1 : value.indexOf(before);
    return {
      sectionId: section.section?.id ?? null,
      index: value2 < 0 ? value.length : value2
    };
  }
  function scrollOffsetToExposeRange(offset4, viewportSize, start, end) {
    return end - start <= viewportSize ? start < offset4 ? start : end > offset4 + viewportSize ? end - viewportSize : offset4 : end > offset4 && start < offset4 + viewportSize ? offset4 : start >= offset4 + viewportSize ? start : end - viewportSize;
  }
  function panGridViewToSlide(view, slide, viewportWidth, viewportHeight, topInset = 0, bottomInset = 0) {
    let value = 24 / view.scale, value2 = GRID_LABEL_HEIGHT / view.scale, value3 = topInset / view.scale, value4 = view.y + value3, value5 = (viewportHeight - topInset) / view.scale, value6 = scrollOffsetToExposeRange(view.x, viewportWidth / view.scale, slide.x - value, slide.x + GRID_SLIDE_WIDTH + value), value7 = slide.y - value2 - value, value8 = slide.y + GRID_SLIDE_HEIGHT + value, value9 = value8 - value7 > value5 ? scrollOffsetToExposeRange(value4, value5, value7, value8) : value7 < value4 ? value7 : Math.min(Math.max(value4, value8 + bottomInset - value5), value7), value10 = value9 === value4 ? view.y : value9 - value3;
    return value6 === view.x && value10 === view.y ? view : {
      ...view,
      x: value6,
      y: value10
    };
  }
  function panGridViewToPoint(view, point, viewportWidth, viewportHeight, topInset = 0, padding = 48) {
    let value = padding / view.scale, value2 = topInset / view.scale, value3 = scrollOffsetToExposeRange(view.x, viewportWidth / view.scale, point.x - value, point.x + value), value4 = scrollOffsetToExposeRange(view.y + value2, (viewportHeight - topInset) / view.scale, point.y - value, point.y + value), value5 = value4 === view.y + value2 ? view.y : value4 - value2;
    return value3 === view.x && value5 === view.y ? view : {
      ...view,
      x: value3,
      y: value5
    };
  }
  function zoomGridViewToSlidePoint(view, slide, point, viewportWidth, viewportHeight, topInset, bottomInset, scaleLimits) {
    let value = Math.min(MIN_FOCUSED_GRID_SLIDE_WIDTH, viewportWidth - 2 * FOCUSED_GRID_SLIDE_SIDE_PADDING - 1), value2 = view.scale * GRID_SLIDE_WIDTH < value ? (0, runtime2.zoomViewportAt)(view, (point.x - view.x) * view.scale, (point.y - view.y) * view.scale, value / (view.scale * GRID_SLIDE_WIDTH), scaleLimits) : view;
    return panGridViewToPoint(panGridViewToSlide(value2, slide, viewportWidth, viewportHeight, topInset, bottomInset), point, viewportWidth, viewportHeight, topInset);
  }
  function gridTileScreenRect(tile, view, containerRect) {
    return {
      left: containerRect.left + (tile.x - view.x) * view.scale,
      top: containerRect.top + (tile.y - view.y) * view.scale,
      width: GRID_SLIDE_WIDTH * view.scale,
      height: GRID_SLIDE_HEIGHT * view.scale
    };
  }
  function interpolateGridViewport(from, to2, point, progress) {
    if (progress >= 1)
      return to2;
    let value = from.scale * (to2.scale / from.scale) ** progress, value2 = (point.x - from.x) * from.scale * (1 - progress) + (point.x - to2.x) * to2.scale * progress, value3 = (point.y - from.y) * from.scale * (1 - progress) + (point.y - to2.y) * to2.scale * progress;
    return {
      scale: value,
      x: point.x - value2 / value,
      y: point.y - value3 / value
    };
  }
  function gridOriginScreenRect(view, containerRect) {
    return {
      left: containerRect.left - view.x * view.scale,
      top: containerRect.top - view.y * view.scale,
      width: GRID_SLIDE_WIDTH * view.scale,
      height: GRID_SLIDE_HEIGHT * view.scale
    };
  }
  function gridViewportFromTileRect(tile, screenRect, containerRect) {
    if (!(screenRect.width > 0))
      return null;
    let scale = screenRect.width / GRID_SLIDE_WIDTH;
    return {
      scale,
      x: tile.x - (screenRect.left - containerRect.left) / scale,
      y: tile.y - (screenRect.top - containerRect.top) / scale
    };
  }
  function canStartGridRectSelection(pointer2) {
    return pointer2.bare && pointer2.pointerType === "mouse" && pointer2.button === 0;
  }
  function collectGridTilesInRect(tiles, rect) {
    return tiles.filter((input) => rect.x <= input.x + GRID_SLIDE_WIDTH && input.x <= rect.x + rect.w && rect.y <= input.y + GRID_SLIDE_HEIGHT && input.y <= rect.y + rect.h).map((input) => input.id);
  }
  function hitTestGridTile(tiles, point) {
    let tile = tiles.find((input) => point.x >= input.x && point.x <= input.x + GRID_SLIDE_WIDTH && point.y >= input.y && point.y <= input.y + GRID_SLIDE_HEIGHT);
    return tile ? {
      id: tile.id,
      fx: (point.x - tile.x) / GRID_SLIDE_WIDTH,
      fy: (point.y - tile.y) / GRID_SLIDE_HEIGHT
    } : null;
  }
  function extendGridSelection(selection, ids, extend) {
    return extend ? ids.every((input) => selection.slides.includes(input)) ? selection : {
      slides: [
        ...selection.slides,
        ...ids.filter((input) => !selection.slides.includes(input))
      ],
      sections: selection.sections
    } : {
      slides: [...ids],
      sections: []
    };
  }
  function SlideGrid(input) {
    let { order, sections, slides, assets, currentId, readOnly, onSelect, onOpen, onClose, zoomApiRef, onScaleChange, heldSlide, behind, coverId, notesShown, commentCounts } = input, value = input.topInset ?? 0, value2 = input.inert === !0, ref = runtime2.ReactGridMemo.useRef(input);
    ref.current = input;
    let memo4 = runtime2.ReactGridMemo.useMemo(() => (0, runtime2.sectionGroups)((0, runtime2.reconcileSectionsWithSlideOrder)(sections, order), order), [sections, order]), ref2 = runtime2.ReactGridMemo.useRef(memo4);
    ref2.current = memo4;
    let [value3, value4] = runtime2.ReactGridMemo.useState(null), value5 = notesShown === !0 && order.some((input2) => (slides[input2]?.notes ?? "").trim() !== ""), memo22 = runtime2.ReactGridMemo.useMemo(() => buildSlideGridLayout(memo4, value5), [memo4, value5]), ref3 = runtime2.ReactGridMemo.useRef(memo22);
    ref3.current = memo22;
    let memo32 = runtime2.ReactGridMemo.useMemo(() => new Map(memo22.tiles.map((input2) => [input2.id, input2])), [memo22]), ref4 = runtime2.ReactGridMemo.useRef(null), [value6, value7] = runtime2.ReactGridMemo.useState(() => ({
      slides: currentId !== null ? [currentId] : [],
      sections: []
    })), ref5 = runtime2.ReactGridMemo.useRef(value6);
    ref5.current = value6;
    let ref6 = runtime2.ReactGridMemo.useRef(currentId), ref7 = runtime2.ReactGridMemo.useRef(currentId), ref8 = runtime2.ReactGridMemo.useRef(null), callback = runtime2.ReactGridMemo.useCallback((input2) => {
      ref6.current = ref7.current = input2, value7({
        slides: [input2],
        sections: []
      }), input2 !== ref.current.currentId && ref.current.onSelect(input2);
    }, []), ref9 = runtime2.ReactGridMemo.useRef(currentId);
    runtime2.ReactGridMemo.useEffect(() => {
      if (currentId !== ref9.current && (ref9.current = currentId, ref6.current = ref7.current = currentId, currentId !== null && !ref5.current.slides.includes(currentId))) {
        value7({
          slides: [currentId],
          sections: []
        });
        return;
      }
      let values = new Set(memo4.flatMap((input2) => input2.section ? [input2.section.id] : [])), current2 = ref5.current, value47 = current2.slides.filter((input2) => memo32.has(input2)), value48 = current2.sections.filter((input2) => values.has(input2));
      ref6.current !== null && !memo32.has(ref6.current) && (ref6.current = ref7.current = currentId), ref7.current !== null && !memo32.has(ref7.current) && (ref7.current = ref6.current), ref8.current !== null && !values.has(ref8.current) && (ref8.current = null), !(value47.length === current2.slides.length && value48.length === current2.sections.length) && (value47.length === 0 && value48.length === 0 && currentId !== null ? callback(currentId) : value7({
        slides: value47,
        sections: value48
      }));
    }, [currentId, memo32, memo4, callback]);
    let tileOrder = () => ref3.current.tiles.map((input3) => input3.id), callback2 = (input2, options) => (0, runtime2.slideSelectionRange)(tileOrder(), input2, options), callback3 = (input2, options) => {
      let current2 = ref5.current, click = (0, runtime2.resolveSlideSelectionClick)({
        selected: current2.slides,
        anchor: ref6.current,
        focus: ref7.current
      }, tileOrder(), input2, options, currentId);
      if (click.kind === "only")
        return callback(input2);
      ref6.current = click.state.anchor, ref7.current = click.state.focus, value7({
        slides: [...click.state.selected],
        sections: click.kind === "range" ? [] : current2.sections
      }), click.primary !== void 0 && onSelect(click.primary);
    }, callback4 = (input2, options) => {
      let current2 = ref5.current, value47 = memo4.flatMap((input3) => input3.section ? [input3.section.id] : []);
      if (options.shiftKey && ref8.current !== null && value47.includes(ref8.current)) {
        let value48 = value47.indexOf(ref8.current), value49 = value47.indexOf(input2), value50 = value47.slice(Math.min(value48, value49), Math.max(value48, value49) + 1);
        value7({
          slides: [],
          sections: value48 <= value49 ? value50 : value50.reverse()
        });
      } else
        options.metaKey || options.ctrlKey || options.altKey ? (ref8.current = input2, value7({
          ...current2,
          sections: current2.sections.includes(input2) ? current2.sections.filter((input3) => input3 !== input2) : [...current2.sections, input2]
        })) : (ref8.current = input2, value7({
          slides: [],
          sections: [input2]
        }));
    }, ref10 = runtime2.ReactGridMemo.useRef(null), ref11 = runtime2.ReactGridMemo.useRef(Date.now()), callback5 = () => Date.now() - ref11.current < 500 || ref17.current !== null, ref12 = runtime2.ReactGridMemo.useRef(!1), callback6 = () => ref12.current, [value8, value9] = runtime2.ReactGridMemo.useState({
      w: 0,
      h: 0
    }), ref13 = runtime2.ReactGridMemo.useRef(value8);
    ref13.current = value8, runtime2.ReactGridMemo.useLayoutEffect(() => {
      let current2 = ref10.current;
      if (!current2)
        return;
      let callback43 = () => value9({
        w: current2.clientWidth,
        h: current2.clientHeight
      });
      callback43();
      let observer = new ResizeObserver(callback43);
      return observer.observe(current2), () => observer.disconnect();
    }, []);
    let [value10, value11] = runtime2.ReactGridMemo.useState({
      x: 0,
      y: 0,
      scale: 0.1
    }), ref14 = runtime2.ReactGridMemo.useRef(value10), ref15 = runtime2.ReactGridMemo.useRef({
      minScale: 0.02,
      maxScale: GRID_DRAG_THRESHOLD_PX
    }), callback7 = runtime2.ReactGridMemo.useCallback((input2) => {
      ref14.current = input2, value11(input2);
    }, []), ref16 = runtime2.ReactGridMemo.useRef(!0), ref17 = runtime2.ReactGridMemo.useRef(null), [, value12] = runtime2.ReactGridMemo.useState(0), callback8 = runtime2.ReactGridMemo.useCallback((input2) => {
      let current2 = ref17.current;
      current2 && (ref17.current = null, cancelAnimationFrame(current2.raf), value12((input3) => input3 + 1), current2.onEnd?.(input2));
    }, []);
    runtime2.ReactGridMemo.useEffect(() => () => callback8(!1), [callback8]);
    let callback9 = runtime2.ReactGridMemo.useCallback((input2) => {
      input2 !== ref14.current && (callback8(!1), ref16.current = !1, callback7(input2));
    }, [callback8, callback7]), callback10 = runtime2.ReactGridMemo.useCallback((input2, options, context, value47) => {
      callback8(!1);
      let current2 = ref14.current;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        callback7(input2), context?.(!0);
        return;
      }
      let value48 = -1, state2 = {
        raf: 0,
        onEnd: context,
        tile: value47
      }, callback43 = (input3) => {
        value48 < 0 && (value48 = input3);
        let value49 = Math.min(1, (input3 - value48) / GRID_ZOOM_ANIMATION_MS);
        callback7(interpolateGridViewport(current2, input2, options, 1 - (1 - value49) ** 3)), value49 < 1 ? state2.raf = requestAnimationFrame(callback43) : state2.raf = requestAnimationFrame(() => {
          ref17.current = null, value12((input4) => input4 + 1), context?.(!0);
        });
      };
      ref17.current = state2, state2.raf = requestAnimationFrame(callback43);
    }, [callback8, callback7]), callback11 = runtime2.ReactGridMemo.useCallback((input2, options) => {
      let value47 = ref3.current.tiles.find((input3) => input3.id === input2), value48 = ref10.current?.getBoundingClientRect();
      return value47 && value48 ? gridViewportFromTileRect(value47, options, value48) : null;
    }, []), callback12 = runtime2.ReactGridMemo.useCallback(() => {
      let { w: current2, h: current3 } = ref13.current, current4 = ref3.current;
      if (current2 <= 0 || current3 <= 0)
        return null;
      let value47 = (ref.current.topInset ?? 0) + GRID_TOUCH_CHROME_SIZE + GRID_LABEL_HEIGHT + 30, value48 = current4.width + (ref.current.readOnly ? 0 : GRID_COLUMN_GAP), value49 = current4.height + (ref.current.readOnly ? 0 : GRID_ROW_GAP), value50 = Math.min(GRID_WHEEL_PAN_FACTOR, (current2 - 2 * GRID_TOUCH_CHROME_SIZE) / value48, (current3 - value47 - GRID_TOUCH_CHROME_SIZE) / value49);
      return value50 > 0 ? {
        scale: value50,
        x: -(current2 / value50 - value48) / 2,
        y: -((current3 - value47 - GRID_TOUCH_CHROME_SIZE) / value50 - value49) / 2 - value47 / value50
      } : null;
    }, []), callback13 = runtime2.ReactGridMemo.useCallback(() => {
      let value47 = callback12();
      value47 && (callback9(value47), ref16.current = !0);
    }, [callback12, callback9]);
    runtime2.ReactGridMemo.useLayoutEffect(() => {
      ref16.current && !ref17.current && !ref.current.inert && callback13();
    }, [value8.w, value8.h, value, callback13]), runtime2.ReactGridMemo.useLayoutEffect(() => {
      let value47 = callback12();
      value47 && (ref15.current.minScale = Math.min(value47.scale, ref14.current.scale, Math.max(0.02, Math.min(0.15, value47.scale) * 0.8)));
    }, [value8.w, value8.h, value, memo22, callback12]);
    let callback14 = runtime2.ReactGridMemo.useCallback((input2) => {
      let value47 = callback12(), value48 = ref3.current.tiles.find((input3) => input3.id === input2);
      if (!value47 || !value48)
        return callback13();
      callback10(value47, {
        x: value48.x + GRID_SLIDE_WIDTH / 2,
        y: value48.y + GRID_SLIDE_HEIGHT / 2
      }, (input3) => {
        input3 && callback13();
      }, value48.id);
    }, [callback12, callback13, callback10]), ref18 = runtime2.ReactGridMemo.useRef(!1), ref19 = runtime2.ReactGridMemo.useRef(input.enterFrom), startCameraRef = runtime2.ReactGridMemo.useRef(input.startCamera);
    runtime2.ReactGridMemo.useLayoutEffect(() => {
      if (ref18.current || !callback12())
        return;
      if (ref18.current = !0, startCameraRef.current)
        return ref15.current.minScale = Math.min(ref15.current.minScale, startCameraRef.current.scale), callback9(startCameraRef.current);
      let value47 = ref.current.inert ? null : ref19.current, value48 = value47 ? callback11(value47.id, value47.rect) : null;
      !value47 || !value48 || (callback7(value48), callback14(value47.id));
    }, [
      value8.w,
      value8.h,
      callback12,
      callback11,
      callback7,
      callback9,
      callback14
    ]);
    let ref20 = runtime2.ReactGridMemo.useRef(memo22);
    runtime2.ReactGridMemo.useLayoutEffect(() => {
      let current2 = ref20.current;
      if (ref20.current = memo22, current2.notes === memo22.notes || ref.current.inert || ref17.current)
        return;
      if (ref16.current) {
        callback13();
        return;
      }
      let current3 = ref14.current, value47 = ref13.current.h / current3.scale, value48 = current2.tiles.find((input2) => input2.id === ref.current.currentId), value49 = value48 !== void 0 && value48.y + GRID_SLIDE_HEIGHT > current3.y && value48.y < current3.y + value47 ? current2.rows[value48.row] : current2.rows.reduce((input2, options) => Math.abs(options.y + GRID_SLIDE_HEIGHT / 2 - (current3.y + value47 / 2)) < Math.abs(input2.y + GRID_SLIDE_HEIGHT / 2 - (current3.y + value47 / 2)) ? options : input2, current2.rows[0]), value50 = value49 && memo22.rows.find((input2) => input2.key === value49.key);
      value49 && value50 && value50.y !== value49.y && callback9({
        ...current3,
        y: current3.y + (value50.y - value49.y)
      });
    }, [memo22, callback9, callback13]);
    let callback15 = runtime2.ReactGridMemo.useCallback((input2) => {
      let { w: current2, h: current3 } = ref13.current, value47 = ref.current.topInset ?? 0;
      callback9((0, runtime2.zoomViewportAt)(ref14.current, current2 / 2, value47 + (current3 - value47) / 2, input2, ref15.current));
    }, [callback9]), ref21 = runtime2.ReactGridMemo.useRef(null), callback16 = runtime2.ReactGridMemo.useCallback(() => {
      let current2 = ref21.current, value47 = current2 && ref3.current.tiles.find((input2) => input2.id === current2.id), value48 = ref10.current?.getBoundingClientRect();
      if (!current2 || !value47 || !value48 || !(current2.ev.scale > 0))
        return;
      let value49 = gridViewportFromTileRect(value47, gridOriginScreenRect(current2.ev, current2.rect), value48), current3 = ref14.current;
      !value49 || value49.x === current3.x && value49.y === current3.y && value49.scale === current3.scale || (callback8(!1), callback7(value49));
    }, [callback8, callback7]);
    runtime2.ReactGridMemo.useLayoutEffect(() => {
      behind != null ? callback16() : ref21.current = null;
    }, [memo22, behind, callback16]);
    let ref22 = runtime2.ReactGridMemo.useRef(value2);
    runtime2.ReactGridMemo.useEffect(() => {
      value2 && !ref22.current && value7((input2) => input2.sections.length === 0 && input2.slides.length === 1 && input2.slides[0] === ref.current.currentId ? input2 : {
        slides: ref.current.currentId !== null ? [ref.current.currentId] : [],
        sections: []
      }), ref22.current && !value2 && ref10.current?.focus({
        preventScroll: !0
      }), ref22.current = value2;
    }, [value2]);
    let ref23 = runtime2.ReactGridMemo.useRef(null);
    zoomApiRef && (ref23.current = zoomApiRef.current = {
      getScale: () => ref14.current.scale,
      getLimits: () => ({
        ...ref15.current
      }),
      setScaleTo: (input2) => callback15(input2 / ref14.current.scale),
      fitAll: (input2) => input2 !== void 0 ? callback14(input2) : callback13(),
      stepZoom: callback15,
      glideToSlide: (input2, options, context) => {
        ref33.current?.end("drop"), ref26.current && callback23();
        let value47 = ref3.current.tiles.find((input3) => input3.id === input2), value48 = callback11(input2, options);
        !value47 || !value48 ? context?.(!1) : callback10(value48, {
          x: value47.x + GRID_SLIDE_WIDTH / 2,
          y: value47.y + GRID_SLIDE_HEIGHT / 2
        }, context, input2);
      },
      follow: (input2, options, context) => {
        callback8(!1), ref16.current = !1, ref21.current = {
          id: input2,
          ev: options,
          rect: context
        }, callback16();
      },
      tileRect: (input2) => {
        let value47 = ref3.current.tiles.find((input3) => input3.id === input2), value48 = ref10.current?.getBoundingClientRect();
        if (!value47 || !value48 || !(value48.width > 0))
          return null;
        let value49 = panGridViewToSlide(ref14.current, value47, value48.width, value48.height, ref.current.topInset);
        return callback9(value49), gridTileScreenRect(value47, value49, value48);
      },
      tileAt: (input2, options) => {
        let value47 = callback17(input2, options), current2 = ref3.current, value48 = current2.tiles.find((input3) => value47.x >= input3.x && value47.x <= input3.x + GRID_SLIDE_WIDTH && value47.y >= input3.y && value47.y <= input3.y + GRID_SLIDE_HEIGHT + (current2.notes > 0 && (ref.current.slides[input3.id]?.notes ?? "").trim() !== "" ? current2.notes : 0));
        return value48 && value48.id !== ref.current.behind ? value48.id : null;
      },
      showSlide: (input2, options) => {
        let value47 = ref3.current.tiles.find((input3) => input3.id === input2), value48 = ref10.current?.getBoundingClientRect();
        if (!value47 || !value48 || !(value48.width > 0))
          return !1;
        if (!options)
          return callback18(input2), !0;
        let value49 = callback17(options.x, options.y), value50 = zoomGridViewToSlidePoint(ref14.current, value47, value49, value48.width, value48.height, ref.current.topInset ?? 0, ref3.current.notes, ref15.current);
        return value50 !== ref14.current && (ref16.current = !1, callback10(value50, value49)), !0;
      },
      settling: callback5,
      held: () => ref26.current !== null,
      slideAt: (input2, options) => {
        let value47 = ref10.current?.getBoundingClientRect();
        return !value47 || input2 < value47.left || input2 > value47.right || options < value47.top || options > value47.bottom ? null : hitTestGridTile(ref3.current.tiles, callback17(input2, options));
      }
    }), runtime2.ReactGridMemo.useEffect(() => () => {
      zoomApiRef && zoomApiRef.current === ref23.current && (zoomApiRef.current = null);
    }, [zoomApiRef]), runtime2.ReactGridMemo.useEffect(() => {
      onScaleChange?.(value10.scale);
    }, [value10.scale, onScaleChange]);
    let onCamera = input.onCamera;
    runtime2.ReactGridMemo.useEffect(() => {
      onCamera?.(ref16.current ? null : value10);
    }, [value10, onCamera]);
    let onCameraChange = input.onCameraChange;
    runtime2.ReactGridMemo.useEffect(() => {
      onCameraChange?.();
    }, [value10, memo22, onCameraChange]);
    let callback17 = (input2, options) => {
      let bounds = ref10.current.getBoundingClientRect(), current2 = ref14.current;
      return {
        x: current2.x + (input2 - bounds.left) / current2.scale,
        y: current2.y + (options - bounds.top) / current2.scale
      };
    };
    runtime2.ReactGridMemo.useEffect(() => {
      let current2 = ref10.current;
      if (!current2 || value2)
        return;
      let flag = !1, value47 = (0, runtime2.attachViewportGestures)({
        element: current2,
        getView: () => ref14.current,
        setView: callback9,
        get limits() {
          return ref15.current;
        },
        onGestureEnd: () => {
          flag && (flag = !1, (0, runtime2.clearGestureCursor)());
        },
        shouldPan: (event) => {
          if (event.button !== 0 && event.button !== 1 || ref33.current || ref26.current)
            return !1;
          if (event.button === 1)
            return flag = !0, (0, runtime2.setGestureCursor)("grabbing"), !0;
          let value48 = event.target?.closest?.(GRID_INTERACTIVE_TARGET_SELECTOR);
          return value48 ? event.pointerType === "touch" && value48.matches("[data-grid-tile]") && value48.getAttribute("data-grid-tile") !== ref.current.currentId : !canStartGridRectSelection({
            pointerType: event.pointerType,
            button: event.button,
            bare: !0
          });
        }
      });
      return () => {
        value47.destroy(), flag && (0, runtime2.clearGestureCursor)();
      };
    }, [callback9, value2]);
    let callback18 = runtime2.ReactGridMemo.useCallback((input2) => {
      let value47 = ref3.current.tiles.find((input3) => input3.id === input2), { w: current2, h: current3 } = ref13.current;
      if (!value47 || current2 <= 0)
        return;
      let value48 = panGridViewToSlide(ref14.current, value47, current2, current3, ref.current.topInset, ref3.current.notes);
      value48 !== ref14.current && callback9(value48);
    }, [callback9]), ref24 = runtime2.ReactGridMemo.useRef(memo32), ref25 = runtime2.ReactGridMemo.useRef(currentId);
    runtime2.ReactGridMemo.useLayoutEffect(() => {
      let current2 = ref25.current;
      currentId !== current2 && (!ref.current.inert && currentId !== null && memo32.has(currentId) && !ref24.current.has(currentId) && (current2 === null || memo32.has(current2)) && callback18(currentId), ref25.current = currentId, ref24.current = memo32);
    }, [currentId, memo32, callback18]), ref4.current = value3 ? value3.sectionId ?? "-" : null;
    let current = ref4.current;
    runtime2.ReactGridMemo.useEffect(() => {
      if (value2)
        return;
      let callback43 = (input2) => memo4[memo32.get(input2)?.seg ?? -1]?.section?.id ?? "-";
      ref.current.onSelectionChange?.({
        slides: value6.slides,
        slideSections: value6.slides.map(callback43),
        sections: value6.sections,
        editingSection: ref4.current
      });
    }, [value6, memo4, memo32, current, value2]), runtime2.ReactGridMemo.useEffect(() => {
      if (ref.current.inert || ref.current.unasked)
        return;
      let value47 = window.setTimeout(() => {
        document.activeElement?.closest("[data-slides-comments]") == null && ref10.current?.focus({
          preventScroll: !0
        });
      }, 60);
      return () => window.clearTimeout(value47);
    }, []), runtime2.ReactGridMemo.useEffect(() => {
      let callback43 = (event) => {
        if (event.defaultPrevented || ref.current.inert || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key !== "0" && event.key !== "=" && event.key !== "+" && event.key !== "-")
          return;
        let target = event.target;
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || (event.preventDefault(), !ref17.current && (event.key === "0" ? callback13() : callback15(event.key === "-" ? 0.8 : 1.25)));
      };
      return window.addEventListener("keydown", callback43), () => window.removeEventListener("keydown", callback43);
    }, [callback13, callback15]);
    let callback19 = (event) => {
      if (value2 || value3 || event.defaultPrevented || !ref10.current?.contains(event.target))
        return;
      if (input.commenting === !0) {
        (event.metaKey || event.ctrlKey) && (event.key === "a" || event.key === "A") && event.preventDefault();
        return;
      }
      let target = event.target, value47 = target.closest('[data-kit="thumb-actions"]') !== null;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "BUTTON" && !value47 || target.isContentEditable || value47 && (event.key === "Enter" || event.key === " " || event.key === "Delete" || event.key === "Backspace"))
        return;
      let callback43 = () => {
        value47 && ref10.current?.focus({
          preventScroll: !0
        });
      }, value48 = event.metaKey || event.ctrlKey;
      if (ref17.current && !(event.key === "Escape" && ref33.current)) {
        (!value48 || event.key === "a" || event.key === "A") && event.preventDefault();
        return;
      }
      if (event.key === "Escape") {
        if (event.preventDefault(), callback43(), ref36.current = null, ref33.current)
          ref33.current.end("restore");
        else if (ref26.current) {
          callback23(), ref12.current = !0;
          let callback44 = () => {
            window.removeEventListener("pointerup", callback44), window.removeEventListener("pointercancel", callback44), setTimeout(() => ref12.current = !1, 0);
          };
          window.addEventListener("pointerup", callback44), window.addEventListener("pointercancel", callback44);
        } else
          value6.sections.length > 0 || value6.slides.length > 1 || value6.slides.length === 1 && value6.slides[0] !== currentId ? currentId !== null ? callback(currentId) : value7({
            slides: [],
            sections: []
          }) : event.repeat || onClose();
        return;
      }
      if (value48 && !event.shiftKey && !event.altKey && (event.key === "a" || event.key === "A")) {
        event.preventDefault(), callback43(), value7({
          slides: ref3.current.tiles.map((input2) => input2.id),
          sections: []
        });
        return;
      }
      if (value48 && !event.shiftKey && !event.altKey && (event.key === "d" || event.key === "D")) {
        if (readOnly || (event.preventDefault(), callback43(), event.repeat || value6.sections.length > 0 || value6.slides.length === 0))
          return;
        let value53 = ref.current.onDuplicateSlides(ref3.current.tiles.filter((input2) => value6.slides.includes(input2.id)).map((input2) => input2.id));
        value53.length > 0 && (ref6.current = ref7.current = value53[value53.length - 1], value7({
          slides: value53,
          sections: []
        }));
        return;
      }
      let value49 = value6.sections.length === 1 && value6.slides.length === 0 ? ref3.current.rows.find((input2) => input2.section?.id === value6.sections[0]) : void 0;
      if (event.key === "Enter" && !value48 && !readOnly && value49?.section) {
        event.preventDefault(), callback40(value49.key, value49.section.id, value49.section.description);
        return;
      }
      if (event.key === "Enter" && currentId !== null && !value48) {
        event.preventDefault(), event.repeat || onOpen(currentId);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && !value48 && !event.altKey) {
        if (event.preventDefault(), readOnly || value6.sections.length > 0 || value6.slides.length === 0)
          return;
        value6.slides.length === 1 ? ref.current.onDelete(value6.slides[0]) : ref.current.onDeleteSlides(ref3.current.tiles.filter((input2) => value6.slides.includes(input2.id)).map((input2) => input2.id));
        return;
      }
      if ((0, runtime2.isContextMenuKey)(event)) {
        event.preventDefault(), callback43(), currentId !== null && callback36(currentId);
        return;
      }
      if (!event.key.startsWith("Arrow") || value48)
        return;
      event.preventDefault(), callback43(), value20(!0);
      let current2 = ref3.current, value50 = event.shiftKey ? ref7.current ?? currentId : currentId, value51 = value50 !== null ? memo32.get(value50) : void 0, value52 = current2.tiles[0];
      if (value51)
        if (event.key === "ArrowLeft" || event.key === "ArrowRight")
          value52 = current2.tiles[current2.tiles.indexOf(value51) + (event.key === "ArrowLeft" ? -1 : 1)] ?? value51;
        else {
          let value53 = event.key === "ArrowUp" ? -1 : 1, value54 = value51.row + value53;
          for (; value54 >= 0 && value54 < current2.rows.length && current2.rows[value54].ids.length === 0; )
            value54 += value53;
          let value55 = current2.rows[value54];
          value52 = value55 ? memo32.get(value55.ids[Math.min(value51.col, value55.ids.length - 1)]) : value51;
        }
      value52 && (event.shiftKey && ref6.current !== null ? (ref7.current = value52.id, value7({
        slides: callback2(ref6.current, value52.id),
        sections: []
      }), callback18(value52.id)) : (value52.id !== currentId || value6.slides.length !== 1 || value6.sections.length > 0) && (callback(value52.id), callback18(value52.id)));
    }, ref26 = runtime2.ReactGridMemo.useRef(null), ref27 = runtime2.ReactGridMemo.useRef({
      x: 0,
      y: 0
    }), [value13, value14] = runtime2.ReactGridMemo.useState(null), ref28 = runtime2.ReactGridMemo.useRef(null), callback20 = (input2) => {
      ref28.current = input2, value14(input2);
    }, ref29 = runtime2.ReactGridMemo.useRef(null), callback21 = () => {
      let state2 = {
        move: (input2) => callback28(input2),
        up: (input2) => callback29(input2),
        cancel: () => callback23()
      };
      ref29.current = state2, window.addEventListener("pointermove", state2.move), window.addEventListener("pointerup", state2.up), window.addEventListener("pointercancel", state2.cancel), window.addEventListener("blur", state2.cancel);
    }, callback22 = () => {
      let current2 = ref29.current;
      ref29.current = null, current2 && (window.removeEventListener("pointermove", current2.move), window.removeEventListener("pointerup", current2.up), window.removeEventListener("pointercancel", current2.cancel), window.removeEventListener("blur", current2.cancel));
    };
    runtime2.ReactGridMemo.useEffect(() => () => {
      callback22(), ref26.current?.copy === !0 && (0, runtime2.clearGestureCursor)();
    }, []);
    let callback23 = () => {
      ref26.current?.copy === !0 && (0, runtime2.clearGestureCursor)(), ref26.current = null, callback22(), callback30(), callback20(null);
    }, callback24 = (input2, options) => {
      if (input2.button !== 0 || ref26.current || input2.pointerType === "touch" && options !== currentId || (input2.stopPropagation(), ref10.current?.focus({
        preventScroll: !0
      }), input2.shiftKey || input2.metaKey || input2.ctrlKey))
        return;
      let altKey = input2.altKey;
      if (altKey || (ref5.current.slides.includes(options) ? options !== currentId && onSelect(options) : callback(options)), readOnly)
        return;
      ref27.current = callback17(input2.clientX, input2.clientY);
      let slides2 = ref5.current.slides, value47 = slides2.includes(options) && slides2.length > 1 ? ref3.current.tiles.filter((input3) => slides2.includes(input3.id)).map((input3) => input3.id) : [options];
      ref26.current = {
        kind: "tile",
        id: options,
        ids: value47,
        copy: altKey,
        pointerId: input2.pointerId,
        sx: input2.clientX,
        sy: input2.clientY,
        moved: !1
      }, callback21();
    }, callback25 = (input2, options) => {
      if (input2.button !== 0 || ref26.current || readOnly)
        return;
      input2.stopPropagation(), ref27.current = callback17(input2.clientX, input2.clientY);
      let sections2 = ref5.current.sections, value47 = sections2.includes(options) && sections2.length > 1 ? ref2.current.flatMap((input3) => input3.section !== null && sections2.includes(input3.section.id) ? [input3.section.id] : []) : [options];
      ref26.current = {
        kind: "row",
        id: options,
        ids: value47,
        copy: !1,
        pointerId: input2.pointerId,
        sx: input2.clientX,
        sy: input2.clientY,
        moved: !1
      }, callback21();
    }, callback26 = (input2, options, source) => source.kind === "gap" ? {
      gapIndex: source.gapIndex
    } : resolveSlideGridMoveTarget(input2, options, source, EMPTY_GRID_SELECTION_SET), ref30 = runtime2.ReactGridMemo.useRef({
      x: 0,
      y: 0
    }), callback27 = (input2, options) => {
      let current2 = ref26.current;
      if (!current2 || !current2.moved)
        return;
      ref30.current = {
        x: input2,
        y: options
      };
      let value47 = callback17(input2, options);
      current2.kind === "tile" ? callback20({
        kind: "tile",
        id: current2.id,
        ids: current2.ids,
        copy: current2.copy,
        dx: value47.x - ref27.current.x,
        dy: value47.y - ref27.current.y,
        target: hitTestSlideGridDrop(ref3.current, value47.x, value47.y, current2.copy ? EMPTY_GRID_SELECTION_SET : new Set(current2.ids))
      }) : callback20({
        kind: "row",
        sectionId: current2.id,
        sectionIds: current2.ids,
        dx: value47.x - ref27.current.x,
        dy: value47.y - ref27.current.y,
        gap: hitTestSlideGridSectionDrop(ref3.current, value47.y, ref2.current.length)
      });
    }, callback28 = (input2) => {
      let current2 = ref26.current;
      if (!(!current2 || current2.pointerId !== input2.pointerId)) {
        if (input2.pointerType === "mouse" && input2.buttons === 0)
          return callback23();
        if (!(!current2.moved && Math.hypot(input2.clientX - current2.sx, input2.clientY - current2.sy) < GRID_RECT_SELECTION_THRESHOLD_PX)) {
          if (!current2.moved) {
            let current3 = ref5.current, currentId2 = ref.current.currentId;
            current2.kind === "tile" && current2.copy && !current3.slides.includes(current2.id) ? callback(current2.id) : current2.kind === "tile" && (current3.sections.length > 0 || current3.slides.length !== current2.ids.length) && value7({
              slides: currentId2 !== null && current2.ids.includes(currentId2) ? [
                ...current2.ids.filter((input3) => input3 !== currentId2),
                currentId2
              ] : current2.ids,
              sections: []
            }), current2.kind === "row" && (current3.slides.length > 0 || current3.sections.length !== current2.ids.length) && value7({
              slides: [],
              sections: current2.ids
            }), current2.copy && input2.pointerType !== "touch" && (0, runtime2.setGestureCursor)("copy");
          }
          current2.moved = !0, callback27(input2.clientX, input2.clientY), callback31(input2.clientX, input2.clientY);
        }
      }
    }, callback29 = (input2) => {
      let current2 = ref26.current;
      if (!current2 || current2.pointerId !== input2.pointerId)
        return;
      let moved = current2.moved, current3 = ref28.current;
      if (callback23(), !moved || !current3)
        return;
      ref12.current = !0, setTimeout(() => ref12.current = !1, 0);
      let current4 = ref.current, current5 = ref2.current;
      if (current3.kind === "row") {
        current3.gap && current4.onMoveSections(current3.sectionIds, current3.gap.gapIndex);
        return;
      }
      let target = current3.target;
      if (!target)
        return;
      let value47 = current3.ids.filter((input3) => current4.order.includes(input3));
      if (value47.length === 0)
        return;
      if (current3.copy) {
        let value49 = callback26(ref3.current, current5, target), value50 = value49 ? current4.onDuplicateSlides(value47, value49) : [];
        value50.length > 0 && (ref6.current = ref7.current = value50[value50.length - 1], value7({
          slides: value50,
          sections: []
        }));
        return;
      }
      if (target.kind === "gap") {
        current4.onStartSectionWithSlides(value47, target.gapIndex);
        return;
      }
      let value48 = resolveSlideGridMoveTarget(ref3.current, current5, target, new Set(value47));
      value48 && current4.onMoveSlidesTo(value47, value48.sectionId, value48.index);
    }, ref31 = runtime2.ReactGridMemo.useRef(0), ref32 = runtime2.ReactGridMemo.useRef({
      x: 0,
      y: 0
    }), callback30 = () => {
      cancelAnimationFrame(ref31.current), ref31.current = 0, ref32.current = {
        x: 0,
        y: 0
      };
    }, callback31 = (input2, options) => {
      let bounds = ref10.current.getBoundingClientRect(), count = 48, value47 = input2 < bounds.left + 48 ? -1 : input2 > bounds.right - 48 ? 1 : 0, value48 = options < bounds.top + (ref.current.topInset ?? 0) + 48 ? -1 : options > bounds.bottom - 48 ? 1 : 0;
      if (ref32.current = {
        x: value47,
        y: value48
      }, (value47 !== 0 || value48 !== 0) && ref31.current === 0) {
        let callback43 = () => {
          let { x: current2, y: current3 } = ref32.current;
          if (current2 === 0 && current3 === 0) {
            ref31.current = 0;
            return;
          }
          let current4 = ref14.current, { w: current5, h: current6 } = ref13.current, current7 = ref3.current, value49 = Math.max(-(current5 - 96) / current4.scale, Math.min(current7.width - 96 / current4.scale, current4.x + 12 * current2 / current4.scale)), value50 = Math.max(-(current6 - 96) / current4.scale, Math.min(current7.height - 96 / current4.scale, current4.y + 12 * current3 / current4.scale));
          (value49 !== current4.x || value50 !== current4.y) && callback9({
            ...current4,
            x: value49,
            y: value50
          }), callback27(ref30.current.x, ref30.current.y), ref31.current = requestAnimationFrame(callback43);
        };
        ref31.current = requestAnimationFrame(callback43);
      }
    };
    runtime2.ReactGridMemo.useEffect(() => callback30, []);
    let ref33 = runtime2.ReactGridMemo.useRef(null), [value15, value16] = runtime2.ReactGridMemo.useState(null), ref34 = runtime2.ReactGridMemo.useRef(-1 / 0), ref35 = runtime2.ReactGridMemo.useRef(0), callback32 = () => performance.now() - ref34.current < 700 && ref35.current < 2, callback33 = (input2) => {
      let currentTarget = input2.currentTarget, { pointerId: value47, clientX: value48, clientY: value49 } = input2, value50 = callback17(value48, value49), current2 = ref5.current, value51 = input2.shiftKey || input2.metaKey || input2.ctrlKey || input2.altKey, value52 = value48, value53 = value49, value54 = null, callback43 = () => {
        let value55 = callback17(value52, value53), state2 = {
          x: Math.min(value50.x, value55.x),
          y: Math.min(value50.y, value55.y),
          w: Math.abs(value55.x - value50.x),
          h: Math.abs(value55.y - value50.y)
        }, current3 = ref14.current;
        value16({
          x: (state2.x - current3.x) * current3.scale,
          y: (state2.y - current3.y) * current3.scale,
          w: state2.w * current3.scale,
          h: state2.h * current3.scale
        });
        let value56 = extendGridSelection(current2, collectGridTilesInRect(ref3.current.tiles, state2), value51);
        value54 !== null && value56.slides.join(",") === value54.slides.join(",") && value56.sections.join(",") === value54.sections.join(",") || (value54 = value56, value7(value56));
      }, callback44 = (input3) => {
        if (input3.pointerId !== value47)
          return;
        if (!(input3.buttons & 1))
          return callback45("settle");
        let current3 = ref33.current;
        if (current3) {
          if (!current3.live) {
            if (Math.hypot(input3.clientX - value48, input3.clientY - value49) < GRID_RECT_SELECTION_THRESHOLD_PX)
              return;
            current3.live = !0, ref36.current = null, currentTarget.style.userSelect = currentTarget.style.webkitUserSelect = "none";
            try {
              currentTarget.setPointerCapture(value47);
            } catch {
            }
          }
          value52 = input3.clientX, value53 = input3.clientY, callback43();
        }
      }, callback45 = (input3) => {
        window.removeEventListener("pointermove", callback44), window.removeEventListener("pointerup", callback47), window.removeEventListener("pointercancel", callback47), window.removeEventListener("blur", callback48), window.removeEventListener("contextmenu", callback46);
        let value55 = ref33.current?.live === !0;
        if (ref33.current = null, value16(null), currentTarget.style.userSelect = currentTarget.style.webkitUserSelect = "", currentTarget.hasPointerCapture(value47) && currentTarget.releasePointerCapture(value47), !value55 || input3 === "drop")
          return;
        ref34.current = performance.now(), ref35.current = 0, ref12.current = !0, setTimeout(() => ref12.current = !1, 0);
        let current3 = ref.current, value56 = ref2.current.flatMap((input4) => input4.section ? [input4.section.id] : []), callback49 = (input4) => ({
          slides: input4.slides.filter((input5) => current3.order.includes(input5)),
          sections: input4.sections.filter((input5) => value56.includes(input5))
        });
        if (input3 === "restore")
          value7(callback49(current2));
        else if (value54 !== null) {
          let value57 = callback49(value54);
          value7(value57), value57.slides.length > 0 && (current3.currentId === null || !value57.slides.includes(current3.currentId)) && current3.onSelect(value57.slides[value57.slides.length - 1]);
        }
      }, callback46 = () => callback45("settle"), callback47 = (input3) => {
        input3.pointerId === value47 && callback45("settle");
      }, callback48 = () => {
        document.hasFocus() || callback45("settle");
      };
      ref33.current = {
        live: !1,
        sweep: callback43,
        end: callback45
      }, window.addEventListener("pointermove", callback44), window.addEventListener("pointerup", callback47), window.addEventListener("pointercancel", callback47), window.addEventListener("blur", callback48), window.addEventListener("contextmenu", callback46);
    };
    runtime2.ReactGridMemo.useEffect(() => () => ref33.current?.end("drop"), []), runtime2.ReactGridMemo.useEffect(() => {
      ref33.current?.live && ref33.current.sweep();
    }, [value10]);
    let ref36 = runtime2.ReactGridMemo.useRef(null);
    runtime2.ReactGridMemo.useLayoutEffect(() => {
      value2 && (ref33.current?.end("drop"), ref26.current && callback23(), ref36.current = null);
    }, [value2]);
    let [value17, value18] = runtime2.ReactGridMemo.useState(null), [value19, value20] = runtime2.ReactGridMemo.useState(!1);
    runtime2.ReactGridMemo.useEffect(() => {
      let current2 = ref10.current;
      if (!current2)
        return;
      let callback43 = (event) => {
        let target = event.target;
        target instanceof HTMLElement && value20(target === current2 ? target.matches(":focus-visible") : target.closest('[data-kit="thumb-actions"]') !== null);
      }, callback44 = (input2) => {
        let relatedTarget = input2.relatedTarget;
        (!(relatedTarget instanceof Node) || !current2.contains(relatedTarget)) && value20(!1);
      };
      return current2.addEventListener("focusin", callback43), current2.addEventListener("focusout", callback44), () => {
        current2.removeEventListener("focusin", callback43), current2.removeEventListener("focusout", callback44);
      };
    }, []);
    let value21 = value17 ? memo32.get(value17.id) : void 0, value22 = value17 === null ? [] : value6.slides.length > 1 && value6.slides.includes(value17.id) ? memo22.tiles.filter((input2) => value6.slides.includes(input2.id)).map((input2) => input2.id) : [value17.id], value23 = value22.length > 0 ? memo4.find((input2) => input2.ids.includes(value22[0])) : void 0, value24 = value23 !== void 0 && value23.ids.length === value22.length && value23.ids.every((input2, options) => input2 === value22[options]), value25 = value23 === void 0 ? 1 : (() => {
      let value47 = value23.ids.indexOf(value22[0]);
      return value23.ids.slice(value47 + 1).some((input2) => !value22.includes(input2)) && !(value47 === 0 && value23.section !== null) ? 2 : 1;
    })(), value26 = (sections?.length ?? 0) + value25 > runtime2.maxDeckSections;
    runtime2.ReactGridMemo.useEffect(() => {
      value17 !== null && value21 === void 0 && value18(null);
    }, [value17, value21]);
    let value27 = value3 !== null && !memo22.rows.some((input2) => input2.key === value3.key);
    runtime2.ReactGridMemo.useEffect(() => {
      value27 && value4(null);
    }, [value27]);
    let callback34 = () => {
      value18(null), document.hasFocus() && ref10.current?.focus({
        preventScroll: !0
      });
    }, callback35 = () => {
      queueMicrotask(() => ref10.current?.focus({
        preventScroll: !0
      })), value18(null);
    }, callback36 = (input2) => {
      let value47 = ref10.current?.querySelector('[data-grid-tile="' + CSS.escape(input2) + '"]')?.getBoundingClientRect();
      value47 && value18({
        x: value47.left + Math.min(40, value47.width / 2),
        y: value47.top + Math.min(24, value47.height / 2),
        id: input2,
        keyboard: !0
      });
    }, callback37 = (input2) => () => {
      callback35(), input2();
    }, ref37 = runtime2.ReactGridMemo.useRef(!1), callback38 = (input2 = value3?.text ?? "") => {
      if (!value3 || ref37.current)
        return;
      ref37.current = !0;
      let current2 = ref.current, value47 = ref3.current.rows.find((input3) => input3.key === value3.key)?.section?.description ?? "";
      value4(null), ref10.current?.focus({
        preventScroll: !0
      }), input2.trim() !== value47.trim() && current2.onSetSectionDescription(value3.sectionId, input2.trim());
    }, callback39 = () => {
      ref37.current = !0, value4(null), ref10.current?.focus({
        preventScroll: !0
      });
    }, callback40 = (input2, options, context) => {
      callback38(), ref37.current = !1, value4({
        key: input2,
        sectionId: options,
        text: context
      });
    }, callback41 = (input2) => {
      ref8.current = input2, value7({
        slides: [],
        sections: [input2]
      }), callback40(input2 + ":0", input2, "");
      let value47 = ref3.current.rows.find((input3) => input3.key === input2 + ":0"), { w: current2, h: current3 } = ref13.current;
      if (!value47 || current2 <= 0)
        return;
      let current4 = ref14.current, value48 = 24 / current4.scale, value49 = value47.y - (value37 + value36) * value38 / current4.scale - value48, { x: value50, y: value51 } = current4;
      value50 > 0 ? value50 = -value48 : value50 + current2 / current4.scale < 320 / current4.scale && (value50 = Math.min(-value48, (320 - current2) / current4.scale)), value49 + value48 < value51 + (ref.current.topInset ?? 0) / current4.scale ? value51 = value49 - current3 / current4.scale / 3 : value47.y - value37 * value38 / current4.scale > value51 + current3 / current4.scale && (value51 = value47.y + value48 - current3 / current4.scale), (value50 !== current4.x || value51 !== current4.y) && callback9({
        ...current4,
        x: value50,
        y: value51
      });
    }, ref38 = runtime2.ReactGridMemo.useRef(null);
    runtime2.ReactGridMemo.useEffect(() => {
      let current2 = ref38.current;
      ref38.current = null, current2 !== null && memo4.some((input2) => input2.section?.id === current2) && callback41(current2);
    }, [memo4]);
    let callback42 = () => {
      let value47 = memo4[memo4.length - 1]?.section;
      if (value47 && (0, runtime2.emptySectionHasNoDescription)(value47) && value3?.sectionId !== value47.id)
        return callback41(value47.id);
      callback38();
      let value48 = (0, runtime2.createModelId)();
      ref38.current = value48, ref.current.onAddSection(value48);
    }, value28 = (sections?.length ?? 0) >= runtime2.maxDeckSections, memo42 = runtime2.ReactGridMemo.useMemo(() => {
      if (!value13)
        return null;
      let state2 = {
        order: [...order],
        sections: sections?.map((input2) => ({
          ...input2
        }))
      }, value47;
      if (value13.kind === "tile") {
        let target = value13.target;
        if (!target)
          return null;
        let value48 = value13.ids.filter((input2) => order.includes(input2));
        if (value13.copy) {
          let value49 = callback26(memo22, memo4, target);
          value47 = value49 ? (0, runtime2.insertSlidesAtSectionTarget)(state2, value48.map(copiedGridSlideKey), value49, GRID_PREVIEW_SLIDE_ID) : void 0;
        } else if (target.kind === "gap")
          value47 = (0, runtime2.moveSlidesIntoNewSection)(state2, value48, target.gapIndex, GRID_PREVIEW_SLIDE_ID);
        else {
          let value49 = resolveSlideGridMoveTarget(memo22, memo4, target, new Set(value48));
          if (!value49)
            return null;
          value47 = (0, runtime2.moveSlidesToSection)(state2, value48, value49.sectionId, value49.index);
        }
      } else {
        if (!value13.gap)
          return null;
        value47 = (0, runtime2.moveSectionsToGap)(state2, value13.sectionIds, value13.gap.gapIndex);
      }
      return value47 ? buildSlideGridLayout((0, runtime2.sectionGroups)(value47.sections, value47.order), value5) : memo22;
    }, [value13, memo4, memo22, order, sections, value5]), value29 = memo42 ?? memo22, memo5 = runtime2.ReactGridMemo.useMemo(() => new Map(value29.tiles.map((input2) => [input2.id, input2])), [value29]), scale = value10.scale, value30 = 1 / scale, value31 = GRID_ROW_GAP * scale, value32 = GRID_SLIDE_WIDTH * scale >= 56 && value31 >= GRID_LABEL_HEIGHT + 2 + GRID_TOUCH_LABEL_FONT_SIZE + GRID_CHROME_GAP, value33 = calculateGridAddButtonSize(scale), value34 = value33.size / 24, state = {
      "--gap-add-slop": String((40 / value34 - 24) / 2) + "px"
    }, value35 = value31 < GRID_TOUCH_LABEL_FONT_SIZE + 6 + GRID_CHROME_GAP, value36 = value35 ? GRID_SELECTION_OUTSET : GRID_TOUCH_LABEL_FONT_SIZE, value37 = value32 ? GRID_LABEL_HEIGHT + 2 : value35 ? 3 : 6, value38 = Math.max(0.1, Math.min(1, (value31 - GRID_CHROME_GAP) / (value36 + value37))), value39 = !value35 && value31 - GRID_CHROME_GAP >= value36 + value37 + 18, value40 = memo22.notes * scale, value41 = Math.max(1, Math.floor((value40 - GRID_TILE_CORNER_RADIUS) / GRID_LABEL_FONT_SIZE)), value42 = Math.min(1, value40 / (GRID_TILE_CORNER_RADIUS + GRID_LABEL_FONT_SIZE)), value43 = Math.max(0, Math.min(value10.x + GRID_TOUCH_CHROME_SIZE * value30, memo22.width - 64 * value30)), value44 = value13?.kind === "tile" ? value13.id : null, value45 = value13?.kind === "tile" && value13.copy, memo6 = runtime2.ReactGridMemo.useMemo(() => new Set(value13?.kind === "tile" ? value13.ids : []), [value13]), memo7 = runtime2.ReactGridMemo.useMemo(() => new Set(value13?.kind === "tile" && value13.copy ? [
      value13.id,
      ...value13.ids.filter((input2) => input2 !== value13.id).slice(0, 3)
    ] : []), [value13]), memo8 = runtime2.ReactGridMemo.useMemo(() => new Set(value13?.kind === "row" ? value13.sectionIds : []), [value13]), memo9 = runtime2.ReactGridMemo.useMemo(() => memo22.tiles.flatMap((input2) => input2.id === behind || !value45 && memo6.has(input2.id) || memo8.has(memo4[input2.seg]?.section?.id ?? "") ? [] : [memo5.get(input2.id) ?? input2]), [memo22, memo5, behind, value45, memo6, memo8, memo4]), value46 = value44 !== null ? memo32.get(value44) : void 0;
    return SlideGridJsx.jsxs("div", {
      ref: ref10,
      "data-slides-grid": "",
      tabIndex: value2 ? -1 : 0,
      role: "application",
      "aria-label": "画布",
      "aria-hidden": value2 || void 0,
      className: (0, runtime2.joinClassNames)("relative h-full w-full overflow-hidden bg-editor-canvas outline-none", value2 && "pointer-events-none"),
      onKeyDown: callback19,
      onWheelCapture: (input2) => {
        ref17.current && !input2.ctrlKey && input2.stopPropagation();
      },
      onPointerDownCapture: () => {
        ref35.current += 1, ref36.current = null;
      },
      onPointerDown: (event) => {
        if (value17 === null && !event.target.closest("textarea,input,button,[data-mc-menu]") && ref10.current?.focus({
          preventScroll: !0
        }), ref33.current !== null || ref26.current !== null)
          return;
        let value47 = event.currentTarget.contains(event.target) && !event.target.closest(GRID_INTERACTIVE_TARGET_SELECTOR + ", [data-slides-comments]");
        value47 && event.isPrimary && event.button === 0 && !(event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) && !callback5() && (ref36.current = {
          pointerId: event.pointerId,
          sx: event.clientX,
          sy: event.clientY
        }), canStartGridRectSelection({
          pointerType: event.pointerType,
          button: event.button,
          bare: value47
        }) && callback33(event);
      },
      onPointerMove: (input2) => {
        let current2 = ref36.current;
        current2 !== null && current2.pointerId === input2.pointerId && Math.hypot(input2.clientX - current2.sx, input2.clientY - current2.sy) >= GRID_RECT_SELECTION_THRESHOLD_PX && (ref36.current = null);
      },
      onPointerUp: (input2) => {
        let current2 = ref36.current;
        if (current2 === null || current2.pointerId !== input2.pointerId)
          return;
        ref36.current = null;
        let current3 = ref5.current;
        Math.hypot(input2.clientX - current2.sx, input2.clientY - current2.sy) < GRID_RECT_SELECTION_THRESHOLD_PX && (current3.slides.length > 0 || current3.sections.length > 0) && value7({
          slides: [],
          sections: []
        });
      },
      onPointerCancel: (input2) => {
        ref36.current?.pointerId === input2.pointerId && (ref36.current = null);
      },
      onDoubleClick: (event) => {
        event.target === event.currentTarget && !callback5() && !callback32() && callback13();
      },
      children: [
        SlideGridJsx.jsxs("div", {
          className: "absolute top-0 left-0 pointer-fine:will-change-transform",
          style: {
            transform: "translate(" + String(-value10.x * scale) + "px, " + String(-value10.y * scale) + "px) scale(" + String(scale) + ")",
            transformOrigin: "0 0"
          },
          children: [
            value29.rows.map((input2) => {
              if (input2.continuation)
                return null;
              let section = input2.section, value47 = value3?.key === input2.key, value48 = section !== null && memo8.has(section.id) ? memo22.rows.find((input3) => input3.key === input2.key) : void 0, value49 = value48 && value13?.kind === "row" ? {
                y: value48.y,
                dx: value13.dx,
                dy: value13.dy
              } : null, value50 = section?.description ?? "", value51 = "章节 " + String(input2.seg + 1), text = "描述此章节", value52 = !readOnly && section?.id !== GRID_PREVIEW_SLIDE_ID, value53 = section !== null && value6.sections.includes(section.id), value54 = value47 ? 1 : value38, value55 = value49 ? value49.y + value49.dy : input2.y;
              return SlideGridJsx.jsxs("div", {
                children: [
                  SlideGridJsx.jsx("div", {
                    "data-grid-label": section?.id ?? "",
                    className: (0, runtime2.joinClassNames)("group/label absolute", value49 ? "z-40" : "z-[35]", !value49 && value13 !== null && "transition-[top] duration-150 ease-out", section?.id === GRID_PREVIEW_SLIDE_ID && "opacity-60"),
                    style: {
                      left: value49 ? value49.dx : 0,
                      top: value55 - value37 * value54 * value30,
                      width: value29.width,
                      height: 0
                    },
                    children: SlideGridJsx.jsxs("div", {
                      "data-mc-chrome": "",
                      ...section !== null && section.id !== GRID_PREVIEW_SLIDE_ID ? {
                        role: "button",
                        "aria-pressed": value53,
                        "aria-label": value50 !== "" ? value50 : value52 ? value51 + ", " + text : value51
                      } : {},
                      className: (0, runtime2.joinClassNames)("absolute bottom-0 left-0 z-[35] flex items-end gap-2 pb-[5px] text-[13px] leading-[18px] select-none", value53 ? "font-medium text-app-accent" : "text-fg", value52 && section !== null && !value47 && "cursor-grab", value49 && "cursor-grabbing"),
                      style: {
                        minHeight: value36,
                        width: value29.width * scale / value54,
                        transform: "scale(" + String(value30 * value54) + ")",
                        transformOrigin: "left bottom"
                      },
                      onPointerDown: (input3) => {
                        if (!(value47 || section === null || section.id === GRID_PREVIEW_SLIDE_ID || callback5())) {
                          if (input3.shiftKey || input3.metaKey || input3.ctrlKey || input3.altKey) {
                            input3.stopPropagation();
                            return;
                          }
                          callback25(input3, section.id);
                        }
                      },
                      onClick: (event) => {
                        value47 || section === null || section.id === GRID_PREVIEW_SLIDE_ID || callback5() || callback6() || event.target.closest("button,input,textarea") || callback4(section.id, event);
                      },
                      onDoubleClick: (event) => {
                        event.stopPropagation(), !(!value52 || callback5() || callback32() || value47 || event.target.closest("button,input,textarea")) && callback40(input2.key, section?.id ?? null, value50);
                      },
                      children: [
                        value47 ? SlideGridJsx.jsx(runtime2.CommitTextInput, {
                          value: value3.text,
                          maxLength: runtime2.maxSectionDescriptionLength,
                          placeholder: text,
                          "aria-label": "描述" + value51,
                          selectOnOpen: !1,
                          className: "min-w-0 [--kit-rn-max-w:45rem] [--kit-rn-min-w:10rem]",
                          onChange: (input3) => value4({
                            ...value3,
                            text: input3
                          }),
                          onPointerDown: (input3) => input3.stopPropagation(),
                          onCommit: callback38,
                          onCancel: callback39
                        }) : section?.id === GRID_PREVIEW_SLIDE_ID ? SlideGridJsx.jsx("span", {
                          className: "max-w-[70%] shrink-0 truncate font-medium text-fg-muted italic",
                          children: (0, runtime2.formatMessage)({
                            defaultMessage: "新建章节",
                            id: "Yn5nz6tbdv"
                          })
                        }) : SlideGridJsx.jsx("span", {
                          className: (0, runtime2.joinClassNames)("max-w-[45rem] min-w-0 font-medium", value39 ? "line-clamp-2 break-words" : "truncate", value50 === "" && !value53 && "text-fg-secondary", value50 === "" && value52 && "cursor-text"),
                          title: value50 !== "" ? value50 : void 0,
                          onClick: value50 === "" && value52 ? (input3) => {
                            input3.shiftKey || input3.metaKey || input3.ctrlKey || input3.altKey || callback5() || callback6() || (input3.stopPropagation(), callback40(input2.key, section?.id ?? null, ""));
                          } : void 0,
                          children: value50 !== "" ? value50 : value52 ? text : value51
                        }),
                        value52 && section !== null && !value47 && value13 === null ? SlideGridJsx.jsx("span", {
                          "data-grid-chrome": "",
                          "data-kit": "strip-action",
                          className: "mb-[-1px] hidden shrink-0 items-center group-hover/label:flex pointer-coarse:flex",
                          onPointerDown: (input3) => input3.stopPropagation(),
                          onMouseDown: (event) => event.preventDefault(),
                          onDoubleClick: (input3) => input3.stopPropagation(),
                          children: SlideGridJsx.jsx(runtime2.Button, {
                            variant: "ghost",
                            size: "xxs",
                            iconOnly: !0,
                            tabIndex: -1,
                            icon: SlideGridJsx.jsx(runtime2.Icon, {
                              name: "Trash",
                              size: "xs"
                            }),
                            "aria-label": "移除章节",
                            tooltip: (0, runtime2.formatMessage)({
                              defaultMessage: "移除此章节，保留其中的幻灯片",
                              id: "4NCiR7gvCK"
                            }),
                            onClick: () => {
                              ref10.current?.focus({
                                preventScroll: !0
                              }), ref.current.onRemoveSection(section.id);
                            }
                          })
                        }) : null,
                        SlideGridJsx.jsx("span", {
                          "aria-hidden": "true",
                          className: (0, runtime2.joinClassNames)("mb-[8.5px] min-w-4 flex-1", value53 ? "h-0.5 bg-app-accent" : "h-px", !value53 && (value49 ? "bg-app-accent" : "bg-border-line group-hover/label:bg-border-strong"))
                        })
                      ]
                    })
                  }),
                  input2.ids.length === 0 ? SlideGridJsx.jsx("div", {
                    className: "absolute border-dashed border-border-strong",
                    style: {
                      left: 0,
                      top: input2.y,
                      width: GRID_SLIDE_WIDTH,
                      height: GRID_SLIDE_HEIGHT,
                      borderWidth: 2 * value30,
                      borderRadius: 6 * value30
                    },
                    children: GRID_SLIDE_WIDTH * scale >= 200 ? SlideGridJsx.jsx("div", {
                      "data-mc-chrome": "",
                      className: "absolute top-0 left-0 flex items-center justify-center text-[12px] text-fg-muted",
                      style: {
                        width: GRID_SLIDE_WIDTH * scale,
                        height: GRID_SLIDE_HEIGHT * scale,
                        transform: "scale(" + String(value30) + ")",
                        transformOrigin: "top left"
                      },
                      children: (0, runtime2.formatMessage)({
                        defaultMessage: "此章节为空，请将幻灯片拖到这里。",
                        id: "JZIB4IrM75"
                      })
                    }) : null
                  }) : null,
                  !readOnly && !value2 && value13 === null ? memo22.rows.filter((input3) => input3 === input2 || input3.continuation && input3.seg === input2.seg).flatMap((input3, options, items) => [
                    ...input3.ids.map((input4, options2) => ({
                      id: input4,
                      col: options2,
                      y: input3.y,
                      end: !1
                    })).filter(({ col }) => col > 0 || input3.continuation),
                    ...options === items.length - 1 && input3.ids.length > 0 ? [
                      {
                        id: input3.ids[input3.ids.length - 1],
                        col: input3.ids.length,
                        y: input3.y,
                        end: !0
                      }
                    ] : []
                  ]).map(({ id, col, y, end }) => SlideGridJsx.jsx("div", {
                    className: "group/split absolute z-[38]",
                    style: {
                      left: col * (GRID_SLIDE_WIDTH + GRID_COLUMN_GAP) - GRID_COLUMN_GAP,
                      top: y,
                      width: end ? GRID_COLUMN_GAP + GRID_SLIDE_WIDTH : GRID_COLUMN_GAP,
                      height: GRID_SLIDE_HEIGHT
                    },
                    onDoubleClick: (event) => {
                      event.target === event.currentTarget && !callback5() && !callback32() && callback13();
                    },
                    children: SlideGridJsx.jsx("div", {
                      "data-grid-chrome": "",
                      "data-kit": "gap-add",
                      className: (0, runtime2.joinClassNames)("absolute top-1/2 opacity-0 transition-opacity group-hover/split:opacity-100", !value33.fits && "pointer-fine:hidden", value33.fitsTouch ? "pointer-coarse:opacity-100" : "pointer-coarse:hidden"),
                      style: {
                        left: GRID_COLUMN_GAP / 2,
                        transform: "translate(-50%, -50%) scale(" + String(value30 * value34) + ")",
                        ...state
                      },
                      onPointerDown: (input3) => input3.stopPropagation(),
                      onMouseDown: (event) => event.preventDefault(),
                      children: SlideGridJsx.jsx(runtime2.Button, {
                        variant: "primary",
                        size: "xs",
                        iconOnly: !0,
                        tabIndex: -1,
                        icon: SlideGridJsx.jsx(runtime2.Icon, {
                          name: "Add",
                          size: "xs"
                        }),
                        "aria-label": "在此添加幻灯片",
                        tooltip: (0, runtime2.formatMessage)({
                          defaultMessage: "在此处新建幻灯片",
                          id: "DhP1S2co8Y"
                        }),
                        onClick: () => {
                          let value56 = end ? id : order[order.indexOf(id) - 1];
                          value56 !== void 0 && (onSelect(value56), ref.current.onAdd());
                        }
                      })
                    })
                  }, (end ? "end:" : "split:") + id)) : null
                ]
              }, input2.key);
            }),
            !readOnly && !value2 && value13 === null && memo22.rows.length > 0 ? SlideGridJsx.jsx("div", {
              className: "group/end absolute z-[38]",
              style: {
                left: 0,
                top: memo22.height + GRID_ROW_GAP * 0.2,
                width: memo22.width,
                height: GRID_ROW_GAP * 0.8
              },
              onDoubleClick: (event) => {
                event.target === event.currentTarget && !callback5() && !callback32() && callback13();
              },
              children: SlideGridJsx.jsxs("div", {
                className: "pointer-events-none absolute flex items-center gap-2 opacity-0 transition-opacity group-hover/end:opacity-100 pointer-coarse:opacity-100",
                style: {
                  left: value43,
                  bottom: value37 * value38 * value30,
                  width: (memo22.width - value43) * scale / value38,
                  height: value36,
                  transform: "scale(" + String(value30 * value38) + ")",
                  transformOrigin: "left bottom"
                },
                children: [
                  SlideGridJsx.jsx("span", {
                    "data-grid-chrome": "",
                    "data-kit": "strip-action",
                    className: "pointer-events-auto flex",
                    onPointerDown: (input2) => input2.stopPropagation(),
                    onMouseDown: (event) => event.preventDefault(),
                    children: SlideGridJsx.jsx(runtime2.Button, {
                      variant: "primary",
                      size: "xs",
                      iconOnly: !0,
                      tabIndex: -1,
                      icon: SlideGridJsx.jsx(runtime2.Icon, {
                        name: "Add",
                        size: "xs"
                      }),
                      "aria-label": "在此添加章节",
                      tooltip: (0, runtime2.formatMessage)({
                        defaultMessage: "在此处新建章节",
                        id: "wfKeB41+Zh"
                      }),
                      disabled: value28,
                      disabledReason: SECTION_LIMIT_MESSAGE,
                      onClick: callback42
                    })
                  }),
                  SlideGridJsx.jsx("span", {
                    "aria-hidden": "true",
                    className: "h-px min-w-4 flex-1 bg-border-line"
                  })
                ]
              })
            }) : null,
            value13?.kind === "row" && memo42 ? value29.rows.filter((input2) => input2.section !== null && memo8.has(input2.section.id)).map((input2) => SlideGridJsx.jsx("div", {
              className: "pointer-events-none absolute border-dashed border-app-accent/70 bg-app-accent/5",
              style: {
                left: 0,
                top: input2.y,
                width: Math.max(1, input2.ids.length) * (GRID_SLIDE_WIDTH + GRID_COLUMN_GAP) - GRID_COLUMN_GAP,
                height: GRID_SLIDE_HEIGHT,
                borderWidth: 2 * value30,
                borderRadius: 6 * value30
              }
            }, "slot:" + input2.key)) : null,
            value13?.kind === "tile" && memo42 ? value13.ids.map((input2) => {
              let entry = memo5.get(value13.copy ? copiedGridSlideKey(input2) : input2);
              return entry ? SlideGridJsx.jsx("div", {
                className: "pointer-events-none absolute border-dashed border-app-accent/70 bg-app-accent/5",
                style: {
                  left: entry.x,
                  top: entry.y,
                  width: GRID_SLIDE_WIDTH,
                  height: GRID_SLIDE_HEIGHT,
                  borderWidth: 2 * value30,
                  borderRadius: 6 * value30
                }
              }, "slot:" + input2) : null;
            }) : null,
            memo22.tiles.flatMap((input2) => (memo7.has(input2.id) ? [!1, !0] : [!1]).map((input3) => {
              let value47 = slides[input2.id];
              if (!value47)
                return null;
              let value48 = input2.id === behind, value49 = value6.slides.includes(input2.id), value50 = value45 ? input3 : memo6.has(input2.id), value51 = value50 && input2.id !== value44 && value46 ? Math.min(3, value13.ids.filter((input4) => input4 !== value44).indexOf(input2.id) + 1) : 0, value52 = value51 > 0 && value46 ? value46 : input2, value53 = value13?.kind === "row" && memo8.has(memo4[input2.seg]?.section?.id ?? ""), value54 = value53 ? input2 : memo5.get(input2.id) ?? input2, value55 = value50 ? value13.dx + value51 * 28 * value30 : value53 ? value13.dx : 0, value56 = value50 ? value13.dy + value51 * 28 * value30 : value53 ? value13.dy : 0, value57 = (0, runtime2.slideDisplayLabel)(value47) ?? "", value58 = value47.skipped === !0, value59 = ref17.current?.tile === input2.id, value60 = value5 ? (value47.notes ?? "").trim() : "", state2 = {
                onPointerDown: (input4) => {
                  callback5() || callback24(input4, input2.id);
                },
                onClick: (input4) => {
                  !callback5() && !callback6() && callback3(input2.id, input4);
                },
                onContextMenu: (event) => {
                  event.preventDefault(), !ref26.current?.moved && (value6.slides.includes(input2.id) ? input2.id !== currentId && onSelect(input2.id) : callback(input2.id), value18({
                    x: event.clientX,
                    y: event.clientY,
                    id: input2.id
                  }));
                }
              };
              return SlideGridJsx.jsxs("div", {
                "data-grid-tile": input3 ? void 0 : input2.id,
                "aria-hidden": input3 || void 0,
                className: (0, runtime2.joinClassNames)("group/tile absolute", input3 && "pointer-events-none", value50 || value53 ? value51 > 0 ? "z-[39] opacity-80" : "z-40 opacity-80" : value13 !== null && "transition-[left,top] duration-150 ease-out"),
                style: {
                  left: (value50 ? value52.x : value54.x) + value55,
                  top: (value50 ? value52.y : value54.y) + value56,
                  width: GRID_SLIDE_WIDTH,
                  height: GRID_SLIDE_HEIGHT
                },
                children: [
                  value50 && input2.id === value44 && (memo6.size > 1 || value45) ? SlideGridJsx.jsx("div", {
                    "data-mc-chrome": "",
                    "data-testid": value45 ? "grid-copy-badge" : void 0,
                    className: "pointer-events-none absolute top-0 right-0 z-50 flex h-6 min-w-6 items-center justify-center rounded-full bg-app-accent px-1.5 text-xs font-medium text-white",
                    style: {
                      transform: "translate(40%, -40%) scale(" + String(value30) + ")",
                      transformOrigin: "center"
                    },
                    children: (value45 ? "+" : "") + (memo6.size > 1 ? String(memo6.size) : "")
                  }) : null,
                  value32 ? SlideGridJsx.jsxs("div", {
                    "data-mc-chrome": "",
                    className: (0, runtime2.joinClassNames)("absolute bottom-full left-0 z-30 flex items-center gap-1 text-xs select-none", value49 ? "font-medium text-app-accent" : "text-fg-muted group-hover/tile:text-fg-secondary", (value50 || value53 || value59) && "invisible"),
                    style: {
                      height: GRID_LABEL_HEIGHT,
                      transform: "scale(" + String(value30) + ")",
                      transformOrigin: "left bottom"
                    },
                    children: [
                      value54.n,
                      input2.id === coverId ? SlideGridJsx.jsx(runtime2.ThumbnailIndicator, {}) : null
                    ]
                  }) : null,
                  value48 ? null : SlideGridJsx.jsxs("div", {
                    className: (0, runtime2.joinClassNames)("absolute inset-0 overflow-hidden bg-panel", value50 && "opacity-90"),
                    style: {
                      borderRadius: value59 ? 0 : 6 * Math.min(value30, 6),
                      boxShadow: value50 ? "0 " + String(8 * value30) + "px " + String(24 * value30) + "px rgb(0 0 0 / 0.18)" : "0 0 0 " + String(value30) + "px var(--t-border), 0 " + String(value30) + "px " + String(2 * value30) + "px rgb(0 0 0 / 0.05)",
                      outline: value49 && !value59 ? String(3 * value30) + "px solid var(--cds-fill-accent)" : void 0,
                      outlineOffset: 2 * value30
                    },
                    children: [
                      SlideGridJsx.jsx("div", {
                        "data-grid-surface": "",
                        className: (0, runtime2.joinClassNames)("absolute inset-0 pointer-coarse:[&_*]:[backdrop-filter:none]! pointer-coarse:[&_*]:[-webkit-backdrop-filter:none]!", input.commenting === !0 ? "pointer-events-auto" : "pointer-events-none", value58 && !value59 && "opacity-40"),
                        style: void 0,
                        "aria-hidden": "true",
                        children: SlideGridJsx.jsx(GridSlideThumbnail, {
                          slide: value47,
                          assets,
                          readOnly
                        })
                      }),
                      SlideGridJsx.jsx("div", {
                        role: "button",
                        "aria-label": "幻灯片 " + String(input2.n) + (input2.id === coverId ? "（封面缩略图）" : "") + (value57 !== "" ? ": " + value57 : "") + (0, runtime2.formatOpenCommentCount)(commentCounts?.get(input2.id) ?? 0),
                        "aria-current": input2.id === currentId ? "true" : void 0,
                        "aria-pressed": value49,
                        "aria-description": value60 !== "" ? (0, runtime2.truncateUtf16Safely)(value60, 200) + (value60.length > 200 ? "…" : "") : void 0,
                        className: (0, runtime2.joinClassNames)("absolute inset-0 select-none", readOnly ? "cursor-default" : "cursor-grab", value50 && "cursor-grabbing", !value49 && !value59 && "hover:shadow-[inset_0_0_0_calc(1px*var(--inv))_var(--t-border-strong)]"),
                        style: {
                          "--inv": String(value30)
                        },
                        ...state2,
                        onDoubleClick: (input4) => {
                          input4.stopPropagation();
                          let bounds = input4.currentTarget.getBoundingClientRect();
                          !callback5() && !callback32() && onOpen(input2.id, {
                            fx: (input4.clientX - bounds.left) / bounds.width,
                            fy: (input4.clientY - bounds.top) / bounds.height
                          });
                        }
                      }),
                      GRID_SLIDE_WIDTH * scale >= 56 && value13 === null && !value59 ? SlideGridJsx.jsx(runtime2.SlideCommentCountBadge, {
                        count: commentCounts?.get(input2.id) ?? 0,
                        className: "absolute",
                        style: {
                          left: 4 * value30,
                          bottom: 4 * value30,
                          transform: "scale(" + String(value30) + ")",
                          transformOrigin: "left bottom"
                        }
                      }) : null,
                      value58 && value13 === null && !value59 ? SlideGridJsx.jsx(runtime2.SkippedSlideBadge, {
                        why: readOnly ? runtime2.READ_ONLY_PRESENTATION_MESSAGE : heldSlide?.(input2.id) !== void 0 ? runtime2.HELD_SLIDE_MESSAGE : void 0,
                        onUnskip: () => input.onToggleSkip(input2.id),
                        style: {
                          transform: "scale(" + String(value30) + ")",
                          transformOrigin: "right bottom"
                        }
                      }) : null,
                      GRID_SLIDE_WIDTH * scale >= (value58 ? 96 : 56) && value13 === null && !value59 ? SlideGridJsx.jsx(runtime2.ThumbnailActionsButton, {
                        label: "幻灯片 " + String(value54.n) + "操作",
                        current: input2.id === currentId && input.commenting !== !0,
                        expanded: value17?.id === input2.id,
                        skipped: value58,
                        inv: value30,
                        className: (0, runtime2.joinClassNames)(input.commenting === !0 ? "hidden" : value17?.id === input2.id || value19 && input2.id === currentId ? "flex" : "hidden pointer-fine:group-hover/tile:flex", value49 && input.commenting !== !0 && "pointer-coarse:flex"),
                        onMouseDown: (event) => event.preventDefault(),
                        onOpen: (input4, options) => {
                          onSelect(input2.id), value18({
                            x: input4.left + input4.width / 2,
                            y: input4.top + input4.height / 2,
                            id: input2.id,
                            tap: !0,
                            keyboard: options
                          });
                        }
                      }) : null
                    ]
                  }),
                  value60 !== "" ? SlideGridJsx.jsx("div", {
                    "data-mc-chrome": "",
                    "aria-hidden": "true",
                    dir: "auto",
                    title: value60,
                    className: (0, runtime2.joinClassNames)("absolute top-full left-0 overflow-hidden text-[13px] whitespace-pre-wrap text-fg-muted select-none", readOnly ? "cursor-default" : "cursor-grab", (value50 || value53 || value59 || value48) && "invisible"),
                    style: {
                      width: Math.min(GRID_SLIDE_WIDTH * scale, 720) / value42,
                      paddingTop: GRID_TILE_CORNER_RADIUS,
                      lineHeight: String(GRID_LABEL_FONT_SIZE) + "px",
                      transform: "scale(" + String(value30 * value42) + ")",
                      transformOrigin: "top left",
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: value41
                    },
                    ...state2,
                    onDoubleClick: (input4) => {
                      input4.stopPropagation(), !callback5() && !callback32() && onOpen(input2.id);
                    },
                    children: value60
                  }) : null
                ]
              }, input3 ? copiedGridSlideKey(input2.id) : input2.id);
            })),
            input.peerLayer?.(value30, memo9)
          ]
        }),
        value15 ? SlideGridJsx.jsx("div", {
          "data-grid-marquee": "",
          "aria-hidden": "true",
          className: "pointer-events-none absolute z-30 bg-accent-muted outline-1 -outline-offset-1 outline-fill-accent",
          style: {
            left: value15.x,
            top: value15.y,
            width: value15.w,
            height: value15.h
          }
        }) : null,
        input.commentLayer?.(ref10),
        order.length === 0 ? SlideGridJsx.jsx("p", {
          className: "absolute inset-0 flex items-center justify-center text-sm text-fg-muted",
          children: (0, runtime2.formatMessage)({
            defaultMessage: "还没有幻灯片。",
            id: "x/zXxbPpql"
          })
        }) : null,
        SlideGridJsx.jsx(runtime2.ContextMenuPopup, {
          at: value17 && value21 ? value17 : null,
          anchor: value17?.tap ? "tap" : "point",
          "aria-label": value21 ? value22.length > 1 ? "操作：" + String(value22.length) + " 页幻灯片" : "幻灯片 " + String(value21.n) + "操作" : void 0,
          focusFirstItem: value17?.keyboard === !0,
          onClose: callback34,
          children: value17 && value21 ? SlideGridJsx.jsx(runtime2.SlideContextMenu, {
            id: value17.id,
            index: value21.n - 1,
            count: order.length,
            skipped: slides[value17.id]?.skipped === !0,
            isCover: value17.id === coverId,
            readOnly,
            heldSlide,
            via: callback37,
            group: value22.length > 1 ? {
              ids: value22,
              allSkipped: value22.every((input2) => slides[input2]?.skipped === !0),
              onDuplicate: input.onDuplicateSlides,
              onCopy: input.onCopySlides,
              onDelete: input.onDeleteSlides,
              onSetSkipped: input.onSetSlidesSkipped,
              moveReason: runtime2.MOVE_SEVERAL_SLIDES_REASON
            } : void 0,
            onNewSection: () => input.onSectionFromSlides(value22),
            newSectionDisabledReason: value24 ? value23.section === null ? value22.length > 1 ? "这些幻灯片已组成第 1 章" : "此页已组成第 1 章" : value22.length > 1 ? (0, runtime2.formatMessage)({
              defaultMessage: "这些幻灯片已经单独组成一个章节",
              id: "s8zbEln7f/"
            }) : (0, runtime2.formatMessage)({
              defaultMessage: "此页已经单独组成一个章节",
              id: "OcxZgXMww3"
            }) : value26 ? SECTION_LIMIT_MESSAGE : void 0,
            onDuplicate: input.onDuplicate,
            onCopy: input.onCopy,
            onDelete: input.onDelete,
            onToggleSkip: input.onToggleSkip,
            onSetCover: input.onSetCover,
            onCopyLink: input.onCopyLink,
            onAdd: input.onAdd,
            onMove: input.onMove
          }) : null
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "GRID_SLIDE_WIDTH", () => GRID_SLIDE_WIDTH, (value) => {
    GRID_SLIDE_WIDTH = value;
  }), bindRuntimeValue(runtime2, "GRID_SLIDE_HEIGHT", () => GRID_SLIDE_HEIGHT, (value) => {
    GRID_SLIDE_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "GRID_COLUMN_GAP", () => GRID_COLUMN_GAP, (value) => {
    GRID_COLUMN_GAP = value;
  }), bindRuntimeValue(runtime2, "GRID_ROW_GAP", () => GRID_ROW_GAP, (value) => {
    GRID_ROW_GAP = value;
  }), bindRuntimeValue(runtime2, "GRID_MAX_COLUMNS", () => GRID_MAX_COLUMNS, (value) => {
    GRID_MAX_COLUMNS = value;
  }), bindRuntimeValue(runtime2, "GRID_NOTES_HEIGHT", () => GRID_NOTES_HEIGHT, (value) => {
    GRID_NOTES_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "calculateGridAddButtonSize", () => calculateGridAddButtonSize), bindRuntimeValue(runtime2, "buildSlideGridLayout", () => buildSlideGridLayout), bindRuntimeValue(runtime2, "hitTestSlideGridDrop", () => hitTestSlideGridDrop), bindRuntimeValue(runtime2, "findSlideGridRow", () => findSlideGridRow), bindRuntimeValue(runtime2, "hitTestSlideGridSectionDrop", () => hitTestSlideGridSectionDrop), bindRuntimeValue(runtime2, "resolveSlideGridMoveTarget", () => resolveSlideGridMoveTarget), bindRuntimeValue(runtime2, "SlideGridJsx", () => SlideGridJsx, (value) => {
    SlideGridJsx = value;
  }), bindRuntimeValue(runtime2, "GRID_LABEL_HEIGHT", () => GRID_LABEL_HEIGHT, (value) => {
    GRID_LABEL_HEIGHT = value;
  }), bindRuntimeValue(runtime2, "GRID_TILE_CORNER_RADIUS", () => GRID_TILE_CORNER_RADIUS, (value) => {
    GRID_TILE_CORNER_RADIUS = value;
  }), bindRuntimeValue(runtime2, "GRID_LABEL_FONT_SIZE", () => GRID_LABEL_FONT_SIZE, (value) => {
    GRID_LABEL_FONT_SIZE = value;
  }), bindRuntimeValue(runtime2, "GRID_TOUCH_LABEL_FONT_SIZE", () => GRID_TOUCH_LABEL_FONT_SIZE, (value) => {
    GRID_TOUCH_LABEL_FONT_SIZE = value;
  }), bindRuntimeValue(runtime2, "GRID_SELECTION_OUTSET", () => GRID_SELECTION_OUTSET, (value) => {
    GRID_SELECTION_OUTSET = value;
  }), bindRuntimeValue(runtime2, "GRID_CHROME_GAP", () => GRID_CHROME_GAP, (value) => {
    GRID_CHROME_GAP = value;
  }), bindRuntimeValue(runtime2, "GRID_TOUCH_CHROME_SIZE", () => GRID_TOUCH_CHROME_SIZE, (value) => {
    GRID_TOUCH_CHROME_SIZE = value;
  }), bindRuntimeValue(runtime2, "EMPTY_GRID_SELECTION_SET", () => EMPTY_GRID_SELECTION_SET, (value) => {
    EMPTY_GRID_SELECTION_SET = value;
  }), bindRuntimeValue(runtime2, "copiedGridSlideKey", () => copiedGridSlideKey, (value) => {
    copiedGridSlideKey = value;
  }), bindRuntimeValue(runtime2, "GRID_DRAG_THRESHOLD_PX", () => GRID_DRAG_THRESHOLD_PX, (value) => {
    GRID_DRAG_THRESHOLD_PX = value;
  }), bindRuntimeValue(runtime2, "GRID_WHEEL_PAN_FACTOR", () => GRID_WHEEL_PAN_FACTOR, (value) => {
    GRID_WHEEL_PAN_FACTOR = value;
  }), bindRuntimeValue(runtime2, "GRID_ZOOM_ANIMATION_MS", () => GRID_ZOOM_ANIMATION_MS, (value) => {
    GRID_ZOOM_ANIMATION_MS = value;
  }), bindRuntimeValue(runtime2, "scrollOffsetToExposeRange", () => scrollOffsetToExposeRange), bindRuntimeValue(runtime2, "panGridViewToSlide", () => panGridViewToSlide), bindRuntimeValue(runtime2, "panGridViewToPoint", () => panGridViewToPoint), bindRuntimeValue(runtime2, "zoomGridViewToSlidePoint", () => zoomGridViewToSlidePoint), bindRuntimeValue(runtime2, "gridTileScreenRect", () => gridTileScreenRect), bindRuntimeValue(runtime2, "interpolateGridViewport", () => interpolateGridViewport), bindRuntimeValue(runtime2, "gridOriginScreenRect", () => gridOriginScreenRect), bindRuntimeValue(runtime2, "gridViewportFromTileRect", () => gridViewportFromTileRect), bindRuntimeValue(runtime2, "MIN_FOCUSED_GRID_SLIDE_WIDTH", () => MIN_FOCUSED_GRID_SLIDE_WIDTH, (value) => {
    MIN_FOCUSED_GRID_SLIDE_WIDTH = value;
  }), bindRuntimeValue(runtime2, "FOCUSED_GRID_SLIDE_SIDE_PADDING", () => FOCUSED_GRID_SLIDE_SIDE_PADDING, (value) => {
    FOCUSED_GRID_SLIDE_SIDE_PADDING = value;
  }), bindRuntimeValue(runtime2, "GRID_RECT_SELECTION_THRESHOLD_PX", () => GRID_RECT_SELECTION_THRESHOLD_PX, (value) => {
    GRID_RECT_SELECTION_THRESHOLD_PX = value;
  }), bindRuntimeValue(runtime2, "GRID_PREVIEW_SLIDE_ID", () => GRID_PREVIEW_SLIDE_ID, (value) => {
    GRID_PREVIEW_SLIDE_ID = value;
  }), bindRuntimeValue(runtime2, "GRID_INTERACTIVE_TARGET_SELECTOR", () => GRID_INTERACTIVE_TARGET_SELECTOR, (value) => {
    GRID_INTERACTIVE_TARGET_SELECTOR = value;
  }), bindRuntimeValue(runtime2, "canStartGridRectSelection", () => canStartGridRectSelection), bindRuntimeValue(runtime2, "collectGridTilesInRect", () => collectGridTilesInRect), bindRuntimeValue(runtime2, "hitTestGridTile", () => hitTestGridTile), bindRuntimeValue(runtime2, "extendGridSelection", () => extendGridSelection), bindRuntimeValue(runtime2, "GridSlideThumbnail", () => GridSlideThumbnail, (value) => {
    GridSlideThumbnail = value;
  }), bindRuntimeValue(runtime2, "SlideGrid", () => SlideGrid), () => {
    (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeSections)(), (0, runtime2.initializeSlideRenderer)(), (0, runtime2.initializeSlideModel)(), GRID_SLIDE_WIDTH = runtime2.SLIDE_WIDTH, GRID_SLIDE_HEIGHT = runtime2.SLIDE_HEIGHT, GRID_COLUMN_GAP = 160, GRID_ROW_GAP = 480, GRID_MAX_COLUMNS = 6, GRID_NOTES_HEIGHT = 440, SlideGridJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), SECTION_LIMIT_MESSAGE = (0, runtime2.formatMessage)({
      defaultMessage: "此演示文稿的章节数已达上限",
      id: "JWcg6XPPpg"
    }), GRID_LABEL_HEIGHT = 22, GRID_TILE_CORNER_RADIUS = 8, GRID_LABEL_FONT_SIZE = 18, GRID_TOUCH_LABEL_FONT_SIZE = 28, GRID_SELECTION_OUTSET = 20, GRID_CHROME_GAP = 6, GRID_TOUCH_CHROME_SIZE = 32, EMPTY_GRID_SELECTION_SET = /* @__PURE__ */ new Set(), copiedGridSlideKey = (input) => "copy:" + input, GRID_DRAG_THRESHOLD_PX = 4, GRID_WHEEL_PAN_FACTOR = 1, GRID_ZOOM_ANIMATION_MS = 250, MIN_FOCUSED_GRID_SLIDE_WIDTH = 420, FOCUSED_GRID_SLIDE_SIDE_PADDING = 24, GRID_RECT_SELECTION_THRESHOLD_PX = 5, GRID_PREVIEW_SLIDE_ID = "__preview__", GRID_INTERACTIVE_TARGET_SELECTOR = "[data-grid-tile],[data-grid-label],[data-grid-chrome],button,input", GridSlideThumbnail = runtime2.ReactGridMemo.memo(function({ slide, assets, readOnly }) {
      return SlideGridJsx.jsx(runtime2.SlideSurface, {
        slide,
        assets,
        animate: !1,
        editorChrome: !readOnly
      });
    });
  };
}
export {
  installEditorSlideGrid
};
