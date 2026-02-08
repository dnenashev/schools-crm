#!/usr/bin/env node
/**
 * Привязка школ к сделкам АмоCRM по id школы.
 * ID школы хранится в компании, привязанной к сделке (кастомное поле компании).
 * Скрипт подтягивает сделки из воронки "Школы", для каждой берёт компанию и поле "ID школы", проставляет amoLink у наших школ.
 *
 * Переменные окружения:
 *   AMO_SCHOOLS_PIPELINE_ID   — id воронки "Школы" в Амо (обязательно)
 *   AMO_SCHOOL_ID_FIELD_ID   — id кастомного поля компании, где хранится id школы (UUID) (обязательно)
 *   MODE=sandbox             — использовать server/data/schools_sandbox.json
 *
 * Как узнать field_id: npm run amo:lead-fields — покажет поля привязанной компании.
 *
 * Usage:
 *   node scripts/link-schools-amo.js --list-fields      # кастомные поля компаний
 *   node scripts/link-schools-amo.js --by-deals 10       # первые 10 сделок из Амо
 *   node scripts/link-schools-amo.js --by-deals 10 --offset 10   # следующие 10 сделок (11–20), для теста
 *   node scripts/link-schools-amo.js --by-deals all      # все сделки воронки (прод)
 *   node scripts/link-schools-amo.js --by-deals all --verbose   # все сделки + подробный лог по каждой
 *   node scripts/link-schools-amo.js --by-deals 10 --dry-run
 *   node scripts/link-schools-amo.js --dry-run           # только показать, что привязали бы
 *   node scripts/link-schools-amo.js                     # выполнить привязку (по школам/поиск)
 *   MODE=sandbox node scripts/link-schools-amo.js       # sandbox
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, getAllSchools, getSchoolById, updateSchool } from '../server/db.js';
import {
  getLeadsByPipeline,
  getLeadLinks,
  getCompanyById,
  getCompanyCustomFields,
  getCompanyCustomFieldValue,
  getCompaniesByQuery,
  getCompaniesBySchoolIdField,
  getCompanyLinks,
  buildLeadUrl,
  isAmoConfigured,
} from '../server/amo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIST_FIELDS = process.argv.includes('--list-fields');
const DRY_RUN = process.argv.includes('--dry-run');
const IS_SANDBOX = process.env.MODE === 'sandbox';
/** Подробное логирование каждой сделки (в т.ч. при --by-deals all). Без флага при «все сделки» выводится только прогресс. */
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

/** Режим "по сделкам": N сделок или все. Пример: --by-deals 10, --by-deals all */
const BY_DEALS_INDEX = process.argv.indexOf('--by-deals');
const BY_DEALS_ARG = BY_DEALS_INDEX >= 0 ? process.argv[BY_DEALS_INDEX + 1] : null;
const BY_DEALS_ALL = BY_DEALS_ARG === 'all' || BY_DEALS_ARG === 'ALL';
const BY_DEALS_LIMIT = BY_DEALS_INDEX >= 0 && BY_DEALS_ARG != null
  ? (BY_DEALS_ALL ? 'all' : Math.max(1, parseInt(BY_DEALS_ARG, 10) || 10))
  : 0;

/** Сдвиг: пропустить первые N сделок. Пример: --by-deals 10 --offset 10 = следующие 10 сделок (11–20) */
const OFFSET_INDEX = process.argv.indexOf('--offset');
const BY_DEALS_OFFSET = OFFSET_INDEX >= 0 && process.argv[OFFSET_INDEX + 1] != null
  ? Math.max(0, parseInt(process.argv[OFFSET_INDEX + 1], 10) || 0)
  : 0;

/** Лимит школ (0 = все). Пример: node scripts/link-schools-amo.js 10 — только первые 10 школ (в режиме по школам) */
const LIMIT_SCHOOLS = (() => {
  if (BY_DEALS_LIMIT !== 0) return 0; // включён режим --by-deals
  const arg = process.argv.find((a) => /^\d+$/.test(a));
  return arg ? Math.max(1, parseInt(arg, 10)) : 0;
})();

