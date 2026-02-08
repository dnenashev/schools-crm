#!/usr/bin/env node
/**
 * Тест интеграции с AmoCRM: проверка доступа и вывод списка воронок.
 *
 * Использует из .env:
 *   AMO_DOMAIN или AMO_REDIRECT_URI
 *   AMO_ACCESS_TOKEN или AMO_LONG_TOKEN
 *   AMO_REFRESH_TOKEN или AMO_SHORT_KEY (для обновления токена при 401)
 *   INTEGRATION_ID, AMO_SECRET_KEY (для refresh)
 *
 * Usage:
 *   node scripts/test-amo-integration.js
 */

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { pingAmo, getPipelines, isAmoConfigured } from '../server/amo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function showEnvStatus() {
  const vars = {
    'AMO_DOMAIN / AMO_REDIRECT_URI': process.env.AMO_DOMAIN || process.env.AMO_REDIRECT_URI || '(не задан)',
    'AMO_ACCESS_TOKEN / AMO_LONG_TOKEN': process.env.AMO_ACCESS_TOKEN || process.env.AMO_LONG_TOKEN ? '***задан***' : '(не задан)',
    'AMO_REFRESH_TOKEN / AMO_SHORT_KEY': process.env.AMO_REFRESH_TOKEN || process.env.AMO_SHORT_KEY ? '***задан***' : '(не задан)',
    'INTEGRATION_ID': process.env.INTEGRATION_ID ? '***задан***' : '(не задан)',
    'AMO_SECRET_KEY': process.env.AMO_SECRET_KEY ? '***задан***' : '(не задан)',
  };
  console.log('Переменные окружения (.env):');
  Object.entries(vars).forEach(([k, v]) => console.log('  ', k + ':', v));
  console.log('');
}

async function main() {
  console.log('=== Тест интеграции AmoCRM ===\n');

  showEnvStatus();

  if (!isAmoConfigured()) {
    console.log('❌ Интеграция не настроена: нужны AMO_DOMAIN (или AMO_REDIRECT_URI) и AMO_ACCESS_TOKEN (или AMO_LONG_TOKEN).');
    process.exit(1);
  }

  console.log('1. Проверка доступа (GET /api/v4/account)...');
  const ping = await pingAmo();

  if (!ping.success) {
    console.log('❌ Ошибка доступа:', ping.status || '', ping.error || '');
    if (ping.status === 401) {
      console.log('   Подсказка: токен истёк или неверный. Проверьте AMO_LONG_TOKEN или обновите через OAuth (AMO_SHORT_KEY + INTEGRATION_ID + AMO_SECRET_KEY).');
    }
    process.exit(1);
  }

  console.log('✅ Доступ есть.');
  if (ping.account?.name) {
    console.log('   Аккаунт:', ping.account.name);
  }
  if (ping.account?.subdomain) {
    console.log('   Поддомен:', ping.account.subdomain);
  }
  console.log('');

  console.log('2. Список воронок (GET /api/v4/leads/pipelines)...');
  const pipelines = await getPipelines();

  if (pipelines.length === 0) {
    console.log('   (воронок не найдено или нет прав)');
  } else {
    console.log('   Всего воронок:', pipelines.length);
    console.log('');
    pipelines.forEach((p) => {
      console.log('   id:', p.id, '| название:', p.name);
      if (p.statuses && p.statuses.length > 0) {
        p.statuses.slice(0, 5).forEach((s) => console.log('      этап:', s.id, '-', s.name));
        if (p.statuses.length > 5) {
          console.log('      ... и ещё', p.statuses.length - 5, 'этапов');
        }
      }
      console.log('');
    });
    console.log('Для привязки школ задайте AMO_SCHOOLS_PIPELINE_ID = id нужной воронки (например «Школы»).');
  }

  console.log('\n✅ Тест интеграции завершён.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
