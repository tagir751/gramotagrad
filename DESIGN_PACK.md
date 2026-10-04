# DESIGN PACK — Грамотаград v2 (визуальный слепок для редизайна)

Собрано автоматически из кода на 2026-09-09. Код НЕ менялся.
Цель: внешняя дизайн-модель рисует красивый фронтенд, глядя на точные факты,
а не на догадки. После неё OpenCode переносит результат в `globals.css`/`.tsx`.

---

# 1. Ограничения проекта

- Next.js 16 App Router, клиентские компоненты (`'use client'`), серверные обёртки страниц через `Suspense`.
- Tailwind НЕ используется (0 классов во всём `src`). Весь стиль — `src/app/globals.css` (424 строки) + inline `style={{}}`.
- Шрифты: только системный стек (`-apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Pro Display', sans-serif`). `next/font` НЕ используется (требование офлайн-сборки Beget — шрифт из Google Fonts уронит билд без сети).
- Иконки: **эмодзи-символы** (📚 👨‍🎓 📊 💛 📝 ⚙️ ☰). `lucide-react` НЕ установлен (в `package.json` его нет) — ставить только если дизайн-модель потребует.
- Нет: `recharts` (графики — обычные div), модалок/Drawer/Dialog, тостов/sonner, `next/image` (только нативный `<img>` для логотипов `/brand/logo-horizontal.webp`, `/brand/logo-seal.webp`).
- Мобильные требования (не ломать): `min-height: 44px` у кнопок/инпутов, `font-size: 16px` (иначе iPhone зумит), `min-height: 100dvh`, `env(safe-area-inset-*)` в шапке/таб-баре, таблицы `min-width: 700px` в `overflow-x: auto` на десктопе → карточки на `<760px`.
- **Ломать имена классов `gg-*` нельзя**: 137 использований в 17 `.tsx`-файлах (инвентарь ниже). Дизайн-модель вправе менять только CSS-правила этих классов, не имена.

---

# 2. Текущие токены (`src/app/globals.css`, `:root`, дословно)

```css
--bg: #f0f2f5;
--card-bg: rgba(255, 255, 255, 0.88);
--text: #1a1a2e;
--text-secondary: #6b7280;
--text-tertiary: #9ca3af;
--green: #10b981;
--green-light: #d1fae5;
--green-glow: rgba(16, 185, 129, 0.3);
--yellow: #f59e0b;
--yellow-light: #fef3c7;
--yellow-glow: rgba(245, 158, 11, 0.4);
--orange: #f97316;
--orange-light: #ffedd5;
--red: #ef4444;
--red-light: #fee2e2;
--red-glow: rgba(239, 68, 68, 0.3);
--gray: #e5e7eb;
--gray-light: #f3f4f6;
--blue: #3b82f6;
--blue-light: #dbeafe;
--blue-glow: rgba(59, 130, 246, 0.3);
--purple: #8b5cf6;
--purple-light: #ede9fe;
--separator: rgba(0, 0, 0, 0.06);
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02);
--shadow-md: 0 4px 20px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.04);
--shadow-lg: 0 10px 40px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.04);
--radius-sm: 16px;
--radius-md: 20px;
--radius-lg: 24px;
--radius-xl: 28px;
/* legacy-алиасы (не использовать в новом коде): */
--brand-900: #1a1a2e; --brand-600: #3b82f6; --brand-500: #3b82f6;
--brand-100: #dbeafe; --brand-50: #f0f2f5;
--accent-600: #ea580c; --accent-500: #f97316; --accent-100: #ffedd5;
--paper: #f0f2f5; --text-strong: #1a1a2e; --text-muted: #6b7280;
--success: #10b981; --warning: #f59e0b; --danger: #ef4444;
```

Фон `body`: 3 статичных radial-градиента (pastel purple/pink/blue, opacity 0.1–0.12) поверх `var(--bg)`. Без анимаций.
Типографика: greeting-name 32px/800 с синим градиентом текста; h2 секций 20px/700; h1 логина 24px/700; мелочь 11–14px.

---

# 3. Инвентарь классов `gg-*` (только `className="..."` в `.tsx`; итого 137)

