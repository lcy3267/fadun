import fp from 'fastify-plugin'
import fstatic from '@fastify/static'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default fp(async function (app) {
  app.register(fstatic, {
    root:   join(__dirname, '../../uploads'),
    prefix: '/uploads/',
  })
})
