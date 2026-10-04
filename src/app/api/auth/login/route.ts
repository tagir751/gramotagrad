import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, needsRehash, hashPassword } from '@/lib/password'
import { createSession, pruneExpiredSessions } from '@/lib/session'
import { logAction } from '@/lib/auth'
import { loginStep2Schema } from '@/lib/validators'
import { clientIp, handleApiError, rateLimit } from '@/lib/api'

/**
 * Фиктивный scrypt-хеш валидного формата для несуществующих teacherId.
 * verifyPassword против него всегда даёт false, но тратит столько же времени,
 * сколько настоящая проверка, — это и выравнивает тайминг.
 */
const DUMMY_HASH =
  'scrypt$16384$8$1$' +
  '00000000000000000000000000000000$' +
  '0'.repeat(128)

// POST /api/auth/login { teacherId, password }
// Единый нейтральный 401 без enumeration. Rate-limit 5/мин с IP.
export async function POST(req: Request) {
  try {
    const ip = clientIp(req)
    if (!rateLimit(`login:${ip}`)) {
      return NextResponse.json({ error: 'Слишком много попыток' }, { status: 429 })
    }
    const body = loginStep2Schema.parse(await req.json())

    const teacher = await db.teacher.findUnique({ where: { id: body.teacherId } })

    // Нейтральный ответ + ВЫРАВНИВАНИЕ ВРЕМЕНИ. Раньше здесь было короткое
    // замыкание `!teacher || !(await verify(...))`: для несуществующего id
    // ответ приходил мгновенно, для существующего — после scrypt (~100 мс),
    // то есть id перебирались по таймингу. Теперь scrypt выполняется всегда.
    const ok = await verifyPassword(body.password, teacher?.passwordHash ?? DUMMY_HASH)
    if (!teacher || !ok) {
      // ActionLog.teacherId — внешний ключ, поэтому запись о неудачной попытке
      // для несуществующего id раньше молча проваливалась (FK violation внутри
      // logAction). Логируем только то, что реально можно записать.
      if (teacher) await logAction(teacher.id, 'login_fail', 'Неудачный вход', ip)
      else console.warn(`login_fail: несуществующий teacherId=${body.teacherId} ip=${ip}`)
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
