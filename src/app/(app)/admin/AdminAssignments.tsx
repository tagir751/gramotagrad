/**
 * ЭКРАН: /admin — панель назначений учителей (клиентская часть).
 * НАЗНАЧЕНИЕ: выбрать учителя, отметить чекбоксами классы/предметы, сохранить
 *   одним PUT /api/admin/assignments. Пустые наборы легально очищают назначения.
 * ДАННЫЕ ИЗ URL: нет.
 * ДАННЫЕ ИЗ СТОРА: нет.
 * ЗАПРОСЫ К API:
 *   1. GET /api/admin/teachers → учителя с classIds/subjectIds;
 *   2. GET /api/classes + GET /api/subjects → чекбоксы (админу API вернёт все);
 *   3. PUT /api/admin/assignments {teacherId, classIds, subjectIds} → save.
 * СОСТОЯНИЯ: loading, saving, error (текстом, включая 400 с сервера),
 *   ok ('Сохранено'), selectedId, checkedClasses/Set, checkedSubjects/Set.
 * ОШИБКИ: 401/403 → 'Нет доступа' (не-админ сюда не попадает — серверный
 *   layout редиректит на /journal); 400 → текст сервера (кого нет).
 */
'use client'

import { useEffect, useState } from 'react'

interface RefItem { id: number; name: string }
interface Teacher {
  id: number
  fullName: string
  lastName: string
  role: string
  isVospitatel: boolean
  classIds: number[]
  subjectIds: number[]
}

export function AdminAssignments() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classes, setClasses] = useState<RefItem[]>([])
  const [subjects, setSubjects] = useState<RefItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [checkedClasses, setCheckedClasses] = useState<Set<number>>(new Set())
  const [checkedSubjects, setCheckedSubjects] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/admin/teachers').then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Нет доступа' : 'Ошибка загрузки учителей')
        return r.json()
      }),
      fetch('/api/classes').then((r) => r.json()),
      fetch('/api/subjects').then((r) => r.json()),
    ])
      .then(([t, c, s]) => {
        setTeachers(t)
        setClasses(c)
        setSubjects(s)
        if (t.length) {
          setSelectedId(t[0].id)
          setCheckedClasses(new Set(t[0].classIds))
          setCheckedSubjects(new Set(t[0].subjectIds))
        }
      })
      .catch((e: Error) => setErr(e.message === 'Failed to fetch' ? 'Ошибка сети' : e.message))
      .finally(() => setLoading(false))
  }, [])

  function select(id: number) {
    setSelectedId(id)
    setErr('')
    setOk('')
    const t = teachers.find((x) => x.id === id)
    if (t) {
      setCheckedClasses(new Set(t.classIds))
      setCheckedSubjects(new Set(t.subjectIds))
    }
  }

  function toggle(set: Set<number>, apply: (s: Set<number>) => void, id: number) {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    apply(next)
  }

  async function save() {
    if (selectedId === null || saving) return
    setSaving(true)
    setErr('')
    setOk('')
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: selectedId,
          classIds: [...checkedClasses],
          subjectIds: [...checkedSubjects],
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось сохранить')
      // Синхронизируем локальный список с ответом сервера.
      setTeachers((prev) =>
        prev.map((t) =>
          t.id === selectedId ? { ...t, classIds: body.classIds, subjectIds: body.subjectIds } : t,
        ),
      )
      setOk('Сохранено')
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
      <h1>Админ — назначения</h1>
      {err && <p className="gg-error">{err}</p>}
      {ok && <p className="gg-ok">{ok}</p>}
      <div className="gg-actions gg-actions--wide">
        <div>
          <h2>Учителя</h2>
          <ul>
            {teachers.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => select(t.id)}
                  className={t.id === selectedId ? 'gg-strong' : undefined}
                >
                  {t.fullName} ({t.role})
                </button>
              </li>
            ))}
          </ul>
          {teachers.length === 0 && <p>Учителей нет.</p>}
        </div>
        {selectedId !== null && (
          <div>
            <h2>Классы</h2>
            {classes.map((c) => (
              <label key={c.id} className="gg-block">
                <input
                  type="checkbox"
                  checked={checkedClasses.has(c.id)}
                  onChange={() => toggle(checkedClasses, setCheckedClasses, c.id)}
                />{' '}
                {c.name}
              </label>
            ))}
            {classes.length === 0 && <p>Классов нет.</p>}
            <h2>Предметы</h2>
            {subjects.map((s) => (
              <label key={s.id} className="gg-block">
                <input
                  type="checkbox"
                  checked={checkedSubjects.has(s.id)}
                  onChange={() => toggle(checkedSubjects, setCheckedSubjects, s.id)}
                />{' '}
                {s.name}
              </label>
            ))}
            {subjects.length === 0 && <p>Предметов нет.</p>}
            <button onClick={save} disabled={saving} className="gg-mt-12">
              {saving ? 'Сохранение…' : 'Сохранить назначения'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
