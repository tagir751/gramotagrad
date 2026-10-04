/**
 * ПРОЦЕСС: чтение справочника классов с учётом прав.
 * НАЗНАЧЕНИЕ: дать журналу/ученикам список классов для селектов без утечки чужих.
 * ТРИГГЕР: GET /api/classes со страниц journal/students.
 * ВХОДНЫЕ ДАННЫЕ: нет (query не требуется).
 * ПРОВЕРКА ПРАВ: requireSession; админ — все классы, учитель — только TeacherClass.
 *   Пустые назначения — легальное состояние: возвращается [], не ошибка
 *   (см. бизнес-правило 13: пустые TeacherClass = пустой журнал).
 * ЧТО ЧИТАЕТСЯ ИЗ БД: Class (через getTeacherClasses).
 * ЧТО ПИШЕТСЯ В БД: ничего.
 * ОШИБКИ: 401 без сессии; иначе 500 не показываем детали.
 * ЧТО ВИДИТ ПОЛЬЗОВАТЕЛЬ: [{id, name}] или [] с пустым состоянием селекта.
 */
import { NextResponse } from 'next/server'
import { requireSession, getTeacherClasses } from '@/lib/auth'
import { handleApiError } from '@/lib/api'

export async function GET() {
  try {
    const session = await requireSession()
    const classes = await getTeacherClasses(session.teacherId)
    return NextResponse.json(classes.map((c) => ({ id: c.id, name: c.name })))
  } catch (e) {
    return handleApiError(e)
  }
}
