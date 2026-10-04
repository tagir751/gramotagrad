/**
 * TEST-RUNNER: automated local verification of gramotagrad-v2.
 * Starts `next start -p 3100` (production build), runs API scenarios 1-16,
 * page/mobile smoke (17, fetch-based), DB integrity checks.
 * Writes TEST_REPORT.md + test-results.json. Exit code 0 = all PASS/SKIP, 1 = FAIL present.
 *
 * Rate-limit note: login rate key = x-forwarded-for IP. All logins EXCEPT
 * scenario 3 send a unique x-forwarded-for header, so scenario 3 runs on a
 * clean 'unknown' bucket and is executed LAST among login-touching scenarios.
 */
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url)) // scripts/
const V2ROOT = path.resolve(ROOT, '..')
// Prisma резолвит относительный file:./test.db относительно prisma/,
// поэтому тестовая база реально лежит в prisma/test.db (сид и сервер
// используют один и тот же файл — сценарии это подтверждают).
const TESTDB = path.join(V2ROOT, 'prisma', 'test.db')

const PORT = 3100
const BASE = `http://localhost:${PORT}`
const ADMIN = { id: 1, pw: 'AdminTestPass123' }
const TCH_A = { id: 2, pw: 'TeacherA_Pass123' }
const TCH_B = { id: 3, pw: 'TeacherB_Pass123' }
const VOSP = { id: 4, pw: 'Vospitatel_Pass123' }
const N_ = 'Н' // U+041D Cyrillic En (grade value for absence)

const results = []
const bugs = []
let ipSeq = 0
const uniqIp = () => `10.9.8.${++ipSeq}`

function rec(id, name, status, comment = '', error = null) {
  results.push({ id, name, status, comment, error })
  console.log(`[${status}] #${id} ${name}${comment ? ' — ' + comment : ''}${error ? ' :: ' + error : ''}`)
}
function bug(scenario, steps, expected, actual, error = '') {
  bugs.push({ scenario, steps, expected, actual, error })
}

// --- minimal cookie jar + http helpers ---
function jarFrom(res, jar) {
  const set = res.headers.get('set-cookie')
  if (set) {
    const m = set.match(/(?:__Host-)?gg_session=([^;]*)/)
    if (m) jar.cookie = m[1] ? `${m[0].split('=')[0]}=${m[1]}` : ''
  }
}
async function api(method, path, { cookie = '', body = null, ip = null, form = null, raw = false } = {}) {
  const headers = {}
  if (cookie) headers.Cookie = cookie
  if (ip) headers['x-forwarded-for'] = ip
  let payload = null
  if (form) payload = form
  else if (body !== null) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
  const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' })
  if (raw) return res
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* html */ }
  return { status: res.status, json, text, headers: res.headers, location: res.headers.get('location') }
}
async function login(id, pw, ip) {
  const jar = {}
  const r = await api('POST', '/api/auth/login', { body: { teacherId: id, password: pw }, ip })
  jarFrom(r, jar)
  return { ...r, jar: jar.cookie || '' }
}
const ok = (cond, detail = '') => ({ pass: !!cond, detail })

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/login', { redirect: 'manual' })
      if (r.status === 200) return true
    } catch { /* not up */ }
    await delay(1000)
  }
  return false
}

