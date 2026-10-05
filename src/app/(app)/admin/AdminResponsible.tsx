/**
 * ЭКРАН: /admin → таб «Ответственные».
 * НАЗНАЧЕНИЕ: назначение/снятие ответственного воспитателя за класс (админ).
 * ДАННЫЕ ИЗ URL: нет.
 * ДАННЫЕ ИЗ СТОРА: нет.
 * ЗАПРОСЫ К API: GET/PUT /api/admin/responsible + GET /api/classes + GET /api/admin/teachers.
 * СОСТОЯНИЯ: loading, saving, err, ok, items[], classes[], teachers[], editingClassId, selectedTeacherId.
 * ОШИБКИ: 400 учитель/класс не найден; сеть — текст.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: список классов с селектами учителей; крупные кнопки.
 */
'use client'

import { useEffect, useState } from 'react'

interface RefItem { id: number; name: string }
interface Teacher { id: number; fullName: string; lastName: string; role: string; isVospitatel: boolean }
interface RespItem { classId: number; className: string; teacherId: number | null; teacherFullName: string | null }

export function AdminResponsible() {
  const [items, setItems] = useState<RespItem[]>([])
  const [classes, setClasses] = useState<RefItem[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const [editingClassId, setEditingClassId] = useState<number | null>(null)
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | null>(null)

  const fetchAll = async () => {
    const [r, c, t] = await Promise.all([
      fetch('/api/admin/responsible').then(async (r) => { if (!r.ok) throw new Error('Ошибка'); return r.json() }),
      fetch('/api/classes').then((r) => r.json()),
      fetch('/api/admin/teachers').then(async (r) => { if (!r.ok) throw new Error('Ошибка'); return r.json() }),
    ])
    setItems(r); setClasses(c); setTeachers(t)
  }

  useEffect(() => { fetchAll().catch((e) => setErr(e.message)).finally(() => setLoading(false)) }, [])

  function edit(classId: number, currentTeacherId: number | null) {
    setEditingClassId(classId)
    setSelectedTeacherId(currentTeacherId)
    setErr(''); setOk('')
  }

  function cancel() { setEditingClassId(null); setSelectedTeacherId(null); setErr(''); setOk('') }

  async function save() {
    if (editingClassId === null || saving) return
    setSaving(true); setErr(''); setOk('')
    try {
      const res = await fetch('/api/admin/responsible', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: editingClassId, teacherId: selectedTeacherId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось сохранить')
      const [r, c, t] = await Promise.all([
        fetch('/api/admin/responsible').then(async (r) => { if (!r.ok) throw new Error('Ошибка'); return r.json() }),
        fetch('/api/classes').then((r) => r.json()),
        fetch('/api/admin/teachers').then(async (r) => { if (!r.ok) throw new Error('Ошибка'); return r.json() }),
      ])
      setItems(r); setClasses(c); setTeachers(t)
      setEditingClassId(null); setSelectedTeacherId(null)
      setOk('Сохранено')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
    finally { setSaving(false) }
  }

  async function remove(classId: number) {
    setErr(''); setOk('')
    try {
      const res = await fetch('/api/admin/responsible', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, teacherId: null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось снять')
      const [r, c, t] = await Promise.all([
        fetch('/api/admin/responsible').then(async (r) => { if (!r.ok) throw new Error('Ошибка'); return r.json() }),
        fetch('/api/classes').then((r) => r.json()),
        fetch('/api/admin/teachers').then(async (r) => { if (!r.ok) throw new Error('Ошибка'); return r.json() }),
      ])
      setItems(r); setClasses(c); setTeachers(t)
      setOk('Снято')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
  }

  if (loading) return <p>Загрузка…</p>
  if (err && items.length === 0) return <p className="gg-error">{err}</p>

  return (
    <div>
      <h2>Ответственные воспитатели</h2>
      {err && <p className="gg-error">{err}</p>}
      {ok && <p className="gg-ok">{ok}</p>}

      <h3>Классы и ответственные</h3>
      {items.length === 0 ? <p className="gg-empty">Классов нет</p> : (
        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead><tr><th>Класс</th><th>Ответственный</th><th style={{ width: 200 }}>Действия</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.classId}>
                  <td>{item.className}</td>
                  <td>{item.teacherFullName ?? <span style={{ color: 'var(--text-secondary)' }}>— не назначен —</span>}</td>
                  <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => edit(item.classId, item.teacherId)}
                      disabled={saving && editingClassId === item.classId}
                      style={{ padding: '8px 12px', minHeight: 44, fontSize: 16 }}
                    >
                      {editingClassId === item.classId ? 'Сохранить…' : item.teacherId ? 'Изменить' : 'Назначить'}
                    </button>
                    {item.teacherId && editingClassId !== item.classId && (
                      <button onClick={() => remove(item.classId)} className="gg-btn-danger" style={{ padding: '8px 12px', minHeight: 44, fontSize: 16 }}>Снять</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingClassId !== null && (
        <div style={{ marginTop: 16, padding: 16, border: '1px solid var(--separator)', borderRadius: 12, background: 'var(--card-bg)' }}>
          <h4>Назначение ответственного для класса: {classes.find(c => c.id === editingClassId)?.name}</h4>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400 }}>
              Учитель
              <select
                value={selectedTeacherId ?? ''}
                onChange={(e) => setSelectedTeacherId(Number(e.target.value) || null)}
              >
                <option value="">— снять ответственного —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.fullName} ({t.role})</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={save} disabled={saving} style={{ padding: '14px 20px', fontSize: 16, minHeight: 48 }}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button onClick={cancel} style={{ padding: '14px 20px', fontSize: 16, minHeight: 48, background: 'var(--card-bg)', border: '1px solid var(--separator)' }}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  )
}