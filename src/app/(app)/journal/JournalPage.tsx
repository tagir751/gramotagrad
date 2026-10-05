/**
 * ЭКРАН: /journal — редактируемый журнал урока.
 * НАЗНАЧЕНИЕ: выбрать класс/предмет/дату, показать учеников класса с оценками
 *   урока, отредактировать и сохранить ОДНИМ запросом POST /api/lessons
 *   (тема + домашка + оценки + комментарии). Второй путь не используется,
 *   чтобы не задваивать сохранения.
 * ДАННЫЕ ИЗ URL: classId, subjectId, date (хук useJournalFilters; Back/F5 работают).
 * ДАННЫЕ ИЗ СТОРА: нет (фильтры только в URL).
 * ЗАПРОСЫ К API:
 *   1. GET /api/classes → селект классов (пусто = нет назначений, легально);
 *   2. GET /api/subjects → селект предметов;
 *   3. GET /api/students?classId → список учеников;
 *   4. GET /api/lessons?date&classId&subjectId → урок + оценки;
 *   5. POST /api/lessons {date,classId,subjectId,topic,homework,grades[]} → save.
 * СОСТОЯНИЯ: loading, saving, error (текстом), lesson (null = новый урок),
 *   rows {studentId, fullName, value, comment} — правки локально до Сохранить.
 * ОШИБКИ: 403 чужой класс/предмет → 'Нет доступа...'; сеть → 'Ошибка сети';
 *   пустые справочники → подсказка вместо ошибки.
* МОБИЛЬНОЕ ПОВЕДЕНИЕ:
 * - на десктопе: таблица в обёртке с overflow-x:auto;
 * - на < 760px: таблица скрыта (класс gg-hide-mobile), вместо неё карточки учеников
 *   (класс gg-show-mobile) с крупными селектами и полями (min-height 44px, font-size 16px);
 * - фильтры (класс/предмет/дата) — селекты на всю ширину на узком экране;
 * - кнопка «Сохранить» — min-height 48px, font-size 16px.
 */
'use client'

import { useEffect, useState } from 'react'
import { useJournalFilters } from '@/hooks/useUrlFilters'
import { useAppStore } from '@/store/app'
import { GRADE_VALUES } from '@/lib/validators'

interface RefItem { id: number; name: string }
interface Student { id: number; fullName: string }
interface Row { studentId: number; fullName: string; value: string; comment: string }

/** Класс CSS пилюли оценки по значению (палитра мокапа). */
function gradeClass(value: string): string {
  if (value === 'Н') return 'gg-grade val-n'
  if (['5', '4', '3', '2'].includes(value)) return `gg-grade val-${value}`
  return 'gg-grade'
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()
}

