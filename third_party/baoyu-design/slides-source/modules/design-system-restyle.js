// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDesignSystemRestyle(runtime2) {
  const rgb = (color) => (0, runtime2.hexColorRgb)(color), parseHex = (color) => (0, runtime2.parseHexColor)(color), contrast = (first, second) => (0, runtime2.themeContrastRatio)(first, second), luminance = (color) => (0, runtime2.themeLuminance)(color), flatten = (color, ground) => (0, runtime2.flattenColorOn)(color, ground), mix = (from, to, amount) => (0, runtime2.mixThemeHexColors)(from, to, amount), isDark = (color) => (0, runtime2.isDarkColor)(color), isChromatic = (color) => (0, runtime2.isChromaticColor)(color), lightness = (color) => (0, runtime2.oklabColor)(color)[0], chroma = (color) => (0, runtime2.oklabChroma)(color), distance = (first, second) => (0, runtime2.oklabDistance)(first, second), hueDiff = (first, second) => (0, runtime2.hueDifference)(first, second), hueAngle = (color) => {
    let [, a, b] = (0, runtime2.oklabColor)(color);
    return Math.atan2(b, a);
  }, statusBand = (color, wide) => (0, runtime2.statusHueBand)(color, wide), channels = (color) => (0, runtime2.hexColorChannels)(color), themeFor = (system, dark, themeId) => (0, runtime2.systemThemeFor)(system, dark, themeId), withRole = (theme, role) => (0, runtime2.themeColorsWithRole)(theme, role), themeKey = (system, theme) => (0, runtime2.systemThemeKey)(system, theme), statusSlot = (color) => (0, runtime2.statusSlotId)(color), colorRoles = () => runtime2.THEME_COLOR_ROLES, ladderRoles = () => runtime2.TYPE_LADDER_ROLES, isHeading = (role) => (0, runtime2.isHeadingLadderRole)(role);
  function ownRecordValue(record, key) {
    return record !== void 0 && key !== void 0 && Object.hasOwn(record, key) ? record[key] : void 0;
  }
  const own = ownRecordValue;
  function colorUseKey(use) {
    return (use.mark !== void 0 ? use.mark + "!" : "") + (use.keep === !0 ? "=" : "") + use.prop + (use.small === !0 ? "-s" : "") + ":" + rgb(use.value) + (use.on !== void 0 ? "@" + use.on : "") + (use.page !== void 0 ? "/" + use.page : "");
  }
  const PAGE_SLOT_PREFIX = "page-", isPageSlot = (slot) => slot.startsWith(PAGE_SLOT_PREFIX), unpageSlot = (slot) => slot.replace(PAGE_SLOT_PREFIX, "");
  function paletteSlotRole(slot) {
    let base = unpageSlot(slot).replace(/-alt\d*$/, "").replace(/-\d+$/, "");
    return colorRoles().find((role) => role === base) ?? (base.startsWith("status-") ? "status" : "other");
  }
  const altSlotBase = (slot) => /-alt\d*$/.test(slot) ? slot.replace(/-alt\d*$/, "") : void 0, OWN_PALETTE_SLOT = "own", isOwnPaletteSlot = (slot) => /^own(-\d+)?$/.test(slot), restyleFaceKey = (face) => face === void 0 ? "inherit" : face.name !== "" ? face.name.toLowerCase() : face.generic, textLookKey = (look) => [
    restyleFaceKey(look.family),
    look.fontSize,
    look.fontWeight,
    look.italic ? "i" : "",
    look.lineHeight,
    look.letterSpacing,
    look.textTransform ?? ""
  ].join("|"), textUseKey = (use) => (use.mark !== void 0 ? use.mark + "!" : "") + textLookKey(use), textSlotRole = (slot) => ladderRoles().find((role) => role === slot.replace(/-\d+$/, "")) ?? "body", ORIGINAL_LOOK = "original";
  function restyleCandidateSystems(systems) {
    return systems.filter((system, index4) => (0, runtime2.isValidDesignSystemNamespace)(system.key) && system.key !== ORIGINAL_LOOK && systems.findIndex((other) => other.key === system.key) === index4);
  }
  const MAX_REMEMBERED_LOOKS = 2, MAX_MEMORY_ENTRIES = 128, MAX_DECK_COLORS = 512, [MIN_LETTER_SPACING, MAX_LETTER_SPACING] = [-24, 32], SLOT_ROLES_BY_PROP = {
    ground: [
      "background",
      "surface",
      "accent",
      "inverse",
      "accent-soft",
      "status",
      "text",
      "other"
    ],
    fill: [
      "surface",
      "background",
      "accent",
      "accent-soft",
      "border",
      "inverse",
      "status",
      "muted",
      "text",
      "other"
    ],
    text: [
      "text",
      "muted",
      "accent",
      "on-accent",
      "on-inverse",
      "on-inverse-muted",
      "inverse-accent",
      "status",
      "background",
      "surface",
      "other"
    ],
    line: [
      "border",
      "accent",
      "muted",
      "text",
      "on-inverse-muted",
      "inverse-accent",
      "status",
      "surface",
      "other"
    ]
  }, slotRoleOrder = (prop, slot) => SLOT_ROLES_BY_PROP[prop].indexOf(paletteSlotRole(slot));
  function isInversePage(memory, page) {
    let slots = Object.keys(memory?.colors ?? {}).filter((slot) => rgb(memory.colors[slot]) === page);
    return slots.some((slot) => isPageSlot(slot) && paletteSlotRole(slot) === "inverse") && !slots.some((slot) => paletteSlotRole(slot) === "background" || paletteSlotRole(slot) === "surface");
  }
  const memorySlotFor = (memory, prop, value, page) => memorySlotMatching(memory, prop, value, isInversePage(memory, page));
  function memorySlotMatching(memory, prop, value, onInversePage) {
    return Object.keys(memory.colors).filter((slot) => rgb(memory.colors[slot]) === value && slotRoleOrder(prop, slot) >= 0 && (onInversePage || !isPageSlot(slot))).sort((a, b) => Number(isPageSlot(b)) - Number(isPageSlot(a)) || slotRoleOrder(prop, a) - slotRoleOrder(prop, b) || (a < b ? -1 : 1))[0];
  }
  function memoryTextSlotFor(memory, look) {
    return Object.keys(memory.text).filter((slot) => textLookKey(memory.text[slot]) === textLookKey(look)).sort((a, b) => ladderRoles().indexOf(textSlotRole(a)) - ladderRoles().indexOf(textSlotRole(b)) || (a < b ? -1 : 1))[0];
  }
  function valuesByCount(uses, weight = () => 1) {
    let counts = /* @__PURE__ */ new Map();
    for (let use of uses)
      counts.set(rgb(use.value), (counts.get(rgb(use.value)) ?? 0) + use.count * weight(use));
    return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  }
  const isAreaUse = (use) => use.prop === "fill" || use.prop === "ground", isPaleTint = (color) => lightness(color) > 0.85 && chroma(color) < 0.06;
  function chromaticValuesByWeight(uses) {
    return valuesByCount(uses.filter((use) => isChromatic(rgb(use.value)) && !isPaleTint(rgb(use.value))), (use) => isAreaUse(use) ? 3 : 1).map(([value]) => value);
  }
  function sameAccentHue(color, other) {
    if (other === void 0)
      return !1;
    let difference = hueDiff(color, other);
    return lightness(color) > 0.85 ? difference < 45 : difference < 5 || difference < 12 && statusBand(color) === statusBand(other);
  }
  const distinctHueCount = (colors) => colors.reduce((kept, color) => kept.every((other) => hueDiff(other, color) >= 25) ? [...kept, color] : kept, []).length, primaryAccentValues = (theme) => withRole(theme, "accent").filter((color) => color.rank < runtime2.PRIMARY_ACCENT_RANK_LIMIT).map((color) => rgb(color.value));
  function deckSeriesColors(slides, accent) {
    let perSlide = slides.map((uses) => uses.map((use) => ({
      c: rgb(use.value),
      ground: use.prop === "ground",
      weight: isAreaUse(use) ? 3 : 1
    })).filter((use) => isChromatic(use.c) && lightness(use.c) <= 0.85)), add = (counts, key, amount = 1) => void counts.set(key, (counts.get(key) ?? 0) + amount), ranked = (values, ...scores) => [...values].sort((a, b) => scores.map((score) => score(b) - score(a)).find((d) => d !== 0) ?? (a < b ? -1 : 1)), clearWinner = (values, ...scores) => {
      let [first, second] = ranked(values, ...scores);
      return first !== void 0 && (second === void 0 || scores.some((score) => score(first) !== score(second))) ? first : void 0;
    }, [total, weighted, slidesWith, seriesVotes] = [
      /* @__PURE__ */ new Map(),
      /* @__PURE__ */ new Map(),
      /* @__PURE__ */ new Map(),
      /* @__PURE__ */ new Map()
    ];
    for (let use of perSlide.flat())
      add(total, use.c);
    let representative = /* @__PURE__ */ new Map(), hues = [];
    for (let value of ranked(total.keys(), (value2) => total.get(value2) ?? 0)) {
      let match = hues.find((hue) => sameAccentHue(value, hue));
      match === void 0 && hues.push(value), representative.set(value, match ?? value);
    }
    for (let uses of perSlide) {
      for (let use of uses)
        add(weighted, representative.get(use.c), use.weight);
      for (let hue of new Set(uses.map((use) => representative.get(use.c))))
        add(slidesWith, hue);
    }
    let slideHues = perSlide.map((uses) => {
      let here = ranked(new Set(uses.filter((use) => !use.ground).map((use) => representative.get(use.c))), hueAngle);
      return {
        here,
        kinds: new Set(here.map((hue) => statusBand(hue)).filter((band) => band >= 0)),
        series: distinctHueCount(here) >= 4
      };
    }), given = accent !== void 0 && isChromatic(rgb(accent)) && lightness(rgb(accent)) <= 0.85 ? rgb(accent) : void 0, givenHue = given !== void 0 ? hues.find((hue) => sameAccentHue(hue, given)) : void 0, widest = given !== void 0 ? void 0 : clearWinner(hues, (hue) => slidesWith.get(hue) ?? 0, (hue) => +(statusBand(hue, !0) < 0), (hue) => weighted.get(hue) ?? 0), heaviest = given !== void 0 ? void 0 : clearWinner(hues, (hue) => weighted.get(hue) ?? 0), aloneSomewhere = (hue) => slideHues.some((slide) => !slide.series && slide.kinds.size < 2 && slide.here.includes(hue)), isAccent = (hue) => hue === givenHue || hue === widest || hue === heaviest && aloneSomewhere(hue), notMainAccent = (hue) => hue !== heaviest || hue !== widest && !aloneSomewhere(hue);
    for (let { here, kinds, series } of slideHues) {
      let statusLike = (hue) => !isAccent(hue) && statusBand(hue, !0) >= 0 && (!kinds.has(1) || statusBand(hue, !0) === 0 && !kinds.has(0)), votes = (hue) => statusBand(hue) < 0 ? kinds.size >= 2 && statusLike(hue) : hue !== givenHue && (kinds.size >= 3 || kinds.size === 2 && notMainAccent(hue));
      for (let hue of here)
        (votes(hue) || series && !isAccent(hue)) && add(seriesVotes, hue);
    }
    let seriesHues = new Set(hues.filter((hue) => (seriesVotes.get(hue) ?? 0) * 2 + +(statusBand(hue) >= 0) > (slidesWith.get(hue) ?? 0)));
    return new Set([...representative].filter(([, hue]) => seriesHues.has(hue)).map(([value]) => value));
  }
  function assignUseRoles(uses, ground, system) {
    let dark = isDark(ground), theme = system !== void 0 ? themeFor(system, dark) : void 0, opposite = system?.themes.find((other) => other.dark !== dark), valueOf = (use) => rgb(use.value), onOf = (use) => use.on ?? ground, roles = /* @__PURE__ */ new Map(), roleOfValue = /* @__PURE__ */ new Map(), inversePages = /* @__PURE__ */ new Set(), slotName = (use, role) => {
      let status = role === "status" ? [...theme?.colors ?? [], ...opposite?.colors ?? []].find((color) => color.status !== void 0 && rgb(color.value) === valueOf(use)) : void 0;
      return status !== void 0 ? statusSlot(status) : role === "status" ? "other" : role;
    }, fromSystem = (use, context) => {
      let matches = (theme?.colors ?? []).filter((color) => rgb(color.value) === valueOf(use) && SLOT_ROLES_BY_PROP[use.prop].includes(color.role) && !(color.role === "other" && parseHex(color.value)?.alpha !== "" && parseHex(color.value)?.alpha !== parseHex(use.value)?.alpha));
      if (matches.length === 0) {
        let other = isDark(use.prop === "ground" ? valueOf(use) : onOf(use)) !== dark ? (opposite?.colors ?? []).find((color) => rgb(color.value) === valueOf(use)) : void 0;
        return other === void 0 ? void 0 : isAreaUse(use) ? "inverse" : other.role === "accent" ? "inverse-accent" : other.role === "text" || other.role === "on-accent" ? "on-inverse" : other.role === "status" ? "status" : other.role === "other" && isChromatic(valueOf(use)) ? "other" : "on-inverse-muted";
      }
      let order = use.prop === "text" && context === "accent" ? ["on-accent", ...SLOT_ROLES_BY_PROP.text] : use.prop === "text" && context === "inverse" ? [
        "on-inverse",
        "on-inverse-muted",
        "inverse-accent",
        ...SLOT_ROLES_BY_PROP.text
      ] : valueOf(use) === ground ? ["background", ...SLOT_ROLES_BY_PROP[use.prop]] : SLOT_ROLES_BY_PROP[use.prop], best = [...matches].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.rank - b.rank)[0];
      return use.prop === "text" && context === "inverse" && (best.role === "background" || best.role === "surface" || best.role === "on-accent") ? "on-inverse" : use.prop === "text" && (best.role === "background" || best.role === "surface") || use.prop === "text" && context === "accent" && !isChromatic(valueOf(use)) && (best.role === "text" || best.role === "other" && parseHex(use.value)?.alpha === "") ? "on-accent" : isAreaUse(use) && (best.role === "text" || best.role === "muted") ? "inverse" : best.role;
    }, chromatic = chromaticValuesByWeight(uses.filter((use) => use.keep !== !0)), mainAccent = chromatic.find((value) => primaryAccentValues(theme).includes(value)) ?? chromatic[0], otherHues = chromatic.filter((value) => !sameAccentHue(value, mainAccent) && statusBand(value) < 0), fewHues = distinctHueCount(otherHues) <= 1 || distinctHueCount(chromatic.filter((value) => !sameAccentHue(value, mainAccent))) <= 2, isAccentHue = (value) => sameAccentHue(value, mainAccent) || fewHues && otherHues.some((other) => value === other || sameAccentHue(value, other)), areaRole = (use) => {
      let value = valueOf(use);
      return value === ground ? "background" : isChromatic(value) ? isAccentHue(value) ? contrast(value, ground) < 1.3 && chroma(value) < 0.09 ? "accent-soft" : "accent" : "other" : isDark(value) !== dark && contrast(value, ground) >= 4.5 ? "inverse" : use.prop === "ground" || contrast(value, onOf(use)) < 1.25 ? "surface" : "border";
    };
    for (let use of [...uses].filter(isAreaUse).sort((a, b) => a.prop === b.prop ? 0 : a.prop === "ground" ? -1 : 1)) {
      let role = fromSystem(use, void 0) ?? (use.keep === !0 ? "other" : areaRole(use));
      role === "inverse" && use.prop === "ground" && use.page !== void 0 && inversePages.add(use.page), roles.set(use.key, slotName(use, role)), (!roleOfValue.has(valueOf(use)) || use.prop === "ground") && roleOfValue.set(valueOf(use), role);
    }
    let groundRole = (use) => roleOfValue.get(onOf(use)) ?? "background", neutralText = uses.filter((use) => use.prop === "text" && !isChromatic(valueOf(use))), mainText = (accept) => {
      let candidates = neutralText.filter((use) => accept(groundRole(use)));
      return (valuesByCount(candidates.filter((use) => contrast(valueOf(use), onOf(use)) >= 7))[0] ?? valuesByCount(candidates)[0])?.[0];
    }, bodyText = mainText((role) => role !== "accent" && role !== "inverse" && role !== "status" && role !== "other"), inverseText = mainText((role) => role === "inverse"), readsLike = (use, reference) => reference === void 0 || contrast(valueOf(use), onOf(use)) >= 0.8 * contrast(reference, onOf(use)), inkRole = (use, context) => {
      let value = valueOf(use);
      return use.prop === "text" && contrast(value, onOf(use)) < 1.5 ? "other" : context === "accent" ? "on-accent" : context === "status" || context === "other" ? "other" : isChromatic(value) && !isPaleTint(value) ? isAccentHue(value) ? context === "inverse" ? "inverse-accent" : "accent" : "other" : context === "inverse" ? readsLike(use, inverseText) ? "on-inverse" : "on-inverse-muted" : use.prop === "line" ? contrast(value, onOf(use)) >= 7 ? "text" : "border" : readsLike(use, bodyText) ? "text" : "muted";
    };
    for (let use of uses.filter((other) => !isAreaUse(other)))
      roles.set(use.key, slotName(use, fromSystem(use, groundRole(use)) ?? (use.keep === !0 ? "other" : inkRole(use, groundRole(use)))));
    for (let use of uses)
      use.page !== void 0 && inversePages.has(use.page) && roles.get(use.key).includes("inverse") && roles.set(use.key, PAGE_SLOT_PREFIX + roles.get(use.key));
    return roles;
  }
  function deckGround(uses) {
    let sitting = /* @__PURE__ */ new Map();
    for (let use of uses) {
      let on = use.prop === "ground" ? rgb(use.value) : use.on;
      on !== void 0 && sitting.set(on, (sitting.get(on) ?? 0) + use.count);
    }
    return [
      ...new Set(uses.filter((use) => use.prop === "ground").map((use) => rgb(use.value)))
    ].sort((a, b) => sitting.get(b) * (isChromatic(b) ? 0.5 : 1) - sitting.get(a) * (isChromatic(a) ? 0.5 : 1) || (a < b ? 1 : -1))[0] ?? "#ffffff";
  }
  function groupColorUses(uses) {
    let grouped = /* @__PURE__ */ new Map();
    for (let use of uses) {
      if (parseHex(use.value) === void 0)
        continue;
      let key = colorUseKey(use), entry = grouped.get(key) ?? { ...use, key, slot: "", count: 0 };
      entry.count += 1, grouped.set(key, entry);
    }
    return [...grouped.values()];
  }
  function matchingMemory(memory, uses) {
    if (memory === void 0)
      return;
    let known = new Set(memory.flatMap((entry) => Object.values(entry.colors)).map(rgb)), [matched, total] = uses.reduce(([hit, all], use) => [
      hit + (known.has(rgb(use.value)) ? use.count : 0),
      all + use.count
    ], [0, 0]);
    return matched * 2 >= total ? memory : void 0;
  }
  function analyzeDeckColors(uses, system, memory) {
    let ground = deckGround(uses), current = memory?.[0], slots = /* @__PURE__ */ new Map();
    if (current !== void 0) {
      for (let use of uses) {
        let value = rgb(use.value), isCurrent = (slot2) => rgb(own(current.colors, slot2) ?? "") === value, onInverse = isInversePage(current, use.page) || !Object.values(current.colors).some((color) => rgb(color) === use.page) && isInversePage(memory[1], use.page), original = memory[1] !== void 0 ? memorySlotMatching(memory[1], use.prop, value, onInverse) : void 0, slot = use.mark === OWN_PALETTE_SLOT ? void 0 : isCurrent(use.mark) ? use.mark : memorySlotMatching(current, use.prop, value, onInverse) ?? (own(current.colors, original) !== void 0 ? original : void 0);
        slot !== void 0 && (use.slot = slot, isCurrent(slot) || (use.stray = !0));
      }
      for (let [slot, color] of Object.entries(current.colors))
        slots.set(slot, color);
    } else {
      let roles = assignUseRoles(uses, ground, system), groups = /* @__PURE__ */ new Map();
      for (let use of uses) {
        let key = roles.get(use.key) + " " + rgb(use.value);
        groups.set(key, [...groups.get(key) ?? [], use]);
      }
      let weight = (role, members) => members.reduce((sum, use) => sum + use.count * (role === "accent" && isAreaUse(use) ? 3 : 1), 0), counters2 = /* @__PURE__ */ new Map(), primary = new Set(primaryAccentValues(system !== void 0 ? themeFor(system, isDark(ground)) : void 0).map((value) => "accent " + value)), isPrimary = (key) => Number(primary.has(key)), roleOf = (key) => key.split(" ")[0];
      for (let [key, members] of [...groups].sort((a, b) => isPrimary(b[0]) - isPrimary(a[0]) || weight(roleOf(b[0]), b[1]) - weight(roleOf(a[0]), a[1]) || (a[0] < b[0] ? -1 : 1))) {
        let role = roleOf(key), count = (counters2.get(role) ?? 0) + 1;
        counters2.set(role, count);
        let slot = count === 1 ? role : role + "-" + String(count);
        slots.set(slot, rgb(members[0].value));
        for (let use of members)
          use.slot = slot;
      }
    }
    let unslotted = valuesByCount(uses.filter((use) => use.slot === "")).map(([value]) => value), ownSlot = (value) => OWN_PALETTE_SLOT + (unslotted.indexOf(value) > 0 ? "-" + String(unslotted.indexOf(value) + 1) : "");
    for (let use of uses)
      use.slot === "" && (use.slot = ownSlot(rgb(use.value)));
    for (let value of unslotted)
      slots.set(ownSlot(value), value);
    let theme = system !== void 0 ? themeFor(system, isDark(ground), current?.look.split("/")[1]) : void 0, colors = [...slots].map(([id, value]) => {
      let role = paletteSlotRole(id), token = theme?.colors.find((color) => color.role === role && rgb(color.value) === rgb(value))?.name;
      return {
        id,
        role,
        value,
        count: uses.filter((use) => use.slot === id).reduce((sum, use) => sum + use.count, 0),
        ...token !== void 0 ? { token } : {}
      };
    });
    return colors.sort((a, b) => colorRoles().indexOf(a.role) - colorRoles().indexOf(b.role) || Number(isOwnPaletteSlot(a.id)) - Number(isOwnPaletteSlot(b.id)) || a.id.length - b.id.length || (a.id < b.id ? -1 : 1)), findSlotMixes(colors), {
      dark: isDark(ground),
      colors,
      uses,
      strays: uses.reduce((sum, use) => sum + (use.stray === !0 ? use.count : 0), 0)
    };
  }
  const MIX_ANCHOR_SLOTS = [
    "background",
    "surface",
    "text",
    "accent",
    "inverse",
    "on-accent",
    "on-inverse",
    PAGE_SLOT_PREFIX + "inverse",
    PAGE_SLOT_PREFIX + "on-inverse"
  ], MAX_MIX_ACCENTS = 16;
  function findSlotMixes(slots) {
    let accents = slots.filter((slot) => slot.role === "accent" && altSlotBase(slot.id) === void 0).slice(0, MAX_MIX_ACCENTS), anchors = slots.filter((slot) => MIX_ANCHOR_SLOTS.includes(slot.id) || accents.includes(slot));
    for (let slot of slots) {
      let soft = slot.role === "accent-soft";
      if (MIX_ANCHOR_SLOTS.includes(slot.id) && slot.id !== "surface" || ["inverse", "accent", "inverse-accent", "other", "status"].includes(slot.role) || altSlotBase(slot.id) !== void 0)
        continue;
      let best;
      for (let first of anchors)
        for (let second of anchors) {
          if (first === second || first === slot || second === slot || distance(rgb(first.value), rgb(second.value)) < 20 || [first, second].some((anchor) => anchor.role !== "accent" && (anchor.role.includes("inverse") !== slot.role.includes("inverse") || isPageSlot(anchor.id) !== isPageSlot(slot.id))))
            continue;
          let withAccent = first.role === "accent" || second.role === "accent";
          if (soft ? !withAccent : withAccent && !isChromatic(rgb(slot.value)) && slot.role !== "on-accent")
            continue;
          let [start, end, point] = [
            channels(rgb(first.value)),
            channels(rgb(second.value)),
            channels(rgb(slot.value))
          ], direction = end.map((value, index4) => value - start[index4]), t = point.reduce((sum, value, index4) => sum + (value - start[index4]) * direction[index4], 0) / direction.reduce((sum, value) => sum + value * value, 0), miss = t > 0.04 && t < 0.96 ? distance(rgb(slot.value), mix(rgb(first.value), rgb(second.value), t)) : 1 / 0;
          miss < (soft ? 7 : 2.5) && (best === void 0 || miss < best.d) && (best = { a: first.id, b: second.id, t: Number(t.toFixed(3)), d: miss });
        }
      best !== void 0 && (slot.mix = { a: best.a, b: best.b, t: best.t });
    }
  }
  const TEXT_LOOK_PROPS = [
    "family",
    "fontSize",
    "fontWeight",
    "italic",
    "lineHeight",
    "letterSpacing",
    "textTransform"
  ], sameLookProp = (a, b, prop) => prop === "family" ? restyleFaceKey(a.family) === restyleFaceKey(b.family) : a[prop] === b[prop];
  function nearestMemoryTextSlot(memory, look, mark) {
    return Object.keys(memory.text).map((id) => ({
      id,
      own: TEXT_LOOK_PROPS.filter((prop) => !sameLookProp(memory.text[id], look, prop))
    })).filter((slot) => slot.own.length <= 2).sort((a, b) => a.own.length - b.own.length || +(b.id === mark) - +(a.id === mark) || (a.id < b.id ? -1 : 1))[0];
  }
  const isEmphasisLook = (look) => look.fontWeight >= 600 || look.textTransform === "uppercase" || look.letterSpacing > 0;
  function textRoleBySize(look, slots) {
    let gap = (slot) => Math.abs(Math.log(slot.fontSize / look.fontSize)) + (isEmphasisLook(slot) === isEmphasisLook(look) ? 0 : 0.3), nearest = [...slots].sort((a, b) => gap(a) - gap(b))[0];
    return nearest !== void 0 && Math.abs(Math.log(nearest.fontSize / look.fontSize)) < 0.35 ? nearest.role : look.fontSize >= 96 ? "display" : look.fontSize >= 64 ? "h1" : look.fontSize >= 48 ? "h2" : look.fontSize >= 36 ? isEmphasisLook(look) ? "h3" : "lead" : look.fontSize >= 28 ? "body" : isEmphasisLook(look) ? "eyebrow" : "caption";
  }
  function analyzeDeckText(uses, memory) {
    let groups = /* @__PURE__ */ new Map();
    for (let use of uses) {
      let { role, mark, ...look } = use, group = groups.get(textUseKey(use)) ?? {
        key: textUseKey(use),
        look,
        ...mark !== void 0 ? { mark } : {},
        count: 0,
        roles: /* @__PURE__ */ new Map()
      };
      group.count += 1, role !== void 0 && group.roles.set(role, (group.roles.get(role) ?? 0) + 1), groups.set(group.key, group);
    }
    let topRole = (roles) => [...roles].sort((a, b) => b[1] - a[1])[0]?.[0], ordered = [...groups.values()].sort((a, b) => b.count - a.count || b.look.fontSize - a.look.fontSize || (a.key < b.key ? -1 : 1)), slots = /* @__PURE__ */ new Map(), textAssign = {}, textStrays = [], textOwn = {}, strays = 0, current = memory?.[0];
    if (current !== void 0) {
      for (let group of ordered) {
        let isCurrent = (slot2) => {
          let look = own(current.text, slot2);
          return look !== void 0 && textLookKey(look) === textLookKey(group.look);
        }, original = memory[1] !== void 0 ? memoryTextSlotFor(memory[1], group.look) : void 0, exact = isCurrent(group.mark) ? group.mark : memoryTextSlotFor(current, group.look) ?? (own(current.text, original) !== void 0 ? original : void 0), near = exact === void 0 ? nearestMemoryTextSlot(current, group.look, group.mark) : void 0, slot = exact ?? near?.id;
        slot !== void 0 && (near !== void 0 ? textOwn[group.key] = near.own : isCurrent(slot) || (strays += group.count, textStrays.push(group.key)), textAssign[group.key] = slot, slots.set(slot, {
          ...current.text[slot],
          id: slot,
          role: textSlotRole(slot),
          count: (slots.get(slot)?.count ?? 0) + group.count
        }));
      }
      for (let [slot, look] of Object.entries(current.text))
        slots.has(slot) || slots.set(slot, { ...look, id: slot, role: textSlotRole(slot), count: 0 });
    } else {
      let counters2 = /* @__PURE__ */ new Map(), place = (group, given) => {
        let role = !isHeading(given) && group.look.fontSize >= 64 ? group.look.fontSize >= 96 ? "display" : "h1" : given, count = (counters2.get(role) ?? 0) + 1;
        counters2.set(role, count);
        let slot = count === 1 ? role : role + "-" + String(count);
        textAssign[group.key] = slot, slots.set(slot, { ...group.look, id: slot, role, count: group.count });
      };
      for (let group of ordered)
        group.roles.size > 0 && place(group, topRole(group.roles));
      let placed = [...slots.values()];
      for (let group of ordered)
        group.roles.size === 0 && place(group, textRoleBySize(group.look, placed));
    }
    let text = [...slots.values()].sort((a, b) => ladderRoles().indexOf(a.role) - ladderRoles().indexOf(b.role) || b.count - a.count), families = /* @__PURE__ */ new Map();
    for (let group of ordered) {
      let face = group.look.family;
      if (face === void 0 || face.generic === "mono")
        continue;
      let entry = families.get(restyleFaceKey(face)) ?? {
        f: face,
        n: 0,
        size: 0,
        titles: 0
      }, title = ["display", "h1", "h2"].includes(topRole(group.roles) ?? "");
      families.set(restyleFaceKey(face), {
        f: entry.f,
        n: entry.n + group.count,
        size: entry.size + group.count * Math.log(group.look.fontSize),
        titles: entry.titles + (title ? group.count : 0)
      });
    }
    let total = [...families.values()].reduce((sum, entry) => sum + entry.n, 0), common = [...families.values()].filter((entry) => entry.n >= 0.04 * total), heading = [...common].sort((a, b) => b.titles - a.titles || b.size / b.n - a.size / a.n)[0]?.f, body = common.filter((entry) => common.length === 1 || entry.f !== heading).sort((a, b) => b.n - a.n)[0]?.f;
    return {
      text,
      textAssign,
      textStrays,
      textOwn,
      families: {
        ...heading !== void 0 ? { heading } : {},
        ...body !== void 0 ? { body } : {}
      },
      strays
    };
  }
  function analyzeDeckStyles(colors, text, system, memory) {
    let uses = groupColorUses(colors);
    if (new Set(uses.map((use) => rgb(use.value))).size > MAX_DECK_COLORS)
      return {
        dark: !1,
        colors: [],
        uses: [],
        text: [],
        textAssign: {},
        textStrays: [],
        textOwn: {},
        families: {},
        strays: 0,
        over: !0
      };
    let remembered = matchingMemory(memory, uses), [colorAnalysis, textAnalysis] = [
      analyzeDeckColors(uses, system, remembered),
      analyzeDeckText(text, remembered)
    ];
    return {
      ...colorAnalysis,
      ...textAnalysis,
      strays: colorAnalysis.strays + textAnalysis.strays,
      ...remembered !== void 0 ? { memory: remembered } : {}
    };
  }
  const minBy = (items, score) => [...items].sort((a, b) => score(a) - score(b))[0], analysisLook = (analysis, system) => analysis.memory?.[0]?.look ?? (system !== void 0 ? themeKey(system, themeFor(system, analysis.dark)) : ORIGINAL_LOOK);
  function keptRestylePlan(analysis, system, withStrays) {
    return {
      from: analysisLook(analysis, system),
      assign: Object.fromEntries(analysis.uses.filter((use) => withStrays || use.stray !== !0).map((use) => [use.key, use.slot])),
      textAssign: Object.fromEntries(Object.entries(analysis.textAssign).filter(([key]) => withStrays || !analysis.textStrays.includes(key))),
      textOwn: analysis.textOwn,
      colors: Object.fromEntries(analysis.colors.map((slot) => [
        slot.id,
        { from: slot.value, to: slot.value, why: "kept" }
      ])),
      text: Object.fromEntries(analysis.text.map(({ id, role, count, ...look }) => [
        id,
        { from: look, to: look, why: "kept" }
      ])),
      faces: {}
    };
  }
  function pushContrast(color, ground, target, score) {
    let end = isDark(ground) ? "#ffffff" : "#000000";
    for (let amount = 0.02; amount < 1; amount += 0.02)
      if (score(mix(rgb(color), end, amount)) >= target)
        return mix(rgb(color), end, amount);
    return end;
  }
  function ensureLegibility(analysis, plan, theme, opposite) {
    let { assign, colors } = plan, originalOf = (slot) => own(analysis.memory?.[1]?.colors, slot) ?? own(analysis.memory?.[1]?.colors, altSlotBase(slot ?? "")), background = rgb(own(colors, "background")?.to ?? "#ffffff"), groundsBySurface = /* @__PURE__ */ new Map(), inversePageValues = new Set(analysis.uses.filter((use) => use.prop === "ground" && isPageSlot(use.slot)).map((use) => rgb(use.value))), surfaceKey = (use, value) => (use.page !== void 0 && inversePageValues.has(use.page) ? PAGE_SLOT_PREFIX : "") + (value ?? ""), groundRank = (use, slot) => isOwnPaletteSlot(slot) ? 3 : paletteSlotRole(slot) === "background" ? 0 : use.prop === "ground" ? 1 : 2, collectGrounds = () => {
      groundsBySurface.clear();
      let areas = analysis.uses.filter(isAreaUse).map((use) => ({
        c: surfaceKey(use, rgb(use.value)),
        id: own(assign, use.key) ?? use.slot,
        u: use
      }));
      for (let { c, id } of areas.sort((a, b) => groundRank(a.u, a.id) - groundRank(b.u, b.id))) {
        let slots = groundsBySurface.get(c) ?? [];
        !slots.includes(id) && !(isOwnPaletteSlot(id) && slots.length > 0) && groundsBySurface.set(c, [...slots, id]);
      }
    };
    collectGrounds();
    let neutralRoles = [
      "text",
      "muted",
      "on-accent",
      "on-inverse",
      "on-inverse-muted",
      "background",
      "surface"
    ], sittingValues = new Set(analysis.uses.map((use) => surfaceKey(use, use.on))), order = (use) => use.prop === "text" ? 2 : sittingValues.has(surfaceKey(use, rgb(use.value))) ? 0 : 1;
    for (let use of [...analysis.uses].sort((a, b) => order(a) - order(b))) {
      let change = own(colors, use.slot), groundAffinity = (slot) => inversePageValues.size === 0 ? 0 : +(isPageSlot(slot) === isPageSlot(use.slot)) * 2 + +(paletteSlotRole(slot) === (paletteSlotRole(use.slot) === "on-accent" ? "accent" : paletteSlotRole(use.slot).includes("inverse") ? "inverse" : "")), groundSlots = [
        ...groundsBySurface.get(surfaceKey(use, use.on)) ?? []
      ].sort((a, b) => groundAffinity(b) - groundAffinity(a)), grounds = groundSlots.flatMap((slot) => own(colors, slot) ?? []), dataFill = use.prop === "fill" && isChromatic(rgb(use.value));
      if (use.prop !== "text" && !dataFill || use.on === void 0 || grounds.length === 0 || change === void 0 || change.why === "remembered" || own(assign, use.key) === void 0)
        continue;
      let on = use.on, alpha = parseHex(use.value).alpha, readOn = (color, ground) => contrast(flatten(rgb(color) + (alpha !== "" ? alpha : parseHex(color)?.alpha ?? ""), ground), ground), [originalInk, originalGround] = [
        originalOf(use.slot),
        originalOf(groundSlots[0])
      ], originalContrast = originalInk !== void 0 && originalGround !== void 0 ? contrast(flatten(rgb(originalInk) + alpha, rgb(originalGround)), rgb(originalGround)) : contrast(flatten(use.value, on), on), role = paletteSlotRole(use.slot), target = Math.min((role === "status" && !dataFill && change.why === "same-role" ? 1 : 0.85) * originalContrast, dataFill ? 1.2 : use.small === !0 ? 4.5 : 3), base = altSlotBase(use.slot) ?? use.slot, accentInk = role === "accent" || role === "inverse-accent", takenElsewhere = (color) => Object.entries(colors).some(([slot, other]) => (altSlotBase(slot) ?? slot) !== base && rgb(other.to) === rgb(color)), pick = (over, giveUp = !1) => {
        let flatGrounds = over.map((ground) => flatten(ground.to, background)), worst = (color) => Math.min(...flatGrounds.map((ground) => readOn(color, ground)));
        if (worst(change.to) >= target)
          return;
        let nearestGround = [...flatGrounds].sort((a, b) => readOn(change.to, a) - readOn(change.to, b))[0], sameToken = change.token === void 0 || !(accentInk || role === "muted" || role === "text" || role === "status") ? void 0 : opposite?.colors.find((color) => color.name === change.token && worst(color.value) >= target && !(accentInk && takenElsewhere(color.value)))?.value, fromTheme2 = dataFill ? void 0 : sameToken ?? withRole(theme, accentInk ? "accent" : role).filter((color) => (accentInk ? color.asText === !0 && !takenElsewhere(color.value) : role === "status" ? change.token !== void 0 && statusSlot(color) === base.replace(/-\d+$/, "") + "-text" : role === "muted" || role === "text") && worst(color.value) >= target).sort((a, b) => worst(a.value) - worst(b.value))[0]?.value;
        if (fromTheme2 !== void 0)
          return fromTheme2;
        if (!dataFill && neutralRoles.includes(role) && change.token !== void 0 && over.every((ground) => ground.token !== void 0) && worst(change.to) >= 0.85 * target)
          return;
        let pushed = dataFill || isChromatic(rgb(change.to)) || role === "muted" || role === "on-inverse-muted" ? pushContrast(change.to, nearestGround, target, worst) : void 0;
        if (pushed !== void 0 && (dataFill || worst(pushed) >= target))
          return pushed;
        if (giveUp)
          return "";
        let candidates = Object.entries(colors).filter(([slot]) => neutralRoles.includes(paletteSlotRole(slot))).map(([, other]) => flatten(other.to, nearestGround)).filter((color) => worst(color) >= target), strongest = (list) => [...list].sort((a, b) => worst(b) - worst(a))[0], lighter = luminance(rgb(use.value)) > luminance(on);
        return strongest(candidates.filter((color) => luminance(flatten(color, nearestGround)) > luminance(nearestGround) === lighter)) ?? strongest(candidates) ?? (worst("#ffffff") >= worst("#000000") ? "#ffffff" : "#000000");
      }, first = pick(grounds, grounds.length > 1), value = first === "" ? pick(grounds.slice(0, 1)) : first;
      if (value === void 0)
        continue;
      let alt = base + "-alt";
      for (let index4 = 2; own(colors, alt) !== void 0 && colors[alt].to !== value; index4++)
        alt = base + "-alt" + String(index4);
      colors[alt] = { from: change.from, to: value, why: "legibility" }, assign[use.key] = alt, dataFill && collectGrounds();
    }
    for (let [slot, change] of Object.entries(colors)) {
      let base = altSlotBase(slot);
      if (base === void 0 || change.why !== "legibility" || own(colors, base) === void 0)
        continue;
      let siblings = Object.keys(colors).filter((other) => other !== slot && altSlotBase(other) === base);
      if (![base, ...siblings].some((id) => Object.values(assign).includes(id))) {
        colors[base] = { from: colors[base].from, to: change.to, why: "legibility" };
        for (let key of Object.keys(assign))
          assign[key] === slot && (assign[key] = base);
        for (let id of [slot, ...siblings])
          delete colors[id];
      }
    }
  }
  function planSystemRestyle(analysis, system, from, options = {}) {
    let theme = themeFor(system, analysis.dark, options.theme), opposite = system.themes.find((other) => theme !== void 0 && other.dark !== theme.dark), firstOf = (role, of) => withRole(of, role)[0], look = themeKey(system, theme), remembered = analysis.memory?.find((entry) => entry.look === look), deckBackground = rgb(analysis.colors.find((slot) => slot.id === "background")?.value ?? (analysis.dark ? "#000000" : "#ffffff")), background = rgb((firstOf("background", theme) ?? firstOf("surface", theme))?.value ?? deckBackground), ink = rgb((firstOf("text", theme) ?? withRole(theme, "inverse").find((color) => contrast(rgb(color.value), background) >= 7))?.value ?? (isDark(background) ? "#ffffff" : "#000000")), originalColors = analysis.memory?.[1]?.colors, originallyDark = isDark(rgb(own(originalColors, "background") ?? own(originalColors, "surface") ?? deckBackground)), isFlippedPage = (slot) => isPageSlot(slot.id) && slot.role === "inverse" && isDark(rgb(own(originalColors, slot.id) ?? own(originalColors, altSlotBase(slot.id)) ?? slot.value)) === isDark(background) && originallyDark !== isDark(background), hasFlippedPages = analysis.colors.some(isFlippedPage), deckInverse = analysis.colors.find((slot) => slot.role === "inverse"), textAsInverse = (color) => deckInverse !== void 0 && color.value === rgb(color.value) && contrast(color.value, background) >= 7 && isDark(color.value) === isDark(rgb(own(originalColors, deckInverse.id) ?? deckInverse.value)) && withRole(theme, "accent").length > 0 && !withRole(theme, "accent").some((accent) => rgb(accent.value) === color.value), inverse = firstOf("inverse", theme) ?? firstOf("background", opposite) ?? firstOf("surface", opposite) ?? withRole(theme, "text").find(textAsInverse), themeHasInverse = firstOf("inverse", theme) !== void 0, noInverse = inverse === void 0, surface = withRole(theme, "surface").find((color) => distance(flatten(color.value, background), background) >= 2), surfaceValue = rgb(surface?.value ?? mix(background, ink, 0.08)), originalBackground = rgb(own(analysis.memory?.[1]?.colors, "background") ?? deckBackground), kept = keptRestylePlan(analysis, from, !0), changes = {}, restyledAccents = () => analysis.colors.filter((slot) => slot.role === "accent" && altSlotBase(slot.id) === void 0 && own(changes, slot.id) !== void 0).map((slot) => rgb(changes[slot.id].to)), closestContrast = (colors, ground, wanted) => minBy(colors, (color) => Math.abs(Math.log(contrast(flatten(color.value, ground), ground) / wanted)) + color.rank / 100), themeStatus = (slot) => withRole(theme, "status").find((color) => statusSlot(color) === slot.replace(/-\d+$/, "")), fromStatusValues = (dark) => (from?.themes ?? []).filter((other) => other.dark === dark).flatMap((other) => withRole(other, "status").map((color) => rgb(color.value))), fromOppositeStatus = (value) => !fromStatusValues(analysis.dark).includes(value) && fromStatusValues(!analysis.dark).includes(value), statusSlots = analysis.colors.filter((slot) => slot.role === "status" && altSlotBase(slot.id) === void 0), oppositeStatusSlots = statusSlots.filter((slot) => fromOppositeStatus(rgb(slot.value))), allInTheme = (slots) => slots.every((slot) => themeStatus(slot.id) !== void 0), statusFromTheme = allInTheme(oppositeStatusSlots.length < statusSlots.length ? statusSlots.filter((slot) => !oppositeStatusSlots.includes(slot)) : oppositeStatusSlots), planOrder = (slot) => (altSlotBase(slot.id) !== void 0 || slot.mix !== void 0 ? 10 : 0) + (slot.role === "on-accent" || slot.role === "accent-soft" || slot.role === "inverse-accent" ? 1 : 0), extraSlots = [], originalValue = (slot) => own(originalColors, slot.id) ?? slot.value;
    for (let { mix: _mix, ...slot } of analysis.colors.filter((candidate) => isPageSlot(candidate.id) && altSlotBase(candidate.id) === void 0 && !analysis.colors.some((other) => !isPageSlot(other.id) && other.role === candidate.role && originalValue(other) === originalValue(candidate)))) {
      let id = [
        slot.role,
        ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => slot.role + "-" + String(n))
      ].find((candidate) => ![...analysis.colors, ...extraSlots].some((other) => other.id === candidate));
      id !== void 0 && extraSlots.push({ ...slot, id, count: 0 });
    }
    for (let slot of [...analysis.colors, ...extraSlots].sort((a, b) => planOrder(a) - planOrder(b))) {
      let set = (token, fallback, why = "derived") => void (changes[slot.id] = token !== void 0 ? { from: slot.value, to: token.value, token: token.name, why: "same-role" } : { from: slot.value, to: fallback, why }), flippedPage = slot.role === "inverse" ? isFlippedPage(slot) : hasFlippedPages && isPageSlot(slot.id), ownInverse = noInverse || flippedPage, sameRole = flippedPage ? [] : withRole(theme, slot.role), inverseGround = rgb((ownInverse ? void 0 : inverse?.value) ?? surfaceValue), deckInverseValue = rgb(analysis.colors.find((other) => other.role === "inverse" && isPageSlot(other.id) === isPageSlot(slot.id))?.value ?? (analysis.dark ? "#ffffff" : "#000000")), value = rgb(slot.value), rememberedValue = own(remembered?.colors, slot.id), originalSlotValue = own(analysis.memory?.[1]?.colors, slot.id) ?? slot.value, baseChange = own(changes, altSlotBase(slot.id)), sameToken = slot.token !== void 0 && slot.role !== "status" ? sameRole.find((color) => color.name === slot.token) : void 0, [mixA, mixB] = [own(changes, slot.mix?.a), own(changes, slot.mix?.b)], hasRoleColors = sameRole.length > 0 || slot.role === "on-inverse-muted" && withRole(opposite, "muted").length > 0;
      if (rememberedValue !== void 0)
        changes[slot.id] = { from: slot.value, to: rememberedValue, why: "remembered" };
      else if (baseChange !== void 0)
        changes[slot.id] = { ...baseChange, from: slot.value };
      else if (sameToken !== void 0)
        changes[slot.id] = {
          from: slot.value,
          to: sameToken.value,
          token: sameToken.name,
          why: "same-token"
        };
      else if (slot.mix !== void 0 && mixA !== void 0 && mixB !== void 0 && (unpageSlot(slot.id) !== slot.role || !hasRoleColors))
        set(void 0, mix(rgb(mixA.to), rgb(mixB.to), slot.mix.t));
      else if (slot.role === "background")
        set(sameRole[0], background);
      else if (slot.role === "text")
        set(closestContrast(sameRole, background, contrast(rgb(originalSlotValue), originalBackground)), ink);
      else if (slot.role === "surface" || slot.role === "muted" || slot.role === "border")
        set(closestContrast(sameRole, background, contrast(flatten(originalSlotValue, originalBackground), originalBackground)), mix(background, ink, slot.role === "surface" ? 0.04 : slot.role === "border" ? 0.14 : 0.62));
      else if (slot.role === "accent") {
        let sibling = analysis.colors.find((other) => other !== slot && other.role === "accent" && own(changes, other.id) !== void 0 && altSlotBase(other.id) === void 0 && hueDiff(rgb(other.value), value) < 25), seriesColors = restyledAccents().length === 0 || statusBand(value, slot.token === void 0) >= 0 ? [] : withRole(theme, "other").filter((color) => color.series === !0 && statusBand(rgb(color.value), !0) < 0 && Math.abs(Math.log(contrast(rgb(color.value), background) / contrast(rgb(originalSlotValue), originalBackground))) < 0.4 && !analysis.colors.some((other) => rgb(other.value) === rgb(color.value))), distinct = [
          ...sameRole.filter((color) => restyledAccents().length === 0 || color.rank < runtime2.UNFIT_ROLE_RANK || statusBand(rgb(color.value)) < 0),
          ...seriesColors
        ].find((color) => restyledAccents().every((accent) => isChromatic(accent) && isChromatic(rgb(color.value)) ? hueDiff(accent, rgb(color.value)) >= 30 : distance(accent, rgb(color.value)) > 8));
        if (sibling !== void 0) {
          let [siblingLightness, ownLightness, siblingTo] = [
            lightness(rgb(sibling.value)),
            lightness(value),
            rgb(changes[sibling.id].to)
          ];
          if (Math.abs(ownLightness - siblingLightness) < (analysis.uses.filter((use) => use.slot === slot.id).every((use) => use.prop === "fill") ? 0.08 : 0.15))
            changes[slot.id] = { ...changes[sibling.id], from: slot.value };
          else {
            let step = Math.min(0.8, ownLightness > siblingLightness ? (ownLightness - siblingLightness) / (1 - siblingLightness) : (siblingLightness - ownLightness) / siblingLightness), tints = [step, step + 0.15, step + 0.3].map((amount) => mix(siblingTo, ownLightness > siblingLightness ? "#ffffff" : "#000000", Math.min(0.9, amount)));
            set(void 0, tints.find((tint) => restyledAccents().every((accent) => distance(accent, tint) > 5)) ?? tints[0]);
          }
        } else if (distinct !== void 0)
          set(distinct, "");
        else if (restyledAccents().length === 0)
          set(void 0, ink);
        else {
          let [mainAccent, isArea, textOnIt] = [
            restyledAccents()[0],
            analysis.uses.some((use) => use.slot === slot.id && isAreaUse(use)),
            [
              ...new Map(analysis.uses.filter((use) => use.prop === "text" && use.on === value).map(({ page: _page, ...use }) => [colorUseKey(use), use])).values()
            ]
          ], lightText = textOnIt.filter((use) => luminance(rgb(use.value)) > luminance(value)).length * 2 > textOnIt.length, score = (end) => isArea ? textOnIt.length > 0 ? +(end === "#000000" !== lightText) : Math.abs(lightness(mix(mainAccent, end, 0.35)) - lightness(value)) : -contrast(mix(mainAccent, end, 0.35), background), tints = ["#000000", "#ffffff"].sort((a, b) => score(a) - score(b)).slice(0, isArea ? 1 : 2).flatMap((end) => [0.35, 0.6].map((amount) => mix(mainAccent, end, amount))), colorful = (tint2) => isArea ? chroma(tint2) >= 0.055 : isChromatic(tint2), tint = statusBand(value, slot.token === void 0) < 0 ? tints.find((candidate) => colorful(candidate) && restyledAccents().every((accent) => distance(accent, candidate) > 10) && contrast(candidate, background) >= 1.5) : void 0;
          set(void 0, tint ?? originalSlotValue, tint !== void 0 ? "derived" : "kept");
        }
      } else if (slot.role === "accent-soft") {
        let accent = minBy(analysis.colors.filter((other) => other.role === "accent" && own(changes, other.id) !== void 0), (other) => hueDiff(rgb(other.value), value)), accentTo = accent !== void 0 ? rgb(changes[accent.id].to) : ink;
        set(isChromatic(accentTo) ? minBy(sameRole.filter((color) => hueDiff(rgb(color.value), accentTo) < 40), (color) => hueDiff(rgb(color.value), accentTo)) : sameRole[0], mix(background, accentTo, 0.12));
      } else if (slot.role === "on-accent")
        set(sameRole[0], [background, ink, rgb(firstOf("on-inverse", theme)?.value ?? background)].sort((a, b) => contrast(b, restyledAccents()[0] ?? ink) - contrast(a, restyledAccents()[0] ?? ink))[0]);
      else if (slot.role === "inverse")
        set((ownInverse ? void 0 : inverse) ?? surface, surfaceValue);
      else if (slot.role === "on-inverse")
        set(ownInverse ? firstOf("text", theme) : sameRole[0] ?? firstOf("text", opposite), ownInverse ? ink : background);
      else if (slot.role === "on-inverse-muted")
        set(closestContrast(ownInverse ? withRole(theme, "muted") : sameRole.length > 0 ? sameRole : withRole(opposite, "muted"), inverseGround, contrast(value, deckInverseValue)), mix(ownInverse ? ink : background, inverseGround, 0.35));
      else if (slot.role === "inverse-accent") {
        let accent = minBy(analysis.colors.filter((other) => other.role === "accent" && altSlotBase(other.id) === void 0 && own(changes, other.id) !== void 0), (other) => hueDiff(rgb(other.value), value)), accentTo = accent !== void 0 ? rgb(changes[accent.id].to) : !ownInverse && inverse?.role === "text" && firstOf("accent", theme) !== void 0 ? rgb(firstOf("accent", theme).value) : void 0;
        set((flippedPage || themeHasInverse ? void 0 : firstOf("accent", opposite)) ?? withRole(theme, "accent").find((color) => contrast(rgb(color.value), inverseGround) >= 3.8 && (accentTo === void 0 || !isChromatic(accentTo) || hueDiff(rgb(color.value), accentTo) < 25)), accentTo === void 0 ? mix(background, ownInverse ? ink : background, 0.5) : contrast(accentTo, inverseGround) >= 4.5 ? accentTo : pushContrast(accentTo, inverseGround, 4.5, (color) => contrast(color, inverseGround)));
      } else
        slot.role === "status" && statusFromTheme ? set(oppositeStatusSlots.includes(slot) && !allInTheme(oppositeStatusSlots) ? void 0 : themeStatus(slot.id), originalSlotValue) : set(void 0, originalSlotValue, "kept");
    }
    for (let slot of analysis.colors) {
      let change = changes[slot.id];
      slot.role !== "surface" || change.why === "remembered" || distance(rgb(slot.value), deckBackground) < 2 || distance(flatten(change.to, background), background) >= 2 || (changes[slot.id] = surface !== void 0 ? { from: slot.value, to: surface.value, token: surface.name, why: "same-role" } : { from: slot.value, to: mix(background, ink, 0.05), why: "derived" });
    }
    for (let slot of analysis.colors.filter((candidate) => isFlippedPage(candidate) && changes[candidate.id].why !== "remembered")) {
      let clashes = (color) => Object.entries(changes).some(([id, other]) => (altSlotBase(id) ?? id) !== (altSlotBase(slot.id) ?? slot.id) && rgb(other.to) === rgb(color) && analysis.colors.some((candidate) => candidate.id === id && (candidate.count > 0 || candidate.role === "background" || candidate.role === "surface"))), freeSurface = withRole(theme, "surface").find((color) => !clashes(color.value) && distance(flatten(color.value, background), background) >= 2), steps = [1, 2, 3, 4, 5, 6, 7, 8].map((step) => mix(contrast(surfaceValue, ink) < contrast(background, ink) ? surfaceValue : background, ink, 0.04 * step));
      clashes(changes[slot.id].to) && (changes[slot.id] = freeSurface !== void 0 ? {
        from: slot.value,
        to: freeSurface.value,
        token: freeSurface.name,
        why: "same-role"
      } : {
        from: slot.value,
        to: steps.find((step) => !clashes(step)) ?? steps.at(-1),
        why: "derived"
      });
    }
    let plan = {
      ...kept,
      to: look,
      colors: changes,
      ...planTextRestyle(analysis, system, remembered, options)
    };
    return ensureLegibility(analysis, plan, theme, opposite), foldAltSlots(plan);
  }
  function foldAltSlots(plan) {
    let alphaOf = (change) => parseHex(change?.from ?? "")?.alpha, folded = Object.keys(plan.colors).filter((slot) => own(plan.colors, altSlotBase(slot))?.to === plan.colors[slot].to && alphaOf(own(plan.colors, altSlotBase(slot))) === alphaOf(plan.colors[slot]));
    return folded.length === 0 ? plan : {
      ...plan,
      assign: Object.fromEntries(Object.entries(plan.assign).map(([key, slot]) => [
        key,
        folded.includes(slot) ? altSlotBase(slot) : slot
      ])),
      colors: Object.fromEntries(Object.entries(plan.colors).filter(([slot]) => !folded.includes(slot)))
    };
  }
  function systemFace(family) {
    let generic = /^(ui-|system-ui|-apple|blinkmac|sans-serif$|serif$|monospace$)/i, backup = family.stack.split(",").slice(1, 8).map((name) => name.trim().replace(/^["']|["']$/g, "")).find((name) => !generic.test(name));
    return generic.test(family.name) ? { name: "", generic: family.generic } : {
      name: family.name,
      generic: family.generic,
      ...backup !== void 0 ? { backup } : {}
    };
  }
  const roundTo = (value, step) => Math.round(value / step) * step;
  function planTextRestyle(analysis, system, remembered, options) {
    let text = {}, headingSizes = [
      ...new Set(analysis.text.filter((slot) => isHeading(slot.role)).map((slot) => slot.fontSize))
    ].sort((a, b) => b - a), steps = system.headings.length > 0 ? system.headings : system.ladder.body !== void 0 ? [system.ladder.body] : [], headingStyle = (fontSize) => steps[Math.min(steps.length - 1, steps.length >= headingSizes.length ? headingSizes.indexOf(fontSize) : Math.floor(headingSizes.indexOf(fontSize) * steps.length / Math.max(1, headingSizes.length)))], systemStyle = (slot) => isHeading(slot.role) ? headingStyle(slot.fontSize) : system.ladder[slot.role], deckSizes = analysis.text.map((slot) => slot.fontSize), systemSizes = analysis.text.flatMap((slot) => systemStyle(slot)?.fontSize ?? []), [deckMin, deckMax, systemMin, systemMax] = [
      Math.min(...deckSizes),
      Math.max(...deckSizes),
      Math.min(...systemSizes),
      Math.max(...systemSizes)
    ], twoFamilies = analysis.families.heading !== void 0 && analysis.families.body !== void 0 && restyleFaceKey(analysis.families.heading) !== restyleFaceKey(analysis.families.body), bodySize = analysis.text.find((slot) => slot.id === "body")?.fontSize ?? 32;
    for (let slot of analysis.text) {
      let { id, role: _role, count: _count, ...look } = slot, style = systemStyle(slot), rememberedLook = own(remembered?.text, id);
      if (rememberedLook !== void 0)
        text[id] = { from: look, to: rememberedLook, why: "remembered" };
      else if (style === void 0 || look.family?.generic === "mono")
        text[id] = { from: look, to: look, why: "kept" };
      else {
        let family = twoFamilies ? restyleFaceKey(look.family) === restyleFaceKey(analysis.families.heading) ? system.families.heading : system.families.body : style.family, weightSource = family === void 0 || family.name === style.family?.name ? style : minBy(system.styles.filter((other) => other.family?.name === family.name), (other) => Math.abs(Math.log(other.fontSize / style.fontSize))), fontSize = options.sizes !== "system" ? slot.fontSize : (system.ladder.body?.fontSize ?? 0) >= 24 ? style.fontSize : systemMax > systemMin && deckMax > deckMin ? roundTo(deckMin * (deckMax / deckMin) ** (Math.log(style.fontSize / systemMin) / Math.log(systemMax / systemMin)), 2) : slot.fontSize, face = family !== void 0 ? systemFace(family) : look.family, weight = weightSource !== void 0 ? Math.min(900, Math.max(100, roundTo(weightSource.fontWeight, 100))) : look.fontWeight, keepBold = look.fontWeight >= 600 && weight < 600 && slot.fontSize < 1.3 * bodySize;
        text[id] = {
          from: look,
          to: {
            ...face !== void 0 ? { family: face } : {},
            fontSize,
            fontWeight: keepBold ? look.fontWeight : weight,
            italic: look.italic || (weightSource?.italic ?? !1),
            lineHeight: look.lineHeight,
            letterSpacing: Math.min(MAX_LETTER_SPACING, Math.max(MIN_LETTER_SPACING, Number((style.letterSpacing / style.fontSize * fontSize).toFixed(1)))),
            ...look.textTransform !== void 0 ? { textTransform: look.textTransform } : {}
          },
          token: style.name,
          why: "same-role"
        };
      }
    }
    return { text, faces: planFaces(text, analysis) };
  }
  function planFaces(text, analysis) {
    let moves = /* @__PURE__ */ new Map();
    for (let [id, change] of Object.entries(text)) {
      if (change.from.family === void 0 || change.to.family === void 0)
        continue;
      let targets = moves.get(restyleFaceKey(change.from.family)) ?? /* @__PURE__ */ new Map();
      targets.set(restyleFaceKey(change.to.family), {
        f: change.to.family,
        n: (targets.get(restyleFaceKey(change.to.family))?.n ?? 0) + (analysis.text.find((slot) => slot.id === id)?.count ?? 1)
      }), moves.set(restyleFaceKey(change.from.family), targets);
    }
    return Object.fromEntries([...moves].map(([face, targets]) => [
      face,
      [...targets.values()].sort((a, b) => b.n - a.n)[0].f
    ]));
  }
  function planSlotColor(analysis, slotId, color, from) {
    let plan = keptRestylePlan(analysis, from, !1), slot = analysis.colors.find((candidate) => candidate.id === slotId);
    if (slot === void 0)
      return plan;
    let same = analysis.colors.filter((other) => other.role === slot.role && other.value === slot.value && isOwnPaletteSlot(other.id) === isOwnPaletteSlot(slot.id)).map((other) => other.id);
    for (let id of same)
      plan.colors[id] = { from: slot.value, to: color, why: "hand" };
    for (let other of analysis.colors)
      other.mix !== void 0 && other.role !== "surface" && (same.includes(other.mix.a) || same.includes(other.mix.b)) && (plan.colors[other.id] = {
        from: other.value,
        to: mix(rgb(plan.colors[other.mix.a].to), rgb(plan.colors[other.mix.b].to), other.mix.t),
        why: "derived"
      });
    return plan;
  }
  function planTextSlot(analysis, slotId, look, from) {
    let plan = keptRestylePlan(analysis, from, !1), change = own(plan.text, slotId);
    return change !== void 0 && (plan.text[slotId] = { from: change.from, to: { ...change.to, ...look }, why: "hand" }), plan;
  }
  function planFamily(analysis, which, face, from) {
    let plan = keptRestylePlan(analysis, from, !1), twoFamilies = analysis.families.heading !== void 0 && analysis.families.body !== void 0 && restyleFaceKey(analysis.families.heading) !== restyleFaceKey(analysis.families.body);
    for (let slot of analysis.text)
      (twoFamilies ? restyleFaceKey(slot.family) === restyleFaceKey(analysis.families[which]) : isHeading(slot.role) === (which === "heading")) && slot.family?.generic !== "mono" && (plan.text[slot.id] = {
        from: plan.text[slot.id].from,
        to: { ...plan.text[slot.id].to, family: face },
        why: "hand"
      });
    return twoFamilies && analysis.families[which] !== void 0 && (plan.faces[restyleFaceKey(analysis.families[which])] = face), plan;
  }
  function planRevert(analysis) {
    let plan = keptRestylePlan(analysis, void 0, !0), original = analysis.memory?.[1];
    if (original === void 0)
      return plan;
    for (let [slot, change] of Object.entries(plan.colors)) {
      let value = own(original.colors, slot) ?? own(original.colors, altSlotBase(slot));
      value !== void 0 && (plan.colors[slot] = { from: change.from, to: value, why: "remembered" });
    }
    for (let [slot, change] of Object.entries(plan.text))
      own(original.text, slot) !== void 0 && (plan.text[slot] = { from: change.from, to: original.text[slot], why: "remembered" });
    return foldAltSlots({
      ...plan,
      to: original.look,
      faces: planFaces(plan.text, analysis)
    });
  }
  function invertRestylePlan(plan, analysis) {
    let inverse = keptRestylePlan(analysis, void 0, !1);
    for (let [slot, change] of Object.entries(inverse.colors))
      own(plan.colors, slot) !== void 0 && (inverse.colors[slot] = {
        from: change.from,
        to: plan.colors[slot].from,
        why: "remembered"
      });
    for (let [slot, change] of Object.entries(inverse.text))
      own(plan.text, slot) !== void 0 && (inverse.text[slot] = {
        from: change.from,
        to: plan.text[slot].from,
        why: "remembered"
      });
    return { ...inverse, faces: planFaces(inverse.text, analysis) };
  }
  function mapRestylePlanFaces(plan, map) {
    return {
      ...plan,
      text: Object.fromEntries(Object.entries(plan.text).map(([slot, change]) => [
        slot,
        change.to.family !== void 0 && change.why !== "kept" ? { ...change, to: { ...change.to, family: map(change.to.family) } } : change
      ])),
      faces: Object.fromEntries(Object.entries(plan.faces).map(([face, to]) => [face, map(to)]))
    };
  }
  function restylePlanChangesDeck(plan) {
    return plan.to !== void 0 || Object.values(plan.colors).some((change) => change.from !== change.to) || Object.values(plan.text).some((change) => JSON.stringify(change.from) !== JSON.stringify(change.to));
  }
  function restyledColor(plan, use) {
    let slot = own(plan.assign, colorUseKey(use)), change = own(plan.colors, slot), parsed = parseHex(use.value);
    if (!(slot === void 0 || change === void 0 || parsed === void 0))
      return {
        value: parsed.alpha === (parseHex(change.from)?.alpha ?? "") ? change.to : rgb(change.to) + parsed.alpha,
        slot
      };
  }
  function restyledText(plan, use) {
    let { role: _role, mark: _mark, ...look } = use, slot = own(plan.textAssign, textUseKey(use)), change = own(plan.text, slot);
    if (slot !== void 0 && change !== void 0)
      return {
        look: {
          ...change.to,
          ...Object.fromEntries((own(plan.textOwn, textUseKey(use)) ?? []).map((prop) => [prop, look[prop]]))
        },
        slot
      };
    let face = own(plan.faces, restyleFaceKey(use.family));
    return face !== void 0 ? { look: { ...look, family: face } } : void 0;
  }
  function nextRestyleMemory(plan, memory, faces) {
    let entry = (side2, look) => ({
      look,
      colors: Object.fromEntries(Object.entries(plan.colors).filter(([slot]) => !isOwnPaletteSlot(slot)).map(([slot, change]) => [slot, change[side2]])),
      text: Object.fromEntries(Object.entries(plan.text).map(([slot, change]) => [slot, change[side2]]))
    });
    if (plan.to === void 0 || plan.to === plan.from)
      return [entry("to", plan.from), ...(memory ?? []).slice(1)];
    let original = memory?.[1] ?? {
      ...entry("from", plan.from),
      ...faces !== void 0 ? { faces } : {}
    };
    return original.look === plan.to ? [entry("to", plan.to)] : [entry("to", plan.to), original];
  }
  const MEMORY_SLOT_PATTERN = /^[a-z][a-z0-9-]{0,31}$/, MEMORY_FAMILY_PATTERN = /^[A-Za-z][A-Za-z0-9 _-]{0,39}$/, MEMORY_LOOK_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}(\/[A-Za-z0-9][A-Za-z0-9_.-]{0,63})?$/, TEXT_TRANSFORMS = ["uppercase", "lowercase", "capitalize"];
  function serializeTextLook(look, fonts) {
    let font = look.family === void 0 ? "" : (MEMORY_FAMILY_PATTERN.test(look.family.name) ? look.family.name : "") + "/" + look.family.generic + (look.family.backup !== void 0 && MEMORY_FAMILY_PATTERN.test(look.family.backup) ? "/" + look.family.backup : "");
    font !== "" && !fonts.includes(font) && fonts.push(font);
    let parts = [
      look.fontSize,
      look.fontWeight,
      look.lineHeight,
      fonts.indexOf(font),
      look.letterSpacing,
      look.textTransform ?? "",
      look.italic ? 1 : 0
    ];
    for (; parts.length > 4 && (parts[parts.length - 1] === 0 || parts[parts.length - 1] === ""); )
      parts.pop();
    return parts.join(",");
  }
  function parseTextLook(value, fonts) {
    let parts = value.split(","), num = (index4) => parts[index4] === void 0 ? void 0 : Number(parts[index4]), [fontSize, fontWeight, lineHeight, fontIndex, letterSpacing, transform, italic] = [num(0), num(1), num(2), num(3), num(4), parts[5] ?? "", num(6)], inRange = (candidate, min2, max2) => Number.isFinite(candidate) && candidate >= min2 && candidate <= max2;
    if (!inRange(fontSize, 8, 400) || !inRange(fontWeight, 100, 900) || !inRange(lineHeight, 0.5, 4) || !inRange(letterSpacing ?? 0, MIN_LETTER_SPACING, MAX_LETTER_SPACING))
      return;
    let [name, generic, backup] = (fontIndex === void 0 ? void 0 : fonts[fontIndex])?.split("/") ?? [];
    if (name !== void 0 && name !== "" && !MEMORY_FAMILY_PATTERN.test(name))
      return;
    let family = name !== void 0 && (generic === "sans" || generic === "serif" || generic === "mono") ? {
      name,
      generic,
      ...backup !== void 0 && MEMORY_FAMILY_PATTERN.test(backup) ? { backup } : {}
    } : void 0, textTransform = TEXT_TRANSFORMS.find((name2) => name2 === transform);
    return {
      ...family !== void 0 ? { family } : {},
      fontSize,
      fontWeight,
      italic: italic === 1,
      lineHeight,
      letterSpacing: letterSpacing ?? 0,
      ...textTransform !== void 0 ? { textTransform } : {}
    };
  }
  const isMemoryColorSlot = (slot) => {
    if (isPageSlot(slot))
      return MEMORY_SLOT_PATTERN.test(slot) && !isPageSlot(unpageSlot(slot)) && paletteSlotRole(slot).includes("inverse") && isMemoryColorSlot(unpageSlot(slot));
    let base = slot.replace(/-alt\d*$/, "").replace(/-\d+$/, "");
    return MEMORY_SLOT_PATTERN.test(slot) && (base === OWN_PALETTE_SLOT && !isOwnPaletteSlot(slot) || colorRoles().some((role) => role === base) || /^status-(good|warn|bad|info)(-(soft|text|on))?$/.test(base));
  }, isMemoryTextSlot = (slot) => MEMORY_SLOT_PATTERN.test(slot) && ladderRoles().some((role) => role === slot.replace(/-\d+$/, "")), memoryPairs = (value, accept) => (typeof value == "string" ? value.split(" ", MAX_MEMORY_ENTRIES * 2) : []).map((pair) => [
    pair.slice(0, pair.indexOf(":")),
    pair.slice(pair.indexOf(":") + 1)
  ]).filter(([slot]) => accept(slot)).slice(0, MAX_MEMORY_ENTRIES);
  function serializeRestyleMemory(memory) {
    return memory.map((entry) => {
      let fonts = [], text = Object.entries(entry.text).slice(0, MAX_MEMORY_ENTRIES).map(([slot, look]) => slot + ":" + serializeTextLook(look, fonts)).join(" ");
      return {
        look: entry.look,
        colors: Object.entries(entry.colors).slice(0, MAX_MEMORY_ENTRIES).map(([slot, color]) => slot + ":" + color).join(" "),
        fonts: fonts.join(","),
        text,
        ...entry.faces !== void 0 ? { faces: entry.faces } : {}
      };
    });
  }
  function parseRestyleMemory(stored, parseFaces = () => {
  }) {
    let memory = [];
    for (let raw of Array.isArray(stored) ? stored.slice(0, MAX_REMEMBERED_LOOKS) : []) {
      let entry = typeof raw == "object" && raw !== null ? raw : {};
      if (typeof entry.look != "string" || !MEMORY_LOOK_PATTERN.test(entry.look))
        break;
      let fonts = typeof entry.fonts == "string" ? entry.fonts.split(",", 64) : [], colors = Object.fromEntries(memoryPairs(entry.colors, isMemoryColorSlot).filter(([, color]) => parseHex(color) !== void 0 && color === color.toLowerCase())), text = Object.fromEntries(memoryPairs(entry.text, isMemoryTextSlot).flatMap(([slot, value]) => {
        let look = parseTextLook(value, fonts);
        return look !== void 0 ? [[slot, look]] : [];
      })), faces = parseFaces(entry.faces);
      memory.push({
        look: entry.look,
        colors,
        text,
        ...faces !== void 0 ? { faces } : {}
      });
    }
    return memory.length > 0 ? memory : void 0;
  }
  const bind = (name, value) => bindRuntimeValue(runtime2, name, () => value);
  return bind("ownRestyleValue", ownRecordValue), bind("colorUseKey", colorUseKey), bind("isPageSlot", isPageSlot), bind("unpageSlot", unpageSlot), bind("paletteSlotRole", paletteSlotRole), bind("altSlotBase", altSlotBase), bind("OWN_PALETTE_SLOT", OWN_PALETTE_SLOT), bind("isOwnPaletteSlot", isOwnPaletteSlot), bind("restyleFaceKey", restyleFaceKey), bind("textLookKey", textLookKey), bind("textUseKey", textUseKey), bind("textSlotRole", textSlotRole), bind("ORIGINAL_LOOK", ORIGINAL_LOOK), bind("restyleCandidateSystems", restyleCandidateSystems), bind("memorySlotFor", memorySlotFor), bind("memoryTextSlotFor", memoryTextSlotFor), bind("deckSeriesColors", deckSeriesColors), bind("analyzeDeckStyles", analyzeDeckStyles), bind("planSystemRestyle", planSystemRestyle), bind("planSlotColor", planSlotColor), bind("planTextSlot", planTextSlot), bind("planFamily", planFamily), bind("planRevert", planRevert), bind("invertRestylePlan", invertRestylePlan), bind("mapRestylePlanFaces", mapRestylePlanFaces), bind("restylePlanChangesDeck", restylePlanChangesDeck), bind("restyledColor", restyledColor), bind("restyledText", restyledText), bind("nextRestyleMemory", nextRestyleMemory), bind("serializeRestyleMemory", serializeRestyleMemory), bind("parseRestyleMemory", parseRestyleMemory), () => {
  };
}
export {
  installDesignSystemRestyle
};
