import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(plain, hashed) {
  return bcrypt.compare(plain, hashed)
}

export function signToken(app, payload) {
  return app.jwt.sign(payload)
}