/** Пауза между сделками (мс) при последовательном режиме. При параллельном — 0, лимит даёт amo.js (15 req/s). */
const DELAY_BETWEEN_LEADS_MS = parseInt(process.env.LINK_DELAY_MS || '0', 10) || 0;
/** Сколько сделок обрабатывать параллельно (упирается в лимит Amo 15 req/s, ~2 запроса на сделку → до ~7 сделок/с). */
const CONCURRENCY = Math.min(20, Math.max(1, parseInt(process.env.LINK_CONCURRENCY || '8', 10) || 8));
const DATA_DIR = path.join(__dirname, '..', 'server', 'data');
const SCHOOLS_SANDBOX_FILE = path.join(DATA_DIR, 'schools_sandbox.json');

const PIPELINE_ID = process.env.AMO_SCHOOLS_PIPELINE_ID ? parseInt(process.env.AMO_SCHOOLS_PIPELINE_ID, 10) : null;
const SCHOOL_ID_FIELD_ID = process.env.AMO_SCHOOL_ID_FIELD_ID
  ? (process.env.AMO_SCHOOL_ID_FIELD_ID.includes('-') || /^\d+$/.test(process.env.AMO_SCHOOL_ID_FIELD_ID)
    ? process.env.AMO_SCHOOL_ID_FIELD_ID
    : parseInt(process.env.AMO_SCHOOL_ID_FIELD_ID, 10))
  : null;

async function listCustomFields() {
  if (!isAmoConfigured()) {
    console.warn('Amo не настроен (AMO_DOMAIN, AMO_ACCESS_TOKEN).');
    return;
  }
  const fields = await getCompanyCustomFields();
  console.log('Кастомные поля компаний (ID школы — в компании, привязанной к сделке):');
  if (fields.length === 0) {
    console.log('  (пусто или нет доступа)');
    return;
  }
  for (const f of fields) {
    console.log(`  id: ${f.id}, name: "${f.name}"${f.code ? `, code: ${f.code}` : ''}`);
  }
  console.log('\nЗадайте AMO_SCHOOL_ID_FIELD_ID в .env равным id поля компании с id школы (UUID).');
}

