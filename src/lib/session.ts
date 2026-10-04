import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'node:crypto'
import { db } from './db'
import { SESSION_COOKIE } from './cookie'
import type { AuthSession } from './auth'

export { SESSION_COOKIE }
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 // 7 дней, как в v1

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function sessionCookieOptions(maxAge = SESSION_MAX_AGE) {
  return {
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

/** Создаёт сессию в БД и возвращает raw token (кладётся в cookie). В БД хранится только sha256. */
export async function createSession(
  teacherId: number,
  opts: { ip?: string; userAgent?: string } = {},
): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      teacherId,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
      ip: opts.ip ?? '',
      userAgent: opts.userAgent ?? '',
    },
  })
  const store = await cookies()
  store.set({ ...sessionCookieOptions(), value: token })
  return token
}

/** Валидирует cookie -> AuthSession | null. Чистит протухшие сессии лениво. */
export async function getSession(): Promise<AuthSession | null> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (!token || token.length < 20) return null

    const row = await db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { teacher: true },
    })
    if (!row) return null
    if (row.expiresAt.getTime() < Date.now()) {
      await db.session.delete({ where: { tokenHash: hashToken(token) } }).catch(() => {})
      return null
    }
    return {
      teacherId: row.teacher.id,
      fullName: row.teacher.fullName,
      lastName: row.teacher.lastName,
      role: row.teacher.role,
      isVospitatel: row.teacher.isVospitatel,
    }
  } catch {
    return null
  }
}

/** Удаляет текущую сессию (logout) + чистит cookie. */
export async function destroySession(): Promise<void> {
  try {
    const store = await cookies()
    const token = store.get(SESSION_COOKIE)?.value
    if (token) {
      await db.session.delete({ where: { tokenHash: hashToken(token) } }).catch(() => {})
    }
    store.set({ ...sessionCookieOptions(0), value: '' })
  } catch {
    // silent
  }
}

/** Периодическая чистка (вызывать из cron/при логине, 1% шанс). */
export async function pruneExpiredSessions(): Promise<void> {
  try {
    if (Math.random() > 0.01) return
    await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  } catch {
    // silent
  }
}