```
  23 gg-error
  12 gg-log-card
  11 gg-empty
   9 gg-ok
   8 gg-table-wrap
   8 gg-table
   6 gg-logs-cards
   6 gg-field
   6 gg-input
   4 gg-btn-danger
   3 gg-student-row
   3 gg-avatar
   3 gg-student-name
   2 gg-greeting
   2 gg-greeting-hello
   2 gg-card
   2 gg-section-header
   2 gg-count
   2 gg-show-mobile
   2 gg-btn
   2 gg-nav
   1 gg-greeting-date
   1 gg-hide-mobile
   1 gg-btn-success
   1 gg-btn-secondary
   1 gg-login-wrap
   1 gg-login-card
   1 gg-login-seal
   1 gg-login-title
   1 gg-shell
   1 gg-header
   1 gg-logo
   1 gg-burger
   1 gg-nav-desktop
   1 gg-logout
   1 gg-nav-mobile
   1 gg-main
   1 gg-tabbar
   1 gg-tabbar-icon
   1 gg-tabbar-label
```

Используются, но в `.tsx` ни разу (только CSS): `gg-nav-link`, `gg-nav-link-active`, `gg-role`, `gg-role-admin`, `gg-chip`, `gg-grade` (+`val-5/4/3/2/n`), `gg-grade-pill` (+`val-*`), `gg-btn`, `gg-page-btn`, `gg-page-info`, `gg-pagination`.

Назначение (кратко): `gg-shell/header/main` — каркас; `gg-nav*` — верхнее меню; `gg-tabbar*` — нижний таб-бар (только ≤760px); `gg-greeting*` — приветствие; `gg-card/gg-log-card/gg-logs-cards` — карточки; `gg-table/gg-table-wrap` — таблицы (десктоп); `gg-hide-mobile/gg-show-mobile` — переключатель таблица↔карточки; `gg-grade` — селект оценки-пилюля; `gg-grade-pill` — оценка для чтения; `gg-btn/btn-success/btn-secondary/btn-danger` — кнопки; `gg-field/gg-input` — поля; `gg-error/gg-ok/gg-empty` — состояния; `gg-chip` — чипы фильтров; `gg-count` — счётчик секции; `gg-avatar/student-row/student-name` — строки учеников; `gg-login-*` — экран входа; `gg-role/role-admin/logout/burger/logo` — шапка.

---

# 4. Инвентарь inline-стилей (`style={{...}}` — файл:строка:содержимое)

## `journal/JournalPage.tsx`
- `148`: фильтр-панель `display:flex gap:8 flexWrap:wrap marginBottom:12` (+класс `gg-card`)
- `194`: подпись урока `color:var(--text-secondary) fontSize:13`
- `237`: мобильная карточка ученика `marginBottom:8` (+`gg-student-row`)
- `246`: `marginBottom:0` (+`gg-field`)
- `259`: кнопка Сохранить `marginTop:12` (+`gg-btn gg-btn-success`)

## `logs/LogsPage.tsx`
- `99–110`: фильтр `marginBottom:12`, label `flex/center/gap:8`, select `padding:10px 12px fontSize:16 minHeight:44`
- `120–143`: десктоп-таблица: `overflowX:auto marginBottom:12`, `width:100% borderCollapse collapse minWidth:700`, thead `background:var(--gray-light)`, th/td `padding:10px 12px borderBottom:1px solid var(--separator)`, `whiteSpace:nowrap`, описание `maxWidth:300 overflow:hidden textOverflow:ellipsis`
- `146–158`: мобайл-карточки `gg-logs-cards gg-show-mobile` + `gg-log-card`, внутри `flex/space-between/marginBottom:4`
- `161–175`: пагинация `flex gap:8 center wrap marginTop:16`, кнопки `padding:12px 20px minHeight:44 minWidth:44 fontSize:16`, счётчик `flex center padding:0 12px fontSize:16`

## `students/StudentsPage.tsx`
- `81–82`: фильтр-карточка `marginBottom:12` (+`gg-card`, `gg-field`)
- `103`: список `gg-logs-cards` с `display:flex` (всегда карточки, не только мобайл)
- `105`: карточка `opacity` по `active`
- `110`: подстрока `fontSize:12 color:var(--text-secondary) fontWeight:500`
- `115`: кнопка `padding:8px 14px minHeight:44 width:auto` (+`gg-btn-secondary`)

## `reports/ReportsPage.tsx`
- `74–96`: панель фильтров `flex gap:8 wrap marginBottom:16`, label `flex column gap:4`, инпуты `fontSize:16 minHeight:44 padding:10px 12px`, кнопка `alignSelf:flex-end`
- `102–114`: `marginBottom:24`, metric-grid `grid gap:16 repeat(auto-fit,minmax(200px,1fr))`, цифры `fontSize:24`, распределение `flex gap:8 wrap`, пилюли `textAlign:center minWidth:60`, `fontSize:18/600`, `fontSize:24/700 color:var(--blue)`

