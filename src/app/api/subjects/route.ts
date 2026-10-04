/**
 * ПРОЦЕСС: чтение справочника предметов с учётом прав.
 * НАЗНАЧЕНИЕ: дать журналу список предметов для селекта без утечки чужих.
 * ТРИГГЕР: GET /api/subjects со страницы journal.
 * ВХОДНЫЕ ДАННЫЕ: нет.
 * ПРОВЕРКА ПРАВ: requireSession; админ — все предметы, учитель — только TeacherSubject.
 *   Пустые назначения — легальное состояние: возвращается [], не ошибка.
 * ЧТО ЧИТАЕТСЯ ИЗ БД: Subject (через getTeacherSubjects).
 * ЧТО ПИШЕТСЯ В БД: ничего.
 * ОШИБКИ: 401 без сессии.
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: [{id, name}] или [] с пустым состоянием селекта.
 */
import { NextResponse } from 'next/server'
import { requireSession, getTeacherSubjects } from '@/lib/auth'
import { handleApiError } from '@/lib/api'

export async function GET() {
  try {
    const session = await requireSession()
    const subjects = await getTeacherSubjects(session.teacherId)
    return NextResponse.json(subjects.map((s) => ({ id: s.id, name: s.name })))
  } catch (e) {
    return handleApiError(e)
  }
}
