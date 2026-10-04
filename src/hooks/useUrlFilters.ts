'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { todayISO } from '@/lib/date'

// Фильтры журнала в URL: /journal?classId=1&subjectId=2&date=2026-09-08
// Back/Forward и F5 работают из коробки (router.replace + searchParams).
export function useJournalFilters() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const classId = searchParams.get('classId') ?? ''
  const subjectId = searchParams.get('subjectId') ?? ''
  const date = searchParams.get('date') ?? todayISO()

  const setFilter = useCallback(
    (key: 'classId' | 'subjectId' | 'date', value: string) => {
      const p = new URLSearchParams(searchParams.toString())
      if (value) p.set(key, value)
      else p.delete(key)
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    },
    [searchParams, pathname, router],
  )

  return { classId, subjectId, date, setFilter }
}

// Общий хелпер для ?query=&page= (students/logs)
export function useQueryPageFilters() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  const query = searchParams.get('query') ?? ''
  const page = searchParams.get('page') ?? '1'
  const classId = searchParams.get('classId') ?? ''

  const setParam = useCallback(
    (key: string, value: string) => {
      const p = new URLSearchParams(searchParams.toString())
      if (value) p.set(key, value)
      else p.delete(key)
      if (key !== 'page') p.delete('page') // сброс пагинации при смене фильтра
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    },
    [searchParams, pathname, router],
  )

  return { query, page, classId, setParam }
}
