import { requireAuth }     from '../middleware/auth.js'
import fmultipart          from '@fastify/multipart'
import { mkdirSync, unlinkSync, existsSync, createWriteStream, createReadStream, realpathSync } from 'fs'
import { pipeline } from 'stream/promises'
import { join, dirname, basename, sep } from 'path'
import { createHash } from 'crypto'
import archiver from 'archiver'
import { fileURLToPath }   from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOADS_ROOT = join(__dirname, '../../uploads')
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])
const ALLOWED_EXT = new Set(['.pdf', '.docx', '.xlsx', '.txt', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'])

function splitName(name = '') {
  const normalized = (name || '').trim()
  const dot = normalized.lastIndexOf('.')
  if (dot <= 0 || dot === normalized.length - 1) return { base: normalized || 'file', ext: '' }
  return { base: normalized.slice(0, dot), ext: normalized.slice(dot).toLowerCase() }
}

function isAllowedFile(mimetype, ext) {
  return ALLOWED_MIME.has((mimetype || '').toLowerCase()) || ALLOWED_EXT.has((ext || '').toLowerCase())
}

/** Resolve file under UPLOADS_ROOT; reject path traversal. */
function safeUploadPath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return null
  const full = join(UPLOADS_ROOT, relativePath)
  if (!existsSync(full)) return null
  try {
    const rootReal = realpathSync(UPLOADS_ROOT)
    const fileReal = realpathSync(full)
    if (fileReal !== rootReal && !fileReal.startsWith(rootReal + sep)) return null
    return fileReal
  } catch {
    return null
  }
}

export default async function evidenceRoutes(app) {
  await app.register(fmultipart, { limits: { fileSize: 20 * 1024 * 1024 } }) // 20MB per file
  app.addHook('preHandler', requireAuth)

  // ── GET /api/evidence/uploads/:evidenceId ───────
  // 登录用户仅可下载本人案件下的证据文件（不走公开 /uploads 静态目录）
  app.get('/uploads/:evidenceId', async (req, reply) => {
    const id = Number(req.params.evidenceId)
    if (!id) return reply.code(400).send({ error: '缺少证据 ID' })

    const ev = await app.db.evidence.findFirst({
      where:   { id },
      include: { case: { select: { userId: true } } },
    })
    if (!ev || ev.case.userId !== req.user.userId) {
      return reply.code(404).send({ error: '证据不存在' })
    }
    if (ev.isDemo || !ev.filepath) {
      return reply.code(404).send({ error: '无可用文件' })
    }

    const fullPath = safeUploadPath(ev.filepath)
    if (!fullPath) return reply.code(404).send({ error: '文件不存在' })

    const stream = createReadStream(fullPath)
    stream.on('error', () => {
      if (!reply.sent) reply.code(500).send({ error: '读取文件失败' })
    })

    return reply
      .type(ev.mimetype || 'application/octet-stream')
      .header('Cache-Control', 'private, max-age=300')
      .send(stream)
  })

  // ── POST /api/evidence/upload ────────────────────
  // 仅上传到服务器并落库，标记 caseId；不调用 AI，status=pending, aiVerified=false
  app.post('/upload', async (req, reply) => {
    const parts = req.parts()
    let caseId
    let caseChecked = false
    const created = []

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'caseId') {
        caseId = Number(part.value)
        continue
      }
      if (part.type !== 'file') continue

      if (!caseId) {
        part.file.resume()
        continue
      }

      if (!caseChecked) {
        const c = await app.db.case.findFirst({
          where: { id: caseId, userId: req.user.userId },
        })
        if (!c) {
          part.file.resume()
          return reply.code(404).send({ error: '案件不存在' })
        }
        caseChecked = true
      }

      const caseDir = join(UPLOADS_ROOT, String(caseId))
      mkdirSync(caseDir, { recursive: true })

      const originalName = part.filename || 'file'
      const { base, ext } = splitName(originalName)
      if (!isAllowedFile(part.mimetype, ext)) {
        part.file.resume()
        continue
      }

      const safeName = `${Date.now()}_${base.replace(/[^a-zA-Z0-9._-]/g, '_')}${ext}`
      const fullPath = join(caseDir, safeName)
      const relativePath = `${caseId}/${safeName}`
      const hash = createHash('sha256')
      let size = 0
      part.file.on('data', (chunk) => {
        size += chunk.length
        hash.update(chunk)
      })
      await pipeline(part.file, createWriteStream(fullPath))

      created.push(await app.db.evidence.create({
        data: {
          caseId,
          filename: originalName,
          filepath: relativePath,
          ext,
          size,
          sha256: hash.digest('hex'),
          text: null,
          meta: null,
          processedAt: null,
          ocrText: null,
          mimetype: part.mimetype || '',
          status: 'pending',
          evType: '',
          group: null,
          verdict: '',
          aiVerified: false,
          isDemo: false,
        },
      }))
    }

    if (!caseId) return reply.code(400).send({ error: '缺少 caseId' })

    if (!created.length) {
      return reply.code(400).send({ error: '文件格式不支持（仅支持 jpg/png/webp/pdf/docx/xlsx/txt）' })
    }

    const parseTask = await app.db.task.create({
      data: {
        userId: req.user.userId,
        caseId,
        type: 'evidence_parse',
        status: 'queued',
        progress: 0,
        payload: JSON.stringify({ evidenceIds: created.map(e => e.id) }),
      },
    })
    app.taskRunner.enqueue(parseTask).catch(() => {})

    await app.db.case.update({ where: { id: caseId }, data: { updatedAt: new Date() } })
    return { taskId: parseTask.id, created }
  })

  // ── POST /api/evidence/verify ────────────────────
  // 用户多选待认证图片，调用 AI 进行证据归类认证；已识别（aiVerified=true）禁止再认证
  app.post('/verify', {
    schema: {
      body: {
        type: 'object',
        required: ['evidenceIds'],
        properties: { evidenceIds: { type: 'array', items: { type: 'integer' } } },
      },
    },
  }, async (req, reply) => {
    const { evidenceIds } = req.body
    if (!Array.isArray(evidenceIds) || !evidenceIds.length) {
      return reply.code(400).send({ error: '请选择要认证的证据' })
    }

    const ids = [...new Set(evidenceIds.map(Number))]
    const rows = await app.db.evidence.findMany({
      where: { id: { in: ids } },
      include: { case: { select: { userId: true, id: true } } },
    })

    if (rows.length !== ids.length) {
      return reply.code(404).send({ error: '部分证据不存在' })
    }
    const caseId = rows[0].caseId
    if (rows.some(r => r.caseId !== caseId)) {
      return reply.code(400).send({ error: '所选证据须属于同一案件' })
    }
    if (rows[0].case.userId !== req.user.userId) {
      return reply.code(404).send({ error: '案件不存在' })
    }
    const alreadyVerified = rows.filter(r => r.aiVerified)
    if (alreadyVerified.length) {
      return reply.code(400).send({ error: '已识别的图片禁止再次认证' })
    }

    if (rows.some(ev => !existsSync(join(UPLOADS_ROOT, ev.filepath)))) {
      return reply.code(400).send({ error: '部分证据文件缺失，无法认证' })
    }

    const task = await app.db.task.create({
      data: {
        userId: req.user.userId,
        caseId,
        type: 'evidence_analyze',
        status: 'queued',
        progress: 0,
        payload: JSON.stringify({ evidenceIds: rows.map(r => r.id) }),
      },
    })
    app.taskRunner.enqueue(task).catch(() => {})

    return { taskId: task.id }
  })

  // ── DELETE /api/evidence/:id ─────────────────────
  app.delete('/:id', async (req, reply) => {
    const id = Number(req.params.id)
    const ev = await app.db.evidence.findFirst({
      where:   { id },
      include: { case: { select: { userId: true } } },
    })
    if (!ev || ev.case.userId !== req.user.userId) {
      return reply.code(404).send({ error: '证据不存在' })
    }

    // 删除文件（demo 占位证据无文件）
    if (!ev.isDemo && ev.filepath) {
      const fullPath = join(UPLOADS_ROOT, ev.filepath)
      if (existsSync(fullPath)) unlinkSync(fullPath)
    }

    await app.db.evidence.delete({ where: { id } })
    return { ok: true }
  })

  // ── GET /api/evidence/download/:caseId ───────────
  // 下载指定案件的所有证据为带目录的 zip
  app.get('/download/:caseId', async (req, reply) => {
    const caseId = Number(req.params.caseId)
    if (!caseId) return reply.code(400).send({ error: '缺少 caseId' })

    const c = await app.db.case.findFirst({
      where:   { id: caseId, userId: req.user.userId },
      include: { plaintiff: true },
    })
    if (!c) return reply.code(404).send({ error: '案件不存在' })

    const evidence = await app.db.evidence.findMany({
      where: { caseId, isDemo: false },
      orderBy: { id: 'asc' },
    })
    if (!evidence.length) return reply.code(400).send({ error: '暂无可下载的证据' })

    const safeName = (s) => (s || '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]/g, '_') || '案件'
    const rootDir = `${safeName(c.plaintiff?.name)}_${safeName(c.type)}_证据`

    reply.header('Content-Type', 'application/zip')
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(rootDir)}.zip"`)

    const archive = archiver('zip', { zlib: { level: 9 } })

    archive.on('error', (err) => {
      reply.raw.destroy(err)
    })

    archive.pipe(reply.raw)

    for (const ev of evidence) {
      if (!ev.filepath) continue
      const fullPath = join(UPLOADS_ROOT, ev.filepath)
      if (!existsSync(fullPath)) continue

      const groupName = safeName(ev.group || ev.evType || '未归类')
      const fileName  = basename(fullPath)
      const entryPath = `${rootDir}/${groupName}/${fileName}`

      archive.file(fullPath, { name: entryPath })
    }

    await archive.finalize()
    return reply
  })
}
