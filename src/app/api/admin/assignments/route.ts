/**
 * ПРОЦЕСС: замена назначений учителя на классы и предметы (админ).
 * НАЗНАЧЕНИЕ: управлять доступом учителя к журналу: без строк в TeacherClass/
 *   TeacherSubject учитель легально видит пустой журнал (бизнес-правило 10, 13).
 * ТРИГГЕР: PUT /api/admin/assignments из админ-панели.
 * ВХОДНЫЕ ДАННЫЕ: {teacherId, classIds[], subjectIds[]} — оба списка заменяют
 *   текущие целиком; пустой массив = снять все назначения этого типа.
 * ПРОВЕРКА ПРАВ: requireAdmin (не-админ — 403). Некорректные или несуществующие
 *   teacherId/classIds/subjectIds — 400 с понятным текстом (админу и отладке).
 *   Нейтральный 403 оставлен только для учительского журнала, не здесь.
 *   Сначала права и валидация (zod), только потом запись в БД.
 * ЧТО ЧИТАЕТСЯ ИЗ БД: Teacher (существование), Class/Subject (существование id).
 * ЧТО ПИШЕТСЯ В БД: в транзакции deleteMany + createMany для TeacherClass и
 *   TeacherSubject по teacherId. Дубли убираются через Set до записи.
 * ОШИБКИ: 401 без сессии; 403 не-админ; 400 несуществующие teacher/class/subject.
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: актуальные {classIds, subjectIds} после сохранения.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, logAction } from '@/lib/auth'
import { assignmentsSchema } from '@/lib/validators'
import { handleApiError } from '@/lib/api'

export async function PUT(req: Request) {
  try {
    const session = await requireAdmin()
    const parsed = assignmentsSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })
    }
    const { teacherId, classIds, subjectIds } = parsed.data
    const uniqClasses = [...new Set(classIds)]
    const uniqSubjects = [...new Set(subjectIds)]

    const teacher = await db.teacher.findUnique({ where: { id: teacherId }, select: { id: true } })
    if (!teacher) return NextResponse.json({ error: 'Учитель не найден' }, { status: 400 })

    if (uniqClasses.length) {
      const n = await db.class.count({ where: { id: { in: uniqClasses } } })
      if (n !== uniqClasses.length) return NextResponse.json({ error: 'Неизвестный класс' }, { status: 400 })
    }
    if (uniqSubjects.length) {
      const n = await db.subject.count({ where: { id: { in: uniqSubjects } } })
      if (n !== uniqSubjects.length) return NextResponse.json({ error: 'Неизвестный предмет' }, { status: 400 })
    }

    await db.$transaction([
      db.teacherClass.deleteMany({ where: { teacherId } }),
      ...(uniqClasses.length
        ? [db.teacherClass.createMany({ data: uniqClasses.map((classId) => ({ teacherId, classId })) })]
        : []),
      db.teacherSubject.deleteMany({ where: { teacherId } }),
      ...(uniqSubjects.length
        ? [db.teacherSubject.createMany({ data: uniqSubjects.map((subjectId) => ({ teacherId, subjectId })) })]
        : []),
    ])

    await logAction(session.teacherId, 'assignments_update', `Teacher #${teacherId}`)
    return NextResponse.json({ teacherId, classIds: uniqClasses, subjectIds: uniqSubjects })
  } catch (e) {
    return handleApiError(e)
  }
}
