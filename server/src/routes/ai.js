import { requireAuth }                                        from '../middleware/auth.js'
import { generateGroups, generateAnalysis, generateDocument } from '../services/ai.js'

export default async function aiRoutes(app) {
  app.addHook('preHandler', requireAuth)

  // ── POST /api/ai/init ─────────────────────────────
  // 保存表单时并发生成分组 + 分析，返回合并结果
  app.post('/init', {
    schema: {
      body: {
        type: 'object',
        required: ['type', 'goal', 'desc', 'defendant'],
        properties: {
          type:      { type: 'string' },
          goal:      { type: 'string' },
          desc:      { type: 'string' },
          defendant: { type: 'object' },
        },
      },
    },
  }, async (req, reply) => {
    const info = req.body
    try {
      const [groupResult, analysis] = await Promise.all([
        generateGroups(info),
        generateAnalysis(info),
      ])
      return { ...groupResult, analysis }
    } catch (err) {
      app.log.error(err)
      return reply.code(500).send({ error: 'AI 分析失败，请重试' })
    }
  })

  // ── POST /api/ai/document ─────────────────────────
  app.post('/document', {
    schema: {
      body: {
        type: 'object',
        required: ['caseId'],
        properties: { caseId: { type: 'number' } },
      },
    },
  }, async (req, reply) => {
    const { caseId } = req.body

    const c = await app.db.case.findFirst({
      where:   { id: caseId, userId: req.user.userId },
      include: { plaintiff: true, defendant: true, evidence: true },
    })
    if (!c) return reply.code(404).send({ error: '案件不存在' })

    const validEvidence = c.evidence.filter(e => e.status === 'valid')

    try {
      const doc = await generateDocument({ caseData: c, evidenceList: validEvidence })

      // 持久化文书并更新状态
      await app.db.case.update({
        where: { id: caseId },
        data:  { doc: JSON.stringify(doc), status: 'done' },
      })

      return { doc, status: 'done' }
    } catch (err) {
      app.log.error(err)
      return reply.code(500).send({ error: '文书生成失败，请重试' })
    }
  })
}
