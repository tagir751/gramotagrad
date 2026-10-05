/**
 * ЭКРАН: /logs — список действий (только админ).
 * НАЗНАЧЕНИЕ: аудит: кто, когда, что делал. Пагинация + фильтр action.
 * ДАННЫЕ ИЗ URL: page, limit, action (хук useQueryPageFilters).
 * ДАННЫЕ ИЗ СТОРА: нет.
 * ЗАПРОСЫ К API: GET /api/logs?page&limit&action.
 * СОСТОЯНИЯ: loading, err, logs[], page, limit, totalPages, action.
 * ОШИБКИ: 403 не-админ (редирект на /journal), сеть/загрузка — текст.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ:
 * - на десктопе: таблица с горизонтальным скроллом при необходимости;
 * - на < 640px: карточки (каждая запись — блок), без таблицы;
 * - кнопки пагинации крупные (min-height 44px), полная ширина на узком экране;
 * - overflow-x:auto на обёртке таблицы; no-zoom input (font-size 16px).
 */
'use client'

import { useEffect, useState } from 'react'
import { useQueryPageFilters } from '@/hooks/useUrlFilters'

interface LogEntry {
  id: number
  timestamp: string
  action: string
  description: string
  teacherId: number
  teacherName: string | null
  ip: string
}

const ACTION_LABELS: Record<string, string> = {
  login: 'Вход',
  login_fail: 'Неудачный вход',
  logout: 'Выход',
  lesson_create: 'Создание урока',
  lesson_update: 'Изменение урока',
  grade_save: 'Сохранение оценки',
  grade_update: 'Изменение оценки',
  grade_batch: 'Пакет оценок',
  student_create: 'Создание ученика',
  student_update: 'Изменение ученика',
  password_reset: 'Сброс пароля',
  recommendation_write: 'Рекомендация',
  import_excel: 'Импорт Excel',
  assignments_update: 'Назначения',
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function LogsPage() {
  const { page, classId, setParam } = useQueryPageFilters()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setLoading(true)
    setErr('')
    const params = new URLSearchParams()
    if (page !== '1') params.set('page', page)
    if (action) params.set('action', action)
    fetch(`/api/logs?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Нет доступа' : 'Ошибка загрузки')
        return r.json()
      })
      .then((j) => {
        setLogs(j.logs)
        setTotalPages(j.totalPages)
      })
      .catch((e: Error) => setErr(e.message === 'Failed to fetch' ? 'Ошибка сети' : e.message))
      .finally(() => setLoading(false))
  }, [page, action])

  function changePage(next: number) {
    if (next < 1 || next > totalPages) return
    setParam('page', String(next))
  }

  function changeAction(val: string) {
    setAction(val)
    setParam('action', val)
    setParam('page', '1')
  }

  const actions = ['', ...new Set(logs.map((l) => l.action))].sort()

  return (
    <div>
      <h1>Логи действий</h1>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Фильтр действия:
          <select value={action} onChange={(e) => changeAction(e.target.value)}
            style={{ padding: '10px 12px', fontSize: 16, minHeight: 44 }}>
            <option value="">Все</option>
            {actions.map((a) => (
              <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
            ))}
          </select>
        </label>
      </div>

      {err && <p className="gg-error">{err}</p>}
      {loading ? (
        <p>Загрузка…</p>
      ) : logs.length === 0 ? (
        <p>Логи пока пусты</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="gg-table-wrap" style={{ marginBottom: 12 }}>
            <table className="gg-table">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Пользователь</th>
                  <th>Действие</th>
                  <th>Описание</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(l.timestamp)}</td>
                    <td>{l.teacherName ?? `#${l.teacherId}`}</td>
                    <td>{ACTION_LABELS[l.action] ?? l.action}</td>
                    <td className="gg-td-clip">{l.description || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{l.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="gg-logs-cards gg-show-mobile">
            {logs.map((l) => (
              <div key={l.id} className="gg-log-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong>{formatDateTime(l.timestamp)}</strong>
                  <span style={{ color: 'var(--text-secondary)' }}>{ACTION_LABELS[l.action] ?? l.action}</span>
                </div>
                <div style={{ marginBottom: 4 }}><strong>Пользователь:</strong> {l.teacherName ?? `#${l.teacherId}`}</div>
                <div style={{ marginBottom: 4 }}><strong>Описание:</strong> {l.description || '—'}</div>
                <div><strong>IP:</strong> {l.ip || '—'}</div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div style={{
            display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap',
            marginTop: 16
          }}>
            <button onClick={() => changePage(Number(page) - 1)} disabled={page === '1'}
              style={{ padding: '12px 20px', minHeight: 44, minWidth: 44, fontSize: 16 }}>
              ← Назад
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 16 }}>
              {page} / {totalPages}
            </span>
            <button onClick={() => changePage(Number(page) + 1)} disabled={Number(page) === totalPages}
              style={{ padding: '12px 20px', minHeight: 44, minWidth: 44, fontSize: 16 }}>
              Вперёд →
            </button>
          </div>
        </>
      )}
    </div>
  )
}