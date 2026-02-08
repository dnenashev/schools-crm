#!/usr/bin/env node
/**
 * Показать кастомные поля одной сделки и привязанной компании из воронки "Школы".
 * ID школы хранится в компании — здесь видно field_id поля "ID школы" у компании.
 *
 * Нужно в .env: AMO_SCHOOLS_PIPELINE_ID=10351822 и остальные AMO_*.
 *
 * Usage:
 *   node scripts/amo-show-lead-fields.js
 *   node scripts/amo-show-lead-fields.js 3   — показать первые 3 сделки
 */

import 'dotenv/config';
import {
  getLeadsByPipeline,
  getLeadCustomFields,
  getLeadLinks,
  getCompanyById,
  getCompanyCustomFields,
  isAmoConfigured,
} from '../server/amo.js';

const PIPELINE_ID = process.env.AMO_SCHOOLS_PIPELINE_ID
  ? parseInt(process.env.AMO_SCHOOLS_PIPELINE_ID, 10)
  : null;
const LIMIT = Math.min(parseInt(process.argv[2], 10) || 1, 10) || 1;

async function main() {
  if (!isAmoConfigured()) {
    console.log('Задайте AMO_* в .env (в т.ч. AMO_SCHOOLS_PIPELINE_ID).');
    process.exit(1);
  }
  if (!PIPELINE_ID || isNaN(PIPELINE_ID)) {
    console.log('Задайте AMO_SCHOOLS_PIPELINE_ID в .env (например 10351822).');
    process.exit(1);
  }

  const [leadFields, companyFields, leads] = await Promise.all([
    getLeadCustomFields(),
    getCompanyCustomFields(),
    getLeadsByPipeline(PIPELINE_ID, { page: 1, limit: Math.max(LIMIT, 10) }),
  ]);

  const leadFieldNames = new Map();
  (leadFields || []).forEach((f) => leadFieldNames.set(f.id, f.name || f.code || `field_${f.id}`));
  const companyFieldNames = new Map();
  (companyFields || []).forEach((f) => companyFieldNames.set(f.id, f.name || f.code || `field_${f.id}`));

  if (!leads.length) {
    console.log('В воронке нет сделок.');
    return;
  }

  console.log('Сделки воронки "Школы" и привязанные компании (ID школы — в компании):\n');
  const toShow = leads.slice(0, LIMIT);

  for (const lead of toShow) {
    console.log('--- Сделка ---');
    console.log('  id:', lead.id);
    console.log('  name:', lead.name);
    const leadValues = lead.custom_fields_values || [];
    if (leadValues.length > 0) {
      console.log('  кастомные поля сделки:');
      for (const f of leadValues) {
        const name = leadFieldNames.get(f.field_id) ?? `field_${f.field_id}`;
        const val = f.values?.[0]?.value ?? '';
        const preview = String(val).length > 60 ? String(val).slice(0, 57) + '...' : val;
        console.log('    field_id:', f.field_id, '|', name, '|', preview);
      }
    }

    const links = await getLeadLinks(lead.id);
    const companyLink = links.find((l) => (l.to_entity_type || l.entity_type) === 'companies');
    const companyId = companyLink?.to_entity_id ?? companyLink?.entity_id;

    if (companyId) {
      const company = await getCompanyById(companyId);
      if (company) {
        console.log('  привязанная компания: id', company.id, '| name:', company.name);
        const compValues = company.custom_fields_values || [];
        if (compValues.length > 0) {
          console.log('  кастомные поля компании:');
          for (const f of compValues) {
            const name = companyFieldNames.get(f.field_id) ?? `field_${f.field_id}`;
            const val = f.values?.[0]?.value ?? '';
            const preview = String(val).length > 60 ? String(val).slice(0, 57) + '...' : val;
            console.log('    field_id:', f.field_id, '|', name, '|', preview);
          }
        } else {
          console.log('  у компании нет кастомных полей');
        }
      }
    } else {
      console.log('  привязанной компании нет');
    }
    console.log('');
  }

  console.log('Скопируйте field_id поля «ID школы» у компании и задайте в .env: AMO_SCHOOL_ID_FIELD_ID=<этот_id>');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
