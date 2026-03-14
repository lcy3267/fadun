import { requireAuth }     from '../middleware/auth.js'
import { analyzeEvidence } from '../services/ai.js'
import fmultipart          from '@fastify/multipart'
import { mkdirSync, unlinkSync, existsSync, writeFileSync, readFileSync, createReadStream } from 'fs'
import { join, dirname, basename }   from 'path'
import archiver from 'archiver'
import { fileURLToPath }   from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOADS_ROOT = join(__dirname, '../../uploads')

export default async function evidenceRoutes(app) {
  await app.register(fmultipart, { limits: { fileSize: 20 * 1024 * 1024 } }) // 20MB per file
  app.addHook('preHandler', requireAuth)

  // ── POST /api/evidence/upload ────────────────────
  // 仅上传到服务器并落库，标记 caseId；不调用 AI，status=pending, aiVerified=false
  app.post('/upload', async (req, reply) => {
    const parts = req.parts()
    let caseId
    const files = []

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'caseId') {
        caseId = Number(part.value)
      } else if (part.type === 'file') {
        const buf = await part.toBuffer()
        files.push({ filename: part.filename, mimetype: part.mimetype, buf })
      }
    }

    if (!caseId) return reply.code(400).send({ error: '缺少 caseId' })

    // 验证案件归属
    const c = await app.db.case.findFirst({
      where: { id: caseId, userId: req.user.userId },
    })
    if (!c) return reply.code(404).send({ error: '案件不存在' })

    // 过滤图片文件
    const imageFiles = files.filter(f => f.mimetype.startsWith('image/'))
    if (!imageFiles.length) return reply.code(400).send({ error: '请上传图片文件' })

    const caseDir = join(UPLOADS_ROOT, String(caseId))
    mkdirSync(caseDir, { recursive: true })

    const created = await Promise.all(imageFiles.map(async (f) => {
      const safeName = `${Date.now()}_${f.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const filepath = join(caseDir, safeName)
      writeFileSync(filepath, f.buf)
      return app.db.evidence.create({
        data: {
          caseId,
          filename: f.filename,
          filepath: `${caseId}/${safeName}`,
          mimetype: f.mimetype,
          status:   'pending',
          evType:   '',
          group:    null,
          verdict:  '',
          aiVerified: false,
          isDemo:   false,
        },
      })
    }))

    await app.db.case.update({ where: { id: caseId }, data: { updatedAt: new Date() } })
    return created
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

    const c = await app.db.case.findFirst({
      where:   { id: caseId, userId: req.user.userId },
      include: { plaintiff: true, defendant: true },
    })
    const groups = JSON.parse(c.groups || '[]')

    const images = rows.map(ev => {
      const fullPath = join(UPLOADS_ROOT, ev.filepath)
      if (!existsSync(fullPath)) return null
      const buf = readFileSync(fullPath)
      return { mimetype: ev.mimetype, b64: buf.toString('base64') }
    }).filter(Boolean)

    if (images.length !== rows.length) {
      return reply.code(400).send({ error: '部分证据文件缺失，无法认证' })
    }

    const aiResults = await analyzeEvidence({
      images,
      caseInfo: {
        type:      c.type,
        goal:      c.goal,
        desc:      c.desc,
        defendant: { name: c.defendant?.name || '', rel: c.defendant?.rel || '' },
        groups,
      },
    })

    const updated = await Promise.all(rows.map((ev, i) => {
      const r = aiResults[i]
      return app.db.evidence.update({
        where: { id: ev.id },
        data:  {
          status:     r.valid ? 'valid' : 'invalid',
          evType:     r.evType || '其他',
          group:      r.valid ? (r.group || null) : null,
          verdict:    r.verdict || '',
          aiVerified: true,
        },
      })
    }))

    const hasValidNew = aiResults.some(r => r.valid)
    const caseUpdate = { updatedAt: new Date() }
    if (c.status === 'done' && hasValidNew) caseUpdate.status = 'active'
    await app.db.case.update({ where: { id: caseId }, data: caseUpdate })

    return updated
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
