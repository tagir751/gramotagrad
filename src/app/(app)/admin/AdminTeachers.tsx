/**
 * ЭКРАН: /admin → таб «Учителя».
 * НАЗНАЧЕНИЕ: полный CRUD учителей (админ): создание с паролем, правка, удаление, назначения.
 * ДАННЫЕ ИЗ URL: нет.
 * ДАННЫЕ ИЗ СТОРА: нет.
 * ЗАПРОСЫ К API: GET/POST/PATCH/DELETE /api/admin/teachers + GET /api/classes/subjects.
 * СОСТОЯНИЯ: loading, saving, err, ok, teachers[], classes[], subjects[],
 *   form: lastName, firstName, fullName, role, isVospitatel, password, classIds[], subjectIds[],
 *   editingId.
 * ОШИБКИ: 400 валидация/пароль<8/дубль; 403 сам себя; 409 есть связанные; сеть — текст.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: форма сверху, список снизу; чекбоксы крупные; инпуты 44px.
 */
'use client'

import { useEffect, useState } from 'react'

interface RefItem { id: number; name: string }
interface Teacher {
  id: number; fullName: string; lastName: string; firstName: string; role: string; isVospitatel: boolean;
  classIds: number[]; subjectIds: number[];
}

export function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classes, setClasses] = useState<RefItem[]>([])
  const [subjects, setSubjects] = useState<RefItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'админ' | 'учитель'>('учитель')
  const [isVospitatel, setIsVospitatel] = useState(false)
  const [password, setPassword] = useState('')
  const [classIds, setClassIds] = useState<Set<number>>(new Set())
  const [subjectIds, setSubjectIds] = useState<Set<number>>(new Set())

  const fetchAll = async () => {
    const [t, c, s] = await Promise.all([
      fetch('/api/admin/teachers').then(async (r) => { if (!r.ok) throw new Error('Ошибка'); return r.json() }),
      fetch('/api/classes').then((r) => r.json()),
      fetch('/api/subjects').then((r) => r.json()),
    ])
    setTeachers(t); setClasses(c); setSubjects(s)
  }

  useEffect(() => { fetchAll().catch((e) => setErr(e.message)).finally(() => setLoading(false)) }, [])

  function edit(t: Teacher) {
    setEditingId(t.id)
    // API может не вернуть часть полей (напр. firstName) — ?? '' держит инпуты controlled.
    setLastName(t.lastName ?? ''); setFirstName(t.firstName ?? ''); setFullName(t.fullName ?? '')
    setRole(t.role as 'админ' | 'учитель'); setIsVospitatel(t.isVospitatel)
    setPassword(''); setClassIds(new Set(t.classIds)); setSubjectIds(new Set(t.subjectIds))
    setErr(''); setOk('')
  }

  function cancel() { setEditingId(null); setLastName(''); setFirstName(''); setFullName(''); setRole('учитель'); setIsVospitatel(false); setPassword(''); setClassIds(new Set()); setSubjectIds(new Set()); setErr(''); setOk('') }

  function toggle(set: Set<number>, apply: (s: Set<number>) => void, id: number) {
    const next = new Set(set); next.has(id) ? next.delete(id) : next.add(id); apply(next)
  }

  async function save() {
    if (saving) return
    if (editingId === null) {
      if (!lastName.trim() || !firstName.trim() || !fullName.trim() || password.length < 8) { setErr('Заполните все поля, пароль мин. 8'); return }
    }
    setSaving(true); setErr(''); setOk('')
    try {
      const body = {
        lastName, firstName, fullName, role, isVospitatel,
        classIds: [...classIds], subjectIds: [...subjectIds],
        ...(editingId === null ? { password } : {}),
      }
      const url = editingId ? `/api/admin/teachers` : `/api/admin/teachers`
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editingId ? { id: editingId, ...body } : body) })
      const resBody = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(resBody.error ?? 'Не удалось сохранить')
      cancel()
      const [t] = await Promise.all([
        fetch('/api/admin/teachers').then(async (r) => { if (!r.ok) throw new Error('Ошибка'); return r.json() }),
        fetch('/api/classes').then((r) => r.json()),
        fetch('/api/subjects').then((r) => r.json()),
      ])
      setTeachers(t); setOk(editingId ? 'Обновлено' : 'Создано')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
    finally { setSaving(false) }
  }

  async function remove(id: number) {
    if (!confirm('Удалить учителя? Это удалит все назначения и сессии.')) return
    setErr(''); setOk('')
    try {
      const res = await fetch(`/api/admin/teachers?id=${id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Не удалось удалить')
      const [t] = await Promise.all([
        fetch('/api/admin/teachers').then(async (r) => { if (!r.ok) throw new Error('Ошибка'); return r.json() }),
        fetch('/api/classes').then((r) => r.json()),
        fetch('/api/subjects').then((r) => r.json()),
      ])
      setTeachers(t); setOk('Удалено')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
  }

  if (loading) return <p>Загрузка…</p>
  if (err && teachers.length === 0) return <p className="gg-error">{err}</p>

  return (
    <div>
      <h2>Учителя</h2>
      {err && <p className="gg-error">{err}</p>}
      {ok && <p className="gg-ok">{ok}</p>}

      <fieldset className="gg-panel">
        <legend className="gg-subhead">{editingId ? 'Редактирование' : 'Создание учителя'}</legend>

        <div className="gg-grid-240">
          <label className="gg-field gg-field--bare">
            Фамилия <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
          <label className="gg-field gg-field--bare">
            Имя + Отчество <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </label>
          <label className="gg-field gg-field--bare">
            Полное ФИО <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label className="gg-field gg-field--bare">
            Роль
            <select value={role} onChange={(e) => setRole(e.target.value as 'админ' | 'учитель')}>
              <option value="учитель">Учитель</option>
              <option value="админ">Админ</option>
            </select>
          </label>
          <label className="gg-check-label">
            <input type="checkbox" checked={isVospitatel} onChange={(e) => setIsVospitatel(e.target.checked)} className="gg-checkbox" /> Воспитатель
          </label>
          {editingId === null && (
            <label className="gg-field gg-field--bare">
              Пароль (мин. 8)
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </label>
          )}
        </div>

        <div className="gg-mt-12">
          <h4 className="gg-mb-8">Классы</h4>
          <div className="gg-actions">
            {classes.map((c) => (
              <label key={c.id} className="gg-check-row">
                <input type="checkbox" checked={classIds.has(c.id)} onChange={() => toggle(classIds, setClassIds, c.id)} className="gg-checkbox" /> {c.name}
              </label>
            ))}
          </div>
        </div>
        <div className="gg-mt-12">
          <h4 className="gg-mb-8">Предметы</h4>
          <div className="gg-actions">
            {subjects.map((s) => (
              <label key={s.id} className="gg-check-row">
                <input type="checkbox" checked={subjectIds.has(s.id)} onChange={() => toggle(subjectIds, setSubjectIds, s.id)} className="gg-checkbox" /> {s.name}
              </label>
            ))}
          </div>
        </div>

        <div className="gg-actions gg-actions--mt">
          <button onClick={save} disabled={saving} className="gg-flex-1">
            {saving ? 'Сохранение…' : editingId ? 'Сохранить' : 'Создать учителя'}
          </button>
          {editingId && <button onClick={cancel}>Отмена</button>}
        </div>
      </fieldset>

      <h3>Список учителей</h3>
      {teachers.length === 0 ? <p className="gg-empty">Учителей нет</p> : (
        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead><tr><th>ФИО</th><th>Роль</th><th>Воспит.</th><th>Классов</th><th>Предметов</th><th className="gg-col-200">Действия</th></tr></thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id}>
                  <td>{t.fullName}</td>
                  <td>{t.role}</td>
                  <td>{t.isVospitatel ? 'Да' : 'Нет'}</td>
                  <td>{t.classIds.length}</td>
                  <td>{t.subjectIds.length}</td>
                  <td className="gg-actions">
                    <button onClick={() => edit(t)}>Редактировать</button>
                    {t.id !== (teachers.find(x => x.role === 'админ')?.id ?? -1) && (
                      <button onClick={() => remove(t.id)} className="gg-btn-danger">Удалить</button>
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