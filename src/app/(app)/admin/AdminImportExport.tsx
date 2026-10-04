/**
 * SCREEN: /admin → tab «Импорт/Экспорт».
 * PURPOSE: upload Excel for import, download Excel for export.
 * DATA FROM URL: none.
 * DATA FROM STORE: none.
 * API REQUESTS: POST /api/import/excel (multipart), GET /api/export?type=...
 * STATES: loading, saving, err, ok, importFile, exportType, classId, dateFrom, dateTo.
 * ERRORS: 400 file too large/bad format; 403; network - text.
 * MOBILE BEHAVIOR: file picker native; download triggers browser save; inputs 44px.
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TYPES = ['full', 'teachers', 'classes', 'subjects', 'students', 'lessons', 'grades', 'recommendations', 'logs'] as const

export function AdminImportExport() {
  const [importFile, setImportFile] = useState<File | null>(null)
  const [exportType, setExportType] = useState<'full' | 'teachers' | 'classes' | 'subjects' | 'students' | 'lessons' | 'grades' | 'recommendations' | 'logs'>('full')
  const [classId, setClassId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')

  async function handleImport() {
    if (!importFile) { setErr('Выберите файл'); return }
    if (importFile.size > 5 * 1024 * 1024) { setErr('Файл больше 5MB'); return }
    if (!importFile.name.match(/\.xlsx?$/i)) { setErr('Только .xls/.xlsx'); return }
    setSaving(true); setErr(''); setOk('')
    try {
      const form = new FormData()
      form.append('file', importFile)
      form.append('mode', 'add')
      const res = await fetch('/api/import/excel', { method: 'POST', body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Ошибка импорта')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = body.results ?? []
      const imported = rows.reduce((s: number, r: any) => s + r.imported, 0)
      const skipped = rows.reduce((s: number, r: any) => s + r.skipped, 0)
      // Построчные ошибки раньше терялись: показываем первые пять.
      const allErrors: string[] = rows.flatMap((r: any) => (r.errors ?? []).map((e: string) => `${r.sheet}: ${e}`))
      setOk(
        `Импорт завершён: листов ${body.sheetsProcessed}, добавлено ${imported}, пропущено ${skipped}.` +
          (allErrors.length
            ? `\n${allErrors.slice(0, 5).join('\n')}${allErrors.length > 5 ? `\n…и ещё ${allErrors.length - 5}` : ''}`
            : ''),
      )
      setImportFile(null)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка') }
    finally { setSaving(false) }
  }

  async function handleExport() {
    setSaving(true); setErr(''); setOk('')
    try {
      const params = new URLSearchParams()
      params.set('type', exportType)
      if (classId) params.set('classId', classId)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await fetch(`/api/export?${params}`)
      if (!res.ok) throw new Error('Экспорт не удался')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gramotagrad-export-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
      setOk('Файл скачан')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка экспорта') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <h2>Импорт / Экспорт</h2>
      {err && <p className="gg-error">{err}</p>}
      {ok && <p className="gg-ok" style={{ whiteSpace: 'pre-line' }}>{ok}</p>}

      <section style={{ marginBottom: 24, padding: 16, border: '1px solid var(--separator)', borderRadius: 12, background: 'var(--card-bg)' }}>
        <h3>Импорт из Excel</h3>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          Файл (.xlsx, до 5МБ)
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }} />
        </label>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
          Записи только добавляются: существующие ученики, классы и предметы не затираются,
          дубли пропускаются и попадают в отчёт.
        </p>
        <button onClick={handleImport} disabled={saving || !importFile} style={{ padding: '14px 20px', fontSize: 16, minHeight: 48, width: '100%', maxWidth: 300 }}>
          {saving ? 'Импорт…' : 'Импортировать'}
        </button>
      </section>

      <section style={{ padding: 16, border: '1px solid var(--separator)', borderRadius: 12, background: 'var(--card-bg)' }}>
        <h3>Экспорт в Excel</h3>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Тип данных
            <select value={exportType} onChange={(e) => setExportType(e.target.value as any)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }}>
              <option value="full">Всё (full)</option>
              <option value="teachers">Педагоги</option>
              <option value="classes">Классы</option>
              <option value="subjects">Предметы</option>
              <option value="students">Ученики</option>
              <option value="lessons">Уроки</option>
              <option value="grades">Оценки</option>
              <option value="recommendations">Рекомендации</option>
              <option value="logs">Логи</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Класс (опционально)
            <select value={classId} onChange={(e) => setClassId(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }}>
              <option value="">Все</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Дата от <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Дата до <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ fontSize: 16, minHeight: 44, padding: '10px 12px' }} />
          </label>
        </div>
        <button onClick={handleExport} disabled={saving} style={{ padding: '14px 20px', fontSize: 16, minHeight: 48, width: '100%', maxWidth: 300 }}>
          {saving ? 'Экспорт…' : 'Скачать .xlsx'}
        </button>
      </section>
    </div>
  )
}