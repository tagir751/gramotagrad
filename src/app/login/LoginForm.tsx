'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/app'

// Единая нейтральная ошибка — не раскрывает, есть ли пользователь.
export function LoginForm() {
  const router = useRouter()
  const setSession = useAppStore((s) => s.setSession)
  const [teacherId, setTeacherId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId, password }),
      })
      if (!res.ok) {
        setError('Неверный логин или пароль')
        return
      }
      setSession(await res.json())
      router.replace('/journal')
    } catch {
      setError('Неверный логин или пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="gg-login-wrap">
      <form onSubmit={submit} className="gg-login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-seal.webp" alt="Печать Грамотаград" className="gg-login-seal" />
        <h1 className="gg-login-title">Вход в Грамотаград</h1>
        <label className="gg-field">
          Логин — ваш числовой ID
          <input
            className="gg-input"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            placeholder="Например: 2"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="numeric"
          />
        </label>
        <label className="gg-field">
          Пароль
          <input
            className="gg-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="gg-error">{error}</p>}
        <button type="submit" className="gg-btn" disabled={loading}>
          {loading ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
