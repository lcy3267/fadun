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
import { getConfig as getOpenAIConfig } from './openai.js'
import { logAiEvent } from '../logger.js'

const PROVIDERS = {
  anthropic: anthropicProvider,
  openai:    openaiProvider,
  deepseek:  openaiProvider,   // DeepSeek 复用 OpenAI 兼容层
}

function getProviderName() {
  return (process.env.LLM_PROVIDER || 'anthropic').toLowerCase()
}

function getProvider() {
  const name = getProviderName()
  const p = PROVIDERS[name]
  if (!p) throw new Error(`未知的 LLM_PROVIDER: "${name}"，可选值：anthropic / openai / deepseek`)
  return p
}

function resolveMetaForChat(providerName) {
  if (providerName === 'anthropic') {
    const model = anthropicProvider.MODELS?.default
    const endpoint = 'anthropic.messages.create'
    return { model, endpoint }
  }

  const { baseUrl, model } = getOpenAIConfig()
  const endpoint = `${baseUrl}`
  return { model, endpoint }
}

/**
 * 发送纯文本对话
 * @param {string} prompt
 * @param {Object} opts  - { maxTokens }
 */
export async function llmChat(prompt, opts = {}) {
  const providerName = getProviderName()
  const p = getProvider()
  const messages = [{ role: 'user', content: prompt }]
  const meta = resolveMetaForChat(providerName)

  try {
    await logAiEvent({
      provider: providerName,
      model: meta.model,
      endpoint: meta.endpoint,
      direction: 'request',
      payload: { messages, opts },
    })

    const raw = await p.chat(messages, opts)

    await logAiEvent({
      provider: providerName,
      model: meta.model,
      endpoint: meta.endpoint,
      direction: 'response',
      payload: { text: raw },
    })

    return raw.replace(/```json|```/g, '').trim()
  } catch (err) {
    await logAiEvent({
      provider: providerName,
      model: meta.model,
      endpoint: meta.endpoint,
      direction: 'error',
      payload: { message: err?.message || String(err) },
    })
    throw err
  }
}

/**
 * 发送带图片的对话（证据分析用）
 * @param {Array}  images   - [{ mimetype, b64 }]
 * @param {string} prompt
 * @param {Object} opts
 */
export async function llmVision(images, prompt, opts = {}) {
  const providerName = getProviderName()
  const p = getProvider()
  if (!p.supportsVision) throw new Error(`当前 provider 不支持图片分析`)

  let messages

  if (providerName !== 'anthropic') {
    // DeepSeek 当前 chat/completions 接口不接受 OpenAI 的 image_url 内容块，
    // 这里退化为纯文本调用，由 prompt 自身描述图片相关信息。
    const content = [
      ...images.map(img => ({
        type: 'image_url',
        image_url: { url: `data:${img.mimetype};base64,${img.b64}` }
      })),
      {
        "type": "text",
        "text": prompt
      }
    ]
    messages = [{ role: 'user', content: content }]
  } else {
    const imageBlocks = images.map(img => p.imageBlock(img.mimetype, img.b64))
    messages = [{
      role: 'user',
      content: [...imageBlocks, { type: 'text', text: prompt }],
    }]
  }

  const meta = resolveMetaForChat(providerName)

  try {
    await logAiEvent({
      provider: providerName,
      model: meta.model,
      endpoint: meta.endpoint,
      direction: 'request',
      payload: {
        imagesCount: images.length,
        prompt,
        opts,
      },
    })

    const raw = await p.chat(messages, opts)

    await logAiEvent({
      provider: providerName,
      model: meta.model,
      endpoint: meta.endpoint,
      direction: 'response',
      payload: { text: raw },
    })

    return raw.replace(/```json|```/g, '').trim()
  } catch (err) {
    await logAiEvent({
      provider: providerName,
      model: meta.model,
      endpoint: meta.endpoint,
      direction: 'error',
      payload: { message: err?.message || String(err) },
    })
    throw err
  }
}
