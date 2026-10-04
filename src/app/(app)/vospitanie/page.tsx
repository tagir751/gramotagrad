import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { VospitaniePage } from './VospitaniePage'

export const metadata = { title: 'Воспитание — Грамотаград' }

/**
 * ЭКРАН: /vospitanie — воспитательный раздел.
 * НАЗНАЧЕНИЕ: обзор по классам для воспитателей/админов.
 * ДАННЫЕ ИЗ URL: classId (опционально).
 * ЗАПРОСЫ К API: только VospitaniePage.
 * СОСТОЯНИЯ: нет (в дочернем компоненте).
 * ОШИБКИ: нет доступа — редирект на /journal.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: наследуется от VospitaniePage.
 */
async function VospitanieGate() {
  const s = await getSession()
  if (!s) redirect('/login')
  // Видят админы и пользователи с isVospitatel=true
  if (s.role !== 'админ' && !s.isVospitatel) redirect('/journal')
  return <VospitaniePage />
}

export default function Vospitanie() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Загрузка…</div>}>
      <VospitanieGate />
    </Suspense>
  )
}