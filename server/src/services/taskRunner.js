import { EventEmitter } from 'events'
import path from 'path'
import pLimit from 'p-limit'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { parseToText } from './fileParser.js'
import { analyzeEvidenceImages, analyzeEvidenceTexts } from './ai.js'

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

export function buildTaskRunner(app) {
  const emitter = new EventEmitter()
  const limit = pLimit(2)

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

    for (let i = 0; i < rows.length; i++) {
      const ev = rows[i]
      try {
        const fullPath = path.join(UPLOADS_ROOT, ev.filepath || '')
        const sharedCaseInfo = {
          type: caseInfo.type,
          goal: caseInfo.goal,
          desc: caseInfo.desc,
          defendant: { name: caseInfo.defendant?.name || '', rel: caseInfo.defendant?.rel || '' },
          groups,
        }
        let parsedText = ev.text || ''
        let aiResults
        if (isImageEvidence(ev)) {
          aiResults = await analyzeEvidenceImages({
            images: [{ mimetype: ev.mimetype, b64: Buffer.from(await readFile(fullPath)).toString('base64') }],
            caseInfo: sharedCaseInfo,
          })
        } else {
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
          aiResults = await analyzeEvidenceTexts({
            texts: [parsedText],
            caseInfo: sharedCaseInfo,
          })
        }

        const r = aiResults[0] || {}
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
      } catch (err) {
        failCount += 1
        await app.db.evidence.update({
          where: { id: ev.id },
          data: {
            status: 'invalid',
            evType: ev.evType || '其他',
            group: null,
            verdict: `AI 认证失败：${err?.message || '服务暂不可用'}`,
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

      const progress = Math.max(1, Math.round(((i + 1) / rows.length) * 100))
      await patchTask(task.id, { progress })
      await publish(task.id, { type: 'item_done', evidenceId: ev.id, step: 'analyze', progress })
    }

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
  }

  function enqueue(task) {
    return limit(async () => {
      try {
        if (task.type === 'evidence_parse') return await runParseTask(task)
        if (task.type === 'evidence_analyze') return await runAnalyzeTask(task)
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
