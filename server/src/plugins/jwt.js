import fp from 'fastify-plugin'
import fjwt from '@fastify/jwt'

export default fp(async function (app) {
  app.register(fjwt, {
    secret: process.env.JWT_SECRET || 'fallback_dev_secret_change_in_prod',
    sign: { expiresIn: '7d' },
  })

  app.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ error: '未登录或 token 已过期，请重新登录' })
    }
  })
})
