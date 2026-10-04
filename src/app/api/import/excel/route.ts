/**
 * PROCESS: import data from Excel (admin only).
 * PURPOSE: bulk import teachers, students, classes, subjects, grades, recommendations.
 * TRIGGER: POST /api/import/excel (multipart/form-data with file).
 * INPUT: formData {file: File, mode: 'add'|'replace'='add'}.
 * AUTH CHECK: requireAdmin.
 * READS FROM DB: existing records for upsert/skip.
 * WRITES TO DB: Teacher, Class, Subject, Student, Lesson, Grade, Recommendation.
 * ERRORS: 401/403/400 (bad file, bad structure, validation errors); network - text.
 * USER SEES: {success, sheetsProcessed, results[{sheet, total, imported, skipped, errors}]}.
 * MOBILE BEHAVIOR: API same; UI - file picker + progress.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, logAction } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { handleApiError } from '@/lib/api'
import * as XLSX from 'xlsx'

const SHEETS = ['Ученики', 'Педагоги', 'Классы', 'Предметы', 'Оценки', 'Рекомендации'] as const

async function importStudents(sheet: any[], mode: 'add' | 'replace') {
  let imported = 0, skipped = 0
  const errors: string[] = []
  for (const [i, row] of sheet.entries()) {
    const classId = row['Класс'] ?? row['classId'] ?? row['Class']
    const fullName = row['ФИО'] ?? row['Фамилия Имя Отчество'] ?? row['fullName']
    if (!classId || !fullName) { errors.push(`Row ${i + 2}: missing classId or fullName`); skipped++; continue }
    const classExists = await db.class.findUnique({ where: { id: Number(classId) } })
    if (!classExists) { errors.push(`Row ${i + 2}: class ${classId} not found`); skipped++; continue }
    if (mode === 'replace') {
      await db.student.deleteMany({ where: { classId: Number(classId) } })
      mode = 'add'
    }
    await db.student.create({ data: { fullName: String(fullName).trim(), classId: Number(classId) } })
    imported++
  }
  return { imported, skipped, errors }
}

async function importTeachers(sheet: any[], mode: 'add' | 'replace') {
  let imported = 0, skipped = 0
  const errors: string[] = []
  for (const [i, row] of sheet.entries()) {
    const lastName = row['Фамилия'] ?? row['Фамилия учителя'] ?? row['lastName']
    const firstName = row['Имя Отчество'] ?? row['Имя'] ?? row['firstName']
    const fullName = row['ФИО'] ?? row['ФИО полностью'] ?? row['fullName']
    const role = (row['Роль'] ?? 'учитель') as 'админ' | 'учитель'
    const isVospitatel = (row['Воспитатель'] === 'Да' || row['Воспитатель'] === true)
    const password = row['Пароль'] ?? 'changeme123'
    if (!lastName || !firstName || !fullName) { errors.push(`Row ${i + 2}: missing name fields`); skipped++; continue }
    if (mode === 'replace') {
      await db.teacher.deleteMany({})
      await db.teacherClass.deleteMany({})
      await db.teacherSubject.deleteMany({})
      mode = 'add'
    }
    const existing = await db.teacher.findFirst({ where: { lastName, firstName } })
    if (existing) { errors.push(`Row ${i + 2}: teacher ${fullName} already exists`); skipped++; continue }
    const teacher = await db.teacher.create({
      data: { lastName, firstName, fullName, role, isVospitatel, passwordHash: await hashPassword(String(password)) },
    })
    imported++
  }
  return { imported, skipped, errors }
}

async function importClasses(sheet: any[], mode: 'add' | 'replace') {
  let imported = 0, skipped = 0
  const errors: string[] = []
  for (const [i, row] of sheet.entries()) {
    const name = row['Название'] ?? row['Номер'] ?? row['name']
    if (!name) { errors.push(`Row ${i + 2}: missing name`); skipped++; continue }
    if (mode === 'replace') { await db.class.deleteMany({}); mode = 'add' }
    const existing = await db.class.findUnique({ where: { name: String(name).trim() } })
    if (existing) { skipped++; continue }
    await db.class.create({ data: { name: String(name).trim() } })
    imported++
  }
  return { imported, skipped, errors }
}

async function importSubjects(sheet: any[], mode: 'add' | 'replace') {
  let imported = 0, skipped = 0
  const errors: string[] = []
  for (const [i, row] of sheet.entries()) {
    const name = row['Название'] ?? row['name']
    if (!name) { errors.push(`Row ${i + 2}: missing name`); skipped++; continue }
    if (mode === 'replace') { await db.subject.deleteMany({}); mode = 'add' }
    const existing = await db.subject.findUnique({ where: { name: String(name).trim() } })
    if (existing) { skipped++; continue }
    await db.subject.create({ data: { name: String(name).trim() } })
    imported++
  }
  return { imported, skipped, errors }
}

async function importGrades(sheet: any[]) {
  let imported = 0, skipped = 0
  const errors: string[] = []
  for (const [i, row] of sheet.entries()) {
    const studentName = row['Ученик'] ?? row['ФИО ученика']
    const className = row['Класс']
    const subjectName = row['Предмет']
    const date = row['Дата'] ?? row['Date']
    const value = row['Оценка'] ?? row['value']
    const comment = row['Комментарий'] ?? ''
    if (!studentName || !className || !subjectName || !date || !value) { errors.push(`Row ${i + 2}: missing fields`); skipped++; continue }
    const student = await db.student.findFirst({ where: { fullName: String(studentName).trim(), class: { name: String(className).trim() } } })
    const subject = await db.subject.findUnique({ where: { name: String(subjectName).trim() } })
    const classRec = await db.class.findUnique({ where: { name: String(className).trim() } })
    if (!student || !subject || !classRec) { errors.push(`Row ${i + 2}: student/class/subject not found`); skipped++; continue }
    const lessonDate = String(date).trim()
    let lesson = await db.lesson.findUnique({ where: { date_classId_subjectId: { date: lessonDate, classId: classRec.id, subjectId: subject.id } } })
    if (!lesson) {
      lesson = await db.lesson.create({ data: { date: lessonDate, classId: classRec.id, subjectId: subject.id, teacherId: student.classId } })
    }
    await db.grade.upsert({
      where: { lessonId_studentId: { lessonId: lesson.id, studentId: student.id } },
      create: { lessonId: lesson.id, studentId: student.id, value: String(value).trim(), comment: String(comment).trim(), teacherId: student.classId },
      update: { value: String(value).trim(), comment: String(comment).trim() },
    })
    imported++
  }
  return { imported, skipped, errors }
}

async function importRecommendations(sheet: any[]) {
  let imported = 0, skipped = 0
  const errors: string[] = []
  for (const [i, row] of sheet.entries()) {
    const studentName = row['Ученик'] ?? row['ФИО ученика']
    const className = row['Класс']
    const text = row['Текст'] ?? row['Рекомендация']
    if (!studentName || !className || !text) { errors.push(`Row ${i + 2}: missing fields`); skipped++; continue }
    const student = await db.student.findFirst({ where: { fullName: String(studentName).trim(), class: { name: String(className).trim() } } })
    if (!student) { errors.push(`Row ${i + 2}: student not found`); skipped++; continue }
    await db.recommendation.updateMany({ where: { studentId: student.id, isCurrent: true }, data: { isCurrent: false } })
    await db.recommendation.create({ data: { studentId: student.id, text: String(text).trim(), authorId: student.classId, isCurrent: true } })
    imported++
  }
  return { imported, skipped, errors }
}

const importers: Record<string, (sheet: any[], mode?: 'add' | 'replace') => Promise<{ imported: number; skipped: number; errors: string[] }>> = {
  'Ученики': (s, m = 'add') => importStudents(s, m),
  'Педагоги': (s, m = 'add') => importTeachers(s, m),
  'Классы': (s, m = 'add') => importClasses(s, m),
  'Предметы': (s, m = 'add') => importSubjects(s, m),
  'Оценки': importGrades,
  'Рекомендации': importRecommendations,
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
    const formData = await req.formData()
    const file = formData.get('file') as File
    const mode = (formData.get('mode') as 'add' | 'replace') ?? 'add'
    if (!file) return NextResponse.json({ error: 'File required' }, { status: 400 })
    if (!file.name.match(/\.xlsx?$/i)) return NextResponse.json({ error: 'Only .xls/.xlsx allowed' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    const results = [] as any[]
    let sheetsProcessed = 0

    for (const sheetName of SHEETS) {
      if (!workbook.SheetNames.includes(sheetName)) continue
      const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
      const importer = importers[sheetName]
      if (!importer) continue
      const result = await importer(sheet, mode)
      results.push({ sheet: sheetName, total: sheet.length, ...result })
      sheetsProcessed++
    }

    await logAction((await requireAdmin()).teacherId, 'import_excel', `Imported ${sheetsProcessed} sheets`)
    return NextResponse.json({ success: true, sheetsProcessed, results })
  } catch (e) {
    return handleApiError(e)
  }
}

// GET /api/import/excel - preview only
export async function GET(req: Request) {
  try {
    await requireAdmin()
    const url = new URL(req.url)
    const fileParam = url.searchParams.get('file')
    if (!fileParam) return NextResponse.json({ error: 'file param required' }, { status: 400 })
    return NextResponse.json({ error: 'Preview not implemented' }, { status: 501 })
  } catch (e) {
    return handleApiError(e)
  }
}