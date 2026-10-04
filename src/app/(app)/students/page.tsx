import { Suspense } from 'react'
import { StudentsPage } from './StudentsPage'

export const metadata = { title: 'Ученики — Грамотаград' }

export default function Students() {
  return (
    <Suspense fallback={<div>Загрузка учеников…</div>}>
      <StudentsPage />
    </Suspense>
  )
}
