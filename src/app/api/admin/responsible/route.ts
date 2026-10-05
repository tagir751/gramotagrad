/**
 * ПРОЦЕСС: управление ответственными воспитателями за классы (только админ).
 * НАЗНАЧЕНИЕ: назначать/снять воспитателя за класс; влияет на приоритет в разделе Воспитание.
 * ТРИГГЕР: GET /api/admin/responsible (список); PUT /api/admin/responsible (upsert/удаление).
 * ВХОДНЫЕ ДАННЫЕ: GET — нет; PUT — responsibleSchema {classId, teacherId?} (teacherId=null/undefined = снять).
 * ПРОВЕРКА ПРАВ: requireAdmin.
 * ЧТО ЧИТАЕТСЯ ИЗ БД: ResponsibleEducator + Teacher + Class.
 * ЧТО ПИШЕТСЯ В БД: upsert/delete ResponsibleEducator.
 * ОШИБКИ: 401/403; 400 bad id / учитель не найден / класс не найден; 404 класс не найден.
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: GET — [{classId, className, teacherId, teacherFullName|null}];
 *   PUT — {ok:true} / {classId, teacherId|null} / ошибка.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: API одинаковое; UI — селекты на всю ширину.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, logAction } from '@/lib/auth'
import { idSchema, responsibleSchema } from '@/lib/validators'
import { handleApiError } from '@/lib/api'

// GET /api/admin/responsible — все классы (с ответственным или без).
export async function GET() {
  try {
    await requireAdmin()
    const [classes, respRows] = await Promise.all([
      db.class.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      db.responsibleEducator.findMany({ include: { teacher: { select: { fullName: true } } } }),
    ])
    const byClass = new Map(respRows.map((r) => [r.classId, r]))
    return NextResponse.json(
      classes.map((c) => {
        const r = byClass.get(c.id)
        return {
          classId: c.id,
          className: c.name,
          teacherId: r?.teacherId ?? null,
          teacherFullName: r?.teacher?.fullName ?? null,
        }
      }),
    )
  } catch (e) {
    return handleApiError(e)
  }
}

// PUT /api/admin/responsible — назначить/снять ответственного за класс.
export async function PUT(req: Request) {
  try {
    const session = await requireAdmin()
    const parsed = responsibleSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })

    const { classId, teacherId } = parsed.data

    const cls = await db.class.findUnique({ where: { id: classId } })
    if (!cls) return NextResponse.json({ error: 'Класс не найден' }, { status: 404 })

    if (teacherId !== undefined && teacherId !== null) {
      const teacher = await db.teacher.findUnique({ where: { id: teacherId } })
      if (!teacher) return NextResponse.json({ error: 'Учитель не найден' }, { status: 400 })
    }

    if (teacherId === undefined || teacherId === null) {
      // Один ответственный на класс — уровень приложения (в схеме PK составной).
      await db.responsibleEducator.deleteMany({ where: { classId } })
      await logAction(session.teacherId, 'responsible_remove', `Class ${cls.name}`)
      return NextResponse.json({ classId, teacherId: null, ok: true })
    }

    await db.$transaction([
      db.responsibleEducator.deleteMany({ where: { classId } }),
      db.responsibleEducator.create({ data: { classId, teacherId } }),
    ])
    await logAction(session.teacherId, 'responsible_set', `Class ${cls.name} -> ${teacherId}`)
    return NextResponse.json({ classId, teacherId, ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}