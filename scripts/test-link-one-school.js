#!/usr/bin/env node
/**
 * Тест привязки одной школы к сделке Амо.
 * Ищет школу "Лицей Ласточкино гнездо" в нашей базе и подходящие сделки в Амо:
 * по полю "ID школы" в привязанной компании и по названию сделки.
 *
 * Usage:
 *   node scripts/test-link-one-school.js
 *   MODE=sandbox node scripts/test-link-one-school.js
 *
 * Нужно в .env: AMO_ACCESS_TOKEN, AMO_SCHOOLS_PIPELINE_ID.
 * Опционально: AMO_SCHOOL_ID_FIELD_ID — id поля компании с UUID школы.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, getAllSchools } from '../server/db.js';
import {
  getLeadsByPipeline,
  getLeadLinks,
  getCompanyById,
  getCompanyCustomFieldValue,
  getCompaniesByQuery,
  getCompaniesBySchoolIdField,
  getCompanyLinks,
  buildLeadUrl,
  isAmoConfigured,
} from '../server/amo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_SANDBOX = process.env.MODE === 'sandbox';
const DATA_DIR = path.join(__dirname, '..', 'server', 'data');
const SCHOOLS_SANDBOX_FILE = path.join(DATA_DIR, 'schools_sandbox.json');

const TARGET_NAME = 'Автономная некоммерческая образовательная организация Лицей Ласточкино гнездо';
const TARGET_NAME_SHORT = 'Ласточкино гнездо';

/** Пауза между сделками (мс), чтобы не перегружать Amo */
const DELAY_BETWEEN_LEADS_MS = 200;

const PIPELINE_ID = process.env.AMO_SCHOOLS_PIPELINE_ID ? parseInt(process.env.AMO_SCHOOLS_PIPELINE_ID, 10) : null;
const SCHOOL_ID_FIELD_ID = process.env.AMO_SCHOOL_ID_FIELD_ID
  ? (/^\d+$/.test(process.env.AMO_SCHOOL_ID_FIELD_ID)
    ? parseInt(process.env.AMO_SCHOOL_ID_FIELD_ID, 10)
    : process.env.AMO_SCHOOL_ID_FIELD_ID)
  : null;

async function loadSchools() {
  if (IS_SANDBOX) {
    if (!fs.existsSync(SCHOOLS_SANDBOX_FILE)) {
      throw new Error('Sandbox file not found: ' + SCHOOLS_SANDBOX_FILE);
    }
    return JSON.parse(fs.readFileSync(SCHOOLS_SANDBOX_FILE, 'utf-8'));
  }
  await connectDB();
  return getAllSchools();
}

function findSchool(schools) {
  const exact = schools.find((s) => s.name && s.name.trim() === TARGET_NAME);
  if (exact) return exact;
  const byShort = schools.find(
    (s) => s.name && (s.name.includes(TARGET_NAME_SHORT) || s.name.includes('Ласточкино гнездо'))
  );
  return byShort || null;
}

async function fetchAllLeads(pipelineId) {
  const all = [];
  let page = 1;
  const limit = 250;
  while (true) {
    const chunk = await getLeadsByPipeline(pipelineId, { page, limit });
    if (chunk.length === 0) break;
    all.push(...chunk);
    if (chunk.length < limit) break;
    page++;
  }
  return all;
}

