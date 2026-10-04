/**
 * ЭКРАН: /vospitanie — воспитательный раздел.
 * НАЗНАЧЕНИЕ: обзор по классам: ответственные, ученики, рекомендации, комментарии учителей.
 * ДАННЫЕ ИЗ URL: classId (опционально, фильтр).
 * ДАННЫЕ ИЗ СТОРА: нет.
 * ЗАПРОСЫ К API: GET /api/vospitanie?classId=...
 * СОСТОЯНИЯ: loading, err, data{classes, students, recommendations, comments, responsible}.
 * ОШИБКИ: 403 нет доступа; сеть — текст.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: аккордеоны/карточки вместо таблиц; крупные кнопки/инпуты.
 */
'use client'

import { useEffect, useState } from 'react'
import { useQueryPageFilters } from '@/hooks/useUrlFilters'

interface Cls { id: number; name: string; responsible: { id: number; fullName: string } | null }
interface Student { id: number; fullName: string; classId: number; className?: string }
interface Rec { id: number; text: string; createdAt: string; student: { id: number; fullName: string; classId: number }; author: { fullName: string } }
interface Comment { id: number; text: string; date: string; lessonDate: string; subject: string; student: { fullName: string; className?: string }; teacher: { fullName: string } }
interface Resp { classId: number; className: string; teacherId: number | null; teacherFullName: string | null }

export function VospitaniePage() {
  const { classId, setParam } = useQueryPageFilters()
  const [data, setData] = useState<{ classes: any[]; students: any[]; recommendations: any[]; comments: any[]; responsible: any[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    setLoading(true)
    setErr('')
    const params = classId ? `?classId=${encodeURIComponent(classId)}` : ''
    fetch(`/api/vospitanie${params}`)
      .then(async (r) => { if (!r.ok) throw new Error(r.status === 403 ? 'Нет доступа' : 'Ошибка загрузки'); return r.json() })
      .then(setData)
      .catch((e: Error) => setErr(e.message === 'Failed to fetch' ? 'Ошибка сети' : e.message))
      .finally(() => setLoading(false))
  }, [classId])

  if (loading) return <p>Загрузка…</p>
  if (err && !data) return <p className="gg-error">{err}</p>
  if (!data) return <p>Нет данных</p>

  const { classes, students, recommendations, comments, responsible } = data

  return (
    <div>
      <h1>Воспитательная работа</h1>

      <label className="gg-field">
        Класс <select value={classId} onChange={(e) => setParam('classId', e.target.value)}>
          <option value="">Все доступные</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      {err && <p className="gg-error">{err}</p>}

      <div className="gg-stack">
        <section>
          <h2>Классы и ответственные</h2>
          <div className="gg-table-wrap">
            <table className="gg-table">
              <thead><tr><th>Класс</th><th>Ответственный воспитатель</th></tr></thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.responsible?.fullName ?? <span className="gg-muted">— не назначен —</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>Ученики</h2>
          {students.length === 0 ? <p className="gg-empty">Учеников нет</p> : (
            <ul className="gg-list">
              {students.map((s) => (
                <li key={s.id} className="gg-log-card gg-log-card--compact">
                  <strong>{s.fullName}</strong> <span className="gg-muted">({s.className})</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2>Актуальные рекомендации</h2>
          {recommendations.length === 0 ? <p className="gg-empty">Рекомендаций нет</p> : (
            <div className="gg-logs-cards">
              {recommendations.map((r) => (
                <div key={r.id} className="gg-log-card">
                  <div className="gg-row-between">
                    <strong>{r.student.fullName}</strong>
                    <span className="gg-meta">{new Date(r.createdAt).toLocaleString('ru-RU')}</span>
                  </div>
                  <div className="gg-prewrap">{r.text}</div>
                  <div className="gg-meta">Автор: {r.author.fullName}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2>Комментарии учителей (последние 500)</h2>
          {comments.length === 0 ? <p className="gg-empty">Комментариев нет</p> : (
            <div className="gg-logs-cards">
              {comments.map((c) => (
                <div key={c.id} className="gg-log-card">
                  <div className="gg-row-between">
                    <span className="gg-strong">{c.subject} · {new Date(c.lessonDate).toLocaleDateString('ru-RU')}</span>
                    <span className="gg-muted">{c.teacher.fullName}</span>
                  </div>
                  <div className="gg-row-tight"><strong>Ученик:</strong> {c.student.fullName} ({c.student.className})</div>
                  <div className="gg-prewrap">{c.text}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2>Ответственные воспитатели</h2>
          {data.responsible.length === 0 ? <p className="gg-empty">Назначений нет</p> : (
            <ul className="gg-list">
              {data.responsible.map((r) => (
                <li key={r.classId} className="gg-log-card gg-log-card--compact">
                  <strong>{r.className}</strong> — {r.teacherFullName ?? <span className="gg-muted">— не назначен —</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}