import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scrypt as _scrypt } from 'node:crypto'
import { promisify } from 'node:util'

const sa = promisify(_scrypt)
async function h(pw) {
  const s = randomBytes(16)
  const d = await sa(pw, s, 64, { N: 16384, r: 8, p: 1 })
  return 'scrypt$16384$8$1$' + s.toString('hex') + '$' + d.toString('hex')
}

const db = new DatabaseSync('./dev.db')
const rows = db.prepare('SELECT id, fullName, role FROM Teacher').all()
for (const r of rows) {
  const pw = r.role === 'админ' ? 'admin123' : 'teacher123'
  db.prepare('UPDATE Teacher SET passwordHash=? WHERE id=?').run(await h(pw), r.id)
  console.log(r.id + ' | ' + r.fullName + ' (' + r.role + ') -> ' + pw)
}
db.close()
console.log('OK')
