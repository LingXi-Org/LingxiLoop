// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installPresentationPhoneRemote(runtime2) {
  var REMOTE_ID_PATTERN, REMOTE_MAX_ACKS, REMOTE_CHANNEL, REMOTE_ROUTE, disconnectedRemoteRoom, HOST_HELLO_RETRIES_MS, HOST_MAX_REMOTES, CLIENT_IDLE_MS, CLIENT_LOST_AFTER, CLIENT_ENDED_AFTER, PRESS_RETRY_MS, PRESS_MAX_RESENDS, PRESS_QUEUE_MAX, CONNECTION_GRACE_MS;
  function asRecord(input) {
    return typeof input == "object" && input !== null ? input : null;
  }
  function parseRemoteHello(input) {
    let record = asRecord(input);
    return record !== null && record.type === "hello" ? { type: "hello" } : null;
  }
  function parseRemoteStage(input) {
    let record = asRecord(input);
    if (record === null || record.type !== "stage")
      return null;
    let show = (0, runtime2.parseBoundedInteger)(record.show, 0, Number.MAX_SAFE_INTEGER);
    if (show === null)
      return null;
    if (record.on === !1)
      return { type: "stage", on: !1, show };
    let n = (0, runtime2.parseBoundedInteger)(record.n, 0, Number.MAX_SAFE_INTEGER), count = (0, runtime2.parseBoundedInteger)(record.count, 1, 1e4), index4 = count === null ? null : (0, runtime2.parseBoundedInteger)(record.index, 0, count - 1), step = (0, runtime2.parseBoundedInteger)(record.step, 0, runtime2.maxBuildOrder), elapsed = (0, runtime2.parseBoundedInteger)(record.elapsed, 0, Number.MAX_SAFE_INTEGER);
    if (record.on !== !0 || typeof record.id != "string" || !runtime2.SPEAKER_NOTES_ID_PATTERN.test(record.id) || n === null || count === null || index4 === null || step === null || elapsed === null)
      return null;
    let acks = {}, rawAcks = typeof record.acks == "object" && record.acks !== null ? record.acks : {};
    for (let [from, seq] of Object.entries(rawAcks).slice(0, REMOTE_MAX_ACKS))
      REMOTE_ID_PATTERN.test(from) && typeof seq == "number" && (0, runtime2.parseBoundedInteger)(seq, 0, Number.MAX_SAFE_INTEGER) !== null && (acks[from] = seq);
    return {
      type: "stage",
      on: !0,
      show,
      n,
      id: record.id,
      index: index4,
      count,
      step,
      elapsed,
      canPrev: record.canPrev === !0,
      canNext: record.canNext === !0,
      acks
    };
  }
  function parseRemotePress(input) {
    let record = asRecord(input);
    if (record === null || record.type !== "press" || typeof record.from != "string" || !REMOTE_ID_PATTERN.test(record.from))
      return null;
    let show = (0, runtime2.parseBoundedInteger)(record.show, 0, Number.MAX_SAFE_INTEGER), seq = (0, runtime2.parseBoundedInteger)(record.seq, 1, Number.MAX_SAFE_INTEGER);
    return show === null || seq === null ? null : record.delta === 1 || record.delta === -1 ? {
      type: "press",
      show,
      from: record.from,
      seq,
      delta: record.delta
    } : typeof record.to == "string" && runtime2.SPEAKER_NOTES_ID_PATTERN.test(record.to) ? { type: "press", show, from: record.from, seq, to: record.to } : null;
  }
  function createRemoteStageHost(source, room = disconnectedRemoteRoom, canEdit = runtime2.currentUserCanEdit) {
    let sequence = 0, heard = !1, silent = !0, ended = !1, acks = /* @__PURE__ */ new Map(), placeKey = () => JSON.stringify({ ...source.at(), elapsed: 0 }), lastKey = placeKey(), applying = !1, emit = (message) => {
      silent || room.emit(message).then((result) => {
        result === "refused" && (silent = !0);
      });
    }, broadcast = () => emit({
      type: "stage",
      on: !0,
      n: sequence += 1,
      ...source.at(),
      acks: Object.fromEntries(acks)
    }), leave = () => emit({ type: "stage", on: !1, show: source.at().show }), stopListening = room.on((isMe, data) => {
      if (!isMe)
        return;
      let press = parseRemotePress(data);
      if (!(press === null && parseRemoteHello(data) === null)) {
        if (heard ||= !silent, press !== null && press.show === source.at().show && press.seq > (acks.get(press.from) ?? 0)) {
          if (acks.delete(press.from), acks.set(press.from, press.seq), acks.size > HOST_MAX_REMOTES) {
            let oldest = acks.keys().next().value;
            oldest !== void 0 && acks.delete(oldest);
          }
          applying = !0;
          try {
            "to" in press ? source.goTo(press.to) : source.go(press.delta);
          } finally {
            applying = !1;
          }
          lastKey = placeKey();
        }
        broadcast();
      }
    }), retries = [];
    return canEdit().then((allowed) => {
      allowed === !1 || ended || (silent = !1, broadcast(), retries = HOST_HELLO_RETRIES_MS.map((delay) => setTimeout(() => void (heard || broadcast()), delay)));
    }), {
      moved() {
        applying || placeKey() === lastKey || (lastKey = placeKey(), heard && broadcast());
      },
      away: leave,
      back: broadcast,
      end() {
        stopListening(), retries.forEach(clearTimeout), leave(), ended = silent = !0;
      }
    };
  }
  function createRemoteClient(room = disconnectedRemoteRoom, doc = document, canEdit = runtime2.currentUserCanEdit) {
    let state = {
      stage: null,
      since: 0,
      ended: !1,
      reach: "ok",
      pressing: 0
    }, listeners = /* @__PURE__ */ new Set(), me = Math.random().toString(36).slice(2, 12).padEnd(6, "0"), seq = 0, disposed = !1, allowed = !1, connected = !1, watching = !1, unanswered = 0, idleTimer, pending = null, queue = [], retryTimer, graceTimer, closed4 = () => state.reach === "refused" || state.reach === "off", armIdle = (delay) => {
      clearTimeout(idleTimer), idleTimer = (state.stage !== null || watching) && !closed4() ? setTimeout(onIdle, delay) : void 0;
    }, update2 = (patch) => {
      state = {
        ...state,
        ...patch,
        pressing: pending !== null && "delta" in pending.msg ? pending.msg.delta : 0
      }, idleTimer === void 0 === ((state.stage !== null || watching) && !closed4()) && armIdle(CLIENT_IDLE_MS);
      for (let listener of [...listeners])
        listener();
    }, dropPending = () => {
      pending = null, clearTimeout(retryTimer), retryTimer = void 0;
    }, dropAll = () => {
      dropPending(), queue = [];
    }, markLost = () => {
      dropAll(), state.stage !== null && state.reach === "ok" && update2({ reach: "lost" });
    }, close = (reach) => {
      closed4() || (dropAll(), update2({ reach, stage: null }));
    }, emit = (message) => {
      room.emit(message).then((result) => {
        result === "refused" && close(result);
      });
    }, hello = () => {
      disposed || !allowed || !connected || closed4() || doc.visibilityState === "hidden" || (unanswered += 1, emit({ type: "hello" }));
    };
    function resend() {
      if (pending !== null) {
        if (pending.sends <= PRESS_MAX_RESENDS) {
          pending.sends += 1, emit(pending.msg), retryTimer = setTimeout(resend, PRESS_RETRY_MS);
          return;
        }
        pending = null, unanswered += 1, hello(), update2({}), armIdle(PRESS_RETRY_MS * 2);
      }
    }
    function sendNext() {
      let stage = state.stage;
      if (pending !== null || stage === null || !allowed || !connected || state.reach !== "ok")
        return;
      let at = queue.findIndex((action2) => "to" in action2 ? action2.to !== stage.id || stage.step > 0 : action2.delta === 1 ? stage.canNext : stage.canPrev), action = queue[at];
      queue = at < 0 ? [] : queue.slice(at + 1), action !== void 0 && (pending = {
        msg: { type: "press", show: stage.show, from: me, seq: seq += 1, ...action },
        sends: 0
      }, resend(), update2({}));
    }
    function onIdle() {
      if (idleTimer = void 0, state.stage !== null && unanswered >= CLIENT_ENDED_AFTER)
        return dropAll(), update2({ stage: null, ended: !0, reach: "ok" });
      unanswered >= CLIENT_LOST_AFTER && markLost(), hello(), armIdle(CLIENT_IDLE_MS);
    }
    let onVisibility = () => {
      doc.visibilityState === "hidden" ? (dropAll(), update2({})) : hello();
    };
    doc.addEventListener("visibilitychange", onVisibility);
    let stopListening = room.on((isMe, data) => {
      let message = isMe ? parseRemoteStage(data) : null, current = state.stage;
      if (message === null || closed4())
        return;
      if (!message.on)
        return message.show !== current?.show ? void 0 : (dropAll(), update2({ stage: null, ended: !0, reach: "ok" }));
      let since = message.show === current?.show ? state.since : Date.now() - message.elapsed;
      if (current !== null && (message.show === current.show ? message.n < current.n : since <= state.since))
        return;
      unanswered = 0, message.show !== current?.show && dropAll(), pending !== null && (message.acks[me] ?? 0) >= pending.msg.seq && dropPending();
      let { type: _type, on: _on, ...stage } = message;
      update2({ stage, ended: !1, reach: "ok", since }), sendNext();
    }), stopConnection = room.onConnection((isConnected) => {
      if (isConnected === null)
        return close("off");
      connected = isConnected, clearTimeout(graceTimer), graceTimer = void 0, connected ? hello() : graceTimer = setTimeout(markLost, CONNECTION_GRACE_MS);
    });
    return canEdit().then((canEditNow) => {
      if (canEditNow === !1)
        return close("refused");
      allowed = !0, hello(), sendNext();
    }), {
      getSnapshot: () => state,
      subscribe(listener) {
        return listeners.add(listener), () => listeners.delete(listener);
      },
      send(action) {
        state.reach !== "ok" || queue.length >= PRESS_QUEUE_MAX || (queue = [...connected && allowed ? queue : [], action], sendNext());
      },
      watch(next) {
        watching = next, next && hello(), update2({});
      },
      dispose() {
        disposed = !0, stopListening(), stopConnection(), doc.removeEventListener("visibilitychange", onVisibility);
        for (let timer of [idleTimer, retryTimer, graceTimer])
          clearTimeout(timer);
        listeners.clear();
      }
    };
  }
  return bindRuntimeValue(runtime2, "REMOTE_ID_PATTERN", () => REMOTE_ID_PATTERN), bindRuntimeValue(runtime2, "REMOTE_MAX_ACKS", () => REMOTE_MAX_ACKS), bindRuntimeValue(runtime2, "REMOTE_CHANNEL", () => REMOTE_CHANNEL), bindRuntimeValue(runtime2, "REMOTE_ROUTE", () => REMOTE_ROUTE), bindRuntimeValue(runtime2, "disconnectedRemoteRoom", () => disconnectedRemoteRoom), bindRuntimeValue(runtime2, "parseRemoteHello", () => parseRemoteHello), bindRuntimeValue(runtime2, "parseRemoteStage", () => parseRemoteStage), bindRuntimeValue(runtime2, "parseRemotePress", () => parseRemotePress), bindRuntimeValue(runtime2, "createRemoteStageHost", () => createRemoteStageHost), bindRuntimeValue(runtime2, "createRemoteClient", () => createRemoteClient), () => {
    REMOTE_ID_PATTERN = /^[a-z0-9]{6,16}$/, REMOTE_MAX_ACKS = 8, REMOTE_CHANNEL = "present-remote", REMOTE_ROUTE = "remote", disconnectedRemoteRoom = {
      emit: () => Promise.resolve("refused"),
      on: () => () => {
      },
      onConnection: (handler) => (handler(null), () => {
      })
    }, HOST_HELLO_RETRIES_MS = [1e3, 3e3], HOST_MAX_REMOTES = 4, CLIENT_IDLE_MS = 4e3, CLIENT_LOST_AFTER = 2, CLIENT_ENDED_AFTER = 7, PRESS_RETRY_MS = 600, PRESS_MAX_RESENDS = 2, PRESS_QUEUE_MAX = 20, CONNECTION_GRACE_MS = 2e3;
  };
}
export {
  installPresentationPhoneRemote
};
