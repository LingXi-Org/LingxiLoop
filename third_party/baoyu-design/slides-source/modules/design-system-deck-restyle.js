// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDesignSystemDeckRestyle(runtime2) {
  var reactForDeckRestyle;
  const EMPTY_ANALYSIS = {
    dark: !1,
    colors: [],
    uses: [],
    text: [],
    textAssign: {},
    textStrays: [],
    textOwn: {},
    families: {},
    strays: 0
  }, noFaces = [], lower = (family) => family.toLowerCase(), storableFaces = (faces) => faces.filter((face) => face.href !== void 0 || !(face.src ?? "").startsWith("data:")), deckLookMemory = (snap) => (0, runtime2.parseRestyleMemory)(snap.style, (faces) => {
    let parsed = (0, runtime2.normalizeFontFaces)(faces);
    return parsed !== void 0 ? storableFaces(parsed) : void 0;
  }), familySet = (faces) => new Set(faces.map((face) => lower(face.family))), sameSlide = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b), copySlide = (slide) => ({ ...slide });
  function applyRestyle(host, plan, options = {}) {
    let snap = options.drag?.read.snap ?? host.store.getSnapshot(), heldIndex = snap.slides.findIndex((slide) => host.held(slide.id));
    if (heldIndex >= 0) {
      if (options.live === !0)
        return !1;
      let wrote2 = options.drag?.wrote ?? /* @__PURE__ */ new Map(), undone = host.store.getSnapshot().slides.filter((slide) => !host.held(slide.id) && wrote2.has(slide.id) && sameSlide(slide, wrote2.get(slide.id)));
      return undone.length > 0 && host.store.setLook(undone.flatMap((slide) => {
        let before2 = snap.slides.find((entry) => entry.id === slide.id);
        return before2 !== void 0 ? [copySlide(before2)] : [];
      }), snap.style, snap.faces ?? []), host.tell("幻灯片 " + String(heldIndex + 1) + " can’t be edited until its saved content is fixed, so the theme wasn’t changed. Ask the agent to fix that slide first."), !1;
    }
    let changes = (0, runtime2.restylePlanChangesDeck)(plan);
    if (!changes && (options.drag === void 0 || options.drag.wrote.size === 0))
      return !1;
    let analysis = options.drag?.read.style ?? (0, runtime2.analyzeDeckRestyle)(snap.slides, void 0, deckLookMemory(snap));
    if (analysis.over === !0)
      return !1;
    let memory = analysis.memory, faces = snap.faces ?? [], usedBefore = (0, runtime2.usedDeckFontFamilies)(snap.slides), planned = new Set((0, runtime2.restylePlanFamilies)(plan).map((face) => lower(face.name))), added = (options.faces ?? []).flatMap((face) => (0, runtime2.normalizeFontFaces)([face]) ?? []).filter((face, index4, list) => planned.has(lower(face.family)) && !familySet(faces).has(lower(face.family)) && list.findIndex((other) => lower(other.family) === lower(face.family)) === index4), build = (candidates) => {
      let declared = familySet(candidates), mapped = (0, runtime2.mapRestylePlanFaces)(plan, (face) => (0, runtime2.restyleFaceOf)((0, runtime2.restyleFaceFontFamily)(face, declared)) ?? face), kept2 = (0, runtime2.nextRestyleMemory)(mapped, memory, storableFaces(faces)), restyle = (0, runtime2.createSlideRestyler)(mapped, {
        slides: snap.slides,
        declared,
        after: kept2[0]
      }), after2 = new Map(snap.slides.map((slide) => [slide.id, restyle(slide)])), usedAfter = (0, runtime2.usedDeckFontFamilies)([...after2.values()]), remembered = new Set(Object.values(kept2[1]?.text ?? {}).map((look) => look.family?.name.toLowerCase())), rememberedInline = (face) => storableFaces([face]).length === 0 && remembered.has(lower(face.family));
      return {
        plan: mapped,
        kept: kept2,
        to: restyle,
        after: after2,
        faces: candidates.filter((face) => usedAfter.has(lower(face.family)) || rememberedInline(face) || faces.includes(face) && !usedBefore.has(lower(face.family)))
      };
    }, first = build([...faces, ...added]), { plan: mappedPlan, kept, to: restyleSlide, after, faces: nextFaces } = first.faces.length <= runtime2.maxDeckFontFaces ? first : build(first.faces.slice(0, runtime2.maxDeckFontFaces)), [newFaces, droppedFamilies] = [
      nextFaces.filter((face) => !faces.includes(face)),
      familySet(faces.filter((face) => !nextFaces.includes(face)))
    ], before = new Map(snap.slides.map((slide) => [slide.id, slide])), wrote = options.drag?.wrote ?? /* @__PURE__ */ new Map(), write = (target, restyleChanged, style, addFaces, removeFamilies) => {
      let now = host.store.getSnapshot(), slides = now.slides.flatMap((slide) => {
        let next = target(slide.id);
        if (next === void 0 || host.held(slide.id))
          return [];
        let written = sameSlide(slide, wrote.get(slide.id) ?? before.get(slide.id)) || sameSlide(slide, before.get(slide.id)) || sameSlide(slide, after.get(slide.id)) ? sameSlide(slide, next) ? void 0 : copySlide(next) : restyleChanged?.(slide);
        return written !== void 0 && written !== slide ? [written] : [];
      }), keptFaces = (now.faces ?? []).filter((face) => !removeFamilies.has(lower(face.family))), allFaces = [
        ...keptFaces,
        ...addFaces.filter((face) => !familySet(keptFaces).has(lower(face.family)))
      ], used = (0, runtime2.usedDeckFontFamilies)(now.slides.map((slide) => slides.find((entry) => entry.id === slide.id) ?? slide)), isUsed = (face) => used.has(lower(face.family));
      host.store.setLook(slides, style, allFaces.length <= runtime2.maxDeckFontFaces ? allFaces : [...allFaces.filter(isUsed), ...allFaces.filter((face) => !isUsed(face))].slice(0, runtime2.maxDeckFontFaces));
      let stored = new Map(host.store.getSnapshot().slides.map((slide) => [slide.id, slide]));
      for (let slide of slides)
        wrote.set(slide.id, stored.get(slide.id));
    }, writeForward = (restyleChanged) => write((id) => after.get(id), restyleChanged, changes ? (0, runtime2.serializeRestyleMemory)(kept) : snap.style, newFaces, droppedFamilies);
    if (options.live === !0 || !changes)
      return writeForward(), changes;
    let done = !1;
    return host.undo.exec({
      label: "调整样式",
      do: () => {
        writeForward(done || options.drag === void 0 ? restyleSlide : void 0), done = !0;
      },
      undo: () => {
        let now = host.store.getSnapshot(), revert = (0, runtime2.createSlideRestyler)((0, runtime2.invertRestylePlan)(mappedPlan, (0, runtime2.analyzeDeckRestyle)(now.slides, void 0, kept)), {
          slides: now.slides,
          declared: familySet([...faces, ...nextFaces]),
          after: memory?.[0] ?? null
        });
        write((id) => wrote.has(id) ? before.get(id) : void 0, revert, snap.style, faces.filter((face) => droppedFamilies.has(lower(face.family))), familySet(newFaces));
      }
    }), host.commit(), host.announce("Theme changed on every slide."), !0;
  }
  function deckSystem(slides, systems, memory) {
    if (memory !== void 0)
      return systems.find((system) => system.key === memory[0]?.look.split("/")[0]);
    if (systems.length === 0)
      return;
    let colors = new Set((0, runtime2.collectDeckStyleUses)(slides).colors.map((use) => (0, runtime2.hexColorRgb)(use.value))), shared = (system) => [...colors].filter((color) => system.style.themes.some((theme) => theme.colors.some((token) => (0, runtime2.hexColorRgb)(token.value) === color))).length, best = [...systems].sort((a, b) => shared(b) - shared(a))[0];
    if (best !== void 0)
      return shared(best) * 2 >= colors.size ? best : void 0;
  }
  function readDeck(snap, systems) {
    let own = (0, runtime2.analyzeDeckRestyle)(snap.slides, void 0, deckLookMemory(snap));
    if (own.over === !0)
      return { snap, from: void 0, style: own };
    let from = deckSystem(snap.slides, systems, own.memory);
    return {
      snap,
      from,
      style: (0, runtime2.analyzeDeckRestyle)(snap.slides, from?.style, own.memory)
    };
  }
  const previousLookFaces = (memory) => (0, runtime2.normalizeFontFaces)(memory?.[1]?.faces) ?? [], planLook = (read, systems, key, theme) => {
    let system = systems.find((entry) => entry.key === key);
    return key === runtime2.ORIGINAL_LOOK && read.style.memory?.[1]?.look === runtime2.ORIGINAL_LOOK ? (0, runtime2.planRevert)(read.style) : system !== void 0 ? (0, runtime2.planSystemRestyle)(read.style, system.style, read.from?.style, theme !== void 0 ? { theme } : {}) : void 0;
  };
  function previewLook(read, systems, key, theme) {
    let plan = planLook(read, systems, key, theme);
    if (plan === void 0)
      return (slide) => slide;
    let declared = familySet(read.snap.faces ?? []), faces = [
      ...previousLookFaces(read.style.memory),
      ...systems.find((system) => system.key === key)?.faces ?? []
    ].filter((face) => !declared.has(lower(face.family))), peekNames = new Map(faces.reverse().map((face) => [
      lower(face.family),
      face.src !== void 0 ? (0, runtime2.peekFontFamily)(face.src) : face.family
    ])), peekPlan = (0, runtime2.mapRestylePlanFaces)(plan, (face) => ({
      ...face,
      name: peekNames.get(lower(face.name)) ?? face.name
    })), restyle = (0, runtime2.createSlideRestyler)(peekPlan, {
      slides: read.snap.slides,
      declared: /* @__PURE__ */ new Set([...declared, ...[...peekNames.values()].map(lower)]),
      after: null
    }), cache2 = /* @__PURE__ */ new WeakMap();
    return (slide) => {
      let cached = cache2.get(slide);
      if (cached !== void 0)
        return cached;
      let next = restyle(slide);
      return cache2.set(slide, next), next;
    };
  }
  function withPlannedValues(analysis, plan) {
    return plan === void 0 ? analysis : {
      ...analysis,
      colors: analysis.colors.map((slot) => {
        let change = Object.hasOwn(plan.colors, slot.id) ? plan.colors[slot.id] : void 0;
        return change !== void 0 ? { ...slot, value: change.to } : slot;
      }),
      text: analysis.text.map((slot) => {
        let change = Object.hasOwn(plan.text, slot.id) ? plan.text[slot.id] : void 0;
        return change !== void 0 ? { ...slot, ...change.to } : slot;
      })
    };
  }
  function useStableValue(value) {
    let key = JSON.stringify(value);
    return reactForDeckRestyle.useMemo(() => value, [key]);
  }
  function useDeckRestyle({ host, snap, enabled, open: open4 }) {
    let systems = (0, runtime2.useThemeSystems)(enabled), lookFaces = useStableValue(reactForDeckRestyle.useMemo(() => enabled ? previousLookFaces(deckLookMemory(snap)) : [], [enabled, snap.style])), deckFaces = useStableValue(enabled ? storableFaces(snap.faces ?? []) : noFaces);
    reactForDeckRestyle.useEffect(() => (0, runtime2.loadSystemFontFiles)([
      ...systems.flatMap((system) => system.faces),
      ...lookFaces,
      ...deckFaces
    ]), [systems, lookFaces, deckFaces]), reactForDeckRestyle.useEffect(() => {
      open4 && (0, runtime2.enablePeekFonts)();
    }, [open4]), reactForDeckRestyle.useEffect(() => {
      open4 && (0, runtime2.loadFaceStylesheets)(lookFaces.filter((face) => !familySet(snap.faces ?? []).has(lower(face.family))));
    }, [open4, lookFaces, snap.faces]), reactForDeckRestyle.useEffect(() => {
      enabled && (0, runtime2.setActiveSystemFaces)(snap.faces ?? []);
    }, [enabled, snap.faces, systems]);
    let drag2 = reactForDeckRestyle.useRef(null), [, rerender] = reactForDeckRestyle.useReducer((count) => count + 1, 0), dragging = drag2.current !== null, read = reactForDeckRestyle.useMemo(() => open4 && !dragging ? readDeck(snap, systems) : void 0, [open4, dragging, snap, systems]), shown = drag2.current !== null ? {
      ...drag2.current.read,
      style: withPlannedValues(drag2.current.read.style, drag2.current.last?.plan)
    } : read, actions = reactForDeckRestyle.useMemo(() => {
      let edit = (planOf, live, faces) => {
        drag2.current ??= {
          read: readDeck(host.store.getSnapshot(), systems),
          wrote: /* @__PURE__ */ new Map()
        };
        let current2 = drag2.current, plan = planOf(current2.read);
        live === !0 ? current2.last = { plan, ...faces !== void 0 ? { faces } : {} } : drag2.current = null, live !== !0 && rerender(), applyRestyle(host, plan, {
          drag: current2,
          ...faces !== void 0 ? { faces } : {},
          ...live === !0 ? { live } : {}
        });
      };
      return {
        pickLook(key, theme2) {
          let now = readDeck(host.store.getSnapshot(), systems), system = systems.find((entry) => entry.key === key), remembered = previousLookFaces(now.style.memory), plan = planLook(now, systems, key, theme2);
          plan !== void 0 && applyRestyle(host, plan, {
            faces: [...remembered, ...system?.faces ?? []]
          });
        },
        color: (slot, color, live) => edit((current2) => (0, runtime2.planSlotColor)(current2.style, slot, color, current2.from?.style), live),
        family: (which, face, deckFace) => edit((current2) => (0, runtime2.planFamily)(current2.style, which, face, current2.from?.style), !1, deckFace !== void 0 ? [deckFace] : void 0),
        textStyle: (slot, look, options = {}) => edit((current2) => (0, runtime2.planTextSlot)(current2.style, slot, look, current2.from?.style), options.live, options.face !== void 0 ? [options.face] : void 0),
        end() {
          let current2 = drag2.current;
          drag2.current = null, rerender(), current2?.last !== void 0 && applyRestyle(host, current2.last.plan, {
            drag: current2,
            ...current2.last.faces !== void 0 ? { faces: current2.last.faces } : {}
          });
        },
        dragging: () => drag2.current !== null
      };
    }, [host, systems]), [peekChoice, setPeekChoice] = reactForDeckRestyle.useState(void 0), preview = reactForDeckRestyle.useMemo(() => {
      let previews = /* @__PURE__ */ new Map();
      return (key, theme2) => {
        let id = key + "/" + (theme2 ?? "");
        return read !== void 0 && !previews.has(id) && previews.set(id, previewLook(read, systems, key, theme2)), previews.get(id) ?? ((slide) => slide);
      };
    }, [read, systems]), peek = reactForDeckRestyle.useMemo(() => (key, theme2) => setPeekChoice(key !== void 0 ? { key, ...theme2 !== void 0 ? { theme: theme2 } : {} } : void 0), []), peeked = reactForDeckRestyle.useMemo(() => peekChoice !== void 0 ? preview(peekChoice.key, peekChoice.theme) : void 0, [peekChoice, preview]), style = shown?.style ?? EMPTY_ANALYSIS, current = shown?.from, theme = current === void 0 ? void 0 : (0, runtime2.systemThemeFor)(current.style, style.dark, style.memory?.[0]?.look.split("/")[1])?.id;
    return {
      style,
      systems,
      current,
      theme,
      hasOriginal: style.memory?.[1]?.look === runtime2.ORIGINAL_LOOK,
      preview,
      peek,
      peeked,
      ...actions
    };
  }
  return bindRuntimeValue(runtime2, "reactForDeckRestyle", () => reactForDeckRestyle), bindRuntimeValue(runtime2, "deckLookMemory", () => deckLookMemory), bindRuntimeValue(runtime2, "useDeckRestyle", () => useDeckRestyle), () => {
    (0, runtime2.initializeSlideModel)(), reactForDeckRestyle = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1);
  };
}
export {
  installDesignSystemDeckRestyle
};
