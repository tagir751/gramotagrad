import { z } from 'zod'

// Единый формат ошибок API v2: { error: string }
export const idSchema = z.coerce.number().int().positive()

export const loginStep1Schema = z.object({
  lastName: z.string().trim().min(2).max(50),
})

export const loginStep2Schema = z.object({
  teacherId: idSchema,
  password: z.string().min(1).max(200),
})

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть YYYY-MM-DD')

export const lessonUpsertSchema = z.object({
  classId: idSchema,
  subjectId: idSchema,
  date: dateSchema,
  topic: z.string().max(500).default(''),
  homework: z.string().max(2000).default(''),
})

export const GRADE_VALUES = ['5', '4', '3', '2', 'Н', ''] as const

export const gradeSaveSchema = z.object({
  lessonId: idSchema,
  studentId: idSchema,
  value: z.enum(GRADE_VALUES),
  comment: z.string().max(2000).default(''),
})

export const gradesBatchSchema = z.object({
  lessonId: idSchema,
  grades: z.array(
    z.object({
      studentId: idSchema,
      value: z.enum(GRADE_VALUES),
      comment: z.string().max(2000).default(''),
    }),
  ).max(100),
})

export const lessonQuerySchema = z.object({
  date: dateSchema,
  classId: idSchema,
  subjectId: idSchema,
})

export const lessonCreateSchema = lessonUpsertSchema.extend({
  grades: z
    .array(
      z.object({
        studentId: idSchema,
        value: z.enum(GRADE_VALUES),
        comment: z.string().max(2000).default(''),
      }),
    )
    .max(100)
    .default([]),
})

export const lessonUpdateSchema = z.object({
  id: idSchema,
  topic: z.string().max(500).optional(),
  homework: z.string().max(2000).optional(),
})

export const gradeUpdateSchema = z.object({
  id: idSchema,
  value: z.enum(GRADE_VALUES).optional(),
  comment: z.string().max(2000).optional(),
})
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const studentCreateSchema = z.object({
  fullName: z.string().trim().min(3).max(100),
  classId: idSchema,
})

export const studentUpdateSchema = z.object({
  id: idSchema,
  fullName: z.string().trim().min(3).max(100).optional(),
  classId: idSchema.optional(),
  active: z.boolean().optional(),
})

export const changePasswordSchema = z.object({
  teacherId: idSchema,
  newPassword: z.string().min(8).max(200),
})

/**
 * Назначения учителя: оба списки заменяют текущие целиком.
 * Пустые массивы — легально (снять все назначения).
 */
export const assignmentsSchema = z.object({
  teacherId: idSchema,
  classIds: z.array(idSchema).max(50).default([]),
  subjectIds: z.array(idSchema).max(50).default([]),
})

/**
 * Справочник классов: имя уникально, не пустое.
 */
export const classCreateSchema = z.object({
  name: z.string().trim().min(1).max(20),
})

export const classUpdateSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(20).optional(),
})

/**
 * Справочник предметов: имя уникально, не пустое.
 */
export const subjectCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
})

export const subjectUpdateSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(2).max(100).optional(),
})

/**
 * Учитель: ФИО, роль, флаг воспитателя, пароль (min 8) при создании.
 */
export const teacherCreateSchema = z.object({
  lastName: z.string().trim().min(2).max(50),
  firstName: z.string().trim().min(2).max(100),
  fullName: z.string().trim().min(3).max(150),
  role: z.enum(['админ', 'учитель']).default('учитель'),
  isVospitatel: z.boolean().default(false),
  password: z.string().min(8).max(200),
  classIds: z.array(idSchema).max(50).default([]),
  subjectIds: z.array(idSchema).max(50).default([]),
})

export const teacherUpdateSchema = z.object({
  id: idSchema,
  lastName: z.string().trim().min(2).max(50).optional(),
  firstName: z.string().trim().min(2).max(100).optional(),
  fullName: z.string().trim().min(3).max(150).optional(),
  role: z.enum(['админ', 'учитель']).optional(),
  isVospitatel: z.boolean().optional(),
  classIds: z.array(idSchema).max(50).optional(),
  subjectIds: z.array(idSchema).max(50).optional(),
})

/**
 * Ответственный воспитатель за класс: замена целиком.
 */
export const responsibleSchema = z.object({
  classId: idSchema,
  teacherId: idSchema.optional(), // null/undefined = снять
})

/**
 * Рекомендации: текст, studentId, isCurrent (гасит старые).
 */
export const recommendationCreateSchema = z.object({
  studentId: idSchema,
  text: z.string().trim().min(3).max(2000),
})

export const recommendationQuerySchema = z.object({
  studentId: idSchema.optional(),
  all: z.coerce.boolean().optional(),
  history: z.coerce.boolean().optional(),
})
