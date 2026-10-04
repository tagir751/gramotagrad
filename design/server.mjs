/**
 * Статический сервер для дизайн-стенда (design/index.html).
 *
 * Зачем он нужен: приложение целиком не поднимается в этой песочнице —
 * заблокирован binaries.prisma.sh, движок Prisma не скачивается, поэтому
 * любая страница падает на getSession(). Стенд обходит это: он отдаёт
 * статическую копию РАЗМЕТКИ экранов, но подключает НАСТОЯЩИЙ
 * src/app/globals.css. Значит правки стилей видны сразу и идут
 * в рабочий файл, а не в копию.
 *
 * Запуск: node design/server.mjs   (порт из PORT, по умолчанию 3000)
 * Зависимостей нет — только стандартная библиотека Node.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT ?? 3000)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (pathname === '/') pathname = '/design/index.html'
    // Next отдаёт содержимое public/ из корня — повторяем это для логотипов.
    if (pathname.startsWith('/brand/') || pathname.startsWith('/icons/')) {
      pathname = '/public' + pathname
    }

    const filePath = path.join(ROOT, path.normalize(pathname))
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden')
      return
    }

    const info = await stat(filePath).catch(() => null)
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Не найдено: ' + pathname)
      return
    }

    const body = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      // Стенд правится на ходу — кеш только мешает.
      'Cache-Control': 'no-store',
    }).end(body)
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Ошибка: ' + e.message)
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Дизайн-стенд Грамотаград: http://0.0.0.0:${PORT}`)
  console.log(`Корень: ${ROOT}`)
})
