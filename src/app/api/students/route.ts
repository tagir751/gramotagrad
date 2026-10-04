/**
 * ПРОЦЕСС: чтение/создание/правка учеников с проверкой доступа к классу.
 * НАЗНАЧЕНИЕ: страница /students: список своих классов, добавление и перевод
 *   между классами только при праве на оба класса.
 * ТРИГГЕР: GET (фильтр ?classId) / POST (создание) / PATCH (правка, смена класса).
 * ВХОДНЫЕ ДАННЫЕ: GET — ?classId опционально; POST — studentCreateSchema;
 *   PATCH — studentUpdateSchema {id, fullName?, classId?, active?}.
 * ПРОВЕРКА ПРАВ: requireSession везде; GET с classId — teacherHasClass;
 *   без classId учитель получает только свои классы (пусто → []); POST/PATCH —
 *   доступ к (новому) классу; перевод требует доступа к старому И новому.
 * ЧТО ЧИТАЕТСЯ ИЗ БД: Student + Class + текущая Recommendation (isCurrent, take 1).
 * ЧТО ПИШЕТСЯ В БД: create/update Student. Оценки при переводе не трогаются
 *   (остаются на старых уроках). Удаление — не реализовано.
 * ОШИБКИ: 401/400/403 (чужой класс, несуществующая запись → нейтральный 403).
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: список с currentRecommendation/hasRecommendation
 *   или пустое состояние; при запрете — 'Нет доступа'.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  requireSession,
  teacherHasClass,
  isAdmin,
  logAction,
} from '@/lib/auth'
import { idSchema, studentCreateSchema, studentUpdateSchema } from '@/lib/validators'
import { handleApiError } from '@/lib/api'

// GET /api/students?classId=1 — только разрешённые классы.
// Без classId: админ — всех, учитель — только свои классы.
export async function GET(req: Request) {
  try {
    const session = await requireSession()
    const url = new URL(req.url)
    const rawClassId = url.searchParams.get('classId')

    let classIds: number[] | null = null
    if (rawClassId !== null) {
      const parsed = idSchema.safeParse(rawClassId)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Некорректный classId' }, { status: 400 })
      }
      if (!(await teacherHasClass(session.teacherId, parsed.data))) {
        return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
      }
      classIds = [parsed.data]
    } else if (!(await isAdmin(session.teacherId))) {
      const own = await db.class.findMany({
        where: { teachers: { some: { teacherId: session.teacherId } } },
        select: { id: true },
      })
      const ownIds: number[] = own.map((c) => c.id)
      if (ownIds.length === 0) return NextResponse.json([])
      classIds = ownIds
    }

    const students = await db.student.findMany({
      where: classIds ? { classId: { in: classIds } } : {},
      include: {
        class: { select: { id: true, name: true } },
        recommendations: {
          where: { isCurrent: true },
          select: { id: true, text: true },
          take: 1,
        },
      },
      orderBy: [{ class: { name: 'asc' } }, { fullName: 'asc' }],
    })
    return NextResponse.json(
      students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        active: s.active,
        classId: s.classId,
        class: s.class,
        currentRecommendation: s.recommendations[0]?.text ?? null,
        hasRecommendation: s.recommendations.length > 0,
      })),
    )
  } catch (e) {
    return handleApiError(e)
  }
}

// POST /api/students — админ или учитель с доступом к классу.
export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const parsed = studentCreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
    }
    if (!(await teacherHasClass(session.teacherId, parsed.data.classId))) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }
    const student = await db.student.create({
      data: { fullName: parsed.data.fullName, classId: parsed.data.classId },
      include: { class: { select: { id: true, name: true } } },
    })
    await logAction(session.teacherId, 'student_create', `Student ${student.fullName}`)
    return NextResponse.json(student, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}

// PATCH /api/students — правка; смена класса требует доступа к ОБОИМ классам.
export async function PATCH(req: Request) {
  try {
    const session = await requireSession()
    const parsed = studentUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
    }
    const existing = await db.student.findUnique({ where: { id: parsed.data.id } })
    if (!existing) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    if (!(await teacherHasClass(session.teacherId, existing.classId))) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }
    if (parsed.data.classId !== undefined) {
      if (!(await teacherHasClass(session.teacherId, parsed.data.classId))) {
        return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
      }
    }
    const updated = await db.student.update({
      where: { id: parsed.data.id },
      data: {
        ...(parsed.data.fullName !== undefined && { fullName: parsed.data.fullName }),
        ...(parsed.data.classId !== undefined && { classId: parsed.data.classId }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
      },
    })
    await logAction(session.teacherId, 'student_update', `Student #${updated.id}`)
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e)
  }
}
