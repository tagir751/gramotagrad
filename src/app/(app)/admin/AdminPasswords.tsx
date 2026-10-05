/**
 * ЭКРАН: /admin → секция «Пароли» — сброс пароля учителя (админ).
 * НАЗНАЧЕНИЕ: безопасно заменить legacy-пароль (admin/admin123 и др.) после
 *   миграции; сессии учителя завершаются принудительно.
 * ДАННЫЕ ИЗ URL: нет.
 * ДАННЫЕ ИЗ СТОРА: нет.
 * ЗАПРОСЫ К API:
 *   1. GET /api/admin/teachers → список учителей (без хешей);
 *   2. POST /api/admin/passwords {teacherId, newPassword} → сброс + kill сессий.
 * СОСТОЯНИЯ: loading, saving, err (текстом), ok (успех), selectedId, newPassword.
 * ОШИБКИ: 400 короткий пароль/учитель не найден; 401/403; сеть — текст.
 * ВАЖНО: при успехе сессия выбранного учителя (включая админа, если он меняет
 *   себе пароль) будет завершена — придётся войти заново. Это показываем
 *   в сообщении.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ:
 * - селект учителя и поле пароля — на всю ширину на узком экране;
 * - поле пароля: autoComplete="new-password", font-size 16px, min-height 44px;
 * - кнопка: min-height 48px, font-size 16px.
 */
'use client'

import { useEffect, useState } from 'react'

interface Teacher {
  id: number
  fullName: string
  lastName: string
  role: string
  isVospitatel: boolean
  classIds: number[]
  subjectIds: number[]
}

export function AdminPasswords() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    fetch('/api/admin/teachers')
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Нет доступа' : 'Ошибка загрузки')
        return r.json()
      })
      .then((t) => {
        setTeachers(t)
        if (t.length) setSelectedId(t[0].id)
      })
      .catch((e: Error) => setErr(e.message === 'Failed to fetch' ? 'Ошибка сети' : e.message))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    if (selectedId === null || saving) return
    if (newPassword.length < 8) { setErr('Пароль минимум 8 символов'); return }
    setSaving(true)
    setErr('')
    setOk('')
    try {
      const res = await fetch('/api/admin/passwords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: selectedId, newPassword }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось изменить пароль')
      setNewPassword('')
      setOk('Пароль изменён. Все сессии пользователя завершены.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p>Загрузка…</p>
  if (err && teachers.length === 0) return <p className="gg-error">{err}</p>

  return (
    <div>
      <h2>Смена паролей</h2>
      {err && <p className="gg-error">{err}</p>}
      {ok && <p className="gg-ok">{ok}</p>}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, width: '100%' }}>
        Учитель
        <select value={selectedId ?? ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.fullName} ({t.role})</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        Новый пароль (мин. 8 символов):
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          maxLength={200}
          disabled={saving}
          autoComplete="new-password"
          style={{ fontSize: 16, minHeight: 44, padding: '12px 14px' }}
        />
      </label>
      <button onClick={save} disabled={saving || selectedId === null || newPassword.length < 8} style={{ marginTop: 8, padding: '14px 20px', fontSize: 16, minHeight: 48, width: '100%' }}>
        {saving ? 'Сохранение…' : 'Сменить пароль'}
      </button>
    </div>
  )
}