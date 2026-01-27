import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schoolsPath = path.join(__dirname, '../src/data/schools.json');

// Читаем текущие данные
const schools = JSON.parse(fs.readFileSync(schoolsPath, 'utf-8'));

console.log(`Миграция ${schools.length} школ...`);

// Добавляем новые поля к каждой школе
const migratedSchools = schools.map(school => ({
  id: school.id,
  name: school.name,
  district: school.district || '',
  region: school.region || 'Москва',
  city: school.city || '',
  address: school.address || '',
  website: school.website || '',
  uchiLink: school.uchiLink || '',
  travelTime: school.travelTime || '',
  tags: school.tags || [],
  
  // Статусы с датами
  inWorkDate: school.inWorkDate || null,
  contactDate: school.callDate || null,  // Маппим старое поле
  meetingScheduledDate: null,
  meetingHeldDate: null,
  eventScheduledDate: null,
  eventHeldDate: null,
  campusVisitPlannedDate: null,
  loadedToCRMDate: null,
  qualifiedLeadDate: null,
  arrivedToCampusDate: null,
  preliminaryMeetingDate: null,
  
  // Дополнительные поля
  callbackDate: school.callbackDate || null,
  notes: '',
  amoLink: school.amoLink || '',
  
  // История активностей
  activities: []
}));

// Сохраняем
fs.writeFileSync(schoolsPath, JSON.stringify(migratedSchools, null, 2), 'utf-8');

console.log('Миграция завершена!');
console.log(`Обработано школ: ${migratedSchools.length}`);
