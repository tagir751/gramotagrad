/**
 * SCREEN: /reports — analytics dashboards.
 * PURPOSE: show grade distributions, averages, lesson counts.
 * DATA FROM URL: type, classId, subjectId, teacherId, dateFrom, dateTo.
 * DATA FROM STORE: none.
 * API REQUESTS: GET /api/reports with query params.
 * STATES: loading, err, data{grades[], lessons[], gradeDistribution[], averageGrade, totalLessons, totalGrades}.
 * ERRORS: 403 no access; network - text.
 * MOBILE BEHAVIOR: cards instead of tables; charts responsive; date pickers native.
 */
'use client'

import { useEffect, useState } from 'react'
import { useQueryPageFilters } from '@/hooks/useUrlFilters'

interface GradeDist { value: string; count: number }
interface Grade { value: string; studentId: number; lesson: { date: string; subject: { name: string } } }
interface Lesson { id: number; date: string; subject: { name: string }; class: { name: string } }

export function ReportsPage() {
  const { page, classId, setParam } = useQueryPageFilters()
  // Ответ API зависит от type: school -> {gradeDistribution, averageGrade,
  // totalLessons, totalGrades}, teacher/student -> {lessons, grades}.
  // Имена полей должны совпадать с /api/reports: раньше страница читала
  // gradeDist/avgGrade, поэтому средний балл всегда был «—», а распределение нулевым.
  const [data, setData] = useState<{
    grades?: Grade[]
    lessons?: Lesson[]
    gradeDistribution?: GradeDist[]
    averageGrade?: number | null
    totalLessons?: number
    totalGrades?: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [type, setType] = useState<'school' | 'teacher' | 'student'>('school')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [teacherId, setTeacherId] = useState('')

  const fetchData = async () => {
    setLoading(true)
    setErr('')
    const params = new URLSearchParams()
    params.set('type', type)
    if (classId) params.set('classId', classId)
    if (subjectId) params.set('subjectId', subjectId)
    if (teacherId) params.set('teacherId', teacherId)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    const res = await fetch(`/api/reports?${params}`)
    if (!res.ok) throw new Error(res.status === 403 ? 'Нет доступа' : 'Ошибка загрузки')
    return res.json()
  }

  useEffect(() => {
    fetchData().then(setData).catch((e: Error) => setErr(e.message)).finally(() => setLoading(false))
  }, [type, classId, subjectId, teacherId, dateFrom, dateTo])

  function formatDist(dist: GradeDist[] | undefined) {
    const order = ['5', '4', '3', '2', 'Н', '']
    return order.map((v) => ({ value: v, count: (dist ?? []).find((d) => d.value === v)?.count ?? 0 }))
  }

  if (loading) return <p>Загрузка…</p>
  if (err) return <p className="gg-error">{err}</p>
  if (!data) return <p>Нет данных</p>

  const dist = type === 'school' ? formatDist(data.gradeDistribution) : []

  return (
    <div>
      <h1>Отчёты</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Тип
          <select value={type} onChange={(e) => setType(e.target.value as 'school'|'teacher'|'student')} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }}>
            <option value="school">Школа</option>
            <option value="teacher">Учитель</option>
            <option value="student">Ученик</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Класс
          <select value={classId} onChange={(e) => setParam('classId', e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }}>
            <option value="">Все</option>
            {/* classes loaded from context - simplified */}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Дата от <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Дата до <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }} />
        </label>
        <button onClick={() => fetchData().then(setData).catch((e: Error) => setErr(e.message))} style={{ padding: '10px 16px', minHeight: 44, fontSize: 16, alignSelf: 'flex-end' }}>Обновить</button>
      </div>

      {err && <p className="gg-error">{err}</p>}

      {type === 'school' && data && (
        <section style={{ marginBottom: 24 }}>
          <h2>Сводка по школе</h2>
          <div className="gg-stat-grid">
            <div className="gg-stat gg-stat--today">
              <span className="gg-stat__icon" aria-hidden="true">📅</span>
              <span className="gg-stat__label">Уроков</span>
              <span className="gg-stat__value">{data.totalLessons}</span>
            </div>
            <div className="gg-stat gg-stat--later">
              <span className="gg-stat__icon" aria-hidden="true">🕓</span>
              <span className="gg-stat__label">Оценок</span>
              <span className="gg-stat__value">{data.totalGrades}</span>
            </div>
            <div className="gg-stat gg-stat--wait">
              <span className="gg-stat__icon" aria-hidden="true">⏳</span>
              <span className="gg-stat__label">Средний балл</span>
              <span className="gg-stat__value">{data.averageGrade ? Number(data.averageGrade).toFixed(2) : '—'}</span>
            </div>
          </div>
          <h3 style={{ marginTop: 16 }}>Распределение оценок</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {dist.map((d) => (
              <span key={d.value} className={`gg-badge val-${d.value === 'Н' ? 'n' : d.value || 'empty'}`}>{d.value || '—'} · {d.count}</span>
            ))}
          </div>
        </section>
      )}

      {type === 'teacher' && data && (
        <section>
          <h2>Уроки учителя</h2>
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead><tr><th>Дата</th><th>Предмет</th><th>Класс</th></tr></thead>
              <tbody>
                {(data.lessons ?? []).map((l) => (
                  <tr key={l.id}><td>{l.date}</td><td>{l.subject?.name}</td><td>{l.class?.name}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {type === 'student' && data && (
        <section>
          <h2>Оценки ученика</h2>
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead><tr><th>Дата</th><th>Предмет</th><th>Оценка</th></tr></thead>
              <tbody>
                {(data.grades ?? []).map((g, i) => (
                  <tr key={i}><td>{g.lesson?.date}</td><td>{g.lesson?.subject?.name}</td><td>{g.value || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}