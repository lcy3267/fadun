/**
 * Provider: OpenAI-compatible（兼容 OpenAI / DeepSeek / 其他 OpenAI 格式 API）
 *
 * 环境变量：
 *   OPENAI_API_KEY   - API Key（DeepSeek 填 DeepSeek 的 key）
 *   OPENAI_BASE_URL  - 接口地址，默认 https://api.openai.com/v1
 *                      DeepSeek 填 https://api.deepseek.com/v1
 *   OPENAI_MODEL     - 模型名，默认 gpt-4o
 *                      DeepSeek 填 deepseek-chat
 */

const DEFAULT_BASE = 'https://api.openai.com/v1'

export function getConfig() {
  return {
    apiKey:  process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_BASE,
    model:   process.env.OPENAI_MODEL    || 'gpt-4o',
  }
}

export async function chat(messages, { maxTokens = 1000 } = {}) {
  const { apiKey, baseUrl, model } = getConfig()
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  })
  console.log('===model===', model)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI provider error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
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
