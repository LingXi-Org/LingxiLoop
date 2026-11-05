export type ViewerFormat =
  | "pdf"
  | "image"
  | "text"
  | "csv"
  | "docx"
  | "xlsx"
  | "pptx"
  | "file";

export type ViewerErrorDomain =
  | "resource"
  | "format"
  | "state"
  | "unsupported"
  | "unknown";

export type ResourceErrorKind =
  | "fetch_failed"
  | "http_error"
  | "aborted"
  | "invalid_range"
  | "partial_content"
  | "too_large"
  | "unsupported_capability"
  | "unknown";

export type ResourceTooLargeReason = "bytes" | "lines";

export class ResourceError extends Error {
  readonly domain = "resource";
  readonly kind: ResourceErrorKind;
  readonly status?: number;
  readonly tooLargeReason?: ResourceTooLargeReason;
  override readonly cause?: unknown;

  constructor({
    kind,
    message,
    status,
    tooLargeReason,
    cause,
  }: {
    kind: ResourceErrorKind;
    message: string;
    status?: number;
    tooLargeReason?: ResourceTooLargeReason;
    cause?: unknown;
  }) {
    super(message);
    this.name = "ResourceError";
    this.kind = kind;
    this.status = status;
    this.tooLargeReason = tooLargeReason;
    this.cause = cause;
  }
}

export type ViewerFormatErrorKind =
  | "bounds"
  | "decode_failed"
  | "disposed"
  | "index_out_of_range"
  | "load_failed"
  | "parse_failed"
  | "render_failed"
  | "worker_failed"
  | "unknown";

export interface ViewerFormatErrorMapperOptions {
  kind: ViewerFormatErrorKind;
  message: string;
}

export class ViewerFormatError extends Error {
  readonly domain = "format";
  readonly format: ViewerFormat;
  readonly kind: ViewerFormatErrorKind;
  override readonly cause?: unknown;

  constructor({
    format,
    kind,
    message,
    cause,
  }: {
    format: ViewerFormat;
    kind: ViewerFormatErrorKind;
    message: string;
    cause?: unknown;
  }) {
    super(message);
    this.name = "ViewerFormatError";
    this.format = format;
    this.kind = kind;
    this.cause = cause;
  }
}

export type ViewerStateErrorKind =
  | "invalid_bounds"
  | "invalid_target"
  | "out_of_range"
  | "stale_resource"
  | "unknown";

export class ViewerStateError extends Error {
  readonly domain = "state";
  readonly format?: ViewerFormat;
  readonly kind: ViewerStateErrorKind;
  override readonly cause?: unknown;

  constructor({
    format,
    kind,
    message,
    cause,
  }: {
    format?: ViewerFormat;
    kind: ViewerStateErrorKind;
    message: string;
    cause?: unknown;
  }) {
    super(message);
    this.name = "ViewerStateError";
    this.format = format;
    this.kind = kind;
    this.cause = cause;
  }
}

export class ViewerUnsupportedError extends Error {
  readonly domain = "unsupported";
  readonly format?: ViewerFormat;
  readonly sourceKind?: string;
  override readonly cause?: unknown;

  constructor({
    format,
    sourceKind,
    message,
    cause,
  }: {
    format?: ViewerFormat;
    sourceKind?: string;
    message: string;
    cause?: unknown;
  }) {
    super(message);
    this.name = "ViewerUnsupportedError";
    this.format = format;
    this.sourceKind = sourceKind;
    this.cause = cause;
  }
}

export interface ViewerErrorInfo {
  domain: ViewerErrorDomain;
  format?: ViewerFormat;
  kind: string;
  message: string;
  status?: number;
  isRetryable: boolean;
  isDownloadUseful: boolean;
  userMessage: string;
  cause?: unknown;
}

export interface ViewerErrorContext {
  format?: ViewerFormat;
  sourceKind?: "url" | "blob" | "text";
  canDownload?: boolean;
  retry?: "auto" | "always" | "never";
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function isResourceError(error: unknown): error is ResourceError {
  return (
    error instanceof ResourceError ||
    isErrorLike(error, "ResourceError", "resource")
  );
}

export function isViewerFormatError(
  error: unknown,
): error is ViewerFormatError {
  return (
    error instanceof ViewerFormatError ||
    isErrorLike(error, "ViewerFormatError", "format")
  );
}

export function isViewerStateError(error: unknown): error is ViewerStateError {
  return (
    error instanceof ViewerStateError ||
    isErrorLike(error, "ViewerStateError", "state")
  );
}

export function isViewerUnsupportedError(
  error: unknown,
): error is ViewerUnsupportedError {
  return (
    error instanceof ViewerUnsupportedError ||
    isErrorLike(error, "ViewerUnsupportedError", "unsupported")
  );
}

export function toViewerErrorInfo(
  error: unknown,
  context: ViewerErrorContext = {},
): ViewerErrorInfo {
  const canDownload = context.canDownload ?? true;

  if (isResourceError(error)) {
    return {
      domain: "resource",
      format: context.format,
      kind: error.kind,
      message: error.message,
      status: error.status,
      isRetryable: retryable(
        context,
        resourceErrorDefaultRetry(error, context),
      ),
      isDownloadUseful: canDownload && error.kind !== "aborted",
      userMessage: resourceErrorUserMessage(error),
      cause: error.cause,
    };
  }

  if (isViewerFormatError(error)) {
    const format = error.format ?? context.format;
    return {
      domain: "format",
      format,
      kind: error.kind,
      message: error.message,
      isRetryable: retryable(
        context,
        formatErrorDefaultRetry(error, context, format),
      ),
      isDownloadUseful: canDownload,
      userMessage: formatErrorUserMessage(format, error.kind, error),
      cause: error.cause,
    };
  }

  if (isViewerStateError(error)) {
    return {
      domain: "state",
      format: error.format ?? context.format,
      kind: error.kind,
      message: error.message,
      isRetryable: retryable(context, false),
      isDownloadUseful: canDownload,
      userMessage: stateErrorUserMessage(error.kind),
      cause: error.cause,
    };
  }

  if (isViewerUnsupportedError(error)) {
    return {
      domain: "unsupported",
      format: error.format ?? context.format,
      kind: "unsupported",
      message: error.message,
      isRetryable: retryable(context, false),
      isDownloadUseful: canDownload,
      userMessage: "此文件暂不支持预览。",
      cause: error.cause,
    };
  }

  if (isAbortError(error)) {
    return {
      domain: "resource",
      format: context.format,
      kind: "aborted",
      message: "加载已取消。",
      isRetryable: retryable(context, false),
      isDownloadUseful: false,
      userMessage: "加载已取消。",
      cause: error,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    domain: "unknown",
    format: context.format,
    kind: "unknown",
    message,
    isRetryable: retryable(context, unknownErrorDefaultRetry(context)),
    isDownloadUseful: canDownload,
    userMessage: fallbackUserMessage(context.format),
    cause: error,
  };
}

function isErrorLike(error: unknown, name: string, domain: ViewerErrorDomain) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    domain?: unknown;
    kind?: unknown;
  };
  return (
    (candidate.name === name || candidate.domain === domain) &&
    typeof candidate.kind === "string"
  );
}

