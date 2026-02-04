/**
 * Импорт школ из data/schools_complete_ultimate_with_contacts.csv
 * в server/data/schools.json и schools_sandbox.json.
 * Объединяет по id: существующие данные (даты, активности, заметки) сохраняются,
 * из CSV подтягиваются название, район, адрес, сайт, время до МР, регион.
 *
 * Запуск: node scripts/import-complete-ultimate-schools.js
 *         node scripts/import-complete-ultimate-schools.js --dry-run
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DRY_RUN = process.argv.includes('--dry-run')

const CSV_PATH = path.join(__dirname, '../data/schools_complete_ultimate_with_contacts.csv')
const SERVER_DATA_DIR = path.join(__dirname, '../server/data')
const PRODUCTION_FILE = path.join(SERVER_DATA_DIR, 'schools.json')
const SANDBOX_FILE = path.join(SERVER_DATA_DIR, 'schools_sandbox.json')
const BACKUPS_DIR = path.join(SERVER_DATA_DIR, 'backups_import')

// Парсер CSV с разделителем ";"
function parseCsvLine(line) {
  const values = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ';' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())
  return values
}

function readCsv(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8')
  content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = content.split('\n').filter((line) => line.trim())
  const header = parseCsvLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    const row = {}
    header.forEach((h, idx) => {
      row[h] = values[idx] ?? ''
    })
    rows.push(row)
  }
  return { header, rows }
}

function inferRegion(address, district) {
  const a = (address || '').toLowerCase()
  const d = (district || '').toLowerCase()
  if (
    a.includes('московская область') ||
    d.includes('московская область') ||
    d.includes('городской округ') && d.includes('московская')
  ) {
    return 'Московская область'
  }
  return 'Москва'
}

function inferCity(address) {
  const a = (address || '').trim()
  const match = a.match(/\bг\.?\s*([^,]+)/i) || a.match(/\bгород\s+([^,]+)/i)
  if (match) {
    const city = match[1].trim()
    if (city.toLowerCase() !== 'москва') return city
  }
  return ''
}

function emptySchool() {
  return {
    id: '',
    name: '',
    district: '',
    region: 'Москва',
    city: '',
    address: '',
    website: '',
    uchiLink: '',
    travelTime: '',
    tags: [],
    amoLink: '',
    inWorkDate: null,
    contactDate: null,
    meetingScheduledDate: null,
    meetingHeldDate: null,
    eventScheduledDate: null,
    eventHeldDate: null,
    campusVisitPlannedDate: null,
    loadedToCRMDate: null,
    qualifiedLeadDate: null,
    arrivedToCampusDate: null,
    preliminaryMeetingDate: null,
    excursionPlannedDate: null,
    callStatus: null,
    callDate: null,
    callAttempts: 0,
    dialogueStatus: null,
    dialogueDate: null,
    dialogueNotes: '',
    callbackDate: null,
    meetingStatus: null,
    meetingDate: null,
    meetingNotes: '',
    eventStatus: null,
    eventDate: null,
    eventNotes: '',
    classesCount: 0,
    leadsCount: 0,
    campusVisitsCount: 0,
    notes: '',
    callsLink: '',
    activities: [],
  }
}

function csvRowToSchool(row) {
  const id = (row['ID_школы'] || '').trim()
  const name = (row['Название_школы'] || '').trim()
  if (!id || !name) return null

  const district = (row['Район'] || '').trim()
  const address = (row['Адрес'] || '').trim()
  const website = (row['Сайт'] || '').trim()
  const travelTime = (row['Время_до_Марьина_Роща'] || '').trim()
  const region = inferRegion(address, district)
  const city = inferCity(address)

  const school = emptySchool()
  school.id = id
  school.name = name
  school.district = district
  school.region = region
  school.city = city
  school.address = address
  school.website = website
  school.travelTime = travelTime
  return school
}

function mergeSchool(existing, fromCsv) {
  const merged = { ...fromCsv }
  merged.inWorkDate = existing.inWorkDate ?? null
  merged.contactDate = existing.contactDate ?? null
  merged.meetingScheduledDate = existing.meetingScheduledDate ?? null
  merged.meetingHeldDate = existing.meetingHeldDate ?? null
  merged.eventScheduledDate = existing.eventScheduledDate ?? null
  merged.eventHeldDate = existing.eventHeldDate ?? null
  merged.campusVisitPlannedDate = existing.campusVisitPlannedDate ?? null
  merged.loadedToCRMDate = existing.loadedToCRMDate ?? null
  merged.qualifiedLeadDate = existing.qualifiedLeadDate ?? null
  merged.arrivedToCampusDate = existing.arrivedToCampusDate ?? null
  merged.preliminaryMeetingDate = existing.preliminaryMeetingDate ?? null
  merged.excursionPlannedDate = existing.excursionPlannedDate ?? null
  merged.callStatus = existing.callStatus ?? null
  merged.callDate = existing.callDate ?? null
  merged.callAttempts = existing.callAttempts ?? 0
  merged.dialogueStatus = existing.dialogueStatus ?? null
  merged.dialogueDate = existing.dialogueDate ?? null
  merged.dialogueNotes = existing.dialogueNotes ?? ''
  merged.callbackDate = existing.callbackDate ?? null
  merged.meetingStatus = existing.meetingStatus ?? null
  merged.meetingDate = existing.meetingDate ?? null
  merged.meetingNotes = existing.meetingNotes ?? ''
  merged.eventStatus = existing.eventStatus ?? null
  merged.eventDate = existing.eventDate ?? null
  merged.eventNotes = existing.eventNotes ?? ''
  merged.classesCount = existing.classesCount ?? 0
  merged.leadsCount = existing.leadsCount ?? 0
  merged.campusVisitsCount = existing.campusVisitsCount ?? 0
  merged.notes = existing.notes ?? ''
  merged.amoLink = existing.amoLink ?? ''
  merged.callsLink = existing.callsLink ?? ''
  merged.activities = Array.isArray(existing.activities) ? existing.activities : []
  merged.tags = Array.isArray(existing.tags) ? existing.tags : []
  merged.uchiLink = existing.uchiLink ?? ''
  return merged
}

// --------------- main ---------------

console.log('='.repeat(60))
console.log('Import: schools_complete_ultimate_with_contacts.csv → server')
console.log('='.repeat(60))
if (DRY_RUN) {
  console.log('🔍 DRY-RUN: файлы не изменяются\n')
}

if (!fs.existsSync(CSV_PATH)) {
  console.error('Файл не найден:', CSV_PATH)
  process.exit(1)
}

console.log('📄 Чтение CSV...')
const { rows } = readCsv(CSV_PATH)
const csvSchools = new Map()
for (const row of rows) {
  const school = csvRowToSchool(row)
  if (school) csvSchools.set(school.id, school)
}
console.log(`   Строк в CSV: ${rows.length}, школ (уникальных id): ${csvSchools.size}`)

let productionSchools = []
let sandboxSchools = []
if (fs.existsSync(PRODUCTION_FILE)) {
  productionSchools = JSON.parse(fs.readFileSync(PRODUCTION_FILE, 'utf-8'))
  console.log(`   server/data/schools.json: ${productionSchools.length} школ`)
} else {
  console.log('   server/data/schools.json: нет, будет создан')
}
if (fs.existsSync(SANDBOX_FILE)) {
  sandboxSchools = JSON.parse(fs.readFileSync(SANDBOX_FILE, 'utf-8'))
  console.log(`   server/data/schools_sandbox.json: ${sandboxSchools.length} школ`)
} else {
  console.log('   server/data/schools_sandbox.json: нет, будет создан')
}

const prodById = new Map(productionSchools.map((s) => [s.id, s]))
const sandboxById = new Map(sandboxSchools.map((s) => [s.id, s]))

const mergedProduction = []
const mergedSandbox = []
for (const [id, csvSchool] of csvSchools) {
  const prodSchool = mergeSchool(prodById.get(id) || csvSchool, csvSchool)
  const sandSchool = mergeSchool(sandboxById.get(id) || csvSchool, csvSchool)
  mergedProduction.push(prodSchool)
  mergedSandbox.push(sandSchool)
}

const addedProd = mergedProduction.length - productionSchools.length
const addedSand = mergedSandbox.length - sandboxSchools.length
console.log(`\n📊 Итого после слияния: production ${mergedProduction.length} школ (добавлено/обновлено из CSV: +${addedProd}), sandbox ${mergedSandbox.length} (+${addedSand})`)

if (!DRY_RUN) {
  if (!fs.existsSync(SERVER_DATA_DIR)) {
    fs.mkdirSync(SERVER_DATA_DIR, { recursive: true })
  }
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true })
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  if (productionSchools.length > 0) {
    fs.writeFileSync(
      path.join(BACKUPS_DIR, `schools_before_ultimate_${ts}.json`),
      JSON.stringify(productionSchools, null, 2),
      'utf-8'
    )
  }
  if (sandboxSchools.length > 0) {
    fs.writeFileSync(
      path.join(BACKUPS_DIR, `schools_sandbox_before_ultimate_${ts}.json`),
      JSON.stringify(sandboxSchools, null, 2),
      'utf-8'
    )
  }

  fs.writeFileSync(PRODUCTION_FILE, JSON.stringify(mergedProduction, null, 2), 'utf-8')
  fs.writeFileSync(SANDBOX_FILE, JSON.stringify(mergedSandbox, null, 2), 'utf-8')
  console.log('\n✅ Записано: server/data/schools.json и server/data/schools_sandbox.json')
  console.log('   Бэкапы в server/data/backups_import/')
} else {
  console.log('\n🔍 DRY-RUN: для записи запустите без --dry-run')
}

console.log('\nДля продакшена (MongoDB) после импорта выполните: npm run migrate:mongodb')
