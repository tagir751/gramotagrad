/**
 * SCREEN: /reports — analytics dashboards.
 * PURPOSE: show grade distributions, averages, lesson counts.
 * DATA FROM URL: classId (useQueryPageFilters).
 * DATA FROM STORE: session (дефолт teacherId для типа «Учитель»).
 * API REQUESTS: GET /api/classes, /api/subjects, /api/admin/teachers (справочники),
 *   GET /api/reports?type=...&classId=...&subjectId=...&teacherId=...&dateFrom=...&dateTo=....
 * STATES: loading (инлайн, панель фильтров не размонтируется), err, data.
 * RESPONSE FIELDS (API): school -> {totalLessons, totalGrades, gradeDistribution, averageGrade};
 *   teacher -> {lessons, grades}; student -> {students, grades}.
 * ERRORS: 403 no access; 400 нет обязательных параметров; network - text.
 * MOBILE BEHAVIOR: cards instead of tables; date pickers native.
 */
'use client'

import { useEffect, useState } from 'react'
import { useQueryPageFilters } from '@/hooks/useUrlFilters'
import { useAppStore } from '@/store/app'

interface GradeDist { value: string; count: number }
interface Grade { value: string; studentId: number; student?: { fullName: string }; lesson: { date: string; subject: { name: string } } }
interface Lesson { id: number; date: string; subject: { name: string }; class: { name: string } }
interface RefItem { id: number; name: string }
interface TeacherRef { id: number; fullName: string }

export function ReportsPage() {
  const { classId, setParam } = useQueryPageFilters()
  const session = useAppStore((s) => s.session)
  const [data, setData] = useState<{
    grades?: Grade[]
    lessons?: Lesson[]
    students?: { id: number; fullName: string }[]
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

  const [classes, setClasses] = useState<RefItem[]>([])
  const [subjects, setSubjects] = useState<RefItem[]>([])
  const [teachers, setTeachers] = useState<TeacherRef[]>([])

  // Справочники один раз (классы/предметы — свои; учителя — для админского фильтра).
  useEffect(() => {
    fetch('/api/classes').then((r) => r.json()).then((j) => Array.isArray(j) && setClasses(j)).catch(() => {})
    fetch('/api/subjects').then((r) => r.json()).then((j) => Array.isArray(j) && setSubjects(j)).catch(() => {})
    fetch('/api/admin/teachers').then((r) => (r.ok ? r.json() : [])).then((j) => Array.isArray(j) && setTeachers(j)).catch(() => {})
  }, [])

  // Дефолты: тип «Учитель» без выбора → своя учёта (или первый для админа);
  // тип «Ученик» без класса → первый доступный класс. Без этого API отдаёт 400.
  useEffect(() => {
    if (type === 'teacher' && !teacherId && teachers.length) {
      const own = teachers.find((t) => t.id === session?.teacherId)
      setTeacherId(String(own?.id ?? teachers[0].id))
    }
    if (type === 'student' && !classId && classes.length) {
      setParam('classId', String(classes[0].id))
    }
  }, [type, teacherId, teachers, classId, classes, session, setParam])

  const fetchData = async () => {
    setLoading(true)
    setErr('')
    try {
      const params = new URLSearchParams()
      params.set('type', type)
      if (classId) params.set('classId', classId)
      if (subjectId) params.set('subjectId', subjectId)
      if (teacherId) params.set('teacherId', teacherId)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/reports?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error
          ? (res.status === 403 ? 'Нет доступа' : 'Некорректные параметры фильтра')
          : res.status === 403 ? 'Нет доступа' : 'Ошибка загрузки')
      }
      setData(await res.json())
    } catch (e) {
      setErr(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, classId, subjectId, teacherId, dateFrom, dateTo])

  function formatDist(dist: GradeDist[] | undefined) {
    const order = ['5', '4', '3', '2', 'Н', '']
    return order.map((v) => ({ value: v, count: (dist ?? []).find((d) => d.value === v)?.count ?? 0 }))
  }

  const dist = type === 'school' ? formatDist(data?.gradeDistribution) : []

  return (
    <div>
      <h1>Отчёты</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Тип
          <select value={type} onChange={(e) => setType(e.target.value as 'school' | 'teacher' | 'student')} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }}>
            <option value="school">Школа</option>
            <option value="teacher">Учитель</option>
            <option value="student">Ученик</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Класс
          <select value={classId} onChange={(e) => setParam('classId', e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }}>
            <option value="">Все</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Предмет
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }}>
            <option value="">Все</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {type === 'teacher' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Учитель
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }}>
              <option value="">— выберите —</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
            </select>
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Дата от <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          Дата до <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }} />
        </label>
        <button onClick={() => fetchData()} disabled={loading} style={{ padding: '10px 16px', minHeight: 44, fontSize: 16, alignSelf: 'flex-end' }}>
          {loading ? 'Обновление…' : 'Обновить'}
        </button>
      </div>

      {err && <p className="gg-error">{err}</p>}
      {loading && <p>Загрузка…</p>}

      {!loading && !err && data && (
        <>
          {type === 'school' && (
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

          {type === 'teacher' && (
            <section>
              <h2>Уроки учителя</h2>
              {(data.lessons ?? []).length === 0 ? (
                <p className="gg-empty">Уроков нет</p>
              ) : (
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
              )}
            </section>
          )}

          {type === 'student' && (
            <section>
              <h2>Оценки класса</h2>
              {(data.grades ?? []).length === 0 ? (
                <p className="gg-empty">Оценок нет</p>
              ) : (
                <div className="gg-table-wrap">
                  <table className="gg-table">
                    <thead><tr><th>Ученик</th><th>Дата</th><th>Предмет</th><th>Оценка</th></tr></thead>
                    <tbody>
                      {(data.grades ?? []).map((g, i) => (
                        <tr key={i}>
                          <td>{g.student?.fullName ?? `#${g.studentId}`}</td>
                          <td>{g.lesson?.date}</td>
                          <td>{g.lesson?.subject?.name}</td>
                          <td>{g.value || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
