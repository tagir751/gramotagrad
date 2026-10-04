/**
 * ПРОЦЕСС: CRUD справочника классов (только админ).
 * НАЗНАЧЕНИЕ: управление списком классов (1..5 и т.д.).
 * ТРИГГЕР: /api/admin/classes GET/POST/PATCH/DELETE из админки.
 * ВХОДНЫЕ ДАННЫЕ: GET — нет; POST — classCreateSchema; PATCH — classUpdateSchema; DELETE — id в query.
 * ПРОВЕРКА ПРАВ: requireAdmin везде.
 * ЧТО ЧИТАЕТСЯ ИЗ БД: Class (+ count учеников/уроков для проверки удаления).
 * ЧТО ПИШЕТСЯ В БД: create/update/delete Class.
 * ОШИБКИ: 401/403 не-админ; 400 дубль имени / некорректные данные; 404 не найден; 409 класс не пуст (есть ученики или уроки).
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: [{id, name}] или {ok:true} / текст ошибки.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: API — одинаковое; UI использует крупные кнопки/инпуты (min-height 44px).
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, logAction } from '@/lib/auth'
import { idSchema, classCreateSchema, classUpdateSchema } from '@/lib/validators'
import { handleApiError } from '@/lib/api'

// GET /api/admin/classes — список всех классов.
export async function GET() {
  try {
    await requireAdmin()
    const classes = await db.class.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, _count: { select: { students: true, lessons: true } } },
    })
    return NextResponse.json(classes)
  } catch (e) {
    return handleApiError(e)
  }
}

// POST /api/admin/classes — создать класс.
export async function POST(req: Request) {
  try {
    await requireAdmin()
    const parsed = classCreateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })

    const existing = await db.class.findUnique({ where: { name: parsed.data.name } })
    if (existing) return NextResponse.json({ error: 'Класс с таким именем уже есть' }, { status: 400 })

    const cls = await db.class.create({ data: { name: parsed.data.name } })
    await logAction((await requireAdmin()).teacherId, 'class_create', `Class ${cls.name}`)
    return NextResponse.json(cls, { status: 201 })
  } catch (e) {
    return handleApiError(e)
  }
}

// PATCH /api/admin/classes — обновить класс.
export async function PATCH(req: Request) {
  try {
    const session = await requireAdmin()
    const parsed = classUpdateSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: 'Некорректные данные' }, { status: 400 })

    const existing = await db.class.findUnique({ where: { id: parsed.data.id } })
    if (!existing) return NextResponse.json({ error: 'Класс не найден' }, { status: 404 })

    if (parsed.data.name !== undefined && parsed.data.name !== existing.name) {
      const dup = await db.class.findUnique({ where: { name: parsed.data.name } })
      if (dup) return NextResponse.json({ error: 'Класс с таким именем уже есть' }, { status: 400 })
    }

    const cls = await db.class.update({
      where: { id: parsed.data.id },
      data: { ...(parsed.data.name !== undefined && { name: parsed.data.name }) },
    })
    await logAction(session.teacherId, 'class_update', `Class ${cls.name}`)
    return NextResponse.json(cls)
  } catch (e) {
    return handleApiError(e)
  }
}

// DELETE /api/admin/classes?id=... — удалить класс.
export async function DELETE(req: Request) {
  try {
    const session = await requireAdmin()
    const url = new URL(req.url)
    const id = Number(url.searchParams.get('id'))
    if (!id || Number.isNaN(id)) return NextResponse.json({ error: 'Некорректный id' }, { status: 400 })

    const cls = await db.class.findUnique({
      where: { id },
      include: { _count: { select: { students: true, lessons: true } } },
    })
    if (!cls) return NextResponse.json({ error: 'Класс не найден' }, { status: 404 })
    if (cls._count.students > 0 || cls._count.lessons > 0) {
      return NextResponse.json({ error: 'В классе есть ученики или уроки — удаление запрещено' }, { status: 409 })
    }

    await db.class.delete({ where: { id } })
    await logAction(session.teacherId, 'class_delete', `Class ${cls.name}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}