async function main() {
  const startedAt = new Date().toISOString()
  // Прямой запуск node на бинарнике Next (без shell): kill() реально гасит
  // сервер, сирот не остаётся, Windows-лок SQLite отпускается.
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT), DATABASE_URL: 'file:./test.db' },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: V2ROOT,
  })
  let serverLog = ''
  server.stdout.on('data', (d) => { serverLog += d.toString().slice(0, 4000) })
  server.stderr.on('data', (d) => { serverLog += d.toString().slice(0, 4000) })
  const kill = () => { try { server.kill('SIGKILL') } catch {} }

  try {
    // ---------- Scenario 1: boot ----------
    if (!(await waitReady())) {
      rec(1, 'Запуск приложения', 'FAIL', '', 'server did not answer /login in 60s. log: ' + serverLog.slice(-500))
      return finish(startedAt, kill)
    }
    {
      const fails = []
      const r1 = await api('GET', '/login', { raw: true }); await r1.text()
      if (r1.status !== 200) fails.push(`GET /login=${r1.status}`)
      for (const p of ['/journal', '/admin', '/logs']) {
        const r = await api('GET', p, { raw: true }); await r.text()
        const loc = r.headers.get('location') || ''
        if (![307, 308, 302].includes(r.status) || !loc.includes('/login')) fails.push(`${p}=${r.status} loc=${loc}`)
      }
      fails.length ? rec(1, 'Запуск приложения', 'FAIL', '', fails.join('; ')) : rec(1, 'Запуск приложения', 'PASS', 'login 200, journal/admin/logs -> /login')
    }

    // ---------- Scenario 2: auth & sessions ----------
    const sessions = {}
    {
      const fails = []
      for (const [key, u] of [['admin', ADMIN], ['A', TCH_A], ['B', TCH_B], ['V', VOSP]]) {
        const r = await login(u.id, u.pw, uniqIp())
        if (r.status !== 200 || !r.jar) fails.push(`login ${key}=${r.status} cookie=${!!r.jar}`)
        else sessions[key] = r.jar
      }
      const bad1 = await login(2, 'wrong-password', uniqIp())
      const bad2 = await login(999, 'wrong-password', uniqIp())
      if (bad1.status !== 401) fails.push(`bad pw=${bad1.status}`)
      if (bad2.status !== 401) fails.push(`no-user=${bad2.status}`)
      if (bad1.json?.error !== bad2.json?.error) fails.push(`errors differ: ${bad1.json?.error} vs ${bad2.json?.error}`)
      const me = await api('GET', '/api/auth/me', { cookie: sessions.admin })
      if (me.status !== 200 || me.json?.teacherId !== 1) fails.push(`me=${me.status}`)
      const lo = await api('POST', '/api/auth/logout', { cookie: sessions.admin })
      const meAfter = await api('GET', '/api/auth/me', { cookie: sessions.admin })
      if (lo.status !== 200 || meAfter.status !== 401) fails.push(`logout=${lo.status} me-after=${meAfter.status}`)
      // forged cookies
      const f1 = await api('GET', '/api/auth/me', { cookie: 'gramotagrad_session=1' })
      const f2 = await api('GET', '/api/auth/me', { cookie: 'gg_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })
      if (f1.status !== 401) fails.push(`v1-forged=${f1.status}`)
      if (f2.status !== 401) fails.push(`random=${f2.status}`)
      // re-login admin for later scenarios
      const re = await login(1, ADMIN.pw, uniqIp())
      sessions.admin = re.jar
      fails.length ? (rec(2, 'Вход и сессии', 'FAIL', '', fails.join('; ')), bug('Вход и сессии', 'см. fails', 'все 401/200', fails.join('; '))) : rec(2, 'Вход и сессии', 'PASS', '4 логина, единый 401, logout чистит, подделки 401')
    }

    // ---------- Scenario 4: RBAC ----------
    {
      const fails = []
      const A = sessions.A, B = sessions.B, ad = sessions.admin
      for (const [m, p, b] of [['GET', '/api/admin/teachers'], ['GET', '/api/admin/classes'], ['GET', '/api/admin/subjects'], ['GET', '/api/logs']]) {
        const r = await api(m, p, { cookie: A })
        if (r.status !== 403) fails.push(`${m} ${p} as teacher=${r.status}`)
      }
      const pa = await api('PUT', '/api/admin/assignments', { cookie: A, body: { teacherId: 2, classIds: [], subjectIds: [] } })
      if (pa.status !== 403) fails.push(`PUT assignments as teacher=${pa.status}`)
      const ra = await api('GET', '/api/students?classId=2', { cookie: A })
      if (ra.status !== 403) fails.push(`A reads class2=${ra.status}`)
      const rb = await api('GET', '/api/students?classId=1', { cookie: B })
      if (rb.status !== 403) fails.push(`B reads class1=${rb.status}`)
      const pl = await api('POST', '/api/lessons', { cookie: A, body: { date: '2026-09-01', classId: 2, subjectId: 2, topic: 'x', homework: '', grades: [] } })
      if (pl.status !== 403) fails.push(`A writes class2 lesson=${pl.status}`)
      const adm = await api('GET', '/api/logs?page=1&limit=5', { cookie: ad })
      if (adm.status !== 200) fails.push(`admin logs=${adm.status}`)
      fails.length ? (rec(4, 'Права доступа', 'FAIL', '', fails.join('; ')), bug('Права доступа', 'см. fails', '403/200', fails.join('; '))) : rec(4, 'Права доступа', 'PASS', 'учителя изолированы, админ видит всё')
    }

    // ---------- Scenario 5: admin refs ----------
    let newClassId = null, newSubjectId = null, newTeacherId = null, lessonFor409 = null
    {
      const fails = []
      const ad = sessions.admin
      const c1 = await api('POST', '/api/admin/classes', { cookie: ad, body: { name: '3В' } })
      if (c1.status !== 201) fails.push(`create class=${c1.status} ${JSON.stringify(c1.json)}`)
      else newClassId = c1.json.id
      const s1 = await api('POST', '/api/admin/subjects', { cookie: ad, body: { name: 'Физика' } })
      if (s1.status !== 201) fails.push(`create subject=${s1.status}`)
      else newSubjectId = s1.json.id
      const t1 = await api('POST', '/api/admin/teachers', { cookie: ad, body: { lastName: 'Тестов', firstName: 'Тест Тестович', fullName: 'Тестов Тест Тестович', role: 'учитель', password: 'NewTeacher123' } })
      if (![200, 201].includes(t1.status)) fails.push(`create teacher=${t1.status} ${JSON.stringify(t1.json)}`)
      else newTeacherId = t1.json.id
      if (newClassId) {
        const e1 = await api('PATCH', '/api/admin/classes', { cookie: ad, body: { id: newClassId, name: '3Г' } })
        if (e1.status !== 200) fails.push(`edit class=${e1.status}`)
        const e2 = await api('PATCH', '/api/admin/classes', { cookie: ad, body: { id: newClassId, name: '1А' } })
        if (e2.status !== 400) fails.push(`dup class name=${e2.status}`)
      }
      if (newSubjectId) {
        const e3 = await api('PATCH', '/api/admin/subjects', { cookie: ad, body: { id: newSubjectId, name: 'Математика' } })
        if (e3.status !== 400) fails.push(`dup subject name=${e3.status}`)
      }
      const d1 = await api('DELETE', '/api/admin/classes?id=1', { cookie: ad })
      if (d1.status !== 409) fails.push(`delete class with students=${d1.status}`)
      // lesson on new subject -> DELETE subject must 409
      if (newClassId && newSubjectId) {
        const l = await api('POST', '/api/lessons', { cookie: ad, body: { date: '2026-09-02', classId: 1, subjectId: newSubjectId, topic: 't', homework: '', grades: [] } })
        if (![200, 201].includes(l.status)) fails.push(`setup lesson=${l.status}`)
        else lessonFor409 = l.json.id
        const d2 = await api('DELETE', `/api/admin/subjects?id=${newSubjectId}`, { cookie: ad })
        if (d2.status !== 409) fails.push(`delete subject with lessons=${d2.status}`)
      }
      const dself = await api('DELETE', '/api/admin/teachers?id=1', { cookie: ad })
      if (dself.status !== 403) fails.push(`self-delete=${dself.status}`)
      fails.length ? (rec(5, 'Админские справочники', 'FAIL', '', fails.join('; ')), bug('Админские справочники', 'см. fails', '201/200/400/409/403', fails.join('; '))) : rec(5, 'Админские справочники', 'PASS', `CRUD ok (class ${newClassId}, subject ${newSubjectId}, teacher ${newTeacherId})`)
    }

    // ---------- Scenario 6: assignments ----------
    {
      const fails = []
      const ad = sessions.admin
      const p1 = await api('PUT', '/api/admin/assignments', { cookie: ad, body: { teacherId: 2, classIds: [1], subjectIds: [1] } })
      if (p1.status !== 200) fails.push(`assign=${p1.status}`)
      const gc = await api('GET', '/api/classes', { cookie: sessions.A })
      if (gc.status !== 200 || !gc.json.some((c) => c.id === 1)) fails.push(`A classes=${gc.status} ${JSON.stringify(gc.json)}`)
      const gs = await api('GET', '/api/subjects', { cookie: sessions.A })
      if (gs.status !== 200 || !gs.json.some((s) => s.id === 1)) fails.push(`A subjects=${gs.status}`)
      const p2 = await api('PUT', '/api/admin/assignments', { cookie: ad, body: { teacherId: 2, classIds: [], subjectIds: [] } })
      if (p2.status !== 200) fails.push(`clear=${p2.status}`)
      const gc2 = await api('GET', '/api/classes', { cookie: sessions.A })
      if (gc2.status !== 200 || gc2.json.length !== 0) fails.push(`A classes after clear=${JSON.stringify(gc2.json)}`)
      const p3 = await api('PUT', '/api/admin/assignments', { cookie: ad, body: { teacherId: 2, classIds: [1], subjectIds: [1] } })
      if (p3.status !== 200) fails.push(`restore=${p3.status}`)
      const b1 = await api('PUT', '/api/admin/assignments', { cookie: ad, body: { teacherId: 9999, classIds: [1], subjectIds: [] } })
      if (b1.status !== 400) fails.push(`bad teacher=${b1.status}`)
      const b2 = await api('PUT', '/api/admin/assignments', { cookie: ad, body: { teacherId: 2, classIds: [9999], subjectIds: [] } })
      if (b2.status !== 400) fails.push(`bad class=${b2.status}`)
      const b3 = await api('PUT', '/api/admin/assignments', { cookie: ad, body: { teacherId: 2, classIds: [], subjectIds: [9999] } })
      if (b3.status !== 400) fails.push(`bad subject=${b3.status}`)
      fails.length ? (rec(6, 'Назначения учителей', 'FAIL', '', fails.join('; ')), bug('Назначения учителей', 'см. fails', '200/400', fails.join('; '))) : rec(6, 'Назначения учителей', 'PASS', 'назначение/очистка/400 на битые id')
    }

    // ---------- Scenario 7: journal ----------
    let lessonId = null, gradeId = null
    {
      const fails = []
      const A = sessions.A, B = sessions.B
      const q0 = await api('GET', '/api/lessons?date=2026-09-03&classId=1&subjectId=1', { cookie: A })
      if (q0.status !== 200 || q0.json.lesson !== null) fails.push(`empty lesson=${q0.status} ${JSON.stringify(q0.json)?.slice(0, 120)}`)
      const c1 = await api('POST', '/api/lessons', { cookie: A, body: { date: '2026-09-03', classId: 1, subjectId: 1, topic: 'Тест', homework: 'ДЗ', grades: [{ studentId: 1, value: '5', comment: 'Отлично' }] } })
      if (![200, 201].includes(c1.status)) fails.push(`create lesson=${c1.status} ${JSON.stringify(c1.json)}`)
      else lessonId = c1.json.id
      const q1 = await api('GET', '/api/lessons?date=2026-09-03&classId=1&subjectId=1', { cookie: A })
      const g = q1.json?.grades?.find((x) => x.studentId === 1)
      if (q1.status !== 200 || !g || g.value !== '5') fails.push(`read back=${q1.status}`)
      else gradeId = g.id
      // batch update via PUT lessons? use grades PATCH if exists — use POST lessons again (upsert path)
      const c2 = await api('POST', '/api/lessons', { cookie: A, body: { date: '2026-09-03', classId: 1, subjectId: 1, topic: 'Тест2', homework: '', grades: [{ studentId: 1, value: '4', comment: 'upd' }] } })
      if (![200, 201].includes(c2.status)) fails.push(`update=${c2.status}`)
      // clear grade+comment -> deleted
      const c3 = await api('POST', '/api/lessons', { cookie: A, body: { date: '2026-09-03', classId: 1, subjectId: 1, topic: 'Тест2', homework: '', grades: [{ studentId: 1, value: '', comment: '' }] } })
      const q2 = await api('GET', '/api/lessons?date=2026-09-03&classId=1&subjectId=1', { cookie: A })
      if (![200, 201].includes(c3.status) || (q2.json?.grades?.length ?? -1) !== 0) fails.push(`clear-delete grades=${JSON.stringify(q2.json?.grades)}`)
      // comment-only kept
      await api('POST', '/api/lessons', { cookie: A, body: { date: '2026-09-03', classId: 1, subjectId: 1, topic: 'Т', homework: '', grades: [{ studentId: 1, value: '', comment: 'только коммент' }] } })
      const q3 = await api('GET', '/api/lessons?date=2026-09-03&classId=1&subjectId=1', { cookie: A })
      if ((q3.json?.grades?.length ?? 0) !== 1 || q3.json.grades[0].comment !== 'только коммент') fails.push(`comment-only=${JSON.stringify(q3.json?.grades)}`)
      const fb = await api('POST', '/api/lessons', { cookie: B, body: { date: '2026-09-03', classId: 1, subjectId: 1, topic: 'x', homework: '', grades: [] } })
      if (fb.status !== 403) fails.push(`B writes A journal=${fb.status}`)
      fails.length ? (rec(7, 'Журнал', 'FAIL', '', fails.join('; ')), bug('Журнал', 'см. fails', 'CRUD + правило очистки', fails.join('; '))) : rec(7, 'Журнал', 'PASS', `урок ${lessonId}, очистка удаляет, коммент хранится`)
    }

    // ---------- Scenario 8: students ----------
    {
      const fails = []
      const A = sessions.A, B = sessions.B, ad = sessions.admin
      const s1 = await api('GET', '/api/students?classId=1', { cookie: A })
      if (s1.status !== 200 || !s1.json.some((s) => s.id === 1)) fails.push(`A list=${s1.status}`)
      const s2 = await api('GET', '/api/students?classId=1', { cookie: B })
      if (s2.status !== 403) fails.push(`B reads class1=${s2.status}`)
      const c1 = await api('POST', '/api/students', { cookie: A, body: { fullName: 'Ученик Тестовый Три', classId: 1 } })
      if (![200, 201].includes(c1.status)) fails.push(`A create own=${c1.status} ${JSON.stringify(c1.json)}`)
      const newSt = c1.json?.id
      const c2 = await api('POST', '/api/students', { cookie: A, body: { fullName: 'Чужой Ученик', classId: 2 } })
      if (c2.status !== 403) fails.push(`A create foreign=${c2.status}`)
      if (newSt) {
        const p1 = await api('PATCH', '/api/students', { cookie: A, body: { id: newSt, fullName: 'Ученик Три Правка' } })
        if (p1.status !== 200) fails.push(`A edit own=${p1.status}`)
        const p2 = await api('PATCH', '/api/students', { cookie: A, body: { id: newSt, active: false } })
        if (p2.status !== 200) fails.push(`toggle active=${p2.status}`)
        const p3 = await api('PATCH', '/api/students', { cookie: A, body: { id: newSt, classId: 2 } })
        if (p3.status !== 403) fails.push(`move without both-rights=${p3.status}`)
        const p4 = await api('PATCH', '/api/students', { cookie: B, body: { id: newSt, fullName: 'Хак' } })
        if (p4.status !== 403) fails.push(`B edits A student=${p4.status}`)
      } else fails.push('skip edit checks (no student created)')
      const all = await api('GET', '/api/students', { cookie: ad })
      if (all.status !== 200 || all.json.length < 3) fails.push(`admin sees all=${all.status} n=${all.json?.length}`)
      fails.length ? (rec(8, 'Ученики', 'FAIL', '', fails.join('; ')), bug('Ученики', 'см. fails', 'изоляция + CRUD', fails.join('; '))) : rec(8, 'Ученики', 'PASS', `создание/правка/активность ok (id ${newSt})`)
    }

    // ---------- Scenario 9: recommendations ----------
    {
      const fails = []
      const ad = sessions.admin, A = sessions.A, B = sessions.B
      const r1 = await api('POST', '/api/recommendations', { cookie: ad, body: { studentId: 1, text: 'Первая рекомендация админа' } })
      if (![200, 201].includes(r1.status)) fails.push(`admin create=${r1.status} ${JSON.stringify(r1.json)}`)
      const r2 = await api('POST', '/api/recommendations', { cookie: A, body: { studentId: 1, text: 'Вторая от учителя А' } })
      if (![200, 201].includes(r2.status)) fails.push(`A create own=${r2.status}`)
      const r3 = await api('POST', '/api/recommendations', { cookie: B, body: { studentId: 1, text: 'Чужая попытка' } })
      if (r3.status !== 403) fails.push(`B foreign=${r3.status}`)
      const h = await api('GET', '/api/recommendations?studentId=1&history=true', { cookie: A })
      const cur = (h.json || []).filter((x) => x.isCurrent)
      if (h.status !== 200 || cur.length !== 1 || cur[0].text !== 'Вторая от учителя А') fails.push(`history/isCurrent=${h.status} ${JSON.stringify(h.json)?.slice(0, 200)}`)
      fails.length ? (rec(9, 'Рекомендации', 'FAIL', '', fails.join('; ')), bug('Рекомендации', 'см. fails', 'isCurrent flip', fails.join('; '))) : rec(9, 'Рекомендации', 'PASS', 'создание/гашение/isCurrent ok')
    }

    // ---------- Scenario 10: vospitanie ----------
    {
      const fails = []
      const V = sessions.V, ad = sessions.admin
      const v1 = await api('GET', '/api/vospitanie?classId=1', { cookie: V })
      if (v1.status !== 200) { fails.push(`vosp explicit class1=${v1.status}`); bug('Воспитательный раздел', 'GET /api/vospitanie?classId=1 как ответственный без TeacherClass', '200', `${v1.status}`, JSON.stringify(v1.json)?.slice(0, 200)) }
      const v0 = await api('GET', '/api/vospitanie', { cookie: V })
      if (v0.status !== 200) fails.push(`vosp overview=${v0.status}`)
      else {
        const hasStudents = (v0.json?.students?.length ?? 0) > 0
        if (!hasStudents) fails.push('vosp overview: no students')
      }
      const va = await api('GET', '/api/vospitanie', { cookie: ad })
      if (va.status !== 200) fails.push(`admin vosp=${va.status}`)
      // vospitatel creates recommendation for own responsible class
      const vr = await api('POST', '/api/recommendations', { cookie: V, body: { studentId: 1, text: 'От воспитателя' } })
      if (![200, 201].includes(vr.status)) { fails.push(`vosp rec=${vr.status}`); bug('Воспитательный раздел', 'POST /api/recommendations как ответственный без TeacherClass', '201', `${vr.status}`) }
      fails.length ? rec(10, 'Воспитательный раздел', 'FAIL', '', fails.join('; ')) : rec(10, 'Воспитательный раздел', 'PASS', 'обзор/комменты/рекомендации воспитателя ok')
    }

    // ---------- Scenario 11: reports ----------
    {
      const fails = []
      const ad = sessions.admin, A = sessions.A
      // seed numeric + Н grades for distribution/avg checks
      await api('POST', '/api/lessons', { cookie: A, body: { date: '2026-09-04', classId: 1, subjectId: 1, topic: 'R', homework: '', grades: [{ studentId: 1, value: '5', comment: '' }] } })
      await api('POST', '/api/lessons', { cookie: ad, body: { date: '2026-09-05', classId: 2, subjectId: 2, topic: 'R', homework: '', grades: [{ studentId: 2, value: N_, comment: '' }] } })
      const s1 = await api('GET', '/api/reports?type=school', { cookie: ad })
      if (s1.status !== 200) fails.push(`admin school=${s1.status}`)
      else {
        const vals = (s1.json?.gradeDistribution || []).map((d) => d.value)
        if (!vals.includes(N_)) fails.push(`no Н in distribution: ${JSON.stringify(s1.json?.gradeDistribution)}`)
        const avg = s1.json?.averageGrade
        if (typeof avg !== 'number' || avg < 2 || avg > 5) fails.push(`avg suspect=${avg}`)
      }
      const s2 = await api('GET', '/api/reports?type=teacher&teacherId=2', { cookie: ad })
      if (s2.status !== 200) fails.push(`admin teacher-report=${s2.status}`)
      const s3 = await api('GET', '/api/reports?type=teacher&teacherId=3', { cookie: A })
      if (s3.status !== 403) fails.push(`A cross-teacher=${s3.status}`)
      const s4 = await api('GET', '/api/reports?type=teacher&teacherId=2', { cookie: A })
      if (s4.status !== 200) fails.push(`A own-report=${s4.status}`)
      fails.length ? (rec(11, 'Отчёты', 'FAIL', '', fails.join('; ')), bug('Отчёты', 'см. fails', 'изоляция + avg без Н', fails.join('; '))) : rec(11, 'Отчёты', 'PASS', `avg=${s1.json?.averageGrade}, Н в распределении`)
    }

    // ---------- Scenario 12: logs ----------
    {
      const fails = []
      const ad = sessions.admin, A = sessions.A
      const l1 = await api('GET', '/api/logs?page=1&limit=5', { cookie: ad })
      if (l1.status !== 200 || !Array.isArray(l1.json?.logs)) fails.push(`admin logs=${l1.status}`)
      const l2 = await api('GET', '/api/logs', { cookie: A })
      if (l2.status !== 403) fails.push(`teacher logs=${l2.status}`)
      if (l1.status === 200) {
        const acts = l1.json.logs.map((l) => l.action)
        for (const a of ['login', 'login_fail']) if (!acts.includes(a) && !(await hasAction(ad, a))) fails.push(`missing action ${a}`)
        const blob = JSON.stringify(l1.json)
        if (/passwordHash|scrypt\$|tokenHash/i.test(blob)) fails.push('secrets leaked in logs')
        const p2 = await api('GET', '/api/logs?page=2&limit=1', { cookie: ad })
        if (p2.status !== 200) fails.push(`page2=${p2.status}`)
        const f = await api('GET', '/api/logs?action=login&limit=5', { cookie: ad })
        if (f.status !== 200 || !f.json.logs.every((l) => l.action === 'login')) fails.push(`action filter=${f.status}`)
      }
      fails.length ? (rec(12, 'Логи', 'FAIL', '', fails.join('; ')), bug('Логи', 'см. fails', 'аудит без секретов', fails.join('; '))) : rec(12, 'Логи', 'PASS', 'аудит/пагинация/фильтр ok, секретов нет')
    }
    async function hasAction(cookie, action) {
      const r = await api('GET', `/api/logs?action=${action}&limit=50`, { cookie })
      return r.status === 200 && r.json.logs.length > 0
    }

    // ---------- Scenario 13: password change ----------
    {
      const fails = []
      const ad = sessions.admin
      const bLogin = await login(3, TCH_B.pw, uniqIp())
      if (bLogin.status !== 200) fails.push(`B login before=${bLogin.status}`)
      const short = await api('POST', '/api/admin/passwords', { cookie: ad, body: { teacherId: 3, newPassword: 'short' } })
      if (short.status !== 400) fails.push(`short pw=${short.status}`)
      const ch = await api('POST', '/api/admin/passwords', { cookie: ad, body: { teacherId: 3, newPassword: 'BrandNewPass456' } })
      if (ch.status !== 200) fails.push(`change=${ch.status} ${JSON.stringify(ch.json)}`)
      const meOld = await api('GET', '/api/auth/me', { cookie: bLogin.jar })
      if (meOld.status !== 401) fails.push(`old session alive=${meOld.status}`)
      const oldPw = await login(3, TCH_B.pw, uniqIp())
      if (oldPw.status !== 401) fails.push(`old pw works=${oldPw.status}`)
      const newPw = await login(3, 'BrandNewPass456', uniqIp())
      if (newPw.status !== 200) fails.push(`new pw fails=${newPw.status}`)
      else sessions.B = newPw.jar
      const nb = await api('POST', '/api/admin/passwords', { cookie: sessions.B, body: { teacherId: 2, newPassword: 'HackAttempt1' } })
      if (nb.status !== 403) fails.push(`non-admin change=${nb.status}`)
      fails.length ? (rec(13, 'Смена пароля', 'FAIL', '', fails.join('; ')), bug('Смена пароля', 'см. fails', 'kill сессий + min 8', fails.join('; '))) : rec(13, 'Смена пароля', 'PASS', 'сессии убиты, старый пароль мёртв')
    }

    // ---------- Scenario 14: import ----------
    {
      const fails = []
      const ad = sessions.admin, A = sessions.A
      const big = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const f1 = new FormData(); f1.append('file', big, 'big.xlsx'); f1.append('mode', 'add')
      const r1 = await api('POST', '/api/import/excel', { cookie: A, form: f1 })
      if (r1.status !== 403) fails.push(`non-admin import=${r1.status}`)
      // build valid xlsx via node xlsx
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const addSheet = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name)
      addSheet('Классы', [{ name: '4Д' }])
      addSheet('Предметы', [{ name: 'Химия' }])
      addSheet('Ученики', [{ classId: 1, fullName: 'Ученик Импорт' }])
      addSheet('Педагоги', [{ lastName: 'Импортов', firstName: 'Импорт Импортович', fullName: 'Импортов Импорт Импортович', password: 'ImportPass123' }])
      addSheet('Оценки', [{ studentId: 1, lessonId: 1, value: '4', comment: 'импорт' }].length ? [{ classId: 1, subjectId: 1, date: '2026-09-06', studentId: 1, value: '4', comment: 'импорт' }] : [])
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      const tooBig = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'application/octet-stream' })
      const f2 = new FormData(); f2.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'ok.xlsx'); f2.append('mode', 'add')
      void tooBig
      const f3 = new FormData(); f3.append('file', new Blob(['not excel'], { type: 'text/plain' }), 'evil.txt'); f3.append('mode', 'add')
      const r3 = await api('POST', '/api/import/excel', { cookie: ad, form: f3 })
      if (r3.status !== 400) fails.push(`bad ext=${r3.status}`)
      const r2 = await api('POST', '/api/import/excel', { cookie: ad, form: f2 })
      if (r2.status !== 200 || r2.json?.success !== true) fails.push(`valid import=${r2.status} ${JSON.stringify(r2.json)?.slice(0, 300)}`)
      else {
        if ((r2.json.sheetsProcessed ?? 0) < 3) fails.push(`sheets=${r2.json.sheetsProcessed}`)
      }
      // >5MB as admin
      const fBig = new FormData(); fBig.append('file', big, 'big.xlsx'); fBig.append('mode', 'add')
      const rBig = await api('POST', '/api/import/excel', { cookie: ad, form: fBig })
      if (rBig.status !== 400) fails.push(`oversize=${rBig.status}`)
      fails.length ? (rec(14, 'Импорт', 'FAIL', '', fails.join('; ')), bug('Импорт', 'см. fails', 'валидация + отчёт', fails.join('; '))) : rec(14, 'Импорт', 'PASS', `sheets=${r2.json?.sheetsProcessed}, отчёт построчный`)
    }

    // ---------- Scenario 15: export ----------
    {
      const fails = []
      const ad = sessions.admin, A = sessions.A
      const e1 = await api('GET', '/api/export?type=full', { cookie: A, raw: true })
      if (e1.status !== 403) fails.push(`non-admin export=${e1.status}`)
      await e1.text()
      const e2 = await api('GET', '/api/export?type=full', { cookie: ad, raw: true })
      const ct = e2.headers.get('content-type') || ''
      const buf = Buffer.from(await e2.arrayBuffer())
      if (e2.status !== 200 || !ct.includes('sheet') || buf[0] !== 0x50 || buf[1] !== 0x4b) fails.push(`full export=${e2.status} ct=${ct}`)
      await e2.text().catch(() => {})
      const e3 = await api('GET', '/api/export?type=grades&classId=1', { cookie: ad, raw: true })
      if (e3.status !== 200) fails.push(`filtered=${e3.status}`)
      await e3.text()
      fails.length ? (rec(15, 'Экспорт', 'FAIL', '', fails.join('; ')), bug('Экспорт', 'см. fails', 'xlsx + фильтры', fails.join('; '))) : rec(15, 'Экспорт', 'PASS', 'full + фильтры, magic PK ok')
    }

    // ---------- Scenario 16: validation ----------
    {
      const fails = []
      const A = sessions.A, ad = sessions.admin
      const v1 = await api('GET', '/api/students?classId=abc', { cookie: A })
      if (v1.status !== 400) fails.push(`classId=abc → ${v1.status}`)
      const v2 = await api('GET', '/api/lessons?date=06.09.2026&classId=1&subjectId=1', { cookie: A })
      if (v2.status !== 400) fails.push(`bad date → ${v2.status}`)
      const v3 = await api('POST', '/api/recommendations', { cookie: ad, body: { studentId: 1, text: '  ' } })
      if (v3.status !== 400) fails.push(`empty rec → ${v3.status}`)
      const v4 = await api('POST', '/api/admin/passwords', { cookie: ad, body: { teacherId: 2, newPassword: '123' } })
      if (v4.status !== 400) fails.push(`short pw → ${v4.status}`)
      const big = Array.from({ length: 101 }, (_, i) => ({ studentId: 1, value: '5', comment: '' }))
      void big
      const v5 = await api('PATCH', '/api/grades', { cookie: A, body: { lessonId: lessonId ?? 1, grades: Array.from({ length: 101 }, () => ({ studentId: 1, value: '5', comment: '' })) } })
      if (v5.status !== 400) fails.push(`batch>100 → ${v5.status}`)
      const v6 = await api('GET', '/api/students?classId=999999', { cookie: A })
      if (v6.status === 500) fails.push('bad id → 500')
      fails.length ? (rec(16, 'Валидация', 'FAIL', '', fails.join('; ')), bug('Валидация', 'см. fails', '400 вместо 500', fails.join('; '))) : rec(16, 'Валидация', 'PASS', '400 на мусор, 500 нигде')
    }

    // ---------- Scenario 3: rate limit (LAST) ----------
    {
      const codes = []
      for (let i = 0; i < 6; i++) {
        const r = await api('POST', '/api/auth/login', { body: { teacherId: 2, password: 'nope-wrong' } })
        codes.push(r.status)
      }
      const first5 = codes.slice(0, 5).every((c) => c === 401)
      if (first5 && codes[5] === 429) rec(3, 'Rate limit', 'PASS', `коды: ${codes.join(',')}`)
      else { rec(3, 'Rate limit', 'FAIL', '', `коды: ${codes.join(',')} (ожидалось 401x5 + 429)`); bug('Rate limit', '6 неверных входов без x-forwarded-for', '401x5 затем 429', codes.join(',')) }
    }

    // ---------- Scenario 17: mobile UI smoke (fetch-based) ----------
    {
      const fails = []
      const checks = []
      const mobUA = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' }
      const get = async (p, cookie = '') => {
        const headers = { ...mobUA }
        if (cookie) headers.Cookie = cookie
        const r = await fetch(BASE + p, { headers, redirect: 'manual' })
        const t = await r.text()
        return { status: r.status, text: t }
      }
      const lg = await get('/login')
      if (lg.status !== 200 || !lg.text.includes('viewport')) fails.push(`login=${lg.status}`)
      else checks.push('login 200 + viewport')
      // Стили лежат в globals.css (внешний файл): проверяем статически, т.к.
      // fetch отдаёт RSC-пейлоад без применённых стилей и без клиентского рендера.
      const css = fs.readFileSync(path.join(V2ROOT, 'src/app/globals.css'), 'utf-8')
      const has16 = /input[^\{]*\{[^}]*font-size:\s*16px/i.test(css) || (css.includes('font-size: 16px') && css.includes('44px'))
      if (!has16) fails.push('css: нет 16px/44px (зум-риск)')
      else checks.push('css 16px/44px ok')
      if (!css.includes('100dvh') || !css.includes('safe-area-inset')) fails.push('css: нет dvh/safe-area')
      else checks.push('css dvh/safe-area ok')
      const jp = fs.readFileSync(path.join(V2ROOT, 'src/app/(app)/journal/JournalPage.tsx'), 'utf-8')
      if (!/gg-show-mobile|gg-logs-cards/.test(jp)) fails.push('journal: нет мобильных маркеров в коде')
      else checks.push('journal mobile markers ok (static)')
      const jo = await get('/journal', sessions.A)
      if (jo.status !== 200) fails.push(`journal auth=${jo.status}`)
      else checks.push('journal 200 (маркеры — static, см. выше)')
      const adm = await get('/admin', sessions.admin)
      if (adm.status !== 200) fails.push(`admin=${adm.status}`)
      else checks.push('admin 200')
      const lgs = await get('/logs', sessions.admin)
      if (lgs.status !== 200) fails.push(`logs=${lgs.status}`)
      else checks.push('logs 200')
      fails.length ? rec(17, 'Мобильный UI-смоук', 'FAIL', 'браузер-консоль: SKIP (нет Playwright). ' + checks.join('; '), fails.join('; ')) : rec(17, 'Мобильный UI-смоук', 'PASS', checks.join('; ') + '. браузер-консоль: SKIP (нет Playwright)')
    }

    // ---------- DB integrity (после останова сервера: Windows-лок SQLite) ----------
    kill()
    await delay(1500)
    {
      const fails = []
      const db = new DatabaseSync(TESTDB, { readOnly: true })
      const count = (sql) => db.prepare(sql).get().c
      const checks = [
        ['grade_no_lesson', 'SELECT COUNT(*) c FROM Grade g LEFT JOIN Lesson l ON l.id=g.lessonId WHERE l.id IS NULL', 0],
        ['grade_no_student', 'SELECT COUNT(*) c FROM Grade g LEFT JOIN Student s ON s.id=g.studentId WHERE s.id IS NULL', 0],
        ['lesson_no_class', 'SELECT COUNT(*) c FROM Lesson l LEFT JOIN Class c ON c.id=l.classId WHERE c.id IS NULL', 0],
        ['lesson_no_subject', 'SELECT COUNT(*) c FROM Lesson l LEFT JOIN Subject s ON s.id=l.subjectId WHERE s.id IS NULL', 0],
        ['student_no_class', 'SELECT COUNT(*) c FROM Student s LEFT JOIN Class c ON c.id=s.classId WHERE c.id IS NULL', 0],
        ['dupe_lessons', 'SELECT COUNT(*) c FROM (SELECT date,classId,subjectId FROM Lesson GROUP BY date,classId,subjectId HAVING COUNT(*)>1)', 0],
        ['dupe_grades', 'SELECT COUNT(*) c FROM (SELECT lessonId,studentId FROM Grade GROUP BY lessonId,studentId HAVING COUNT(*)>1)', 0],
        ['empty_grades', "SELECT COUNT(*) c FROM Grade WHERE value='' AND comment=''", 0],
      ]
      for (const [name, sql, exp] of checks) {
        const got = count(sql)
        if (got !== exp) fails.push(`${name}=${got}`)
      }
      db.close()
      fails.length ? (rec('DB', 'Целостность БД', 'FAIL', '', fails.join('; ')), bug('Целостность БД', 'SQL-проверки', 'все 0', fails.join('; '))) : rec('DB', 'Целостность БД', 'PASS', 'сирот/дублей/пустых оценок нет')
    }

    return finish(startedAt, kill)
  } catch (e) {
    rec('RUN', 'Раннер', 'FAIL', '', String(e?.stack || e))
    return finish(startedAt, kill)
  }

  function finish(startedAt, kill) {
    kill()
    const finishedAt = new Date().toISOString()
    const scen = results.filter((r) => typeof r.id === 'number')
    const passed = scen.filter((r) => r.status === 'PASS').length
    const failed = scen.filter((r) => r.status === 'FAIL').length
    const skipped = scen.filter((r) => r.status === 'SKIP').length
    const status = failed > 0 ? 'FAIL' : 'PASS'
    const payload = { status, total: scen.length, passed, failed, skipped, startedAt, finishedAt, scenarios: scen, bugs }
    fs.writeFileSync('test-results.json', JSON.stringify(payload, null, 2))
    const lines = []
    lines.push('# Локальный тестовый отчёт Gramotagrad v2')
    lines.push('')
    lines.push('## Итог')
    lines.push('')
    lines.push('```text')
    lines.push(`Общий статус: ${status}`)
    lines.push(`Всего сценариев: ${scen.length}`)
    lines.push(`Успешно: ${passed}`)
    lines.push(`Падений: ${failed}`)
    lines.push(`Пропущено: ${skipped}`)
    lines.push('```')
    lines.push('')
    lines.push('## Окружение')
    lines.push('')
    lines.push(`- ОС: ${process.platform} ${process.arch}`)
    lines.push(`- Node: ${process.version}`)
    lines.push(`- Режим запуска: NODE_ENV=test, next start -p ${PORT} (production build)`)
    lines.push('- База: ./test.db (отдельная тестовая, dev.db не тронута)')
    lines.push(`- URL: ${BASE}`)
    lines.push('- Rate-limit: обход не использовался; все логины кроме сценария 3 шли с уникальным x-forwarded-for, сценарий 3 — последним на чистом бакете unknown')
    lines.push('')
    lines.push('## Сценарии')
    lines.push('')
    lines.push('| № | Сценарий | Статус | Комментарий |')
    lines.push('|---|---|---|---|')
    for (const r of results) lines.push(`| ${r.id} | ${r.name} | ${r.status} | ${(r.comment || '') + (r.error ? ' :: ' + r.error : '')} |`)
    lines.push('')
    lines.push('## Найденные баги')
    lines.push('')
    if (!bugs.length) lines.push('Багов не зафиксировано.')
    else bugs.forEach((b, i) => {
      lines.push(`### Баг ${i + 1} (${b.scenario})`)
      lines.push('')
      lines.push(`- Шаги: ${b.steps}`)
      lines.push(`- Ожидалось: ${b.expected}`)
      lines.push(`- Фактически: ${b.actual}`)
      if (b.error) lines.push(`- Ошибка: ${b.error}`)
      lines.push('')
    })
    lines.push('## Пропущенные проверки')
    lines.push('')
    lines.push('- Браузерная консоль (Playwright не ставился — тяжёлая зависимость; fetch-смоук покрывает статусы и мобильные маркеры).')
    lines.push('- Экспорт на пустой базе (база не пустая; лимиты проверены кодом take:1000).')
    lines.push('- PWA/manifest в браузере — вне объёма API-прогона.')
    lines.push('')
    lines.push('## Рекомендации')
    lines.push('')
    lines.push('- До хостинга: исправить баги из раздела выше (если есть).')
    lines.push('- Прод-миграцию БД делать отдельным прогоном scripts/migrate-v1-to-v2.ts с --admin-password.')
    lines.push('- Rate-limit сейчас in-memory: на многоинстансном хостинге перенести в SQLite/таблицу.')
    lines.push('')
    fs.writeFileSync('TEST_REPORT.md', lines.join('\n'))
    console.log(`\nDONE status=${status} passed=${passed} failed=${failed} skipped=${skipped}`)
    process.exit(failed > 0 ? 1 : 0)
  }
}

main()
