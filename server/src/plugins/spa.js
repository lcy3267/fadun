import fp from 'fastify-plugin'
import fstatic from '@fastify/static'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const clientDist = join(__dirname, '../../../client/dist')

export default fp(async function spaPlugin(app) {
  if (!existsSync(clientDist)) {
    app.log.info('client/dist not found, skipping SPA static (run npm run build for production)')
    return
  }

  app.register(fstatic, {
    root: clientDist,
    prefix: '/',
    // @fastify/static v8 的 index 选项需要是字符串数组或 false
    index: ['index.html'],
  })

  app.setNotFoundHandler((request, reply) => {
    if (request.method !== 'GET') {
      return reply.code(404).send({ error: 'Not Found' })
    }
    return reply.sendFile('index.html', clientDist)
  })
})
