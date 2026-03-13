import { config } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env') })

import Fastify        from 'fastify'
import dbPlugin       from './plugins/db.js'
import jwtPlugin      from './plugins/jwt.js'
import staticPlugin   from './plugins/static.js'
import corsPlugin     from './plugins/cors.js'
import authRoutes     from './routes/auth.js'
import casesRoutes    from './routes/cases.js'
import evidenceRoutes from './routes/evidence.js'
import aiRoutes       from './routes/ai.js'

const app = Fastify({ logger: { level: 'info' } })

await app.register(corsPlugin)
await app.register(dbPlugin)
await app.register(jwtPlugin)
await app.register(staticPlugin)

await app.register(authRoutes,     { prefix: '/api/auth' })
await app.register(casesRoutes,    { prefix: '/api/cases' })
await app.register(evidenceRoutes, { prefix: '/api/evidence' })
await app.register(aiRoutes,       { prefix: '/api/ai' })

app.get('/api/health', async () => ({ ok: true }))

try {
  const port = Number(process.env.PORT) || 3000
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`\n🛡  法盾 server → http://localhost:${port}\n`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
