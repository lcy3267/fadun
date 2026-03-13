/**
 * LLM Provider 工厂
 *
 * 通过 .env 的 LLM_PROVIDER 切换：
 *   LLM_PROVIDER=anthropic   → Claude（默认）
 *   LLM_PROVIDER=openai      → OpenAI GPT
 *   LLM_PROVIDER=deepseek    → DeepSeek（OpenAI 兼容，设 OPENAI_BASE_URL + OPENAI_MODEL）
 */

import * as anthropicProvider from './anthropic.js'
import * as openaiProvider    from './openai.js'

const PROVIDERS = {
  anthropic: anthropicProvider,
  openai:    openaiProvider,
  deepseek:  openaiProvider,   // DeepSeek 复用 OpenAI 兼容层
}

function getProvider() {
  const name = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase()
  const p = PROVIDERS[name]
  if (!p) throw new Error(`未知的 LLM_PROVIDER: "${name}"，可选值：anthropic / openai / deepseek`)
  return p
}

/**
 * 发送纯文本对话
 * @param {string} prompt
 * @param {Object} opts  - { maxTokens }
 */
export async function llmChat(prompt, opts = {}) {
  const p = getProvider()
  const messages = [{ role: 'user', content: prompt }]
  const raw = await p.chat(messages, opts)
  return raw.replace(/```json|```/g, '').trim()
}

/**
 * 发送带图片的对话（证据分析用）
 * @param {Array}  images   - [{ mimetype, b64 }]
 * @param {string} prompt
 * @param {Object} opts
 */
export async function llmVision(images, prompt, opts = {}) {
  const p = getProvider()
  if (!p.supportsVision) throw new Error(`当前 provider 不支持图片分析`)

  const imageBlocks = images.map(img => p.imageBlock(img.mimetype, img.b64))
  const messages = [{
    role: 'user',
    content: [...imageBlocks, { type: 'text', text: prompt }],
  }]
  const raw = await p.chat(messages, opts)
  return raw.replace(/```json|```/g, '').trim()
}
