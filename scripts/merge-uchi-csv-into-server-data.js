import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===================== CONFIG =====================
const DRY_RUN = process.argv.includes('--dry-run');

const CSV_FILES = {
  dataForWork: path.join(__dirname, '../data/uchi_schools_data_for_work.csv'),
  moscow: path.join(__dirname, '../data/uchi_schools_Москва.csv'),
  moscowRegion: path.join(__dirname, '../data/uchi_schools_Московская_область.csv'),
};

const SERVER_DATA_DIR = path.join(__dirname, '../server/data');
const PRODUCTION_FILE = path.join(SERVER_DATA_DIR, 'schools.json');
const SANDBOX_FILE = path.join(SERVER_DATA_DIR, 'schools_sandbox.json');
const BACKUPS_IMPORT_DIR = path.join(SERVER_DATA_DIR, 'backups_import');

// ===================== CSV PARSER =====================
// Handles BOM, CRLF, quoted fields with semicolons inside
function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ';' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function readCsv(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  // Remove BOM if present
  content = content.replace(/^\uFEFF/, '');
  // Normalize line endings
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = content.split('\n').filter((line) => line.trim());
  const header = parseCsvLine(lines[0]);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    header.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }

  return { header, rows };
}

// ===================== SCHOOL OBJECT FACTORY =====================
function createSchoolObject(id, name, city, uchiLink, region) {
  return {
    id,
    name: name.replace(/^"|"$/g, ''), // Remove surrounding quotes if any
    district: '',
    region,
    city: city || '',
    address: '',
    website: '',
    uchiLink: uchiLink || '',
    travelTime: '',
    tags: ['неполная инфа'],
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
    activities: [],
  };
}

// ===================== MAIN LOGIC =====================
console.log('='.repeat(60));
console.log('Merge Uchi CSV into Server Data');
console.log('='.repeat(60));
if (DRY_RUN) {
  console.log('🔍 DRY-RUN MODE: No files will be modified\n');
} else {
  console.log('⚠️  WRITE MODE: Files will be modified\n');
}

// 1. Parse all CSV files and collect unique IDs + school data
const csvData = {
  dataForWork: { ids: new Set(), schools: new Map() },
  moscow: { ids: new Set(), schools: new Map() },
  moscowRegion: { ids: new Set(), schools: new Map() },
};

// Parse uchi_schools_data_for_work.csv
console.log('📄 Parsing uchi_schools_data_for_work.csv...');
const dataForWork = readCsv(CSV_FILES.dataForWork);
for (const row of dataForWork.rows) {
  const id = row['ID_школы'];
  const name = row['Название_школы'];
  if (!id || !name) continue;

  // Determine region based on Москва_или_МО column
  const moscowOrMO = (row['Москва_или_МО'] || '').toLowerCase();
  let region = 'Москва';
  if (moscowOrMO === 'мо' || moscowOrMO.includes('московская область') || moscowOrMO.includes('моск. обл')) {
    region = 'Московская область';
  }

  csvData.dataForWork.ids.add(id);
  if (!csvData.dataForWork.schools.has(id)) {
    csvData.dataForWork.schools.set(id, {
      id,
      name,
      city: row['Город'] || '',
      uchiLink: row['Ссылка_на_страницу'] || '',
      region,
    });
  }
}
console.log(`   Всего строк: ${dataForWork.rows.length}, уникальных ID: ${csvData.dataForWork.ids.size}`);

// Parse uchi_schools_Москва.csv
console.log('📄 Parsing uchi_schools_Москва.csv...');
const moscow = readCsv(CSV_FILES.moscow);
for (const row of moscow.rows) {
  const id = row['ID_школы'];
  const name = row['Название_школы'];
  if (!id || !name) continue;

  csvData.moscow.ids.add(id);
  if (!csvData.moscow.schools.has(id)) {
    csvData.moscow.schools.set(id, {
      id,
      name,
      city: row['Город'] || '',
      uchiLink: row['Ссылка_на_страницу'] || '',
      region: 'Москва',
    });
  }
}
console.log(`   Всего строк: ${moscow.rows.length}, уникальных ID: ${csvData.moscow.ids.size}`);

