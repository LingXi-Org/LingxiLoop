// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiContrastControls(runtime2) {
  var reactForUiContrastControls, jsxForUiContrastControls, opaqueContrastColor, contrastVerdictClass, initializeUiContrastControls;
  function contrastDisplayInfo(results) {
    let value = (0, runtime2.worstContrastResult)(results), value2 = results.filter((input) => input !== value), items = [
      value,
      ...value2.sort((input, options) => input.ratio - options.ratio)
    ], state = {
      ratio: (0, runtime2.contrastRatioSpoken)(value.ratio),
      ground: value.ground.label,
      passes: value.passes,
      min: (0, runtime2.contrastRatioSpoken)(value.min),
      alsoPassing: value2.filter((input) => input.passes).length
    }, value3 = value2.filter((input) => !input.passes), value4 = (0, runtime2.contrastResultCountSummary)({
      ...state,
      alsoFailing: value3.length
    }), value5 = value4.length - runtime2.MAX_ANNOUNCEMENT_LENGTH;
    if (value5 > 0) {
      let value6 = state.ground.slice(0, Math.max(1, state.ground.length - value5 - 1)).replace(/[\uD800-\uDBFF]$/, "");
      value4 = (0, runtime2.contrastResultCountSummary)({
        ...state,
        ground: value6 + "…",
        alsoFailing: value3.length
      });
    }
    return {
      worst: value,
      title: items.map((input) => (0, runtime2.contrastRatioReadout)(input.ratio) + " " + runtime2.CONTRAST_GROUND_PREPOSITION + " " + input.ground.label).join(" · "),
      sentence: (0, runtime2.contrastResultDetails)({
        ...state,
        alsoFailing: value3.map((input) => input.ground.label)
      }),
      spoken: value4
    };
  }
  function contrastRgbCss(color) {
    if (color === void 0)
      return;
    let callback = (input) => Math.round(input * 255);
    return "rgb(" + String(callback(color.r)) + " " + String(callback(color.g)) + " " + String(callback(color.b)) + " / " + String(Math.round(color.a * 1e3) / 1e3) + ")";
  }
  function ContrastMark({ results, sentence = !0, className }) {
    let value = contrastDisplayInfo(results), worst = value.worst;
    return jsxForUiContrastControls.jsxs("span", {
      "data-kit": "contrast-mark",
      "data-verdict": worst.passes ? "pass" : "fail",
      title: value.title,
      "aria-hidden": sentence ? void 0 : !0,
      className: (0, runtime2.joinClassNames)("inline-flex shrink-0 items-center gap-0.5 text-caption", contrastVerdictClass(worst.passes), className),
      children: [
        jsxForUiContrastControls.jsxs("span", {
          "aria-hidden": "true",
          className: "flex items-center gap-0.5",
          children: [
            jsxForUiContrastControls.jsx(runtime2.Icon, {
              name: worst.passes ? "Check" : "Warning",
              size: "xs"
            }),
            jsxForUiContrastControls.jsx("span", {
              className: "tabular-nums",
              children: (0, runtime2.contrastRatioReadout)(worst.ratio)
            })
          ]
        }),
        sentence ? jsxForUiContrastControls.jsx("span", {
          className: "sr-only",
          children: value.sentence
        }) : null
      ]
    });
  }
  function ContrastLockup({ fg: fg2, results, className }) {
    let value = contrastDisplayInfo(results), worst = value.worst;
    return jsxForUiContrastControls.jsxs("span", {
      "data-kit": "contrast-lockup",
      "data-verdict": worst.passes ? "pass" : "fail",
      "aria-hidden": "true",
      title: value.title,
      className: (0, runtime2.joinClassNames)("inline-flex min-w-0 items-center gap-1.5 text-caption leading-4", className),
      children: [
        jsxForUiContrastControls.jsx("span", {
          "data-kit": "contrast-swatch",
          className: "inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] shadow-card-ring",
          style: {
            backgroundColor: contrastRgbCss(opaqueContrastColor((0, runtime2.parseContrastColor)(worst.ground.css))),
            color: contrastRgbCss(typeof fg2 == "string" ? (0, runtime2.parseContrastColor)(fg2) : fg2)
          },
          children: jsxForUiContrastControls.jsx(runtime2.Icon, {
            name: "TextAa",
            size: "xs"
          })
        }),
        jsxForUiContrastControls.jsx("span", {
          className: worst.passes ? "text-primary" : "text-warning",
          children: worst.passes ? runtime2.CONTRAST_PASSES_LABEL : runtime2.CONTRAST_FAILS_LABEL
        })
      ]
    });
  }
  function ContrastColorDetails({ fg: fg2, results, sentenceId, fix, fixHeld = !1, fixRef, onFixGoneFocused }) {
    let value = contrastDisplayInfo(results), worst = value.worst;
    return jsxForUiContrastControls.jsxs("div", {
      className: "mt-1.5 flex min-h-4 min-w-0 flex-wrap items-center gap-x-2 gap-y-1",
      children: [
        jsxForUiContrastControls.jsxs("span", {
          "data-kit": "contrast-readout",
          "data-verdict": worst.passes ? "pass" : "fail",
          className: "inline-flex min-w-0 items-center",
          children: [
            jsxForUiContrastControls.jsx(ContrastLockup, {
              fg: fg2,
              results
            }),
            jsxForUiContrastControls.jsx("span", {
              id: sentenceId,
              className: "sr-only",
              children: value.sentence
            })
          ]
        }),
        fix !== void 0 ? jsxForUiContrastControls.jsx(ContrastFixButton, {
          fix,
          held: fixHeld,
          rootRef: fixRef,
          onGoneFocused: onFixGoneFocused
        }) : null
      ]
    });
  }
  function ContrastFixButton({ fix, held = !1, rootRef, onGoneFocused }) {
    let value = reactForUiContrastControls.useId(), ref = reactForUiContrastControls.useRef(!1), ref2 = reactForUiContrastControls.useRef(null), callback = reactForUiContrastControls.useCallback((input) => {
      ref2.current = input, typeof rootRef == "function" ? rootRef(input) : rootRef && (rootRef.current = input);
    }, [rootRef]), ref3 = reactForUiContrastControls.useRef(!1), ref4 = reactForUiContrastControls.useRef(held);
    ref4.current = held;
    let ref5 = reactForUiContrastControls.useRef(onGoneFocused);
    return ref5.current = onGoneFocused, reactForUiContrastControls.useLayoutEffect(() => () => {
      ref3.current || ref4.current || ref2.current === null || ref2.current.contains(document.activeElement) && ref5.current?.();
    }, []), jsxForUiContrastControls.jsxs("span", {
      ref: callback,
      "data-kit": "contrast-fix",
      "data-shade": fix.css,
      "aria-hidden": held ? !0 : void 0,
      className: (0, runtime2.joinClassNames)("inline-flex min-w-0 items-center", held && "invisible"),
      children: [
        jsxForUiContrastControls.jsx(runtime2.Button, {
          variant: "secondary",
          title: fix.css + " · " + (0, runtime2.contrastRatioReadout)(fix.ratio) + " " + runtime2.CONTRAST_GROUND_PREPOSITION + " " + fix.ground,
          "aria-describedby": value,
          disabled: held,
          onPointerDown: (input) => {
            ref.current = input.pointerType === "touch";
          },
          onClick: () => {
            let current = ref.current;
            ref.current = !1, ref3.current = current, fix.onUse(current);
          },
          children: runtime2.COLOR_FIX_LABEL
        }),
        jsxForUiContrastControls.jsx("span", {
          id: value,
          className: "sr-only",
          children: (0, runtime2.contrastFixDescription)({
            hex: fix.css,
            ratio: (0, runtime2.contrastRatioSpoken)(fix.ratio),
            ground: fix.ground
          })
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "contrastDisplayInfo", () => contrastDisplayInfo), bindRuntimeValue(runtime2, "contrastRgbCss", () => contrastRgbCss), bindRuntimeValue(runtime2, "ContrastMark", () => ContrastMark), bindRuntimeValue(runtime2, "ContrastLockup", () => ContrastLockup), bindRuntimeValue(runtime2, "ContrastColorDetails", () => ContrastColorDetails), bindRuntimeValue(runtime2, "ContrastFixButton", () => ContrastFixButton), bindRuntimeValue(runtime2, "reactForUiContrastControls", () => reactForUiContrastControls, (value) => {
    reactForUiContrastControls = value;
  }), bindRuntimeValue(runtime2, "jsxForUiContrastControls", () => jsxForUiContrastControls, (value) => {
    jsxForUiContrastControls = value;
  }), bindRuntimeValue(runtime2, "opaqueContrastColor", () => opaqueContrastColor, (value) => {
    opaqueContrastColor = value;
  }), bindRuntimeValue(runtime2, "contrastVerdictClass", () => contrastVerdictClass, (value) => {
    contrastVerdictClass = value;
  }), bindRuntimeValue(runtime2, "initializeUiContrastControls", () => initializeUiContrastControls, (value) => {
    initializeUiContrastControls = value;
  }), () => {
    opaqueContrastColor = (color) => color === void 0 ? void 0 : {
      ...color,
      a: 1
    }, contrastVerdictClass = (passes) => passes ? "text-secondary" : "text-warning", initializeUiContrastControls = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeUiInputs210)(), (0, runtime2.initializeUiContrast)(), (0, runtime2.initializeUiAnnouncements)(), (0, runtime2.initializeUiPropertyLabels)(), reactForUiContrastControls = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiContrastControls = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
    });
  };
}
export {
  installUiContrastControls
};
