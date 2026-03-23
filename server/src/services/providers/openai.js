/**
 * Provider: OpenAI-compatible（兼容 OpenAI / DeepSeek / OpenRouter 等 OpenAI 格式 API）
 *
 * 环境变量：
 *   OPENAI_API_KEY   - API Key（DeepSeek 填 DeepSeek 的 key）
 *   OPENAI_BASE_URL  - 接口地址，默认 https://api.openai.com/v1
 *                      DeepSeek 填 https://api.deepseek.com/v1
 *   OPENAI_MODEL     - 模型名，默认 gpt-4o
 *                      DeepSeek 填 deepseek-chat
 *   OPENAI_V_MODEL   - 视觉/图片模型（仅在 llmVision 时使用）
 *
 *   OPENAI_EXCLUDE_REASONING - 是否在请求中禁止返回推理过程（OpenRouter 等）
 *       未设置时：若 BASE_URL 为 openrouter.ai 则默认开启；否则默认不附加该字段
 *       设为 1/true/yes 强制开启；0/false/no 强制关闭
 */

const DEFAULT_BASE = 'https://api.openai.com/v1'

export function getConfig() {
  return {
    apiKey:  process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_BASE,
    model:   process.env.OPENAI_MODEL    || 'gpt-4o',
  }
}

/** 是否应在请求体中加入「不返回推理 token」配置（主要给 OpenRouter 用） */
function shouldExcludeReasoningFromResponse(baseUrl) {
  const v = process.env.OPENAI_EXCLUDE_REASONING
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return /openrouter\.ai/i.test(baseUrl || '')
}

/**
 * 只取助手最终正文 content，忽略 reasoning / reasoning_content / reasoning_details 等推理字段
 */
function extractAssistantContent(message) {
  if (!message) return ''
  const c = message.content
  if (c == null || c === '') return ''
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c
      .map(part => {
        if (typeof part === 'string') return part
        if (part?.type === 'text' && part.text != null) return String(part.text)
        return ''
      })
      .join('')
  }
  return ''
}

export async function chat(messages, { maxTokens = 1000, model } = {}) {
  const { apiKey, baseUrl, model: defaultModel } = getConfig()
  const finalModel = model || defaultModel

  const body = {
    model: finalModel,
    max_tokens: maxTokens,
    messages
  }

  // OpenRouter：不将推理 token 放进响应（模型仍可内部推理）；见官方 reasoning 文档
  if (shouldExcludeReasoningFromResponse(baseUrl)) {
    body.reasoning = { exclude: true }
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  if (/openrouter\.ai/i.test(baseUrl)) {
    headers['X-OpenRouter-Title'] = 'fadun'
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method:  'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI provider error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const message = data.choices?.[0]?.message
  return extractAssistantContent(message)
}

/**
 * OpenAI vision 格式图片 block
 */
export function imageBlock(mimetype, b64) {
  return {
    type: 'image_url',
    image_url: { url: `data:${mimetype};base64,${b64}` },
  }
}

export const supportsVision = true
