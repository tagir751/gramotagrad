/**
 * PROCESS: reports - analytics for grades, lessons, activity.
 * PURPOSE: provide aggregated data for charts and tables.
 * TRIGGER: GET /api/reports?type=...&classId=...&subjectId=...&teacherId=...&dateFrom=...&dateTo=...
 * INPUT: query params: type (student|teacher|school), classId, subjectId, teacherId, dateFrom, dateTo.
 * AUTH CHECK:
 *   - admin: all data;
 *   - teacher: only own classes/subjects;
 *   - vospitatel: only responsible classes.
 * READS FROM DB:
 *   - Grade (for grades analytics);
 *   - Lesson (for lesson counts);
 *   - ActionLog (for activity).
 * WRITES TO DB: nothing.
 * ERRORS: 401/403/400.
 * USER SEES: JSON with aggregations.
 * MOBILE BEHAVIOR: API same; UI renders charts/cards.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession, isAdmin, teacherHasClass, teacherHasSubject } from '@/lib/auth'
import { handleApiError } from '@/lib/api'

export async function GET(req: Request) {
  try {
    const session = await requireSession()
    const url = new URL(req.url)
    const type = url.searchParams.get('type') ?? 'school'
    const classId = url.searchParams.get('classId')
    const subjectId = url.searchParams.get('subjectId')
    const teacherId = url.searchParams.get('teacherId')
    const dateFrom = url.searchParams.get('dateFrom')
    const dateTo = url.searchParams.get('dateTo')

    // Base where clauses
    let lessonWhere: any = {}
    let gradeWhere: any = {}

    if (classId) {
      const cid = parseInt(classId, 10)
      if (isNaN(cid)) return NextResponse.json({ error: 'Invalid classId' }, { status: 400 })
      if (!(await teacherHasClass(session.teacherId, cid))) return NextResponse.json({ error: 'No access to class' }, { status: 403 })
      lessonWhere.classId = cid
      gradeWhere.lesson = { classId: cid }
    }
    if (subjectId) {
      const sid = parseInt(subjectId, 10)
      if (isNaN(sid)) return NextResponse.json({ error: 'Invalid subjectId' }, { status: 400 })
      if (!(await teacherHasSubject(session.teacherId, sid))) return NextResponse.json({ error: 'No access to subject' }, { status: 403 })
      lessonWhere.subjectId = sid
      gradeWhere.lesson = { ...gradeWhere.lesson, subjectId: sid }
    }
    if (teacherId) {
      const tid = parseInt(teacherId, 10)
      if (isNaN(tid)) return NextResponse.json({ error: 'Invalid teacherId' }, { status: 400 })
      if (!(await isAdmin(session.teacherId)) && tid !== session.teacherId) {
        return NextResponse.json({ error: 'No access to teacher' }, { status: 403 })
      }
      lessonWhere.teacherId = tid
      gradeWhere.teacherId = tid
    }
    if (dateFrom) {
      const d = new Date(dateFrom)
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid dateFrom' }, { status: 400 })
      lessonWhere.date = { ...lessonWhere.date, gte: dateFrom }
      gradeWhere.lesson = { ...gradeWhere.lesson, date: { ...gradeWhere.lesson?.date, gte: dateFrom } }
    }
    if (dateTo) {
      const d = new Date(dateTo)
      if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid dateTo' }, { status: 400 })
      lessonWhere.date = { ...lessonWhere.date, lte: dateTo }
      gradeWhere.lesson = { ...gradeWhere.lesson, date: { ...gradeWhere.lesson?.date, lte: dateTo } }
    }

    // For non-admin, restrict to own classes if no explicit filters
    if (!(await isAdmin(session.teacherId)) && !classId && !teacherId) {
      const ownClasses = await db.class.findMany({
        where: { teachers: { some: { teacherId: session.teacherId } } },
        select: { id: true },
      })
      const ownIds = ownClasses.map((c) => c.id)
      if (!ownIds.length) return NextResponse.json({ grades: [], lessons: [], activity: [] })
      lessonWhere.classId = { in: ownIds }
      gradeWhere.lesson = { ...gradeWhere.lesson, classId: { in: ownIds } }
    }

    switch (type) {
      case 'student': {
        // Per-student grade analytics
        if (!classId) return NextResponse.json({ error: 'classId required for student type' }, { status: 400 })
        const students = await db.student.findMany({
          where: { classId: parseInt(classId, 10), active: true },
          select: { id: true, fullName: true },
        })
        const studentIds = students.map((s) => s.id)
        const grades = await db.grade.findMany({
          where: { studentId: { in: studentIds }, lesson: lessonWhere },
          select: { value: true, studentId: true, lesson: { select: { date: true, subject: { select: { name: true } } } } },
        })
        return NextResponse.json({ students, grades })
      }
      case 'teacher': {
        // Teacher's lessons and grades
        if (!teacherId && !classId && !subjectId) return NextResponse.json({ error: 'teacherId or filters required' }, { status: 400 })
        const [lessons, grades] = await Promise.all([
          db.lesson.findMany({ where: lessonWhere, include: { subject: { select: { name: true } }, class: { select: { name: true } } }, orderBy: { date: 'desc' } }),
          db.grade.findMany({ where: gradeWhere, select: { value: true, lesson: { select: { date: true, subject: { select: { name: true } } } } } }),
        ])
        return NextResponse.json({ lessons, grades })
      }
      case 'school':
      default: {
        // School-wide analytics. Grade.value — строка, среднего через SQL нет:
        // считаем avg в JS только по 5/4/3/2 (Н и пустая не входят).
        const [totalLessons, totalGrades, gradeDist, numericGrades] = await Promise.all([
          db.lesson.count({ where: lessonWhere }),
          db.grade.count({ where: gradeWhere }),
          db.grade.groupBy({ by: ['value'], where: gradeWhere, _count: { value: true } }),
          db.grade.findMany({ where: { ...gradeWhere, value: { in: ['5', '4', '3', '2'] } }, select: { value: true } }),
        ])
        const nums = numericGrades.map((g) => Number(g.value)).filter((n) => !Number.isNaN(n))
        return NextResponse.json({
          totalLessons,
          totalGrades,
          gradeDistribution: gradeDist.map((g) => ({ value: g.value, count: g._count.value })),
          averageGrade: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null,
        })
      }
    }
  } catch (e) {
    return handleApiError(e)
  }
}