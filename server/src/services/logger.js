import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const logsDir = path.join(__dirname, '..', 'logs')
const aiLogFile = path.join(logsDir, 'ai.log')

async function ensureLogDir() {
  try {
    await fs.mkdir(logsDir, { recursive: true })
  } catch {
    // ignore mkdir errors
  }
}

export async function logAiEvent(event) {
  const lineObj = {
    timestamp: new Date().toISOString(),
    ...event,
  }

  const line = `[AI] ${JSON.stringify(lineObj)}\n`

  try {
    await ensureLogDir()
    await fs.appendFile(aiLogFile, line, 'utf8')
  } catch {
    // 避免日志写入影响正常业务流程
  }
}

