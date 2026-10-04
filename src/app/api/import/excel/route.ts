/**
 * ПРОЦЕСС: импорт данных из Excel (только админ).
 * НАЗНАЧЕНИЕ: массовая загрузка педагогов, учеников, классов, предметов,
 *   оценок и рекомендаций из .xlsx.
 * ТРИГГЕР: POST /api/import/excel (multipart/form-data с файлом).
 * ВХОДНЫЕ ДАННЫЕ: formData {file: File}. Лимит 5 МБ, только .xls/.xlsx.
 *   Режим 'replace' СНЯТ: он делал teacher.deleteMany({}), что каскадом
 *   (Lesson.teacher / Grade.teacher / Recommendation.author / ActionLog.teacher
 *   = onDelete: Cascade) сносило весь журнал школы вместе с сессией самого
 *   админа. Запрос с mode=replace теперь отклоняется с 400.
 * ПРОВЕРКА ПРАВ: requireAdmin (один раз, id админа прокидывается в импортёры).
 * ЧТО ЧИТАЕТСЯ ИЗ БД: существующие Class/Subject/Student/Teacher/Lesson для
 *   сопоставления и пропуска дублей.
 * ЧТО ПИШЕТСЯ В БД: Teacher, Class, Subject, Student, Lesson, Grade, Recommendation.
 *   Автором созданных уроков/оценок/рекомендаций становится ТЕКУЩИЙ АДМИН
 *   (раньше туда ошибочно писался student.classId — чужой или несуществующий id).
 * ВАЛИДАЦИЯ: оценки сверяются с GRADE_VALUES, даты — с dateSchema (YYYY-MM-DD),
 *   роль — с ['админ','учитель'], пароль обязателен и не короче 8 символов.
 * ОШИБКИ: 401/403; 400 (нет файла / не тот формат / >5 МБ / mode=replace).
 *   Ошибки строк не роняют импорт — собираются в errors[] с номером строки.
 * ОГРАНИЧЕНИЕ: импорт НЕ атомарный (построчные записи, без транзакции) —
 *   при ошибке в середине файла ранее импортированные строки остаются.
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: {success, sheetsProcessed, results[{sheet, total, imported, skipped, errors}]}.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: API одинаковое; UI — выбор файла + отчёт.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, logAction } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { handleApiError } from '@/lib/api'
import { GRADE_VALUES } from '@/lib/validators'
import * as XLSX from 'xlsx'

const SHEETS = ['Ученики', 'Педагоги', 'Классы', 'Предметы', 'Оценки', 'Рекомендации'] as const

type Row = Record<string, unknown>
type ImportResult = { imported: number; skipped: number; errors: string[] }

/** Контекст импорта: кто именно загружает файл (становится автором записей). */
interface ImportCtx {
  actorId: number
}

/**
 * Первое непустое значение из набора синонимов-заголовков.
 * Синонимы включают заголовки, которые пишет /api/export, чтобы выгрузка
 * импортировалась обратно без ручного переименования столбцов.
 */
