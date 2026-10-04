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
let lastSweep = Date.now()

/** Чистка протухших бакетов: без неё Map растёт на каждый новый IP и живёт
 *  столько же, сколько процесс. Подметаем не чаще раза в минуту — это O(n)
 *  по числу живых ключей, а не по числу запросов. */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [k, v] of buckets) {
    if (now > v.resetAt) buckets.delete(k)
  }
}

export function rateLimit(key: string, limit = 5, windowMs = 60_000): boolean {
  const now = Date.now()
  sweep(now)
  const b = buckets.get(key)
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  b.count += 1
  return b.count <= limit
}

/** IP клиента для rate-limit и журнала.
 *
 *  ВАЖНО: x-forwarded-for подделывается кем угодно, если приложение смотрит
 *  в интернет напрямую. Доверять ему можно только за обратным прокси, который
 *  сам переписывает заголовок, — у нас это Passenger/nginx на Beget.
 *  Берём ПЕРВЫЙ хоп: это клиент, остальные дописаны прокси по пути.
 *  Раньше бралась вся строка целиком, поэтому "1.1.1.1, 2.2.2.2" и
 *  "1.1.1.1, 3.3.3.3" считались разными клиентами и лимит обходился
 *  простым добавлением мусора в хвост заголовка. */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  const first = xff?.split(',')[0]?.trim()
  if (first) return first.slice(0, 45) // IPv6 max 45 символов
  return req.headers.get('x-real-ip')?.trim().slice(0, 45) || 'unknown'
}
