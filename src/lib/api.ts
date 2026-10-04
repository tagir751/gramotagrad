import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { ApiError } from './auth'

/** Обёртка для route handlers: zod + ApiError -> JSON с правильным статусом, без 500 на NaN. */
export function handleApiError(e: unknown) {
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: e.issues[0]?.message ?? 'Некорректные данные' },
      { status: 400 },
    )
  }
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message }, { status: e.status })
  }
  console.error(e)
  return NextResponse.json({ error: 'Внутренняя ошибка' }, { status: 500 })
}

// Простой in-memory rate-limit для логина: 5 попыток / минуту / IP.
// На одном инстансе Passenger этого достаточно; для кластера — вынести в БД.
const buckets = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, limit = 5, windowMs = 60_000): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  b.count += 1
  return b.count <= limit
}
