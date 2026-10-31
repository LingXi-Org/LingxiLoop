// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installEnvironmentI18n(runtime2) {
  var LOCALE_FALLBACKS, intlFormatterCache, TAG_NAME_PATTERN, PLURAL_SELECTOR_PATTERN, parsedMessageCache, SOURCE_MESSAGE_LOCALE, sourceMessageFormatter, LANGUAGE_TAG_PATTERN, RTL_SCRIPTS, I18N_GLOBAL_KEY, LOCALE_MATCHING, pageMessages, activeMessageFormatter, designKitI18n, isPlainObject, messageValues;
  class MessageFormatError extends Error {
    messageId;
    reason;
    constructor(messageId, reason, cause) {
      super(String(cause instanceof Error ? cause.message : cause)), this.messageId = messageId, this.reason = reason, this.name = "MessageFormatError";
    }
  }
  class IcuMessageParser {
    s;
    i = 0;
    constructor(message) {
      this.s = message;
    }
    parseMessage() {
      let nodes = this.nodes(!1, null);
      if (this.i < this.s.length)
        throw this.error("unexpected '" + this.s[this.i] + "'");
      return nodes;
    }
    error(message) {
      return SyntaxError(message + " at " + String(this.i));
    }
    nodes(inPlural, closingTag) {
      let nodes = [], text = "", flush = () => {
        text && nodes.push(text), text = "";
      }, source = this.s;
      for (; this.i < source.length; ) {
        let char = source[this.i];
        if (char === "'") {
          let next = source[this.i + 1];
          if (next === "'")
            text += "'", this.i += 2;
          else if (next === "{" || next === "}" || next === "<" || next === ">" || inPlural && next === "#")
            for (this.i += 1; this.i < source.length; )
              if (source[this.i] === "'")
                if (source[this.i + 1] === "'")
                  text += "'", this.i += 2;
                else {
                  this.i += 1;
                  break;
                }
              else
                text += source[this.i], this.i += 1;
          else
            text += "'", this.i += 1;
        } else if (char === "{")
          flush(), nodes.push(this.argument(inPlural));
        else {
          if (char === "}")
            break;
          if (char === "#" && inPlural)
            flush(), nodes.push({
              t: "pound"
            }), this.i += 1;
          else if (char === "<" && source[this.i + 1] === "/") {
            let name = TAG_NAME_PATTERN.exec(source.slice(this.i + 2))?.[0];
            if (name === void 0)
              text += char, this.i += 1;
            else if (closingTag !== null && name === closingTag) {
              if (this.i += 2 + name.length, this.ws(), source[this.i] !== ">")
                throw this.error("expected '>'");
              return this.i += 1, flush(), nodes;
            } else
              throw this.error("unexpected closing tag </" + name + ">");
          } else if (char === "<") {
            let name = TAG_NAME_PATTERN.exec(source.slice(this.i + 1))?.[0];
            if (name === void 0)
              text += char, this.i += 1;
            else if (flush(), this.i += 1 + name.length, this.ws(), source[this.i] === "/" && source[this.i + 1] === ">")
              this.i += 2, nodes.push({
                t: "tag",
                n: name,
                c: []
              });
            else {
              if (source[this.i] !== ">")
                throw this.error("expected '>'");
              this.i += 1, nodes.push({
                t: "tag",
                n: name,
                c: this.nodes(inPlural, name)
              });
            }
          } else
            text += char, this.i += 1;
        }
      }
      if (closingTag !== null)
        throw this.error("unclosed tag <" + closingTag + ">");
      return flush(), nodes;
    }
    ws() {
      for (; this.i < this.s.length && /\s/.test(this.s.charAt(this.i)); )
        this.i += 1;
    }
    word() {
      let start = this.i;
      for (; this.i < this.s.length && !/[\s,{}]/.test(this.s.charAt(this.i)); )
        this.i += 1;
      return this.s.slice(start, this.i);
    }
    expect(char) {
      if (this.s[this.i] !== char)
        throw this.error("expected '" + char + "'");
      this.i += 1;
    }
    argument(inPlural) {
      this.expect("{"), this.ws();
      let name = this.word();
      if (!name)
        throw this.error("expected argument name");
      if (this.ws(), this.s[this.i] === "}")
        return this.i += 1, {
          t: "arg",
          n: name
        };
      this.expect(","), this.ws();
      let type = this.word();
      switch (this.ws(), type) {
        case "number":
        case "date":
        case "time": {
          let style = "";
          if (this.s[this.i] === ",") {
            this.i += 1, this.ws();
            let start = this.i;
            for (; this.i < this.s.length && this.s[this.i] !== "}"; )
              this.i += 1;
            if (style = this.s.slice(start, this.i).trim(), !style)
              throw this.error("expected argument style");
          }
          return this.expect("}"), {
            t: type,
            n: name,
            style
          };
        }
        case "plural":
        case "selectordinal":
        case "select": {
          this.expect(","), this.ws();
          let offset4 = 0, plural = type !== "select";
          if (plural && this.s.startsWith("offset:", this.i)) {
            this.i += 7, this.ws();
            let word = this.word();
            if (offset4 = Number(word), !word || !Number.isInteger(offset4))
              throw this.error("bad offset");
            this.ws();
          }
          let options = {};
          for (; this.i < this.s.length && this.s[this.i] !== "}"; ) {
            let selector = this.word();
            if (!selector)
              throw this.error("expected selector");
            if (plural && !PLURAL_SELECTOR_PATTERN.test(selector))
              throw this.error("bad plural selector '" + selector + "'");
            this.ws(), this.expect("{"), options[selector] = this.nodes(plural || inPlural, null), this.expect("}"), this.ws();
          }
          if (this.expect("}"), !Object.hasOwn(options, "other"))
            throw this.error("missing 'other'");
          return plural ? {
            t: "plural",
            n: name,
            ordinal: type === "selectordinal",
            offset: offset4,
            o: options
          } : {
            t: "select",
            n: name,
            o: options
          };
        }
        default:
          throw this.error("unknown argument type '" + type + "'");
      }
    }
  }
  function supportedIntlLocale(kind, locale) {
    let dash = locale.indexOf("-"), language = (dash < 0 ? locale : locale.slice(0, dash)).toLowerCase(), fallback = Object.hasOwn(LOCALE_FALLBACKS, language) ? LOCALE_FALLBACKS[language] : void 0;
    if (fallback === void 0)
      return locale;
    let constructor = Intl[kind];
    try {
      if (constructor === void 0 || constructor.supportedLocalesOf([locale]).length > 0)
        return locale;
    } catch {
      return locale;
    }
    return kind === "PluralRules" && fallback.plural !== void 0 ? fallback.plural : fallback.locale;
  }
  function cachedIntlFormatter(kind, locale, options = {}) {
    let key = kind + "\0" + locale + "\0" + JSON.stringify(options), formatter = intlFormatterCache.get(key);
    return formatter === void 0 && (formatter = createIntlFormatter(kind, locale, options), intlFormatterCache.set(key, formatter)), formatter;
  }
  function createIntlFormatter(kind, locale, options) {
    switch (kind) {
      case "number":
        return new Intl.NumberFormat(supportedIntlLocale("NumberFormat", locale), options);
      case "datetime":
        return new Intl.DateTimeFormat(supportedIntlLocale("DateTimeFormat", locale), options);
      case "plural":
        return new Intl.PluralRules(supportedIntlLocale("PluralRules", locale), options);
      case "list":
        return new Intl.ListFormat(supportedIntlLocale("ListFormat", locale), options);
      default:
        return new Intl.RelativeTimeFormat(supportedIntlLocale("RelativeTimeFormat", locale), options);
    }
  }
  function parseIcuMessage(message) {
    let nodes = parsedMessageCache.get(message);
    return nodes === void 0 && (nodes = new IcuMessageParser(message).parseMessage(), parsedMessageCache.set(message, nodes)), nodes;
  }
  function numberFormatOptions(style) {
    switch (style) {
      case "":
        return {};
      case "integer":
        return {
          maximumFractionDigits: 0
        };
      case "percent":
      case "::percent":
        return {
          style: "percent"
        };
      default:
        throw RangeError("unsupported number style '" + style + "'");
    }
  }
  function dateTimeFormatOptions(type, style) {
    let resolved = style === "" ? "medium" : style;
    if (resolved !== "short" && resolved !== "medium" && resolved !== "long" && resolved !== "full")
      throw RangeError("unsupported " + type + " style '" + style + "'");
    return type === "date" ? {
      dateStyle: resolved
    } : {
      timeStyle: resolved
    };
  }
  function formatIcuNodes(nodes, values, locale, plural, out) {
    for (let node of nodes) {
      if (typeof node == "string") {
        appendFormattedPart(out, node);
        continue;
      }
      if (node.t === "pound") {
        if (plural === null)
          throw RangeError("# outside plural");
        appendFormattedPart(out, cachedIntlFormatter("number", locale).format(plural.value));
        continue;
      }
      if (node.t === "tag") {
        let formatter = values[node.n];
        if (typeof formatter != "function")
          throw RangeError("no function for <" + node.n + ">");
        let children = [];
        formatIcuNodes(node.c, values, locale, plural, children), appendFormattedPart(out, formatter(children));
        continue;
      }
      if (!Object.hasOwn(values, node.n))
        throw RangeError("no value for {" + node.n + "}");
      let value = values[node.n];
      if (typeof value == "function")
        throw RangeError("{" + node.n + "} was given a tag formatter");
      switch (node.t) {
        case "arg":
          appendFormattedPart(out, typeof value == "string" ? value : isPlainMessageValue(value) ? typeof value == "number" || value instanceof Date ? String(value) : "" : value);
          break;
        case "number":
          appendFormattedPart(out, cachedIntlFormatter("number", locale, numberFormatOptions(node.style)).format(Number(value)));
          break;
        case "date":
        case "time":
          appendFormattedPart(out, cachedIntlFormatter("datetime", locale, dateTimeFormatOptions(node.t, node.style)).format(value instanceof Date ? value : Number(value)));
          break;
        case "plural": {
          let count = Number(value);
          if (!Number.isFinite(count))
            throw RangeError("{" + node.n + "} is not a number");
          let branch = ownOption(node.o, "=" + String(count)) ?? ownOption(node.o, cachedIntlFormatter("plural", locale, {
            type: node.ordinal ? "ordinal" : "cardinal"
          }).select(count - node.offset)) ?? ownOption(node.o, "other") ?? [];
          formatIcuNodes(branch, values, locale, {
            value: count - node.offset
          }, out);
          break;
        }
        case "select": {
          let branch = ownOption(node.o, String(value)) ?? ownOption(node.o, "other") ?? [];
          formatIcuNodes(branch, values, locale, plural, out);
          break;
        }
      }
    }
  }
  function ownOption(options, key) {
    if (Object.hasOwn(options, key))
      return options[key];
  }
  function isPlainMessageValue(value) {
    return value === null || typeof value != "object" ? typeof value != "function" : value instanceof Date;
  }
  function appendFormattedPart(out, part) {
    let last = out.length - 1;
    typeof part == "string" && typeof out[last] == "string" ? out[last] = out[last] + part : part !== "" && out.push(part);
  }
  function formatIcuMessage(message, values, locale) {
    let out = [];
    return formatIcuNodes(parseIcuMessage(message), values ?? {}, locale, null, out), out.length === 0 ? "" : out.length === 1 && typeof out[0] == "string" ? out[0] : out.every((part) => typeof part == "string") ? out.join("") : out;
  }
  function createMessageFormatter(options) {
    let { locale, messages, onError, onFormat } = options, reported = /* @__PURE__ */ new Set(), report = (id, reason, cause) => {
      onError === void 0 || reported.has(id + reason) || (reported.add(id + reason), onError(new MessageFormatError(id, reason, cause)));
    };
    function formatMessage2(descriptor, values) {
      onFormat?.(descriptor);
      let translated = messages[descriptor.id];
      if (typeof translated == "string" && translated !== "")
        try {
          return formatIcuMessage(translated, values, locale);
        } catch (error) {
          report(descriptor.id, error instanceof SyntaxError ? "parse" : "format", error);
        }
      try {
        return formatIcuMessage(descriptor.defaultMessage, values, SOURCE_MESSAGE_LOCALE);
      } catch (error) {
        return report(descriptor.id, error instanceof SyntaxError ? "parse" : "format", error), descriptor.defaultMessage;
      }
    }
    return {
      locale,
      messages,
      formatMessage: formatMessage2,
      formatNumber: (value, numberOptions) => cachedIntlFormatter("number", locale, numberOptions).format(value),
      formatDate: (value, dateOptions) => cachedIntlFormatter("datetime", locale, dateOptions).format(value),
      formatRelativeTime: (value, unit, relativeOptions) => cachedIntlFormatter("relative", locale, relativeOptions).format(value, unit),
      formatList: (items, listOptions) => {
        try {
          return cachedIntlFormatter("list", locale, listOptions).format(items);
        } catch {
          return items.join(", ");
        }
      }
    };
  }
  function isMessageLanguageTag(value) {
    if (typeof value != "string" || !LANGUAGE_TAG_PATTERN.test(value))
      return !1;
    try {
      return Intl.getCanonicalLocales(value), !0;
    } catch {
      return !1;
    }
  }
  function sameLanguageAndScript(left, right) {
    try {
      let [a, b] = [new Intl.Locale(left).maximize(), new Intl.Locale(right).maximize()];
      return a.language === b.language && a.script === b.script;
    } catch {
      return !1;
    }
  }
  function resolveFormattingLocale(language, browserLanguages, matching) {
    return (matching === "browser-region" ? browserLanguages.find((candidate) => sameLanguageAndScript(candidate, language)) : void 0) ?? language;
  }
  function isRightToLeftLanguage(language) {
    try {
      let { script: script2 } = new Intl.Locale(language).maximize();
      return script2 !== void 0 && RTL_SCRIPTS.has(script2);
    } catch {
      return !1;
    }
  }
  function formattingLocale() {
    return pageMessages && resolveFormattingLocale(pageMessages.lang, typeof navigator > "u" ? [] : navigator.languages, LOCALE_MATCHING);
  }
  function installPageMessages(input) {
    if (!isPlainObject(input) || !isMessageLanguageTag(input.lang) || !isPlainObject(input.words))
      return;
    let words = Object.values(input.words);
    if (words.length === 0 || words.some((word) => typeof word != "string"))
      return;
    pageMessages = {
      lang: input.lang,
      words: input.words
    };
    let { lang } = pageMessages;
    activeMessageFormatter = createMessageFormatter({
      locale: formattingLocale() ?? lang,
      messages: pageMessages.words,
      onError: (error) => console.warn("[i18n] message " + error.messageId + " could not be " + (error.reason === "parse" ? "parsed" : "formatted") + " (page language " + lang + "): " + error.message)
    });
    let direction = pageTextDirection();
    designKitI18n = {
      locale: intlLocale("DateTimeFormat", void 0),
      ...direction && {
        direction
      },
      labels: (key, defaultMessage, values) => {
        let descriptor = {
          id: "cds." + key,
          defaultMessage
        };
        if (Object.hasOwn(activeMessageFormatter.messages, descriptor.id))
          return activeMessageFormatter.formatMessage(descriptor, messageValues(values));
      }
    };
  }
  function readPageMessages() {
    try {
      let { lang, settled } = globalThis[I18N_GLOBAL_KEY];
      installPageMessages({
        lang,
        words: settled
      });
    } catch {
    }
  }
  function pageTextDirection() {
    if (pageMessages !== void 0 && isRightToLeftLanguage(pageMessages.lang))
      return "rtl";
  }
  function formatMessage(descriptor, values) {
    return activeMessageFormatter.formatMessage(descriptor, messageValues(values));
  }
  function untranslatedMessage(text) {
    return text;
  }
  function literalMessage(text) {
    return text;
  }
  function intlLocale(kind, fallback) {
    let locale = formattingLocale();
    return locale === void 0 ? fallback : kind === "Collator" || kind === "Segmenter" ? locale : supportedIntlLocale(kind, locale);
  }
  return bindRuntimeValue(runtime2, "formatMessage", () => formatMessage), bindRuntimeValue(runtime2, "untranslatedMessage", () => untranslatedMessage), bindRuntimeValue(runtime2, "literalMessage", () => literalMessage), bindRuntimeValue(runtime2, "intlLocale", () => intlLocale), bindRuntimeValue(runtime2, "createMessageFormatter", () => createMessageFormatter), bindRuntimeValue(runtime2, "formatIcuMessage", () => formatIcuMessage), bindRuntimeValue(runtime2, "parseIcuMessage", () => parseIcuMessage), bindRuntimeValue(runtime2, "supportedIntlLocale", () => supportedIntlLocale), bindRuntimeValue(runtime2, "cachedIntlFormatter", () => cachedIntlFormatter), bindRuntimeValue(runtime2, "isMessageLanguageTag", () => isMessageLanguageTag), bindRuntimeValue(runtime2, "isRightToLeftLanguage", () => isRightToLeftLanguage), bindRuntimeValue(runtime2, "resolveFormattingLocale", () => resolveFormattingLocale), bindRuntimeValue(runtime2, "installPageMessages", () => installPageMessages), bindRuntimeValue(runtime2, "readPageMessages", () => readPageMessages), bindRuntimeValue(runtime2, "pageTextDirection", () => pageTextDirection), bindRuntimeValue(runtime2, "formattingLocale", () => formattingLocale), bindRuntimeValue(runtime2, "designKitI18n", () => designKitI18n), bindRuntimeValue(runtime2, "SOURCE_MESSAGE_LOCALE", () => SOURCE_MESSAGE_LOCALE), bindRuntimeValue(runtime2, "I18N_GLOBAL_KEY", () => I18N_GLOBAL_KEY), bindRuntimeValue(runtime2, "MessageFormatError", () => MessageFormatError), () => {
    LOCALE_FALLBACKS = {
      bho: {
        locale: "hi"
      },
      ha: {
        locale: "en-NG"
      },
      ig: {
        locale: "en-NG"
      },
      ny: {
        locale: "en-MW"
      },
      om: {
        locale: "en-KE"
      },
      rn: {
        locale: "fr-BI",
        plural: "en"
      },
      rw: {
        locale: "en-RW"
      },
      so: {
        locale: "en-KE"
      },
      wo: {
        locale: "fr-SN"
      },
      yo: {
        locale: "en-NG"
      }
    }, intlFormatterCache = /* @__PURE__ */ new Map(), TAG_NAME_PATTERN = /^[A-Za-z][\w.-]*/, PLURAL_SELECTOR_PATTERN = /^(?:=\d+|zero|one|two|few|many|other)$/, parsedMessageCache = /* @__PURE__ */ new Map(), SOURCE_MESSAGE_LOCALE = "zh-CN", sourceMessageFormatter = createMessageFormatter({
      locale: SOURCE_MESSAGE_LOCALE,
      messages: {}
    }), LANGUAGE_TAG_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,3}$/, RTL_SCRIPTS = /* @__PURE__ */ new Set([
      "Adlm",
      "Arab",
      "Hebr",
      "Mand",
      "Mend",
      "Nkoo",
      "Rohg",
      "Samr",
      "Syrc",
      "Thaa"
    ]), I18N_GLOBAL_KEY = "__appifact_i18n", LOCALE_MATCHING = "tag", pageMessages = void 0, activeMessageFormatter = sourceMessageFormatter, designKitI18n = {}, isPlainObject = (value) => typeof value == "object" && value !== null && !Array.isArray(value), messageValues = (values) => Object.assign(/* @__PURE__ */ Object.create(null), values), readPageMessages();
  };
}
export {
  installEnvironmentI18n
};
