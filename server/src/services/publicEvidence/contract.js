export const PUBLIC_AGENT_TASK_TYPE = 'case_public_agent_run'

export const PUBLIC_REVIEW_STATUS = {
  NONE: 'none',
  PENDING: 'pending_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

export const PUBLIC_SOURCE_TYPE = {
  UPLOAD: 'upload',
  PUBLIC_FETCH: 'public_fetch',
}

export const PUBLIC_SOURCE_SITE = {
  TIANYANCHA: 'tianyancha',
  WENSHU: 'wenshu',
  SEARCH: 'search',
}

export const PUBLIC_AGENT_PHASE = {
  PLAN: 'planning',
  FETCH: 'fetching',
  FILTER: 'filtering',
  WRITE: 'writing',
}

export function normalizePublicFetchPayload(payload) {
  const p = payload && typeof payload === 'object' ? payload : {}
  const subject = p.subject && typeof p.subject === 'object' ? p.subject : {}
  return {
    caseId: Number(p.caseId || 0),
    targets: Array.isArray(p.targets) ? p.targets.map((x) => String(x || '').trim()).filter(Boolean) : [],
    limit: Math.min(50, Math.max(1, Number(p.limit || 20))),
    subject: {
      companyName: String(subject.companyName || '').trim(),
      uscc: String(subject.uscc || '').trim(),
      keywords: Array.isArray(subject.keywords) ? subject.keywords.map((x) => String(x || '').trim()).filter(Boolean) : [],
      region: String(subject.region || '').trim(),
      from: String(subject.from || '').trim(),
      to: String(subject.to || '').trim(),
    },
  }
}
