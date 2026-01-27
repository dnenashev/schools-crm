import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Пути к файлам
const csvPath = path.join(__dirname, '../data/uchi_schools_data_for_work.csv');
const jsonPath = path.join(__dirname, '../src/data/schools.json');

// Читаем CSV файл и убираем BOM
let csvContent = fs.readFileSync(csvPath, 'utf-8');
// Убираем BOM если есть
csvContent = csvContent.replace(/^\uFEFF/, '');
// Нормализуем переводы строк
csvContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

const lines = csvContent.split('\n').filter(line => line.trim());

// Пропускаем заголовок
const header = lines[0].split(';').map(h => h.trim());
console.log('Заголовки CSV:', header);

const schools = [];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  
  // Обрабатываем кавычки в CSV (для названий с точкой с запятой внутри)
  let values = [];
  let current = '';
  let inQuotes = false;
  
  for (let char of line) {
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
  
  // ID_школы;Название_школы;Город;Регион;Ссылка_на_страницу;Москва_или_МО
  const [id, name, city, regionField, uchiLink, moscowOrMO] = values.map(v => v ? v.trim() : '');
  
  if (!id || !name) continue;
  
  // Определяем регион - если в поле Москва_или_МО есть "МО" или "мо" - это область
  let region = 'Москва';
  const moscowOrMOLower = (moscowOrMO || '').toLowerCase();
  if (moscowOrMOLower === 'мо' || moscowOrMOLower.includes('московская область') || moscowOrMOLower.includes('моск. обл')) {
    region = 'Московская область';
  }
  
  const school = {
    id: id,
    name: name.replace(/^"|"$/g, ''), // Убираем кавычки если есть
    district: '',                      // Нет данных
    region: region,
    city: city || '',
    address: '',                       // Нет данных
    website: '',                       // Нет данных
    uchiLink: uchiLink || '',
    travelTime: '',                    // Нет данных
    inWork: false,
    inWorkDate: null,
    callStatus: null,
    callDate: null,
    callResult: null,
    callbackDate: null,
    amoLink: '',
    tags: ['неполная инфа']           // Метка первичной базы
  };
  
  schools.push(school);
}

console.log(`\nОбработано школ: ${schools.length}`);
console.log(`Москва: ${schools.filter(s => s.region === 'Москва').length}`);
console.log(`МО: ${schools.filter(s => s.region === 'Московская область').length}`);

// Сохраняем JSON
fs.writeFileSync(jsonPath, JSON.stringify(schools, null, 2), 'utf-8');
console.log(`\nJSON сохранён в: ${jsonPath}`);
