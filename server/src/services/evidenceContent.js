/**
 * 统一“证据正文”口径，避免文档类与图片类字段语义混用。
 *
 * - 图片：ocrText 为视觉识别 / 认证摘录主体；text 通常为空。
 * - 文档（pdf/docx/xlsx/txt 等）：text 为解析出的全文；ocrText 多为 AI 认证时的关键摘录。
 */
export function primaryEvidenceBody(ev) {
  const mime = String(ev?.mimetype || '').toLowerCase()
  const isImage = mime.startsWith('image/')
  const body = String(ev?.text ?? '').trim()
  const ocr = String(ev?.ocrText ?? '').trim()
  if (isImage) {
    if (ocr) return ocr
    return body
  }
  if (body) return body
  return ocr
}
