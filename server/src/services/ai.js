/**
 * AI 业务逻辑层（Prompt 管理）
 * 底层 provider 通过 providers/index.js 切换，此文件只关心业务逻辑。
 */
import { llmChat, llmVision } from './providers/index.js'
import { primaryEvidenceBody } from './evidenceContent.js'

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
      const body = primaryEvidenceBody(e)
      const shortBody = body.length > MAX_OCR ? `${body.slice(0, MAX_OCR)}...` : body
      return [
        `#${idx + 1}`,
        `group=${e.group || '未归类'}`,
        `evType=${e.evType || '其他'}`,
        `verdict=${e.verdict || '无'}`,
        `content=${shortBody || '[空]'}`,
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

function trimStr(v) {
  return String(v ?? '').trim()
}

function normalizeEvidenceResults(parsed, total, opts = {}) {
  const textJsonFallback = opts.textJsonFallback === true
  const list = Array.isArray(parsed) ? parsed : []
  while (list.length < total) {
    list.push({ valid: false, evType: '其他', group: null, verdict: 'AI 未能分析此图片', ocrText: '' })
  }
  return list.slice(0, total).map(item => {
    const ocr = trimStr(item?.ocrText)
    const alt = textJsonFallback ? trimStr(item?.text) : ''
    const merged = item?.valid ? (ocr || alt) : ''
    return {
      valid: Boolean(item?.valid),
      evType: item?.evType || '其他',
      group: item?.group ?? null,
      verdict: item?.verdict || '',
      ocrText: merged,
    }
  })
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
  return normalizeEvidenceResults(parsed, texts.length, { textJsonFallback: true })
}

const DOC_TEMPLATES_BY_TYPE = {
  '网络侵权': {
    title: '网络侵权维权陈述书',
    sections: [
      { title: '基本情况', hint: '交代原被告信息、案件类型、维权目的、核心时间线；措辞正式。' },
      { title: '网络侵权事实', hint: '围绕删帖/屏蔽/停止侵害的争议点，叙述侵权发生过程、传播方式与造成影响。' },
      { title: '证据材料摘要', hint: '将已认证有效证据按要点串联，说明各证据与侵权事实的对应关系。' },
      { title: '维权诉求', hint: '根据维权目的 goal 写明请求事项（如道歉、删除/断链、赔偿等），并体现“有据可依”。' },
      { title: '建议行动路径', hint: '给出分步骤建议：补证/取证、平台沟通或发函、协商调解、起诉/仲裁准备。' },
    ],
  },
  '劳动纠纷': {
    title: '劳动纠纷维权陈述书',
    sections: [
      { title: '基本情况', hint: '说明劳动者与用人单位信息、维权目的、关键事实概览与时间范围。' },
      { title: '劳动关系与工资福利事实', hint: '陈述用工形式、工作内容、劳动关系建立与解除经过，以及工资/社保/加班等争议点。' },
      { title: '证据材料摘要', hint: '把工资支付、考勤/工时、劳动合同/聊天记录等证据要点串联，强调证明力。' },
      { title: '维权诉求', hint: '根据 goal 输出请求事项：追索工资/补偿/经济补偿/赔偿等（如适用）。' },
      { title: '建议行动路径', hint: '按劳动仲裁流程给步骤：准备材料、申请仲裁、举证安排、和解/撤回评估。' },
    ],
  },
  '消费维权': {
    title: '消费维权陈述书',
    sections: [
      { title: '基本情况', hint: '说明原被告信息、交易时间地点、争议商品/服务、维权目的。' },
      { title: '消费交易与争议事实', hint: '描述购买/服务经过、出现的问题、沟通协商情况、对方回应与关键节点。' },
      { title: '证据材料摘要', hint: '归纳发票/订单、聊天记录、检测报告/照片等与质量或违约事实的对应关系。' },
      { title: '维权诉求', hint: '根据 goal 写明请求事项（如退货退款、赔偿、修理更换、解除合同等）。' },
      { title: '建议行动路径', hint: '给出分步骤：保全证据、投诉平台/监管协同、协商或调解、必要时诉讼。' },
    ],
  },
  '合同纠纷': {
    title: '合同纠纷维权陈述书',
    sections: [
      { title: '基本情况', hint: '说明合同主体、签约与履行概览、维权目的与争议焦点。' },
      { title: '合同履行与违约事实', hint: '围绕“违约发生—通知—对方抗辩—损失结果”叙述，写清关键节点与违约条款。' },
      { title: '证据材料摘要', hint: '把合同文本、付款/交付凭证、沟通记录等证据要点化，并对应证明违约与损失。' },
      { title: '维权诉求', hint: '根据 goal 输出请求：继续履行、解除合同、赔偿损失/违约金等（如适用）。' },
      { title: '建议行动路径', hint: '给步骤：催告/函件、证据补强、调解谈判、起诉方案与管辖准备。' },
    ],
  },
  '婚姻家庭': {
    title: '婚姻家庭维权陈述书',
    sections: [
      { title: '基本情况', hint: '说明婚姻/同居基础、当事人基本信息、维权目的与核心争议范围。' },
      { title: '婚姻关系与财产/抚养争议事实', hint: '围绕夫妻共同财产、债务、抚养权或探望安排等，叙述关键事实与时间线。' },
      { title: '证据材料摘要', hint: '概括婚姻关系证明、财产来源与去向、子女相关证据，以及对方态度与影响。' },
      { title: '维权诉求', hint: '根据 goal 写明请求事项（如分割财产、抚养费、抚养权、探望权等）。' },
      { title: '建议行动路径', hint: '给步骤：证据保全、沟通协商/调解、诉讼准备与风险提示（如举证期限）。' },
    ],
  },
  '人身损害': {
    title: '人身损害维权陈述书',
    sections: [
      { title: '基本情况', hint: '说明原被告信息、受害经过概览、维权目的、伤情时间范围。' },
      { title: '人身损害经过与责任争议', hint: '叙述事故/侵害发生原因、现场情况、伤情变化、责任主体与争议点。' },
      { title: '证据材料摘要', hint: '归纳诊疗记录、费用票据、鉴定结论（如有）、伤情照片与证人/聊天等证据要点。' },
      { title: '维权诉求', hint: '根据 goal 写明赔偿请求：医疗费、误工费、护理费、残疾赔偿等（按实际）。' },
      { title: '建议行动路径', hint: '给步骤：保全证据、治疗与病历管理、伤残/鉴定准备、协商/起诉材料清单。' },
    ],
  },
  '其他': {
    title: '维权陈述书',
    sections: [
      { title: '基本情况', hint: '说明原被告信息、案件类型、维权目的、争议焦点概览。' },
      { title: '案情事实', hint: '围绕争议焦点叙述发生过程、关键时间节点与对方行为/不作为。' },
      { title: '证据材料摘要', hint: '串联已认证有效证据与争议事实的对应关系，指出能证明什么。' },
      { title: '维权诉求', hint: '结合 goal 写明请求事项，做到请求与事实/证据相互对应。' },
      { title: '建议行动路径', hint: '给出分步骤建议：补证/举证计划、协商调解、起诉/应对策略。' },
    ],
  },
}

function getDocTemplate(type) {
  return DOC_TEMPLATES_BY_TYPE[type] || DOC_TEMPLATES_BY_TYPE['其他']
}

// ── 4. 生成维权文书 ─────────────────────────────────
export async function generateDocument({ caseData, evidenceList }) {
  const { type, goal, desc, plaintiff, defendant } = caseData
  const template = getDocTemplate(type)
  const evSummary = evidenceList.length
    ? evidenceList.map((e, i) => `第${i + 1}份（${e.evType}）：${e.verdict}`).join('；')
    : '暂无有效证据，按案情模板生成文书框架'

  const sectionTitles = template.sections.map(s => s.title)
  const sectionsSkeletonText = template.sections
    .map((s, idx) =>
      `    { "title": "${s.title}", "content": "..." }${idx === template.sections.length - 1 ? '' : ','}`
    )
    .join('\n')
  const sectionSpecText = template.sections
    .map((s, i) => `${i + 1}. ${s.title}（至少 80 字）：${s.hint}`)
    .join('\n')

  const prompt = `你是一位专业的中国民事诉讼律师，请根据以下信息起草一份正式的维权文书。

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
请生成一份结构完整、语言严谨的维权文书；只返回如下 JSON，不要有任何其他文字；禁止返回推理过程：

{
  "title": "${template.title}",
  "sections": [
${sectionsSkeletonText}
  ]
}

模板约束：
1) "title" 必须严格等于模板标题：${template.title}
2) sections 数组长度必须等于 ${template.sections.length}，且 sections[i].title 必须严格等于以下标题并保持顺序不变：${sectionTitles.join('、')}
3) 每个 sections[i].content 至少 80 字，语言正式
4) 具有标题为“建议行动路径”的 sections 时，必须给出分步骤具体建议（至少 3 步）

分段写作要求（仅用于理解模块含义，不要求原样输出）：
${sectionSpecText}`

  const text = await llmChat(prompt, { maxTokens: 2000 })
  return parseJsonLoose(text)
}
