import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { AdminTabs } from './AdminTabs'

export const metadata = { title: 'Админ — Грамотаград' }

/**
 * Серверная обёртка /admin: не-админ уходит на /journal.
 * Клиентская логика — в AdminTabs.
 */
async function AdminGate() {
  const s = await getSession()
  if (s?.role !== 'админ') redirect('/journal')
  return <AdminTabs />
}

export default function Admin() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Загрузка…</div>}>
      <AdminGate />
    </Suspense>
  )
}
