/**
 * AI 业务逻辑层（Prompt 管理）
 * 底层 provider 通过 providers/index.js 切换，此文件只关心业务逻辑。
 */
import { llmChat, llmVision } from './providers/index.js'

function parseJsonLoose(text) {
  const raw = String(text || '').trim()
  try {
    return JSON.parse(raw)
  } catch {
    // Try to recover first JSON array/object block
    const arrStart = raw.indexOf('[')
    const arrEnd = raw.lastIndexOf(']')
    if (arrStart !== -1 && arrEnd > arrStart) {
      const sliced = raw.slice(arrStart, arrEnd + 1)
      try { return JSON.parse(sliced) } catch {}
    }

    const objStart = raw.indexOf('{')
    const objEnd = raw.lastIndexOf('}')
    if (objStart !== -1 && objEnd > objStart) {
      const sliced = raw.slice(objStart, objEnd + 1)
      try { return JSON.parse(sliced) } catch {}
    }
    throw new Error('AI 返回的内容不是有效 JSON')
  }
}

// ── 1. 生成证据分组 + 搜集指引 ──────────────────────
export async function generateGroups({ type, goal, desc, defendant }) {
  const prompt = `你是一位中国民事诉讼律师助手，正在为当事人制定个性化的证据收集方案。

【案件信息】
案件类型：${type}
维权目的：${goal}
被告姓名：${defendant.name}，与原告关系：${defendant.rel}
案情描述：${desc}

【任务】
根据以上具体案情，生成一份个性化的证据收集清单，包含 4-5 个分组。
每个分组需包含：
- group：分组名称，6 字以内
- desc：该分组一句话说明
- guide：具体搜集建议，2-3 句话，可提及具体 App 或平台

只返回 JSON 数组，，禁止返回推理过程, 不要有任何其他文字：
[{"group":"...","desc":"...","guide":"..."}]`

  const text   = await llmChat(prompt, { maxTokens: 1000 })
  const parsed = parseJsonLoose(text)
  return { groups: parsed.map(g => g.group), guide: parsed }
}

// ── 2. 生成案情分析 ──────────────────────────────────
export async function generateAnalysis({ type, goal, desc, defendant }) {
  const prompt = `你是一位经验丰富的中国民事诉讼律师助手。

【案件信息】
案件类型：${type}
维权目的：${goal}
被告姓名：${defendant.name}，与原告关系：${defendant.rel}
案情描述：${desc}

【任务】
对以上案情进行专业分析，，禁止返回推理过程, 只返回如下 JSON，不要有任何其他文字：
{
  "summary": "案情核心问题一句话概括，20字以内",
  "strength": 70,
  "strengthNote": "评分依据简短说明，30字以内",
  "keyPoints": ["关键法律要点1","关键法律要点2","关键法律要点3"],
  "risks": ["主要风险1","主要风险2"],
  "suggestion": "最重要的一条行动建议，40字以内"
}

注意：strength 必须是 0-100 整数；keyPoints 和 risks 各 2-3 条，每条 20 字以内。`

  const text = await llmChat(prompt, { maxTokens: 1000 })
  return parseJsonLoose(text)
}

function normalizeCaseSummary(parsed, validEvidenceCount) {
  const data = parsed && typeof parsed === 'object' ? parsed : {}
  const crossCheck = data.crossCheck && typeof data.crossCheck === 'object' ? data.crossCheck : {}
  const toList = (v) => Array.isArray(v) ? v.map(x => String(x || '').trim()).filter(Boolean) : []
  const gaps = Array.isArray(data.evidenceGaps)
    ? data.evidenceGaps.map((g) => ({
      title: String(g?.title || '').trim(),
      detail: String(g?.detail || '').trim(),
    })).filter((g) => g.title || g.detail)
    : []
  const strength = Number.isFinite(Number(data.strength))
    ? Math.max(0, Math.min(100, Math.round(Number(data.strength))))
    : 0

  return {
    factSummary: String(data.factSummary || '').trim(),
    strength,
    strengthNote: String(data.strengthNote || '').trim(),
    crossCheck: {
      strong: toList(crossCheck.strong),
      weak: toList(crossCheck.weak),
    },
    evidenceGaps: gaps,
    keyPoints: toList(data.keyPoints),
    risks: toList(data.risks),
    suggestion: String(data.suggestion || '').trim(),
    meta: {
      generatedAt: new Date().toISOString(),
      validEvidenceCount,
    },
  }
}

