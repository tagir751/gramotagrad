/**
 * ЭКРАН: /admin → таб «Предметы».
 * НАЗНАЧЕНИЕ: CRUD предметов (админ).
 * ДАННЫЕ ИЗ URL: нет.
 * ДАННЫЕ ИЗ СТОРА: нет.
 * ЗАПРОСЫ К API: GET/POST/PATCH/DELETE /api/admin/subjects.
 * СОСТОЯНИЯ: loading, saving, err, ok, subjects[], editingId, editName.
 * ОШИБКИ: 400 дубль/валидация; 409 не пусто; сеть — текст.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: таблица → карточки; инпуты/кнопки 44px.
 */
'use client'

import { useEffect, useState } from 'react'

interface Subj { id: number; name: string; _count?: { lessons: number } }

export function AdminSubjects() {
  const [subjects, setSubjects] = useState<Subj[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const fetchSubjects = async () => {
    const res = await fetch('/api/admin/subjects')
    if (!res.ok) throw new Error(res.status === 403 ? 'Нет доступа' : 'Ошибка загрузки')
    return res.json()
  }

  useEffect(() => {
    fetchSubjects().then(setSubjects).catch((e: Error) => setErr(e.message)).finally(() => setLoading(false))
  }, [])

  async function create() {
    if (!editName.trim()) return
    setSaving(true); setErr(''); setOk('')
    try {
      const res = await fetch('/api/admin/subjects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editName }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось создать')
      setEditName('')
      const all = await fetchSubjects()
      setSubjects(all)
      setOk('Создано')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
    finally { setSaving(false) }
  }

  async function update(id: number) {
    setSaving(true); setErr(''); setOk('')
    try {
      const res = await fetch('/api/admin/subjects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: editName }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось обновить')
      setEditingId(null); setEditName('')
      const all = await fetchSubjects()
      setSubjects(all)
      setOk('Обновлено')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
    finally { setSaving(false) }
  }

  async function remove(id: number) {
    if (!confirm('Удалить предмет? Это нельзя отменить.')) return
    setErr(''); setOk('')
    try {
      const res = await fetch(`/api/admin/subjects?id=${id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось удалить')
      const all = await fetchSubjects()
      setSubjects(all)
      setOk('Удалено')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
  }

  if (loading) return <p>Загрузка…</p>
  if (err && subjects.length === 0) return <p className="gg-error">{err}</p>

  return (
    <div>
      <h2>Предметы</h2>
      {err && <p className="gg-error">{err}</p>}
      {ok && <p className="gg-ok">{ok}</p>}

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 300 }}>
          {editingId ? 'Новое название' : 'Название предмета'}
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={saving}
            style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }}
            placeholder="Напр. русский язык, математика"
          />
        </label>
      </div>

      <button onClick={editingId ? () => update(editingId) : create} disabled={saving || !editName.trim()} style={{ marginBottom: 16, padding: '14px 20px', fontSize: 16, minHeight: 48, width: '100%', maxWidth: 300 }}>
        {saving ? 'Сохранение…' : editingId ? 'Сохранить' : 'Создать предмет'}
      </button>

      {editingId && <button onClick={() => { setEditingId(null); setEditName(''); setErr('') }} style={{ marginBottom: 16, padding: '10px 16px' }}>Отмена</button>}

      <h3>Список</h3>
      {subjects.length === 0 ? <p className="gg-empty">Предметов нет</p> : (
        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead><tr><th>Название</th><th>Уроков</th><th style={{ width: 180 }}>Действия</th></tr></thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s._count?.lessons ?? 0}</td>
                  <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => { setEditingId(s.id); setEditName(s.name); setErr(''); setOk('') }} style={{ padding: '8px 12px', minHeight: 44, fontSize: 16 }}>Редактировать</button>
                    {s._count?.lessons === 0 && (
                      <button onClick={() => remove(s.id)} className="gg-btn-danger" style={{ padding: '8px 12px', minHeight: 44, fontSize: 16 }}>Удалить</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}