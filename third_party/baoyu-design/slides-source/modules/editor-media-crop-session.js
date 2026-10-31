// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEditorMediaCropSession(runtime2) {
  var reactp4, CROP_LAYOUT_REASON, CROP_REFUSAL_MESSAGES, cropImageSource, matchesCropImageIdentity, hasCropTransform;
  function announceSlideStatus(text, page = document) {
    let value = page.getElementById("slides-announcer");
    value === null && (value = page.createElement("div"), value.id = "slides-announcer", value.setAttribute("role", "status"), value.setAttribute("aria-live", "polite"), value.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0", page.body.appendChild(value));
    let value2 = value;
    value2.textContent = "", (page.defaultView ?? globalThis).setTimeout(() => {
      value2.textContent = text;
    }, 50);
  }
  function cropImageLocation(slide, at, source) {
    let value = (0, runtime2.frameById)(slide, at.frameId), value2 = (0, runtime2.selectionNodePath)(at), value3 = value?.node, value4, items = [];
    for (let value7 of value2) {
      let value8 = value3 && (0, runtime2.nodeChildren)(value3);
      if (!value8)
        return;
      items.push(value8.length), value4 = value3, value3 = value8[value7];
    }
    if (!value || value3?.kind !== "img")
      return;
    let callback = (input) => input === void 0 ? "" : String(Math.round(input * 100) / 100), value5 = value4 && (0, runtime2.isOverlayNode)(value4) && value2[value2.length - 1] >= 1 ? value4.layers[value2[value2.length - 1] - 1] : void 0, callback2 = (input, options) => input.anchor !== "fill" ? callback(input.size) : options === void 0 ? "fill" : callback(options - 2 * Math.round(input.margin * 100) / 100), value6 = value2.length === 0 ? callback2(value.x, runtime2.SLIDE_WIDTH) + "x" + callback2(value.y, runtime2.SLIDE_HEIGHT) : value5 ? callback2(value5.x, void 0) + "x" + callback2(value5.y, void 0) : callback(value3.w) + "x" + callback(value3.h);
    return {
      key: items.join("/") + "||" + value6,
      file: cropImageSource(value3, source)
    };
  }
  function cropImageSizeOwnership(slide, at) {
    let value = (0, runtime2.frameById)(slide, at.frameId), value2 = (0, runtime2.selectionNodePath)(at), value3 = value && (0, runtime2.nodeAtPath)(value.node, value2);
    if (!value || value3?.kind !== "img")
      return "none";
    if (value2.length === 0)
      return (0, runtime2.axisSpecsAreSized)(value.x, value.y) ? "own" : "frozen";
    let value4 = (0, runtime2.nodeAtPath)(value.node, value2.slice(0, -1)), value5 = value2[value2.length - 1], value6 = value3.w !== void 0 && value3.h !== void 0;
    if (value4 && (0, runtime2.isOverlayNode)(value4)) {
      if (value5 >= 1)
        return (0, runtime2.axisSpecsAreSized)(value4.layers[value5 - 1].x, value4.layers[value5 - 1].y) ? "own" : "none";
      let value7 = value2.length >= 2 ? (0, runtime2.nodeAtPath)(value.node, value2.slice(0, -2)) : void 0;
      return value6 && value7 !== void 0 && (0, runtime2.isFlowContainer)(value7) ? "own" : "none";
    }
    return !value4 || !(0, runtime2.isFlowContainer)(value4) ? "none" : value6 ? "own" : (0, runtime2.nodeSupportsSizing)(value3) ? "frozen" : "none";
  }
  function materializeCropImageSize(slide, at, rectangle) {
    let value = cropImageSizeOwnership(slide, at);
    if (value === "own")
      return slide;
    if (value === "none" || !(rectangle.w > 0 && rectangle.h > 0))
      return null;
    let value2 = (0, runtime2.selectionNodePath)(at);
    if (value2.length === 0)
      return (0, runtime2.updateSlideFrame)(slide, at.frameId, (input) => ({
        ...input,
        x: {
          ...input.x,
          size: input.x.size ?? rectangle.w
        },
        y: {
          ...input.y,
          size: input.y.size ?? rectangle.h
        }
      }));
    let value3 = (0, runtime2.nodeAtPath)((0, runtime2.frameById)(slide, at.frameId).node, value2.slice(0, -1)), value4 = value3.kind === "stack" ? value3.dir === "h" ? "x" : "y" : void 0;
    return (0, runtime2.updateSelectedNode)(slide, at, (source) => {
      if (source.kind !== "img")
        return source;
      let value5 = source.w !== void 0 ? source : (0, runtime2.setNodeAxisSize)(source, "x", rectangle.w, value4);
      return source.h !== void 0 ? value5 : (0, runtime2.setNodeAxisSize)(value5, "y", rectangle.h, value4);
    });
  }
  function cropImageTransformSupport(slide, at) {
    let value = (0, runtime2.selectionNodePath)(at), value2 = (0, runtime2.frameById)(slide, at.frameId);
    if (!value2)
      return {};
    let value3 = (0, runtime2.nodeTransform)((0, runtime2.nodeAtPath)(value2.node, value));
    if (value.length === 0)
      return value3?.skewX || value3?.skewY ? !1 : {};
    let value4 = (0, runtime2.nodeAtPath)(value2.node, value.slice(0, -1));
    return !value4 || !(0, runtime2.isFlowContainer)(value4) || hasCropTransform(value3) ? !1 : Object.fromEntries(["n", "w", "nw", "ne", "sw"].map((input) => [input, CROP_LAYOUT_REASON]));
  }
  function applyCropFrameChange(slide, at, previous, next, natural) {
    let [items, items2] = [next.w - previous.w, next.h - previous.h];
    if (next.x === 0 && next.y === 0 && items === 0 && items2 === 0)
      return slide;
    let value = (0, runtime2.frameById)(slide, at.frameId), value2 = value && (0, runtime2.nodeAtPath)(value.node, (0, runtime2.selectionNodePath)(at));
    if (!value || value2?.kind !== "img")
      return slide;
    if ((0, runtime2.selectionNodePath)(at).length === 0) {
      let value5 = (0, runtime2.frameBounds)(value.x, value.y), value6 = (0, runtime2.nodeTransform)(value2), state = {
        x: next.x + items / 2,
        y: next.y + items2 / 2
      }, value7 = (0, runtime2.transformPositionCompensation)(state.x, state.y, (value6?.rotate ?? 0) * Math.PI / 180, value6?.scale ?? 1), [items3, items4] = [
        value5.x + next.x + value7.dx,
        value5.y + next.y + value7.dy
      ], [items5, items6] = [
        items3 === value5.x && items === 0,
        items4 === value5.y && items2 === 0
      ];
      return (0, runtime2.updateSlideFrame)(slide, value.id, (input) => ({
        ...input,
        x: items5 ? input.x : (0, runtime2.axisSpecFromRect)(input.x, items3, Math.max(1, value5.w + items), runtime2.SLIDE_WIDTH),
        y: items6 ? input.y : (0, runtime2.axisSpecFromRect)(input.y, items4, Math.max(1, value5.h + items2), runtime2.SLIDE_HEIGHT)
      }));
    }
    let value3 = (0, runtime2.nodeAtPath)(value.node, (0, runtime2.selectionNodePath)(at).slice(0, -1));
    if (!value3 || !(0, runtime2.isFlowContainer)(value3))
      return slide;
    let value4 = value3.kind === "stack" ? value3.dir === "h" ? "x" : "y" : void 0;
    return (0, runtime2.updateSelectedNode)(slide, at, (input) => {
      let value5 = items === 0 ? input : (0, runtime2.setNodeAxisSize)(input, "x", natural.w + items, value4);
      return items2 === 0 ? value5 : (0, runtime2.setNodeAxisSize)(value5, "y", natural.h + items2, value4);
    });
  }
  function cropImageElements(surface, at) {
    let value = surface?.querySelector('[data-img-path="' + (0, runtime2.selectionNodePath)(at).join(".") + '"]'), value2 = value?.tagName === "IMG" ? value : value?.querySelector("img");
    return value && value2 && value2.naturalWidth > 0 && value2.naturalHeight > 0 ? {
      box: value,
      img: value2
    } : null;
  }
  function computedCropFrameSize(element) {
    let value = getComputedStyle(element), callback = (input) => Math.round(parseFloat(input) * 100) / 100 || 0;
    return {
      w: callback(value.width),
      h: callback(value.height)
    };
  }
  function useMediaCropSession(options) {
    let [value, value2] = reactp4.useState(null), ref = reactp4.useRef({
      ...options,
      session: value
    });
    ref.current = {
      ...options,
      session: value
    };
    let ref2 = reactp4.useRef(null);
    value !== null && options.slide.id === value.slideId && (ref2.current = options.slide);
    let callback = (input) => {
      let value8 = (0, runtime2.selectedNode)(options.slide, input);
      if (value8?.kind !== "img" || !(0, runtime2.imageHasMedia)(value8))
        return "noPicture";
      if (cropImageSource(value8, options.assets)?.startsWith("data:image/svg+xml") === !0)
        return "svg";
      let value9 = (0, runtime2.frameById)(options.slide, input.frameId)?.node;
      if (value9 && (0, runtime2.selectionNodePath)(input).some((input2, options2, context) => hasCropTransform((0, runtime2.nodeTransform)((0, runtime2.nodeAtPath)(value9, context.slice(0, options2))))))
        return "turned";
      if (!cropImageElements(options.frameEl(input.frameId), input))
        return "notShowing";
      if (cropImageSizeOwnership(options.slide, input) === "none")
        return "noBox";
    }, reason = (input) => {
      let value8 = callback(input);
      return value8 === void 0 ? void 0 : CROP_REFUSAL_MESSAGES[value8];
    }, value3 = options.editable && value === null && options.selection.length === 1 && callback(options.selection[0]) === "notShowing", [, value4] = reactp4.useState(0);
    reactp4.useEffect(() => {
      let value8 = value3 ? options.root() : null;
      if (value8 === null)
        return;
      let callback6 = () => value4((input) => input + 1);
      return value8.addEventListener("load", callback6, !0), () => value8.removeEventListener("load", callback6, !0);
    }, [value3]);
    let callback2 = (input) => {
      let value8 = (0, runtime2.selectedNode)(options.slide, input), value9 = cropImageElements(options.frameEl(input.frameId), input), value10 = cropImageLocation(options.slide, input, options.assets);
      if (!options.editable || options.busy || options.onCommit === void 0 || value !== null || value8?.kind !== "img" || value10 === void 0 || !value9 || reason(input) !== void 0)
        return !1;
      let { box: value11, img: value12 } = value9, state = {
        x: value11.clientLeft,
        y: value11.clientTop,
        w: value11.clientWidth,
        h: value11.clientHeight
      }, state2 = {
        w: value12.naturalWidth,
        h: value12.naturalHeight
      }, value13 = computedCropFrameSize(value11), value14 = value8.fit === "cover" && cropImageSizeOwnership(options.slide, input) === "own" ? value8.crop : void 0;
      return ref2.current = options.slide, value2({
        unit: input,
        slideId: options.slide.id,
        identity: value10.key,
        file: value10.file,
        frame: state,
        size: value13,
        natural: state2,
        opened: value14 && (0, runtime2.centerUncroppedImageAxes)(state, state2, value14),
        live: value14 ?? runtime2.defaultImageCrop,
        local: {
          x: 0,
          y: 0,
          w: state.w,
          h: state.h
        }
      }), !0;
    }, callback3 = reactp4.useCallback((input) => {
      let { session: current, onCommit: current2 } = ref.current, current3 = ref2.current;
      if (current === null || (ref.current.session = null, value2(null), !input || current3 === null || current2 === void 0 || !matchesCropImageIdentity(cropImageLocation(current3, current.unit, ref.current.assets), current)))
        return;
      let value8 = (0, runtime2.centerUncroppedImageAxes)(current.local, current.natural, current.live), value9 = current.local.x !== 0 || current.local.y !== 0 || current.local.w !== current.frame.w || current.local.h !== current.frame.h;
      if (!value9 && (0, runtime2.imageCropsEqual)(value8, current.opened))
        return;
      let value10 = value8 === void 0 && !value9 ? current3 : materializeCropImageSize(current3, current.unit, current.size);
      value10 !== null && (current2((0, runtime2.updateSelectedNode)(applyCropFrameChange(value10, current.unit, current.frame, current.local, current.size), current.unit, (source) => {
        if (source.kind !== "img")
          return source;
        let state = {
          ...source,
          fit: "cover"
        };
        return value8 !== void 0 ? state.crop = value8 : delete state.crop, state;
      })), announceSlideStatus(value8 !== void 0 || value9 ? "Cropped." : "已移除裁剪。"));
    }, []), value5 = value !== null && options.slide.id === value.slideId, value6 = value !== null && value5 && (!options.editable || !matchesCropImageIdentity(cropImageLocation(options.slide, value.unit, options.assets), value)), value7 = value !== null && (!value5 || options.busy || options.selection.length !== 1 || !(0, runtime2.selectionsEqual)(options.selection[0], value.unit));
    reactp4.useEffect(() => {
      value6 ? callback3(!1) : value7 && callback3(!0);
    }, [value6, value7, callback3]), reactp4.useEffect(() => () => callback3(!0), [callback3]);
    let memo4 = reactp4.useMemo(() => {
      if (value === null || options.slide.id !== value.slideId)
        return null;
      let value8 = applyCropFrameChange(materializeCropImageSize(options.slide, value.unit, value.size) ?? options.slide, value.unit, value.frame, value.local, value.size);
      return (0, runtime2.updateSelectedNode)(value8, value.unit, (source) => source.kind === "img" ? {
        ...source,
        fit: "cover",
        crop: value.live
      } : source);
    }, [options.slide, value]), callback4 = reactp4.useCallback((input) => value2((input2) => input2 === null ? input2 : {
      ...input2,
      live: input
    }), []), callback5 = reactp4.useCallback((input) => value2((input2) => input2 === null || Math.max(input2.size.w + input.frame.w - input2.frame.w, input2.size.h + input.frame.h - input2.frame.h) > runtime2.maxModelCoordinate ? input2 : {
      ...input2,
      live: input.crop,
      local: input.frame
    }), []), memo22 = reactp4.useMemo(() => value === null || ref2.current === null ? {} : cropImageTransformSupport(ref2.current, value.unit), [value?.unit]);
    return {
      session: value,
      slide: memo4,
      reason,
      begin: callback2,
      end: callback3,
      setLive: callback4,
      setFrame: callback5,
      handlesOff: memo22
    };
  }
  return bindRuntimeValue(runtime2, "reactp4", () => reactp4, (value) => {
    reactp4 = value;
  }), bindRuntimeValue(runtime2, "announceSlideStatus", () => announceSlideStatus), bindRuntimeValue(runtime2, "CROP_REFUSAL_MESSAGES", () => CROP_REFUSAL_MESSAGES, (value) => {
    CROP_REFUSAL_MESSAGES = value;
  }), bindRuntimeValue(runtime2, "CROP_LAYOUT_REASON", () => CROP_LAYOUT_REASON, (value) => {
    CROP_LAYOUT_REASON = value;
  }), bindRuntimeValue(runtime2, "cropImageSource", () => cropImageSource, (value) => {
    cropImageSource = value;
  }), bindRuntimeValue(runtime2, "cropImageLocation", () => cropImageLocation), bindRuntimeValue(runtime2, "matchesCropImageIdentity", () => matchesCropImageIdentity, (value) => {
    matchesCropImageIdentity = value;
  }), bindRuntimeValue(runtime2, "cropImageSizeOwnership", () => cropImageSizeOwnership), bindRuntimeValue(runtime2, "materializeCropImageSize", () => materializeCropImageSize), bindRuntimeValue(runtime2, "hasCropTransform", () => hasCropTransform, (value) => {
    hasCropTransform = value;
  }), bindRuntimeValue(runtime2, "cropImageTransformSupport", () => cropImageTransformSupport), bindRuntimeValue(runtime2, "applyCropFrameChange", () => applyCropFrameChange), bindRuntimeValue(runtime2, "cropImageElements", () => cropImageElements), bindRuntimeValue(runtime2, "computedCropFrameSize", () => computedCropFrameSize), bindRuntimeValue(runtime2, "useMediaCropSession", () => useMediaCropSession), () => {
    (0, runtime2.initializeUiInspectorIcons)(), (0, runtime2.initializeImageCrop)(), reactp4 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), (0, runtime2.initializeModelGeometry)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeModelSelection)(), CROP_REFUSAL_MESSAGES = {
      notShowing: (0, runtime2.formatMessage)({
        defaultMessage: "此图片未能显示，无法裁剪。",
        id: "rzR8vKYBMJ"
      }),
      noPicture: (0, runtime2.formatMessage)({
        defaultMessage: "请先添加图片，再进行裁剪。",
        id: "q6o0V6m95w"
      }),
      svg: (0, runtime2.formatMessage)({
        defaultMessage: "此图片为矢量图（SVG），无法裁剪。",
        id: "lO11xavwmk"
      }),
      noStill: (0, runtime2.formatMessage)({
        defaultMessage: "此视频没有静态封面，无法裁剪。",
        id: "xYVj3sQQid"
      }),
      noCover: "请先设置封面图片，再进行裁剪。",
      turned: (0, runtime2.formatMessage)({
        defaultMessage: "此图片所在的组合有旋转、缩放或倾斜，请先移出组合再裁剪。",
        id: "l/0QtDhSPD"
      }),
      noBox: (0, runtime2.formatMessage)({
        defaultMessage: "此图片的尺寸由所在分层组合决定，请先移出组合再裁剪。",
        id: "9B4TOjIRNI"
      })
    }, CROP_LAYOUT_REASON = (0, runtime2.formatMessage)({
      defaultMessage: "此图片的位置由布局决定，只能裁剪右侧和底部。",
      id: "kcI6fFIAF6"
    }), cropImageSource = (input, options) => input.asset !== void 0 ? options.get(input.asset) : input.src, matchesCropImageIdentity = (identity2, current) => identity2 !== void 0 && identity2.key === current.identity && identity2.file === current.file, hasCropTransform = (transform) => transform !== void 0 && ((transform.rotate ?? 0) !== 0 || (transform.scale ?? 1) !== 1 || !!transform.skewX || !!transform.skewY);
  };
}
export {
  installEditorMediaCropSession
};
