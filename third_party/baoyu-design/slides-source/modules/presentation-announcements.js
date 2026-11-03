// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installPresentationAnnouncements(runtime2) {
  var ReactSlideAnnouncement, SlideAnnouncementJsx;
  function SlideNavigationAnnouncement({ slideKey, message, announceMount = !1, settleMs = 500 }) {
    let [value, value2] = ReactSlideAnnouncement.useState(""), ref = ReactSlideAnnouncement.useRef(message);
    ref.current = message;
    let ref2 = ReactSlideAnnouncement.useRef(!1);
    return ReactSlideAnnouncement.useEffect(() => {
      if (slideKey === void 0)
        return;
      let value3 = !ref2.current;
      if (ref2.current = !0, value3 && !announceMount || (value2(""), ref.current() === null))
        return;
      let value4 = setTimeout(() => {
        let value5 = ref.current();
        value5 !== null && value2(value5);
      }, settleMs);
      return () => clearTimeout(value4);
    }, [slideKey, settleMs]), SlideAnnouncementJsx.jsx("span", {
      className: "sr-only",
      role: "status",
      "aria-atomic": "true",
      children: value
    });
  }
  function formatPresentationSlideAnnouncement(index4, count, title) {
    return (0, runtime2.untranslatedMessage)( "幻灯片 ") + String(index4 + 1) + (0, runtime2.untranslatedMessage)(" / ") + String(count) + (title !== "" ? ": " + title : "");
  }
  function formatSlideOfCountAnnouncement(index4, count, title) {
    let values = {
      n: String(index4 + 1),
      count: String(count)
    };
    return title !== "" ? (0, runtime2.formatMessage)({
      defaultMessage: "第 {n} 页，共 {count} 页：{title}",
      id: "n9tDD8owmT"
    }, {
      ...values,
      title
    }) : (0, runtime2.formatMessage)({
      defaultMessage: "第 {n} 页，共 {count} 页",
      id: "6KyFm2iJ/F"
    }, values);
  }
  return bindRuntimeValue(runtime2, "ReactSlideAnnouncement", () => ReactSlideAnnouncement, (value) => {
    ReactSlideAnnouncement = value;
  }), bindRuntimeValue(runtime2, "SlideAnnouncementJsx", () => SlideAnnouncementJsx, (value) => {
    SlideAnnouncementJsx = value;
  }), bindRuntimeValue(runtime2, "SlideNavigationAnnouncement", () => SlideNavigationAnnouncement), bindRuntimeValue(runtime2, "formatPresentationSlideAnnouncement", () => formatPresentationSlideAnnouncement), bindRuntimeValue(runtime2, "formatSlideOfCountAnnouncement", () => formatSlideOfCountAnnouncement), () => {
    ReactSlideAnnouncement = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), SlideAnnouncementJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installPresentationAnnouncements
};
