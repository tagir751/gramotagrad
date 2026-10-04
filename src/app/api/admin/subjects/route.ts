/**
 * ПРОЦЕСС: CRUD справочника предметов (только админ).
 * НАЗНАЧЕНИЕ: управление списком предметов.
 * ТРИГГЕР: /api/admin/subjects GET/POST/PATCH/DELETE из админки.
 * ВХОДНЫЕ ДАННЫЕ: GET — нет; POST — subjectCreateSchema; PATCH — subjectUpdateSchema; DELETE — id в query.
 * ПРОВЕРКА ПРАВ: requireAdmin.
 * ЧТО ЧИТАЕТСЯ ИЗ БД: Subject (+ count уроков для проверки удаления).
 * ЧТО ПИШЕТСЯ В БД: create/update/delete Subject.
 * ОШИБКИ: 401/403; 400 дубль/валидация; 404 не найден; 409 по предмету есть уроки.
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: [{id, name}] / {ok:true} / текст ошибки.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: API одинаковое; UI — крупные инпуты.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, logAction } from '@/lib/auth'
import { idSchema, subjectCreateSchema, subjectUpdateSchema } from '@/lib/validators'
import { handleApiError } from '@/lib/api'

export async function GET() {
  try {
    await requireAdmin()
    const subjects = await db.subject.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, _count: { select: { lessons: true } } },
    })
    return NextResponse.json(subjects)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
    const parsed = subjectCreateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })

    const existing = await db.subject.findUnique({ where: { name: parsed.data.name } })
    if (existing) return NextResponse.json({ error: 'Предмет с таким именем уже есть' }, { status: 400 })

    const subj = await db.subject.create({ data: { name: parsed.data.name } })
    await logAction((await requireAdmin()).teacherId, 'subject_create', `Subject ${subj.name}`)
    return NextResponse.json(subj, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireAdmin()
    const parsed = subjectUpdateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })

    const existing = await db.subject.findUnique({ where: { id: parsed.data.id } })
    if (!existing) return NextResponse.json({ error: 'Предмет не найден' }, { status: 404 })

    if (parsed.data.name !== undefined && parsed.data.name !== existing.name) {
      const dup = await db.subject.findUnique({ where: { name: parsed.data.name } })
      if (dup) return NextResponse.json({ error: 'Предмет с таким именем уже есть' }, { status: 400 })
    }

    const subj = await db.subject.update({
      where: { id: parsed.data.id },
      data: { ...(parsed.data.name !== undefined && { name: parsed.data.name }) },
    })
    await logAction(session.teacherId, 'subject_update', `Subject ${subj.name}`)
    return NextResponse.json(subj)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireAdmin()
    const url = new URL(req.url)
    const id = Number(url.searchParams.get('id'))
    if (!id || Number.isNaN(id)) return NextResponse.json({ error: 'Некорректный id' }, { status: 400 })

    const subj = await db.subject.findUnique({
      where: { id },
      include: { _count: { select: { lessons: true } } },
    })
    if (!subj) return NextResponse.json({ error: 'Предмет не найден' }, { status: 404 })
    if (subj._count.lessons > 0) {
      return NextResponse.json({ error: 'По предмету есть уроки — удаление запрещено' }, { status: 409 })
    }

    await db.subject.delete({ where: { id } })
    await logAction(session.teacherId, 'subject_delete', `Subject ${subj.name}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}