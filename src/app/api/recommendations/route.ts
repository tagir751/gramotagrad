/**
 * ПРОЦЕСС: CRUD рекомендаций ученикам.
 * НАЗНАЧЕНИЕ: текущая рекомендация (isCurrent) + история для ученика.
 * ТРИГГЕР: GET /api/recommendations?studentId&history|all; POST /api/recommendations.
 * ВХОДНЫЕ ДАННЫЕ: GET — studentId (опционально), all/history флаги; POST — recommendationCreateSchema.
 * ПРОВЕРКА ПРАВ:
 *   GET — любая авторизованная роль (учитель своих классов, админ — все).
 *   POST — админ или учитель с доступом к классу ученика (через hasClassAccess).
 * ЧТО ЧИТАЕТСЯ ИЗ БД: Recommendation (+ Student + Teacher.author).
 * ЧТО ПИШЕТСЯ В БД: при POST — updateMany isCurrent=false для studentId + create новая isCurrent=true.
 * ОШИБКИ: 401/403/400; 404 ученик не найден.
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: массив рекомендаций с автором/датой или созданная запись.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: API одинаковое; UI — крупные текстовые поля.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireSession, hasClassAccess, isAdmin, logAction } from '@/lib/auth'
import { recommendationCreateSchema, recommendationQuerySchema } from '@/lib/validators'
import { handleApiError } from '@/lib/api'

// GET /api/recommendations?studentId=1&history=true|all=true
export async function GET(req: Request) {
  try {
    const session = await requireSession()
    const url = new URL(req.url)
    const parsed = recommendationQuerySchema.safeParse({
      studentId: url.searchParams.get('studentId') ?? undefined,
      all: url.searchParams.get('all') ?? undefined,
      history: url.searchParams.get('history') ?? undefined,
    })
    if (!parsed.success) return NextResponse.json({ error: 'Некорректные параметры' }, { status: 400 })

    const { studentId, all, history } = parsed.data

    // Определяем фильтр по ученикам в зависимости от роли
    let studentFilter: Record<string, unknown> = {}
    if (studentId !== undefined) {
      if (!(await isAdmin(session.teacherId))) {
        const student = await db.student.findUnique({ where: { id: studentId }, select: { classId: true } })
        if (!student || !(await hasClassAccess(session.teacherId, student.classId))) {
          return NextResponse.json({ error: 'Нет доступа к ученику' }, { status: 403 })
        }
      }
      studentFilter = { id: studentId }
    } else if (!(await isAdmin(session.teacherId))) {
      // Учитель видит только своих классов
      const [ownClasses, respClasses] = await Promise.all([
        db.class.findMany({
          where: { teachers: { some: { teacherId: session.teacherId } } },
          select: { id: true },
        }),
        db.responsibleEducator.findMany({
          where: { teacherId: session.teacherId },
          select: { classId: true },
        }),
      ])
      studentFilter = { classId: { in: [...new Set([...ownClasses.map((c) => c.id), ...respClasses.map((r) => r.classId)])] } }
    }

    // all=true (по всем ученикам) и history=true (по одному) одинаково означают
    // «включая погашенные». Раньше history разбирался схемой, но игнорировался.
    const includeArchived = all === true || history === true
    const whereBase = { student: studentFilter }
    const where = includeArchived ? whereBase : { ...whereBase, isCurrent: true }

    const recommendations = await db.recommendation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { id: true, fullName: true, class: { select: { name: true } } } },
        author: { select: { id: true, fullName: true, lastName: true } },
      },
    })

    return NextResponse.json(recommendations.map((r) => ({
      id: r.id,
      text: r.text,
      isCurrent: r.isCurrent,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      studentId: r.studentId,
      student: r.student,
      authorId: r.authorId,
      author: r.author,
    })))
  } catch (e) {
    return handleApiError(e)
  }
}

// POST /api/recommendations — создать рекомендацию (гасит старые isCurrent для ученика).
export async function POST(req: Request) {
  try {
    const session = await requireSession()
    const parsed = recommendationCreateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })

    const { studentId, text } = parsed.data

    // Проверка доступа к классу ученика
    const student = await db.student.findUnique({ where: { id: studentId }, select: { classId: true, fullName: true } })
    if (!student) return NextResponse.json({ error: 'Ученик не найден' }, { status: 404 })

    if (!(await isAdmin(session.teacherId)) && !(await hasClassAccess(session.teacherId, student.classId))) {
      return NextResponse.json({ error: 'Нет доступа к классу ученика' }, { status: 403 })
    }

    const rec = await db.$transaction(async (tx) => {
      await tx.recommendation.updateMany({ where: { studentId, isCurrent: true }, data: { isCurrent: false } })
      return tx.recommendation.create({
        data: { studentId, text, authorId: session.teacherId, isCurrent: true },
        include: { student: { select: { id: true, fullName: true, class: { select: { name: true } } } }, author: { select: { id: true, fullName: true, lastName: true } } },
      })
    })

    await logAction(session.teacherId, 'recommendation_write', `Rec for ${student.fullName}`)
    return NextResponse.json({
      id: rec.id,
      text: rec.text,
      isCurrent: rec.isCurrent,
      createdAt: rec.createdAt.toISOString(),
      updatedAt: rec.updatedAt.toISOString(),
      studentId: rec.studentId,
      student: rec.student,
      authorId: rec.authorId,
      author: rec.author,
    }, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}