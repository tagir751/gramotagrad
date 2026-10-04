'use client'

import { create } from 'zustand'
import type { AuthSession } from '@/lib/auth'

// v2: только session / isMobile / модалки. Фильтры (classId, subjectId, date, query, page) — только в URL.
interface AppState {
  session: AuthSession | null
  setSession: (s: AuthSession | null) => void
  isMobile: boolean
  setIsMobile: (v: boolean) => void
  gradeDialogOpen: boolean
  setGradeDialogOpen: (v: boolean) => void
  selectedStudentId: number | null
  setSelectedStudentId: (id: number | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  isMobile: false,
  setIsMobile: (isMobile) => set({ isMobile }),
  gradeDialogOpen: false,
  setGradeDialogOpen: (gradeDialogOpen) => set({ gradeDialogOpen }),
  selectedStudentId: null,
  setSelectedStudentId: (selectedStudentId) => set({ selectedStudentId }),
}))
