/**
 * ПРОЦЕСС: CRUD учителей (только админ).
 * НАЗНАЧЕНИЕ: полное управление учителями: создание, правка, удаление,
 *   назначения классов/предметов, смена пароля через отдельный эндпоинт.
 * ТРИГГЕР: /api/admin/teachers GET/POST/PATCH/DELETE из админки.
 * ВХОДНЫЕ ДАННЫЕ: GET — нет; POST — teacherCreateSchema (password min 8); PATCH — teacherUpdateSchema; DELETE — id в query.
 * ПРОВЕРКА ПРАВ: requireAdmin везде; DELETE — запрет удалить самого себя.
 * ЧТО ЧИТАЕТСЯ ИЗ БД: Teacher (+ TeacherClass + TeacherSubject для списка).
 * ЧТО ПИШЕТСЯ В БД: Teacher (+ TeacherClass/TeacherSubject при создании/правке назначений);
 *   при DELETE — удаляются сессии, назначения, TeacherState; каскадом уходят и
 *   логи педагога (ActionLog.teacher = onDelete: Cascade).
 * ОШИБКИ: 401/403; 400 валидация/дубль/короткий пароль; 404 не найден;
 *   403 попытка удалить себя; 409 за педагогом есть уроки/оценки/рекомендации.
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: GET — [{id, fullName, lastName, role, isVospitatel, classIds[], subjectIds[]}];
 *   POST/PATCH — созданный/обновлённый учитель; DELETE — {ok:true}.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: API одинаковое; UI — крупные инпуты, пароль autoComplete="new-password".
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, logAction } from '@/lib/auth'
import { teacherCreateSchema, teacherUpdateSchema } from '@/lib/validators'
import { hashPassword } from '@/lib/password'
import { handleApiError } from '@/lib/api'

// GET /api/admin/teachers — список всех учителей с назначениями.
export async function GET() {
  try {
    await requireAdmin()
    const teachers = await db.teacher.findMany({
      orderBy: { fullName: 'asc' },
      select: {
        id: true,
        fullName: true,
        lastName: true,
        firstName: true,
        role: true,
        isVospitatel: true,
        classes: { select: { classId: true } },
        subjects: { select: { subjectId: true } },
      },
    })
    return NextResponse.json(
      teachers.map((t) => ({
        id: t.id,
        fullName: t.fullName,
        lastName: t.lastName,
        firstName: t.firstName,
        role: t.role,
        isVospitatel: t.isVospitatel,
        classIds: t.classes.map((c) => c.classId),
        subjectIds: t.subjects.map((s) => s.subjectId),
      })),
    )
  } catch (e) {
    return handleApiError(e)
  }
}

// POST /api/admin/teachers — создать учителя + назначения + пароль.
export async function POST(req: Request) {
  try {
    const session = await requireAdmin()
    const parsed = teacherCreateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })

    const { classIds, subjectIds, password, ...data } = parsed.data
    const uniqClasses = [...new Set(classIds ?? [])]
    const uniqSubjects = [...new Set(subjectIds ?? [])]

    if (uniqClasses.length) {
      const n = await db.class.count({ where: { id: { in: uniqClasses } } })
      if (n !== uniqClasses.length) return NextResponse.json({ error: 'Неизвестный класс' }, { status: 400 })
    }
    if (uniqSubjects.length) {
      const n = await db.subject.count({ where: { id: { in: uniqSubjects } } })
      if (n !== uniqSubjects.length) return NextResponse.json({ error: 'Неизвестный предмет' }, { status: 400 })
    }

    const teacher = await db.$transaction(async (tx) => {
      const t = await tx.teacher.create({
        data: {
          ...data,
          passwordHash: await hashPassword(password),
          classes: uniqClasses.length ? { create: uniqClasses.map((classId) => ({ classId })) } : undefined,
          subjects: uniqSubjects.length ? { create: uniqSubjects.map((subjectId) => ({ subjectId })) } : undefined,
        },
      })
      return t
    })

    await logAction(session.teacherId, 'teacher_create', `Teacher ${teacher.fullName}`)
    return NextResponse.json({
      id: teacher.id,
      fullName: teacher.fullName,
      lastName: teacher.lastName,
      role: teacher.role,
      isVospitatel: teacher.isVospitatel,
      classIds: uniqClasses,
      subjectIds: uniqSubjects,
    }, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}

// PATCH /api/admin/teachers — обновить учителя (ФИО, роль, флаг, назначения).
export async function PATCH(req: Request) {
  try {
    const session = await requireAdmin()
    const parsed = teacherUpdateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })

    const { id, classIds, subjectIds, ...data } = parsed.data
    const existing = await db.teacher.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Учитель не найден' }, { status: 404 })

    const uniqClasses = classIds !== undefined ? [...new Set(classIds)] : undefined
    const uniqSubjects = subjectIds !== undefined ? [...new Set(subjectIds)] : undefined

    if (uniqClasses !== undefined && uniqClasses.length) {
      const n = await db.class.count({ where: { id: { in: uniqClasses } } })
      if (n !== uniqClasses.length) return NextResponse.json({ error: 'Неизвестный класс' }, { status: 400 })
    }
    if (uniqSubjects !== undefined && uniqSubjects.length) {
      const n = await db.subject.count({ where: { id: { in: uniqSubjects } } })
      if (n !== uniqSubjects.length) return NextResponse.json({ error: 'Неизвестный предмет' }, { status: 400 })
    }

    const updated = await db.$transaction(async (tx) => {
      const t = await tx.teacher.update({
        where: { id },
        data: {
          ...data,
          classes: uniqClasses !== undefined
            ? { deleteMany: {}, create: uniqClasses.map((classId) => ({ classId })) }
            : undefined,
          subjects: uniqSubjects !== undefined
            ? { deleteMany: {}, create: uniqSubjects.map((subjectId) => ({ subjectId })) }
            : undefined,
        },
      })
      return t
    })

    const fresh = await db.teacher.findUnique({
      where: { id },
      select: { classes: { select: { classId: true } }, subjects: { select: { subjectId: true } } },
    })

    await logAction(session.teacherId, 'teacher_update', `Teacher ${updated.fullName}`)
    return NextResponse.json({
      id: updated.id,
      fullName: updated.fullName,
      lastName: updated.lastName,
      role: updated.role,
      isVospitatel: updated.isVospitatel,
      classIds: fresh?.classes.map((c) => c.classId) ?? [],
      subjectIds: fresh?.subjects.map((s) => s.subjectId) ?? [],
    })
  } catch (e) {
    return handleApiError(e)
  }
}

// DELETE /api/admin/teachers?id=... — удалить учителя.
export async function DELETE(req: Request) {
  try {
    const session = await requireAdmin()
    const url = new URL(req.url)
    const id = Number(url.searchParams.get('id'))
    if (!id || Number.isNaN(id)) return NextResponse.json({ error: 'Некорректный id' }, { status: 400 })

    if (id === session.teacherId) return NextResponse.json({ error: 'Нельзя удалить самого себя' }, { status: 403 })

    const teacher = await db.teacher.findUnique({
      where: { id },
      include: { _count: { select: { lessons: true, grades: true, recommendations: true } } },
    })
    if (!teacher) return NextResponse.json({ error: 'Учитель не найден' }, { status: 404 })

    // В схеме у Lesson.teacher / Grade.teacher / Recommendation.author стоит
    // onDelete: Cascade, поэтому удаление педагога каскадом стёрло бы уроки
    // (а вместе с уроками — оценки ДРУГИХ учителей внутри них), выставленные
    // оценки и рекомендации. Для журнала успеваемости это недопустимо:
    // блокируем удаление, как уже сделано для классов и предметов.
    const { lessons, grades, recommendations } = teacher._count
    if (lessons > 0 || grades > 0 || recommendations > 0) {
      const parts = [
        lessons > 0 ? `уроков: ${lessons}` : '',
        grades > 0 ? `оценок: ${grades}` : '',
        recommendations > 0 ? `рекомендаций: ${recommendations}` : '',
      ].filter(Boolean).join(', ')
      return NextResponse.json(
        { error: `Нельзя удалить: за педагогом числятся записи журнала (${parts}). Снимите назначения вместо удаления.` },
        { status: 409 },
      )
    }

    await db.$transaction([
      db.session.deleteMany({ where: { teacherId: id } }),
      db.teacherClass.deleteMany({ where: { teacherId: id } }),
      db.teacherSubject.deleteMany({ where: { teacherId: id } }),
      db.teacherState.deleteMany({ where: { teacherId: id } }),
      db.teacher.delete({ where: { id } }),
    ])

    await logAction(session.teacherId, 'teacher_delete', `Teacher ${teacher.fullName}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}