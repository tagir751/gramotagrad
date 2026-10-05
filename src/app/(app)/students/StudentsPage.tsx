/**
 * ЭКРАН: /students — список учеников с фильтром по классу.
 * НАЗНАЧЕНИЕ: показать учеников доступных классов; правка — только при праве
 *   на класс (teacherHasClass), иначе сервер вернёт 403 и кнопки скрыты текстом.
 * ДАННЫЕ ИЗ URL: classId (хук useQueryPageFilters).
 * ДАННЫЕ ИЗ СТОРА: нет.
 * ЗАПРОСЫ К API:
 *   1. GET /api/classes → селект (свои классы; пусто = нет назначений);
 *   2. GET /api/students[?classId] → список;
 *   3. PATCH /api/students {id, active} → скрыть/вернуть ученика (по правам).
 * СОСТОЯНИЯ: loading, error (текстом), editingId (какая строка правится).
 * ОШИБКИ: 403 чужой класс → 'Нет доступа к классу'; сеть → 'Ошибка сети'.
 *   Пустой список — корректное пустое состояние, не ошибка.
 */
'use client'

import { useEffect, useState } from 'react'
import { useQueryPageFilters } from '@/hooks/useUrlFilters'

interface RefItem { id: number; name: string }
interface Student {
  id: number
  fullName: string
  active: boolean
  classId: number
  class?: { name: string }
  hasRecommendation?: boolean
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()
}

export function StudentsPage() {
  const { classId, setParam } = useQueryPageFilters()
  const [classes, setClasses] = useState<RefItem[]>([])
  const [list, setList] = useState<Student[]>([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/classes').then((r) => r.json()).then(setClasses).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setErr('')
    const q = classId ? `?classId=${encodeURIComponent(classId)}` : ''
    fetch(`/api/students${q}`)
      .then(async (r) => {
        if (r.status === 403) throw new Error('Нет доступа к классу')
        if (!r.ok) throw new Error('Ошибка загрузки')
        return r.json()
      })
      .then((j) => setList(j))
      .catch((e: Error) => {
        setErr(e.message === 'Failed to fetch' ? 'Ошибка сети' : e.message)
        setList([])
      })
      .finally(() => setLoading(false))
  }, [classId])

  // Скрыть/вернуть ученика. Без права сервер вернёт 403 — показываем текстом.
  async function toggleActive(s: Student) {
    setErr('')
    const res = await fetch('/api/students', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, active: !s.active }),
    })
    if (res.status === 403) { setErr('Нет прав на редактирование'); return }
    if (!res.ok) { setErr('Не удалось сохранить'); return }
    setList((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)))
  }

  return (
    <div>
      <div className="gg-greeting">
        <div className="gg-greeting-hello">Ученики</div>
      </div>
      <div className="gg-card" style={{ marginBottom: 12 }}>
        <label className="gg-field" style={{ marginBottom: 0 }}>
          Класс
          <select value={classId} onChange={(e) => setParam('classId', e.target.value)}>
            <option value="">Все доступные</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>
      {err && <p className="gg-error">{err}</p>}
      {loading ? (
        <p>Загрузка…</p>
      ) : list.length === 0 && !err ? (
        <p className="gg-empty">{classes.length === 0 ? 'Нет доступных классов. Обратитесь к админу.' : 'Учеников нет.'}</p>
      ) : (
        <>
          <div className="gg-section-header">
            <h2><span>👨‍🎓</span> Список</h2>
            <span className="gg-count">{list.length}</span>
          </div>
          <div className="gg-logs-cards">
            {list.map((s) => (
              <div key={s.id} className="gg-log-card" style={{ opacity: s.active ? 1 : 0.6 }}>
                <div className="gg-student-row">
                  <span className="gg-avatar">{initials(s.fullName)}</span>
                  <span className="gg-student-name">
                    {s.fullName}
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {s.class?.name}{s.hasRecommendation ? ' · ★ есть рекомендация' : ''}
                      {!s.active ? ' · скрыт' : ''}
                    </div>
                  </span>
                  <button className="gg-btn-secondary" onClick={() => toggleActive(s)} style={{ padding: '8px 14px', minHeight: 44, width: 'auto' }}>
                    {s.active ? 'Скрыть' : 'Вернуть'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