## `vospitanie/VospitaniePage.tsx`
- `49–50`: фильтр `marginBottom:16`, select `fontSize:16 minHeight:44 padding:10px 12px`
- `58`: сетка секций `grid gap:24 marginTop:16`
- `79,128`: списки `grid gap:8 listStyle:none padding:0`, `li.gg-log-card padding:12`
- `95,113`: строки карточек `flex space-between marginBottom:4`, тексты `whiteSpace:pre-wrap`, мета `fontSize:14 color:var(--text-secondary)`

## `admin/AdminTabs.tsx`
- `40`: ряд табов `flex gap:4 marginBottom:16 overflowX:auto wrap`
- `45–...`: кнопки табов (активный — градиент `#3b82f6→#8b5cf6`, белый текст; иначе прозрачный)

## `admin/AdminClasses.tsx`, `AdminSubjects.tsx` (одинаковая структура)
- `87–94`: форма `marginBottom:16`, label `flex column gap:4 maxWidth:300`, input `fontSize:16 minHeight:44 padding:10px 12px`
- `100`: главная кнопка `marginBottom:16 padding:14px 20px fontSize:16 minHeight:48 width:100% maxWidth:300`
- `104`: «Отмена» `marginBottom:16 padding:10px 16px`
- `110`: `th width:180`; `117`: ячейка действий `flex gap:8 wrap`; `118`: «Редактировать» `padding:8px 12px minHeight:44 fontSize:16`; `120`: «Удалить» +`gg-btn-danger`, те же размеры

## `admin/AdminTeachers.tsx`
- `120,155,165`: fieldset/чекбоксы — рамки `1px solid var(--separator)`, фоны `var(--card-bg)` (см. раздел 5)
- `176`: «Отмена» 48px; `196`: «Удалить» +`gg-btn-danger`

## `admin/AdminAssignments.tsx`
- `124`: двухколоночный layout `flex gap:24 wrap`
- `132`: кнопка выбора учителя `fontWeight 700/400`
- `145,157`: чекбоксы `display:block`
- `167`: «Сохранить назначения» `marginTop:12`

## `admin/AdminPasswords.tsx`
- `88,96`: label `flex column gap:4 marginBottom:12 (width:100%)`, select/input `fontSize:16 minHeight:44 padding:10/12–12/14`
- `108`: кнопка `marginTop:8 padding:14px 20px fontSize:16 minHeight:48 width:100%`

## `admin/AdminImportExport.tsx`
- `76,90`: секции `marginBottom:24/padding:16 border:1px solid var(--separator) radius:12 background:var(--card-bg)`
- `78–120`: label `flex column gap:4 (marginBottom:12)`, grid `repeat(auto-fit,minmax(200px,1fr))`, кнопки `padding:14px 20px fontSize:16 minHeight:48 width:100% maxWidth:300`

## `admin/AdminResponsible.tsx`, `AdminRecommendations.tsx`
- Аналогично: формы `flex column gap:4`, таблицы действий `flex gap:8 wrap`, кнопки 44–48px, модальное окно назначения `marginTop:16 padding:16 border radius:12 background:var(--card-bg)`

## Страничные обёртки (`*/page.tsx`, `login/page.tsx`)
- Только `Suspense fallback={<div style={{padding:16|40}}>Загрузка…</div>}`.

---

# 5. Инвентарь цветов (захардкоженные `#hex` / `rgba()` вне `:root`)

В `globals.css` (по дизайну): `#fff` (текст кнопок, лого, аватары), `#b45309/#059669/#16a34a/#c2410c` (тексты grade-пилюль), `#dcfce7/#34d399` (зелёные градиенты), `#ea580c` (legacy), `#1a1a2e/#3b82f6` (градиент greeting/title), `#6b7280` (svg-стрелка селекта), `rgba(255,255,255,0.85/0.5)` (glass), `rgba(59,130,246,0.3/0.4)`, `rgba(102,126,234,0.12)/rgba(240,147,251,0.1)/rgba(79,172,254,0.1)` (фон), `rgba(0,0,0,*)` (тени/сепараторы).
В `layout.tsx`: `themeColor #f0f2f5`.
В `AdminTabs.tsx`: градиент табов `#3b82f6→#8b5cf6`, текст `#fff`.
Остального хардкода цветов в `.tsx` НЕТ (всё через `var(--*)`).

---

# 6. Каркас (`src/components/layout/AppShell.tsx`, целиком)

