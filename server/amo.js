/**
 * AmoCRM API v4 client for Schools CRM.
 * Used for: sync lead stages to school date fields; paper leads send-to-amo.
 */
const AMO_DOMAIN = process.env.AMO_DOMAIN || process.env.AMO_REDIRECT_URI?.replace(/^https?:\/\//, '') || '';
const AMO_ACCESS_TOKEN = process.env.AMO_ACCESS_TOKEN || process.env.AMO_LONG_TOKEN || '';
const AMO_REFRESH_TOKEN = process.env.AMO_REFRESH_TOKEN || process.env.AMO_SHORT_KEY || '';
const AMO_CLIENT_ID = process.env.AMO_CLIENT_ID || process.env.INTEGRATION_ID || '';
const AMO_CLIENT_SECRET = process.env.AMO_CLIENT_SECRET || process.env.AMO_SECRET_KEY || '';

const BASE_URL = AMO_DOMAIN ? `https://${AMO_DOMAIN.replace(/^https?:\/\//, '')}` : '';

/** Не более 15 запросов в секунду к Amo API */
const AMO_RATE_LIMIT_PER_SEC = 15;
const _amoRateLimitTimestamps = [];

async function _amoRateLimitWait() {
  const now = Date.now();
  const windowStart = now - 1000;
  while (_amoRateLimitTimestamps.length > 0 && _amoRateLimitTimestamps[0] < windowStart) {
    _amoRateLimitTimestamps.shift();
  }
  if (_amoRateLimitTimestamps.length >= AMO_RATE_LIMIT_PER_SEC) {
    const waitMs = _amoRateLimitTimestamps[0] + 1000 - now;
    await new Promise((r) => setTimeout(r, Math.max(1, waitMs)));
    return _amoRateLimitWait();
  }
  _amoRateLimitTimestamps.push(now);
}

function _isRetryableNetworkError(err) {
  if (!err) return false;
  const msg = String(err.message || err);
  const code = err.cause?.code || err.code;
  return (
    msg.includes('fetch failed') ||
    msg.includes('other side closed') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('socket hang up') ||
    code === 'UND_ERR_SOCKET' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT'
  );
}

const AMO_FETCH_RETRIES = 3;
const AMO_FETCH_RETRY_DELAY_MS = 2000;

async function amoFetch(url, options) {
  await _amoRateLimitWait();
  let lastErr;
  for (let attempt = 1; attempt <= AMO_FETCH_RETRIES; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      if (attempt < AMO_FETCH_RETRIES && _isRetryableNetworkError(err)) {
        await new Promise((r) => setTimeout(r, AMO_FETCH_RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function getHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken || AMO_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Refresh access token using refresh token.
 * @returns {Promise<string|null>} New access token or null
 */
export async function refreshAccessToken() {
  if (!BASE_URL || !AMO_CLIENT_ID || !AMO_CLIENT_SECRET || !AMO_REFRESH_TOKEN) {
    console.warn('Amo: missing credentials for refresh');
    return null;
  }
  const res = await amoFetch(`${BASE_URL}/oauth2/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: AMO_CLIENT_ID,
      client_secret: AMO_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: AMO_REFRESH_TOKEN,
      redirect_uri: BASE_URL,
    }),
  });
  if (!res.ok) {
    console.warn('Amo refresh token failed:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  if (data.access_token) {
    process.env.AMO_ACCESS_TOKEN = data.access_token;
    process.env.AMO_LONG_TOKEN = data.access_token;
    if (data.refresh_token) {
      process.env.AMO_REFRESH_TOKEN = data.refresh_token;
      process.env.AMO_SHORT_KEY = data.refresh_token;
    }
    return data.access_token;
  }
  return null;
}

/**
 * Get lead by ID.
 * @param {number} leadId
 * @param {string} [accessToken]
 * @returns {Promise<{ status_id: number, pipeline_id?: number, updated_at?: number }|null>}
 */
export async function getLeadById(leadId, accessToken = AMO_ACCESS_TOKEN) {
  if (!BASE_URL || !accessToken) return null;
  const url = `${BASE_URL}/api/v4/leads/${leadId}`;
  let res = await amoFetch(url, { headers: getHeaders(accessToken) });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await amoFetch(url, { headers: getHeaders(newToken) });
    }
  }
  if (!res.ok) return null;
  const data = await res.json();
  const lead = data._embedded?.leads?.[0] || data;
  const status_id = lead.status_id;
  const pipeline_id = lead.pipeline_id;
  const updated_at = lead.updated_at; // Unix timestamp
  if (status_id == null) return null;
  return { status_id, pipeline_id, updated_at };
}

/**
 * Extract lead ID from Amo deal URL (amoLink).
 * Supports: .../leads/detail/12345, ...?id=12345, .../lead/12345
 * @param {string} amoLink
 * @returns {number|null}
 */
export function parseLeadIdFromLink(amoLink) {
  if (!amoLink || typeof amoLink !== 'string') return null;
  const trimmed = amoLink.trim();
  const detailMatch = trimmed.match(/\/leads?\/detail\/(\d+)/i);
  if (detailMatch) return parseInt(detailMatch[1], 10);
  const idParam = trimmed.match(/[?&]id=(\d+)/);
  if (idParam) return parseInt(idParam[1], 10);
  const trailingNum = trimmed.match(/\/(\d+)(?:\?|$)/);
  if (trailingNum) return parseInt(trailingNum[1], 10);
  return null;
}

/**
 * Build deal URL for a lead (for amoLink).
 * @param {number} leadId
 * @returns {string}
 */
export function buildLeadUrl(leadId) {
  if (!BASE_URL || !leadId) return '';
  const base = BASE_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${base}/leads/detail/${leadId}`;
}

/**
 * Get list of leads from a pipeline (with custom_fields_values).
 * @param {number} pipelineId
 * @param {{ page?: number, limit?: number }} [opts]
 * @returns {Promise<{ id: number, name: string, custom_fields_values?: Array<{ field_id: number, values: Array<{ value: string }> }> }[]>}
 */
export async function getLeadsByPipeline(pipelineId, opts = {}) {
  if (!BASE_URL || !AMO_ACCESS_TOKEN) return [];
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 250, 250);
  const url = `${BASE_URL}/api/v4/leads?filter[pipeline_id]=${pipelineId}&page=${page}&limit=${limit}`;
  let res = await amoFetch(url, { headers: getHeaders(AMO_ACCESS_TOKEN) });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await amoFetch(url, { headers: getHeaders(newToken) });
    }
  }
  if (!res.ok) return [];
  const data = await res.json();
  const leads = data._embedded?.leads ?? [];
  return leads;
}

/**
 * Get custom fields for leads (to find field_id for "id школы").
 * @returns {Promise<{ id: number, name: string, code?: string }[]>}
 */
export async function getLeadCustomFields() {
  if (!BASE_URL || !AMO_ACCESS_TOKEN) return [];
  const url = `${BASE_URL}/api/v4/leads/custom_fields`;
  let res = await amoFetch(url, { headers: getHeaders(AMO_ACCESS_TOKEN) });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await amoFetch(url, { headers: getHeaders(newToken) });
    }
  }
  if (!res.ok) return [];
  const data = await res.json();
  return data._embedded?.custom_fields ?? [];
}

/**
 * Extract value of a custom field from lead (first value, string).
 * @param {object} lead - lead from getLeadsByPipeline (with custom_fields_values)
 * @param {number|string} fieldId - field_id (number) or field code (string)
 * @returns {string|null}
 */
export function getLeadCustomFieldValue(lead, fieldId) {
  const values = lead.custom_fields_values;
  if (!Array.isArray(values)) return null;
  const fieldIdNum = typeof fieldId === 'string' && /^\d+$/.test(fieldId) ? parseInt(fieldId, 10) : fieldId;
  const field = values.find(
    (f) => f.field_id === fieldIdNum || f.field_id === fieldId || (f.field_code && f.field_code === fieldId)
  );
  if (!field?.values?.length) return null;
  const v = field.values[0].value;
  return typeof v === 'string' ? v.trim() : String(v).trim();
}

/**
 * Get entities linked to a lead (e.g. companies).
 * @param {number} leadId
 * @returns {Promise<Array<{ to_entity_id: number, to_entity_type: string }>>}
 */
export async function getLeadLinks(leadId) {
  if (!BASE_URL || !AMO_ACCESS_TOKEN) return [];
  const url = `${BASE_URL}/api/v4/leads/${leadId}/links`;
  let res = await amoFetch(url, { headers: getHeaders(AMO_ACCESS_TOKEN) });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await amoFetch(url, { headers: getHeaders(newToken) });
    }
  }
  if (!res.ok) return [];
  const data = await res.json();
  return data._embedded?.links ?? [];
}

