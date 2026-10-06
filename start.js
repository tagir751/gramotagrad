// Passenger entrypoint для Beget shared (зеркалит рабочий деплой Elif).
// Запуск: Passenger вызывает `node start.js`, тот грузит .env и поднимает
// standalone-сервер Next (server.js — копия .next/standalone/server.js).
// JWT НЕ требуется: сессии серверные, в БД.
const path = require('path')
const fs = require('fs')

const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i > 0) {
      const key = t.slice(0, i).trim()
      let val = t.slice(i + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  }
}

// Не перетираем PORT от Passenger.
if (!process.env.HOSTNAME || process.env.HOSTNAME === 'center.beget.ru') {
  process.env.HOSTNAME = '127.0.0.1'
}
if (!process.env.PORT) process.env.PORT = '3000'
process.env.NODE_ENV = process.env.NODE_ENV || 'production'

const serverPath = path.join(__dirname, 'server.js')
if (!fs.existsSync(serverPath)) {
  console.error('FATAL: server.js not found. Сначала: npm run build && cp .next/standalone/server.js ./server.js')
  process.exit(1)
}
for (const d of ['tmp', 'logs']) {
  const p = path.join(__dirname, d)
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

// server.js сам делает chdir(__dirname) — CWD станет корнем приложения,
// поэтому DATABASE_URL="file:../gramotagrad.db" укажет на ~/g.tagir75.ru/gramotagrad.db
require(serverPath)
