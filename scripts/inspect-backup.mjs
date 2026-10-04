// Инспектор бэкапа: сверяет чужую SQLite-базу со схемой v2.
// ТОЛЬКО ЧТЕНИЕ: база открывается readonly, ни одной записи не делается.
//
//   node scripts/inspect-backup.mjs путь/к/backup.db
//
// Отвечает на три вопроса:
//   1. это база v2 (можно подключать как есть) или v1 (нужен мигратор)?
//   2. что совпадает со схемой, а что разошлось;
//   3. цела ли база: битые внешние ключи, дубли, формат паролей и дат.

import { DatabaseSync } from 'node:sqlite'
import { existsSync, statSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('Укажите путь: node scripts/inspect-backup.mjs backup.db')
  process.exit(1)
}
if (!existsSync(file)) {
  console.error(`Файл не найден: ${file}`)
  process.exit(1)
}

// Схема v2 — источник истины prisma/schema.prisma
const V2 = {
  Teacher: ['id', 'lastName', 'firstName', 'fullName', 'passwordHash', 'role', 'isVospitatel', 'createdAt', 'updatedAt'],
  Session: ['id', 'tokenHash', 'teacherId', 'expiresAt', 'ip', 'userAgent', 'createdAt'],
  Class: ['id', 'name', 'createdAt', 'updatedAt'],
  Subject: ['id', 'name', 'createdAt', 'updatedAt'],
  Student: ['id', 'fullName', 'active', 'createdAt', 'updatedAt', 'classId'],
  TeacherClass: ['teacherId', 'classId'],
  TeacherSubject: ['teacherId', 'subjectId'],
  Lesson: ['id', 'date', 'topic', 'homework', 'createdAt', 'updatedAt', 'classId', 'subjectId', 'teacherId'],
  Grade: ['id', 'value', 'comment', 'createdAt', 'updatedAt', 'lessonId', 'studentId', 'teacherId'],
  Recommendation: ['id', 'text', 'isCurrent', 'createdAt', 'updatedAt', 'studentId', 'authorId'],
  ResponsibleEducator: ['teacherId', 'classId'],
  ActionLog: ['id', 'timestamp', 'action', 'description', 'ip', 'teacherId'],
  TeacherState: ['id', 'lastClassId', 'lastSubjectId', 'lastDate', 'createdAt', 'updatedAt', 'teacherId'],
}
// Таблицы, которые читает scripts/migrate-v1-to-v2.ts
const MIGRATOR_READS = ['Teacher', 'Class', 'Subject', 'TeacherClass', 'TeacherSubject',
  'Student', 'Lesson', 'Grade', 'Recommendation', 'ActionLog']

const db = new DatabaseSync(file, { readOnly: true })
const line = (c = '─') => console.log(c.repeat(66))

console.log(`\nФайл:   ${file}`)
console.log(`Размер: ${(statSync(file).size / 1024 / 1024).toFixed(2)} МБ`)

const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' ORDER BY name"
).all().map(r => r.name)

if (tables.length === 0) {
  console.log('\n⚠ В базе нет таблиц — файл пустой или это не SQLite.')
  process.exit(1)
}

// ── 1. Совпадение со схемой ────────────────────────────────────────
line()
console.log('СОВПАДЕНИЕ СО СХЕМОЙ v2')
line()
console.log('таблица                 строк   статус')

const counts = {}
let missing = [], extra = [], colDiff = []

for (const t of Object.keys(V2)) {
  if (!tables.includes(t)) { missing.push(t); console.log(`${t.padEnd(22)}      —   ✗ НЕТ в бэкапе`); continue }
  const n = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c
  counts[t] = n
  const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name)
  const lack = V2[t].filter(c => !cols.includes(c))
  const plus = cols.filter(c => !V2[t].includes(c))
  let status = '✓ совпадает'
  if (lack.length) { status = `✗ нет колонок: ${lack.join(', ')}`; colDiff.push(t) }
  else if (plus.length) status = `+ лишние: ${plus.join(', ')}`
  console.log(`${t.padEnd(22)} ${String(n).padStart(6)}   ${status}`)
}
extra = tables.filter(t => !Object.keys(V2).includes(t))
if (extra.length) console.log(`\nТаблицы вне схемы v2: ${extra.join(', ')}`)

// ── 2. Вердикт: v1 или v2 ──────────────────────────────────────────
line()
console.log('ВЕРДИКТ')
line()

