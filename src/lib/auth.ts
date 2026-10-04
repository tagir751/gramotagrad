/**
 * ГАРДЫ ДОСТУПА: единая точка проверки прав для всех защищённых API.
 * Бизнес-правила: админ (role==='админ') — всегда да; учитель — только при
 * наличии ОБОИХ назначений (класс через TeacherClass, предмет через
 * TeacherSubject). Пустые назначения = легальный пустой доступ, не ошибка.
 * Порядок в хендлерах: requireSession/requireAdmin → zod → проверки доступа → БД.
 */
import { db } from './db'
import { getSession } from './session'

export interface AuthSession {
  teacherId: number
  fullName: string
  lastName: string
  role: string // "админ" | "учитель"
  isVospitatel: boolean
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Требует любую авторизацию, иначе 401 с нейтральным текстом (без enumeration). */
export async function requireSession(): Promise<AuthSession> {
  const s = await getSession()
  if (!s) throw new ApiError(401, 'Требуется вход')
  return s
}

/** Требует роль админа, иначе 403. */
export async function requireAdmin(): Promise<AuthSession> {
  const s = await requireSession()
  if (s.role !== 'админ') throw new ApiError(403, 'Нет доступа')
  return s
}

export async function isAdmin(teacherId: number): Promise<boolean> {
  const t = await db.teacher.findUnique({ where: { id: teacherId }, select: { role: true } })
  return t?.role === 'админ'
}

/** Учитель имеет доступ к классу? Админ — всегда да. */
export async function teacherHasClass(teacherId: number, classId: number): Promise<boolean> {
  if (await isAdmin(teacherId)) return true
  const link = await db.teacherClass.findUnique({
    where: { teacherId_classId: { teacherId, classId } },
  })
  return !!link
}

/** Учитель ведёт предмет? Админ — всегда да. */
export async function teacherHasSubject(teacherId: number, subjectId: number): Promise<boolean> {
  if (await isAdmin(teacherId)) return true
  const link = await db.teacherSubject.findUnique({
    where: { teacherId_subjectId: { teacherId, subjectId } },
  })
  return !!link
}

/**
 * Доступ к классу для НЕакадемических разделов (воспитание, рекомендации).
 * Разрешает если: админ, есть TeacherClass на класс, ИЛИ учитель ответственен
 * за класс (ResponsibleEducator). Для академических оценок (lessons/grades)
 * НЕ используется — там только teacherHasClass (бизнес-правило 12).
 */
export async function hasClassAccess(teacherId: number, classId: number): Promise<boolean> {
  if (await isAdmin(teacherId)) return true
  const [tc, re] = await Promise.all([
    db.teacherClass.findUnique({ where: { teacherId_classId: { teacherId, classId } } }),
    db.responsibleEducator.findUnique({ where: { teacherId_classId: { teacherId, classId } } }),
  ])
  return !!tc || !!re
}

/** Проверка пары класс+предмет одним вызовом (для lessons/grades). Кидает 403. */
export async function requireClassAndSubject(
  teacherId: number,
  classId: number,
  subjectId: number,
): Promise<void> {
  const [hasClass, hasSubject] = await Promise.all([
    teacherHasClass(teacherId, classId),
    teacherHasSubject(teacherId, subjectId),
  ])
  if (!hasClass || !hasSubject) throw new ApiError(403, 'Нет доступа к классу или предмету')
}

/** Урок принадлежит классу/предмету, доступным учителю? */
export async function requireLessonAccess(teacherId: number, lessonId: number): Promise<void> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { classId: true, subjectId: true },
  })
  if (!lesson) throw new ApiError(404, 'Урок не найден')
  await requireClassAndSubject(teacherId, lesson.classId, lesson.subjectId)
}

export async function getTeacherClasses(teacherId: number) {
  if (await isAdmin(teacherId)) return db.class.findMany({ orderBy: { name: 'asc' } })
  return db.class.findMany({
    where: { teachers: { some: { teacherId } } },
    orderBy: { name: 'asc' },
  })
}

export async function getTeacherSubjects(teacherId: number) {
  if (await isAdmin(teacherId)) return db.subject.findMany({ orderBy: { name: 'asc' } })
  return db.subject.findMany({
    where: { teachers: { some: { teacherId } } },
    orderBy: { name: 'asc' },
  })
}

/** Поиск кандидатов для логина. НЕ возвращает хеши. Лимит 10 против перебора. */
export async function findTeachersByLastName(lastName: string) {
  const q = lastName.trim().charAt(0).toUpperCase() + lastName.trim().slice(1).toLowerCase()
  if (!q) return []
  return db.teacher.findMany({
    where: { lastName: { startsWith: q } },
    select: { id: true, lastName: true, firstName: true, fullName: true, role: true },
    orderBy: { lastName: 'asc' },
    take: 10,
  })
}

export async function logAction(
  teacherId: number,
  action: string,
  description: string,
  ip = '',
): Promise<void> {
  try {
    await db.actionLog.create({ data: { teacherId, action, description, ip } })
  } catch {
    // silent
  }
}