function retryable(context: ViewerErrorContext, fallback: boolean) {
  if (context.retry === "always") return true;
  if (context.retry === "never") return false;
  return fallback;
}

function resourceErrorDefaultRetry(
  error: ResourceError,
  context: ViewerErrorContext,
) {
  if (error.kind === "aborted") return false;
  if (error.kind === "invalid_range") return false;
  if (error.kind === "too_large") return false;
  if (error.kind === "unsupported_capability") return false;
  return context.sourceKind === "url";
}

function formatErrorDefaultRetry(
  error: ViewerFormatError,
  context: ViewerErrorContext,
  format: ViewerFormat | undefined,
) {
  if (format === "text" && error.kind === "bounds") return false;
  if (error.kind === "disposed") return false;
  if (error.kind === "index_out_of_range") return false;
  if (format === "docx") return true;
  return context.sourceKind === "url";
}

function unknownErrorDefaultRetry(context: ViewerErrorContext) {
  if (context.format === "docx") return true;
  return context.sourceKind === "url";
}

function resourceErrorUserMessage(error: ResourceError) {
  if (error.kind === "http_error") {
    return error.status
      ? `无法加载文件（状态码 ${error.status}），请稍后重试。`
      : "无法加载文件，请重试。";
  }
  if (error.kind === "fetch_failed") return "无法加载文件，请重试。";
  if (error.kind === "aborted") return "加载已取消。";
  if (error.kind === "invalid_range") return "文件读取范围无效。";
  if (error.kind === "too_large") {
    return error.tooLargeReason === "lines"
      ? "文件行数过多，无法预览。"
      : "文件过大，无法预览。";
  }
  if (error.kind === "partial_content") {
    return "文件内容不完整，无法预览。";
  }
  if (error.kind === "unsupported_capability") {
    return "此内容暂不支持预览。";
  }
  return "无法加载文件，请重试。";
}

function formatErrorUserMessage(
  format: ViewerFormat | undefined,
  kind: string,
  error?: unknown,
) {
  if (format === "pdf") return "无法加载 PDF，请重试。";
  if (format === "image") {
    if (kind === "index_out_of_range")
      return "图片页码超出范围。";
    if (kind === "decode_failed") return "无法读取图片内容。";
    return "无法加载图片，请重试。";
  }
  if (format === "text") {
    if (kind === "render_failed") return "无法显示文本文件。";
    if (kind === "bounds") {
      const boundsError = error as {
        reason?: unknown;
        boundName?: unknown;
      };
      if (boundsError.reason === "lines") {
        return "文本文件行数过多，无法预览。";
      }
      if (boundsError.reason === "bytes") {
        return "文本文件过大，无法预览。";
      }
      if (typeof boundsError.boundName === "string") {
        return "文本预览范围无效。";
      }
    }
    return "无法加载文本文件，请重试。";
  }
  if (format === "csv") return "无法读取表格内容。";
  if (format === "docx") return "无法显示文档。";
  if (format === "xlsx") return "无法读取电子表格。";
  if (format === "pptx") {
    if (kind === "render_failed") return "无法显示幻灯片。";
    return "无法加载演示文稿，请重试。";
  }
  return "无法加载文件，请重试。";
}

function stateErrorUserMessage(kind: ViewerStateErrorKind) {
  if (kind === "invalid_bounds") return "预览范围无效。";
  if (kind === "invalid_target") return "请求的目标无效。";
  if (kind === "out_of_range") return "请求的项目超出范围。";
  if (kind === "stale_resource") return "预览已失效，请重新打开。";
  return "无法加载文件，请重试。";
}

function fallbackUserMessage(format: ViewerFormat | undefined) {
  if (format === "pdf") return "无法加载 PDF，请重试。";
  if (format === "image") return "无法加载图片，请重试。";
  if (format === "text") return "无法加载文本文件，请重试。";
  if (format === "csv") return "无法读取表格内容。";
  if (format === "docx") return "无法加载文档，请重试。";
  if (format === "xlsx") return "无法加载电子表格，请重试。";
  if (format === "pptx") return "无法加载演示文稿，请重试。";
  return "无法加载文件，请重试。";
}
