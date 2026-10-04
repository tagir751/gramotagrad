import { PrismaClient } from '@prisma/client'
import { randomBytes, scrypt as _scrypt } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(_scrypt)
async function hashPassword(password) {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`
}

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding test database...')

  // Clean up existing data (respecting foreign keys order)
  await prisma.grade.deleteMany()
  await prisma.lesson.deleteMany()
  await prisma.recommendation.deleteMany()
  await prisma.actionLog.deleteMany()
  await prisma.responsibleEducator.deleteMany()
  await prisma.teacherClass.deleteMany()
  await prisma.teacherSubject.deleteMany()
  await prisma.teacherState.deleteMany()
  await prisma.session.deleteMany()
  await prisma.student.deleteMany()
  await prisma.teacher.deleteMany()
  await prisma.class.deleteMany()
  await prisma.subject.deleteMany()

  // Hash passwords
  const adminPass = await hashPassword('AdminTestPass123')
  const teacherAPass = await hashPassword('TeacherA_Pass123')
  const teacherBPass = await hashPassword('TeacherB_Pass123')
  const vospitatelPass = await hashPassword('Vospitatel_Pass123')

  // Create teachers
  const admin = await prisma.teacher.create({
    data: {
      id: 1,
      lastName: 'Админ',
      firstName: 'Тестовый',
      fullName: 'Админ Тестовый',
      passwordHash: adminPass,
      role: 'админ',
      isVospitatel: false,
    }
  })

  const teacherA = await prisma.teacher.create({
    data: {
      id: 2,
      lastName: 'Иванова',
      firstName: 'Анна Петровна',
      fullName: 'Иванова Анна Петровна',
      passwordHash: teacherAPass,
      role: 'учитель',
      isVospitatel: false,
    }
  })

  const teacherB = await prisma.teacher.create({
    data: {
      id: 3,
      lastName: 'Петров',
      firstName: 'Сергей Иванович',
      fullName: 'Петров Сергей Иванович',
      passwordHash: teacherBPass,
      role: 'учитель',
      isVospitatel: false,
    }
  })

  const vospitatel = await prisma.teacher.create({
    data: {
      id: 4,
      lastName: 'Сидорова',
      firstName: 'Ольга Ивановна',
      fullName: 'Сидорова Ольга Ивановна',
      passwordHash: vospitatelPass,
      role: 'учитель',
      isVospitatel: true,
    }
  })

  // Create classes
  const class1A = await prisma.class.create({
    data: { id: 1, name: '1А' }
  })

  const class2B = await prisma.class.create({
    data: { id: 2, name: '2Б' }
  })

  // Create subjects
  const math = await prisma.subject.create({
    data: { id: 1, name: 'Математика' }
  })

  const russian = await prisma.subject.create({
    data: { id: 2, name: 'Русский язык' }
  })

  // Create students
  const student1 = await prisma.student.create({
    data: {
      id: 1,
      fullName: 'Ученик Один',
      classId: 1,
      active: true
    }
  })

  const student2 = await prisma.student.create({
    data: {
      id: 2,
      fullName: 'Ученик Два',
      classId: 2,
      active: true
    }
  })

  // Teacher assignments
  await prisma.teacherClass.createMany({
    data: [
      { teacherId: 2, classId: 1 }, // Teacher A -> 1А
      { teacherId: 3, classId: 2 }, // Teacher B -> 2Б
    ]
  })

  await prisma.teacherSubject.createMany({
    data: [
      { teacherId: 2, subjectId: 1 }, // Teacher A -> Математика
      { teacherId: 3, subjectId: 2 }, // Teacher B -> Русский язык
    ]
  })

  // Responsible educator
  await prisma.responsibleEducator.create({
    data: { teacherId: 4, classId: 1 } // Vospitatel -> 1А
  })

  // Teacher state
  await prisma.teacherState.createMany({
    data: [
      { teacherId: 1, lastClassId: 1, lastSubjectId: 1, lastDate: new Date().toISOString().slice(0, 10) },
      { teacherId: 2, lastClassId: 1, lastSubjectId: 1, lastDate: new Date().toISOString().slice(0, 10) },
      { teacherId: 3, lastClassId: 2, lastSubjectId: 2, lastDate: new Date().toISOString().slice(0, 10) },
      { teacherId: 4, lastClassId: 1, lastSubjectId: null, lastDate: new Date().toISOString().slice(0, 10) },
    ]
  })

  console.log('✅ Test database seeded successfully!')
  console.log('👤 Admin:', admin.fullName, '/ AdminTestPass123')
  console.log('👩 Teacher A:', teacherA.fullName, '/ TeacherA_Pass123')
  console.log('👨 Teacher B:', teacherB.fullName, '/ TeacherB_Pass123')
  console.log('👩 Vospitatel:', vospitatel.fullName, '/ Vospitatel_Pass123')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })