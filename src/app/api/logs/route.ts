/**
 * ПРОЦЕСС: чтение логов действий (только админ).
 * НАЗНАЧЕНИЕ: аудит — кто, когда, что делал (входы, оценки, уроки, пароли и т.д.).
 * ТРИГГЕР: GET /api/logs при открытии /logs админом.
 * ВХОДНЫЕ ДАННЫЕ: query `page` (>=1, default 1), `limit` (1..100, default 50),
 *   опционально `action` (фильтр по типу действия).
 * ПРОВЕРКА ПРАВ: requireAdmin — не-админ получает 403.
 * ЧТО ЧИТАЕТСЯ ИЗ БД: ActionLog (timestamp desc) + Teacher (fullName для отображения),
 *   пагинация через skip/take, total count для totalPages.
 * ЧТО ПИШЕТСЯ В БД: ничего.
 * ОШИБКИ: 401 без сессии; 403 не-админ; 400 bad page/limit.
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: {logs, page, limit, totalPages} с полями
 *   id, timestamp, action, description, teacherId, teacherName, ip.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api'

export async function GET(req: Request) {
  try {
    await requireAdmin()
    const url = new URL(req.url)
    const rawPage = Number(url.searchParams.get('page') ?? '1')
    const rawLimit = Number(url.searchParams.get('limit') ?? '50')
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 50
    const action = url.searchParams.get('action') ?? undefined

    const where = action ? { action } : {}
    const [logs, total] = await Promise.all([
      db.actionLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { teacher: { select: { fullName: true } } },
      }),
      db.actionLog.count({ where }),
    ])

    return NextResponse.json({
      logs: logs.map((l) => ({
        id: l.id,
        timestamp: l.timestamp.toISOString(),
        action: l.action,
        description: l.description,
        teacherId: l.teacherId,
        teacherName: l.teacher?.fullName ?? null,
        ip: l.ip,
      })),
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (e) {
    return handleApiError(e)
  }
}