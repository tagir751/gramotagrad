// Создание первого админа на пустой базе (Beget: пустая БД после `prisma db push`).
// Использование: ADMIN_PW='...' [ADMIN_NAME='...'] node scripts/create-admin.mjs
// Пароль вводится на сервере вручную, в git/чат не попадает.
import { PrismaClient } from '@prisma/client'
import { randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)

const pw = process.env.ADMIN_PW
if (!pw || pw.length < 8) {
  console.error('ERROR: задай ADMIN_PW (минимум 8 символов)')
  process.exit(1)
}
const fullName = process.env.ADMIN_NAME || 'Администратор'

const db = new PrismaClient()
const existing = await db.teacher.findFirst({ where: { role: 'админ' }, select: { id: true, fullName: true } })
if (existing) {
  console.log(`OK: админ уже есть — id=${existing.id}, ${existing.fullName}`)
  await db.$disconnect()
  process.exit(0)
}

// Тот же формат, что src/lib/password.ts: scrypt$16384$8$1$salt$hash
const salt = randomBytes(16)
const derived = await scryptAsync(pw, salt, 64, { N: 16384, r: 8, p: 1 })
const passwordHash = `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`

const admin = await db.teacher.create({
  data: { lastName: fullName, firstName: '-', fullName, passwordHash, role: 'админ' },
})
console.log(`OK: админ создан — id=${admin.id}, ${admin.fullName} (логин — числовой ID)`)
await db.$disconnect()