const hasSession = tables.includes('Session')
const hasRespEdu = tables.includes('ResponsibleEducator')
let hashKind = 'таблицы Teacher нет'
if (tables.includes('Teacher') && counts.Teacher > 0) {
  const cols = db.prepare('PRAGMA table_info("Teacher")').all().map(c => c.name)
  if (cols.includes('passwordHash')) {
    const rows = db.prepare('SELECT passwordHash h FROM Teacher LIMIT 200').all()
    const scrypt = rows.filter(r => String(r.h ?? '').startsWith('scrypt$')).length
    const legacy = rows.filter(r => String(r.h ?? '').startsWith('legacy_sha256$')).length
    const bare = rows.length - scrypt - legacy
    hashKind = `scrypt: ${scrypt}, legacy_sha256: ${legacy}, иной/sha256: ${bare}`
  } else hashKind = 'колонки passwordHash нет'
}
console.log(`Session:              ${hasSession ? 'есть' : 'НЕТ'}  (есть только в v2)`)
console.log(`ResponsibleEducator:  ${hasRespEdu ? 'есть' : 'НЕТ'}  (есть только в v2)`)
console.log(`Формат паролей:       ${hashKind}`)

const forMigrator = MIGRATOR_READS.filter(t => tables.includes(t))
let verdict
if (missing.length === 0 && colDiff.length === 0) {
  verdict = 'БАЗА v2. Миграция не нужна — файл подключается к приложению как есть.'
} else if (forMigrator.length >= 6) {
  verdict = `БАЗА v1 (или ранняя v2). Нужен scripts/migrate-v1-to-v2.ts.\n          Мигратор прочитает: ${forMigrator.join(', ')}.\n          Не хватает для v2: ${missing.join(', ') || '—'}`
} else {
  verdict = 'СТРУКТУРА НЕ ОПОЗНАНА. Таблицы не похожи ни на v1, ни на v2 — нужен ручной разбор.'
}
console.log(`\n→ ${verdict}`)

// ── 3. Целостность ────────────────────────────────────────────────
line()
console.log('ЦЕЛОСТНОСТЬ ДАННЫХ')
line()
const safe = (label, sql) => {
  try {
    const v = db.prepare(sql).get()
    const n = v ? Object.values(v)[0] : 0
    console.log(`${label.padEnd(44)} ${String(n).padStart(6)}  ${n ? '⚠' : '✓'}`)
    return n
  } catch { console.log(`${label.padEnd(44)}      —  (таблиц нет)`); return null }
}
safe('ученики без класса', 'SELECT COUNT(*) c FROM Student s LEFT JOIN Class c ON c.id=s.classId WHERE c.id IS NULL')
safe('уроки без класса', 'SELECT COUNT(*) c FROM Lesson l LEFT JOIN Class c ON c.id=l.classId WHERE c.id IS NULL')
safe('уроки без предмета', 'SELECT COUNT(*) c FROM Lesson l LEFT JOIN Subject s ON s.id=l.subjectId WHERE s.id IS NULL')
safe('уроки без учителя', 'SELECT COUNT(*) c FROM Lesson l LEFT JOIN Teacher t ON t.id=l.teacherId WHERE t.id IS NULL')
safe('оценки без урока', 'SELECT COUNT(*) c FROM Grade g LEFT JOIN Lesson l ON l.id=g.lessonId WHERE l.id IS NULL')
safe('оценки без ученика', 'SELECT COUNT(*) c FROM Grade g LEFT JOIN Student s ON s.id=g.studentId WHERE s.id IS NULL')
safe('дубли уроков (date,class,subject)',
  'SELECT COUNT(*) c FROM (SELECT date,classId,subjectId FROM Lesson GROUP BY date,classId,subjectId HAVING COUNT(*)>1)')

// даты и оценки
try {
  const bad = db.prepare("SELECT COUNT(*) c FROM Lesson WHERE date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'").get().c
  console.log(`${'даты не в формате ГГГГ-ММ-ДД'.padEnd(44)} ${String(bad).padStart(6)}  ${bad ? '⚠ мигратор нормализует' : '✓'}`)
  const r = db.prepare('SELECT MIN(date) a, MAX(date) b FROM Lesson').get()
  if (r?.a) console.log(`${'период журнала'.padEnd(44)} ${r.a} … ${r.b}`)
} catch {}
try {
  const vals = db.prepare('SELECT DISTINCT value v FROM Grade').all().map(r => String(r.v))
  const ok = new Set(['5', '4', '3', '2', 'Н', ''])
  const odd = vals.filter(v => !ok.has(v))
  console.log(`${'значения оценок'.padEnd(44)} ${vals.length} шт  ${odd.length ? '⚠ вне 5/4/3/2/Н: ' + odd.slice(0, 8).join(', ') : '✓'}`)
} catch {}

line()
console.log('Запись в файл не производилась.\n')
db.close()
