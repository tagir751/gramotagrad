/**
 * ЭКРАН: /admin — табы панели админа (клиентская часть).
 * НАЗНАЧЕНИЕ: переключение между Назначения, Классы, Предметы, Учителя,
 *   Ответственные, Рекомендации, Импорт/Экспорт, Пароли.
 * ДАННЫЕ ИЗ URL: нет. ДАННЫЕ ИЗ СТОРА: нет.
 * ЗАПРОСЫ К API: только дочерние компоненты.
 * СОСТОЯНИЯ: activeTab.
 * МОБИЛЬНОЕ ПОВЕДЕНИЕ: табы горизонтально с прокруткой; кнопки min-height 44px.
 */
'use client'

import { useState } from 'react'
import { AdminAssignments } from './AdminAssignments'
import { AdminPasswords } from './AdminPasswords'
import { AdminClasses } from './AdminClasses'
import { AdminSubjects } from './AdminSubjects'
import { AdminTeachers } from './AdminTeachers'
import { AdminResponsible } from './AdminResponsible'
import { AdminRecommendations } from './AdminRecommendations'
import { AdminImportExport } from './AdminImportExport'

type TabKey = 'assignments' | 'classes' | 'subjects' | 'teachers' | 'responsible' | 'recommendations' | 'importExport' | 'passwords'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'assignments', label: 'Назначения' },
  { key: 'classes', label: 'Классы' },
  { key: 'subjects', label: 'Предметы' },
  { key: 'teachers', label: 'Учителя' },
  { key: 'responsible', label: 'Ответственные' },
  { key: 'recommendations', label: 'Рекомендации' },
  { key: 'importExport', label: 'Импорт/Экспорт' },
  { key: 'passwords', label: 'Пароли' },
]

export function AdminTabs() {
  const [tab, setTab] = useState<TabKey>('assignments')

  return (
    <div>
      <div className="gg-tabs gg-spacer" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'gg-tab is-active' : 'gg-tab'}
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'assignments' && <AdminAssignments />}
      {tab === 'classes' && <AdminClasses />}
      {tab === 'subjects' && <AdminSubjects />}
      {tab === 'teachers' && <AdminTeachers />}
      {tab === 'responsible' && <AdminResponsible />}
      {tab === 'recommendations' && <AdminRecommendations />}
      {tab === 'importExport' && <AdminImportExport />}
      {tab === 'passwords' && <AdminPasswords />}
    </div>
  )
}
