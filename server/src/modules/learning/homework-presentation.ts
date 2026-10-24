import { OfficeErrorType, OfficeParser, OfficeWarningType, type OfficeError, type OfficeIssue } from 'officeparser'

/** A known document limitation, as distinct from cancellation or parser service failure. */
export class HomeworkPresentationMaterialError extends Error {
  constructor(public readonly contentStatus: 'unsupported' | 'failed' | 'too_large', message: string) {
    super(message)
    this.name = 'HomeworkPresentationMaterialError'
  }
}

const sizeErrors = new Set<string>([
  OfficeErrorType.ZIP_ENTRY_COUNT_LIMIT_EXCEEDED, OfficeErrorType.ZIP_SIZE_LIMIT_EXCEEDED,
  OfficeErrorType.XML_ELEMENT_LIMIT_EXCEEDED, OfficeErrorType.MAX_NESTING_DEPTH_EXCEEDED,
  OfficeErrorType.OUTPUT_TOO_LARGE,
])
const documentErrors = new Set<string>([
  OfficeErrorType.FILE_CORRUPTED, OfficeErrorType.ZIP_ENTRY_INVALID_SIZE,
  OfficeErrorType.ZIP_NO_ENTRIES_FOUND, OfficeErrorType.ZIP_TRUNCATED,
  OfficeErrorType.REQUIRED_PART_MISSING, OfficeErrorType.PASSWORD_REQUIRED,
  OfficeErrorType.PASSWORD_INCORRECT, OfficeErrorType.DOCUMENT_DECRYPTION_FAILED,
])
const incompleteWarnings = new Set<string>([
  OfficeWarningType.CONTENT_PART_NOT_READ, OfficeWarningType.CONTENT_NOT_REPRESENTABLE,
  OfficeWarningType.CHART_DATA_EXTRACTION_FAILED, OfficeWarningType.ANNOTATION_EXTRACTION_FAILED,
  OfficeWarningType.ATTACHMENT_EXTRACTION_FAILED, OfficeWarningType.REPEATED_CONTENT_LIMIT_EXCEEDED,
  OfficeWarningType.TABLE_CELL_LIMIT_EXCEEDED, OfficeWarningType.TABLE_GRID_LIMIT_EXCEEDED,
])

/** Extracts editable PPTX text only; pictures are not OCR'd or counted as readable text. */
export async function extractHomeworkPresentationText(bytes: Uint8Array, format: 'ppt' | 'pptx', signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  if (bytes.byteLength > 16 * 1024 * 1024) {
    throw new HomeworkPresentationMaterialError('too_large', '演示文稿超过 16 MiB，请精简后重试')
  }
  // The published parser has no legacy binary PPT reader. Never decode that container as text.
  if (format === 'ppt') {
    throw new HomeworkPresentationMaterialError('unsupported', '旧版 PPT 暂不支持完整提取，请另存为 PPTX 后重试')
  }
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const zip = buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  const encryptedOffice = buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
  // The parser's encryption detection can throw an untyped ZIP error before its structured
  // extraction checks. Reject obviously mislabeled/truncated containers at this boundary;
  // leave encrypted Office containers to the parser's password/format checks.
  const tail = buffer.subarray(Math.max(0, buffer.length - 65557))
  const trailer = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if ((!zip && !encryptedOffice) || (zip && (trailer < 0 || trailer + 22 > tail.length))) {
    throw new HomeworkPresentationMaterialError('failed', '演示文稿损坏或格式不完整，请重新保存为 PPTX 后重试')
  }
  const warnings: OfficeIssue[] = []
  try {
    const ast = await OfficeParser.parseOffice(bytes, {
      fileType: 'pptx', abortSignal: signal, allowRemoteAssets: false,
      extractAttachments: false, ocr: false, includeRawContent: false,
      decompressionLimits: {
        maxUncompressedBytes: 32 * 1024 * 1024, maxZipEntries: 2000,
        maxXmlElements: 200000, maxTableCells: 20000, maxRepeatedContent: 60000,
      },
      onWarning: issue => warnings.push(issue),
    })
    signal?.throwIfAborted()
    const result = await ast.to('text', {
      includeImages: 'none', textConfig: { preserveLayout: false },
      onWarning: issue => warnings.push(issue),
    })
    signal?.throwIfAborted()
    if (warnings.some(issue => issue.code === OfficeWarningType.DEPENDENCY_LOAD_FAILED
      || issue.code === OfficeWarningType.INVALID_CONFIG_VALUE || issue.code === OfficeWarningType.UNRECOGNIZED_CONFIG_OPTION)) {
      throw new Error('Presentation parser unavailable')
    }
    if (warnings.some(issue => incompleteWarnings.has(issue.code))) {
      throw new HomeworkPresentationMaterialError('failed', '演示文稿部分内容无法完整提取，请转换为文字或 PDF 后重试')
    }
    // Keep the existing caller's 60k-character overflow detection without returning an unbounded string.
    return result.value.slice(0, 60001)
  } catch (error) {
    signal?.throwIfAborted()
    const code = (error as OfficeError | undefined)?.officeIssue?.code
    if (code && sizeErrors.has(code)) throw new HomeworkPresentationMaterialError('too_large', '演示文稿展开后内容过大，请精简后重试')
    if (code && documentErrors.has(code)) throw new HomeworkPresentationMaterialError('failed', '演示文稿损坏、加密或格式不完整，请重新保存为 PPTX 后重试')
    // Unexpected library, dependency and runtime failures remain operational errors for safe retry.
    throw error
  }
}
