/**
 * ПРОЦЕСС: точечное сохранение оценок (один урок, одна или пакет записей).
 * НАЗНАЧЕНИЕ: второй путь сохранения журнала наряду с POST /api/lessons.
 *   Журнал использует ТОЛЬКО POST /api/lessons (тема+ДЗ+оценки одним запросом);
 *   этот файл — для будущих точечных правок и прямых вызовов.
 * ТРИГГЕР: POST (одна оценка) / PUT (правка по id) / PATCH (пакет ≤100).
 * ВХОДНЫЕ ДАННЫЕ: gradeSaveSchema / gradeUpdateSchema / gradesBatchSchema.
 *   Значения value: 5/4/3/2/Н/''; пустая строка = нет оценки; Н = неявка,
 *   в средний балл не входит (считается в отчётах, не здесь).
 * ПРОВЕРКА ПРАВ: requireSession + requireLessonAccess (класс+предмет урока);
 *   ученик сверяется с классом урока. Несуществующая запись → нейтральный 403.
 * ЧТО ЧИТАЕТСЯ ИЗ БД: Grade, Lesson.classId, Student.classId.
 * ЧТО ПИШЕТСЯ В БД: upsert/update Grade; правило очистки: value='' И comment=''
 *   → DELETE записи (POST/PATCH), PUT с обоими пустыми тоже удаляет.
 *   Комментарий без оценки (value='', comment='текст') — храним.
 * ОШИБКИ: 401/400/403 как выше; 404 только если урок пропал между проверками.
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: запись / {ok, count} / ошибку текстом.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession, requireLessonAccess, logAction, ApiError } from '@/lib/auth'
import { gradeSaveSchema, gradesBatchSchema, gradeUpdateSchema } from '@/lib/validators'
import { handleApiError } from '@/lib/api'

// POST /api/grades — одна оценка (upsert по lessonId+studentId).
// RBAC: урок должен быть доступен учителю; ученик — из класса урока.
export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const parsed = gradeSaveSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
    }
    const { lessonId, studentId, value, comment } = parsed.data
    await requireLessonAccess(session.teacherId, lessonId)

    // Правило очистки: пустая оценка + пустой комментарий — удаляем запись.
    if (!value && !comment) {
      await db.grade.deleteMany({ where: { lessonId, studentId } })
      await logAction(session.teacherId, 'grade_save', `Grade cleared lesson ${lessonId} student ${studentId}`)
      return NextResponse.json({ ok: true, cleared: true })
    }

    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      select: { classId: true },
    })
    if (!lesson) throw new ApiError(404, 'Урок не найден')
    const student = await db.student.findUnique({
      where: { id: studentId },
      select: { classId: true },
    })
    if (!student || student.classId !== lesson.classId) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }

    const grade = await db.grade.upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      create: { lessonId, studentId, value, comment, teacherId: session.teacherId },
      update: { value, comment },
    })
    await logAction(session.teacherId, 'grade_save', `Grade lesson ${lessonId} student ${studentId}`)
    return NextResponse.json(grade, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}

// PUT /api/grades — правка по id. RBAC через урок оценки.
export async function PUT(req: Request) {
  try {
    const session = await requireSession()
    const parsed = gradeUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
    }
    const existing = await db.grade.findUnique({
      where: { id: parsed.data.id },
      select: { lessonId: true },
    })
    if (!existing) return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    await requireLessonAccess(session.teacherId, existing.lessonId)

    // Правило очистки для PUT: оба поля пустые → удалить запись.
    if (parsed.data.value === '' && (parsed.data.comment ?? '') === '') {
      await db.grade.delete({ where: { id: parsed.data.id } })
      await logAction(session.teacherId, 'grade_update', `Grade #${parsed.data.id} cleared`)
      return NextResponse.json({ ok: true, cleared: true })
    }

    const updated = await db.grade.update({
      where: { id: parsed.data.id },
      data: {
        ...(parsed.data.value !== undefined && { value: parsed.data.value }),
        ...(parsed.data.comment !== undefined && { comment: parsed.data.comment }),
      },
    })
    await logAction(session.teacherId, 'grade_update', `Grade #${parsed.data.id}`)
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e)
  }
}

// PATCH /api/grades — пакет до 100 записей для урока.
export async function PATCH(req: Request) {
  try {
    const session = await requireSession()
    const parsed = gradesBatchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
    }
    const { lessonId, grades } = parsed.data
    await requireLessonAccess(session.teacherId, lessonId)

    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      select: { classId: true },
    })
    if (!lesson) throw new ApiError(404, 'Урок не найден')
    const ids = [...new Set(grades.map((g) => g.studentId))]
    const count = await db.student.count({
      where: { id: { in: ids }, classId: lesson.classId },
    })
    if (count !== ids.length) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }

    await db.$transaction(
      grades.map((g) =>
        // Правило очистки в пакете: пустые строки удаляем, а не upsert'им.
        !g.value && !g.comment
          ? db.grade.deleteMany({ where: { lessonId, studentId: g.studentId } })
          : db.grade.upsert({
              where: { lessonId_studentId: { lessonId, studentId: g.studentId } },
              create: {
                lessonId,
                studentId: g.studentId,
                value: g.value,
                comment: g.comment,
                teacherId: session.teacherId,
              },
              update: { value: g.value, comment: g.comment },
            }),
      ),
    )
    await logAction(session.teacherId, 'grade_batch', `Batch lesson ${lessonId} n=${grades.length}`)
    return NextResponse.json({ ok: true, count: grades.length })
  } catch (e) {
    return handleApiError(e)
  }
}
