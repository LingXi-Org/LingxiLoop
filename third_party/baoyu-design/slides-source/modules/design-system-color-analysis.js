// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { isRecord, bindRuntimeValue } from "../module-helpers.js";
function installDesignSystemColorAnalysis(runtime2) {
  const HEX_COLOR_PATTERN = /^#([0-9a-f]{6})([0-9a-f]{2})?$/;
  function parseHexColor(color) {
    let match = HEX_COLOR_PATTERN.exec(color.trim().toLowerCase());
    return match === null ? void 0 : {
      rgb: "#" + match[1],
      alpha: match[2] === void 0 || match[2] === "ff" ? "" : match[2]
    };
  }
  const hexColorRgb = (color) => parseHexColor(color)?.rgb ?? color, hexColorChannels = (color) => [
    parseInt(color.slice(1, 3), 16) / 255,
    parseInt(color.slice(3, 5), 16) / 255,
    parseInt(color.slice(5, 7), 16) / 255
  ], srgbToLinear = (channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  function relativeLuminance(color) {
    let [red, green, blue] = hexColorChannels(color);
    return 0.2126 * srgbToLinear(red) + 0.7152 * srgbToLinear(green) + 0.0722 * srgbToLinear(blue);
  }
  function contrastRatio(first, second) {
    let [a, b] = [relativeLuminance(first), relativeLuminance(second)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }
  function oklabColor(color) {
    let [sr, sg, sb] = hexColorChannels(color), [red, green, blue] = [srgbToLinear(sr), srgbToLinear(sg), srgbToLinear(sb)], l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue), m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue), s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    ];
  }
  function oklabChroma(color) {
    let [, a, b] = oklabColor(color);
    return Math.hypot(a, b);
  }
  function oklabDistance(first, second) {
    let [a, b] = [oklabColor(first), oklabColor(second)];
    return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  function mixHexColors(from, to, amount) {
    let [a, b] = [hexColorChannels(from), hexColorChannels(to)];
    return "#" + [0, 1, 2].map((index4) => Math.round((a[index4] * (1 - amount) + b[index4] * amount) * 255).toString(16).padStart(2, "0")).join("");
  }
  function flattenColorOn(color, ground) {
    let parsed = parseHexColor(color);
    return parsed === void 0 || parsed.alpha === "" ? hexColorRgb(color) : mixHexColors(ground, parsed.rgb, parseInt(parsed.alpha, 16) / 255);
  }
  const isDarkColor = (color) => relativeLuminance(color) < 0.18;
  function isChromaticColor(color) {
    let lightness = oklabColor(color)[0];
    return oklabChroma(color) >= (lightness < 0.35 ? 0.09 : lightness < 0.75 ? 0.055 : Math.max(0.03, 0.055 - (lightness - 0.75) / 0.15 * 0.025));
  }
  function hueDifference(first, second) {
    let hue = (color) => Math.atan2(oklabColor(color)[2], oklabColor(color)[1]) * 180 / Math.PI, difference = Math.abs(hue(first) - hue(second)) % 360;
    return difference > 180 ? 360 - difference : difference;
  }
  const STATUS_HUE_BANDS = [
    [10, 35],
    [55, 110],
    [120, 170]
  ], STATUS_HUE_BANDS_WIDE = [
    [10, 45],
    [45, 110],
    [120, 170]
  ];
  function statusHueBand(color, wide = !1) {
    let hue = Math.atan2(oklabColor(color)[2], oklabColor(color)[1]) * 180 / Math.PI;
    return (wide ? STATUS_HUE_BANDS_WIDE : STATUS_HUE_BANDS).findIndex(([from, to]) => hue >= from && hue <= to);
  }
  const isVividColor = (color) => oklabChroma(color) >= 0.09, hasStrongContrast = (color) => Math.max(contrastRatio(color, "#ffffff"), contrastRatio(color, "#000000")) >= 7, hasAlpha = (color) => parseHexColor(color)?.alpha !== "", blendsWithGround = (color, ground) => contrastRatio(color, ground) < 1.35 && oklabChroma(color) < 0.09, THEME_COLOR_ROLES = [
    "background",
    "surface",
    "text",
    "muted",
    "border",
    "accent",
    "accent-soft",
    "on-accent",
    "inverse",
    "on-inverse",
    "on-inverse-muted",
    "inverse-accent",
    "status",
    "other"
  ], TYPE_LADDER_ROLES = [
    "display",
    "h1",
    "h2",
    "h3",
    "lead",
    "eyebrow",
    "body",
    "caption"
  ], isHeadingLadderRole = (role) => role === "display" || role === "h1" || role === "h2" || role === "h3", STATUS_NAME_PATTERNS = [
    [
      /(^|-)(success|positive|good|ok|valid|confirmed|passed|healthy)(-|$)/,
      "good"
    ],
    [/(^|-)(warning|warn|wrn|caution|attention|at-risk)(-|$)/, "warn"],
    [
      /(^|-)(danger|error|err|negative|critical|destructive|bad|invalid|fail|failed|failure)(-|$)/,
      "bad"
    ],
    [
      /(^|-)(info|information|informational|informative|notice)(-|$)|(^|-)(status|state|feedback)-neutral(-|$)|(^|-)neutral-(status|state)(-|$)/,
      "info"
    ],
    [/(^|-)alert(-|$)/, "bad"]
  ], ROLE_SUFFIX_PATTERN = /-(border|divider|outline|stroke|hairline|separator|line|text|foreground|fg|ink|copy|background|bg|surface|canvas)$/, DATAVIZ_NAME_PATTERN = /(^|-)(data|dataviz|viz|charts?|series|categorical|category|graph|plot)\d*(-|$)/, TRAFFIC_LIGHT_NAMES = [
    [/(^|-)red\d*(-|$)/, "bad", 0],
    [/(^|-)(amber|yellow|orange)\d*(-|$)/, "warn", 1],
    [/(^|-)green\d*(-|$)/, "good", 2]
  ], COLOR_WORD_PATTERN = /^(red|orange|amber|yellow|gold|green|lime|olive|teal|cyan|aqua|blue|navy|indigo|violet|purple|magenta|pink|rose|brown|light|lighter|lightest|dark|darker|darkest|bright|deep|pale|soft|dim|ansi|palette|emerald|fuchsia|slate|zinc|gr[ae]y|neutral|white|black)$/, hasOwnNameWord = (family) => family.split("-").some((part) => part.length > 2 && !/\d/.test(part) && !STATE_SUFFIX_PATTERN.test("-" + part) && ![
    COLOR_WORD_PATTERN,
    TEXT_NAME_PATTERN,
    SURFACE_NAME_PATTERN,
    BORDER_NAME_PATTERN
  ].some((pattern) => pattern.test(part))), statusMeaningOfName = (name) => STATUS_NAME_PATTERNS.find(([pattern]) => pattern.test(name))?.[1], statusSlotId = (color) => color.status !== void 0 ? "status-" + color.status.meaning + (color.status.part !== "base" ? "-" + color.status.part : "") : void 0, UNFIT_ROLE_RANK = 20, PRIMARY_ACCENT_RANK_LIMIT = 5, MAX_TOKEN_USAGE_LENGTH = 300, MAX_SYSTEM_THEMES = 8, ACCENT_NAME_RANKS = [
    [/^primary\b/, 0],
    [/^brand\b/, 1],
    [/^(accent|acc)\b/, 2],
    [/^(action|interactive|cta|theme|main)\b/, 3],
    [/^highlight\b/, 4],
    [/^(secondary|tertiary)\b/, 5],
    [/^(links?|focus)\b/, 6]
  ], SOFT_SUFFIX_PATTERN = /(^|-)(soft|subtle|wash|tint|weak|container|fixed|bg|background|muted|light|lighter|lt)$/, TEXT_NAME_PATTERN = /^(text|txt|fg|foreground|ink|label|content|copy|body|heading|headline|title|type)\b/, MUTED_NAME_PATTERN = /(^|-)(muted|secondary|tertiary|quaternary|subtle|subtlest|soft|softer|weak|weaker|light|lighter|lightest|disabled|placeholder|dim|dimmed|quiet|low|meta|caption|helper|help|hint|supporting|subdued)(-|$)/, SURFACE_NAME_PATTERN = /^(surface|bg|background|canvas|page|base|paper|layer|card|panel|elevated|raised|ground|fill)\b/, RAISED_SURFACE_PATTERN = /(^|-)(raised|elevated|card|panel|secondary|tertiary|quaternary|alt|subtle|muted|sunken|overlay|popover|menu|layer|container|variant|dim|bright|lowest|low|high|highest)(-|$)/, NUMERIC_STEP_SUFFIX = /-\d{1,4}$/, EMPHASIS_NAME_PATTERN = /(^|-)(emphasis|bold|strong|solid|fill|filled)(-|$)/, STATUS_PART_PATTERNS = [
    [/(^|-)on(-|$)|(^|-)contrast$/, "on"],
    [/(^|-)(ink|text|fg|foreground)(-|$)/, "text"],
    [EMPHASIS_NAME_PATTERN, "base"],
    [SOFT_SUFFIX_PATTERN, "soft"],
    [SURFACE_NAME_PATTERN, "soft"],
    [/(^|-)(surface|container)(-|$)/, "soft"]
  ], GLUED_NUMBER_PATTERN = /(^|-)(text|fg|foreground|label|surface|bg|background|layer|border|stroke|line|brand|primary|accent)(\d+)(?=-|$)/g, nameMadeOf = (name, ...patterns) => name.split("-").every((part) => /^\d+$/.test(part) || patterns.some((pattern) => pattern.test(part))), STATE_SUFFIX_PATTERN = /-(hover|hovered|pressed|active|selected|focus|focused|visited|dragged|checked|disabled|link|fg|foreground|text)\d*(-|$)/, DISABLED_NAME_PATTERN = /(^|-)(disabled|placeholder)(-|$)/, NEUTRAL_QUALIFIER_PATTERN = /^(primary|strong|normal|regular|app|window|body|slide|layout|inset|deep)$/, BORDER_NAME_PATTERN = /^(border|bdr|brd|line|divider|outline|stroke|rule|separator|hairline|keyline)\b/, USAGE_ROLE_PATTERNS = [
    [
      /\b(success|error|warning|danger|destructive|positive|negative)\b/i,
      "status"
    ],
    [
      /\b(text|labels?|icons?)\b[^.]*\bon\b[^.]*\b(fills?|accent|brand|primary)\b/i,
      "on-accent"
    ],
    [/\b(tinted|wash|tint)\b/i, "accent-soft"],
    [
      /\b(text|labels?|icons?|type|copy)\b[^.]*\bon\b[^.]*\b(reversed?|inverted?|inverse)\b/i,
      "on-inverse"
    ],
    [
      /\b(reversed?|inverted?|inverse) (bands?|panels?|sections?|slides?|surfaces?|backgrounds?)\b/i,
      "inverse"
    ],
    [
      /\b(?:page|app|slide|window)s? backgrounds?\b|(?<!\bon\b(?:(?!\bas\b)[^.,;])*)\bbackgrounds?\b(?!(?:(?! behind\b)[^.,;])*\b(?:cards?|menus?|panels?|sheets?|popovers?|modals?|dialogs?|tooltips?|drawers?)\b(?! boards?\b))|\bcanvas\b/i,
      "background"
    ],
    [
      /\b(cards?|menus?|panels?|sheets?|popovers?|raised|elevated|content surfaces?)\b/i,
      "surface"
    ],
    [
      /\b(secondary|tertiary|muted|helper|placeholder|disabled) text\b|\bmetadata\b|\bcaptions?\b/i,
      "muted"
    ],
    [
      /\b(primary|body|main) (text|copy)\b|\bheadings?\b|\btitles?\b|^(text|type)\b/i,
      "text"
    ],
    [/\b(hairlines?|dividers?|borders?|outlines?|rules?)\b/i, "border"],
    [
      /\b(primary action|call to action|brand|logo|accent|active state|selected state|links?)\b/i,
      "accent"
    ]
  ], PAGE_BACKGROUND_RANK = 2.6, PAGE_BACKGROUND_USAGE_PATTERN = /\b(page|app|slide|window) background\b|\bcanvas\b/i, AS_TEXT_USAGE_PATTERN = /\bas text\b/i, NOT_BACKGROUND_USAGE_PATTERN = /\b(not|never|avoid|dont|\w+n['\u2019]t)\b[^.;]*\bas (?:the|a) backgrounds?\b/i, NOT_TEXT_USAGE_PATTERN = /\b(not|never|no|avoid|except|dont|\w+n['\u2019]t)\b[^.;]*\bas text\b/i, usageRole = (usage, excluded) => {
    if (excluded === void 0 && NOT_BACKGROUND_USAGE_PATTERN.test(usage))
      return usageRole(usage, "background");
    let early = USAGE_ROLE_PATTERNS.slice(0, 4).find(([pattern]) => pattern.test(usage))?.[1];
    if (early !== void 0)
      return early;
    let role = USAGE_ROLE_PATTERNS.slice(4).flatMap(([pattern, candidate]) => {
      let at = candidate === excluded ? void 0 : pattern.exec(usage)?.index;
      return at === void 0 ? [] : [{ role: candidate, at }];
    }).sort((a, b) => a.at - b.at).find((hit, _index, hits) => !(hit.role === "text" && hits.some((other) => other.role === "muted" && !/[.;]/.test(usage.slice(Math.min(hit.at, other.at), Math.max(hit.at, other.at))))))?.role, page = excluded === "background" || role === "background" || role === void 0 ? null : PAGE_BACKGROUND_USAGE_PATTERN.exec(usage);
    return page !== null && (role === "surface" || !SITS_ON_PREFIX_PATTERN.test(usage.slice(0, page.index))) ? "background" : role;
  }, SITS_ON_PREFIX_PATTERN = /(?<!\b(?:sits?|sitting|placed|rests?|floats?|goes|go|appears?)\s+)\b(?:on|over|against)\s+(?:(?:the|a|an|any|every|all|light|dark|white)\s+)*$/i, usageRoleCache = /* @__PURE__ */ new WeakMap();
  function readTokenUsages(tokens) {
    let list = isRecord(tokens) && isRecord(tokens.color) ? tokens.color.tokens : void 0, usages = /* @__PURE__ */ new Map();
    for (let entry of Array.isArray(list) ? list : [])
      isRecord(entry) && typeof entry.name == "string" && typeof entry.usage == "string" && usages.set(entry.name.replace(/^(--|\.)/, ""), entry.usage.slice(0, MAX_TOKEN_USAGE_LENGTH));
    return usages;
  }
  function shortTokenNames(tokens) {
    let dashed = (name) => name.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[_.]/g, "-").replace(GLUED_NUMBER_PATTERN, "$1$2-$3").replace(/(^|-)on(brand|accent|primary|secondary|danger|success|warning|error|info|inverse|surface|background)(?=-|$)/g, "$1on-$2"), parts = tokens.map((token) => dashed(token.name).split("-")), head = (index4) => parts[0]?.[index4] ?? "", shared = 0;
    for (; parts.length > 1 && parts.every((part) => part.length > shared + 1 && part[shared] === head(shared)) && ![TEXT_NAME_PATTERN, SURFACE_NAME_PATTERN, BORDER_NAME_PATTERN].some((pattern) => pattern.test(head(shared))) && !(ACCENT_NAME_RANKS.some(([pattern]) => pattern.test(head(shared))) && parts.some((part) => /^\d+$/.test(part.slice(shared + 1).join("")))); )
      shared++;
    let unprefixed = (name) => dashed(name).split("-").slice(shared).join("-"), short = (name, keepNeutral = !1) => unprefixed(name).replace(/(?<!(^|-)on)(^|-)(colou?rs?|system)(?=-|$)/g, "").replace(/^-/, "").replace(/^((semantic|alias|global|core|sys|ref|theme|tokens?)-)+(?=[a-z])/, "").replace(/^neutral-(.+)$/, (whole, rest) => !keepNeutral && [TEXT_NAME_PATTERN, SURFACE_NAME_PATTERN, BORDER_NAME_PATTERN].some((pattern) => pattern.test(rest)) ? rest : whole).replace(/^base-(?!(?:lightest|lighter|light|dark|darker|darkest)$)(?=[a-z])/, "").replace(/-(base|default|main|rest)$/, "").replace(/^(.+)-on$/, "on-$1").replace(/^(?!(?:bg|background|surface|border)\b)(.+)(?<!(?:^|-)(?:high|higher|highest|low|lower|max|more|less))-contrast$/, (whole, rest) => TEXT_NAME_PATTERN.test(rest) ? whole : "on-" + rest).replace(/^(?:(?:text|fg|foreground|content|icon|label)-)+((?:brand-|accent-|primary-)?on-.+)$/, "$1").replace(/^(secondary|tertiary|quaternary|placeholder|helper|hint|disabled|supporting)-(label|text|copy|ink|background|bg|surface|fill)\b/, "$2-$1"), plain = new Set(tokens.filter((token) => short(token.name) === short(token.name, !0)).map((token) => short(token.name))), pick = (name) => short(name) !== short(name, !0) && SURFACE_NAME_PATTERN.test(short(name)) && plain.has(short(name)) ? short(name, !0) : short(name);
    return new Map(tokens.map((token) => [
      token.name,
      pick(token.name) || (isVividColor(hexColorRgb(token.value)) ? dashed(token.name) : "text")
    ]));
  }
  function roleByContrast(name, value, ground, statusLike) {
    let [rgb, contrast] = [
      hexColorRgb(value),
      contrastRatio(flattenColorOn(value, ground), ground)
    ], [surfaceName, textName] = [
      SURFACE_NAME_PATTERN.test(name),
      TEXT_NAME_PATTERN.test(name) && name !== "body"
    ];
    if (isChromaticColor(rgb))
      return blendsWithGround(rgb, ground) ? "accent-soft" : statusLike ? "other" : "accent";
    if (contrast >= 7)
      return surfaceName ? hasAlpha(value) ? "other" : "inverse" : "text";
    if (contrast >= 3)
      return surfaceName ? "other" : "muted";
    if (textName || surfaceName && hasAlpha(value))
      return "other";
    let towardGround = isDarkColor(ground) ? relativeLuminance(rgb) < relativeLuminance(ground) : relativeLuminance(rgb) > relativeLuminance(ground);
    return contrast >= 1.12 && !towardGround && !(surfaceName && oklabChroma(rgb) < 0.02 && contrast < 1.6) ? "border" : hasAlpha(value) ? "other" : "surface";
  }
  function roleFitPenalty(role, name, value, ground, accent, severalStatusHues) {
    let [rgb, contrast] = [
      hexColorRgb(value),
      contrastRatio(flattenColorOn(value, ground), ground)
    ];
    return role === "accent" ? Math.max(0, 0.4 - oklabChroma(rgb)) / 2 + (severalStatusHues && statusHueBand(rgb, !0) >= 0 ? 0.5 : 0) + (STATE_SUFFIX_PATTERN.test(name) || hasAlpha(value) ? 0.25 : 0) : role === "text" ? Math.min(1, 1 - contrast / 21 + oklabChroma(rgb) * 2) : role === "muted" ? Math.abs(contrast - 5) / 10 : role === "border" ? Math.abs(contrast - 1.4) / 10 + oklabChroma(rgb) + (hasAlpha(value) ? 0.3 : 0) : role === "surface" ? oklabChroma(rgb) * 5 : role === "accent-soft" && accent !== void 0 ? hueDifference(rgb, accent) / 400 : 0;
  }
  function themeDarknessFromName(id, name) {
    let word = (id + " " + name).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/).flatMap((part) => /^(dark|night|black|dim|light|day|white|dawn)$/.test(part) ? [part] : /dark|night|black|^dimmed$/.test(part) ? ["dark"] : []).pop();
    return word === void 0 ? void 0 : /^(dark|night|black|dim)$/.test(word) ? "dark" : "light";
  }
  function pickGroundColor(backgrounds, candidates, texts, darkness) {
    let midTone = (color) => !isChromaticColor(color) && contrastRatio(color, "#ffffff") >= 3 && contrastRatio(color, "#000000") >= 3, wrongSide = (color) => darkness !== void 0 && isDarkColor(color) !== (darkness === "dark"), textReads = (ground, minimum) => texts.length === 0 || texts.some((text) => contrastRatio(flattenColorOn(text, ground), ground) >= minimum), best = backgrounds.find((color) => !midTone(color) && (texts.length > 0 || !wrongSide(color))) ?? backgrounds.find((color) => !midTone(color));
    if (best !== void 0 && textReads(best, 3) && (texts.length > 0 || !wrongSide(best)))
      return best;
    let sorted = candidates.filter((candidate) => best === void 0 || texts.length > 0 || candidate.ground).map((candidate) => candidate.value).sort((a, b) => (darkness === "dark" ? 1 : -1) * (relativeLuminance(a) - relativeLuminance(b)));
    return sorted.find((color) => !midTone(color) && !wrongSide(color) && textReads(color, 7)) ?? best ?? sorted[0] ?? (darkness === "dark" ? "#000000" : "#ffffff");
  }
  const demoteColor = (color, role) => void ([color.role, color.rank] = [role, color.rank + UNFIT_ROLE_RANK + 1]), byChromaDescending = (a, b) => oklabChroma(hexColorRgb(b.value)) - oklabChroma(hexColorRgb(a.value));
  function createRoleAssigner(values, usageOf) {
    usageRoleCache.has(usageOf) || usageRoleCache.set(usageOf, new Map([...usageOf].map(([name, usage]) => [name, usageRole(usage)])));
    let said = (name) => usageRoleCache.get(usageOf)?.get(name), shortNames = shortTokenNames(values), short = (name) => shortNames.get(name) ?? name, names = new Set(values.map((token) => short(token.name))), valueByShort = new Map([...values].reverse().filter((token) => parseHexColor(token.value) !== void 0).map((token) => [short(token.name), hexColorRgb(token.value)])), order = new Map(values.map((token, index4) => [
      token.name,
      index4 / Math.max(1e3, values.length * 10)
    ])), out = [], firstByShort = /* @__PURE__ */ new Map(), found = (name) => name !== void 0 ? firstByShort.get(name) : void 0, put = (token, role, rank) => {
      if (parseHexColor(token.value) === void 0)
        return;
      let usage = usageOf.get(token.name) ?? "", color = {
        name: token.name,
        value: token.value,
        role,
        rank: rank + (order.get(token.name) ?? 0),
        ...AS_TEXT_USAGE_PATTERN.test(usage) && !NOT_TEXT_USAGE_PATTERN.test(usage) ? { asText: !0 } : {}
      };
      return firstByShort.has(short(token.name)) || firstByShort.set(short(token.name), color), out.push(color), color;
    }, laid = /* @__PURE__ */ new Map(), meanings = /* @__PURE__ */ new Map();
    return {
      values,
      usageOf,
      said,
      out,
      names,
      short,
      family: (name) => short(name).replace(NUMERIC_STEP_SUFFIX, ""),
      found,
      put,
      putStatus: (token, meaning) => {
        let color = put(token, "status", /(^|-)neutral(-|$)/.test(short(token.name)) ? 0.5 : 0);
        color === void 0 || meaning === void 0 || (meanings.set(short(token.name), meaning), color.status = {
          meaning,
          part: STATUS_PART_PATTERNS.find(([pattern]) => pattern.test(short(token.name)))?.[1] ?? "base"
        });
      },
      meaningAt: (name) => meanings.get(name),
      sitsOn: (token) => {
        let name = short(token.name), base = /^(.+)-(?:foreground|fg|text|ink|content|invert)$/.exec(name)?.[1], baseValue = base === void 0 ? void 0 : valueByShort.get(base), vivid = isVividColor(hexColorRgb(token.value)) && !(baseValue !== void 0 && isVividColor(baseValue) && contrastRatio(hexColorRgb(token.value), baseValue) >= 3), on = /^on-(.+)$/.exec(name)?.[1] ?? (vivid ? void 0 : base ?? [/^(.+)-inverse$/.exec(name)?.[1]].find((candidate) => candidate !== void 0 && ACCENT_NAME_RANKS.some(([pattern]) => pattern.test(candidate))));
        return [
          ...on !== void 0 ? [on, on + "-bg", on + "-background"] : [],
          ...vivid || /^(primary|brand|accent)$/.test(name) ? [] : [name + "-bg", name + "-background"]
        ].find((candidate) => names.has(candidate));
      },
      laid
    };
  }
  function assignRolesByName({ values, usageOf, said, out, names, short, family, found, put, putStatus, meaningAt, sitsOn, laid }) {
    let prefixedFamily = (name) => name.includes("-") && names.has(name.slice(0, name.indexOf("-"))), rampLuminances = /* @__PURE__ */ new Map();
    for (let token of values) {
      let base = short(token.name).replace(NUMERIC_STEP_SUFFIX, "");
      base !== short(token.name) && (SURFACE_NAME_PATTERN.test(base) || TEXT_NAME_PATTERN.test(base)) && rampLuminances.set(base, (rampLuminances.get(base) ?? []).concat(relativeLuminance(hexColorRgb(token.value))));
    }
    let neutralRamps = new Set([...rampLuminances].filter(([, luminances]) => luminances.length >= 5 && (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05) >= 7).map(([base]) => base)), primary = values.find((token) => short(token.name) === "primary" && isChromaticColor(hexColorRgb(token.value)))?.value, readsOnPrimary = (token) => primary !== void 0 && ["text", "fg", "foreground", "ink", "body"].some((name) => names.has(name)) && contrastRatio(flattenColorOn(token.value, hexColorRgb(primary)), hexColorRgb(primary)) >= 4.5, byName = (token) => {
      let name = short(token.name), vivid = isVividColor(hexColorRgb(token.value)), colorful = vivid || isChromaticColor(hexColorRgb(token.value)) && oklabColor(hexColorRgb(token.value))[0] < 0.75;
      if (!isChromaticColor(hexColorRgb(token.value)) && NUMERIC_STEP_SUFFIX.test(name) && neutralRamps.has(name.replace(NUMERIC_STEP_SUFFIX, "")))
        return !1;
      let meaning = statusMeaningOfName(name);
      if (meaning !== void 0)
        putStatus(token, meaning);
      else if (DATAVIZ_NAME_PATTERN.test(name) && !ROLE_SUFFIX_PATTERN.test(name) && vivid && said(token.name) === void 0)
        Object.assign(put(token, "other", 0) ?? {}, /(^|-)(axis|grid|labels?|legend|ticks?)(-|$)/.test(name) ? {} : { series: !0 });
      else if (/(^|-)(shadow|scrim|overlay|backdrop|blanket)(-|$)/.test(name) && hasAlpha(token.value))
        put(token, "other", 0);
      else if (/invers|inverted|(^|-)inv(-|$)/.test(name)) {
        if (vivid && /(^|-)(primary|brand|accent|secondary|tertiary|link|focus)(-|$)/.test(name) || sitsOn(token) !== void 0)
          return !1;
        put(token, /(^|-)on-|-(text|foreground|fg|ink|label)$/.test(name) ? MUTED_NAME_PATTERN.test(name) ? "on-inverse-muted" : "on-inverse" : SURFACE_NAME_PATTERN.test(name) || /^invers/.test(name) ? "inverse" : MUTED_NAME_PATTERN.test(name) ? "on-inverse-muted" : "on-inverse", 0);
      } else if (/^(on-?colou?r|always-white|always-black)\b/.test(name))
        put(token, "on-accent", name.startsWith("always") ? 5 : 0);
      else if (/^(brand|accent|primary)-on-/.test(name) && !isChromaticColor(hexColorRgb(token.value)))
        put(token, "on-accent", 2);
      else if (!isChromaticColor(hexColorRgb(token.value)) && /^primary-(text|copy|ink|label)\b/.test(name) && said(token.name) !== "on-accent" && !readsOnPrimary(token))
        put(token, "text", 0);
      else if (!isChromaticColor(hexColorRgb(token.value)) && /^primary-(copy|label)$/.test(name) && readsOnPrimary(token))
        put(token, "on-accent", 1);
      else if (oklabChroma(hexColorRgb(token.value)) < 8e-3 && !hasAlpha(token.value) && /^primary-(background|bg|surface)$/.test(name))
        put(token, "background", 1);
      else {
        if (sitsOn(token) !== void 0)
          return !1;
        if (/^on-/.test(name) && (ACCENT_NAME_RANKS.some(([pattern]) => pattern.test(name.slice(3))) || EMPHASIS_NAME_PATTERN.test(name.slice(3)) || /(^|-)(brand|accent|primary)(-|$)/.test(name.slice(3))))
          put(token, "on-accent", 2);
        else if (/^on-/.test(name) && SURFACE_NAME_PATTERN.test(name.slice(3)) && !vivid)
          put(token, MUTED_NAME_PATTERN.test(name) || /-variant$/.test(name) ? "muted" : "text", 1);
        else if (/^on-/.test(name) && !/^on-(light|dark|white|black)(-|$)/.test(name))
          put(token, "other", 0);
        else if (ACCENT_NAME_RANKS.some(([pattern]) => pattern.test(name)))
          put(token, !vivid && /-(fg|foreground|text)$/.test(name) ? "on-accent" : SOFT_SUFFIX_PATTERN.test(name) && !(vivid && /(bg|background)$/.test(name)) ? "accent-soft" : "accent", ACCENT_NAME_RANKS.find(([pattern]) => pattern.test(name))[1] + (STATE_SUFFIX_PATTERN.test(name) ? 0.6 : 0));
        else if (/(^|-)link$/.test(name))
          put(token, "accent", 6);
        else if (vivid && /^(button|btn|cta)(-primary)?(-(background|bg|fill))?$/.test(name))
          put(token, "accent", 2);
        else if (colorful && /(^|-)(accent|brand|primary)(-(emphasis|bold|strong|solid|primary))?$/.test(name) && !(hasStrongContrast(hexColorRgb(token.value)) && nameMadeOf(name, TEXT_NAME_PATTERN, NEUTRAL_QUALIFIER_PATTERN)))
          put(token, "accent", /^(hover|hovered|pressed|active|selected|focus|focused|visited|disabled)-/.test(name) ? 6 : TEXT_NAME_PATTERN.test(name) ? 4.6 : BORDER_NAME_PATTERN.test(name) ? 4.8 : 2);
        else if (!colorful && !hasAlpha(token.value) && !TEXT_NAME_PATTERN.test(name) && EMPHASIS_NAME_PATTERN.test(name) && /(^|-)(accent|brand)(-|$)/.test(name))
          put(token, "accent", 2);
        else if (!colorful && SURFACE_NAME_PATTERN.test(name) && /(^|-)(accent|brand)(-|$)/.test(name) && !hasAlpha(token.value) && oklabChroma(hexColorRgb(token.value)) >= 8e-3)
          put(token, "accent-soft", 2);
        else if (!TEXT_NAME_PATTERN.test(name) && !BORDER_NAME_PATTERN.test(name) && /(^|-)(accent|brand|primary)-(muted|subtle|subtler|subtlest|soft|wash|tint|weak|light|lighter)$/.test(name))
          put(token, "accent-soft", 2);
        else {
          if (vivid && (BORDER_NAME_PATTERN.test(name) && name.includes("-") || TEXT_NAME_PATTERN.test(name) && !hasStrongContrast(hexColorRgb(token.value)) && !nameMadeOf(name, TEXT_NAME_PATTERN, MUTED_NAME_PATTERN, NEUTRAL_QUALIFIER_PATTERN) || SURFACE_NAME_PATTERN.test(name) && name.includes("-")) || SURFACE_NAME_PATTERN.test(name) && hasAlpha(token.value) || /^(line|rule)-/.test(name) && !nameMadeOf(name, BORDER_NAME_PATTERN, MUTED_NAME_PATTERN, RAISED_SURFACE_PATTERN, NEUTRAL_QUALIFIER_PATTERN, EMPHASIS_NAME_PATTERN, /^[a-z]$/))
            return !1;
          if (BORDER_NAME_PATTERN.test(name))
            put(token, /(^|-)(focus|ring)\d*(-|$)/.test(name) ? "other" : "border", STATE_SUFFIX_PATTERN.test(name) ? 0.6 : prefixedFamily(name) && !NUMERIC_STEP_SUFFIX.test(name) ? 0.5 : NUMERIC_STEP_SUFFIX.test(name) ? 0.2 + Math.min(Number(/\d+$/.exec(name)[0]), 999) / 5e3 : 0);
          else if (/^(muted|subtle|comments?)\b/.test(name) && !ROLE_SUFFIX_PATTERN.test(name) || TEXT_NAME_PATTERN.test(name) && MUTED_NAME_PATTERN.test(name) && nameMadeOf(name, TEXT_NAME_PATTERN, MUTED_NAME_PATTERN, NEUTRAL_QUALIFIER_PATTERN))
            put(token, "muted", DISABLED_NAME_PATTERN.test(name) ? 1.5 : 0);
          else if (TEXT_NAME_PATTERN.test(name) && !(name === "body" && (said(token.name) !== void 0 || values.some((other) => other !== token && TEXT_NAME_PATTERN.test(short(other.name)) && contrastRatio(flattenColorOn(other.value, hexColorRgb(token.value)), hexColorRgb(token.value)) >= 4.5))) && nameMadeOf(name, TEXT_NAME_PATTERN, NEUTRAL_QUALIFIER_PATTERN, /^(dark|darker)$/))
            put(token, "text", (prefixedFamily(name) ? 0.5 : 0) + (/(^|-)(heading|headline|title|label)(-|$)/.test(name) ? 0.3 : 0));
          else if (SURFACE_NAME_PATTERN.test(name) && nameMadeOf(name, SURFACE_NAME_PATTERN, RAISED_SURFACE_PATTERN, NEUTRAL_QUALIFIER_PATTERN) || name === "backdrop" && isChromaticColor(hexColorRgb(token.value))) {
            let saidRole = said(token.name) === "background" && !PAGE_BACKGROUND_USAGE_PATTERN.test(usageOf.get(token.name) ?? "") ? void 0 : said(token.name), role = saidRole === "background" || saidRole === "surface" || saidRole === "inverse" ? saidRole : RAISED_SURFACE_PATTERN.test(name) ? "surface" : "background";
            put(token, role, saidRole === role ? role === "background" && RAISED_SURFACE_PATTERN.test(name) ? 1.5 : 0 : role !== "background" ? 1 : /-(body|page|app|window|canvas)$/.test(name) ? 0.9 : prefixedFamily(name) ? 1.5 : 1);
          } else {
            if (vivid || /(^|-)(primary|brand|accent|cta|action|button|btn)(-|$)/.test(name))
              return !1;
            if (/-(border|divider|outline|stroke|hairline|separator)$/.test(name))
              put(token, "border", 1);
            else if (/-(text|foreground|fg|ink|copy)$/.test(name) && !/^(light|dark)-/.test(name))
              put(token, MUTED_NAME_PATTERN.test(name) ? "muted" : "text", DISABLED_NAME_PATTERN.test(name) ? 1.5 : 1);
            else if (/-(background|bg|surface|canvas)$/.test(name) && !/(^|-)on-/.test(name) && !/(^|-)(selection|selected|hover|hovered|pressed|active|highlight)(-|$)/.test(name) && !hasAlpha(token.value) && !isChromaticColor(hexColorRgb(token.value)))
              put(token, "surface", 1);
            else
              return !1;
          }
        }
      }
      return !0;
    }, byUsage = (token) => {
      let name = short(token.name);
      if (/^on-/.test(name) || SOFT_SUFFIX_PATTERN.test(name))
        return !1;
      let usage = usageOf.get(token.name) ?? "", role = said(token.name) === "background" && isChromaticColor(hexColorRgb(token.value)) && !PAGE_BACKGROUND_USAGE_PATTERN.test(usage) ? usageRole(usage, "background") : said(token.name), hasOn = names.has("on-" + name);
      if (role === "status")
        putStatus(token, statusMeaningOfName(usage.toLowerCase().replace(/[^a-z]+/g, "-")));
      else if ((role === "background" || role === "surface") && hasAlpha(token.value))
        put(token, "other", 2);
      else if (role !== void 0 && !(hasOn && role !== "accent"))
        put(token, role, role === "accent" && /invers|inverted|reversed?/.test(name) ? 6 : role !== "background" ? 2 : PAGE_BACKGROUND_USAGE_PATTERN.test(usage) ? RAISED_SURFACE_PATTERN.test(name) ? 2.5 : 2 : PAGE_BACKGROUND_RANK);
      else if (hasOn && isChromaticColor(hexColorRgb(token.value)))
        put(token, "accent", 3);
      else
        return !1;
      return !0;
    }, byPairing = (token) => {
      let name = short(token.name), on = sitsOn(token), paired = on !== void 0, base = on ?? name.replace(SOFT_SUFFIX_PATTERN, ""), baseRole = found(base)?.role;
      if (baseRole === "status")
        putStatus(token, meaningAt(base));
      else {
        if (paired && /^(light|dark)-/.test(name) && name.split("-")[0] === base.split("-")[0])
          return !1;
        if (paired && baseRole !== void 0) {
          let color = put(token, baseRole === "accent" ? "on-accent" : baseRole === "inverse" ? "on-inverse" : baseRole === "muted" || MUTED_NAME_PATTERN.test(name.startsWith(base + "-") ? name.slice(base.length) : name) || /-variant$/.test(name) ? "muted" : "text", baseRole === "accent-soft" || baseRole === "border" ? 2 : 1);
          color !== void 0 && laid.set(color, base);
        } else if (!paired && baseRole === "accent")
          put(token, "accent-soft", 0);
        else
          return !1;
      }
      return !0;
    }, rest = values.filter((token) => !byName(token)).filter((token) => !byUsage(token)).filter((token) => !byPairing(token)), firstOfFamily = /* @__PURE__ */ new Map();
    for (let color of out) {
      if (!NUMERIC_STEP_SUFFIX.test(short(color.name)))
        continue;
      let first = firstOfFamily.get(family(color.name)) ?? [found(family(color.name))].find((candidate) => candidate?.role === color.role);
      first === void 0 ? firstOfFamily.set(family(color.name), color) : color.role === "text" && color.value !== first.value ? color.role = "muted" : color.role === "background" && color.rank >= 1 && color.value !== first.value && (color.role = "surface");
    }
    for (let color of out)
      color.role === "accent" && /\bsecond(ary)?\b/i.test((usageOf.get(color.name) ?? "") + " " + short(color.name)) && (color.rank += 3);
    return rest;
  }
  function reconcileRoles({ usageOf, out, short, family, found, laid }, ground) {
    for (let color of out) {
      let percent = color.role === "border" ? /\bat (\d{1,2}) ?%/i.exec(usageOf.get(color.name) ?? "")?.[1] : void 0;
      percent !== void 0 && !hasAlpha(color.value) && (color.value += Math.round(Number(percent) / 100 * 255).toString(16).padStart(2, "0"));
    }
    let accentFamilies = new Set(out.filter((color) => color.role === "accent" && isChromaticColor(hexColorRgb(color.value))).map((color) => family(color.name)));
    for (let color of out) {
      let rgb = hexColorRgb(color.value);
      color.role === "accent" && accentFamilies.has(family(color.name)) ? color.role = blendsWithGround(rgb, ground) ? "accent-soft" : oklabChroma(rgb) < 0.03 ? "other" : "accent" : (color.role === "surface" || color.role === "background") && contrastRatio(rgb, ground) >= 7 ? color.role = "inverse" : color.role === "inverse" && contrastRatio(flattenColorOn(color.value, ground), ground) < 3 ? demoteColor(color, "other") : color.role === "background" && color.rank >= 2 && isChromaticColor(rgb) && rgb !== ground ? demoteColor(color, "background") : (color.role === "surface" || color.role === "background") && contrastRatio(rgb, ground) >= 3 ? demoteColor(color, "other") : color.role === "background" && color.rank >= 1 && rgb !== ground ? color.role = "surface" : (color.role === "text" || color.role === "muted" || color.role === "accent") && !isChromaticColor(rgb) && contrastRatio(flattenColorOn(color.value, ground), ground) < 1.5 ? /^primary-(text|copy|ink|label)$/.test(short(color.name)) ? [color.role, color.rank] = ["on-accent", 1 + color.rank % 1] : demoteColor(color, TEXT_NAME_PATTERN.test(short(color.name)) || color.role === "accent" && hasAlpha(color.value) ? "other" : "surface") : color.role === "accent-soft" && oklabChroma(rgb) < 8e-3 ? demoteColor(color, contrastRatio(rgb, ground) < 3 ? "surface" : "other") : color.role === "border" && color.rank >= 1 && contrastRatio(flattenColorOn(color.value, ground), ground) >= 7 ? demoteColor(color, "border") : color.role === "text" && color.rank < UNFIT_ROLE_RANK && isVividColor(rgb) && contrastRatio(flattenColorOn(color.value, ground), ground) < 7 ? demoteColor(color, "text") : color.role === "text" && color.rank < UNFIT_ROLE_RANK && /(^|-)labels?(-|$)/.test(short(color.name)) && contrastRatio(flattenColorOn(color.value, ground), ground) < 7 && (color.role = "muted");
    }
    let hasStrongAccent = out.some((color) => color.role === "accent" && (isChromaticColor(hexColorRgb(color.value)) || contrastRatio(hexColorRgb(color.value), ground) >= 7));
    for (let color of out)
      hasStrongAccent && color.role === "accent" && (oklabChroma(hexColorRgb(color.value)) < 0.02 || color.rank >= PRIMARY_ACCENT_RANK_LIMIT && !isChromaticColor(hexColorRgb(color.value))) && contrastRatio(hexColorRgb(color.value), ground) < 7 && demoteColor(color, "other");
    for (let color of out)
      color.role === "accent-soft" && contrastRatio(hexColorRgb(color.value), ground) >= 3 && (color.rank += 3);
    let text = out.filter((color) => color.role === "text").sort((a, b) => a.rank - b.rank)[0], textContrast = text === void 0 ? 21 : contrastRatio(flattenColorOn(text.value, ground), ground);
    for (let color of out)
      color.role === "muted" && color.rank < UNFIT_ROLE_RANK && (color.rank += DISABLED_NAME_PATTERN.test(short(color.name)) && contrastRatio(flattenColorOn(color.value, ground), ground) < 3 ? UNFIT_ROLE_RANK + 1 : contrastRatio(flattenColorOn(color.value, ground), ground) < 3 || contrastRatio(flattenColorOn(color.value, ground), ground) >= textContrast * 0.95 ? 0.8 : 0);
    for (let color of out)
      color.role === "border" && color.rank < UNFIT_ROLE_RANK && short(color.name).includes("-") && contrastRatio(flattenColorOn(color.value, ground), ground) >= 3 && (color.rank += 0.3);
    let ramps = /* @__PURE__ */ new Map();
    for (let color of out)
      (color.role === "accent" || color.role === "accent-soft") && NUMERIC_STEP_SUFFIX.test(short(color.name)) && ramps.set(family(color.name), [
        ...ramps.get(family(color.name)) ?? [],
        color
      ]);
    for (let ramp of ramps.values()) {
      let chromatic = ramp.filter((color) => isChromaticColor(hexColorRgb(color.value))).sort((a, b) => Number(/\d+$/.exec(short(a.name))?.[0]) - Number(/\d+$/.exec(short(b.name))?.[0]));
      if (ramp.length < 5 || chromatic.some((color, index4) => index4 > 0 && hueDifference(hexColorRgb(color.value), hexColorRgb(chromatic[index4 - 1].value)) >= 30))
        continue;
      let top = ramp.filter((color) => color.role === "accent").sort(byChromaDescending)[0], secondary = top === void 0 || out.some((color) => color.role === "accent" && !ramp.includes(color) && color.rank < PRIMARY_ACCENT_RANK_LIMIT && hueDifference(hexColorRgb(color.value), hexColorRgb(top.value)) < 30);
      for (let role of ["accent", "accent-soft"]) {
        let best = ramp.filter((color) => color.role === role).sort(byChromaDescending)[0];
        for (let color of ramp)
          color.role === role && (color.rank = secondary ? (color.rank < PRIMARY_ACCENT_RANK_LIMIT ? Math.min(Math.floor(color.rank) + 2, PRIMARY_ACCENT_RANK_LIMIT - 1) : Math.floor(color.rank) + 2) + (color === best ? 0 : 0.5) + color.rank % 1 / 2 : Math.floor(color.rank) + 0.3 + (color === best ? 0 : 0.4) + color.rank % 1 / 4);
      }
    }
    for (let [color, base] of laid) {
      let baseRole = found(base)?.role;
      baseRole === "inverse" && (color.role === "text" || color.role === "surface") && ([color.role, color.rank] = ["on-inverse", 1 + color.rank % 1]), baseRole === "accent" && color.role === "on-accent" ? color.rank = Math.floor(color.rank) + Math.min(found(base).rank, 9) / 10 : color.role === "on-accent" && (baseRole === "surface" || baseRole === "background" || baseRole === "accent-soft") && ([color.role, color.rank] = [
        contrastRatio(flattenColorOn(color.value, ground), ground) >= 3 ? "text" : "other",
        2 + color.rank % 1
      ]);
    }
  }
  function assignStatusByHue({ values, out, short, family, putStatus }, rest, ground) {
    let chromatic = rest.filter((token) => isChromaticColor(hexColorRgb(token.value)) && !blendsWithGround(hexColorRgb(token.value), ground)), hasAccent = out.some((color) => color.role === "accent"), offGround = chromatic.filter((token) => !(isChromaticColor(ground) && hueDifference(hexColorRgb(token.value), ground) < 30)), named = offGround.filter((token) => hasOwnNameWord(family(token.name))), namedFirst = new Set(named.map((token) => family(token.name))).size <= 7 ? named[0] : void 0, leading = offGround[0] !== void 0 && offGround[0] === values[0] && !NUMERIC_STEP_SUFFIX.test(short(offGround[0].name)) && new Set(offGround.map((token) => family(token.name))).size <= 7 ? offGround[0] : void 0, standIn = hasAccent ? void 0 : leading ?? offGround.filter((token) => namedFirst !== void 0 && family(token.name) === family(namedFirst.name)).sort((a, b) => byChromaDescending({ name: a.name, value: a.value, role: "other", rank: 0 }, { name: b.name, value: b.value, role: "other", rank: 0 }))[0], trafficLights = chromatic.some((token) => statusHueBand(hexColorRgb(token.value), !0) < 0) && TRAFFIC_LIGHT_NAMES.filter(([pattern]) => chromatic.some((token) => pattern.test(short(token.name)))).length >= 2 && chromatic.some((token) => TRAFFIC_LIGHT_NAMES[2][0].test(short(token.name)));
    for (let [pattern, meaning, band] of hasAccent || trafficLights ? TRAFFIC_LIGHT_NAMES : []) {
      if (out.some((color) => color.status?.meaning === meaning && color.status.part === "base" && !blendsWithGround(hexColorRgb(color.value), ground)))
        continue;
      let pick = chromatic.filter((token) => token !== standIn && rest.includes(token) && pattern.test(short(token.name)) && statusHueBand(hexColorRgb(token.value), !0) === band).sort((a, b) => byChromaDescending({ name: a.name, value: a.value, role: "other", rank: 0 }, { name: b.name, value: b.value, role: "other", rank: 0 }))[0];
      pick !== void 0 && (putStatus(pick, meaning), rest.splice(rest.indexOf(pick), 1));
    }
    return standIn;
  }
  function assignRemainingRoles({ values, out, short, found, put, sitsOn }, rest, ground, standIn) {
    let roles = new Set(out.map((color) => color.role)), statusValues = new Set(out.filter((color) => color.role === "status").map((color) => hexColorRgb(color.value))), accent = out.filter((color) => color.role === "accent").sort((a, b) => a.rank - b.rank).map((color) => hexColorRgb(color.value))[0], pairs = [], severalStatusHues = new Set(values.filter((token) => !hasAlpha(token.value) && isChromaticColor(hexColorRgb(token.value)) && !blendsWithGround(hexColorRgb(token.value), ground)).map((token) => statusHueBand(hexColorRgb(token.value), !0)).filter((band) => band >= 0)).size >= 2;
    for (let token of rest) {
      let rgb = hexColorRgb(token.value), statusLike = statusHueBand(rgb, !0) >= 0 && statusValues.has(rgb) || roles.has("accent") && TRAFFIC_LIGHT_NAMES.some(([pattern, , band]) => pattern.test(short(token.name)) && statusHueBand(rgb, !0) === band), role = roleByContrast(short(token.name), token.value, ground, statusLike), color = put(token, role, UNFIT_ROLE_RANK + (roles.has(role) || token === standIn ? 0 : roleFitPenalty(role, short(token.name), token.value, ground, accent, severalStatusHues)));
      color !== void 0 && pairs.push([color, sitsOn(token)]);
    }
    for (let [color, base] of pairs) {
      let baseRole = found(base)?.role;
      baseRole === "accent" || baseRole === "inverse" ? color.role = baseRole === "accent" ? "on-accent" : "on-inverse" : base === void 0 && (color.role === "border" || color.role === "surface") && SOFT_SUFFIX_PATTERN.test(short(color.name)) && found(short(color.name).replace(SOFT_SUFFIX_PATTERN, ""))?.role === "accent" && contrastRatio(hexColorRgb(color.value), ground) < 1.35 && (color.role = "accent-soft");
    }
  }
  function finalizeRoles({ out, short }, ground) {
    let onFirst = (color) => Number(/^on-/.test(short(color.name)));
    if (!out.some((color) => color.role === "background" && hexColorRgb(color.value) === ground))
      for (let color of out.filter((candidate) => candidate.role === "surface" && hexColorRgb(candidate.value) === ground).sort((a, b) => onFirst(a) - onFirst(b) || a.rank - b.rank).slice(0, 1))
        color.role = "background";
    let fallbackBorders = out.filter((color) => color.role === "border" && color.rank >= UNFIT_ROLE_RANK).sort((a, b) => contrastRatio(hexColorRgb(a.value), ground) - contrastRatio(hexColorRgb(b.value), ground));
    !out.some((color) => color.role === "surface") && fallbackBorders.length >= 2 && contrastRatio(hexColorRgb(fallbackBorders[0].value), ground) < 1.5 && (fallbackBorders[0].role = "surface");
    for (let color of out)
      color.status?.part === "soft" && isVividColor(hexColorRgb(color.value)) && contrastRatio(flattenColorOn(color.value, ground), ground) >= 3 && ([color.status, color.rank] = [
        { ...color.status, part: "base" },
        color.rank + 0.5
      ]);
    for (let color of out)
      color.status?.part === "base" && blendsWithGround(hexColorRgb(color.value), ground) && (color.status = { ...color.status, part: "soft" });
    for (let meaning of new Set(out.flatMap((color) => color.status !== void 0 ? [color.status.meaning] : []))) {
      let colors = out.filter((color) => color.status?.meaning === meaning), base = colors.filter((color) => (color.status?.part === "soft" || color.status?.part === "text") && isVividColor(hexColorRgb(color.value)) && !blendsWithGround(hexColorRgb(color.value), ground)).sort(byChromaDescending)[0];
      base !== void 0 && !colors.some((color) => color.status?.part === "base") && (base.status = { meaning, part: "base" });
    }
  }
  const backgroundNameScore = (name) => {
    let groundWord = /^(background|bg|page|canvas|paper|ground|surface|base)$/.test(name.split("-")[0] ?? "");
    return name.includes("-") ? groundWord ? 2 : 4 : groundWord ? /^(surface|base)$/.test(name) ? 1 : 0 : 3;
  };
  function analyzeSystemTheme(id, name, values, usageOf) {
    let assigner = createRoleAssigner(values, usageOf), { out, short, found } = assigner, rest = assignRolesByName(assigner), groundish = (token) => ["background", "surface", void 0].includes(found(short(token.name))?.role) && !/(^|-)(text|foreground|fg|ink|copy|label|contrast)$|^on-/.test(short(token.name)), ground = pickGroundColor(out.filter((color) => color.role === "background" && color.rank < PAGE_BACKGROUND_RANK).sort((a, b) => Number(a.rank >= 1 && NUMERIC_STEP_SUFFIX.test(short(a.name))) - Number(b.rank >= 1 && NUMERIC_STEP_SUFFIX.test(short(b.name))) || Math.floor(a.rank * 10) - Math.floor(b.rank * 10) || (a.rank < 0.9 || a.rank >= 2 ? 0 : backgroundNameScore(short(a.name)) - backgroundNameScore(short(b.name))) || a.rank - b.rank).map((color) => hexColorRgb(color.value)), values.filter((token) => !hasAlpha(token.value) && !isChromaticColor(token.value) && groundish(token)).map((token) => ({
      value: token.value,
      ground: SURFACE_NAME_PATTERN.test(short(token.name))
    })), out.filter((color) => color.role === "text" && (color.rank < 1 || SURFACE_NAME_PATTERN.test(assigner.laid.get(color) ?? "") || assigner.said(color.name) === "text")).map((color) => color.value), themeDarknessFromName(id, name));
    reconcileRoles(assigner, ground);
    let standIn = assignStatusByHue(assigner, rest, ground);
    return assignRemainingRoles(assigner, rest, ground, standIn), finalizeRoles(assigner, ground), {
      id,
      name,
      dark: isDarkColor(ground),
      colors: out.sort((a, b) => a.rank - b.rank)
    };
  }
  const findTypeStyle = (styles, pattern, accept = () => !0) => styles.find((style) => pattern.test(style.name.toLowerCase()) && accept(style));
  function systemTypeScale(typography, scale) {
    let styles = typography.filter((style) => style.family?.generic !== "mono" && !/(^|[-.])(code|mono|kbd|pre)([-.]|$)/i.test(style.name)), slideStyles = styles.filter((style) => /slide|deck|present/i.test(style.name + " " + style.group)), screenStyles = styles.filter((style) => !slideStyles.includes(style)), pool = scale === "screen" ? screenStyles.length >= 3 ? screenStyles : styles : slideStyles.length >= 3 ? slideStyles : styles;
    if (pool.length === 0)
      return { styles, headings: [], ladder: {}, families: {} };
    let regular = (style) => style.fontWeight < 600 && !/bold|strong|heavy/i.test(style.name), bodySize = pool === slideStyles ? 30 : 16, body = findTypeStyle(pool, /(^|[-.])(body|base|paragraph|text|default|regular|copy)(-(md|m|medium|default|regular|1))?$/, regular) ?? pool.filter(regular).sort((a, b) => Math.abs(a.fontSize - bodySize) - Math.abs(b.fontSize - bodySize))[0] ?? pool[pool.length - 1], larger = pool.filter((style) => style.fontSize > body.fontSize && (!regular(style) || style.fontSize >= body.fontSize * 1.4 || /display|title|head|h[1-6]$/i.test(style.name))), bySize = /* @__PURE__ */ new Map();
    for (let style of larger)
      style.group === larger[0].group && !bySize.has(style.fontSize) && bySize.set(style.fontSize, style);
    let headings = [...bySize.values()].sort((a, b) => b.fontSize - a.fontSize).slice(0, 4), smaller = pool.filter((style) => style.fontSize < body.fontSize).sort((a, b) => b.fontSize - a.fontSize), caption = findTypeStyle(pool, /(^|[-.])(caption|small|footnote|meta|fine|helper|xs|sm)$/, (style) => style.fontSize <= body.fontSize) ?? smaller.find(regular) ?? smaller[0] ?? body, eyebrow = findTypeStyle(pool, /(^|[-.])(eyebrow|overline|kicker|label|tag)$/) ?? pool.find((style) => style.fontSize === caption.fontSize && style.fontWeight > caption.fontWeight && style.group === caption.group) ?? caption, lead = findTypeStyle(pool, /(^|[-.])(lead|lede|intro|subtitle|subhead|body-(lg|large|l)|large|xl)$/, (style) => regular(style) && style.fontSize > body.fontSize) ?? body, steps = headings.length > 0 ? headings : [body], step = (index4) => steps[Math.min(steps.length - 1, Math.floor(index4 * steps.length / 4))];
    return {
      styles,
      headings,
      ladder: {
        display: step(0),
        h1: step(1),
        h2: step(2),
        h3: step(3),
        lead,
        eyebrow,
        body,
        caption
      },
      families: {
        ...steps[0].family !== void 0 ? { heading: steps[0].family } : {},
        ...body.family !== void 0 ? { body: body.family } : {}
      }
    };
  }
  const systemKeyFromTitle = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "system";
  function analyzeDesignSystem(tokens, options = {}) {
    let color = isRecord(tokens) && isRecord(tokens.color) ? tokens.color : void 0, declared = (Array.isArray(color?.themes) ? color.themes : []).flatMap((entry) => isRecord(entry) && typeof entry.id == "string" ? [
      {
        id: entry.id,
        name: typeof entry.name == "string" ? entry.name : entry.id
      }
    ] : []), seen = /* @__PURE__ */ new Set(), valid2 = declared.filter((theme) => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(theme.id) && seen.size < seen.add(theme.id).size).slice(0, MAX_SYSTEM_THEMES), themes = valid2.length > 0 ? valid2 : [{ id: "default", name: "Default" }], usages = readTokenUsages(tokens), list = Array.isArray(color?.tokens) ? color.tokens : [], nameOf = (entry) => isRecord(entry) && "name" in entry ? entry.name : void 0, order = new Map(list.flatMap((entry, index4) => {
      let name = nameOf(entry);
      return typeof name == "string" ? [[name.replace(/^(--|\.)/, ""), index4]] : [];
    }).reverse()), record = isRecord(tokens) ? tokens : void 0, title = options.title ?? runtime2.designSystemName(record) ?? "设计系统", analyzed = themes.flatMap((theme) => {
      let palette = runtime2.parseColorDesignTokens({
        color: {
          ...color,
          themes: [theme, ...themes.filter((other) => other !== theme)]
        }
      });
      return palette === void 0 ? [] : [
        analyzeSystemTheme(theme.id, theme.name, [...palette.colors].sort((a, b) => (order.get(a.name) ?? 1 / 0) - (order.get(b.name) ?? 1 / 0) || 0), usages)
      ];
    });
    return {
      key: options.key ?? systemKeyFromTitle(title),
      title,
      themes: analyzed,
      ...systemTypeScale(runtime2.parseTypographyDesignTokens(record), options.scale ?? "slide")
    };
  }
  function systemThemeFor(system, dark, themeId) {
    return system.themes.find((theme) => theme.id === themeId) ?? system.themes.find((theme) => theme.dark === dark) ?? system.themes[0];
  }
  const themeColorsWithRole = (theme, role) => (theme?.colors ?? []).filter((color) => color.role === role), systemThemeKey = (system, theme) => system.key + (theme !== void 0 && system.themes.length > 1 ? "/" + theme.id : ""), bind = (name, value) => bindRuntimeValue(runtime2, name, () => value);
  return bind("parseHexColor", parseHexColor), bind("hexColorRgb", hexColorRgb), bind("hexColorChannels", hexColorChannels), bind("themeLuminance", relativeLuminance), bind("themeContrastRatio", contrastRatio), bind("oklabColor", oklabColor), bind("oklabChroma", oklabChroma), bind("oklabDistance", oklabDistance), bind("mixThemeHexColors", mixHexColors), bind("flattenColorOn", flattenColorOn), bind("isDarkColor", isDarkColor), bind("isChromaticColor", isChromaticColor), bind("hueDifference", hueDifference), bind("statusHueBand", statusHueBand), bind("THEME_COLOR_ROLES", THEME_COLOR_ROLES), bind("TYPE_LADDER_ROLES", TYPE_LADDER_ROLES), bind("isHeadingLadderRole", isHeadingLadderRole), bind("statusSlotId", statusSlotId), bind("UNFIT_ROLE_RANK", UNFIT_ROLE_RANK), bind("PRIMARY_ACCENT_RANK_LIMIT", PRIMARY_ACCENT_RANK_LIMIT), bind("analyzeDesignSystem", analyzeDesignSystem), bind("systemThemeFor", systemThemeFor), bind("themeColorsWithRole", themeColorsWithRole), bind("systemThemeKey", systemThemeKey), () => {
  };
}
export {
  installDesignSystemColorAnalysis
};
