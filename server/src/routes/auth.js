import { hashPassword, verifyPassword, signToken } from '../services/auth.js'
import { createDemoCase } from '../services/demo.js'

export default async function authRoutes(app) {

  // ── POST /api/auth/register ──────────────────────
  app.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'password', 'confirmPassword'],
        properties: {
          phone:           { type: 'string', pattern: '^1[3-9]\\d{9}$' },
          password:        { type: 'string', minLength: 6, maxLength: 64 },
          confirmPassword: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { phone, password, confirmPassword } = req.body

    if (password !== confirmPassword) {
      return reply.code(400).send({ error: '两次密码输入不一致' })
    }

    const exists = await app.db.user.findUnique({ where: { phone } })
    if (exists) {
      return reply.code(409).send({ error: '该手机号已注册' })
    }

    const hashed = await hashPassword(password)
    const user   = await app.db.user.create({ data: { phone, password: hashed } })

    // 为新用户生成演示案件
    await createDemoCase(app.db, user.id)

    const token = signToken(app, { userId: user.id, phone: user.phone })
    return reply.code(201).send({ token, user: { id: user.id, phone: user.phone } })
  })

  // ── POST /api/auth/login ─────────────────────────
  app.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone:    { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const { phone, password } = req.body

    const user = await app.db.user.findUnique({ where: { phone } })
    if (!user) {
      return reply.code(401).send({ error: '手机号或密码错误' })
    }

    const ok = await verifyPassword(password, user.password)
    if (!ok) {
      return reply.code(401).send({ error: '手机号或密码错误' })
    }

    const token = signToken(app, { userId: user.id, phone: user.phone })
    return { token, user: { id: user.id, phone: user.phone } }
  })

  // ── GET /api/auth/me ─────────────────────────────
  app.get('/me', { preHandler: [app.authenticate] }, async (req) => {
    return { user: req.user }
  })
}
