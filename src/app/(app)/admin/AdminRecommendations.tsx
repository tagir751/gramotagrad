/**
 * ЭКРАН: /admin → таб «Рекомендации».
 * НАЗНАЧЕНИЕ: просмотр и создание рекомендаций ученикам (админ).
 * ДАННЫЕ ИЗ URL: нет.
 * ДАННЫЕ ИЗ СТОРА: нет.
 * ЗАПРОСЫ К API: GET/POST /api/recommendations + GET /api/students?classId (для фильтра).
 * СОСТОЯНИЯ: loading, saving, err, ok, recs[], students[], classId, selectedStudentId, text.
 * ОШИБКИ: 400/403/404; сеть — текст.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: карточки рекомендаций; текстовое поле на всю ширину.
 */
'use client'

import { useEffect, useState } from 'react'

interface Student { id: number; fullName: string; classId: number; class?: { name: string } }
interface Rec { id: number; text: string; isCurrent: boolean; createdAt: string; student: { id: number; fullName: string; class?: { name: string } }; author: { fullName: string } }

export function AdminRecommendations() {
  const [recs, setRecs] = useState<Rec[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const [classId, setClassId] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [text, setText] = useState('')

  const fetchRecs = async () => {
    const params = new URLSearchParams()
    if (classId) params.set('classId', classId)
    params.set('all', 'true')
    const res = await fetch(`/api/recommendations?${params}`)
    if (!res.ok) throw new Error(res.status === 403 ? 'Нет доступа' : 'Ошибка загрузки')
    return res.json()
  }

  const fetchStudents = async (cid: string) => {
    const res = await fetch(`/api/students?classId=${cid}`)
    if (!res.ok) throw new Error('Ошибка загрузки учеников')
    return res.json()
  }

  useEffect(() => {
    fetch('/api/classes').then((r) => r.json()).then(setClasses).catch(() => {})
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const [r, s] = await Promise.all([fetchRecs(), classId ? fetchStudents(classId) : Promise.resolve([])])
        setRecs(r)
        setStudents(s)
      } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
      finally { setLoading(false) }
    }
    load()
  }, [classId])

  async function create() {
    if (!selectedStudentId || !text.trim()) return
    setSaving(true); setErr(''); setOk('')
    try {
      const res = await fetch('/api/recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: selectedStudentId, text }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось создать')
      setText(''); setSelectedStudentId(null)
      const r = await fetchRecs()
      setRecs(r)
      setOk('Создано')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
    finally { setSaving(false) }
  }

  if (loading) return <p>Загрузка…</p>
  if (err && recs.length === 0) return <p className="gg-error">{err}</p>

  return (
    <div>
      <h2>Рекомендации</h2>
      {err && <p className="gg-error">{err}</p>}
      {ok && <p className="gg-ok">{ok}</p>}

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 300 }}>
          Класс для фильтра учеников
          <select value={classId} onChange={(e) => setClassId(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }}>
            <option value="">Все классы</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 400 }}>
          Ученик
          <select value={selectedStudentId ?? ''} onChange={(e) => setSelectedStudentId(Number(e.target.value) || null)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }}>
            <option value="">— выберите ученика —</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.fullName} ({s.class?.name})</option>)}
          </select>
        </label>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 600, marginBottom: 12 }}>
        Текст рекомендации
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} style={{ fontSize: 16, minHeight: 100, padding: '10px 12px' }} placeholder="Введите текст рекомендации..." />
      </label>

      <button onClick={create} disabled={saving || !selectedStudentId || !text.trim()} style={{ marginBottom: 16, padding: '14px 20px', fontSize: 16, minHeight: 48, width: '100%', maxWidth: 300 }}>
        {saving ? 'Сохранение…' : 'Создать рекомендацию'}
      </button>

      <h3>Список рекомендаций</h3>
      {recs.length === 0 ? <p className="gg-empty">Рекомендаций нет</p> : (
        <div className="gg-logs-cards">
          {recs.map((r) => (
            <div key={r.id} className="gg-log-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong>{r.student.fullName} ({r.student.class?.name})</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{r.isCurrent ? 'Актуальная' : 'Архивная'}</span>
              </div>
              <div style={{ marginBottom: 4, whiteSpace: 'pre-wrap' }}>{r.text}</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Автор: {r.author.fullName} | {new Date(r.createdAt).toLocaleString('ru-RU')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}