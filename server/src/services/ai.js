/**
 * AI 业务逻辑层（Prompt 管理）
 * 底层 provider 通过 providers/index.js 切换，此文件只关心业务逻辑。
 */
import { llmChat, llmVision } from './providers/index.js'

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

只返回 JSON 数组，不要有任何其他文字：
[{"group":"...","desc":"...","guide":"..."}]`

  const text   = await llmChat(prompt, { maxTokens: 1000 })
  const parsed = JSON.parse(text)
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
对以上案情进行专业分析，只返回如下 JSON，不要有任何其他文字：
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
  return JSON.parse(text)
}

// ── 3. 批量分析证据图片 ─────────────────────────────
export async function analyzeEvidence({ images, caseInfo }) {
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

只返回 JSON 数组，不要有其他文字：
[{"valid":true,"evType":"证据类型简称4字以内","group":"归属分类名称或null","verdict":"对本案证明力具体说明不超过40字"}]

注意：数组长度必须等于图片数量（${images.length}）；只返回 JSON。`

  const text   = await llmVision(images, prompt, { maxTokens: 1000 })
  const parsed = JSON.parse(text)
  while (parsed.length < images.length) {
    parsed.push({ valid: false, evType: '其他', group: null, verdict: 'AI 未能分析此图片' })
  }
  return parsed.slice(0, images.length)
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
请生成一份结构完整、语言严谨的维权陈述书，只返回如下 JSON，不要有任何其他文字：
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
  return JSON.parse(text)
}
