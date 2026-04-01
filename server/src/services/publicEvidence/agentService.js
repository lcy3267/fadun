import { llmChat } from '../providers/index.js'
import { logAiEvent } from '../logger.js'
import {
  PUBLIC_AGENT_PHASE,
  PUBLIC_SOURCE_SITE,
  PUBLIC_SOURCE_TYPE,
  PUBLIC_REVIEW_STATUS,
} from './contract.js'

function safeParseJson(text, fallback) {
  try {
    return JSON.parse(String(text || ''))
  } catch {
    return fallback
  }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function splitSubjects(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  return [...new Set(
    raw
      .split(/[、，,；;。|\/\n]+/)
      .map((x) => x.trim())
      .filter((x) => x.length >= 2),
  )]
}

async function webSearch(query, num = 10) {
  const apiKey = process.env.SERPAPI_API_KEY || ''
  if (!apiKey) return []
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('hl', 'zh-cn')
  url.searchParams.set('gl', 'cn')
  url.searchParams.set('q', query)
  url.searchParams.set('num', String(clamp(Number(num || 10), 1, 20)))
  url.searchParams.set('api_key', apiKey)

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`search failed ${resp.status}`)
  const data = await resp.json().catch(() => ({}))
  const rows = Array.isArray(data?.organic_results) ? data.organic_results : []
  return rows.map((r) => ({
    title: String(r?.title || '').trim(),
    url: String(r?.link || '').trim(),
    snippet: String(r?.snippet || '').trim(),
    date: String(r?.date || '').trim(),
    source: String(r?.source || '').trim(),
  })).filter((r) => r.url)
}

function buildQueries({ subject, targets }) {
  const companyName = String(subject?.companyName || '').trim()
  const companies = splitSubjects(companyName)
  const kw = Array.isArray(subject?.keywords) ? subject.keywords.filter(Boolean).map((x) => String(x).trim()) : []
  const kwText = kw.slice(0, 2).join(' ')
  const out = []

  const wantCompany = !targets.length || targets.includes('company_profile')
  const wantCases = !targets.length || targets.includes('similar_cases')
  const names = companies.length ? companies.slice(0, 4) : [companyName]
  for (const name of names) {
    if (!name) continue
    if (wantCompany) {
      out.push({
        site: PUBLIC_SOURCE_SITE.TIANYANCHA,
        query: `site:tianyancha.com ${name} 工商信息`,
        kind: 'company_profile',
      })
      out.push({
        site: PUBLIC_SOURCE_SITE.SEARCH,
        query: `${name} 工商信息`,
        kind: 'company_profile',
      })
    }
    if (wantCases) {
      out.push({
        site: PUBLIC_SOURCE_SITE.WENSHU,
        query: `site:wenshu.court.gov.cn 劳动争议 ${name}`,
        kind: 'similar_cases',
      })
      out.push({
        site: PUBLIC_SOURCE_SITE.SEARCH,
        query: `${name} 劳动争议 判决`,
        kind: 'similar_cases',
      })
    }
    if (kwText) {
      out.push({
        site: PUBLIC_SOURCE_SITE.SEARCH,
        query: `${name} ${kwText}`,
        kind: wantCases ? 'similar_cases' : 'company_profile',
      })
    }
  }
  return out.filter((x) => x.query.length > 5)
}

