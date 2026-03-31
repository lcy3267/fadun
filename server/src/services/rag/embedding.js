import {
  EMBEDDING_MODEL,
  OPENAI_EMBEDDING_BATCH_SIZE,
  EMBEDDING_BASE_URL,
  EMBEDDING_API_KEY,
} from './ragConfig.js'

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || '').replace(/\/+$/, '')
  if (!trimmed) return 'https://api.openai.com/v1'
  if (/^https?:\/\/api\.openrouter\.ai(?:\/v1)?$/i.test(trimmed)) {
    return 'https://openrouter.ai/api/v1'
  }
  return trimmed
}

function parseEmbeddingItems(payload) {
  // OpenAI-compatible standard: { data: [{ embedding: [...] }, ...] }
  if (Array.isArray(payload?.data)) {
    return payload.data
      .map((it) => it?.embedding)
      .filter((v) => Array.isArray(v))
  }

  // Some providers may return: { embeddings: [[...], ...] }
  if (Array.isArray(payload?.embeddings)) {
    return payload.embeddings.filter((v) => Array.isArray(v))
  }

  // Defensive fallback: raw nested arrays
  if (Array.isArray(payload) && payload.every((v) => Array.isArray(v))) {
    return payload
  }
  return null
}

/**
 * Node-only embedding：直接调用 OpenAI-compatible /embeddings。
 * @param {{texts: string[], model?: string}} params
 */
export async function embedTexts({ texts, model = EMBEDDING_MODEL }) {
  const apiKey = EMBEDDING_API_KEY
  const baseUrl = normalizeBaseUrl(EMBEDDING_BASE_URL || 'https://api.openai.com/v1')
  if (!apiKey) throw new Error('EMBEDDING_API_KEY (or OPENAI_API_KEY) is required for embeddings')

  const arr = Array.isArray(texts) ? texts.map(t => String(t || '')) : []
  if (!arr.length) return []

  // OpenAI embedding endpoint supports batch input; keep batch size bounded
  const batchSize = OPENAI_EMBEDDING_BATCH_SIZE > 0 ? OPENAI_EMBEDDING_BATCH_SIZE : 64
  const out = []

  for (let i = 0; i < arr.length; i += batchSize) {
    const batch = arr.slice(i, i + batchSize)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    }
    if (/openrouter\.ai/i.test(baseUrl)) {
      headers['X-OpenRouter-Title'] = 'fadun'
    }

    const resp = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        input: batch,
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`embedding request failed ${resp.status}: ${errText}`)
    }

    const data = await resp.json().catch(() => null)
    if (!data || typeof data !== 'object') {
      throw new Error('embedding response is not valid JSON object')
    }
    if (data?.error) {
      const msg = data.error?.message || JSON.stringify(data.error)
      throw new Error(`embedding api error: ${msg}`)
    }

    const vecs = parseEmbeddingItems(data)
    if (!Array.isArray(vecs) || !vecs.length) {
      const keys = Object.keys(data).join(',')
      const sample = JSON.stringify(data).slice(0, 300)
      throw new Error(`embedding response unrecognized shape keys=[${keys}] sample=${sample}`)
    }
    if (vecs.length !== batch.length) {
      throw new Error(`embedding count mismatch in batch: got ${vecs.length}, expected ${batch.length}`)
    }

    for (const vec of vecs) {
      if (!Array.isArray(vec) || !vec.length) throw new Error('embedding vector is empty')
      out.push(vec)
    }
  }

  return out
}