// ── 2.1 生成案件综述（基于当前有效证据）──────────────────
export async function generateCaseEvidenceSummary({ caseData, evidenceList }) {
  const { type, goal, desc, plaintiff, defendant, groups = [] } = caseData
  const safeGroups = Array.isArray(groups) ? groups : []
  const items = Array.isArray(evidenceList) ? evidenceList : []
  const MAX_OCR = 500
  const evLines = items.length
    ? items.map((e, idx) => {
      const ocr = String(e.ocrText || '').trim()
      const shortOcr = ocr.length > MAX_OCR ? `${ocr.slice(0, MAX_OCR)}...` : ocr
      return [
        `#${idx + 1}`,
        `group=${e.group || '未归类'}`,
        `evType=${e.evType || '其他'}`,
        `verdict=${e.verdict || '无'}`,
        `ocrText=${shortOcr || '[空]'}`,
      ].join(' | ')
    }).join('\n')
    : '[当前暂无有效证据]'

  const groupCountMap = new Map()
  safeGroups.forEach((g) => groupCountMap.set(g, 0))
  items.forEach((e) => {
    const g = e.group
    if (g && groupCountMap.has(g)) groupCountMap.set(g, (groupCountMap.get(g) || 0) + 1)
  })
  const groupStats = safeGroups.length
    ? safeGroups.map((g) => `${g}:${groupCountMap.get(g) || 0}`).join('；')
    : '未定义证据分组'

  const prompt = `你是一位专业的中国民事诉讼律师助手，请基于案件信息与已认证有效证据，输出结构化“案件综述”。\n\n【案件信息】\n案件类型：${type}\n维权目的：${goal}\n原告：${plaintiff?.name || ''}\n被告：${defendant?.name || ''}（关系：${defendant?.rel || ''}）\n案情描述：${desc}\n\n【证据分组覆盖情况】\n${groupStats}\n\n【有效证据清单】\n${evLines}\n\n【任务要求】\n1) 输出核心事实还原（围绕争议焦点）；\n2) 给出胜诉概率 strength（0-100）及简要依据；\n3) 输出证据互相印证关系：strong（已形成闭环）与 weak（链条薄弱）；\n4) 输出证据缺口 evidenceGaps（title + detail）；\n5) 输出 keyPoints（法律要点）、risks（主要风险）与 suggestion（下一步建议）；\n6) 若有效证据不足，也必须输出可执行的补证建议。\n\n只返回 JSON 对象，禁止返回推理过程，不要有任何其他文字：\n{\n  "factSummary":"核心事实还原，不超过220字",\n  "strength":72,\n  "strengthNote":"评分依据，不超过50字",\n  "crossCheck":{"strong":["..."],"weak":["..."]},\n  "evidenceGaps":[{"title":"缺口标题","detail":"补强建议，不超过80字"}],\n  "keyPoints":["..."],\n  "risks":["..."],\n  "suggestion":"下一步行动建议，不超过120字"\n}`

  const text = await llmChat(prompt, { maxTokens: 2000 })
  const parsed = parseJsonLoose(text)
  return normalizeCaseSummary(parsed, items.length)
}

// ── 3. 批量分析证据图片 ─────────────────────────────
export async function analyzeEvidence({ images, caseInfo }) {
  return analyzeEvidenceImages({ images, caseInfo })
}

function normalizeEvidenceResults(parsed, total) {
  const list = Array.isArray(parsed) ? parsed : []
  while (list.length < total) {
    list.push({ valid: false, evType: '其他', group: null, verdict: 'AI 未能分析此图片', ocrText: '' })
  }
  return list.slice(0, total).map(item => ({
    valid: Boolean(item?.valid),
    evType: item?.evType || '其他',
    group: item?.group ?? null,
    verdict: item?.verdict || '',
    ocrText: item?.valid ? (item?.ocrText || '') : '',
  }))
}