/**
 * Get company by ID (with custom_fields_values).
 * @param {number} companyId
 * @returns {Promise<{ id: number, name: string, custom_fields_values?: Array }|null>}
 */
export async function getCompanyById(companyId) {
  if (!BASE_URL || !AMO_ACCESS_TOKEN) return null;
  const url = `${BASE_URL}/api/v4/companies/${companyId}`;
  let res = await amoFetch(url, { headers: getHeaders(AMO_ACCESS_TOKEN) });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await amoFetch(url, { headers: getHeaders(newToken) });
    }
  }
  if (!res.ok) return null;
  const data = await res.json();
  const company = data._embedded?.companies?.[0] ?? data;
  return company;
}

/**
 * Поиск компаний по значению кастомного поля «ID школы».
 * В API Kommo для GET /companies нет параметра «фильтр по кастомному полю» — только query (полнотекст).
 * Пробуем вариант filter[custom_fields_values]; если API вернёт 400/ошибку — не используем.
 * @param {string} schoolId — UUID школы (значение поля)
 * @param {number|string} fieldId — id кастомного поля (напр. AMO_SCHOOL_ID_FIELD_ID)
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ id: number, name: string, custom_fields_values?: Array }[]>}
 */
export async function getCompaniesBySchoolIdField(schoolId, fieldId, opts = {}) {
  if (!BASE_URL || !AMO_ACCESS_TOKEN || !schoolId || !String(schoolId).trim() || fieldId == null) return [];
  const limit = Math.min(opts.limit ?? 50, 250);
  const fieldIdNum = typeof fieldId === 'string' && /^\d+$/.test(fieldId) ? parseInt(fieldId, 10) : fieldId;
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('filter[custom_fields_values][0][field_id]', String(fieldIdNum));
  params.set('filter[custom_fields_values][0][values][0]', String(schoolId).trim());
  const url = `${BASE_URL}/api/v4/companies?${params.toString()}`;
  let res = await amoFetch(url, { headers: getHeaders(AMO_ACCESS_TOKEN) });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await amoFetch(url, { headers: getHeaders(newToken) });
  }
  if (!res.ok) return [];
  const data = await res.json();
  return data._embedded?.companies ?? [];
}

