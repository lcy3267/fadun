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

function formatEvidencePromptLines(list, ocrClamp = 600) {
  if (!list?.length) return '[无有效证据]'
  return list
    .map((e, idx) => {
      const ocr = clampText(e.ocrText || '', ocrClamp)
      return [
        `#${idx + 1}`,
        `evidenceId=${e.id}`,
        `group=${e.group || ''}`,
        `evType=${e.evType || ''}`,
        `verdict=${e.verdict || ''}`,
        `ocrText=${ocr || '[空]'}`,
      ].join(' | ')
    })
    .join('\n')
}

function isCasualGreeting(message) {
  const s = String(message || '').trim()
  if (!s) return false
  // 常见问候/闲聊：避免为“你好”触发工具与复杂法律 prompt
  return /^(你好|您好|哈喽|嗨|嘿|早上好|下午好|晚上好|在吗|怎么了|聊聊|聊天|你好呀|你好啊|您好啊|hi|hello)\b/i.test(s)
}

function toolDecisionPrompt({ allowedToolNames, uid, cid, userMessage }) {
  return `你是一名公益律师“案件问答 Agent”，按需调用工具再回答用户。

你允许使用的工具白名单：
${allowedToolNames.map(n => `- ${n}`).join('\n')}

规则（只选其一，只返回一条 JSON）：
说明：默认不要调用工具，只有在“问题很明确且需要额外拉取事实/证据结构”时才调用。

1) 若用户明确问证据链缺口、还缺什么证据、如何补证、完整性/薄弱环节等，输出：
{"action":"tool","name":"check_evidence_gap","args":{"userId":${uid},"caseId":${cid}}}

2) 若用户明确要“列出/逐条解释有效证据的内容或证明力”（例如：有效证据有哪些？第X份材料写了什么？哪份证据支持某个主张？），输出：
{"action":"tool","name":"read_evidence","args":{"userId":${uid},"caseId":${cid}}}

3) 若只是闲聊/问候/与案件无关，输出：
{"action":"final","mode":"casual"}

4) 其它与案情/法律相关的问题（无需额外拉取事实细节），输出：
{"action":"final","mode":"case"}
5) 只返回 JSON，不要输出任何其它文字。

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

  const uid = Number(userId)
  const cid = Number(caseId)
  if (!uid || !cid) throw new Error('generateCaseChatReply 缺少 userId/caseId')

  const { tools, toolNames } = buildToolRegistry({ app })
  const allowedToolNames = Array.isArray(toolNames)
    ? toolNames.filter(n => n === 'read_evidence' || n === 'check_evidence_gap')
    : ['read_evidence', 'check_evidence_gap']

  let gapResult = null
  let readResult = null
  let mode = 'case'
  try {
    const decisionPrompt = toolDecisionPrompt({ allowedToolNames, uid, cid, userMessage })
    const decisionRaw = await llmChat(decisionPrompt, { maxTokens: 250 })
    const decision = parseJsonLoose(decisionRaw)

    if (decision?.action === 'tool' && decision?.name === 'check_evidence_gap') {
      gapResult = await tools.check_evidence_gap.run({ userId: uid, caseId: cid })
      mode = 'case'
    } else if (decision?.action === 'tool' && decision?.name === 'read_evidence') {
      readResult = await tools.read_evidence.run({ userId: uid, caseId: cid })
      mode = 'case'
    } else {
      mode = decision?.mode === 'casual' ? 'casual' : 'case'
    }
  } catch {
    gapResult = null
    readResult = null
    mode = 'case'
  }

  if (mode === 'casual') {
    const casualPrompt = `你是一名友好的AI助手。用户在进行闲聊或非案件相关咨询。
用户问题：${userMessage}
要求：
1) 用自然中文简短回复，不要提到工具调用或证据缺口
2) 语气友好，必要时引导用户说明是否需要案件/证据相关帮助
3) 不要使用 Markdown 列表符号（尤其不要出现 '*' 号）；如要分点用“1/2/3”或中文序号
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

  let type, goal, desc, plaintiff, defendant, groups, evidencePrompt, caseSourceNote
  if (readResult?.case) {
    const c = readResult.case
    type = c.type
    goal = c.goal
    desc = c.desc
    plaintiff = c.plaintiff
    defendant = c.defendant
    groups = c.groups
    evidencePrompt = formatEvidencePromptLines(readResult.validEvidence, 600)
    caseSourceNote = '（案情与有效证据来自 read_evidence 工具快照）'
  } else {
    ;({ type, goal, desc, plaintiff, defendant, groups } = caseData || {})
    evidencePrompt = formatEvidencePromptLines((evidenceList || []).slice(0, 30), 600)
    caseSourceNote = '（案情与证据来自会话上下文，与数据库可能略有时间差）'
  }

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
4) 不要使用 Markdown 列表符号（尤其不要出现 '*' 号）。如需分点用“1/2/3”或中文序号，并用简短段落分隔。

【案件信息】${caseSourceNote}
案件类型：${type || ''}
维权目的：${goal || ''}
案情描述：${desc || ''}
${readResult?.case != null ? `数据库中是否已有「案件综述」字段：${readResult.case.hasCaseSummary ? '是' : '否'}\n` : ''}原告：${plaintiff?.name || ''}（性别/年龄：${plaintiff?.gender || ''} / ${plaintiff?.age || ''}，地区：${plaintiff?.region || ''}）
被告：${defendant?.name || ''}（与原告关系：${defendant?.rel || ''}${defendant?.huji != null ? `，户籍地：${defendant.huji}` : ''}）
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

