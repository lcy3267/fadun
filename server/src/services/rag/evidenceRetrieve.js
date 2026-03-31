import { RETRIEVE_TOP_K, RETRIEVE_MAX_CHARS_FOR_PROMPT } from './ragConfig.js'
import { embedTexts } from './embedding.js'
import { searchCaseIndex } from './vectorStoreFs.js'

function trimToChars(s, max) {
  const str = String(s || '')
  if (str.length <= max) return str
  return str.slice(0, max) + '...'
}

export async function retrieveEvidenceChunks({ app, userId, caseId, query, topK = RETRIEVE_TOP_K }) {
  const cid = Number(caseId)
  const uid = Number(userId)
  if (!Number.isFinite(cid) || cid <= 0) throw new Error('caseId invalid')
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('userId invalid')
  if (!query || !String(query).trim()) return []

  // 权限校验：确保 case 属于当前 user
  const c = await app.db.case.findFirst({
    where: { id: cid, userId: uid },
    select: { id: true },
  })
  if (!c) return []

  const texts = [String(query)]
  const embeddings = await embedTexts({ texts })
  const queryEmbedding = embeddings[0]
  if (!Array.isArray(queryEmbedding)) return []

  let hits = []
  try {
    hits = await searchCaseIndex({ caseId: cid, queryEmbedding, topK })
  } catch {
    return []
  }

  // 给 prompt 一个字符预算，避免把 chunk 全注入造成超长
  // 预算策略：按命中顺序分摊（粗略）
  let remaining = RETRIEVE_MAX_CHARS_FOR_PROMPT
  const out = []
  for (const h of hits) {
    if (!remaining) break
    const t = trimToChars(h.text, remaining)
    remaining -= t.length
    out.push({
      evidenceId: h.evidenceId,
      chunkIndex: h.chunkIndex,
      group: h.group,
      evType: h.evType,
      verdict: h.verdict,
      text: t,
      similarity: h.similarity,
    })
  }
  return out
}

