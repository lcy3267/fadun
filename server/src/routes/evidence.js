import { requireAuth }     from '../middleware/auth.js'
import { analyzeEvidence } from '../services/ai.js'
import fmultipart          from '@fastify/multipart'
import { mkdirSync, unlinkSync, existsSync, writeFileSync, createReadStream } from 'fs'
import { join, dirname, basename }   from 'path'
import archiver from 'archiver'
import { fileURLToPath }   from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOADS_ROOT = join(__dirname, '../../uploads')

export default async function evidenceRoutes(app) {
  await app.register(fmultipart, { limits: { fileSize: 20 * 1024 * 1024 } }) // 20MB per file
  app.addHook('preHandler', requireAuth)

  // ── POST /api/evidence/upload ────────────────────
  // 一次上传一批图，并发到 ai 分析
  app.post('/upload', async (req, reply) => {
    const parts = req.parts()
    let caseId, caseData
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
      where:   { id: caseId, userId: req.user.userId },
      include: { plaintiff: true, defendant: true },
    })
    if (!c) return reply.code(404).send({ error: '案件不存在' })

    // 过滤图片文件
    const imageFiles = files.filter(f => f.mimetype.startsWith('image/'))
    if (!imageFiles.length) return reply.code(400).send({ error: '请上传图片文件' })

    // 准备保存目录
    const caseDir = join(UPLOADS_ROOT, String(caseId))
    mkdirSync(caseDir, { recursive: true })

    // 保存文件到磁盘
    const saved = imageFiles.map(f => {
      const safeName = `${Date.now()}_${f.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const filepath  = join(caseDir, safeName)
      writeFileSync(filepath, f.buf)
      return { filename: f.filename, safeName, filepath, mimetype: f.mimetype, b64: f.buf.toString('base64') }
    })

    // 调用 Claude 分析
    const groups   = JSON.parse(c.groups || '[]')
    const aiResults = await analyzeEvidence({
      images: saved.map(s => ({ mimetype: s.mimetype, b64: s.b64 })),
      caseInfo: {
        type:      c.type,
        goal:      c.goal,
        desc:      c.desc,
        defendant: { name: c.defendant?.name || '', rel: c.defendant?.rel || '' },
        groups,
      },
    })

    // 写入数据库
    const created = await Promise.all(saved.map(async (s, i) => {
      const r = aiResults[i]
      return app.db.evidence.create({
        data: {
          caseId,
          filename: s.filename,
          filepath: `${caseId}/${s.safeName}`,
          mimetype: s.mimetype,
          status:   r.valid ? 'valid' : 'invalid',
          evType:   r.evType  || '其他',
          group:    r.valid ? (r.group || null) : null,
          verdict:  r.verdict || '',
          isDemo:   false,
        },
      })
    }))

    // 更新案件 updatedAt
    await app.db.case.update({ where: { id: caseId }, data: { updatedAt: new Date() } })

    return created
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
