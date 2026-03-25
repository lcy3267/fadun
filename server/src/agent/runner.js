/**
 * Agent Runner
 * - 模型只允许输出固定 JSON 协议：tool|final
 * - runner 执行工具、回填 tool_result，再继续下一轮
 * - 关键：每一步写入 AgentRun.messages，便于回放审计
 */
import { llmChat } from '../services/providers/index.js'
import { buildToolRegistry } from './tools/index.js'

function parseJsonLoose(text) {
  const raw = String(text || '').trim()
  try {
    return JSON.parse(raw)
  } catch {
    const arrStart = raw.indexOf('[')
    const arrEnd = raw.lastIndexOf(']')
    if (arrStart !== -1 && arrEnd > arrStart) {
      const sliced = raw.slice(arrStart, arrEnd + 1)
      try {
        return JSON.parse(sliced)
      } catch {}
    }

    const objStart = raw.indexOf('{')
    const objEnd = raw.lastIndexOf('}')
    if (objStart !== -1 && objEnd > objStart) {
      const sliced = raw.slice(objStart, objEnd + 1)
      try {
        return JSON.parse(sliced)
      } catch {}
    }
    throw new Error('AI 返回的内容不是有效 JSON')
  }
}

function safeStringify(v) {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function buildAgentRunner(app) {
  const { tools, toolNames } = buildToolRegistry({ app })

  async function runCaseAgent({ agentRunId, userId, caseId, maxSteps = 10 }) {
    const uid = Number(userId)
    const cid = Number(caseId)
    if (!agentRunId) throw new Error('agentRunId required')
    if (!uid || !cid) throw new Error('userId/caseId required')

    const existing = await app.db.agentRun.findUnique({ where: { id: agentRunId } })
    if (!existing) throw new Error('AgentRun not found')

    let messages = []
    try {
      messages = existing.messages ? JSON.parse(existing.messages) : []
      if (!Array.isArray(messages)) messages = []
    } catch {
      messages = []
    }

    let gapResult = null
    let notifyResult = null

    const baseInstructions = `你是“案件助手 Agent”，只允许通过工具完成任务。
可用工具（白名单）：
${toolNames.map(n => `- ${n}`).join('\n')}

输出 JSON 且只能输出 JSON，禁止返回任何推理/解释。

必须遵循协议（严格）：
1) 第一步：输出 {"action":"tool","name":"check_evidence_gap","args":{"userId":${uid},"caseId":${cid}}}
2) 在拿到 check_evidence_gap 的 tool_result 之后：
   输出 {"action":"tool","name":"notify_user","args":{"userId":${uid},"caseId":${cid},"level":"warn","message":"...","meta":{...}}}
3) 完成 notify_user 后：
   输出 {"action":"final","content":"ok"}
`

    function buildPrompt(stepIndex) {
      const context = messages
        .slice(-20)
        .map(m => {
          if (m.type === 'tool_call') return `tool_call:${m.name} args=${safeStringify(m.args)}`
          if (m.type === 'tool_result') return `tool_result:${m.name} result=${safeStringify(m.result)}`
          if (m.type === 'model') return `model:${m.content}`
          return ''
        })
        .filter(Boolean)
        .join('\n')

      return `${baseInstructions}

当前步骤：${stepIndex + 1}/${maxSteps}
已发生事件（tool 轨迹，供你决定下一步）：
${context || '[无]'}
`
    }

    function validateAction(obj) {
      if (!obj || typeof obj !== 'object') return false
      if (obj.action === 'tool') {
        if (!toolNames.includes(obj.name)) return false
        if (!obj.args || typeof obj.args !== 'object') return false
        return true
      }
      if (obj.action === 'final') {
        return true
      }
      return false
    }

    async function persistAgentRun(patch) {
      await app.db.agentRun.update({
        where: { id: agentRunId },
        data: patch,
      })
    }

    async function updateMessagesAndPersist(nextEntry, patch) {
      messages.push(nextEntry)
      await persistAgentRun({
        messages: safeStringify(messages),
        ...patch,
      })
    }

    for (let i = 0; i < maxSteps; i++) {
      const stepPrompt = buildPrompt(i)
      let parsed
      let lastErr = null

      for (let retry = 0; retry < 2; retry++) {
        try {
          const raw = await llmChat(stepPrompt, { maxTokens: 900 })
          parsed = parseJsonLoose(raw)
          if (!validateAction(parsed)) throw new Error('输出 JSON 协议不符合要求')
          break
        } catch (err) {
          lastErr = err
          if (retry === 0) {
            messages.push({
              type: 'model',
              content: '模型输出无效 JSON，需按协议重新输出',
            })
            await persistAgentRun({
              messages: safeStringify(messages),
            })
          }
        }
      }

      if (!parsed) {
        await persistAgentRun({
          status: 'failed',
          progress: Math.round(((i + 1) / maxSteps) * 100),
          error: lastErr?.message || 'Agent 决策失败',
        })
        return { status: 'failed', error: lastErr?.message || String(lastErr) }
      }

      if (parsed.action === 'final') {
        await persistAgentRun({
          status: 'succeeded',
          progress: 100,
          lastResult: safeStringify({ ok: true, notifyResult }),
          error: null,
        })
        return { status: 'succeeded', notifyResult, gapResult }
      }

      // tool
      const toolName = parsed.name
      const args = parsed.args || {}

      await updateMessagesAndPersist(
        {
          type: 'tool_call',
          name: toolName,
          args,
        },
        {
          status: 'running',
          progress: Math.round(((i + 1) / maxSteps) * 100),
          lastTool: toolName,
        },
      )

      try {
        const result = await tools[toolName].run(args)

        await updateMessagesAndPersist(
          {
            type: 'tool_result',
            name: toolName,
            result,
          },
          {
            lastResult: safeStringify(result),
          },
        )

        if (toolName === 'check_evidence_gap') gapResult = result
        if (toolName === 'notify_user') notifyResult = result
      } catch (err) {
        const msg = err?.message || String(err)
        await persistAgentRun({
          status: 'failed',
          progress: Math.round(((i + 1) / maxSteps) * 100),
          error: `tool ${toolName} failed: ${msg}`,
          lastTool: toolName,
          lastResult: null,
        })
        return { status: 'failed', error: msg }
      }

      // 若已经通知完成，可以快速结束
      if (toolName === 'notify_user') {
        await persistAgentRun({
          status: 'succeeded',
          progress: 100,
          error: null,
          lastResult: safeStringify({ notifyResult, gapResult }),
        })
        return { status: 'succeeded', notifyResult, gapResult }
      }
    }

    await persistAgentRun({
      status: 'failed',
      progress: 100,
      error: `Agent 达到最大 steps=${maxSteps} 仍未完成`,
    })
    return { status: 'failed', error: `maxSteps exceeded` }
  }

  return { runCaseAgent }
}

