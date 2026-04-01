import { EventEmitter } from 'events'
import path from 'path'
import pLimit from 'p-limit'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { parseToText } from './fileParser.js'
import { analyzeEvidenceImages, analyzeEvidenceTexts } from './ai.js'
import { buildEvidenceIndexForCase } from './rag/evidenceIndex.js'
import { runPublicEvidenceAgent } from './publicEvidence/agentService.js'
import { PUBLIC_AGENT_TASK_TYPE } from './publicEvidence/contract.js'
import { buildAgentRunner } from '../agent/runner.js'
import { generateCaseChatReply } from '../agent/chatService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_ROOT = path.join(__dirname, '../../uploads')

function safeParseJson(text, fallback) {
  if (!text) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function isImageEvidence(ev) {
  return (ev?.mimetype || '').toLowerCase().startsWith('image/')
}

const IMAGE_BATCH = 1
const ANALYZE_UNITS_CONCURRENCY = 3

function buildAnalyzeWorkUnits(rows) {
  const units = []
  let imageBuf = []
  const flushImages = () => {
    if (!imageBuf.length) return
    units.push({ kind: 'images', items: [...imageBuf] })
    imageBuf = []
  }
  for (const ev of rows) {
    if (isImageEvidence(ev)) {
      imageBuf.push(ev)
      if (imageBuf.length >= IMAGE_BATCH) flushImages()
    } else {
      flushImages()
      units.push({ kind: 'text', items: [ev] })
    }
  }
  flushImages()
  return units
}

export function buildTaskRunner(app) {
  const emitter = new EventEmitter()
  const limit = pLimit(2)
  const analyzeUnitsLimit = pLimit(ANALYZE_UNITS_CONCURRENCY)
  const agentRunner = buildAgentRunner(app)

  async function patchTask(taskId, data) {
    const task = await app.db.task.update({ where: { id: taskId }, data })
    emitter.emit(`task:${taskId}`, { type: 'progress', task })
    return task
  }

  async function publish(taskId, event) {
    emitter.emit(`task:${taskId}`, event)
  }

  async function runParseTask(task) {
    const payload = safeParseJson(task.payload, {})
    const evidenceIds = Array.isArray(payload.evidenceIds) ? payload.evidenceIds : []
    const rows = await app.db.evidence.findMany({ where: { id: { in: evidenceIds } }, orderBy: { id: 'asc' } })
    if (!rows.length) throw new Error('无可解析证据')

    await patchTask(task.id, { status: 'running', progress: 1 })
    for (let i = 0; i < rows.length; i++) {
      const ev = rows[i]
      const fullPath = path.join(UPLOADS_ROOT, ev.filepath || '')
      const parsed = await parseToText({ fullPath, mimetype: ev.mimetype, ext: ev.ext })
      await app.db.evidence.update({
        where: { id: ev.id },
        data: {
          text: parsed.text || '',
          ocrText: ev.mimetype?.startsWith('image/') ? (parsed.text || '') : ev.ocrText,
          meta: JSON.stringify(parsed.meta || {}),
          processedAt: new Date(),
        },
      })
      const progress = Math.max(1, Math.round(((i + 1) / rows.length) * 100))
      await patchTask(task.id, { progress })
      await publish(task.id, { type: 'item_done', evidenceId: ev.id, step: 'parse', progress })
    }

    await patchTask(task.id, {
      status: 'succeeded',
      progress: 100,
      result: JSON.stringify({ parsedCount: rows.length }),
      error: null,
    })
    await publish(task.id, { type: 'all_done' })
  }

  async function runAnalyzeTask(task) {
    const payload = safeParseJson(task.payload, {})
    const evidenceIds = Array.isArray(payload.evidenceIds) ? payload.evidenceIds : []
    const rows = await app.db.evidence.findMany({
      where: { id: { in: evidenceIds } },
      include: { case: { include: { defendant: true } } },
      orderBy: { id: 'asc' },
    })
    if (!rows.length) throw new Error('无可分析证据')

    const caseId = rows[0].caseId
    const caseInfo = rows[0].case
    const groups = safeParseJson(caseInfo.groups, [])

    await patchTask(task.id, { status: 'running', progress: 1 })
    let hasValidNew = false
    let successCount = 0
    let failCount = 0
    let completed = 0
    const total = rows.length

    const sharedCaseInfo = {
      type: caseInfo.type,
      goal: caseInfo.goal,
      desc: caseInfo.desc,
      defendant: { name: caseInfo.defendant?.name || '', rel: caseInfo.defendant?.rel || '' },
      groups,
    }

    let finishChain = Promise.resolve()
    function scheduleFinish(fn) {
      const run = finishChain.then(() => fn())
      finishChain = run.catch(() => {})
      return run
    }

    function finishEvidence(ev, { ok, r, err }) {
      return scheduleFinish(async () => {
        if (ok) {
          if (r.valid) hasValidNew = true
          await app.db.evidence.update({
            where: { id: ev.id },
            data: {
              status: r.valid ? 'valid' : 'invalid',
              evType: r.evType || '其他',
              group: r.valid ? (r.group || null) : null,
              verdict: r.verdict || '',
              ocrText: r.valid ? (r.ocrText || '') : '',
              aiVerified: true,
            },
          })
          successCount += 1
        } else {
          failCount += 1
          const msg = err?.message || '服务暂不可用'
          await app.db.evidence.update({
            where: { id: ev.id },
            data: {
              status: 'invalid',
              evType: ev.evType || '其他',
              group: null,
              verdict: `AI 认证失败：${msg}`,
              ocrText: '',
              aiVerified: false,
            },
          })
          await publish(task.id, {
            type: 'item_done',
            evidenceId: ev.id,
            step: 'analyze_failed',
            message: err?.message || String(err),
          })
        }
        completed += 1
        const progress = Math.max(1, Math.round((completed / total) * 100))
        await patchTask(task.id, { progress })
        await publish(task.id, { type: 'item_done', evidenceId: ev.id, step: 'analyze', progress })
      })
    }

    async function runImageUnit(items) {
      try {
        const images = await Promise.all(
          items.map(async (ev) => {
            const fullPath = path.join(UPLOADS_ROOT, ev.filepath || '')
            const b64 = Buffer.from(await readFile(fullPath)).toString('base64')
            return { mimetype: ev.mimetype, b64 }
          }),
        )
        const aiResults = await analyzeEvidenceImages({ images, caseInfo: sharedCaseInfo })
        await Promise.all(
          items.map((ev, i) => finishEvidence(ev, { ok: true, r: aiResults[i] || {} })),
        )
      } catch (err) {
        await Promise.all(items.map((ev) => finishEvidence(ev, { ok: false, err })))
      }
    }

    async function runTextUnit(ev) {
      try {
        const fullPath = path.join(UPLOADS_ROOT, ev.filepath || '')
        let parsedText = ev.text || ''
        if (!parsedText) {
          const parsed = await parseToText({ fullPath, mimetype: ev.mimetype, ext: ev.ext })
          parsedText = parsed.text || ''
          await app.db.evidence.update({
            where: { id: ev.id },
            data: {
              text: parsedText,
              meta: JSON.stringify(parsed.meta || {}),
              processedAt: new Date(),
            },
          })
        }
        const aiResults = await analyzeEvidenceTexts({
          texts: [parsedText],
          caseInfo: sharedCaseInfo,
        })
        const r = aiResults[0] || {}
        await finishEvidence(ev, { ok: true, r })
      } catch (err) {
        await finishEvidence(ev, { ok: false, err })
      }
    }

    const units = buildAnalyzeWorkUnits(rows)
    await Promise.all(
      units.map((u) =>
        analyzeUnitsLimit(() => (u.kind === 'images' ? runImageUnit(u.items) : runTextUnit(u.items[0]))),
      ),
    )
    await finishChain

    const caseUpdate = { updatedAt: new Date() }
    if (caseInfo.status === 'done' && hasValidNew) caseUpdate.status = 'active'
    await app.db.case.update({ where: { id: caseId }, data: caseUpdate })
    const status = successCount === 0 ? 'failed' : 'succeeded'
    await patchTask(task.id, {
      status,
      progress: 100,
      result: JSON.stringify({ analyzedCount: rows.length, successCount, failCount }),
      error: status === 'failed' ? '全部证据认证失败' : (failCount > 0 ? `部分失败：${failCount} 条` : null),
    })
    await publish(task.id, { type: status === 'failed' ? 'task_error' : 'all_done', message: status === 'failed' ? '全部证据认证失败' : undefined })

    // 仅在分析成功后（至少有部分证据分析成功）刷新当前案件向量索引
    if (status === 'succeeded') {
      const ragTask = await app.db.task.create({
        data: {
          userId: task.userId,
          caseId,
          type: 'evidence_rag_index',
          status: 'queued',
          progress: 0,
          payload: JSON.stringify({ caseId }),
        },
      })
      // 放到队列里异步执行，不阻塞当前分析任务
      void enqueue(ragTask).catch(() => {})
    }
  }

  async function runEvidenceRagIndexTask(task) {
    const payload = safeParseJson(task.payload, {})
    const caseId = payload?.caseId || task.caseId
    const userId = task.userId
    if (!caseId) throw new Error('caseId required')

    const caseExists = await app.db.case.findFirst({
      where: { id: caseId, userId },
      select: { id: true },
    })
    if (!caseExists) throw new Error('案件不存在')

    await patchTask(task.id, { status: 'running', progress: 1 })
    const res = await buildEvidenceIndexForCase({ app, caseId })

    await patchTask(task.id, {
      status: 'succeeded',
      progress: 100,
      result: JSON.stringify({ ...res }),
      error: null,
    })
    await publish(task.id, { type: 'all_done' })
  }

  async function runCaseAgentTask(task) {
    const payload = safeParseJson(task.payload, {})
    const caseId = payload?.caseId || task.caseId
    const userId = task.userId
    if (!caseId) throw new Error('caseId required')

    const caseExists = await app.db.case.findFirst({ where: { id: caseId, userId } })
    if (!caseExists) throw new Error('案件不存在')

    const agentRun = await app.db.agentRun.create({
      data: {
        userId,
        caseId,
        type: 'case_agent_run',
        status: 'running',
        progress: 1,
        messages: JSON.stringify([]),
        lastTool: null,
        lastResult: null,
        error: null,
      },
    })

    await patchTask(task.id, { status: 'running', progress: 1 })
    const maxSteps = 10

    try {
      const r = await agentRunner.runCaseAgent({ agentRunId: agentRun.id, userId, caseId, maxSteps })

      const resultObj = {
        agentRunId: agentRun.id,
        status: r.status,
        notification: r.notifyResult,
        gapResult: r.gapResult,
      }

      await patchTask(task.id, {
        status: 'succeeded',
        progress: 100,
        result: JSON.stringify(resultObj),
        error: null,
      })

      await publish(task.id, { type: 'item_done', step: 'agent_done', agentRunId: agentRun.id })
      await publish(task.id, { type: 'all_done' })
    } catch (err) {
      await patchTask(task.id, {
        status: 'failed',
        progress: 100,
        result: null,
        error: err?.message || String(err),
      })
      await publish(task.id, { type: 'task_error', message: err?.message || String(err) })
    }
  }

  async function runCaseChatTask(task) {
    const payload = safeParseJson(task.payload, {})
    const sessionId = payload?.sessionId
    const caseId = payload?.caseId || task.caseId

    if (!sessionId || !caseId) throw new Error('case_agent_chat 缺少 sessionId/caseId')

    await patchTask(task.id, { status: 'running', progress: 1 })

    try {
      const session = await app.db.chatSession.findFirst({ where: { id: sessionId, caseId, userId: task.userId } })
      if (!session) throw new Error('ChatSession 不存在')

      const caseRecord = await app.db.case.findFirst({
        where: { id: caseId, userId: task.userId },
        include: { plaintiff: true, defendant: true },
      })
      if (!caseRecord) throw new Error('案件不存在')

      const groups = (() => {
        try { return JSON.parse(caseRecord.groups || '[]') } catch { return [] }
      })()

      const excludeUserMessageId = payload?.userMessageId ? Number(payload.userMessageId) : null

      const messagesAsc = await app.db.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
      const messages = [...messagesAsc]
        .reverse()
        .filter(m => !(excludeUserMessageId && Number(m.id) === excludeUserMessageId))

      const evidenceList = await app.db.evidence.findMany({
        where: { caseId, status: 'valid' },
        orderBy: { id: 'asc' },
        take: 30,
        select: {
          id: true,
          group: true,
          evType: true,
          verdict: true,
          mimetype: true,
          text: true,
          ocrText: true,
        },
      })

      let userMessage = null
      if (payload?.userMessageId) {
        const um = await app.db.chatMessage.findFirst({ where: { id: payload.userMessageId, sessionId } })
        userMessage = um?.content || null
      }

      const history = messages.map(m => ({ role: m.role, content: m.content }))

      let streamedLen = 0
      const assistantText = await generateCaseChatReply({
        app,
        userId: task.userId,
        caseId,
        userMessage: userMessage || '',
        caseData: {
          type: caseRecord.type,
          goal: caseRecord.goal,
          desc: caseRecord.desc,
          plaintiff: caseRecord.plaintiff,
          defendant: caseRecord.defendant,
          groups,
        },
        evidenceList,
        history,
        onStreamDelta: (delta) => {
          const d = String(delta || '')
          if (!d) return
          streamedLen += d.length
          const progress = Math.min(94, 10 + Math.floor(streamedLen / 24))
          void publish(task.id, {
            type: 'item_done',
            step: 'chat_delta',
            sessionId,
            delta: d,
            progress,
          })
        },
      })

      await patchTask(task.id, { progress: 95 })

      const assistantMessage = await app.db.chatMessage.create({
        data: { sessionId, role: 'assistant', content: assistantText },
      })

      await patchTask(task.id, {
        status: 'succeeded',
        progress: 100,
        result: JSON.stringify({ sessionId, assistantMessageId: assistantMessage.id, assistantText }),
        error: null,
      })

      await publish(task.id, { type: 'all_done' })
    } catch (err) {
      await patchTask(task.id, {
        status: 'failed',
        progress: 100,
        result: null,
        error: err?.message || String(err),
      })
      await publish(task.id, { type: 'task_error', message: err?.message || String(err) })
    }
  }

  async function runCasePublicAgentTask(task) {
    const payload = safeParseJson(task.payload, {})
    const caseId = Number(payload?.caseId || task.caseId || 0)
    if (!caseId) throw new Error('caseId required')

    await patchTask(task.id, { status: 'running', progress: 1 })
    const result = await runPublicEvidenceAgent({
      app,
      userId: task.userId,
      caseId,
      payload,
      onProgress: async (phase, progress, extra) => {
        await patchTask(task.id, { progress: Math.max(1, Math.min(99, Number(progress || 1))) })
        await publish(task.id, { type: 'item_done', step: phase, ...(extra || {}) })
      },
    })

    await patchTask(task.id, {
      status: 'succeeded',
      progress: 100,
      result: JSON.stringify(result || {}),
      error: null,
    })
    await publish(task.id, { type: 'all_done' })
  }

  function enqueue(task) {
    return limit(async () => {
      try {
        if (task.type === 'evidence_parse') return await runParseTask(task)
        if (task.type === 'evidence_analyze') return await runAnalyzeTask(task)
        if (task.type === 'evidence_rag_index') return await runEvidenceRagIndexTask(task)
        if (task.type === 'case_agent_run') return await runCaseAgentTask(task)
        if (task.type === 'case_agent_chat') return await runCaseChatTask(task)
        if (task.type === PUBLIC_AGENT_TASK_TYPE) return await runCasePublicAgentTask(task)
        throw new Error(`未知任务类型: ${task.type}`)
      } catch (err) {
        await app.db.task.update({
          where: { id: task.id },
          data: {
            status: 'failed',
            error: err?.message || String(err),
          },
        })
        await publish(task.id, { type: 'task_error', message: err?.message || String(err) })
        throw err
      }
    })
  }

  function onTask(taskId, listener) {
    emitter.on(`task:${taskId}`, listener)
    return () => emitter.off(`task:${taskId}`, listener)
  }

  return { enqueue, onTask }
}