export function JournalPage() {
  const { classId, subjectId, date, setFilter } = useJournalFilters()
  const session = useAppStore((s) => s.session)
  const [classes, setClasses] = useState<RefItem[]>([])
  const [subjects, setSubjects] = useState<RefItem[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [topic, setTopic] = useState('')
  const [homework, setHomework] = useState('')
  const [lessonId, setLessonId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refsLoaded, setRefsLoaded] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState('')

  // Справочники один раз: только свои классы/предметы (API фильтрует по правам).
  useEffect(() => {
    Promise.all([
      fetch('/api/classes').then((r) => r.json()).then(setClasses).catch(() => {}),
      fetch('/api/subjects').then((r) => r.json()).then(setSubjects).catch(() => {}),
    ]).finally(() => setRefsLoaded(true))
  }, [])

  // Ученики + урок при смене фильтров.
  useEffect(() => {
    if (!classId || !subjectId || !date) return
    setLoading(true)
    setErr('')
    setSaved('')
    Promise.all([
      fetch(`/api/students?classId=${classId}`).then(async (r) => {
        if (r.status === 403) throw new Error('Нет доступа к классу')
        if (!r.ok) throw new Error('Ошибка загрузки учеников')
        return r.json() as Promise<Student[]>
      }),
      fetch(`/api/lessons?date=${date}&classId=${classId}&subjectId=${subjectId}`).then(async (r) => {
        if (r.status === 403) throw new Error('Нет доступа к классу или предмету')
        if (!r.ok) throw new Error('Ошибка загрузки урока')
        return r.json()
      }),
    ])
      .then(([students, lessonData]) => {
        const byStudent = new Map<number, { value: string; comment: string }>(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (lessonData.grades as any[]).map((g) => [g.studentId, { value: g.value, comment: g.comment }]),
        )
        setRows(
          students.map((s) => ({
            studentId: s.id,
            fullName: s.fullName,
            value: byStudent.get(s.id)?.value ?? '',
            comment: byStudent.get(s.id)?.comment ?? '',
          })),
        )
        setTopic(lessonData.lesson?.topic ?? '')
        setHomework(lessonData.lesson?.homework ?? '')
        setLessonId(lessonData.lesson?.id ?? null)
      })
      .catch((e: Error) => setErr(e.message === 'Failed to fetch' ? 'Ошибка сети' : e.message))
      .finally(() => setLoading(false))
  }, [classId, subjectId, date])

  function patchRow(studentId: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)))
  }

  // Единственный путь сохранения: POST /api/lessons (upsert урока + оценки).
  async function save() {
    if (!classId || !subjectId || !date || saving) return
    setSaving(true)
    setErr('')
    setSaved('')
    try {
      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          classId: Number(classId),
          subjectId: Number(subjectId),
          topic,
          homework,
          grades: rows.map((r) => ({ studentId: r.studentId, value: r.value, comment: r.comment })),
        }),
      })
      if (res.status === 403) throw new Error('Нет доступа к классу или предмету')
      if (!res.ok) throw new Error('Не удалось сохранить')
      const lesson = await res.json()
      setLessonId(lesson.id)
      setSaved('Сохранено')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="gg-greeting">
        <div className="gg-greeting-date">{new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div className="gg-greeting-hello">Журнал · {session?.fullName ?? ''}</div>
      </div>
      <div className="gg-card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <label>
          Класс{' '}
          <select value={classId} onChange={(e) => setFilter('classId', e.target.value)}>
            <option value="">—</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          Предмет{' '}
          <select value={subjectId} onChange={(e) => setFilter('subjectId', e.target.value)}>
            <option value="">—</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label>
          Дата <input type="date" value={date} onChange={(e) => setFilter('date', e.target.value)} />
        </label>
      </div>

      {!classId || !subjectId ? (
        refsLoaded && classes.length === 0 ? (
          <p className="gg-empty">
            {session?.role !== 'админ' && session?.isVospitatel
              ? 'Журнал ведут учителя-предметники. Ваши классы — в разделе «Воспитание».'
              : 'Нет назначенных классов или предметов. Обратитесь к админу.'}
          </p>
        ) : (
          <p>Выберите класс и предмет — фильтр живёт в URL.</p>
        )
      ) : classes.length === 0 || subjects.length === 0 ? (
        <p>Нет назначенных классов или предметов. Обратитесь к админу.</p>
      ) : loading ? (
        <p>Загрузка…</p>
      ) : (
        <>
          {err && <p className="gg-error">{err}</p>}
          {saved && <p className="gg-ok">{saved} ✓</p>}
          <label className="gg-field">
            📝 Тема урока
            <input className="gg-input" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={500} placeholder="Тема урока" />
          </label>
          <label className="gg-field">
            📖 Домашнее задание
            <input className="gg-input" value={homework} onChange={(e) => setHomework(e.target.value)} maxLength={2000} placeholder="Домашнее задание" />
          </label>
          <div className="gg-section-header">
            <h2><span>👨‍🎓</span> Ученики</h2>
            <span className="gg-count">{rows.length}</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{lessonId ? `Урок #${lessonId}` : 'Новый урок (создастся при сохранении)'}</p>

          {/* Desktop table with horizontal scroll */}
          <div className="gg-table-wrap gg-hide-mobile">
            <table className="gg-table">
              <thead>
                <tr><th>Ученик</th><th>Оценка</th><th>Комментарий</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId}>
                    <td>
                      <span className="gg-student-row">
                        <span className="gg-avatar">{initials(r.fullName)}</span>
                        <span className="gg-student-name">{r.fullName}</span>
                      </span>
                    </td>
                    <td>
                      <select className={gradeClass(r.value)} value={r.value} onChange={(e) => patchRow(r.studentId, { value: e.target.value })}>
                        {GRADE_VALUES.map((v) => (
                          <option key={v} value={v}>{v === '' ? '—' : v}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="gg-input"
                        value={r.comment}
                        onChange={(e) => patchRow(r.studentId, { comment: e.target.value })}
                        maxLength={2000}
                        placeholder="Комментарий"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="gg-logs-cards gg-show-mobile">
            {rows.map((r) => (
              <div key={r.studentId} className="gg-log-card">
                <div className="gg-student-row" style={{ marginBottom: 8 }}>
                  <span className="gg-avatar">{initials(r.fullName)}</span>
                  <span className="gg-student-name">{r.fullName}</span>
                  <select className={gradeClass(r.value)} value={r.value} onChange={(e) => patchRow(r.studentId, { value: e.target.value })}>
                    {GRADE_VALUES.map((v) => (
                      <option key={v} value={v}>{v === '' ? '—' : v}</option>
                    ))}
                  </select>
                </div>
                <label className="gg-field" style={{ marginBottom: 0 }}>
                  <input
                    className="gg-input"
                    value={r.comment}
                    onChange={(e) => patchRow(r.studentId, { comment: e.target.value })}
                    maxLength={2000}
                    placeholder="Комментарий"
                  />
                </label>
              </div>
            ))}
          </div>
          {rows.length === 0 && !err && <p className="gg-empty">В классе нет учеников.</p>}
          <button className="gg-btn gg-btn-success" onClick={save} disabled={saving} style={{ marginTop: 12 }}>
            <span>{saving ? 'Сохранение…' : '✔ Сохранить урок'}</span>
          </button>
        </>
      )}
    </div>
  )
}
