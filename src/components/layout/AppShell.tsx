'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import type { AuthSession } from '@/lib/auth'
import { useAppStore } from '@/store/app'

const items = [
  { href: '/journal', label: 'Журнал', icon: '📚' },
  { href: '/students', label: 'Ученики', icon: '👨‍🎓' },
  { href: '/reports', label: 'Отчёты', icon: '📊' },
  { href: '/vospitanie', label: 'Воспитание', icon: '💛' },
  { href: '/logs', label: 'Логи', icon: '📝' },
]

function navClass(active: boolean): string {
  return active ? 'gg-nav-link gg-nav-link-active' : 'gg-nav-link'
}

export function AppShell({ session, children }: { session: AuthSession; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const clearSession = useAppStore((s) => s.setSession)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const isAdmin = session.role === 'админ'

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      clearSession(null)
      router.replace('/login')
    }
  }

  const links = isAdmin ? [...items, { href: '/admin', label: 'Админ', icon: '⚙️' }] : items
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <div className="gg-shell">
      <header className="gg-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-horizontal.webp" alt="Грамотаград" className="gg-logo" />
        <button
          className="gg-burger"
          aria-label="Меню"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ☰
        </button>
        <nav className="gg-nav gg-nav-desktop" aria-label="Основная навигация">
          {links.map((it) => (
            <Link key={it.href} href={it.href} className={navClass(isActive(it.href))}>
              {it.label}
            </Link>
          ))}
        </nav>
        <span className={`gg-role ${isAdmin ? 'gg-role-admin' : ''}`}>
          {session.fullName} · {session.role}
        </span>
        <button className="gg-logout" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? 'Выход…' : 'Выйти'}
        </button>
      </header>

      {menuOpen && (
        <nav className="gg-nav gg-nav-mobile" aria-label="Мобильная навигация">
          {links.map((it) => (
            <Link key={it.href} href={it.href} className={navClass(isActive(it.href))} onClick={() => setMenuOpen(false)}>
              {it.label}
            </Link>
          ))}
        </nav>
      )}

      <main className="gg-main">{children}</main>

      <nav className="gg-tabbar" aria-label="Нижняя навигация">
        {links.map((it) => (
          <Link key={it.href} href={it.href} className={`gg-tabbar-item${isActive(it.href) ? ' active' : ''}`}>
            <span className="gg-tabbar-icon">{it.icon}</span>
            <span className="gg-tabbar-label">{it.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
