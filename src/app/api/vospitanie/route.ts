/**
 * PROCESS: vospitanie section data for teacher/curator/admin.
 * PURPOSE: provide overview of classes: responsible educators, students, recommendations, teacher comments.
 * TRIGGER: GET /api/vospitanie?classId=... from /vospitanie page.
 * INPUT: query `classId` (optional).
 * AUTH CHECK:
 *   - admin sees all;
 *   - teacher with isVospitatel=true sees own classes + responsible classes;
 *   - teacher without flag sees only assigned classes.
 * READS FROM DB:
 *   - Class (with responsible educator + teachers);
 *   - Student (active, by classes);
 *   - Recommendation (isCurrent=true, by students of classes);
 *   - Grade.comment (non-empty, by lessons of classes) - teacher comments;
 *   - Teacher (for author names).
 * WRITES TO DB: nothing.
 * ERRORS: 401/403; network - text.
 * USER SEES: {classes[], students[], recommendations[], comments[], responsible[]}.
 * MOBILE BEHAVIOR: API same; UI - cards on mobile.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession, isAdmin, hasClassAccess } from '@/lib/auth'
import { handleApiError } from '@/lib/api'

async function fetchData(session: any, allowedClassIds: number[]) {
  const [classes, students, recommendations, comments, responsible] = await Promise.all([
    db.class.findMany({
      where: { id: { in: allowedClassIds } },
      include: { responsibleEducators: { include: { teacher: { select: { id: true, fullName: true } } }, take: 1 } },
      orderBy: { name: 'asc' },
    }),
    db.student.findMany({
      where: { classId: { in: allowedClassIds }, active: true },
      include: { class: { select: { id: true, name: true } } },
      orderBy: [{ class: { name: 'asc' } }, { fullName: 'asc' }],
    }),
    db.recommendation.findMany({
      where: { isCurrent: true, student: { classId: { in: allowedClassIds } } },
      include: {
        student: { select: { id: true, fullName: true, classId: true } },
        author: { select: { id: true, fullName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.grade.findMany({
      where: { comment: { not: '' }, lesson: { classId: { in: allowedClassIds } } },
      include: {
        student: { select: { id: true, fullName: true, classId: true } },
        lesson: { select: { id: true, date: true, subject: { select: { name: true } } } },
        teacher: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    }),
    db.responsibleEducator.findMany({
      where: { classId: { in: allowedClassIds } },
      include: { teacher: { select: { id: true, fullName: true } }, class: { select: { id: true, name: true } } },
    }),
  ])

  return {
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      responsible: c.responsibleEducators[0] ? { id: c.responsibleEducators[0].teacher.id, fullName: c.responsibleEducators[0].teacher.fullName } : null,
    })),
    students: students.map((s) => ({ id: s.id, fullName: s.fullName, classId: s.classId, className: s.class?.name })),
    recommendations: recommendations.map((r) => ({
      id: r.id,
      text: r.text,
      createdAt: r.createdAt.toISOString(),
      studentId: r.studentId,
      student: r.student,
      authorId: r.authorId,
      author: r.author,
    })),
    comments: comments.map((c) => ({
      id: c.id,
      text: c.comment,
      date: c.createdAt.toISOString(),
      lessonDate: c.lesson.date,
      subject: c.lesson.subject.name,
      studentId: c.studentId,
      student: c.student,
      teacherId: c.teacherId,
      teacher: c.teacher,
    })),
    responsible: responsible.map((r) => ({
      classId: r.classId,
      className: r.class.name,
      teacherId: r.teacherId,
      teacherFullName: r.teacher.fullName,
    })),
  }
}

export async function GET(req: Request) {
  try {
    const session = await requireSession()
    const url = new URL(req.url)
    const rawClassId = url.searchParams.get('classId')

    let allowedClassIds: number[] = []
    if (rawClassId !== null) {
      const parsed = parseInt(rawClassId, 10)
      if (isNaN(parsed)) return NextResponse.json({ error: 'Invalid classId' }, { status: 400 })
      if (!(await hasClassAccess(session.teacherId, parsed))) return NextResponse.json({ error: 'No access to class' }, { status: 403 })
      allowedClassIds = [parsed]
    } else if (await isAdmin(session.teacherId)) {
      const all = await db.class.findMany({ select: { id: true } })
      allowedClassIds = all.map((c) => c.id)
    } else {
      const own = await db.class.findMany({
        where: { teachers: { some: { teacherId: session.teacherId } } },
        select: { id: true },
      })
      const resp = await db.responsibleEducator.findMany({
        where: { teacherId: session.teacherId },
        select: { classId: true },
      })
      const respIds = resp.map((r) => r.classId)
      allowedClassIds = [...new Set([...own.map((c) => c.id), ...respIds])]
    }
    if (!allowedClassIds.length) return NextResponse.json({ classes: [], students: [], recommendations: [], comments: [], responsible: [] })

    const data = await fetchData(session, allowedClassIds)
    return NextResponse.json(data)
  } catch (e) {
    return handleApiError(e)
  }
}