/**
 * Search companies by query string.
 * В API Kommo у GET /companies есть только параметр query — полнотекстовый поиск (название и т.д.).
 * Поиск по полю «ID школы» (кастомное поле) через query не поддерживается: API не индексирует его.
 * Поэтому используем query=UUID как попытку; для надёжной привязки скрипт использует fallback — перебор сделок воронки и проверку поля у компании.
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ id: number, name: string, custom_fields_values?: Array }[]>}
 */
export async function getCompaniesByQuery(query, opts = {}) {
  if (!BASE_URL || !AMO_ACCESS_TOKEN || !query || !String(query).trim()) return [];
  const limit = Math.min(opts.limit ?? 50, 250);
  const url = `${BASE_URL}/api/v4/companies?query=${encodeURIComponent(String(query).trim())}&limit=${limit}`;
  let res = await amoFetch(url, { headers: getHeaders(AMO_ACCESS_TOKEN) });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await amoFetch(url, { headers: getHeaders(newToken) });
    }
  }
  if (!res.ok) return [];
  const data = await res.json();
  return data._embedded?.companies ?? [];
}

/**
 * Get entities linked to a company (e.g. leads).
 * @param {number} companyId
 * @returns {Promise<Array<{ entity_id: number, entity_type: string }>>}
 */
export async function getCompanyLinks(companyId) {
  if (!BASE_URL || !AMO_ACCESS_TOKEN) return [];
  const url = `${BASE_URL}/api/v4/companies/${companyId}/links`;
  let res = await amoFetch(url, { headers: getHeaders(AMO_ACCESS_TOKEN) });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await amoFetch(url, { headers: getHeaders(newToken) });
    }
  }
  if (!res.ok) return [];
  const data = await res.json();
  const links = data._embedded?.links ?? [];
  return links;
}

/**
 * Get custom fields for companies.
 * @returns {Promise<{ id: number, name: string, code?: string }[]>}
 */
export async function getCompanyCustomFields() {
  if (!BASE_URL || !AMO_ACCESS_TOKEN) return [];
  const url = `${BASE_URL}/api/v4/companies/custom_fields`;
  let res = await amoFetch(url, { headers: getHeaders(AMO_ACCESS_TOKEN) });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await amoFetch(url, { headers: getHeaders(newToken) });
    }
  }
  if (!res.ok) return [];
  const data = await res.json();
  return data._embedded?.custom_fields ?? [];
}

/**
 * Extract value of a custom field from company (first value, string).
 * @param {object} company - company from getCompanyById (with custom_fields_values)
 * @param {number|string} fieldId
 * @returns {string|null}
 */
export function getCompanyCustomFieldValue(company, fieldId) {
  const values = company.custom_fields_values;
  if (!Array.isArray(values)) return null;
  const fieldIdNum = typeof fieldId === 'string' && /^\d+$/.test(fieldId) ? parseInt(fieldId, 10) : fieldId;
  const field = values.find(
    (f) => f.field_id === fieldIdNum || f.field_id === fieldId || (f.field_code && f.field_code === fieldId)
  );
  if (!field?.values?.length) return null;
  const v = field.values[0].value;
  return typeof v === 'string' ? v.trim() : String(v).trim();
}

export function isAmoConfigured() {
  return !!(BASE_URL && (AMO_ACCESS_TOKEN || AMO_LONG_TOKEN));
}

