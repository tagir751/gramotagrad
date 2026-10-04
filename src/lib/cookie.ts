/**
 * Имя сессионной cookie. Edge-safe модуль (без node-зависимостей),
 * импортируется и в session.ts, и в middleware.
 *
 * Префикс __Host- требует Secure + Path=/ и отбрасывается браузерами
 * по обычному http. Поэтому __Host- только в production (там Secure=true),
 * локально — обычное имя, иначе вход «не реагирует»: сервер ставит cookie,
 * браузер её молча игнорирует, middleware снова шлёт на /login.
 */
export const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Host-gg_session' : 'gg_session'