function pick(row: Row, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

/** Дата из ячейки: строка YYYY-MM-DD или Date (при cellDates). Иначе ''. */
function pickDate(row: Row, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(v)
    }
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseBool(v: string): boolean {
  return ['да', 'true', '1', 'yes'].includes(v.toLowerCase())
}

/** Класс по id (если значение числовое) либо по названию. */
async function resolveClass(value: string) {
  if (/^\d+$/.test(value)) return db.class.findUnique({ where: { id: Number(value) } })
  return db.class.findUnique({ where: { name: value } })
}

async function importStudents(sheet: Row[], ctx: ImportCtx): Promise<ImportResult> {
  void ctx
  let imported = 0
  let skipped = 0
  const errors: string[] = []
  for (const [i, row] of sheet.entries()) {
    const line = i + 2
    const classRef = pick(row, 'Класс', 'classId', 'className', 'Class')
    const fullName = pick(row, 'ФИО', 'Фамилия Имя Отчество', 'fullName')
    if (!classRef || !fullName) {
      errors.push(`Строка ${line}: нет класса или ФИО`)
      skipped++
      continue
    }
    const cls = await resolveClass(classRef)
    if (!cls) {
      errors.push(`Строка ${line}: класс «${classRef}» не найден`)
      skipped++
      continue
    }
    const dup = await db.student.findFirst({ where: { fullName, classId: cls.id } })
    if (dup) {
      errors.push(`Строка ${line}: ученик «${fullName}» уже есть в классе ${cls.name}`)
      skipped++
      continue
    }
    await db.student.create({ data: { fullName, classId: cls.id } })
    imported++
  }
  return { imported, skipped, errors }
}

async function importTeachers(sheet: Row[], ctx: ImportCtx): Promise<ImportResult> {
  void ctx
  let imported = 0
  let skipped = 0
  const errors: string[] = []
  for (const [i, row] of sheet.entries()) {
    const line = i + 2
    const lastName = pick(row, 'Фамилия', 'Фамилия учителя', 'lastName')
    const firstName = pick(row, 'Имя Отчество', 'Имя', 'firstName')
    const fullName = pick(row, 'ФИО', 'ФИО полностью', 'fullName')
    if (!lastName || !firstName || !fullName) {
      errors.push(`Строка ${line}: не заполнены Фамилия / Имя Отчество / ФИО`)
      skipped++
      continue
    }

    const roleRaw = pick(row, 'Роль', 'role') || 'учитель'
    if (roleRaw !== 'админ' && roleRaw !== 'учитель') {
      errors.push(`Строка ${line}: роль «${roleRaw}» недопустима (ожидается «админ» или «учитель»)`)
      skipped++
      continue
    }

    // Пароль обязателен. Раньше тут стоял дефолт 'changeme123' — при реимпорте
    // выгрузки (в ней столбца с паролем нет) все педагоги, включая админов,
    // получали один общеизвестный пароль.
    const password = pick(row, 'Пароль', 'password')
    if (password.length < 8) {
      errors.push(`Строка ${line}: нужен столбец «Пароль», не короче 8 символов`)
      skipped++
      continue
    }

    const existing = await db.teacher.findFirst({ where: { lastName, firstName } })
    if (existing) {
      errors.push(`Строка ${line}: педагог «${fullName}» уже есть`)
      skipped++
      continue
    }

    await db.teacher.create({
      data: {
        lastName,
        firstName,
        fullName,
        role: roleRaw,
        isVospitatel: parseBool(pick(row, 'Воспитатель', 'isVospitatel')),
        passwordHash: await hashPassword(password),
      },
    })
    imported++
  }
  return { imported, skipped, errors }
}

async function importClasses(sheet: Row[], ctx: ImportCtx): Promise<ImportResult> {
  void ctx
  let imported = 0
  let skipped = 0
  const errors: string[] = []
  for (const [i, row] of sheet.entries()) {
    const line = i + 2
    const name = pick(row, 'Название', 'Номер', 'name')
    if (!name) {
      errors.push(`Строка ${line}: нет названия`)
      skipped++
      continue
    }
    if (await db.class.findUnique({ where: { name } })) {
      skipped++
      continue
    }
    await db.class.create({ data: { name } })
    imported++
  }
  return { imported, skipped, errors }
}

async function importSubjects(sheet: Row[], ctx: ImportCtx): Promise<ImportResult> {
  void ctx
  let imported = 0
  let skipped = 0
  const errors: string[] = []
  for (const [i, row] of sheet.entries()) {
    const line = i + 2
    const name = pick(row, 'Название', 'name')
    if (!name) {
      errors.push(`Строка ${line}: нет названия`)
      skipped++
      continue
    }
    if (await db.subject.findUnique({ where: { name } })) {
      skipped++
      continue
    }
    await db.subject.create({ data: { name } })
    imported++
  }
  return { imported, skipped, errors }
}

async function importGrades(sheet: Row[], ctx: ImportCtx): Promise<ImportResult> {
  let imported = 0
  let skipped = 0
  const errors: string[] = []
  for (const [i, row] of sheet.entries()) {
    const line = i + 2
    const studentName = pick(row, 'Ученик', 'ФИО ученика', 'studentName')
    const classRef = pick(row, 'Класс', 'className')
    const subjectName = pick(row, 'Предмет', 'subjectName')
    const date = pickDate(row, 'Дата', 'Date', 'lessonDate')
    const value = pick(row, 'Оценка', 'value')
    const comment = pick(row, 'Комментарий', 'comment')

    if (!studentName || !classRef || !subjectName || !date || !value) {
      errors.push(`Строка ${line}: не заполнены Ученик / Класс / Предмет / Дата / Оценка`)
      skipped++
      continue
    }
    if (!DATE_RE.test(date)) {
      errors.push(`Строка ${line}: дата «${date}» не в формате ГГГГ-ММ-ДД`)
      skipped++
      continue
    }
    // Раньше значение писалось в БД как есть, в обход enum из validators.
    if (!(GRADE_VALUES as readonly string[]).includes(value)) {
      errors.push(`Строка ${line}: оценка «${value}» недопустима (5, 4, 3, 2 или Н)`)
      skipped++
      continue
    }

    const classRec = await resolveClass(classRef)
    if (!classRec) {
      errors.push(`Строка ${line}: класс «${classRef}» не найден`)
      skipped++
      continue
    }
    const subject = await db.subject.findUnique({ where: { name: subjectName } })
    if (!subject) {
      errors.push(`Строка ${line}: предмет «${subjectName}» не найден`)
      skipped++
      continue
    }
    const student = await db.student.findFirst({
      where: { fullName: studentName, classId: classRec.id },
    })
    if (!student) {
      errors.push(`Строка ${line}: ученик «${studentName}» не найден в классе ${classRec.name}`)
      skipped++
      continue
    }

    // teacherId = текущий админ. Раньше сюда подставлялся student.classId,
    // то есть id КЛАССА в поле внешнего ключа на учителя.
    const lesson = await db.lesson.upsert({
      where: { date_classId_subjectId: { date, classId: classRec.id, subjectId: subject.id } },
      create: { date, classId: classRec.id, subjectId: subject.id, teacherId: ctx.actorId },
      update: {},
    })
    await db.grade.upsert({
      where: { lessonId_studentId: { lessonId: lesson.id, studentId: student.id } },
      create: {
        lessonId: lesson.id,
        studentId: student.id,
        value,
        comment,
        teacherId: ctx.actorId,
      },
      update: { value, comment },
    })
    imported++
  }
  return { imported, skipped, errors }
}

async function importRecommendations(sheet: Row[], ctx: ImportCtx): Promise<ImportResult> {
  let imported = 0
  let skipped = 0
  const errors: string[] = []
  for (const [i, row] of sheet.entries()) {
    const line = i + 2
    const studentName = pick(row, 'Ученик', 'ФИО ученика', 'studentName')
    const classRef = pick(row, 'Класс', 'className')
    const text = pick(row, 'Текст', 'Рекомендация', 'text')
    if (!studentName || !classRef || !text) {
      errors.push(`Строка ${line}: не заполнены Ученик / Класс / Текст`)
      skipped++
      continue
    }
    const classRec = await resolveClass(classRef)
    if (!classRec) {
      errors.push(`Строка ${line}: класс «${classRef}» не найден`)
      skipped++
      continue
    }
    const student = await db.student.findFirst({
      where: { fullName: studentName, classId: classRec.id },
    })
    if (!student) {
      errors.push(`Строка ${line}: ученик «${studentName}» не найден в классе ${classRec.name}`)
      skipped++
      continue
    }
    // authorId = текущий админ (раньше — student.classId).
    await db.$transaction([
      db.recommendation.updateMany({
        where: { studentId: student.id, isCurrent: true },
        data: { isCurrent: false },
      }),
      db.recommendation.create({
        data: { studentId: student.id, text, authorId: ctx.actorId, isCurrent: true },
      }),
    ])
    imported++
  }
  return { imported, skipped, errors }
}

const importers: Record<string, (sheet: Row[], ctx: ImportCtx) => Promise<ImportResult>> = {
  'Ученики': importStudents,
  'Педагоги': importTeachers,
  'Классы': importClasses,
  'Предметы': importSubjects,
  'Оценки': importGrades,
  'Рекомендации': importRecommendations,
}

export async function POST(req: Request) {
  try {
    const session = await requireAdmin()
    const formData = await req.formData()
    const file = formData.get('file')
    const mode = String(formData.get('mode') ?? 'add')

    if (mode === 'replace') {
      return NextResponse.json(
        { error: 'Режим «заменить» отключён: он удалял все данные школы. Используйте «добавить».' },
        { status: 400 },
      )
    }
    if (!(file instanceof File)) return NextResponse.json({ error: 'Нужен файл' }, { status: 400 })
    if (!/\.xlsx?$/i.test(file.name)) {
      return NextResponse.json({ error: 'Допустимы только .xls/.xlsx' }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Файл больше 5 МБ' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

    const ctx: ImportCtx = { actorId: session.teacherId }
    const results: Array<{ sheet: string; total: number } & ImportResult> = []
    let sheetsProcessed = 0

    for (const sheetName of SHEETS) {
      if (!workbook.SheetNames.includes(sheetName)) continue
      const rows = XLSX.utils.sheet_to_json<Row>(workbook.Sheets[sheetName], { defval: '' })
      const result = await importers[sheetName](rows, ctx)
      results.push({ sheet: sheetName, total: rows.length, ...result })
      sheetsProcessed++
    }

    const totalImported = results.reduce((a, r) => a + r.imported, 0)
    await logAction(
      session.teacherId,
      'import_excel',
      `Листов: ${sheetsProcessed}, записей: ${totalImported}`,
    )
    return NextResponse.json({ success: true, sheetsProcessed, results })
  } catch (e) {
    return handleApiError(e)
  }
}
