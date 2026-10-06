// CSV -> XLSX для загрузки в Грамотаград. Без зависимостей (node:zlib + ZIP вручную).
//
//   node scripts/csv-to-xlsx.mjs Рекомендации.csv [Ученики.csv ...] -o import.xlsx
//   node scripts/csv-to-xlsx.mjs Рекомендации.csv -o import.xlsx --check выгрузка.xlsx
//
// Имя листа берётся из имени файла: «Рекомендации.csv» -> лист «Рекомендации».
// Допустимы только: Ученики, Педагоги, Классы, Предметы, Оценки, Рекомендации.
// --check сверяет строки с выгрузкой и заранее показывает, что импорт отвергнет.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, extname } from 'node:path'
import zlib from 'node:zlib'

const SHEETS = ['Ученики', 'Педагоги', 'Классы', 'Предметы', 'Оценки', 'Рекомендации']
const GRADES = ['5', '4', '3', '2', 'Н']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function detectDelim(text) {
  const head = text.split(/\r?\n/)[0] ?? ''
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let q = false
  for (const ch of head) {
    if (ch === '"') q = !q
    else if (!q && ch in counts) counts[ch]++
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : ','
}

function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '')
  const d = detectDelim(text)
  const rows = []
  let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += c
    } else if (c === '"') q = true
    else if (c === d) { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== '')).map(r => r.map(c => c.trim()))
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

function colName(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26 } return s }

function sheetXml(rows) {
  const body = rows.map((r, ri) => {
    const cells = r.map((v, ci) =>
      v === '' ? '' : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
    ).join('')
    return `<row r="${ri + 1}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`
}

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c } return t })()
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0 }

function zip(files) {
  const chunks = [], central = []
  let offset = 0
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8')
    const comp = zlib.deflateRawSync(data, { level: 9 })
    const crc = crc32(data)
    const lf = Buffer.alloc(30)
    lf.writeUInt32LE(0x04034b50, 0); lf.writeUInt16LE(20, 4); lf.writeUInt16LE(0x0800, 6)
    lf.writeUInt16LE(8, 8); lf.writeUInt32LE(crc, 14)
    lf.writeUInt32LE(comp.length, 18); lf.writeUInt32LE(data.length, 22)
    lf.writeUInt16LE(nameBuf.length, 26)
    chunks.push(lf, nameBuf, comp)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(offset, 42)
    central.push(cd, nameBuf)
    offset += lf.length + nameBuf.length + comp.length
  }
  const cdBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...chunks, cdBuf, end])
}

