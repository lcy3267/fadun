/**
 * 阶段二 Agent 工具层
 * - 工具必须只读/可控：通过传入 userId/caseId 做权限校验
 * - 输出必须可 JSON 序列化，供 runner 写入 AgentRun messages
 */
import { generateCaseEvidenceSummary } from '../../services/ai.js'

function toTrimmedString(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function asNumber(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function normalizeLevel(level) {
  const s = String(level || '').toLowerCase()
  if (s === 'warn' || s === 'warning') return 'warn'
  if (s === 'error' || s === 'err') return 'error'
  return 'info'
}

const READ_EVIDENCE_OCR_MAX = 800
const READ_EVIDENCE_TAKE = 30

function clampEvidenceOcr(s, maxLen = READ_EVIDENCE_OCR_MAX) {
  const str = String(s ?? '')
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + '...'
}

export function buildToolRegistry({ app }) {
  if (!app?.db) throw new Error('tool registry requires app.db')

  /**
   * 只读：拉取本案基础信息与 status=valid 的证据（不调 LLM）
   */
  async function readEvidence({ userId, caseId }) {
    const uid = asNumber(userId)
    const cid = asNumber(caseId)
    if (!uid || !cid) throw new Error('read_evidence 缺少 userId/caseId')

    const c = await app.db.case.findFirst({
      where: { id: cid, userId: uid },
      include: { plaintiff: true, defendant: true },
    })
    if (!c) throw new Error('案件不存在')

    const groups = (() => {
      try {
        return JSON.parse(c.groups || '[]')
      } catch {
        return []
      }
    })()

    const rows = await app.db.evidence.findMany({
      where: { caseId: cid, status: 'valid' },
      orderBy: { id: 'asc' },
      take: READ_EVIDENCE_TAKE,
      select: {
        id: true,
        group: true,
        evType: true,
        verdict: true,
        ocrText: true,
      },
    })

    const validEvidence = rows.map(e => ({
      id: e.id,
      group: e.group,
      evType: e.evType,
      verdict: e.verdict,
      ocrText: clampEvidenceOcr(e.ocrText),
    }))

    return {
      queriedAt: new Date().toISOString(),
      validEvidenceCount: validEvidence.length,
      case: {
        type: c.type,
        goal: c.goal,
        desc: c.desc,
        status: c.status,
        groups: Array.isArray(groups) ? groups : [],
        hasCaseSummary: Boolean(c.caseSummary && String(c.caseSummary).trim()),
        plaintiff: c.plaintiff
          ? {
              name: c.plaintiff.name,
              gender: c.plaintiff.gender,
              age: c.plaintiff.age,
              region: c.plaintiff.region,
            }
          : null,
        defendant: c.defendant
          ? {
              name: c.defendant.name,
              gender: c.defendant.gender,
              rel: c.defendant.rel,
              huji: c.defendant.huji,
            }
          : null,
      },
      validEvidence,
    }
  }

  async function checkEvidenceGap({ userId, caseId }) {
    const uid = asNumber(userId)
    const cid = asNumber(caseId)
    if (!uid || !cid) throw new Error('check_evidence_gap 缺少 userId/caseId')

    const c = await app.db.case.findFirst({
      where: { id: cid, userId: uid },
      include: { plaintiff: true, defendant: true, evidence: true },
    })
    if (!c) throw new Error('案件不存在')

    const validEvidence = c.evidence.filter(e => e.status === 'valid')

    const groups = (() => {
      try {
        return JSON.parse(c.groups || '[]')
      } catch {
        return []
      }
    })()

    const summary = await generateCaseEvidenceSummary({
      caseData: {
        type: c.type,
        goal: c.goal,
        desc: c.desc,
        plaintiff: c.plaintiff,
        defendant: c.defendant,
        groups,
      },
      evidenceList: validEvidence.map(e => ({
        id: e.id,
        group: e.group,
        evType: e.evType,
        verdict: e.verdict,
        ocrText: e.ocrText,
      })),
    })

    return {
      completeness: summary.strength,
      evidenceGaps: summary.evidenceGaps,
      suggestion: summary.suggestion,
      keyPoints: summary.keyPoints,
      risks: summary.risks,
      crossCheck: summary.crossCheck,
      factSummary: summary.factSummary,
    }
  }

  async function notifyUser({ userId, caseId, message, level = 'info', meta }) {
    const uid = asNumber(userId)
    const cid = asNumber(caseId)
    const msg = toTrimmedString(message)
    if (!uid || !cid) throw new Error('notify_user 缺少 userId/caseId')
    if (!msg) throw new Error('notify_user message 不能为空')

    const safeLevel = normalizeLevel(level)

    // meta 可选：允许传对象，存成 JSON 字符串
    const metaStr =
      meta === undefined
        ? null
        : typeof meta === 'string'
          ? meta
          : JSON.stringify(meta)

    const n = await app.db.notification.create({
      data: {
        userId: uid,
        caseId: cid,
        level: safeLevel,
        message: msg,
        meta: metaStr,
      },
    })

    return { notificationId: n.id, level: n.level, message: n.message }
  }

  return {
    tools: {
      read_evidence: {
        description:
          '只读查询：本案基本信息与已认证有效证据（id/group/类型/认定/摘录），用于回答与案情、证据内容相关的问题',
        run: readEvidence,
      },
      check_evidence_gap: { description: '检查证据链是否完整，输出缺口与补强建议', run: checkEvidenceGap },
      notify_user: { description: '向用户写入通知（并可用于前端展示）', run: notifyUser },
    },
    toolNames: ['read_evidence', 'check_evidence_gap', 'notify_user'],
  }
}