/**
 * Get list of pipelines (воронок).
 * @returns {Promise<{ id: number, name: string, sort: number, statuses?: Array<{ id: number, name: string }> }[]>}
 */
export async function getPipelines() {
  if (!BASE_URL || !AMO_ACCESS_TOKEN) return [];
  const url = `${BASE_URL}/api/v4/leads/pipelines`;
  let res = await amoFetch(url, { headers: getHeaders(AMO_ACCESS_TOKEN) });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await amoFetch(url, { headers: getHeaders(newToken) });
    }
  }
  if (!res.ok) return [];
  const data = await res.json();
  return data._embedded?.pipelines ?? [];
}

/**
 * Simple API ping: get current account (to test integration).
 * @returns {Promise<{ success: boolean, status?: number, error?: string, account?: object }>}
 */
export async function pingAmo() {
  if (!BASE_URL) {
    return { success: false, error: 'AMO_DOMAIN or AMO_REDIRECT_URI not set' };
  }
  if (!AMO_ACCESS_TOKEN && !AMO_LONG_TOKEN) {
    return { success: false, error: 'AMO_ACCESS_TOKEN / AMO_LONG_TOKEN not set' };
  }
  const url = `${BASE_URL}/api/v4/account`;
  let res = await amoFetch(url, { headers: getHeaders(AMO_ACCESS_TOKEN) });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await amoFetch(url, { headers: getHeaders(newToken) });
    }
  }
  if (!res.ok) {
    const text = await res.text();
    return { success: false, status: res.status, error: text || res.statusText };
  }
  const data = await res.json();
  return { success: true, account: data };
}

/**
 * Create contact in Amo CRM.
 * @param {string} fio
 * @param {string} phone
 * @returns {Promise<number|null>} Contact id or null
 */
export async function createContact(fio, phone) {
  if (!BASE_URL || !AMO_ACCESS_TOKEN) return null;
  const nameParts = (fio || '').trim().split(/\s+/);
  const first_name = nameParts[1] ?? fio ?? '';
  const last_name = nameParts[0] ?? '';
  const body = [
    {
      name: (fio || '').trim() || 'Без имени',
      first_name,
      last_name,
      custom_fields_values: (phone ? [{ field_code: 'PHONE', values: [{ value: String(phone), enum_code: 'WORK' }] }] : []),
    },
  ];
  let res = await amoFetch(`${BASE_URL}/api/v4/contacts`, {
    method: 'POST',
    headers: getHeaders(AMO_ACCESS_TOKEN),
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await amoFetch(`${BASE_URL}/api/v4/contacts`, { method: 'POST', headers: getHeaders(newToken), body: JSON.stringify(body) });
  }
  if (!res.ok) return null;
  const data = await res.json();
  const id = data._embedded?.contacts?.[0]?.id;
  return id != null ? id : null;
}

/**
 * Create lead (deal) in Amo CRM.
 * @param {number} contactId
 * @param {string} [applicationType]
 * @param {number} [parentContactId]
 * @returns {Promise<number|null>} Lead id or null
 */
export async function createLead(contactId, applicationType = '', parentContactId = null) {
  if (!BASE_URL || !AMO_ACCESS_TOKEN) return null;
  const today = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
  const leadName = applicationType ? `Заявка ${applicationType} ${today}` : `Заявка ${today}`;
  const contacts = [{ id: contactId }];
  if (parentContactId) contacts.push({ id: parentContactId });
  const leadData = {
    name: leadName,
    _embedded: {
      contacts,
      ...(applicationType ? { tags: [{ name: applicationType }] } : {}),
    },
  };
  let res = await amoFetch(`${BASE_URL}/api/v4/leads`, {
    method: 'POST',
    headers: getHeaders(AMO_ACCESS_TOKEN),
    body: JSON.stringify([leadData]),
  });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await amoFetch(`${BASE_URL}/api/v4/leads`, {
        method: 'POST',
        headers: getHeaders(newToken),
        body: JSON.stringify([leadData]),
      });
    }
  }
  if (!res.ok) return null;
  const data = await res.json();
  const id = data._embedded?.leads?.[0]?.id;
  return id != null ? id : null;
}

/**
 * Add note to lead.
 * @param {number} leadId
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function addNoteToLead(leadId, text) {
  if (!BASE_URL || !AMO_ACCESS_TOKEN) return false;
  const payload = [{ note_type: 'common', params: { text } }];
  let res = await amoFetch(`${BASE_URL}/api/v4/leads/${leadId}/notes`, {
    method: 'POST',
    headers: getHeaders(AMO_ACCESS_TOKEN),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await amoFetch(`${BASE_URL}/api/v4/leads/${leadId}/notes`, {
        method: 'POST',
        headers: getHeaders(newToken),
        body: JSON.stringify(payload),
      });
    }
  }
  return res.ok;
}