function normalizeForMatch(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function leadMatchesSchoolByName(lead, school) {
  const leadName = normalizeForMatch(lead.name);
  const schoolName = normalizeForMatch(school.name);
  const short = normalizeForMatch(TARGET_NAME_SHORT);
  if (leadName.includes(short)) return true;
  if (schoolName && leadName.includes(schoolName)) return true;
  if (leadName.includes('ласточкино') && leadName.includes('гнездо')) return true;
  return false;
}

async function main() {
  console.log('=== Тест привязки одной школы к Амо ===\n');
  console.log('Школа:', TARGET_NAME);
  console.log('');

  const schools = await loadSchools();
  const school = findSchool(schools);

  if (!school) {
    console.log('❌ Школа не найдена в нашей базе.');
    const similar = schools.filter(
      (s) => s.name && (s.name.includes('Ласточкино') || s.name.includes('Ласточкино гнездо'))
    );
    if (similar.length > 0) {
      console.log('Похожие по названию:');
      similar.forEach((s) => console.log('  -', s.name, '| id:', s.id));
    }
    return;
  }

  console.log('✅ Школа в нашей базе:');
  console.log('   id:', school.id);
  console.log('   name:', school.name);
  console.log('   amoLink:', school.amoLink || '(не задана)');
  console.log('');

  if (!isAmoConfigured()) {
    console.log('Amo не настроен (AMO_DOMAIN, AMO_ACCESS_TOKEN). Задайте в .env и запустите снова.');
    return;
  }

  if (!PIPELINE_ID || isNaN(PIPELINE_ID)) {
    console.log('Задайте AMO_SCHOOLS_PIPELINE_ID в .env, чтобы искать сделки в воронке.');
    return;
  }

  const byCustomField = [];
  const byName = [];

  // 1) Пробуем поиск по полю «ID школы», затем по query=UUID (1–2 запроса вместо перебора тысяч сделок)
  if (SCHOOL_ID_FIELD_ID != null) {
    let companies = await getCompaniesBySchoolIdField(school.id, SCHOOL_ID_FIELD_ID, { limit: 10 });
    if (companies.length === 0) companies = await getCompaniesByQuery(school.id, { limit: 10 });
    for (const company of companies) {
      const value = getCompanyCustomFieldValue(company, SCHOOL_ID_FIELD_ID);
      if (value && value === school.id) {
        const links = await getCompanyLinks(company.id);
        const leadLink = links.find((l) => (l.to_entity_type || l.entity_type) === 'leads');
        const leadId = leadLink?.to_entity_id ?? leadLink?.entity_id;
        if (leadId) {
          byCustomField.push({
            lead: { id: leadId, name: `Сделка ${leadId} (через поиск компании)` },
            match: 'поиск компании по ID школы',
          });
          break;
        }
      }
    }
  }

  // 2) Если поиск не дал результата — перебираем сделки воронки (как раньше)
  if (byCustomField.length === 0) {
    console.log('Загрузка сделок из воронки (pipeline_id=' + PIPELINE_ID + ')...');
    const leads = await fetchAllLeads(PIPELINE_ID);
    const leadTotal = leads.length;
    console.log('Загружено сделок:', leadTotal);
    console.log('');

    const PROGRESS_EVERY = 200;
    for (let i = 0; i < leadTotal; i++) {
      const lead = leads[i];
      if (SCHOOL_ID_FIELD_ID != null) {
        const links = await getLeadLinks(lead.id);
        const companyLink = links.find((l) => (l.to_entity_type || l.entity_type) === 'companies');
        const companyId = companyLink?.to_entity_id ?? companyLink?.entity_id;
        if (companyId) {
          const company = await getCompanyById(companyId);
          if (company) {
            const value = getCompanyCustomFieldValue(company, SCHOOL_ID_FIELD_ID);
            if (value && value === school.id) {
              byCustomField.push({ lead, match: 'поле «ID школы» в компании' });
              console.log(`  Найдено на сделке ${i + 1}/${leadTotal}`);
              break;
            }
          }
        }
      }
      if (leadMatchesSchoolByName(lead, school)) {
        byName.push({ lead, match: 'название сделки' });
      }
      if ((i + 1) % PROGRESS_EVERY === 0 && byCustomField.length === 0) {
        process.stdout.write(`\r  Проверено сделок: ${i + 1}/${leadTotal}    `);
      }
      if (DELAY_BETWEEN_LEADS_MS > 0 && i < leadTotal - 1) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_LEADS_MS));
      }
    }
    if (leadTotal > 0 && byCustomField.length === 0) {
      process.stdout.write('\r' + ' '.repeat(40) + '\r');
    }
  } else {
    console.log('Сделка найдена через поиск компаний (без перебора воронки).');
    console.log('');
  }

  const byIdSet = new Set(byCustomField.map((x) => x.lead.id));
  const byNameOnly = byName.filter((x) => !byIdSet.has(x.lead.id));

  console.log('--- Совпадение по полю "id школы" (AMO_SCHOOL_ID_FIELD_ID) ---');
  if (byCustomField.length === 0) {
    console.log('  (нет)');
    if (SCHOOL_ID_FIELD_ID == null) {
      console.log('  Задайте AMO_SCHOOL_ID_FIELD_ID в .env для сопоставления по UUID.');
    }
  } else {
    byCustomField.forEach(({ lead, match }) => {
      console.log('  lead id:', lead.id, '| name:', lead.name);
      console.log('  ссылка:', buildLeadUrl(lead.id));
      console.log('  совпадение:', match);
    });
  }

  console.log('');
  console.log('--- Совпадение по названию сделки ("Ласточкино гнездо") ---');
  if (byNameOnly.length === 0 && byName.length === 0) {
    console.log('  (нет)');
  } else {
    (byNameOnly.length ? byNameOnly : byName).forEach(({ lead, match }) => {
      console.log('  lead id:', lead.id, '| name:', lead.name);
      console.log('  ссылка:', buildLeadUrl(lead.id));
      console.log('  совпадение:', match);
    });
  }

  const best = byCustomField[0] || byName[0];
  if (best) {
    console.log('');
    console.log('Итог: подходящая сделка для привязки:');
    console.log('  ', buildLeadUrl(best.lead.id));
    console.log('  Записать в школу: amoLink =', buildLeadUrl(best.lead.id));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
