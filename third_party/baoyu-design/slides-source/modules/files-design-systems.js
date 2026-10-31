// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installFilesDesignSystems(runtime2) {
  var DESIGN_SYSTEM_NAMESPACE_PATTERN, DesignSystemPathError, MAX_INSTALLED_DESIGN_SYSTEMS, DESIGN_SYSTEM_NAME_MAX_CHARS, DESIGN_SYSTEM_DESCRIPTION_MAX_CHARS, DESIGN_SYSTEM_REFERENCE_MAX_CHARS, DESIGN_SYSTEM_TOKENS_MAX_CHARS, DESIGN_SYSTEM_PATH_SEGMENT_PATTERN, DESIGN_SYSTEM_PATH_PATTERN, DESIGN_SYSTEM_UNSAFE_CONTROL_PATTERN, DESIGN_SYSTEM_DESCRIPTION_CONTROL_PATTERN, normalizeDesignSystemText, ARTIFACT_UUID_PATTERN, ARTIFACT_SHORT_ID_PATTERN, ARTIFACT_ID_PATTERN, DESIGN_SYSTEM_ARTIFACT_URL_PATTERN, DESIGN_SYSTEM_ALLOWED_HOSTS, DESIGN_SYSTEM_UNKNOWN_HOST_MESSAGE, ARTIFACT_REFERENCE_URL_PATTERN, DESIGN_SYSTEM_INSTALL_REJECTION_MESSAGES, DESIGN_SYSTEM_INSTALL_REQUEST_FILENAME, DESIGN_SYSTEM_INSTALL_COMMAND_HELP, DESIGN_SYSTEM_INSTALL_DETAILS;
  function isValidDesignSystemNamespace(namespace) {
    return typeof namespace == "string" && DESIGN_SYSTEM_NAMESPACE_PATTERN.test(namespace);
  }
  function designSystemDirectory(namespace) {
    if (!isValidDesignSystemNamespace(namespace))
      throw new DesignSystemPathError("bad_namespace", String(namespace));
    return "project/ds/" + namespace + "/";
  }
  function readInstalledDesignSystems(index4) {
    let designSystems = index4?.designSystems, entries = Array.isArray(designSystems) ? designSystems : typeof designSystems == "object" && designSystems !== null ? Object.values(designSystems) : [], systemsByNamespace = /* @__PURE__ */ new Map();
    for (let value of entries) {
      if (typeof value != "object" || value === null || Array.isArray(value))
        continue;
      let value2 = value, value3 = normalizeDesignSystemText(value2.title, DESIGN_SYSTEM_NAME_MAX_CHARS, DESIGN_SYSTEM_DESCRIPTION_CONTROL_PATTERN), value4 = normalizeDesignSystemText(value2.artifact, DESIGN_SYSTEM_DESCRIPTION_MAX_CHARS);
      !isValidDesignSystemNamespace(value2.namespace) || value3 === void 0 || value4 === void 0 || systemsByNamespace.set(value2.namespace, {
        title: value3,
        namespace: value2.namespace,
        artifact: value4,
        version: normalizeDesignSystemText(value2.version, DESIGN_SYSTEM_NAME_MAX_CHARS) ?? null,
        copiedAt: normalizeDesignSystemText(value2.copiedAt, 40) ?? "",
        ...value2.unpinned === !0 ? {
          unpinned: !0
        } : {}
      });
    }
    return [...systemsByNamespace.values()].slice(0, MAX_INSTALLED_DESIGN_SYSTEMS);
  }
  function designSystemTokensPath(namespace) {
    return designSystemDirectory(namespace) + "tokens.json";
  }
  function readInstalledDesignSystemTokens(index4, readText, availableFonts) {
    let systems = [];
    for (let value4 of readInstalledDesignSystems(index4)) {
      let value5 = readText(designSystemTokensPath(value4.namespace));
      if (!(value5 === void 0 || value5.length > DESIGN_SYSTEM_TOKENS_MAX_CHARS))
        try {
          let value6 = JSON.parse(value5);
          typeof value6 == "object" && value6 !== null && systems.push({
            title: value4.title,
            tokens: value6
          });
        } catch {
          continue;
        }
    }
    if (systems.length === 0)
      return;
    let value = typeof availableFonts == "object" && availableFonts !== null ? availableFonts : {}, callback = (input) => typeof input == "object" && input !== null, value2 = Array.isArray(value.systems) ? value.systems : value.systems === void 0 && (callback(value.color) || callback(value.type)) ? [
      {
        tokens: availableFonts
      }
    ] : void 0, value3 = Array.isArray(value2) ? value2.filter((input) => !systems.some((input2) => input2.title === input?.title)) : [];
    return {
      v: 1,
      systems: [...systems, ...value3]
    };
  }
  function createInstalledDesignSystemTracker(port, getVersion, onChange) {
    let refreshVersion = "", generation = 0, systems, currentFingerprint = "", fileCache = /* @__PURE__ */ new Map(), fontFiles = [], updateSystems = (input, options) => {
      if (options === currentFingerprint)
        return;
      currentFingerprint = options;
      let tokens = readInstalledDesignSystemTokens(input, (input2) => fileCache.get(input2)?.text), installed = [...readInstalledDesignSystems(input)];
      systems = tokens && {
        ...tokens,
        systems: tokens.systems.map((entry) => {
          let index4 = installed.findIndex((system) => system.title === entry.title && fileCache.get(designSystemTokensPath(system.namespace))?.text !== void 0), namespace = index4 >= 0 ? installed.splice(index4, 1)[0]?.namespace : void 0;
          return namespace === void 0 ? entry : {
            ...entry,
            namespace,
            fontFiles: fontFiles.filter((path) => path.startsWith("project/ds/" + namespace + "/"))
          };
        })
      }, onChange();
    };
    return {
      current: () => systems,
      refresh(input) {
        let value = readInstalledDesignSystems(input), value2 = JSON.stringify(value), value3 = (value.length === 0 ? "" : getVersion()) + "|" + value2;
        if (value3 === refreshVersion)
          return;
        refreshVersion = value3;
        let value4 = ++generation;
        if (value.length === 0) {
          fileCache.clear(), systems !== void 0 && updateSystems(input, value2);
          return;
        }
        let value5 = value.map((input2) => designSystemTokensPath(input2.namespace));
        port.list().then(async (input2) => {
          if (value4 !== generation)
            return;
          let entries = new Map(input2.map((input3) => [
            input3.path,
            input3
          ])), flag = !1;
          fontFiles = input2.map((input3) => input3.path).filter((path) => runtime2.designSystemFontPathPattern.test(path));
          for (let value6 of value5) {
            let entry = entries.get(value6), entry2 = fileCache.get(value6);
            if (entry === void 0 || entry.size > DESIGN_SYSTEM_TOKENS_MAX_CHARS)
              fileCache.set(value6, {
                sha: entry?.sha256 ?? "",
                text: void 0
              });
            else if (entry2 === void 0 || entry2.sha !== entry.sha256 || entry2.text === void 0) {
              let value7 = await port.readText(value6).then((input3) => input3.text, () => {
              });
              if (value4 !== generation)
                return;
              value7 !== void 0 ? fileCache.set(value6, {
                sha: entry.sha256,
                text: value7
              }) : (flag = !0, entry2 === void 0 && fileCache.set(value6, {
                sha: "",
                text: void 0
              }));
            }
          }
          for (let value6 of [...fileCache.keys()])
            value5.includes(value6) || fileCache.delete(value6);
          value4 === generation && (flag && (refreshVersion = ""), updateSystems(input, value2 + "|" + value5.map((input3) => (fileCache.get(input3)?.text === void 0 ? "!" : "") + (fileCache.get(input3)?.sha ?? "")).join(",") + "|" + fontFiles.join(",")));
        }).catch(() => {
          value4 === generation && (refreshVersion = "");
        });
      }
    };
  }
  return bindRuntimeValue(runtime2, "DESIGN_SYSTEM_NAMESPACE_PATTERN", () => DESIGN_SYSTEM_NAMESPACE_PATTERN, (value) => {
    DESIGN_SYSTEM_NAMESPACE_PATTERN = value;
  }), bindRuntimeValue(runtime2, "isValidDesignSystemNamespace", () => isValidDesignSystemNamespace), bindRuntimeValue(runtime2, "DesignSystemPathError", () => DesignSystemPathError, (value) => {
    DesignSystemPathError = value;
  }), bindRuntimeValue(runtime2, "designSystemDirectory", () => designSystemDirectory), bindRuntimeValue(runtime2, "MAX_INSTALLED_DESIGN_SYSTEMS", () => MAX_INSTALLED_DESIGN_SYSTEMS, (value) => {
    MAX_INSTALLED_DESIGN_SYSTEMS = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_NAME_MAX_CHARS", () => DESIGN_SYSTEM_NAME_MAX_CHARS, (value) => {
    DESIGN_SYSTEM_NAME_MAX_CHARS = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_DESCRIPTION_MAX_CHARS", () => DESIGN_SYSTEM_DESCRIPTION_MAX_CHARS, (value) => {
    DESIGN_SYSTEM_DESCRIPTION_MAX_CHARS = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_REFERENCE_MAX_CHARS", () => DESIGN_SYSTEM_REFERENCE_MAX_CHARS, (value) => {
    DESIGN_SYSTEM_REFERENCE_MAX_CHARS = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_TOKENS_MAX_CHARS", () => DESIGN_SYSTEM_TOKENS_MAX_CHARS, (value) => {
    DESIGN_SYSTEM_TOKENS_MAX_CHARS = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_PATH_SEGMENT_PATTERN", () => DESIGN_SYSTEM_PATH_SEGMENT_PATTERN, (value) => {
    DESIGN_SYSTEM_PATH_SEGMENT_PATTERN = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_PATH_PATTERN", () => DESIGN_SYSTEM_PATH_PATTERN, (value) => {
    DESIGN_SYSTEM_PATH_PATTERN = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_UNSAFE_CONTROL_PATTERN", () => DESIGN_SYSTEM_UNSAFE_CONTROL_PATTERN, (value) => {
    DESIGN_SYSTEM_UNSAFE_CONTROL_PATTERN = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_DESCRIPTION_CONTROL_PATTERN", () => DESIGN_SYSTEM_DESCRIPTION_CONTROL_PATTERN, (value) => {
    DESIGN_SYSTEM_DESCRIPTION_CONTROL_PATTERN = value;
  }), bindRuntimeValue(runtime2, "normalizeDesignSystemText", () => normalizeDesignSystemText, (value) => {
    normalizeDesignSystemText = value;
  }), bindRuntimeValue(runtime2, "readInstalledDesignSystems", () => readInstalledDesignSystems), bindRuntimeValue(runtime2, "designSystemTokensPath", () => designSystemTokensPath), bindRuntimeValue(runtime2, "readInstalledDesignSystemTokens", () => readInstalledDesignSystemTokens), bindRuntimeValue(runtime2, "ARTIFACT_UUID_PATTERN", () => ARTIFACT_UUID_PATTERN, (value) => {
    ARTIFACT_UUID_PATTERN = value;
  }), bindRuntimeValue(runtime2, "ARTIFACT_SHORT_ID_PATTERN", () => ARTIFACT_SHORT_ID_PATTERN, (value) => {
    ARTIFACT_SHORT_ID_PATTERN = value;
  }), bindRuntimeValue(runtime2, "ARTIFACT_ID_PATTERN", () => ARTIFACT_ID_PATTERN, (value) => {
    ARTIFACT_ID_PATTERN = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_ARTIFACT_URL_PATTERN", () => DESIGN_SYSTEM_ARTIFACT_URL_PATTERN, (value) => {
    DESIGN_SYSTEM_ARTIFACT_URL_PATTERN = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_ALLOWED_HOSTS", () => DESIGN_SYSTEM_ALLOWED_HOSTS, (value) => {
    DESIGN_SYSTEM_ALLOWED_HOSTS = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_UNKNOWN_HOST_MESSAGE", () => DESIGN_SYSTEM_UNKNOWN_HOST_MESSAGE, (value) => {
    DESIGN_SYSTEM_UNKNOWN_HOST_MESSAGE = value;
  }), bindRuntimeValue(runtime2, "ARTIFACT_REFERENCE_URL_PATTERN", () => ARTIFACT_REFERENCE_URL_PATTERN, (value) => {
    ARTIFACT_REFERENCE_URL_PATTERN = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_INSTALL_REJECTION_MESSAGES", () => DESIGN_SYSTEM_INSTALL_REJECTION_MESSAGES, (value) => {
    DESIGN_SYSTEM_INSTALL_REJECTION_MESSAGES = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_INSTALL_REQUEST_FILENAME", () => DESIGN_SYSTEM_INSTALL_REQUEST_FILENAME, (value) => {
    DESIGN_SYSTEM_INSTALL_REQUEST_FILENAME = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_INSTALL_COMMAND_HELP", () => DESIGN_SYSTEM_INSTALL_COMMAND_HELP, (value) => {
    DESIGN_SYSTEM_INSTALL_COMMAND_HELP = value;
  }), bindRuntimeValue(runtime2, "DESIGN_SYSTEM_INSTALL_DETAILS", () => DESIGN_SYSTEM_INSTALL_DETAILS, (value) => {
    DESIGN_SYSTEM_INSTALL_DETAILS = value;
  }), bindRuntimeValue(runtime2, "createInstalledDesignSystemTracker", () => createInstalledDesignSystemTracker), () => {
    (0, runtime2.initializeSlideModel)(), DESIGN_SYSTEM_NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/, DesignSystemPathError = class extends Error {
      code;
      subject;
      constructor(input, options) {
        super(input + ": " + JSON.stringify(options)), this.code = input, this.subject = options, this.name = "PathCheckError";
      }
    }, MAX_INSTALLED_DESIGN_SYSTEMS = 4, DESIGN_SYSTEM_NAME_MAX_CHARS = 200, DESIGN_SYSTEM_DESCRIPTION_MAX_CHARS = 2e3, DESIGN_SYSTEM_REFERENCE_MAX_CHARS = 224, DESIGN_SYSTEM_TOKENS_MAX_CHARS = 1048576, DESIGN_SYSTEM_PATH_SEGMENT_PATTERN = "[A-Za-z0-9_](?:(?:[A-Za-z0-9._-]| (?=[A-Za-z0-9_]))*[A-Za-z0-9_-])?", DESIGN_SYSTEM_PATH_PATTERN = new RegExp("^" + DESIGN_SYSTEM_PATH_SEGMENT_PATTERN + "(?:/" + DESIGN_SYSTEM_PATH_SEGMENT_PATTERN + ")*$"), DESIGN_SYSTEM_UNSAFE_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\u{e0000}-\u{e007f}]/u, DESIGN_SYSTEM_DESCRIPTION_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u061c\u2028\u2029\u202a-\u202e\u2066-\u2069\u{e0000}-\u{e007f}]/u, normalizeDesignSystemText = (value, maxChars, forbiddenPattern = DESIGN_SYSTEM_UNSAFE_CONTROL_PATTERN) => typeof value == "string" && value.trim() !== "" && value.length <= maxChars && !forbiddenPattern.test(value) ? value.trim() : void 0, ARTIFACT_UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", ARTIFACT_SHORT_ID_PATTERN = "[1-9A-HJ-NP-Za-km-z]{22}", ARTIFACT_ID_PATTERN = new RegExp("^(" + ARTIFACT_UUID_PATTERN + "|" + ARTIFACT_SHORT_ID_PATTERN + ")$"), DESIGN_SYSTEM_ARTIFACT_URL_PATTERN = new RegExp("^[hH][tT][tT][pP][sS]://([A-Za-z0-9.-]{1,253})(/code/artifact/|/artifact/|/code/frame/)(?:[A-Za-z0-9_-]*-)?(" + ARTIFACT_UUID_PATTERN + "|" + ARTIFACT_SHORT_ID_PATTERN + ")/*$"), DESIGN_SYSTEM_ALLOWED_HOSTS = {}, DESIGN_SYSTEM_UNKNOWN_HOST_MESSAGE = "The address given for the design system is on a host this tool does not know (it knows " + Object.keys(DESIGN_SYSTEM_ALLOWED_HOSTS).join(", ") + ", over https, with no port): on a local or a staging stack give the design system's bare id instead.", ARTIFACT_REFERENCE_URL_PATTERN = new RegExp("^[hH][tT][tT][pP][sS]?://[^/?#\\s]{1,260}(?:/code/artifact/|/artifact/|/code/frame/)(?:[A-Za-z0-9_-]*-)?(?:" + ARTIFACT_UUID_PATTERN + "|" + ARTIFACT_SHORT_ID_PATTERN + ")/*$"), DESIGN_SYSTEM_INSTALL_REJECTION_MESSAGES = {
      kind: "Not a kind of file an install copies yet (it copies .js, .css, .json, .d.ts and font files)",
      name: 'A folder or file name in its path that an install does not take (a name is letters, digits, ".", "_", "-" and single spaces, each space straight before a letter, a digit or "_"; it begins with a letter, a digit or "_" and does not end in "."), or ".." in it, a device name such as "con", or more than ' + String(DESIGN_SYSTEM_REFERENCE_MAX_CHARS) + " characters",
      react: "A copy of React, which the page already has",
      tool: "A name a build tool or a test runner looks for, such as package.json or x.test.js",
      disk: 'A path this install does not save to disk when the bytes are sent: a space in it, a name that begins with "_" and then anything but a letter or a digit, or, for a font that is not directly under fonts/, "..", a device name such as "con" or more than ' + String(DESIGN_SYSTEM_REFERENCE_MAX_CHARS) + " characters"
    }, DESIGN_SYSTEM_INSTALL_REQUEST_FILENAME = "ds-install.json", DESIGN_SYSTEM_INSTALL_COMMAND_HELP = "install-design-system --request " + DESIGN_SYSTEM_INSTALL_REQUEST_FILENAME + ` (a JSON file you wrote in the working directory with your file-writing tool)
The file holds exactly these keys: {"artifact": "<the system's url>", "namespace": "<its bundle global, else a plain name>", "title": "<its title>", "version": "<its version id>" or null, "files": [{"path": "<path in the system>", "size": <bytes>}, ...], "index": "<the project/canvas.json or project/deck.json you read with read_file right before this, at the path it was saved>", "held": {"files": <n>, "bytes": <n>} (what the project holds outside this system's folder), "has": ["<a path the project holds>", ...]}; artifact, namespace, title, files and index are required, and held too when a canvas is brought more than four scripts, stylesheets and JSON files, at least one of them new. Add "fromStore": true ONLY for a system that serves no files to copy, whose bytes you send.
(values that come from the design system go in that file, written with your file-writing tool, never on the command line: nothing of theirs is read by the shell)`, DESIGN_SYSTEM_INSTALL_DETAILS = `install-design-system takes nothing on the command line but --request <file>. A title, a name, a version or a path that comes from the design system is another artifact's text and must never be part of a command: write the values to a JSON file with your file-writing tool (not echo, printf or a heredoc) and pass only that file's path.
usage: ` + DESIGN_SYSTEM_INSTALL_COMMAND_HELP;
  };
}
export {
  installFilesDesignSystems
};