async function fetchAllLeadsFromPipeline(pipelineId) {
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

/**
 * Режим "по сделкам": список школ в БД = список сделок в Амо.
 * Берём N сделок (или все при limitDeals === 'all') из воронки, из каждой достаём ID школы (поле компании), находим школу у себя и привязываем.
 */
async function runLinkByDeals(limitDeals) {
  if (!isAmoConfigured()) {
    console.warn('Amo не настроен. Задайте AMO_DOMAIN, AMO_ACCESS_TOKEN (или другие AMO_*).');
    return;
  }
  if (!PIPELINE_ID || isNaN(PIPELINE_ID)) {
    console.warn('Задайте AMO_SCHOOLS_PIPELINE_ID (id воронки "Школы" в Амо).');
    return;
  }
  if (SCHOOL_ID_FIELD_ID == null || SCHOOL_ID_FIELD_ID === '') {
    console.warn('Задайте AMO_SCHOOL_ID_FIELD_ID (id кастомного поля с id школы). Запустите с --list-fields чтобы увидеть поля.');
    return;
  }

  const fieldId = typeof SCHOOL_ID_FIELD_ID === 'number' ? SCHOOL_ID_FIELD_ID : parseInt(String(SCHOOL_ID_FIELD_ID), 10);
  if (isNaN(fieldId)) {
    console.warn('AMO_SCHOOL_ID_FIELD_ID должен быть числом.');
    return;
  }

  const isAll = limitDeals === 'all';
  const offset = typeof BY_DEALS_OFFSET === 'number' ? BY_DEALS_OFFSET : 0;
  if (isAll) {
    console.log(`Режим по сделкам (прод): загружаем все сделки воронки ${PIPELINE_ID}...`);
  } else if (offset > 0) {
    console.log(`Режим по сделкам: сделки ${offset + 1}–${offset + limitDeals} из воронки ${PIPELINE_ID} (--offset ${offset})...`);
  } else {
    console.log(`Режим по сделкам: берём первые ${limitDeals} сделок из воронки ${PIPELINE_ID}...`);
  }
  let leads;
  if (isAll) {
    leads = await fetchAllLeadsFromPipeline(PIPELINE_ID);
  } else {
    const fetchCount = offset + limitDeals;
    const chunk = await getLeadsByPipeline(PIPELINE_ID, { page: 1, limit: fetchCount });
    leads = chunk.slice(offset, offset + limitDeals);
  }
  if (leads.length === 0) {
    console.log(offset > 0 ? `Нет сделок в диапазоне ${offset + 1}–${offset + limitDeals}.` : 'Сделок в воронке не найдено.');
    return;
  }
  console.log(`Обрабатываем сделок: ${leads.length}`);

  if (!IS_SANDBOX) await connectDB();

  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  let alreadyLinked = 0;
  const showProgress = isAll && leads.length > 100;
  const PROGRESS_EVERY = 20;

  const verboseLog = !showProgress || VERBOSE; // подробный лог: при малом объёме или с флагом --verbose
  const useParallel = !verboseLog && !IS_SANDBOX && leads.length > CONCURRENCY;

  if (useParallel) {
    console.log(`  Параллельная обработка: до ${CONCURRENCY} сделок одновременно (лимит Amo 15 req/s сохранён).`);
  }
  if (showProgress) {
    console.log(`  обработано 0/${leads.length} сделок, привязано: 0, уже привязано: 0, пропущено: 0, не в БД: 0`);
  }

  async function processOneDeal(lead, index) {
    const r = { updated: 0, skipped: 0, notFound: 0, alreadyLinked: 0 };
    const leadName = (lead.name || '').trim() || '(без названия)';
    if (verboseLog) console.log('');
    if (verboseLog) console.log(`[${index + 1}] Взял сделку ${lead.id}, название в Амо: «${leadName.slice(0, 60)}»`);

    const links = await getLeadLinks(lead.id);
    const companyLink = links.find((l) => (l.to_entity_type || l.entity_type) === 'companies');
    const companyId = companyLink?.to_entity_id ?? companyLink?.entity_id;
    if (!companyId) {
      if (verboseLog) console.log(`     В сделке нет привязанной компании — пропуск.`);
      r.skipped++;
      return r;
    }
    const company = await getCompanyById(companyId);
    if (!company) {
      if (verboseLog) console.log(`     Компания ${companyId} не найдена в Амо — пропуск.`);
      r.skipped++;
      return r;
    }
    const schoolId = getCompanyCustomFieldValue(company, fieldId);
    if (!schoolId || !String(schoolId).trim()) {
      if (verboseLog) console.log(`     В компании найденной по сделке нет поля «ID школы» или значение пустое — пропуск.`);
      r.skipped++;
      return r;
    }
    if (verboseLog) console.log(`     Нашёл в ней поле «ID школы», значение поля: ${schoolId}`);
    if (verboseLog) console.log(`     Поиск этого значения в нашей базе школ...`);

    let school;
    if (IS_SANDBOX) {
      if (!fs.existsSync(SCHOOLS_SANDBOX_FILE)) school = null;
      else {
        const list = JSON.parse(fs.readFileSync(SCHOOLS_SANDBOX_FILE, 'utf-8'));
        school = list.find((s) => s.id === schoolId) || null;
      }
    } else {
      school = await getSchoolById(schoolId);
    }
    if (!school) {
      if (verboseLog) console.log(`     Школа с id «${schoolId}» в нашей базе не найдена — пропуск.`);
      r.notFound++;
      return r;
    }
    const schoolNameInDb = (school.name || school.id || '').trim() || '(без названия)';
    if (verboseLog) console.log(`     Нашёл школу в базе по id «${schoolId}», название в нашей базе: «${schoolNameInDb.slice(0, 60)}»`);

    const newLink = buildLeadUrl(lead.id);
    if (!newLink) {
      if (verboseLog) console.log(`     Не удалось сформировать ссылку на сделку — пропуск.`);
      r.skipped++;
      return r;
    }
    const currentLink = (school.amoLink || '').trim();
    if (currentLink) {
      r.alreadyLinked++;
      if (verboseLog) console.log(`     У этой школы уже заполнен amoLink (уже привязана к сделке) — пропуск, не перезаписываю.`);
      return r;
    }
    if (verboseLog) console.log(`     Выполняю привязку: школа «${schoolNameInDb.slice(0, 50)}» → сделка ${lead.id} «${leadName.slice(0, 40)}»`);

    if (DRY_RUN) {
      if (verboseLog) console.log(`     [dry-run] Записал бы amoLink в БД для школы ${school.id}: ${newLink}`);
      r.updated++;
    } else if (IS_SANDBOX) {
      const list = JSON.parse(fs.readFileSync(SCHOOLS_SANDBOX_FILE, 'utf-8'));
      const idx = list.findIndex((s) => s.id === school.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], amoLink: newLink };
        fs.writeFileSync(SCHOOLS_SANDBOX_FILE, JSON.stringify(list, null, 2), 'utf-8');
        if (verboseLog) console.log(`     Записал amoLink в БД для школы ${school.id} (название: «${schoolNameInDb.slice(0, 50)}»).`);
        r.updated++;
      }
    } else {
      const result = await updateSchool(school.id, { amoLink: newLink });
      if (result) {
        if (verboseLog) console.log(`     Записал данные в БД: amoLink для школы ${school.id} (название в нашей базе: «${schoolNameInDb.slice(0, 50)}»).`);
        r.updated++;
      } else if (verboseLog) console.log(`     Ошибка записи в БД для школы ${school.id}.`);
    }
    return r;
  }

  if (useParallel) {
    for (let start = 0; start < leads.length; start += CONCURRENCY) {
      const chunk = leads.slice(start, start + CONCURRENCY);
      const results = await Promise.all(chunk.map((lead, j) => processOneDeal(lead, start + j)));
      for (const r of results) {
        updated += r.updated;
        skipped += r.skipped;
        notFound += r.notFound;
        alreadyLinked += r.alreadyLinked;
      }
      const done = Math.min(start + CONCURRENCY, leads.length);
      if (showProgress && (done % 200 === 0 || done === leads.length)) {
        console.log(`  обработано ${done}/${leads.length} сделок, привязано: ${updated}, уже привязано: ${alreadyLinked}, пропущено: ${skipped}, не в БД: ${notFound}`);
      }
    }
  } else {
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      if (showProgress && (i + 1) % PROGRESS_EVERY === 0) {
        console.log(`  обработано ${i + 1}/${leads.length} сделок, привязано: ${updated}, уже привязано: ${alreadyLinked}, пропущено: ${skipped}, не в БД: ${notFound}`);
      }
      const r = await processOneDeal(lead, i);
      updated += r.updated;
      skipped += r.skipped;
      notFound += r.notFound;
      alreadyLinked += r.alreadyLinked;
      if (DELAY_BETWEEN_LEADS_MS > 0 && i < leads.length - 1) {
        await new Promise((res) => setTimeout(res, DELAY_BETWEEN_LEADS_MS));
      }
    }
  }

  if (showProgress) console.log('');
  console.log(`Готово. Привязано/обновлено: ${updated}, уже привязано (пропущено): ${alreadyLinked}, пропущено: ${skipped}, школа не в БД: ${notFound}.`);
  if (updated > 0 && !DRY_RUN) {
    console.log('Обновите страницу /schools в браузере, чтобы увидеть кнопки АМО.');
  }
}

