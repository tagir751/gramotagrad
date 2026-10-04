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

      <fieldset style={{ border: '1px solid var(--separator)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <legend style={{ fontWeight: 600, marginBottom: 12 }}>{editingId ? 'Редактирование' : 'Создание учителя'}</legend>

        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Фамилия <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Имя + Отчество <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Полное ФИО <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Роль
            <select value={role} onChange={(e) => setRole(e.target.value as 'админ' | 'учитель')} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }}>
              <option value="учитель">Учитель</option>
              <option value="админ">Админ</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={isVospitatel} onChange={(e) => setIsVospitatel(e.target.checked)} style={{ width: 20, height: 20 }} /> Воспитатель
          </label>
          {editingId === null && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Пароль (мин. 8)
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }} />
            </label>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <h4 style={{ marginBottom: 8 }}>Классы</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {classes.map((c) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--separator)', borderRadius: 8, background: 'var(--card-bg)' }}>
                <input type="checkbox" checked={classIds.has(c.id)} onChange={() => toggle(classIds, setClassIds, c.id)} style={{ width: 20, height: 20 }} /> {c.name}
              </label>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <h4 style={{ marginBottom: 8 }}>Предметы</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {subjects.map((s) => (
              <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--separator)', borderRadius: 8, background: 'var(--card-bg)' }}>
                <input type="checkbox" checked={subjectIds.has(s.id)} onChange={() => toggle(subjectIds, setSubjectIds, s.id)} style={{ width: 20, height: 20 }} /> {s.name}
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={save} disabled={saving} style={{ padding: '14px 20px', fontSize: 16, minHeight: 48, flex: 1 }}>
            {saving ? 'Сохранение…' : editingId ? 'Сохранить' : 'Создать учителя'}
          </button>
          {editingId && <button onClick={cancel} style={{ padding: '14px 20px', fontSize: 16, minHeight: 48, background: 'var(--card-bg)', border: '1px solid var(--separator)' }}>Отмена</button>}
        </div>
      </fieldset>

      <h3>Список учителей</h3>
      {teachers.length === 0 ? <p className="gg-empty">Учителей нет</p> : (
        <div className="gg-table-wrap">
          <table className="gg-table">
            <thead><tr><th>ФИО</th><th>Роль</th><th>Воспит.</th><th>Классов</th><th>Предметов</th><th style={{ width: 200 }}>Действия</th></tr></thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id}>
                  <td>{t.fullName}</td>
                  <td>{t.role}</td>
                  <td>{t.isVospitatel ? 'Да' : 'Нет'}</td>
                  <td>{t.classIds.length}</td>
                  <td>{t.subjectIds.length}</td>
                  <td style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => edit(t)} style={{ padding: '8px 12px', minHeight: 44, fontSize: 16 }}>Редактировать</button>
                    {t.id !== (teachers.find(x => x.role === 'админ')?.id ?? -1) && (
                      <button onClick={() => remove(t.id)} className="gg-btn-danger" style={{ padding: '8px 12px', minHeight: 44, fontSize: 16 }}>Удалить</button>
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