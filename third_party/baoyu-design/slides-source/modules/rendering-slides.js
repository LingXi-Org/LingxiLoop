// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installRenderingSlides(runtime2) {
  var SlideRendererReact, SlideRendererReactDom, SlideRendererJsx, textFitScaleVariable, textFitFontSizeVariable, textFitClipVariable, slideEditorChromeContext, slideStructureEnabledContext, linkModifierKeyLabel, linkModifierPressHint, richTextDoubleTapWindowMs, renderedLinkOptions, pointerClickMovementTolerance, pointerPositionForMouse, pointerClickMoved, pointerHasLinkModifier, slideLinkContext, richTextEditingContext, listRenderingContext, mediaPlaceholderLabelCss, transparencyCheckerboardGradient, allowEmbedScripts, htmlEmbedMarkerAttribute, embedsDisabledEventName, slideEmbedGuardConfig, slideEmbedContentSecurityPolicy, shapeStyleElementId, shapeStylesCss, shapeClipPaths, slideFrameIdContext, supportsPlaintextContentEditable, linkDoublePressTimeoutMs, plaintextPasteFallback, preventDefaultInput, pasteRichTextPlaintext, listIndentFallback, editableFocusTimeoutMs, initializeSlideRenderer;
  function nodeInlineStyleCss(style, nodeKind) {
    return style ? (0, runtime2.styleBagToCss)(style, nodeKind) : {};
  }
  function dynamicStyleAttributes(style, animate) {
    return !animate || !style ? {} : style.hover === void 0 && style.animation === void 0 ? {} : {
      [runtime2.dynamicStyleAttribute]: ""
    };
  }
  function flexAlignmentCss(alignment) {
    return alignment === "start" ? "flex-start" : alignment === "end" ? "flex-end" : alignment === "center" || alignment === "baseline" ? alignment : "stretch";
  }
  function flexJustificationCss(justify) {
    return justify === "start" ? "flex-start" : justify === "end" ? "flex-end" : justify === "center" ? "center" : "space-" + justify;
  }
  function hasTextFitCssVariable(element) {
    return [element, ...element.querySelectorAll("*")].some((input) => input.style.getPropertyValue(textFitScaleVariable) !== "");
  }
  function applyTextFitCssVariable(css) {
    let value = positiveFontSizePx(css.fontSize);
    value !== void 0 && (css[textFitFontSizeVariable] = "calc(" + String(value) + "px * var(" + textFitScaleVariable + ", 1))", css.fontSize = "var(" + textFitFontSizeVariable + ")");
  }
  function positiveFontSizePx(fontSize) {
    let value = typeof fontSize == "number" ? fontSize : typeof fontSize == "string" && /^\d+(\.\d+)?px$/.test(fontSize) ? parseFloat(fontSize) : void 0;
    if (value !== void 0 && Number.isFinite(value) && value > 0)
      return value;
  }
  function shouldPinShrinkBasis(node, fit, parentDirection) {
    return fit === "self" && parentDirection === "v" && node.place?.basis === void 0;
  }
  function useTextFit(ref, options) {
    let { node: value, fit: value2, base: value3, box: value4, pinBasis: value5 } = options, value6 = value2 === "shrink" && value3 !== void 0 && value4 !== void 0, ref2 = SlideRendererReact.useRef(null), ref3 = SlideRendererReact.useRef(() => {
    });
    ref3.current = () => {
      let current = ref.current;
      if (!current)
        return;
      if (ref2.current !== null && (current.style.flexBasis === ref2.current && (current.style.flexBasis = ""), ref2.current = null), current.style.removeProperty(textFitClipVariable), !value6) {
        current.style.removeProperty(textFitScaleVariable);
        return;
      }
      let value7 = value4 === "parent" ? current.parentElement : current;
      if (!value7)
        return;
      let state = {
        flexGrow: current.style.flexGrow,
        flexShrink: current.style.flexShrink,
        flexBasis: current.style.flexBasis,
        height: current.style.height,
        minHeight: current.style.minHeight,
        maxHeight: current.style.maxHeight
      }, text = "", callback = (input) => {
        input === 1 ? current.style.removeProperty(textFitScaleVariable) : current.style.setProperty(textFitScaleVariable, String(input)), Object.assign(current.style, value4 === "parent" ? {
          height: "auto",
          minHeight: "0",
          maxHeight: "none"
        } : {
          flexGrow: "0",
          flexShrink: "0",
          flexBasis: "auto",
          height: "auto",
          minHeight: "0",
          maxHeight: "none"
        });
        let offsetHeight = current.offsetHeight;
        return input === 1 && (text = getComputedStyle(current).height), Object.assign(current.style, state), offsetHeight;
      }, callback2 = () => value4 === "self" ? current.offsetHeight : value7.clientHeight;
      if (callback(1) <= callback2() + 0.5)
        return;
      value5 && (current.style.flexBasis = text, state.flexBasis = text, ref2.current = text);
      let value8 = callback2(), value9 = Math.min(1, Math.max(runtime2.textFitMinimumScale, runtime2.minimumTextFontSize / value3));
      if (callback(value9) > value8 + 0.5) {
        current.style.setProperty(textFitScaleVariable, String(value9)), value8 >= value3 * value9 && current.style.setProperty(textFitClipVariable, "clip");
        return;
      }
      let value10 = value9, count = 1;
      for (let index4 = 0; index4 < 7; index4++) {
        let value11 = (value10 + count) / 2;
        callback(value11) <= value8 + 0.5 ? value10 = value11 : count = value11;
      }
      current.style.setProperty(textFitScaleVariable, String(value10));
    }, SlideRendererReact.useLayoutEffect(() => {
      ref3.current();
    }, [value, value2, value3, value4, value5]), SlideRendererReact.useEffect(() => {
      let current = ref.current;
      if (!current || !value6)
        return;
      let value7 = value4 === "parent" ? current.parentElement : current;
      if (!value7)
        return;
      let value8 = value4 === "self" ? current.offsetHeight : value7.clientHeight, offsetWidth = current.offsetWidth, value9 = typeof ResizeObserver < "u" ? new ResizeObserver(() => {
        let value10 = value4 === "self" ? current.offsetHeight : value7.clientHeight, offsetWidth2 = current.offsetWidth;
        (Math.abs(value10 - value8) > 0.5 || Math.abs(offsetWidth2 - offsetWidth) > 0.5) && (value8 = value10, offsetWidth = offsetWidth2, ref3.current(), value8 = value4 === "self" ? current.offsetHeight : value7.clientHeight);
      }) : void 0;
      value9?.observe(value7), value7 !== current && value9?.observe(current);
      let fonts = current.ownerDocument.fonts, callback = () => ref3.current();
      fonts?.addEventListener("loadingdone", callback);
      let flag = !0;
      return fonts !== void 0 && fonts.status !== "loaded" && fonts.ready.then(() => {
        flag && callback();
      }), () => {
        flag = !1, value9?.disconnect(), fonts?.removeEventListener("loadingdone", callback);
      };
    }, [ref, value6, value4]);
  }
  function textFitContainerCss(node, hostSized, fit) {
    return hostSized || fit === "fill" ? {
      width: "100%",
      height: "100%"
    } : fit === "grow" ? {
      flex: "1 1 auto",
      alignSelf: "stretch",
      ...nodePlacementCss(node)
    } : nodePlacementCss(node);
  }
  function nodePlacementCss(node, parentAlign, parentJustify) {
    let state = {
      minWidth: 0,
      minHeight: 0
    };
    parentAlign === "stretch" && !(0, runtime2.nodeSupportsSelfAlignment)(node, "alignSelf") && (state.alignSelf = "flex-start"), parentJustify === "stretch" && !(0, runtime2.nodeSupportsSelfAlignment)(node, "justifySelf") && (state.justifySelf = "start");
    let place = node.place;
    return place && (place.grow !== void 0 && (state.flexGrow = place.grow), place.shrink !== void 0 && (state.flexShrink = place.shrink), place.basis !== void 0 && (state.flexBasis = place.basis === 0 ? "0%" : place.basis), place.alignSelf !== void 0 && (state.alignSelf = flexAlignmentCss(place.alignSelf)), place.minW !== void 0 && (state.minWidth = place.minW), place.minWFit !== void 0 && (place.minW !== void 0 && place.minW === place.maxW && (state.width = place.minW), state.minWidth = place.minWFit), place.maxW !== void 0 && (state.maxWidth = place.maxW), node.kind !== "table" && (place.minH !== void 0 && (state.minHeight = place.minH), place.maxH !== void 0 && (state.maxHeight = place.maxH), place.minH !== void 0 && place.minH === place.maxH && (state.height = place.minH), place.aspect !== void 0 && (state.aspectRatio = String(place.aspect))), place.colSpan !== void 0 && (state.gridColumn = "span " + String(place.colSpan)), place.rowSpan !== void 0 && (state.gridRow = "span " + String(place.rowSpan)), place.justifySelf !== void 0 && (state.justifySelf = place.justifySelf)), state;
  }
  function resolveImageUrl(node, assets) {
    return node.asset !== void 0 ? assets.get(node.asset) : node.src;
  }
  function classifyRenderedLink(href) {
    return (0, runtime2.classifyExternalLink)(href.replace(/^https?:/i, (input) => input.toLowerCase()), renderedLinkOptions);
  }
  function headingLevelForTextNode(node) {
    if (!(node.list !== void 0 || node.lineLists !== void 0 || node.text.trim() === ""))
      return headingLevelForRole(node.role);
  }
  function headingLevelForRole(role) {
    switch (role) {
      case "display":
      case "h1":
        return 1;
      case "h2":
        return 2;
      case "h3":
        return 3;
      default:
        return;
    }
  }
  function MediaPlaceholder({ path, label, still }) {
    return still !== void 0 ? SlideRendererJsx.jsx("div", {
      "data-node-path": path,
      style: {
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none"
      },
      children: SlideRendererJsx.jsx("img", {
        src: still,
        alt: label,
        draggable: !1,
        style: {
          display: "block",
          width: "100%",
          height: "100%"
        }
      })
    }) : SlideRendererJsx.jsx("div", {
      "data-node-path": path,
      style: {
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        background: "rgba(115,114,108,0.12)",
        border: "2px dashed rgba(115,114,108,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        color: "#73726C",
        fontSize: 24,
        fontFamily: "system-ui, sans-serif",
        pointerEvents: "none"
      },
      children: label
    });
  }
  function HtmlEmbedNode({ node, path, animate, selected, box }) {
    animate && (0, runtime2.installEmbedRuntimeGuard)(slideEmbedGuardConfig);
    let value = SlideRendererReact.useSyncExternalStore((input) => (0, runtime2.subscribeEmbedsDisabled)(slideEmbedGuardConfig, input), () => (0, runtime2.embedsDisabled)(slideEmbedGuardConfig), () => !1), [value2, value3] = SlideRendererReact.useState(!1), ref = SlideRendererReact.useRef(null), ref2 = SlideRendererReact.useRef(node.html);
    ref2.current !== node.html && (ref2.current = node.html, value2 && value3(!1));
    let [value4, value5] = SlideRendererReact.useState(0);
    SlideRendererReact.useEffect(() => {
      function value7(input) {
        input.persisted && (value3(!1), value5((input2) => input2 + 1));
      }
      return window.addEventListener("pageshow", value7), () => window.removeEventListener("pageshow", value7);
    }, []), SlideRendererReact.useEffect(() => {
      ref.current?.update({
        t: 0,
        playing: !1,
        selected: selected === !0,
        props: {}
      });
    }, [selected]);
    let value6 = (0, runtime2.usePlayerHasFocus)(), snapshotsOn = SlideRendererReact.useContext(runtime2.slideSnapshotsEnabledContext), boxWidth = box?.w, boxHeight = box?.h, still = (0, runtime2.useSlideSnapshot)(node.html, animate || boxWidth === void 0 || boxHeight === void 0 ? void 0 : { w: boxWidth, h: boxHeight }), [hostGeneration, setHostGeneration] = SlideRendererReact.useState(0), selectedRef = SlideRendererReact.useRef(selected);
    selectedRef.current = selected;
    let live = animate === !0 && !value6 && !value && !value2;
    return SlideRendererReact.useEffect(() => {
      let host = ref.current;
      if (!(!snapshotsOn || !live || hostGeneration === 0 || host === null || boxWidth === void 0 || boxHeight === void 0) && !(0, runtime2.hasSlideSnapshot)(node.html, { w: boxWidth, h: boxHeight }))
        return (0, runtime2.captureSlideSnapshot)(host, node.html, { w: boxWidth, h: boxHeight }, () => host.update({
          t: 0,
          playing: !1,
          selected: selectedRef.current === !0,
          props: {}
        }));
    }, [snapshotsOn, live, node.html, boxWidth, boxHeight, hostGeneration]), animate ? value6 && !value ? SlideRendererJsx.jsx(MediaPlaceholder, {
      path,
      label: "视频播放器打开时暂停网页嵌入内容"
    }) : value ? SlideRendererJsx.jsx(MediaPlaceholder, {
      path,
      label: "网页嵌入内容已禁用：它尝试获取键盘焦点"
    }) : value2 ? SlideRendererJsx.jsx(MediaPlaceholder, {
      path,
      label: "网页嵌入内容已禁用：它跳转到了其他页面"
    }) : SlideRendererJsx.jsx("div", {
      "data-node-path": path,
      style: {
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
        colorScheme: "light"
      },
      children: SlideRendererJsx.jsx(runtime2.EmbedFrame, {
        html: node.html,
        allowScripts: allowEmbedScripts,
        markerAttr: htmlEmbedMarkerAttribute,
        title: "嵌入网页内容（沙箱隔离）",
        onNavigated: () => value3(!0),
        onHost: (input) => {
          ref.current = input, input !== null && snapshotsOn && setHostGeneration((count) => count + 1), input?.update({
            t: 0,
            playing: !1,
            selected: selected === !0,
            props: {}
          });
        }
      }, value4)
    }) : SlideRendererJsx.jsx(MediaPlaceholder, {
      path,
      label: "网页嵌入内容",
      still
    });
  }
  function ensureShapeStyles() {
    if (typeof document > "u" || document.getElementById(shapeStyleElementId))
      return;
    let value = document.createElement("style");
    value.id = shapeStyleElementId, value.textContent = shapeStylesCss, document.head.appendChild(value);
  }
  function IconNode({ node, slideBg, inStack, path, animate }) {
    ensureShapeStyles();
    let value = (0, runtime2.resolveSlideColor)(node.color) ?? (0, runtime2.slideTextColor)(slideBg), value2 = inStack ? {
      width: node.w ?? 160,
      height: node.h ?? 160,
      ...nodePlacementCss(node)
    } : {
      width: "100%",
      height: "100%"
    };
    value2.display = "block";
    let iconStyle = {
      ...value2,
      ...nodeInlineStyleCss(node.style, "slides-icon")
    }, cardIcon = (0, runtime2.useArtifactCardIcon)(node, SlideRendererReact.useContext(slideLinkContext).links !== void 0), marks = {
      "data-icon-path": path,
      "data-node-path": path,
      ...dynamicStyleAttributes(node.style, animate)
    }, svg = SlideRendererJsx.jsx("svg", {
      ...cardIcon === void 0 ? marks : null,
      viewBox: "0 0 100 100",
      preserveAspectRatio: "xMidYMid meet",
      style: cardIcon === void 0 ? iconStyle : runtime2.artifactCardIconSvgStyle,
      children: SlideRendererJsx.jsx("text", {
        x: "50",
        y: "54",
        textAnchor: "middle",
        dominantBaseline: "central",
        fontFamily: "mc-anthropicons",
        fontSize: "90",
        textRendering: "geometricPrecision",
        fill: cardIcon === void 0 ? value : "transparent",
        children: runtime2.iconFontGlyphs[node.icon]
      })
    });
    return cardIcon === void 0 ? svg : SlideRendererJsx.jsx(runtime2.ArtifactCardIcon, {
      kind: cardIcon.kind,
      color: value,
      px: Math.min(node.w ?? 160, node.h ?? 160),
      marks,
      style: iconStyle,
      children: svg
    });
  }
  function shadowDropFilter(style) {
    let value = (style?.boxShadow ?? []).filter((input) => input.inset !== !0);
    if (value.length !== 0)
      return value.map((input) => "drop-shadow(" + String(input.x) + "px " + String(input.y) + "px " + String(input.blur) + "px " + input.color + ")").join(" ");
  }
  function strokeDashArray(line, width) {
    return line === "dashed" ? String(width * 3) + " " + String(width * 2) : line === "dotted" ? "0 " + String(width * 2) : void 0;
  }
  function ShapeNode({ node, inStack, parentDir, path, frameSize, animate }) {
    let shape = node.shape, value = 2 * (0, runtime2.connectorArrowInset)(node.strokeWidth), value2 = (node.place?.grow ?? 0) > 0 && shape === "connector" ? parentDir ?? "h" : node.w !== void 0 && node.h === void 0 ? "h" : node.h !== void 0 && node.w === void 0 ? "v" : void 0, value3 = inStack ? shape === "connector" ? {
      w: node.w ?? (value2 === "v" ? value : runtime2.defaultMediaSize),
      h: node.h ?? (value2 === "v" ? runtime2.defaultMediaSize : value)
    } : {
      w: node.w,
      h: node.h
    } : {
      w: frameSize?.w ?? node.w,
      h: frameSize?.h ?? node.h
    }, value4 = inStack ? {
      width: node.w ?? (shape === "line" ? void 0 : shape === "connector" && value2 === "v" ? value : runtime2.defaultMediaSize),
      height: node.h ?? (shape === "connector" ? value : runtime2.defaultMediaSize),
      ...nodePlacementCss(node)
    } : {
      width: "100%",
      height: "100%"
    };
    if (shape === "connector")
      return SlideRendererJsx.jsx(ConnectorShape, {
        node,
        style: {
          ...value4,
          display: "block"
        },
        path,
        nominal: value3
      });
    node.rotate !== void 0 && node.rotate !== 0 && (value4.transform = "rotate(" + String(node.rotate) + "deg)");
    let value5 = nodeInlineStyleCss(node.style, "slides-shape"), value6 = dynamicStyleAttributes(node.style, animate);
    if (shape === "rect" || shape === "rounded" || shape === "ellipse" || shape === "line") {
      let state2 = {
        ...value4,
        boxSizing: "border-box",
        display: "block",
        ...value5
      };
      return shape === "ellipse" && (state2.borderRadius = "50%"), SlideRendererJsx.jsx("div", {
        "data-node-path": path,
        "data-shape": shape,
        ...value6,
        style: state2
      });
    }
    let { background: value7, backgroundColor: value8, border: value9, borderWidth: value10, borderStyle: value11, borderColor: value12, borderRadius: value13, boxShadow: value14, backdropFilter: value15, WebkitBackdropFilter: value16, filter: value17, ...value18 } = value5, value19 = shadowDropFilter(node.style), value20 = [value17, value19].filter((input) => typeof input == "string" && input !== "").join(" "), state = {
      ...value4,
      display: "block",
      ...value18,
      ...value20 !== "" ? {
        filter: value20
      } : {}
    }, value21 = (0, runtime2.shapeOutline)(node.style);
    return SlideRendererJsx.jsx(PolygonShape, {
      variant: shape,
      fill: node.style?.backgroundColor,
      stroke: value21?.color,
      strokeW: value21?.width ?? 0,
      dash: value21 !== void 0 ? strokeDashArray(value21.line, value21.width) : void 0,
      style: state,
      path,
      nominal: value3,
      marker: value6
    });
  }
  function useElementContentSize(ref) {
    let [value, value2] = SlideRendererReact.useState(null);
    return SlideRendererReact.useLayoutEffect(() => {
      let current = ref.current;
      if (!current || typeof ResizeObserver > "u")
        return;
      let observer = new ResizeObserver((input) => {
        for (let value3 of input) {
          let contentRect = value3.contentRect;
          contentRect.width > 0 && contentRect.height > 0 && value2((input2) => input2 && input2.w === contentRect.width && input2.h === contentRect.height ? input2 : {
            w: contentRect.width,
            h: contentRect.height
          });
        }
      });
      return observer.observe(current), () => observer.disconnect();
    }, [ref]), value;
  }
  function ConnectorShape({ node, style, path, nominal }) {
    let ref = SlideRendererReact.useRef(null), value = useElementContentSize(ref), value2 = node.strokeWidth ?? runtime2.defaultShapeStrokeWidth, value3 = value?.w ?? nominal.w ?? 240, value4 = value?.h ?? nominal.h ?? (nominal.w !== void 0 ? 240 : 2 * (0, runtime2.connectorArrowInset)(value2)), value5 = (0, runtime2.connectorGeometry)(value3, value4, node), callback = (input) => input.map(([input2, input3], options) => (options === 0 ? "M" : "L") + input2.toFixed(2) + " " + input3.toFixed(2)).join(" "), value6 = (0, runtime2.resolveSlideColor)(node.stroke) ?? "#000000", value7 = (0, runtime2.cssColorOpacity)(value6), value8 = value7 < 1 ? (0, runtime2.stripHexAlpha)(value6) : value6;
    return SlideRendererJsx.jsxs("svg", {
      ref,
      "data-node-path": path,
      "data-shape": "connector",
      viewBox: "0 0 " + String(value3) + " " + String(value4),
      preserveAspectRatio: "none",
      style: {
        ...style,
        overflow: "visible"
      },
      children: [
        SlideRendererJsx.jsx("path", {
          d: callback(value5.points),
          fill: "none",
          stroke: "transparent",
          strokeWidth: Math.max(12, value2 + 8)
        }),
        SlideRendererJsx.jsxs("g", {
          fill: "none",
          opacity: value7 < 1 ? value7 : void 0,
          children: [
            SlideRendererJsx.jsx("path", {
              d: callback((0, runtime2.shortenConnectorShaftForHeads)(value5, value2)),
              fill: "none",
              stroke: value8,
              strokeWidth: value2,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              strokeDasharray: node.dashed === !0 ? String(value2 * 3) + " " + String(value2 * 2) : void 0
            }),
            value5.heads.map((source, options) => {
              let [value9, value10] = (0, runtime2.connectorArrowHeadWings)(source, value2), value11 = callback([value9, source.tip, value10]);
              return source.kind === "open" ? SlideRendererJsx.jsx("path", {
                d: value11,
                fill: "none",
                stroke: value8,
                strokeWidth: value2,
                strokeLinecap: "round",
                strokeLinejoin: "round"
              }, options) : SlideRendererJsx.jsx("path", {
                d: value11 + " Z",
                fill: value8
              }, options);
            })
          ]
        })
      ]
    });
  }
  function PolygonShape({ variant, fill, stroke, strokeW, dash, style, path, nominal, marker }) {
    let ref = SlideRendererReact.useRef(null), value = useElementContentSize(ref), value2 = value?.w ?? nominal.w ?? 240, value3 = value?.h ?? nominal.h ?? 240, value4 = (shapeClipPaths[variant] ?? "").split(" ").map((input) => {
      let [value5, value6] = input.split(",").map(Number);
      return String(((value5 ?? 0) / 100 * value2).toFixed(2)) + "," + String(((value6 ?? 0) / 100 * value3).toFixed(2));
    }).join(" ");
    return SlideRendererJsx.jsx("svg", {
      ref,
      "data-node-path": path,
      "data-shape": variant,
      viewBox: "0 0 " + String(value2) + " " + String(value3),
      preserveAspectRatio: "none",
      ...marker,
      style,
      children: SlideRendererJsx.jsx("polygon", {
        points: value4,
        fill: fill ?? "none",
        stroke: strokeW > 0 ? stroke : void 0,
        strokeWidth: strokeW > 0 ? strokeW : void 0,
        strokeDasharray: strokeW > 0 ? dash : void 0,
        strokeLinecap: dash !== void 0 ? "round" : void 0,
        strokeLinejoin: "round"
      })
    });
  }
  function ImageNode({ node, assets, hostSized, inStack, parentAlign, parentJustify, path, animate, selected = !1 }) {
    const unsupportedMedia = Object.hasOwn(node, "video") || Object.hasOwn(node, "videoLink");
    let value = unsupportedMedia ? void 0 : resolveImageUrl(node, assets), value2 = inStack ? {
      width: node.w !== void 0 ? node.w : void 0,
      height: node.h !== void 0 ? node.h : void 0,
      maxWidth: runtime2.SLIDE_WIDTH,
      maxHeight: runtime2.SLIDE_HEIGHT,
      ...nodePlacementCss(node, parentAlign, parentJustify)
    } : {
      width: "100%",
      height: "100%"
    };
    value2.display = "block";
    let value3 = nodeInlineStyleCss(node.style, "slides-img"), value4 = dynamicStyleAttributes(node.style, animate), [value5, value6] = SlideRendererReact.useState(void 0), value7 = SlideRendererReact.useContext(slideEditorChromeContext);
    if (unsupportedMedia)
      return SlideRendererJsx.jsx("div", { "data-unsupported-media": "", "data-node-path": path, role: "img", "aria-label": "不支持的媒体（原稿数据已保留）", style: { ...value2, ...value3, minHeight: 80, minWidth: 120, background: "#eee", color: "#666", display: "grid", placeItems: "center" }, children: "不支持的媒体" });
    if (!value && node.asset === void 0 && node.src === void 0) {
      let value10 = value7 && value3.backgroundImage === void 0 && value3.backgroundColor === void 0;
      return SlideRendererJsx.jsx("div", {
        "data-img-path": path,
        "data-node-path": path,
        ...value7 ? {
          role: "img",
          "aria-label": node.alt || "空白图片"
        } : {
          "aria-hidden": !0
        },
        ...value4,
        style: {
          ...value2,
          ...value7 ? {
            minWidth: 120,
            minHeight: 80
          } : {},
          ...value10 ? {
            backgroundImage: transparencyCheckerboardGradient,
            backgroundSize: "32px 32px"
          } : {},
          ...value3
        }
      });
    }
    return !value || value5 === value ? SlideRendererJsx.jsx("div", {
      "data-img-path": path,
      "data-node-path": path,
      ...value4,
      style: {
        ...value2,
        minWidth: 120,
        minHeight: 80,
        background: "rgba(115,114,108,0.18)",
        border: "2px dashed rgba(115,114,108,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#73726C",
        fontSize: 24,
        fontFamily: "system-ui, sans-serif",
        ...value3
      },
      children: node.alt || (value ? "此处无法显示图片" : node.asset !== void 0 ? "缺少资源：" + node.asset : "image")
    }) : node.crop !== void 0 && (0, runtime2.shouldPreserveMediaAspect)(node, hostSized, inStack) && !value.startsWith("data:image/svg+xml") ? SlideRendererJsx.jsx("div", {
      "data-img-path": path,
      "data-node-path": path,
      ...value4,
      style: {
        ...value2,
        ...value3,
        position: "relative",
        overflow: "hidden"
      },
      children: SlideRendererJsx.jsx("img", {
        src: value,
        alt: node.alt,
        draggable: !1,
        onError: () => value6(value),
        style: (0, runtime2.imageCropCss)(node.crop)
      })
    }) : SlideRendererJsx.jsx("img", {
      "data-img-path": path,
      "data-node-path": path,
      ...value4,
      src: value,
      alt: node.alt,
      draggable: !1,
      onError: () => value6(value),
      style: {
        ...value2,
        objectFit: node.fit,
        ...value3
      }
    });
  }

  function prefersReducedMotion() {
    return typeof window < "u" && typeof window.matchMedia == "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function hexColorRgba(color, alpha) {
    let value = parseInt(color.slice(1, 3), 16), value2 = parseInt(color.slice(3, 5), 16), value3 = parseInt(color.slice(5, 7), 16);
    return "rgba(" + String(value) + "," + String(value2) + "," + String(value3) + "," + String(alpha) + ")";
  }
  function TextNode({ node, slideBg, path, editing, inStack = !1, parentAlign, parentJustify, parentDir, fitBox }) {
    let ref = SlideRendererReact.useRef(null), value = node.fit ?? runtime2.defaultTextFit, value2 = (0, runtime2.renderingTypeScaleForRole)(node.role ?? "body"), value3 = (0, runtime2.slideTextColor)(slideBg), value4 = "2px solid " + hexColorRgba(value3, 0.22), state = {
      display: "grid",
      gridTemplateColumns: node.colWidths !== void 0 ? node.colWidths.map((input) => String(input) + "fr").join(" ") : "repeat(" + String(node.cols) + ", 1fr)",
      width: "100%",
      boxSizing: "border-box",
      ...inStack ? nodePlacementCss(node, parentAlign, parentJustify) : null,
      fontFamily: value2.fontFamily,
      fontSize: value2.fontSize,
      fontWeight: value2.fontWeight,
      lineHeight: value2.lineHeight,
      color: value3,
      ...nodeInlineStyleCss(node.style, "slides-table")
    };
    value2.serifDisplay && (state.fontVariationSettings = "'opsz' 48");
    let value5 = positiveFontSizePx(state.fontSize);
    return value === "shrink" ? applyTextFitCssVariable(state) : value === "grow" && inStack && parentDir === "v" && node.place?.shrink === void 0 && (state.flexShrink = 0), useTextFit(ref, {
      node,
      fit: value,
      base: value5,
      box: fitBox,
      pinBasis: shouldPinShrinkBasis(node, fitBox, parentDir)
    }), node.rows.length > 0 && (state.borderTop = value4, state.borderLeft = value4), SlideRendererJsx.jsx("div", {
      ref,
      "data-node-path": path,
      style: state,
      children: node.rows.map((input, options) => input.map((input2, options2) => {
        let value6 = String(options) + "." + String(options2), value7 = node.colAligns?.[options2], value8 = node.cellStyles?.[value6]?.color, value9 = node.rowStyles?.[String(options)]?.background, state2 = {
          borderRight: value4,
          borderBottom: value4,
          padding: `${node.cellPadding?.y !== void 0 ? String(node.cellPadding.y) + "px" : "0.35em"} ${node.cellPadding?.x !== void 0 ? String(node.cellPadding.x) + "px" : "0.6em"}`,
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          minWidth: 0,
          boxSizing: "content-box",
          minHeight: "1lh",
          overflowY: "clip",
          ...value7 === "center" ? {
            textAlign: "center"
          } : value7 === "end" ? {
            textAlign: "right"
          } : void 0,
          ...value8 !== void 0 ? {
            color: (0, runtime2.resolveSlideColor)(value8)
          } : void 0,
          ...node.header && options === 0 ? {
            fontWeight: node.headerWeight ?? 600,
            background: hexColorRgba(value3, 0.08)
          } : void 0,
          ...value9 !== void 0 ? {
            background: (0, runtime2.resolveSlideColor)(value9)
          } : void 0
        };
        return editing != null && editing.cell !== void 0 && editing.cell.r === options && editing.cell.c === options2 ? SlideRendererJsx.jsx(EditableTableCell, {
          cellKey: value6,
          name: (0, runtime2.accessibleTableCellLabel)({
            r: options,
            c: options2
          }),
          style: state2,
          session: editing
        }, value6) : SlideRendererJsx.jsx("div", {
          "data-cell": value6,
          style: state2,
          children: input2
        }, value6);
      }))
    });
  }
  function useRichTextFormatInput(ref, onStyle) {
    let ref2 = SlideRendererReact.useRef(onStyle);
    ref2.current = onStyle, SlideRendererReact.useEffect(() => {
      let current = ref.current;
      if (current === null)
        return;
      let callback = (event) => {
        if ((0, runtime2.isExecutingRichTextCommand)() || typeof event.inputType != "string" || !event.inputType.startsWith("format"))
          return;
        event.preventDefault();
        let value = event.inputType === "formatBold" ? "bold" : event.inputType === "formatItalic" ? "italic" : event.inputType === "formatUnderline" ? "underline" : null;
        value !== null && ref2.current !== void 0 && setTimeout(() => ref2.current?.(value), 0);
      };
      return current.addEventListener("beforeinput", callback), () => current.removeEventListener("beforeinput", callback);
    }, [ref]);
  }
  function useEditableTextFocus(caret, reselect) {
    let ref = SlideRendererReact.useRef(null);
    return SlideRendererReact.useLayoutEffect(() => {
      let current = ref.current;
      if (!current)
        return;
      current.focus({
        preventScroll: !0
      });
      let value = window.getSelection();
      if (value) {
        let value3 = document.createRange();
        if (caret === "end") {
          let value4 = current;
          for (; value4.lastChild !== null; )
            value4 = value4.lastChild;
          let value5 = (value4.nodeType === Node.ELEMENT_NODE ? value4 : value4.parentElement)?.closest("a") ?? null;
          value5 !== null && current.contains(value5) ? value3.setStartAfter(value5) : value4.nodeType === Node.TEXT_NODE ? value3.setStart(value4, value4.length) : value4.nodeName === "BR" ? value3.setStartBefore(value4) : value3.setStart(value4, 0), value3.collapse(!0);
        } else
          value3.selectNodeContents(current);
        value.removeAllRanges(), value.addRange(value3);
      }
      if (reselect !== !0 || caret === "end")
        return;
      let ownerDocument2 = current.ownerDocument, callback = () => {
        ownerDocument2.removeEventListener("selectionchange", callback2), current.removeEventListener("beforeinput", callback), clearTimeout(value2);
      }, callback2 = () => {
        let value3 = ownerDocument2.getSelection();
        value3 === null || !value3.isCollapsed || !current.contains(value3.anchorNode) || (callback(), value3.selectAllChildren(current));
      }, value2 = setTimeout(callback, linkDoublePressTimeoutMs);
      return ownerDocument2.addEventListener("selectionchange", callback2), current.addEventListener("beforeinput", callback), callback;
    }, []), ref;
  }
  function linkUrlFromTitle(element) {
    let value = /(?:^|\s)(https?:\/\/\S+)$/i.exec(element.getAttribute("title") ?? "")?.[1] ?? "";
    return (0, runtime2.isSafeHyperlink)(value) ? value : "";
  }
  function useEditableLinkPress(ref) {
    SlideRendererReact.useEffect(() => {
      let current = ref.current;
      if (!current)
        return;
      let flag = !1, callback = (input) => {
        flag = input.pointerType === "touch";
      }, callback2 = (input) => {
        if (input.button !== 0 || input.detail !== 1 || input.shiftKey || input.ctrlKey && (0, runtime2.isApplePlatform)() || flag)
          return;
        let ownerDocument2 = current.ownerDocument, value = ownerDocument2.getSelection();
        if (value === null || value.isCollapsed || value.rangeCount === 0)
          return;
        let value2 = ownerDocument2.createRange();
        if (value2.selectNodeContents(current), value.getRangeAt(0).toString().trim() !== value2.toString().trim())
          return;
        let value3 = typeof ownerDocument2.caretRangeFromPoint == "function" ? ownerDocument2.caretRangeFromPoint(input.clientX, input.clientY) : null, value4 = value3 === null && typeof ownerDocument2.caretPositionFromPoint == "function" ? ownerDocument2.caretPositionFromPoint(input.clientX, input.clientY) : null, value5 = value3 !== null ? value3.startContainer : value4 !== null ? value4.offsetNode : null;
        value5 !== null && current.contains(value5) && value.collapse(value5, value3 !== null ? value3.startOffset : value4.offset);
      };
      return current.addEventListener("pointerdown", callback, !0), current.addEventListener("mousedown", callback2, !0), () => {
        current.removeEventListener("pointerdown", callback, !0), current.removeEventListener("mousedown", callback2, !0);
      };
    }, [ref]);
  }
  function isLinkSelectShortcut(event) {
    return (event.key === "k" || event.key === "K") && !event.shiftKey && !event.altKey && ((0, runtime2.isApplePlatform)() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
  }
  function RichTextRuns({ runs, editing, drawn }) {
    let { links: value, onLinkOpen: value2, plainPress: value3 } = SlideRendererReact.useContext(slideLinkContext), value4 = SlideRendererReact.useContext(richTextEditingContext), ref = SlideRendererReact.useRef(null), ref2 = SlideRendererReact.useRef(null), callback = SlideRendererReact.useCallback(() => {
      let current = ref2.current;
      current !== null && (ref2.current = null, clearTimeout(current.timer), current.doc.removeEventListener("pointerdown", callback, !0));
    }, []);
    return SlideRendererReact.useEffect(() => callback, [callback]), SlideRendererJsx.jsx(SlideRendererJsx.Fragment, {
      children: runs.map((input, options) => {
        let text = drawn === void 0 ? input.text : SlideRendererJsx.jsx(runtime2.ArtifactCardText, {
          stored: input.text,
          ...drawn
        });
        if (input.bold && (text = SlideRendererJsx.jsx("b", {
          children: text
        })), input.italic && (text = SlideRendererJsx.jsx("i", {
          children: text
        })), input.underline && (text = SlideRendererJsx.jsx("u", {
          children: text
        })), input.color !== void 0 && (text = SlideRendererReact.createElement("font", {
          color: input.color,
          style: {
            color: (0, runtime2.resolveSlideColor)(input.color) ?? void 0,
            WebkitTextFillColor: "currentcolor"
          }
        }, text)), input.href !== void 0) {
          let value5 = editing || value !== void 0 ? classifyRenderedLink(input.href) : null, value6 = value5 !== null && !editing, value7 = !editing && (value === "view" || value === "edit"), value8 = SlideRendererJsx.jsx("a", {
            title: value7 ? void 0 : (value5 !== null && editing ? linkModifierPressHint() : "") + input.href,
            "aria-description": value7 ? input.href : void 0,
            "data-drag-surface": !editing && value === "edit" ? "" : void 0,
            style: {
              textDecoration: "underline",
              cursor: editing ? "text" : value6 ? "pointer" : void 0
            },
            onPointerDown: value5 === null || editing ? void 0 : (input2) => ref.current = pointerPositionForMouse(input2),
            onClick: value5 === null || editing ? void 0 : (input2) => {
              value !== "edit" && input2.stopPropagation();
              let current = ref.current;
              if (ref.current = null, callback(), !(input2.button !== 0 || input2.detail > 1 || pointerClickMoved(current, input2))) {
                if (value === "edit") {
                  if (input2.metaKey || input2.ctrlKey || input2.shiftKey || input2.altKey || input2.detail !== 0 && value3?.() === !1)
                    return;
                  let ownerDocument2 = input2.currentTarget.ownerDocument, value9 = setTimeout(() => {
                    callback(), (0, runtime2.openExternalLink)(value5, renderedLinkOptions);
                  }, richTextDoubleTapWindowMs);
                  ref2.current = {
                    timer: value9,
                    doc: ownerDocument2
                  }, ownerDocument2.addEventListener("pointerdown", callback, !0);
                  return;
                }
                input2.ctrlKey && (0, runtime2.isApplePlatform)() || (value2?.(), (0, runtime2.openExternalLink)(value5, renderedLinkOptions));
              }
            },
            children: text
          });
          text = value7 ? SlideRendererJsx.jsx(runtime2.Tooltip, {
            content: SlideRendererJsx.jsx("span", {
              style: mediaPlaceholderLabelCss,
              children: input.href
            }),
            detail: value === "edit" && value5 !== null && !value4 ? linkModifierKeyLabel() + "-click to select the text box" : void 0,
            side: "bottom",
            delay: 0,
            hoverable: !1,
            lazy: !0,
            children: value8
          }) : value8;
        }
        return SlideRendererJsx.jsx(SlideRendererJsx.Fragment, {
          children: text
        }, options);
      })
    });
  }
  function RichTextLines({ node, editing = !1 }) {
    let listMode = SlideRendererReact.useContext(listRenderingContext), lineContent = (runs) => runs.length === 0 ? SlideRendererJsx.jsx("br", {}) : SlideRendererJsx.jsx(RichTextRuns, {
      runs,
      editing
    });
    return (0, runtime2.groupTextLinesByList)(node).flatMap((group, index4) => {
      if (group.list === null)
        return group.lines.map((line, lineIndex) => SlideRendererJsx.jsx("div", {
          children: lineContent(line)
        }, String(index4) + "." + String(lineIndex)));
      let tag = group.list === "bullet" ? "ul" : "ol";
      return SlideRendererJsx.jsx(tag, {
        ...listMode === "css" && node.list !== void 0 ? {
          "data-css-list": ""
        } : null,
        style: editing ? void 0 : {
          margin: 0,
          listStyleType: group.list === "bullet" ? "disc" : "decimal",
          paddingInlineStart: listIndentFallback(node, listMode)
        },
        children: group.lines.map((line, lineIndex) => SlideRendererJsx.jsx("li", {
          children: lineContent(line)
        }, lineIndex))
      }, index4);
    });
  }
  function RichTextContent({ node }) {
    let drawn = (0, runtime2.useArtifactCardLiveText)(node, SlideRendererReact.useContext(slideLinkContext).links !== void 0);
    if (drawn !== void 0)
      return SlideRendererJsx.jsx(RichTextRuns, {
        runs: [
          {
            ...(0, runtime2.textLinesAsRuns)(node)[0]?.[0],
            text: node.text
          }
        ],
        drawn
      });
    if (node.list !== void 0 || node.lineLists !== void 0)
      return SlideRendererJsx.jsx(RichTextLines, {
        node
      });
    if (node.marks === void 0)
      return SlideRendererJsx.jsx(SlideRendererJsx.Fragment, {
        children: node.text
      });
    let lines = (0, runtime2.textLinesAsRuns)(node);
    return SlideRendererJsx.jsx(SlideRendererJsx.Fragment, {
      children: lines.map((input, options) => SlideRendererJsx.jsxs(SlideRendererReact.Fragment, {
        children: [
          options > 0 ? `
` : null,
          SlideRendererJsx.jsx(RichTextRuns, {
            runs: input
          })
        ]
      }, options))
    });
  }
  function renderedTextCss(node, background, inStack, parentDirection, fitBox, listMode) {
    let value = node.fit ?? runtime2.defaultTextFit, value2 = (0, runtime2.textListGutter)(node, listMode), value3 = (0, runtime2.applyTextFillCss)({
      ...(0, runtime2.textNodeBaseCss)(node, background),
      ...inStack ? nodePlacementCss(node) : null,
      ...nodeInlineStyleCss(node.style, "slides-text"),
      ...value2 !== void 0 ? {
        paddingLeft: value2
      } : null
    }, node.fill);
    return value === "shrink" ? (applyTextFitCssVariable(value3), value3.overflowY = "var(" + textFitClipVariable + ", visible)", fitBox === "parent" && (value3.maxHeight = "100%")) : value === "grow" && inStack && parentDirection === "v" && node.place?.shrink === void 0 && (value3.flexShrink = 0), value3;
  }
  function ReadOnlyTextNode({ node, slideBg, path, inStack, parentDir, animate, fitBox }) {
    let ref = SlideRendererReact.useRef(null), value = renderedTextCss(node, slideBg, inStack, parentDir, fitBox, SlideRendererReact.useContext(listRenderingContext));
    useTextFit(ref, {
      node,
      fit: node.fit ?? runtime2.defaultTextFit,
      base: positiveFontSizePx({
        ...(0, runtime2.textNodeBaseCss)(node, slideBg),
        ...nodeInlineStyleCss(node.style, "slides-text")
      }.fontSize),
      box: fitBox,
      pinBasis: shouldPinShrinkBasis(node, fitBox, parentDir)
    });
    let value2 = SlideRendererReact.useContext(slideStructureEnabledContext) ? headingLevelForTextNode(node) : void 0, [cardWordsIds, frameId, cardText] = [
      SlideRendererReact.useContext(slideLinkContext).cardWordsIds,
      SlideRendererReact.useContext(slideFrameIdContext),
      (0, runtime2.useIsArtifactCardText)(node)
    ];
    return SlideRendererJsx.jsx("div", {
      ref,
      id: cardWordsIds !== void 0 && cardText ? (
        // Same id as `textWordsElementId` builds (its third argument is the node path).
        cardWordsIds + ":words:" + frameId + ":" + path
      ) : void 0,
      "data-text-path": path,
      "data-node-path": path,
      ...dynamicStyleAttributes(node.style, animate),
      role: value2 !== void 0 ? "heading" : void 0,
      "aria-level": value2,
      style: value,
      children: SlideRendererJsx.jsx(RichTextContent, {
        node
      })
    });
  }
  function useImeGuard() {
    let ref = SlideRendererReact.useRef(Number.NEGATIVE_INFINITY);
    return {
      onCompositionEnd: () => {
        ref.current = performance.now();
      },
      fromIme: (event) => event.nativeEvent.isComposing || event.keyCode === 229 || event.key === "Escape" && performance.now() - ref.current < editableFocusTimeoutMs
    };
  }
  function EditableTextNode({ node, slideBg, path, session, inStack = !1, parentDir, fitBox }) {
    let value = useEditableTextFocus(session.caret, session.reselect);
    useEditableLinkPress(value);
    let ref = SlideRendererReact.useRef(null);
    useTextFit(value, {
      node,
      fit: node.fit ?? runtime2.defaultTextFit,
      base: positiveFontSizePx({
        ...(0, runtime2.textNodeBaseCss)(node, slideBg),
        ...nodeInlineStyleCss(node.style, "slides-text")
      }.fontSize),
      box: fitBox,
      pinBasis: shouldPinShrinkBasis(node, fitBox, parentDir)
    });
    let value2 = session.onRichInput !== void 0, value3 = useImeGuard(), listMode = SlideRendererReact.useContext(listRenderingContext), value5 = renderedTextCss(node, slideBg, inStack, parentDir, fitBox, listMode), listIndent = String(listIndentFallback(node, listMode)), callback = (input) => {
      session.onRichInput?.((0, runtime2.readEditableRichText)(input));
    }, callback2 = (input) => {
      (0, runtime2.clearRichTextUndoState)(input), session.onRichCommit?.((0, runtime2.readEditableRichText)(input, !0));
    };
    useRichTextFormatInput(value, value2 ? session.onFormat : void 0);
    let [value6] = SlideRendererReact.useState(() => value2 ? SlideRendererJsx.jsx(RichTextLines, {
      node: {
        text: session.initialText,
        marks: node.marks,
        list: node.list,
        lineLists: node.lineLists
      },
      editing: !0
    }) : null);
    return SlideRendererJsx.jsxs(SlideRendererJsx.Fragment, {
      children: [
        value2 ? SlideRendererJsx.jsx("style", {
          children: "[data-text-path][contenteditable] ul{list-style-type:disc;margin:0;padding-inline-start:" + listIndent + "}[data-text-path][contenteditable] ol{list-style-type:decimal;margin:0;padding-inline-start:" + listIndent + "}[data-text-path][contenteditable] font[color]{-webkit-text-fill-color:currentcolor}" + (node.fill !== void 0 ? "[data-text-path][contenteditable]::selection,[data-text-path][contenteditable] ::selection{color:HighlightText;-webkit-text-fill-color:HighlightText;background-color:Highlight}" : "")
        }) : null,
        SlideRendererJsx.jsx("div", {
          ref: value,
          "data-text-path": path,
          "data-node-path": path,
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": (0, runtime2.accessibleNodeTypeLabel)(node),
          contentEditable: !value2 && supportsPlaintextContentEditable ? "plaintext-only" : !0,
          suppressContentEditableWarning: !0,
          style: {
            ...value5,
            outlineStyle: "none",
            cursor: "text",
            minWidth: value5.minWidth === void 0 || value5.minWidth === 0 ? 40 : value5.minWidth,
            minHeight: value5.minHeight === void 0 || value5.minHeight === 0 ? "1em" : value5.minHeight
          },
          onInput: (event) => {
            value2 ? ((0, runtime2.reconcileNativeRichTextHistory)(event.currentTarget, event.nativeEvent, headingLevelForRole(node.role) !== void 0), callback(event.currentTarget)) : session.onInput(event.currentTarget.innerText);
          },
          onBlur: (input) => {
            input.relatedTarget instanceof Element && input.relatedTarget.closest("[data-session-strip]") !== null || (value2 ? callback2(input.currentTarget) : session.onCommit(input.currentTarget.innerText));
          },
          onPointerDown: (input) => {
            input.stopPropagation(), ref.current = pointerPositionForMouse(input);
          },
          onClick: (event) => {
            let current = ref.current;
            if (ref.current = null, event.button !== 0 || event.detail > 1 || pointerClickMoved(current, event) || !pointerHasLinkModifier(event))
              return;
            let ancestor = event.target.closest("a:not([href])"), value7 = ancestor !== null && event.currentTarget.contains(ancestor) ? classifyRenderedLink(linkUrlFromTitle(ancestor)) : null;
            value7 !== null && (0, runtime2.openExternalLink)(value7, renderedLinkOptions);
          },
          onCompositionEnd: value3.onCompositionEnd,
          onKeyDown: (event) => {
            if (event.stopPropagation(), !value3.fromIme(event)) {
              if ((0, runtime2.isDuplicateShortcut)(event) && event.preventDefault(), value2 && isLinkSelectShortcut(event)) {
                event.preventDefault(), session.onLink?.();
                return;
              }
              if (value2 && event.key === "Backspace" && !event.altKey && !event.ctrlKey && !event.metaKey && (0, runtime2.caretAtListItemStart)(event.currentTarget)) {
                event.preventDefault(), (0, runtime2.executeRichTextCommand)("outdent");
                return;
              }
              (event.key === "Escape" && !event.defaultPrevented || event.key === "Enter" && (event.metaKey || event.ctrlKey) || event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.defaultPrevented) && (event.preventDefault(), value2 ? callback2(event.currentTarget) : session.onCommit(event.currentTarget.innerText));
            }
          },
          onPaste: value2 ? pasteRichTextPlaintext : plaintextPasteFallback,
          onDrop: preventDefaultInput,
          onDragOver: preventDefaultInput,
          children: value2 ? value6 : session.initialText
        })
      ]
    });
  }
  function EditableTableCell({ cellKey, name, style, session }) {
    let value = useEditableTextFocus(session.caret, session.reselect);
    useEditableLinkPress(value), useRichTextFormatInput(value);
    let value2 = useImeGuard(), ref = SlideRendererReact.useRef(!1), callback = (input) => {
      ref.current || (ref.current = !0, input());
    };
    return SlideRendererJsx.jsx("div", {
      ref: value,
      "data-cell": cellKey,
      role: "textbox",
      "aria-multiline": "true",
      "aria-label": name,
      contentEditable: supportsPlaintextContentEditable ? "plaintext-only" : !0,
      suppressContentEditableWarning: !0,
      style: {
        ...style,
        outlineStyle: "solid",
        outlineWidth: 2,
        outlineColor: "var(--t-app-accent)",
        outlineOffset: -2,
        cursor: "text"
      },
      onInput: (input) => session.onInput(input.currentTarget.innerText),
      onBlur: (input) => {
        let innerText = input.currentTarget.innerText;
        callback(() => session.onCommit(innerText));
      },
      onPointerDown: (input) => input.stopPropagation(),
      onCompositionEnd: value2.onCompositionEnd,
      onKeyDown: (event) => {
        if (event.stopPropagation(), (0, runtime2.isDuplicateShortcut)(event) && event.preventDefault(), value2.fromIme(event))
          return;
        let innerText = event.currentTarget.innerText;
        if (event.key === "Escape") {
          if (event.defaultPrevented)
            return;
          event.preventDefault(), callback(() => session.onCommit(innerText));
        } else if (event.key === "Enter")
          if (event.preventDefault(), event.altKey && !event.ctrlKey && !event.metaKey)
            document.execCommand("insertLineBreak") || document.execCommand("insertText", !1, `
`);
          else if (event.metaKey || event.ctrlKey)
            callback(() => session.onCommit(innerText));
          else {
            let value3 = event.shiftKey ? -1 : 1;
            callback(() => session.onCommitMove?.(innerText, value3, 0));
          }
        else if (event.key === "Tab") {
          event.preventDefault();
          let value3 = event.shiftKey ? -1 : 1;
          callback(() => session.onCommitMove?.(innerText, 0, value3));
        }
      },
      onPaste: plaintextPasteFallback,
      onDrop: preventDefaultInput,
      onDragOver: preventDefaultInput,
      children: session.initialText
    });
  }
  function SpacerNode({ node, path, showHatch }) {
    return SlideRendererJsx.jsx("div", {
      "data-node-path": path,
      style: {
        ...nodePlacementCss(node),
        ...showHatch ? {
          backgroundImage: "repeating-linear-gradient(45deg, rgba(115,114,108,0.18) 0 6px, transparent 6px 12px)",
          outline: "1px dashed rgba(115,114,108,0.35)",
          outlineOffset: -1
        } : null
      }
    });
  }
  function gridTrackCss(track) {
    return track === "auto" ? "auto" : "fr" in track ? String(track.fr) + "fr" : String(track.px) + "px";
  }
  function normalizeGridAlignmentCss(alignment) {
    return alignment;
  }
  function GridNode({ node, slideBg, assets, path = "", box, editing, animate, frameSelected }) {
    let value = path === "";
    return SlideRendererJsx.jsx("div", {
      "data-node-path": path,
      ...dynamicStyleAttributes(node.style, animate),
      style: {
        display: "grid",
        gridTemplateColumns: node.columns.map(gridTrackCss).join(" "),
        ...node.rows !== void 0 ? {
          gridTemplateRows: node.rows.map(gridTrackCss).join(" ")
        } : {},
        columnGap: node.gap,
        rowGap: (0, runtime2.effectiveRowGap)(node),
        ...node.alignItems !== void 0 ? {
          alignItems: node.alignItems
        } : {},
        ...node.justifyItems !== void 0 ? {
          justifyItems: node.justifyItems
        } : {},
        ...textFitContainerCss(node, value, box),
        ...nodeInlineStyleCss(node.style, "slides-stack")
      },
      children: node.children.map((input, options) => SlideRendererJsx.jsx(SlideNode, {
        node: input,
        slideBg,
        assets,
        inStack: !0,
        parentAlign: node.alignItems ?? "stretch",
        parentJustify: node.justifyItems ?? "stretch",
        path: path === "" ? String(options) : path + "." + String(options),
        editing,
        animate,
        frameSelected
      }, options))
    });
  }
  function StackNode({ node, slideBg, assets, inStack = !1, parentAlign, parentJustify, path = "", editing, animate, frameSelected }) {
    let value = path === "", callback = (input) => path === "" ? String(input) : path + "." + String(input);
    return SlideRendererJsx.jsxs("div", {
      "data-node-path": path,
      ...dynamicStyleAttributes(node.style, animate),
      style: {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        ...value ? {
          width: "100%",
          height: "100%"
        } : nodePlacementCss(node, parentAlign, parentJustify),
        ...nodeInlineStyleCss(node.style, "slides-stack")
      },
      children: [
        SlideRendererJsx.jsx(SlideNode, {
          node: node.base,
          slideBg,
          assets,
          inStack,
          path: callback(0),
          box: "grow",
          editing,
          animate,
          frameSelected
        }),
        node.layers.map((input, options) => {
          let value2 = (0, runtime2.framePositionCss)({
            id: "layer",
            x: input.x,
            y: input.y,
            node: input.node
          });
          return SlideRendererJsx.jsx("div", {
            "data-overlay-layer": callback(options + 1),
            style: {
              position: "absolute",
              ...value2,
              boxSizing: "border-box"
            },
            children: SlideRendererJsx.jsx(SlideNode, {
              node: input.node,
              slideBg,
              assets,
              path: callback(options + 1),
              box: "fill",
              editing,
              animate,
              frameSelected,
              frameSize: {
                w: input.x.anchor === "fill" ? void 0 : input.x.size,
                h: input.y.anchor === "fill" ? void 0 : input.y.size
              },
              hostSized: (0, runtime2.axisSpecsAreSized)(input.x, input.y)
            })
          }, options);
        })
      ]
    });
  }
  function OverlayNode({ node, slideBg, assets, path = "", box, editing, animate, frameSelected }) {
    let value = path === "";
    return SlideRendererJsx.jsx("div", {
      "data-node-path": path,
      ...dynamicStyleAttributes(node.style, animate),
      style: {
        display: "flex",
        flexDirection: node.dir === "h" ? "row" : "column",
        ...node.wrap === !0 && node.dir === "h" ? {
          flexWrap: "wrap"
        } : {},
        alignItems: flexAlignmentCss(node.align),
        ...node.justify !== void 0 ? {
          justifyContent: flexJustificationCss(node.justify)
        } : {},
        columnGap: node.gap,
        rowGap: (0, runtime2.effectiveRowGap)(node),
        ...textFitContainerCss(node, value, box),
        ...nodeInlineStyleCss(node.style, "slides-stack")
      },
      children: node.children.map((input, options) => SlideRendererJsx.jsx(SlideNode, {
        node: input,
        slideBg,
        assets,
        inStack: !0,
        parentAlign: node.align,
        parentDir: node.dir,
        path: path === "" ? String(options) : path + "." + String(options),
        editing,
        animate,
        frameSelected
      }, options))
    });
  }
  function SlideNode({ node, slideBg, assets, inStack = !1, parentAlign, parentJustify, parentDir, path = "", box, editing, animate = !0, frameSelected, frameSize, hostSized }) {
    if (node.kind === "text") {
      let value = inStack ? parentDir === "v" ? "self" : void 0 : path === "" && frameSize?.h !== void 0 ? "parent" : void 0;
      return editing && editing.path === path ? SlideRendererJsx.jsx(EditableTextNode, {
        node,
        slideBg,
        path,
        session: editing,
        inStack,
        parentDir,
        fitBox: value
      }) : SlideRendererJsx.jsx(ReadOnlyTextNode, {
        node,
        slideBg,
        path,
        inStack,
        parentDir,
        animate,
        fitBox: value
      });
    }
    if (node.kind === "img")
      return SlideRendererJsx.jsx(ImageNode, {
        node,
        assets,
        hostSized: !inStack && hostSized === !0,
        inStack,
        parentAlign,
        parentJustify,
        path,
        animate,
        selected: frameSelected === !0
      });
    if (node.kind === "icon")
      return SlideRendererJsx.jsx(IconNode, {
        node,
        slideBg,
        inStack,
        path,
        animate
      });
    if (node.kind === "shape")
      return SlideRendererJsx.jsx(ShapeNode, {
        node,
        inStack,
        parentDir,
        path,
        frameSize,
        animate
      });
    if (node.kind === "table")
      return SlideRendererJsx.jsx(TextNode, {
        node,
        slideBg,
        path,
        editing: editing && editing.path === path ? editing : null,
        inStack,
        parentAlign,
        parentJustify,
        parentDir,
        fitBox: inStack && parentDir === "v" ? "self" : void 0
      });
    if (node.kind === "html")
      return SlideRendererJsx.jsx(HtmlEmbedNode, {
        node,
        path,
        animate,
        selected: frameSelected,
        box: frameSize
      });
    if (node.kind === "spacer")
      return node.ghost !== void 0 ? SlideRendererJsx.jsx("div", {
        style: {
          display: "contents",
          visibility: "hidden",
          pointerEvents: "none"
        },
        "aria-hidden": !0,
        children: SlideRendererJsx.jsx(SlideNode, {
          node: node.ghost,
          slideBg,
          assets,
          inStack,
          parentAlign,
          parentJustify,
          parentDir,
          path,
          box,
          animate: !1,
          frameSize
        })
      }) : SlideRendererJsx.jsx(SpacerNode, {
        node,
        path,
        showHatch: animate && frameSelected === !0
      });
    if (node.kind === "overlay")
      return SlideRendererJsx.jsx(StackNode, {
        node,
        slideBg,
        assets,
        inStack,
        parentAlign,
        parentJustify,
        path,
        editing,
        animate,
        frameSelected
      });
    if (node.kind === "grid")
      return SlideRendererJsx.jsx(GridNode, {
        node,
        slideBg,
        assets,
        path,
        box,
        editing,
        animate,
        frameSelected
      });
    let stack = SlideRendererJsx.jsx(OverlayNode, {
      node,
      slideBg,
      assets,
      path,
      box,
      editing,
      animate,
      frameSelected
    });
    return node.artifact === void 0 ? stack : SlideRendererJsx.jsx(runtime2.ArtifactLinkCardProvider, {
      card: node,
      editing: editing != null,
      children: stack
    });
  }
  function SlideFrame({ frame, zIndex, slideBg, assets, interactive, animate }) {
    let state = {
      position: "absolute",
      ...(0, runtime2.framePositionCss)(frame),
      boxSizing: "border-box"
    };
    zIndex !== void 0 && (state.zIndex = zIndex);
    let value = interactive?.editing != null && interactive.editing.frameId === frame.id ? interactive.editing : null;
    interactive && (state.cursor = "default");
    let value2 = interactive !== void 0 && (0, runtime2.isEmptyGroupBase)(frame.node) && !(0, runtime2.overlayHasVisiblePaint)(frame.node);
    value2 && (state.pointerEvents = "none");
    let value3 = interactive?.selectedFrameIds?.includes(frame.id) === !0;
    return SlideRendererJsx.jsx("div", {
      "data-frame-id": frame.id,
      style: state,
      "data-free-group": value2 ? "" : void 0,
      ref: interactive ? (input) => interactive.registerFrame(frame.id, input) : void 0,
      onPointerDown: interactive ? (input) => interactive.onFramePointerDown(frame.id, input) : void 0,
      children: SlideRendererJsx.jsx(richTextEditingContext.Provider, {
        value: value3,
        children: SlideRendererJsx.jsx(slideFrameIdContext.Provider, {
          value: frame.id,
          children: SlideRendererJsx.jsx(SlideNode, {
            node: frame.node,
            slideBg,
            assets,
            editing: value,
            animate,
            frameSelected: value3,
            frameSize: {
              w: frame.x.anchor === "fill" ? runtime2.SLIDE_WIDTH - 2 * frame.x.margin : frame.x.size,
              h: frame.y.anchor === "fill" ? runtime2.SLIDE_HEIGHT - 2 * frame.y.margin : frame.y.size
            },
            hostSized: (0, runtime2.axisSpecsAreSized)(frame.x, frame.y)
          })
        })
      })
    });
  }
  function orderedRenderedFrames(slide, containsEmbeds) {
    return containsEmbeds && slide.frames.some((input) => (0, runtime2.countNodeEmbeds)(input.node) > 0) ? slide.frames.map((input, options) => ({
      f: input,
      zIndex: options
    })).sort((input, options) => input.f.id < options.f.id ? -1 : input.f.id > options.f.id ? 1 : 0) : slide.frames.map((input) => ({
      f: input,
      zIndex: void 0
    }));
  }
  function SlideCanvas({ slide, assets, width, animate = !0, editorChrome, structure = !0, links, onLinkOpen, clips, interactive }) {
    let [value, cardWordsIds] = [
      interactive?.plainPress,
      interactive?.cardWordsIds
    ], clipFocus = SlideRendererReact.useMemo(() => ({
      sole: interactive?.soleSelected,
      cropping: interactive?.cropping
    }), [interactive?.soleSelected, interactive?.cropping]), memo4 = SlideRendererReact.useMemo(() => ({
      links,
      onLinkOpen,
      plainPress: value,
      cardWordsIds
    }), [links, onLinkOpen, value, cardWordsIds]), value2 = width / runtime2.SLIDE_WIDTH;
    return SlideRendererJsx.jsx("div", {
      ...interactive ? null : {
        "data-uncommentable": ""
      },
      style: {
        "--slide-scale": value2,
        width,
        height: width * runtime2.SLIDE_HEIGHT / runtime2.SLIDE_WIDTH,
        overflow: "clip",
        contain: "paint",
        position: "relative",
        flexShrink: 0
      },
      children: SlideRendererJsx.jsx("div", {
        style: {
          width: runtime2.SLIDE_WIDTH,
          height: runtime2.SLIDE_HEIGHT,
          transform: "scale(" + String(value2) + ")",
          transformOrigin: "top left",
          position: "absolute",
          top: 0,
          left: 0,
          background: (0, runtime2.slideBackgroundColor)(slide.bg),
          overflow: "clip",
          contain: "paint"
        },
        children: SlideRendererJsx.jsx(slideEditorChromeContext.Provider, {
          value: editorChrome === !0,
          children: SlideRendererJsx.jsx(slideStructureEnabledContext.Provider, {
            value: structure,
            children: SlideRendererJsx.jsx(slideLinkContext.Provider, {
              value: memo4,
              children: SlideRendererJsx.jsx(listRenderingContext.Provider, {
                value: slide.lists,
                children: orderedRenderedFrames(slide, animate).map(({ f, zIndex }) => SlideRendererJsx.jsx(SlideFrame, {
                  frame: f,
                  zIndex,
                  slideBg: slide.bg,
                  assets,
                  interactive,
                  animate
                }, f.id))
              })
            })
          })
        })
      })
    });
  }
  function SlideSurface({ slide, assets, animate = !0, editorChrome, structure = !0, links, onLinkOpen, clips, bgOverride, underlay }) {
    let memo4 = SlideRendererReact.useMemo(() => ({
      links,
      onLinkOpen
    }), [links, onLinkOpen]);
    return SlideRendererJsx.jsxs("div", {
      "data-uncommentable": "",
      style: {
        width: runtime2.SLIDE_WIDTH,
        height: runtime2.SLIDE_HEIGHT,
        position: "relative",
        background: bgOverride ?? (0, runtime2.slideBackgroundColor)(slide.bg),
        overflow: "clip",
        contain: "paint"
      },
      children: [
        underlay,
        SlideRendererJsx.jsx(slideEditorChromeContext.Provider, {
          value: editorChrome === !0,
          children: SlideRendererJsx.jsx(slideStructureEnabledContext.Provider, {
            value: structure,
            children: SlideRendererJsx.jsx(slideLinkContext.Provider, {
              value: memo4,
              children: SlideRendererJsx.jsx(listRenderingContext.Provider, {
                value: slide.lists,
                children: orderedRenderedFrames(slide, animate).map(({ f, zIndex }) => SlideRendererJsx.jsx(SlideFrame, {
                  frame: f,
                  zIndex,
                  slideBg: slide.bg,
                  assets,
                  interactive: void 0,
                  animate
                }, f.id))
              })
            })
          })
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "nodeInlineStyleCss", () => nodeInlineStyleCss), bindRuntimeValue(runtime2, "dynamicStyleAttributes", () => dynamicStyleAttributes), bindRuntimeValue(runtime2, "flexAlignmentCss", () => flexAlignmentCss), bindRuntimeValue(runtime2, "flexJustificationCss", () => flexJustificationCss), bindRuntimeValue(runtime2, "hasTextFitCssVariable", () => hasTextFitCssVariable), bindRuntimeValue(runtime2, "applyTextFitCssVariable", () => applyTextFitCssVariable), bindRuntimeValue(runtime2, "positiveFontSizePx", () => positiveFontSizePx), bindRuntimeValue(runtime2, "shouldPinShrinkBasis", () => shouldPinShrinkBasis), bindRuntimeValue(runtime2, "useTextFit", () => useTextFit), bindRuntimeValue(runtime2, "textFitContainerCss", () => textFitContainerCss), bindRuntimeValue(runtime2, "nodePlacementCss", () => nodePlacementCss), bindRuntimeValue(runtime2, "resolveImageUrl", () => resolveImageUrl), bindRuntimeValue(runtime2, "classifyRenderedLink", () => classifyRenderedLink), bindRuntimeValue(runtime2, "headingLevelForTextNode", () => headingLevelForTextNode), bindRuntimeValue(runtime2, "MediaPlaceholder", () => MediaPlaceholder), bindRuntimeValue(runtime2, "HtmlEmbedNode", () => HtmlEmbedNode), bindRuntimeValue(runtime2, "ensureShapeStyles", () => ensureShapeStyles), bindRuntimeValue(runtime2, "IconNode", () => IconNode), bindRuntimeValue(runtime2, "shadowDropFilter", () => shadowDropFilter), bindRuntimeValue(runtime2, "strokeDashArray", () => strokeDashArray), bindRuntimeValue(runtime2, "ShapeNode", () => ShapeNode), bindRuntimeValue(runtime2, "useElementContentSize", () => useElementContentSize), bindRuntimeValue(runtime2, "ConnectorShape", () => ConnectorShape), bindRuntimeValue(runtime2, "PolygonShape", () => PolygonShape), bindRuntimeValue(runtime2, "ImageNode", () => ImageNode), bindRuntimeValue(runtime2, "isLinkSelectShortcut", () => isLinkSelectShortcut), bindRuntimeValue(runtime2, "RichTextLines", () => RichTextLines), bindRuntimeValue(runtime2, "prefersReducedMotion", () => prefersReducedMotion), bindRuntimeValue(runtime2, "hexColorRgba", () => hexColorRgba), bindRuntimeValue(runtime2, "TextNode", () => TextNode), bindRuntimeValue(runtime2, "useRichTextFormatInput", () => useRichTextFormatInput), bindRuntimeValue(runtime2, "useEditableTextFocus", () => useEditableTextFocus), bindRuntimeValue(runtime2, "linkUrlFromTitle", () => linkUrlFromTitle), bindRuntimeValue(runtime2, "useEditableLinkPress", () => useEditableLinkPress), bindRuntimeValue(runtime2, "RichTextRuns", () => RichTextRuns), bindRuntimeValue(runtime2, "RichTextContent", () => RichTextContent), bindRuntimeValue(runtime2, "renderedTextCss", () => renderedTextCss), bindRuntimeValue(runtime2, "ReadOnlyTextNode", () => ReadOnlyTextNode), bindRuntimeValue(runtime2, "useImeGuard", () => useImeGuard), bindRuntimeValue(runtime2, "EditableTextNode", () => EditableTextNode), bindRuntimeValue(runtime2, "EditableTableCell", () => EditableTableCell), bindRuntimeValue(runtime2, "SpacerNode", () => SpacerNode), bindRuntimeValue(runtime2, "gridTrackCss", () => gridTrackCss), bindRuntimeValue(runtime2, "normalizeGridAlignmentCss", () => normalizeGridAlignmentCss), bindRuntimeValue(runtime2, "GridNode", () => GridNode), bindRuntimeValue(runtime2, "StackNode", () => StackNode), bindRuntimeValue(runtime2, "OverlayNode", () => OverlayNode), bindRuntimeValue(runtime2, "SlideNode", () => SlideNode), bindRuntimeValue(runtime2, "SlideFrame", () => SlideFrame), bindRuntimeValue(runtime2, "orderedRenderedFrames", () => orderedRenderedFrames), bindRuntimeValue(runtime2, "SlideCanvas", () => SlideCanvas), bindRuntimeValue(runtime2, "SlideSurface", () => SlideSurface), bindRuntimeValue(runtime2, "SlideRendererReact", () => SlideRendererReact, (value) => {
    SlideRendererReact = value;
  }), bindRuntimeValue(runtime2, "SlideRendererReactDom", () => SlideRendererReactDom, (value) => {
    SlideRendererReactDom = value;
  }), bindRuntimeValue(runtime2, "SlideRendererJsx", () => SlideRendererJsx, (value) => {
    SlideRendererJsx = value;
  }), bindRuntimeValue(runtime2, "textFitScaleVariable", () => textFitScaleVariable, (value) => {
    textFitScaleVariable = value;
  }), bindRuntimeValue(runtime2, "textFitFontSizeVariable", () => textFitFontSizeVariable, (value) => {
    textFitFontSizeVariable = value;
  }), bindRuntimeValue(runtime2, "textFitClipVariable", () => textFitClipVariable, (value) => {
    textFitClipVariable = value;
  }), bindRuntimeValue(runtime2, "slideEditorChromeContext", () => slideEditorChromeContext, (value) => {
    slideEditorChromeContext = value;
  }), bindRuntimeValue(runtime2, "slideStructureEnabledContext", () => slideStructureEnabledContext, (value) => {
    slideStructureEnabledContext = value;
  }), bindRuntimeValue(runtime2, "linkModifierKeyLabel", () => linkModifierKeyLabel, (value) => {
    linkModifierKeyLabel = value;
  }), bindRuntimeValue(runtime2, "linkModifierPressHint", () => linkModifierPressHint, (value) => {
    linkModifierPressHint = value;
  }), bindRuntimeValue(runtime2, "richTextDoubleTapWindowMs", () => richTextDoubleTapWindowMs, (value) => {
    richTextDoubleTapWindowMs = value;
  }), bindRuntimeValue(runtime2, "renderedLinkOptions", () => renderedLinkOptions, (value) => {
    renderedLinkOptions = value;
  }), bindRuntimeValue(runtime2, "pointerClickMovementTolerance", () => pointerClickMovementTolerance, (value) => {
    pointerClickMovementTolerance = value;
  }), bindRuntimeValue(runtime2, "pointerPositionForMouse", () => pointerPositionForMouse, (value) => {
    pointerPositionForMouse = value;
  }), bindRuntimeValue(runtime2, "pointerClickMoved", () => pointerClickMoved, (value) => {
    pointerClickMoved = value;
  }), bindRuntimeValue(runtime2, "pointerHasLinkModifier", () => pointerHasLinkModifier, (value) => {
    pointerHasLinkModifier = value;
  }), bindRuntimeValue(runtime2, "slideLinkContext", () => slideLinkContext, (value) => {
    slideLinkContext = value;
  }), bindRuntimeValue(runtime2, "richTextEditingContext", () => richTextEditingContext, (value) => {
    richTextEditingContext = value;
  }), bindRuntimeValue(runtime2, "listRenderingContext", () => listRenderingContext, (value) => {
    listRenderingContext = value;
  }), bindRuntimeValue(runtime2, "mediaPlaceholderLabelCss", () => mediaPlaceholderLabelCss, (value) => {
    mediaPlaceholderLabelCss = value;
  }), bindRuntimeValue(runtime2, "transparencyCheckerboardGradient", () => transparencyCheckerboardGradient, (value) => {
    transparencyCheckerboardGradient = value;
  }), bindRuntimeValue(runtime2, "allowEmbedScripts", () => allowEmbedScripts, (value) => {
    allowEmbedScripts = value;
  }), bindRuntimeValue(runtime2, "htmlEmbedMarkerAttribute", () => htmlEmbedMarkerAttribute, (value) => {
    htmlEmbedMarkerAttribute = value;
  }), bindRuntimeValue(runtime2, "embedsDisabledEventName", () => embedsDisabledEventName, (value) => {
    embedsDisabledEventName = value;
  }), bindRuntimeValue(runtime2, "slideEmbedGuardConfig", () => slideEmbedGuardConfig, (value) => {
    slideEmbedGuardConfig = value;
  }), bindRuntimeValue(runtime2, "slideEmbedContentSecurityPolicy", () => slideEmbedContentSecurityPolicy, (value) => {
    slideEmbedContentSecurityPolicy = value;
  }), bindRuntimeValue(runtime2, "shapeStyleElementId", () => shapeStyleElementId, (value) => {
    shapeStyleElementId = value;
  }), bindRuntimeValue(runtime2, "shapeStylesCss", () => shapeStylesCss, (value) => {
    shapeStylesCss = value;
  }), bindRuntimeValue(runtime2, "shapeClipPaths", () => shapeClipPaths, (value) => {
    shapeClipPaths = value;
  }), bindRuntimeValue(runtime2, "slideFrameIdContext", () => slideFrameIdContext, (value) => {
    slideFrameIdContext = value;
  }), bindRuntimeValue(runtime2, "supportsPlaintextContentEditable", () => supportsPlaintextContentEditable, (value) => {
    supportsPlaintextContentEditable = value;
  }), bindRuntimeValue(runtime2, "linkDoublePressTimeoutMs", () => linkDoublePressTimeoutMs, (value) => {
    linkDoublePressTimeoutMs = value;
  }), bindRuntimeValue(runtime2, "plaintextPasteFallback", () => plaintextPasteFallback, (value) => {
    plaintextPasteFallback = value;
  }), bindRuntimeValue(runtime2, "preventDefaultInput", () => preventDefaultInput, (value) => {
    preventDefaultInput = value;
  }), bindRuntimeValue(runtime2, "pasteRichTextPlaintext", () => pasteRichTextPlaintext, (value) => {
    pasteRichTextPlaintext = value;
  }), bindRuntimeValue(runtime2, "listIndentFallback", () => listIndentFallback, (value) => {
    listIndentFallback = value;
  }), bindRuntimeValue(runtime2, "editableFocusTimeoutMs", () => editableFocusTimeoutMs, (value) => {
    editableFocusTimeoutMs = value;
  }), bindRuntimeValue(runtime2, "initializeSlideRenderer", () => initializeSlideRenderer, (value) => {
    initializeSlideRenderer = value;
  }), () => {
    textFitScaleVariable = "--fit", textFitFontSizeVariable = "--fit-size", textFitClipVariable = "--fit-clip", linkModifierKeyLabel = () => (0, runtime2.isApplePlatform)() ? "⌘" : "Ctrl", linkModifierPressHint = () => linkModifierKeyLabel() + "-click to open: ", richTextDoubleTapWindowMs = 300, pointerClickMovementTolerance = 4, pointerPositionForMouse = (input) => input.pointerType === "touch" ? null : {
      x: input.clientX,
      y: input.clientY
    }, pointerClickMoved = (input, options) => options.detail !== 0 && input !== null && Math.hypot(options.clientX - input.x, options.clientY - input.y) > pointerClickMovementTolerance, pointerHasLinkModifier = (input) => input.metaKey || input.ctrlKey && !(0, runtime2.isApplePlatform)(), transparencyCheckerboardGradient = "repeating-conic-gradient(#d7d6d1 0 25%, #ffffff 0 50%)", allowEmbedScripts = !0, htmlEmbedMarkerAttribute = "data-embed-frame", embedsDisabledEventName = "slides-embeds-disabled", shapeStyleElementId = "mc-anthropicons", linkDoublePressTimeoutMs = 700, preventDefaultInput = (event) => {
      event.preventDefault();
    }, pasteRichTextPlaintext = (event) => {
      event.preventDefault();
      let value = event.clipboardData.getData("text/plain"), value2 = window.getSelection(), value3 = value2 !== null && value2.rangeCount > 0 && !value2.isCollapsed && event.currentTarget.contains(value2.getRangeAt(0).startContainer) && event.currentTarget.contains(value2.getRangeAt(0).endContainer), value4 = value.trim();
      if (value3 && (0, runtime2.isSafeHyperlink)(value4)) {
        (0, runtime2.executeRichTextCommand)("createLink", value4);
        return;
      }
      document.execCommand("insertText", !1, value);
    }, listIndentFallback = (node, lists) => node.lineLists !== void 0 ? (0, runtime2.listIndentCss)(node, lists) : lists === "css" ? 0 : "1.2em", editableFocusTimeoutMs = 500, initializeSlideRenderer = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeRichTextDom)(), (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeObjectNavigation)(), (0, runtime2.initializeModelSelection)(), (0, runtime2.initializeImageCrop)(), (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializePreloadSheets)(), (0, runtime2.initializeUiAnnouncements)(), (0, runtime2.initializeVideoLinks)(), (0, runtime2.initializeArtifactLinkCards)(), (0, runtime2.initializeArtifactLinkCardViews)(), (0, runtime2.initializeExternalLinks)(), (0, runtime2.initializeModelGeometry)(), (0, runtime2.initializeRenderingTheme)(), (0, runtime2.initializeModelSelection)(), (0, runtime2.initializeStyleSchema)(), (0, runtime2.initializeEmbeds)(), (0, runtime2.initializeIconFont)(), (0, runtime2.initializeSlideSnapshots)(), SlideRendererReact = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), SlideRendererReactDom = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactDomNamespace)(), 1), SlideRendererJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), slideEditorChromeContext = SlideRendererReact.createContext(!1), slideStructureEnabledContext = SlideRendererReact.createContext(!0), renderedLinkOptions = {
        storedUrl: !0
      }, slideLinkContext = SlideRendererReact.createContext({}), richTextEditingContext = SlideRendererReact.createContext(!1), slideFrameIdContext = SlideRendererReact.createContext(""), listRenderingContext = SlideRendererReact.createContext(void 0), mediaPlaceholderLabelCss = {
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: 3,
        overflow: "hidden",
        wordBreak: "break-all"
      }, slideEmbedGuardConfig = {
        markerAttr: htmlEmbedMarkerAttribute,
        disabledEvent: embedsDisabledEventName
      }, slideEmbedContentSecurityPolicy = (0, runtime2.embedContentSecurityPolicy)(allowEmbedScripts), shapeStylesCss = "@font-face{font-family:'mc-anthropicons';src:url('" + runtime2.iconFontCss + "') format('woff2');font-display:block}", shapeClipPaths = {
        diamond: "50,0 100,50 50,100 0,50",
        "arrow-right": "0,30 60,30 60,10 100,50 60,90 60,70 0,70",
        "arrow-left": "100,30 40,30 40,10 0,50 40,90 40,70 100,70",
        "arrow-up": "30,100 30,40 10,40 50,0 90,40 70,40 70,100",
        "arrow-down": "30,0 30,60 10,60 50,100 90,60 70,60 70,0"
      }, supportsPlaintextContentEditable = (() => {
        if (typeof document > "u")
          return !1;
        let value = document.createElement("div");
        try {
          value.contentEditable = "plaintext-only";
        } catch {
          return !1;
        }
        return value.contentEditable === "plaintext-only";
      })(), plaintextPasteFallback = supportsPlaintextContentEditable ? void 0 : (event) => {
        event.preventDefault();
        let value = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", !1, value);
      };
    });
  };
}
export {
  installRenderingSlides
};
