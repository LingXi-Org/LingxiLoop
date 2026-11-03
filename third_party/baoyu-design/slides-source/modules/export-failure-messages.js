// Reconstructed from JimLiu/baoyu-design 016b39d (MIT); see ../README.md.
import { bindRuntimeValue } from "../module-helpers.js";
function installExportFailureMessages(runtime2) {
  var genericFailureReason;
  function exportFailureReason(error) {
    if (error instanceof runtime2.ImageProblem)
      return imageProblemReason(error);
    if (!(error instanceof runtime2.CodedFailure))
      return genericFailureReason();
    let values = {
      place: error.slide === void 0 ? "none" : error.notesPage ? "notes" : "slide",
      n: String(error.slide ?? "")
    };
    switch (error.kind) {
      case "timed_out":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{place, select, slide {第 {n} 页：渲染幻灯片超时} notes {第 {n} 页的备注页：渲染幻灯片超时} other {渲染幻灯片超时}}",
          id: "wCKVn0NwOS"
        }, values);
      case "unrendered":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{place, select, slide {第 {n} 页：无法渲染幻灯片} notes {第 {n} 页的备注页：无法渲染幻灯片} other {无法渲染幻灯片}}",
          id: "XNju6jAfhN"
        }, values);
      case "no_canvas":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{place, select, slide {第 {n} 页：此浏览器无法绘制幻灯片} notes {第 {n} 页的备注页：此浏览器无法绘制幻灯片} other {此浏览器无法绘制幻灯片}}",
          id: "KFk3L8aIzR"
        }, values);
      case "embedded_content":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{place, select, slide {第 {n} 页：幻灯片包含无法导出的内容（嵌入的网页内容）} notes {第 {n} 页的备注页：幻灯片包含无法导出的内容（嵌入的网页内容）} other {幻灯片包含无法导出的内容（嵌入的网页内容）}}",
          id: "iCKTF/xfPP"
        }, values);
      case "no_encoder":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{place, select, slide {第 {n} 页：此浏览器无法将幻灯片编码为 {format}} notes {第 {n} 页的备注页：此浏览器无法将幻灯片编码为 {format}} other {此浏览器无法将幻灯片编码为 {format}}}",
          id: "o7bZH9hRAG"
        }, {
          ...values,
          format: error.detail ?? ""
        });
      case "other":
        return (0, runtime2.formatMessage)({
          defaultMessage: "{place, select, slide {第 {n} 页：出现问题，请重试。} notes {第 {n} 页的备注页：出现问题，请重试。} other {出现问题，请重试。}}",
          id: "B4WbQSULrK"
        }, values);
      case "no_slide":
        return (0, runtime2.formatMessage)({
          defaultMessage: "没有可导出的幻灯片",
          id: "lQ6ivkYpK6"
        });
      case "asset_limit":
        return (0, runtime2.formatMessage)({
          defaultMessage: "此演示文稿中的图片已达上限",
          id: "Pl2Q5msYsN"
        });
      case "asset_type":
        return (0, runtime2.formatMessage)({
          defaultMessage: "此文件不是幻灯片可用的图片",
          id: "N/lAyu4jjs"
        });
    }
  }
  function imageProblemReason(problem) {
    switch (problem.kind) {
      case "svg_embedded":
        return (0, runtime2.formatMessage)({
          defaultMessage: "此 SVG 使用了无法导入的功能（嵌入的网页内容）",
          id: "I4lFZVBHqw"
        });
      case "svg_undecodable":
        return (0, runtime2.formatMessage)({
          defaultMessage: "无法将此 SVG 解码为图片",
          id: "19VsBD6jIL"
        });
      case "svg_timeout":
        return (0, runtime2.formatMessage)({
          defaultMessage: "读取 SVG 超时",
          id: "vzVvB9WVF7"
        });
      case "no_canvas":
        return (0, runtime2.formatMessage)({
          defaultMessage: "此浏览器无法绘制该图片",
          id: "w/8+f07Qse"
        });
      case "no_fit":
        return (0, runtime2.formatMessage)({
          defaultMessage: "图片过大，无法在此添加",
          id: "TI8D3cuLzG"
        });
    }
  }
  return bindRuntimeValue(runtime2, "exportFailureReason", () => exportFailureReason), bindRuntimeValue(runtime2, "imageProblemReason", () => imageProblemReason), bindRuntimeValue(runtime2, "genericFailureReason", () => genericFailureReason, (value) => {
    genericFailureReason = value;
  }), () => {
    genericFailureReason = () => exportFailureReason(new runtime2.CodedFailure("other", ""));
  };
}
export {
  installExportFailureMessages
};
