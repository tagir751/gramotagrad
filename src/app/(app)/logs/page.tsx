import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { LogsPage } from './LogsPage'

export const metadata = { title: 'Логи — Грамотаград' }

/**
 * Серверная обёртка /logs: не-админ уходит на /journal.
 * Клиентская логика — в LogsPage (см. шапку ЭКРАН там).
 */
async function LogsGate() {
  const s = await getSession()
  if (s?.role !== 'админ') redirect('/journal')
  return <LogsPage />
}

export default function Logs() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Загрузка логов…</div>}>
      <LogsGate />
    </Suspense>
  )
}