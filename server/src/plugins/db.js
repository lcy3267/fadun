import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'
import { config } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// 确保 Prisma 能读到 DATABASE_URL（无论从哪个目录启动）
config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../../.env') })

export default fp(async function (app) {
  const prisma = new PrismaClient()
  await prisma.$connect()
  app.decorate('db', prisma)
  app.addHook('onClose', async () => { await prisma.$disconnect() })
})