async function llmFilterCards({ caseInfo, hits, limit }) {
  if (!hits.length) return []
  const prompt = `你是法律检索助手。请基于案件信息筛选公开检索结果，输出最相关条目。

【案件信息】
类型：${caseInfo?.type || ''}
目标：${caseInfo?.goal || ''}
案情：${caseInfo?.desc || ''}
被告：${caseInfo?.defendantName || ''}

【候选结果】
${hits.map((h, i) => `#${i + 1} | site=${h.site} | kind=${h.kind} | title=${h.title} | url=${h.url} | snippet=${h.snippet}`).join('\n')}

请仅返回 JSON 数组（不带其他文字）：
[{"idx":1,"relevance":0.88,"reason":"一句话理由","summary":"提取的关键事实，不超过120字"}]

要求：
1) idx 为候选序号（从1开始）；
2) relevance 0-1；
3) 最多返回 ${limit} 条；`
  const text = await llmChat(prompt, { maxTokens: 1200 })
  const parsed = safeParseJson(text.replace(/```json|```/g, '').trim(), [])
  const rows = Array.isArray(parsed) ? parsed : []
  return rows
    .map((x) => {
      const idx = Number(x?.idx || 0) - 1
      if (idx < 0 || idx >= hits.length) return null
      const base = hits[idx]
      return {
        ...base,
        relevance: clamp(Number(x?.relevance || 0), 0, 1),
        reason: String(x?.reason || '').trim(),
        summary: String(x?.summary || '').trim() || base.snippet,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit)
}

export async function runPublicEvidenceAgent({ app, userId, caseId, payload, onProgress }) {
  const c = await app.db.case.findFirst({
    where: { id: caseId, userId },
    include: { defendant: true },
  })
  if (!c) throw new Error('案件不存在')
  const subject = payload?.subject || {}
  const companyName = String(subject?.companyName || c?.defendant?.name || '').trim()
  if (!companyName) throw new Error('缺少企业名称')

  await onProgress?.(PUBLIC_AGENT_PHASE.PLAN, 10, { companyName })
  const queries = buildQueries({ subject: { ...subject, companyName }, targets: payload?.targets || [] })
  if (!queries.length) throw new Error('未生成有效搜索意图')

  await onProgress?.(PUBLIC_AGENT_PHASE.FETCH, 35, { queries: queries.length })
  const eachLimit = clamp(Math.ceil((payload?.limit || 20) / queries.length), 3, 20)
  const hitGroups = await Promise.all(
    queries.map(async (q) => {
      const rows = await webSearch(q.query, eachLimit).catch(() => [])
      await logAiEvent({
        provider: 'public-evidence-agent',
        direction: 'search',
        payload: {
          caseId,
          phase: PUBLIC_AGENT_PHASE.FETCH,
          site: q.site,
          kind: q.kind,
          query: q.query,
          hits: rows.length,
        },
      })
      return rows.map((r) => ({ ...r, site: q.site, kind: q.kind }))
    }),
  )
  let allHits = hitGroups.flat()
  if (!allHits.length) {
    // fallback: 进一步放宽查询，避免“多个主体+长关键词”导致 0 命中
    const fallbackName = splitSubjects(companyName)[0] || companyName
    const fallbackQueries = [
      `${fallbackName} 天眼查`,
      `${fallbackName} 劳动争议 判决`,
    ]
    const fallbackGroups = await Promise.all(
      fallbackQueries.map(async (q) => {
        const rows = await webSearch(q, eachLimit).catch(() => [])
        await logAiEvent({
          provider: 'public-evidence-agent',
          direction: 'search_fallback',
          payload: {
            caseId,
            phase: PUBLIC_AGENT_PHASE.FETCH,
            site: PUBLIC_SOURCE_SITE.SEARCH,
            query: q,
            hits: rows.length,
          },
        })
        return rows.map((r) => ({ ...r, site: PUBLIC_SOURCE_SITE.SEARCH, kind: 'similar_cases' }))
      }),
    )
    allHits = fallbackGroups.flat()
  }
  if (!allHits.length) throw new Error('未抓取到候选公开数据（请检查 SERPAPI_API_KEY 或输入关键词）')

  await onProgress?.(PUBLIC_AGENT_PHASE.FILTER, 65, { hits: allHits.length })
  let selected = []
  try {
    selected = await llmFilterCards({
      caseInfo: {
        type: c.type,
        goal: c.goal,
        desc: c.desc,
        defendantName: c.defendant?.name || '',
      },
      hits: allHits,
      limit: clamp(Number(payload?.limit || 20), 1, 50),
    })
  } catch {
    selected = allHits.slice(0, clamp(Number(payload?.limit || 20), 1, 50)).map((x) => ({
      ...x,
      relevance: 0.5,
      reason: 'fallback',
      summary: x.snippet,
    }))
  }
  if (!selected.length) throw new Error('候选结果过滤后为空')

  await onProgress?.(PUBLIC_AGENT_PHASE.WRITE, 85, { selected: selected.length })
  const now = new Date()
  const created = []
  for (const item of selected) {
    const ev = await app.db.evidence.create({
      data: {
        caseId,
        sourceType: PUBLIC_SOURCE_TYPE.PUBLIC_FETCH,
        sourceSite: item.site || PUBLIC_SOURCE_SITE.SEARCH,
        sourceUrl: item.url || null,
        fetchMeta: JSON.stringify({
          query: queries.find((q) => q.kind === item.kind && q.site === item.site)?.query || '',
          reason: item.reason || '',
          relevance: item.relevance || 0,
          capturedAt: now.toISOString(),
          source: item.source || '',
        }),
        reviewStatus: PUBLIC_REVIEW_STATUS.PENDING,
        filename: item.title || '公开信息',
        filepath: '',
        ext: '.txt',
        size: 0,
        sha256: '',
        text: item.summary || item.snippet || '',
        meta: JSON.stringify({ parser: 'public-fetch', kind: item.kind || '', date: item.date || '' }),
        processedAt: now,
        ocrText: '',
        mimetype: 'text/plain',
        status: 'pending',
        evType: item.kind === 'similar_cases' ? '判例' : '工商',
        group: item.kind === 'similar_cases' ? '判例参考' : '主体信息',
        verdict: item.reason || '待人工确认',
        aiVerified: false,
        isDemo: false,
      },
    })
    created.push(ev)
  }
  await onProgress?.(PUBLIC_AGENT_PHASE.WRITE, 100, { created: created.length })
  return { createdCount: created.length, createdIds: created.map((x) => x.id) }
}
