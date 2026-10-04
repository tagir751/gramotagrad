import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, logAction } from '@/lib/auth'
import { changePasswordSchema } from '@/lib/validators'
import { hashPassword } from '@/lib/password'
import { handleApiError } from '@/lib/api'

// POST /api/admin/passwords — ТОЛЬКО админ. Сброс пароля + kill всех сессий учителя.
export async function POST(req: Request) {
  try {
    const session = await requireAdmin()
    const parsed = changePasswordSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
    }
    const teacher = await db.teacher.findUnique({ where: { id: parsed.data.teacherId } })
    if (!teacher) return NextResponse.json({ error: 'Учитель не найден' }, { status: 400 })

    await db.teacher.update({
      where: { id: teacher.id },
      data: { passwordHash: await hashPassword(parsed.data.newPassword) },
    })
    // Инвалидируем все сессии, чтобы старый пароль/угнанная cookie умерли
    await db.session.deleteMany({ where: { teacherId: teacher.id } })
    await logAction(session.teacherId, 'password_reset', `Reset for ${teacher.fullName}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