```tsx
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
        <img src="/brand/logo-horizontal.webp" alt="Грамотаград" className="gg-logo" />
        <button className="gg-burger" aria-label="Меню" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>☰</button>
        <nav className="gg-nav gg-nav-desktop" aria-label="Основная навигация">
          {links.map((it) => (
            <Link key={it.href} href={it.href} className={navClass(isActive(it.href))}>{it.label}</Link>
          ))}
        </nav>
        <span className={`gg-role ${isAdmin ? 'gg-role-admin' : ''}`}>{session.fullName} · {session.role}</span>
        <button className="gg-logout" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? 'Выход…' : 'Выйти'}</button>
      </header>
      {menuOpen && (
        <nav className="gg-nav gg-nav-mobile" aria-label="Мобильная навигация">
          {links.map((it) => (
            <Link key={it.href} href={it.href} className={navClass(isActive(it.href))} onClick={() => setMenuOpen(false)}>{it.label}</Link>
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
```

---

# 7. Показательные экраны (целиком)

## 7.1. `src/app/login/LoginForm.tsx` (76 строк)

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/app'

// Единая нейтральная ошибка — не раскрывает, есть ли пользователь.
export function LoginForm() {
  const router = useRouter()
  const setSession = useAppStore((s) => s.setSession)
  const [teacherId, setTeacherId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId, password }),
      })
      if (!res.ok) {
        setError('Неверный логин или пароль')
        return
      }
      setSession(await res.json())
      router.replace('/journal')
    } catch {
      setError('Неверный логин или пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="gg-login-wrap">
      <form onSubmit={submit} className="gg-login-card">
        <img src="/brand/logo-seal.webp" alt="Печать Грамотаград" className="gg-login-seal" />
        <h1 className="gg-login-title">Вход в Грамотаград</h1>
        <label className="gg-field">
          Логин
          <input
            className="gg-input"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="numeric"
          />
        </label>
        <label className="gg-field">
          Пароль
          <input
            className="gg-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="gg-error">{error}</p>}
        <button type="submit" className="gg-btn" disabled={loading}>
          {loading ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
```

## 7.2. `src/app/(app)/journal/JournalPage.tsx` (полный код — см. файл, 250+ строк)

Ключевая разметка (логика НЕ менять, только CSS-классы/стили):

```tsx
<div>
  <div className="gg-greeting">
    <div className="gg-greeting-date">{/* дата урока, toLocaleDateString ru-RU */}</div>
    <div className="gg-greeting-hello">Журнал · {session?.fullName}</div>
  </div>
  <div className="gg-card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
    {/* 3 label: селект класса / селект предмета / input type=date */}
  </div>
  {/* topic/homework: label.gg-field > input.gg-input */}
  <div className="gg-section-header"><h2><span>👨‍🎓</span> Ученики</h2><span className="gg-count">{rows.length}</span></div>
  {/* Desktop: .gg-table-wrap.gg-hide-mobile > table.gg-table > thead(Ученик|Оценка|Комментарий) */}
  {/* Строка: avatar(initials) + name | select.gg-grade.val-{5,4,3,2,n} | input.gg-input */}
  {/* Mobile: .gg-logs-cards.gg-show-mobile > .gg-log-card (avatar + select + input) */}
  <button className="gg-btn gg-btn-success">✔ Сохранить урок</button>
</div>
```

Маппинг значения→класс пилюли: `gradeClass(v)`: `'Н'→'gg-grade val-n'`, `5/4/3/2→'gg-grade val-N'`, иначе `'gg-grade'`. Аватар: `gg-avatar` + инициалы (первые буквы 2 слов).

## 7.3. `src/app/(app)/logs/LogsPage.tsx` (181 строка, целиком выше в отчёте сбора)

Структура: `<h1>Логи действий</h1>` → фильтр-карточка (select действия) → `gg-error`/«Загрузка…»/«Логи пока пусты» → десктоп-таблица (Время|Пользователь|Действие|Описание|IP, `min-width:700`) → мобайл-карточки `gg-logs-cards gg-show-mobile` → пагинация (← Назад | page/total | Вперёд →). Словарь `ACTION_LABELS` (14 действий, см. код).

## 7.4. `src/app/(app)/admin/AdminAssignments.tsx` (175 строк: шапка+код выше)

Структура: `<h1>Админ — назначения</h1>` → `gg-error/gg-ok` → flex-контейнер (список учителей-кнопок + колонка чекбоксов классов/предметов + «Сохранить назначения»). Чекбоксы — нативные `input[type=checkbox]`, без классов.

## 7.5. `src/app/(app)/admin/AdminPasswords.tsx` (113 строк, целиком выше)

Структура: `<h2>Смена паролей</h2>` → `gg-error/gg-ok` → label+select учителя → label+`input[type=password]` (`autoComplete="new-password"`, min 8, кнопка disabled пока короче) → кнопка 100% «Сменить пароль». Важно: успех = «Пароль изменён. Все сессии пользователя завершены.».

---

# 8. Структура страниц (`src/app`, роуты)

```
src/app/
  page.tsx                    → redirect /journal
  layout.tsx                  → <html lang=ru>, globals.css, title/мanifest/иконки, viewport
  globals.css                 → 424 строки, все стили
  login/page.tsx              → Suspense → LoginForm
  login/LoginForm.tsx         → форма входа (7.1)
  (app)/layout.tsx            → auth-guard (нет сессии → /login) + <AppShell session>
  (app)/journal/page.tsx      → Suspense → JournalPage
  (app)/journal/JournalPage.tsx
  (app)/students/page.tsx     → Suspense → StudentsPage
  (app)/students/StudentsPage.tsx
  (app)/reports/page.tsx      → Suspense → ReportsPage
  (app)/reports/ReportsPage.tsx
  (app)/vospitanie/page.tsx   → Suspense (+гейт isVospitatel|админ) → VospitaniePage
  (app)/vospitanie/VospitaniePage.tsx
  (app)/logs/page.tsx         → Suspense (+гейт админ) → LogsPage
  (app)/logs/LogsPage.tsx
  (app)/admin/page.tsx        → Suspense (+гейт админ) → AdminTabs
  (app)/admin/AdminTabs.tsx   → 8 табов: Назначения|Классы|Предметы|Учителя|Ответственные|Рекомендации|Импорт/Экспорт|Пароли
  (app)/admin/Admin{Assignments,Classes,Subjects,Teachers,Responsible,Recommendations,ImportExport,Passwords}.tsx
  api/...                     → НЕ ТРОГАТЬ (17 роутов, логика/права)
src/components/layout/AppShell.tsx (раздел 6)
src/store/app.ts, src/hooks/useUrlFilters.ts, src/lib/* → НЕ ТРОГАТЬ
```

---

# 9. Что должно остаться неизменным

- Вся логика: `fetch`-вызовы, тела запросов, обработка `res.ok/403`, `useSearchParams` ↔ URL, `useAppStore` (session), проверки прав — серверные, в UI их нет.
- Имена классов `gg-*` (таблица раздела 3) — можно менять только их CSS-правила.
- Атрибуты: `autoComplete="username/current-password/new-password"`, `autoCapitalize="none"`, `inputMode="numeric"`, `maxLength`, `disabled`-состояния кнопок.
- Поведение `<760px`: `.gg-table-wrap` скрыта, `.gg-show-mobile` показан; таб-бар виден только на мобайле; `gg-role` скрыт на мобайле.
- Тексты ошибок/пустых состояний, `confirm()` перед удалением, `404/403`-ветки.
- `GRADE_VALUES = ['5','4','3','2','Н','']`, маппинг `gradeClass()`, правило очистки (пустая оценка+коммент → удаление на сервере).

---

# 10. Задача для дизайн-модели

Переделать визуал «Грамотаград v2» в стиле мокапа `Урок+ТуДуКими.html` (светлая iOS-стилистика: фон `#f0f2f5`, glass-карточки, radius 16–28, blur, мягкие тени, эмодзи-иконки, таб-бар, чипы, grade-пилюли, gradient-кнопки; референсные классы мокапа: `card, tab-bar/tab-item, greeting, section-header/count, filter-chip, input-field, grade-select.val-*, group-btn, finish-btn, student-row/avatar, modal-sheet`).

Верни ТОЛЬКО:
1. **Новый `globals.css` целиком** — те же имена `gg-*` классов (раздел 3), можно добавлять новые классы, удалять старые имена НЕЛЬЗЯ.
2. **Список inline-стилей `style={{...}}`, которые надо удалить** из `.tsx` (раздел 4) — по каждому: файл:строка → чем заменить (какой класс).
3. **Минимальные правки JSX-разметки** (если нужны): какие теги добавить/обернуть/переставить — списком `файл:строка: действие`, без изменения логики, fetch, стейта, текстов.

Запрещено: менять API, Zustand-стор, хуки URL, тексты, права, `GRADE_VALUES`, поведение `<760px`, атрибуты `autoComplete/inputMode`, убирать `confirm()`.