// Parse uchi_schools_Московская_область.csv
console.log('📄 Parsing uchi_schools_Московская_область.csv...');
const moscowRegion = readCsv(CSV_FILES.moscowRegion);
for (const row of moscowRegion.rows) {
  const id = row['ID_школы'];
  const name = row['Название_школы'];
  if (!id || !name) continue;

  csvData.moscowRegion.ids.add(id);
  if (!csvData.moscowRegion.schools.has(id)) {
    csvData.moscowRegion.schools.set(id, {
      id,
      name,
      city: row['Город'] || '',
      uchiLink: row['Ссылка_на_страницу'] || '',
      region: 'Московская область',
    });
  }
}
console.log(`   Всего строк: ${moscowRegion.rows.length}, уникальных ID: ${csvData.moscowRegion.ids.size}`);

// 2. Build union of all IDs and combined school data map
const unionIds = new Set([
  ...csvData.dataForWork.ids,
  ...csvData.moscow.ids,
  ...csvData.moscowRegion.ids,
]);

// Priority: moscowRegion > moscow > dataForWork (later sources override)
const allSchoolsMap = new Map();
for (const [id, school] of csvData.dataForWork.schools) {
  allSchoolsMap.set(id, school);
}
for (const [id, school] of csvData.moscow.schools) {
  allSchoolsMap.set(id, school);
}
for (const [id, school] of csvData.moscowRegion.schools) {
  allSchoolsMap.set(id, school);
}

console.log('\n' + '='.repeat(60));
console.log('📊 СТАТИСТИКА CSV');
console.log('='.repeat(60));
console.log(`uchi_schools_data_for_work.csv: ${csvData.dataForWork.ids.size} уникальных ID`);
console.log(`uchi_schools_Москва.csv:        ${csvData.moscow.ids.size} уникальных ID`);
console.log(`uchi_schools_Московская_область.csv: ${csvData.moscowRegion.ids.size} уникальных ID`);
console.log(`UNION (все 3 CSV):              ${unionIds.size} уникальных ID`);

// 3. Read existing server data
console.log('\n' + '='.repeat(60));
console.log('📂 АНАЛИЗ СЕРВЕРНЫХ ДАННЫХ');
console.log('='.repeat(60));

let productionSchools = [];
let sandboxSchools = [];

if (fs.existsSync(PRODUCTION_FILE)) {
  productionSchools = JSON.parse(fs.readFileSync(PRODUCTION_FILE, 'utf-8'));
  console.log(`server/data/schools.json: ${productionSchools.length} школ`);
} else {
  console.log('server/data/schools.json: файл не найден, будет создан');
}

if (fs.existsSync(SANDBOX_FILE)) {
  sandboxSchools = JSON.parse(fs.readFileSync(SANDBOX_FILE, 'utf-8'));
  console.log(`server/data/schools_sandbox.json: ${sandboxSchools.length} школ`);
} else {
  console.log('server/data/schools_sandbox.json: файл не найден, будет создан');
}

// Build sets of existing IDs
const productionIds = new Set(productionSchools.map((s) => s.id));
const sandboxIds = new Set(sandboxSchools.map((s) => s.id));

console.log(`\nУникальных ID в production: ${productionIds.size}`);
console.log(`Уникальных ID в sandbox:    ${sandboxIds.size}`);

// 4. Find missing IDs
const missingInProduction = [...unionIds].filter((id) => !productionIds.has(id));
const missingInSandbox = [...unionIds].filter((id) => !sandboxIds.has(id));

console.log('\n' + '='.repeat(60));
console.log('🔍 ОТСУТСТВУЮЩИЕ ШКОЛЫ');
console.log('='.repeat(60));
console.log(`В production отсутствует: ${missingInProduction.length} школ из CSV`);
console.log(`В sandbox отсутствует:    ${missingInSandbox.length} школ из CSV`);

if (missingInProduction.length === 0 && missingInSandbox.length === 0) {
  console.log('\n✅ Все школы из CSV уже присутствуют в обеих базах. Ничего добавлять не нужно.');
  process.exit(0);
}

// 5. Create backup directory if needed
if (!DRY_RUN) {
  if (!fs.existsSync(BACKUPS_IMPORT_DIR)) {
    fs.mkdirSync(BACKUPS_IMPORT_DIR, { recursive: true });
    console.log(`\n📁 Создана директория для бэкапов: ${BACKUPS_IMPORT_DIR}`);
  }
}

// 6. Backup existing files
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

