import { CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS, EMBEDDING_MODEL } from './ragConfig.js'
import { chunkText } from './chunking.js'
import { embedTexts } from './embedding.js'
import { saveCaseIndex } from './vectorStoreFs.js'
import { primaryEvidenceBody } from '../evidenceContent.js'

function selectEvidenceContent(ev) {
  return primaryEvidenceBody(ev)
}

/**
 * Build/replace evidence vector index for one case.
 * @param {{app:any, caseId:number}} params
 */
export async function buildEvidenceIndexForCase({ app, caseId }) {
  const cid = Number(caseId)
  if (!Number.isFinite(cid) || cid <= 0) throw new Error('caseId invalid')
  if (!app?.db) throw new Error('buildEvidenceIndexForCase requires app.db')

  // Evidence inputs: only from valid ones
  const evidences = await app.db.evidence.findMany({
    where: { caseId: cid, status: 'valid' },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      group: true,
      evType: true,
      verdict: true,
      mimetype: true,
      ocrText: true,
      text: true,
      filename: true,
    },
  })

  // If no evidence, clear existing index by writing empty vectors/meta
  if (!evidences.length) {
    // Keep it simple: don't write empty index, just skip.
    return { caseId: cid, indexed: 0, chunkCount: 0 }
  }

  const chunksMeta = []
  const allTexts = []

  // Chunk each evidence and keep mapping chunk -> evidence
  for (const ev of evidences) {
    const content = selectEvidenceContent(ev)
    if (!content || !content.trim()) continue

    const chunks = chunkText(content, {
      chunkSizeChars: CHUNK_SIZE_CHARS,
      overlapChars: CHUNK_OVERLAP_CHARS,
    })

    for (let i = 0; i < chunks.length; i++) {
      const t = chunks[i]
      if (!t || !t.trim()) continue
      chunksMeta.push({
        evidenceId: ev.id,
        chunkIndex: i,
        group: ev.group,
        evType: ev.evType,
        verdict: ev.verdict,
        text: t,
        filename: ev.filename,
      })
      allTexts.push(t)
    }
  }

  if (!allTexts.length) {
    return { caseId: cid, indexed: evidences.length, chunkCount: 0 }
  }

  // Embed all chunks (batching handled inside embedTexts)
  const embeddings = await embedTexts({ texts: allTexts, model: EMBEDDING_MODEL })
  if (!Array.isArray(embeddings) || embeddings.length !== allTexts.length) {
    throw new Error(`embedding count mismatch: got ${embeddings?.length}, expected ${allTexts.length}`)
  }

  const dim = embeddings[0]?.length
  if (!dim) throw new Error('embedding dim missing')

  // Pack vectors into one Float32Array for storage
  const chunkCount = allTexts.length
  const vectors = new Float32Array(chunkCount * dim)
  const norms = new Float32Array(chunkCount)

  for (let i = 0; i < chunkCount; i++) {
    const vec = embeddings[i]
    // vec is number[]
    let sum = 0
    const base = i * dim
    for (let d = 0; d < dim; d++) {
      const v = Number(vec[d] || 0)
      vectors[base + d] = v
      sum += v * v
    }
    norms[i] = Math.sqrt(sum) || 1e-8
  }

  await saveCaseIndex({
    caseId: cid,
    embeddingModel: EMBEDDING_MODEL,
    dim,
    chunksMeta,
    vectors,
    norms,
  })

  return {
    caseId: cid,
    indexed: evidences.length,
    chunkCount: chunksMeta.length,
    dim,
  }
}

