// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorMediaCropOverlay(runtime2) {
  var reactqY, jsxR4, CROP_CORNER_HANDLES, CROP_ALL_HANDLES, CROP_HANDLE_LABELS, CROP_CORNER_LABELS, CROP_HANDLE_CURSORS, CROP_CHANGE_EPSILON, CROP_HANDLE_SIZE, CROP_HANDLE_VISUAL_SIZE, CROP_HANDLE_BORDER_WIDTH, CROP_TOUCH_HANDLE_SIZE, CROP_DRAG_OPACITY, CROP_ZOOM_STEP, CROP_ARROW_DELTAS;
  function blurCropEditingTarget() {
    let activeElement2 = document.activeElement;
    !(activeElement2 instanceof HTMLElement) || activeElement2.closest("[data-media-crop-keep]") || (activeElement2.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(activeElement2.tagName) || activeElement2.closest('button, a[href], [role="button"]')) && activeElement2.blur();
  }
  function MediaCropOverlay({ frame, natural, crop, scale, rotation = 0, src, zoomDisabledReason, onLive, onDone, onGesture, onFrame, frameHandleOff, minFrame = 0, snapFrame, onSideStart }) {
    let ref = reactqY.useRef({
      frame,
      natural,
      crop,
      scale,
      rotation,
      zoomDisabledReason,
      onLive,
      onDone,
      onGesture,
      onFrame
    });
    ref.current = {
      frame,
      natural,
      crop,
      scale,
      rotation,
      zoomDisabledReason,
      onLive,
      onDone,
      onGesture,
      onFrame
    };
    let ref2 = reactqY.useRef(null), ref3 = reactqY.useRef(null), ref4 = reactqY.useRef({
      x: 0,
      y: 0
    }), ref5 = reactqY.useRef(!1), [value, value2] = reactqY.useState(!1), [value3, value4] = reactqY.useState(!1), callback = (input, options) => {
      let current = ref.current;
      options && current.onFrame ? (ref4.current = {
        x: options.x,
        y: options.y
      }, current.onFrame({
        crop: input,
        frame: options
      })) : (0, runtime2.imageCropsEqual)(input, current.crop) || current.onLive(input);
    }, callback2 = (input) => {
      let current = ref3.current;
      current && (ref3.current = null, current.el.hasPointerCapture(current.pid) && current.el.releasePointerCapture(current.pid), input && callback(current.start, current.drag.of === "side" ? {
        ...current.base,
        ...current.frame
      } : void 0), value2(!1), ref.current.onGesture?.(!1));
    };
    reactqY.useEffect(() => {
      let current = ref.current;
      (0, runtime2.announceLiveMessage)("Cropping. Press Enter when done. " + (current.onFrame ? "Drag an edge to crop. " : "") + "Arrow keys move the picture." + (current.zoomDisabledReason === void 0 ? " Plus and minus zoom it." : ""));
      let callback8 = (event) => {
        let current3 = ref.current, target = event.target;
        if (ref5.current || target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) || (event.key === "Enter" || event.key === " ") && target instanceof Element && target.closest('button, a[href], [role="button"]'))
          return;
        let value17 = (event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y"), value18 = !event.metaKey && !event.ctrlKey && !event.altKey ? event.key === "+" || event.key === "=" ? CROP_ZOOM_STEP : event.key === "-" || event.key === "_" ? 1 / CROP_ZOOM_STEP : 0 : 0, value19 = !event.metaKey && !event.ctrlKey && !event.altKey ? CROP_ARROW_DELTAS[event.key] : void 0;
        if (event.key !== "Escape" && event.key !== "Enter" && !value17 && value18 === 0 && value19 === void 0) {
          !(event.key === " " || event.key === "Tab" || (event.metaKey || event.ctrlKey) && /^[-=+01]$/.test(event.key)) && !/^(Shift|Control|Alt|AltGraph|Meta|OS|Hyper|Super|Fn|FnLock|Symbol|SymbolLock|CapsLock|NumLock|ScrollLock|Dead|Process|Unidentified)$/.test(event.key) && !ref3.current && current3.onDone(!0);
          return;
        }
        if (event.preventDefault(), event.stopImmediatePropagation(), ref3.current)
          return event.key === "Escape" ? callback2(!0) : void 0;
        if (value19) {
          let value20 = (event.shiftKey ? 10 : 1) / current3.scale;
          callback((0, runtime2.panImageCrop)(current3.frame, current3.natural, current3.crop, value19[0] * value20, value19[1] * value20));
        } else
          value18 !== 0 ? current3.zoomDisabledReason === void 0 ? callback((0, runtime2.zoomImageCrop)(current3.frame, current3.natural, current3.crop, value18)) : (0, runtime2.announceLiveMessage)(current3.zoomDisabledReason) : value17 ? event.key.toLowerCase() === "z" && !event.shiftKey && current3.onDone(!1) : current3.onDone(!0);
      }, callback9 = (event) => {
        let value17 = event.target instanceof Element ? event.target : null;
        ref5.current || event.button === 0 && !ref2.current?.contains(value17) && !value17?.closest("[data-media-crop-keep]") && ref.current.onDone(!0);
      }, callback10 = (input, options, context) => {
        let current3 = ref.current, current4 = ref2.current;
        if (!current4 || ref3.current || ref5.current)
          return;
        let bounds = current4.getBoundingClientRect(), [items5, items6] = [
          (input - (bounds.left + bounds.width / 2)) / current3.scale,
          (options - (bounds.top + bounds.height / 2)) / current3.scale
        ], [items7, items8] = [
          Math.cos(-current3.rotation),
          Math.sin(-current3.rotation)
        ], state6 = {
          x: current3.frame.w / 2 + items5 * items7 - items6 * items8,
          y: current3.frame.h / 2 + items5 * items8 + items6 * items7
        }, value17 = (0, runtime2.zoomImageCrop)(current3.frame, current3.natural, current3.crop, Math.min(2, Math.max(0.5, context)), state6);
        (0, runtime2.imageCropsEqual)(value17, current3.crop) || current3.onLive(value17);
      }, [items3, items4] = [0, 0], callback11 = (event) => (event.preventDefault(), event.stopPropagation()), callback12 = (input) => {
        !(input.ctrlKey || input.metaKey) || ref.current.zoomDisabledReason !== void 0 || (callback11(input), items3 !== 0 && Date.now() - items4 > 1e3 && (items3 = 0), items3 === 0 && callback10(input.clientX, input.clientY, Math.exp(-input.deltaY * CROP_CHANGE_EPSILON)));
      }, callback13 = () => ref.current.zoomDisabledReason !== void 0, callback14 = (input) => void (callback13() || (callback11(input), [items3, items4] = [1, Date.now()])), callback15 = (input) => {
        if (callback13())
          return;
        callback11(input);
        let value17 = input;
        items3 === 0 || !(typeof value17.scale == "number" && value17.scale > 0) || (callback10(value17.clientX ?? 0, value17.clientY ?? 0, value17.scale / items3), [items3, items4] = [value17.scale, Date.now()]);
      }, callback16 = (input) => void (callback13() || (callback11(input), items3 = 0)), current2 = ref2.current;
      return window.addEventListener("keydown", callback8, !0), window.addEventListener("pointerdown", callback9, !0), current2?.addEventListener("wheel", callback12, {
        passive: !1
      }), current2?.addEventListener("gesturestart", callback14), current2?.addEventListener("gesturechange", callback15), current2?.addEventListener("gestureend", callback16), () => {
        window.removeEventListener("keydown", callback8, !0), window.removeEventListener("pointerdown", callback9, !0), current2?.removeEventListener("wheel", callback12), current2?.removeEventListener("gesturestart", callback14), current2?.removeEventListener("gesturechange", callback15), current2?.removeEventListener("gestureend", callback16), callback2(!1);
      };
    }, []);
    let callback3 = (event, options) => {
      if (!(event.button !== 0 || ref3.current)) {
        event.preventDefault(), event.stopPropagation();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
        }
        ref3.current = {
          pid: event.pointerId,
          el: event.currentTarget,
          sx: event.clientX,
          sy: event.clientY,
          start: ref.current.crop,
          frame: {
            w: frame.w,
            h: frame.h
          },
          base: {
            ...ref4.current
          },
          drag: options
        }, value2(!0), onGesture?.(!0);
      }
    }, callback4 = (input) => {
      let current = ref3.current;
      if (!current || input.pointerId !== current.pid)
        return;
      let [items3, items4] = [
        (input.clientX - current.sx) / scale,
        (input.clientY - current.sy) / scale
      ], [items5, items6] = [
        Math.cos(-rotation),
        Math.sin(-rotation)
      ], [items7, items8] = [
        items3 * items5 - items4 * items6,
        items3 * items6 + items4 * items5
      ];
      if (current.drag.of === "side") {
        let value17 = (0, runtime2.resizeCropViewport)(current.frame, natural, current.start, current.drag.side, items7, items8, Math.max(CROP_HANDLE_SIZE / scale, minFrame)), state6 = {
          x: current.base.x + value17.frame.x,
          y: current.base.y + value17.frame.y,
          w: value17.frame.w,
          h: value17.frame.h
        }, value18 = snapFrame ? snapFrame(state6) : state6, value19 = snapFrame ? (0, runtime2.cropImageToRect)(current.frame, natural, current.start, {
          x: value18.x - current.base.x,
          y: value18.y - current.base.y,
          w: value18.w,
          h: value18.h
        }) : value17.crop;
        (zoomDisabledReason === void 0 || value19.zoom <= Math.max(1, current.start.zoom) + 1e-3) && callback(value19, value18);
      } else
        callback(current.drag.of === "media" ? (0, runtime2.panImageCrop)(current.frame, natural, current.start, items7, items8) : (0, runtime2.resizeImageCropFromCorner)(current.frame, natural, current.start, current.drag.corner, items7, items8));
    }, callback5 = (input, options) => ({
      onPointerDown: (input2) => void (input2.button === 0 && (options?.(), callback3(input2, input))),
      onPointerMove: callback4,
      onPointerUp: (input2) => ref3.current?.pid === input2.pointerId && callback2(!1),
      onPointerCancel: (input2) => ref3.current?.pid === input2.pointerId && callback2(!0),
      onLostPointerCapture: (input2) => {
        if (ref3.current?.pid === input2.pointerId) {
          if (input2.buttons === 0)
            return callback2(!1);
          try {
            input2.currentTarget.setPointerCapture(input2.pointerId);
          } catch {
            callback2(!1);
          }
        }
      }
    }), callback6 = (input) => {
      let value17 = callback5({
        of: "side",
        side: input
      }, () => value4(!1));
      return {
        ...value17,
        onPointerDown: (input2) => {
          if (input2.button !== 0 || !onSideStart?.(input, input2))
            return value17.onPointerDown(input2);
          value4(!1), ref5.current = !0;
          let pointerId = input2.pointerId, callback8 = () => {
            ref5.current = !1, window.removeEventListener("pointerup", callback9, !0), window.removeEventListener("pointercancel", callback9, !0), window.removeEventListener("blur", callback8);
          }, callback9 = (input3) => void (input3.pointerId === pointerId && callback8());
          window.addEventListener("pointerup", callback9, !0), window.addEventListener("pointercancel", callback9, !0), window.addEventListener("blur", callback8);
        }
      };
    }, callback7 = (input) => ({
      onPointerDown: (event) => (event.preventDefault(), event.stopPropagation(), (0, runtime2.announceLiveMessage)(input))
    }), value5 = (0, runtime2.imageCropRect)(frame, natural, crop), value6 = typeof matchMedia == "function" && matchMedia("(pointer: coarse)").matches, value7 = (value6 ? runtime2.SELECTION_POINT_METRICS.gripHitTouch : runtime2.SELECTION_POINT_METRICS.grip + 4) / scale, value8 = runtime2.SELECTION_POINT_METRICS.grip / scale, value9 = (value6 ? runtime2.SELECTION_POINT_METRICS.gripHitTouch : 20) / scale, value10 = zoomDisabledReason !== void 0, value11 = onFrame !== void 0, [items, items2] = [
      CROP_HANDLE_VISUAL_SIZE / scale,
      CROP_HANDLE_BORDER_WIDTH / scale
    ], state = {
      position: "absolute",
      background: "var(--t-app-accent)",
      boxShadow: "0 0 0 " + String(1 / scale) + "px #fff",
      borderRadius: items2 / 2
    }, state2 = {
      ...state,
      boxShadow: void 0
    }, state3 = {
      ...state,
      background: "#fff"
    }, [value12, value13, value14, value15] = [
      -value5.x,
      -value5.y,
      -value5.x + frame.w,
      -value5.y + frame.h
    ].map((input) => String(input) + "px"), value16 = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${value12} ${value13}, ${value12} ${value15}, ${value14} ${value15}, ${value14} ${value13}, ${value12} ${value13})`, state4 = {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      opacity: CROP_DRAG_OPACITY,
      pointerEvents: "none",
      userSelect: "none",
      clipPath: value16
    }, state5 = {
      position: "absolute",
      cursor: value ? "grabbing" : "grab",
      touchAction: "none",
      pointerEvents: "auto"
    };
    return jsxR4.jsxs("div", {
      ref: ref2,
      "data-media-crop": "",
      role: "group",
      "aria-label": "裁剪",
      style: {
        position: "absolute",
        inset: 0
      },
      children: [
        jsxR4.jsx("div", {
          "data-media-crop-pan": "",
          style: {
            ...state5,
            left: value5.x,
            top: value5.y,
            width: value5.w,
            height: value5.h
          },
          ...callback5({
            of: "media"
          }, () => value4(!0)),
          children: src !== null && jsxR4.jsx("img", {
            src,
            alt: "",
            draggable: !1,
            style: state4
          })
        }),
        value11 && jsxR4.jsx("div", {
          "data-media-crop-inside": "",
          style: {
            ...state5,
            inset: 0
          },
          ...callback5({
            of: "media"
          }, () => value4(!1))
        }),
        jsxR4.jsx("div", {
          style: {
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            outlineWidth: runtime2.SELECTION_POINT_METRICS.ring / scale,
            outlineStyle: "solid",
            outlineColor: "var(--t-app-accent)"
          }
        }),
        value11 && value3 && jsxR4.jsx("div", {
          style: {
            position: "absolute",
            left: value5.x,
            top: value5.y,
            width: value5.w,
            height: value5.h,
            pointerEvents: "none",
            outlineWidth: 1 / scale,
            outlineStyle: "solid",
            outlineColor: "var(--t-app-accent)"
          }
        }),
        value11 && CROP_ALL_HANDLES.map((items3) => {
          let value17 = frameHandleOff?.[items3], value18 = items3.length === 2;
          if (!value18 && (items3 === "n" || items3 === "s" ? frame.w : frame.h) * scale < CROP_TOUCH_HANDLE_SIZE)
            return null;
          let [items4, items5] = [
            items3.includes("w") ? 0 : items3.includes("e") ? frame.w : frame.w / 2,
            items3.includes("n") ? 0 : items3.includes("s") ? frame.h : frame.h / 2
          ], value19 = items3.includes("e") ? -1 : 1, value20 = items3.includes("s") ? -1 : 1, [items6, items7] = [
            value19 > 0 ? value9 / 2 - items2 / 2 : value9 / 2 + items2 / 2 - items,
            value20 > 0 ? value9 / 2 - items2 / 2 : value9 / 2 + items2 / 2 - items
          ];
          return jsxR4.jsx("div", {
            "data-media-crop-side": items3,
            role: "img",
            "aria-label": "裁剪控制点，" + CROP_HANDLE_LABELS[items3],
            title: value17 ?? "拖动以裁剪。",
            "aria-disabled": value17 !== void 0 || void 0,
            style: {
              position: "absolute",
              left: items4 - value9 / 2,
              top: items5 - value9 / 2,
              width: value9,
              height: value9,
              cursor: value17 !== void 0 ? "not-allowed" : CROP_HANDLE_CURSORS[items3],
              touchAction: "none",
              pointerEvents: "auto",
              opacity: value17 !== void 0 ? 0.45 : void 0
            },
            ...value17 !== void 0 ? callback7(value17) : callback6(items3),
            children: value18 ? [state3, state2].map((input, options) => jsxR4.jsxs(reactqY.Fragment, {
              children: [
                jsxR4.jsx("div", {
                  style: {
                    ...input,
                    left: items6,
                    top: value9 / 2 - items2 / 2,
                    width: items,
                    height: items2
                  }
                }),
                jsxR4.jsx("div", {
                  style: {
                    ...input,
                    left: value9 / 2 - items2 / 2,
                    top: items7,
                    width: items2,
                    height: items
                  }
                })
              ]
            }, options)) : items3 === "n" || items3 === "s" ? jsxR4.jsx("div", {
              style: {
                ...state,
                width: items * 1.5,
                height: items2,
                left: value9 / 2 - items * 1.5 / 2,
                top: value9 / 2 - items2 / 2
              }
            }) : jsxR4.jsx("div", {
              style: {
                ...state,
                width: items2,
                height: items * 1.5,
                left: value9 / 2 - items2 / 2,
                top: value9 / 2 - items * 1.5 / 2
              }
            })
          }, items3);
        }),
        (!value11 || value3) && CROP_CORNER_HANDLES.map((input) => jsxR4.jsx("div", {
          "data-media-crop-handle": input,
          role: "img",
          "aria-label": "缩放控制点，" + CROP_CORNER_LABELS[input],
          title: zoomDisabledReason ?? "拖动以缩放。",
          "aria-disabled": value10 || void 0,
          style: {
            position: "absolute",
            left: (input === "nw" || input === "sw" ? value5.x : value5.x + value5.w) - value7 / 2,
            top: (input === "nw" || input === "ne" ? value5.y : value5.y + value5.h) - value7 / 2,
            width: value7,
            height: value7,
            display: "grid",
            placeItems: "center",
            cursor: value10 ? "not-allowed" : input === "nw" || input === "se" ? "nwse-resize" : "nesw-resize",
            touchAction: "none",
            pointerEvents: "auto"
          },
          ...value10 ? callback7(zoomDisabledReason) : callback5({
            of: "corner",
            corner: input
          }),
          children: jsxR4.jsx("div", {
            style: {
              width: value8,
              height: value8,
              boxSizing: "border-box",
              borderRadius: "50%",
              background: "#fff",
              borderWidth: 1.5 / scale,
              borderStyle: "solid",
              borderColor: "var(--t-app-accent)",
              opacity: value10 ? 0.45 : void 0
            }
          })
        }, input))
      ]
    });
  }
  return bindRuntimeValue(runtime2, "reactqY", () => reactqY, (value) => {
    reactqY = value;
  }), bindRuntimeValue(runtime2, "jsxR4", () => jsxR4, (value) => {
    jsxR4 = value;
  }), bindRuntimeValue(runtime2, "CROP_CORNER_HANDLES", () => CROP_CORNER_HANDLES, (value) => {
    CROP_CORNER_HANDLES = value;
  }), bindRuntimeValue(runtime2, "CROP_ALL_HANDLES", () => CROP_ALL_HANDLES, (value) => {
    CROP_ALL_HANDLES = value;
  }), bindRuntimeValue(runtime2, "CROP_HANDLE_LABELS", () => CROP_HANDLE_LABELS, (value) => {
    CROP_HANDLE_LABELS = value;
  }), bindRuntimeValue(runtime2, "CROP_CORNER_LABELS", () => CROP_CORNER_LABELS, (value) => {
    CROP_CORNER_LABELS = value;
  }), bindRuntimeValue(runtime2, "CROP_HANDLE_CURSORS", () => CROP_HANDLE_CURSORS, (value) => {
    CROP_HANDLE_CURSORS = value;
  }), bindRuntimeValue(runtime2, "CROP_CHANGE_EPSILON", () => CROP_CHANGE_EPSILON, (value) => {
    CROP_CHANGE_EPSILON = value;
  }), bindRuntimeValue(runtime2, "CROP_HANDLE_SIZE", () => CROP_HANDLE_SIZE, (value) => {
    CROP_HANDLE_SIZE = value;
  }), bindRuntimeValue(runtime2, "CROP_HANDLE_VISUAL_SIZE", () => CROP_HANDLE_VISUAL_SIZE, (value) => {
    CROP_HANDLE_VISUAL_SIZE = value;
  }), bindRuntimeValue(runtime2, "CROP_HANDLE_BORDER_WIDTH", () => CROP_HANDLE_BORDER_WIDTH, (value) => {
    CROP_HANDLE_BORDER_WIDTH = value;
  }), bindRuntimeValue(runtime2, "CROP_TOUCH_HANDLE_SIZE", () => CROP_TOUCH_HANDLE_SIZE, (value) => {
    CROP_TOUCH_HANDLE_SIZE = value;
  }), bindRuntimeValue(runtime2, "CROP_DRAG_OPACITY", () => CROP_DRAG_OPACITY, (value) => {
    CROP_DRAG_OPACITY = value;
  }), bindRuntimeValue(runtime2, "CROP_ZOOM_STEP", () => CROP_ZOOM_STEP, (value) => {
    CROP_ZOOM_STEP = value;
  }), bindRuntimeValue(runtime2, "CROP_ARROW_DELTAS", () => CROP_ARROW_DELTAS, (value) => {
    CROP_ARROW_DELTAS = value;
  }), bindRuntimeValue(runtime2, "blurCropEditingTarget", () => blurCropEditingTarget), bindRuntimeValue(runtime2, "MediaCropOverlay", () => MediaCropOverlay), () => {
    (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiAnnouncements)(), (0, runtime2.initializeImageCrop)(), reactqY = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxR4 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), CROP_CORNER_HANDLES = ["nw", "ne", "se", "sw"], CROP_ALL_HANDLES = ["n", "e", "s", "w", "nw", "ne", "se", "sw"], CROP_HANDLE_LABELS = {
      n: "top edge",
      e: "right edge",
      s: "bottom edge",
      w: "left edge",
      nw: "top left",
      ne: "top right",
      se: "bottom right",
      sw: "bottom left"
    }, CROP_CORNER_LABELS = {
      nw: "top left",
      ne: "top right",
      se: "bottom right",
      sw: "bottom left"
    }, CROP_HANDLE_CURSORS = {
      n: "ns-resize",
      s: "ns-resize",
      e: "ew-resize",
      w: "ew-resize",
      nw: "nwse-resize",
      se: "nwse-resize",
      ne: "nesw-resize",
      sw: "nesw-resize"
    }, CROP_CHANGE_EPSILON = 5e-3, [
      CROP_HANDLE_SIZE,
      CROP_HANDLE_VISUAL_SIZE,
      CROP_HANDLE_BORDER_WIDTH,
      CROP_TOUCH_HANDLE_SIZE
    ] = [16, 12, 3, 44], CROP_DRAG_OPACITY = 0.35, CROP_ZOOM_STEP = 1.1, CROP_ARROW_DELTAS = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    };
  };
}
export { installEditorMediaCropOverlay };
