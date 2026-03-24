import { readFile } from 'fs/promises'
import path from 'path'
import { createRequire } from 'module'
import mammoth from 'mammoth'
const require = createRequire(import.meta.url)
const pdfParseModule = require('pdf-parse')

async function parsePdfBuffer(buf) {
  // Support both pdf-parse v1 (function export) and v2 (PDFParse class export).
  if (typeof pdfParseModule === 'function') {
    return pdfParseModule(buf)
  }
  if (typeof pdfParseModule?.PDFParse === 'function') {
    const parser = new pdfParseModule.PDFParse({ data: buf })
    try {
      const result = await parser.getText()
      return {
        text: result?.text || '',
        numpages: result?.total || result?.numpages || null,
      }
    } finally {
      if (typeof parser.destroy === 'function') await parser.destroy()
    }
  }
  throw new Error('pdf-parse 模块不可用')
}

export async function parseToText({ fullPath, mimetype, ext }) {
  const normalizedExt = (ext || path.extname(fullPath) || '').toLowerCase()
  const type = (mimetype || '').toLowerCase()

  if (type.startsWith('text/') || normalizedExt === '.txt') {
    const text = await readFile(fullPath, 'utf8')
    return { text: text.trim(), meta: { parser: 'txt' } }
  }

  if (type === 'application/pdf' || normalizedExt === '.pdf') {
    const buf = await readFile(fullPath)
    const out = await parsePdfBuffer(buf)
    return {
      text: (out.text || '').trim(),
      meta: { parser: 'pdf-parse', pages: out.numpages || null },
    }
  }

  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    normalizedExt === '.docx'
  ) {
    const out = await mammoth.extractRawText({ path: fullPath })
    return {
      text: (out.value || '').trim(),
      meta: { parser: 'mammoth', warnings: out.messages?.length || 0 },
    }
  }

  if (type.startsWith('image/')) {
    // 图片在 parse 阶段不做 OCR，避免与认证阶段重复调用 LLM。
    return { text: '', meta: { parser: 'image-skip-ocr' } }
  }

  return { text: '', meta: { parser: 'unsupported' } }
}
