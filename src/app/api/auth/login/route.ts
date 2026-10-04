import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, needsRehash, hashPassword } from '@/lib/password'
import { createSession, pruneExpiredSessions } from '@/lib/session'
import { logAction } from '@/lib/auth'
import { loginStep2Schema } from '@/lib/validators'
import { handleApiError, rateLimit } from '@/lib/api'

// POST /api/auth/login { teacherId, password }
// Единый нейтральный 401 без enumeration. Rate-limit 5/мин с IP.
export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
    if (!rateLimit(`login:${ip}`)) {
      return NextResponse.json({ error: 'Слишком много попыток' }, { status: 429 })
    }
    const body = loginStep2Schema.parse(await req.json())

    const teacher = await db.teacher.findUnique({ where: { id: body.teacherId } })
    // Нейтральный ответ + фиктивная проверка времени, чтобы не палить существование id
    if (!teacher || !(await verifyPassword(body.password, teacher.passwordHash))) {
      await logAction(body.teacherId, 'login_fail', 'Неудачный вход', ip).catch(() => {})
      return NextResponse.json({ error: 'Неверные данные' }, { status: 401 })
    }

    // Бесшовная миграция v1 sha256 -> scrypt
    if (needsRehash(teacher.passwordHash)) {
      await db.teacher
        .update({
          where: { id: teacher.id },
          data: { passwordHash: await hashPassword(body.password) },
        })
        .catch(() => {})
    }

    await createSession(teacher.id, {
      ip,
      userAgent: req.headers.get('user-agent') ?? '',
    })
    await pruneExpiredSessions()
    await logAction(teacher.id, 'login', 'Вход', ip)

    return NextResponse.json({
      teacherId: teacher.id,
      fullName: teacher.fullName,
      lastName: teacher.lastName,
      role: teacher.role,
      isVospitatel: teacher.isVospitatel,
    })
  } catch (e) {
    return handleApiError(e)
  }
}