export async function analyzeEvidenceImages({ images, caseInfo }) {
  const { type, goal, desc, defendant, groups } = caseInfo
  const prompt = `你是一位专业的中国民事诉讼律师助手，正在帮助当事人分析证据材料。

【案件信息】
案件类型：${type}
维权目的：${goal}
被告姓名：${defendant.name}
案情描述：${desc}

【可用证据分类】（每张图必须归入其中一类，或标记为无关）
${groups.join('、')}

【任务】
以上共 ${images.length} 张图片，请按顺序逐张分析。

分析每张图时：
1) 先判断该图是否为聊天/对话界面截图（如微信、QQ、短信等）。
2) 若不是聊天截图：按画面内容归入上述分类，给出 valid、evType、group、verdict即可。
3) 若是聊天截图：根据图中聊天内容判断对本案的证明力。若内容可辨认且与案情、被告相关，则 valid 为 true，正常填写 evType、group、verdict；若无法识别有效内容（模糊、残缺、与案情无关等），则 valid 为 false，group 为 null，verdict 写：「未能识别有效聊天内容，建议滚动截图或补充更多聊天内容」（或等价表述，不超过40字）。
4) 仅当该图对本案有效（valid=true）时，提取与本案证明相关的文字到 ocrText；若 valid=false，则 ocrText 必须返回空字符串。

只返回 JSON 数组，禁止返回推理过程，不要有其他文字 ：
[{"valid":true,"evType":"证据类型简称4字以内","group":"归属分类名称或null","verdict":"对本案证明力具体说明不超过40字","ocrText":"提取出的图片文字，无则空字符串"}]

注意：数组长度必须等于图片数量（${images.length}）；只返回 JSON。`

  const maxTokens = Math.min(6000, 900 + images.length * 1600)
  const text = await llmVision(images, prompt, { maxTokens })
  const parsed = parseJsonLoose(text)
  return normalizeEvidenceResults(parsed, images.length)
}

export async function analyzeEvidenceTexts({ texts, caseInfo }) {
  const { type, goal, desc, defendant, groups } = caseInfo
  const textBlocks = (texts || []).map((t, i) => {
    const normalized = String(t || '').trim()
    return `【第${i + 1}份文本】\n${normalized || '[空文本]'}`
  }).join('\n\n')
  const prompt = `你是一位专业的中国民事诉讼律师助手，正在帮助当事人分析证据文本材料。

【案件信息】
案件类型：${type}
维权目的：${goal}
被告姓名：${defendant.name}
案情描述：${desc}

【可用证据分类】（每份材料必须归入其中一类，或标记为无关）
${groups.join('、')}

【待分析文本材料】
${textBlocks}

【任务】
以上共 ${texts.length} 份文本证据，请按顺序逐份分析。

分析每份文本时：
1) 判断与本案及被告是否相关；
2) 若相关：valid=true，填写 evType/group/verdict；
3) 若不相关或信息不足：valid=false，group=null，verdict 给出原因；
4) 仅当 valid=true 时，ocrText 填写对本案证明相关的关键原文；valid=false 时 ocrText 必须为空字符串。

只返回 JSON 数组，禁止返回推理过程，不要有其他文字：
[{"valid":true,"evType":"证据类型简称4字以内","group":"归属分类名称或null","verdict":"对本案证明力具体说明不超过40字","ocrText":"对本案有效的原文摘录，无则空字符串"}]

注意：数组长度必须等于文本数量（${texts.length}）；只返回 JSON。`

  const text = await llmChat(prompt, { maxTokens: 2000 })
  const parsed = parseJsonLoose(text)
  return normalizeEvidenceResults(parsed, texts.length)
}

// ── 4. 生成维权文书 ─────────────────────────────────
export async function generateDocument({ caseData, evidenceList }) {
  const { type, goal, desc, plaintiff, defendant } = caseData
  const evSummary = evidenceList.length
    ? evidenceList.map((e, i) => `第${i + 1}份（${e.evType}）：${e.verdict}`).join('；')
    : '暂无有效证据，按案情模板生成文书框架'

  const prompt = `你是一位专业的中国民事诉讼律师，请根据以下信息起草一份正式的维权陈述书。

【当事人信息】
原告：${plaintiff.name}，${plaintiff.gender === 'female' ? '女' : '男'}，${plaintiff.age}岁，${plaintiff.region}
被告：${defendant.name}，与原告关系：${defendant.rel}

【案件概要】
案件类型：${type}
维权目的：${goal}
案情描述：${desc}

【证据材料摘要】
${evSummary}

【任务】
请生成一份结构完整、语言严谨的维权陈述书，只返回如下 JSON，，禁止返回推理过程, 不要有任何其他文字：
{
  "title": "维权陈述书",
  "sections": [
    { "title": "基本情况", "content": "..." },
    { "title": "侵权事实", "content": "..." },
    { "title": "证据材料", "content": "..." },
    { "title": "维权诉求", "content": "..." },
    { "title": "建议行动路径", "content": "..." }
  ]
}

要求：语言正式，每个 section content 不少于 80 字；建议行动路径给出分步骤的具体建议。`

  const text = await llmChat(prompt, { maxTokens: 2000 })
  return parseJsonLoose(text)
}
