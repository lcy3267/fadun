/**
 * 案件维度 AI 问答服务（公益律师 persona）
 *
 * 当前实现：
 * - 默认仅使用 status=valid 的证据（你选择的 valid-only）
 * - 输出自然语言问答，不要求 JSON
 */
import { llmChat, llmChatStream } from '../services/providers/index.js'
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
      return JSON.parse(sliced)
    }
    throw new Error('AI 返回的内容不是有效 JSON')
  }
}

function clampText(s, maxLen) {
  const str = String(s ?? '')
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

function isCasualGreeting(message) {
  const s = String(message || '').trim()
  if (!s) return false
  // 常见问候/闲聊：避免为“你好”触发工具与复杂法律 prompt
  return /^(你好|您好|哈喽|嗨|嘿|早上好|下午好|晚上好|在吗|怎么了|聊聊|聊天|你好呀|你好啊|您好啊|hi|hello)\b/i.test(s)
}

function toolDecisionPrompt({ allowedToolNames, uid, cid, userMessage }) {
  return `你是一名公益律师“案件问答 Agent”，会用工具来补齐证据缺口信息。

你允许使用的工具白名单：
${allowedToolNames.map(n => `- ${n}`).join('\n')}

规则：
1) 若用户问题与“本案证据/补证/证据链缺口/法律诉求怎么用证据证明”强相关，则输出 tool 调用：
{"action":"tool","name":"check_evidence_gap","args":{"userId":${uid},"caseId":${cid}}}
2) 若用户问题只是闲聊/问候/与案件无关，则输出：
{"action":"final","mode":"casual"}
3) 否则输出：
{"action":"final","mode":"case"}
3) 只返回 JSON，不要输出任何其他文字。

用户问题：
${userMessage}`
}

export async function generateCaseChatReply({
  app,
  userId,
  caseId,
  userMessage,
  caseData,
  evidenceList,
  history,
  /** 若提供，最终回答以 LLM 流式片段回调（用于 SSE chat_delta） */
  onStreamDelta,
}) {
  if (isCasualGreeting(userMessage)) {
    // 这里直接短答，不触发工具与大段案情 prompt，保证“你好”体验流畅
    const text =
      '你好！我是公益律师助手。你想聊聊案件的哪一部分，还是想了解证据/补证建议？把你的问题简单说一下就行。'
    if (onStreamDelta) onStreamDelta(text)
    return text
  }

  const { type, goal, desc, plaintiff, defendant, groups } = caseData

  const uid = Number(userId)
  const cid = Number(caseId)
  if (!uid || !cid) throw new Error('generateCaseChatReply 缺少 userId/caseId')

  const { tools, toolNames } = buildToolRegistry({ app })
  const allowedToolNames = Array.isArray(toolNames) ? toolNames.filter(n => n === 'check_evidence_gap') : ['check_evidence_gap']

  let gapResult = null
  let mode = 'case'
  try {
    const decisionPrompt = toolDecisionPrompt({ allowedToolNames, uid, cid, userMessage })
    const decisionRaw = await llmChat(decisionPrompt, { maxTokens: 250 })
    const decision = parseJsonLoose(decisionRaw)

    if (decision?.action === 'tool' && decision?.name === 'check_evidence_gap') {
      gapResult = await tools.check_evidence_gap.run({ userId: uid, caseId: cid })
      mode = 'case'
    } else {
      mode = decision?.mode === 'casual' ? 'casual' : 'case'
    }
  } catch {
    // 决策失败时不阻断对话：降级为“仅基于证据列表直接回答”
    gapResult = null
    mode = 'case'
  }

  if (mode === 'casual') {
    const casualPrompt = `你是一名友好的AI助手。用户在进行闲聊或非案件相关咨询。
用户问题：${userMessage}
要求：
1) 用自然中文简短回复，不要提到工具调用或证据缺口
2) 语气友好，必要时引导用户说明是否需要案件/证据相关帮助
最多3句。`
    if (onStreamDelta) {
      let full = ''
      await llmChatStream(casualPrompt, { maxTokens: 300 }, (c) => {
        full += c
        onStreamDelta(c)
      })
      return String(full || '').replace(/```json|```/g, '').trim()
    }
    const t = await llmChat(casualPrompt, { maxTokens: 300 })
    return String(t || '').trim()
  }

  const evidencePrompt = (evidenceList || []).length
    ? evidenceList
        .slice(0, 30)
        .map((e, idx) => {
          const ocr = clampText(e.ocrText || '', 600)
          return [
            `#${idx + 1}`,
            `evidenceId=${e.id}`,
            `group=${e.group || ''}`,
            `evType=${e.evType || ''}`,
            `verdict=${e.verdict || ''}`,
            `ocrText=${ocr || '[空]'}`
          ].join(' | ')
        })
        .join('\n')
    : '[无有效证据]'

  const historyPrompt = (history || [])
    .slice(-20)
    .map((m) => {
      const role = m.role === 'assistant' ? '助手' : m.role === 'system' ? '系统' : '用户'
      return `${role}：${m.content}`
    })
    .join('\n')

  const gapPrompt = gapResult
    ? `证据缺口/补强信息（工具结果）：
完整性/强弱倾向：${gapResult?.completeness || ''}

证据缺口：
${Array.isArray(gapResult?.evidenceGaps) ? gapResult.evidenceGaps.join('\n') : (gapResult?.evidenceGaps || '')}

补证建议（尽量具体）：
${Array.isArray(gapResult?.suggestion) ? gapResult.suggestion.join('\n') : (gapResult?.suggestion || '')}`
    : '[工具未启用：未提供证据缺口/补证信息]'

  const prompt = `你是一名公益律师助手。你要在“法律建议边界”内帮助用户分析案件。

必须遵守：
1) 只依据系统提供的“案件信息 + 已认证有效证据”来回答，不得编造不存在的证据或事实。
2) 若证据不足以支撑结论，你要明确说明不确定点，并提出需要补充的证据类型/材料清单（尽量具体）。
3) 以自然语言回答，结构化组织内容：先给结论与建议，再给依据（说明引用了哪些证据的哪类信息），最后给缺口补证与下一步行动建议。

【案件信息】
案件类型：${type}
维权目的：${goal}
案情描述：${desc}
原告：${plaintiff?.name || ''}（性别/年龄：${plaintiff?.gender || ''} / ${plaintiff?.age || ''}，地区：${plaintiff?.region || ''}）
被告：${defendant?.name || ''}（与原告关系：${defendant?.rel || ''}）
证据分组清单：${Array.isArray(groups) ? groups.join('、') : ''}

【已认证有效证据（仅参考这些）】
${evidencePrompt}

【证据缺口与补强建议（可选）】
${gapPrompt}

【历史对话（仅供上下文，不要重复整段）】
${historyPrompt || '[无]'}

【用户问题】
${userMessage}

现在开始回答：`

  if (onStreamDelta) {
    let full = ''
    await llmChatStream(prompt, { maxTokens: 1200 }, (c) => {
      full += c
      onStreamDelta(c)
    })
    return String(full || '').replace(/```json|```/g, '').trim()
  }

  const text = await llmChat(prompt, { maxTokens: 1200 })
  return String(text || '').trim()
}

