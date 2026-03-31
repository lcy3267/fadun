import { promises as fs } from 'fs'
import path from 'path'
import { RAG_DIR } from './ragConfig.js'

// 内存缓存：减少重复磁盘 IO
const caseCache = new Map()

function getCaseDir(caseId) {
  return path.join(RAG_DIR, 'evidence_case', String(caseId))
}

function getMetaPath(caseId) {
  return path.join(getCaseDir(caseId), 'meta.json')
}

function getVectorsPath(caseId) {
  return path.join(getCaseDir(caseId), 'vectors.bin')
}

function getNormsPath(caseId) {
  return path.join(getCaseDir(caseId), 'norms.bin')
}

function float32ArrayToBuffer(arr) {
  // arr is a Float32Array with exact view; safe to use arr.buffer
  return Buffer.from(arr.buffer)
}

function bufferToFloat32Array(buf) {
  // Buffer shares memory with underlying ArrayBuffer
  const ab = buf.buffer
  const byteOffset = buf.byteOffset
  const length = buf.byteLength / 4
  return new Float32Array(ab, byteOffset, length)
}

export async function hasCaseIndex(caseId) {
  try {
    await fs.access(getMetaPath(caseId))
    return true
  } catch {
    return false
  }
}

export async function saveCaseIndex({ caseId, embeddingModel, dim, chunksMeta, vectors, norms }) {
  const caseDir = getCaseDir(caseId)
  await fs.mkdir(caseDir, { recursive: true })

  const metaPath = getMetaPath(caseId)
  const vectorsPath = getVectorsPath(caseId)
  const normsPath = getNormsPath(caseId)

  // vectors: Float32Array of length (n * dim)
  // norms: Float32Array of length n
  const meta = {
    version: 1,
    embeddingModel,
    caseId,
    dim,
    chunkCount: chunksMeta.length,
    createdAt: new Date().toISOString(),
    chunksMeta,
  }

  await fs.writeFile(metaPath, JSON.stringify(meta), 'utf8')
  await fs.writeFile(vectorsPath, float32ArrayToBuffer(vectors))
  await fs.writeFile(normsPath, float32ArrayToBuffer(norms))

  caseCache.delete(String(caseId))
}

export async function loadCaseIndex(caseId) {
  const key = String(caseId)
  const cached = caseCache.get(key)
  if (cached) return cached

  const metaPath = getMetaPath(caseId)
  const vectorsPath = getVectorsPath(caseId)
  const normsPath = getNormsPath(caseId)

  const [metaRaw, vectorsBuf, normsBuf] = await Promise.all([
    fs.readFile(metaPath, 'utf8'),
    fs.readFile(vectorsPath),
    fs.readFile(normsPath),
  ])

  const meta = JSON.parse(metaRaw)
  const dim = meta.dim
  const vectors = bufferToFloat32Array(vectorsBuf)
  const norms = bufferToFloat32Array(normsBuf)

  const record = { meta, dim, vectors, norms }
  caseCache.set(key, record)
  return record
}

function cosineSimilarityFromEmbeddings(queryVec, queryNorm, indexVectors, indexNorms, dim, idx) {
  const base = idx * dim
  let dot = 0
  for (let d = 0; d < dim; d++) {
    dot += queryVec[d] * indexVectors[base + d]
  }
  const denom = (queryNorm * indexNorms[idx]) || 1e-8
  return dot / denom
}

export async function searchCaseIndex({ caseId, queryEmbedding, topK = 12 }) {
  const index = await loadCaseIndex(caseId)
  const { meta, dim, vectors, norms } = index
  const n = meta.chunkCount || norms.length
  if (!n) return []

  // queryNorm
  let qsum = 0
  for (let d = 0; d < dim; d++) qsum += queryEmbedding[d] * queryEmbedding[d]
  const queryNorm = Math.sqrt(qsum) || 1e-8

  // Keep topK in a simple min-list
  const best = []

  for (let i = 0; i < n; i++) {
    const sim = cosineSimilarityFromEmbeddings(queryEmbedding, queryNorm, vectors, norms, dim, i)
    if (best.length < topK) {
      best.push({ i, sim })
      if (best.length === topK) best.sort((a, b) => a.sim - b.sim)
    } else if (sim > best[0].sim) {
      best[0] = { i, sim }
      best.sort((a, b) => a.sim - b.sim)
    }
  }

  best.sort((a, b) => b.sim - a.sim)
  return best.map(({ i, sim }) => {
    const c = meta.chunksMeta[i]
    return { ...c, similarity: sim }
  })
}

