// Reconstructed from baoyu-design c15e76e (MIT). See ../README.md and source-map.json.
function kv(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
function X0(e) {
  throw new Error('Could not dynamically require "' + e + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
}
var Jb = { exports: {} };
var Qw;
function g6() {
  return Qw || (Qw = 1, function(e, t) {
    (function(r) {
      e.exports = r();
    })(function() {
      return function r(l, i, c) {
        function s(n, p) {
          if (!i[n]) {
            if (!l[n]) {
              var m = typeof X0 == "function" && X0;
              if (!p && m) return m(n, true);
              if (h) return h(n, true);
              var d = new Error("Cannot find module '" + n + "'");
              throw d.code = "MODULE_NOT_FOUND", d;
            }
            var b = i[n] = { exports: {} };
            l[n][0].call(b.exports, function(x) {
              var v = l[n][1][x];
              return s(v || x);
            }, b, b.exports, r, l, i, c);
          }
          return i[n].exports;
        }
        for (var h = typeof X0 == "function" && X0, f = 0; f < c.length; f++) s(c[f]);
        return s;
      }({ 1: [function(r, l, i) {
        var c = r("./utils"), s = r("./support"), h = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        i.encode = function(f) {
          for (var n, p, m, d, b, x, v, w = [], y = 0, g = f.length, A = g, C = c.getTypeOf(f) !== "string"; y < f.length; ) A = g - y, m = C ? (n = f[y++], p = y < g ? f[y++] : 0, y < g ? f[y++] : 0) : (n = f.charCodeAt(y++), p = y < g ? f.charCodeAt(y++) : 0, y < g ? f.charCodeAt(y++) : 0), d = n >> 2, b = (3 & n) << 4 | p >> 4, x = 1 < A ? (15 & p) << 2 | m >> 6 : 64, v = 2 < A ? 63 & m : 64, w.push(h.charAt(d) + h.charAt(b) + h.charAt(x) + h.charAt(v));
          return w.join("");
        }, i.decode = function(f) {
          var n, p, m, d, b, x, v = 0, w = 0, y = "data:";
          if (f.substr(0, y.length) === y) throw new Error("Invalid base64 input, it looks like a data url.");
          var g, A = 3 * (f = f.replace(/[^A-Za-z0-9+/=]/g, "")).length / 4;
          if (f.charAt(f.length - 1) === h.charAt(64) && A--, f.charAt(f.length - 2) === h.charAt(64) && A--, A % 1 != 0) throw new Error("Invalid base64 input, bad content length.");
          for (g = s.uint8array ? new Uint8Array(0 | A) : new Array(0 | A); v < f.length; ) n = h.indexOf(f.charAt(v++)) << 2 | (d = h.indexOf(f.charAt(v++))) >> 4, p = (15 & d) << 4 | (b = h.indexOf(f.charAt(v++))) >> 2, m = (3 & b) << 6 | (x = h.indexOf(f.charAt(v++))), g[w++] = n, b !== 64 && (g[w++] = p), x !== 64 && (g[w++] = m);
          return g;
        };
      }, { "./support": 30, "./utils": 32 }], 2: [function(r, l, i) {
        var c = r("./external"), s = r("./stream/DataWorker"), h = r("./stream/Crc32Probe"), f = r("./stream/DataLengthProbe");
        function n(p, m, d, b, x) {
          this.compressedSize = p, this.uncompressedSize = m, this.crc32 = d, this.compression = b, this.compressedContent = x;
        }
        n.prototype = { getContentWorker: function() {
          var p = new s(c.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new f("data_length")), m = this;
          return p.on("end", function() {
            if (this.streamInfo.data_length !== m.uncompressedSize) throw new Error("Bug : uncompressed data size mismatch");
          }), p;
        }, getCompressedWorker: function() {
          return new s(c.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
        } }, n.createWorkerFrom = function(p, m, d) {
          return p.pipe(new h()).pipe(new f("uncompressedSize")).pipe(m.compressWorker(d)).pipe(new f("compressedSize")).withStreamInfo("compression", m);
        }, l.exports = n;
      }, { "./external": 6, "./stream/Crc32Probe": 25, "./stream/DataLengthProbe": 26, "./stream/DataWorker": 27 }], 3: [function(r, l, i) {
        var c = r("./stream/GenericWorker");
        i.STORE = { magic: "\0\0", compressWorker: function() {
          return new c("STORE compression");
        }, uncompressWorker: function() {
          return new c("STORE decompression");
        } }, i.DEFLATE = r("./flate");
      }, { "./flate": 7, "./stream/GenericWorker": 28 }], 4: [function(r, l, i) {
        var c = r("./utils"), s = function() {
          for (var h, f = [], n = 0; n < 256; n++) {
            h = n;
            for (var p = 0; p < 8; p++) h = 1 & h ? 3988292384 ^ h >>> 1 : h >>> 1;
            f[n] = h;
          }
          return f;
        }();
        l.exports = function(h, f) {
          return h !== void 0 && h.length ? c.getTypeOf(h) !== "string" ? function(n, p, m, d) {
            var b = s, x = d + m;
            n ^= -1;
            for (var v = d; v < x; v++) n = n >>> 8 ^ b[255 & (n ^ p[v])];
            return -1 ^ n;
          }(0 | f, h, h.length, 0) : function(n, p, m, d) {
            var b = s, x = d + m;
            n ^= -1;
            for (var v = d; v < x; v++) n = n >>> 8 ^ b[255 & (n ^ p.charCodeAt(v))];
            return -1 ^ n;
          }(0 | f, h, h.length, 0) : 0;
        };
      }, { "./utils": 32 }], 5: [function(r, l, i) {
        i.base64 = false, i.binary = false, i.dir = false, i.createFolders = true, i.date = null, i.compression = null, i.compressionOptions = null, i.comment = null, i.unixPermissions = null, i.dosPermissions = null;
      }, {}], 6: [function(r, l, i) {
        var c = null;
        c = typeof Promise < "u" ? Promise : r("lie"), l.exports = { Promise: c };
      }, { lie: 37 }], 7: [function(r, l, i) {
        var c = typeof Uint8Array < "u" && typeof Uint16Array < "u" && typeof Uint32Array < "u", s = r("pako"), h = r("./utils"), f = r("./stream/GenericWorker"), n = c ? "uint8array" : "array";
        function p(m, d) {
          f.call(this, "FlateWorker/" + m), this._pako = null, this._pakoAction = m, this._pakoOptions = d, this.meta = {};
        }
        i.magic = "\b\0", h.inherits(p, f), p.prototype.processChunk = function(m) {
          this.meta = m.meta, this._pako === null && this._createPako(), this._pako.push(h.transformTo(n, m.data), false);
        }, p.prototype.flush = function() {
          f.prototype.flush.call(this), this._pako === null && this._createPako(), this._pako.push([], true);
        }, p.prototype.cleanUp = function() {
          f.prototype.cleanUp.call(this), this._pako = null;
        }, p.prototype._createPako = function() {
          this._pako = new s[this._pakoAction]({ raw: true, level: this._pakoOptions.level || -1 });
          var m = this;
          this._pako.onData = function(d) {
            m.push({ data: d, meta: m.meta });
          };
        }, i.compressWorker = function(m) {
          return new p("Deflate", m);
        }, i.uncompressWorker = function() {
          return new p("Inflate", {});
        };
      }, { "./stream/GenericWorker": 28, "./utils": 32, pako: 38 }], 8: [function(r, l, i) {
        function c(b, x) {
          var v, w = "";
          for (v = 0; v < x; v++) w += String.fromCharCode(255 & b), b >>>= 8;
          return w;
        }
        function s(b, x, v, w, y, g) {
          var A, C, S = b.file, R = b.compression, N = g !== n.utf8encode, E = h.transformTo("string", g(S.name)), D = h.transformTo("string", n.utf8encode(S.name)), O = S.comment, L = h.transformTo("string", g(O)), P = h.transformTo("string", n.utf8encode(O)), B = D.length !== S.name.length, M = P.length !== O.length, U = "", _ = "", F = "", T = S.dir, k = S.date, z = { crc32: 0, compressedSize: 0, uncompressedSize: 0 };
          x && !v || (z.crc32 = b.crc32, z.compressedSize = b.compressedSize, z.uncompressedSize = b.uncompressedSize);
          var V = 0;
          x && (V |= 8), N || !B && !M || (V |= 2048);
          var G = 0, q = 0;
          T && (G |= 16), y === "UNIX" ? (q = 798, G |= function(H, X) {
            var Q = H;
            return H || (Q = X ? 16893 : 33204), (65535 & Q) << 16;
          }(S.unixPermissions, T)) : (q = 20, G |= function(H) {
            return 63 & (H || 0);
          }(S.dosPermissions)), A = k.getUTCHours(), A <<= 6, A |= k.getUTCMinutes(), A <<= 5, A |= k.getUTCSeconds() / 2, C = k.getUTCFullYear() - 1980, C <<= 4, C |= k.getUTCMonth() + 1, C <<= 5, C |= k.getUTCDate(), B && (_ = c(1, 1) + c(p(E), 4) + D, U += "up" + c(_.length, 2) + _), M && (F = c(1, 1) + c(p(L), 4) + P, U += "uc" + c(F.length, 2) + F);
          var j = "";
          return j += `
\0`, j += c(V, 2), j += R.magic, j += c(A, 2), j += c(C, 2), j += c(z.crc32, 4), j += c(z.compressedSize, 4), j += c(z.uncompressedSize, 4), j += c(E.length, 2), j += c(U.length, 2), { fileRecord: m.LOCAL_FILE_HEADER + j + E + U, dirRecord: m.CENTRAL_FILE_HEADER + c(q, 2) + j + c(L.length, 2) + "\0\0\0\0" + c(G, 4) + c(w, 4) + E + U + L };
        }
        var h = r("../utils"), f = r("../stream/GenericWorker"), n = r("../utf8"), p = r("../crc32"), m = r("../signature");
        function d(b, x, v, w) {
          f.call(this, "ZipFileWorker"), this.bytesWritten = 0, this.zipComment = x, this.zipPlatform = v, this.encodeFileName = w, this.streamFiles = b, this.accumulate = false, this.contentBuffer = [], this.dirRecords = [], this.currentSourceOffset = 0, this.entriesCount = 0, this.currentFile = null, this._sources = [];
        }
        h.inherits(d, f), d.prototype.push = function(b) {
          var x = b.meta.percent || 0, v = this.entriesCount, w = this._sources.length;
          this.accumulate ? this.contentBuffer.push(b) : (this.bytesWritten += b.data.length, f.prototype.push.call(this, { data: b.data, meta: { currentFile: this.currentFile, percent: v ? (x + 100 * (v - w - 1)) / v : 100 } }));
        }, d.prototype.openedSource = function(b) {
          this.currentSourceOffset = this.bytesWritten, this.currentFile = b.file.name;
          var x = this.streamFiles && !b.file.dir;
          if (x) {
            var v = s(b, x, false, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
            this.push({ data: v.fileRecord, meta: { percent: 0 } });
          } else this.accumulate = true;
        }, d.prototype.closedSource = function(b) {
          this.accumulate = false;
          var x = this.streamFiles && !b.file.dir, v = s(b, x, true, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
          if (this.dirRecords.push(v.dirRecord), x) this.push({ data: function(w) {
            return m.DATA_DESCRIPTOR + c(w.crc32, 4) + c(w.compressedSize, 4) + c(w.uncompressedSize, 4);
          }(b), meta: { percent: 100 } });
          else for (this.push({ data: v.fileRecord, meta: { percent: 0 } }); this.contentBuffer.length; ) this.push(this.contentBuffer.shift());
          this.currentFile = null;
        }, d.prototype.flush = function() {
          for (var b = this.bytesWritten, x = 0; x < this.dirRecords.length; x++) this.push({ data: this.dirRecords[x], meta: { percent: 100 } });
          var v = this.bytesWritten - b, w = function(y, g, A, C, S) {
            var R = h.transformTo("string", S(C));
            return m.CENTRAL_DIRECTORY_END + "\0\0\0\0" + c(y, 2) + c(y, 2) + c(g, 4) + c(A, 4) + c(R.length, 2) + R;
          }(this.dirRecords.length, v, b, this.zipComment, this.encodeFileName);
          this.push({ data: w, meta: { percent: 100 } });
        }, d.prototype.prepareNextSource = function() {
          this.previous = this._sources.shift(), this.openedSource(this.previous.streamInfo), this.isPaused ? this.previous.pause() : this.previous.resume();
        }, d.prototype.registerPrevious = function(b) {
          this._sources.push(b);
          var x = this;
          return b.on("data", function(v) {
            x.processChunk(v);
          }), b.on("end", function() {
            x.closedSource(x.previous.streamInfo), x._sources.length ? x.prepareNextSource() : x.end();
          }), b.on("error", function(v) {
            x.error(v);
          }), this;
        }, d.prototype.resume = function() {
          return !!f.prototype.resume.call(this) && (!this.previous && this._sources.length ? (this.prepareNextSource(), true) : this.previous || this._sources.length || this.generatedError ? void 0 : (this.end(), true));
        }, d.prototype.error = function(b) {
          var x = this._sources;
          if (!f.prototype.error.call(this, b)) return false;
          for (var v = 0; v < x.length; v++) try {
            x[v].error(b);
          } catch {
          }
          return true;
        }, d.prototype.lock = function() {
          f.prototype.lock.call(this);
          for (var b = this._sources, x = 0; x < b.length; x++) b[x].lock();
        }, l.exports = d;
      }, { "../crc32": 4, "../signature": 23, "../stream/GenericWorker": 28, "../utf8": 31, "../utils": 32 }], 9: [function(r, l, i) {
        var c = r("../compressions"), s = r("./ZipFileWorker");
        i.generateWorker = function(h, f, n) {
          var p = new s(f.streamFiles, n, f.platform, f.encodeFileName), m = 0;
          try {
            h.forEach(function(d, b) {
              m++;
              var x = function(g, A) {
                var C = g || A, S = c[C];
                if (!S) throw new Error(C + " is not a valid compression method !");
                return S;
              }(b.options.compression, f.compression), v = b.options.compressionOptions || f.compressionOptions || {}, w = b.dir, y = b.date;
              b._compressWorker(x, v).withStreamInfo("file", { name: d, dir: w, date: y, comment: b.comment || "", unixPermissions: b.unixPermissions, dosPermissions: b.dosPermissions }).pipe(p);
            }), p.entriesCount = m;
          } catch (d) {
            p.error(d);
          }
          return p;
        };
      }, { "../compressions": 3, "./ZipFileWorker": 8 }], 10: [function(r, l, i) {
        function c() {
          if (!(this instanceof c)) return new c();
          if (arguments.length) throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
          this.files = /* @__PURE__ */ Object.create(null), this.comment = null, this.root = "", this.clone = function() {
            var s = new c();
            for (var h in this) typeof this[h] != "function" && (s[h] = this[h]);
            return s;
          };
        }
        (c.prototype = r("./object")).loadAsync = r("./load"), c.support = r("./support"), c.defaults = r("./defaults"), c.version = "3.10.1", c.loadAsync = function(s, h) {
          return new c().loadAsync(s, h);
        }, c.external = r("./external"), l.exports = c;
      }, { "./defaults": 5, "./external": 6, "./load": 11, "./object": 15, "./support": 30 }], 11: [function(r, l, i) {
        var c = r("./utils"), s = r("./external"), h = r("./utf8"), f = r("./zipEntries"), n = r("./stream/Crc32Probe"), p = r("./nodejsUtils");
        function m(d) {
          return new s.Promise(function(b, x) {
            var v = d.decompressed.getContentWorker().pipe(new n());
            v.on("error", function(w) {
              x(w);
            }).on("end", function() {
              v.streamInfo.crc32 !== d.decompressed.crc32 ? x(new Error("Corrupted zip : CRC32 mismatch")) : b();
            }).resume();
          });
        }
        l.exports = function(d, b) {
          var x = this;
          return b = c.extend(b || {}, { base64: false, checkCRC32: false, optimizedBinaryString: false, createFolders: false, decodeFileName: h.utf8decode }), p.isNode && p.isStream(d) ? s.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file.")) : c.prepareContent("the loaded zip file", d, true, b.optimizedBinaryString, b.base64).then(function(v) {
            var w = new f(b);
            return w.load(v), w;
          }).then(function(v) {
            var w = [s.Promise.resolve(v)], y = v.files;
            if (b.checkCRC32) for (var g = 0; g < y.length; g++) w.push(m(y[g]));
            return s.Promise.all(w);
          }).then(function(v) {
            for (var w = v.shift(), y = w.files, g = 0; g < y.length; g++) {
              var A = y[g], C = A.fileNameStr, S = c.resolve(A.fileNameStr);
              x.file(S, A.decompressed, { binary: true, optimizedBinaryString: true, date: A.date, dir: A.dir, comment: A.fileCommentStr.length ? A.fileCommentStr : null, unixPermissions: A.unixPermissions, dosPermissions: A.dosPermissions, createFolders: b.createFolders }), A.dir || (x.file(S).unsafeOriginalName = C);
            }
            return w.zipComment.length && (x.comment = w.zipComment), x;
          });
        };
      }, { "./external": 6, "./nodejsUtils": 14, "./stream/Crc32Probe": 25, "./utf8": 31, "./utils": 32, "./zipEntries": 33 }], 12: [function(r, l, i) {
        var c = r("../utils"), s = r("../stream/GenericWorker");
        function h(f, n) {
          s.call(this, "Nodejs stream input adapter for " + f), this._upstreamEnded = false, this._bindStream(n);
        }
        c.inherits(h, s), h.prototype._bindStream = function(f) {
          var n = this;
          (this._stream = f).pause(), f.on("data", function(p) {
            n.push({ data: p, meta: { percent: 0 } });
          }).on("error", function(p) {
            n.isPaused ? this.generatedError = p : n.error(p);
          }).on("end", function() {
            n.isPaused ? n._upstreamEnded = true : n.end();
          });
        }, h.prototype.pause = function() {
          return !!s.prototype.pause.call(this) && (this._stream.pause(), true);
        }, h.prototype.resume = function() {
          return !!s.prototype.resume.call(this) && (this._upstreamEnded ? this.end() : this._stream.resume(), true);
        }, l.exports = h;
      }, { "../stream/GenericWorker": 28, "../utils": 32 }], 13: [function(r, l, i) {
        var c = r("readable-stream").Readable;
        function s(h, f, n) {
          c.call(this, f), this._helper = h;
          var p = this;
          h.on("data", function(m, d) {
            p.push(m) || p._helper.pause(), n && n(d);
          }).on("error", function(m) {
            p.emit("error", m);
          }).on("end", function() {
            p.push(null);
          });
        }
        r("../utils").inherits(s, c), s.prototype._read = function() {
          this._helper.resume();
        }, l.exports = s;
      }, { "../utils": 32, "readable-stream": 16 }], 14: [function(r, l, i) {
        l.exports = { isNode: typeof Buffer < "u", newBufferFrom: function(c, s) {
          if (Buffer.from && Buffer.from !== Uint8Array.from) return Buffer.from(c, s);
          if (typeof c == "number") throw new Error('The "data" argument must not be a number');
          return new Buffer(c, s);
        }, allocBuffer: function(c) {
          if (Buffer.alloc) return Buffer.alloc(c);
          var s = new Buffer(c);
          return s.fill(0), s;
        }, isBuffer: function(c) {
          return Buffer.isBuffer(c);
        }, isStream: function(c) {
          return c && typeof c.on == "function" && typeof c.pause == "function" && typeof c.resume == "function";
        } };
      }, {}], 15: [function(r, l, i) {
        function c(S, R, N) {
          var E, D = h.getTypeOf(R), O = h.extend(N || {}, p);
          O.date = O.date || /* @__PURE__ */ new Date(), O.compression !== null && (O.compression = O.compression.toUpperCase()), typeof O.unixPermissions == "string" && (O.unixPermissions = parseInt(O.unixPermissions, 8)), O.unixPermissions && 16384 & O.unixPermissions && (O.dir = true), O.dosPermissions && 16 & O.dosPermissions && (O.dir = true), O.dir && (S = y(S)), O.createFolders && (E = w(S)) && g.call(this, E, true);
          var L = D === "string" && O.binary === false && O.base64 === false;
          N && N.binary !== void 0 || (O.binary = !L), (R instanceof m && R.uncompressedSize === 0 || O.dir || !R || R.length === 0) && (O.base64 = false, O.binary = true, R = "", O.compression = "STORE", D = "string");
          var P = null;
          P = R instanceof m || R instanceof f ? R : x.isNode && x.isStream(R) ? new v(S, R) : h.prepareContent(S, R, O.binary, O.optimizedBinaryString, O.base64);
          var B = new d(S, P, O);
          this.files[S] = B;
        }
        var s = r("./utf8"), h = r("./utils"), f = r("./stream/GenericWorker"), n = r("./stream/StreamHelper"), p = r("./defaults"), m = r("./compressedObject"), d = r("./zipObject"), b = r("./generate"), x = r("./nodejsUtils"), v = r("./nodejs/NodejsStreamInputAdapter"), w = function(S) {
          S.slice(-1) === "/" && (S = S.substring(0, S.length - 1));
          var R = S.lastIndexOf("/");
          return 0 < R ? S.substring(0, R) : "";
        }, y = function(S) {
          return S.slice(-1) !== "/" && (S += "/"), S;
        }, g = function(S, R) {
          return R = R !== void 0 ? R : p.createFolders, S = y(S), this.files[S] || c.call(this, S, null, { dir: true, createFolders: R }), this.files[S];
        };
        function A(S) {
          return Object.prototype.toString.call(S) === "[object RegExp]";
        }
        var C = { load: function() {
          throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
        }, forEach: function(S) {
          var R, N, E;
          for (R in this.files) E = this.files[R], (N = R.slice(this.root.length, R.length)) && R.slice(0, this.root.length) === this.root && S(N, E);
        }, filter: function(S) {
          var R = [];
          return this.forEach(function(N, E) {
            S(N, E) && R.push(E);
          }), R;
        }, file: function(S, R, N) {
          if (arguments.length !== 1) return S = this.root + S, c.call(this, S, R, N), this;
          if (A(S)) {
            var E = S;
            return this.filter(function(O, L) {
              return !L.dir && E.test(O);
            });
          }
          var D = this.files[this.root + S];
          return D && !D.dir ? D : null;
        }, folder: function(S) {
          if (!S) return this;
          if (A(S)) return this.filter(function(D, O) {
            return O.dir && S.test(D);
          });
          var R = this.root + S, N = g.call(this, R), E = this.clone();
          return E.root = N.name, E;
        }, remove: function(S) {
          S = this.root + S;
          var R = this.files[S];
          if (R || (S.slice(-1) !== "/" && (S += "/"), R = this.files[S]), R && !R.dir) delete this.files[S];
          else for (var N = this.filter(function(D, O) {
            return O.name.slice(0, S.length) === S;
          }), E = 0; E < N.length; E++) delete this.files[N[E].name];
          return this;
        }, generate: function() {
          throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
        }, generateInternalStream: function(S) {
          var R, N = {};
          try {
            if ((N = h.extend(S || {}, { streamFiles: false, compression: "STORE", compressionOptions: null, type: "", platform: "DOS", comment: null, mimeType: "application/zip", encodeFileName: s.utf8encode })).type = N.type.toLowerCase(), N.compression = N.compression.toUpperCase(), N.type === "binarystring" && (N.type = "string"), !N.type) throw new Error("No output type specified.");
            h.checkSupport(N.type), N.platform !== "darwin" && N.platform !== "freebsd" && N.platform !== "linux" && N.platform !== "sunos" || (N.platform = "UNIX"), N.platform === "win32" && (N.platform = "DOS");
            var E = N.comment || this.comment || "";
            R = b.generateWorker(this, N, E);
          } catch (D) {
            (R = new f("error")).error(D);
          }
          return new n(R, N.type || "string", N.mimeType);
        }, generateAsync: function(S, R) {
          return this.generateInternalStream(S).accumulate(R);
        }, generateNodeStream: function(S, R) {
          return (S = S || {}).type || (S.type = "nodebuffer"), this.generateInternalStream(S).toNodejsStream(R);
        } };
        l.exports = C;
      }, { "./compressedObject": 2, "./defaults": 5, "./generate": 9, "./nodejs/NodejsStreamInputAdapter": 12, "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31, "./utils": 32, "./zipObject": 35 }], 16: [function(r, l, i) {
        l.exports = r("stream");
      }, { stream: void 0 }], 17: [function(r, l, i) {
        var c = r("./DataReader");
        function s(h) {
          c.call(this, h);
          for (var f = 0; f < this.data.length; f++) h[f] = 255 & h[f];
        }
        r("../utils").inherits(s, c), s.prototype.byteAt = function(h) {
          return this.data[this.zero + h];
        }, s.prototype.lastIndexOfSignature = function(h) {
          for (var f = h.charCodeAt(0), n = h.charCodeAt(1), p = h.charCodeAt(2), m = h.charCodeAt(3), d = this.length - 4; 0 <= d; --d) if (this.data[d] === f && this.data[d + 1] === n && this.data[d + 2] === p && this.data[d + 3] === m) return d - this.zero;
          return -1;
        }, s.prototype.readAndCheckSignature = function(h) {
          var f = h.charCodeAt(0), n = h.charCodeAt(1), p = h.charCodeAt(2), m = h.charCodeAt(3), d = this.readData(4);
          return f === d[0] && n === d[1] && p === d[2] && m === d[3];
        }, s.prototype.readData = function(h) {
          if (this.checkOffset(h), h === 0) return [];
          var f = this.data.slice(this.zero + this.index, this.zero + this.index + h);
          return this.index += h, f;
        }, l.exports = s;
      }, { "../utils": 32, "./DataReader": 18 }], 18: [function(r, l, i) {
        var c = r("../utils");
        function s(h) {
          this.data = h, this.length = h.length, this.index = 0, this.zero = 0;
        }
        s.prototype = { checkOffset: function(h) {
          this.checkIndex(this.index + h);
        }, checkIndex: function(h) {
          if (this.length < this.zero + h || h < 0) throw new Error("End of data reached (data length = " + this.length + ", asked index = " + h + "). Corrupted zip ?");
        }, setIndex: function(h) {
          this.checkIndex(h), this.index = h;
        }, skip: function(h) {
          this.setIndex(this.index + h);
        }, byteAt: function() {
        }, readInt: function(h) {
          var f, n = 0;
          for (this.checkOffset(h), f = this.index + h - 1; f >= this.index; f--) n = (n << 8) + this.byteAt(f);
          return this.index += h, n;
        }, readString: function(h) {
          return c.transformTo("string", this.readData(h));
        }, readData: function() {
        }, lastIndexOfSignature: function() {
        }, readAndCheckSignature: function() {
        }, readDate: function() {
          var h = this.readInt(4);
          return new Date(Date.UTC(1980 + (h >> 25 & 127), (h >> 21 & 15) - 1, h >> 16 & 31, h >> 11 & 31, h >> 5 & 63, (31 & h) << 1));
        } }, l.exports = s;
      }, { "../utils": 32 }], 19: [function(r, l, i) {
        var c = r("./Uint8ArrayReader");
        function s(h) {
          c.call(this, h);
        }
        r("../utils").inherits(s, c), s.prototype.readData = function(h) {
          this.checkOffset(h);
          var f = this.data.slice(this.zero + this.index, this.zero + this.index + h);
          return this.index += h, f;
        }, l.exports = s;
      }, { "../utils": 32, "./Uint8ArrayReader": 21 }], 20: [function(r, l, i) {
        var c = r("./DataReader");
        function s(h) {
          c.call(this, h);
        }
        r("../utils").inherits(s, c), s.prototype.byteAt = function(h) {
          return this.data.charCodeAt(this.zero + h);
        }, s.prototype.lastIndexOfSignature = function(h) {
          return this.data.lastIndexOf(h) - this.zero;
        }, s.prototype.readAndCheckSignature = function(h) {
          return h === this.readData(4);
        }, s.prototype.readData = function(h) {
          this.checkOffset(h);
          var f = this.data.slice(this.zero + this.index, this.zero + this.index + h);
          return this.index += h, f;
        }, l.exports = s;
      }, { "../utils": 32, "./DataReader": 18 }], 21: [function(r, l, i) {
        var c = r("./ArrayReader");
        function s(h) {
          c.call(this, h);
        }
        r("../utils").inherits(s, c), s.prototype.readData = function(h) {
          if (this.checkOffset(h), h === 0) return new Uint8Array(0);
          var f = this.data.subarray(this.zero + this.index, this.zero + this.index + h);
          return this.index += h, f;
        }, l.exports = s;
      }, { "../utils": 32, "./ArrayReader": 17 }], 22: [function(r, l, i) {
        var c = r("../utils"), s = r("../support"), h = r("./ArrayReader"), f = r("./StringReader"), n = r("./NodeBufferReader"), p = r("./Uint8ArrayReader");
        l.exports = function(m) {
          var d = c.getTypeOf(m);
          return c.checkSupport(d), d !== "string" || s.uint8array ? d === "nodebuffer" ? new n(m) : s.uint8array ? new p(c.transformTo("uint8array", m)) : new h(c.transformTo("array", m)) : new f(m);
        };
      }, { "../support": 30, "../utils": 32, "./ArrayReader": 17, "./NodeBufferReader": 19, "./StringReader": 20, "./Uint8ArrayReader": 21 }], 23: [function(r, l, i) {
        i.LOCAL_FILE_HEADER = "PK", i.CENTRAL_FILE_HEADER = "PK", i.CENTRAL_DIRECTORY_END = "PK", i.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07", i.ZIP64_CENTRAL_DIRECTORY_END = "PK", i.DATA_DESCRIPTOR = "PK\x07\b";
      }, {}], 24: [function(r, l, i) {
        var c = r("./GenericWorker"), s = r("../utils");
        function h(f) {
          c.call(this, "ConvertWorker to " + f), this.destType = f;
        }
        s.inherits(h, c), h.prototype.processChunk = function(f) {
          this.push({ data: s.transformTo(this.destType, f.data), meta: f.meta });
        }, l.exports = h;
      }, { "../utils": 32, "./GenericWorker": 28 }], 25: [function(r, l, i) {
        var c = r("./GenericWorker"), s = r("../crc32");
        function h() {
          c.call(this, "Crc32Probe"), this.withStreamInfo("crc32", 0);
        }
        r("../utils").inherits(h, c), h.prototype.processChunk = function(f) {
          this.streamInfo.crc32 = s(f.data, this.streamInfo.crc32 || 0), this.push(f);
        }, l.exports = h;
      }, { "../crc32": 4, "../utils": 32, "./GenericWorker": 28 }], 26: [function(r, l, i) {
        var c = r("../utils"), s = r("./GenericWorker");
        function h(f) {
          s.call(this, "DataLengthProbe for " + f), this.propName = f, this.withStreamInfo(f, 0);
        }
        c.inherits(h, s), h.prototype.processChunk = function(f) {
          if (f) {
            var n = this.streamInfo[this.propName] || 0;
            this.streamInfo[this.propName] = n + f.data.length;
          }
          s.prototype.processChunk.call(this, f);
        }, l.exports = h;
      }, { "../utils": 32, "./GenericWorker": 28 }], 27: [function(r, l, i) {
        var c = r("../utils"), s = r("./GenericWorker");
        function h(f) {
          s.call(this, "DataWorker");
          var n = this;
          this.dataIsReady = false, this.index = 0, this.max = 0, this.data = null, this.type = "", this._tickScheduled = false, f.then(function(p) {
            n.dataIsReady = true, n.data = p, n.max = p && p.length || 0, n.type = c.getTypeOf(p), n.isPaused || n._tickAndRepeat();
          }, function(p) {
            n.error(p);
          });
        }
        c.inherits(h, s), h.prototype.cleanUp = function() {
          s.prototype.cleanUp.call(this), this.data = null;
        }, h.prototype.resume = function() {
          return !!s.prototype.resume.call(this) && (!this._tickScheduled && this.dataIsReady && (this._tickScheduled = true, c.delay(this._tickAndRepeat, [], this)), true);
        }, h.prototype._tickAndRepeat = function() {
          this._tickScheduled = false, this.isPaused || this.isFinished || (this._tick(), this.isFinished || (c.delay(this._tickAndRepeat, [], this), this._tickScheduled = true));
        }, h.prototype._tick = function() {
          if (this.isPaused || this.isFinished) return false;
          var f = null, n = Math.min(this.max, this.index + 16384);
          if (this.index >= this.max) return this.end();
          switch (this.type) {
            case "string":
              f = this.data.substring(this.index, n);
              break;
            case "uint8array":
              f = this.data.subarray(this.index, n);
              break;
            case "array":
            case "nodebuffer":
              f = this.data.slice(this.index, n);
          }
          return this.index = n, this.push({ data: f, meta: { percent: this.max ? this.index / this.max * 100 : 0 } });
        }, l.exports = h;
      }, { "../utils": 32, "./GenericWorker": 28 }], 28: [function(r, l, i) {
        function c(s) {
          this.name = s || "default", this.streamInfo = {}, this.generatedError = null, this.extraStreamInfo = {}, this.isPaused = true, this.isFinished = false, this.isLocked = false, this._listeners = { data: [], end: [], error: [] }, this.previous = null;
        }
        c.prototype = { push: function(s) {
          this.emit("data", s);
        }, end: function() {
          if (this.isFinished) return false;
          this.flush();
          try {
            this.emit("end"), this.cleanUp(), this.isFinished = true;
          } catch (s) {
            this.emit("error", s);
          }
          return true;
        }, error: function(s) {
          return !this.isFinished && (this.isPaused ? this.generatedError = s : (this.isFinished = true, this.emit("error", s), this.previous && this.previous.error(s), this.cleanUp()), true);
        }, on: function(s, h) {
          return this._listeners[s].push(h), this;
        }, cleanUp: function() {
          this.streamInfo = this.generatedError = this.extraStreamInfo = null, this._listeners = [];
        }, emit: function(s, h) {
          if (this._listeners[s]) for (var f = 0; f < this._listeners[s].length; f++) this._listeners[s][f].call(this, h);
        }, pipe: function(s) {
          return s.registerPrevious(this);
        }, registerPrevious: function(s) {
          if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
          this.streamInfo = s.streamInfo, this.mergeStreamInfo(), this.previous = s;
          var h = this;
          return s.on("data", function(f) {
            h.processChunk(f);
          }), s.on("end", function() {
            h.end();
          }), s.on("error", function(f) {
            h.error(f);
          }), this;
        }, pause: function() {
          return !this.isPaused && !this.isFinished && (this.isPaused = true, this.previous && this.previous.pause(), true);
        }, resume: function() {
          if (!this.isPaused || this.isFinished) return false;
          var s = this.isPaused = false;
          return this.generatedError && (this.error(this.generatedError), s = true), this.previous && this.previous.resume(), !s;
        }, flush: function() {
        }, processChunk: function(s) {
          this.push(s);
        }, withStreamInfo: function(s, h) {
          return this.extraStreamInfo[s] = h, this.mergeStreamInfo(), this;
        }, mergeStreamInfo: function() {
          for (var s in this.extraStreamInfo) Object.prototype.hasOwnProperty.call(this.extraStreamInfo, s) && (this.streamInfo[s] = this.extraStreamInfo[s]);
        }, lock: function() {
          if (this.isLocked) throw new Error("The stream '" + this + "' has already been used.");
          this.isLocked = true, this.previous && this.previous.lock();
        }, toString: function() {
          var s = "Worker " + this.name;
          return this.previous ? this.previous + " -> " + s : s;
        } }, l.exports = c;
      }, {}], 29: [function(r, l, i) {
        var c = r("../utils"), s = r("./ConvertWorker"), h = r("./GenericWorker"), f = r("../base64"), n = r("../support"), p = r("../external"), m = null;
        if (n.nodestream) try {
          m = r("../nodejs/NodejsStreamOutputAdapter");
        } catch {
        }
        function d(x, v) {
          return new p.Promise(function(w, y) {
            var g = [], A = x._internalType, C = x._outputType, S = x._mimeType;
            x.on("data", function(R, N) {
              g.push(R), v && v(N);
            }).on("error", function(R) {
              g = [], y(R);
            }).on("end", function() {
              try {
                var R = function(N, E, D) {
                  switch (N) {
                    case "blob":
                      return c.newBlob(c.transformTo("arraybuffer", E), D);
                    case "base64":
                      return f.encode(E);
                    default:
                      return c.transformTo(N, E);
                  }
                }(C, function(N, E) {
                  var D, O = 0, L = null, P = 0;
                  for (D = 0; D < E.length; D++) P += E[D].length;
                  switch (N) {
                    case "string":
                      return E.join("");
                    case "array":
                      return Array.prototype.concat.apply([], E);
                    case "uint8array":
                      for (L = new Uint8Array(P), D = 0; D < E.length; D++) L.set(E[D], O), O += E[D].length;
                      return L;
                    case "nodebuffer":
                      return Buffer.concat(E);
                    default:
                      throw new Error("concat : unsupported type '" + N + "'");
                  }
                }(A, g), S);
                w(R);
              } catch (N) {
                y(N);
              }
              g = [];
            }).resume();
          });
        }
        function b(x, v, w) {
          var y = v;
          switch (v) {
            case "blob":
            case "arraybuffer":
              y = "uint8array";
              break;
            case "base64":
              y = "string";
          }
          try {
            this._internalType = y, this._outputType = v, this._mimeType = w, c.checkSupport(y), this._worker = x.pipe(new s(y)), x.lock();
          } catch (g) {
            this._worker = new h("error"), this._worker.error(g);
          }
        }
        b.prototype = { accumulate: function(x) {
          return d(this, x);
        }, on: function(x, v) {
          var w = this;
          return x === "data" ? this._worker.on(x, function(y) {
            v.call(w, y.data, y.meta);
          }) : this._worker.on(x, function() {
            c.delay(v, arguments, w);
          }), this;
        }, resume: function() {
          return c.delay(this._worker.resume, [], this._worker), this;
        }, pause: function() {
          return this._worker.pause(), this;
        }, toNodejsStream: function(x) {
          if (c.checkSupport("nodestream"), this._outputType !== "nodebuffer") throw new Error(this._outputType + " is not supported by this method");
          return new m(this, { objectMode: this._outputType !== "nodebuffer" }, x);
        } }, l.exports = b;
      }, { "../base64": 1, "../external": 6, "../nodejs/NodejsStreamOutputAdapter": 13, "../support": 30, "../utils": 32, "./ConvertWorker": 24, "./GenericWorker": 28 }], 30: [function(r, l, i) {
        if (i.base64 = true, i.array = true, i.string = true, i.arraybuffer = typeof ArrayBuffer < "u" && typeof Uint8Array < "u", i.nodebuffer = typeof Buffer < "u", i.uint8array = typeof Uint8Array < "u", typeof ArrayBuffer > "u") i.blob = false;
        else {
          var c = new ArrayBuffer(0);
          try {
            i.blob = new Blob([c], { type: "application/zip" }).size === 0;
          } catch {
            try {
              var s = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
              s.append(c), i.blob = s.getBlob("application/zip").size === 0;
            } catch {
              i.blob = false;
            }
          }
        }
        try {
          i.nodestream = !!r("readable-stream").Readable;
        } catch {
          i.nodestream = false;
        }
      }, { "readable-stream": 16 }], 31: [function(r, l, i) {
        for (var c = r("./utils"), s = r("./support"), h = r("./nodejsUtils"), f = r("./stream/GenericWorker"), n = new Array(256), p = 0; p < 256; p++) n[p] = 252 <= p ? 6 : 248 <= p ? 5 : 240 <= p ? 4 : 224 <= p ? 3 : 192 <= p ? 2 : 1;
        n[254] = n[254] = 1;
        function m() {
          f.call(this, "utf-8 decode"), this.leftOver = null;
        }
        function d() {
          f.call(this, "utf-8 encode");
        }
        i.utf8encode = function(b) {
          return s.nodebuffer ? h.newBufferFrom(b, "utf-8") : function(x) {
            var v, w, y, g, A, C = x.length, S = 0;
            for (g = 0; g < C; g++) (64512 & (w = x.charCodeAt(g))) == 55296 && g + 1 < C && (64512 & (y = x.charCodeAt(g + 1))) == 56320 && (w = 65536 + (w - 55296 << 10) + (y - 56320), g++), S += w < 128 ? 1 : w < 2048 ? 2 : w < 65536 ? 3 : 4;
            for (v = s.uint8array ? new Uint8Array(S) : new Array(S), g = A = 0; A < S; g++) (64512 & (w = x.charCodeAt(g))) == 55296 && g + 1 < C && (64512 & (y = x.charCodeAt(g + 1))) == 56320 && (w = 65536 + (w - 55296 << 10) + (y - 56320), g++), w < 128 ? v[A++] = w : (w < 2048 ? v[A++] = 192 | w >>> 6 : (w < 65536 ? v[A++] = 224 | w >>> 12 : (v[A++] = 240 | w >>> 18, v[A++] = 128 | w >>> 12 & 63), v[A++] = 128 | w >>> 6 & 63), v[A++] = 128 | 63 & w);
            return v;
          }(b);
        }, i.utf8decode = function(b) {
          return s.nodebuffer ? c.transformTo("nodebuffer", b).toString("utf-8") : function(x) {
            var v, w, y, g, A = x.length, C = new Array(2 * A);
            for (v = w = 0; v < A; ) if ((y = x[v++]) < 128) C[w++] = y;
            else if (4 < (g = n[y])) C[w++] = 65533, v += g - 1;
            else {
              for (y &= g === 2 ? 31 : g === 3 ? 15 : 7; 1 < g && v < A; ) y = y << 6 | 63 & x[v++], g--;
              1 < g ? C[w++] = 65533 : y < 65536 ? C[w++] = y : (y -= 65536, C[w++] = 55296 | y >> 10 & 1023, C[w++] = 56320 | 1023 & y);
            }
            return C.length !== w && (C.subarray ? C = C.subarray(0, w) : C.length = w), c.applyFromCharCode(C);
          }(b = c.transformTo(s.uint8array ? "uint8array" : "array", b));
        }, c.inherits(m, f), m.prototype.processChunk = function(b) {
          var x = c.transformTo(s.uint8array ? "uint8array" : "array", b.data);
          if (this.leftOver && this.leftOver.length) {
            if (s.uint8array) {
              var v = x;
              (x = new Uint8Array(v.length + this.leftOver.length)).set(this.leftOver, 0), x.set(v, this.leftOver.length);
            } else x = this.leftOver.concat(x);
            this.leftOver = null;
          }
          var w = function(g, A) {
            var C;
            for ((A = A || g.length) > g.length && (A = g.length), C = A - 1; 0 <= C && (192 & g[C]) == 128; ) C--;
            return C < 0 || C === 0 ? A : C + n[g[C]] > A ? C : A;
          }(x), y = x;
          w !== x.length && (s.uint8array ? (y = x.subarray(0, w), this.leftOver = x.subarray(w, x.length)) : (y = x.slice(0, w), this.leftOver = x.slice(w, x.length))), this.push({ data: i.utf8decode(y), meta: b.meta });
        }, m.prototype.flush = function() {
          this.leftOver && this.leftOver.length && (this.push({ data: i.utf8decode(this.leftOver), meta: {} }), this.leftOver = null);
        }, i.Utf8DecodeWorker = m, c.inherits(d, f), d.prototype.processChunk = function(b) {
          this.push({ data: i.utf8encode(b.data), meta: b.meta });
        }, i.Utf8EncodeWorker = d;
      }, { "./nodejsUtils": 14, "./stream/GenericWorker": 28, "./support": 30, "./utils": 32 }], 32: [function(r, l, i) {
        var c = r("./support"), s = r("./base64"), h = r("./nodejsUtils"), f = r("./external");
        function n(v) {
          return v;
        }
        function p(v, w) {
          for (var y = 0; y < v.length; ++y) w[y] = 255 & v.charCodeAt(y);
          return w;
        }
        r("setimmediate"), i.newBlob = function(v, w) {
          i.checkSupport("blob");
          try {
            return new Blob([v], { type: w });
          } catch {
            try {
              var y = new (self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder)();
              return y.append(v), y.getBlob(w);
            } catch {
              throw new Error("Bug : can't construct the Blob.");
            }
          }
        };
        var m = { stringifyByChunk: function(v, w, y) {
          var g = [], A = 0, C = v.length;
          if (C <= y) return String.fromCharCode.apply(null, v);
          for (; A < C; ) w === "array" || w === "nodebuffer" ? g.push(String.fromCharCode.apply(null, v.slice(A, Math.min(A + y, C)))) : g.push(String.fromCharCode.apply(null, v.subarray(A, Math.min(A + y, C)))), A += y;
          return g.join("");
        }, stringifyByChar: function(v) {
          for (var w = "", y = 0; y < v.length; y++) w += String.fromCharCode(v[y]);
          return w;
        }, applyCanBeUsed: { uint8array: function() {
          try {
            return c.uint8array && String.fromCharCode.apply(null, new Uint8Array(1)).length === 1;
          } catch {
            return false;
          }
        }(), nodebuffer: function() {
          try {
            return c.nodebuffer && String.fromCharCode.apply(null, h.allocBuffer(1)).length === 1;
          } catch {
            return false;
          }
        }() } };
        function d(v) {
          var w = 65536, y = i.getTypeOf(v), g = true;
          if (y === "uint8array" ? g = m.applyCanBeUsed.uint8array : y === "nodebuffer" && (g = m.applyCanBeUsed.nodebuffer), g) for (; 1 < w; ) try {
            return m.stringifyByChunk(v, y, w);
          } catch {
            w = Math.floor(w / 2);
          }
          return m.stringifyByChar(v);
        }
        function b(v, w) {
          for (var y = 0; y < v.length; y++) w[y] = v[y];
          return w;
        }
        i.applyFromCharCode = d;
        var x = {};
        x.string = { string: n, array: function(v) {
          return p(v, new Array(v.length));
        }, arraybuffer: function(v) {
          return x.string.uint8array(v).buffer;
        }, uint8array: function(v) {
          return p(v, new Uint8Array(v.length));
        }, nodebuffer: function(v) {
          return p(v, h.allocBuffer(v.length));
        } }, x.array = { string: d, array: n, arraybuffer: function(v) {
          return new Uint8Array(v).buffer;
        }, uint8array: function(v) {
          return new Uint8Array(v);
        }, nodebuffer: function(v) {
          return h.newBufferFrom(v);
        } }, x.arraybuffer = { string: function(v) {
          return d(new Uint8Array(v));
        }, array: function(v) {
          return b(new Uint8Array(v), new Array(v.byteLength));
        }, arraybuffer: n, uint8array: function(v) {
          return new Uint8Array(v);
        }, nodebuffer: function(v) {
          return h.newBufferFrom(new Uint8Array(v));
        } }, x.uint8array = { string: d, array: function(v) {
          return b(v, new Array(v.length));
        }, arraybuffer: function(v) {
          return v.buffer;
        }, uint8array: n, nodebuffer: function(v) {
          return h.newBufferFrom(v);
        } }, x.nodebuffer = { string: d, array: function(v) {
          return b(v, new Array(v.length));
        }, arraybuffer: function(v) {
          return x.nodebuffer.uint8array(v).buffer;
        }, uint8array: function(v) {
          return b(v, new Uint8Array(v.length));
        }, nodebuffer: n }, i.transformTo = function(v, w) {
          if (w = w || "", !v) return w;
          i.checkSupport(v);
          var y = i.getTypeOf(w);
          return x[y][v](w);
        }, i.resolve = function(v) {
          for (var w = v.split("/"), y = [], g = 0; g < w.length; g++) {
            var A = w[g];
            A === "." || A === "" && g !== 0 && g !== w.length - 1 || (A === ".." ? y.pop() : y.push(A));
          }
          return y.join("/");
        }, i.getTypeOf = function(v) {
          return typeof v == "string" ? "string" : Object.prototype.toString.call(v) === "[object Array]" ? "array" : c.nodebuffer && h.isBuffer(v) ? "nodebuffer" : c.uint8array && v instanceof Uint8Array ? "uint8array" : c.arraybuffer && v instanceof ArrayBuffer ? "arraybuffer" : void 0;
        }, i.checkSupport = function(v) {
          if (!c[v.toLowerCase()]) throw new Error(v + " is not supported by this platform");
        }, i.MAX_VALUE_16BITS = 65535, i.MAX_VALUE_32BITS = -1, i.pretty = function(v) {
          var w, y, g = "";
          for (y = 0; y < (v || "").length; y++) g += "\\x" + ((w = v.charCodeAt(y)) < 16 ? "0" : "") + w.toString(16).toUpperCase();
          return g;
        }, i.delay = function(v, w, y) {
          setImmediate(function() {
            v.apply(y || null, w || []);
          });
        }, i.inherits = function(v, w) {
          function y() {
          }
          y.prototype = w.prototype, v.prototype = new y();
        }, i.extend = function() {
          var v, w, y = {};
          for (v = 0; v < arguments.length; v++) for (w in arguments[v]) Object.prototype.hasOwnProperty.call(arguments[v], w) && y[w] === void 0 && (y[w] = arguments[v][w]);
          return y;
        }, i.prepareContent = function(v, w, y, g, A) {
          return f.Promise.resolve(w).then(function(C) {
            return c.blob && (C instanceof Blob || ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(C)) !== -1) && typeof FileReader < "u" ? new f.Promise(function(S, R) {
              var N = new FileReader();
              N.onload = function(E) {
                S(E.target.result);
              }, N.onerror = function(E) {
                R(E.target.error);
              }, N.readAsArrayBuffer(C);
            }) : C;
          }).then(function(C) {
            var S = i.getTypeOf(C);
            return S ? (S === "arraybuffer" ? C = i.transformTo("uint8array", C) : S === "string" && (A ? C = s.decode(C) : y && g !== true && (C = function(R) {
              return p(R, c.uint8array ? new Uint8Array(R.length) : new Array(R.length));
            }(C))), C) : f.Promise.reject(new Error("Can't read the data of '" + v + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?"));
          });
        };
      }, { "./base64": 1, "./external": 6, "./nodejsUtils": 14, "./support": 30, setimmediate: 54 }], 33: [function(r, l, i) {
        var c = r("./reader/readerFor"), s = r("./utils"), h = r("./signature"), f = r("./zipEntry"), n = r("./support");
        function p(m) {
          this.files = [], this.loadOptions = m;
        }
        p.prototype = { checkSignature: function(m) {
          if (!this.reader.readAndCheckSignature(m)) {
            this.reader.index -= 4;
            var d = this.reader.readString(4);
            throw new Error("Corrupted zip or bug: unexpected signature (" + s.pretty(d) + ", expected " + s.pretty(m) + ")");
          }
        }, isSignature: function(m, d) {
          var b = this.reader.index;
          this.reader.setIndex(m);
          var x = this.reader.readString(4) === d;
          return this.reader.setIndex(b), x;
        }, readBlockEndOfCentral: function() {
          this.diskNumber = this.reader.readInt(2), this.diskWithCentralDirStart = this.reader.readInt(2), this.centralDirRecordsOnThisDisk = this.reader.readInt(2), this.centralDirRecords = this.reader.readInt(2), this.centralDirSize = this.reader.readInt(4), this.centralDirOffset = this.reader.readInt(4), this.zipCommentLength = this.reader.readInt(2);
          var m = this.reader.readData(this.zipCommentLength), d = n.uint8array ? "uint8array" : "array", b = s.transformTo(d, m);
          this.zipComment = this.loadOptions.decodeFileName(b);
        }, readBlockZip64EndOfCentral: function() {
          this.zip64EndOfCentralSize = this.reader.readInt(8), this.reader.skip(4), this.diskNumber = this.reader.readInt(4), this.diskWithCentralDirStart = this.reader.readInt(4), this.centralDirRecordsOnThisDisk = this.reader.readInt(8), this.centralDirRecords = this.reader.readInt(8), this.centralDirSize = this.reader.readInt(8), this.centralDirOffset = this.reader.readInt(8), this.zip64ExtensibleData = {};
          for (var m, d, b, x = this.zip64EndOfCentralSize - 44; 0 < x; ) m = this.reader.readInt(2), d = this.reader.readInt(4), b = this.reader.readData(d), this.zip64ExtensibleData[m] = { id: m, length: d, value: b };
        }, readBlockZip64EndOfCentralLocator: function() {
          if (this.diskWithZip64CentralDirStart = this.reader.readInt(4), this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8), this.disksCount = this.reader.readInt(4), 1 < this.disksCount) throw new Error("Multi-volumes zip are not supported");
        }, readLocalFiles: function() {
          var m, d;
          for (m = 0; m < this.files.length; m++) d = this.files[m], this.reader.setIndex(d.localHeaderOffset), this.checkSignature(h.LOCAL_FILE_HEADER), d.readLocalPart(this.reader), d.handleUTF8(), d.processAttributes();
        }, readCentralDir: function() {
          var m;
          for (this.reader.setIndex(this.centralDirOffset); this.reader.readAndCheckSignature(h.CENTRAL_FILE_HEADER); ) (m = new f({ zip64: this.zip64 }, this.loadOptions)).readCentralPart(this.reader), this.files.push(m);
          if (this.centralDirRecords !== this.files.length && this.centralDirRecords !== 0 && this.files.length === 0) throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
        }, readEndOfCentral: function() {
          var m = this.reader.lastIndexOfSignature(h.CENTRAL_DIRECTORY_END);
          if (m < 0) throw this.isSignature(0, h.LOCAL_FILE_HEADER) ? new Error("Corrupted zip: can't find end of central directory") : new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html");
          this.reader.setIndex(m);
          var d = m;
          if (this.checkSignature(h.CENTRAL_DIRECTORY_END), this.readBlockEndOfCentral(), this.diskNumber === s.MAX_VALUE_16BITS || this.diskWithCentralDirStart === s.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === s.MAX_VALUE_16BITS || this.centralDirRecords === s.MAX_VALUE_16BITS || this.centralDirSize === s.MAX_VALUE_32BITS || this.centralDirOffset === s.MAX_VALUE_32BITS) {
            if (this.zip64 = true, (m = this.reader.lastIndexOfSignature(h.ZIP64_CENTRAL_DIRECTORY_LOCATOR)) < 0) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
            if (this.reader.setIndex(m), this.checkSignature(h.ZIP64_CENTRAL_DIRECTORY_LOCATOR), this.readBlockZip64EndOfCentralLocator(), !this.isSignature(this.relativeOffsetEndOfZip64CentralDir, h.ZIP64_CENTRAL_DIRECTORY_END) && (this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(h.ZIP64_CENTRAL_DIRECTORY_END), this.relativeOffsetEndOfZip64CentralDir < 0)) throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
            this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir), this.checkSignature(h.ZIP64_CENTRAL_DIRECTORY_END), this.readBlockZip64EndOfCentral();
          }
          var b = this.centralDirOffset + this.centralDirSize;
          this.zip64 && (b += 20, b += 12 + this.zip64EndOfCentralSize);
          var x = d - b;
          if (0 < x) this.isSignature(d, h.CENTRAL_FILE_HEADER) || (this.reader.zero = x);
          else if (x < 0) throw new Error("Corrupted zip: missing " + Math.abs(x) + " bytes.");
        }, prepareReader: function(m) {
          this.reader = c(m);
        }, load: function(m) {
          this.prepareReader(m), this.readEndOfCentral(), this.readCentralDir(), this.readLocalFiles();
        } }, l.exports = p;
      }, { "./reader/readerFor": 22, "./signature": 23, "./support": 30, "./utils": 32, "./zipEntry": 34 }], 34: [function(r, l, i) {
        var c = r("./reader/readerFor"), s = r("./utils"), h = r("./compressedObject"), f = r("./crc32"), n = r("./utf8"), p = r("./compressions"), m = r("./support");
        function d(b, x) {
          this.options = b, this.loadOptions = x;
        }
        d.prototype = { isEncrypted: function() {
          return (1 & this.bitFlag) == 1;
        }, useUTF8: function() {
          return (2048 & this.bitFlag) == 2048;
        }, readLocalPart: function(b) {
          var x, v;
          if (b.skip(22), this.fileNameLength = b.readInt(2), v = b.readInt(2), this.fileName = b.readData(this.fileNameLength), b.skip(v), this.compressedSize === -1 || this.uncompressedSize === -1) throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
          if ((x = function(w) {
            for (var y in p) if (Object.prototype.hasOwnProperty.call(p, y) && p[y].magic === w) return p[y];
            return null;
          }(this.compressionMethod)) === null) throw new Error("Corrupted zip : compression " + s.pretty(this.compressionMethod) + " unknown (inner file : " + s.transformTo("string", this.fileName) + ")");
          this.decompressed = new h(this.compressedSize, this.uncompressedSize, this.crc32, x, b.readData(this.compressedSize));
        }, readCentralPart: function(b) {
          this.versionMadeBy = b.readInt(2), b.skip(2), this.bitFlag = b.readInt(2), this.compressionMethod = b.readString(2), this.date = b.readDate(), this.crc32 = b.readInt(4), this.compressedSize = b.readInt(4), this.uncompressedSize = b.readInt(4);
          var x = b.readInt(2);
          if (this.extraFieldsLength = b.readInt(2), this.fileCommentLength = b.readInt(2), this.diskNumberStart = b.readInt(2), this.internalFileAttributes = b.readInt(2), this.externalFileAttributes = b.readInt(4), this.localHeaderOffset = b.readInt(4), this.isEncrypted()) throw new Error("Encrypted zip are not supported");
          b.skip(x), this.readExtraFields(b), this.parseZIP64ExtraField(b), this.fileComment = b.readData(this.fileCommentLength);
        }, processAttributes: function() {
          this.unixPermissions = null, this.dosPermissions = null;
          var b = this.versionMadeBy >> 8;
          this.dir = !!(16 & this.externalFileAttributes), b == 0 && (this.dosPermissions = 63 & this.externalFileAttributes), b == 3 && (this.unixPermissions = this.externalFileAttributes >> 16 & 65535), this.dir || this.fileNameStr.slice(-1) !== "/" || (this.dir = true);
        }, parseZIP64ExtraField: function() {
          if (this.extraFields[1]) {
            var b = c(this.extraFields[1].value);
            this.uncompressedSize === s.MAX_VALUE_32BITS && (this.uncompressedSize = b.readInt(8)), this.compressedSize === s.MAX_VALUE_32BITS && (this.compressedSize = b.readInt(8)), this.localHeaderOffset === s.MAX_VALUE_32BITS && (this.localHeaderOffset = b.readInt(8)), this.diskNumberStart === s.MAX_VALUE_32BITS && (this.diskNumberStart = b.readInt(4));
          }
        }, readExtraFields: function(b) {
          var x, v, w, y = b.index + this.extraFieldsLength;
          for (this.extraFields || (this.extraFields = {}); b.index + 4 < y; ) x = b.readInt(2), v = b.readInt(2), w = b.readData(v), this.extraFields[x] = { id: x, length: v, value: w };
          b.setIndex(y);
        }, handleUTF8: function() {
          var b = m.uint8array ? "uint8array" : "array";
          if (this.useUTF8()) this.fileNameStr = n.utf8decode(this.fileName), this.fileCommentStr = n.utf8decode(this.fileComment);
          else {
            var x = this.findExtraFieldUnicodePath();
            if (x !== null) this.fileNameStr = x;
            else {
              var v = s.transformTo(b, this.fileName);
              this.fileNameStr = this.loadOptions.decodeFileName(v);
            }
            var w = this.findExtraFieldUnicodeComment();
            if (w !== null) this.fileCommentStr = w;
            else {
              var y = s.transformTo(b, this.fileComment);
              this.fileCommentStr = this.loadOptions.decodeFileName(y);
            }
          }
        }, findExtraFieldUnicodePath: function() {
          var b = this.extraFields[28789];
          if (b) {
            var x = c(b.value);
            return x.readInt(1) !== 1 || f(this.fileName) !== x.readInt(4) ? null : n.utf8decode(x.readData(b.length - 5));
          }
          return null;
        }, findExtraFieldUnicodeComment: function() {
          var b = this.extraFields[25461];
          if (b) {
            var x = c(b.value);
            return x.readInt(1) !== 1 || f(this.fileComment) !== x.readInt(4) ? null : n.utf8decode(x.readData(b.length - 5));
          }
          return null;
        } }, l.exports = d;
      }, { "./compressedObject": 2, "./compressions": 3, "./crc32": 4, "./reader/readerFor": 22, "./support": 30, "./utf8": 31, "./utils": 32 }], 35: [function(r, l, i) {
        function c(x, v, w) {
          this.name = x, this.dir = w.dir, this.date = w.date, this.comment = w.comment, this.unixPermissions = w.unixPermissions, this.dosPermissions = w.dosPermissions, this._data = v, this._dataBinary = w.binary, this.options = { compression: w.compression, compressionOptions: w.compressionOptions };
        }
        var s = r("./stream/StreamHelper"), h = r("./stream/DataWorker"), f = r("./utf8"), n = r("./compressedObject"), p = r("./stream/GenericWorker");
        c.prototype = { internalStream: function(x) {
          var v = null, w = "string";
          try {
            if (!x) throw new Error("No output type specified.");
            var y = (w = x.toLowerCase()) === "string" || w === "text";
            w !== "binarystring" && w !== "text" || (w = "string"), v = this._decompressWorker();
            var g = !this._dataBinary;
            g && !y && (v = v.pipe(new f.Utf8EncodeWorker())), !g && y && (v = v.pipe(new f.Utf8DecodeWorker()));
          } catch (A) {
            (v = new p("error")).error(A);
          }
          return new s(v, w, "");
        }, async: function(x, v) {
          return this.internalStream(x).accumulate(v);
        }, nodeStream: function(x, v) {
          return this.internalStream(x || "nodebuffer").toNodejsStream(v);
        }, _compressWorker: function(x, v) {
          if (this._data instanceof n && this._data.compression.magic === x.magic) return this._data.getCompressedWorker();
          var w = this._decompressWorker();
          return this._dataBinary || (w = w.pipe(new f.Utf8EncodeWorker())), n.createWorkerFrom(w, x, v);
        }, _decompressWorker: function() {
          return this._data instanceof n ? this._data.getContentWorker() : this._data instanceof p ? this._data : new h(this._data);
        } };
        for (var m = ["asText", "asBinary", "asNodeBuffer", "asUint8Array", "asArrayBuffer"], d = function() {
          throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
        }, b = 0; b < m.length; b++) c.prototype[m[b]] = d;
        l.exports = c;
      }, { "./compressedObject": 2, "./stream/DataWorker": 27, "./stream/GenericWorker": 28, "./stream/StreamHelper": 29, "./utf8": 31 }], 36: [function(r, l, i) {
        (function(c) {
          var s, h, f = c.MutationObserver || c.WebKitMutationObserver;
          if (f) {
            var n = 0, p = new f(x), m = c.document.createTextNode("");
            p.observe(m, { characterData: true }), s = function() {
              m.data = n = ++n % 2;
            };
          } else if (c.setImmediate || c.MessageChannel === void 0) s = "document" in c && "onreadystatechange" in c.document.createElement("script") ? function() {
            var v = c.document.createElement("script");
            v.onreadystatechange = function() {
              x(), v.onreadystatechange = null, v.parentNode.removeChild(v), v = null;
            }, c.document.documentElement.appendChild(v);
          } : function() {
            setTimeout(x, 0);
          };
          else {
            var d = new c.MessageChannel();
            d.port1.onmessage = x, s = function() {
              d.port2.postMessage(0);
            };
          }
          var b = [];
          function x() {
            var v, w;
            h = true;
            for (var y = b.length; y; ) {
              for (w = b, b = [], v = -1; ++v < y; ) w[v]();
              y = b.length;
            }
            h = false;
          }
          l.exports = function(v) {
            b.push(v) !== 1 || h || s();
          };
        }).call(this, typeof I0 < "u" ? I0 : typeof self < "u" ? self : typeof window < "u" ? window : {});
      }, {}], 37: [function(r, l, i) {
        var c = r("immediate");
        function s() {
        }
        var h = {}, f = ["REJECTED"], n = ["FULFILLED"], p = ["PENDING"];
        function m(y) {
          if (typeof y != "function") throw new TypeError("resolver must be a function");
          this.state = p, this.queue = [], this.outcome = void 0, y !== s && v(this, y);
        }
        function d(y, g, A) {
          this.promise = y, typeof g == "function" && (this.onFulfilled = g, this.callFulfilled = this.otherCallFulfilled), typeof A == "function" && (this.onRejected = A, this.callRejected = this.otherCallRejected);
        }
        function b(y, g, A) {
          c(function() {
            var C;
            try {
              C = g(A);
            } catch (S) {
              return h.reject(y, S);
            }
            C === y ? h.reject(y, new TypeError("Cannot resolve promise with itself")) : h.resolve(y, C);
          });
        }
        function x(y) {
          var g = y && y.then;
          if (y && (typeof y == "object" || typeof y == "function") && typeof g == "function") return function() {
            g.apply(y, arguments);
          };
        }
        function v(y, g) {
          var A = false;
          function C(N) {
            A || (A = true, h.reject(y, N));
          }
          function S(N) {
            A || (A = true, h.resolve(y, N));
          }
          var R = w(function() {
            g(S, C);
          });
          R.status === "error" && C(R.value);
        }
        function w(y, g) {
          var A = {};
          try {
            A.value = y(g), A.status = "success";
          } catch (C) {
            A.status = "error", A.value = C;
          }
          return A;
        }
        (l.exports = m).prototype.finally = function(y) {
          if (typeof y != "function") return this;
          var g = this.constructor;
          return this.then(function(A) {
            return g.resolve(y()).then(function() {
              return A;
            });
          }, function(A) {
            return g.resolve(y()).then(function() {
              throw A;
            });
          });
        }, m.prototype.catch = function(y) {
          return this.then(null, y);
        }, m.prototype.then = function(y, g) {
          if (typeof y != "function" && this.state === n || typeof g != "function" && this.state === f) return this;
          var A = new this.constructor(s);
          return this.state !== p ? b(A, this.state === n ? y : g, this.outcome) : this.queue.push(new d(A, y, g)), A;
        }, d.prototype.callFulfilled = function(y) {
          h.resolve(this.promise, y);
        }, d.prototype.otherCallFulfilled = function(y) {
          b(this.promise, this.onFulfilled, y);
        }, d.prototype.callRejected = function(y) {
          h.reject(this.promise, y);
        }, d.prototype.otherCallRejected = function(y) {
          b(this.promise, this.onRejected, y);
        }, h.resolve = function(y, g) {
          var A = w(x, g);
          if (A.status === "error") return h.reject(y, A.value);
          var C = A.value;
          if (C) v(y, C);
          else {
            y.state = n, y.outcome = g;
            for (var S = -1, R = y.queue.length; ++S < R; ) y.queue[S].callFulfilled(g);
          }
          return y;
        }, h.reject = function(y, g) {
          y.state = f, y.outcome = g;
          for (var A = -1, C = y.queue.length; ++A < C; ) y.queue[A].callRejected(g);
          return y;
        }, m.resolve = function(y) {
          return y instanceof this ? y : h.resolve(new this(s), y);
        }, m.reject = function(y) {
          var g = new this(s);
          return h.reject(g, y);
        }, m.all = function(y) {
          var g = this;
          if (Object.prototype.toString.call(y) !== "[object Array]") return this.reject(new TypeError("must be an array"));
          var A = y.length, C = false;
          if (!A) return this.resolve([]);
          for (var S = new Array(A), R = 0, N = -1, E = new this(s); ++N < A; ) D(y[N], N);
          return E;
          function D(O, L) {
            g.resolve(O).then(function(P) {
              S[L] = P, ++R !== A || C || (C = true, h.resolve(E, S));
            }, function(P) {
              C || (C = true, h.reject(E, P));
            });
          }
        }, m.race = function(y) {
          var g = this;
          if (Object.prototype.toString.call(y) !== "[object Array]") return this.reject(new TypeError("must be an array"));
          var A = y.length, C = false;
          if (!A) return this.resolve([]);
          for (var S = -1, R = new this(s); ++S < A; ) N = y[S], g.resolve(N).then(function(E) {
            C || (C = true, h.resolve(R, E));
          }, function(E) {
            C || (C = true, h.reject(R, E));
          });
          var N;
          return R;
        };
      }, { immediate: 36 }], 38: [function(r, l, i) {
        var c = {};
        (0, r("./lib/utils/common").assign)(c, r("./lib/deflate"), r("./lib/inflate"), r("./lib/zlib/constants")), l.exports = c;
      }, { "./lib/deflate": 39, "./lib/inflate": 40, "./lib/utils/common": 41, "./lib/zlib/constants": 44 }], 39: [function(r, l, i) {
        var c = r("./zlib/deflate"), s = r("./utils/common"), h = r("./utils/strings"), f = r("./zlib/messages"), n = r("./zlib/zstream"), p = Object.prototype.toString, m = 0, d = -1, b = 0, x = 8;
        function v(y) {
          if (!(this instanceof v)) return new v(y);
          this.options = s.assign({ level: d, method: x, chunkSize: 16384, windowBits: 15, memLevel: 8, strategy: b, to: "" }, y || {});
          var g = this.options;
          g.raw && 0 < g.windowBits ? g.windowBits = -g.windowBits : g.gzip && 0 < g.windowBits && g.windowBits < 16 && (g.windowBits += 16), this.err = 0, this.msg = "", this.ended = false, this.chunks = [], this.strm = new n(), this.strm.avail_out = 0;
          var A = c.deflateInit2(this.strm, g.level, g.method, g.windowBits, g.memLevel, g.strategy);
          if (A !== m) throw new Error(f[A]);
          if (g.header && c.deflateSetHeader(this.strm, g.header), g.dictionary) {
            var C;
            if (C = typeof g.dictionary == "string" ? h.string2buf(g.dictionary) : p.call(g.dictionary) === "[object ArrayBuffer]" ? new Uint8Array(g.dictionary) : g.dictionary, (A = c.deflateSetDictionary(this.strm, C)) !== m) throw new Error(f[A]);
            this._dict_set = true;
          }
        }
        function w(y, g) {
          var A = new v(g);
          if (A.push(y, true), A.err) throw A.msg || f[A.err];
          return A.result;
        }
        v.prototype.push = function(y, g) {
          var A, C, S = this.strm, R = this.options.chunkSize;
          if (this.ended) return false;
          C = g === ~~g ? g : g === true ? 4 : 0, typeof y == "string" ? S.input = h.string2buf(y) : p.call(y) === "[object ArrayBuffer]" ? S.input = new Uint8Array(y) : S.input = y, S.next_in = 0, S.avail_in = S.input.length;
          do {
            if (S.avail_out === 0 && (S.output = new s.Buf8(R), S.next_out = 0, S.avail_out = R), (A = c.deflate(S, C)) !== 1 && A !== m) return this.onEnd(A), !(this.ended = true);
            S.avail_out !== 0 && (S.avail_in !== 0 || C !== 4 && C !== 2) || (this.options.to === "string" ? this.onData(h.buf2binstring(s.shrinkBuf(S.output, S.next_out))) : this.onData(s.shrinkBuf(S.output, S.next_out)));
          } while ((0 < S.avail_in || S.avail_out === 0) && A !== 1);
          return C === 4 ? (A = c.deflateEnd(this.strm), this.onEnd(A), this.ended = true, A === m) : C !== 2 || (this.onEnd(m), !(S.avail_out = 0));
        }, v.prototype.onData = function(y) {
          this.chunks.push(y);
        }, v.prototype.onEnd = function(y) {
          y === m && (this.options.to === "string" ? this.result = this.chunks.join("") : this.result = s.flattenChunks(this.chunks)), this.chunks = [], this.err = y, this.msg = this.strm.msg;
        }, i.Deflate = v, i.deflate = w, i.deflateRaw = function(y, g) {
          return (g = g || {}).raw = true, w(y, g);
        }, i.gzip = function(y, g) {
          return (g = g || {}).gzip = true, w(y, g);
        };
      }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/deflate": 46, "./zlib/messages": 51, "./zlib/zstream": 53 }], 40: [function(r, l, i) {
        var c = r("./zlib/inflate"), s = r("./utils/common"), h = r("./utils/strings"), f = r("./zlib/constants"), n = r("./zlib/messages"), p = r("./zlib/zstream"), m = r("./zlib/gzheader"), d = Object.prototype.toString;
        function b(v) {
          if (!(this instanceof b)) return new b(v);
          this.options = s.assign({ chunkSize: 16384, windowBits: 0, to: "" }, v || {});
          var w = this.options;
          w.raw && 0 <= w.windowBits && w.windowBits < 16 && (w.windowBits = -w.windowBits, w.windowBits === 0 && (w.windowBits = -15)), !(0 <= w.windowBits && w.windowBits < 16) || v && v.windowBits || (w.windowBits += 32), 15 < w.windowBits && w.windowBits < 48 && (15 & w.windowBits) == 0 && (w.windowBits |= 15), this.err = 0, this.msg = "", this.ended = false, this.chunks = [], this.strm = new p(), this.strm.avail_out = 0;
          var y = c.inflateInit2(this.strm, w.windowBits);
          if (y !== f.Z_OK) throw new Error(n[y]);
          this.header = new m(), c.inflateGetHeader(this.strm, this.header);
        }
        function x(v, w) {
          var y = new b(w);
          if (y.push(v, true), y.err) throw y.msg || n[y.err];
          return y.result;
        }
        b.prototype.push = function(v, w) {
          var y, g, A, C, S, R, N = this.strm, E = this.options.chunkSize, D = this.options.dictionary, O = false;
          if (this.ended) return false;
          g = w === ~~w ? w : w === true ? f.Z_FINISH : f.Z_NO_FLUSH, typeof v == "string" ? N.input = h.binstring2buf(v) : d.call(v) === "[object ArrayBuffer]" ? N.input = new Uint8Array(v) : N.input = v, N.next_in = 0, N.avail_in = N.input.length;
          do {
            if (N.avail_out === 0 && (N.output = new s.Buf8(E), N.next_out = 0, N.avail_out = E), (y = c.inflate(N, f.Z_NO_FLUSH)) === f.Z_NEED_DICT && D && (R = typeof D == "string" ? h.string2buf(D) : d.call(D) === "[object ArrayBuffer]" ? new Uint8Array(D) : D, y = c.inflateSetDictionary(this.strm, R)), y === f.Z_BUF_ERROR && O === true && (y = f.Z_OK, O = false), y !== f.Z_STREAM_END && y !== f.Z_OK) return this.onEnd(y), !(this.ended = true);
            N.next_out && (N.avail_out !== 0 && y !== f.Z_STREAM_END && (N.avail_in !== 0 || g !== f.Z_FINISH && g !== f.Z_SYNC_FLUSH) || (this.options.to === "string" ? (A = h.utf8border(N.output, N.next_out), C = N.next_out - A, S = h.buf2string(N.output, A), N.next_out = C, N.avail_out = E - C, C && s.arraySet(N.output, N.output, A, C, 0), this.onData(S)) : this.onData(s.shrinkBuf(N.output, N.next_out)))), N.avail_in === 0 && N.avail_out === 0 && (O = true);
          } while ((0 < N.avail_in || N.avail_out === 0) && y !== f.Z_STREAM_END);
          return y === f.Z_STREAM_END && (g = f.Z_FINISH), g === f.Z_FINISH ? (y = c.inflateEnd(this.strm), this.onEnd(y), this.ended = true, y === f.Z_OK) : g !== f.Z_SYNC_FLUSH || (this.onEnd(f.Z_OK), !(N.avail_out = 0));
        }, b.prototype.onData = function(v) {
          this.chunks.push(v);
        }, b.prototype.onEnd = function(v) {
          v === f.Z_OK && (this.options.to === "string" ? this.result = this.chunks.join("") : this.result = s.flattenChunks(this.chunks)), this.chunks = [], this.err = v, this.msg = this.strm.msg;
        }, i.Inflate = b, i.inflate = x, i.inflateRaw = function(v, w) {
          return (w = w || {}).raw = true, x(v, w);
        }, i.ungzip = x;
      }, { "./utils/common": 41, "./utils/strings": 42, "./zlib/constants": 44, "./zlib/gzheader": 47, "./zlib/inflate": 49, "./zlib/messages": 51, "./zlib/zstream": 53 }], 41: [function(r, l, i) {
        var c = typeof Uint8Array < "u" && typeof Uint16Array < "u" && typeof Int32Array < "u";
        i.assign = function(f) {
          for (var n = Array.prototype.slice.call(arguments, 1); n.length; ) {
            var p = n.shift();
            if (p) {
              if (typeof p != "object") throw new TypeError(p + "must be non-object");
              for (var m in p) p.hasOwnProperty(m) && (f[m] = p[m]);
            }
          }
          return f;
        }, i.shrinkBuf = function(f, n) {
          return f.length === n ? f : f.subarray ? f.subarray(0, n) : (f.length = n, f);
        };
        var s = { arraySet: function(f, n, p, m, d) {
          if (n.subarray && f.subarray) f.set(n.subarray(p, p + m), d);
          else for (var b = 0; b < m; b++) f[d + b] = n[p + b];
        }, flattenChunks: function(f) {
          var n, p, m, d, b, x;
          for (n = m = 0, p = f.length; n < p; n++) m += f[n].length;
          for (x = new Uint8Array(m), n = d = 0, p = f.length; n < p; n++) b = f[n], x.set(b, d), d += b.length;
          return x;
        } }, h = { arraySet: function(f, n, p, m, d) {
          for (var b = 0; b < m; b++) f[d + b] = n[p + b];
        }, flattenChunks: function(f) {
          return [].concat.apply([], f);
        } };
        i.setTyped = function(f) {
          f ? (i.Buf8 = Uint8Array, i.Buf16 = Uint16Array, i.Buf32 = Int32Array, i.assign(i, s)) : (i.Buf8 = Array, i.Buf16 = Array, i.Buf32 = Array, i.assign(i, h));
        }, i.setTyped(c);
      }, {}], 42: [function(r, l, i) {
        var c = r("./common"), s = true, h = true;
        try {
          String.fromCharCode.apply(null, [0]);
        } catch {
          s = false;
        }
        try {
          String.fromCharCode.apply(null, new Uint8Array(1));
        } catch {
          h = false;
        }
        for (var f = new c.Buf8(256), n = 0; n < 256; n++) f[n] = 252 <= n ? 6 : 248 <= n ? 5 : 240 <= n ? 4 : 224 <= n ? 3 : 192 <= n ? 2 : 1;
        function p(m, d) {
          if (d < 65537 && (m.subarray && h || !m.subarray && s)) return String.fromCharCode.apply(null, c.shrinkBuf(m, d));
          for (var b = "", x = 0; x < d; x++) b += String.fromCharCode(m[x]);
          return b;
        }
        f[254] = f[254] = 1, i.string2buf = function(m) {
          var d, b, x, v, w, y = m.length, g = 0;
          for (v = 0; v < y; v++) (64512 & (b = m.charCodeAt(v))) == 55296 && v + 1 < y && (64512 & (x = m.charCodeAt(v + 1))) == 56320 && (b = 65536 + (b - 55296 << 10) + (x - 56320), v++), g += b < 128 ? 1 : b < 2048 ? 2 : b < 65536 ? 3 : 4;
          for (d = new c.Buf8(g), v = w = 0; w < g; v++) (64512 & (b = m.charCodeAt(v))) == 55296 && v + 1 < y && (64512 & (x = m.charCodeAt(v + 1))) == 56320 && (b = 65536 + (b - 55296 << 10) + (x - 56320), v++), b < 128 ? d[w++] = b : (b < 2048 ? d[w++] = 192 | b >>> 6 : (b < 65536 ? d[w++] = 224 | b >>> 12 : (d[w++] = 240 | b >>> 18, d[w++] = 128 | b >>> 12 & 63), d[w++] = 128 | b >>> 6 & 63), d[w++] = 128 | 63 & b);
          return d;
        }, i.buf2binstring = function(m) {
          return p(m, m.length);
        }, i.binstring2buf = function(m) {
          for (var d = new c.Buf8(m.length), b = 0, x = d.length; b < x; b++) d[b] = m.charCodeAt(b);
          return d;
        }, i.buf2string = function(m, d) {
          var b, x, v, w, y = d || m.length, g = new Array(2 * y);
          for (b = x = 0; b < y; ) if ((v = m[b++]) < 128) g[x++] = v;
          else if (4 < (w = f[v])) g[x++] = 65533, b += w - 1;
          else {
            for (v &= w === 2 ? 31 : w === 3 ? 15 : 7; 1 < w && b < y; ) v = v << 6 | 63 & m[b++], w--;
            1 < w ? g[x++] = 65533 : v < 65536 ? g[x++] = v : (v -= 65536, g[x++] = 55296 | v >> 10 & 1023, g[x++] = 56320 | 1023 & v);
          }
          return p(g, x);
        }, i.utf8border = function(m, d) {
          var b;
          for ((d = d || m.length) > m.length && (d = m.length), b = d - 1; 0 <= b && (192 & m[b]) == 128; ) b--;
          return b < 0 || b === 0 ? d : b + f[m[b]] > d ? b : d;
        };
      }, { "./common": 41 }], 43: [function(r, l, i) {
        l.exports = function(c, s, h, f) {
          for (var n = 65535 & c | 0, p = c >>> 16 & 65535 | 0, m = 0; h !== 0; ) {
            for (h -= m = 2e3 < h ? 2e3 : h; p = p + (n = n + s[f++] | 0) | 0, --m; ) ;
            n %= 65521, p %= 65521;
          }
          return n | p << 16 | 0;
        };
      }, {}], 44: [function(r, l, i) {
        l.exports = { Z_NO_FLUSH: 0, Z_PARTIAL_FLUSH: 1, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4, Z_BLOCK: 5, Z_TREES: 6, Z_OK: 0, Z_STREAM_END: 1, Z_NEED_DICT: 2, Z_ERRNO: -1, Z_STREAM_ERROR: -2, Z_DATA_ERROR: -3, Z_BUF_ERROR: -5, Z_NO_COMPRESSION: 0, Z_BEST_SPEED: 1, Z_BEST_COMPRESSION: 9, Z_DEFAULT_COMPRESSION: -1, Z_FILTERED: 1, Z_HUFFMAN_ONLY: 2, Z_RLE: 3, Z_FIXED: 4, Z_DEFAULT_STRATEGY: 0, Z_BINARY: 0, Z_TEXT: 1, Z_UNKNOWN: 2, Z_DEFLATED: 8 };
      }, {}], 45: [function(r, l, i) {
        var c = function() {
          for (var s, h = [], f = 0; f < 256; f++) {
            s = f;
            for (var n = 0; n < 8; n++) s = 1 & s ? 3988292384 ^ s >>> 1 : s >>> 1;
            h[f] = s;
          }
          return h;
        }();
        l.exports = function(s, h, f, n) {
          var p = c, m = n + f;
          s ^= -1;
          for (var d = n; d < m; d++) s = s >>> 8 ^ p[255 & (s ^ h[d])];
          return -1 ^ s;
        };
      }, {}], 46: [function(r, l, i) {
        var c, s = r("../utils/common"), h = r("./trees"), f = r("./adler32"), n = r("./crc32"), p = r("./messages"), m = 0, d = 4, b = 0, x = -2, v = -1, w = 4, y = 2, g = 8, A = 9, C = 286, S = 30, R = 19, N = 2 * C + 1, E = 15, D = 3, O = 258, L = O + D + 1, P = 42, B = 113, M = 1, U = 2, _ = 3, F = 4;
        function T(Y, re) {
          return Y.msg = p[re], re;
        }
        function k(Y) {
          return (Y << 1) - (4 < Y ? 9 : 0);
        }
        function z(Y) {
          for (var re = Y.length; 0 <= --re; ) Y[re] = 0;
        }
        function V(Y) {
          var re = Y.state, se = re.pending;
          se > Y.avail_out && (se = Y.avail_out), se !== 0 && (s.arraySet(Y.output, re.pending_buf, re.pending_out, se, Y.next_out), Y.next_out += se, re.pending_out += se, Y.total_out += se, Y.avail_out -= se, re.pending -= se, re.pending === 0 && (re.pending_out = 0));
        }
        function G(Y, re) {
          h._tr_flush_block(Y, 0 <= Y.block_start ? Y.block_start : -1, Y.strstart - Y.block_start, re), Y.block_start = Y.strstart, V(Y.strm);
        }
        function q(Y, re) {
          Y.pending_buf[Y.pending++] = re;
        }
        function j(Y, re) {
          Y.pending_buf[Y.pending++] = re >>> 8 & 255, Y.pending_buf[Y.pending++] = 255 & re;
        }
        function H(Y, re) {
          var se, ne, pe = Y.max_chain_length, ge = Y.strstart, me = Y.prev_length, Te = Y.nice_match, _e = Y.strstart > Y.w_size - L ? Y.strstart - (Y.w_size - L) : 0, qe = Y.window, ve = Y.w_mask, oe = Y.prev, he = Y.strstart + O, ie = qe[ge + me - 1], ue = qe[ge + me];
          Y.prev_length >= Y.good_match && (pe >>= 2), Te > Y.lookahead && (Te = Y.lookahead);
          do
            if (qe[(se = re) + me] === ue && qe[se + me - 1] === ie && qe[se] === qe[ge] && qe[++se] === qe[ge + 1]) {
              ge += 2, se++;
              do
                ;
              while (qe[++ge] === qe[++se] && qe[++ge] === qe[++se] && qe[++ge] === qe[++se] && qe[++ge] === qe[++se] && qe[++ge] === qe[++se] && qe[++ge] === qe[++se] && qe[++ge] === qe[++se] && qe[++ge] === qe[++se] && ge < he);
              if (ne = O - (he - ge), ge = he - O, me < ne) {
                if (Y.match_start = re, Te <= (me = ne)) break;
                ie = qe[ge + me - 1], ue = qe[ge + me];
              }
            }
          while ((re = oe[re & ve]) > _e && --pe != 0);
          return me <= Y.lookahead ? me : Y.lookahead;
        }
        function X(Y) {
          var re, se, ne, pe, ge, me, Te, _e, qe, ve, oe = Y.w_size;
          do {
            if (pe = Y.window_size - Y.lookahead - Y.strstart, Y.strstart >= oe + (oe - L)) {
              for (s.arraySet(Y.window, Y.window, oe, oe, 0), Y.match_start -= oe, Y.strstart -= oe, Y.block_start -= oe, re = se = Y.hash_size; ne = Y.head[--re], Y.head[re] = oe <= ne ? ne - oe : 0, --se; ) ;
              for (re = se = oe; ne = Y.prev[--re], Y.prev[re] = oe <= ne ? ne - oe : 0, --se; ) ;
              pe += oe;
            }
            if (Y.strm.avail_in === 0) break;
            if (me = Y.strm, Te = Y.window, _e = Y.strstart + Y.lookahead, qe = pe, ve = void 0, ve = me.avail_in, qe < ve && (ve = qe), se = ve === 0 ? 0 : (me.avail_in -= ve, s.arraySet(Te, me.input, me.next_in, ve, _e), me.state.wrap === 1 ? me.adler = f(me.adler, Te, ve, _e) : me.state.wrap === 2 && (me.adler = n(me.adler, Te, ve, _e)), me.next_in += ve, me.total_in += ve, ve), Y.lookahead += se, Y.lookahead + Y.insert >= D) for (ge = Y.strstart - Y.insert, Y.ins_h = Y.window[ge], Y.ins_h = (Y.ins_h << Y.hash_shift ^ Y.window[ge + 1]) & Y.hash_mask; Y.insert && (Y.ins_h = (Y.ins_h << Y.hash_shift ^ Y.window[ge + D - 1]) & Y.hash_mask, Y.prev[ge & Y.w_mask] = Y.head[Y.ins_h], Y.head[Y.ins_h] = ge, ge++, Y.insert--, !(Y.lookahead + Y.insert < D)); ) ;
          } while (Y.lookahead < L && Y.strm.avail_in !== 0);
        }
        function Q(Y, re) {
          for (var se, ne; ; ) {
            if (Y.lookahead < L) {
              if (X(Y), Y.lookahead < L && re === m) return M;
              if (Y.lookahead === 0) break;
            }
            if (se = 0, Y.lookahead >= D && (Y.ins_h = (Y.ins_h << Y.hash_shift ^ Y.window[Y.strstart + D - 1]) & Y.hash_mask, se = Y.prev[Y.strstart & Y.w_mask] = Y.head[Y.ins_h], Y.head[Y.ins_h] = Y.strstart), se !== 0 && Y.strstart - se <= Y.w_size - L && (Y.match_length = H(Y, se)), Y.match_length >= D) if (ne = h._tr_tally(Y, Y.strstart - Y.match_start, Y.match_length - D), Y.lookahead -= Y.match_length, Y.match_length <= Y.max_lazy_match && Y.lookahead >= D) {
              for (Y.match_length--; Y.strstart++, Y.ins_h = (Y.ins_h << Y.hash_shift ^ Y.window[Y.strstart + D - 1]) & Y.hash_mask, se = Y.prev[Y.strstart & Y.w_mask] = Y.head[Y.ins_h], Y.head[Y.ins_h] = Y.strstart, --Y.match_length != 0; ) ;
              Y.strstart++;
            } else Y.strstart += Y.match_length, Y.match_length = 0, Y.ins_h = Y.window[Y.strstart], Y.ins_h = (Y.ins_h << Y.hash_shift ^ Y.window[Y.strstart + 1]) & Y.hash_mask;
            else ne = h._tr_tally(Y, 0, Y.window[Y.strstart]), Y.lookahead--, Y.strstart++;
            if (ne && (G(Y, false), Y.strm.avail_out === 0)) return M;
          }
          return Y.insert = Y.strstart < D - 1 ? Y.strstart : D - 1, re === d ? (G(Y, true), Y.strm.avail_out === 0 ? _ : F) : Y.last_lit && (G(Y, false), Y.strm.avail_out === 0) ? M : U;
        }
        function ee(Y, re) {
          for (var se, ne, pe; ; ) {
            if (Y.lookahead < L) {
              if (X(Y), Y.lookahead < L && re === m) return M;
              if (Y.lookahead === 0) break;
            }
            if (se = 0, Y.lookahead >= D && (Y.ins_h = (Y.ins_h << Y.hash_shift ^ Y.window[Y.strstart + D - 1]) & Y.hash_mask, se = Y.prev[Y.strstart & Y.w_mask] = Y.head[Y.ins_h], Y.head[Y.ins_h] = Y.strstart), Y.prev_length = Y.match_length, Y.prev_match = Y.match_start, Y.match_length = D - 1, se !== 0 && Y.prev_length < Y.max_lazy_match && Y.strstart - se <= Y.w_size - L && (Y.match_length = H(Y, se), Y.match_length <= 5 && (Y.strategy === 1 || Y.match_length === D && 4096 < Y.strstart - Y.match_start) && (Y.match_length = D - 1)), Y.prev_length >= D && Y.match_length <= Y.prev_length) {
              for (pe = Y.strstart + Y.lookahead - D, ne = h._tr_tally(Y, Y.strstart - 1 - Y.prev_match, Y.prev_length - D), Y.lookahead -= Y.prev_length - 1, Y.prev_length -= 2; ++Y.strstart <= pe && (Y.ins_h = (Y.ins_h << Y.hash_shift ^ Y.window[Y.strstart + D - 1]) & Y.hash_mask, se = Y.prev[Y.strstart & Y.w_mask] = Y.head[Y.ins_h], Y.head[Y.ins_h] = Y.strstart), --Y.prev_length != 0; ) ;
              if (Y.match_available = 0, Y.match_length = D - 1, Y.strstart++, ne && (G(Y, false), Y.strm.avail_out === 0)) return M;
            } else if (Y.match_available) {
              if ((ne = h._tr_tally(Y, 0, Y.window[Y.strstart - 1])) && G(Y, false), Y.strstart++, Y.lookahead--, Y.strm.avail_out === 0) return M;
            } else Y.match_available = 1, Y.strstart++, Y.lookahead--;
          }
          return Y.match_available && (ne = h._tr_tally(Y, 0, Y.window[Y.strstart - 1]), Y.match_available = 0), Y.insert = Y.strstart < D - 1 ? Y.strstart : D - 1, re === d ? (G(Y, true), Y.strm.avail_out === 0 ? _ : F) : Y.last_lit && (G(Y, false), Y.strm.avail_out === 0) ? M : U;
        }
        function te(Y, re, se, ne, pe) {
          this.good_length = Y, this.max_lazy = re, this.nice_length = se, this.max_chain = ne, this.func = pe;
        }
        function le() {
          this.strm = null, this.status = 0, this.pending_buf = null, this.pending_buf_size = 0, this.pending_out = 0, this.pending = 0, this.wrap = 0, this.gzhead = null, this.gzindex = 0, this.method = g, this.last_flush = -1, this.w_size = 0, this.w_bits = 0, this.w_mask = 0, this.window = null, this.window_size = 0, this.prev = null, this.head = null, this.ins_h = 0, this.hash_size = 0, this.hash_bits = 0, this.hash_mask = 0, this.hash_shift = 0, this.block_start = 0, this.match_length = 0, this.prev_match = 0, this.match_available = 0, this.strstart = 0, this.match_start = 0, this.lookahead = 0, this.prev_length = 0, this.max_chain_length = 0, this.max_lazy_match = 0, this.level = 0, this.strategy = 0, this.good_match = 0, this.nice_match = 0, this.dyn_ltree = new s.Buf16(2 * N), this.dyn_dtree = new s.Buf16(2 * (2 * S + 1)), this.bl_tree = new s.Buf16(2 * (2 * R + 1)), z(this.dyn_ltree), z(this.dyn_dtree), z(this.bl_tree), this.l_desc = null, this.d_desc = null, this.bl_desc = null, this.bl_count = new s.Buf16(E + 1), this.heap = new s.Buf16(2 * C + 1), z(this.heap), this.heap_len = 0, this.heap_max = 0, this.depth = new s.Buf16(2 * C + 1), z(this.depth), this.l_buf = 0, this.lit_bufsize = 0, this.last_lit = 0, this.d_buf = 0, this.opt_len = 0, this.static_len = 0, this.matches = 0, this.insert = 0, this.bi_buf = 0, this.bi_valid = 0;
        }
        function Z(Y) {
          var re;
          return Y && Y.state ? (Y.total_in = Y.total_out = 0, Y.data_type = y, (re = Y.state).pending = 0, re.pending_out = 0, re.wrap < 0 && (re.wrap = -re.wrap), re.status = re.wrap ? P : B, Y.adler = re.wrap === 2 ? 0 : 1, re.last_flush = m, h._tr_init(re), b) : T(Y, x);
        }
        function J(Y) {
          var re = Z(Y);
          return re === b && function(se) {
            se.window_size = 2 * se.w_size, z(se.head), se.max_lazy_match = c[se.level].max_lazy, se.good_match = c[se.level].good_length, se.nice_match = c[se.level].nice_length, se.max_chain_length = c[se.level].max_chain, se.strstart = 0, se.block_start = 0, se.lookahead = 0, se.insert = 0, se.match_length = se.prev_length = D - 1, se.match_available = 0, se.ins_h = 0;
          }(Y.state), re;
        }
        function ae(Y, re, se, ne, pe, ge) {
          if (!Y) return x;
          var me = 1;
          if (re === v && (re = 6), ne < 0 ? (me = 0, ne = -ne) : 15 < ne && (me = 2, ne -= 16), pe < 1 || A < pe || se !== g || ne < 8 || 15 < ne || re < 0 || 9 < re || ge < 0 || w < ge) return T(Y, x);
          ne === 8 && (ne = 9);
          var Te = new le();
          return (Y.state = Te).strm = Y, Te.wrap = me, Te.gzhead = null, Te.w_bits = ne, Te.w_size = 1 << Te.w_bits, Te.w_mask = Te.w_size - 1, Te.hash_bits = pe + 7, Te.hash_size = 1 << Te.hash_bits, Te.hash_mask = Te.hash_size - 1, Te.hash_shift = ~~((Te.hash_bits + D - 1) / D), Te.window = new s.Buf8(2 * Te.w_size), Te.head = new s.Buf16(Te.hash_size), Te.prev = new s.Buf16(Te.w_size), Te.lit_bufsize = 1 << pe + 6, Te.pending_buf_size = 4 * Te.lit_bufsize, Te.pending_buf = new s.Buf8(Te.pending_buf_size), Te.d_buf = 1 * Te.lit_bufsize, Te.l_buf = 3 * Te.lit_bufsize, Te.level = re, Te.strategy = ge, Te.method = se, J(Y);
        }
        c = [new te(0, 0, 0, 0, function(Y, re) {
          var se = 65535;
          for (se > Y.pending_buf_size - 5 && (se = Y.pending_buf_size - 5); ; ) {
            if (Y.lookahead <= 1) {
              if (X(Y), Y.lookahead === 0 && re === m) return M;
              if (Y.lookahead === 0) break;
            }
            Y.strstart += Y.lookahead, Y.lookahead = 0;
            var ne = Y.block_start + se;
            if ((Y.strstart === 0 || Y.strstart >= ne) && (Y.lookahead = Y.strstart - ne, Y.strstart = ne, G(Y, false), Y.strm.avail_out === 0) || Y.strstart - Y.block_start >= Y.w_size - L && (G(Y, false), Y.strm.avail_out === 0)) return M;
          }
          return Y.insert = 0, re === d ? (G(Y, true), Y.strm.avail_out === 0 ? _ : F) : (Y.strstart > Y.block_start && (G(Y, false), Y.strm.avail_out), M);
        }), new te(4, 4, 8, 4, Q), new te(4, 5, 16, 8, Q), new te(4, 6, 32, 32, Q), new te(4, 4, 16, 16, ee), new te(8, 16, 32, 32, ee), new te(8, 16, 128, 128, ee), new te(8, 32, 128, 256, ee), new te(32, 128, 258, 1024, ee), new te(32, 258, 258, 4096, ee)], i.deflateInit = function(Y, re) {
          return ae(Y, re, g, 15, 8, 0);
        }, i.deflateInit2 = ae, i.deflateReset = J, i.deflateResetKeep = Z, i.deflateSetHeader = function(Y, re) {
          return Y && Y.state ? Y.state.wrap !== 2 ? x : (Y.state.gzhead = re, b) : x;
        }, i.deflate = function(Y, re) {
          var se, ne, pe, ge;
          if (!Y || !Y.state || 5 < re || re < 0) return Y ? T(Y, x) : x;
          if (ne = Y.state, !Y.output || !Y.input && Y.avail_in !== 0 || ne.status === 666 && re !== d) return T(Y, Y.avail_out === 0 ? -5 : x);
          if (ne.strm = Y, se = ne.last_flush, ne.last_flush = re, ne.status === P) if (ne.wrap === 2) Y.adler = 0, q(ne, 31), q(ne, 139), q(ne, 8), ne.gzhead ? (q(ne, (ne.gzhead.text ? 1 : 0) + (ne.gzhead.hcrc ? 2 : 0) + (ne.gzhead.extra ? 4 : 0) + (ne.gzhead.name ? 8 : 0) + (ne.gzhead.comment ? 16 : 0)), q(ne, 255 & ne.gzhead.time), q(ne, ne.gzhead.time >> 8 & 255), q(ne, ne.gzhead.time >> 16 & 255), q(ne, ne.gzhead.time >> 24 & 255), q(ne, ne.level === 9 ? 2 : 2 <= ne.strategy || ne.level < 2 ? 4 : 0), q(ne, 255 & ne.gzhead.os), ne.gzhead.extra && ne.gzhead.extra.length && (q(ne, 255 & ne.gzhead.extra.length), q(ne, ne.gzhead.extra.length >> 8 & 255)), ne.gzhead.hcrc && (Y.adler = n(Y.adler, ne.pending_buf, ne.pending, 0)), ne.gzindex = 0, ne.status = 69) : (q(ne, 0), q(ne, 0), q(ne, 0), q(ne, 0), q(ne, 0), q(ne, ne.level === 9 ? 2 : 2 <= ne.strategy || ne.level < 2 ? 4 : 0), q(ne, 3), ne.status = B);
          else {
            var me = g + (ne.w_bits - 8 << 4) << 8;
            me |= (2 <= ne.strategy || ne.level < 2 ? 0 : ne.level < 6 ? 1 : ne.level === 6 ? 2 : 3) << 6, ne.strstart !== 0 && (me |= 32), me += 31 - me % 31, ne.status = B, j(ne, me), ne.strstart !== 0 && (j(ne, Y.adler >>> 16), j(ne, 65535 & Y.adler)), Y.adler = 1;
          }
          if (ne.status === 69) if (ne.gzhead.extra) {
            for (pe = ne.pending; ne.gzindex < (65535 & ne.gzhead.extra.length) && (ne.pending !== ne.pending_buf_size || (ne.gzhead.hcrc && ne.pending > pe && (Y.adler = n(Y.adler, ne.pending_buf, ne.pending - pe, pe)), V(Y), pe = ne.pending, ne.pending !== ne.pending_buf_size)); ) q(ne, 255 & ne.gzhead.extra[ne.gzindex]), ne.gzindex++;
            ne.gzhead.hcrc && ne.pending > pe && (Y.adler = n(Y.adler, ne.pending_buf, ne.pending - pe, pe)), ne.gzindex === ne.gzhead.extra.length && (ne.gzindex = 0, ne.status = 73);
          } else ne.status = 73;
          if (ne.status === 73) if (ne.gzhead.name) {
            pe = ne.pending;
            do {
              if (ne.pending === ne.pending_buf_size && (ne.gzhead.hcrc && ne.pending > pe && (Y.adler = n(Y.adler, ne.pending_buf, ne.pending - pe, pe)), V(Y), pe = ne.pending, ne.pending === ne.pending_buf_size)) {
                ge = 1;
                break;
              }
              ge = ne.gzindex < ne.gzhead.name.length ? 255 & ne.gzhead.name.charCodeAt(ne.gzindex++) : 0, q(ne, ge);
            } while (ge !== 0);
            ne.gzhead.hcrc && ne.pending > pe && (Y.adler = n(Y.adler, ne.pending_buf, ne.pending - pe, pe)), ge === 0 && (ne.gzindex = 0, ne.status = 91);
          } else ne.status = 91;
          if (ne.status === 91) if (ne.gzhead.comment) {
            pe = ne.pending;
            do {
              if (ne.pending === ne.pending_buf_size && (ne.gzhead.hcrc && ne.pending > pe && (Y.adler = n(Y.adler, ne.pending_buf, ne.pending - pe, pe)), V(Y), pe = ne.pending, ne.pending === ne.pending_buf_size)) {
                ge = 1;
                break;
              }
              ge = ne.gzindex < ne.gzhead.comment.length ? 255 & ne.gzhead.comment.charCodeAt(ne.gzindex++) : 0, q(ne, ge);
            } while (ge !== 0);
            ne.gzhead.hcrc && ne.pending > pe && (Y.adler = n(Y.adler, ne.pending_buf, ne.pending - pe, pe)), ge === 0 && (ne.status = 103);
          } else ne.status = 103;
          if (ne.status === 103 && (ne.gzhead.hcrc ? (ne.pending + 2 > ne.pending_buf_size && V(Y), ne.pending + 2 <= ne.pending_buf_size && (q(ne, 255 & Y.adler), q(ne, Y.adler >> 8 & 255), Y.adler = 0, ne.status = B)) : ne.status = B), ne.pending !== 0) {
            if (V(Y), Y.avail_out === 0) return ne.last_flush = -1, b;
          } else if (Y.avail_in === 0 && k(re) <= k(se) && re !== d) return T(Y, -5);
          if (ne.status === 666 && Y.avail_in !== 0) return T(Y, -5);
          if (Y.avail_in !== 0 || ne.lookahead !== 0 || re !== m && ne.status !== 666) {
            var Te = ne.strategy === 2 ? function(_e, qe) {
              for (var ve; ; ) {
                if (_e.lookahead === 0 && (X(_e), _e.lookahead === 0)) {
                  if (qe === m) return M;
                  break;
                }
                if (_e.match_length = 0, ve = h._tr_tally(_e, 0, _e.window[_e.strstart]), _e.lookahead--, _e.strstart++, ve && (G(_e, false), _e.strm.avail_out === 0)) return M;
              }
              return _e.insert = 0, qe === d ? (G(_e, true), _e.strm.avail_out === 0 ? _ : F) : _e.last_lit && (G(_e, false), _e.strm.avail_out === 0) ? M : U;
            }(ne, re) : ne.strategy === 3 ? function(_e, qe) {
              for (var ve, oe, he, ie, ue = _e.window; ; ) {
                if (_e.lookahead <= O) {
                  if (X(_e), _e.lookahead <= O && qe === m) return M;
                  if (_e.lookahead === 0) break;
                }
                if (_e.match_length = 0, _e.lookahead >= D && 0 < _e.strstart && (oe = ue[he = _e.strstart - 1]) === ue[++he] && oe === ue[++he] && oe === ue[++he]) {
                  ie = _e.strstart + O;
                  do
                    ;
                  while (oe === ue[++he] && oe === ue[++he] && oe === ue[++he] && oe === ue[++he] && oe === ue[++he] && oe === ue[++he] && oe === ue[++he] && oe === ue[++he] && he < ie);
                  _e.match_length = O - (ie - he), _e.match_length > _e.lookahead && (_e.match_length = _e.lookahead);
                }
                if (_e.match_length >= D ? (ve = h._tr_tally(_e, 1, _e.match_length - D), _e.lookahead -= _e.match_length, _e.strstart += _e.match_length, _e.match_length = 0) : (ve = h._tr_tally(_e, 0, _e.window[_e.strstart]), _e.lookahead--, _e.strstart++), ve && (G(_e, false), _e.strm.avail_out === 0)) return M;
              }
              return _e.insert = 0, qe === d ? (G(_e, true), _e.strm.avail_out === 0 ? _ : F) : _e.last_lit && (G(_e, false), _e.strm.avail_out === 0) ? M : U;
            }(ne, re) : c[ne.level].func(ne, re);
            if (Te !== _ && Te !== F || (ne.status = 666), Te === M || Te === _) return Y.avail_out === 0 && (ne.last_flush = -1), b;
            if (Te === U && (re === 1 ? h._tr_align(ne) : re !== 5 && (h._tr_stored_block(ne, 0, 0, false), re === 3 && (z(ne.head), ne.lookahead === 0 && (ne.strstart = 0, ne.block_start = 0, ne.insert = 0))), V(Y), Y.avail_out === 0)) return ne.last_flush = -1, b;
          }
          return re !== d ? b : ne.wrap <= 0 ? 1 : (ne.wrap === 2 ? (q(ne, 255 & Y.adler), q(ne, Y.adler >> 8 & 255), q(ne, Y.adler >> 16 & 255), q(ne, Y.adler >> 24 & 255), q(ne, 255 & Y.total_in), q(ne, Y.total_in >> 8 & 255), q(ne, Y.total_in >> 16 & 255), q(ne, Y.total_in >> 24 & 255)) : (j(ne, Y.adler >>> 16), j(ne, 65535 & Y.adler)), V(Y), 0 < ne.wrap && (ne.wrap = -ne.wrap), ne.pending !== 0 ? b : 1);
        }, i.deflateEnd = function(Y) {
          var re;
          return Y && Y.state ? (re = Y.state.status) !== P && re !== 69 && re !== 73 && re !== 91 && re !== 103 && re !== B && re !== 666 ? T(Y, x) : (Y.state = null, re === B ? T(Y, -3) : b) : x;
        }, i.deflateSetDictionary = function(Y, re) {
          var se, ne, pe, ge, me, Te, _e, qe, ve = re.length;
          if (!Y || !Y.state || (ge = (se = Y.state).wrap) === 2 || ge === 1 && se.status !== P || se.lookahead) return x;
          for (ge === 1 && (Y.adler = f(Y.adler, re, ve, 0)), se.wrap = 0, ve >= se.w_size && (ge === 0 && (z(se.head), se.strstart = 0, se.block_start = 0, se.insert = 0), qe = new s.Buf8(se.w_size), s.arraySet(qe, re, ve - se.w_size, se.w_size, 0), re = qe, ve = se.w_size), me = Y.avail_in, Te = Y.next_in, _e = Y.input, Y.avail_in = ve, Y.next_in = 0, Y.input = re, X(se); se.lookahead >= D; ) {
            for (ne = se.strstart, pe = se.lookahead - (D - 1); se.ins_h = (se.ins_h << se.hash_shift ^ se.window[ne + D - 1]) & se.hash_mask, se.prev[ne & se.w_mask] = se.head[se.ins_h], se.head[se.ins_h] = ne, ne++, --pe; ) ;
            se.strstart = ne, se.lookahead = D - 1, X(se);
          }
          return se.strstart += se.lookahead, se.block_start = se.strstart, se.insert = se.lookahead, se.lookahead = 0, se.match_length = se.prev_length = D - 1, se.match_available = 0, Y.next_in = Te, Y.input = _e, Y.avail_in = me, se.wrap = ge, b;
        }, i.deflateInfo = "pako deflate (from Nodeca project)";
      }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./messages": 51, "./trees": 52 }], 47: [function(r, l, i) {
        l.exports = function() {
          this.text = 0, this.time = 0, this.xflags = 0, this.os = 0, this.extra = null, this.extra_len = 0, this.name = "", this.comment = "", this.hcrc = 0, this.done = false;
        };
      }, {}], 48: [function(r, l, i) {
        l.exports = function(c, s) {
          var h, f, n, p, m, d, b, x, v, w, y, g, A, C, S, R, N, E, D, O, L, P, B, M, U;
          h = c.state, f = c.next_in, M = c.input, n = f + (c.avail_in - 5), p = c.next_out, U = c.output, m = p - (s - c.avail_out), d = p + (c.avail_out - 257), b = h.dmax, x = h.wsize, v = h.whave, w = h.wnext, y = h.window, g = h.hold, A = h.bits, C = h.lencode, S = h.distcode, R = (1 << h.lenbits) - 1, N = (1 << h.distbits) - 1;
          e: do {
            A < 15 && (g += M[f++] << A, A += 8, g += M[f++] << A, A += 8), E = C[g & R];
            t: for (; ; ) {
              if (g >>>= D = E >>> 24, A -= D, (D = E >>> 16 & 255) === 0) U[p++] = 65535 & E;
              else {
                if (!(16 & D)) {
                  if ((64 & D) == 0) {
                    E = C[(65535 & E) + (g & (1 << D) - 1)];
                    continue t;
                  }
                  if (32 & D) {
                    h.mode = 12;
                    break e;
                  }
                  c.msg = "invalid literal/length code", h.mode = 30;
                  break e;
                }
                O = 65535 & E, (D &= 15) && (A < D && (g += M[f++] << A, A += 8), O += g & (1 << D) - 1, g >>>= D, A -= D), A < 15 && (g += M[f++] << A, A += 8, g += M[f++] << A, A += 8), E = S[g & N];
                a: for (; ; ) {
                  if (g >>>= D = E >>> 24, A -= D, !(16 & (D = E >>> 16 & 255))) {
                    if ((64 & D) == 0) {
                      E = S[(65535 & E) + (g & (1 << D) - 1)];
                      continue a;
                    }
                    c.msg = "invalid distance code", h.mode = 30;
                    break e;
                  }
                  if (L = 65535 & E, A < (D &= 15) && (g += M[f++] << A, (A += 8) < D && (g += M[f++] << A, A += 8)), b < (L += g & (1 << D) - 1)) {
                    c.msg = "invalid distance too far back", h.mode = 30;
                    break e;
                  }
                  if (g >>>= D, A -= D, (D = p - m) < L) {
                    if (v < (D = L - D) && h.sane) {
                      c.msg = "invalid distance too far back", h.mode = 30;
                      break e;
                    }
                    if (B = y, (P = 0) === w) {
                      if (P += x - D, D < O) {
                        for (O -= D; U[p++] = y[P++], --D; ) ;
                        P = p - L, B = U;
                      }
                    } else if (w < D) {
                      if (P += x + w - D, (D -= w) < O) {
                        for (O -= D; U[p++] = y[P++], --D; ) ;
                        if (P = 0, w < O) {
                          for (O -= D = w; U[p++] = y[P++], --D; ) ;
                          P = p - L, B = U;
                        }
                      }
                    } else if (P += w - D, D < O) {
                      for (O -= D; U[p++] = y[P++], --D; ) ;
                      P = p - L, B = U;
                    }
                    for (; 2 < O; ) U[p++] = B[P++], U[p++] = B[P++], U[p++] = B[P++], O -= 3;
                    O && (U[p++] = B[P++], 1 < O && (U[p++] = B[P++]));
                  } else {
                    for (P = p - L; U[p++] = U[P++], U[p++] = U[P++], U[p++] = U[P++], 2 < (O -= 3); ) ;
                    O && (U[p++] = U[P++], 1 < O && (U[p++] = U[P++]));
                  }
                  break;
                }
              }
              break;
            }
          } while (f < n && p < d);
          f -= O = A >> 3, g &= (1 << (A -= O << 3)) - 1, c.next_in = f, c.next_out = p, c.avail_in = f < n ? n - f + 5 : 5 - (f - n), c.avail_out = p < d ? d - p + 257 : 257 - (p - d), h.hold = g, h.bits = A;
        };
      }, {}], 49: [function(r, l, i) {
        var c = r("../utils/common"), s = r("./adler32"), h = r("./crc32"), f = r("./inffast"), n = r("./inftrees"), p = 1, m = 2, d = 0, b = -2, x = 1, v = 852, w = 592;
        function y(P) {
          return (P >>> 24 & 255) + (P >>> 8 & 65280) + ((65280 & P) << 8) + ((255 & P) << 24);
        }
        function g() {
          this.mode = 0, this.last = false, this.wrap = 0, this.havedict = false, this.flags = 0, this.dmax = 0, this.check = 0, this.total = 0, this.head = null, this.wbits = 0, this.wsize = 0, this.whave = 0, this.wnext = 0, this.window = null, this.hold = 0, this.bits = 0, this.length = 0, this.offset = 0, this.extra = 0, this.lencode = null, this.distcode = null, this.lenbits = 0, this.distbits = 0, this.ncode = 0, this.nlen = 0, this.ndist = 0, this.have = 0, this.next = null, this.lens = new c.Buf16(320), this.work = new c.Buf16(288), this.lendyn = null, this.distdyn = null, this.sane = 0, this.back = 0, this.was = 0;
        }
        function A(P) {
          var B;
          return P && P.state ? (B = P.state, P.total_in = P.total_out = B.total = 0, P.msg = "", B.wrap && (P.adler = 1 & B.wrap), B.mode = x, B.last = 0, B.havedict = 0, B.dmax = 32768, B.head = null, B.hold = 0, B.bits = 0, B.lencode = B.lendyn = new c.Buf32(v), B.distcode = B.distdyn = new c.Buf32(w), B.sane = 1, B.back = -1, d) : b;
        }
        function C(P) {
          var B;
          return P && P.state ? ((B = P.state).wsize = 0, B.whave = 0, B.wnext = 0, A(P)) : b;
        }
        function S(P, B) {
          var M, U;
          return P && P.state ? (U = P.state, B < 0 ? (M = 0, B = -B) : (M = 1 + (B >> 4), B < 48 && (B &= 15)), B && (B < 8 || 15 < B) ? b : (U.window !== null && U.wbits !== B && (U.window = null), U.wrap = M, U.wbits = B, C(P))) : b;
        }
        function R(P, B) {
          var M, U;
          return P ? (U = new g(), (P.state = U).window = null, (M = S(P, B)) !== d && (P.state = null), M) : b;
        }
        var N, E, D = true;
        function O(P) {
          if (D) {
            var B;
            for (N = new c.Buf32(512), E = new c.Buf32(32), B = 0; B < 144; ) P.lens[B++] = 8;
            for (; B < 256; ) P.lens[B++] = 9;
            for (; B < 280; ) P.lens[B++] = 7;
            for (; B < 288; ) P.lens[B++] = 8;
            for (n(p, P.lens, 0, 288, N, 0, P.work, { bits: 9 }), B = 0; B < 32; ) P.lens[B++] = 5;
            n(m, P.lens, 0, 32, E, 0, P.work, { bits: 5 }), D = false;
          }
          P.lencode = N, P.lenbits = 9, P.distcode = E, P.distbits = 5;
        }
        function L(P, B, M, U) {
          var _, F = P.state;
          return F.window === null && (F.wsize = 1 << F.wbits, F.wnext = 0, F.whave = 0, F.window = new c.Buf8(F.wsize)), U >= F.wsize ? (c.arraySet(F.window, B, M - F.wsize, F.wsize, 0), F.wnext = 0, F.whave = F.wsize) : (U < (_ = F.wsize - F.wnext) && (_ = U), c.arraySet(F.window, B, M - U, _, F.wnext), (U -= _) ? (c.arraySet(F.window, B, M - U, U, 0), F.wnext = U, F.whave = F.wsize) : (F.wnext += _, F.wnext === F.wsize && (F.wnext = 0), F.whave < F.wsize && (F.whave += _))), 0;
        }
        i.inflateReset = C, i.inflateReset2 = S, i.inflateResetKeep = A, i.inflateInit = function(P) {
          return R(P, 15);
        }, i.inflateInit2 = R, i.inflate = function(P, B) {
          var M, U, _, F, T, k, z, V, G, q, j, H, X, Q, ee, te, le, Z, J, ae, Y, re, se, ne, pe = 0, ge = new c.Buf8(4), me = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
          if (!P || !P.state || !P.output || !P.input && P.avail_in !== 0) return b;
          (M = P.state).mode === 12 && (M.mode = 13), T = P.next_out, _ = P.output, z = P.avail_out, F = P.next_in, U = P.input, k = P.avail_in, V = M.hold, G = M.bits, q = k, j = z, re = d;
          e: for (; ; ) switch (M.mode) {
            case x:
              if (M.wrap === 0) {
                M.mode = 13;
                break;
              }
              for (; G < 16; ) {
                if (k === 0) break e;
                k--, V += U[F++] << G, G += 8;
              }
              if (2 & M.wrap && V === 35615) {
                ge[M.check = 0] = 255 & V, ge[1] = V >>> 8 & 255, M.check = h(M.check, ge, 2, 0), G = V = 0, M.mode = 2;
                break;
              }
              if (M.flags = 0, M.head && (M.head.done = false), !(1 & M.wrap) || (((255 & V) << 8) + (V >> 8)) % 31) {
                P.msg = "incorrect header check", M.mode = 30;
                break;
              }
              if ((15 & V) != 8) {
                P.msg = "unknown compression method", M.mode = 30;
                break;
              }
              if (G -= 4, Y = 8 + (15 & (V >>>= 4)), M.wbits === 0) M.wbits = Y;
              else if (Y > M.wbits) {
                P.msg = "invalid window size", M.mode = 30;
                break;
              }
              M.dmax = 1 << Y, P.adler = M.check = 1, M.mode = 512 & V ? 10 : 12, G = V = 0;
              break;
            case 2:
              for (; G < 16; ) {
                if (k === 0) break e;
                k--, V += U[F++] << G, G += 8;
              }
              if (M.flags = V, (255 & M.flags) != 8) {
                P.msg = "unknown compression method", M.mode = 30;
                break;
              }
              if (57344 & M.flags) {
                P.msg = "unknown header flags set", M.mode = 30;
                break;
              }
              M.head && (M.head.text = V >> 8 & 1), 512 & M.flags && (ge[0] = 255 & V, ge[1] = V >>> 8 & 255, M.check = h(M.check, ge, 2, 0)), G = V = 0, M.mode = 3;
            case 3:
              for (; G < 32; ) {
                if (k === 0) break e;
                k--, V += U[F++] << G, G += 8;
              }
              M.head && (M.head.time = V), 512 & M.flags && (ge[0] = 255 & V, ge[1] = V >>> 8 & 255, ge[2] = V >>> 16 & 255, ge[3] = V >>> 24 & 255, M.check = h(M.check, ge, 4, 0)), G = V = 0, M.mode = 4;
            case 4:
              for (; G < 16; ) {
                if (k === 0) break e;
                k--, V += U[F++] << G, G += 8;
              }
              M.head && (M.head.xflags = 255 & V, M.head.os = V >> 8), 512 & M.flags && (ge[0] = 255 & V, ge[1] = V >>> 8 & 255, M.check = h(M.check, ge, 2, 0)), G = V = 0, M.mode = 5;
            case 5:
              if (1024 & M.flags) {
                for (; G < 16; ) {
                  if (k === 0) break e;
                  k--, V += U[F++] << G, G += 8;
                }
                M.length = V, M.head && (M.head.extra_len = V), 512 & M.flags && (ge[0] = 255 & V, ge[1] = V >>> 8 & 255, M.check = h(M.check, ge, 2, 0)), G = V = 0;
              } else M.head && (M.head.extra = null);
              M.mode = 6;
            case 6:
              if (1024 & M.flags && (k < (H = M.length) && (H = k), H && (M.head && (Y = M.head.extra_len - M.length, M.head.extra || (M.head.extra = new Array(M.head.extra_len)), c.arraySet(M.head.extra, U, F, H, Y)), 512 & M.flags && (M.check = h(M.check, U, H, F)), k -= H, F += H, M.length -= H), M.length)) break e;
              M.length = 0, M.mode = 7;
            case 7:
              if (2048 & M.flags) {
                if (k === 0) break e;
                for (H = 0; Y = U[F + H++], M.head && Y && M.length < 65536 && (M.head.name += String.fromCharCode(Y)), Y && H < k; ) ;
                if (512 & M.flags && (M.check = h(M.check, U, H, F)), k -= H, F += H, Y) break e;
              } else M.head && (M.head.name = null);
              M.length = 0, M.mode = 8;
            case 8:
              if (4096 & M.flags) {
                if (k === 0) break e;
                for (H = 0; Y = U[F + H++], M.head && Y && M.length < 65536 && (M.head.comment += String.fromCharCode(Y)), Y && H < k; ) ;
                if (512 & M.flags && (M.check = h(M.check, U, H, F)), k -= H, F += H, Y) break e;
              } else M.head && (M.head.comment = null);
              M.mode = 9;
            case 9:
              if (512 & M.flags) {
                for (; G < 16; ) {
                  if (k === 0) break e;
                  k--, V += U[F++] << G, G += 8;
                }
                if (V !== (65535 & M.check)) {
                  P.msg = "header crc mismatch", M.mode = 30;
                  break;
                }
                G = V = 0;
              }
              M.head && (M.head.hcrc = M.flags >> 9 & 1, M.head.done = true), P.adler = M.check = 0, M.mode = 12;
              break;
            case 10:
              for (; G < 32; ) {
                if (k === 0) break e;
                k--, V += U[F++] << G, G += 8;
              }
              P.adler = M.check = y(V), G = V = 0, M.mode = 11;
            case 11:
              if (M.havedict === 0) return P.next_out = T, P.avail_out = z, P.next_in = F, P.avail_in = k, M.hold = V, M.bits = G, 2;
              P.adler = M.check = 1, M.mode = 12;
            case 12:
              if (B === 5 || B === 6) break e;
            case 13:
              if (M.last) {
                V >>>= 7 & G, G -= 7 & G, M.mode = 27;
                break;
              }
              for (; G < 3; ) {
                if (k === 0) break e;
                k--, V += U[F++] << G, G += 8;
              }
              switch (M.last = 1 & V, G -= 1, 3 & (V >>>= 1)) {
                case 0:
                  M.mode = 14;
                  break;
                case 1:
                  if (O(M), M.mode = 20, B !== 6) break;
                  V >>>= 2, G -= 2;
                  break e;
                case 2:
                  M.mode = 17;
                  break;
                case 3:
                  P.msg = "invalid block type", M.mode = 30;
              }
              V >>>= 2, G -= 2;
              break;
            case 14:
              for (V >>>= 7 & G, G -= 7 & G; G < 32; ) {
                if (k === 0) break e;
                k--, V += U[F++] << G, G += 8;
              }
              if ((65535 & V) != (V >>> 16 ^ 65535)) {
                P.msg = "invalid stored block lengths", M.mode = 30;
                break;
              }
              if (M.length = 65535 & V, G = V = 0, M.mode = 15, B === 6) break e;
            case 15:
              M.mode = 16;
            case 16:
              if (H = M.length) {
                if (k < H && (H = k), z < H && (H = z), H === 0) break e;
                c.arraySet(_, U, F, H, T), k -= H, F += H, z -= H, T += H, M.length -= H;
                break;
              }
              M.mode = 12;
              break;
            case 17:
              for (; G < 14; ) {
                if (k === 0) break e;
                k--, V += U[F++] << G, G += 8;
              }
              if (M.nlen = 257 + (31 & V), V >>>= 5, G -= 5, M.ndist = 1 + (31 & V), V >>>= 5, G -= 5, M.ncode = 4 + (15 & V), V >>>= 4, G -= 4, 286 < M.nlen || 30 < M.ndist) {
                P.msg = "too many length or distance symbols", M.mode = 30;
                break;
              }
              M.have = 0, M.mode = 18;
            case 18:
              for (; M.have < M.ncode; ) {
                for (; G < 3; ) {
                  if (k === 0) break e;
                  k--, V += U[F++] << G, G += 8;
                }
                M.lens[me[M.have++]] = 7 & V, V >>>= 3, G -= 3;
              }
              for (; M.have < 19; ) M.lens[me[M.have++]] = 0;
              if (M.lencode = M.lendyn, M.lenbits = 7, se = { bits: M.lenbits }, re = n(0, M.lens, 0, 19, M.lencode, 0, M.work, se), M.lenbits = se.bits, re) {
                P.msg = "invalid code lengths set", M.mode = 30;
                break;
              }
              M.have = 0, M.mode = 19;
            case 19:
              for (; M.have < M.nlen + M.ndist; ) {
                for (; te = (pe = M.lencode[V & (1 << M.lenbits) - 1]) >>> 16 & 255, le = 65535 & pe, !((ee = pe >>> 24) <= G); ) {
                  if (k === 0) break e;
                  k--, V += U[F++] << G, G += 8;
                }
                if (le < 16) V >>>= ee, G -= ee, M.lens[M.have++] = le;
                else {
                  if (le === 16) {
                    for (ne = ee + 2; G < ne; ) {
                      if (k === 0) break e;
                      k--, V += U[F++] << G, G += 8;
                    }
                    if (V >>>= ee, G -= ee, M.have === 0) {
                      P.msg = "invalid bit length repeat", M.mode = 30;
                      break;
                    }
                    Y = M.lens[M.have - 1], H = 3 + (3 & V), V >>>= 2, G -= 2;
                  } else if (le === 17) {
                    for (ne = ee + 3; G < ne; ) {
                      if (k === 0) break e;
                      k--, V += U[F++] << G, G += 8;
                    }
                    G -= ee, Y = 0, H = 3 + (7 & (V >>>= ee)), V >>>= 3, G -= 3;
                  } else {
                    for (ne = ee + 7; G < ne; ) {
                      if (k === 0) break e;
                      k--, V += U[F++] << G, G += 8;
                    }
                    G -= ee, Y = 0, H = 11 + (127 & (V >>>= ee)), V >>>= 7, G -= 7;
                  }
                  if (M.have + H > M.nlen + M.ndist) {
                    P.msg = "invalid bit length repeat", M.mode = 30;
                    break;
                  }
                  for (; H--; ) M.lens[M.have++] = Y;
                }
              }
              if (M.mode === 30) break;
              if (M.lens[256] === 0) {
                P.msg = "invalid code -- missing end-of-block", M.mode = 30;
                break;
              }
              if (M.lenbits = 9, se = { bits: M.lenbits }, re = n(p, M.lens, 0, M.nlen, M.lencode, 0, M.work, se), M.lenbits = se.bits, re) {
                P.msg = "invalid literal/lengths set", M.mode = 30;
                break;
              }
              if (M.distbits = 6, M.distcode = M.distdyn, se = { bits: M.distbits }, re = n(m, M.lens, M.nlen, M.ndist, M.distcode, 0, M.work, se), M.distbits = se.bits, re) {
                P.msg = "invalid distances set", M.mode = 30;
                break;
              }
              if (M.mode = 20, B === 6) break e;
            case 20:
              M.mode = 21;
            case 21:
              if (6 <= k && 258 <= z) {
                P.next_out = T, P.avail_out = z, P.next_in = F, P.avail_in = k, M.hold = V, M.bits = G, f(P, j), T = P.next_out, _ = P.output, z = P.avail_out, F = P.next_in, U = P.input, k = P.avail_in, V = M.hold, G = M.bits, M.mode === 12 && (M.back = -1);
                break;
              }
              for (M.back = 0; te = (pe = M.lencode[V & (1 << M.lenbits) - 1]) >>> 16 & 255, le = 65535 & pe, !((ee = pe >>> 24) <= G); ) {
                if (k === 0) break e;
                k--, V += U[F++] << G, G += 8;
              }
              if (te && (240 & te) == 0) {
                for (Z = ee, J = te, ae = le; te = (pe = M.lencode[ae + ((V & (1 << Z + J) - 1) >> Z)]) >>> 16 & 255, le = 65535 & pe, !(Z + (ee = pe >>> 24) <= G); ) {
                  if (k === 0) break e;
                  k--, V += U[F++] << G, G += 8;
                }
                V >>>= Z, G -= Z, M.back += Z;
              }
              if (V >>>= ee, G -= ee, M.back += ee, M.length = le, te === 0) {
                M.mode = 26;
                break;
              }
              if (32 & te) {
                M.back = -1, M.mode = 12;
                break;
              }
              if (64 & te) {
                P.msg = "invalid literal/length code", M.mode = 30;
                break;
              }
              M.extra = 15 & te, M.mode = 22;
            case 22:
              if (M.extra) {
                for (ne = M.extra; G < ne; ) {
                  if (k === 0) break e;
                  k--, V += U[F++] << G, G += 8;
                }
                M.length += V & (1 << M.extra) - 1, V >>>= M.extra, G -= M.extra, M.back += M.extra;
              }
              M.was = M.length, M.mode = 23;
            case 23:
              for (; te = (pe = M.distcode[V & (1 << M.distbits) - 1]) >>> 16 & 255, le = 65535 & pe, !((ee = pe >>> 24) <= G); ) {
                if (k === 0) break e;
                k--, V += U[F++] << G, G += 8;
              }
              if ((240 & te) == 0) {
                for (Z = ee, J = te, ae = le; te = (pe = M.distcode[ae + ((V & (1 << Z + J) - 1) >> Z)]) >>> 16 & 255, le = 65535 & pe, !(Z + (ee = pe >>> 24) <= G); ) {
                  if (k === 0) break e;
                  k--, V += U[F++] << G, G += 8;
                }
                V >>>= Z, G -= Z, M.back += Z;
              }
              if (V >>>= ee, G -= ee, M.back += ee, 64 & te) {
                P.msg = "invalid distance code", M.mode = 30;
                break;
              }
              M.offset = le, M.extra = 15 & te, M.mode = 24;
            case 24:
              if (M.extra) {
                for (ne = M.extra; G < ne; ) {
                  if (k === 0) break e;
                  k--, V += U[F++] << G, G += 8;
                }
                M.offset += V & (1 << M.extra) - 1, V >>>= M.extra, G -= M.extra, M.back += M.extra;
              }
              if (M.offset > M.dmax) {
                P.msg = "invalid distance too far back", M.mode = 30;
                break;
              }
              M.mode = 25;
            case 25:
              if (z === 0) break e;
              if (H = j - z, M.offset > H) {
                if ((H = M.offset - H) > M.whave && M.sane) {
                  P.msg = "invalid distance too far back", M.mode = 30;
                  break;
                }
                X = H > M.wnext ? (H -= M.wnext, M.wsize - H) : M.wnext - H, H > M.length && (H = M.length), Q = M.window;
              } else Q = _, X = T - M.offset, H = M.length;
              for (z < H && (H = z), z -= H, M.length -= H; _[T++] = Q[X++], --H; ) ;
              M.length === 0 && (M.mode = 21);
              break;
            case 26:
              if (z === 0) break e;
              _[T++] = M.length, z--, M.mode = 21;
              break;
            case 27:
              if (M.wrap) {
                for (; G < 32; ) {
                  if (k === 0) break e;
                  k--, V |= U[F++] << G, G += 8;
                }
                if (j -= z, P.total_out += j, M.total += j, j && (P.adler = M.check = M.flags ? h(M.check, _, j, T - j) : s(M.check, _, j, T - j)), j = z, (M.flags ? V : y(V)) !== M.check) {
                  P.msg = "incorrect data check", M.mode = 30;
                  break;
                }
                G = V = 0;
              }
              M.mode = 28;
            case 28:
              if (M.wrap && M.flags) {
                for (; G < 32; ) {
                  if (k === 0) break e;
                  k--, V += U[F++] << G, G += 8;
                }
                if (V !== (4294967295 & M.total)) {
                  P.msg = "incorrect length check", M.mode = 30;
                  break;
                }
                G = V = 0;
              }
              M.mode = 29;
            case 29:
              re = 1;
              break e;
            case 30:
              re = -3;
              break e;
            case 31:
              return -4;
            default:
              return b;
          }
          return P.next_out = T, P.avail_out = z, P.next_in = F, P.avail_in = k, M.hold = V, M.bits = G, (M.wsize || j !== P.avail_out && M.mode < 30 && (M.mode < 27 || B !== 4)) && L(P, P.output, P.next_out, j - P.avail_out) ? (M.mode = 31, -4) : (q -= P.avail_in, j -= P.avail_out, P.total_in += q, P.total_out += j, M.total += j, M.wrap && j && (P.adler = M.check = M.flags ? h(M.check, _, j, P.next_out - j) : s(M.check, _, j, P.next_out - j)), P.data_type = M.bits + (M.last ? 64 : 0) + (M.mode === 12 ? 128 : 0) + (M.mode === 20 || M.mode === 15 ? 256 : 0), (q == 0 && j === 0 || B === 4) && re === d && (re = -5), re);
        }, i.inflateEnd = function(P) {
          if (!P || !P.state) return b;
          var B = P.state;
          return B.window && (B.window = null), P.state = null, d;
        }, i.inflateGetHeader = function(P, B) {
          var M;
          return P && P.state ? (2 & (M = P.state).wrap) == 0 ? b : ((M.head = B).done = false, d) : b;
        }, i.inflateSetDictionary = function(P, B) {
          var M, U = B.length;
          return P && P.state ? (M = P.state).wrap !== 0 && M.mode !== 11 ? b : M.mode === 11 && s(1, B, U, 0) !== M.check ? -3 : L(P, B, U, U) ? (M.mode = 31, -4) : (M.havedict = 1, d) : b;
        }, i.inflateInfo = "pako inflate (from Nodeca project)";
      }, { "../utils/common": 41, "./adler32": 43, "./crc32": 45, "./inffast": 48, "./inftrees": 50 }], 50: [function(r, l, i) {
        var c = r("../utils/common"), s = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258, 0, 0], h = [16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78], f = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 0, 0], n = [16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 64, 64];
        l.exports = function(p, m, d, b, x, v, w, y) {
          var g, A, C, S, R, N, E, D, O, L = y.bits, P = 0, B = 0, M = 0, U = 0, _ = 0, F = 0, T = 0, k = 0, z = 0, V = 0, G = null, q = 0, j = new c.Buf16(16), H = new c.Buf16(16), X = null, Q = 0;
          for (P = 0; P <= 15; P++) j[P] = 0;
          for (B = 0; B < b; B++) j[m[d + B]]++;
          for (_ = L, U = 15; 1 <= U && j[U] === 0; U--) ;
          if (U < _ && (_ = U), U === 0) return x[v++] = 20971520, x[v++] = 20971520, y.bits = 1, 0;
          for (M = 1; M < U && j[M] === 0; M++) ;
          for (_ < M && (_ = M), P = k = 1; P <= 15; P++) if (k <<= 1, (k -= j[P]) < 0) return -1;
          if (0 < k && (p === 0 || U !== 1)) return -1;
          for (H[1] = 0, P = 1; P < 15; P++) H[P + 1] = H[P] + j[P];
          for (B = 0; B < b; B++) m[d + B] !== 0 && (w[H[m[d + B]]++] = B);
          if (N = p === 0 ? (G = X = w, 19) : p === 1 ? (G = s, q -= 257, X = h, Q -= 257, 256) : (G = f, X = n, -1), P = M, R = v, T = B = V = 0, C = -1, S = (z = 1 << (F = _)) - 1, p === 1 && 852 < z || p === 2 && 592 < z) return 1;
          for (; ; ) {
            for (E = P - T, O = w[B] < N ? (D = 0, w[B]) : w[B] > N ? (D = X[Q + w[B]], G[q + w[B]]) : (D = 96, 0), g = 1 << P - T, M = A = 1 << F; x[R + (V >> T) + (A -= g)] = E << 24 | D << 16 | O | 0, A !== 0; ) ;
            for (g = 1 << P - 1; V & g; ) g >>= 1;
            if (g !== 0 ? (V &= g - 1, V += g) : V = 0, B++, --j[P] == 0) {
              if (P === U) break;
              P = m[d + w[B]];
            }
            if (_ < P && (V & S) !== C) {
              for (T === 0 && (T = _), R += M, k = 1 << (F = P - T); F + T < U && !((k -= j[F + T]) <= 0); ) F++, k <<= 1;
              if (z += 1 << F, p === 1 && 852 < z || p === 2 && 592 < z) return 1;
              x[C = V & S] = _ << 24 | F << 16 | R - v | 0;
            }
          }
          return V !== 0 && (x[R + V] = P - T << 24 | 64 << 16 | 0), y.bits = _, 0;
        };
      }, { "../utils/common": 41 }], 51: [function(r, l, i) {
        l.exports = { 2: "need dictionary", 1: "stream end", 0: "", "-1": "file error", "-2": "stream error", "-3": "data error", "-4": "insufficient memory", "-5": "buffer error", "-6": "incompatible version" };
      }, {}], 52: [function(r, l, i) {
        var c = r("../utils/common"), s = 0, h = 1;
        function f(pe) {
          for (var ge = pe.length; 0 <= --ge; ) pe[ge] = 0;
        }
        var n = 0, p = 29, m = 256, d = m + 1 + p, b = 30, x = 19, v = 2 * d + 1, w = 15, y = 16, g = 7, A = 256, C = 16, S = 17, R = 18, N = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0], E = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13], D = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7], O = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15], L = new Array(2 * (d + 2));
        f(L);
        var P = new Array(2 * b);
        f(P);
        var B = new Array(512);
        f(B);
        var M = new Array(256);
        f(M);
        var U = new Array(p);
        f(U);
        var _, F, T, k = new Array(b);
        function z(pe, ge, me, Te, _e) {
          this.static_tree = pe, this.extra_bits = ge, this.extra_base = me, this.elems = Te, this.max_length = _e, this.has_stree = pe && pe.length;
        }
        function V(pe, ge) {
          this.dyn_tree = pe, this.max_code = 0, this.stat_desc = ge;
        }
        function G(pe) {
          return pe < 256 ? B[pe] : B[256 + (pe >>> 7)];
        }
        function q(pe, ge) {
          pe.pending_buf[pe.pending++] = 255 & ge, pe.pending_buf[pe.pending++] = ge >>> 8 & 255;
        }
        function j(pe, ge, me) {
          pe.bi_valid > y - me ? (pe.bi_buf |= ge << pe.bi_valid & 65535, q(pe, pe.bi_buf), pe.bi_buf = ge >> y - pe.bi_valid, pe.bi_valid += me - y) : (pe.bi_buf |= ge << pe.bi_valid & 65535, pe.bi_valid += me);
        }
        function H(pe, ge, me) {
          j(pe, me[2 * ge], me[2 * ge + 1]);
        }
        function X(pe, ge) {
          for (var me = 0; me |= 1 & pe, pe >>>= 1, me <<= 1, 0 < --ge; ) ;
          return me >>> 1;
        }
        function Q(pe, ge, me) {
          var Te, _e, qe = new Array(w + 1), ve = 0;
          for (Te = 1; Te <= w; Te++) qe[Te] = ve = ve + me[Te - 1] << 1;
          for (_e = 0; _e <= ge; _e++) {
            var oe = pe[2 * _e + 1];
            oe !== 0 && (pe[2 * _e] = X(qe[oe]++, oe));
          }
        }
        function ee(pe) {
          var ge;
          for (ge = 0; ge < d; ge++) pe.dyn_ltree[2 * ge] = 0;
          for (ge = 0; ge < b; ge++) pe.dyn_dtree[2 * ge] = 0;
          for (ge = 0; ge < x; ge++) pe.bl_tree[2 * ge] = 0;
          pe.dyn_ltree[2 * A] = 1, pe.opt_len = pe.static_len = 0, pe.last_lit = pe.matches = 0;
        }
        function te(pe) {
          8 < pe.bi_valid ? q(pe, pe.bi_buf) : 0 < pe.bi_valid && (pe.pending_buf[pe.pending++] = pe.bi_buf), pe.bi_buf = 0, pe.bi_valid = 0;
        }
        function le(pe, ge, me, Te) {
          var _e = 2 * ge, qe = 2 * me;
          return pe[_e] < pe[qe] || pe[_e] === pe[qe] && Te[ge] <= Te[me];
        }
        function Z(pe, ge, me) {
          for (var Te = pe.heap[me], _e = me << 1; _e <= pe.heap_len && (_e < pe.heap_len && le(ge, pe.heap[_e + 1], pe.heap[_e], pe.depth) && _e++, !le(ge, Te, pe.heap[_e], pe.depth)); ) pe.heap[me] = pe.heap[_e], me = _e, _e <<= 1;
          pe.heap[me] = Te;
        }
        function J(pe, ge, me) {
          var Te, _e, qe, ve, oe = 0;
          if (pe.last_lit !== 0) for (; Te = pe.pending_buf[pe.d_buf + 2 * oe] << 8 | pe.pending_buf[pe.d_buf + 2 * oe + 1], _e = pe.pending_buf[pe.l_buf + oe], oe++, Te === 0 ? H(pe, _e, ge) : (H(pe, (qe = M[_e]) + m + 1, ge), (ve = N[qe]) !== 0 && j(pe, _e -= U[qe], ve), H(pe, qe = G(--Te), me), (ve = E[qe]) !== 0 && j(pe, Te -= k[qe], ve)), oe < pe.last_lit; ) ;
          H(pe, A, ge);
        }
        function ae(pe, ge) {
          var me, Te, _e, qe = ge.dyn_tree, ve = ge.stat_desc.static_tree, oe = ge.stat_desc.has_stree, he = ge.stat_desc.elems, ie = -1;
          for (pe.heap_len = 0, pe.heap_max = v, me = 0; me < he; me++) qe[2 * me] !== 0 ? (pe.heap[++pe.heap_len] = ie = me, pe.depth[me] = 0) : qe[2 * me + 1] = 0;
          for (; pe.heap_len < 2; ) qe[2 * (_e = pe.heap[++pe.heap_len] = ie < 2 ? ++ie : 0)] = 1, pe.depth[_e] = 0, pe.opt_len--, oe && (pe.static_len -= ve[2 * _e + 1]);
          for (ge.max_code = ie, me = pe.heap_len >> 1; 1 <= me; me--) Z(pe, qe, me);
          for (_e = he; me = pe.heap[1], pe.heap[1] = pe.heap[pe.heap_len--], Z(pe, qe, 1), Te = pe.heap[1], pe.heap[--pe.heap_max] = me, pe.heap[--pe.heap_max] = Te, qe[2 * _e] = qe[2 * me] + qe[2 * Te], pe.depth[_e] = (pe.depth[me] >= pe.depth[Te] ? pe.depth[me] : pe.depth[Te]) + 1, qe[2 * me + 1] = qe[2 * Te + 1] = _e, pe.heap[1] = _e++, Z(pe, qe, 1), 2 <= pe.heap_len; ) ;
          pe.heap[--pe.heap_max] = pe.heap[1], function(ue, fe) {
            var Ne, ze, ot, Le, tt, Ge, We = fe.dyn_tree, ft = fe.max_code, Vt = fe.stat_desc.static_tree, bt = fe.stat_desc.has_stree, ca = fe.stat_desc.extra_bits, Ot = fe.stat_desc.extra_base, Ht = fe.stat_desc.max_length, ua = 0;
            for (Le = 0; Le <= w; Le++) ue.bl_count[Le] = 0;
            for (We[2 * ue.heap[ue.heap_max] + 1] = 0, Ne = ue.heap_max + 1; Ne < v; Ne++) Ht < (Le = We[2 * We[2 * (ze = ue.heap[Ne]) + 1] + 1] + 1) && (Le = Ht, ua++), We[2 * ze + 1] = Le, ft < ze || (ue.bl_count[Le]++, tt = 0, Ot <= ze && (tt = ca[ze - Ot]), Ge = We[2 * ze], ue.opt_len += Ge * (Le + tt), bt && (ue.static_len += Ge * (Vt[2 * ze + 1] + tt)));
            if (ua !== 0) {
              do {
                for (Le = Ht - 1; ue.bl_count[Le] === 0; ) Le--;
                ue.bl_count[Le]--, ue.bl_count[Le + 1] += 2, ue.bl_count[Ht]--, ua -= 2;
              } while (0 < ua);
              for (Le = Ht; Le !== 0; Le--) for (ze = ue.bl_count[Le]; ze !== 0; ) ft < (ot = ue.heap[--Ne]) || (We[2 * ot + 1] !== Le && (ue.opt_len += (Le - We[2 * ot + 1]) * We[2 * ot], We[2 * ot + 1] = Le), ze--);
            }
          }(pe, ge), Q(qe, ie, pe.bl_count);
        }
        function Y(pe, ge, me) {
          var Te, _e, qe = -1, ve = ge[1], oe = 0, he = 7, ie = 4;
          for (ve === 0 && (he = 138, ie = 3), ge[2 * (me + 1) + 1] = 65535, Te = 0; Te <= me; Te++) _e = ve, ve = ge[2 * (Te + 1) + 1], ++oe < he && _e === ve || (oe < ie ? pe.bl_tree[2 * _e] += oe : _e !== 0 ? (_e !== qe && pe.bl_tree[2 * _e]++, pe.bl_tree[2 * C]++) : oe <= 10 ? pe.bl_tree[2 * S]++ : pe.bl_tree[2 * R]++, qe = _e, ie = (oe = 0) === ve ? (he = 138, 3) : _e === ve ? (he = 6, 3) : (he = 7, 4));
        }
        function re(pe, ge, me) {
          var Te, _e, qe = -1, ve = ge[1], oe = 0, he = 7, ie = 4;
          for (ve === 0 && (he = 138, ie = 3), Te = 0; Te <= me; Te++) if (_e = ve, ve = ge[2 * (Te + 1) + 1], !(++oe < he && _e === ve)) {
            if (oe < ie) for (; H(pe, _e, pe.bl_tree), --oe != 0; ) ;
            else _e !== 0 ? (_e !== qe && (H(pe, _e, pe.bl_tree), oe--), H(pe, C, pe.bl_tree), j(pe, oe - 3, 2)) : oe <= 10 ? (H(pe, S, pe.bl_tree), j(pe, oe - 3, 3)) : (H(pe, R, pe.bl_tree), j(pe, oe - 11, 7));
            qe = _e, ie = (oe = 0) === ve ? (he = 138, 3) : _e === ve ? (he = 6, 3) : (he = 7, 4);
          }
        }
        f(k);
        var se = false;
        function ne(pe, ge, me, Te) {
          j(pe, (n << 1) + (Te ? 1 : 0), 3), function(_e, qe, ve, oe) {
            te(_e), q(_e, ve), q(_e, ~ve), c.arraySet(_e.pending_buf, _e.window, qe, ve, _e.pending), _e.pending += ve;
          }(pe, ge, me);
        }
        i._tr_init = function(pe) {
          se || (function() {
            var ge, me, Te, _e, qe, ve = new Array(w + 1);
            for (_e = Te = 0; _e < p - 1; _e++) for (U[_e] = Te, ge = 0; ge < 1 << N[_e]; ge++) M[Te++] = _e;
            for (M[Te - 1] = _e, _e = qe = 0; _e < 16; _e++) for (k[_e] = qe, ge = 0; ge < 1 << E[_e]; ge++) B[qe++] = _e;
            for (qe >>= 7; _e < b; _e++) for (k[_e] = qe << 7, ge = 0; ge < 1 << E[_e] - 7; ge++) B[256 + qe++] = _e;
            for (me = 0; me <= w; me++) ve[me] = 0;
            for (ge = 0; ge <= 143; ) L[2 * ge + 1] = 8, ge++, ve[8]++;
            for (; ge <= 255; ) L[2 * ge + 1] = 9, ge++, ve[9]++;
            for (; ge <= 279; ) L[2 * ge + 1] = 7, ge++, ve[7]++;
            for (; ge <= 287; ) L[2 * ge + 1] = 8, ge++, ve[8]++;
            for (Q(L, d + 1, ve), ge = 0; ge < b; ge++) P[2 * ge + 1] = 5, P[2 * ge] = X(ge, 5);
            _ = new z(L, N, m + 1, d, w), F = new z(P, E, 0, b, w), T = new z(new Array(0), D, 0, x, g);
          }(), se = true), pe.l_desc = new V(pe.dyn_ltree, _), pe.d_desc = new V(pe.dyn_dtree, F), pe.bl_desc = new V(pe.bl_tree, T), pe.bi_buf = 0, pe.bi_valid = 0, ee(pe);
        }, i._tr_stored_block = ne, i._tr_flush_block = function(pe, ge, me, Te) {
          var _e, qe, ve = 0;
          0 < pe.level ? (pe.strm.data_type === 2 && (pe.strm.data_type = function(oe) {
            var he, ie = 4093624447;
            for (he = 0; he <= 31; he++, ie >>>= 1) if (1 & ie && oe.dyn_ltree[2 * he] !== 0) return s;
            if (oe.dyn_ltree[18] !== 0 || oe.dyn_ltree[20] !== 0 || oe.dyn_ltree[26] !== 0) return h;
            for (he = 32; he < m; he++) if (oe.dyn_ltree[2 * he] !== 0) return h;
            return s;
          }(pe)), ae(pe, pe.l_desc), ae(pe, pe.d_desc), ve = function(oe) {
            var he;
            for (Y(oe, oe.dyn_ltree, oe.l_desc.max_code), Y(oe, oe.dyn_dtree, oe.d_desc.max_code), ae(oe, oe.bl_desc), he = x - 1; 3 <= he && oe.bl_tree[2 * O[he] + 1] === 0; he--) ;
            return oe.opt_len += 3 * (he + 1) + 5 + 5 + 4, he;
          }(pe), _e = pe.opt_len + 3 + 7 >>> 3, (qe = pe.static_len + 3 + 7 >>> 3) <= _e && (_e = qe)) : _e = qe = me + 5, me + 4 <= _e && ge !== -1 ? ne(pe, ge, me, Te) : pe.strategy === 4 || qe === _e ? (j(pe, 2 + (Te ? 1 : 0), 3), J(pe, L, P)) : (j(pe, 4 + (Te ? 1 : 0), 3), function(oe, he, ie, ue) {
            var fe;
            for (j(oe, he - 257, 5), j(oe, ie - 1, 5), j(oe, ue - 4, 4), fe = 0; fe < ue; fe++) j(oe, oe.bl_tree[2 * O[fe] + 1], 3);
            re(oe, oe.dyn_ltree, he - 1), re(oe, oe.dyn_dtree, ie - 1);
          }(pe, pe.l_desc.max_code + 1, pe.d_desc.max_code + 1, ve + 1), J(pe, pe.dyn_ltree, pe.dyn_dtree)), ee(pe), Te && te(pe);
        }, i._tr_tally = function(pe, ge, me) {
          return pe.pending_buf[pe.d_buf + 2 * pe.last_lit] = ge >>> 8 & 255, pe.pending_buf[pe.d_buf + 2 * pe.last_lit + 1] = 255 & ge, pe.pending_buf[pe.l_buf + pe.last_lit] = 255 & me, pe.last_lit++, ge === 0 ? pe.dyn_ltree[2 * me]++ : (pe.matches++, ge--, pe.dyn_ltree[2 * (M[me] + m + 1)]++, pe.dyn_dtree[2 * G(ge)]++), pe.last_lit === pe.lit_bufsize - 1;
        }, i._tr_align = function(pe) {
          j(pe, 2, 3), H(pe, A, L), function(ge) {
            ge.bi_valid === 16 ? (q(ge, ge.bi_buf), ge.bi_buf = 0, ge.bi_valid = 0) : 8 <= ge.bi_valid && (ge.pending_buf[ge.pending++] = 255 & ge.bi_buf, ge.bi_buf >>= 8, ge.bi_valid -= 8);
          }(pe);
        };
      }, { "../utils/common": 41 }], 53: [function(r, l, i) {
        l.exports = function() {
          this.input = null, this.next_in = 0, this.avail_in = 0, this.total_in = 0, this.output = null, this.next_out = 0, this.avail_out = 0, this.total_out = 0, this.msg = "", this.state = null, this.data_type = 2, this.adler = 0;
        };
      }, {}], 54: [function(r, l, i) {
        (function(c) {
          (function(s, h) {
            if (!s.setImmediate) {
              var f, n, p, m, d = 1, b = {}, x = false, v = s.document, w = Object.getPrototypeOf && Object.getPrototypeOf(s);
              w = w && w.setTimeout ? w : s, f = {}.toString.call(s.process) === "[object process]" ? function(C) {
                process.nextTick(function() {
                  g(C);
                });
              } : function() {
                if (s.postMessage && !s.importScripts) {
                  var C = true, S = s.onmessage;
                  return s.onmessage = function() {
                    C = false;
                  }, s.postMessage("", "*"), s.onmessage = S, C;
                }
              }() ? (m = "setImmediate$" + Math.random() + "$", s.addEventListener ? s.addEventListener("message", A, false) : s.attachEvent("onmessage", A), function(C) {
                s.postMessage(m + C, "*");
              }) : s.MessageChannel ? ((p = new MessageChannel()).port1.onmessage = function(C) {
                g(C.data);
              }, function(C) {
                p.port2.postMessage(C);
              }) : v && "onreadystatechange" in v.createElement("script") ? (n = v.documentElement, function(C) {
                var S = v.createElement("script");
                S.onreadystatechange = function() {
                  g(C), S.onreadystatechange = null, n.removeChild(S), S = null;
                }, n.appendChild(S);
              }) : function(C) {
                setTimeout(g, 0, C);
              }, w.setImmediate = function(C) {
                typeof C != "function" && (C = new Function("" + C));
                for (var S = new Array(arguments.length - 1), R = 0; R < S.length; R++) S[R] = arguments[R + 1];
                var N = { callback: C, args: S };
                return b[d] = N, f(d), d++;
              }, w.clearImmediate = y;
            }
            function y(C) {
              delete b[C];
            }
            function g(C) {
              if (x) setTimeout(g, 0, C);
              else {
                var S = b[C];
                if (S) {
                  x = true;
                  try {
                    (function(R) {
                      var N = R.callback, E = R.args;
                      switch (E.length) {
                        case 0:
                          N();
                          break;
                        case 1:
                          N(E[0]);
                          break;
                        case 2:
                          N(E[0], E[1]);
                          break;
                        case 3:
                          N(E[0], E[1], E[2]);
                          break;
                        default:
                          N.apply(h, E);
                      }
                    })(S);
                  } finally {
                    y(C), x = false;
                  }
                }
              }
            }
            function A(C) {
              C.source === s && typeof C.data == "string" && C.data.indexOf(m) === 0 && g(+C.data.slice(m.length));
            }
          })(typeof self > "u" ? c === void 0 ? this : c : self);
        }).call(this, typeof I0 < "u" ? I0 : typeof self < "u" ? self : typeof window < "u" ? window : {});
      }, {}] }, {}, [10])(10);
    });
  }(Jb)), Jb.exports;
}
var m6 = g6();
const V2 = kv(m6);
var Os = function() {
  return Os = Object.assign || function(t) {
    for (var r, l = 1, i = arguments.length; l < i; l++) {
      r = arguments[l];
      for (var c in r) Object.prototype.hasOwnProperty.call(r, c) && (t[c] = r[c]);
    }
    return t;
  }, Os.apply(this, arguments);
};
function ip(e, t, r, l) {
  function i(c) {
    return c instanceof r ? c : new r(function(s) {
      s(c);
    });
  }
  return new (r || (r = Promise))(function(c, s) {
    function h(p) {
      try {
        n(l.next(p));
      } catch (m) {
        s(m);
      }
    }
    function f(p) {
      try {
        n(l.throw(p));
      } catch (m) {
        s(m);
      }
    }
    function n(p) {
      p.done ? c(p.value) : i(p.value).then(h, f);
    }
    n((l = l.apply(e, [])).next());
  });
}
function sp(e, t) {
  var r = { label: 0, sent: function() {
    if (c[0] & 1) throw c[1];
    return c[1];
  }, trys: [], ops: [] }, l, i, c, s;
  return s = { next: h(0), throw: h(1), return: h(2) }, typeof Symbol == "function" && (s[Symbol.iterator] = function() {
    return this;
  }), s;
  function h(n) {
    return function(p) {
      return f([n, p]);
    };
  }
  function f(n) {
    if (l) throw new TypeError("Generator is already executing.");
    for (; s && (s = 0, n[0] && (r = 0)), r; ) try {
      if (l = 1, i && (c = n[0] & 2 ? i.return : n[0] ? i.throw || ((c = i.return) && c.call(i), 0) : i.next) && !(c = c.call(i, n[1])).done) return c;
      switch (i = 0, c && (n = [n[0] & 2, c.value]), n[0]) {
        case 0:
        case 1:
          c = n;
          break;
        case 4:
          return r.label++, { value: n[1], done: false };
        case 5:
          r.label++, i = n[1], n = [0];
          continue;
        case 7:
          n = r.ops.pop(), r.trys.pop();
          continue;
        default:
          if (c = r.trys, !(c = c.length > 0 && c[c.length - 1]) && (n[0] === 6 || n[0] === 2)) {
            r = 0;
            continue;
          }
          if (n[0] === 3 && (!c || n[1] > c[0] && n[1] < c[3])) {
            r.label = n[1];
            break;
          }
          if (n[0] === 6 && r.label < c[1]) {
            r.label = c[1], c = n;
            break;
          }
          if (c && r.label < c[2]) {
            r.label = c[2], r.ops.push(n);
            break;
          }
          c[2] && r.ops.pop(), r.trys.pop();
          continue;
      }
      n = t.call(e, r);
    } catch (p) {
      n = [6, p], i = 0;
    } finally {
      l = c = 0;
    }
    if (n[0] & 5) throw n[1];
    return { value: n[0] ? n[1] : void 0, done: true };
  }
}
function Zb(e, t, r) {
  for (var l = 0, i = t.length, c; l < i; l++) (c || !(l in t)) && (c || (c = Array.prototype.slice.call(t, 0, l)), c[l] = t[l]);
  return e.concat(c || Array.prototype.slice.call(t));
}
var tn = 914400, e0 = 12700, dc = `\r
`, b6 = 2147483649, $b = /^[0-9a-fA-F]{6}$/, y6 = 1.67, S6 = 27, tp = { type: "solid", color: "666666", pt: 1 }, G2 = [0.05, 0.1, 0.05, 0.1], ap = { color: "363636", pt: 1 }, yh = { color: "888888", style: "solid", size: 1, cap: "flat" }, sd = "000000", Vd = 12, A6 = 18, rp = "LAYOUT_16x9", Oy = "DEFAULT", W2 = "333333", ph = { type: "outer", blur: 3, offset: 23e3 / 12700, angle: 90, color: "000000", opacity: 0.35, rotateWithShape: true }, Cv = [0.5, 0.5, 0.5, 0.5], Jw = { color: "000000" }, x6 = { size: 8, color: "FFFFFF", opacity: 0.75 }, $u = "2094734552", ng = "2094734553", gv = "2094734554", Dy = "2094734555", K2 = "2094734556", uv = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""), mv = ["C0504D", "4F81BD", "9BBB59", "8064A2", "4BACC6", "F79646", "628FC6", "C86360", "C0504D", "4F81BD", "9BBB59", "8064A2", "4BACC6", "F79646", "628FC6", "C86360"], w6 = ["5DA5DA", "FAA43A", "60BD68", "F17CB0", "B2912F", "B276B2", "DECF3F", "F15854", "A7A7A7", "5DA5DA", "FAA43A", "60BD68", "F17CB0", "B2912F", "B276B2", "DECF3F", "F15854", "A7A7A7"], up;
(function(e) {
  e.left = "left", e.center = "center", e.right = "right", e.justify = "justify";
})(up || (up = {}));
var fp;
(function(e) {
  e.b = "b", e.ctr = "ctr", e.t = "t";
})(fp || (fp = {}));
var q2 = "{F7021451-1387-4CA6-816F-3879F97B5CBC}", Fy;
(function(e) {
  e.arraybuffer = "arraybuffer", e.base64 = "base64", e.binarystring = "binarystring", e.blob = "blob", e.nodebuffer = "nodebuffer", e.uint8array = "uint8array";
})(Fy || (Fy = {}));
var zy;
(function(e) {
  e.area = "area", e.bar = "bar", e.bar3d = "bar3D", e.bubble = "bubble", e.bubble3d = "bubble3D", e.doughnut = "doughnut", e.line = "line", e.pie = "pie", e.radar = "radar", e.scatter = "scatter";
})(zy || (zy = {}));
var By;
(function(e) {
  e.accentBorderCallout1 = "accentBorderCallout1", e.accentBorderCallout2 = "accentBorderCallout2", e.accentBorderCallout3 = "accentBorderCallout3", e.accentCallout1 = "accentCallout1", e.accentCallout2 = "accentCallout2", e.accentCallout3 = "accentCallout3", e.actionButtonBackPrevious = "actionButtonBackPrevious", e.actionButtonBeginning = "actionButtonBeginning", e.actionButtonBlank = "actionButtonBlank", e.actionButtonDocument = "actionButtonDocument", e.actionButtonEnd = "actionButtonEnd", e.actionButtonForwardNext = "actionButtonForwardNext", e.actionButtonHelp = "actionButtonHelp", e.actionButtonHome = "actionButtonHome", e.actionButtonInformation = "actionButtonInformation", e.actionButtonMovie = "actionButtonMovie", e.actionButtonReturn = "actionButtonReturn", e.actionButtonSound = "actionButtonSound", e.arc = "arc", e.bentArrow = "bentArrow", e.bentUpArrow = "bentUpArrow", e.bevel = "bevel", e.blockArc = "blockArc", e.borderCallout1 = "borderCallout1", e.borderCallout2 = "borderCallout2", e.borderCallout3 = "borderCallout3", e.bracePair = "bracePair", e.bracketPair = "bracketPair", e.callout1 = "callout1", e.callout2 = "callout2", e.callout3 = "callout3", e.can = "can", e.chartPlus = "chartPlus", e.chartStar = "chartStar", e.chartX = "chartX", e.chevron = "chevron", e.chord = "chord", e.circularArrow = "circularArrow", e.cloud = "cloud", e.cloudCallout = "cloudCallout", e.corner = "corner", e.cornerTabs = "cornerTabs", e.cube = "cube", e.curvedDownArrow = "curvedDownArrow", e.curvedLeftArrow = "curvedLeftArrow", e.curvedRightArrow = "curvedRightArrow", e.curvedUpArrow = "curvedUpArrow", e.custGeom = "custGeom", e.decagon = "decagon", e.diagStripe = "diagStripe", e.diamond = "diamond", e.dodecagon = "dodecagon", e.donut = "donut", e.doubleWave = "doubleWave", e.downArrow = "downArrow", e.downArrowCallout = "downArrowCallout", e.ellipse = "ellipse", e.ellipseRibbon = "ellipseRibbon", e.ellipseRibbon2 = "ellipseRibbon2", e.flowChartAlternateProcess = "flowChartAlternateProcess", e.flowChartCollate = "flowChartCollate", e.flowChartConnector = "flowChartConnector", e.flowChartDecision = "flowChartDecision", e.flowChartDelay = "flowChartDelay", e.flowChartDisplay = "flowChartDisplay", e.flowChartDocument = "flowChartDocument", e.flowChartExtract = "flowChartExtract", e.flowChartInputOutput = "flowChartInputOutput", e.flowChartInternalStorage = "flowChartInternalStorage", e.flowChartMagneticDisk = "flowChartMagneticDisk", e.flowChartMagneticDrum = "flowChartMagneticDrum", e.flowChartMagneticTape = "flowChartMagneticTape", e.flowChartManualInput = "flowChartManualInput", e.flowChartManualOperation = "flowChartManualOperation", e.flowChartMerge = "flowChartMerge", e.flowChartMultidocument = "flowChartMultidocument", e.flowChartOfflineStorage = "flowChartOfflineStorage", e.flowChartOffpageConnector = "flowChartOffpageConnector", e.flowChartOnlineStorage = "flowChartOnlineStorage", e.flowChartOr = "flowChartOr", e.flowChartPredefinedProcess = "flowChartPredefinedProcess", e.flowChartPreparation = "flowChartPreparation", e.flowChartProcess = "flowChartProcess", e.flowChartPunchedCard = "flowChartPunchedCard", e.flowChartPunchedTape = "flowChartPunchedTape", e.flowChartSort = "flowChartSort", e.flowChartSummingJunction = "flowChartSummingJunction", e.flowChartTerminator = "flowChartTerminator", e.folderCorner = "folderCorner", e.frame = "frame", e.funnel = "funnel", e.gear6 = "gear6", e.gear9 = "gear9", e.halfFrame = "halfFrame", e.heart = "heart", e.heptagon = "heptagon", e.hexagon = "hexagon", e.homePlate = "homePlate", e.horizontalScroll = "horizontalScroll", e.irregularSeal1 = "irregularSeal1", e.irregularSeal2 = "irregularSeal2", e.leftArrow = "leftArrow", e.leftArrowCallout = "leftArrowCallout", e.leftBrace = "leftBrace", e.leftBracket = "leftBracket", e.leftCircularArrow = "leftCircularArrow", e.leftRightArrow = "leftRightArrow", e.leftRightArrowCallout = "leftRightArrowCallout", e.leftRightCircularArrow = "leftRightCircularArrow", e.leftRightRibbon = "leftRightRibbon", e.leftRightUpArrow = "leftRightUpArrow", e.leftUpArrow = "leftUpArrow", e.lightningBolt = "lightningBolt", e.line = "line", e.lineInv = "lineInv", e.mathDivide = "mathDivide", e.mathEqual = "mathEqual", e.mathMinus = "mathMinus", e.mathMultiply = "mathMultiply", e.mathNotEqual = "mathNotEqual", e.mathPlus = "mathPlus", e.moon = "moon", e.noSmoking = "noSmoking", e.nonIsoscelesTrapezoid = "nonIsoscelesTrapezoid", e.notchedRightArrow = "notchedRightArrow", e.octagon = "octagon", e.parallelogram = "parallelogram", e.pentagon = "pentagon", e.pie = "pie", e.pieWedge = "pieWedge", e.plaque = "plaque", e.plaqueTabs = "plaqueTabs", e.plus = "plus", e.quadArrow = "quadArrow", e.quadArrowCallout = "quadArrowCallout", e.rect = "rect", e.ribbon = "ribbon", e.ribbon2 = "ribbon2", e.rightArrow = "rightArrow", e.rightArrowCallout = "rightArrowCallout", e.rightBrace = "rightBrace", e.rightBracket = "rightBracket", e.round1Rect = "round1Rect", e.round2DiagRect = "round2DiagRect", e.round2SameRect = "round2SameRect", e.roundRect = "roundRect", e.rtTriangle = "rtTriangle", e.smileyFace = "smileyFace", e.snip1Rect = "snip1Rect", e.snip2DiagRect = "snip2DiagRect", e.snip2SameRect = "snip2SameRect", e.snipRoundRect = "snipRoundRect", e.squareTabs = "squareTabs", e.star10 = "star10", e.star12 = "star12", e.star16 = "star16", e.star24 = "star24", e.star32 = "star32", e.star4 = "star4", e.star5 = "star5", e.star6 = "star6", e.star7 = "star7", e.star8 = "star8", e.stripedRightArrow = "stripedRightArrow", e.sun = "sun", e.swooshArrow = "swooshArrow", e.teardrop = "teardrop", e.trapezoid = "trapezoid", e.triangle = "triangle", e.upArrow = "upArrow", e.upArrowCallout = "upArrowCallout", e.upDownArrow = "upDownArrow", e.upDownArrowCallout = "upDownArrowCallout", e.uturnArrow = "uturnArrow", e.verticalScroll = "verticalScroll", e.wave = "wave", e.wedgeEllipseCallout = "wedgeEllipseCallout", e.wedgeRectCallout = "wedgeRectCallout", e.wedgeRoundRectCallout = "wedgeRoundRectCallout";
})(By || (By = {}));
var Pd;
(function(e) {
  e.text1 = "tx1", e.text2 = "tx2", e.background1 = "bg1", e.background2 = "bg2", e.accent1 = "accent1", e.accent2 = "accent2", e.accent3 = "accent3", e.accent4 = "accent4", e.accent5 = "accent5", e.accent6 = "accent6";
})(Pd || (Pd = {}));
var jy;
(function(e) {
  e.left = "left", e.center = "center", e.right = "right", e.justify = "justify";
})(jy || (jy = {}));
var Hy;
(function(e) {
  e.top = "top", e.middle = "middle", e.bottom = "bottom";
})(Hy || (Hy = {}));
var Ev;
(function(e) {
  e.ACTION_BUTTON_BACK_OR_PREVIOUS = "actionButtonBackPrevious", e.ACTION_BUTTON_BEGINNING = "actionButtonBeginning", e.ACTION_BUTTON_CUSTOM = "actionButtonBlank", e.ACTION_BUTTON_DOCUMENT = "actionButtonDocument", e.ACTION_BUTTON_END = "actionButtonEnd", e.ACTION_BUTTON_FORWARD_OR_NEXT = "actionButtonForwardNext", e.ACTION_BUTTON_HELP = "actionButtonHelp", e.ACTION_BUTTON_HOME = "actionButtonHome", e.ACTION_BUTTON_INFORMATION = "actionButtonInformation", e.ACTION_BUTTON_MOVIE = "actionButtonMovie", e.ACTION_BUTTON_RETURN = "actionButtonReturn", e.ACTION_BUTTON_SOUND = "actionButtonSound", e.ARC = "arc", e.BALLOON = "wedgeRoundRectCallout", e.BENT_ARROW = "bentArrow", e.BENT_UP_ARROW = "bentUpArrow", e.BEVEL = "bevel", e.BLOCK_ARC = "blockArc", e.CAN = "can", e.CHART_PLUS = "chartPlus", e.CHART_STAR = "chartStar", e.CHART_X = "chartX", e.CHEVRON = "chevron", e.CHORD = "chord", e.CIRCULAR_ARROW = "circularArrow", e.CLOUD = "cloud", e.CLOUD_CALLOUT = "cloudCallout", e.CORNER = "corner", e.CORNER_TABS = "cornerTabs", e.CROSS = "plus", e.CUBE = "cube", e.CURVED_DOWN_ARROW = "curvedDownArrow", e.CURVED_DOWN_RIBBON = "ellipseRibbon", e.CURVED_LEFT_ARROW = "curvedLeftArrow", e.CURVED_RIGHT_ARROW = "curvedRightArrow", e.CURVED_UP_ARROW = "curvedUpArrow", e.CURVED_UP_RIBBON = "ellipseRibbon2", e.CUSTOM_GEOMETRY = "custGeom", e.DECAGON = "decagon", e.DIAGONAL_STRIPE = "diagStripe", e.DIAMOND = "diamond", e.DODECAGON = "dodecagon", e.DONUT = "donut", e.DOUBLE_BRACE = "bracePair", e.DOUBLE_BRACKET = "bracketPair", e.DOUBLE_WAVE = "doubleWave", e.DOWN_ARROW = "downArrow", e.DOWN_ARROW_CALLOUT = "downArrowCallout", e.DOWN_RIBBON = "ribbon", e.EXPLOSION1 = "irregularSeal1", e.EXPLOSION2 = "irregularSeal2", e.FLOWCHART_ALTERNATE_PROCESS = "flowChartAlternateProcess", e.FLOWCHART_CARD = "flowChartPunchedCard", e.FLOWCHART_COLLATE = "flowChartCollate", e.FLOWCHART_CONNECTOR = "flowChartConnector", e.FLOWCHART_DATA = "flowChartInputOutput", e.FLOWCHART_DECISION = "flowChartDecision", e.FLOWCHART_DELAY = "flowChartDelay", e.FLOWCHART_DIRECT_ACCESS_STORAGE = "flowChartMagneticDrum", e.FLOWCHART_DISPLAY = "flowChartDisplay", e.FLOWCHART_DOCUMENT = "flowChartDocument", e.FLOWCHART_EXTRACT = "flowChartExtract", e.FLOWCHART_INTERNAL_STORAGE = "flowChartInternalStorage", e.FLOWCHART_MAGNETIC_DISK = "flowChartMagneticDisk", e.FLOWCHART_MANUAL_INPUT = "flowChartManualInput", e.FLOWCHART_MANUAL_OPERATION = "flowChartManualOperation", e.FLOWCHART_MERGE = "flowChartMerge", e.FLOWCHART_MULTIDOCUMENT = "flowChartMultidocument", e.FLOWCHART_OFFLINE_STORAGE = "flowChartOfflineStorage", e.FLOWCHART_OFFPAGE_CONNECTOR = "flowChartOffpageConnector", e.FLOWCHART_OR = "flowChartOr", e.FLOWCHART_PREDEFINED_PROCESS = "flowChartPredefinedProcess", e.FLOWCHART_PREPARATION = "flowChartPreparation", e.FLOWCHART_PROCESS = "flowChartProcess", e.FLOWCHART_PUNCHED_TAPE = "flowChartPunchedTape", e.FLOWCHART_SEQUENTIAL_ACCESS_STORAGE = "flowChartMagneticTape", e.FLOWCHART_SORT = "flowChartSort", e.FLOWCHART_STORED_DATA = "flowChartOnlineStorage", e.FLOWCHART_SUMMING_JUNCTION = "flowChartSummingJunction", e.FLOWCHART_TERMINATOR = "flowChartTerminator", e.FOLDED_CORNER = "folderCorner", e.FRAME = "frame", e.FUNNEL = "funnel", e.GEAR_6 = "gear6", e.GEAR_9 = "gear9", e.HALF_FRAME = "halfFrame", e.HEART = "heart", e.HEPTAGON = "heptagon", e.HEXAGON = "hexagon", e.HORIZONTAL_SCROLL = "horizontalScroll", e.ISOSCELES_TRIANGLE = "triangle", e.LEFT_ARROW = "leftArrow", e.LEFT_ARROW_CALLOUT = "leftArrowCallout", e.LEFT_BRACE = "leftBrace", e.LEFT_BRACKET = "leftBracket", e.LEFT_CIRCULAR_ARROW = "leftCircularArrow", e.LEFT_RIGHT_ARROW = "leftRightArrow", e.LEFT_RIGHT_ARROW_CALLOUT = "leftRightArrowCallout", e.LEFT_RIGHT_CIRCULAR_ARROW = "leftRightCircularArrow", e.LEFT_RIGHT_RIBBON = "leftRightRibbon", e.LEFT_RIGHT_UP_ARROW = "leftRightUpArrow", e.LEFT_UP_ARROW = "leftUpArrow", e.LIGHTNING_BOLT = "lightningBolt", e.LINE_CALLOUT_1 = "borderCallout1", e.LINE_CALLOUT_1_ACCENT_BAR = "accentCallout1", e.LINE_CALLOUT_1_BORDER_AND_ACCENT_BAR = "accentBorderCallout1", e.LINE_CALLOUT_1_NO_BORDER = "callout1", e.LINE_CALLOUT_2 = "borderCallout2", e.LINE_CALLOUT_2_ACCENT_BAR = "accentCallout2", e.LINE_CALLOUT_2_BORDER_AND_ACCENT_BAR = "accentBorderCallout2", e.LINE_CALLOUT_2_NO_BORDER = "callout2", e.LINE_CALLOUT_3 = "borderCallout3", e.LINE_CALLOUT_3_ACCENT_BAR = "accentCallout3", e.LINE_CALLOUT_3_BORDER_AND_ACCENT_BAR = "accentBorderCallout3", e.LINE_CALLOUT_3_NO_BORDER = "callout3", e.LINE_CALLOUT_4 = "borderCallout3", e.LINE_CALLOUT_4_ACCENT_BAR = "accentCallout3", e.LINE_CALLOUT_4_BORDER_AND_ACCENT_BAR = "accentBorderCallout3", e.LINE_CALLOUT_4_NO_BORDER = "callout3", e.LINE = "line", e.LINE_INVERSE = "lineInv", e.MATH_DIVIDE = "mathDivide", e.MATH_EQUAL = "mathEqual", e.MATH_MINUS = "mathMinus", e.MATH_MULTIPLY = "mathMultiply", e.MATH_NOT_EQUAL = "mathNotEqual", e.MATH_PLUS = "mathPlus", e.MOON = "moon", e.NON_ISOSCELES_TRAPEZOID = "nonIsoscelesTrapezoid", e.NOTCHED_RIGHT_ARROW = "notchedRightArrow", e.NO_SYMBOL = "noSmoking", e.OCTAGON = "octagon", e.OVAL = "ellipse", e.OVAL_CALLOUT = "wedgeEllipseCallout", e.PARALLELOGRAM = "parallelogram", e.PENTAGON = "homePlate", e.PIE = "pie", e.PIE_WEDGE = "pieWedge", e.PLAQUE = "plaque", e.PLAQUE_TABS = "plaqueTabs", e.QUAD_ARROW = "quadArrow", e.QUAD_ARROW_CALLOUT = "quadArrowCallout", e.RECTANGLE = "rect", e.RECTANGULAR_CALLOUT = "wedgeRectCallout", e.REGULAR_PENTAGON = "pentagon", e.RIGHT_ARROW = "rightArrow", e.RIGHT_ARROW_CALLOUT = "rightArrowCallout", e.RIGHT_BRACE = "rightBrace", e.RIGHT_BRACKET = "rightBracket", e.RIGHT_TRIANGLE = "rtTriangle", e.ROUNDED_RECTANGLE = "roundRect", e.ROUNDED_RECTANGULAR_CALLOUT = "wedgeRoundRectCallout", e.ROUND_1_RECTANGLE = "round1Rect", e.ROUND_2_DIAG_RECTANGLE = "round2DiagRect", e.ROUND_2_SAME_RECTANGLE = "round2SameRect", e.SMILEY_FACE = "smileyFace", e.SNIP_1_RECTANGLE = "snip1Rect", e.SNIP_2_DIAG_RECTANGLE = "snip2DiagRect", e.SNIP_2_SAME_RECTANGLE = "snip2SameRect", e.SNIP_ROUND_RECTANGLE = "snipRoundRect", e.SQUARE_TABS = "squareTabs", e.STAR_10_POINT = "star10", e.STAR_12_POINT = "star12", e.STAR_16_POINT = "star16", e.STAR_24_POINT = "star24", e.STAR_32_POINT = "star32", e.STAR_4_POINT = "star4", e.STAR_5_POINT = "star5", e.STAR_6_POINT = "star6", e.STAR_7_POINT = "star7", e.STAR_8_POINT = "star8", e.STRIPED_RIGHT_ARROW = "stripedRightArrow", e.SUN = "sun", e.SWOOSH_ARROW = "swooshArrow", e.TEAR = "teardrop", e.TRAPEZOID = "trapezoid", e.UP_ARROW = "upArrow", e.UP_ARROW_CALLOUT = "upArrowCallout", e.UP_DOWN_ARROW = "upDownArrow", e.UP_DOWN_ARROW_CALLOUT = "upDownArrowCallout", e.UP_RIBBON = "ribbon2", e.U_TURN_ARROW = "uturnArrow", e.VERTICAL_SCROLL = "verticalScroll", e.WAVE = "wave";
})(Ev || (Ev = {}));
var Wn;
(function(e) {
  e.AREA = "area", e.BAR = "bar", e.BAR3D = "bar3D", e.BUBBLE = "bubble", e.BUBBLE3D = "bubble3D", e.DOUGHNUT = "doughnut", e.LINE = "line", e.PIE = "pie", e.RADAR = "radar", e.SCATTER = "scatter";
})(Wn || (Wn = {}));
var Uy;
(function(e) {
  e.TEXT1 = "tx1", e.TEXT2 = "tx2", e.BACKGROUND1 = "bg1", e.BACKGROUND2 = "bg2", e.ACCENT1 = "accent1", e.ACCENT2 = "accent2", e.ACCENT3 = "accent3", e.ACCENT4 = "accent4", e.ACCENT5 = "accent5", e.ACCENT6 = "accent6";
})(Uy || (Uy = {}));
var Bf;
(function(e) {
  e.chart = "chart", e.image = "image", e.line = "line", e.rect = "rect", e.text = "text", e.placeholder = "placeholder";
})(Bf || (Bf = {}));
var Qi;
(function(e) {
  e.chart = "chart", e.hyperlink = "hyperlink", e.image = "image", e.media = "media", e.online = "online", e.placeholder = "placeholder", e.table = "table", e.tablecell = "tablecell", e.text = "text", e.notes = "notes";
})(Qi || (Qi = {}));
var Sv;
(function(e) {
  e.title = "title", e.body = "body", e.image = "pic", e.chart = "chart", e.table = "tbl", e.media = "media";
})(Sv || (Sv = {}));
var Zw;
(function(e) {
  e.DEFAULT = "&#x2022;", e.CHECK = "&#x2713;", e.STAR = "&#x2605;", e.TRIANGLE = "&#x25B6;";
})(Zw || (Zw = {}));
var hp = "data:image/png;base64,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", C6 = "data:image/png;base64,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AAAAAACAlFAAAwAAAAAAAKSEAhgAAAAAAAAgJRTAAAAAAAAAACmhAAYAAAAAAABICQUwAAAAAAAAQEoogAEAAAAAAABSQgEMAAAAAAAAkBIKYAAAAAAAAICUUAADAAAAAAAApIQCGAAAAAAAACAlFMAAAAAAAAAAKaEABgAAAAAAAEgJBTAAAAAAAABASiiAAQAAAAAAAFJCAQwAAAAAAACQEgpgAAAAAAAAgJRQAAMAAAAAAACkhAIYAAAAAAAAICUUwAAAAAAAAAApoQAGAAAAAAAASAkFMAAAAAAAAEBKKIABAAAAAAAAUkIBDAAAAAAAAJASCmAAAAAAAACAlFAAAwAAAAAAAKSEAhgAAAAAAAAgJRTAAAAAAAAAACmhAAYAAAAAAABICQUwAAAAAAAAQEoogAEAAAAAAABSQgEMAAAAAAAAkBIKYAAAAAAAAICUUAADAAAAAAAApIQCGAAAAAAAACAlFMAAAAAAAAAAKaEABgAAAAAAAEgJBTAAAAAAAABASiiAAQAAAAAAAFJCAQwAAAAAAACQEgpgAAAAAAAAgJRQAAMAAAAAAACkhAIYAAAAAAAAICUUwAAAAAAAAAApoQAGAAAAAAAASAkFMAAAAAAAAEBKKIABAAAAAAAAUkIBDAAAAAAAAJASCmAAAAAAAACAlFAAAwAAAAAAAKSEAhgAAAAAAAAgJRTAAAAAAAAAACmhAAYAAAAAAABICQUwAAAAAAAAQEoogAEAAAAAAABSQgEMAAAAAAAAkBIKYAAAAAAAAICUUAADAAAAAAAApIQCGAAAAAAAACAlFMAAAAAAAAAAKaEABgAAAAAAAEgJBTAAAAAAAABASiiAAQAAAAAAAFJCAQwAAAAAAACQEgpgAAAAAAAAgJRQAAMAAAAAAACkhAIYAAAAAAAAICUUwAAAAAAAAAApoQAGAAAAAAAASAkFMAAAAAAAAEBKKIABAAAAAAAAUkIBDAAAAAAAAJASCmAAAAAAAACAlFAAAwAAAAAAAKSEAhgAAAAAAAAgJRTAAAAAAAAAACmhAAYAAAAAAABICQUwAAAAAAAAQEoogAEAAAAAAABSQgEMAAAAAAAAkBIKYAAAAAAAAICUUAADAAAAAAAApIQCGAAAAAAAACAlFMAAAAAAAAAAKaEABgAAAAAAAEgJBTAAAAAAAABASiiAAQAAAAAAAFJCAQwAAAAAAACQEgpgAAAAAAAAgJRQAAMAAAAAAACkhAIYAAAAAAAAICUUwAAAAAAAAAApoQAGAAAAAAAASAkFMAAAAAAAAEBKKIABAAAAAAAAUkIBDAAAAAAAAJASCmAAAAAAAACAlFAAAwAAAAAAAKSEAhgAAAAAAAAgJRTAAAAAAAAAACmhAAYAAAAAAABICQUwAAAAAAAAQEoogAEAAAAAAABSQgEMAAAAAAAAkBIKYAAAAAAAAICUUAADAAAAAAAApIQCGAAAAAAAACAlFMAAAAAAAAAAKaEABgAAAAAAAEgJBTAAAAAAAABASiiAAQAAAAAAAFJCAQwAAAAAAACQEgpgAAAAAAAAgJRQAAMAAAAAAACkhAIYAAAAAAAAICUUwAAAAAAAAAApoQAGAAAAAAAASAkFMAAAAAAAAEBKKIABAAAAAAAAUkIBDAAAAAAAAJASCmAAAAAAAACAlFAAAwAAAAAAAKSEAhgAAAAAAAAgJRTAAAAAAAAAACmhAAYAAAAAAABICQUwAAAAAAAAQEoogAEAAAAAAABSQgEMAAAAAAAAkBIKYAAAAAAAAICUUAADAAAAAAAApIQCGAAAAAAAACAlFMAAAAAAAAAAKaEABgAAAAAAAEgJBTAAAAAAAABASiiAAQAAAAAAAFJCAQwAAAAAAACQEgpgAAAAAAAAgJRQAAMAAAAAAACkhAIYAAAAAAAAICUUwAAAAAAAAAApoQAGAAAAAAAASAkFMAAAAAAAAEBKKIABAAAAAAAAUkIBDAAAAAAAAJASCmAAAAAAAACAlFAAAwAAAAAAAKSEAhgAAAAAAAAgJRTAAAAAAAAAACmhAAYAAAAAAABICQUwAAAAAAAAQEoogAEAAAAAAABSQgEMAAAAAAAAkBIKYAAAAAAAAICUUAADAAAAAAAApIQCGAAAAAAAACAlFMAAAAAAAAAAKaEABgAAAAAAAEgJBTAAAAAAAABASiiAAQAAAAAAAFJCAQwAAAAAAACQEgpgAAAAAAAAgJRQAAMAAAAAAACkhAIYAAAAAAAAICUUwAAAAAAAAAApoQAGAAAAAAAASAkFMAAAAAAAAEBKKIABAAAAAAAAUkIBDAAAAAAAAJASCmAAAAAAAACAlFAAAwAAAAAAAKSEAhgAAAAAAAAgJRTAAAAAAAAAACmhAAYAAAAAAABICQUwAAAAAAAAQEoogAEAAAAAAABSQgEMAAAAAAAAkBIKYAAAAAAAAICUUAADAAAAAAAApIQCGAAAAAAAACAlFMAAAAAAAAAAKaEABgAAAAAAAEgJBTAAAAAAAABASiiAAQAAAAAAAFJCAQwAAAAAAACQEgpgAAAAAAAAgJRQAAMAAAAAAACkhAIYAAAAAAAAICUUwAAAAAAAAAApoQAGAAAAAAAASAkFMAAAAAAAAEBKKIABAAAAAAAAUkIBDAAAAAAAAJASCmAAAAAAAACAlFAAAwAAAAAAAKSEAhgAAAAAAAAgJRTAAAAAAAAAACmhAAYAAAAAAABICQUwAAAAAAAAQEoogAEAAAAAAABSQgEMAAAAAAAAkBIKYAAAAAAAAICUUAADAAAAAAAApIQCGAAAAAAAACAlFMAAAAAAAAAAKaEABgAAAAAAAEgJBTAAAAAAAABASiiAAQAAAAAAAFJCAQwAAAAAAACQEgpgAAAAAAAAgJRQAAMAAAAAAACkhAIYAAAAAAAAICUUwAAAAAAAAAApoQAGAAAAAAAASAkFMAAAAAAAAEBKKIABAAAAAAAAUkIBDAAAAAAAAJASCmAAAAAAAACAlFAAAwAAAAAAAKREkRUAAACwrUpLSwuGDRvWfMCAAS26du3avKysrLiioqKkZcuWzZs1a1bcvHnz0tLS0rJsNtusuLi4ebNmzUoLCgo+8/eijY2N9Zs3b66pra2tqqur21xTU1NdVVVVs2nTptqNGzdWbdiwoeYvf/nL5hUrVlQtWLBgw6xZs6pqamoaJQYAAEDaKYABAACIiIghQ4aUHnTQQW379u3bql27dq3at2/fpkWLFq2bN29eWVpa2qpZs2bNCwsLm2ez2fLCwsLyoqKi8sLCwtKknK+hoaG6vr6+qqGh4S91dXV/aWhoqNq8eXNVTU3NuqqqqvUbNmxYu2rVqjWrV69e99Zbb6177rnnPpgzZ06NTwYAAABJogAGAADIA8OGDWt+xBFHdBwwYECnLl26dGjdunXHFi1adCgtLe1YUlLSvlmzZq0KCgqK07yDwsLCssLCwrKIaPdp/zuNjY21mzdvXrdp06ZVNTU172/YsGHl2rVr31+2bNnKBQsWrHjyySffnzVrVpVPGAAAAE1Fpuexsd9HfaF+ZcSal0ptCAAAIAE6deqUPf744zvtueeeXbp3796lbdu2XSorKzuXlpZ2KS0t7VBYWFhhSztGQ0PDxpqampU1NTXL169fv+yDDz5Y9s477yybPXv2sj/96U8rVqxYUWdLAAAAbE9t9q6Jog4f/TUFMAAAQEJks9nMt7/97Y4jRozo1bdv397t2rXrXl5e3rWsrKxzcXFx+4gosKUmp7G2tnZVTU3Nso0bNy5btWrV0tdff/2tJ598cvG999672noAAADYFgpgAACAhPne977X6a9Fb/v27Xu1bNmyV1lZWa8kvXOXLauvr9/wl7/8ZdG6desWL1u2bNHChQsX/fGPf1w8derUjbYDAADAliiAAQAAmqhsNps59dRTuxx66KH9+/Tp87n27dv3Ly8v719UVOSRzXlq06ZNKzZu3Pj6+++//8abb775xqOPPvrG3XffvcpmAAAA+CsFMAAAQBNx6qmndvniF784qHfv3v3btWv3uYqKis8VFhaW2wxbUl9fv37Dhg1vfPDBB68vXrz4jccee2z+jTfeuNxmAAAA8pMCGAAAYBc45phjWn/rW9/aq3///kPatGnTv6Kiop9HOLO9NDQ0VG/cuPGtNWvWLFy4cOGcO+6445WHHnporc0AAACknwIYAABgJzjjjDO6f+lLX9qrV69eg1u3bj2orKysR0RkbIadJFddXb103bp18xcvXjz30UcffeXqq69+x1oAAADSRwEMAACwnZWWlhb86le/2u3QQw8d1r17931btmw5qLCwsMxmaEoaGhqqP/zww/nvvPPOzGeeeWbW2LFj36ipqWm0GQAAgGRTAAMAAGwHP/7xj7t+9atf3bdXr15D27Ztu1c2m21jKyRJXV3dmg8++OCVRYsWvfznP/95xh/+8IdltgIAAJA8CmAAAIBtcOKJJ7Y75ZRTDujXr9+w1q1bD81ms61shTSpq6tbt3bt2pfffPPNWbfccsvUe++9d7WtAAAANH0KYAAAgE+hoqKi4IILLhg0YsSI/bp27bpfy5YtB2YymUKbIR/kcrmGDz/8cP6777474/nnn59x4YUXvrZx40aPiwYAAGiCFMAAAAAf4/jjj2/7/e9//8D+/fsf2Lp1630KCgpKbAUiGhsbN61fv37eW2+9NeWGG2545u67715lKwAAAE2DAhgAAOB/ZLPZzAUXXPC5I4888sDu3bsfWFFRsVtEFNgMbFl1dfWSd999d8qsWbNmnnvuuS+vW7euwVYAAAB2DQUwAACQ10pLSwsuvfTSQYcccsjBXbt2HVFWVtbDVmDb1dbWrnr//fdfmDp16uRf/vKXL65evbreVgAAAHYeBTAAAJB3Bg0aVHrBBRd8fs899zywQ4cOBxQVFbWwFdj+Ghsba9euXTtrzpw5T59//vmTX3755WpbAQAA2LEUwAAAQF4YNmxY8/POO+/gIUOGHOZ9vrDz/W0ZfNFFFz07a9asKlsBAADY/hTAAABAarVq1arwyiuv3HfEiBEjO3TocFBhYWGZrcCu19DQUP3+++8/O2XKlIk/+clPZm7cuLHRVgAAALYPBTAAAJAqrVq1Kvztb3+7/3777Xd4x44dRxQWFpbbCjRdDQ0NG99///0pM2bMeOqHP/zhC8pgAACAz0YBDAAApMJZZ53V45vf/OaRvXr1GllaWtrVRiB5ampq3l28ePHEO++8c9LVV1/9jo0AAABsPQUwAACQWMOHDy+/6KKLvjB48OCjW7RoMdBGID0+/PDDV+fNmzfhvPPOe3L69Ol/sREAAIBPRwEMAAAkSqtWrQpvuOGGQ/bbb79/atOmzX6ZTCZrK5BeuVyubs2aNTNmzJjx2JgxYyavW7euwVYAAAA+ngIYAABIhB//+Mddv/e9732lZ8+e/1RcXNzWRiD/1NbWfvD2228/dssttzz029/+9l0bAQAA+L8UwAAAQJNVUVFRcO21137+4IMPPrZ169b7ZTKZAlsBIqJxzZo1M59//vnxp5122hR3BQMAAPx/CmAAAKDJOeWUUzqefvrpx/bu3ftL2Wy2jY0AH6e+vn7j0qVLH/vd7373x+uvv36ZjQAAAPlOAQwAADQJ2Ww2c+uttx5wyCGHnNC6deu9I8LdvsDWaFy7du1L06ZN+/OPfvSjZ1evXl1vJQAAQD5SAAMAALtU//79S6655pp/2nPPPY8tLy/vayPAZ1VTU7NswYIF488999wHp06dutFGAACAfKIABgAAdomf//znPU855ZQTu3btemRhYWGZjQDbW2NjY92KFSuevOWWW+689NJLF9kIAACQDxTAAADATuMxz8Cusn79+rlPP/30f5188slT6+rqcjYCAACklQIYAADY4fr27Vv8hz/84a+Pee5nI8CuUlNT8+68efPu/8EPfvDgwoULN9kIAACQNgpgAABghxkyZEjpNddc89XBgwefWFxc3MFGgKaitrZ21dy5c+/5yU9+8uc5c+bU2AgAAJAWWyqAPYoNAADYJqNHj+4wb968n06ZMuXRYcOGnaH8BZqa4uLi9sOGDTtjypQpj86bN++nJ510UntbAQAA0s4dwAAAwFY599xze33/+9//dufOnY/IZDJZGwGSIpfL1S1fvvzJG2644fbLLrvsbRsBAACSyiOgAQCAz+y8887r+53vfOfbHTt2PDyTyRTaCJBUuVyuYcWKFU/cdNNN//XrX/96sY0AAABJowAGAAC22WWXXTboG9/4xg9at249zDaAtFm7du2su++++9pzzjnnNdsAAACSQgEMAABsNcUvkE8UwQAAQJIogAEAgE9N8Qvks7Vr18665557rvv5z38+3zYAAICmaksFcGHlwOj6UV9orIqoWZG1PQAAyBO/+MUvet9xxx3nHHrooT8pLS3tYiNAPiotLe2y7777HvP973+/X1lZ2ZIpU6assxUAAKCpKetcHwXlH/01BTAAAOS5M844o/u99957zpe//OWflZeX94qIjK0AeS5TXl7e8+CDDx71/e9/v3dEvDVjxowPrQUAAGgqFMAAAMD/ceKJJ7a77777fjJq1Kh/KS8v7xOKX4B/lCkvL+99+OGHj/rWt77VfvXq1Qvnz59fbS0AAMCutqUC2DuAAQAgzwwdOrTs+uuvP6l///4nFRYWltkI20NjY2Ns2rQpqquro6amJurr62PTpk2xefPmqK+vj+rq6qivr4/NmzfHpk2boqGhYZv/fxUWFkZJSUk0a9YsioqKoqysLIqKiqJZs2ZRUlISRUVFUVpa+r9/FRQUCIjtoqGhoeq11167a8yYMffMmTOnxkYAAIBdZUvvAFYAAwBAnujUqVP2nnvuGbXXXnudnM1mK22Ej9PQ0BAbN26MDRs2/J+/Nm7cGBs3boyamprYtGlTbNq0KWpqaqK2trbJnqe4uDhKSkqitLT0f/9eUVERFRUV0aJFi//zV0VFRRQWFvog8LHq6urWvvjii7eceOKJf169enW9jQAAADubAhgAAPLcXXfdddAXv/jF00tLS7vZRn7L5XKxYcOGWLt2baxbty7Wrl37d3+tW7cuNmzYkPd7atGiRbRu3TpatWoVrVu3jjZt2vzvf27dunW0aNHCh4morq5e+sgjj1zzne98Z6ptAAAAO5MCGAAA8tTVV189+MQTTzyzoqJioG3kj8bGxli5cmUsX748Pvjgg1i9evX//n3t2rXR2NhoSZ9RYWFhtGrVKtq1axdt27b937937tw5OnTo4LHTeWbDhg3z77333qvOPPPMebYBAADsDApgAADIM1/72tfaXHrppad27979qIjQRKVUQ0NDrFq1KlasWBHvv//+//595cqVTfqRzGlXXFwcHTp0iI4dO0bnzp2jY8eO0alTp2jXrp1HS6dYLpdrfOeddx76+c9/fv2ECRPW2QgAALAjKYABACBP9OrVq9ldd931jT322OM7hYWFZTaSHh9++GG88847sXTp0njvvfdixYoVsXr16mhoaLCchCgsLIz27dtHp06dolu3btG9e/fo3r27x0mnTENDQ9W8efNu++Y3v/nHJUuWbLYRAABgR1AAAwBAHrjrrrtG/NM//dOZJSUlXWwj2davXx9Lly6Nd955539L3w8//NBiUqqysvJ/y+C//tWqVSuLSbiamppljz322G9Gjx49xTYAAIDtTQEMAAAp9qtf/arPD3/4w5+1atVqL9tIno0bN8aSJUvirbfeikWLFsV7770XmzZtspg8V1JSEl27do0+ffpE3759o3fv3lFeXm4xCbRu3bqXr7322ivGjh27yDYAAIDtRQEMAAApNGjQoNI77rjju7vttttJBQUFWRtJhtWrV8ebb74ZixcvjiVLlsTy5cujsbHRYtiigoKC6Ny5c/Tu3Tt69+4d/fr1i7Zt21pMQjQ2Nta98cYbd33rW9+6ff78+TU2AgAAfFYKYAAASJHS0tKCBx988Jj99tvvn7PZbBsbaboaGhri7bffjrfeeisWLFgQS5YscXcv201FRUX06tUr+vbtG3379o2ePXtGYWGhxTRhdXV1a2bMmHHjV77ylYdqamr85gcAALDNFMAAAJASp59+erdf/vKX51ZWVu5jG03T6tWr47XXXouFCxfGm2++GRs3brQUdooWLVpE3759Y8CAATFw4EB3CDdh69evf/E//uM//vPqq69+xzYAAIBtoQAGAICEGzRoUOm99977w969ex+byWTc4teErF+/PubNmxcLFiyIN954Q+FLk9GiRYvo169fDBgwIPbYY4+orKy0lCYkl8s1LF68eNyJJ554rcdCAwAAW0sBDAAACXbNNdcMOemkk35RVlbWyzZ2vVwuF++++27MnTs3XnvttViyZIl3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B7lcrm7y5Mm//vKXv/yIbQAAwK63pXcAK4ABAMg7paWlBTNnzjyzT58+x9vG39uwYUOMGzcuZsyY4VHPQF7KZDKx3377xde//vWoqKiwkH+waNGiP+27775X1dTUeCwEAADsQgpgAAD4H926dctOnjz5V506dRppG/9fLpeLqVOnxp///OfYuHGjhQB5r6KiIkaNGhX777+/x0L/g+XLlz9+6KGHXvLuu+/W2QYAAOwaWyqAvQMYAIC8MXz48PInnnjiynbt2o2wjf/vnXfeiWuvvTaee+652Lx5s4UARMTmzZtjzpw58dprr0XPnj2jRYsWlvI/Kioq+n7rW98aMnXq1Ofee+89f3AAAMAusKV3ACuAAQDIC9/+9rc73n777X9o0aLFANv4b1VVVXHXXXfFvffeG+vXr7cQgI+wbt26eP7552P9+vWx2267RVFRkaVERElJSefjjjvuoA8++GDKK6+88hcbAQCAnUsBDABAXjv//PP7XXzxxX8oKSnpbBv/bfr06XHttdfGokWLLAPgU3jnnXdi2rRp0bp16+jc2R8nERHZbLbyC1/4whElJSUvTp48eY2NAADAzqMABgAgb/3ud7/b60c/+tFVRUVFrWwjYs2aNXHzzTfHpEmTora21kIAtkJtbW289NJL8c4770Tfvn2jtLQ073dSWFhYNnz48C/26dNn4UMPPbTMpwQAAHYOBTAAAHnp1ltv3f+b3/zmfxYWFjbP913kcrl4/vnn4/rrr4/ly5f7cAB8BitXroxp06ZFRUVFdOvWLTKZTF7vo6CgIDto0KBDBw0atOiBBx54xycEAAB2vC0VwJmex8Z+H/WF+pURa17ym6wAACTTww8//KXDDjvsXzKZTN6/rPGDDz6I22+/Pd544w0fDIDtbMCAAfGtb30r2rRpk/e7yOVyjVOmTPn1yJEjH/LJAACAHavN3jVR1OGjv6YABgAgdV555ZXTPve5z30r3/fQ0NAQjz32WDz++ONRV1fngwGwg2Sz2Tj66KPjC1/4QhQUFOT9Pl5//fU79tprr9/7ZAAAwI6jAAYAIC9ks9nMyy+/fFafPn2Oz/ddvPvuu3HbbbfFe++954MBsJN069YtvvOd70S3bt3yfhdLliy5f5999rmypqam0ScDAAC2PwUwAACpV1paWjBr1qyzevfufVw+7yGXy8WTTz4ZDz74oLt+AXaBbDYbxxxzTBxxxBF5fzfw0qVLHxg6dOjlSmAAANj+FMAAAKRar169mk2ePHlsu3btDsrnPaxcuTJuueWWePvtt30oAHaxnj17ximnnBIdOnTI6z2sXr16yiGHHPIvS5Ys2exTAQAA28+WCuDCyoHR9aO+0FgVUbMia3sAADRpQ4cOLXvqqacub9Omzf75uoNcLhfPPPNMXH/99bF27VofCoAmYP369TFlypQoKSmJnj17RiaTycs9NG/evPtJJ500ZPLkyc+sWLHCoykAAGA7KetcHwXlH/01BTAAAIk1ZMiQ0kceeeSKVq1a7Z2vO6iuro7bb789nnjiiWhs9IRNgKaksbEx5s+fH++//34MGDAgstn8/DlLaWlpp6997WuDn3rqqadXrlxZ75MBAACfnQIYAIDUOfTQQ1s8+OCDv2/ZsuUe+bqDOXPmxNVXX+2RzwBN3PLly+OFF16Ijh075u0joUtLSzudcMIJ+7/00ktPv/3227U+FQAA8NkogAEASJVhw4Y1v++++37TsmXLQfl4/vr6+hg/fnz88Y9/jNpaP0MHSILNmzfHiy++GJs3b47ddtstCgoK8m4HxcXFbY866qg9n3vuuaeXL1/ucdAAAPAZKIABAEiNI488snLcuHG/b9GixcB8PP97770XV111VcyZM8eHASCBFi1aFC+//HL069cvWrRokXfnLykp6XDcccftP2fOnGcWLVq0yScCAAC2jQIYAIBUOPLIIyvvvPPO35aXl++Wj+d/+umn48Ybb4wPP/zQhwEgwf7yl7/ECy+8ECUlJdGrV6+8O3+zZs3aHHXUUfspgQEAYNspgAEASLxjjz227W233faH5s2b98m3s1dVVcXNN98cTz31VDQ2NvowAKRAY2NjzJ8/P5YtWxYDBgyIZs2a5dX5mzVr1uaYY4458M0333xm4cKFNT4RAACwdRTAAAAk2qGHHtritttuuzofy9+33347rrnmmli8eLEPAkAKvf/++/HKK69Enz59orKyMq/Ons1mK4888sh9Zs6c+dTSpUs3+zQAAMCnpwAGACCxjjjiiJb33nvvteXl5f3y6dy5XC4mTZoUN998c1RVVfkgAKRYVVVVTJ06NbLZbPTp0ycymUzenL24uLjtV7/61c+/8sorTy1evLjWpwEAAD4dBTAAAIl06KGHtrj33nt/l2/lb3V1ddx0000xefLkyOVyPggAeSCXy8WCBQvi3Xffjd133z2y2fz5mUyzZs1aH3300fvNmDHjSXcCAwDAp6MABgAgcYYOHVo2fvz4qysqKgbk07mXLVsWV111lUc+A+SplStXxiuvvBKf+9znoqKiIm/O3axZszZHH3300GeeeebJFStW1PkkAADAlimAAQBIlCFDhpQ++uij17Rs2XL3fDr31KlT49prr42NGzf6EADksaqqqpg+fXq0bds2unTpkjfnLikpaT9q1KihTz755JMrV66s90kAAICPt6UCuMB6AABoSjp16pSdMGHCv1dWVu6RL2dubGyMcePGxR133BF1dW56AiCitrY2br755hg/fnw0NjbmzbkrKyv3mDBhwr9369bNXQkAALCNFMAAADQZrVq1Kpw+ffolbdq02T9fzlxdXR2/+93vYtKkSd73C8DfyeVy8fjjj8fvf//7qK6uzptzt2nTZv8pU6Zc0qpVq0KfAgAA2HoKYAAAmoSKioqC2bNnX9KuXbuD8uXMS5cujYsuuijmz5/vAwDAx3r11VfjoosuiqVLl+bNmdu1a3fQ7Nmz/72iosLPrgAAYCu5iAYAoEmYOXPmz9q1a3dIvpz35ZdfjiuuuCLWrVsnfAA+0bp16+KKK66Il19+OW/O3K5du4Nnzpz5M+kDAMDWUQADALDLvfjii2N69OgxKh/Omsvl4oEHHogbbrghamtrhQ/Ap1ZbWxs33HBDPPDAA3nz2oAePXqMevHFF8dIHwAAPj0FMAAAu9SkSZO+NnDgwFPy4ax1dXVx8803x8SJE73vF4BtksvlYuLEiXHLLbdEXV1dXpx54MCBJ0+aNOlr0gcAgE9HAQwAwC7z6KOPHnXggQeekw9nXbduXfz617+OWbNmCR6Az2zmzJnx61//Ol9eJZA58MADz3n00UePkjwAAHyywsqB0fWjvtBYFVGzImtDAADsEDfeeOO+Rx999EWZTKYw7Wddvnx5XHXVVbFy5UrBA7DdbNiwIWbPnh0DBw6MioqKtB8307179/179uz56sMPP7xc+gAA5LuyzvVRUP7RX1MAAwCw011xxRV7fPe7372qoKCgWdrPOmfOnPjtb38bGzduFDwA2111dXVMmzYtOnfuHB07dkz1WTOZTOHuu+9+eJs2bV6aNGnSKukDAJDPFMAAADQZZ5xxRvef/exnvy0sLCxP+1knTJgQd999d9TX1wsegB2moaEhXnrppchms9G3b99UnzWTyRTttddeB/3lL395dubMmRukDwBAvlIAAwDQJBx00EEVf/jDH64pLi7ulOZz5nK5eOCBB+Kxxx4TOgA77c+eBQsWRF1dXfTv3z8ymUxqz1pQUFBywAEHDJs+ffqkpUuXbpY+AAD5aEsFcIH1AACwMwwaNKj0vvvuu7qsrKxXms9ZV1cX1113XUyaNEnoAOx0EydOjOuvvz7q6upSfc6ysrJef/rTn67u379/idQBAODvKYABANjhKioqCh577LGLKyoqBqb5nNXV1XHNNdfE7NmzhQ7ALvPKK6/ElVdeGVVVVak+Z4sWLQZOnDhxbEVFhZ9vAQDA33CBDADADjdz5syftW3b9sA0n3HdunVx2WWXxRtvvCFwAHa5xYsXx2WXXRZr165N9TnbtWt34MyZM38mcQAA+P8UwAAA7FBPPvnkqB49eoxK8xlXrVoVV1xxRSxfvlzgADQZK1asiCuuuCJWrlyZ6nP26NFj1KRJk0ZJHAAA/lth5cDo+lFfaKyKqFmRtSEAALbZjTfeuO+XvvSlCzOZTGp/8fDdd9+NK6+8MtatWydwAJqc6urqmDVrVvTv3z8qKytTe85u3boN79mz57yHH37Yb2MBAJAXyjrXR0H5R39NAQwAwA5x3nnn9T311FOvLigoKE7rGV977bW45pprorq6WuAANFmbN2+OGTNmRI8ePaJ9+/apPGMmkykYNGjQIYWFhVOee+45v5UFAEDqKYABANipjjrqqFb/8R//8YdmzZq1SusZX3755bj++uujrq5O4AA0eQ0NDfHSSy9Fp06dolOnTqk8Y0FBQXbYsGGfnz9//qQ33nhjk9QBAEizLRXA3gEMAMB21a1bt+wNN9zwnyUlJR3TesYpU6bEjTfeGPX19QIHIDHq6+vjxhtvjKlTp6b2jCUlJZ1uuOGG/+jWrZu7GgAAyFsKYAAAtqunn376XyorK/dI6/kmTZoUd955ZzQ2NgobgMRpbGyMO+64I5588snUnrGysnLw008//UtpAwCQrxTAAABsN88///w3unTp8k9pPd/EiRNj3LhxkcvlhA1AYuVyubj//vtTXQJ36dLlS88+++yJ0gYAIB95BzAAANvFTTfdNPzII488L5PJZNJ4vsceeyzGjx8vaABS47XXXotmzZpF3759U3m+zp0779urV695Dz/88DJpAwCQNlt6B7ACGACAz+wXv/hF7x/+8IdXFxQUNEvj+R544IF45JFHBA1A6ixYsCDq6upiwIABqTtbJpPJDBo06ODGxsbnpk6dul7aAACkiQIYAIAd5oADDqj43e9+99tmzZq1TeP5xo0bF5MmTRI0AKm1aNGi2Lx5cwwcODB1ZysoKMjut99+w5577rnH33vvvc3SBgAgLbZUAHsHMAAA2yybzWbuvPPOfyktLe2exvNNmDBB+QtAXpg0aVI89NBDqTxbaWlpj3vuuedfstlsRtIAAOQDBTAAANvs+eef/06HDh0OTePZHn744Xj44YeFDEDeeOSRR+LPf/5zKs/WoUOHw5599tlvSxkAgHygAAYAYJvcd999hw8ePPjUNJ7t/vvvjwkTJggZgLzz2GOPxX333ZfKs+25554/+NOf/nSYlAEASDvvAAYAYKudccYZ3ceMGXN5QUFBcdrONnHixHjkkUeEDEDeWrx4cWSz2ejbt2/ajpbp06fPvn/5y18mz5w5c4OkAQBIsi29A1gBDADAVhk2bFjzG2+88Q/NmjVrl7azPfroo6l99CUAbI2FCxdGUVFR9OvXL1XnKigoKD7wwAP3e/LJJx9dsWJFnaQBAEiqLRXAHgENAMBWuffee39ZWlraPW3nevzxx+PBBx8UMAD8jz//+c8xceLE1J2rtLS0x3333fdLCQMAkFYKYAAAPrVJkyaN6tSp0xEpPFeMHz9ewADwD8aPHx+TJ09O3bk6der0hUmTJn1VwgAApJFHQAMA8Kmcd955fU888cR/z2QyRWk618yZM+Puu+8WMAB8jNdeey06duwYnTt3TtW5unbtuk9BQcHzzz333DopAwCQNN4BDADAZ3LEEUe0vOKKK67NZrOVaTrXyy+/HDfffHPkcjkhA8DHyOVyMXv27OjSpUt06tQpNefKZDJF++yzz/CpU6c+9u67726WNAAASeIdwAAAbLNsNpu55ZZb/q2kpKRjms61YMGCuPnmm6OxsVHIAPAJGhsb4+abb44333wzVecqLS3tcvfdd5+fzWYzUgYAIC0UwAAAbNGkSZO+3rZt2wPTdKZly5bFDTfcEPX19QIGgE+prq4urr322li+fHmqztWuXbsDH3/88VESBgAgLTwCGgCAj3XZZZcN+upXvzo2k8mk5hcH33///bjyyiujqqpKwACwlerq6uLll1+OIUOGRHl5eWrO1aVLl31LS0unPvPMM2ukDABAEngENAAAW61///4lJ5988q8ymUxRWs60YcOG+P3vfx8bN24UMABso40bN8bvfve7VP15WlBQkP3hD394ft++fYslDABA4q9vrQAAgI/y4IMPnl1WVtYrLeeprq6O3/zmN7Fq1SrhAsBntGrVqrjyyiujuro6NWcqKyvr8/DDD58lXQAAkk4BDADA/zF+/Pgju3XrdnRazlNfX5/KdxYCwK60fPnyuO6666K+vj41Z+rRo8dXx40bd4R0AQBIMgUwAAB/53vf+16nI4444py0nCeXy8Vtt90Wb7zxhnABYDt7/fXX47bbbotcLpeaMx155JHnfvvb3+4oXQAAkkoBDADA/6qoqCi4+OKLLywsLCxPy5nGjx8fs2bNEi4A7CCzZs2Khx56KDXnKSwsrPj1r399QUVFhZ+bAQCQSC5kAQD4XxMnThxdWVk5OC3nef7552PixImCBYAd7LHHHosXXnghNeeprKzc89FHHz1RsgAAJFFh5cDo+lFfaKyKqFmRtSEAgDxxwQUX7DZq1KgLM5lMYRrO8+qrr8Ytt9ySqkdSAkBT/7O3d+/e0a5du1Scp2PHjkNzudxzU6ZMWSddAACamrLO9VHwMc/wcwcwAADRt2/f4h//+McXZzKZVPwG4HvvvRc33HBDNDY2ChcAdpKGhoa47rrrYtmyZak4T0FBQfbss88e27dv32LpAgCQqGtZKwAAYPz48T8qKyvrkYazbNiwIX7/+99HbW2tYAFgJ9u0aVP8/ve/j40bN6biPGVlZb3GjRs3RrIAACSJAhgAIM/ddNNNw/v06XN8Gs5SX18f1157baxdu1awALCLrFmzJq699tqor69PxXn69ev3jd///vdDJQsAQFIogAEA8thBBx1Uceyxx/5rRGTScJ477rgjFi9eLFgA2MUWLVoUd955Z1qOU/CNb3zj34YNG9ZcsgAAJOIC1goAAPLXzTfffFZxcXG7NJxl4sSJMX36dKECQBMxbdq0mDRpUirOUlJS0unOO+88Q6oAACSBAhgAIE/913/914FdunT5UhrO8tprr8Wf//xnoQJAEzN+/PhYsGBBKs7SrVu3o2+66abhUgUAoKlTAAMA5KEvfelLlV/5yld+lYazrFixIq6//vpobGwULAA0MY2NjXHdddfFihUr0nCczHHHHfergw46qEKyAAA0ZQpgAIA8dPXVV5+ezWYrk36OmpqauPbaa2PTpk1CBYAmatOmTXHttddGTU1N4s+SzWbb3njjjT+RKgAATZkCGAAgz9x6663Du3Tp8uWknyOXy8Utt9wSK1euFCoANHErV66MW2+9NXK5XOLP4lHQAAA0dQpgAIA8MnTo0LKvfvWrv0jDWSZMmBBz584VKgAkxJw5c+Kxxx5LxVlGjRr1i6FDh5ZJFQCApkgBDACQR+64444fFRcXd0z6OV5++eV45JFHBAoACfPQQw+l4he4SkpKOt5xxx0/lCgAAE2RAhgAIE9cfvnlu/fs2XNU0s/xwQcfxB133JGKR0gCQL7J5XJx2223xZo1axJ/lp49ex57+eWX7y5VAACaGgUwAEAe6NatW/a73/3uv2YymURf/9XX18cNN9wQ1dXVQgWAhKqqqoobb7wx6uvrE32OTCZT8N3vfvdX3bp1y0oVAICmRAEMAJAHxo8ff0pZWVmvpJ/jnnvuiaVLlwoUABJuyZIlcd999yX+HGVlZT3Hjx9/ikQBAGhKFMAAACn385//vOeAAQNGJ/0c06dPjylTpggUAFJi8uTJMWPGjMSfY8CAAaN//vOf95QoAABNhQIYACDFstls5qyzzjo3k8kk+tGEK1asiLvvvlugAJAyd911V6xYsSLRZ8hkMtmzzjrr3Gw2m5EoAABNgQIYACDFxo0b98XKysq9knyG2trauOGGG6K2tlagAJAyf/1zfvPmzYk+R2Vl5V7jxo0bKVEAAJoCBTAAQEoNHz68/OCDDz4t6ee4//77Y/ny5QIFgJRavnx5jBs3LvHnGDFixI+HDRvWXKIAAOxqCmAAgJS69dZbT8tms22TfIYZM2bEc889J0wASLnJkyfHzJkzE32G4uLitrfffvtp0gQAYFdTAAMApNBVV121R48ePb6S5DOsXLky7rrrLmECQJ64++6744MPPkj0GXr27PnVK664Yg9pAgCwKymAAQBSprS0tOAb3/jGT5N8rdfY2Bi333679/4CQB6pqamJ2267LRobG5N8jIJvfvObZ5aWlvqZGwAAu+6i1AoAANJlwoQJX6uoqBiQ5DOMHz8+Fi1aJEwAyDNvvvlmPPjgg4k+Q4sWLQY9+OCDx0gTAIBdRQEMAJAiRx55ZOWwYcN+kOQzzJ07N5544glhAkCemjhxYixYsCDRZxg+fPiPjjjiiJbSBABgV1AAAwCkyBVXXHFyUVFRRVLnr6qqijvvvDNyuZwwASBP5XK5uP3226O6ujqxZygqKmrxm9/85mRpAgCwKyiAAQBS4vzzz+/Xu3fv45J8httvvz0+/PBDYQJAnlu3bl3cfvvtiT5D7969jz///PP7SRMAgJ1NAQwAkALZbDZz6qmn/jyTyST2+m769OkxZ84cYQIAERExe/bsmDFjRmLnz2QyBaeeeurPs9lsRpoAAOxMCmAAgBT44x//eERlZeXgpM6/du3auPfeewUJAPyde+65J9atW5fY+SsrKwf/6U9/+oIkAQDYmRTAAAAJ17dv3+JDDjnkR0k+w9133x01NTXCBAD+Tk1NTdx9992JPsPBBx/8o759+xZLEwCAnUUBDACQcHfdddc3S0pKOiV1/smTJ8e8efMECQB8pLlz58azzz6b2PlLSko63nPPPd+SJAAAO4sCGAAgwb70pS9VDhw48KSkzr9mzZoYP368IAGALXrggQdizZo1iZ2/f//+Jx111FGtJAkAwM6gAAYASLArrrji1MLCwvIkzp7L5eK2226LTZs2CRIA2KJNmzbFbbfdFrlcLpHzFxYWll1++eU/kCQAADuDAhgAIKF+8Ytf9O7evftXkjr/s88+G2+88YYgAYBP5Y033ojnn38+sfN369bt6F/96ld9JAkAwI6mAAYASKgf/vCHP8pkMom8nvvggw/igQceECIAsFXGjRsX69atS+TsmUym4NRTT/2xFAEA2NEUwAAACXTdddcNa9eu3YFJnD2Xy8Udd9wRtbW1ggQAtsqmTZvizjvvTOz8bdq02f+mm27aT5IAAOxICmAAgIQpLS0t+NrXvnZ6Uud/4YUXYuHChYIEALbJq6++GjNmzEjs/Mccc8zpFRUVfiYHAMAO42ITACBhbr/99oMrKip2S+LsGzZsiHHjxgkRAPhM7r///qiqqkrk7OXl5X3/67/+6wgpAgCwoyiAAQASpKKiouCwww47Nanz33vvvYn9YS0A0HRs2LAh7r///sTOf9BBB/1zq1atCiUJAMCOoAAGAEiQ+++//+iysrKeSZx9zpw58dJLLwkRANguXnjhhViwYEEiZy8tLe32xz/+8StSBABgR1AAAwAkRN++fYv33Xfff07i7LW1tXHvvfcKEQDYru6+++6oq6tL5Oz77bffKf379y+RIgAA25sCGAAgIW6++eZRxcXFbZM4+yOPPBJr164VIgCwXa1atSoee+yxRM6ezWbb3njjjV+TIgAA25sCGAAgAYYOHVq21157fSeJs7/33nvxxBNPCBEA2CEmTpwYK1asSOTsQ4YM+c7QoUPLpAgAwPakAAYASIBrr732xKKiosqkzZ3L5eKee+6JxsZGIQIAO0R9fX3cddddkcvlEjd7UVFR5bXXXnuCFAEA2J4UwAAATdwBBxxQMWDAgG8kcfYZM2bEW2+9JUQAYId6880348UXX0zk7AMGDPjG8OHDy6UIAMD2ogAGAGjirrrqqhOKiooqkjb3pk2b4oEHHhAgALBT3H///VFbW5u4uYuKilpcffXV7gIGAGC7UQADADRhBx10UEX//v0Teffvww8/HB9++KEQAYCdYv369TFhwoREzj5w4MBvHHDAARVSBABge1AAAwA0Yf/5n/95bGFhYfOkzb1q1aqYPHmyAAGAnerpp5+O1atXJ27uwsLC8ssuu2yUBAEA2B4UwAAATdQBBxxQMWjQoNFJnP3uu++O+vp6IQIAO1V9fX3cddddiZx99913/+bQoUPLpAgAwGelAAYAaKIuv/zyYwsLC8uTNvfcuXNjwYIFAgQAdokFCxbE3LlzEzd3UVFRi9/97ndflyAAAJ+VAhgAoAkaOnRo2aBBgxL37t+6urr405/+JEAAYJf605/+FHV1dYmbe/fdd//mkCFDSiUIAMBnoQAGAGiCfvOb33ylqKioZdLmfu655xL53j0AIF1Wr14dzz33XOLmLioqann11VcfLUEAAD4LBTAAQBPTq1evZoMHD/5m0uaurq6ORx55RIAAQJPwyCOPRHV1deLmHjJkyLe6deuWlSAAANtKAQwA0MTcdNNNxxQXF7dN2twTJkyIqqoqAQIATUJVVVUifzmtuLi43a233uouYAAAtpkCGACgCWnVqlXhXnvtdVLS5l61alU8++yzAgQAmpTJkyfHqlWrEjf30KFDR7dq1apQggAAbAsFMABAE3LLLbccXlJS0jlpcz/44INRX18vQACgSamvr48HH3wwcXOXlJR0vummmw6VIAAA20IBDADQRGSz2cwBBxzw7aTNvWjRonjppZcECAA0SS+99FIsXrw4cXOPGDHiO9lsNiNBAAC2lgIYAKCJuOaaa/YuLy/vm7S5H3roocjlcgIEAJqkXC6XyLuAy8vL+1111VV7SRAAgK2lAAYAaCK+8pWvfDdpM8+bNy8WLlwoPACgSVu4cGG8+uqrrg8BAMgLCmAAgCbgsssuG1RZWblPkmbO5XIxfvx44QEAifDAAw8k7qklrVu33veSSy7pLz0AALaGAhgAoAkYNWrUCUmbefbs2bFs2TLhAQCJsGzZsnjllVcSN/cJJ5xwovQAANgaCmAAgF3sn//5nzt37NjxiCTN3NjYGA888IDwAIBEGT9+fDQ0NCRq5k6dOn1h9OjRHaQHAMCnpQAGANjFfvSjH30tk8kk6rps2rRpsWrVKuEBAImyatWqeOGFFxI1cyaTKfzpT386SnoAAHxaCmAAgF1o0KBBpX369Plqkmaur6+PCRMmCA8ASKQJEyZEXV1dombu27fvV/r27VssPQAAPg0FMADALnTZZZcdXlRUVJGkmadOnRpr164VHgCQSOvXr48pU6YkauaioqLK3/zmN0dIDwCAT0MBDACwi2Sz2cy+++57UpJmrqurc/cvAJB4jz76aOLuAt5///1PymazGekBAPBJFMAAALvI1VdfPbSsrKx3kmaeMmVKbNiwQXgAQKJt2LAhnn/++UTNXFZW1ueqq67aS3oAAHwSBTAAwC7y5S9/+bgkzVtfXx8TJ04UHACQCo8//nji7gL+0pe+dLzkAAD4JApgAIBdYPTo0R3atm07IkkzT5s2LdatWyc8ACAVPvzww5g+fXqiZm7fvv2I0aNHd5AeAABbogAGANgFfvrTn47KZDKFSZm3vr4+HnnkEcEBAKnyyCOPRH19fWLmzWQyhT/96U+/JjkAALZEAQwAsJN16tQp26dPn6OTNLO7fwGANFq3bl1MmzYtUTP36dPnmE6dOmWlBwDAx1EAAwDsZFddddUB2Wy2dVLmbWxsjEmTJgmOVOvYsWN06OCJmgD5aNKkSdHY2JiYebPZbOurrrrqAMkBAPBxFMAAADvZiBEjvp6keV988cVYtWqV4Ei1Ll26xIUXXhinnXZadO3a1UIA8siqVavipZdecj0JAEBqKIABAHaiM844o3tlZeXeSZk3l8vFxIkTBUdeyGQyMXjw4PjVr34VY8aMcUcwQB55/PHHI5fLJWbeysrKvc8444zukgMA4KMogAEAdqJTTjnlqxGRScq8CxYsiPfee09w5JVMJhN77713XHjhhTFmzJho3769pQCk3HvvvRcLFy5M1B9X/3NdCQAA/4cCGABgJ+nVq1ezXr16fTlJM3v3L/nsr0XwBRdcECeffHK0bdvWUgBSLGnXPb169fpyr169mkkOAIB/pAAGANhJrrjiioOLiopaJmXeBN4JAztEYWFhDB8+PC688MIYPXp0VFZWWgpACi1YsCCWLVuWmHmLiopaXnnllYdIDgCAf6QABgDYSYYPH/6VJM2btHfhwY5WVFQUI0aMiEsuuSRGjx4dLVu2tBSAFMnlcvH4448naub99tvvK5IDAOAfKYABAHaC0aNHd6isrByalHnXrl0bL7/8suDgI/y1CL744ovjhBNOiBYtWlgKQEq89NJLsW7dusTMW1lZudfo0aM7SA4AgL+lAAYA2AlOP/30o5J07fXMM89EQ0OD4GALiouL47DDDouxY8fGqFGjoqyszFIAEq6hoSGeeeaZJI1c8D/XmQAA8P8vEq0AAGDHymazmX79+n05KfPW1tbGlClTBAefUnFxcYwcOTIuvfTSGDVqVJSWlloKQII9//zzUVtbm5h5+/Xr9+VsNpuRHAAAf6UABgDYwX7zm9/sWVJS0jkp886YMSOqq6sFB1uppKQkRo4cGZdcckkcffTRUVJSYikACVRdXR0zZ85M0p8/na+44orBkgMA4K8UwAAAO9gXvvCFLyVl1lwuF08//bTQ4DNo3rx5HHXUUXHJJZfEyJEjI5vNWgpAwjz11FORy+USM++RRx75ZakBAPBXCmAAgB1oyJAhpZ07dz4iKfO+/vrrsWLFCsHBdlBeXh6jRo2KSy+9VBEMkDArVqyI119/PTHzdunS5fD+/ft79AQAABGhAAYA2KHGjh17aGFhYWJeCOruX9j+KioqYtSoUXHxxRfH4YcfHkVFRZYC4LpouyosLGz+H//xHwdLDQCACAUwAMAOteeeex6ZlFnXrl0b8+bNExrsIK1atYrjjz8+LrroohgxYkQUFPh2DKApmzdvXqxZsyYx8+61115HSg0AgAgFMADADnPMMce0bt269b5Jmfe5556LxsZGwcEO1qZNmxg9enRcfPHFimCAJqyxsTGee+65JP35MvyYY45pLTkAAPykAQBgBznzzDMPz2Qyibjeqq+vj6lTpwoNdqK2bdvG6NGj47zzzovhw4crggGaoBdeeCHq6+sTMWsmkyk844wzDpUaAAB+wgAAsIP079//C0mZdc6cObFhwwahwS7QqVOnOPnkk+Pf/u3fYu+9945MJmMpAE3Ehg0bYvbs2YmZd8CAAR4DDQCAAhgAYEf43ve+16mysnKPpMybpMcbQlp17tw5xowZE7/61a8UwQBNyPPPP5+YWSsrKwd/73vf6yQ1AID8pgAGANgBTj755CMiIhHtzcqVK+P1118XGjQRXbt2jTFjxsQ555wTgwcPthCAXez111+PlStXJmXczMknn3y41AAA8psCGABgB+jXr19iHv88ZcqUyOVyQoMmpnfv3nHaaafFOeecE/3797cQgF0kl8vFlClTknQd6jHQAAB5TgEMALCdnX766d0qKip2S8Ks9fX1MW3aNKFBE9anT58466yz4pxzzonddtvNQgB2gWnTpkV9fX0iZq2oqNjt9NNP7yY1AID8pQAGANjORo8efURSZp03b15s3LhRaJAAffr0ibPPPjvOPPPM6Nmzp4UA7EQbN26MefPmuR4FACARFMAAANtZr169EvPetSQ9zhD4bwMGDIhf/vKXceaZZ0b37t0tBGAnmTp1apKuRw+TGABA/lIAAwBsR2eccUb38vLyvkmYdf369fHaa68JDRJqwIAB8S//8i9x2mmnRbdunvQJsKPNnz8/Pvzww0TMWl5e3u9HP/pRF6kBAOQnBTAAwHZ03HHHHZSUWWfMmBGNjY1CgwTLZDIxePDg+Nd//dcYM2ZMdOjQwVIAdpDGxsaYMWNGYub9xje+cYjUAADykwIYAGA76tOnz8FJmDOXyyXqMYbAlmUymdh7773jwgsvjDFjxkT79u0tBWAHeOGFF5J0XXqIxAAA8pMCGABgOznppJPat2zZcvckzLpkyZJYuXKl0CBl/loEX3DBBXHyySdH27ZtLQVgO1qxYkW8/fbbiZi1srJy0PHHH+8PAgCAPKQABgDYTr773e8eGBGZJMyapMcXAluvsLAwhg8fHhdeeGGMHj06KisrLQVgO5k+fXpSRi34/ve/f6DEAADyjwIYAGA72X333Q9Nwpz19fUxc+ZMgUEeKCoqihEjRsQll1wSo0ePjpYtW1oKwGc0c+bMqK+vT8SsAwcOPFRiAAD5RwEMALAdHHTQQRUtW7bcKwmzLly4MKqrq4UGeeSvRfDFF18cJ5xwQrRo0cJSALZRVVVVvP7664mYtVWrVkOHDx9eLjUAgPyiAAYA2A7OPvvsz2cymaIkzOrxz5C/iouL47DDDouxY8fGqFGjoqyszFIAtkFSnqaSyWSy55577uclBgCQXxTAAADbwe67735AEuasra2NOXPmCAzyXHFxcYwcOTIuvfRSRTDANpg9e3bU1dUlYtY99tjjAIkBAOQXBTAAwGfUqlWrwnbt2u2fhFnnzZsXtbW1QgMiIqKkpCRGjhwZY8eOjaOPPjpKSkosBeBT2LRpU8ybNy8Rs7Zv337/iooKPwMEAMgjLv4AAD6jCy+8cPeioqKKJMz64osvCgz4P5o3bx5HHXVUXHLJJTFy5MjIZrOWAvAJZs2alYg5i4qKWlx88cWDJAYAkD8UwAAAn9GBBx6YiMfqVVdXJ+ZOFWDXKC8vj1GjRsWll16qCAb4BPPmzYuamppEzHrQQQd5DDQAQB5RAAMAfEZdu3YdnoQ5582bF/X19QIDPlFFRUWMGjUqLr744jj88MOjqKjIUgD+QV1dXbz66quJmLVLly77SwwAIH8ogAEAPoNTTjmlY3l5+W5JmPXll18WGLBVWrVqFccff3xcdNFFMWLEiCgo8C0kwN966aWXEjFnRUXFbieddFJ7iQEA5AffvQMAfAYnnnji55MwZ21tbcyfP19gwDZp06ZNjB49OsaOHasIBvgb8+fPj9ra2iSMmvnud7/7eYkBAOQH37UDAHwGn/vc5/ZLwpwLFy6Muro6gQGfyV+L4PPOOy+GDx+uCAby3ubNm2PhwoWJmLVfv37DJQYAkB98tw4AsI1atWpV2Lp1672TMKvHPwPbU6dOneLkk0+Oc889NwYNGmQhQF6bPXt2IuZs06bN3hUVFX4WCACQB1z0AQBso/PPP39gYWFheVOfs76+PubMmSMwYLvr2bNn/OQnP4nzzjsv9t5778hkMpYC5J3Zs2dHfX19k5+zqKio4vzzzx8oMQCA9FMAAwBso/3333/fJMz5+uuvR01NjcCAHaZLly4xZsyYOOecc2Lw4MEWAuSV6urqeOONNxIx64EHHriPxAAA0k8BDACwjbp27ZqIxz/PnTtXWMBO0bt37zjttNPinHPOif79+1sIkDeScr3VvXv3vaUFAJB+CmAAgG0wZMiQ0srKyj2a+py5XM7jn4Gdrk+fPnHWWWfFOeecE7vttpuFAKk3e/bsyOVyTX7Oli1b7jlo0KBSiQEApJsCGABgG5x55pl7ZjKZbFOfc9myZbFu3TqBAbtEnz594uyzz44zzzwzevbsaSFAaq1bty6WL1/e5OfMZDLZs846a4jEAADSrcgKAAC23tChQ4clYc558+YJC9jlBgwYEAMGDIgFCxbE+PHjY+nSpZYCpM68efOiS5cuTX7OffbZZ5+ImC4xAID0cgcwAMA26Nix4z5JmHP+/PnCApqMAQMGxC9/+cs47bTTolu3bhYCpEpSrrs6deq0j7QAANJNAQwAsJWOOOKIlhUVFf2a+pxVVVWxaNEigQFNSiaTicGDB8e//uu/xpgxY6JDhw6WAqTCW2+9FVVVVU1+zoqKis8deuihLSQGAJBeCmAAgK108sknD46ITFOfc/78+dHY2CgwoEnKZDKx9957x4UXXhhjxoyJ9u3bWwqQaI2NjbFgwYJE/Cv4u9/97h4SAwBILwUwAMBW2n333fdMwpze/wskwV+L4AsuuCBOPvnkaNu2raUAiZWU66/BgwfvKS0AgPQqsgIAgK3Trl27wU19xlwul5Q7UAAiIqKwsDCGDx8e++yzT0ybNi0mTJgQ69evtxggURYsWBC5XC4ymab9sJgOHToMlhYAQHq5AxgAYCsMGjSotGXLlgOa+pzvvfdebNy4UWBA4hQVFcWIESPikksuidGjR0fLli0tBUiMDz/8MJYtW9bk52zZsuXA/v37l0gMACCdFMAAAFvhxz/+8aBMJtPkn6Li7l8g6f5aBI8dOzZOOOGEaNGihaUAibBw4cImP2Mmk8n+5Cc/GSAtAIB0UgADAGyFvffee88kzJmEHzwCfBrNmjWLww47LMaOHRujRo2KsrIySwGatKT8Il5SrmsBANh63gEMALAVunbtOqSpz1hfXx9vvvmmsIBUKS4ujpEjR8bBBx8czz77bDz++ONRXV1tMUCT8+abb0Z9fX0UFTXtH7t16dJlT2kBAKSTO4ABAD6lioqKgoqKikFNfc4lS5bE5s2bBQakUklJSYwcOTLGjh0bRx99dJSUeIUl0LTU1tbG0qVLm/ycLVu2HFRaWupngwAAKeQiDwDgUzr77LP7FhYWNvlnj7722mvCAlKvefPmcdRRR8Ull1wSI0eOjGbNmlkK4HpsKxQWFpafffbZvaQFAJA+CmAAgE9p//3375+EOV9//XVhAXmjvLw8Ro0aFf/+7/8eI0eOjGw2aymA67FP6fOf//xAaQEApI8CGADgU+rRo8fuTX3G2traePvtt4UF5J2KiooYNWpUXHzxxXH44Yc3+XdvAum2ePHiRLySo1evXoOkBQCQPgpgAIBPqXXr1k3+DoklS5ZEQ0ODsIC81apVqzj++OPj4osvjhEjRkRBgW97gZ2voaEhlixZ0uTnbNOmjQIYACCFfCcMAPApDBkypLR58+a9m/qcb775prAAIqJ169YxevToGDt2rCIYcF32MZo3b95n0KBBpdICAEgX3wEDAHwKp556av9MJtPkr53eeustYQH8jTZt2sTo0aPjvPPOi+HDhyuCAddlfyOTyRT84Ac/+Jy0AADSxXe+AACfwuDBg5v84/Hq6+tj0aJFwgL4CJ06dYqTTz45/u3f/i323nvvyGQylgLsUIsXL07Eqzn23HPPgdICAEgXBTAAwKfQpUuXAU19xnfeeSfq6uqEBbAFnTt3jjFjxiiCgR2utrY23n333SRc53oPMABAyiiAAQA+hZYtW/Zv6jN6/DPAp9elS5cYM2ZMnHvuuTF48GALAfL2+iwJ17kAAGwdBTAAwCcYPnx4eUlJSeemPqfHPwNsvV69esVpp50W55xzTvTvrwMB8u/6rLS0tPPw4cPLpQUAkB4KYACAT/Ctb31rt4ho8s8IXbx4sbAAtlGfPn3irLPOinPOOSd22203CwG2i4T8gl7m29/+dj9pAQCkhwIYAOAT7L777k2+CVi7dm1s2LBBWACfUZ8+feLss8+OM888M3r27GkhwGfy4Ycfxrp165r8nAMHDlQAAwCkSJEVAABsWadOnZr8D8TefvttQQFsRwMGDIgBAwbEggULYvz48bF06VJLAbb5Oq1Vq1audwEA2GkUwAAAn6CyslIBDJCnBgwYEP3794958+bFQw89FO+++66lAFtlyZIlsddeezX1613PvgcASBEFMADAFnTq1CnbvHnzXk19ziVLlggLYAfJZDIxePDg2GOPPeLll1+OBx98MFauXGkxQGqu05o3b967Xbt2RatXr66XGABA8nkHMADAFowZM6ZnJpPJNuUZGxsbPZoUYCfIZDKx9957x4UXXhhjxoyJ9u3bWwrwiZYuXRqNjY1NesaCgoLsqaee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k8nE7NmzY+LEibFmzRoNAXif/VNSzJo161kTAwBongTAAAC70O233/7KOeecszU/P78022sdMGBAtG/f3tWu0My9+uqrMWnSpFi1apVmALyPjh07xgEHHJCIWhsbG6u/8Y1v/NXUAACaJwEwAMAutHLlyob169fP6tat2+hsrzWVSsXhhx8ekyZNMjhohubMmROTJ0+OJUuWaAbAh3D44YdHKpVKRK3r16+fVVFR0WhqAADNU54WAADsWq+++mpirts77LDDDAyamTfffDP+/d//PX7yk58IfwE+pFQqFSNGjEhMva+88sozpgYA0Hw5AQwAsIvddNNNz5166qnV+fn5rbO91m7dukX//v1j4cKFBgc5btmyZfHYY4/F/PnzNQPgIzrggAOic+fOiai1sbFxy4033jjL1AAAmi8BMADALrZy5cqG8vLyGT179vx0Euo9+uijBcCQw5YvXx7jxo0T/AJ8wv1SUpSXlz9TXl7eYGoAAM2XABgAYDeYMWPGUxdccEEiAuAhQ4ZE69ato7q62uAgh6xcuTImTJgQc+fOjUwmoyEAH1ObNm3i0EMPTUy9zz777FOmBgDQvPkGMADAbvDVr371lYaGhk1JqLWgoCCOOOIIQ4McsW7duvj5z38ed955Z8yZM0f4C/AJjRw5MvLz8xNRa0NDw8abbrrpVVMDAGjenAAGANgNKisrm1atWjW9T58+5ySh3qOPPjqefPJJQREk2Pr16+Oxxx6L2bNn+3cZYBdJpVIxatSoxNS7cuXKadXV1WmTAwBo3pwABgDYTaZNm5aY6/c6duwYAwYMMDRIoA0bNsSvf/3r+Nd//dd49dVXhb8Au9CAAQOiY8eOian36aefftLUAAAQAAMA7CZf+9rX5tTX11ckpd6jjjrK0CBBqqqq4v77749vf/vb8eKLL0ZTU5OmAOxiRx55ZGJqra+vX/eNb3zjdVMDAMAV0AAAu0ltbW16xYoVT++///6fT0K9hx56aLRt2zaqqqoMD7LYli1bYsqUKfHcc8/F9u3bNQRgN2nbtm0MGTIkMfUuX778qdraWtc/AwDgBDAAwO70xz/+cUJSas3Pz4/jjjvO0CBL1dTUxKOPPhq33XZb/OUvfxH+Auxmxx57bOTn5yel3Myvf/3rCaYGAECEABgAYLe66667llZXV89PSr1HH310tGjRwuAgi7wd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qATAAABZ4umnn968fPnyxF3xN3r06GjXrp0BAgBZqUOHDnH88ccnru5ly5ZNmD59+hYTBADgoxIAAwBkkbvvvvtPmUymKUk1FxYWxumnn254AEBWOvPMMxP3yYpMJtN41113/dH0AAD4OATAAABZ5Be/+MWatWvXTkta3UcccUT06tXLAAGArNK7d+847LDDEld3eXn5X+6///51JggAwMchAAYAyDIPP/zwn5JWcyqVijPPPNPwAICsMmbMmEilUomr+8EHH/yT6QEA8HEJgAEAsszXv/71NzZs2DAraXUPHDgwDj74YAMEALLCoEGDYsCAAYmru6KiYuatt966wAQBAPi4BMAAAFlo3Lhxv01i3WPGjIm8PFtMAGDvysvLizFjxiSy9j//+c+/NUEAAD7RflgLAACyz/XXXz+nqqrqr0mru1evXnHUUUcZIACwVx1zzDHRvXv3xNW9adOmV2666aa5JggAwCchAAYAyFJ/+tOf7k1i3WPGjInS0lIDBAD2ijZt2sRZZ52VyNofeOCBe00QAIBPSgAMAJClbrrpprlJPAVcXFwcZ555pgECAHvFWWedFS1btkxc3Zs2bXrl5ptvnmeCAAB8UgJgAIAsNm7cuF8lse5Ro0ZF7969DRAA2KP69OkTI0eOTGTtjz322K9MEACAXUEADACQxcaOHTu7qqrqb0mrO5VKxfnnnx+pVMoQAYA9tv/4/Oc/n8j9R2Vl5d+uueaav5kiAAC7ggAYACDLTZ069bdJrLtv374xZMgQAwQA9ojDDjsssTeQTJ48+TcmCADAriIABgDIcpdeeumLVVVVryax9s9//vNRXFxsiADAblVaWhrnn39+Imuvqqr66+WXX/6SKQIAsKsIgAEAEuChhx76WRLrLisri9NPP90AAYDd6qyzzoqSkpIklp753e9+91MTBABgVxIAAwAkwA033DB3w4YNs5JY+3HHHRd9+vQxRABgt+jbt28cddRRiay9oqJi1te//vU3TBEAgF1JAAwAkBA///nPfxoR6aTVnUql4vOf/3zk5dl6AgC7Vn5+flx00UWRSqWSWH76F7/4xX+bIgAAu5q3cAAACXHHHXe8tW7duulJrL13795xzDHHGCIAsEudcMIJ0b1790TWXl5e/pc77rjjLVMEAGBXEwADACTI3XfffW8mk2lKYu1nnXVWtG3b1hAB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onv37vEv//IvccABBzSrdWcymaYnnnji9s997nPPeAoAAODDEQADAJBYDz/88NJjjjlmY+/evY+KiGZzFKq0tDSGDx8eq1evjvXr13sQAHLcwIED45prrol27do1t6VnZsyY8YOzzjprqqcAAAA+PAEwAACJdv/99795zDHHVO6zzz5HRDMKgVu0aBGHHXZYtGzZMhYuXBjpdNrDAJBjCgoK4pxzzonzzz8/WrRo0dyWn37uuefuOuWUUyZ4EgAA4KMRAAMAkHi///3v5w8bNmxF3759j2lO10GnUqno27dvDB06NBYvXhxbtmzxMADkiJ49e8YNN9wQgwcPblbf+434x7XPU6ZM+fbpp58+2ZMAAAAfnQAYAICc8OCDDy4ZNmzYin79+jWrEDgionXr1nHEEUdEfX19LF261MMAkGCpVCpOOOGEuOKKK6JNmzbNbv07wt9vnXPOOX/xNAAAwMcjAAYAIGc89NBDS4YNG7a8X79+xza3EDg/Pz8OPvjg6NWrV8yfPz8aGho8EAAJU1JSEpdffnmccMIJkZ+f3+zWn8lkGp944olvffazn53maQAAgI9PAAwAQE556KGHlo4cOXJdnz59RqWa252ZEdG1a9cYNmxYLFu2LCorKz0QAAnRt2/fuO6662K//fZrluvPZDLpp59++rvnnHPO054GAAD4ZATAAADknD/96U+LDj300KX7779/s7sOOiKiuLg4jjzyyCgpKYk333wz0um0hwIgSxUUFMRnP/vZuPDCC6OkpKRZ9iCdTjc88sgjt5x//vnTPREAAPDJCYABAMhJDz/88NId3wQelUqlmt09mqlUKvr06RMHH3xwLFy4MLZt2+ahAMgynTt3jrFjx8bQoUOjGV5aERH/CH+feOKJ2y+88MLnPBEAALBrCIABAMhZDz300JIePXq8NmjQoGPz8vJaNMcetG3bNkaNGhVNTU2xZMkSDwVAFkilUjF69Oi48soro0OHDs22D01NTdt++9vf/stll132oqcCAAB2HQEwAAA5bdKkSeXdu3efM3jw4GYbAufn58eAAQOiV69esWDBgti+fbsHA2Avad26dVx66aVx/PHHR35+frPtQ2NjY/WvfvWrf7nuuute81QAAMCuJQAGACDnTZ48eW1jY+OMI4444uiCgoKS5tqHrl27xqhRo2Lbtm2xcuVKDwbAHpRKpWLUqFExduzY6NWrV7PuRX19/fo77rjjK9/61rcWejIAAGDXEwADANAsPP/881UbNmx45rjjjjuqsLCwrLn2obCwMAYNGhT77bdfLF68OGpraz0cALtZ+/bt44orrogTTzwxCgub9/uU2tralTfffPPVP/nJT1Z7MgAAYPcQAAMA0Gz87W9/27p27doZJ5xwwsjCwsK2zbkXnTp1ipEjR0Z1dbXTwAC70ciRI+Pqq6+OHj16NPte1NTULL/hhhuu/e1vf7vOkwEAALuPABgAgGbltdde2zpv3rynTznllKFFRUWdmnMvCgsL49BDD4399tsvFi1a5DQwwC709qnfk08+udmf+o2I2Lx587yLL774unHjxm30dAAAwO71fgFwat9zYsTOftC4LmLjq610DwCAxOrVq1fhs88++69du3Y9QTciGhoaYurUqTF58uRobGzUEICPqaCgIE499dQYPXq04HeH8vLyp4499tjvrly5skE3AABg9+swrDYKuuz8ZwJgAAByWuvWrfNeeumlm/fdd9+zdeMfVq9eHffff38sWbJEMwA+ov322y8uuugi1z2/w8KFC38/fPjwnzY0NGR0AwAA9gwBMAAAzd7zzz9/8aGHHnp1RKR0IyKTycTMmTPjz3/+c9TV1WkIwAcoKSmJ8847L0aMGBGplL9Kdki//PLL9xx77LEPagUAAOxZ7xcA+wYwAADNwn333Tfn+OOP39yrV6/DQwgcqVQqevfuHcOHD49169ZFRUWFhwTgPRxyyCExduzY6N+/v/B3h0wm0/jMM8/828knnzxONwAAYM97v28AC4ABAGg2fve7370xePDgJf369Ts6lUrl60hEcXFxjBgxInr06BFLly6N2tpaTQHYoUOHDvGFL3whzjzzzCguLtaQHZqammoeeOCBWz73uc9N1w0AANg7BMAAALDDww8/vKygoOC54cOHH1FQUFCqI//QrVu3OO6446K0tDQWL14cTU1NmgI0Wy1btoxzzjknLr300ujevbuGvENtbe2K22677arbbrvtDd0AAIC9RwAMAADv8Oyzz25avHjx0yeddNKQoqKiTjryD3l5edGnT58YOXJkbN26NVatWqUpQLNz+OGHx1e+8pUYMGBA5OXlacg7VFVV/e3CCy+8/oEHHvDdAAAA2MsEwAAA8C7z58+vefbZZ58+44wz+hcXF/fSkf/RsmXLGDJkSOyzzz6xdOnSqKmp0RQg53Xs2DG++MUvximnnBItW7bUkHdZt27dMyeffPI3Xn755W26AQAAe9/7BcCpfc+JETv7QeO6iI2vttI9AAByWmFhYer555//0sEHH3y5bvxfTU1N8fzzz8f48eOjurpaQ4Cc07p16zjzzDPjyCOPdOJ35zJ///vff3rMMcfc39DQkNEOAADIDh2G1UZBl53/TAAMAAARMWnSpM8cc8wxt6RSKdfg7ERNTU1MmTIlpk2bFg0NDRoCJF5hYWGccsopcdJJJ0VRUZGG7EQ6na6fOnXqd88555y/6AYAAGSX9wuAXQENAAAR8Yc//GHhfvvt98aAAQOOysvLkwS8S2FhYQwYMCCGDh0amzZtinXr1mkKkFiDBw+Oq666KoYOHRoFBQUashONjY1Vv//972/5whe+MEs3AAAg+/gGMAAAfAgTJkxYXV1dPf3II4/8VGFhYTsd+b9KS0vjsMMOi/79+8eaNWti8+bNmgIkRu/evePyyy+PU045JUpLSzXkPWzdunXxLbfccs33vve9hboBAADZyTeAAQDgI+jTp0+LJ5988us9evQ4TTfe3/z58+ORRx6JlStXagaQtXr16hXnnHNODBgwQDM+wKpVq5444YQTfrBy5Ur3/QMAQBbzDWAAAPgYnnnmmfOHDx9+fSqVytON95bJZGL27Nkxbty4qKio0BAga3Tu3DnOOuusGDp0aKRSKQ15/z/Lm2bNmvXDk08++THdAACA7OcbwAAA8DH85je/eX3//fd//cADDzzSd4HfWyqViu7du8cxxxwT7dq1i2XLlkV9fb3GAHtN27Zt49xzz42LL744evToIfz9AI2NjdUPPvjgLZ/97Gf/ohsAAJAMvgEMAAAf0/jx41dFxPOHHXbYiMLCwjIdeW95eXnRu3fvOOqoo6KgoCBWrlwZjY2NGgPsMcXFxXHKKafEl770pejbt2/k5bnA4YPU1tau+MEPfnD9LbfcMk83AAAgQf/94xvAAADwyQwePLjVo48++s1u3bqdpBsfTn19fTzzzDMxderU2LZtm4YAu01ZWVmceuqpceSRR0ZRkQsbPqyVK1c+/ulPf/pHixcvdm0DAAAkjG8AAwDALvLkk0+edeSRR96USqVcl/MhCYKB3eXtE7/HHnus4PcjyGQyDbNmzfoP3/sFAIDk8g1gAADYRX7/+98v6NGjx2uHHHLIyPz8fL8x+SEUFBREv3794qijjoq8vLxYtWqVq6GBT6Rly5ZxwgknxBVXXBEHHXRQFBQUaMqH1NDQsOG3v/3t1z7/+c8/oxsAAJBcroAGAIBd7Lzzzut4991339m2bdvBuvHR1NTUxLPPPhvTpk2LLVu2aAjwoZWVlcXxxx8fxxxzTBQXF2vIR1RVVfW3a6+99vZHHnlkg24AAECyuQIaAAB2g06dOhVMmzZtbN++fT8XESkd+WgaGhri+eefjyeffDI2bJBFAO/7522cdNJJccQRR0RhodvKPobMokWL/nTsscf+pLKyskk7AAAg+QTAAACwG/3hD38Ydfrpp99WUFDQRjc+unQ6Ha+++mpMnTo1Vq5cqSHAP/Xq1StOOeWUGDp0aOTl5WnIx9DY2Fg1YcKEOy666KKZugEAALlDAAwAALvZaaed1vbee+/9docOHUbqxse3fPnymDZtWrz88suRTqc1BJqhvLy8OOyww+L444+P3r17a8gnsHHjxue//OUvf3fSpElVugEAALlFAAwAAHtAYWFh6qmnnjpv+PDh16RSKXeUfgIbNmyIGTNmxHPPPRc1NTUaAs1AcXFxjBo1Ko4++ujo2LGjhnwCmUym4ZVXXvl/J5100kMNDQ0ZHQEAgNzzfgFwftuDoufOfpDeFlFb7p0VAAB8WOl0On7zm9+8Xlpa+uLgwYM/VVhYWKYrH09xcXEMGDAgjj322GjTpk2sXbs2amtrNQZyUIcOHeKMM86ISy+9NAYOHBjFxcWa8gnU1tau+slPfnLjxRdf/IybFAAAIHcVd2+MvNKd/8wJYAAA2A1OPPHENvfdd9+tnTp1Olo3PrnGxsb429/+Fs8++2wsWrRIQyAH9OvXL44++ugYNmxYFBQUaMguUFFR8cwXv/jFf5s+ffoW3QAAgNzmCmgAANhLHn744RNGjx799YKCgta6sWusX78+Zs6cGc8//3xUV1drCCRIaWlpHHnkkXHUUUdF586dNWQXaWxs3DJ16tS7PvvZz/5FNwAAoHkQAAMAwF50ySWXdP3+97//rXbt2g3VjV2nsbExXnvttXjuuedi/vz5GgJZbMCAATFq1KgYPHiw0767WFVV1atf//rXv/e73/1urW4AAEDzIQAGAIC9rF27dvlTp0699OCDD740lUrl68iutXz58nj++efj5ZdfjpqaGg2BLFBSUhLDhw+PI444Inr37q0hu1gmk2mcN2/efSeeeOJvq6urfewXAACaGQEwAABkia9//ev73Xjjjf9aWlraXzd2vXQ6HW+++WY899xz8dprr0VjY6OmwB5UUFAQgwcPjlGjRsUBBxwQeXl5mrIbVFdXL/zP//zPf/3BD36wRDcAAKB5EgADAEAWOfjgg1v9+c9/vrZ3795jIiKlI7tHZWVlvPjii/HCCy/EunXrNAR2o65du8bIkSPj8MMPj7Zt22rI7pNZunTpn88888z/t3jx4nrtAACA5ksADAAAWejuu+8eePHFF9/WqlUrd6PuZuXl5fHqq6/GSy+9FOvXr9cQ2AU6d+4cI0aMiGHDhkW3bt00ZDerqalZ9tvf/vbOm266aa5uAAAAAmAAAMhS/fr1K3r44Ycv79+//4WpVMpdqXvA8uXL46WXXoqXX345qqurNQQ+grKyshg+fHiMGDHCd333kEwmk164cOEfzj777F8sXbp0u44AAAARAmAAAMh6P/3pT4d97nOf+2bLli176Mae0dDQEHPnzo2//vWvMXfu3Ni+Xa4CO9OyZcsYNGhQDBs2LA455JAoKCjQlD2ktrZ21R//+Mc7rr322r/rBgAA8E4CYAAASIA+ffq0ePTRR69wGnjPS6fTsXTp0nj11VedDIaIaNu2bQwbNiyGDRsWffr0ibw8fyTtSZlMpuG11177+ZlnnvmnioqKRh0BAADeTQAMAAAJ8uMf//jQCy644JutWrXaRzf2vLdPBs+ePTvmzp0bdXV1mkKzUFZWFoMHD45hw4ZF//79Iz8/X1P2gpqammX333//nTfccINv/QIAAO9JAAwAAAnTrl27/HHjxp37qU996qq8vDwb870kk8nEihUrYu7cuTFnzpxYsWJFZDIZjSEnpFKp6Nu3bwwbNiwGDRoUHTt21JS9qKmpqfbVV1/92ZgxY/5cWVnZpCMAAMD7EQADAEBCffnLX+5x++23f7V9+/aH68bet2XLlnjjjTdizpw5MW/evKivr9cUEqVly5Zx8MEHx6BBg+KQQw6J0tJSTckCGzdufPG73/3uv//iF79YoxsAAMCHIQAGAIAEKywsTE2cOPGMkSNHXlNQUNBaR7JDXV1dvPnmm/HGG2/EG2+8EevXr9cUslKXLl3ioIMOioMOOigOOOCAKCoq0pQs0djYuGXmzJk/PvPMMyc2NDS4XgAAAPjQBMAAAJADjjzyyNY/+9nPrujbt++5EZGnI9mluro6Fi5cGPPnz4958+ZFZWWlprBXtGvXLg455JAYMGBA9O/fP1q39nsjWSj91ltv/fmqq676xaxZs6q1AwAA+KgEwAAAkEN++ctfjhgzZsyNrVq16q0b2SmdTsfKlStj0aJFsXDhwli8eHFs27ZNY9gtSkpKol+/ftG/f//Yf//9o1evXpGX53dEslVNTc3yRx999EdXXnnlK7oBAAB8XAJgAADIMd26dSt8+OGHPzd48ODL8vPzbdyzXCaTiTVr1sTChQtj0aJFsWjRotiyZYvG8LGUlZVF//79/xn6du/ePVKplMZkuaampprXXnvtV2PGjHmgoqKiUUcAAIBPQgAMAAA56rjjjiv7r//6r8tdC508mzdvjuXLl8eKFSti+fLlsXjx4qipqdEY/pfi4uLo169f9O7dO/bZZ5/Yd999o6ysTGMSJJPJpJcsWfLn66677pfTp0/3mx8AAMAuIQAGAIAc99Of/nTIueeee3NpaWlf3UimxsbGWLlyZSxdujSWLVsWy5cvj3Xr1kUmk9GcZiKVSkWXLl1in332iT59+kSfPn2iV69eUVBQoDkJtXXr1sUPPvjgj6699tq/6wYAALArCYABAKAZaNeuXf64cePOGTp06BUFBQWtdST56uvrY+XKlf88KbxixYpYu3ZtpNNpzUm4vLy86Nq1a+yzzz7//KdXr17RsmVLzckBjY2NW/7617/+4pxzznm0srKySUcAAIBdTQAMAADNyIknntjmnnvuuXzfffcdk0qlHB3MMdu3b481a9bEmjVrYu3atbF27dooLy+PDRs2CIazUF5eXnTs2DG6desWXbt2jW7dukW3bt2iR48eUVhYqEE5JpPJNC5ZsuRR1z0DAAC7mwAYAACaoa9+9av7Xnfdddd16NDhCN3IfY2Njf8MhNetWxfr1q2LioqKWLduXWzbtk2DdrPS0tLo3LnzP//p0qVLdO3aNbp27eoK52Ziw4YNM//rv/7rxz/60Y+W6wYAALC7CYABAKAZ++UvfznirLPOuq64uNj3gZupmpqaWL9+/T//qaioiMrKyqisrIxNmzZFY2OjJn2AgoKCaN++fbRr1y7at28fHTt2jC5dukSnTp2ic+fOUVxcrEnN1NatW98aP378PVdcccXLugEAAOwpAmAAAGjm2rVrl//ggw+eOWLEiCsLCwvb6gjvtHnz5n+GwZs2bYrKysqorq6OLVu2xJYtW6K6ujqqq6sjk8nk3NpTqVS0bt06WrduHWVlZdGmTZsoLS39X2Fvu3btok2bNh4U/peGhobKl1566efnnHPO+OrqavevAwAAe5QAGAAAiIiIoUOHFt97770XHHjggRfk5+c7ssiHlk6n/xkEV1dXR01Nzfv+k8lkora2NtLpdNTX10dTU1PU1dXt0u8U5+XlRcuWLSM/Pz+KiooiLy8vWrVqFalUKoqLi3f6T0lJSbRq1eqfgW9paWnk5eUZMB9aU1NTzYIFC/745S9/+Y+zZ8+u0REAAGBvEAADAAD/y2mnndb2rrvuurRPnz5n5+XlFeoIe9LbgfDbtm/f/r7XUBcUFESLFi3++b/fDnxhT8pkMg1LliwZd8stt/xq0qRJVToCAADsTQJgAABgp0477bS2d95554X777//5wTBAP9XJpNpWLhw4QO33nrrHwS/AABAtni/ADi/7UHRc2c/SG+LqC33/gcAAHLZokWL6u69995X0un0swcddFCnkpKS3roC8A8VFRUz/7//7/+77aKLLpq6aNGiOh0BAACyRXH3xsgr3fnPBMAAAEDMnDmz8u67736qqalpWr9+/Ypbt27dN5VKpXQGaG4ymUx6zZo1U+65555/Peeccx6cOXNmpa4AAADZRgAMAAB8KDNnzqz88Y9//Gw6nZ4uCAaak7eD37vvvvtfzz///McEvwAAQDYTAAMAAB+JIBhoLgS/AABAEgmAAQCAj+XtILisrOyFvn37diwuLu4VEYJgIBdkKioqnrv33nu/PWbMmEcEvwAAQJK8XwCc2vecGLGzHzSui9j4aivdAwAA/unqq6/u8ZWvfOX8Pn36nJWXl9dCR4CkSafT9UuXLh3/X//1Xw/84he/WKMjAABAEnUYVhsFXXb+MwEwAADwkZ1xxhntb7/99rMPPPDA8/Pz81vrCJDtmpqaqhcsWPDgd77znUcmTpzotC8AAJBoAmAAAGC3GD58eMkPf/jDzwwePPjioqKijjoCZJv6+voNr7322u9vvPHGx2fPnl2jIwAAQC4QAAMAALvV0KFDi++5556zDjnkkPOKioq66giwt9XV1a19/fXXH7z++uvHC34BAIBcIwAGAAD2iFatWuXdc889w0455ZTzO3bseJSOAHtYZsOGDbOmTJny4PXXX/9qbW1tWksAAIBcJAAGAAD2uH/913/tf/7555/dq1ev0/Ly8lroCLC7pNPp+pUrV05+4IEHHvnOd76zSEcAAIBcJwAGAAD2mjPOOKP97bfffvYBBxzw2YKCgjY6AuwqjY2NVW+++eafv/e97z06YcKETToCAAA0FwJgAABgrxs+fHjJ97///dGDBg0aU1paur+OAB9XdXX1wtdee+3Rr371q1Nfe+21Wh0BAACaGwEwAACQVb761a/ue8EFF3y6b9++ZxUUFLTWEeCDNDY2bnnrrbfG/+EPf5j4ox/9aLmOAAAAzZkAGAAAyEpDhw4t/sEPfnDy4MGDz27dunV/HQHerbq6+s2XX375weuuu+7ppUuXbtcRAAAAATAAAJDlCgsLU3ffffeQ0aNHn9G1a9fj8vLyinQFmq90Ol1XXl4+bcqUKROuvfbav+sIAADA/yYABgAAEqNPnz4t/v3f/33UyJEjz2rfvv2nIiKlK9AsZDZt2vTXF1544bGvfe1rzzntCwAA8N4EwAAAQCJddNFFXa6++uqTDzzwwLNbtmzZTUcg99TV1a1ZsGDBuJ/+9KdP3n///et0BAAA4IMJgAEAgETr1q1b4d13333k4YcffmqHDh2OyMvLK9QVSK50Ot2wcePGWbNmzZp8/fXXz6qoqGjUFQAAgA9PAAwAAOSMo48+uvWtt956/CGHHHJKu3btBkdEnq5AIqQrKytfmzdv3uQ777xz+owZM6q1BAAA4OMRAAMAADnpuOOOK/vGN75x/CGHHHJa27ZtB4bvBUO2yVRVVc2dN2/epO9///vTpk+fvkVLAAAAPjkBMAAAkPNuu+22vmedddZJffr0Oa5Vq1a9dQT2ntra2uXLly+f/uijjz51xx13vKUjAAAAu5YAGAAAaFa+9KUvdbv44ouP7t+//wlOBsMekamqqpq7cOHCv/z+97+fcd9995VrCQAAwO4jAAYAAJqtSy65pOtll112jDAYdrl0VVXVvIULF/7lV7/61bO/+93v1moJAADAniEABgAAiIirr766x/nnnz9q//33P7JNmzZDUqlUga7Ah5fJZBoqKyv/vnjx4uf+9Kc/zbr33ntX6woAAMCeJwAGAAB4l379+hV97WtfGzRy5MhRPXv2PLaoqKizrsD/VV9fv37VqlXPvPDCC8/9+7//+5zFixfX6woAAMDeJQAGAAB4H61bt8678847Bx599NFHde/efURpaen+4apomq/M1q1bF69Zs+bF5557btY3v/nNOdXV1WltAQAAyB4CYAAAgI9g8ODBrcaOHXvI8OHDD+vevfvw1q1bHxACYXJXprq6+s01a9a88sorr7z8k5/8ZN5rr71Wqy0AAADZSwAMAADwCVx//fX7nHHGGYf169dvePv27Yfm5+e31hWSrLGxsXrjxo2vvvXWWy+PHz/+lR//+McrdQUAACA5BMAAAAC70Je//OUe55xzzvA+ffoM7tix45CioqKuukI2q6+vX7t27doXFy9ePGfixImv3Xvvvat1BQAAILkEwAAAALvRl7/85R6f+cxnBvfr129Qly5dDm/ZsqVAmL2qrq5u7bp16wS+AAAAOUoADAAAsIe0atUq75prrtnn2GOPPXi//fY7uH379oeUlpb2TaVS+brDbpKuqalZtnHjxnlvvfXW3GeffXbef/3Xfy2vra1Naw0AAEBuEgADAADsRQceeGDLq6+++oAhQ4Yc3LNnz4Pbtm17sGuj+biampqqq6qqXi8vL583Z86ceb/85S/nvfjii1t1BgAAoPkQAAMAAGSZoUOHFn/xi1/cf9CgQQf26NHjwHbt2h3YqlWr3qlUKk932CFdU1OzvLKycsHq1asXzJkzZ8Gf//znJTNmzKjWGgAAgOZNAAwAAJAAxx13XNkFF1xw4MEHH3xA165dDywtLd23pKRkn1QqVag7uS2TyTRs27ZtRXV19dJ169YtfOONNxZOmDBh4YQJEzbpDgAAAO8mAAYAAEiw8847r+OJJ57Yp3///vt16dKlT5s2bfZr3bp1v/z8/GLdSZampqaa6urqxZs3b16ybt26pQsXLlzy9NNPL33ooYc26A4AAAAflgAYAAAgx7Rr1y7/kksu6TFkyJCe++67b89OnTr1Kisr61VcXNyzZcuW3VKpVL4u7R2ZTKaprq6uvKamZtWWLVtWVlRUrFy6dOnK2bNnr7r//vvXVFZWNukSAAAAn4QAGAAAoBnp1KlTwec+97luQ4cO7bnPPvv0aNeuXafWrVt3Li4u7tqyZcvORUVFnfLy8lro1MeTTqe319fXr6+rq6uoqalZW11dvb6y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AACAEgIwAAAAAAAAQAkBGAAAAAAAAKCEAAwAAAAAAABQQgAGAAAAAAAAKCEAAwAAAAAAAJQQgAEAAAAAAABKCMAAAAAAAAAAJQRgAAAAAAAAgBICMAAAAAAAAEAJARgAAAAAAACghAAMAAAAAAAAUEIABgAAAAAAACghAAMAAAAAAACUEIABAAAAAAAASgjAAAAAAAAAACUEYAAAAAAAAIASAjAAAAAAAABACQEYAAAAAAAAoIQADAAAAAAAAFBCAAYAAAAAAAAoIQADAAAAAAAAlBCAAQAAAAAAAEoIwAAAAAAAAAAlBGAAAAAAAACAEgIwAAAAAAAAQAkBGAAAAAAAAKCEAAwAAAAAAABQQgAGAAAAAAAAKCEAAwAAAAAAAJQQgAEAAAAAAABKCMAAAAAAAAAAJQRgAAAAAAAAgBICMAAAAAAAAEAJARgAAAAAAACghAAMAAAAAAAAUEIABgAAAAAAACghAAMAAAAAAACUEIABAAAAAAAASgjAAAAAAAAAACUEYAAAAAAAAIASAjAAAAAAAABACQEYAAAAAAAAoIQADAAAAAAAAFBCAAYAAAAAAAAoIQADAAAAAAAAlBCAAQAAAAAAAEoIwAAAAAAAAAAlBGAAAAAAAACAEgIwAAAAAAAAQAkBGAAAAAAAAKCEAAwAAAAAAABQQgAGAAAAAAAAKCEAAwAAAAAAAJQQgAEAAAAAAABKCMAAAAAAAAAAJQRgAAAAAAAAgBICMAAAAAAAAEAJARgAAAAAAACghAAMAAAAAAAAUEIABgAAAAAAACghAAMAAAAAAACUEIABAAAAAAAASgjAAAAAAAAAACUEYAAAAAAAAIASAjAAAAAAAABACQEYAAAAAAAAoIQADAAAAAAAAFBCAAYAAAAAAAAoIQADAAAAAAAAlBCAAQAAAAAAAEoIwAAAAAAAAAAlBGAAAAAAAACAEgIwAAAAAAAAQAkBGAAAAAAAAKCEAAwAAAAAAABQQgAGAAAAAAAAKCEAAwAAAAAAAJQQgAEAAAAAAABKCMAAAAAAAAAAJQRgAAAAAAAAgBICMAAAAAAAAEAJARgAAAAAAACghAAMAAAAAAAAUEIABgAAAAAAACghAAMAAAAAAACUEIABAAAAAAAASgjAAAAAAAAAACUEYAAAAAAAAIASAjAAAAAAAABACQEYAAAAAAAAoIQADAAAAAAAAFBCAAYAAAAAAAAoIQADAAAAAAAAlBCAAQAAAAAAAEoIwAAAAAAAAAAlBGAAAAAAAACAEgIwAAAAAAAAQAkBGAAAAAAAAKCEAAwAAAAAAABQQgAGAAAAAAAAKCEAAwAAAAAAAJQQgAEAAAAAAABKCMAAAAAAAAAAJQRgAAAAAAAAgBICMAAAAAAAAEAJARgAAAAAAACghAAMAAAAAAAAUEIABgAAAAAAACghAAMAAAAAAACUEIABAAAAAAAASgjAAAAAAAAAACUEYAAAAAAAAIASAjAAAAAAAABACQEYAAAAAAAAoIQADAAAAAAAAFBCAAYAAAAAAAAoIQADAAAAAAAAlBCAAQAAAAAAAEoIwAAAAAAAAAAlBGAAAAAAAACAEgIwAAAAAAAAQAkBGAAAAAAAAKCEAAwAAAAAAABQQgAGAAAAAAAAKCEAAwAAAAAAAJQQgAEAAAAAAABKCMAAAAAAAAAAJQRgAAAAAAAAgBICMAAAAAAAAEAJARgAAAAAAACghAAMAAAAAAAAUEIABgAAAAAAACghAAMAAAAAAACUEIABAAAAAAAASgjAAAAAAAAAACUEYAAAAAAAAIASAjAAAAAAAABACQEYAAAAAAAAoIQADAAAAAAAAFBCAAYAAAAAAAAoIQADAAAAAAAAlBCAAQAAAAAAAEoIwAAAAAAAAAAlBGAAAAAAAACAEgIwAAAAAAAAQAkBGAAAAAAAAKCEAAwAAAAAAABQQgAGAAAAAAAAKCEAAwAAAAAAAJQQgAEAAAAAAABKCMAAAAAAAAAAJQRgAAAAAAAAgBICMAAAAAAAAEAJARgAAAAAAACghAAMAAAAAAAAUEIABgAAAAAAACghAAMAAAAAAACUEIABAAAAAAAASgjAAAAAAAAAACUEYAAAAAAAAIASAjAAAAAAAABACQEYAAAAAAAAoIQADAAAAAAAAFBCAAYAAAAAAAAoIQADAAAAAAAAlBCAAQAAAAAAAEoIwAAAAAAAAAAlBGAAAAAAAACAEgIwAAAAAAAAQAkBGAAAAAAAAKCEAAwAAAAAAABQQgAGAAAAAAAAKCEAAwAAAAAAAJQQgAEAAAAAAABKCMAAAAAAAAAAJQRgAAAAAAAAgBICMAAAAAAAAEAJARgAAAAAAACghAAMAAAAAAAAUEIABgAAAAAAACghAAMAAAAAAACUEIABAAAAAAAASgjAAAAAAAAAACUEYAAAAAAAAIASAjAAAAAAAABACQEYAAAAAAAAoIQADAAAAAAAAFBCAAYAAAAAAAAoIQADAAAAAAAAlBCAAQAAAAAAAEoIwAAAAAAAAAAlBGAAAAAAAACAEgIwAAAAAAAAQAkBGAAAAAAAAKCEAAwAAAAAAABQQgAGAAAAAAAAKCEAAwAAAAAAAJQQgAEAAAAAAABKCMAAAAAAAAAAJQRgAAAAAAAAgBICMAAAAAAAAEAJARgAAAAAAACghAAMAAAAAAAAUEIABgAAAAAAACghAAMAAAAAAACUEIABAAAAAAAASgjAAAAAAAAAACUEYAAAAAAAAIASAjAAAAAAAABACQEYAAAAAAAAoIQADAAAAAAAAFBCAAYAAAAAAAAoMY3JP//9K8My551lzpAk293a7QAAAAAAAAD8iIw3r+SL7TpPxuSt4/ibJJuz20QDBgAAAAAAAHhzrJPp6NvHYcyyjLl7dJTPbl/Jp6sPLufSsM+5ec7q5YOrF0OeP/SVaAAAAAAAAIA3weH7u6zfm79dWDIMSw6225w785vsx3XyzasOby5ssz69c4sAAAAAAAAAr9n69C6bC9sT93a7rKdnORin5Otxynzi1JQcfiwCAwAAAAAAALxO69O7HH68TaaT98cp85R8vbp3Nfszv8q0LHn7xMF1sjk/ZzUPmZ/MmWefhAYAAAAAAAD4oayPdjn7223Gn7x6ZrXPnetX8mBKkpv3cufDd/Pufn5FL56SzcVtNheT3dNt8tQlAwAAAAAAAHyv1sm0ySv/9XtsNWZ3I/lHkgzHi7/4XY7WYz5yiwAAAAAAAAA/Ivtcv/3nPEyS1fHa42t5+vNLyX7JoRsCAAAAAAAAePPt1/nbV3/KvePn1Xc371/NYxEYAAAAAAAA4M0yTHk2rvNo2WdzvHZqzN9v/SF3vju3evng/at5fPDLPDu1yuGyZHSVAAAAAAAAAK/XOGe4ueSvZ4e8M8xZbVe5ceuPufvy3Oqkw4+v5emDX+fuuTlLhhwsEYIBAAAAAAAAXpclGR8OuXP0TR4cPM/9z/+SRyfNDf/1TZezOp/87KdjzizJZkhO7edMy/w/nAUAAAAAAADg/zaMWcZkP8/ZLsmLacr2/MV8+cnvs/tP5/4FmLjAq1ifcioAAAAASUVORK5CYII=";
function kn(e, t, r) {
  return typeof e == "string" && !isNaN(Number(e)) && (e = Number(e)), typeof e == "number" && e < 100 ? Jn(e) : typeof e == "number" && e >= 100 ? e : typeof e == "string" && e.includes("%") ? Math.round(t && t === "X" ? parseFloat(e) / 100 * r.width : t && t === "Y" ? parseFloat(e) / 100 * r.height : parseFloat(e) / 100 * r.width) : 0;
}
function ig(e) {
  return e.replace(/[xy]/g, function(t) {
    var r = Math.random() * 16 | 0, l = t === "x" ? r : r & 3 | 8;
    return l.toString(16);
  });
}
function an(e) {
  return typeof e > "u" || e == null ? "" : e.toString().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function Jn(e) {
  return typeof e == "number" && e > 100 ? e : (typeof e == "string" && (e = Number(e.replace(/in*/gi, ""))), Math.round(tn * e));
}
function Jo(e) {
  var t = Number(e) || 0;
  return isNaN(t) ? 0 : Math.round(t * e0);
}
function ef(e) {
  return e = e || 0, Math.round((e > 360 ? e - 360 : e) * 6e4);
}
function ey(e) {
  var t = e.toString(16);
  return t.length === 1 ? "0" + t : t;
}
function ty(e, t, r) {
  return (ey(e) + ey(t) + ey(r)).toUpperCase();
}
function ri(e, t) {
  var r = (e || "").replace("#", "");
  !$b.test(r) && r !== Pd.background1 && r !== Pd.background2 && r !== Pd.text1 && r !== Pd.text2 && r !== Pd.accent1 && r !== Pd.accent2 && r !== Pd.accent3 && r !== Pd.accent4 && r !== Pd.accent5 && r !== Pd.accent6 && (console.warn('"'.concat(r, '" is not a valid scheme color or hex RGB! "').concat(sd, `" used instead. Only provide 6-digit RGB or 'pptx.SchemeColor' values!`)), r = sd);
  var l = $b.test(r) ? "srgbClr" : "schemeClr", i = 'val="' + ($b.test(r) ? r.toUpperCase() : r) + '"';
  return t ? "<a:".concat(l, " ").concat(i, ">").concat(t, "</a:").concat(l, ">") : "<a:".concat(l, " ").concat(i, "/>");
}
function E6(e, t) {
  var r = "", l = Os(Os({}, t), e), i = Math.round(l.size * e0), c = l.color, s = Math.round(l.opacity * 1e5);
  return r += '<a:glow rad="'.concat(i, '">'), r += ri(c, '<a:alpha val="'.concat(s, '"/>')), r += "</a:glow>", r;
}
function cd(e) {
  let t = "solid", r = "", l = "", i = "";
  if (e) switch (typeof e == "string" ? r = e : (e.type && (t = e.type), e.color && (r = e.color), e.alpha && (l += `<a:alpha val="${Math.round((100 - e.alpha) * 1e3)}"/>`), e.transparency && (l += `<a:alpha val="${Math.round((100 - e.transparency) * 1e3)}"/>`)), t) {
    case "solid":
      i += `<a:solidFill>${ri(r, l)}</a:solidFill>`;
      break;
    case "gradient": {
      let c = typeof e == "object" && Array.isArray(e.stops) ? e.stops : [], s = typeof e == "object" && typeof e.angle == "number" ? e.angle : 0, h = c.map((n) => {
        let p = Math.round(Math.max(0, Math.min(100, n.position)) * 1e3), m = typeof n.transparency == "number" ? `<a:alpha val="${Math.round((100 - n.transparency) * 1e3)}"/>` : "";
        return `<a:gs pos="${p}">${ri(n.color, m)}</a:gs>`;
      }).join(""), f = typeof e == "object" && typeof e.gradientPath == "string" ? e.gradientPath : null;
      if (f) {
        let n = typeof e == "object" && e.focus && typeof e.focus.x == "number" ? e.focus.x : 50, p = typeof e == "object" && e.focus && typeof e.focus.y == "number" ? e.focus.y : 50, m = Math.round(Math.max(0, Math.min(100, n)) * 1e3), d = Math.round(Math.max(0, Math.min(100, p)) * 1e3), b = 1e5 - m, x = 1e5 - d;
        i += `<a:gradFill rotWithShape="1"><a:gsLst>${h}</a:gsLst><a:path path="${f}"><a:fillToRect l="${m}" t="${d}" r="${b}" b="${x}"/></a:path></a:gradFill>`;
      } else {
        let n = Math.round((s % 360 + 360) % 360 * 6e4);
        i += `<a:gradFill rotWithShape="1"><a:gsLst>${h}</a:gsLst><a:lin ang="${n}" scaled="0"/></a:gradFill>`;
      }
      break;
    }
    default:
      i += "";
      break;
  }
  return i;
}
function Fu(e) {
  return e._rels.length + e._relsChart.length + e._relsMedia.length + 1;
}
function cA(e) {
  if (!(!e || typeof e != "object")) return e.type !== "outer" && e.type !== "inner" && e.type !== "none" && (console.warn("Warning: shadow.type options are `outer`, `inner` or `none`."), e.type = "outer"), e.angle && ((isNaN(Number(e.angle)) || e.angle < 0 || e.angle > 359) && (console.warn("Warning: shadow.angle can only be 0-359"), e.angle = 270), e.angle = Math.round(Number(e.angle))), e.opacity && ((isNaN(Number(e.opacity)) || e.opacity < 0 || e.opacity > 1) && (console.warn("Warning: shadow.opacity can only be 0-1"), e.opacity = 0.75), e.opacity = Number(e.opacity)), e.color && e.color.startsWith("#") && (console.warn('Warning: shadow.color should not include hash (#) character, , e.g. "FF0000"'), e.color = e.color.replace("#", "")), e;
}
function T6(e, t, r) {
  var l, i, c = 2.3 + (!((l = e.options) === null || l === void 0) && l.autoPageCharWeight ? e.options.autoPageCharWeight : 0), s = Math.floor(t / e0 * tn) / ((!((i = e.options) === null || i === void 0) && i.fontSize ? e.options.fontSize : Vd) / c), h = [], f = [], n = [], p = [];
  e.text && e.text.toString().trim().length === 0 ? f.push({ _type: Qi.tablecell, text: " " }) : typeof e.text == "number" || typeof e.text == "string" ? f.push({ _type: Qi.tablecell, text: (e.text || "").toString().trim() }) : Array.isArray(e.text) && (f = e.text);
  var m = [];
  return f.forEach(function(d) {
    var b;
    typeof d.text == "string" && (d.text.split(`
`).length > 1 ? d.text.split(`
`).forEach(function(x) {
      m.push({ _type: Qi.tablecell, text: x, options: Os(Os({}, d.options), { breakLine: true }) });
    }) : m.push({ _type: Qi.tablecell, text: d.text.trim(), options: d.options }), !((b = d.options) === null || b === void 0) && b.breakLine && (n.push(m), m = [])), m.length > 0 && (n.push(m), m = []);
  }), n.forEach(function(d) {
    d.forEach(function(b) {
      var x = [], v = String(b.text), w = v.split(" ");
      w.forEach(function(y, g) {
        var A = Os({}, b.options);
        A?.breakLine && (A.breakLine = g + 1 === w.length), x.push({ _type: Qi.tablecell, text: y + (g + 1 < w.length ? " " : ""), options: A });
      }), p.push(x);
    });
  }), p.forEach(function(d) {
    var b = [], x = "";
    d.forEach(function(v) {
      x.length + v.text.length > s && (h.push(b), b = [], x = ""), b.push(v), x += v.text.toString();
    }), b.length > 0 && h.push(b);
  }), h;
}
function Y2(e, t, r, l) {
  e === void 0 && (e = []), t === void 0 && (t = {});
  var i = Cv, c = tn * 1, s = tn * 1, h = 0, f = 0, n = [], p = kn(t.x, "X", r), m = kn(t.y, "Y", r), d = kn(t.w, "X", r), b = kn(t.h, "Y", r), x = d;
  function v() {
    var C = 0;
    n.length === 0 && (C = m || Jn(i[0])), n.length > 0 && (C = Jn(t.autoPageSlideStartY || t.newSlideStartY || i[0])), s = (b || r.height) - C - Jn(i[2]), n.length > 1 && (typeof t.autoPageSlideStartY == "number" ? s = (b || r.height) - Jn(t.autoPageSlideStartY + i[2]) : typeof t.newSlideStartY == "number" ? s = (b || r.height) - Jn(t.newSlideStartY + i[2]) : m && (s = (b || r.height) - Jn((m / tn < i[0] ? m / tn : i[0]) + i[2]), s < b && (s = b)));
  }
  t.verbose && (console.log("[[VERBOSE MODE]]"), console.log("|-- TABLE PROPS --------------------------------------------------------|"), console.log("| presLayout.width ................................ = ".concat((r.width / tn).toFixed(1))), console.log("| presLayout.height ............................... = ".concat((r.height / tn).toFixed(1))), console.log("| tableProps.x .................................... = ".concat(typeof t.x == "number" ? (t.x / tn).toFixed(1) : t.x)), console.log("| tableProps.y .................................... = ".concat(typeof t.y == "number" ? (t.y / tn).toFixed(1) : t.y)), console.log("| tableProps.w .................................... = ".concat(typeof t.w == "number" ? (t.w / tn).toFixed(1) : t.w)), console.log("| tableProps.h .................................... = ".concat(typeof t.h == "number" ? (t.h / tn).toFixed(1) : t.h)), console.log("| tableProps.slideMargin .......................... = ".concat(t.slideMargin ? String(t.slideMargin) : "")), console.log("| tableProps.margin ............................... = ".concat(String(t.margin))), console.log("| tableProps.colW ................................. = ".concat(String(t.colW))), console.log("| tableProps.autoPageSlideStartY .................. = ".concat(t.autoPageSlideStartY)), console.log("| tableProps.autoPageCharWeight ................... = ".concat(t.autoPageCharWeight)), console.log("|-- CALCULATIONS -------------------------------------------------------|"), console.log("| tablePropX ...................................... = ".concat(p / tn)), console.log("| tablePropY ...................................... = ".concat(m / tn)), console.log("| tablePropW ...................................... = ".concat(d / tn)), console.log("| tablePropH ...................................... = ".concat(b / tn)), console.log("| tableCalcW ...................................... = ".concat(x / tn))), !t.slideMargin && t.slideMargin !== 0 && (t.slideMargin = Cv[0]), l && typeof l._margin < "u" ? Array.isArray(l._margin) ? i = l._margin : isNaN(Number(l._margin)) || (i = [Number(l._margin), Number(l._margin), Number(l._margin), Number(l._margin)]) : (t.slideMargin || t.slideMargin === 0) && (Array.isArray(t.slideMargin) ? i = t.slideMargin : isNaN(t.slideMargin) || (i = [t.slideMargin, t.slideMargin, t.slideMargin, t.slideMargin])), t.verbose && console.log("| arrInchMargins .................................. = [".concat(i.join(", "), "]"));
  {
    var w = e[0] || [];
    w.forEach(function(C) {
      C || (C = { _type: Qi.tablecell });
      var S = C.options || null;
      f += Number(S?.colspan ? S.colspan : 1);
    }), t.verbose && console.log("| numCols ......................................... = ".concat(f));
  }
  if (!d && t.colW && (x = Array.isArray(t.colW) ? t.colW.reduce(function(C, S) {
    return C + S;
  }) * tn : t.colW * f || 0, t.verbose && console.log("| tableCalcW ...................................... = ".concat(x / tn))), c = x || Jn((p ? p / tn : i[1]) + i[3]), t.verbose && console.log("| emuSlideTabW .................................... = ".concat((c / tn).toFixed(1))), !t.colW || !Array.isArray(t.colW)) if (t.colW && !isNaN(Number(t.colW))) {
    var y = [], w = e[0] || [];
    w.forEach(function() {
      return y.push(t.colW);
    }), t.colW = [], y.forEach(function(S) {
      Array.isArray(t.colW) && t.colW.push(S);
    });
  } else {
    t.colW = [];
    for (var g = 0; g < f; g++) t.colW.push(c / tn / f);
  }
  var A = { rows: [] };
  return e.forEach(function(C, S) {
    var R = [], N = 0, E = 0, D = [];
    C.forEach(function(T) {
      var k, z, V, G;
      D.push({ _type: Qi.tablecell, text: [], options: T.options }), T.options.margin && T.options.margin[0] >= 1 ? (!((k = T.options) === null || k === void 0) && k.margin && T.options.margin[0] && Jo(T.options.margin[0]) > N ? N = Jo(T.options.margin[0]) : t?.margin && t.margin[0] && Jo(t.margin[0]) > N && (N = Jo(t.margin[0])), !((z = T.options) === null || z === void 0) && z.margin && T.options.margin[2] && Jo(T.options.margin[2]) > E ? E = Jo(T.options.margin[2]) : t?.margin && t.margin[2] && Jo(t.margin[2]) > E && (E = Jo(t.margin[2]))) : (!((V = T.options) === null || V === void 0) && V.margin && T.options.margin[0] && Jn(T.options.margin[0]) > N ? N = Jn(T.options.margin[0]) : t?.margin && t.margin[0] && Jn(t.margin[0]) > N && (N = Jn(t.margin[0])), !((G = T.options) === null || G === void 0) && G.margin && T.options.margin[2] && Jn(T.options.margin[2]) > E ? E = Jn(T.options.margin[2]) : t?.margin && t.margin[2] && Jn(t.margin[2]) > E && (E = Jn(t.margin[2])));
    }), v(), h += N + E, t.verbose && S === 0 && console.log("| SLIDE [".concat(n.length, "]: emuSlideTabH ...... = ").concat((s / tn).toFixed(1), " ")), C.forEach(function(T, k) {
      var z, V = { _type: Qi.tablecell, _lines: null, _lineHeight: Jn((!((z = T.options) === null || z === void 0) && z.fontSize ? T.options.fontSize : t.fontSize ? t.fontSize : Vd) * (y6 + (t.autoPageLineWeight ? t.autoPageLineWeight : 0)) / 100), text: [], options: T.options };
      V.options.rowspan && (V._lineHeight = 0), V.options.autoPageCharWeight = t.autoPageCharWeight ? t.autoPageCharWeight : null;
      var G = t.colW[k];
      T.options.colspan && Array.isArray(t.colW) && (G = t.colW.filter(function(q, j) {
        return j >= k && j < j + T.options.colspan;
      }).reduce(function(q, j) {
        return q + j;
      })), V._lines = T6(T, G), R.push(V);
    }), t.verbose && console.log(`
| SLIDE [`.concat(n.length, "]: ROW [").concat(S, "]: START..."));
    for (var O = 0, L = 0, P = false; !P; ) {
      var B = R[O], M = D[O];
      if (R.forEach(function(T) {
        T._lineHeight >= L && (L = T._lineHeight);
      }), h + L > s) {
        t.verbose && (console.log(`
|-----------------------------------------------------------------------|`), console.log("|-- NEW SLIDE CREATED (currTabH+currLineH > maxH) => ".concat((h / tn).toFixed(2), " + ").concat((B._lineHeight / tn).toFixed(2), " > ").concat(s / tn)), console.log(`|-----------------------------------------------------------------------|

`)), D.length > 0 && D.map(function(T) {
          return T.text.length;
        }).reduce(function(T, k) {
          return T + k;
        }) > 0 && A.rows.push(D), n.push(A);
        var U = [];
        A = { rows: U }, D = [], C.forEach(function(T) {
          return D.push({ _type: Qi.tablecell, text: [], options: T.options });
        }), v(), h += N + E, t.verbose && console.log("| SLIDE [".concat(n.length, "]: emuSlideTabH ...... = ").concat((s / tn).toFixed(1), " ")), h = 0, (t.addHeaderToEach || t.autoPageRepeatHeader) && t._arrObjTabHeadRows && t._arrObjTabHeadRows.forEach(function(T) {
          var k = [], z = 0;
          T.forEach(function(V) {
            k.push(V), V._lineHeight > z && (z = V._lineHeight);
          }), A.rows.push(k), h += z;
        }), M = D[O];
      }
      var _ = B._lines.shift();
      Array.isArray(M.text) && (_ ? M.text = M.text.concat(_) : M.text.length === 0 && (M.text = M.text.concat({ _type: Qi.tablecell, text: "" }))), O === R.length - 1 && (h += L), O = O < R.length - 1 ? O + 1 : 0;
      var F = R.map(function(T) {
        return T._lines.length;
      }).reduce(function(T, k) {
        return T + k;
      });
      F === 0 && (P = true);
    }
    D.length > 0 && A.rows.push(D), t.verbose && console.log("- SLIDE [".concat(n.length, "]: ROW [").concat(S, "]: ...COMPLETE ...... emuTabCurrH = ").concat((h / tn).toFixed(2), " ( emuSlideTabH = ").concat((s / tn).toFixed(2), " )"));
  }), n.push(A), t.verbose && (console.log(`
|================================================|`), console.log("| FINAL: tableRowSlides.length = ".concat(n.length)), n.forEach(function(C) {
    return console.log(C);
  }), console.log(`|================================================|

`)), n;
}
function k6(e, t, r, l) {
  r === void 0 && (r = {});
  var i = r || {};
  i.slideMargin = i.slideMargin || i.slideMargin === 0 ? i.slideMargin : 0.5;
  var c = i.w || e.presLayout.width, s = [], h = [], f = [], n = [], p = [], m = [0.5, 0.5, 0.5, 0.5], d = 0;
  if (!document.getElementById(t)) throw new Error('tableToSlides: Table ID "' + t + '" does not exist!');
  l?._margin ? (Array.isArray(l._margin) ? m = l._margin : isNaN(l._margin) || (m = [l._margin, l._margin, l._margin, l._margin]), i.slideMargin = m) : i?.slideMargin && (Array.isArray(i.slideMargin) ? m = i.slideMargin : isNaN(i.slideMargin) || (m = [i.slideMargin, i.slideMargin, i.slideMargin, i.slideMargin])), c = (i.w ? Jn(i.w) : e.presLayout.width) - Jn(m[1] + m[3]), i.verbose && (console.log("[[VERBOSE MODE]]"), console.log("|-- `tableToSlides` ----------------------------------------------------|"), console.log("| tableProps.h .................................... = ".concat(i.h)), console.log("| tableProps.w .................................... = ".concat(i.w)), console.log("| pptx.presLayout.width ........................... = ".concat((e.presLayout.width / tn).toFixed(1))), console.log("| pptx.presLayout.height .......................... = ".concat((e.presLayout.height / tn).toFixed(1))), console.log("| emuSlideTabW .................................... = ".concat((c / tn).toFixed(1))));
  var b = document.querySelectorAll("#".concat(t, " tr:first-child th"));
  b.length === 0 && (b = document.querySelectorAll("#".concat(t, " tr:first-child td"))), b.forEach(function(v) {
    if (v.getAttribute("colspan")) for (var w = 0; w < Number(v.getAttribute("colspan")); w++) p.push(Math.round(v.offsetWidth / Number(v.getAttribute("colspan"))));
    else p.push(v.offsetWidth);
  }), p.forEach(function(v) {
    d += v;
  }), p.forEach(function(v, w) {
    var y = Number((Number(c) * (v / d * 100) / 100 / tn).toFixed(2)), g = 0, A = document.querySelector("#".concat(t, " thead tr:first-child th:nth-child(").concat(w + 1, ")"));
    A && (g = Number(A.getAttribute("data-pptx-min-width")));
    var C = document.querySelector("#".concat(t, " thead tr:first-child th:nth-child(").concat(w + 1, ")"));
    C && (g = Number(C.getAttribute("data-pptx-width"))), n.push(g > y ? g : y);
  }), i.verbose && console.log("| arrColW ......................................... = [".concat(n.join(", "), "]"));
  var x = ["thead", "tbody", "tfoot"];
  x.forEach(function(v) {
    document.querySelectorAll("#".concat(t, " ").concat(v, " tr")).forEach(function(w) {
      var y = [];
      switch (Array.from(w.cells).forEach(function(g) {
        var A = window.getComputedStyle(g).getPropertyValue("color").replace(/\s+/gi, "").replace("rgba(", "").replace("rgb(", "").replace(")", "").split(","), C = window.getComputedStyle(g).getPropertyValue("background-color").replace(/\s+/gi, "").replace("rgba(", "").replace("rgb(", "").replace(")", "").split(",");
        (window.getComputedStyle(g).getPropertyValue("background-color") === "rgba(0, 0, 0, 0)" || window.getComputedStyle(g).getPropertyValue("transparent")) && (C = ["255", "255", "255"]);
        var S = { align: null, bold: window.getComputedStyle(g).getPropertyValue("font-weight") === "bold" || Number(window.getComputedStyle(g).getPropertyValue("font-weight")) >= 500, border: null, color: ty(Number(A[0]), Number(A[1]), Number(A[2])), fill: { color: ty(Number(C[0]), Number(C[1]), Number(C[2])) }, fontFace: (window.getComputedStyle(g).getPropertyValue("font-family") || "").split(",")[0].replace(/"/g, "").replace("inherit", "").replace("initial", "") || null, fontSize: Number(window.getComputedStyle(g).getPropertyValue("font-size").replace(/[a-z]/gi, "")), margin: null, colspan: Number(g.getAttribute("colspan")) || null, rowspan: Number(g.getAttribute("rowspan")) || null, valign: null };
        if (["left", "center", "right", "start", "end"].includes(window.getComputedStyle(g).getPropertyValue("text-align"))) {
          var R = window.getComputedStyle(g).getPropertyValue("text-align").replace("start", "left").replace("end", "right");
          S.align = R === "center" ? "center" : R === "left" ? "left" : R === "right" ? "right" : null;
        }
        if (["top", "middle", "bottom"].includes(window.getComputedStyle(g).getPropertyValue("vertical-align"))) {
          var N = window.getComputedStyle(g).getPropertyValue("vertical-align");
          S.valign = N === "top" ? "top" : N === "middle" ? "middle" : N === "bottom" ? "bottom" : null;
        }
        if (window.getComputedStyle(g).getPropertyValue("padding-left")) {
          S.margin = [0, 0, 0, 0];
          var E = ["padding-top", "padding-right", "padding-bottom", "padding-left"];
          E.forEach(function(O, L) {
            S.margin[L] = Math.round(Number(window.getComputedStyle(g).getPropertyValue(O).replace(/\D/gi, "")));
          });
        }
        if (window.getComputedStyle(g).getPropertyValue("border-top-width") || window.getComputedStyle(g).getPropertyValue("border-right-width") || window.getComputedStyle(g).getPropertyValue("border-bottom-width") || window.getComputedStyle(g).getPropertyValue("border-left-width")) {
          S.border = [null, null, null, null];
          var D = ["top", "right", "bottom", "left"];
          D.forEach(function(O, L) {
            var P = Math.round(Number(window.getComputedStyle(g).getPropertyValue("border-" + O + "-width").replace("px", ""))), B = [];
            B = window.getComputedStyle(g).getPropertyValue("border-" + O + "-color").replace(/\s+/gi, "").replace("rgba(", "").replace("rgb(", "").replace(")", "").split(",");
            var M = ty(Number(B[0]), Number(B[1]), Number(B[2]));
            S.border[L] = { pt: P, color: M };
          });
        }
        y.push({ _type: Qi.tablecell, text: g.innerText, options: S });
      }), v) {
        case "thead":
          s.push(y);
          break;
        case "tbody":
          h.push(y);
          break;
        case "tfoot":
          f.push(y);
          break;
        default:
          console.log("table parsing: unexpected table part: ".concat(v));
          break;
      }
    });
  }), i._arrObjTabHeadRows = s || null, i.colW = n, Y2(Zb(Zb(Zb([], s, true), h, true), f), i, e.presLayout, l).forEach(function(v, w) {
    var y = e.addSlide({ masterName: i.masterSlideName || null });
    w === 0 && (i.y = i.y || m[0]), w > 0 && (i.y = i.autoPageSlideStartY || i.newSlideStartY || m[0]), i.verbose && console.log("| opts.autoPageSlideStartY: ".concat(i.autoPageSlideStartY, " / arrInchMargins[0]: ").concat(m[0], " => opts.y = ").concat(i.y)), y.addTable(v.rows, { x: i.x || m[3], y: i.y, w: Number(c) / tn, colW: n, autoPage: false }), i.addImage && (i.addImage.options = i.addImage.options || {}, !i.addImage.image || !i.addImage.image.path && !i.addImage.image.data ? console.warn("Warning: tableToSlides.addImage requires either `path` or `data`") : y.addImage({ path: i.addImage.image.path, data: i.addImage.image.data, x: i.addImage.options.x, y: i.addImage.options.y, w: i.addImage.options.w, h: i.addImage.options.h })), i.addShape && y.addShape(i.addShape.shapeName, i.addShape.options || {}), i.addTable && y.addTable(i.addTable.rows, i.addTable.options || {}), i.addText && y.addText(i.addText.text, i.addText.options || {});
  });
}
var R6 = 0;
function X2(e, t) {
  e.bkgd && (t.bkgd = e.bkgd), e.objects && Array.isArray(e.objects) && e.objects.length > 0 && e.objects.forEach((r, l) => {
    let i = Object.keys(r)[0], c = t;
    Bf[i] && i === "chart" ? Q2(c, r[i].type, r[i].data, r[i].opts) : Bf[i] && i === "image" ? J2(c, r[i]) : Bf[i] && i === "line" ? Vy(c, "line", r[i]) : Bf[i] && i === "rect" ? Vy(c, "rect", r[i]) : Bf[i] && i === "text" ? Eg(c, [{ text: r[i].text }], r[i].options, false) : Bf[i] && i === "placeholder" && (r[i].options.placeholder = r[i].options.name, delete r[i].options.name, r[i].options._placeholderType = r[i].options.type, delete r[i].options.type, r[i].options._placeholderType !== "title" && (r[i].options._placeholderIdx = 100 + l), Eg(c, [{ text: r[i].text }], r[i].options, true));
  }), e.slideNumber && typeof e.slideNumber == "object" && (t._slideNumberProps = e.slideNumber);
}
function Q2(e, t, r, l) {
  function i(p) {
    !p || p.style === "none" || (p.size !== void 0 && (isNaN(Number(p.size)) || p.size <= 0) && (console.warn("Warning: chart.gridLine.size must be greater than 0."), delete p.size), p.style && !["solid", "dash", "dot"].includes(p.style) && (console.warn("Warning: chart.gridLine.style options: `solid`, `dash`, `dot`."), delete p.style), p.cap && !["flat", "square", "round"].includes(p.cap) && (console.warn("Warning: chart.gridLine.cap options: `flat`, `square`, `round`."), delete p.cap));
  }
  let c = ++R6, s = { _type: null, text: null, options: null, chartRid: null }, h = null, f = [];
  Array.isArray(t) ? (t.forEach((p) => {
    f = f.concat(p.data);
  }), h = r || l) : (f = r, h = l), f.forEach((p, m) => {
    p._dataIndex = m, p.labels !== void 0 && !Array.isArray(p.labels[0]) && (p.labels = [p.labels]);
  });
  let n = h && typeof h == "object" ? h : {};
  return n._type = t, n.x = typeof n.x < "u" && n.x != null && !isNaN(Number(n.x)) ? n.x : 1, n.y = typeof n.y < "u" && n.y != null && !isNaN(Number(n.y)) ? n.y : 1, n.w = n.w || "50%", n.h = n.h || "50%", n.objectName = n.objectName ? an(n.objectName) : `Chart ${e._slideObjects.filter((p) => p._type === "chart").length}`, !["bar", "col"].includes(n.barDir || "") && (n.barDir = "col"), n._type === "area" && (["stacked", "standard", "percentStacked"].includes(n.barGrouping || "") || (n.barGrouping = "standard")), n._type === "bar" && (["clustered", "stacked", "percentStacked"].includes(n.barGrouping || "") || (n.barGrouping = "clustered")), n._type === "bar3D" && (["clustered", "stacked", "standard", "percentStacked"].includes(n.barGrouping || "") || (n.barGrouping = "standard")), n.barGrouping?.includes("tacked") && (n.barGapWidthPct || (n.barGapWidthPct = 50)), n.dataLabelPosition && ((n._type === "area" || n._type === "bar3D" || n._type === "doughnut" || n._type === "radar") && delete n.dataLabelPosition, n._type === "pie" && (["bestFit", "ctr", "inEnd", "outEnd"].includes(n.dataLabelPosition) || delete n.dataLabelPosition), (n._type === "bubble" || n._type === "bubble3D" || n._type === "line" || n._type === "scatter") && (["b", "ctr", "l", "r", "t"].includes(n.dataLabelPosition) || delete n.dataLabelPosition), n._type === "bar" && (["stacked", "percentStacked"].includes(n.barGrouping || "") || ["ctr", "inBase", "inEnd"].includes(n.dataLabelPosition) || delete n.dataLabelPosition, ["clustered"].includes(n.barGrouping || "") || ["ctr", "inBase", "inEnd", "outEnd"].includes(n.dataLabelPosition) || delete n.dataLabelPosition)), n.dataLabelBkgrdColors = n.dataLabelBkgrdColors || !n.dataLabelBkgrdColors ? n.dataLabelBkgrdColors : false, !["b", "l", "r", "t", "tr"].includes(n.legendPos || "") && (n.legendPos = "r"), ["cone", "coneToMax", "box", "cylinder", "pyramid", "pyramidToMax"].includes(n.bar3DShape || "") || (n.bar3DShape = "box"), ["circle", "dash", "diamond", "dot", "none", "square", "triangle"].includes(n.lineDataSymbol || "") || (n.lineDataSymbol = "circle"), ["gap", "span"].includes(n.displayBlanksAs || "") || (n.displayBlanksAs = "span"), ["standard", "marker", "filled"].includes(n.radarStyle || "") || (n.radarStyle = "standard"), n.lineDataSymbolSize = n.lineDataSymbolSize && !isNaN(n.lineDataSymbolSize) ? n.lineDataSymbolSize : 6, n.lineDataSymbolLineSize = n.lineDataSymbolLineSize && !isNaN(n.lineDataSymbolLineSize) ? Jo(n.lineDataSymbolLineSize) : Jo(0.75), n.layout && ["x", "y", "w", "h"].forEach((p) => {
    let m = n.layout[p];
    (isNaN(Number(m)) || m < 0 || m > 1) && (console.warn("Warning: chart.layout." + p + " can only be 0-1"), delete n.layout[p]);
  }), n.catGridLine = n.catGridLine || (n._type === "scatter" ? { color: "D9D9D9", size: 1 } : { style: "none" }), n.valGridLine = n.valGridLine || (n._type === "scatter" ? { color: "D9D9D9", size: 1 } : {}), n.serGridLine = n.serGridLine || (n._type === "scatter" ? { color: "D9D9D9", size: 1 } : { style: "none" }), i(n.catGridLine), i(n.valGridLine), i(n.serGridLine), cA(n.shadow), n.showDataTable = n.showDataTable || !n.showDataTable ? n.showDataTable : false, n.showDataTableHorzBorder = n.showDataTableHorzBorder || !n.showDataTableHorzBorder ? n.showDataTableHorzBorder : true, n.showDataTableVertBorder = n.showDataTableVertBorder || !n.showDataTableVertBorder ? n.showDataTableVertBorder : true, n.showDataTableOutline = n.showDataTableOutline || !n.showDataTableOutline ? n.showDataTableOutline : true, n.showDataTableKeys = n.showDataTableKeys || !n.showDataTableKeys ? n.showDataTableKeys : true, n.showLabel = n.showLabel || !n.showLabel ? n.showLabel : false, n.showLegend = n.showLegend || !n.showLegend ? n.showLegend : false, n.showPercent = n.showPercent || !n.showPercent ? n.showPercent : true, n.showTitle = n.showTitle || !n.showTitle ? n.showTitle : false, n.showValue = n.showValue || !n.showValue ? n.showValue : false, n.showLeaderLines = n.showLeaderLines || !n.showLeaderLines ? n.showLeaderLines : false, n.catAxisLineShow = typeof n.catAxisLineShow < "u" ? n.catAxisLineShow : true, n.valAxisLineShow = typeof n.valAxisLineShow < "u" ? n.valAxisLineShow : true, n.serAxisLineShow = typeof n.serAxisLineShow < "u" ? n.serAxisLineShow : true, n.v3DRotX = !isNaN(n.v3DRotX) && n.v3DRotX >= -90 && n.v3DRotX <= 90 ? n.v3DRotX : 30, n.v3DRotY = !isNaN(n.v3DRotY) && n.v3DRotY >= 0 && n.v3DRotY <= 360 ? n.v3DRotY : 30, n.v3DRAngAx = n.v3DRAngAx || !n.v3DRAngAx ? n.v3DRAngAx : true, n.v3DPerspective = !isNaN(n.v3DPerspective) && n.v3DPerspective >= 0 && n.v3DPerspective <= 240 ? n.v3DPerspective : 30, n.barGapWidthPct = !isNaN(n.barGapWidthPct) && n.barGapWidthPct >= 0 && n.barGapWidthPct <= 1e3 ? n.barGapWidthPct : 150, n.barGapDepthPct = !isNaN(n.barGapDepthPct) && n.barGapDepthPct >= 0 && n.barGapDepthPct <= 1e3 ? n.barGapDepthPct : 150, n.chartColors = Array.isArray(n.chartColors) ? n.chartColors : n._type === "pie" || n._type === "doughnut" ? w6 : mv, n.chartColorsOpacity = n.chartColorsOpacity && !isNaN(n.chartColorsOpacity) ? n.chartColorsOpacity : null, n.border = n.border && typeof n.border == "object" ? n.border : null, n.border && (!n.border.pt || isNaN(n.border.pt)) && (n.border.pt = ap.pt), n.border && (!n.border.color || typeof n.border.color != "string") && (n.border.color = ap.color), n.plotArea = n.plotArea || {}, n.plotArea.border = n.plotArea.border && typeof n.plotArea.border == "object" ? n.plotArea.border : null, n.plotArea.border && (!n.plotArea.border.pt || isNaN(n.plotArea.border.pt)) && (n.plotArea.border.pt = ap.pt), n.plotArea.border && (!n.plotArea.border.color || typeof n.plotArea.border.color != "string") && (n.plotArea.border.color = ap.color), n.border && (n.plotArea.border = n.border), n.plotArea.fill = n.plotArea.fill || { color: null, transparency: null }, n.fill && (n.plotArea.fill.color = n.fill), n.chartArea = n.chartArea || {}, n.chartArea.border = n.chartArea.border && typeof n.chartArea.border == "object" ? n.chartArea.border : null, n.chartArea.border && (n.chartArea.border = { color: n.chartArea.border.color || ap.color, pt: n.chartArea.border.pt || ap.pt }), n.chartArea.roundedCorners = typeof n.chartArea.roundedCorners == "boolean" ? n.chartArea.roundedCorners : true, n.dataBorder = n.dataBorder && typeof n.dataBorder == "object" ? n.dataBorder : null, n.dataBorder && (!n.dataBorder.pt || isNaN(n.dataBorder.pt)) && (n.dataBorder.pt = 0.75), n.dataBorder && (!n.dataBorder.color || typeof n.dataBorder.color != "string" || n.dataBorder.color.length !== 6) && (n.dataBorder.color = "F9F9F9"), !n.dataLabelFormatCode && n._type === "scatter" && (n.dataLabelFormatCode = "General"), !n.dataLabelFormatCode && (n._type === "pie" || n._type === "doughnut") && (n.dataLabelFormatCode = n.showPercent ? "0%" : "General"), n.dataLabelFormatCode = n.dataLabelFormatCode && typeof n.dataLabelFormatCode == "string" ? n.dataLabelFormatCode : "#,##0", !n.dataLabelFormatScatter && n._type === "scatter" && (n.dataLabelFormatScatter = "custom"), n.lineSize = typeof n.lineSize == "number" ? n.lineSize : 2, n.valAxisMajorUnit = typeof n.valAxisMajorUnit == "number" ? n.valAxisMajorUnit : null, n._type === "area" || n._type === "bar" || n._type === "bar3D" || n._type === "line" ? n.catAxisMultiLevelLabels = !!n.catAxisMultiLevelLabels : delete n.catAxisMultiLevelLabels, s._type = "chart", s.options = n, s.chartRid = Fu(e), e._relsChart.push({ rId: Fu(e), data: f, opts: n, type: n._type, globalId: c, fileName: `chart${c}.xml`, Target: `/ppt/charts/chart${c}.xml` }), e._slideObjects.push(s), s;
}
function J2(e, t) {
  let r = { _type: null, text: null, options: null, image: null, imageRid: null, hyperlink: null }, l = t.x || 0, i = t.y || 0, c = t.w || 0, s = t.h || 0, h = t.sizing || null, f = t.hyperlink || "", n = t.data || "", p = t.path || "", m = Fu(e), d = t.objectName ? an(t.objectName) : `Image ${e._slideObjects.filter((x) => x._type === "image").length}`;
  if (!p && !n) return console.error("ERROR: addImage() requires either 'data' or 'path' parameter!"), null;
  if (p && typeof p != "string") return console.error(`ERROR: addImage() 'path' should be a string, ex: {path:'/img/sample.png'} - you sent ${String(p)}`), null;
  if (n && typeof n != "string") return console.error(`ERROR: addImage() 'data' should be a string, ex: {data:'image/png;base64,NMP[...]'} - you sent ${String(n)}`), null;
  if (n && typeof n == "string" && !n.toLowerCase().includes("base64,")) return console.error("ERROR: Image `data` value lacks a base64 header! Ex: 'image/png;base64,NMP[...]')"), null;
  let b = (p.substring(p.lastIndexOf("/") + 1).split("?")[0].split(".").pop().split("#")[0] || "png").toLowerCase();
  if (n && /image\/(\w+);/.exec(n) && /image\/(\w+);/.exec(n).length > 0 ? b = /image\/(\w+);/.exec(n)[1] : n?.toLowerCase().includes("image/svg+xml") && (b = "svg"), r._type = "image", r.image = p || "preencoded.png", r.options = { x: l || 0, y: i || 0, w: c || 1, h: s || 1, altText: t.altText || "", rounding: typeof t.rounding == "boolean" ? t.rounding : false, rectRadius: t.rectRadius, points: t.points, sizing: h, placeholder: t.placeholder, rotate: t.rotate || 0, flipV: t.flipV || false, flipH: t.flipH || false, transparency: t.transparency || 0, objectName: d, shadow: cA(t.shadow) }, b === "svg") e._relsMedia.push({ path: p || n + "png", type: "image/png", extn: "png", data: t.pngFallback || n || "", rId: m, Target: `../media/image-${e._slideNum}-${e._relsMedia.length + 1}.png`, isSvgPng: !t.pngFallback, svgSize: { w: kn(r.options.w, "X", e._presLayout), h: kn(r.options.h, "Y", e._presLayout) } }), r.imageRid = m, e._relsMedia.push({ path: p || n, type: "image/svg+xml", extn: b, data: n || "", rId: m + 1, Target: `../media/image-${e._slideNum}-${e._relsMedia.length + 1}.${b}` }), r.imageRid = m + 1;
  else {
    let x = e._relsMedia.filter((v) => v.path && v.path === p && v.type === "image/" + b && !v.isDuplicate)[0];
    e._relsMedia.push({ path: p || "preencoded." + b, type: "image/" + b, extn: b, data: n || "", rId: m, isDuplicate: !!x?.Target, Target: x?.Target ? x.Target : `../media/image-${e._slideNum}-${e._relsMedia.length + 1}.${b}` }), r.imageRid = m;
  }
  if (typeof f == "object") {
    if (!f.url && !f.slide) throw Error("ERROR: `hyperlink` option requires either: `url` or `slide`");
    m++, e._rels.push({ type: "hyperlink", data: f.slide ? "slide" : "dummy", rId: m, Target: f.url || f.slide.toString() }), f._rId = m, r.hyperlink = f;
  }
  e._slideObjects.push(r);
}
function M6(e, t) {
  var r = t.x || 0, l = t.y || 0, i = t.w || 2, c = t.h || 2, s = t.data || "", h = t.link || "", f = t.path || "", n = t.type || "audio", p = "", m = t.cover || C6, d = t.objectName ? an(t.objectName) : "Media ".concat(e._slideObjects.filter(function(w) {
    return w._type === Qi.media;
  }).length), b = { _type: Qi.media };
  if (!f && !s && n !== "online") throw new Error("addMedia() error: either `data` or `path` are required!");
  if (s && !s.toLowerCase().includes("base64,")) throw new Error("addMedia() error: `data` value lacks a base64 header! Ex: 'video/mpeg;base64,NMP[...]')");
  if (!m.toLowerCase().includes("base64,")) throw new Error("addMedia() error: `cover` value lacks a base64 header! Ex: 'data:image/png;base64,iV[...]')");
  if (n === "online" && !h) throw new Error("addMedia() error: online videos require `link` value");
  if (p = t.extn || (s ? s.split(";")[0].split("/")[1] : f.split(".").pop()) || "mp3", b.mtype = n, b.media = f || "preencoded.mov", b.options = {}, b.options.x = r, b.options.y = l, b.options.w = i, b.options.h = c, b.options.objectName = d, n === "online") {
    var x = Fu(e);
    e._relsMedia.push({ path: f || "preencoded" + p, data: "dummy", type: "online", extn: p, rId: x, Target: h }), b.mediaRid = x, e._relsMedia.push({ path: "preencoded.png", data: m, type: "image/png", extn: "png", rId: Fu(e), Target: "../media/image-".concat(e._slideNum, "-").concat(e._relsMedia.length + 1, ".png") });
  } else {
    var v = e._relsMedia.filter(function(y) {
      return y.path && y.path === f && y.type === n + "/" + p && !y.isDuplicate;
    })[0], x = Fu(e);
    e._relsMedia.push({ path: f || "preencoded" + p, type: n + "/" + p, extn: p, data: s || "", rId: x, isDuplicate: !!v?.Target, Target: v?.Target ? v.Target : "../media/media-".concat(e._slideNum, "-").concat(e._relsMedia.length + 1, ".").concat(p) }), b.mediaRid = x, e._relsMedia.push({ path: f || "preencoded" + p, type: n + "/" + p, extn: p, data: s || "", rId: Fu(e), isDuplicate: !!v?.Target, Target: v?.Target ? v.Target : "../media/media-".concat(e._slideNum, "-").concat(e._relsMedia.length + 0, ".").concat(p) }), e._relsMedia.push({ path: "preencoded.png", type: "image/png", extn: "png", data: m, rId: Fu(e), Target: "../media/image-".concat(e._slideNum, "-").concat(e._relsMedia.length + 1, ".png") });
  }
  e._slideObjects.push(b);
}
function P6(e, t) {
  e._slideObjects.push({ _type: Qi.notes, text: [{ text: t }] });
}
function Vy(e, t, r) {
  let l = typeof r == "object" ? r : {};
  l.line = l.line || { type: "none" };
  let i = { _type: "text", shape: t || "rect", options: l, text: null };
  if (!t) throw Error("Missing/Invalid shape parameter! Example: `addShape(pptxgen.shapes.LINE, {x:1, y:1, w:1, h:1});`");
  let c = { type: l.line.type || "solid", color: l.line.color || W2, transparency: l.line.transparency || 0, width: l.line.width || 1, dashType: l.line.dashType || "solid", beginArrowType: l.line.beginArrowType || null, endArrowType: l.line.endArrowType || null };
  if (typeof l.line == "object" && l.line.type !== "none" && (l.line = c), l.x = l.x || (l.x === 0 ? 0 : 1), l.y = l.y || (l.y === 0 ? 0 : 1), l.w = l.w || (l.w === 0 ? 0 : 1), l.h = l.h || (l.h === 0 ? 0 : 1), l.objectName = l.objectName ? an(l.objectName) : `Shape ${e._slideObjects.filter((s) => s._type === "text").length}`, typeof l.line == "string") {
    let s = c;
    s.color = String(l.line), l.line = s;
  }
  if (typeof l.lineSize == "number" && (l.line.width = l.lineSize), typeof l.lineDash == "string" && (l.line.dashType = l.lineDash), typeof l.lineHead == "string" && (l.line.beginArrowType = l.lineHead), typeof l.lineTail == "string" && (l.line.endArrowType = l.lineTail), l.fill && l.fill.type === "tile" && typeof l.fill.data == "string") {
    let s = Fu(e), h = (/image\/(\w+);/.exec(l.fill.data) || [])[1] || "png";
    e._relsMedia.push({ path: "preencoded." + h, type: "image/" + h, extn: h, data: l.fill.data, rId: s, Target: `../media/image-${e._slideNum}-${e._relsMedia.length + 1}.${h}` }), l.fill._fillImageRid = s;
  }
  wp(e, i), e._slideObjects.push(i);
}
function _6(e, t, r, l, i, c, s) {
  var h = [e], f = r && typeof r == "object" ? r : {};
  f.objectName = f.objectName ? an(f.objectName) : "Table ".concat(e._slideObjects.filter(function(b) {
    return b._type === Qi.table;
  }).length);
  {
    if (t === null || t.length === 0 || !Array.isArray(t)) throw new Error("addTable: Array expected! EX: 'slide.addTable( [rows], {options} );' (https://gitbrent.github.io/PptxGenJS/docs/api-tables.html)");
    if (!t[0] || !Array.isArray(t[0])) throw new Error("addTable: 'rows' should be an array of cells! EX: 'slide.addTable( [ ['A'], ['B'], {text:'C',options:{align:'center'}} ] );' (https://gitbrent.github.io/PptxGenJS/docs/api-tables.html)");
  }
  var n = [];
  t.forEach(function(b) {
    var x = [];
    Array.isArray(b) ? b.forEach(function(v) {
      var w = { _type: Qi.tablecell, text: "", options: typeof v == "object" && v.options ? v.options : {} };
      typeof v == "string" || typeof v == "number" ? w.text = v.toString() : v.text && (typeof v.text == "string" || typeof v.text == "number" ? w.text = v.text.toString() : v.text && (w.text = v.text), v.options && typeof v.options == "object" && (w.options = v.options)), w.options.border = w.options.border || f.border || [{ type: "none" }, { type: "none" }, { type: "none" }, { type: "none" }];
      var y = w.options.border;
      !Array.isArray(y) && typeof y == "object" && (w.options.border = [y, y, y, y]), w.options.border[0] || (w.options.border[0] = { type: "none" }), w.options.border[1] || (w.options.border[1] = { type: "none" }), w.options.border[2] || (w.options.border[2] = { type: "none" }), w.options.border[3] || (w.options.border[3] = { type: "none" });
      var g = [0, 1, 2, 3];
      g.forEach(function(A) {
        w.options.border[A] = { type: w.options.border[A].type || tp.type, color: w.options.border[A].color || tp.color, pt: typeof w.options.border[A].pt == "number" ? w.options.border[A].pt : tp.pt };
      }), x.push(w);
    }) : (console.log("addTable: tableRows has a bad row. A row should be an array of cells. You provided:"), console.log(b)), n.push(x);
  }), f.x = kn(f.x || (f.x === 0 ? 0 : tn / 2), "X", i), f.y = kn(f.y || (f.y === 0 ? 0 : tn / 2), "Y", i), f.h && (f.h = kn(f.h, "Y", i)), f.fontSize = f.fontSize || Vd, f.margin = f.margin === 0 || f.margin ? f.margin : G2, typeof f.margin == "number" && (f.margin = [Number(f.margin), Number(f.margin), Number(f.margin), Number(f.margin)]), f.color || (f.color = f.color || sd), typeof f.border == "string" ? (console.warn("addTable `border` option must be an object. Ex: `{border: {type:'none'}}`"), f.border = null) : Array.isArray(f.border) && [0, 1, 2, 3].forEach(function(b) {
    f.border[b] = f.border[b] ? { type: f.border[b].type || tp.type, color: f.border[b].color || tp.color, pt: f.border[b].pt || tp.pt } : { type: "none" };
  }), f.autoPage = typeof f.autoPage == "boolean" ? f.autoPage : false, f.autoPageRepeatHeader = typeof f.autoPageRepeatHeader == "boolean" ? f.autoPageRepeatHeader : false, f.autoPageHeaderRows = typeof f.autoPageHeaderRows < "u" && !isNaN(Number(f.autoPageHeaderRows)) ? Number(f.autoPageHeaderRows) : 1, f.autoPageLineWeight = typeof f.autoPageLineWeight < "u" && !isNaN(Number(f.autoPageLineWeight)) ? Number(f.autoPageLineWeight) : 0, f.autoPageLineWeight && (f.autoPageLineWeight > 1 ? f.autoPageLineWeight = 1 : f.autoPageLineWeight < -1 && (f.autoPageLineWeight = -1));
  var p = Cv;
  if (l && typeof l._margin < "u" && (Array.isArray(l._margin) ? p = l._margin : isNaN(Number(l._margin)) || (p = [Number(l._margin), Number(l._margin), Number(l._margin), Number(l._margin)])), f.colW) {
    var m = n[0].reduce(function(b, x) {
      var v;
      return !((v = x?.options) === null || v === void 0) && v.colspan && typeof x.options.colspan == "number" ? b += x.options.colspan : b += 1, b;
    }, 0);
    typeof f.colW == "string" || typeof f.colW == "number" || f.colW && Array.isArray(f.colW) && f.colW.length === 1 && m > 1 ? (f.w = Math.floor(Number(f.colW) * m), f.colW = null) : f.colW && Array.isArray(f.colW) && f.colW.length !== m && (console.warn("addTable: mismatch: (colW.length != data.length) Therefore, defaulting to evenly distributed col widths."), f.colW = null);
  } else f.w ? f.w = kn(f.w, "X", i) : f.w = Math.floor(i._sizeW / tn - p[1] - p[3]);
  f.x && f.x < 20 && (f.x = Jn(f.x)), f.y && f.y < 20 && (f.y = Jn(f.y)), f.w && f.w < 20 && (f.w = Jn(f.w)), f.h && f.h < 20 && (f.h = Jn(f.h)), n.forEach(function(b) {
    b.forEach(function(x, v) {
      typeof x == "number" || typeof x == "string" ? b[v] = { _type: Qi.tablecell, text: String(b[v]), options: f } : typeof x == "object" && (typeof x.text == "number" ? b[v].text = b[v].text.toString() : (typeof x.text > "u" || x.text === null) && (b[v].text = ""), b[v].options = x.options || {}, b[v]._type = Qi.tablecell);
    });
  });
  var d = [];
  return f && !f.autoPage ? (wp(e, n), e._slideObjects.push({ _type: Qi.table, arrTabRows: n, options: Object.assign({}, f) })) : (f.autoPageRepeatHeader && (f._arrObjTabHeadRows = n.filter(function(b, x) {
    return x < f.autoPageHeaderRows;
  })), Y2(n, f, i, l).forEach(function(b, x) {
    s(e._slideNum + x) || h.push(c({ masterName: l?._name || null })), x > 0 && (f.y = Jn(f.autoPageSlideStartY || f.newSlideStartY || p[0]));
    {
      var v = s(e._slideNum + x);
      f.autoPage = false, wp(v, b.rows), v.addTable(b.rows, Object.assign({}, f)), x > 0 && d.push(v);
    }
  })), d;
}
function Eg(e, t, r, l) {
  var i = { _type: l ? Qi.placeholder : Qi.text, shape: r?.shape || Ev.RECTANGLE, text: !t || t.length === 0 ? [{ text: "", options: null }] : t, options: r || {} };
  function c(s) {
    {
      if (s.placeholder || (s.color = s.color || i.options.color || e.color || sd), (s.placeholder || l) && (s.bullet = s.bullet || false), s.placeholder && e._slideLayout && e._slideLayout._slideObjects) {
        var h = e._slideLayout._slideObjects.filter(function(p) {
          return p._type === "placeholder" && p.options && p.options.placeholder && p.options.placeholder === s.placeholder;
        })[0];
        h?.options && (s = Os(Os({}, s), h.options));
      }
      if (s.objectName = s.objectName ? an(s.objectName) : "Text ".concat(e._slideObjects.filter(function(p) {
        return p._type === Qi.text;
      }).length), s.shape === Ev.LINE) {
        var f = { type: s.line.type || "solid", color: s.line.color || W2, transparency: s.line.transparency || 0, width: s.line.width || 1, dashType: s.line.dashType || "solid", beginArrowType: s.line.beginArrowType || null, endArrowType: s.line.endArrowType || null };
        if (typeof s.line == "object" && (s.line = f), typeof s.line == "string") {
          var n = f;
          typeof s.line == "string" && (n.color = s.line), s.line = n;
        }
        typeof s.lineSize == "number" && (s.line.width = s.lineSize), typeof s.lineDash == "string" && (s.line.dashType = s.lineDash), typeof s.lineHead == "string" && (s.line.beginArrowType = s.lineHead), typeof s.lineTail == "string" && (s.line.endArrowType = s.lineTail);
      }
      s.line = s.line || {}, s.lineSpacing = s.lineSpacing && !isNaN(s.lineSpacing) ? s.lineSpacing : null, s.lineSpacingMultiple = s.lineSpacingMultiple && !isNaN(s.lineSpacingMultiple) ? s.lineSpacingMultiple : null, s._bodyProp = s._bodyProp || {}, s._bodyProp.autoFit = s.autoFit || false, s._bodyProp.anchor = s.placeholder ? null : fp.ctr, s._bodyProp.vert = s.vert || null, s._bodyProp.wrap = typeof s.wrap == "boolean" ? s.wrap : true, (s.inset && !isNaN(Number(s.inset)) || s.inset === 0) && (s._bodyProp.lIns = Jn(s.inset), s._bodyProp.rIns = Jn(s.inset), s._bodyProp.tIns = Jn(s.inset), s._bodyProp.bIns = Jn(s.inset)), typeof s.underline == "boolean" && s.underline === true && (s.underline = { style: "sng" });
    }
    return (s.align || "").toLowerCase().indexOf("c") === 0 ? s._bodyProp.align = up.center : (s.align || "").toLowerCase().indexOf("l") === 0 ? s._bodyProp.align = up.left : (s.align || "").toLowerCase().indexOf("r") === 0 ? s._bodyProp.align = up.right : (s.align || "").toLowerCase().indexOf("j") === 0 && (s._bodyProp.align = up.justify), (s.valign || "").toLowerCase().indexOf("b") === 0 ? s._bodyProp.anchor = fp.b : (s.valign || "").toLowerCase().indexOf("m") === 0 ? s._bodyProp.anchor = fp.ctr : (s.valign || "").toLowerCase().indexOf("t") === 0 && (s._bodyProp.anchor = fp.t), cA(s.shadow), s;
  }
  i.options = c(i.options), i.text.forEach(function(s) {
    return s.options = c(s.options || {});
  }), wp(e, i.text || ""), e._slideObjects.push(i);
}
function N6(e) {
  e._slideLayout._emptyPlaceholders !== false && (e._slideLayout._slideObjects || []).forEach((t) => {
    t._type === "placeholder" && e._slideObjects.filter((r) => r.options && r.options.placeholder === t.options.placeholder).length === 0 && Eg(e, [{ text: "" }], t.options, false);
  });
}
function Z2(e, t) {
  var r;
  if (t.bkgd && (t.background || (t.background = {}), typeof t.bkgd == "string" ? t.background.color = t.bkgd : (t.bkgd.data && (t.background.data = t.bkgd.data), t.bkgd.path && (t.background.path = t.bkgd.path), t.bkgd.src && (t.background.path = t.bkgd.src))), !((r = t.background) === null || r === void 0) && r.fill && (t.background.color = t.background.fill), e && (e.path || e.data)) {
    e.path = e.path || "preencoded.png";
    var l = (e.path.split(".").pop() || "png").split("?")[0];
    l === "jpg" && (l = "jpeg"), t._relsMedia = t._relsMedia || [];
    var i = t._relsMedia.length + 1;
    t._relsMedia.push({ path: e.path, type: Qi.image, extn: l, data: e.data || null, rId: i, Target: "../media/".concat((t._name || "").replace(/\s+/gi, "-"), "-image-").concat(t._relsMedia.length + 1, ".").concat(l) }), t._bkgdImgRid = i;
  }
}
function wp(e, t) {
  var r = [];
  typeof t == "string" || typeof t == "number" || (Array.isArray(t) ? r = t : typeof t == "object" && (r = [t]), r.forEach(function(l) {
    if (Array.isArray(l)) wp(e, l);
    else if (Array.isArray(l.text)) wp(e, l.text);
    else if (l && typeof l == "object" && l.options && l.options.hyperlink && !l.options.hyperlink._rId) if (typeof l.options.hyperlink != "object") console.log("ERROR: text `hyperlink` option should be an object. Ex: `hyperlink: {url:'https://github.com'}` ");
    else if (!l.options.hyperlink.url && !l.options.hyperlink.slide) console.log("ERROR: 'hyperlink requires either: `url` or `slide`'");
    else {
      var i = Fu(e);
      e._rels.push({ type: Qi.hyperlink, data: l.options.hyperlink.slide ? "slide" : "dummy", rId: i, Target: an(l.options.hyperlink.url) || l.options.hyperlink.slide.toString() }), l.options.hyperlink._rId = i;
    }
  }));
}
var I6 = function() {
  function e(t) {
    var r;
    this.addSlide = t.addSlide, this.getSlide = t.getSlide, this._name = "\u5E7B\u706F\u7247 ".concat(t.slideNumber), this._presLayout = t.presLayout, this._rId = t.slideRId, this._rels = [], this._relsChart = [], this._relsMedia = [], this._setSlideNum = t.setSlideNum, this._slideId = t.slideId, this._slideLayout = t.slideLayout || null, this._slideNum = t.slideNumber, this._slideObjects = [], this._slideNumberProps = !((r = this._slideLayout) === null || r === void 0) && r._slideNumberProps ? this._slideLayout._slideNumberProps : null;
  }
  return Object.defineProperty(e.prototype, "bkgd", { get: function() {
    return this._bkgd;
  }, set: function(t) {
    this._bkgd = t, (!this._background || !this._background.color) && (this._background || (this._background = {}), typeof t == "string" && (this._background.color = t));
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "background", { get: function() {
    return this._background;
  }, set: function(t) {
    this._background = t, t && Z2(t, this);
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "color", { get: function() {
    return this._color;
  }, set: function(t) {
    this._color = t;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "hidden", { get: function() {
    return this._hidden;
  }, set: function(t) {
    this._hidden = t;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "slideNumber", { get: function() {
    return this._slideNumberProps;
  }, set: function(t) {
    this._slideNumberProps = t, this._setSlideNum(t);
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "newAutoPagedSlides", { get: function() {
    return this._newAutoPagedSlides;
  }, enumerable: false, configurable: true }), e.prototype.addChart = function(t, r, l) {
    var i = l || {};
    return i._type = t, Q2(this, t, r, l), this;
  }, e.prototype.addImage = function(t) {
    return J2(this, t), this;
  }, e.prototype.addMedia = function(t) {
    return M6(this, t), this;
  }, e.prototype.addNotes = function(t) {
    return P6(this, t), this;
  }, e.prototype.addShape = function(t, r) {
    return Vy(this, t, r), this;
  }, e.prototype.addTable = function(t, r) {
    return this._newAutoPagedSlides = _6(this, t, r, this._slideLayout, this._presLayout, this.addSlide, this.getSlide), this;
  }, e.prototype.addText = function(t, r) {
    var l = typeof t == "string" || typeof t == "number" ? [{ text: t, options: r }] : t;
    return Eg(this, l, r, false), this;
  }, e;
}();
async function L6(e, t) {
  let r = e.data;
  return await new Promise((l, i) => {
    let c = new V2(), s = (r.length - 1) * 2 + 1, h = r[0]?.labels?.length > 1;
    c.folder("_rels"), c.folder("docProps"), c.folder("xl/_rels"), c.folder("xl/tables"), c.folder("xl/theme"), c.folder("xl/worksheets"), c.folder("xl/worksheets/_rels"), c.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>  <Default Extension="xml" ContentType="application/xml"/>  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>  <Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>  <Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>
`), c.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>
`), c.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Macintosh Excel</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>Sheet1</vt:lpstr></vt:vector></TitlesOfParts><Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>
`), c.file("docProps/core.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>PptxGenJS</dc:creator><cp:lastModifiedBy>PptxGenJS</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">' + (/* @__PURE__ */ new Date()).toISOString() + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + (/* @__PURE__ */ new Date()).toISOString() + "</dcterms:modified></cp:coreProperties>"), c.file("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'), c.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="0" formatCode="General"/></numFmts><fonts count="4"><font><sz val="9"/><color indexed="8"/><name val="Geneva"/></font><font><sz val="9"/><color indexed="8"/><name val="Geneva"/></font><font><sz val="10"/><color indexed="8"/><name val="Geneva"/></font><font><sz val="18"/><color indexed="8"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><dxfs count="0"/><tableStyles count="0"/><colors><indexedColors><rgbColor rgb="ff000000"/><rgbColor rgb="ffffffff"/><rgbColor rgb="ffff0000"/><rgbColor rgb="ff00ff00"/><rgbColor rgb="ff0000ff"/><rgbColor rgb="ffffff00"/><rgbColor rgb="ffff00ff"/><rgbColor rgb="ff00ffff"/><rgbColor rgb="ff000000"/><rgbColor rgb="ffffffff"/><rgbColor rgb="ff878787"/><rgbColor rgb="fff9f9f9"/></indexedColors></colors></styleSheet>
`), c.file("xl/theme/theme1.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light" panose="020F0302020204030204"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="Yu Gothic Light"/><a:font script="Hang" typeface="\uB9D1\uC740 \uACE0\uB515"/><a:font script="Hans" typeface="DengXian Light"/><a:font script="Hant" typeface="\u65B0\u7D30\u660E\u9AD4"/><a:font script="Arab" typeface="Times New Roman"/><a:font script="Hebr" typeface="Times New Roman"/><a:font script="Thai" typeface="Tahoma"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="MoolBoran"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Times New Roman"/><a:font script="Uigh" typeface="Microsoft Uighur"/><a:font script="Geor" typeface="Sylfaen"/></a:majorFont><a:minorFont><a:latin typeface="Calibri" panose="020F0502020204030204"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="Yu Gothic"/><a:font script="Hang" typeface="\uB9D1\uC740 \uACE0\uB515"/><a:font script="Hans" typeface="DengXian"/><a:font script="Hant" typeface="\u65B0\u7D30\u660E\u9AD4"/><a:font script="Arab" typeface="Arial"/><a:font script="Hebr" typeface="Arial"/><a:font script="Thai" typeface="Tahoma"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="DaunPenh"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Arial"/><a:font script="Uigh" typeface="Microsoft Uighur"/><a:font script="Geor" typeface="Sylfaen"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="109000"/><a:tint val="81000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="103000"/><a:lumMod val="102000"/><a:tint val="94000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="100000"/><a:shade val="100000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="99000"/><a:satMod val="120000"/><a:shade val="78000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/><a:lumMod val="102000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/><a:lumMod val="103000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/><a:extLst><a:ext uri="{05A4C25C-085E-4340-85A3-A5531E510DB2}"><thm15:themeFamily xmlns:thm15="http://schemas.microsoft.com/office/thememl/2012/main" name="Office Theme" id="{62F939B6-93AF-4DB8-9C6B-D6C7DFDC589F}" vid="{4A3C46E8-61CC-4603-A589-7422A47A8E4A}"/></a:ext></a:extLst></a:theme>'), c.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x15" xmlns:x15="http://schemas.microsoft.com/office/spreadsheetml/2010/11/main"><fileVersion appName="xl" lastEdited="7" lowestEdited="6" rupBuild="10507"/><workbookPr/><bookViews><workbookView xWindow="0" yWindow="500" windowWidth="20960" windowHeight="15960"/></bookViews><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="0" concurrentCalc="0"/></workbook>
`), c.file("xl/worksheets/_rels/sheet1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table1.xml"/></Relationships>
`);
    {
      let f = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
      if (e.opts._type === "bubble" || e.opts._type === "bubble3D") f += `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${s}" uniqueCount="${s}">`;
      else if (e.opts._type === "scatter") f += `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${r.length}" uniqueCount="${r.length}">`;
      else if (h) {
        let n = r.length;
        r[0].labels.forEach((p) => n += p.filter((m) => m && m !== "").length), f += `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${n}" uniqueCount="${n}">`, f += "<si><t/></si>";
      } else {
        let n = r.length + r[0].labels.length * r[0].labels[0].length + r[0].labels.length, p = r.length + r[0].labels.length * r[0].labels[0].length + 1;
        f += `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${n}" uniqueCount="${p}">`, f += '<si><t xml:space="preserve"></t></si>';
      }
      e.opts._type === "bubble" || e.opts._type === "bubble3D" ? r.forEach((n, p) => {
        p === 0 ? f += "<si><t>X-Axis</t></si>" : (f += `<si><t>${an(n.name || `Y-Axis${p}`)}</t></si>`, f += `<si><t>${an(`\u5C3A\u5BF8${p}`)}</t></si>`);
      }) : r.forEach((n) => {
        f += `<si><t>${an((n.name || " ").replace("X-Axis", "X-Values"))}</t></si>`;
      }), e.opts._type !== "bubble" && e.opts._type !== "bubble3D" && e.opts._type !== "scatter" && r[0].labels.slice().reverse().forEach((n) => {
        n.filter((p) => p && p !== "").forEach((p) => {
          f += `<si><t>${an(p)}</t></si>`;
        });
      }), f += `</sst>
`, c.file("xl/sharedStrings.xml", f);
    }
    {
      let f = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
      if (e.opts._type === "bubble" || e.opts._type === "bubble3D") {
        f += `<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="Table1" displayName="Table1" ref="A1:${xi(s)}${s}" totalsRowShown="0">`, f += `<tableColumns count="${s}">`;
        let n = 1;
        r.forEach((p, m) => {
          m === 0 ? f += `<tableColumn id="${m + 1}" name="X-Values"/>` : (f += `<tableColumn id="${m + n}" name="${p.name}"/>`, n++, f += `<tableColumn id="${m + n}" name="Size${m}"/>`);
        });
      } else e.opts._type === "scatter" ? (f += `<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="Table1" displayName="Table1" ref="A1:${xi(r.length)}${r[0].values.length + 1}" totalsRowShown="0">`, f += `<tableColumns count="${r.length}">`, r.forEach((n, p) => {
        f += `<tableColumn id="${p + 1}" name="${p === 0 ? "X-Values" : "Y-Value "}${p}"/>`;
      })) : (f += `<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="Table1" displayName="Table1" ref="A1:${xi(r.length + r[0].labels.length)}${r[0].labels[0].length + 1}'" totalsRowShown="0">`, f += `<tableColumns count="${r.length + r[0].labels.length}">`, r[0].labels.forEach((n, p) => {
        f += `<tableColumn id="${p + 1}" name="Column${p + 1}"/>`;
      }), r.forEach((n, p) => {
        f += `<tableColumn id="${p + r[0].labels.length + 1}" name="${an(n.name)}"/>`;
      }));
      f += "</tableColumns>", f += '<tableStyleInfo showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>', f += "</table>", c.file("xl/tables/table1.xml", f);
    }
    {
      let f = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
      if (f += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x14ac" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac">', e.opts._type === "bubble" || e.opts._type === "bubble3D" ? f += `<dimension ref="A1:${xi(s)}${r[0].values.length + 1}"/>` : e.opts._type === "scatter" ? f += `<dimension ref="A1:${xi(r.length)}${r[0].values.length + 1}"/>` : f += `<dimension ref="A1:${xi(r.length + 1)}${r[0].values.length + 1}"/>`, f += '<sheetViews><sheetView tabSelected="1" workbookViewId="0"><selection activeCell="B1" sqref="B1"/></sheetView></sheetViews>', f += '<sheetFormatPr baseColWidth="10" defaultRowHeight="16"/>', e.opts._type === "bubble" || e.opts._type === "bubble3D") {
        f += "<sheetData>", f += `<row r="1" spans="1:${s}">`, f += '<c r="A1" t="s"><v>0</v></c>';
        for (let n = 1; n < s; n++) f += `<c r="${xi(n + 1)}1" t="s"><v>${n}</v></c>`;
        f += "</row>", r[0].values.forEach((n, p) => {
          f += `<row r="${p + 2}" spans="1:${s}">`, f += `<c r="A${p + 2}"><v>${n}</v></c>`;
          let m = 2;
          for (let d = 1; d < r.length; d++) f += `<c r="${xi(m)}${p + 2}"><v>${r[d].values[p] || ""}</v></c>`, m++, f += `<c r="${xi(m)}${p + 2}"><v>${r[d].sizes[p] || ""}</v></c>`, m++;
          f += "</row>";
        });
      } else if (e.opts._type === "scatter") {
        f += "<sheetData>", f += `<row r="1" spans="1:${r.length}">`;
        for (let n = 0; n < r.length; n++) f += `<c r="${xi(n + 1)}1" t="s"><v>${n}</v></c>`;
        f += "</row>", r[0].values.forEach((n, p) => {
          f += `<row r="${p + 2}" spans="1:${r.length}">`, f += `<c r="A${p + 2}"><v>${n}</v></c>`;
          for (let m = 1; m < r.length; m++) f += `<c r="${xi(m + 1)}${p + 2}"><v>${r[m].values[p] || r[m].values[p] === 0 ? r[m].values[p] : ""}</v></c>`;
          f += "</row>";
        });
      } else if (f += "<sheetData>", !h) {
        f += `<row r="1" spans="1:${r.length + r[0].labels.length}">`, r[0].labels.forEach((n, p) => {
          f += `<c r="${xi(p + 1)}1" t="s"><v>0</v></c>`;
        });
        for (let n = 0; n < r.length; n++) f += `<c r="${xi(n + 1 + r[0].labels.length)}1" t="s"><v>${n + 1}</v></c>`;
        f += "</row>", r[0].labels[0].forEach((n, p) => {
          f += `<row r="${p + 2}" spans="1:${r.length + r[0].labels.length}">`;
          for (let m = r[0].labels.length - 1; m >= 0; m--) f += `<c r="${xi(r[0].labels.length - m)}${p + 2}" t="s">`, f += `<v>${r.length + p + 1}</v>`, f += "</c>";
          for (let m = 0; m < r.length; m++) f += `<c r="${xi(r[0].labels.length + m + 1)}${p + 2}"><v>${r[m].values[p] || ""}</v></c>`;
          f += "</row>";
        });
      } else {
        f += `<row r="1" spans="1:${r.length + r[0].labels.length}">`;
        for (let d = 0; d < r[0].labels.length; d++) f += `<c r="${xi(d + 1)}1" t="s"><v>0</v></c>`;
        for (let d = r[0].labels.length - 1; d < r.length + r[0].labels.length - 1; d++) f += `<c r="${xi(d + r[0].labels.length)}1" t="s"><v>${d}</v></c>`;
        f += "</row>";
        let n = r.length, p = r[0].labels[0].length, m = r[0].labels.length;
        for (let d = 0; d < p; d++) {
          f += `<row r="${d + 2}" spans="1:${n + m}">`;
          let b = n, x = r[0].labels.slice().reverse();
          x.forEach((v, w) => {
            if (v[d]) {
              let y = w === 0 ? 1 : x[w - 1].filter((g) => g && g !== "").length;
              b += y, f += `<c r="${xi(d + 1 + w)}${d + 2}" t="s"><v>${b}</v></c>`;
            }
          });
          for (let v = 0; v < n; v++) f += `<c r="${xi(m + v + 1)}${d + 2}"><v>${r[v].values[d] || 0}</v></c>`;
          f += "</row>";
        }
      }
      f += "</sheetData>", f += '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>', f += `</worksheet>
`, c.file("xl/worksheets/sheet1.xml", f);
    }
    c.generateAsync({ type: "base64" }).then((f) => {
      t.file(`ppt/embeddings/Microsoft_Excel_Worksheet${e.globalId}.xlsx`, f, { base64: true }), t.file("ppt/charts/_rels/" + e.fileName + ".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/Microsoft_Excel_Worksheet${e.globalId}.xlsx"/></Relationships>`), t.file(`ppt/charts/${e.fileName}`, O6(e)), l("");
    }).catch((f) => {
      i(f);
    });
  });
}
function O6(e) {
  var t, r, l, i, c = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', s = false;
  if (c += '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">', c += '<c:date1904 val="0"/>', c += '<c:roundedCorners val="'.concat(e.opts.chartArea.roundedCorners ? "1" : "0", '"/>'), c += "<c:chart>", e.opts.showTitle ? (c += hm({ title: e.opts.title || "\u56FE\u8868\u6807\u9898", color: e.opts.titleColor, fontFace: e.opts.titleFontFace, fontSize: e.opts.titleFontSize || A6, titleAlign: e.opts.titleAlign, titleBold: e.opts.titleBold, titlePos: e.opts.titlePos, titleRotate: e.opts.titleRotate }, e.opts.x, e.opts.y), c += '<c:autoTitleDeleted val="0"/>') : c += '<c:autoTitleDeleted val="1"/>', e.opts._type === Wn.BAR3D && (c += '<c:view3D><c:rotX val="'.concat(e.opts.v3DRotX, '"/><c:rotY val="').concat(e.opts.v3DRotY, '"/><c:rAngAx val="').concat(e.opts.v3DRAngAx ? 1 : 0, '"/><c:perspective val="').concat(e.opts.v3DPerspective, '"/></c:view3D>')), c += "<c:plotArea>", e.opts.layout ? (c += "<c:layout>", c += " <c:manualLayout>", c += '  <c:layoutTarget val="inner" />', c += '  <c:xMode val="edge" />', c += '  <c:yMode val="edge" />', c += '  <c:x val="' + (e.opts.layout.x || 0) + '" />', c += '  <c:y val="' + (e.opts.layout.y || 0) + '" />', c += '  <c:w val="' + (e.opts.layout.w || 1) + '" />', c += '  <c:h val="' + (e.opts.layout.h || 1) + '" />', c += " </c:manualLayout>", c += "</c:layout>") : c += "<c:layout/>", Array.isArray(e.opts._type) ? e.opts._type.forEach(function(h) {
    var f = Os(Os({}, e.opts), h.options), n = f.secondaryValAxis ? ng : $u, p = f.secondaryCatAxis ? Dy : gv;
    s = s || f.secondaryValAxis, c += $w(h.type, h.data, f, n, p);
  }) : c += $w(e.opts._type, e.data, e.opts, $u, gv), e.opts._type !== Wn.PIE && e.opts._type !== Wn.DOUGHNUT) {
    if (e.opts.valAxes && e.opts.valAxes.length > 1 && !s) throw new Error("Secondary axis must be used by one of the multiple charts");
    if (e.opts.catAxes) {
      if (!e.opts.valAxes || e.opts.valAxes.length !== e.opts.catAxes.length) throw new Error("There must be the same number of value and category axes.");
      c += ay(Os(Os({}, e.opts), e.opts.catAxes[0]), gv, $u);
    } else c += ay(e.opts, gv, $u);
    e.opts.valAxes ? (c += ry(Os(Os({}, e.opts), e.opts.valAxes[0]), $u), e.opts.valAxes[1] && (c += ry(Os(Os({}, e.opts), e.opts.valAxes[1]), ng))) : (c += ry(e.opts, $u), e.opts._type === Wn.BAR3D && (c += D6(e.opts, K2, $u))), !((t = e.opts) === null || t === void 0) && t.catAxes && (!((r = e.opts) === null || r === void 0) && r.catAxes[1]) && (c += ay(Os(Os({}, e.opts), e.opts.catAxes[1]), Dy, ng));
  }
  return e.opts.showDataTable && (c += "<c:dTable>", c += '  <c:showHorzBorder val="'.concat(e.opts.showDataTableHorzBorder ? 1 : 0, '"/>'), c += '  <c:showVertBorder val="'.concat(e.opts.showDataTableVertBorder ? 1 : 0, '"/>'), c += '  <c:showOutline    val="'.concat(e.opts.showDataTableOutline ? 1 : 0, '"/>'), c += '  <c:showKeys       val="'.concat(e.opts.showDataTableKeys ? 1 : 0, '"/>'), c += "  <c:spPr>", c += "    <a:noFill/>", c += '    <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="tx1"><a:lumMod val="15000"/><a:lumOff val="85000"/></a:schemeClr></a:solidFill><a:round/></a:ln>', c += "    <a:effectLst/>", c += "  </c:spPr>", c += "  <c:txPr>", c += '   <a:bodyPr rot="0" spcFirstLastPara="1" vertOverflow="ellipsis" vert="horz" wrap="square" anchor="ctr" anchorCtr="1"/>', c += "   <a:lstStyle/>", c += "   <a:p>", c += '     <a:pPr rtl="0">', c += '       <a:defRPr sz="'.concat(Math.round((e.opts.dataTableFontSize || Vd) * 100), '" b="0" i="0" u="none" strike="noStrike" kern="1200" baseline="0">'), c += '         <a:solidFill><a:schemeClr val="tx1"><a:lumMod val="65000"/><a:lumOff val="35000"/></a:schemeClr></a:solidFill>', c += '         <a:latin typeface="+mn-lt"/>', c += '         <a:ea typeface="+mn-ea"/>', c += '         <a:cs typeface="+mn-cs"/>', c += "       </a:defRPr>", c += "     </a:pPr>", c += '    <a:endParaRPr lang="en-US"/>', c += "   </a:p>", c += " </c:txPr>", c += "</c:dTable>"), c += "  <c:spPr>", c += !((l = e.opts.plotArea.fill) === null || l === void 0) && l.color ? cd(e.opts.plotArea.fill) : "<a:noFill/>", c += e.opts.plotArea.border ? '<a:ln w="'.concat(Jo(e.opts.plotArea.border.pt), '" cap="flat">').concat(cd(e.opts.plotArea.border.color), "</a:ln>") : "<a:ln><a:noFill/></a:ln>", c += "    <a:effectLst/>", c += "  </c:spPr>", c += "</c:plotArea>", e.opts.showLegend && (c += "<c:legend>", c += '<c:legendPos val="' + e.opts.legendPos + '"/>', c += '<c:overlay val="0"/>', (e.opts.legendFontFace || e.opts.legendFontSize || e.opts.legendColor) && (c += "<c:txPr>", c += "  <a:bodyPr/>", c += "  <a:lstStyle/>", c += "  <a:p>", c += "    <a:pPr>", c += e.opts.legendFontSize ? '<a:defRPr sz="'.concat(Math.round(Number(e.opts.legendFontSize) * 100), '">') : "<a:defRPr>", e.opts.legendColor && (c += cd(e.opts.legendColor)), e.opts.legendFontFace && (c += '<a:latin typeface="' + e.opts.legendFontFace + '"/>'), e.opts.legendFontFace && (c += '<a:cs    typeface="' + e.opts.legendFontFace + '"/>'), c += "      </a:defRPr>", c += "    </a:pPr>", c += '    <a:endParaRPr lang="en-US"/>', c += "  </a:p>", c += "</c:txPr>"), c += "</c:legend>"), c += '  <c:plotVisOnly val="1"/>', c += '  <c:dispBlanksAs val="' + e.opts.displayBlanksAs + '"/>', e.opts._type === Wn.SCATTER && (c += '<c:showDLblsOverMax val="1"/>'), c += "</c:chart>", c += "<c:spPr>", c += !((i = e.opts.chartArea.fill) === null || i === void 0) && i.color ? cd(e.opts.chartArea.fill) : "<a:noFill/>", c += e.opts.chartArea.border ? '<a:ln w="'.concat(Jo(e.opts.chartArea.border.pt), '" cap="flat">').concat(cd(e.opts.chartArea.border.color), "</a:ln>") : "<a:ln><a:noFill/></a:ln>", c += "  <a:effectLst/>", c += "</c:spPr>", c += '<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData>', c += "</c:chartSpace>", c;
}
function $w(e, t, r, l, i, c) {
  var s = -1, h = 1, f = null, n = "";
  switch (e) {
    case Wn.AREA:
    case Wn.BAR:
    case Wn.BAR3D:
    case Wn.LINE:
    case Wn.RADAR:
      n += "<c:".concat(e, "Chart>"), e === Wn.AREA && r.barGrouping === "stacked" && (n += '<c:grouping val="' + r.barGrouping + '"/>'), (e === Wn.BAR || e === Wn.BAR3D) && (n += '<c:barDir val="' + r.barDir + '"/>', n += '<c:grouping val="' + (r.barGrouping || "clustered") + '"/>'), e === Wn.RADAR && (n += '<c:radarStyle val="' + r.radarStyle + '"/>'), n += '<c:varyColors val="0"/>', t.forEach(function(p) {
        var m;
        s++, n += "<c:ser>", n += '  <c:idx val="'.concat(p._dataIndex, '"/><c:order val="').concat(p._dataIndex, '"/>'), n += "  <c:tx>", n += "    <c:strRef>", n += "      <c:f>Sheet1!$" + xi(p._dataIndex + p.labels.length + 1) + "$1</c:f>", n += '      <c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>' + an(p.name) + "</c:v></c:pt></c:strCache>", n += "    </c:strRef>", n += "  </c:tx>";
        var d = r.chartColors ? r.chartColors[s % r.chartColors.length] : null;
        n += "  <c:spPr>", d === "transparent" ? n += "<a:noFill/>" : r.chartColorsOpacity ? n += "<a:solidFill>" + ri(d, '<a:alpha val="'.concat(Math.round(r.chartColorsOpacity * 1e3), '"/>')) + "</a:solidFill>" : n += "<a:solidFill>" + ri(d) + "</a:solidFill>", e === Wn.LINE || e === Wn.RADAR ? r.lineSize === 0 ? n += "<a:ln><a:noFill/></a:ln>" : (n += '<a:ln w="'.concat(Jo(r.lineSize), '" cap="').concat(sg(r.lineCap), '"><a:solidFill>').concat(ri(d), "</a:solidFill>"), n += '<a:prstDash val="' + (r.lineDash || "solid") + '"/><a:round/></a:ln>') : r.dataBorder && (n += '<a:ln w="'.concat(Jo(r.dataBorder.pt), '" cap="').concat(sg(r.lineCap), '"><a:solidFill>').concat(ri(r.dataBorder.color), '</a:solidFill><a:prstDash val="solid"/><a:round/></a:ln>')), n += vh(r.shadow, ph), n += "  </c:spPr>", n += '  <c:invertIfNegative val="0"/>', e !== Wn.RADAR && (n += "<c:dLbls>", n += '<c:numFmt formatCode="'.concat(an(r.dataLabelFormatCode) || "General", '" sourceLinked="0"/>'), r.dataLabelBkgrdColors && (n += "<c:spPr><a:solidFill>".concat(ri(d), "</a:solidFill></c:spPr>")), n += "<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>", n += '<a:defRPr b="'.concat(r.dataLabelFontBold ? 1 : 0, '" i="').concat(r.dataLabelFontItalic ? 1 : 0, '" strike="noStrike" sz="').concat(Math.round((r.dataLabelFontSize || Vd) * 100), '" u="none">'), n += "<a:solidFill>".concat(ri(r.dataLabelColor || sd), "</a:solidFill>"), n += '<a:latin typeface="'.concat(r.dataLabelFontFace || "Arial", '"/>'), n += "</a:defRPr></a:pPr></a:p></c:txPr>", r.dataLabelPosition && (n += '<c:dLblPos val="'.concat(r.dataLabelPosition, '"/>')), n += '<c:showLegendKey val="0"/>', n += '<c:showVal val="'.concat(r.showValue ? "1" : "0", '"/>'), n += '<c:showCatName val="0"/><c:showSerName val="'.concat(r.showSerName ? "1" : "0", '"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>'), n += '<c:showLeaderLines val="'.concat(r.showLeaderLines ? "1" : "0", '"/>'), n += "</c:dLbls>"), (e === Wn.LINE || e === Wn.RADAR) && (n += "<c:marker>", n += '  <c:symbol val="' + r.lineDataSymbol + '"/>', r.lineDataSymbolSize && (n += '<c:size val="'.concat(r.lineDataSymbolSize, '"/>')), n += "  <c:spPr>", n += "    <a:solidFill>".concat(ri(r.chartColors[p._dataIndex + 1 > r.chartColors.length ? Math.floor(Math.random() * r.chartColors.length) : p._dataIndex]), "</a:solidFill>"), n += '    <a:ln w="'.concat(r.lineDataSymbolLineSize, '" cap="flat"><a:solidFill>').concat(ri(r.lineDataSymbolLineColor || d), '</a:solidFill><a:prstDash val="solid"/><a:round/></a:ln>'), n += "    <a:effectLst/>", n += "  </c:spPr>", n += "</c:marker>"), (e === Wn.BAR || e === Wn.BAR3D) && t.length === 1 && (r.chartColors && r.chartColors !== mv && r.chartColors.length > 1 || !((m = r.invertedColors) === null || m === void 0) && m.length) && p.values.forEach(function(b, x) {
          var v = b < 0 ? r.invertedColors || r.chartColors || mv : r.chartColors || [];
          n += "  <c:dPt>", n += '    <c:idx val="'.concat(x, '"/>'), n += '      <c:invertIfNegative val="0"/>', n += '    <c:bubble3D val="0"/>', n += "    <c:spPr>", r.lineSize === 0 ? n += "<a:ln><a:noFill/></a:ln>" : e === Wn.BAR ? (n += "<a:solidFill>", n += '  <a:srgbClr val="' + v[x % v.length] + '"/>', n += "</a:solidFill>") : (n += "<a:ln>", n += "  <a:solidFill>", n += '   <a:srgbClr val="' + v[x % v.length] + '"/>', n += "  </a:solidFill>", n += "</a:ln>"), n += vh(r.shadow, ph), n += "    </c:spPr>", n += "  </c:dPt>";
        }), n += "<c:cat>", r.catLabelFormatCode ? (n += "  <c:numRef>", n += "    <c:f>Sheet1!$A$2:$A$".concat(p.labels[0].length + 1, "</c:f>"), n += "    <c:numCache>", n += "      <c:formatCode>" + (r.catLabelFormatCode || "General") + "</c:formatCode>", n += '      <c:ptCount val="'.concat(p.labels[0].length, '"/>'), p.labels[0].forEach(function(b, x) {
          return n += '<c:pt idx="'.concat(x, '"><c:v>').concat(an(b), "</c:v></c:pt>");
        }), n += "    </c:numCache>", n += "  </c:numRef>") : (n += "  <c:multiLvlStrRef>", n += "    <c:f>Sheet1!$A$2:$".concat(xi(p.labels.length), "$").concat(p.labels[0].length + 1, "</c:f>"), n += "    <c:multiLvlStrCache>", n += '      <c:ptCount val="'.concat(p.labels[0].length, '"/>'), p.labels.forEach(function(b) {
          n += "<c:lvl>", b.forEach(function(x, v) {
            return n += '<c:pt idx="'.concat(v, '"><c:v>').concat(an(x), "</c:v></c:pt>");
          }), n += "</c:lvl>";
        }), n += "    </c:multiLvlStrCache>", n += "  </c:multiLvlStrRef>"), n += "</c:cat>", n += "<c:val>", n += "  <c:numRef>", n += "<c:f>Sheet1!$".concat(xi(p._dataIndex + p.labels.length + 1), "$2:$").concat(xi(p._dataIndex + p.labels.length + 1), "$").concat(p.labels[0].length + 1, "</c:f>"), n += "    <c:numCache>", n += "      <c:formatCode>" + (r.valLabelFormatCode || r.dataTableFormatCode || "General") + "</c:formatCode>", n += '      <c:ptCount val="'.concat(p.labels[0].length, '"/>'), p.values.forEach(function(b, x) {
          return n += '<c:pt idx="'.concat(x, '"><c:v>').concat(b || b === 0 ? b : "", "</c:v></c:pt>");
        }), n += "    </c:numCache>", n += "  </c:numRef>", n += "</c:val>", e === Wn.LINE && (n += '<c:smooth val="' + (r.lineSmooth ? "1" : "0") + '"/>'), n += "</c:ser>";
      }), n += "  <c:dLbls>", n += '    <c:numFmt formatCode="'.concat(an(r.dataLabelFormatCode) || "General", '" sourceLinked="0"/>'), n += "    <c:txPr>", n += "      <a:bodyPr/>", n += "      <a:lstStyle/>", n += "      <a:p><a:pPr>", n += '        <a:defRPr b="'.concat(r.dataLabelFontBold ? 1 : 0, '" i="').concat(r.dataLabelFontItalic ? 1 : 0, '" strike="noStrike" sz="').concat(Math.round((r.dataLabelFontSize || Vd) * 100), '" u="none">'), n += "          <a:solidFill>" + ri(r.dataLabelColor || sd) + "</a:solidFill>", n += '          <a:latin typeface="' + (r.dataLabelFontFace || "Arial") + '"/>', n += "        </a:defRPr>", n += "      </a:pPr></a:p>", n += "    </c:txPr>", r.dataLabelPosition && (n += ' <c:dLblPos val="' + r.dataLabelPosition + '"/>'), n += '    <c:showLegendKey val="0"/>', n += '    <c:showVal val="' + (r.showValue ? "1" : "0") + '"/>', n += '    <c:showCatName val="0"/>', n += '    <c:showSerName val="' + (r.showSerName ? "1" : "0") + '"/>', n += '    <c:showPercent val="0"/>', n += '    <c:showBubbleSize val="0"/>', n += '    <c:showLeaderLines val="'.concat(r.showLeaderLines ? "1" : "0", '"/>'), n += "  </c:dLbls>", e === Wn.BAR ? (n += '  <c:gapWidth val="'.concat(r.barGapWidthPct, '"/>'), n += '  <c:overlap val="'.concat((r.barGrouping || "").includes("tacked") ? 100 : r.barOverlapPct ? r.barOverlapPct : 0, '"/>')) : e === Wn.BAR3D ? (n += '  <c:gapWidth val="'.concat(r.barGapWidthPct, '"/>'), n += '  <c:gapDepth val="'.concat(r.barGapDepthPct, '"/>'), n += '  <c:shape val="' + r.bar3DShape + '"/>') : e === Wn.LINE && (n += '  <c:marker val="1"/>'), n += '<c:axId val="'.concat(i, '"/><c:axId val="').concat(l, '"/><c:axId val="').concat(K2, '"/>'), n += "</c:".concat(e, "Chart>");
      break;
    case Wn.SCATTER:
      n += "<c:" + e + "Chart>", n += '<c:scatterStyle val="lineMarker"/>', n += '<c:varyColors val="0"/>', s = -1, t.filter(function(p, m) {
        return m > 0;
      }).forEach(function(p, m) {
        s++, n += "<c:ser>", n += '  <c:idx val="'.concat(m, '"/>'), n += '  <c:order val="'.concat(m, '"/>'), n += "  <c:tx>", n += "    <c:strRef>", n += "      <c:f>Sheet1!$".concat(xi(m + 2), "$1</c:f>"), n += '      <c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>' + an(p.name) + "</c:v></c:pt></c:strCache>", n += "    </c:strRef>", n += "  </c:tx>", n += "  <c:spPr>";
        {
          var d = r.chartColors[s % r.chartColors.length];
          d === "transparent" ? n += "<a:noFill/>" : r.chartColorsOpacity ? n += "<a:solidFill>" + ri(d, '<a:alpha val="' + Math.round(r.chartColorsOpacity * 1e3).toString() + '"/>') + "</a:solidFill>" : n += "<a:solidFill>" + ri(d) + "</a:solidFill>", r.lineSize === 0 ? n += "<a:ln><a:noFill/></a:ln>" : (n += '<a:ln w="'.concat(Jo(r.lineSize), '" cap="').concat(sg(r.lineCap), '"><a:solidFill>').concat(ri(d), "</a:solidFill>"), n += '<a:prstDash val="'.concat(r.lineDash || "solid", '"/><a:round/></a:ln>')), n += vh(r.shadow, ph);
        }
        if (n += "  </c:spPr>", n += "<c:marker>", n += '  <c:symbol val="' + r.lineDataSymbol + '"/>', r.lineDataSymbolSize && (n += '<c:size val="'.concat(r.lineDataSymbolSize, '"/>')), n += "<c:spPr>", n += "<a:solidFill>".concat(ri(r.chartColors[m + 1 > r.chartColors.length ? Math.floor(Math.random() * r.chartColors.length) : m]), "</a:solidFill>"), n += '<a:ln w="'.concat(r.lineDataSymbolLineSize, '" cap="flat"><a:solidFill>').concat(ri(r.lineDataSymbolLineColor || r.chartColors[s % r.chartColors.length]), '</a:solidFill><a:prstDash val="solid"/><a:round/></a:ln>'), n += "<a:effectLst/>", n += "</c:spPr>", n += "</c:marker>", r.showLabel) {
          var b = ig("-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
          p.labels[0] && (r.dataLabelFormatScatter === "custom" || r.dataLabelFormatScatter === "customXY") && (n += "<c:dLbls>", p.labels[0].forEach(function(x, v) {
            (r.dataLabelFormatScatter === "custom" || r.dataLabelFormatScatter === "customXY") && (n += "  <c:dLbl>", n += '    <c:idx val="'.concat(v, '"/>'), n += "    <c:tx>", n += "      <c:rich>", n += "            <a:bodyPr>", n += "                <a:spAutoFit/>", n += "            </a:bodyPr>", n += "            <a:lstStyle/>", n += "            <a:p>", n += "                <a:pPr>", n += "                    <a:defRPr/>", n += "                </a:pPr>", n += "              <a:r>", n += '                    <a:rPr lang="' + (r.lang || "en-US") + '" dirty="0"/>', n += "                    <a:t>" + an(x) + "</a:t>", n += "              </a:r>", r.dataLabelFormatScatter === "customXY" && !/^ *$/.test(x) && (n += "              <a:r>", n += '                  <a:rPr lang="' + (r.lang || "en-US") + '" baseline="0" dirty="0"/>', n += "                  <a:t> (</a:t>", n += "              </a:r>", n += '              <a:fld id="{' + ig("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx") + '}" type="XVALUE">', n += '                  <a:rPr lang="' + (r.lang || "en-US") + '" baseline="0"/>', n += "                  <a:pPr>", n += "                      <a:defRPr/>", n += "                  </a:pPr>", n += "                  <a:t>[" + an(p.name) + "</a:t>", n += "              </a:fld>", n += "              <a:r>", n += '                  <a:rPr lang="' + (r.lang || "en-US") + '" baseline="0" dirty="0"/>', n += "                  <a:t>, </a:t>", n += "              </a:r>", n += '              <a:fld id="{' + ig("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx") + '}" type="YVALUE">', n += '                  <a:rPr lang="' + (r.lang || "en-US") + '" baseline="0"/>', n += "                  <a:pPr>", n += "                      <a:defRPr/>", n += "                  </a:pPr>", n += "                  <a:t>[" + an(p.name) + "]</a:t>", n += "              </a:fld>", n += "              <a:r>", n += '                  <a:rPr lang="' + (r.lang || "en-US") + '" baseline="0" dirty="0"/>', n += "                  <a:t>)</a:t>", n += "              </a:r>", n += '              <a:endParaRPr lang="' + (r.lang || "en-US") + '" dirty="0"/>'), n += "            </a:p>", n += "      </c:rich>", n += "    </c:tx>", n += "    <c:spPr>", n += "        <a:noFill/>", n += "        <a:ln>", n += "            <a:noFill/>", n += "        </a:ln>", n += "        <a:effectLst/>", n += "    </c:spPr>", r.dataLabelPosition && (n += ' <c:dLblPos val="' + r.dataLabelPosition + '"/>'), n += '    <c:showLegendKey val="0"/>', n += '    <c:showVal val="0"/>', n += '    <c:showCatName val="0"/>', n += '    <c:showSerName val="0"/>', n += '    <c:showPercent val="0"/>', n += '    <c:showBubbleSize val="0"/>', n += '       <c:showLeaderLines val="1"/>', n += "    <c:extLst>", n += '      <c:ext uri="{CE6537A1-D6FC-4f65-9D91-7224C49458BB}" xmlns:c15="http://schemas.microsoft.com/office/drawing/2012/chart"/>', n += '      <c:ext uri="{C3380CC4-5D6E-409C-BE32-E72D297353CC}" xmlns:c16="http://schemas.microsoft.com/office/drawing/2014/chart">', n += '            <c16:uniqueId val="{'.concat("00000000".substring(0, 8 - (v + 1).toString().length).toString()).concat(v + 1).concat(b, '}"/>'), n += "      </c:ext>", n += "        </c:extLst>", n += "</c:dLbl>");
          }), n += "</c:dLbls>"), r.dataLabelFormatScatter === "XY" && (n += "<c:dLbls>", n += "    <c:spPr>", n += "        <a:noFill/>", n += "        <a:ln>", n += "            <a:noFill/>", n += "        </a:ln>", n += "          <a:effectLst/>", n += "    </c:spPr>", n += "    <c:txPr>", n += "        <a:bodyPr>", n += "            <a:spAutoFit/>", n += "        </a:bodyPr>", n += "        <a:lstStyle/>", n += "        <a:p>", n += "            <a:pPr>", n += "                <a:defRPr/>", n += "            </a:pPr>", n += '            <a:endParaRPr lang="en-US"/>', n += "        </a:p>", n += "    </c:txPr>", r.dataLabelPosition && (n += ' <c:dLblPos val="' + r.dataLabelPosition + '"/>'), n += '    <c:showLegendKey val="0"/>', n += ' <c:showVal val="'.concat(r.showLabel ? "1" : "0", '"/>'), n += ' <c:showCatName val="'.concat(r.showLabel ? "1" : "0", '"/>'), n += ' <c:showSerName val="'.concat(r.showSerName ? "1" : "0", '"/>'), n += '    <c:showPercent val="0"/>', n += '    <c:showBubbleSize val="0"/>', n += "    <c:extLst>", n += '        <c:ext uri="{CE6537A1-D6FC-4f65-9D91-7224C49458BB}" xmlns:c15="http://schemas.microsoft.com/office/drawing/2012/chart">', n += '            <c15:showLeaderLines val="1"/>', n += "        </c:ext>", n += "    </c:extLst>", n += "</c:dLbls>");
        }
        t.length === 1 && r.chartColors !== mv && p.values.forEach(function(x, v) {
          var w = x < 0 ? r.invertedColors || r.chartColors || mv : r.chartColors || [];
          n += "  <c:dPt>", n += '    <c:idx val="'.concat(v, '"/>'), n += '      <c:invertIfNegative val="0"/>', n += '    <c:bubble3D val="0"/>', n += "    <c:spPr>", r.lineSize === 0 ? n += "<a:ln><a:noFill/></a:ln>" : (n += "<a:solidFill>", n += ' <a:srgbClr val="' + w[v % w.length] + '"/>', n += "</a:solidFill>"), n += vh(r.shadow, ph), n += "    </c:spPr>", n += "  </c:dPt>";
        }), n += "<c:xVal>", n += "  <c:numRef>", n += "    <c:f>Sheet1!$A$2:$A$".concat(t[0].values.length + 1, "</c:f>"), n += "    <c:numCache>", n += "      <c:formatCode>General</c:formatCode>", n += '      <c:ptCount val="'.concat(t[0].values.length, '"/>'), t[0].values.forEach(function(x, v) {
          n += '<c:pt idx="'.concat(v, '"><c:v>').concat(x || x === 0 ? x : "", "</c:v></c:pt>");
        }), n += "    </c:numCache>", n += "  </c:numRef>", n += "</c:xVal>", n += "<c:yVal>", n += "  <c:numRef>", n += "    <c:f>Sheet1!$".concat(xi(m + 2), "$2:$").concat(xi(m + 2), "$").concat(t[0].values.length + 1, "</c:f>"), n += "    <c:numCache>", n += "      <c:formatCode>General</c:formatCode>", n += '      <c:ptCount val="'.concat(t[0].values.length, '"/>'), t[0].values.forEach(function(x, v) {
          n += '<c:pt idx="'.concat(v, '"><c:v>').concat(p.values[v] || p.values[v] === 0 ? p.values[v] : "", "</c:v></c:pt>");
        }), n += "    </c:numCache>", n += "  </c:numRef>", n += "</c:yVal>", n += '<c:smooth val="' + (r.lineSmooth ? "1" : "0") + '"/>', n += "</c:ser>";
      }), n += "  <c:dLbls>", n += '    <c:numFmt formatCode="'.concat(an(r.dataLabelFormatCode) || "General", '" sourceLinked="0"/>'), n += "    <c:txPr>", n += "      <a:bodyPr/>", n += "      <a:lstStyle/>", n += "      <a:p><a:pPr>", n += '        <a:defRPr b="'.concat(r.dataLabelFontBold ? "1" : "0", '" i="').concat(r.dataLabelFontItalic ? "1" : "0", '" strike="noStrike" sz="').concat(Math.round((r.dataLabelFontSize || Vd) * 100), '" u="none">'), n += "          <a:solidFill>" + ri(r.dataLabelColor || sd) + "</a:solidFill>", n += '          <a:latin typeface="' + (r.dataLabelFontFace || "Arial") + '"/>', n += "        </a:defRPr>", n += "      </a:pPr></a:p>", n += "    </c:txPr>", r.dataLabelPosition && (n += ' <c:dLblPos val="' + r.dataLabelPosition + '"/>'), n += '    <c:showLegendKey val="0"/>', n += '    <c:showVal val="' + (r.showValue ? "1" : "0") + '"/>', n += '    <c:showCatName val="0"/>', n += '    <c:showSerName val="' + (r.showSerName ? "1" : "0") + '"/>', n += '    <c:showPercent val="0"/>', n += '    <c:showBubbleSize val="0"/>', n += "  </c:dLbls>", n += '<c:axId val="'.concat(i, '"/><c:axId val="').concat(l, '"/>'), n += "</c:" + e + "Chart>";
      break;
    case Wn.BUBBLE:
    case Wn.BUBBLE3D:
      n += "<c:bubbleChart>", n += '<c:varyColors val="0"/>', s = -1, t.filter(function(p, m) {
        return m > 0;
      }).forEach(function(p, m) {
        s++, n += "<c:ser>", n += '  <c:idx val="'.concat(m, '"/>'), n += '  <c:order val="'.concat(m, '"/>'), n += "  <c:tx>", n += "    <c:strRef>", n += "      <c:f>Sheet1!$" + xi(h + 1) + "$1</c:f>", n += '      <c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>' + an(p.name) + "</c:v></c:pt></c:strCache>", n += "    </c:strRef>", n += "  </c:tx>";
        {
          n += "<c:spPr>";
          var d = r.chartColors[s % r.chartColors.length];
          d === "transparent" ? n += "<a:noFill/>" : r.chartColorsOpacity ? n += "<a:solidFill>".concat(ri(d, '<a:alpha val="' + Math.round(r.chartColorsOpacity * 1e3).toString() + '"/>'), "</a:solidFill>") : n += "<a:solidFill>" + ri(d) + "</a:solidFill>", r.lineSize === 0 ? n += "<a:ln><a:noFill/></a:ln>" : r.dataBorder ? n += '<a:ln w="'.concat(Jo(r.dataBorder.pt), '" cap="flat"><a:solidFill>').concat(ri(r.dataBorder.color), '</a:solidFill><a:prstDash val="solid"/><a:round/></a:ln>') : (n += '<a:ln w="'.concat(Jo(r.lineSize), '" cap="flat"><a:solidFill>').concat(ri(d), "</a:solidFill>"), n += '<a:prstDash val="'.concat(r.lineDash || "solid", '"/><a:round/></a:ln>')), n += vh(r.shadow, ph), n += "</c:spPr>";
        }
        n += "<c:xVal>", n += "  <c:numRef>", n += "    <c:f>Sheet1!$A$2:$A$".concat(t[0].values.length + 1, "</c:f>"), n += "    <c:numCache>", n += "      <c:formatCode>General</c:formatCode>", n += '      <c:ptCount val="'.concat(t[0].values.length, '"/>'), t[0].values.forEach(function(b, x) {
          n += '<c:pt idx="'.concat(x, '"><c:v>').concat(b || b === 0 ? b : "", "</c:v></c:pt>");
        }), n += "    </c:numCache>", n += "  </c:numRef>", n += "</c:xVal>", n += "<c:yVal>", n += "  <c:numRef>", n += "<c:f>Sheet1!$".concat(xi(h + 1), "$2:$").concat(xi(h + 1), "$").concat(t[0].values.length + 1, "</c:f>"), h++, n += "    <c:numCache>", n += "      <c:formatCode>General</c:formatCode>", n += '      <c:ptCount val="'.concat(t[0].values.length, '"/>'), t[0].values.forEach(function(b, x) {
          n += '<c:pt idx="'.concat(x, '"><c:v>').concat(p.values[x] || p.values[x] === 0 ? p.values[x] : "", "</c:v></c:pt>");
        }), n += "    </c:numCache>", n += "  </c:numRef>", n += "</c:yVal>", n += "  <c:bubbleSize>", n += "    <c:numRef>", n += "<c:f>Sheet1!$".concat(xi(h + 1), "$2:$").concat(xi(h + 1), "$").concat(p.sizes.length + 1, "</c:f>"), h++, n += "      <c:numCache>", n += "        <c:formatCode>General</c:formatCode>", n += '           <c:ptCount val="'.concat(p.sizes.length, '"/>'), p.sizes.forEach(function(b, x) {
          n += '<c:pt idx="'.concat(x, '"><c:v>').concat(b || "", "</c:v></c:pt>");
        }), n += "      </c:numCache>", n += "    </c:numRef>", n += "  </c:bubbleSize>", n += '  <c:bubble3D val="' + (e === Wn.BUBBLE3D ? "1" : "0") + '"/>', n += "</c:ser>";
      }), n += "<c:dLbls>", n += '<c:numFmt formatCode="'.concat(an(r.dataLabelFormatCode) || "General", '" sourceLinked="0"/>'), n += "<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr>", n += '<a:defRPr b="'.concat(r.dataLabelFontBold ? 1 : 0, '" i="').concat(r.dataLabelFontItalic ? 1 : 0, '" strike="noStrike" sz="').concat(Math.round(Math.round(r.dataLabelFontSize || Vd) * 100), '" u="none">'), n += "<a:solidFill>".concat(ri(r.dataLabelColor || sd), "</a:solidFill>"), n += '<a:latin typeface="'.concat(r.dataLabelFontFace || "Arial", '"/>'), n += "</a:defRPr></a:pPr></a:p></c:txPr>", r.dataLabelPosition && (n += '<c:dLblPos val="'.concat(r.dataLabelPosition, '"/>')), n += '<c:showLegendKey val="0"/>', n += '<c:showVal val="'.concat(r.showValue ? "1" : "0", '"/>'), n += '<c:showCatName val="0"/><c:showSerName val="'.concat(r.showSerName ? "1" : "0", '"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>'), n += "<c:extLst>", n += '  <c:ext uri="{CE6537A1-D6FC-4f65-9D91-7224C49458BB}" xmlns:c15="http://schemas.microsoft.com/office/drawing/2012/chart">', n += '    <c15:showLeaderLines val="' + (r.showLeaderLines ? "1" : "0") + '"/>', n += "  </c:ext>", n += "</c:extLst>", n += "</c:dLbls>", n += '<c:axId val="'.concat(i, '"/><c:axId val="').concat(l, '"/>'), n += "</c:bubbleChart>";
      break;
    case Wn.DOUGHNUT:
    case Wn.PIE:
      f = t[0], n += "<c:" + e + "Chart>", n += '  <c:varyColors val="1"/>', n += "<c:ser>", n += '  <c:idx val="0"/>', n += '  <c:order val="0"/>', n += "  <c:tx>", n += "    <c:strRef>", n += "      <c:f>Sheet1!$B$1</c:f>", n += "      <c:strCache>", n += '        <c:ptCount val="1"/>', n += '        <c:pt idx="0"><c:v>' + an(f.name) + "</c:v></c:pt>", n += "      </c:strCache>", n += "    </c:strRef>", n += "  </c:tx>", n += "  <c:spPr>", n += '    <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>', n += '    <a:ln w="9525" cap="flat"><a:solidFill><a:srgbClr val="F9F9F9"/></a:solidFill><a:prstDash val="solid"/><a:round/></a:ln>', r.dataNoEffects ? n += "<a:effectLst/>" : n += vh(r.shadow, ph), n += "  </c:spPr>", f.labels[0].forEach(function(p, m) {
        n += "<c:dPt>", n += ' <c:idx val="'.concat(m, '"/>'), n += ' <c:bubble3D val="0"/>', n += " <c:spPr>", n += "<a:solidFill>".concat(ri(r.chartColors[m + 1 > r.chartColors.length ? Math.floor(Math.random() * r.chartColors.length) : m]), "</a:solidFill>"), r.dataBorder && (n += '<a:ln w="'.concat(Jo(r.dataBorder.pt), '" cap="flat"><a:solidFill>').concat(ri(r.dataBorder.color), '</a:solidFill><a:prstDash val="solid"/><a:round/></a:ln>')), n += vh(r.shadow, ph), n += "  </c:spPr>", n += "</c:dPt>";
      }), n += "<c:dLbls>", f.labels[0].forEach(function(p, m) {
        n += "<c:dLbl>", n += ' <c:idx val="'.concat(m, '"/>'), n += '  <c:numFmt formatCode="'.concat(an(r.dataLabelFormatCode) || "General", '" sourceLinked="0"/>'), n += "  <c:spPr/><c:txPr>", n += "   <a:bodyPr/><a:lstStyle/>", n += "   <a:p><a:pPr>", n += '   <a:defRPr sz="'.concat(Math.round((r.dataLabelFontSize || Vd) * 100), '" b="').concat(r.dataLabelFontBold ? 1 : 0, '" i="').concat(r.dataLabelFontItalic ? 1 : 0, '" u="none" strike="noStrike">'), n += "    <a:solidFill>" + ri(r.dataLabelColor || sd) + "</a:solidFill>", n += '    <a:latin typeface="'.concat(r.dataLabelFontFace || "Arial", '"/>'), n += "   </a:defRPr>", n += "      </a:pPr></a:p>", n += "    </c:txPr>", e === Wn.PIE && r.dataLabelPosition && (n += '<c:dLblPos val="'.concat(r.dataLabelPosition, '"/>')), n += '    <c:showLegendKey val="0"/>', n += '    <c:showVal val="' + (r.showValue ? "1" : "0") + '"/>', n += '    <c:showCatName val="' + (r.showLabel ? "1" : "0") + '"/>', n += '    <c:showSerName val="' + (r.showSerName ? "1" : "0") + '"/>', n += '    <c:showPercent val="' + (r.showPercent ? "1" : "0") + '"/>', n += '    <c:showBubbleSize val="0"/>', n += "  </c:dLbl>";
      }), n += ' <c:numFmt formatCode="'.concat(an(r.dataLabelFormatCode) || "General", '" sourceLinked="0"/>'), n += "    <c:txPr>", n += "      <a:bodyPr/>", n += "      <a:lstStyle/>", n += "      <a:p>", n += "        <a:pPr>", n += '          <a:defRPr sz="1800" b="'.concat(r.dataLabelFontBold ? "1" : "0", '" i="').concat(r.dataLabelFontItalic ? "1" : "0", '" u="none" strike="noStrike">'), n += '            <a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:latin typeface="Arial"/>', n += "          </a:defRPr>", n += "        </a:pPr>", n += "      </a:p>", n += "    </c:txPr>", n += e === Wn.PIE ? '<c:dLblPos val="ctr"/>' : "", n += '    <c:showLegendKey val="0"/>', n += '    <c:showVal val="0"/>', n += '    <c:showCatName val="1"/>', n += '    <c:showSerName val="0"/>', n += '    <c:showPercent val="1"/>', n += '    <c:showBubbleSize val="0"/>', n += ' <c:showLeaderLines val="'.concat(r.showLeaderLines ? "1" : "0", '"/>'), n += "</c:dLbls>", n += "<c:cat>", n += "  <c:strRef>", n += "    <c:f>Sheet1!$A$2:$A$".concat(f.labels[0].length + 1, "</c:f>"), n += "    <c:strCache>", n += '         <c:ptCount val="'.concat(f.labels[0].length, '"/>'), f.labels[0].forEach(function(p, m) {
        n += '<c:pt idx="'.concat(m, '"><c:v>').concat(an(p), "</c:v></c:pt>");
      }), n += "    </c:strCache>", n += "  </c:strRef>", n += "</c:cat>", n += "  <c:val>", n += "    <c:numRef>", n += "      <c:f>Sheet1!$B$2:$B$".concat(f.labels[0].length + 1, "</c:f>"), n += "      <c:numCache>", n += '           <c:ptCount val="'.concat(f.labels[0].length, '"/>'), f.values.forEach(function(p, m) {
        n += '<c:pt idx="'.concat(m, '"><c:v>').concat(p || p === 0 ? p : "", "</c:v></c:pt>");
      }), n += "      </c:numCache>", n += "    </c:numRef>", n += "  </c:val>", n += "  </c:ser>", n += '  <c:firstSliceAng val="'.concat(r.firstSliceAng ? Math.round(r.firstSliceAng) : 0, '"/>'), e === Wn.DOUGHNUT && (n += '<c:holeSize val="'.concat(typeof r.holeSize == "number" ? r.holeSize : "50", '"/>')), n += "</c:" + e + "Chart>";
      break;
    default:
      n += "";
      break;
  }
  return n;
}
function ay(e, t, r) {
  let l = "";
  return e._type === "scatter" || e._type === "bubble" || e._type === "bubble3D" ? l += "<c:valAx>" : l += "<c:" + (e.catLabelFormatCode ? "dateAx" : "catAx") + ">", l += '  <c:axId val="' + t + '"/>', l += "  <c:scaling>", l += '<c:orientation val="' + (e.catAxisOrientation || (e.barDir === "col", "minMax")) + '"/>', (e.catAxisMaxVal || e.catAxisMaxVal === 0) && (l += `<c:max val="${e.catAxisMaxVal}"/>`), (e.catAxisMinVal || e.catAxisMinVal === 0) && (l += `<c:min val="${e.catAxisMinVal}"/>`), l += "</c:scaling>", l += '  <c:delete val="' + (e.catAxisHidden ? "1" : "0") + '"/>', l += '  <c:axPos val="' + (e.barDir === "col" ? "b" : "l") + '"/>', l += e.catGridLine.style !== "none" ? dA(e.catGridLine) : "", e.showCatAxisTitle && (l += hm({ color: e.catAxisTitleColor, fontFace: e.catAxisTitleFontFace, fontSize: e.catAxisTitleFontSize, titleRotate: e.catAxisTitleRotate, title: e.catAxisTitle || "\u5750\u6807\u8F74\u6807\u9898" })), e._type === "scatter" || e._type === "bubble" || e._type === "bubble3D" ? l += '  <c:numFmt formatCode="' + (e.valAxisLabelFormatCode ? an(e.valAxisLabelFormatCode) : "General") + '" sourceLinked="1"/>' : l += '  <c:numFmt formatCode="' + (an(e.catLabelFormatCode) || "General") + '" sourceLinked="1"/>', e._type === "scatter" ? (l += '  <c:majorTickMark val="none"/>', l += '  <c:minorTickMark val="none"/>', l += '  <c:tickLblPos val="nextTo"/>') : (l += '  <c:majorTickMark val="' + (e.catAxisMajorTickMark || "out") + '"/>', l += '  <c:minorTickMark val="' + (e.catAxisMinorTickMark || "none") + '"/>', l += '  <c:tickLblPos val="' + (e.catAxisLabelPos || (e.barDir === "col" ? "low" : "nextTo")) + '"/>'), l += "  <c:spPr>", l += `    <a:ln w="${e.catAxisLineSize ? Jo(e.catAxisLineSize) : e0}" cap="flat">`, l += e.catAxisLineShow ? "<a:solidFill>" + ri(e.catAxisLineColor || yh.color) + "</a:solidFill>" : "<a:noFill/>", l += '      <a:prstDash val="' + (e.catAxisLineStyle || "solid") + '"/>', l += "      <a:round/>", l += "    </a:ln>", l += "  </c:spPr>", l += "  <c:txPr>", e.catAxisLabelRotate ? l += `<a:bodyPr rot="${ef(e.catAxisLabelRotate)}"/>` : l += "<a:bodyPr/>", l += "    <a:lstStyle/>", l += "    <a:p>", l += "    <a:pPr>", l += `      <a:defRPr sz="${Math.round((e.catAxisLabelFontSize || Vd) * 100)}" b="${e.catAxisLabelFontBold ? 1 : 0}" i="${e.catAxisLabelFontItalic ? 1 : 0}" u="none" strike="noStrike">`, l += "      <a:solidFill>" + ri(e.catAxisLabelColor || sd) + "</a:solidFill>", l += '      <a:latin typeface="' + (e.catAxisLabelFontFace || "Arial") + '"/>', l += "   </a:defRPr>", l += "  </a:pPr>", l += '  <a:endParaRPr lang="' + (e.lang || "en-US") + '"/>', l += "  </a:p>", l += " </c:txPr>", l += ' <c:crossAx val="' + r + '"/>', l += ` <c:${typeof e.valAxisCrossesAt == "number" ? "crossesAt" : "crosses"} val="${e.valAxisCrossesAt || "autoZero"}"/>`, l += ' <c:auto val="1"/>', l += ' <c:lblAlgn val="ctr"/>', l += ` <c:noMultiLvlLbl val="${e.catAxisMultiLevelLabels ? 0 : 1}"/>`, e.catAxisLabelFrequency && (l += ' <c:tickLblSkip val="' + e.catAxisLabelFrequency + '"/>'), (e.catLabelFormatCode || e._type === "scatter" || e._type === "bubble" || e._type === "bubble3D") && (e.catLabelFormatCode && (["catAxisBaseTimeUnit", "catAxisMajorTimeUnit", "catAxisMinorTimeUnit"].forEach((i) => {
    e[i] && (typeof e[i] != "string" || !["days", "months", "years"].includes(e[i].toLowerCase())) && (console.warn(`"${i}" must be one of: 'days','months','years' !`), e[i] = null);
  }), e.catAxisBaseTimeUnit && (l += '<c:baseTimeUnit val="' + e.catAxisBaseTimeUnit.toLowerCase() + '"/>'), e.catAxisMajorTimeUnit && (l += '<c:majorTimeUnit val="' + e.catAxisMajorTimeUnit.toLowerCase() + '"/>'), e.catAxisMinorTimeUnit && (l += '<c:minorTimeUnit val="' + e.catAxisMinorTimeUnit.toLowerCase() + '"/>')), e.catAxisMajorUnit && (l += `<c:majorUnit val="${e.catAxisMajorUnit}"/>`), e.catAxisMinorUnit && (l += `<c:minorUnit val="${e.catAxisMinorUnit}"/>`)), e._type === "scatter" || e._type === "bubble" || e._type === "bubble3D" ? l += "</c:valAx>" : l += "</c:" + (e.catLabelFormatCode ? "dateAx" : "catAx") + ">", l;
}
function ry(e, t) {
  let r = t === $u ? e.barDir === "col" ? "l" : "b" : e.barDir !== "col" ? "r" : "t";
  t === ng && (r = "r");
  let l = t === $u ? gv : Dy, i = "";
  return i += "<c:valAx>", i += '  <c:axId val="' + t + '"/>', i += "  <c:scaling>", e.valAxisLogScaleBase && (i += `<c:logBase val="${e.valAxisLogScaleBase}"/>`), i += '<c:orientation val="' + (e.valAxisOrientation || (e.barDir === "col", "minMax")) + '"/>', (e.valAxisMaxVal || e.valAxisMaxVal === 0) && (i += `<c:max val="${e.valAxisMaxVal}"/>`), (e.valAxisMinVal || e.valAxisMinVal === 0) && (i += `<c:min val="${e.valAxisMinVal}"/>`), i += "  </c:scaling>", i += `  <c:delete val="${e.valAxisHidden ? 1 : 0}"/>`, i += '  <c:axPos val="' + r + '"/>', e.valGridLine.style !== "none" && (i += dA(e.valGridLine)), e.showValAxisTitle && (i += hm({ color: e.valAxisTitleColor, fontFace: e.valAxisTitleFontFace, fontSize: e.valAxisTitleFontSize, titleRotate: e.valAxisTitleRotate, title: e.valAxisTitle || "\u5750\u6807\u8F74\u6807\u9898" })), i += `<c:numFmt formatCode="${e.valAxisLabelFormatCode ? an(e.valAxisLabelFormatCode) : "General"}" sourceLinked="0"/>`, e._type === "scatter" ? (i += '  <c:majorTickMark val="none"/>', i += '  <c:minorTickMark val="none"/>', i += '  <c:tickLblPos val="nextTo"/>') : (i += ' <c:majorTickMark val="' + (e.valAxisMajorTickMark || "out") + '"/>', i += ' <c:minorTickMark val="' + (e.valAxisMinorTickMark || "none") + '"/>', i += ' <c:tickLblPos val="' + (e.valAxisLabelPos || (e.barDir === "col" ? "nextTo" : "low")) + '"/>'), i += " <c:spPr>", i += `   <a:ln w="${e.valAxisLineSize ? Jo(e.valAxisLineSize) : e0}" cap="flat">`, i += e.valAxisLineShow ? "<a:solidFill>" + ri(e.valAxisLineColor || yh.color) + "</a:solidFill>" : "<a:noFill/>", i += '     <a:prstDash val="' + (e.valAxisLineStyle || "solid") + '"/>', i += "     <a:round/>", i += "   </a:ln>", i += " </c:spPr>", i += " <c:txPr>", i += `  <a:bodyPr${e.valAxisLabelRotate ? ' rot="' + ef(e.valAxisLabelRotate).toString() + '"' : ""}/>`, i += "  <a:lstStyle/>", i += "  <a:p>", i += "    <a:pPr>", i += `      <a:defRPr sz="${Math.round((e.valAxisLabelFontSize || Vd) * 100)}" b="${e.valAxisLabelFontBold ? 1 : 0}" i="${e.valAxisLabelFontItalic ? 1 : 0}" u="none" strike="noStrike">`, i += "        <a:solidFill>" + ri(e.valAxisLabelColor || sd) + "</a:solidFill>", i += '        <a:latin typeface="' + (e.valAxisLabelFontFace || "Arial") + '"/>', i += "      </a:defRPr>", i += "    </a:pPr>", i += '  <a:endParaRPr lang="' + (e.lang || "en-US") + '"/>', i += "  </a:p>", i += " </c:txPr>", i += ' <c:crossAx val="' + l + '"/>', typeof e.catAxisCrossesAt == "number" ? i += ` <c:crossesAt val="${e.catAxisCrossesAt}"/>` : typeof e.catAxisCrossesAt == "string" ? i += ' <c:crosses val="' + e.catAxisCrossesAt + '"/>' : i += ' <c:crosses val="' + (r === "r" || r === "t" ? "max" : "autoZero") + '"/>', i += ' <c:crossBetween val="' + (e._type === "scatter" || Array.isArray(e._type) && e._type.filter((c) => c.type === "area").length > 0 ? "midCat" : "between") + '"/>', e.valAxisMajorUnit && (i += ` <c:majorUnit val="${e.valAxisMajorUnit}"/>`), e.valAxisDisplayUnit && (i += `<c:dispUnits><c:builtInUnit val="${e.valAxisDisplayUnit}"/>${e.valAxisDisplayUnitLabel ? "<c:dispUnitsLbl/>" : ""}</c:dispUnits>`), i += "</c:valAx>", i;
}
function D6(e, t, r) {
  let l = "";
  return l += "<c:serAx>", l += '  <c:axId val="' + t + '"/>', l += '  <c:scaling><c:orientation val="' + (e.serAxisOrientation || (e.barDir === "col", "minMax")) + '"/></c:scaling>', l += '  <c:delete val="' + (e.serAxisHidden ? "1" : "0") + '"/>', l += '  <c:axPos val="' + (e.barDir === "col" ? "b" : "l") + '"/>', l += e.serGridLine.style !== "none" ? dA(e.serGridLine) : "", e.showSerAxisTitle && (l += hm({ color: e.serAxisTitleColor, fontFace: e.serAxisTitleFontFace, fontSize: e.serAxisTitleFontSize, titleRotate: e.serAxisTitleRotate, title: e.serAxisTitle || "\u5750\u6807\u8F74\u6807\u9898" })), l += `  <c:numFmt formatCode="${an(e.serLabelFormatCode) || "General"}" sourceLinked="0"/>`, l += '  <c:majorTickMark val="out"/>', l += '  <c:minorTickMark val="none"/>', l += `  <c:tickLblPos val="${e.serAxisLabelPos || e.barDir === "col" ? "low" : "nextTo"}"/>`, l += "  <c:spPr>", l += '    <a:ln w="12700" cap="flat">', l += e.serAxisLineShow ? `<a:solidFill>${ri(e.serAxisLineColor || yh.color)}</a:solidFill>` : "<a:noFill/>", l += '      <a:prstDash val="solid"/>', l += "      <a:round/>", l += "    </a:ln>", l += "  </c:spPr>", l += "  <c:txPr>", l += "    <a:bodyPr/>", l += "    <a:lstStyle/>", l += "    <a:p>", l += "    <a:pPr>", l += `    <a:defRPr sz="${Math.round((e.serAxisLabelFontSize || Vd) * 100)}" b="${e.serAxisLabelFontBold ? "1" : "0"}" i="${e.serAxisLabelFontItalic ? "1" : "0"}" u="none" strike="noStrike">`, l += `      <a:solidFill>${ri(e.serAxisLabelColor || sd)}</a:solidFill>`, l += `      <a:latin typeface="${e.serAxisLabelFontFace || "Arial"}"/>`, l += "   </a:defRPr>", l += "  </a:pPr>", l += '  <a:endParaRPr lang="' + (e.lang || "en-US") + '"/>', l += "  </a:p>", l += " </c:txPr>", l += ' <c:crossAx val="' + r + '"/>', l += ' <c:crosses val="autoZero"/>', e.serAxisLabelFrequency && (l += ' <c:tickLblSkip val="' + e.serAxisLabelFrequency + '"/>'), e.serLabelFormatCode && (["serAxisBaseTimeUnit", "serAxisMajorTimeUnit", "serAxisMinorTimeUnit"].forEach((i) => {
    e[i] && (typeof e[i] != "string" || !["days", "months", "years"].includes(i.toLowerCase())) && (console.warn(`"${i}" must be one of: 'days','months','years' !`), e[i] = null);
  }), e.serAxisBaseTimeUnit && (l += ` <c:baseTimeUnit  val="${e.serAxisBaseTimeUnit.toLowerCase()}"/>`), e.serAxisMajorTimeUnit && (l += ` <c:majorTimeUnit val="${e.serAxisMajorTimeUnit.toLowerCase()}"/>`), e.serAxisMinorTimeUnit && (l += ` <c:minorTimeUnit val="${e.serAxisMinorTimeUnit.toLowerCase()}"/>`), e.serAxisMajorUnit && (l += ` <c:majorUnit val="${e.serAxisMajorUnit}"/>`), e.serAxisMinorUnit && (l += ` <c:minorUnit val="${e.serAxisMinorUnit}"/>`)), l += "</c:serAx>", l;
}
function hm(e, t, r) {
  var l = e.titleAlign === "left" || e.titleAlign === "right" ? '<a:pPr algn="'.concat(e.titleAlign.substring(0, 1), '">') : "<a:pPr>", i = e.titleRotate ? '<a:bodyPr rot="'.concat(ef(e.titleRotate), '"/>') : "<a:bodyPr/>", c = e.fontSize ? 'sz="'.concat(Math.round(e.fontSize * 100), '"') : "", s = e.titleBold ? 1 : 0, h = "<c:layout/>";
  if (e.titlePos && typeof e.titlePos.x == "number" && typeof e.titlePos.y == "number") {
    var f = e.titlePos.x + t, n = e.titlePos.y + r, p = f === 0 ? 0 : f * (f / 5) / 10;
    p >= 1 && (p = p / 10), p >= 0.1 && (p = p / 10);
    var m = n === 0 ? 0 : n * (n / 5) / 10;
    m >= 1 && (m = m / 10), m >= 0.1 && (m = m / 10), h = '<c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="'.concat(p, '"/><c:y val="').concat(m, '"/></c:manualLayout></c:layout>');
  }
  return `<c:title>
      <c:tx>
        <c:rich>
          `.concat(i, `
          <a:lstStyle/>
          <a:p>
            `).concat(l, `
            <a:defRPr `).concat(c, ' b="').concat(s, `" i="0" u="none" strike="noStrike">
              <a:solidFill>`).concat(ri(e.color || sd), `</a:solidFill>
              <a:latin typeface="`).concat(e.fontFace || "Arial", `"/>
            </a:defRPr>
          </a:pPr>
          <a:r>
            <a:rPr `).concat(c, ' b="').concat(s, `" i="0" u="none" strike="noStrike">
              <a:solidFill>`).concat(ri(e.color || sd), `</a:solidFill>
              <a:latin typeface="`).concat(e.fontFace || "Arial", `"/>
            </a:rPr>
            <a:t>`).concat(an(e.title) || "", `</a:t>
          </a:r>
        </a:p>
        </c:rich>
      </c:tx>
      `).concat(h, `
      <c:overlay val="0"/>
    </c:title>`);
}
function xi(e) {
  var t = "", r = e - 1;
  return r <= 25 ? t = uv[r] : t = "".concat(uv[Math.floor(r / uv.length - 1)]).concat(uv[r % uv.length]), t;
}
function vh(e, t) {
  if (e) {
    if (typeof e != "object") return console.warn("`shadow` options must be an object. Ex: `{shadow: {type:'none'}}`"), "<a:effectLst/>";
  } else return "<a:effectLst/>";
  var r = "<a:effectLst>", l = Os(Os({}, t), e), i = l.type || "outer", c = Jo(l.blur), s = Jo(l.offset), h = Math.round(l.angle * 6e4), f = l.color, n = Math.round(l.opacity * 1e5), p = l.rotateWithShape ? 1 : 0;
  return r += "<a:".concat(i, 'Shdw sx="100000" sy="100000" kx="0" ky="0"  algn="bl" blurRad="').concat(c, '" rotWithShape="').concat(p, '" dist="').concat(s, '" dir="').concat(h, '">'), r += '<a:srgbClr val="'.concat(f, '">'), r += '<a:alpha val="'.concat(n, '"/></a:srgbClr>'), r += "</a:".concat(i, "Shdw>"), r += "</a:effectLst>", r;
}
function dA(e) {
  var t = "<c:majorGridlines>";
  return t += " <c:spPr>", t += '  <a:ln w="'.concat(Jo(e.size || yh.size), '" cap="').concat(sg(e.cap || yh.cap), '">'), t += '  <a:solidFill><a:srgbClr val="' + (e.color || yh.color) + '"/></a:solidFill>', t += '   <a:prstDash val="' + (e.style || yh.style) + '"/><a:round/>', t += "  </a:ln>", t += " </c:spPr>", t += "</c:majorGridlines>", t;
}
function sg(e) {
  if (!e || e === "flat") return "flat";
  if (e === "square") return "sq";
  if (e === "round") return "rnd";
  var t = e;
  throw new Error("Invalid chart line cap: ".concat(t));
}
function ly(e) {
  var t = typeof require < "u" && typeof window > "u" ? require("fs") : null, r = typeof require < "u" && typeof window > "u" ? require("https") : null, l = [], i = e._relsMedia.filter(function(s) {
    return s.type !== "online" && !s.data && (!s.path || s.path && !s.path.includes("preencoded"));
  }), c = [];
  return i.forEach(function(s) {
    c.includes(s.path) ? s.isDuplicate = true : (s.isDuplicate = false, c.push(s.path));
  }), i.filter(function(s) {
    return !s.isDuplicate;
  }).forEach(function(s) {
    l.push(new Promise(function(h, f) {
      if (t && s.path.indexOf("http") !== 0) try {
        var n = t.readFileSync(s.path);
        s.data = Buffer.from(n).toString("base64"), i.filter(function(m) {
          return m.isDuplicate && m.path === s.path;
        }).forEach(function(m) {
          return m.data = s.data;
        }), h("done");
      } catch (m) {
        s.data = hp, i.filter(function(d) {
          return d.isDuplicate && d.path === s.path;
        }).forEach(function(d) {
          return d.data = s.data;
        }), f(new Error('ERROR: Unable to read media: "'.concat(s.path, `"
`).concat(String(m))));
      }
      else if (t && r && s.path.indexOf("http") === 0) r.get(s.path, function(m) {
        var d = "";
        m.setEncoding("binary"), m.on("data", function(b) {
          return d += b;
        }), m.on("end", function() {
          s.data = Buffer.from(d, "binary").toString("base64"), i.filter(function(b) {
            return b.isDuplicate && b.path === s.path;
          }).forEach(function(b) {
            return b.data = s.data;
          }), h("done");
        }), m.on("error", function(b) {
          s.data = hp, i.filter(function(x) {
            return x.isDuplicate && x.path === s.path;
          }).forEach(function(x) {
            return x.data = s.data;
          }), f(new Error("ERROR! Unable to load image (https.get): ".concat(s.path)));
        });
      });
      else {
        var p = new XMLHttpRequest();
        p.onload = function() {
          var m = new FileReader();
          m.onloadend = function() {
            s.data = m.result, i.filter(function(d) {
              return d.isDuplicate && d.path === s.path;
            }).forEach(function(d) {
              return d.data = s.data;
            }), s.isSvgPng ? eC(s).then(function() {
              h("done");
            }).catch(function(d) {
              f(d);
            }) : h("done");
          }, m.readAsDataURL(p.response);
        }, p.onerror = function(m) {
          s.data = hp, i.filter(function(d) {
            return d.isDuplicate && d.path === s.path;
          }).forEach(function(d) {
            return d.data = s.data;
          }), f(new Error("ERROR! Unable to load image (xhr.onerror): ".concat(s.path)));
        }, p.open("GET", s.path), p.responseType = "blob", p.send();
      }
    }));
  }), e._relsMedia.filter(function(s) {
    return s.isSvgPng && s.data;
  }).forEach(function(s) {
    t ? (s.data = hp, l.push(Promise.resolve().then(function() {
      return "done";
    }))) : l.push(eC(s));
  }), l;
}
function eC(e) {
  return ip(this, void 0, void 0, function() {
    return sp(this, function(t) {
      switch (t.label) {
        case 0:
          return [4, new Promise(function(r, l) {
            var i = new Image();
            i.onload = function() {
              i.width + i.height === 0 && i.onerror("h/w=0");
              var c = document.createElement("CANVAS"), s = c.getContext("2d");
              c.width = i.width, c.height = i.height, s.drawImage(i, 0, 0);
              try {
                e.data = c.toDataURL(e.type), r("done");
              } catch (h) {
                i.onerror(h);
              }
              c = null;
            }, i.onerror = function(c) {
              e.data = hp, l(new Error("ERROR! Unable to load image (image.onerror): ".concat(e.path)));
            }, i.src = typeof e.data == "string" ? e.data : hp;
          })];
        case 1:
          return [2, t.sent()];
      }
    });
  });
}
var F6 = { cover: function(e, t) {
  var r = e.h / e.w, l = t.h / t.w, i = l > r, c = i ? t.h / r : t.w, s = i ? t.h : t.w * r, h = Math.round(1e5 * 0.5 * (1 - t.w / c)), f = Math.round(1e5 * 0.5 * (1 - t.h / s));
  return '<a:srcRect l="'.concat(h, '" r="').concat(h, '" t="').concat(f, '" b="').concat(f, '"/><a:stretch/>');
}, contain: function(e, t) {
  var r = e.h / e.w, l = t.h / t.w, i = l > r, c = i ? t.w : t.h / r, s = i ? t.w * r : t.h, h = Math.round(1e5 * 0.5 * (1 - t.w / c)), f = Math.round(1e5 * 0.5 * (1 - t.h / s));
  return '<a:srcRect l="'.concat(h, '" r="').concat(h, '" t="').concat(f, '" b="').concat(f, '"/><a:stretch/>');
}, crop: function(e, t) {
  var r = t.x, l = e.w - (t.x + t.w), i = t.y, c = e.h - (t.y + t.h), s = Math.round(1e5 * (r / e.w)), h = Math.round(1e5 * (l / e.w)), f = Math.round(1e5 * (i / e.h)), n = Math.round(1e5 * (c / e.h));
  return '<a:srcRect l="'.concat(s, '" r="').concat(h, '" t="').concat(f, '" b="').concat(n, '"/><a:stretch/>');
} };
function uA(e) {
  let t = e._name ? '<p:cSld name="' + e._name + '">' : "<p:cSld>";
  return e._bkgdImgRid ? t += `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="rId${e._bkgdImgRid}"><a:lum/></a:blip><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>` : e.background?.color ? t += `<p:bg><p:bgPr>${cd(e.background)}</p:bgPr></p:bg>` : !e.bkgd && e._name && e._name === Oy && (t += '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>'), t += "<p:spTree>", t += '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>', t += '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>', t += '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>', e._slideObjects.forEach((r, l) => {
    let i = 0, c = 0, s = kn("75%", "X", e._presLayout), h = 0, f, n = "", p = null, m = null, d = 0, b = 0, x = null, v = null, w = r.options?.sizing, y = r.options?.rounding;
    e._slideLayout != null && e._slideLayout._slideObjects !== void 0 && r.options && r.options.placeholder && (f = e._slideLayout._slideObjects.filter((S) => S.options.placeholder === r.options.placeholder)[0]);
    let g = !f && r.options?.placeholderType ? c4(e, r.options.placeholderType) : void 0;
    g && (r.options._isPlaceholder = true), r.options = r.options || {}, typeof r.options.x < "u" && (i = kn(r.options.x, "X", e._presLayout)), typeof r.options.y < "u" && (c = kn(r.options.y, "Y", e._presLayout)), typeof r.options.w < "u" && (s = kn(r.options.w, "X", e._presLayout)), typeof r.options.h < "u" && (h = kn(r.options.h, "Y", e._presLayout));
    let A = s, C = h;
    switch (f && ((f.options.x || f.options.x === 0) && (i = kn(f.options.x, "X", e._presLayout)), (f.options.y || f.options.y === 0) && (c = kn(f.options.y, "Y", e._presLayout)), (f.options.w || f.options.w === 0) && (s = kn(f.options.w, "X", e._presLayout)), (f.options.h || f.options.h === 0) && (h = kn(f.options.h, "Y", e._presLayout))), r.options.flipH && (n += ' flipH="1"'), r.options.flipV && (n += ' flipV="1"'), r.options.rotate && (n += ` rot="${ef(r.options.rotate)}"`), r._type) {
      case "table":
        if (p = r.arrTabRows, m = r.options, d = 0, b = 0, p[0].forEach((S) => {
          x = S.options || null, d += x?.colspan ? Number(x.colspan) : 1;
        }), v = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${l + 2}" name="${r.options.objectName}"/>`, v += '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>  <p:nvPr><p:extLst><p:ext uri="{D42A27DB-BD31-4B8C-83A1-F6EECF244321}"><p14:modId xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="1579011935"/></p:ext></p:extLst></p:nvPr></p:nvGraphicFramePr>', v += `<p:xfrm><a:off x="${i || (i === 0 ? 0 : tn)}" y="${c || (c === 0 ? 0 : tn)}"/><a:ext cx="${s || (s === 0 ? 0 : tn)}" cy="${h || tn}"/></p:xfrm>`, v += '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/>', Array.isArray(m.colW)) {
          v += "<a:tblGrid>";
          for (let S = 0; S < d; S++) {
            let R = Jn(m.colW[S]);
            (R == null || isNaN(R)) && (R = (typeof r.options.w == "number" ? r.options.w : 1) / d), v += `<a:gridCol w="${Math.round(R)}"/>`;
          }
          v += "</a:tblGrid>";
        } else {
          b = m.colW ? m.colW : tn, r.options.w && !m.colW && (b = Math.round((typeof r.options.w == "number" ? r.options.w : 1) / d)), v += "<a:tblGrid>";
          for (let S = 0; S < d; S++) v += `<a:gridCol w="${b}"/>`;
          v += "</a:tblGrid>";
        }
        p.forEach((S) => {
          for (let R = 0; R < S.length; ) {
            let N = S[R], E = N.options?.colspan, D = N.options?.rowspan;
            if (E && E > 1) {
              let O = Array(E - 1).fill(void 0).map((L) => ({ _type: "tablecell", options: { rowspan: D }, _hmerge: true }));
              S.splice(R + 1, 0, ...O), R += E;
            } else R += 1;
          }
        }), p.forEach((S, R) => {
          let N = p[R + 1];
          N && S.forEach((E, D) => {
            let O = E._rowContinue || E.options?.rowspan, L = E.options?.colspan, P = E._hmerge;
            if (O && O > 1) {
              let B = { _type: "tablecell", options: { colspan: L }, _rowContinue: O - 1, _vmerge: true, _hmerge: P };
              N.splice(D, 0, B);
            }
          });
        }), p.forEach((S, R) => {
          let N = 0;
          Array.isArray(m.rowH) && m.rowH[R] ? N = Jn(Number(m.rowH[R])) : m.rowH && !isNaN(Number(m.rowH)) ? N = Jn(Number(m.rowH)) : (r.options.cy || r.options.h) && (N = Math.round((r.options.h ? Jn(r.options.h) : typeof r.options.cy == "number" ? r.options.cy : 1) / p.length)), v += `<a:tr h="${N}">`, S.forEach((E) => {
            let D = E, O = { rowSpan: D.options?.rowspan > 1 ? D.options.rowspan : void 0, gridSpan: D.options?.colspan > 1 ? D.options.colspan : void 0, vMerge: D._vmerge ? 1 : void 0, hMerge: D._hmerge ? 1 : void 0 }, L = Object.keys(O).map((T) => [T, O[T]]).filter(([T, k]) => !!k).map(([T, k]) => `${String(T)}="${String(k)}"`).join(" ");
            if (L && (L = " " + L), D._hmerge || D._vmerge) {
              v += `<a:tc${L}><a:tcPr/></a:tc>`;
              return;
            }
            let P = D.options || {};
            D.options = P, ["align", "bold", "border", "color", "fill", "fontFace", "fontPitchFamily", "fontSize", "margin", "underline", "valign"].forEach((T) => {
              m[T] && !P[T] && P[T] !== 0 && (P[T] = m[T]);
            });
            let B = P.valign ? ` anchor="${P.valign.replace(/^c$/i, "ctr").replace(/^m$/i, "ctr").replace("center", "ctr").replace("middle", "ctr").replace("top", "t").replace("btm", "b").replace("bottom", "b")}"` : "", M = D._optImp?.fill?.color ? D._optImp.fill.color : D._optImp?.fill && typeof D._optImp.fill == "string" ? D._optImp.fill : "";
            M = M || P.fill ? P.fill : "";
            let U = M ? cd(M) : "", _ = P.margin === 0 || P.margin ? P.margin : G2;
            !Array.isArray(_) && typeof _ == "number" && (_ = [_, _, _, _]);
            let F = "";
            _[0] >= 1 ? F = ` marL="${Jo(_[3])}" marR="${Jo(_[1])}" marT="${Jo(_[0])}" marB="${Jo(_[2])}"` : F = ` marL="${Jn(_[3])}" marR="${Jn(_[1])}" marT="${Jn(_[0])}" marB="${Jn(_[2])}"`, v += `<a:tc${L}>${aC(D)}<a:tcPr${F}${B}>`, P.border && Array.isArray(P.border) && [{ idx: 3, name: "lnL" }, { idx: 1, name: "lnR" }, { idx: 0, name: "lnT" }, { idx: 2, name: "lnB" }].forEach((T) => {
              P.border[T.idx].type !== "none" ? (v += `<a:${T.name} w="${Jo(P.border[T.idx].pt)}" cap="flat" cmpd="sng" algn="ctr">`, v += `<a:solidFill>${ri(P.border[T.idx].color)}</a:solidFill>`, v += `<a:prstDash val="${P.border[T.idx].type === "dash" ? "sysDash" : "solid"}"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/>`, v += `</a:${T.name}>`) : v += `<a:${T.name} w="0" cap="flat" cmpd="sng" algn="ctr"><a:noFill/></a:${T.name}>`;
            }), v += U, v += "  </a:tcPr>", v += " </a:tc>";
          }), v += "</a:tr>";
        }), v += "      </a:tbl>", v += "    </a:graphicData>", v += "  </a:graphic>", v += "</p:graphicFrame>", t += v;
        break;
      case "text":
      case "placeholder":
        if (!r.options.line && h === 0 && (h = tn * 0.3), r.options._bodyProp || (r.options._bodyProp = {}), r.options.margin && Array.isArray(r.options.margin) ? (r.options._bodyProp.lIns = Jo(r.options.margin[0] || 0), r.options._bodyProp.rIns = Jo(r.options.margin[1] || 0), r.options._bodyProp.bIns = Jo(r.options.margin[2] || 0), r.options._bodyProp.tIns = Jo(r.options.margin[3] || 0)) : typeof r.options.margin == "number" && (r.options._bodyProp.lIns = Jo(r.options.margin), r.options._bodyProp.rIns = Jo(r.options.margin), r.options._bodyProp.bIns = Jo(r.options.margin), r.options._bodyProp.tIns = Jo(r.options.margin)), t += "<p:sp>", t += `<p:nvSpPr><p:cNvPr id="${l + 2}" name="${r.options.objectName}">`, r.options.hyperlink?.url && (t += `<a:hlinkClick r:id="rId${r.options.hyperlink._rId}" tooltip="${r.options.hyperlink.tooltip ? an(r.options.hyperlink.tooltip) : ""}"/>`), r.options.hyperlink?.slide && (t += `<a:hlinkClick r:id="rId${r.options.hyperlink._rId}" tooltip="${r.options.hyperlink.tooltip ? an(r.options.hyperlink.tooltip) : ""}" action="ppaction://hlinksldjump"/>`), t += "</p:cNvPr>", t += "<p:cNvSpPr" + (r.options?.isTextBox ? ' txBox="1"/>' : "/>"), t += `<p:nvPr>${r._type === "placeholder" ? fv(r) : f ? fv(f) : fv(g, true)}</p:nvPr>`, t += "</p:nvSpPr><p:spPr>", t += `<a:xfrm${n}>`, t += `<a:off x="${i}" y="${c}"/>`, t += `<a:ext cx="${s}" cy="${h}"/></a:xfrm>`, r.shape === "custGeom") t += "<a:custGeom><a:avLst />", t += "<a:gdLst>", t += "</a:gdLst>", t += "<a:ahLst />", t += "<a:cxnLst>", t += "</a:cxnLst>", t += '<a:rect l="l" t="t" r="r" b="b" />', t += "<a:pathLst>", t += `<a:path w="${s}" h="${h}">`, r.options.points?.forEach((S, R) => {
          if ("curve" in S) switch (S.curve.type) {
            case "arc":
              t += `<a:arcTo hR="${kn(S.curve.hR, "Y", e._presLayout)}" wR="${kn(S.curve.wR, "X", e._presLayout)}" stAng="${ef(S.curve.stAng)}" swAng="${ef(S.curve.swAng)}" />`;
              break;
            case "cubic":
              t += `<a:cubicBezTo>
									<a:pt x="${kn(S.curve.x1, "X", e._presLayout)}" y="${kn(S.curve.y1, "Y", e._presLayout)}" />
									<a:pt x="${kn(S.curve.x2, "X", e._presLayout)}" y="${kn(S.curve.y2, "Y", e._presLayout)}" />
									<a:pt x="${kn(S.x, "X", e._presLayout)}" y="${kn(S.y, "Y", e._presLayout)}" />
									</a:cubicBezTo>`;
              break;
            case "quadratic":
              t += `<a:quadBezTo>
									<a:pt x="${kn(S.curve.x1, "X", e._presLayout)}" y="${kn(S.curve.y1, "Y", e._presLayout)}" />
									<a:pt x="${kn(S.x, "X", e._presLayout)}" y="${kn(S.y, "Y", e._presLayout)}" />
									</a:quadBezTo>`;
              break;
          }
          else "close" in S ? t += "<a:close />" : S.moveTo || R === 0 ? t += `<a:moveTo><a:pt x="${kn(S.x, "X", e._presLayout)}" y="${kn(S.y, "Y", e._presLayout)}" /></a:moveTo>` : t += `<a:lnTo><a:pt x="${kn(S.x, "X", e._presLayout)}" y="${kn(S.y, "Y", e._presLayout)}" /></a:lnTo>`;
        }), t += "</a:path>", t += "</a:pathLst>", t += "</a:custGeom>";
        else {
          if (t += '<a:prstGeom prst="' + r.shape + '"><a:avLst>', r.options.rectRadius) t += `<a:gd name="adj" fmla="val ${Math.round(r.options.rectRadius * tn * 1e5 / Math.min(s, h))}"/>`;
          else if (r.options.angleRange) {
            for (let S = 0; S < 2; S++) {
              let R = r.options.angleRange[S];
              t += `<a:gd name="adj${S + 1}" fmla="val ${ef(R)}" />`;
            }
            r.options.arcThicknessRatio && (t += `<a:gd name="adj3" fmla="val ${Math.round(r.options.arcThicknessRatio * 5e4)}" />`);
          }
          t += "</a:avLst></a:prstGeom>";
        }
        r.options.fill && r.options.fill.type === "tile" && r.options.fill._fillImageRid ? t += `<a:blipFill><a:blip r:embed="rId${r.options.fill._fillImageRid}"/><a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/></a:blipFill>` : t += r.options.fill ? cd(r.options.fill) : "<a:noFill/>", r.options.line && (t += r.options.line.width ? `<a:ln w="${Jo(r.options.line.width)}">` : "<a:ln>", r.options.line.color && (t += cd(r.options.line)), r.options.line.dashType && (t += `<a:prstDash val="${r.options.line.dashType}"/>`), r.options.line.beginArrowType && (t += `<a:headEnd type="${r.options.line.beginArrowType}"/>`), r.options.line.endArrowType && (t += `<a:tailEnd type="${r.options.line.endArrowType}"/>`), t += "</a:ln>"), r.options.shadow && r.options.shadow.type !== "none" && (r.options.shadow.type = r.options.shadow.type || "outer", r.options.shadow.blur = Jo(r.options.shadow.blur || 8), r.options.shadow.offset = Jo(r.options.shadow.offset || 4), r.options.shadow.angle = Math.round((r.options.shadow.angle || 270) * 6e4), r.options.shadow.opacity = Math.round((r.options.shadow.opacity || 0.75) * 1e5), r.options.shadow.color = r.options.shadow.color || Jw.color, t += "<a:effectLst>", t += ` <a:${r.options.shadow.type}Shdw ${r.options.shadow.type === "outer" ? 'sx="100000" sy="100000" kx="0" ky="0" algn="bl" rotWithShape="0"' : ""} blurRad="${r.options.shadow.blur}" dist="${r.options.shadow.offset}" dir="${r.options.shadow.angle}">`, t += ` <a:srgbClr val="${r.options.shadow.color}">`, t += ` <a:alpha val="${r.options.shadow.opacity}"/></a:srgbClr>`, t += " </a:outerShdw>", t += "</a:effectLst>"), t += "</p:spPr>", t += aC(r), t += "</p:sp>";
        break;
      case "image":
        if (t += "<p:pic>", t += "  <p:nvPicPr>", t += `<p:cNvPr id="${l + 2}" name="${r.options.objectName}" descr="${an(r.options.altText || "")}">`, r.hyperlink?.url && (t += `<a:hlinkClick r:id="rId${r.hyperlink._rId}" tooltip="${r.hyperlink.tooltip ? an(r.hyperlink.tooltip) : ""}"/>`), r.hyperlink?.slide && (t += `<a:hlinkClick r:id="rId${r.hyperlink._rId}" tooltip="${r.hyperlink.tooltip ? an(r.hyperlink.tooltip) : ""}" action="ppaction://hlinksldjump"/>`), t += "    </p:cNvPr>", t += '    <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>', t += "    <p:nvPr>" + fv(f) + "</p:nvPr>", t += "  </p:nvPicPr>", t += "<p:blipFill>", (e._relsMedia || []).filter((S) => S.rId === r.imageRid)[0] && (e._relsMedia || []).filter((S) => S.rId === r.imageRid)[0].extn === "svg" ? (t += `<a:blip r:embed="rId${r.imageRid - 1}">`, t += r.options.transparency ? ` <a:alphaModFix amt="${Math.round((100 - r.options.transparency) * 1e3)}"/>` : "", t += " <a:extLst>", t += '  <a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">', t += `   <asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rId${r.imageRid}"/>`, t += "  </a:ext>", t += " </a:extLst>", t += "</a:blip>") : (t += `<a:blip r:embed="rId${r.imageRid}">`, t += r.options.transparency ? `<a:alphaModFix amt="${Math.round((100 - r.options.transparency) * 1e3)}"/>` : "", t += "</a:blip>"), w?.type) {
          let S = w.w ? kn(w.w, "X", e._presLayout) : s, R = w.h ? kn(w.h, "Y", e._presLayout) : h, N = kn(w.x || 0, "X", e._presLayout), E = kn(w.y || 0, "Y", e._presLayout);
          t += F6[w.type]({ w: A, h: C }, { w: S, h: R, x: N, y: E }), A = S, C = R;
        } else t += "  <a:stretch><a:fillRect/></a:stretch>";
        if (t += "</p:blipFill>", t += "<p:spPr>", t += " <a:xfrm" + n + ">", t += `  <a:off x="${i}" y="${c}"/>`, t += `  <a:ext cx="${A}" cy="${C}"/>`, t += " </a:xfrm>", d4(r.options.points)) t += ` <a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${A}" h="${C}">`, r.options.points.forEach((S, R) => {
          "close" in S ? t += "<a:close/>" : "curve" in S ? t += `<a:arcTo wR="${Math.round(S.curve.wR * tn)}" hR="${Math.round(S.curve.hR * tn)}" stAng="${ef(S.curve.stAng)}" swAng="${ef(S.curve.swAng)}"/>` : t += `<a:${S.moveTo || R === 0 ? "moveTo" : "lnTo"}><a:pt x="${Math.round(S.x * tn)}" y="${Math.round(S.y * tn)}"/></a:${S.moveTo || R === 0 ? "moveTo" : "lnTo"}>`;
        }), t += "</a:path></a:pathLst></a:custGeom>";
        else if (!y && r.options.rectRadius) {
          let S = Math.min(5e4, Math.round(r.options.rectRadius * tn * 1e5 / Math.min(A, C)));
          t += ` <a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${S}"/></a:avLst></a:prstGeom>`;
        } else t += ` <a:prstGeom prst="${y ? "ellipse" : "rect"}"><a:avLst/></a:prstGeom>`;
        r.options.shadow && r.options.shadow.type !== "none" && (r.options.shadow.type = r.options.shadow.type || "outer", r.options.shadow.blur = Jo(r.options.shadow.blur || 8), r.options.shadow.offset = Jo(r.options.shadow.offset || 4), r.options.shadow.angle = Math.round((r.options.shadow.angle || 270) * 6e4), r.options.shadow.opacity = Math.round((r.options.shadow.opacity || 0.75) * 1e5), r.options.shadow.color = r.options.shadow.color || Jw.color, t += "<a:effectLst>", t += `<a:${r.options.shadow.type}Shdw ${r.options.shadow.type === "outer" ? 'sx="100000" sy="100000" kx="0" ky="0" algn="bl" rotWithShape="0"' : ""} blurRad="${r.options.shadow.blur}" dist="${r.options.shadow.offset}" dir="${r.options.shadow.angle}">`, t += `<a:srgbClr val="${r.options.shadow.color}">`, t += `<a:alpha val="${r.options.shadow.opacity}"/></a:srgbClr>`, t += `</a:${r.options.shadow.type}Shdw>`, t += "</a:effectLst>"), t += "</p:spPr>", t += "</p:pic>";
        break;
      case "media":
        r.mtype === "online" ? (t += "<p:pic>", t += " <p:nvPicPr>", t += `<p:cNvPr id="${r.mediaRid + 2}" name="${r.options.objectName}"/>`, t += " <p:cNvPicPr/>", t += " <p:nvPr>", t += `  <a:videoFile r:link="rId${r.mediaRid}"/>`, t += " </p:nvPr>", t += " </p:nvPicPr>", t += ` <p:blipFill><a:blip r:embed="rId${r.mediaRid + 1}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`, t += " <p:spPr>", t += `  <a:xfrm${n}><a:off x="${i}" y="${c}"/><a:ext cx="${s}" cy="${h}"/></a:xfrm>`, t += '  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>', t += " </p:spPr>", t += "</p:pic>") : (t += "<p:pic>", t += " <p:nvPicPr>", t += `<p:cNvPr id="${r.mediaRid + 2}" name="${r.options.objectName}"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr>`, t += ' <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>', t += " <p:nvPr>", t += `  <a:videoFile r:link="rId${r.mediaRid}"/>`, t += "  <p:extLst>", t += '   <p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}">', t += `    <p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rId${r.mediaRid + 1}"/>`, t += "   </p:ext>", t += "  </p:extLst>", t += " </p:nvPr>", t += " </p:nvPicPr>", t += ` <p:blipFill><a:blip r:embed="rId${r.mediaRid + 2}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`, t += " <p:spPr>", t += `  <a:xfrm${n}><a:off x="${i}" y="${c}"/><a:ext cx="${s}" cy="${h}"/></a:xfrm>`, t += '  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>', t += " </p:spPr>", t += "</p:pic>");
        break;
      case "chart":
        t += "<p:graphicFrame>", t += " <p:nvGraphicFramePr>", t += `   <p:cNvPr id="${l + 2}" name="${r.options.objectName}" descr="${an(r.options.altText || "")}"/>`, t += "   <p:cNvGraphicFramePr/>", t += `   <p:nvPr>${fv(f)}</p:nvPr>`, t += " </p:nvGraphicFramePr>", t += ` <p:xfrm><a:off x="${i}" y="${c}"/><a:ext cx="${s}" cy="${h}"/></p:xfrm>`, t += ' <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">', t += '  <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">', t += `   <c:chart r:id="rId${r.chartRid}" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>`, t += "  </a:graphicData>", t += " </a:graphic>", t += "</p:graphicFrame>";
        break;
      default:
        t += "";
        break;
    }
  }), e._slideNumberProps && (e._slideNumberProps.align || (e._slideNumberProps.align = "left"), t += "<p:sp>", t += " <p:nvSpPr>", t += '  <p:cNvPr id="25" name="Slide Number Placeholder 0"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>', t += '  <p:nvPr><p:ph type="sldNum" sz="quarter" idx="4294967295"/></p:nvPr>', t += " </p:nvSpPr>", t += " <p:spPr>", t += `<a:xfrm><a:off x="${kn(e._slideNumberProps.x, "X", e._presLayout)}" y="${kn(e._slideNumberProps.y, "Y", e._presLayout)}"/><a:ext cx="${e._slideNumberProps.w ? kn(e._slideNumberProps.w, "X", e._presLayout) : "800000"}" cy="${e._slideNumberProps.h ? kn(e._slideNumberProps.h, "Y", e._presLayout) : "300000"}"/></a:xfrm> <a:prstGeom prst="rect"><a:avLst/></a:prstGeom> <a:extLst><a:ext uri="{C572A759-6A51-4108-AA02-DFA0A04FC94B}"><ma14:wrappingTextBoxFlag val="0" xmlns:ma14="http://schemas.microsoft.com/office/mac/drawingml/2011/main"/></a:ext></a:extLst></p:spPr>`, t += "<p:txBody>", t += "<a:bodyPr", e._slideNumberProps.margin && Array.isArray(e._slideNumberProps.margin) ? (t += ` lIns="${Jo(e._slideNumberProps.margin[3] || 0)}"`, t += ` tIns="${Jo(e._slideNumberProps.margin[0] || 0)}"`, t += ` rIns="${Jo(e._slideNumberProps.margin[1] || 0)}"`, t += ` bIns="${Jo(e._slideNumberProps.margin[2] || 0)}"`) : typeof e._slideNumberProps.margin == "number" && (t += ` lIns="${Jo(e._slideNumberProps.margin || 0)}"`, t += ` tIns="${Jo(e._slideNumberProps.margin || 0)}"`, t += ` rIns="${Jo(e._slideNumberProps.margin || 0)}"`, t += ` bIns="${Jo(e._slideNumberProps.margin || 0)}"`), e._slideNumberProps.valign && (t += ` anchor="${e._slideNumberProps.valign.replace("top", "t").replace("middle", "ctr").replace("bottom", "b")}"`), t += "/>", t += "  <a:lstStyle><a:lvl1pPr>", (e._slideNumberProps.fontFace || e._slideNumberProps.fontSize || e._slideNumberProps.color) && (t += `<a:defRPr sz="${Math.round((e._slideNumberProps.fontSize || 12) * 100)}">`, e._slideNumberProps.color && (t += cd(e._slideNumberProps.color)), e._slideNumberProps.fontFace && (t += `<a:latin typeface="${e._slideNumberProps.fontFace}"/><a:ea typeface="${e._slideNumberProps.fontFace}"/><a:cs typeface="${e._slideNumberProps.fontFace}"/>`), t += "</a:defRPr>"), t += "</a:lvl1pPr></a:lstStyle>", t += "<a:p>", e._slideNumberProps.align.startsWith("l") ? t += '<a:pPr algn="l"/>' : e._slideNumberProps.align.startsWith("c") ? t += '<a:pPr algn="ctr"/>' : e._slideNumberProps.align.startsWith("r") ? t += '<a:pPr algn="r"/>' : t += '<a:pPr algn="l"/>', t += `<a:fld id="${q2}" type="slidenum"><a:rPr b="${e._slideNumberProps.bold ? 1 : 0}" lang="en-US"/>`, t += `<a:t>${e._slideNum}</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p>`, t += "</p:txBody></p:sp>"), t += "</p:spTree>", t += "</p:cSld>", t;
}
function fA(e, t) {
  var r = 0, l = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + dc + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  return e._rels.forEach(function(i) {
    r = Math.max(r, i.rId), i.type.toLowerCase().includes("hyperlink") ? i.data === "slide" ? l += '<Relationship Id="rId'.concat(i.rId, '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide').concat(i.Target, '.xml"/>') : l += '<Relationship Id="rId'.concat(i.rId, '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="').concat(i.Target, '" TargetMode="External"/>') : i.type.toLowerCase().includes("notesSlide") && (l += '<Relationship Id="rId'.concat(i.rId, '" Target="').concat(i.Target, '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide"/>'));
  }), (e._relsChart || []).forEach(function(i) {
    r = Math.max(r, i.rId), l += '<Relationship Id="rId'.concat(i.rId, '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="').concat(i.Target, '"/>');
  }), (e._relsMedia || []).forEach(function(i) {
    var c = i.rId.toString();
    r = Math.max(r, i.rId), i.type.toLowerCase().includes("image") ? l += '<Relationship Id="rId' + c + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + i.Target + '"/>' : i.type.toLowerCase().includes("audio") ? l.includes(' Target="' + i.Target + '"') ? l += '<Relationship Id="rId' + c + '" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="' + i.Target + '"/>' : l += '<Relationship Id="rId' + c + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="' + i.Target + '"/>' : i.type.toLowerCase().includes("video") ? l.includes(' Target="' + i.Target + '"') ? l += '<Relationship Id="rId' + c + '" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="' + i.Target + '"/>' : l += '<Relationship Id="rId' + c + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="' + i.Target + '"/>' : i.type.toLowerCase().includes("online") && (l.includes(' Target="' + i.Target + '"') ? l += '<Relationship Id="rId' + c + '" Type="http://schemas.microsoft.com/office/2007/relationships/image" Target="' + i.Target + '"/>' : l += '<Relationship Id="rId' + c + '" Target="' + i.Target + '" TargetMode="External" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video"/>');
  }), t.forEach(function(i, c) {
    l += '<Relationship Id="rId'.concat(r + c + 1, '" Type="').concat(i.type, '" Target="').concat(i.target, '"/>');
  }), l += "</Relationships>", l;
}
function tC(e, t) {
  let r = "", l = "", i = "", c = "", s = t ? "a:lvl1pPr" : "a:pPr", h = Jo(S6), f = `<${s}${e.options.rtlMode ? ' rtl="1" ' : ""}`;
  {
    if (e.options.align) switch (e.options.align) {
      case "left":
        f += ' algn="l"';
        break;
      case "right":
        f += ' algn="r"';
        break;
      case "center":
        f += ' algn="ctr"';
        break;
      case "justify":
        f += ' algn="just"';
        break;
      default:
        f += "";
        break;
    }
    if (e.options.lineSpacing ? l = `<a:lnSpc><a:spcPts val="${Math.round(e.options.lineSpacing * 100)}"/></a:lnSpc>` : e.options.lineSpacingMultiple && (l = `<a:lnSpc><a:spcPct val="${Math.round(e.options.lineSpacingMultiple * 1e5)}"/></a:lnSpc>`), e.options.indentLevel && !isNaN(Number(e.options.indentLevel)) && e.options.indentLevel > 0 && (f += ` lvl="${e.options.indentLevel}"`), typeof e.options.paraSpaceBefore == "number" && e.options.paraSpaceBefore >= 0 && (i += `<a:spcBef><a:spcPts val="${Math.round(e.options.paraSpaceBefore * 100)}"/></a:spcBef>`), typeof e.options.paraSpaceAfter == "number" && e.options.paraSpaceAfter >= 0 && (i += `<a:spcAft><a:spcPts val="${Math.round(e.options.paraSpaceAfter * 100)}"/></a:spcAft>`), typeof e.options.bullet == "object") {
      e?.options?.bullet?.indent && (h = Jo(e.options.bullet.indent));
      let n = e.options.bullet.hanging ? Jo(e.options.bullet.hanging) : h;
      if (e.options.bullet.type) e.options.bullet.type.toString().toLowerCase() === "number" && (f += ` marL="${e.options.indentLevel && e.options.indentLevel > 0 ? h + h * e.options.indentLevel : h}" indent="-${n}"`, r = `<a:buSzPct val="100000"/><a:buFontTx/><a:buAutoNum type="${e.options.bullet.style || "arabicPeriod"}" startAt="${e.options.bullet.numberStartAt || e.options.bullet.startAt || "1"}"/>`);
      else if (e.options.bullet.characterCode) {
        let p = `&#x${e.options.bullet.characterCode};`;
        /^[0-9A-Fa-f]{4}$/.test(e.options.bullet.characterCode) || (console.warn("Warning: `bullet.characterCode should be a 4-digit unicode charatcer (ex: 22AB)`!"), p = "&#x2022;"), f += ` marL="${e.options.indentLevel && e.options.indentLevel > 0 ? h + h * e.options.indentLevel : h}" indent="-${n}"`, r = '<a:buSzPct val="100000"/><a:buChar char="' + p + '"/>';
      } else if (e.options.bullet.code) {
        let p = `&#x${e.options.bullet.code};`;
        /^[0-9A-Fa-f]{4}$/.test(e.options.bullet.code) || (console.warn("Warning: `bullet.code should be a 4-digit hex code (ex: 22AB)`!"), p = "&#x2022;"), f += ` marL="${e.options.indentLevel && e.options.indentLevel > 0 ? h + h * e.options.indentLevel : h}" indent="-${n}"`, r = '<a:buSzPct val="100000"/><a:buChar char="' + p + '"/>';
      } else f += ` marL="${e.options.indentLevel && e.options.indentLevel > 0 ? h + h * e.options.indentLevel : h}" indent="-${n}"`, r = '<a:buSzPct val="100000"/><a:buChar char="&#x2022;"/>';
    } else if (e.options.bullet) f += ` marL="${e.options.indentLevel && e.options.indentLevel > 0 ? h + h * e.options.indentLevel : h}" indent="-${h}"`, r = '<a:buSzPct val="100000"/><a:buChar char="&#x2022;"/>';
    else if (!e.options.bullet) {
      let n = e.options.firstLineIndent;
      f += ` indent="${n && n > 0 ? Jo(n) : 0}" marL="0"`, r = "<a:buNone/>";
    }
    e.options.tabStops && Array.isArray(e.options.tabStops) && (c = `<a:tabLst>${e.options.tabStops.map((n) => `<a:tab pos="${Jn(n.position || 1)}" algn="${n.alignment || "l"}"/>`).join("")}</a:tabLst>`), f += ">" + l + i + r + c, t && (f += $2(e.options, true)), f += "</" + s + ">";
  }
  return f;
}
function $2(e, t) {
  let r = "", l = t ? "a:defRPr" : "a:rPr";
  if (r += "<" + l + ' lang="' + (e.lang ? e.lang : "en-US") + '"' + (e.lang ? ' altLang="en-US"' : ""), r += e.fontSize ? ` sz="${Math.round(e.fontSize * 100)}"` : "", r += e?.bold ? ' b="1"' : e?._isPlaceholder ? ' b="0"' : "", r += e?.italic ? ' i="1"' : e?._isPlaceholder ? ' i="0"' : "", r += e?.strike ? ` strike="${typeof e.strike == "string" ? e.strike : "sngStrike"}"` : "", typeof e.underline == "object" && e.underline?.style ? r += ` u="${e.underline.style}"` : typeof e.underline == "string" ? r += ` u="${String(e.underline)}"` : e.hyperlink && (r += ' u="sng"'), e.baseline ? r += ` baseline="${Math.round(e.baseline * 50)}"` : e.subscript ? r += ' baseline="-40000"' : e.superscript && (r += ' baseline="30000"'), r += e.charSpacing ? ` spc="${Math.round(e.charSpacing * 100)}" kern="0"` : "", r += e.cap ? ` cap="${e.cap}"` : "", r += ' dirty="0">', (e.color || e.gradientFill || e.fontFace || e.outline || typeof e.underline == "object" && e.underline.color) && (e.outline && typeof e.outline == "object" && (r += `<a:ln w="${Jo(e.outline.size || 0.75)}">${cd(e.outline.color || "FFFFFF")}</a:ln>`), e.gradientFill ? r += cd({ type: "gradient", stops: e.gradientFill.stops, angle: e.gradientFill.angle }) : e.color && (r += cd({ color: e.color, transparency: e.transparency })), e.highlight && (r += `<a:highlight>${ri(e.highlight)}</a:highlight>`), typeof e.underline == "object" && e.underline.color && (r += `<a:uFill>${cd(e.underline.color)}</a:uFill>`), e.glow && (r += `<a:effectLst>${E6(e.glow, x6)}</a:effectLst>`), e.fontFace)) {
    let i = e.fontPitchFamily ?? 34;
    r += `<a:latin typeface="${e.fontFace}" pitchFamily="${i}" charset="0"/><a:ea typeface="${e.fontFace}" pitchFamily="${i}" charset="-122"/><a:cs typeface="${e.fontFace}" pitchFamily="${i}" charset="-120"/>`;
  }
  if (e.hyperlink) {
    if (typeof e.hyperlink != "object") throw Error("ERROR: text `hyperlink` option should be an object. Ex: `hyperlink:{url:'https://github.com'}` ");
    if (!e.hyperlink.url && !e.hyperlink.slide) throw Error("ERROR: 'hyperlink requires either `url` or `slide`'");
    e.hyperlink.url ? r += `<a:hlinkClick r:id="rId${e.hyperlink._rId}" invalidUrl="" action="" tgtFrame="" tooltip="${e.hyperlink.tooltip ? an(e.hyperlink.tooltip) : ""}" history="1" highlightClick="0" endSnd="0"${e.color ? ">" : "/>"}` : e.hyperlink.slide && (r += `<a:hlinkClick r:id="rId${e.hyperlink._rId}" action="ppaction://hlinksldjump" tooltip="${e.hyperlink.tooltip ? an(e.hyperlink.tooltip) : ""}"${e.color ? ">" : "/>"}`), e.color && (r += " <a:extLst>", r += '  <a:ext uri="{A12FA001-AC4F-418D-AE19-62706E023703}">', r += '   <ahyp:hlinkClr xmlns:ahyp="http://schemas.microsoft.com/office/drawing/2018/hyperlinkcolor" val="tx"/>', r += "  </a:ext>", r += " </a:extLst>", r += "</a:hlinkClick>");
  }
  return r += `</${l}>`, r;
}
function z6(e) {
  return e.text ? "<a:r>".concat($2(e.options, false), "<a:t>").concat(an(e.text), "</a:t></a:r>") : "";
}
function B6(e) {
  let t = "<a:bodyPr";
  return e && (e._type === "text" || e._type === "placeholder") && e.options._bodyProp ? (t += e.options._bodyProp.wrap ? ' wrap="square"' : ' wrap="none"', (e.options._bodyProp.lIns || e.options._bodyProp.lIns === 0) && (t += ` lIns="${e.options._bodyProp.lIns}"`), (e.options._bodyProp.tIns || e.options._bodyProp.tIns === 0) && (t += ` tIns="${e.options._bodyProp.tIns}"`), (e.options._bodyProp.rIns || e.options._bodyProp.rIns === 0) && (t += ` rIns="${e.options._bodyProp.rIns}"`), (e.options._bodyProp.bIns || e.options._bodyProp.bIns === 0) && (t += ` bIns="${e.options._bodyProp.bIns}"`), t += ' rtlCol="0"', e.options._bodyProp.anchor && (t += ' anchor="' + e.options._bodyProp.anchor + '"'), e.options._bodyProp.vert && (t += ' vert="' + e.options._bodyProp.vert + '"'), t += ">", e.options.fit && (e.options.fit === "none" ? t += e.options._isPlaceholder ? "<a:noAutofit/>" : "" : e.options.fit === "shrink" ? t += "<a:normAutofit/>" : e.options.fit === "resize" && (t += "<a:spAutoFit/>")), e.options.shrinkText && (t += "<a:normAutofit/>"), t += e.options._bodyProp.autoFit ? "<a:spAutoFit/>" : "", t += "</a:bodyPr>") : (t += ' wrap="square" rtlCol="0">', t += "</a:bodyPr>"), e._type === "tablecell" ? "<a:bodyPr/>" : t;
}
function aC(e) {
  let t = e.options || {}, r = [], l = [];
  if (t && e._type !== "tablecell" && (typeof e.text > "u" || e.text === null)) return "";
  let i = e._type === "tablecell" ? "<a:txBody>" : "<p:txBody>";
  i += B6(e), t.h === 0 && t.line && t.align ? i += '<a:lstStyle><a:lvl1pPr algn="l"/></a:lstStyle>' : e._type === "placeholder" ? i += `<a:lstStyle>${tC(e, true)}</a:lstStyle>` : i += "<a:lstStyle/>", typeof e.text == "string" || typeof e.text == "number" ? r.push({ text: e.text.toString(), options: t || {} }) : e.text && !Array.isArray(e.text) && typeof e.text == "object" && Object.keys(e.text).includes("text") ? r.push({ text: e.text || "", options: e.options || {} }) : Array.isArray(e.text) && (r = e.text.map((h) => ({ text: h.text, options: h.options }))), r.forEach((h, f) => {
    h.text || (h.text = ""), h.options = h.options || t || {}, f === 0 && h.options && !h.options.bullet && t.bullet && (h.options.bullet = t.bullet), (typeof h.text == "string" || typeof h.text == "number") && (h.text = h.text.toString().replace(/\r*\n/g, dc)), h.text.includes(dc) && h.text.match(/\n$/g) === null ? h.text.split(dc).forEach((n) => {
      h.options.breakLine = true, l.push({ text: n, options: h.options });
    }) : l.push(h);
  });
  let c = [], s = [];
  return l.forEach((h, f) => {
    s.length > 0 && (h.options.align || t.align) ? h.options.align !== l[f - 1].options.align && (c.push(s), s = []) : s.length > 0 && h.options.bullet && s.length > 0 && (c.push(s), s = [], h.options.breakLine = false), s.push(h), s.length > 0 && h.options.breakLine && f + 1 < l.length && (c.push(s), s = []), f + 1 === l.length && c.push(s);
  }), c.forEach((h) => {
    let f = false;
    i += "<a:p>";
    let n = `<a:pPr ${h[0].options?.rtlMode ? ' rtl="1" ' : ""}`;
    h.forEach((p, m) => {
      p.options._lineIdx = m, m > 0 && p.options.softBreakBefore && (i += "<a:br/>"), p.options.align = p.options.align || t.align, p.options.lineSpacing = p.options.lineSpacing || t.lineSpacing, p.options.lineSpacingMultiple = p.options.lineSpacingMultiple || t.lineSpacingMultiple, p.options.firstLineIndent = p.options.firstLineIndent ?? t.firstLineIndent, p.options.indentLevel = p.options.indentLevel || t.indentLevel, p.options.paraSpaceBefore = p.options.paraSpaceBefore || t.paraSpaceBefore, p.options.paraSpaceAfter = p.options.paraSpaceAfter || t.paraSpaceAfter, n = tC(p, false), m === 0 && (i += n.replace("<a:pPr></a:pPr>", "")), Object.entries(t).filter(([d, b]) => !(p.options.hyperlink && d === "color")).forEach(([d, b]) => {
        d !== "bullet" && !p.options[d] && (p.options[d] = b);
      }), i += z6(p), (!p.text && t.fontSize || p.options.fontSize) && (f = true, t.fontSize = t.fontSize || p.options.fontSize);
    }), e._type === "tablecell" && (t.fontSize || t.fontFace) ? t.fontFace ? (i += `<a:endParaRPr lang="${t.lang || "en-US"}"` + (t.fontSize ? ` sz="${Math.round(t.fontSize * 100)}"` : "") + ' dirty="0">', i += `<a:latin typeface="${t.fontFace}" charset="0"/>`, i += `<a:ea typeface="${t.fontFace}" charset="0"/>`, i += `<a:cs typeface="${t.fontFace}" charset="0"/>`, i += "</a:endParaRPr>") : i += `<a:endParaRPr lang="${t.lang || "en-US"}"` + (t.fontSize ? ` sz="${Math.round(t.fontSize * 100)}"` : "") + ' dirty="0"/>' : f ? i += `<a:endParaRPr lang="${t.lang || "en-US"}"` + (t.fontSize ? ` sz="${Math.round(t.fontSize * 100)}"` : "") + ' dirty="0"/>' : i += `<a:endParaRPr lang="${t.lang || "en-US"}" dirty="0"/>`, i += "</a:p>";
  }), i += e._type === "tablecell" ? "</a:txBody>" : "</p:txBody>", i;
}
function fv(e, t = false) {
  if (!e) return "";
  let r = e.options?._placeholderIdx ? e.options._placeholderIdx : "", l = e.options?._placeholderType ? e.options._placeholderType : "", i = l && Sv[l] ? Sv[l].toString() : "";
  return `<p:ph
		${r ? ' idx="' + r.toString() + '"' : ""}
		${i && Sv[i] ? ` type="${i}"` : ""}
		${!t && Array.isArray(e.text) && e.text.some((c) => typeof c?.text == "string" && c.text.length > 0) ? ' hasCustomPrompt="1"' : ""}
		/>`;
}
function j6(e, t, r, l) {
  let i = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + dc;
  return i += '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">', i += '<Default Extension="xml" ContentType="application/xml"/>', i += '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', i += '<Default Extension="jpeg" ContentType="image/jpeg"/>', i += '<Default Extension="jpg" ContentType="image/jpg"/>', i += '<Default Extension="svg" ContentType="image/svg+xml"/>', i += '<Default Extension="png" ContentType="image/png"/>', i += '<Default Extension="gif" ContentType="image/gif"/>', i += '<Default Extension="m4v" ContentType="video/mp4"/>', i += '<Default Extension="mp4" ContentType="video/mp4"/>', e.forEach((c) => {
    (c._relsMedia || []).forEach((s) => {
      s.type !== "image" && s.type !== "online" && s.type !== "chart" && s.extn !== "m4v" && !i.includes(s.type) && (i += '<Default Extension="' + s.extn + '" ContentType="' + s.type + '"/>');
    });
  }), i += '<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>', i += '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>', l && (i += v4(l.embeddedFonts)), i += '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>', i += '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>', i += '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>', e.forEach((c, s) => {
    i += `<Override PartName="/ppt/slides/slide${s + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`, c._relsChart.forEach((h) => {
      i += `<Override PartName="${h.Target}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`;
    });
  }), i += '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>', i += '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>', i += '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>', i += '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>', t.forEach((c, s) => {
    i += `<Override PartName="/ppt/slideLayouts/slideLayout${s + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`, (c._relsChart || []).forEach((h) => {
      i += ' <Override PartName="' + h.Target + '" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';
    });
  }), e.forEach((c, s) => {
    i += `<Override PartName="/ppt/notesSlides/notesSlide${s + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`;
  }), r._relsChart.forEach((c) => {
    i += ' <Override PartName="' + c.Target + '" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';
  }), r._relsMedia.forEach((c) => {
    c.type !== "image" && c.type !== "online" && c.type !== "chart" && c.extn !== "m4v" && !i.includes(c.type) && (i += ' <Default Extension="' + c.extn + '" ContentType="' + c.type + '"/>');
  }), i += ' <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>', i += ' <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>', i += "</Types>", i;
}
function H6() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'.concat(dc, `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
		<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
		<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
		<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
		</Relationships>`);
}
function U6(e, t) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'.concat(dc, `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
	<TotalTime>0</TotalTime>
	<Words>0</Words>
	<Application>Microsoft Office PowerPoint</Application>
	<PresentationFormat>On-screen Show (16:9)</PresentationFormat>
	<Paragraphs>0</Paragraphs>
	<Slides>`).concat(e.length, `</Slides>
	<Notes>`).concat(e.length, `</Notes>
	<HiddenSlides>0</HiddenSlides>
	<MMClips>0</MMClips>
	<ScaleCrop>false</ScaleCrop>
	<HeadingPairs>
		<vt:vector size="6" baseType="variant">
			<vt:variant><vt:lpstr>Fonts Used</vt:lpstr></vt:variant>
			<vt:variant><vt:i4>2</vt:i4></vt:variant>
			<vt:variant><vt:lpstr>Theme</vt:lpstr></vt:variant>
			<vt:variant><vt:i4>1</vt:i4></vt:variant>
			<vt:variant><vt:lpstr>Slide Titles</vt:lpstr></vt:variant>
			<vt:variant><vt:i4>`).concat(e.length, `</vt:i4></vt:variant>
		</vt:vector>
	</HeadingPairs>
	<TitlesOfParts>
		<vt:vector size="`).concat(e.length + 1 + 2, `" baseType="lpstr">
			<vt:lpstr>Arial</vt:lpstr>
			<vt:lpstr>Calibri</vt:lpstr>
			<vt:lpstr>Office Theme</vt:lpstr>
			`).concat(e.map(function(r, l) {
    return "<vt:lpstr>Slide ".concat(l + 1, "</vt:lpstr>");
  }).join(""), `
		</vt:vector>
	</TitlesOfParts>
	<Company>`).concat(t, `</Company>
	<LinksUpToDate>false</LinksUpToDate>
	<SharedDoc>false</SharedDoc>
	<HyperlinksChanged>false</HyperlinksChanged>
	<AppVersion>16.0000</AppVersion>
	</Properties>`);
}
function V6(e, t, r, l, i = "") {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
	<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
		<dc:title>${an(e)}</dc:title>
		<dc:subject>${an(t)}</dc:subject>${i === "" ? "" : `
		<dc:description>${an(i)}</dc:description>`}
		<dc:creator>${an(r)}</dc:creator>
		<cp:lastModifiedBy>${an(r)}</cp:lastModifiedBy>
		<cp:revision>${l}</cp:revision>
		<dcterms:created xsi:type="dcterms:W3CDTF">${(/* @__PURE__ */ new Date()).toISOString().replace(/\.\d\d\dZ/, "Z")}</dcterms:created>
		<dcterms:modified xsi:type="dcterms:W3CDTF">${(/* @__PURE__ */ new Date()).toISOString().replace(/\.\d\d\dZ/, "Z")}</dcterms:modified>
	</cp:coreProperties>`;
}
function G6(e, t) {
  let r = 1, l = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + dc;
  l += '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">', l += '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>';
  for (let i = 1; i <= e.length; i++) l += `<Relationship Id="rId${++r}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`;
  return r++, l += `<Relationship Id="rId${r + 0}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/><Relationship Id="rId${r + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/><Relationship Id="rId${r + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/><Relationship Id="rId${r + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId${r + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>`, t && t.embeddedFonts.forEach((i, c) => {
    l += `<Relationship Id="rId${aR(e, c)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${tR(c)}"/>`;
  }), l += "</Relationships>", l;
}
function W6(e) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'.concat(dc) + '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"' + "".concat(e?.hidden ? ' show="0"' : "", ">") + "".concat(uA(e)) + "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>";
}
function K6(e) {
  var t = "";
  return e._slideObjects.forEach(function(r) {
    r._type === Qi.notes && (t += r?.text && r.text[0] ? r.text[0].text : "");
  }), t.replace(/\r*\n/g, dc);
}
function q6() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'.concat(dc, '<p:notesMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="hdr" sz="quarter"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2971800" cy="458788"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle><a:lvl1pPr algn="l"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Date Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="dt" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="3884613" y="0"/><a:ext cx="2971800" cy="458788"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle><a:lvl1pPr algn="r"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p><a:fld id="{5282F153-3F37-0F45-9E97-73ACFA13230C}" type="datetimeFigureOut"><a:rPr lang="en-US"/><a:t>7/23/19</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Image Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="5" name="Notes Placeholder 4"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl="1"/><a:r><a:rPr lang="en-US"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl="2"/><a:r><a:rPr lang="en-US"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl="3"/><a:r><a:rPr lang="en-US"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl="4"/><a:r><a:rPr lang="en-US"/><a:t>Fifth level</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="6" name="Footer Placeholder 5"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ftr" sz="quarter" idx="4"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="8685213"/><a:ext cx="2971800" cy="458787"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="b"/><a:lstStyle><a:lvl1pPr algn="l"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="7" name="Slide Number Placeholder 6"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="5"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="3884613" y="8685213"/><a:ext cx="2971800" cy="458787"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="b"/><a:lstStyle><a:lvl1pPr algn="r"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p><a:fld id="{CE5E9CC1-C706-0F49-92D6-E571CC5EEA8F}" type="slidenum"><a:rPr lang="en-US"/><a:t>\u2039#\u203A</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree><p:extLst><p:ext uri="{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}"><p14:creationId xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="1024086991"/></p:ext></p:extLst></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL="457200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL="914400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL="1371600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL="1828800" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL="2286000" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL="2743200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL="3200400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL="3657600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr></p:notesStyle></p:notesMaster>');
}
function Y6(e) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'.concat(dc, '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>').concat(an(K6(e)), '</a:t></a:r><a:endParaRPr lang="en-US" dirty="0"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Number Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="10"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id="').concat(q2, '" type="slidenum"><a:rPr lang="en-US"/><a:t>').concat(e._slideNum, '</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree><p:extLst><p:ext uri="{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}"><p14:creationId xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="1024086991"/></p:ext></p:extLst></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>');
}
function X6(e) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" preserve="1">
		`.concat(uA(e), `
		<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
}
function Q6(e, t, r) {
  let l = t.map((c, s) => `<p:sldLayoutId id="${b6 + s}" r:id="rId${e._rels.length + s + 1}"/>`), i = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + dc;
  return i += '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">', i += uA(e), i += r?.dark ? '<p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' : '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>', i += "<p:sldLayoutIdLst>" + l.join("") + "</p:sldLayoutIdLst>", i += '<p:hf sldNum="0" hdr="0" ftr="0" dt="0"/>', i += '<p:txStyles> <p:titleStyle>  <a:lvl1pPr algn="ctr" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr> </p:titleStyle> <p:bodyStyle>  <a:lvl1pPr marL="342900" indent="-342900" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="\u2022"/><a:defRPr sz="3200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>  <a:lvl2pPr marL="742950" indent="-285750" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="\u2013"/><a:defRPr sz="2800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr>  <a:lvl3pPr marL="1143000" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="\u2022"/><a:defRPr sz="2400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr>  <a:lvl4pPr marL="1600200" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="\u2013"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr>  <a:lvl5pPr marL="2057400" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="\xBB"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr>  <a:lvl6pPr marL="2514600" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="\u2022"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr>  <a:lvl7pPr marL="2971800" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="\u2022"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr>  <a:lvl8pPr marL="3429000" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="\u2022"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr>  <a:lvl9pPr marL="3886200" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="\u2022"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr> </p:bodyStyle> <p:otherStyle>  <a:defPPr><a:defRPr lang="en-US"/></a:defPPr>  <a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>  <a:lvl2pPr marL="457200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr>  <a:lvl3pPr marL="914400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr>  <a:lvl4pPr marL="1371600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr>  <a:lvl5pPr marL="1828800" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr>  <a:lvl6pPr marL="2286000" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr>  <a:lvl7pPr marL="2743200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr>  <a:lvl8pPr marL="3200400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr>  <a:lvl9pPr marL="3657600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr> </p:otherStyle></p:txStyles>', i += "</p:sldMaster>", i;
}
function J6(e, t) {
  return fA(t[e - 1], [{ target: "../slideMasters/slideMaster1.xml", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" }]);
}
function Z6(e, t, r) {
  return fA(e[r - 1], [{ target: "../slideLayouts/slideLayout".concat(a4(e, t, r), ".xml"), type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" }, { target: "../notesSlides/notesSlide".concat(r, ".xml"), type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" }]);
}
function $6(e) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
			<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/>
			<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide`.concat(e, `.xml"/>
		</Relationships>`);
}
function e4(e, t) {
  var r = t.map(function(l, i) {
    return { target: "../slideLayouts/slideLayout".concat(i + 1, ".xml"), type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" };
  });
  return r.push({ target: "../theme/theme1.xml", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" }), fA(e, r);
}
function t4() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'.concat(dc, `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
		<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
		</Relationships>`);
}
function a4(e, t, r) {
  for (var l = 0; l < t.length; l++) if (t[l]._name === e[r - 1]._slideLayout._name) return l + 1;
  return 1;
}
function r4(e) {
  let t = !!(e.theme?.name || e.theme?.colors), r = t ? an(e.theme.name || "Theme") : "Office Theme", l = t ? r : "Office", i = e.theme?.colors, c = (f, n) => i && /^[0-9A-Fa-f]{6}$/.test(i[f]) ? `<a:srgbClr val="${i[f]}"/>` : n, s = e.theme?.headFontFace ? `<a:latin typeface="${an(e.theme.headFontFace)}"/>` : '<a:latin typeface="Calibri Light" panose="020F0302020204030204"/>', h = e.theme?.bodyFontFace ? `<a:latin typeface="${an(e.theme.bodyFontFace)}"/>` : '<a:latin typeface="Calibri" panose="020F0502020204030204"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${r}"><a:themeElements><a:clrScheme name="${l}"><a:dk1>${c("dk1", '<a:sysClr val="windowText" lastClr="000000"/>')}</a:dk1><a:lt1>${c("lt1", '<a:sysClr val="window" lastClr="FFFFFF"/>')}</a:lt1><a:dk2>${c("dk2", '<a:srgbClr val="44546A"/>')}</a:dk2><a:lt2>${c("lt2", '<a:srgbClr val="E7E6E6"/>')}</a:lt2><a:accent1>${c("accent1", '<a:srgbClr val="4472C4"/>')}</a:accent1><a:accent2>${c("accent2", '<a:srgbClr val="ED7D31"/>')}</a:accent2><a:accent3>${c("accent3", '<a:srgbClr val="A5A5A5"/>')}</a:accent3><a:accent4>${c("accent4", '<a:srgbClr val="FFC000"/>')}</a:accent4><a:accent5>${c("accent5", '<a:srgbClr val="5B9BD5"/>')}</a:accent5><a:accent6>${c("accent6", '<a:srgbClr val="70AD47"/>')}</a:accent6><a:hlink>${c("hlink", '<a:srgbClr val="0563C1"/>')}</a:hlink><a:folHlink>${c("folHlink", '<a:srgbClr val="954F72"/>')}</a:folHlink></a:clrScheme><a:fontScheme name="${l}"><a:majorFont>${s}<a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="\u6E38\u30B4\u30B7\u30C3\u30AF Light"/><a:font script="Hang" typeface="\uB9D1\uC740 \uACE0\uB515"/><a:font script="Hans" typeface="\u7B49\u7EBF Light"/><a:font script="Hant" typeface="\u65B0\u7D30\u660E\u9AD4"/><a:font script="Arab" typeface="Times New Roman"/><a:font script="Hebr" typeface="Times New Roman"/><a:font script="Thai" typeface="Angsana New"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="MoolBoran"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Times New Roman"/><a:font script="Uigh" typeface="Microsoft Uighur"/><a:font script="Geor" typeface="Sylfaen"/><a:font script="Armn" typeface="Arial"/><a:font script="Bugi" typeface="Leelawadee UI"/><a:font script="Bopo" typeface="Microsoft JhengHei"/><a:font script="Java" typeface="Javanese Text"/><a:font script="Lisu" typeface="Segoe UI"/><a:font script="Mymr" typeface="Myanmar Text"/><a:font script="Nkoo" typeface="Ebrima"/><a:font script="Olck" typeface="Nirmala UI"/><a:font script="Osma" typeface="Ebrima"/><a:font script="Phag" typeface="Phagspa"/><a:font script="Syrn" typeface="Estrangelo Edessa"/><a:font script="Syrj" typeface="Estrangelo Edessa"/><a:font script="Syre" typeface="Estrangelo Edessa"/><a:font script="Sora" typeface="Nirmala UI"/><a:font script="Tale" typeface="Microsoft Tai Le"/><a:font script="Talu" typeface="Microsoft New Tai Lue"/><a:font script="Tfng" typeface="Ebrima"/></a:majorFont><a:minorFont>${h}<a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="\u6E38\u30B4\u30B7\u30C3\u30AF"/><a:font script="Hang" typeface="\uB9D1\uC740 \uACE0\uB515"/><a:font script="Hans" typeface="\u7B49\u7EBF"/><a:font script="Hant" typeface="\u65B0\u7D30\u660E\u9AD4"/><a:font script="Arab" typeface="Arial"/><a:font script="Hebr" typeface="Arial"/><a:font script="Thai" typeface="Cordia New"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="DaunPenh"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Arial"/><a:font script="Uigh" typeface="Microsoft Uighur"/><a:font script="Geor" typeface="Sylfaen"/><a:font script="Armn" typeface="Arial"/><a:font script="Bugi" typeface="Leelawadee UI"/><a:font script="Bopo" typeface="Microsoft JhengHei"/><a:font script="Java" typeface="Javanese Text"/><a:font script="Lisu" typeface="Segoe UI"/><a:font script="Mymr" typeface="Myanmar Text"/><a:font script="Nkoo" typeface="Ebrima"/><a:font script="Olck" typeface="Nirmala UI"/><a:font script="Osma" typeface="Ebrima"/><a:font script="Phag" typeface="Phagspa"/><a:font script="Syrn" typeface="Estrangelo Edessa"/><a:font script="Syrj" typeface="Estrangelo Edessa"/><a:font script="Syre" typeface="Estrangelo Edessa"/><a:font script="Sora" typeface="Nirmala UI"/><a:font script="Tale" typeface="Microsoft Tai Le"/><a:font script="Talu" typeface="Microsoft New Tai Lue"/><a:font script="Tfng" typeface="Ebrima"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="109000"/><a:tint val="81000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="103000"/><a:lumMod val="102000"/><a:tint val="94000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="100000"/><a:shade val="100000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="99000"/><a:satMod val="120000"/><a:shade val="78000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/><a:lumMod val="102000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/><a:lumMod val="103000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/>${t ? "" : '<a:extLst><a:ext uri="{05A4C25C-085E-4340-85A3-A5531E510DB2}"><thm15:themeFamily xmlns:thm15="http://schemas.microsoft.com/office/thememl/2012/main" name="Office Theme" id="{62F939B6-93AF-4DB8-9C6B-D6C7DFDC589F}" vid="{4A3C46E8-61CC-4603-A589-7422A47A8E4A}"/></a:ext></a:extLst>'}</a:theme>`;
}
function l4(e) {
  let t = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${dc}<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ${e.rtlMode ? 'rtl="1"' : ""}${e.embeddedFonts.length > 0 ? ' embedTrueTypeFonts="1"' : ""} saveSubsetFonts="1" autoCompressPictures="0">`;
  t += '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>', t += "<p:sldIdLst>", e.slides.forEach((r) => t += `<p:sldId id="${r._slideId}" r:id="rId${r._rId}"/>`), t += "</p:sldIdLst>", t += `<p:notesMasterIdLst><p:notesMasterId r:id="rId${e.slides.length + 2}"/></p:notesMasterIdLst>`, t += `<p:sldSz cx="${e.presLayout.width}" cy="${e.presLayout.height}"/>`, t += `<p:notesSz cx="${e.presLayout.height}" cy="${e.presLayout.width}"/>`, t += m4(e.embeddedFonts, (r) => aR(e.slides, e.embeddedFonts.indexOf(r))), t += "<p:defaultTextStyle>";
  for (let r = 1; r < 10; r++) t += `<a:lvl${r}pPr marL="${(r - 1) * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${r}pPr>`;
  return t += "</p:defaultTextStyle>", e.sections && e.sections.length > 0 && (t += '<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}">', t += '<p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">', e.sections.forEach((r) => {
    t += `<p14:section name="${an(r.title)}" id="{${ig("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")}}"><p14:sldIdLst>`, r._slides.forEach((l) => t += `<p14:sldId id="${l._slideId}"/>`), t += "</p14:sldIdLst></p14:section>";
  }), t += "</p14:sectionLst></p:ext>", t += '<p:ext uri="{EFAFB233-063F-42B5-8137-9DF3F51BA10A}"><p15:sldGuideLst xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main"/></p:ext>', t += "</p:extLst>"), t += "</p:presentation>", t;
}
function o4() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'.concat(dc, '<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
}
function n4() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'.concat(dc, '<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>');
}
function i4() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'.concat(dc, '<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:normalViewPr horzBarState="maximized"><p:restoredLeft sz="15611"/><p:restoredTop sz="94610"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr snapToGrid="0" snapToObjects="1"><p:cViewPr varScale="1"><p:scale><a:sx n="136" d="100"/><a:sy n="136" d="100"/></p:scale><p:origin x="216" y="312"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr><p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="1" d="1"/><a:sy n="1" d="1"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>');
}
var s4 = "3.12.0", pm = function() {
  function e() {
    var t = this;
    this._version = s4, this._alignH = jy, this._alignV = Hy, this._chartType = zy, this._outputType = Fy, this._schemeColor = Pd, this._shapeType = By, this._charts = Wn, this._colors = Uy, this._shapes = Ev, this.addNewSlide = function(s) {
      var h = t.sections.length > 0 && t.sections[t.sections.length - 1]._slides.filter(function(f) {
        return f._slideNum === t.slides[t.slides.length - 1]._slideNum;
      }).length > 0;
      return s.sectionTitle = h ? t.sections[t.sections.length - 1].title : null, t.addSlide(s);
    }, this.getSlide = function(s) {
      return t.slides.filter(function(h) {
        return h._slideNum === s;
      })[0];
    }, this.setSlideNumber = function(s) {
      t.masterSlide._slideNumberProps = s, t.slideLayouts.filter(function(h) {
        return h._name === Oy;
      })[0]._slideNumberProps = s;
    }, this.createChartMediaRels = function(s, h, f) {
      s._relsChart.forEach(function(n) {
        return f.push(L6(n, h));
      }), s._relsMedia.forEach(function(n) {
        if (n.type !== "online" && n.type !== "hyperlink") {
          var p = n.data && typeof n.data == "string" ? n.data : "";
          !p.includes(",") && !p.includes(";") ? p = "image/png;base64," + p : p.includes(",") ? p.includes(";") || (p = "image/png;" + p) : p = "image/png;base64," + p, h.file(n.Target.replace("..", "ppt"), p.split(",").pop(), { base64: true });
        }
      });
    }, this.writeFileToBrowser = function(s, h) {
      return ip(t, void 0, void 0, function() {
        var f, n;
        return sp(this, function(p) {
          switch (p.label) {
            case 0:
              return f = document.createElement("a"), f.setAttribute("style", "display:none;"), f.dataset.interception = "off", document.body.appendChild(f), window.URL.createObjectURL ? (n = window.URL.createObjectURL(new Blob([h], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" })), f.href = n, f.download = s, f.click(), setTimeout(function() {
                window.URL.revokeObjectURL(n), document.body.removeChild(f);
              }, 100), [4, Promise.resolve(s)]) : [3, 2];
            case 1:
              return [2, p.sent()];
            case 2:
              return [2];
          }
        });
      });
    }, this.exportPresentation = async (s) => {
      let h = [], f = [], n = new V2();
      return this.slides.forEach((p) => {
        f = f.concat(ly(p));
      }), this.slideLayouts.forEach((p) => {
        f = f.concat(ly(p));
      }), f = f.concat(ly(this.masterSlide)), await Promise.all(f).then(async () => (this.slides.forEach((p) => {
        p._slideLayout && N6(p);
      }), n.folder("_rels"), n.folder("docProps"), n.folder("ppt").folder("_rels"), n.folder("ppt/slideLayouts").folder("_rels"), n.folder("ppt/slideMasters").folder("_rels"), n.folder("ppt/slides").folder("_rels"), n.folder("ppt/theme"), n.folder("ppt/notesMasters").folder("_rels"), n.folder("ppt/notesSlides").folder("_rels"), this.embeddedFonts.forEach((p, m) => {
        n.file("ppt/" + tR(m), p.data);
      }), n.file("[Content_Types].xml", j6(this.slides, this.slideLayouts, this.masterSlide, this)), n.file("_rels/.rels", H6()), n.file("docProps/app.xml", U6(this.slides, this.company)), n.file("docProps/core.xml", V6(this.title, this.subject, this.author, this.revision, this.description)), n.file("ppt/_rels/presentation.xml.rels", G6(this.slides, this)), n.file("ppt/theme/theme1.xml", r4(this)), n.file("ppt/presentation.xml", l4(this)), n.file("ppt/presProps.xml", o4()), n.file("ppt/tableStyles.xml", n4()), n.file("ppt/viewProps.xml", i4()), this.slideLayouts.forEach((p, m) => {
        n.file(`ppt/slideLayouts/slideLayout${m + 1}.xml`, X6(p)), n.file(`ppt/slideLayouts/_rels/slideLayout${m + 1}.xml.rels`, J6(m + 1, this.slideLayouts));
      }), this.slides.forEach((p, m) => {
        n.file(`ppt/slides/slide${m + 1}.xml`, W6(p)), n.file(`ppt/slides/_rels/slide${m + 1}.xml.rels`, Z6(this.slides, this.slideLayouts, m + 1)), n.file(`ppt/notesSlides/notesSlide${m + 1}.xml`, Y6(p)), n.file(`ppt/notesSlides/_rels/notesSlide${m + 1}.xml.rels`, $6(m + 1));
      }), n.file("ppt/slideMasters/slideMaster1.xml", Q6(this.masterSlide, this.slideLayouts, this.theme)), n.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", e4(this.masterSlide, this.slideLayouts)), n.file("ppt/notesMasters/notesMaster1.xml", q6()), n.file("ppt/notesMasters/_rels/notesMaster1.xml.rels", t4()), this.slideLayouts.forEach((p) => {
        this.createChartMediaRels(p, n, h);
      }), this.slides.forEach((p) => {
        this.createChartMediaRels(p, n, h);
      }), this.createChartMediaRels(this.masterSlide, n, h), await Promise.all(h).then(async () => s.outputType === "STREAM" ? await n.generateAsync({ type: "nodebuffer", compression: s.compression ? "DEFLATE" : "STORE" }) : s.outputType ? await n.generateAsync({ type: s.outputType, compression: s.compression ? "DEFLATE" : "STORE" }) : await n.generateAsync({ type: "blob", compression: s.compression ? "DEFLATE" : "STORE" }))));
    };
    var r = { name: "screen4x3", width: 9144e3, height: 6858e3 }, l = { name: "screen16x9", width: 9144e3, height: 5143500 }, i = { name: "screen16x10", width: 9144e3, height: 5715e3 }, c = { name: "custom", width: 12192e3, height: 6858e3 };
    this.LAYOUTS = { LAYOUT_4x3: r, LAYOUT_16x9: l, LAYOUT_16x10: i, LAYOUT_WIDE: c }, this._author = "PptxGenJS", this._company = "PptxGenJS", this._revision = "1", this._subject = "PptxGenJS Presentation", this._title = "PptxGenJS Presentation", this._presLayout = { name: this.LAYOUTS[rp].name, _sizeW: this.LAYOUTS[rp].width, _sizeH: this.LAYOUTS[rp].height, width: this.LAYOUTS[rp].width, height: this.LAYOUTS[rp].height }, this._rtlMode = false, this._slideLayouts = [{ _margin: Cv, _name: Oy, _presLayout: this._presLayout, _rels: [], _relsChart: [], _relsMedia: [], _slide: null, _slideNum: 1e3, _slideNumberProps: null, _slideObjects: [] }], this._slides = [], this._sections = [], this._masterSlide = { addChart: null, addImage: null, addMedia: null, addNotes: null, addShape: null, addTable: null, addText: null, _name: null, _presLayout: this._presLayout, _rId: null, _rels: [], _relsChart: [], _relsMedia: [], _slideId: null, _slideLayout: null, _slideNum: null, _slideNumberProps: null, _slideObjects: [] };
  }
  return Object.defineProperty(e.prototype, "layout", { get: function() {
    return this._layout;
  }, set: function(t) {
    var r = this.LAYOUTS[t];
    if (r) this._layout = t, this._presLayout = r;
    else throw new Error("UNKNOWN-LAYOUT");
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "version", { get: function() {
    return this._version;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "author", { get: function() {
    return this._author;
  }, set: function(t) {
    this._author = t;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "company", { get: function() {
    return this._company;
  }, set: function(t) {
    this._company = t;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "revision", { get: function() {
    return this._revision;
  }, set: function(t) {
    this._revision = t;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "subject", { get: function() {
    return this._subject;
  }, set: function(t) {
    this._subject = t;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "theme", { get: function() {
    return this._theme;
  }, set: function(t) {
    this._theme = t;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "title", { get: function() {
    return this._title;
  }, set: function(t) {
    this._title = t;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "rtlMode", { get: function() {
    return this._rtlMode;
  }, set: function(t) {
    this._rtlMode = t;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "masterSlide", { get: function() {
    return this._masterSlide;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "slides", { get: function() {
    return this._slides;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "sections", { get: function() {
    return this._sections;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "slideLayouts", { get: function() {
    return this._slideLayouts;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "AlignH", { get: function() {
    return this._alignH;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "AlignV", { get: function() {
    return this._alignV;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "ChartType", { get: function() {
    return this._chartType;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "OutputType", { get: function() {
    return this._outputType;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "presLayout", { get: function() {
    return this._presLayout;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "SchemeColor", { get: function() {
    return this._schemeColor;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "ShapeType", { get: function() {
    return this._shapeType;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "charts", { get: function() {
    return this._charts;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "colors", { get: function() {
    return this._colors;
  }, enumerable: false, configurable: true }), Object.defineProperty(e.prototype, "shapes", { get: function() {
    return this._shapes;
  }, enumerable: false, configurable: true }), e.prototype.stream = function(t) {
    return ip(this, void 0, void 0, function() {
      return sp(this, function(r) {
        switch (r.label) {
          case 0:
            return [4, this.exportPresentation({ compression: t?.compression, outputType: "STREAM" })];
          case 1:
            return [2, r.sent()];
        }
      });
    });
  }, e.prototype.write = function(t) {
    return ip(this, void 0, void 0, function() {
      var r, l;
      return sp(this, function(i) {
        switch (i.label) {
          case 0:
            return r = typeof t == "object" && t?.outputType ? t.outputType : t || null, l = typeof t == "object" && t?.compression ? t.compression : false, [4, this.exportPresentation({ compression: l, outputType: r })];
          case 1:
            return [2, i.sent()];
        }
      });
    });
  }, e.prototype.writeFile = function(t) {
    return ip(this, void 0, void 0, function() {
      var r, l, i, c, s = this;
      return sp(this, function(h) {
        switch (h.label) {
          case 0:
            return r = typeof require < "u" && typeof window > "u" ? require("fs") : null, typeof t == "string" && console.log("Warning: `writeFile(filename)` is deprecated - please use `WriteFileProps` argument (v3.5.0)"), l = typeof t == "object" && t?.fileName ? t.fileName : typeof t == "string" ? t : "", i = typeof t == "object" && t?.compression ? t.compression : false, c = l ? l.toString().toLowerCase().endsWith(".pptx") ? l : l + ".pptx" : "Presentation.pptx", [4, this.exportPresentation({ compression: i, outputType: r ? "nodebuffer" : null }).then(function(f) {
              return ip(s, void 0, void 0, function() {
                return sp(this, function(n) {
                  switch (n.label) {
                    case 0:
                      return r ? [4, new Promise(function(p, m) {
                        r.writeFile(c, f, function(d) {
                          d ? m(d) : p(c);
                        });
                      })] : [3, 2];
                    case 1:
                      return [2, n.sent()];
                    case 2:
                      return [4, this.writeFileToBrowser(c, f)];
                    case 3:
                      return [2, n.sent()];
                  }
                });
              });
            })];
          case 1:
            return [2, h.sent()];
        }
      });
    });
  }, e.prototype.addSection = function(t) {
    t ? t.title || console.warn("addSection requires a title") : console.warn("addSection requires an argument");
    var r = { _type: "user", _slides: [], title: t.title };
    t.order ? this.sections.splice(t.order, 0, r) : this._sections.push(r);
  }, e.prototype.addSlide = function(t) {
    var r = typeof t == "string" ? t : t?.masterName ? t.masterName : "", l = { _name: this.LAYOUTS[rp].name, _presLayout: this.presLayout, _rels: [], _relsChart: [], _relsMedia: [], _slideNum: this.slides.length + 1 };
    if (r) {
      var i = this.slideLayouts.filter(function(f) {
        return f._name === r;
      })[0];
      i && (l = i);
    }
    var c = new I6({ addSlide: this.addNewSlide, getSlide: this.getSlide, presLayout: this.presLayout, setSlideNum: this.setSlideNumber, slideId: this.slides.length + 256, slideRId: this.slides.length + 2, slideNumber: this.slides.length + 1, slideLayout: l });
    if (this._slides.push(c), t?.sectionTitle) {
      var s = this.sections.filter(function(f) {
        return f.title === t.sectionTitle;
      })[0];
      s ? s._slides.push(c) : console.warn('addSlide: unable to find section with title: "'.concat(t.sectionTitle, '"'));
    } else if (this.sections && this.sections.length > 0 && !t?.sectionTitle) {
      var h = this._sections[this.sections.length - 1];
      h._type === "default" ? h._slides.push(c) : this._sections.push({ title: "Default-".concat(this.sections.filter(function(f) {
        return f._type === "default";
      }).length + 1), _type: "default", _slides: [c] });
    }
    return c;
  }, e.prototype.defineLayout = function(t) {
    t ? t.name ? t.width ? t.height ? typeof t.height != "number" ? console.warn("defineLayout `height` should be a number (inches)") : typeof t.width != "number" && console.warn("defineLayout `width` should be a number (inches)") : console.warn("defineLayout requires `height`") : console.warn("defineLayout requires `width`") : console.warn("defineLayout requires `name`") : console.warn("defineLayout requires `{name, width, height}`"), this.LAYOUTS[t.name] = { name: t.name, _sizeW: Math.round(Number(t.width) * tn), _sizeH: Math.round(Number(t.height) * tn), width: Math.round(Number(t.width) * tn), height: Math.round(Number(t.height) * tn) };
  }, e.prototype.defineSlideMaster = function(t) {
    if (!t.title) throw Error("defineSlideMaster() object argument requires a `title` value. (https://gitbrent.github.io/PptxGenJS/docs/masters.html)");
    let r = { _margin: t.margin || Cv, _name: t.title, _presLayout: this.presLayout, _rels: [], _relsChart: [], _relsMedia: [], _slide: null, _slideNum: 1e3 + this.slideLayouts.length + 1, _slideNumberProps: t.slideNumber || null, _slideObjects: [], _emptyPlaceholders: t.emptyPlaceholders !== false, background: t.background || null, bkgd: t.bkgd || null };
    X2(t, r), this.slideLayouts.push(r), (t.background || t.bkgd) && Z2(t.background, r), r._slideNumberProps && !this.masterSlide._slideNumberProps && (this.masterSlide._slideNumberProps = r._slideNumberProps);
  }, e.prototype.tableToSlides = function(t, r) {
    r === void 0 && (r = {}), k6(this, t, r, r?.masterSlideName ? this.slideLayouts.filter(function(l) {
      return l._name === r.masterSlideName;
    })[0] : null);
  }, e;
}();
function c4(e, t) {
  return e._slideLayout?._slideObjects?.filter((r) => r._type === "placeholder" && r.options?._placeholderType === t)[0];
}
function d4(e) {
  return !!e && e.length > 0 && e.every((t) => "close" in t || [t.x, t.y, ..."curve" in t ? "wR" in t.curve ? [t.curve.wR, t.curve.hR, t.curve.stAng, t.curve.swAng] : [NaN] : []].every((r) => Number.isFinite(r)));
}
pm.prototype.addMasterObjects = function(e) {
  this._masterSlide._presLayout = this.presLayout, X2({ objects: e }, this._masterSlide);
};
function u4(e) {
  return String.fromCharCode(e >>> 24 & 255, e >>> 16 & 255, e >>> 8 & 255, e & 255);
}
function eR(e) {
  let t = (m) => ({ flavor: m, tables: [], names: {} });
  if (e.byteLength < 12) return t("unknown");
  let r = new DataView(e.buffer, e.byteOffset, e.byteLength), l = r.getUint32(0);
  if (l === y4) return t("collection");
  if (l === S4) return t("woff");
  if (l === A4) return e.byteLength >= 20 ? { ...t("woff2"), extent: r.getUint32(16) } : t("woff2");
  if (l !== 65536 && l !== b4 && l !== rC) return t("unknown");
  let i = r.getUint16(4);
  if (e.byteLength < 12 + i * 16) return t("unknown");
  let c = /* @__PURE__ */ new Map(), s = 12 + i * 16;
  for (let m = 0; m < i; m++) {
    let d = 12 + m * 16, b = r.getUint32(d + 8), x = r.getUint32(d + 12);
    b + x <= e.byteLength && (c.set(u4(r.getUint32(d)), { offset: b, length: x }), s = Math.max(s, b + x));
  }
  let h = { flavor: l === rC ? "cff" : "truetype", tables: [...c.keys()], extent: Math.min(e.byteLength, Math.ceil(s / 4) * 4), names: {} }, f = c.get("OS/2");
  if (f && f.length >= 78) {
    let m = f.offset;
    h.os2 = { fsType: r.getUint16(m + 8), weightClass: r.getUint16(m + 4), italic: (r.getUint16(m + 62) & 1) === 1, panose: Array.from(e.subarray(m + 32, m + 42)), unicodeRange: [r.getUint32(m + 42), r.getUint32(m + 46), r.getUint32(m + 50), r.getUint32(m + 54)], codePageRange: f.length >= 86 ? [r.getUint32(m + 78), r.getUint32(m + 82)] : [0, 0] };
  }
  let n = c.get("head");
  n && n.length >= 12 && (h.checkSumAdjustment = r.getUint32(n.offset + 8));
  let p = c.get("name");
  return p && p.length >= 6 && (h.names = f4(e, r, p.offset, p.length)), h;
}
function f4(e, t, r, l) {
  let i = t.getUint16(r + 2), c = r + t.getUint16(r + 4), s = /* @__PURE__ */ new Map();
  for (let h = 0; h < i; h++) {
    let f = r + 6 + h * 12;
    if (f + 12 > r + l) break;
    let n = t.getUint16(f), p = t.getUint16(f + 2), m = t.getUint16(f + 4), d = t.getUint16(f + 6), b = t.getUint16(f + 8), x = c + t.getUint16(f + 10);
    if (!C4.includes(d) || x + b > e.byteLength || b > (d === 0 || d === 13 ? w4 : x4)) continue;
    let v = 0, w = "";
    if (n === 3 && (p === 1 || p === 10) && m === 1033) v = 3;
    else if (n === 0) v = 2;
    else if (n === 1 && p === 0 && m === 0) v = 1;
    else continue;
    if (!((s.get(d)?.rank ?? 0) >= v)) {
      if (n === 1) for (let y = 0; y < b; y++) w += String.fromCharCode(e[x + y]);
      else for (let y = 0; y + 1 < b; y += 2) w += String.fromCharCode(t.getUint16(x + y));
      s.set(d, { rank: v, text: w });
    }
  }
  return { family: s.get(1)?.text, subfamily: s.get(2)?.text, version: s.get(5)?.text, full: s.get(4)?.text, copyright: s.get(0)?.text, licence: s.get(13)?.text };
}
function h4(e) {
  let t = e.os2?.panose;
  if (!(!t || t.every((r) => r === 0))) return t.map((r) => r.toString(16).toUpperCase().padStart(2, "0")).join("");
}
function p4(e, t = eR(e)) {
  let r = (n = "") => {
    let p = new Uint8Array(n.length * 2), m = new DataView(p.buffer);
    for (let d = 0; d < n.length; d++) m.setUint16(d * 2, n.charCodeAt(d), true);
    return p;
  }, l = [t.names.family, t.names.subfamily, t.names.version, t.names.full].map((n) => r(n)), i = 80 + l.reduce((n, p) => n + 4 + p.byteLength, 0) + 4 + 4 + 4 + 2 + 2 + 4 + 4, c = new Uint8Array(i + e.byteLength), s = new DataView(c.buffer), h = t.os2, f = 0;
  s.setUint32(f, c.byteLength, true), f += 4, s.setUint32(f, e.byteLength, true), f += 4, s.setUint32(f, 131074, true), f += 4, s.setUint32(f, 0, true), f += 4, c.set(h?.panose ?? new Array(10).fill(0), f), f += 10, c[f++] = 1, c[f++] = h?.italic ? 1 : 0, s.setUint32(f, h?.weightClass ?? 400, true), f += 4, s.setUint16(f, h?.fsType ?? 0, true), f += 2, s.setUint16(f, 20556, true), f += 2;
  for (let n of h?.unicodeRange ?? [0, 0, 0, 0]) s.setUint32(f, n, true), f += 4;
  for (let n of h?.codePageRange ?? [0, 0]) s.setUint32(f, n, true), f += 4;
  s.setUint32(f, t.checkSumAdjustment ?? 0, true), f += 4, f += 16;
  for (let n of l) f += 2, s.setUint16(f, n.byteLength, true), f += 2, c.set(n, f), f += n.byteLength;
  return f += 2, s.setUint16(f, 0, true), f += 2, s.setUint32(f, 1346851650, true), f += 4, s.setUint32(f, 0, true), f += 4, f += 2, s.setUint16(f, 0, true), f += 2, s.setUint32(f, 0, true), f += 4, s.setUint32(f, 0, true), f += 4, c.set(e, f), c;
}
function tR(e) {
  return "fonts/font" + String(e + 1) + ".fntdata";
}
function v4(e) {
  return e.length === 0 ? "" : '<Default Extension="fntdata" ContentType="application/x-fontdata"/>';
}
function aR(e, t) {
  return e.length + 7 + t;
}
function g4(e) {
  let t = [];
  for (let r of e) {
    let l = t.find((i) => i.typeface === r.typeface);
    l || (l = { typeface: r.typeface, panose: r.panose, pitchFamily: r.pitchFamily, charset: r.charset ?? 0, faces: [] }, t.push(l)), l.faces = l.faces.concat(r).sort((i, c) => lC.indexOf(i.style) - lC.indexOf(c.style));
  }
  return t;
}
function m4(e, t) {
  if (e.length === 0) return "";
  let r = "<p:embeddedFontLst>";
  for (let l of g4(e)) {
    r += '<p:embeddedFont><p:font typeface="' + an(l.typeface) + '"' + (l.panose ? ' panose="' + l.panose + '"' : "") + (l.pitchFamily !== void 0 ? ' pitchFamily="' + String(l.pitchFamily) + '"' : "") + ' charset="' + String(l.charset) + '"/>';
    for (let i of l.faces) r += "<p:" + i.style + ' r:id="rId' + String(t(i)) + '"/>';
    r += "</p:embeddedFont>";
  }
  return r + "</p:embeddedFontLst>";
}
var b4 = 1953658213, rC = 1330926671, y4 = 1953784678, S4 = 2001684038, A4 = 2001684018, x4 = 510, w4 = 16384, C4 = [0, 1, 2, 4, 5, 13], lC = ["regular", "bold", "italic", "boldItalic"];
Object.defineProperties(pm.prototype, { description: { get: function() {
  return this._description === void 0 ? "" : this._description;
}, set: function(e) {
  this._description = e;
}, enumerable: false, configurable: true }, embeddedFonts: { get: function() {
  return this._embeddedFonts === void 0 && (this._embeddedFonts = []), this._embeddedFonts;
}, enumerable: false, configurable: true } });
pm.prototype.addEmbeddedFont = function(e) {
  let t = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data), r = eR(t);
  if (r.flavor !== "truetype" || !r.tables.includes("glyf")) {
    let c = { unknown: "data that is not a font", truetype: "a font with no glyf table", cff: "an OpenType font with CFF outlines (.otf); convert it to TrueType first", collection: "a font collection (.ttc); split out one font first", woff: "a WOFF web font; unpack it first", woff2: "a WOFF2 web font; unpack it first" }[r.flavor];
    throw Error("addEmbeddedFont: expected one uncompressed TrueType font (.ttf), got " + c);
  }
  let l = this.embeddedFonts, i = l.findIndex((c) => c.typeface === e.typeface && c.style === e.style);
  i >= 0 && l.splice(i, 1), l.push({ typeface: e.typeface, style: e.style, panose: h4(r), pitchFamily: e.pitchFamily, charset: e.charset, data: p4(t, r) });
};
var stdin_default = pm;
export {
  stdin_default as default
};
