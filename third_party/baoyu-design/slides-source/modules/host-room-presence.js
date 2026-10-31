// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installHostRoomPresence(runtime2) {
  var roomApiOwner, roomApiPromise, EMPTY_ROOM_PEERS, roomPeers, roomPeerSubscribers, roomPeerListenerStarted, roomPeerUnsubscribe, roomPeerHost, roomConnected, roomPeerStore;
  function hasHostRoomApi() {
    let slidesHost = globalThis.slidesHost;
    return typeof slidesHost?.use == "function" || typeof slidesHost?.room?.presence == "function";
  }
  async function resolveHostRoom() {
    let slidesHost = globalThis.slidesHost;
    try {
      if (typeof slidesHost?.use == "function") {
        let value = await (0, runtime2.loadHostCapability)("room");
        return typeof value == "object" && value !== null ? value : null;
      }
    } catch {
      return null;
    }
    return typeof slidesHost?.room?.presence == "function" ? slidesHost.room : null;
  }
  function hostErrorCode(error) {
    let value = typeof error == "object" && error !== null ? error.code : "";
    return typeof value == "string" ? value : "";
  }
  async function reportRoomPresence(presence) {
    let value = await resolveHostRoom();
    if (typeof value?.presence != "function")
      return "off";
    try {
      return await value.presence.call(value, typeof presence == "function" ? presence(value) : presence), "ok";
    } catch (value2) {
      let value3 = hostErrorCode(value2);
      return value3 === "upstream_error" ? "retry" : (value3 === "invalid_argument" && console.warn("appifact room: rejected presence patch", value2), "off");
    }
  }
  function cachedHostRoom() {
    let slidesHost = globalThis.slidesHost;
    return (roomApiPromise === void 0 || roomApiOwner !== slidesHost) && (roomApiOwner = slidesHost, roomApiPromise = resolveHostRoom()), roomApiPromise;
  }
  function normalizeRoomPeers(peers) {
    if (!Array.isArray(peers))
      return EMPTY_ROOM_PEERS;
    let items = [];
    for (let value of peers) {
      if (typeof value != "object" || value === null)
        continue;
      let value2 = value;
      typeof value2.peer == "string" && items.push({
        peer: value2.peer,
        by: typeof value2.by == "string" && value2.by !== "" ? value2.by : null,
        isMe: value2.isMe === !0,
        sameTab: value2.sameTab === !0,
        ...value2.kind === "agent" ? { agent: !0 } : {},
        presence: typeof value2.presence == "object" && value2.presence !== null ? value2.presence : {},
        updatedAt: typeof value2.updatedAt == "number" ? value2.updatedAt : 0
      });
    }
    return items;
  }
  function startRoomPeerListener() {
    roomPeerListenerStarted || (roomPeerListenerStarted = !0, cachedHostRoom().then((input) => {
      if (!(typeof input?.onPeers != "function" || !roomPeerListenerStarted)) {
        roomPeerHost = input;
        try {
          let value = input.onPeers.call(input, (input2) => {
            roomPeers = normalizeRoomPeers(input2.peers);
            for (let value2 of [...roomPeerSubscribers])
              value2();
          }, () => {
            roomPeers = EMPTY_ROOM_PEERS;
            for (let value2 of [...roomPeerSubscribers])
              value2();
          });
          typeof value == "function" && (roomPeerUnsubscribe = value);
        } catch {
        }
      }
    }));
  }
  return bindRuntimeValue(runtime2, "hasHostRoomApi", () => hasHostRoomApi), bindRuntimeValue(runtime2, "resolveHostRoom", () => resolveHostRoom), bindRuntimeValue(runtime2, "hostErrorCode", () => hostErrorCode), bindRuntimeValue(runtime2, "reportRoomPresence", () => reportRoomPresence), bindRuntimeValue(runtime2, "roomApiOwner", () => roomApiOwner, (value) => {
    roomApiOwner = value;
  }), bindRuntimeValue(runtime2, "roomApiPromise", () => roomApiPromise, (value) => {
    roomApiPromise = value;
  }), bindRuntimeValue(runtime2, "cachedHostRoom", () => cachedHostRoom), bindRuntimeValue(runtime2, "EMPTY_ROOM_PEERS", () => EMPTY_ROOM_PEERS, (value) => {
    EMPTY_ROOM_PEERS = value;
  }), bindRuntimeValue(runtime2, "normalizeRoomPeers", () => normalizeRoomPeers), bindRuntimeValue(runtime2, "roomPeers", () => roomPeers, (value) => {
    roomPeers = value;
  }), bindRuntimeValue(runtime2, "roomPeerSubscribers", () => roomPeerSubscribers, (value) => {
    roomPeerSubscribers = value;
  }), bindRuntimeValue(runtime2, "roomPeerListenerStarted", () => roomPeerListenerStarted, (value) => {
    roomPeerListenerStarted = value;
  }), bindRuntimeValue(runtime2, "roomPeerUnsubscribe", () => roomPeerUnsubscribe, (value) => {
    roomPeerUnsubscribe = value;
  }), bindRuntimeValue(runtime2, "startRoomPeerListener", () => startRoomPeerListener), bindRuntimeValue(runtime2, "roomPeerStore", () => roomPeerStore, (value) => {
    roomPeerStore = value;
  }), bindRuntimeValue(runtime2, "roomPeerHost", () => roomPeerHost, (value) => {
    roomPeerHost = value;
  }), bindRuntimeValue(runtime2, "roomConnected", () => roomConnected, (value) => {
    roomConnected = value;
  }), () => {
    EMPTY_ROOM_PEERS = Object.freeze([]), roomPeers = EMPTY_ROOM_PEERS, roomPeerSubscribers = /* @__PURE__ */ new Set(), roomPeerListenerStarted = !1, roomPeerUnsubscribe = null, roomPeerHost = null, roomConnected = () => roomPeerHost?.connected?.() === !0, roomPeerStore = {
      getSnapshot: () => roomPeers,
      subscribe(input) {
        return roomPeerSubscribers.add(input), startRoomPeerListener(), () => roomPeerSubscribers.delete(input);
      }
    };
  };
}
export {
  installHostRoomPresence
};
