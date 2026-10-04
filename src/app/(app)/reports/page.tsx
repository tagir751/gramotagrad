import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { ReportsPage } from './ReportsPage'

export const metadata = { title: 'Отчёты — Грамотаград' }

/**
 * SCREEN: /reports — analytics dashboards.
 * PURPOSE: show grade distributions, averages, lesson counts.
 * DATA FROM URL: type, classId, subjectId, teacherId, dateFrom, dateTo.
 * DATA FROM STORE: none.
 * API REQUESTS: GET /api/reports with query params.
 * STATES: loading, err, data{grades[], lessons[], gradeDist[], avgGrade, totalLessons, totalGrades}.
 * ERRORS: 403 no access; network - text.
 * MOBILE BEHAVIOR: cards instead of tables; charts responsive; date pickers native.
 */
async function ReportsGate() {
  const s = await getSession()
  if (!s) redirect('/login')
  // Reports visible to admin and teachers (with own data)
  return <ReportsPage />
}

export default function Reports() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Загрузка отчётов…</div>}>
      <ReportsGate />
    </Suspense>
  )
}