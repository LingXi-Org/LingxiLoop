// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
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
    return "幻灯片 " + String(index4 + 1) + " / " + String(count) + (title !== "" ? ": " + title : "");
  }
  return bindRuntimeValue(runtime2, "ReactSlideAnnouncement", () => ReactSlideAnnouncement, (value) => {
    ReactSlideAnnouncement = value;
  }), bindRuntimeValue(runtime2, "SlideAnnouncementJsx", () => SlideAnnouncementJsx, (value) => {
    SlideAnnouncementJsx = value;
  }), bindRuntimeValue(runtime2, "SlideNavigationAnnouncement", () => SlideNavigationAnnouncement), bindRuntimeValue(runtime2, "formatPresentationSlideAnnouncement", () => formatPresentationSlideAnnouncement), () => {
    ReactSlideAnnouncement = (0, runtime2.toModuleNamespace)((0, runtime2.loadReactNamespace)(), 1), SlideAnnouncementJsx = (0, runtime2.toModuleNamespace)((0, runtime2.loadJsxNamespace)(), 1);
  };
}
export {
  installPresentationAnnouncements
};
