/**
 * Provider: Anthropic Claude
 * 支持多模态（图片）
 */
import Anthropic from '@anthropic-ai/sdk'

let _client = null
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return _client
}

export const MODELS = {
  default: 'claude-sonnet-4-20250514',
  fast:    'claude-haiku-4-5-20251001',
}

/**
 * @param {Array}  messages  - 标准 messages 数组 [{role, content}]
 * @param {Object} opts      - { maxTokens, model }
 * @returns {string}         - 模型返回的纯文本
 */
export async function chat(messages, { maxTokens = 1000, model = 'default' } = {}) {
  const msg = await getClient().messages.create({
    model:      MODELS[model] || MODELS.default,
    max_tokens: maxTokens,
    messages,
  })
  return msg.content.map(b => b.text || '').join('')
}

/**
 * @param {(piece: string) => void} onDelta
 */
export async function chatStream(messages, { maxTokens = 1000, model = 'default' } = {}, onDelta) {
  const resolvedModel = MODELS[model] || MODELS.default
  const stream = getClient().messages.stream({
    model: resolvedModel,
    max_tokens: maxTokens,
    messages,
  })

  await new Promise((resolve, reject) => {
    stream.on('text', (t) => {
      if (t) onDelta(t)
    })
    stream.on('error', reject)
    stream.on('end', resolve)
  })
}

/**
 * 图片 block 格式（Anthropic 专用 base64）
 */
export function imageBlock(mimetype, b64) {
  return { type: 'image', source: { type: 'base64', media_type: mimetype, data: b64 } }
}

export const supportsVision = true