if (!DRY_RUN) {
  console.log('\n' + '='.repeat(60));
  console.log('💾 СОЗДАНИЕ БЭКАПОВ');
  console.log('='.repeat(60));

  if (fs.existsSync(PRODUCTION_FILE)) {
    const backupProd = path.join(BACKUPS_IMPORT_DIR, `schools_${timestamp}.json`);
    fs.copyFileSync(PRODUCTION_FILE, backupProd);
    console.log(`Production backup: ${path.basename(backupProd)}`);
  }

  if (fs.existsSync(SANDBOX_FILE)) {
    const backupSandbox = path.join(BACKUPS_IMPORT_DIR, `schools_sandbox_${timestamp}.json`);
    fs.copyFileSync(SANDBOX_FILE, backupSandbox);
    console.log(`Sandbox backup:    ${path.basename(backupSandbox)}`);
  }
}

// 7. Add missing schools
console.log('\n' + '='.repeat(60));
console.log('➕ ДОБАВЛЕНИЕ ШКОЛ');
console.log('='.repeat(60));

let addedToProduction = 0;
let addedToSandbox = 0;

// Add to production
for (const id of missingInProduction) {
  const csvSchool = allSchoolsMap.get(id);
  if (!csvSchool) continue;

  const newSchool = createSchoolObject(
    csvSchool.id,
    csvSchool.name,
    csvSchool.city,
    csvSchool.uchiLink,
    csvSchool.region
  );
  productionSchools.push(newSchool);
  addedToProduction++;
}

// Add to sandbox
for (const id of missingInSandbox) {
  const csvSchool = allSchoolsMap.get(id);
  if (!csvSchool) continue;

  const newSchool = createSchoolObject(
    csvSchool.id,
    csvSchool.name,
    csvSchool.city,
    csvSchool.uchiLink,
    csvSchool.region
  );
  sandboxSchools.push(newSchool);
  addedToSandbox++;
}

console.log(`Добавлено в production: ${addedToProduction} школ`);
console.log(`Добавлено в sandbox:    ${addedToSandbox} школ`);

// 8. Write updated files
if (!DRY_RUN) {
  console.log('\n' + '='.repeat(60));
  console.log('📝 ЗАПИСЬ ФАЙЛОВ');
  console.log('='.repeat(60));

  fs.writeFileSync(PRODUCTION_FILE, JSON.stringify(productionSchools, null, 2), 'utf-8');
  console.log(`✅ Записано в production: ${productionSchools.length} школ`);

  fs.writeFileSync(SANDBOX_FILE, JSON.stringify(sandboxSchools, null, 2), 'utf-8');
  console.log(`✅ Записано в sandbox:    ${sandboxSchools.length} школ`);
} else {
  console.log('\n🔍 DRY-RUN: Файлы не изменены');
}

// 9. Verification
console.log('\n' + '='.repeat(60));
console.log('✔️  ВЕРИФИКАЦИЯ');
console.log('='.repeat(60));

const finalProductionIds = new Set(productionSchools.map((s) => s.id));
const finalSandboxIds = new Set(sandboxSchools.map((s) => s.id));

const stillMissingProd = [...unionIds].filter((id) => !finalProductionIds.has(id));
const stillMissingSandbox = [...unionIds].filter((id) => !finalSandboxIds.has(id));

if (stillMissingProd.length === 0) {
  console.log('✅ Production: все ID из CSV покрыты');
} else {
  console.log(`❌ Production: всё ещё отсутствует ${stillMissingProd.length} ID`);
  console.log('   Примеры:', stillMissingProd.slice(0, 5).join(', '));
}

if (stillMissingSandbox.length === 0) {
  console.log('✅ Sandbox: все ID из CSV покрыты');
} else {
  console.log(`❌ Sandbox: всё ещё отсутствует ${stillMissingSandbox.length} ID`);
  console.log('   Примеры:', stillMissingSandbox.slice(0, 5).join(', '));
}

// 10. Final summary
console.log('\n' + '='.repeat(60));
console.log('📊 ИТОГОВАЯ СТАТИСТИКА');
console.log('='.repeat(60));
console.log(`CSV union:           ${unionIds.size} уникальных ID`);
console.log(`Production итого:    ${productionSchools.length} школ (добавлено ${addedToProduction})`);
console.log(`Sandbox итого:       ${sandboxSchools.length} школ (добавлено ${addedToSandbox})`);

if (!DRY_RUN) {
  console.log('\n✅ Импорт завершён успешно!');
} else {
  console.log('\n🔍 DRY-RUN завершён. Для записи запустите без --dry-run');
}
