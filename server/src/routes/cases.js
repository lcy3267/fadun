import { requireAuth } from '../middleware/auth.js'

const INCLUDE_FULL = {
  plaintiff: true,
  defendant: true,
  evidence:  true,
}

function serializeCase(c) {
  return {
    ...c,
    groups:   JSON.parse(c.groups   || '[]'),
    guide:    JSON.parse(c.guide    || '[]'),
    analysis: c.analysis ? JSON.parse(c.analysis) : null,
    caseSummary: c.caseSummary ? JSON.parse(c.caseSummary) : null,
    doc:      c.doc      ? JSON.parse(c.doc)      : null,
  }
}

export default async function casesRoutes(app) {
  app.addHook('preHandler', requireAuth)

  // ── GET /api/cases ───────────────────────────────
  app.get('/', async (req) => {
    const cases = await app.db.case.findMany({
      where:   { userId: req.user.userId },
      include: INCLUDE_FULL,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    })
    return cases.map(serializeCase)
  })

  // ── GET /api/cases/:id ───────────────────────────
  app.get('/:id', async (req, reply) => {
    const c = await app.db.case.findFirst({
      where:   { id: Number(req.params.id), userId: req.user.userId },
      include: INCLUDE_FULL,
    })
    if (!c) return reply.code(404).send({ error: '案件不存在' })
    return serializeCase(c)
  })

  // ── POST /api/cases ──────────────────────────────
  app.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['type', 'goal', 'desc', 'plaintiff', 'defendant'],
        properties: {
          type:      { type: 'string' },
          goal:      { type: 'string' },
          desc:      { type: 'string', maxLength: 1000 },
          groups:    { type: 'array'  },
          guide:     { type: 'array'  },
          analysis:  { type: 'object' },
          plaintiff: { type: 'object' },
          defendant: { type: 'object' },
        },
      },
    },
  }, async (req, reply) => {
    const { type, goal, desc, groups = [], guide = [], analysis, plaintiff, defendant } = req.body

    const c = await app.db.case.create({
      data: {
        userId:   req.user.userId,
        type, goal, desc,
        groups:   JSON.stringify(groups),
        guide:    JSON.stringify(guide),
        analysis: analysis ? JSON.stringify(analysis) : null,
        plaintiff: { create: plaintiff },
        defendant: { create: defendant },
      },
      include: INCLUDE_FULL,
    })
    return reply.code(201).send(serializeCase(c))
  })

  // ── PUT /api/cases/:id ───────────────────────────
  app.put('/:id', async (req, reply) => {
    const id = Number(req.params.id)
    const existing = await app.db.case.findFirst({ where: { id, userId: req.user.userId } })
    if (!existing) return reply.code(404).send({ error: '案件不存在' })

    const { type, goal, desc, groups, guide, analysis, caseSummary, doc, status, plaintiff, defendant } = req.body

    const data = {}
    if (type     !== undefined) data.type     = type
    if (goal     !== undefined) data.goal     = goal
    if (desc     !== undefined) data.desc     = desc
    if (status   !== undefined) data.status   = status
    if (groups   !== undefined) data.groups   = JSON.stringify(groups)
    if (guide    !== undefined) data.guide    = JSON.stringify(guide)
    if (analysis !== undefined) data.analysis = JSON.stringify(analysis)
    if (caseSummary !== undefined) data.caseSummary = JSON.stringify(caseSummary)
    if (doc      !== undefined) data.doc      = JSON.stringify(doc)

    const c = await app.db.case.update({
      where:   { id },
      data,
      include: INCLUDE_FULL,
    })

    // 更新关联子表
    if (plaintiff) {
      await app.db.plaintiff.upsert({
        where:  { caseId: id },
        create: { caseId: id, ...plaintiff },
        update: plaintiff,
      })
    }
    if (defendant) {
      await app.db.defendant.upsert({
        where:  { caseId: id },
        create: { caseId: id, ...defendant },
        update: defendant,
      })
    }

    const updated = await app.db.case.findUnique({ where: { id }, include: INCLUDE_FULL })
    return serializeCase(updated)
  })

  // ── DELETE /api/cases/:id ────────────────────────
  app.delete('/:id', async (req, reply) => {
    const id = Number(req.params.id)
    const existing = await app.db.case.findFirst({ where: { id, userId: req.user.userId } })
    if (!existing) return reply.code(404).send({ error: '案件不存在' })
    await app.db.case.delete({ where: { id } })
    return { ok: true }
  })
}
