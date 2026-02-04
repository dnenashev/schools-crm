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
  const res = await fetch(`${BASE_URL}/oauth2/access_token`, {
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
  let res = await fetch(url, { headers: getHeaders(accessToken) });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(url, { headers: getHeaders(newToken) });
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

export function isAmoConfigured() {
  return !!(BASE_URL && AMO_ACCESS_TOKEN);
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
  let res = await fetch(`${BASE_URL}/api/v4/contacts`, {
    method: 'POST',
    headers: getHeaders(AMO_ACCESS_TOKEN),
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) res = await fetch(`${BASE_URL}/api/v4/contacts`, { method: 'POST', headers: getHeaders(newToken), body: JSON.stringify(body) });
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
  let res = await fetch(`${BASE_URL}/api/v4/leads`, {
    method: 'POST',
    headers: getHeaders(AMO_ACCESS_TOKEN),
    body: JSON.stringify([leadData]),
  });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(`${BASE_URL}/api/v4/leads`, {
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
  let res = await fetch(`${BASE_URL}/api/v4/leads/${leadId}/notes`, {
    method: 'POST',
    headers: getHeaders(AMO_ACCESS_TOKEN),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await fetch(`${BASE_URL}/api/v4/leads/${leadId}/notes`, {
        method: 'POST',
        headers: getHeaders(newToken),
        body: JSON.stringify(payload),
      });
    }
  }
  return res.ok;
}
