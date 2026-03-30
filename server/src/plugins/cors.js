import fp from 'fastify-plugin'
import fcors from '@fastify/cors'

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:5173', 'http://127.0.0.1:4173']

function parseOrigins() {
  const raw = process.env.CORS_ORIGIN
  if (!raw || !raw.trim()) return DEFAULT_ORIGINS
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export default fp(async function (app) {
  app.register(fcors, {
    origin: parseOrigins(),
    credentials: true,
  })
})
