export async function requireAuth(request, reply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send({ error: '未登录或 token 已过期，请重新登录' })
  }
}
