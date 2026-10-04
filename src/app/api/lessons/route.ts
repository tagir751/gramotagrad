/**
 * ПРОЦЕСС: чтение/сохранение урока (урок = дата + класс + предмет).
 * НАЗНАЧЕНИЕ: главный рабочий объект журнала; upsert урока + пакет оценок.
 * ТРИГГЕР: GET/POST/PUT /api/lessons со страницы /journal.
 * ВХОДНЫЕ ДАННЫЕ: GET — ?date&classId&subjectId; POST — lessonCreateSchema
 *   (topic/homework/grades[] ≤100); PUT — {id, topic?, homework?}.
 * ПРОВЕРКА ПРАВ: requireSession везде; GET/POST — requireClassAndSubject
 *   (нужны ОБА назначения: класс через TeacherClass и предмет через TeacherSubject,
 *   бизнес-правило 10); PUT — requireLessonAccess. Ученики сверяются с классом
 *   (student.classId == lesson.classId), иначе нейтральный 403.
 * ЧТО ЧИТАЕТСЯ ИЗ БД: Lesson по unique(date,classId,subjectId), Student (принадлежность).
 * ЧТО ПИШЕТСЯ В БД: upsert Lesson; для каждой оценки — upsert Grade, кроме
 *   правила очистки: value='' И comment='' → DELETE существующей Grade
 *   (не храним мусор); value='' + comment='текст' → храним как комментарий
 *   без оценки. Создание урока фильтрует пустые строки заранее.
 * ОШИБКИ: 401 без сессии; 400 bad date/id/zod; 403 чужой класс/предмет или
 *   ученик не из класса; 404 урок не найден (PUT через requireLessonAccess).
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: {lesson, grades[]} / обновлённый урок / ошибку текстом.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  requireSession,
  requireClassAndSubject,
  requireLessonAccess,
  logAction,
} from '@/lib/auth'
import {
  lessonQuerySchema,
  lessonCreateSchema,
  lessonUpdateSchema,
} from '@/lib/validators'
import { handleApiError } from '@/lib/api'

// GET /api/lessons?date=YYYY-MM-DD&classId=1&subjectId=2
// RBAC: учитель видит только свои класс+предмет, админ — всё.
export async function GET(req: Request) {  try {
    const session = await requireSession()
    const url = new URL(req.url)
    const parsed = lessonQuerySchema.safeParse({
      date: url.searchParams.get('date'),
      classId: url.searchParams.get('classId'),
      subjectId: url.searchParams.get('subjectId'),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'Некорректные параметры' }, { status: 400 })
    }
    const { date, classId, subjectId } = parsed.data
    await requireClassAndSubject(session.teacherId, classId, subjectId)

    const lesson = await db.lesson.findUnique({
      where: { date_classId_subjectId: { date, classId, subjectId } },
      include: {
        grades: {
          include: { student: { select: { id: true, fullName: true } } },
          orderBy: { student: { fullName: 'asc' } },
        },
      },
    })
    if (!lesson) return NextResponse.json({ lesson: null, grades: [] })
    const { grades, ...rest } = lesson
    return NextResponse.json({
      lesson: rest,
      grades: grades.map((g) => ({
        id: g.id,
        value: g.value,
        comment: g.comment,
        studentId: g.studentId,
        student: g.student,
      })),
    })
  } catch (e) {
    return handleApiError(e)
  }
}

// POST /api/lessons — upsert урока + пакет оценок (<=100).
// RBAC: requireClassAndSubject; ученики проверяются на принадлежность классу.
export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const parsed = lessonCreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
    }
    const { date, classId, subjectId, topic, homework, grades } = parsed.data
    await requireClassAndSubject(session.teacherId, classId, subjectId)

    // Все studentId должны принадлежать classId — иначе 403 без деталей перебора
    if (grades.length) {
      const ids = [...new Set(grades.map((g) => g.studentId))]
      const count = await db.student.count({ where: { id: { in: ids }, classId } })
      if (count !== ids.length) {
        return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
      }
    }

    const existing = await db.lesson.findUnique({
      where: { date_classId_subjectId: { date, classId, subjectId } },
    })

    if (existing) {
      await requireLessonAccess(session.teacherId, existing.id)
      const updated = await db.$transaction(async (tx) => {
        const l = await tx.lesson.update({
          where: { id: existing.id },
          data: { topic, homework },
        })
        for (const g of grades) {
          // Правило очистки: пустая оценка + пустой комментарий = удалить запись,
          // чтобы не копился мусор. Комментарий без оценки — храним.
          if (!g.value && !g.comment) {
            await tx.grade.deleteMany({
              where: { lessonId: existing.id, studentId: g.studentId },
            })
            continue
          }
          await tx.grade.upsert({
            where: { lessonId_studentId: { lessonId: existing.id, studentId: g.studentId } },
            create: {
              lessonId: existing.id,
              studentId: g.studentId,
              value: g.value,
              comment: g.comment,
              teacherId: session.teacherId,
            },
            update: { value: g.value, comment: g.comment },
          })
        }
        return l
      })
      await logAction(session.teacherId, 'lesson_update', `Lesson ${date} class ${classId}`)
      return NextResponse.json(updated)
    }

    const created = await db.lesson.create({
      data: {
        date,
        classId,
        subjectId,
        teacherId: session.teacherId,
        topic,
        homework,
        grades: grades.length
          ? {
              create: grades
                .filter((g) => g.value || g.comment)
                .map((g) => ({
                  studentId: g.studentId,
                  value: g.value,
                  comment: g.comment,
                  teacherId: session.teacherId,
                })),
            }
          : undefined,
      },
    })
    await logAction(session.teacherId, 'lesson_create', `Lesson ${date} class ${classId}`)
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}

// PUT /api/lessons { id, topic?, homework? } — только свой класс/предмет.
export async function PUT(req: Request) {
  try {
    const session = await requireSession()
    const parsed = lessonUpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
    }
    await requireLessonAccess(session.teacherId, parsed.data.id)
    const updated = await db.lesson.update({
      where: { id: parsed.data.id },
      data: {
        ...(parsed.data.topic !== undefined && { topic: parsed.data.topic }),
        ...(parsed.data.homework !== undefined && { homework: parsed.data.homework }),
      },
    })
    await logAction(session.teacherId, 'lesson_update', `Lesson #${parsed.data.id}`)
    return NextResponse.json(updated)
  } catch (e) {
    return handleApiError(e)
  }
}
