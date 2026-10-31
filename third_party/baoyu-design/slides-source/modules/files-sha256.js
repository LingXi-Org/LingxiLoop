// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesSha256(runtime2) {
  var SHA256_ROUND_CONSTANTS, SHA256_INITIAL_STATE, encodeFileUtf8;
  function sha256Sync(input) {
    let bytes = typeof input == "string" ? encodeFileUtf8(input) : input, byteLength = bytes.length, paddedLength = byteLength + 9 + 63 >> 6 << 6, paddedBytes = new Uint8Array(paddedLength);
    paddedBytes.set(bytes), paddedBytes[byteLength] = 128;
    let dataView = new DataView(paddedBytes.buffer);
    dataView.setUint32(paddedLength - 8, Math.floor(byteLength / 536870912), !1), dataView.setUint32(paddedLength - 4, byteLength << 3 >>> 0, !1);
    let messageSchedule = new Uint32Array([
      1779033703,
      3144134277,
      1013904242,
      2773480762,
      1359893119,
      2600822924,
      528734635,
      1541459225
    ]), hashState = new Uint32Array(64);
    for (let index4 = 0; index4 < paddedLength; index4 += 64) {
      for (let index22 = 0; index22 < 16; index22++)
        hashState[index22] = dataView.getUint32(index4 + index22 * 4, !1);
      for (let count = 16; count < 64; count++) {
        let value9 = hashState[count - 15], value10 = hashState[count - 2], value11 = (value9 >>> 7 | value9 << 25) ^ (value9 >>> 18 | value9 << 14) ^ value9 >>> 3, value12 = (value10 >>> 17 | value10 << 15) ^ (value10 >>> 19 | value10 << 13) ^ value10 >>> 10;
        hashState[count] = hashState[count - 16] + value11 + hashState[count - 7] + value12 | 0;
      }
      let value = messageSchedule[0], value2 = messageSchedule[1], value3 = messageSchedule[2], value4 = messageSchedule[3], value5 = messageSchedule[4], value6 = messageSchedule[5], value7 = messageSchedule[6], value8 = messageSchedule[7];
      for (let index22 = 0; index22 < 64; index22++) {
        let value9 = (value5 >>> 6 | value5 << 26) ^ (value5 >>> 11 | value5 << 21) ^ (value5 >>> 25 | value5 << 7), value10 = value5 & value6 ^ ~value5 & value7, value11 = value8 + value9 + value10 + SHA256_ROUND_CONSTANTS[index22] + hashState[index22] | 0, value12 = (value >>> 2 | value << 30) ^ (value >>> 13 | value << 19) ^ (value >>> 22 | value << 10), value13 = value & value2 ^ value & value3 ^ value2 & value3, value14 = value12 + value13 | 0;
        value8 = value7, value7 = value6, value6 = value5, value5 = value4 + value11 | 0, value4 = value3, value3 = value2, value2 = value, value = value11 + value14 | 0;
      }
      messageSchedule[0] = messageSchedule[0] + value | 0, messageSchedule[1] = messageSchedule[1] + value2 | 0, messageSchedule[2] = messageSchedule[2] + value3 | 0, messageSchedule[3] = messageSchedule[3] + value4 | 0, messageSchedule[4] = messageSchedule[4] + value5 | 0, messageSchedule[5] = messageSchedule[5] + value6 | 0, messageSchedule[6] = messageSchedule[6] + value7 | 0, messageSchedule[7] = messageSchedule[7] + value8 | 0;
    }
    let text = "";
    for (let index4 = 0; index4 < 8; index4++)
      text += (messageSchedule[index4] >>> 0).toString(16).padStart(8, "0");
    return text;
  }
  async function sha256(input) {
    let bytes = typeof input == "string" ? encodeFileUtf8(input) : input, subtleCrypto = globalThis.crypto?.subtle;
    if (typeof subtleCrypto?.digest == "function" && bytes.length > 4096)
      try {
        let value = new Uint8Array(await subtleCrypto.digest("SHA-256", bytes)), text = "";
        for (let value2 of value)
          text += value2.toString(16).padStart(2, "0");
        return text;
      } catch {
      }
    return sha256Sync(bytes);
  }
  return bindRuntimeValue(runtime2, "SHA256_ROUND_CONSTANTS", () => SHA256_ROUND_CONSTANTS, (value) => {
    SHA256_ROUND_CONSTANTS = value;
  }), bindRuntimeValue(runtime2, "SHA256_INITIAL_STATE", () => SHA256_INITIAL_STATE, (value) => {
    SHA256_INITIAL_STATE = value;
  }), bindRuntimeValue(runtime2, "encodeFileUtf8", () => encodeFileUtf8, (value) => {
    encodeFileUtf8 = value;
  }), bindRuntimeValue(runtime2, "sha256Sync", () => sha256Sync), bindRuntimeValue(runtime2, "sha256", () => sha256), () => {
    SHA256_ROUND_CONSTANTS = new Uint32Array([
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ]), SHA256_INITIAL_STATE = new TextEncoder(), encodeFileUtf8 = (input) => SHA256_INITIAL_STATE.encode(input);
  };
}
export {
  installFilesSha256
};
