#!/usr/bin/env node
/**
 * Sync school date fields from AmoCRM lead stages.
 * Only updates dates >= AMO_DASHBOARD_CUTOFF_DATE; never overwrites earlier manual data.
 *
 * Usage:
 *   node scripts/sync-amo-stages.js
 *   MODE=sandbox node scripts/sync-amo-stages.js   # use sandbox schools file
 *   --dry-run   # log what would be updated without writing
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, getAllSchools, updateSchool } from '../server/db.js';
import { getLeadById, parseLeadIdFromLink, isAmoConfigured } from '../server/amo.js';
import { getCutoffDate, getDateFieldForStatus } from '../server/amo-stages-config.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const IS_SANDBOX = process.env.MODE === 'sandbox';
const DATA_DIR = path.join(__dirname, '..', 'server', 'data');
const SCHOOLS_SANDBOX_FILE = path.join(DATA_DIR, 'schools_sandbox.json');

const CUTOFF = getCutoffDate();

function dateFromTimestamp(ts) {
  if (ts == null) return null;
  const d = new Date(ts * 1000);
  return d.toISOString().slice(0, 10);
}

function shouldWriteDate(newDate, currentValue) {
  if (!newDate || newDate < CUTOFF) return false;
  if (currentValue != null && currentValue !== '' && currentValue < CUTOFF) return false;
  return true;
}

async function runSync() {
  if (!isAmoConfigured()) {
    console.warn('Amo credentials not set (AMO_DOMAIN, AMO_ACCESS_TOKEN or AMO_LONG_TOKEN). Skip sync.');
    return;
  }

  let schools = [];
  if (IS_SANDBOX) {
    if (!fs.existsSync(SCHOOLS_SANDBOX_FILE)) {
      console.warn('Sandbox schools file not found:', SCHOOLS_SANDBOX_FILE);
      return;
    }
    schools = JSON.parse(fs.readFileSync(SCHOOLS_SANDBOX_FILE, 'utf-8'));
  } else {
    await connectDB();
    schools = await getAllSchools();
  }

  const withLink = schools.filter((s) => s.amoLink && s.amoLink.trim());
  console.log(`Schools with amoLink: ${withLink.length}, cutoff date: ${CUTOFF}, dry-run: ${DRY_RUN}`);

  let updated = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const school of withLink) {
    const leadId = parseLeadIdFromLink(school.amoLink);
    if (leadId == null) continue;

    const lead = await getLeadById(leadId);
    if (!lead) continue;

    const dateField = getDateFieldForStatus(lead.status_id);
    if (!dateField) continue;

    const newDate = dateFromTimestamp(lead.updated_at) || today;
    const currentValue = school[dateField] ?? null;

    if (!shouldWriteDate(newDate, currentValue)) continue;

    const updates = { [dateField]: newDate };
    if (DRY_RUN) {
      console.log(`[dry-run] ${school.name} (${school.id}): set ${dateField}=${newDate}`);
      updated++;
      continue;
    }

    if (IS_SANDBOX) {
      const idx = schools.findIndex((s) => s.id === school.id);
      if (idx >= 0) {
        schools[idx] = { ...schools[idx], ...updates };
        updated++;
      }
    } else {
      const result = await updateSchool(school.id, updates);
      if (result) updated++;
    }
  }

  if (!DRY_RUN && IS_SANDBOX && updated > 0) {
    fs.writeFileSync(SCHOOLS_SANDBOX_FILE, JSON.stringify(schools, null, 2), 'utf-8');
  }

  console.log(`Done. Updated ${updated} school(s).`);
}

runSync().catch((err) => {
  console.error(err);
  process.exit(1);
});
