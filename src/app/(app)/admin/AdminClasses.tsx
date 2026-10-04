/**
 * ЭКРАН: /admin → таб «Классы».
 * НАЗНАЧЕНИЕ: CRUD классов (админ).
 * ДАННЫЕ ИЗ URL: нет.
 * ДАННЫЕ ИЗ СТОРА: нет.
 * ЗАПРОСЫ К API: GET/POST/PATCH/DELETE /api/admin/classes.
 * СОСТОЯНИЯ: loading, saving, err, ok, classes[], editingId, editName.
 * ОШИБКИ: 400 дубль/валидация; 409 не пусто; сеть — текст.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: таблица → карточки; инпуты/кнопки 44px.
 */
'use client'

import { useEffect, useState } from 'react'

interface Cls { id: number; name: string; _count?: { students: number; lessons: number } }

export function AdminClasses() {
  const [classes, setClasses] = useState<Cls[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const fetchClasses = async () => {
    const res = await fetch('/api/admin/classes')
    if (!res.ok) throw new Error(res.status === 403 ? 'Нет доступа' : 'Ошибка загрузки')
    return res.json()
  }

  useEffect(() => {
    fetchClasses().then(setClasses).catch((e: Error) => setErr(e.message)).finally(() => setLoading(false))
  }, [])

  async function create() {
    if (!editName.trim()) return
    setSaving(true); setErr(''); setOk('')
    try {
      const res = await fetch('/api/admin/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editName }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось создать')
      setEditName('')
      const all = await fetchClasses()
      setClasses(all)
      setOk('Создано')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
    finally { setSaving(false) }
  }

  async function update(id: number) {
    setSaving(true); setErr(''); setOk('')
    try {
      const res = await fetch('/api/admin/classes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: editName }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось обновить')
      setEditingId(null); setEditName('')
      const all = await fetchClasses()
      setClasses(all)
      setOk('Обновлено')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
    finally { setSaving(false) }
  }

  async function remove(id: number) {
    if (!confirm('Удалить класс? Это нельзя отменить.')) return
    setErr(''); setOk('')
    try {
      const res = await fetch(`/api/admin/classes?id=${id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось удалить')
      const all = await fetchClasses()
      setClasses(all)
      setOk('Удалено')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
  }

  if (loading) return <p>Загрузка…</p>
  if (err && classes.length === 0) return <p className="gg-error">{err}</p>

  return (
    <div>
      <h2>Классы</h2>
      {err && <p className="gg-error">{err}</p>}
      {ok && <p className="gg-ok">{ok}</p>}

      <div className="gg-spacer">
        <label className="gg-field gg-field--bare gg-narrow">
          {editingId ? 'Новое имя' : 'Имя класса'}
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={saving}
            placeholder="Напр. 1, 2А, 5Б"
          />
        </label>
      </div>

      <button onClick={editingId ? () => update(editingId) : create} disabled={saving || !editName.trim()} className="gg-btn-wide gg-spacer">
        {saving ? 'Сохранение…' : editingId ? 'Сохранить' : 'Создать класс'}
      </button>

      {editingId && <button onClick={() => { setEditingId(null); setEditName(''); setErr('') }} className="gg-spacer">Отмена</button>}

      <h3>Список</h3>
      {classes.length === 0 ? <p className="gg-empty">Классов нет</p> : (
        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead><tr><th>Название</th><th>Учеников</th><th>Уроков</th><th className="gg-col-180">Действия</th></tr></thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c._count?.students ?? 0}</td>
                  <td>{c._count?.lessons ?? 0}</td>
                  <td className="gg-actions">
                    <button onClick={() => { setEditingId(c.id); setEditName(c.name); setErr(''); setOk('') }}>Редактировать</button>
                    {c._count?.students === 0 && c._count?.lessons === 0 && (
                      <button onClick={() => remove(c.id)} className="gg-btn-danger">Удалить</button>
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