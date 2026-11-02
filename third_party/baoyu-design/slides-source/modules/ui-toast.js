// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installUiToast(runtime2) {
  var reactg6, jsxt5, DEFAULT_TOAST_TIMEOUT_MS, TOAST_TRANSITION_TIMEOUT_MS, toastSurfaceClasses, toastVariantClasses, toastStackedVariantClasses, toastDescriptionClasses, toastVariantTextClasses, toastDefaultIconNames, toastSecondaryTextClasses, toastStackTransformClasses, toastContentClasses, toastBodyClasses, toastDismissButtonClasses, emptyToastList, pinnedToastContext, noopToastPinSetter, initializeUiToast, reactForUiToast, jsxForUiToast, FIELD_LABEL_LAYOUT_CLASSES, FieldRoot3, FieldLabel3, FieldDescription3, FieldError3, FieldRootWithLabel, FieldRow, initializeUiToast2, FIELD_MESSAGE_CLASSES, fieldErrorIcon;
  function normalizeToastTimeout(timeout) {
    return timeout === void 0 || timeout <= 0 ? timeout : Number.isFinite(timeout) ? timeout < 6e3 ? DEFAULT_TOAST_TIMEOUT_MS : timeout : 0;
  }
  function ToastView({ toast, front, frontHeight, zIndex }) {
    let value = toast.data?.variant ?? toast.type ?? "neutral", value2 = toast.data?.icon, value3 = value2 != null && typeof value2 != "boolean", value4 = !front, value5 = value4 && frontHeight ? frontHeight : void 0, value6 = (0, runtime2.useTranslation)("dismiss", "Dismiss"), { update: value7 } = runtime2.baseToast.useToastManager(), value8 = reactg6.useContext(pinnedToastContext), ref = reactg6.useRef(null), ref2 = reactg6.useRef(""), value9 = toast.data?.titleNode, value10 = toast.data?.count ?? 1, id = toast.id, callback = () => {
      let value16 = value8?.userDismissAt, value17 = Date.now();
      for (let [value18, value19] of value16 ?? [])
        value17 - value19 > TOAST_TRANSITION_TIMEOUT_MS && value16?.delete(value18);
      value16?.set(id, value17);
    };
    reactg6.useLayoutEffect(() => {
      let current = ref.current;
      if (value9 === void 0 || !current)
        return;
      let callback2 = () => {
        let value16 = current.textContent ?? "";
        value16 !== ref2.current && (ref2.current = value16, value7(id, {
          title: value16
        }));
      };
      callback2();
      let observer = new MutationObserver(callback2);
      return observer.observe(current, {
        characterData: !0,
        childList: !0,
        subtree: !0
      }), () => observer.disconnect();
    }, [value9, id, value7]);
    let value11 = toast.transitionStatus === "ending", [value12, value13] = reactg6.useState({
      behind: value4,
      lockedHeight: value5
    });
    !value11 && (value12.behind !== value4 || value12.lockedHeight !== value5) && value13({
      behind: value4,
      lockedHeight: value5
    });
    let value14 = value11 ? value12.behind : value4, value15 = value11 ? value12.lockedHeight : value5;
    return jsxt5.jsx(runtime2.baseToast.Root, {
      toast,
      swipeDirection: emptyToastList,
      className: toastStackTransformClasses,
      style: {
        zIndex
      },
      onKeyDown: (input) => {
        input.key === "Escape" && input.currentTarget.contains(input.currentTarget.ownerDocument.activeElement) && callback();
      },
      children: jsxt5.jsx("div", {
        className: `${toastSurfaceClasses} ${toastVariantClasses[value]} ${toastStackedVariantClasses[value]} ${toastVariantTextClasses[value]}`,
        children: jsxt5.jsxs("div", {
          className: toastContentClasses,
          "data-behind": value14 ? "" : void 0,
          style: value15 !== void 0 ? {
            height: value15
          } : void 0,
          children: [
            value2 !== null && jsxt5.jsx("span", {
              className: `shrink-0 ${toastSecondaryTextClasses[value]}`,
              children: value3 ? value2 : jsxt5.jsx(runtime2.Icon, {
                name: toastDefaultIconNames[value],
                size: "md"
              })
            }),
            jsxt5.jsxs("div", {
              className: toastBodyClasses,
              children: [
                jsxt5.jsxs(runtime2.baseToast.Title, {
                  className: "font-medium",
                  "aria-atomic": "true",
                  children: [
                    jsxt5.jsx("span", {
                      ref,
                      children: value9 ?? toast.data?.baseTitle
                    }),
                    value10 > 1 && jsxt5.jsx("span", {
                      "aria-live": value10 > 2 ? "off" : void 0,
                      "data-cds-toast-count": "",
                      children: ` (×${value10})`
                    })
                  ]
                }),
                jsxt5.jsx(runtime2.baseToast.Description, {
                  className: toastDescriptionClasses
                }),
                toast.data?.action && jsxt5.jsx("div", {
                  className: "mt-pad-md empty:hidden",
                  children: toast.data.action
                })
              ]
            }),
            jsxt5.jsx(runtime2.baseToast.Close, {
              "aria-label": value6,
              className: toastDismissButtonClasses,
              onClick: callback,
              children: jsxt5.jsx(runtime2.Icon, {
                name: "X",
                size: "sm"
              })
            })
          ]
        })
      })
    });
  }
  function PinnedToastView({ pinned, onDismiss }) {
    let value = pinned.variant ?? "neutral", value2 = (0, runtime2.useTranslation)("dismiss", "Dismiss");
    return jsxt5.jsx("div", {
      "data-pinned": "",
      className: `pointer-events-auto relative w-full ${toastSurfaceClasses} ${toastVariantClasses[value]} ${toastStackedVariantClasses[value]} ${toastVariantTextClasses[value]}`,
      children: jsxt5.jsxs("div", {
        className: toastContentClasses,
        children: [
          jsxt5.jsx("span", {
            className: `shrink-0 ${toastSecondaryTextClasses[value]}`,
            children: jsxt5.jsx(runtime2.Icon, {
              name: toastDefaultIconNames[value],
              size: "md"
            })
          }),
          jsxt5.jsxs("div", {
            className: toastBodyClasses,
            children: [
              jsxt5.jsx("div", {
                className: "font-medium",
                children: pinned.title
              }),
              pinned.description && jsxt5.jsx("div", {
                className: toastDescriptionClasses,
                children: pinned.description
              }),
              pinned.action && jsxt5.jsx("div", {
                className: "mt-pad-md empty:hidden",
                children: pinned.action
              })
            ]
          }),
          pinned.dismissible && jsxt5.jsx("button", {
            type: "button",
            "aria-label": pinned.dismissLabel ?? value2,
            onClick: onDismiss,
            className: toastDismissButtonClasses,
            children: jsxt5.jsx(runtime2.Icon, {
              name: "X",
              size: "sm"
            })
          })
        ]
      })
    });
  }
  function containsVisibleFocus(input) {
    let value = input?.ownerDocument.activeElement;
    if (!input || !value || !input.contains(value))
      return !1;
    try {
      return value.matches(":focus-visible");
    } catch {
      return !0;
    }
  }
  function PinnedToastSlot({ ctx }) {
    let { pinned: value, setPinned: value2, slotRef: value3, focusWasInsideRef: value4 } = ctx, ref = reactg6.useRef(null);
    return reactg6.useEffect(() => {
      let current = value3.current;
      if (!current)
        return;
      let ownerDocument2 = current.ownerDocument, callback = (event) => {
        let target = event.target;
        target && typeof target.focus == "function" && !current.contains(target) && (ref.current = target);
      };
      return ownerDocument2.addEventListener("focusin", callback), () => ownerDocument2.removeEventListener("focusin", callback);
    }, [value3]), reactg6.useLayoutEffect(() => {
      let current = value3.current;
      if (!current || !value4.current || (value4.current = !1, current.contains(current.ownerDocument.activeElement)))
        return;
      let current2 = ref.current;
      current2?.isConnected && current2.focus({
        preventScroll: !0
      });
    }, [value, value3, value4]), jsxt5.jsx("div", {
      ref: (input) => {
        value3.current = input;
      },
      role: "status",
      "aria-live": "polite",
      className: value ? "w-full" : "sr-only",
      onKeyDown: (event) => {
        event.key === "Escape" && !event.defaultPrevented && !event.nativeEvent.isComposing && value?.dismissible && event.currentTarget.contains(event.currentTarget.ownerDocument.activeElement) && value2(null);
      },
      children: value && jsxt5.jsx(PinnedToastView, {
        pinned: value,
        onDismiss: () => value2(null)
      })
    });
  }
  function ToastViewport3({ className }) {
    let { toasts: value } = runtime2.baseToast.useToastManager(), value2 = reactg6.useContext(pinnedToastContext);
    (0, runtime2.useIsomorphicLayoutEffect)(() => {
      value2?.syncLiveToasts(value);
    }, [value, value2]);
    let value3 = value.find((input) => input.transitionStatus !== "ending");
    return jsxt5.jsx(runtime2.baseToast.Portal, {
      children: jsxt5.jsx(runtime2.PortalRoot, {
        surface: runtime2.elevationSurfaceNames.popover,
        children: jsxt5.jsxs(runtime2.CdsLayer, {
          base: runtime2.TOAST_LAYER_BASE,
          render: jsxt5.jsx("div", {
            "data-cds": "Toast",
            className: (0, runtime2.cn)("cds-reset pointer-events-none fixed right-4 bottom-4 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col-reverse gap-md [&:where(:root[dir=rtl]_:dir(rtl))]:right-auto [&:where(:root[dir=rtl]_:dir(rtl))]:left-4", className)
          }),
          children: [
            value2 && jsxt5.jsx(PinnedToastSlot, {
              ctx: value2
            }),
            jsxt5.jsx(runtime2.baseToast.Viewport, {
              className: "pointer-events-auto relative outline-none focus-visible:outline-hidden",
              style: {
                height: value3?.height
              },
              children: value.map((input, options) => jsxt5.jsx(ToastView, {
                toast: input,
                front: input === value3,
                frontHeight: value3?.height,
                zIndex: value.length - options
              }, input.id))
            })
          ]
        })
      })
    });
  }
  function createToastMovementState() {
    let nextId = 0;
    return {
      allocId: () => `cds-toast-${++nextId}`,
      movingIds: /* @__PURE__ */ new Set(),
      userDismissAt: /* @__PURE__ */ new Map()
    };
  }
  function ToastProvider3({ children, timeout = DEFAULT_TOAST_TIMEOUT_MS, autoDismiss = !0, limit, viewportClassName }) {
    let [value, value2] = reactg6.useState(null), ref = reactg6.useRef(value), ref2 = reactg6.useRef(null), ref3 = reactg6.useRef(!1), callback = reactg6.useCallback((input) => {
      let current = ref.current;
      ref.current = input, current !== input && !ref3.current && (ref3.current = containsVisibleFocus(ref2.current)), value2(input), current && current !== input && current.onClose?.();
    }, []), ref4 = reactg6.useRef([]), callback2 = reactg6.useCallback((input) => {
      ref4.current = input;
    }, []), [value3] = reactg6.useState(createToastMovementState), memo4 = reactg6.useMemo(() => normalizeToastTimeout(timeout), [timeout]), memo22 = reactg6.useMemo(() => ({
      pinned: value,
      setPinned: callback,
      slotRef: ref2,
      focusWasInsideRef: ref3,
      liveToasts: ref4,
      syncLiveToasts: callback2,
      defaultTimeout: memo4,
      autoDismiss,
      ...value3
    }), [value, callback, callback2, memo4, autoDismiss, value3]);
    return jsxt5.jsx(runtime2.baseToast.Provider, {
      timeout: memo4,
      limit,
      children: jsxt5.jsxs(pinnedToastContext.Provider, {
        value: memo22,
        children: [
          children,
          jsxt5.jsx(ToastViewport3, {
            className: viewportClassName
          })
        ]
      })
    });
  }
  function useToastNotifications() {
    let value = runtime2.baseToast.useToastManager(), value2 = reactg6.useContext(pinnedToastContext), add = reactg6.useCallback(({ title, description, variant, icon, action, timeout, onClose, dedupe = !1, dedupeKey }) => {
      let value3 = variant ?? "neutral", value4 = typeof title == "string", value5 = dedupeKey ?? (value4 ? title : void 0), state = {
        titleNode: value4 ? void 0 : title,
        baseTitle: value4 ? title : void 0
      }, value6 = Date.now(), heldOpenByProvider = value2?.autoDismiss === !1, staysUntilDismissed = (input) => {
        let value11 = input ?? value2?.defaultTimeout;
        return value11 !== void 0 && value11 <= 0;
      }, callback = (input) => {
        let value11 = input ?? value2?.defaultTimeout;
        if (value11 !== void 0 && value11 > 0)
          return value6 + value11;
      };
      if (dedupe && value5 !== void 0) {
        let value11 = value2?.liveToasts.current ?? value.toasts, value12 = value11.find((input) => input.data?.dedupeKey === value5 && input.transitionStatus !== "ending");
        if (value12) {
          let value13 = (value12.data?.count ?? 1) + 1, value14 = action ?? value12.data?.action, value15 = !!value12.data?.action || (value12.timeout ?? value2?.defaultTimeout) === 0, value16 = timeout === void 0 ? void 0 : normalizeToastTimeout(timeout), value17 = value14 || heldOpenByProvider ? 0 : value15 && value12.data?.heldOpen !== !0 ? void 0 : value16, sticky = !!value14 || (value12.data?.sticky ?? value15) || value16 !== void 0 && value16 <= 0, state4 = {
            ...value12.data,
            ...state,
            variant: variant ?? value12.data?.variant,
            ...icon !== void 0 && {
              icon
            },
            action: value14,
            count: value13,
            sticky,
            heldOpen: !sticky && (value17 === 0 || value17 === void 0 && value12.data?.heldOpen === !0),
            ...value17 !== void 0 && {
              expiresAt: callback(value17)
            }
          }, value18 = value4 ? title : value12.title, value19 = value13 === 2 && typeof value18 == "string" ? `${value18} (×2)` : value4 && title !== value12.data?.baseTitle ? title : void 0, value20 = value11.find((input) => input.transitionStatus !== "ending"), value21 = typeof document < "u" && !!document.activeElement?.closest('[data-cds="Toast"]');
          if (!value2 || value21 || value20?.id === value12.id && !value12.limited)
            return value.update(value12.id, {
              ...value19 !== void 0 && {
                title: value19
              },
              description,
              ...value17 !== void 0 && {
                timeout: value17
              },
              data: state4
            }), value2?.syncLiveToasts(value11.map((input) => input.id === value12.id ? {
              ...input,
              data: state4,
              timeout: value17 ?? input.timeout
            } : input)), value12.id;
          let value22 = state4.expiresAt === void 0 ? 0 : Math.max(state4.expiresAt - value6, 1), value23 = value17 ?? (value15 ? 0 : Math.max(value22, 6e3)), state5 = {
            ...value12,
            title: value19 ?? value12.title,
            description,
            timeout: value23,
            limited: !1,
            data: {
              ...state4,
              expiresAt: callback(value23)
            }
          };
          return value2.movingIds.add(value12.id), value.close(value12.id), value2.movingIds.delete(value12.id), value.add({
            id: state5.id,
            title: state5.title,
            description,
            type: state5.type,
            priority: state5.priority,
            timeout: value23,
            onClose: state5.onClose,
            data: state5.data
          }), value2.syncLiveToasts([
            state5,
            ...value2.liveToasts.current.filter((input) => input.id !== value12.id)
          ]), value12.id;
        }
      }
      let value7 = !!action, value8 = value2?.allocId(), value9 = value7 ? 0 : normalizeToastTimeout(timeout), effectiveTimeout = heldOpenByProvider ? 0 : value9, state2 = {
        variant: value3,
        icon,
        action,
        ...state,
        dedupeKey: value5,
        count: 1,
        expiresAt: callback(effectiveTimeout),
        sticky: staysUntilDismissed(value9),
        heldOpen: heldOpenByProvider && !staysUntilDismissed(value9)
      }, state3 = {
        id: value8,
        title: value4 ? title : void 0,
        description,
        type: value3,
        timeout: effectiveTimeout,
        onClose: () => {
          if (value8 === void 0 || !value2) {
            onClose?.({
              byUser: !1
            });
            return;
          }
          if (value2.movingIds.has(value8))
            return;
          value2.syncLiveToasts(value2.liveToasts.current.map((input) => input.id === value8 ? {
            ...input,
            transitionStatus: "ending"
          } : input));
          let entry = value2.userDismissAt.get(value8);
          value2.userDismissAt.delete(value8), onClose?.({
            byUser: entry !== void 0 && Date.now() - entry < TOAST_TRANSITION_TIMEOUT_MS
          });
        },
        priority: value3 === "danger" ? "high" : "low",
        data: state2
      }, value10 = value.add(state3);
      return value2?.syncLiveToasts([
        {
          ...state3,
          id: value10
        },
        ...value2.liveToasts.current
      ]), value10;
    }, [value, value2]), defaultTimeout = value2?.defaultTimeout, toastsKey = JSON.stringify(value.toasts.filter((input) => input.transitionStatus !== "ending").map((input) => ({
      id: input.id,
      sticky: input.data?.sticky ?? (input.timeout ?? defaultTimeout) === 0
    }))), toasts = reactg6.useMemo(() => JSON.parse(toastsKey), [toastsKey]);
    return {
      add,
      close: value.close,
      toasts,
      setPinned: value2?.setPinned ?? noopToastPinSetter
    };
  }
  return bindRuntimeValue(runtime2, "normalizeToastTimeout", () => normalizeToastTimeout), bindRuntimeValue(runtime2, "ToastView", () => ToastView), bindRuntimeValue(runtime2, "PinnedToastView", () => PinnedToastView), bindRuntimeValue(runtime2, "containsVisibleFocus", () => containsVisibleFocus), bindRuntimeValue(runtime2, "PinnedToastSlot", () => PinnedToastSlot), bindRuntimeValue(runtime2, "ToastViewport", () => ToastViewport3), bindRuntimeValue(runtime2, "createToastMovementState", () => createToastMovementState), bindRuntimeValue(runtime2, "ToastProvider", () => ToastProvider3), bindRuntimeValue(runtime2, "useToastNotifications", () => useToastNotifications), bindRuntimeValue(runtime2, "reactg6", () => reactg6, (value) => {
    reactg6 = value;
  }), bindRuntimeValue(runtime2, "jsxt5", () => jsxt5, (value) => {
    jsxt5 = value;
  }), bindRuntimeValue(runtime2, "DEFAULT_TOAST_TIMEOUT_MS", () => DEFAULT_TOAST_TIMEOUT_MS, (value) => {
    DEFAULT_TOAST_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "TOAST_TRANSITION_TIMEOUT_MS", () => TOAST_TRANSITION_TIMEOUT_MS, (value) => {
    TOAST_TRANSITION_TIMEOUT_MS = value;
  }), bindRuntimeValue(runtime2, "toastSurfaceClasses", () => toastSurfaceClasses, (value) => {
    toastSurfaceClasses = value;
  }), bindRuntimeValue(runtime2, "toastVariantClasses", () => toastVariantClasses, (value) => {
    toastVariantClasses = value;
  }), bindRuntimeValue(runtime2, "toastStackedVariantClasses", () => toastStackedVariantClasses, (value) => {
    toastStackedVariantClasses = value;
  }), bindRuntimeValue(runtime2, "toastDescriptionClasses", () => toastDescriptionClasses, (value) => {
    toastDescriptionClasses = value;
  }), bindRuntimeValue(runtime2, "toastVariantTextClasses", () => toastVariantTextClasses, (value) => {
    toastVariantTextClasses = value;
  }), bindRuntimeValue(runtime2, "toastDefaultIconNames", () => toastDefaultIconNames, (value) => {
    toastDefaultIconNames = value;
  }), bindRuntimeValue(runtime2, "toastSecondaryTextClasses", () => toastSecondaryTextClasses, (value) => {
    toastSecondaryTextClasses = value;
  }), bindRuntimeValue(runtime2, "toastStackTransformClasses", () => toastStackTransformClasses, (value) => {
    toastStackTransformClasses = value;
  }), bindRuntimeValue(runtime2, "toastContentClasses", () => toastContentClasses, (value) => {
    toastContentClasses = value;
  }), bindRuntimeValue(runtime2, "toastBodyClasses", () => toastBodyClasses, (value) => {
    toastBodyClasses = value;
  }), bindRuntimeValue(runtime2, "toastDismissButtonClasses", () => toastDismissButtonClasses, (value) => {
    toastDismissButtonClasses = value;
  }), bindRuntimeValue(runtime2, "emptyToastList", () => emptyToastList, (value) => {
    emptyToastList = value;
  }), bindRuntimeValue(runtime2, "pinnedToastContext", () => pinnedToastContext, (value) => {
    pinnedToastContext = value;
  }), bindRuntimeValue(runtime2, "noopToastPinSetter", () => noopToastPinSetter, (value) => {
    noopToastPinSetter = value;
  }), bindRuntimeValue(runtime2, "initializeUiToast", () => initializeUiToast, (value) => {
    initializeUiToast = value;
  }), bindRuntimeValue(runtime2, "reactForUiToast", () => reactForUiToast, (value) => {
    reactForUiToast = value;
  }), bindRuntimeValue(runtime2, "jsxForUiToast", () => jsxForUiToast, (value) => {
    jsxForUiToast = value;
  }), bindRuntimeValue(runtime2, "FIELD_LABEL_LAYOUT_CLASSES", () => FIELD_LABEL_LAYOUT_CLASSES, (value) => {
    FIELD_LABEL_LAYOUT_CLASSES = value;
  }), bindRuntimeValue(runtime2, "FieldRoot", () => FieldRoot3, (value) => {
    FieldRoot3 = value;
  }), bindRuntimeValue(runtime2, "FieldLabel", () => FieldLabel3, (value) => {
    FieldLabel3 = value;
  }), bindRuntimeValue(runtime2, "FieldDescription", () => FieldDescription3, (value) => {
    FieldDescription3 = value;
  }), bindRuntimeValue(runtime2, "FieldError", () => FieldError3, (value) => {
    FieldError3 = value;
  }), bindRuntimeValue(runtime2, "FieldRootWithLabel", () => FieldRootWithLabel, (value) => {
    FieldRootWithLabel = value;
  }), bindRuntimeValue(runtime2, "FieldRow", () => FieldRow, (value) => {
    FieldRow = value;
  }), bindRuntimeValue(runtime2, "initializeUiToast2", () => initializeUiToast2, (value) => {
    initializeUiToast2 = value;
  }), bindRuntimeValue(runtime2, "FIELD_MESSAGE_CLASSES", () => FIELD_MESSAGE_CLASSES, (value) => {
    FIELD_MESSAGE_CLASSES = value;
  }), bindRuntimeValue(runtime2, "fieldErrorIcon", () => fieldErrorIcon, (value) => {
    fieldErrorIcon = value;
  }), () => {
    DEFAULT_TOAST_TIMEOUT_MS = 6e3, TOAST_TRANSITION_TIMEOUT_MS = 1e3, toastStackTransformClasses = "absolute w-full bottom-0 right-0 origin-bottom [--ty:calc(var(--toast-index)_*_-14px)] [--ts:calc(1_-_var(--toast-index)_*_0.04)] [transform:translateY(var(--ty))_scale(var(--ts))] transition-[transform,opacity] duration-base ease-out motion-reduce:transition-none data-[starting-style]:opacity-0 data-[starting-style]:[--ty:100%] data-[ending-style]:opacity-0 data-[ending-style]:[--ts:0.85] data-[limited]:opacity-0", toastContentClasses = "flex items-start gap-sm px-lg py-md overflow-hidden rounded-[inherit] text-body font-normal transition-[opacity,visibility] duration-base ease-out motion-reduce:transition-none data-[behind]:invisible data-[behind]:opacity-0", toastDescriptionClasses = "stacks:text-secondary", toastBodyClasses = "min-w-0 flex-1 text-pretty break-words", FIELD_MESSAGE_CLASSES = "flex items-start gap-1 text-footnote font-normal leading-snug", toastDismissButtonClasses = "cds-reset -mx-1 -mb-1 -mt-0.5 shrink-0 rounded p-1 outline-none focus-visible:outline-hidden transition duration-fast hover:bg-fill-ghost-hover focus-visible:shadow-focus", noopToastPinSetter = () => {
    }, initializeUiToast = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeIsomorphicLayoutEffect)(), (0, runtime2.initializeClassNames)(), (0, runtime2.initializeTranslations)(), (0, runtime2.initializeLayers)(), (0, runtime2.initializePortalRoot)(), (0, runtime2.initializeIcons)(), (0, runtime2.initializeSurfaces)(), (0, runtime2.initializeNpmDependency)(), reactg6 = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxt5 = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), toastSurfaceClasses = (0, runtime2.getSurfaceClasses)("popover"), toastVariantClasses = {
        neutral: "shadow-panel-md",
        warning: "shadow-ring-warning [background-image:linear-gradient(0deg,var(--cds-bg-warning),var(--cds-bg-warning))]",
        danger: "shadow-ring-danger [background-image:linear-gradient(0deg,var(--cds-bg-danger),var(--cds-bg-danger))]"
      }, toastStackedVariantClasses = {
        neutral: "",
        warning: "stacks:shadow-panel-md stacks:bg-none stacks:text-primary",
        danger: "stacks:shadow-panel-md stacks:bg-none stacks:text-primary"
      }, toastVariantTextClasses = {
        neutral: "text-primary",
        warning: "text-warning",
        danger: "text-danger"
      }, toastDefaultIconNames = {
        neutral: "Info",
        warning: "Warning",
        danger: "WarningCircle"
      }, toastSecondaryTextClasses = {
        neutral: "text-secondary",
        warning: "stacks:text-fill-warning",
        danger: "stacks:text-fill-danger"
      }, emptyToastList = [], pinnedToastContext = reactg6.createContext(null);
    }), initializeUiToast2 = (0, runtime2.initializeOnce)(() => {
      (0, runtime2.initializeClassNames)(), (0, runtime2.initializeIcons)(), (0, runtime2.initializeUiMenu)(), (0, runtime2.initializeNpmDependency)(), reactForUiToast = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), jsxForUiToast = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), FIELD_LABEL_LAYOUT_CLASSES = {
        false: {
          false: {
            invalid: !1,
            disabled: !1
          },
          true: {
            invalid: !0,
            disabled: !1
          }
        },
        true: {
          false: {
            invalid: !1,
            disabled: !0
          },
          true: {
            invalid: !0,
            disabled: !0
          }
        }
      }, FieldRoot3 = reactForUiToast.forwardRef(({ className, validationMode = "onBlur", ...props }, options) => jsxForUiToast.jsx(runtime2.baseField.Root, {
        ref: options,
        "data-cds": "Field",
        validationMode,
        ...props,
        className: (0, runtime2.cn)("flex flex-col gap-xs font-sans", className),
        render: (input, options2) => jsxForUiToast.jsx(runtime2.textFieldStateContext.Provider, {
          value: FIELD_LABEL_LAYOUT_CLASSES[`${options2.disabled}`][`${options2.valid === !1}`],
          children: jsxForUiToast.jsx("div", {
            ...input
          })
        })
      })), FieldRoot3.displayName = "Field.Root", FieldLabel3 = reactForUiToast.forwardRef(({ className, id, ...props }, options) => {
        let value = (0, runtime2.useFieldLabelId)();
        return jsxForUiToast.jsx(runtime2.baseField.Label, {
          ref: options,
          id: id ?? value,
          ...props,
          className: (0, runtime2.cn)("text-body font-medium leading-none text-primary", className)
        });
      }), FieldLabel3.displayName = "Field.Label", FieldDescription3 = reactForUiToast.forwardRef(({ className, ...props }, options) => jsxForUiToast.jsx(runtime2.baseField.Description, {
        ref: options,
        ...props,
        className: (0, runtime2.cn)("text-footnote font-normal leading-snug", runtime2.staysSecondaryTextClasses, className)
      })), FieldDescription3.displayName = "Field.Description", fieldErrorIcon = jsxForUiToast.jsx(runtime2.Icon, {
        name: "WarningCircle",
        size: "sm",
        className: "mt-px shrink-0"
      }), FieldError3 = reactForUiToast.forwardRef(({ className, children, ...props }, options) => jsxForUiToast.jsx(runtime2.baseField.Error, {
        ref: options,
        ...props,
        className: (0, runtime2.cn)(FIELD_MESSAGE_CLASSES, "text-danger wrap-break-word", className),
        render: (input) => jsxForUiToast.jsxs("div", {
          ...input,
          children: [
            fieldErrorIcon,
            jsxForUiToast.jsx("span", {
              className: "min-w-0",
              children: children ?? input.children
            })
          ]
        })
      })), FieldError3.displayName = "Field.Error", FieldRootWithLabel = runtime2.baseField.Control, FieldRow = runtime2.baseField.Validity;
    });
  };
}
export {
  installUiToast
};
