// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installCollaborationSlidePresence(runtime2) {
  var ReactSlidePresence, SlidePresenceJsx, MAX_PRESENCE_SLIDE_ID_CHARS, MAX_PRESENCE_NAME_CHARS, MAX_VISIBLE_SLIDE_PEERS, ANONYMOUS_PEER_NAME, MAX_LISTED_SLIDE_PEERS, subscribeNoSlidePresence, truncatePresenceName;
  function collectSlidePresence(peers, deckId, hasSlide) {
    let presenceBySlide = /* @__PURE__ */ new Map();
    for (let value of peers) {
      if (value.sameTab || value.isMe)
        continue;
      let context = value.presence.context;
      if (typeof context != "object" || context === null || Array.isArray(context))
        continue;
      let value2 = context, slideId = value2.slideId;
      if ((value2.deck ?? null) !== deckId || typeof slideId != "string" || slideId === "" || slideId.length > MAX_PRESENCE_SLIDE_ID_CHARS || !hasSlide(slideId))
        continue;
      let who = value.presence.who, value3 = typeof who == "object" && who !== null ? who : {}, value4 = value.by !== null ? "u:" + value.by : "p:" + value.peer, value5 = presenceBySlide.get(slideId) ?? /* @__PURE__ */ new Map(), entry = value5.get(value4);
      (entry === void 0 || value.peer < entry[0]) && value5.set(value4, [
        value.peer,
        {
          key: value4,
          by: value.by,
          name: typeof value3.n == "string" ? truncatePresenceName(value3.n) : "",
          color: (0, runtime2.peerColor)(value3.c, value.by ?? value.peer),
          ...value.agent ? { agent: !0 } : {}
        }
      ]), presenceBySlide.set(slideId, value5);
    }
    let callback = (input, options) => input[0] < options[0] ? -1 : input[0] > options[0] ? 1 : 0, callback2 = (input) => input[1][1].by === null ? 1 : 0;
    return new Map([...presenceBySlide].sort(callback).map(([input, input2]) => [
      input,
      {
        peers: [...input2].sort((input3, options) => callback2(input3) - callback2(options) || callback(input3, options)).slice(0, MAX_LISTED_SLIDE_PEERS).map(([, [, input3]]) => input3),
        total: input2.size
      }
    ]));
  }
  function useSlidePresence(deckId, slides) {
    let slideIds = ReactSlidePresence.useMemo(() => new Set(slides.map((input) => input.id)), [slides]), getSnapshot2 = ReactSlidePresence.useCallback(() => deckId === void 0 ? "[]" : JSON.stringify([
      ...collectSlidePresence(runtime2.roomPeerStore.getSnapshot(), deckId, (input) => slideIds.has(input))
    ]), [deckId, slideIds]), value = ReactSlidePresence.useSyncExternalStore(deckId === void 0 ? subscribeNoSlidePresence : runtime2.roomPeerStore.subscribe, getSnapshot2, getSnapshot2), memo4 = ReactSlidePresence.useMemo(() => new Map(JSON.parse(value)), [value]), memo22 = ReactSlidePresence.useMemo(() => [
      ...new Set([...memo4.values()].flatMap((input) => input.peers.flatMap((input2) => input2.by === null ? [] : [input2.by])))
    ].sort().join(`
`), [memo4]), [value2, value3] = ReactSlidePresence.useState(
      /* @__PURE__ */ new Map()
    );
    return ReactSlidePresence.useEffect(() => {
      if (memo22 === "")
        return;
      let flag = !0;
      return (0, runtime2.userProfiles)(memo22.split(`
`)).then((input) => {
        flag && value3(input);
      }), () => {
        flag = !1;
      };
    }, [memo22]), ReactSlidePresence.useMemo(() => new Map([...memo4].map(([input, input2]) => [
      input,
      {
        total: input2.total,
        peers: input2.peers.map((input3) => ({
          ...input3,
          name: truncatePresenceName(input3.by !== null && value2.get(input3.by) || "") || input3.name || ANONYMOUS_PEER_NAME
        }))
      }
    ])), [memo4, value2]);
  }
  function formatSlidePresenceLabel(presence) {
    if (presence === void 0 || presence.total === 0)
      return "";
    let names = presence.peers.map((input) => input.name).filter((input) => input !== "" && input !== ANONYMOUS_PEER_NAME), unnamedCount = presence.total - names.length;
    if (names.length === 0)
      return (0, runtime2.formatMessage)({
        defaultMessage: "此页有 {count} 人",
        id: "+PJBIikFz2"
      }, {
        n: unnamedCount,
        count: String(unnamedCount)
      });
    let others = unnamedCount > 0 ? [
      (0, runtime2.formatMessage)({
        defaultMessage: "另外 {count} 人",
        id: "vt5CcS7fEV"
      }, {
        n: unnamedCount,
        count: String(unnamedCount)
      })
    ] : [], list = new Intl.ListFormat((0, runtime2.intlLocale) ("ListFormat", "en-GB"), {
      type : "conjunction"
    }).format([...names, ...others]);
    return ( 0, runtime2.formatMessage)({
      defaultMessage: "{names} 在此页",
      id: "amgVgPak64"
    }, {
      n :presence.total,
      names : list
    });
  }
  function SlidePresenceBadge({ on: presence, id, also }) {
    return presence === void 0 || presence.total === 0 ? null : SlidePresenceJsx.jsxs(SlidePresenceJsx.Fragment, {
      children: [
        SlidePresenceJsx.jsx("span", {
          id,
          "aria-hidden": "true",
          "data-mc-chrome": "",
          className: "pointer-events-none sr-only",
          children:also === void 0 ? formatSlidePresenceLabel(presence) : (0, runtime2.formatMessage)({
            defaultMessage: "{first}。{second}",
            id: "2EoXPW9P2X"
          }, {
            first : also,
            second: formatSlidePresenceLabel(presence)
        })
        }),
        SlidePresenceJsx.jsx(runtime2.CdsRoot, {
          density: "compact",
          render: SlidePresenceJsx.jsx("span", {
            title: "",
            "aria-hidden": "true",
            "data-mc-chrome": "",
            "data-kit": "peer-avatars"
          }),
          className: "absolute top-2 right-2 flex",
          children: SlidePresenceJsx.jsx(runtime2.AvatarStack, {
            size: "xs",
            max: MAX_VISIBLE_SLIDE_PEERS,
            total: presence.total,
            noun: "people",
            children: presence.peers.map((input) => SlidePresenceJsx.jsx(runtime2.TooltipWrapper, {
              tip: input.name,
              children: SlidePresenceJsx.jsx(runtime2.Avatar, {
                name: input.name,
                ...input.agent ? { variant: "claude" } : {},
                style: {
                  backgroundColor: input.color,
                  color: (0, runtime2.peerInkColor)(input.color)
                }
              })
            }, input.key))
          })
        })
      ]
    });
  }
  return bindRuntimeValue(runtime2, "ReactSlidePresence", () => ReactSlidePresence, (value) => {
    ReactSlidePresence = value;
  }), bindRuntimeValue(runtime2, "SlidePresenceJsx", () => SlidePresenceJsx, (value) => {
    SlidePresenceJsx = value;
  }), bindRuntimeValue(runtime2, "MAX_PRESENCE_SLIDE_ID_CHARS", () => MAX_PRESENCE_SLIDE_ID_CHARS, (value) => {
    MAX_PRESENCE_SLIDE_ID_CHARS = value;
  }), bindRuntimeValue(runtime2, "MAX_PRESENCE_NAME_CHARS", () => MAX_PRESENCE_NAME_CHARS, (value) => {
    MAX_PRESENCE_NAME_CHARS = value;
  }), bindRuntimeValue(runtime2, "MAX_VISIBLE_SLIDE_PEERS", () => MAX_VISIBLE_SLIDE_PEERS, (value) => {
    MAX_VISIBLE_SLIDE_PEERS = value;
  }), bindRuntimeValue(runtime2, "ANONYMOUS_PEER_NAME", () => ANONYMOUS_PEER_NAME, (value) => {
    ANONYMOUS_PEER_NAME = value;
  }), bindRuntimeValue(runtime2, "MAX_LISTED_SLIDE_PEERS", () => MAX_LISTED_SLIDE_PEERS, (value) => {
    MAX_LISTED_SLIDE_PEERS = value;
  }), bindRuntimeValue(runtime2, "subscribeNoSlidePresence", () => subscribeNoSlidePresence, (value) => {
    subscribeNoSlidePresence = value;
  }), bindRuntimeValue(runtime2, "truncatePresenceName", () => truncatePresenceName, (value) => {
    truncatePresenceName = value;
  }), bindRuntimeValue(runtime2, "collectSlidePresence", () => collectSlidePresence), bindRuntimeValue(runtime2, "useSlidePresence", () => useSlidePresence), bindRuntimeValue(runtime2, "formatSlidePresenceLabel", () => formatSlidePresenceLabel), bindRuntimeValue(runtime2, "SlidePresenceBadge", () => SlidePresenceBadge), () => {
    (0, runtime2.initializeModelEditing)(), (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeSlideRenderer)(), (0, runtime2.initializeUiInputs210)(), ReactSlidePresence = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), SlidePresenceJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1), MAX_PRESENCE_SLIDE_ID_CHARS = 128, MAX_PRESENCE_NAME_CHARS = 40, MAX_VISIBLE_SLIDE_PEERS = 3, ANONYMOUS_PEER_NAME = (0, runtime2.formatMessage)({
      defaultMessage: "其他人",
      id: "Ps5kXjT5Hx"
    }), MAX_LISTED_SLIDE_PEERS = MAX_VISIBLE_SLIDE_PEERS + 4, subscribeNoSlidePresence = () => () => {
    }, truncatePresenceName = (input) => (0, runtime2.sanitizePresenceLabel)(input.slice(0, MAX_PRESENCE_NAME_CHARS * 4), MAX_PRESENCE_NAME_CHARS);
  };
}
export {
  installCollaborationSlidePresence
};
