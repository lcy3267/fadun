function asTask(task) {
  return {
    ...task,
    payload: task.payload ? JSON.parse(task.payload) : null,
    result: task.result ? JSON.parse(task.result) : null,
  }
}

export default async function taskRoutes(app) {
  async function resolveUser(req, reply) {
    try {
      if (req.headers.authorization) {
        await req.jwtVerify()
        return req.user
      }
      const token = req.query?.token
      if (!token) throw new Error('missing token')
      return await app.jwt.verify(token)
    } catch {
      reply.code(401).send({ error: '未登录或 token 已过期，请重新登录' })
      return null
    }
  }

  app.get('/:id', async (req, reply) => {
    const user = await resolveUser(req, reply)
    if (!user) return
    const id = Number(req.params.id)
    const task = await app.db.task.findFirst({ where: { id, userId: user.userId } })
    if (!task) return reply.code(404).send({ error: '任务不存在' })
    return asTask(task)
  })

  app.get('/:id/stream', async (req, reply) => {
    const user = await resolveUser(req, reply)
    if (!user) return
    const id = Number(req.params.id)
    const task = await app.db.task.findFirst({ where: { id, userId: user.userId } })
    if (!task) return reply.code(404).send({ error: '任务不存在' })

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.flushHeaders?.()

    const write = (event, data) => {
      reply.raw.write(`event: ${event}\n`)
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    write('progress', { task: asTask(task) })

    const unsubscribe = app.taskRunner.onTask(id, async (evt) => {
      const latest = await app.db.task.findUnique({ where: { id } })
      if (evt.type === 'item_done') write('item_done', evt)
      else if (evt.type === 'task_error') write('task_error', evt)
      else if (evt.type === 'all_done') write('all_done', { task: asTask(latest) })
      else write('progress', { task: asTask(latest) })
    })

    const hb = setInterval(() => reply.raw.write(': ping\n\n'), 15000)
    req.raw.on('close', () => {
      clearInterval(hb)
      unsubscribe()
      reply.raw.end()
    })
  })
}
