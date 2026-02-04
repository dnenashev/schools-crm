/**
 * OCR via OpenRouter (Gemini) for paper leads.
 */
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const OCR_PROMPT = `Проанализируй изображение и извлеки данные ученика.
На изображении должна быть информация о:
- ФИО (полное имя ученика)
- Школа (название школы)
- Класс (номер и буква класса, например "5А" или "11Б")
- Номер телефона
- Имя родителя (опционально, может быть не указано)
- Телефон родителя (опционально, может быть не указано)

Верни данные ТОЛЬКО в формате JSON без дополнительного текста:
{
    "fio": "Фамилия Имя Отчество",
    "school": "Название школы",
    "class": "Класс",
    "phone": "Номер телефона",
    "parent_name": "Имя родителя или null",
    "parent_phone": "Телефон родителя или null"
}

Если какое-то обязательное поле (fio, school, class, phone) не удалось распознать, оставь пустую строку.
Если опциональные поля (parent_name, parent_phone) не найдены в анкете, верни null для них.
Если это не изображение с данными ученика, верни пустые значения для всех полей.`;

function mimeFromFilename(filename) {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

/**
 * Run OCR on image buffer or base64 string; return extracted fields.
 * @param {Buffer|string} imageBufferOrBase64
 * @param {string} [filename]
 * @returns {Promise<{ fio: string, school: string, class: string, phone: string, parent_name: string|null, parent_phone: string|null, raw_response?: object }>}
 */
export async function processImageOcr(imageBufferOrBase64, filename = '') {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set');
  }
  const base64 = typeof imageBufferOrBase64 === 'string'
    ? imageBufferOrBase64.replace(/^data:image\/\w+;base64,/, '')
    : imageBufferOrBase64.toString('base64');
  const mime = mimeFromFilename(filename);
  const payload = {
    model: 'google/gemini-2.0-flash-001',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: OCR_PROMPT },
          {
            type: 'image_url',
            image_url: { url: `data:${mime};base64,${base64}` },
          },
        ],
      },
    ],
    max_tokens: 1000,
    temperature: 0.1,
  };
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://schools-crm.local',
      'X-Title': 'Schools CRM',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error: ${res.status} ${text}`);
  }
  const result = await res.json();
  const content = result.choices?.[0]?.message?.content ?? '';
  let jsonStr = content;
  if (content.includes('```json')) {
    jsonStr = content.split('```json')[1].split('```')[0].trim();
  } else if (content.includes('```')) {
    jsonStr = content.split('```')[1].split('```')[0].trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return {
      fio: '',
      school: '',
      class: '',
      phone: '',
      parent_name: null,
      parent_phone: null,
      raw_response: result,
    };
  }
  const parent_name = parsed.parent_name === '' || parsed.parent_name == null ? null : String(parsed.parent_name);
  const parent_phone = parsed.parent_phone === '' || parsed.parent_phone == null ? null : String(parsed.parent_phone);
  return {
    fio: String(parsed.fio ?? '').trim(),
    school: String(parsed.school ?? '').trim(),
    class: String(parsed.class ?? '').trim(),
    phone: String(parsed.phone ?? '').trim(),
    parent_name: parent_name || null,
    parent_phone: parent_phone || null,
    raw_response: result,
  };
}
