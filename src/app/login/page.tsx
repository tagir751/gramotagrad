import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Вход — Грамотаград' }

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Загрузка…</div>}>
      <LoginForm />
    </Suspense>
  )
}
