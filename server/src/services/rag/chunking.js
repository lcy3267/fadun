import { CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS, MAX_CHUNKS_PER_EVIDENCE } from './ragConfig.js'

function normalizeText(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 简单中文 chunking：
 * - 以字符数为主，带 overlap
 * - 防止单证据过多切块导致 embedding 成本失控
 */
export function chunkText(text, opts = {}) {
  const input = normalizeText(text)
  const chunkSize = Number.isFinite(opts.chunkSizeChars) ? opts.chunkSizeChars : CHUNK_SIZE_CHARS
  const overlap = Number.isFinite(opts.overlapChars) ? opts.overlapChars : CHUNK_OVERLAP_CHARS
  const maxChunks = Number.isFinite(opts.maxChunksPerEvidence) ? opts.maxChunksPerEvidence : MAX_CHUNKS_PER_EVIDENCE

  if (!input) return []
  if (chunkSize <= overlap) throw new Error(`invalid chunk params: chunkSize=${chunkSize} overlap=${overlap}`)

  const chunks = []
  const step = chunkSize - overlap
  for (let start = 0; start < input.length; start += step) {
    const end = Math.min(input.length, start + chunkSize)
    const c = input.slice(start, end)
    if (c) chunks.push(c)
    if (chunks.length >= maxChunks) break
  }
  return chunks
}