function buildXlsx(sheets) {
  const f = (name, s) => ({ name, data: Buffer.from(s, 'utf8') })
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`
  return zip([
    f('[Content_Types].xml', ct),
    f('_rels/.rels', rootRels),
    f('xl/workbook.xml', wbXml),
    f('xl/_rels/workbook.xml.rels', wbRels),
    ...sheets.map((s, i) => f(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows))),
  ])
}

function readXlsx(path) {
  const buf = readFileSync(path)
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const cdOff = buf.readUInt32LE(eocd + 16)
  const count = buf.readUInt16LE(eocd + 8)
  const entries = {}
  let p = cdOff
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), cmtLen = buf.readUInt16LE(p + 32)
    const lho = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20)
    const lNameLen = buf.readUInt16LE(lho + 26), lExtra = buf.readUInt16LE(lho + 28)
    const start = lho + 30 + lNameLen + lExtra
    const raw = buf.subarray(start, start + csize)
    entries[name] = method === 0 ? raw : zlib.inflateRawSync(raw)
    p += 46 + nameLen + extraLen + cmtLen
  }
  const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  const wb = entries['xl/workbook.xml'].toString('utf8')
  const relMap = {}
  for (const m of entries['xl/_rels/workbook.xml.rels'].toString('utf8').matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2].replace(/^\//, '')
  let shared = []
  if (entries['xl/sharedStrings.xml']) {
    shared = [...entries['xl/sharedStrings.xml'].toString('utf8').matchAll(/<si>(.*?)<\/si>/gs)]
      .map(m => unesc([...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(x => x[1]).join('')))
  }
  const out = {}
  for (const m of wb.matchAll(/<sheet name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const name = unesc(m[1])
    let tgt = relMap[m[2]]; if (!tgt.startsWith('xl/')) tgt = 'xl/' + tgt
    const xml = entries[tgt]?.toString('utf8') ?? ''
    const rows = []
    for (const rm of xml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)) {
      const cells = []
      for (const cm of rm[1].matchAll(/<c\b([^>]*)>(.*?)<\/c>/gs)) {
        const t = cm[1].match(/\st="([^"]+)"/)?.[1]
        if (t === 'inlineStr') cells.push(unesc([...cm[2].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(x => x[1]).join('')))
        else { const v = cm[2].match(/<v>(.*?)<\/v>/s)?.[1] ?? ''; cells.push(t === 's' ? (shared[+v] ?? '') : unesc(v)) }
      }
      rows.push(cells)
    }
    out[name] = rows
  }
  return out
}

const argv = process.argv.slice(2)
let out = 'import.xlsx', check = null
const inputs = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '-o') out = argv[++i]
  else if (argv[i] === '--check') check = argv[++i]
  else inputs.push(argv[i])
}
if (!inputs.length) {
  console.error('Использование: node scripts/csv-to-xlsx.mjs Рекомендации.csv [...] -o import.xlsx [--check выгрузка.xlsx]')
  process.exit(1)
}

const sheets = []
for (const f of inputs) {
  if (!existsSync(f)) { console.error(`Файл не найден: ${f}`); process.exit(1) }
  const name = basename(f, extname(f))
  if (!SHEETS.includes(name)) console.error(`⚠ Лист «${name}» импортёр ПРОПУСТИТ. Допустимо: ${SHEETS.join(', ')}`)
  sheets.push({ name, rows: parseCSV(readFileSync(f, 'utf8')) })
}

if (check) {
  if (!existsSync(check)) { console.error(`Выгрузка не найдена: ${check}`); process.exit(1) }
  const ref = readXlsx(check)
  const idx = (sheet, cols) => {
    const rows = ref[sheet]; if (!rows?.length) return []
    const h = rows[0]
    return rows.slice(1).map(r => Object.fromEntries(cols.map(c => [c, r[h.indexOf(c)] ?? ''])))
  }
  const students = idx('Ученики', ['fullName', 'className'])
  const classes = new Set(idx('Классы', ['name']).map(c => c.name))
  const subjects = new Set(idx('Предметы', ['name']).map(s => s.name))
  const pairs = new Set(students.map(s => `${s.fullName}|||${s.className}`))

  console.log(`\nСправочники из выгрузки: ученики ${students.length}, классы ${classes.size}, предметы ${subjects.size}`)
  console.log('─'.repeat(64))
  let problems = 0
  for (const sh of sheets) {
    if (sh.rows.length < 2) { console.log(`${sh.name}: нет строк данных`); continue }
    const h = sh.rows[0]
    const col = (...names) => { for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i } return -1 }
    const iStud = col('Ученик', 'ФИО ученика', 'studentName')
    const iCls = col('Класс', 'className')
    const iSubj = col('Предмет', 'subjectName')
    const iDate = col('Дата', 'lessonDate')
    const iVal = col('Оценка', 'value')
    const iText = col('Текст', 'Рекомендация', 'text')
    const seen = new Map()
    sh.rows.slice(1).forEach((r, k) => {
      const line = k + 2
      const say = m => { console.log(`  ${sh.name} строка ${line}: ${m}`); problems++ }
      const stud = iStud >= 0 ? (r[iStud] ?? '') : ''
      const cls = iCls >= 0 ? (r[iCls] ?? '') : ''
      if (iStud >= 0 && iCls >= 0) {
        if (!stud || !cls) say('пустой Ученик или Класс')
        else if (!classes.has(cls)) say(`класса «${cls}» нет в базе`)
        else if (!pairs.has(`${stud}|||${cls}`)) say(`ученика «${stud}» нет в классе ${cls} (проверьте написание)`)
      }
      if (iSubj >= 0 && r[iSubj] && !subjects.has(r[iSubj])) say(`предмета «${r[iSubj]}» нет в базе`)
      if (iDate >= 0 && r[iDate] && !DATE_RE.test(r[iDate])) say(`дата «${r[iDate]}» не ГГГГ-ММ-ДД`)
      if (iVal >= 0 && r[iVal] && !GRADES.includes(r[iVal])) say(`оценка «${r[iVal]}» вне 5/4/3/2/Н`)
      if (sh.name === 'Рекомендации') {
        if (iText >= 0 && !(r[iText] ?? '').trim()) say('пустой Текст')
        const key = `${stud}|||${cls}`
        if (seen.has(key)) say(`повтор ученика (строка ${seen.get(key)}): останется только последняя рекомендация`)
        else seen.set(key, line)
      }
    })
  }
  console.log('─'.repeat(64))
  console.log(problems === 0 ? '✓ Проблем не найдено — файл примется целиком.' : `⚠ Проблемных строк: ${problems}. Импорт их пропустит.`)
}

writeFileSync(out, buildXlsx(sheets))
console.log(`\nГотово: ${out}`)
for (const s of sheets) console.log(`  лист «${s.name}» — ${Math.max(0, s.rows.length - 1)} строк данных`)
