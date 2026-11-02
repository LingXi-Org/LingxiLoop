// Reconstructed from JimLiu/baoyu-design c15e76e (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installDocumentsRemovedSlides(runtime2) {
  function preserveRecentlyRemovedSlides(options) {
    let isRecentlyAdded = (input) => options.now - (options.added.get(input) ?? -1 / 0) <= 3e5, recentlyRemoved = options.before.order.every(isRecentlyAdded) ? options.before.slides.filter((input) => !options.order.includes(input.id)) : [], limbo = options.limbo.filter((input) => options.now - input.at <= 18e4 && !recentlyRemoved.some((input2) => input2.id === input.slide.id));
    return options.order.some((input) => !options.before.order.includes(input)) ? {
      back: [...limbo.map((input) => input.slide), ...recentlyRemoved].filter((input) => !options.order.includes(input.id)),
      limbo: []
    } : options.awaiting ? {
      back: [],
      limbo: [
        ...limbo,
        ...options.wasAwaiting ? [] : recentlyRemoved.map((input) => ({
          slide: input,
          at: options.now
        }))
      ]
    } : {
      back: [],
      limbo: []
    };
  }
  return bindRuntimeValue(runtime2, "preserveRecentlyRemovedSlides", () => preserveRecentlyRemovedSlides), () => {
    (0, runtime2.initializeSlideModel)(), (0, runtime2.initializeSections)();
  };
}
export {
  installDocumentsRemovedSlides
};
