import { readFile } from 'fs/promises'
import path from 'path'
import { createRequire } from 'module'
import mammoth from 'mammoth'
const require = createRequire(import.meta.url)
const pdfParseModule = require('pdf-parse')
const xlsxParseModule = require('xlsx')

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

  // XLSX：把表格导出为 CSV 形式文本（用于 LLM 文本解析）
  if (
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    normalizedExt === '.xlsx'
  ) {
    const buf = await readFile(fullPath)
    const wb = xlsxParseModule.read(buf, { type: 'buffer' })

    const sheetNames = Array.isArray(wb?.SheetNames) ? wb.SheetNames : []
    const MAX_SHEETS = 3
    const MAX_XLSX_TEXT_CHARS = Number(process.env.MAX_XLSX_TEXT_CHARS || 20000)

    const parts = []
    let used = 0
    for (const name of sheetNames.slice(0, MAX_SHEETS)) {
      const sheet = wb.Sheets?.[name]
      if (!sheet) continue
      const csv = xlsxParseModule.utils.sheet_to_csv(sheet) || ''
      const head = `【${name}】`
      const text = csv.trim() ? `${head}\n${csv}` : `${head}\n[空表]`
      if (!text.trim()) continue

      // 控制总文本量，避免 prompt 过长
      if (used + text.length > MAX_XLSX_TEXT_CHARS) {
        const remain = Math.max(0, MAX_XLSX_TEXT_CHARS - used)
        if (remain) parts.push(text.slice(0, remain) + '...')
        break
      }
      parts.push(text)
      used += text.length
    }

    const outText = parts.join('\n\n').trim()
    return { text: outText, meta: { parser: 'xlsx', sheets: sheetNames.length } }
  }

  if (type.startsWith('image/')) {
    // 图片在 parse 阶段不做 OCR，避免与认证阶段重复调用 LLM。
    return { text: '', meta: { parser: 'image-skip-ocr' } }
  }

  return { text: '', meta: { parser: 'unsupported' } }
}
