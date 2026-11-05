import { ViewerFormatError } from "@/components/retab/lib/viewer-errors";

export function toPdfRenderFailedError(error: unknown) {
  return new ViewerFormatError({
    format: "pdf",
    kind: "render_failed",
    message: "无法显示 PDF 页面。",
    cause: error,
  });
}
