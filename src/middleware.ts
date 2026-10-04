import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/cookie'

// Защита роутов до hitting обработчиков: /journal,/students,/reports,/vospitanie,/admin,/logs
// Проверяет наличие cookie; полную проверку (срок, учитель) делает requireSession() в API.
export function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const { pathname } = req.nextUrl
  const isLogin = pathname === '/login'
  if (!token && !isLogin && pathname !== '/') {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (token && isLogin) {
    return NextResponse.redirect(new URL('/journal', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/journal/:path*', '/students/:path*', '/reports/:path*', '/vospitanie/:path*', '/admin/:path*', '/login'],
}