async function runLink() {
  if (!isAmoConfigured()) {
    console.warn('Amo не настроен. Задайте AMO_DOMAIN, AMO_ACCESS_TOKEN (или другие AMO_*).');
    return;
  }
  if (!PIPELINE_ID || isNaN(PIPELINE_ID)) {
    console.warn('Задайте AMO_SCHOOLS_PIPELINE_ID (id воронки "Школы" в Амо).');
    return;
  }
  if (SCHOOL_ID_FIELD_ID == null || SCHOOL_ID_FIELD_ID === '') {
    console.warn('Задайте AMO_SCHOOL_ID_FIELD_ID (id кастомного поля с id школы). Запустите с --list-fields чтобы увидеть поля.');
    return;
  }

  const fieldIdNum = typeof SCHOOL_ID_FIELD_ID === 'number' ? SCHOOL_ID_FIELD_ID : parseInt(String(SCHOOL_ID_FIELD_ID), 10);
  const fieldId = isNaN(fieldIdNum) ? String(SCHOOL_ID_FIELD_ID) : fieldIdNum;

  let schools = [];
  if (IS_SANDBOX) {
    if (!fs.existsSync(SCHOOLS_SANDBOX_FILE)) {
      console.warn('Файл sandbox не найден:', SCHOOLS_SANDBOX_FILE);
      return;
    }
    schools = JSON.parse(fs.readFileSync(SCHOOLS_SANDBOX_FILE, 'utf-8'));
  } else {
    await connectDB();
    schools = await getAllSchools();
  }

  const totalSchools = schools.length;
  const total = LIMIT_SCHOOLS > 0 ? Math.min(LIMIT_SCHOOLS, totalSchools) : totalSchools;
  const schoolsToProcess = schools.slice(0, total);

  // Сначала пробуем поиск по полю «ID школы» (если API поддерживает filter), иначе по query=UUID
  const PROGRESS_EVERY = 50;
  console.log(
    `Поиск привязок: ищем компанию по ID школы (обрабатываем ${total} из ${totalSchools}${LIMIT_SCHOOLS > 0 ? ', лимит ' + LIMIT_SCHOOLS : ''})...`
  );
  if (LIMIT_SCHOOLS > 0 && total <= 20) {
    schoolsToProcess.forEach((s, idx) => console.log(`  ${idx + 1}. ${(s.name || s.id || '').slice(0, 60)}`));
    console.log('');
  }
  const schoolIdToLeadId = new Map();
  const verbose = LIMIT_SCHOOLS > 0 && total <= 30;
  for (let i = 0; i < total; i++) {
    const school = schoolsToProcess[i];
    let companies = await getCompaniesBySchoolIdField(school.id, fieldId, { limit: 5 });
    if (companies.length === 0) companies = await getCompaniesByQuery(school.id, { limit: 5 });
    let matched = false;
    for (const company of companies) {
      const value = getCompanyCustomFieldValue(company, fieldId);
      if (value !== school.id) continue;
      const links = await getCompanyLinks(company.id);
      const leadLink = links.find((l) => (l.to_entity_type || l.entity_type) === 'leads');
      const leadId = leadLink?.to_entity_id ?? leadLink?.entity_id;
      if (leadId) {
        schoolIdToLeadId.set(school.id, leadId);
        matched = true;
        if (verbose) {
          console.log(`  ✓ ${(school.name || school.id).slice(0, 55)} → сделка ${leadId}`);
        }
        break;
      }
    }
    if (verbose && !matched) {
      const shortName = (school.name || school.id).slice(0, 50);
      if (companies.length === 0) {
        console.log(`  − ${shortName}: по query не найдено компаний (искали id: ${school.id})`);
      } else {
        console.log(`  − ${shortName}: компаний ${companies.length}, не подошли. Искали «ID школы» = ${school.id}`);
        for (const comp of companies.slice(0, 3)) {
          const val = getCompanyCustomFieldValue(comp, fieldId);
          const links = await getCompanyLinks(comp.id);
          const hasLead = links.some((l) => (l.to_entity_type || l.entity_type) === 'leads');
          console.log(`    компания id=${comp.id}: поле=${val || '(пусто)'}, сделка=${hasLead ? 'да' : 'нет'}`);
        }
        if (companies.length > 3) console.log(`    ... и ещё ${companies.length - 3} компаний`);
      }
    }
    if (!verbose && ((i + 1) % PROGRESS_EVERY === 0 || i === total - 1)) {
      console.log(`  школ: ${i + 1}/${total}, привязок найдено: ${schoolIdToLeadId.size}`);
    }
    if (DELAY_BETWEEN_LEADS_MS > 0 && i < total - 1) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_LEADS_MS));
    }
  }

  if (schoolIdToLeadId.size === 0) {
    console.log('Поиск по компаниям не дал результатов. Перебор сделок воронки...');
    const leads = await fetchAllLeadsFromPipeline(PIPELINE_ID);
    const leadTotal = leads.length;
    const PROGRESS_LEADS = 200;
    for (let i = 0; i < leadTotal; i++) {
      const lead = leads[i];
      const links = await getLeadLinks(lead.id);
      const companyLink = links.find((l) => (l.to_entity_type || l.entity_type) === 'companies');
      const companyId = companyLink?.to_entity_id ?? companyLink?.entity_id;
      if (!companyId) {
        if (DELAY_BETWEEN_LEADS_MS > 0 && i < leadTotal - 1) await new Promise((r) => setTimeout(r, DELAY_BETWEEN_LEADS_MS));
        continue;
      }
      const company = await getCompanyById(companyId);
      if (!company) {
        if (DELAY_BETWEEN_LEADS_MS > 0 && i < leadTotal - 1) await new Promise((r) => setTimeout(r, DELAY_BETWEEN_LEADS_MS));
        continue;
      }
      const schoolId = getCompanyCustomFieldValue(company, fieldId);
      if (schoolId) schoolIdToLeadId.set(schoolId, lead.id);
      if ((i + 1) % PROGRESS_LEADS === 0 || i === leadTotal - 1) {
        process.stdout.write(`\r  сделок: ${i + 1}/${leadTotal}, привязок: ${schoolIdToLeadId.size}    `);
      }
      if (DELAY_BETWEEN_LEADS_MS > 0 && i < leadTotal - 1) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_LEADS_MS));
      }
    }
    console.log('');
  }
  console.log(`Сделок с компанией и заполненным id школы: ${schoolIdToLeadId.size}`);

  let updated = 0;
  const updates = [];

  console.log('Запись amoLink в базу...');
  for (const school of schoolsToProcess) {
    const leadId = schoolIdToLeadId.get(school.id);
    if (leadId == null) continue;
    const newLink = buildLeadUrl(leadId);
    if (!newLink) continue;
    const currentLink = (school.amoLink || '').trim();
    if (currentLink === newLink) continue;

    updates.push({ school, leadId, newLink });
    if (DRY_RUN) {
      console.log(`[dry-run] ${school.name} (${school.id}) -> lead ${leadId} ${newLink}`);
      updated++;
      continue;
    }

    if (IS_SANDBOX) {
      const idx = schools.findIndex((s) => s.id === school.id);
      if (idx >= 0) {
        schools[idx] = { ...schools[idx], amoLink: newLink };
        updated++;
      }
    } else {
      const result = await updateSchool(school.id, { amoLink: newLink });
      if (result) updated++;
    }
  }

  if (DRY_RUN && updates.length > 0) {
    console.log(`\nБыло бы обновлено школ: ${updates.length}`);
  }

  if (!DRY_RUN && IS_SANDBOX && updated > 0) {
    fs.writeFileSync(SCHOOLS_SANDBOX_FILE, JSON.stringify(schools, null, 2), 'utf-8');
  }

  console.log(`Готово. Привязано/обновлено школ: ${updated}.`);
  if (updated > 0 && !DRY_RUN) {
    console.log('Обновите страницу /schools в браузере, чтобы увидеть кнопки АМО.');
  }
}

async function main() {
  if (LIST_FIELDS) {
    await listCustomFields();
    return;
  }
  if (BY_DEALS_LIMIT !== 0) {
    await runLinkByDeals(BY_DEALS_LIMIT);
    return;
  }
  await runLink();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
