import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Пути к файлам
const DATA_DIR = path.join(__dirname, '../server/data');
const PRODUCTION_FILE = path.join(DATA_DIR, 'schools.json');
const SANDBOX_FILE = path.join(DATA_DIR, 'schools_sandbox.json');
const SANDBOX_BACKUPS_DIR = path.join(DATA_DIR, 'backups_sandbox');

console.log('📋 Копирование данных из production в sandbox...\n');

// Создаём директорию для sandbox бэкапов если не существует
if (!fs.existsSync(SANDBOX_BACKUPS_DIR)) {
  fs.mkdirSync(SANDBOX_BACKUPS_DIR, { recursive: true });
  console.log('📁 Создана директория для sandbox бэкапов');
}

// Проверяем существование production файла
if (!fs.existsSync(PRODUCTION_FILE)) {
  console.error('❌ Ошибка: production файл не найден!');
  console.error(`   Путь: ${PRODUCTION_FILE}`);
  process.exit(1);
}

// Если sandbox файл уже существует, создаём бэкап
if (fs.existsSync(SANDBOX_FILE)) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupFile = path.join(SANDBOX_BACKUPS_DIR, `sandbox_${timestamp}.json`);
  fs.copyFileSync(SANDBOX_FILE, backupFile);
  console.log(`💾 Создан бэкап текущих sandbox данных: ${path.basename(backupFile)}`);
}

// Копируем данные
fs.copyFileSync(PRODUCTION_FILE, SANDBOX_FILE);

// Статистика
const productionData = JSON.parse(fs.readFileSync(PRODUCTION_FILE, 'utf-8'));
const schoolsCount = Array.isArray(productionData) ? productionData.length : 0;

console.log('\n✅ Данные успешно скопированы!');
console.log(`   Production → Sandbox`);
console.log(`   Школ: ${schoolsCount}`);
console.log(`\n📂 Sandbox файл: ${SANDBOX_FILE}`);
console.log('\n💡 Теперь запустите sandbox сервер командой: npm run dev:sandbox');
