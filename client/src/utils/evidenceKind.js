const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif'])
const IMAGE_NAME_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i

/**
 * 是否按图片展示/预览（兼容 mimetype 为空时根据扩展名、文件名、filepath 判断）
 */
export function isImageKind(ev) {
  if (!ev) return false
  const mime = (ev.mimetype || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  const ext = (ev.ext || '').toLowerCase()
  if (IMAGE_EXT.has(ext)) return true
  const name = (ev.filename || '').toLowerCase()
  if (IMAGE_NAME_RE.test(name)) return true
  const path = String(ev.filepath || '').toLowerCase()
  return IMAGE_NAME_RE.test(path)
}

/** 可拉取二进制预览的图片（需有 filepath、非 demo） */
export function isImagePreviewable(ev) {
  return !!(ev && !ev.isDemo && ev.filepath && isImageKind(ev))
}
