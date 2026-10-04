import { Suspense } from 'react'
import { JournalPage } from './JournalPage'

export const metadata = { title: 'Журнал — Грамотаград', description: 'Электронный журнал оценок' }

export default function Journal() {
  return (
    <Suspense fallback={<div>Загрузка журнала…</div>}>
      <JournalPage />
    </Suspense>
  )
}
