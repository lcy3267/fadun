import { requireAuth } from '../middleware/auth.js'

export default async function agentRoutes(app) {
  app.addHook('preHandler', requireAuth)

  app.post(
    '/run',
    {
      schema: {
        body: {
          type: 'object',
          required: ['caseId'],
          properties: {
            caseId: { type: 'number' },
          },
        },
      },
    },
    async (req, reply) => {
      const { caseId } = req.body
      const cid = Number(caseId)
      if (!cid) return reply.code(400).send({ error: '缺少 caseId' })

      const c = await app.db.case.findFirst({ where: { id: cid, userId: req.user.userId } })
      if (!c) return reply.code(404).send({ error: '案件不存在' })

      const task = await app.db.task.create({
        data: {
          userId: req.user.userId,
          caseId: cid,
          type: 'case_agent_run',
          status: 'queued',
          progress: 0,
          payload: JSON.stringify({ caseId: cid }),
        },
      })

      app.taskRunner.enqueue(task).catch(() => {})

      return { taskId: task.id }
    },
  )

  // ── GET /api/agent/chat/latest?caseId= ────────────────
  app.get('/chat/latest', async (req, reply) => {
    const caseId = Number(req.query?.caseId)
    if (!caseId) return reply.code(400).send({ error: '缺少 caseId' })

    const c = await app.db.case.findFirst({ where: { id: caseId, userId: req.user.userId } })
    if (!c) return reply.code(404).send({ error: '案件不存在' })

    const session = await app.db.chatSession.findFirst({
      where: { userId: req.user.userId, caseId },
      orderBy: { updatedAt: 'desc' },
    })

    if (!session) {
      return { sessionId: null, messages: [] }
    }

    const messages = await app.db.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take: 40,
    })

    return { sessionId: session.id, messages }
  })

  // ── POST /api/agent/chat/send ─────────────────────────
  app.post(
    '/chat/send',
    {
      schema: {
        body: {
          type: 'object',
          required: ['caseId', 'message'],
          properties: {
            caseId: { type: 'number' },
            sessionId: { type: 'number' },
            message: { type: 'string', minLength: 1, maxLength: 4000 },
          },
        },
      },
    },
    async (req, reply) => {
      const { caseId, sessionId, message } = req.body
      const cid = Number(caseId)
      if (!cid) return reply.code(400).send({ error: '缺少 caseId' })
      const msg = String(message || '').trim()
      if (!msg) return reply.code(400).send({ error: 'message 不能为空' })

      const c = await app.db.case.findFirst({ where: { id: cid, userId: req.user.userId } })
      if (!c) return reply.code(404).send({ error: '案件不存在' })

      let sid = sessionId ? Number(sessionId) : null
      if (sid) {
        const existingSession = await app.db.chatSession.findFirst({
          where: { id: sid, userId: req.user.userId, caseId: cid },
        })
        if (!existingSession) return reply.code(404).send({ error: 'session 不存在' })
      } else {
        const newSession = await app.db.chatSession.create({
          data: { userId: req.user.userId, caseId: cid, status: 'active' },
        })
        sid = newSession.id
      }

      const userMessage = await app.db.chatMessage.create({
        data: {
          sessionId: sid,
          role: 'user',
          content: msg,
        },
      })

      await app.db.chatSession.update({
        where: { id: sid },
        data: { updatedAt: new Date() },
      })

      const task = await app.db.task.create({
        data: {
          userId: req.user.userId,
          caseId: cid,
          type: 'case_agent_chat',
          status: 'queued',
          progress: 0,
          payload: JSON.stringify({ sessionId: sid, caseId: cid, userMessageId: userMessage.id }),
        },
      })

      app.taskRunner.enqueue(task).catch(() => {})

      return { taskId: task.id, sessionId: sid }
    },
  )

  // ── GET /api/agent/runs?caseId= ──────────────────────
  app.get('/runs', async (req, reply) => {
    const caseId = Number(req.query?.caseId)
    if (!caseId) return reply.code(400).send({ error: '缺少 caseId' })

    const runs = await app.db.agentRun.findMany({
      where: { userId: req.user.userId, caseId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        progress: true,
        error: true,
        createdAt: true,
        updatedAt: true,
        lastTool: true,
      },
    })

    return runs
  })

  // ── GET /api/agent/runs/:id ─────────────────────────
  app.get('/runs/:id', async (req, reply) => {
    const runId = Number(req.params.id)
    if (!runId) return reply.code(400).send({ error: '缺少 runId' })

    const run = await app.db.agentRun.findFirst({
      where: { id: runId, userId: req.user.userId },
      select: {
        id: true,
        userId: true,
        caseId: true,
        type: true,
        status: true,
        progress: true,
        lastTool: true,
        lastResult: true,
        error: true,
        messages: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!run) return reply.code(404).send({ error: 'AgentRun 不存在' })

    let parsedMessages = []
    try {
      parsedMessages = run.messages ? JSON.parse(run.messages) : []
      if (!Array.isArray(parsedMessages)) parsedMessages = []
    } catch {
      parsedMessages = []
    }

    let parsedLastResult = null
    try {
      parsedLastResult = run.lastResult ? JSON.parse(run.lastResult) : null
    } catch {
      parsedLastResult = run.lastResult
    }

    return {
      id: run.id,
      caseId: run.caseId,
      type: run.type,
      status: run.status,
      progress: run.progress,
      error: run.error,
      lastTool: run.lastTool,
      lastResult: parsedLastResult,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      messages: parsedMessages,
    }
  })
}

