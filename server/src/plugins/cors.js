import fp from 'fastify-plugin'
import fcors from '@fastify/cors'

export default fp(async function (app) {
  app.register(fcors, {
    origin: ['http://localhost:5173', 'http://localhost:4173'],
    credentials: true,
  })
})
