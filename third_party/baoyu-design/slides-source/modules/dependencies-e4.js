// Reconstructed from baoyu-design c15e76e (MIT). See ../README.md and source-map.json.
import { gC, qM, JM, rP, rI, iI, RI, GL, tO, SO, LO, UO, KO, $O, M3, aD, lD, oD, nD, Lc, ZS, vD, AD, hF, pF, mF, q5, Zf, IF, Vl, tf, Ks, Oc, LF, Xi, v6, h6, UM } from "../support.js";
function registerDependenciesE4(runtime) {
  runtime.loadReactNamespace = () => gC, runtime.loadReactDomNamespace = () => qM, runtime.loadJsxNamespace = () => JM, runtime.loadReactDomClientNamespace = () => rP, runtime.baseMenu = rI, runtime.baseContextMenu = iI, runtime.basePopover = RI, runtime.baseCombobox = GL, runtime.baseTooltip = tO, runtime.baseCollapsible = SO, runtime.baseField = LO, runtime.baseDialog = UO, runtime.baseAlertDialog = KO, runtime.baseRadio = $O, runtime.baseTabs = M3, runtime.baseToast = aD, runtime.baseRadioGroup = lD, runtime.baseButton = oD, runtime.baseUseRender = nD, runtime.baseMergeProps = Lc, runtime.baseLabelableProvider = ZS, runtime.baseCheckbox = vD, runtime.baseSwitch = AD, runtime.baseNumberField = hF, runtime.baseFieldsetRoot = pF, runtime.baseMenubar = mF, runtime.baseDirectionProvider = q5, runtime.baseUseDirection = Zf, runtime.basePreviewCard = IF, runtime.baseCreateChangeEventDetails = Vl, runtime.baseCreateGenericEventDetails = tf, runtime.baseUseFieldRootContext = Ks, runtime.baseUseLabelableContext = Oc, runtime.cva = LF, runtime.clsx = Xi, runtime.extendTailwindMerge = v6, runtime.validators = h6, runtime.loadPptx = async () => {
    runtime.PptxPresentation ??= (await import("../vendor/pptx-library.js")).default;
  }, runtime.PPTX_EMU = 914400, runtime.initializeNpmDependency = () => {
  }, runtime.decompressWoff2 = async (t) => (await UM(async () => {
    const { default: r } = await import("../vendor/woff2-decoder.js");
    return { default: r };
  }, [], import.meta.url)).default(t);
}
export {
  registerDependenciesE4
};
