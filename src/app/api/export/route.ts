/**
 * PROCESS: export data to Excel (admin only).
 * PURPOSE: download full database dump or filtered data as .xlsx.
 * TRIGGER: GET /api/export?type=full|grades|students&classId=&dateFrom=&dateTo=...
 * INPUT: query params: type, classId, subjectId, dateFrom, dateTo.
 * AUTH CHECK: requireAdmin.
 * READS FROM DB: Teacher, Class, Subject, Student, Lesson, Grade, Recommendation, ActionLog.
 * WRITES TO DB: nothing.
 * ERRORS: 401/403/400; network - text.
 * USER SEES: .xlsx file download.
 * MOBILE BEHAVIOR: API same; UI - download link.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, logAction } from '@/lib/auth'
import { handleApiError } from '@/lib/api'
import * as XLSX from 'xlsx'

export async function GET(req: Request) {
  try {
    const session = await requireAdmin()
    const url = new URL(req.url)
    const type = url.searchParams.get('type') ?? 'full'
    const classId = url.searchParams.get('classId')
    const subjectId = url.searchParams.get('subjectId')
    const dateFrom = url.searchParams.get('dateFrom')
    const dateTo = url.searchParams.get('dateTo')

    const lessonWhere: any = {}
    if (classId) lessonWhere.classId = parseInt(classId, 10)
    if (subjectId) lessonWhere.subjectId = parseInt(subjectId, 10)
    if (dateFrom) lessonWhere.date = { ...lessonWhere.date, gte: dateFrom }
    if (dateTo) lessonWhere.date = { ...lessonWhere.date, lte: dateTo }

    const gradeWhere: any = { lesson: lessonWhere }

    const workbook = XLSX.utils.book_new()

    if (type === 'full' || type === 'teachers') {
      const teachers = await db.teacher.findMany({ orderBy: { fullName: 'asc' } })
      const sheet = XLSX.utils.json_to_sheet(teachers.map(t => ({
        id: t.id, lastName: t.lastName, firstName: t.firstName, fullName: t.fullName,
        role: t.role, isVospitatel: t.isVospitatel, createdAt: t.createdAt.toISOString(),
      })))
      XLSX.utils.book_append_sheet(workbook, sheet, 'Педагоги')
    }

    if (type === 'full' || type === 'classes') {
      const classes = await db.class.findMany({ orderBy: { name: 'asc' } })
      const sheet = XLSX.utils.json_to_sheet(classes.map(c => ({ id: c.id, name: c.name, createdAt: c.createdAt.toISOString() })))
      XLSX.utils.book_append_sheet(workbook, sheet, 'Классы')
    }

    if (type === 'full' || type === 'subjects') {
      const subjects = await db.subject.findMany({ orderBy: { name: 'asc' } })
      const sheet = XLSX.utils.json_to_sheet(subjects.map(s => ({ id: s.id, name: s.name, createdAt: s.createdAt.toISOString() })))
      XLSX.utils.book_append_sheet(workbook, sheet, 'Предметы')
    }

    if (type === 'full' || type === 'students') {
      const where = classId ? { classId: parseInt(classId, 10) } : {}
      const students = await db.student.findMany({ where, include: { class: { select: { name: true } } }, orderBy: [{ class: { name: 'asc' } }, { fullName: 'asc' }] })
      const sheet = XLSX.utils.json_to_sheet(students.map(s => ({
        id: s.id, fullName: s.fullName, active: s.active, classId: s.classId, className: s.class?.name, createdAt: s.createdAt.toISOString(),
      })))
      XLSX.utils.book_append_sheet(workbook, sheet, 'Ученики')
    }

    if (type === 'full' || type === 'lessons') {
      const lessons = await db.lesson.findMany({ where: lessonWhere, include: { class: { select: { name: true } }, subject: { select: { name: true } } }, orderBy: { date: 'desc' } })
      const sheet = XLSX.utils.json_to_sheet(lessons.map(l => ({
        id: l.id, date: l.date, topic: l.topic, homework: l.homework,
        classId: l.classId, className: l.class?.name, subjectId: l.subjectId, subjectName: l.subject?.name,
        teacherId: l.teacherId, createdAt: l.createdAt.toISOString(),
      })))
      XLSX.utils.book_append_sheet(workbook, sheet, 'Уроки')
    }

    if (type === 'full' || type === 'grades') {
      const grades = await db.grade.findMany({ where: gradeWhere, include: { student: { select: { fullName: true, class: { select: { name: true } } } }, lesson: { select: { date: true, subject: { select: { name: true } } } } } })
      const sheet = XLSX.utils.json_to_sheet(grades.map(g => ({
        id: g.id, value: g.value, comment: g.comment,
        studentId: g.studentId, studentName: g.student?.fullName, className: g.student?.class?.name,
        lessonId: g.lessonId, lessonDate: g.lesson?.date, subjectName: g.lesson?.subject?.name,
        teacherId: g.teacherId, createdAt: g.createdAt.toISOString(),
      })))
      XLSX.utils.book_append_sheet(workbook, sheet, 'Оценки')
    }

    if (type === 'full' || type === 'recommendations') {
      const recs = await db.recommendation.findMany({ include: { student: { select: { fullName: true, class: { select: { name: true } } } }, author: { select: { fullName: true } } } })
      const sheet = XLSX.utils.json_to_sheet(recs.map(r => ({
        id: r.id, text: r.text, isCurrent: r.isCurrent,
        studentId: r.studentId, studentName: r.student?.fullName, className: r.student?.class?.name,
        authorId: r.authorId, authorName: r.author?.fullName, createdAt: r.createdAt.toISOString(),
      })))
      XLSX.utils.book_append_sheet(workbook, sheet, 'Рекомендации')
    }

    if (type === 'full' || type === 'logs') {
      const logs = await db.actionLog.findMany({ take: 1000, include: { teacher: { select: { fullName: true } } }, orderBy: { timestamp: 'desc' } })
      const sheet = XLSX.utils.json_to_sheet(logs.map(l => ({
        id: l.id, action: l.action, description: l.description,
        teacherId: l.teacherId, teacherName: l.teacher?.fullName, timestamp: l.timestamp.toISOString(), ip: l.ip,
      })))
      XLSX.utils.book_append_sheet(workbook, sheet, 'Логи')
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    await logAction(session.teacherId, 'export_excel', `Export type=${type}`)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="gramotagrad-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  } catch (e) {
    return handleApiError(e)
  }
}