import { useState, useEffect } from 'react'
import { useApiUrl, authenticatedFetch } from '../config/api'

interface PaperLead {
  id: string
  fio: string
  school: string
  class: string
  phone: string
  application_type: string
  parent_name?: string | null
  parent_phone?: string | null
  sent_to_amo: boolean
  created_at: string
}

const PhotoLeadsPage = () => {
  const API_URL = useApiUrl()
  const [leads, setLeads] = useState<PaperLead[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState<string | 'all' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [form, setForm] = useState({
    fio: '',
    school: '',
    class: '',
    phone: '',
    application_type: '',
    parent_name: '',
    parent_phone: '',
  })
  const [showForm, setShowForm] = useState(false)

  const loadLeads = async () => {
    setLoading(true)
    try {
      const res = await authenticatedFetch(`${API_URL}/paper-leads`)
      const data = await res.json()
      setLeads(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setMessage({ type: 'error', text: 'Ошибка загрузки списка' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLeads()
  }, [API_URL])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMessage(null)
    setUploading(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = reject
        r.readAsDataURL(file)
      })
      const res = await authenticatedFetch(`${API_URL}/paper-leads/upload`, {
        method: 'POST',
        body: JSON.stringify({ image: base64, application_type: form.application_type || '' }),
      })
      const data = await res.json()
      if (data.success && data.data) {
        setForm({
          fio: data.data.fio ?? '',
          school: data.data.school ?? '',
          class: data.data.class ?? '',
          phone: data.data.phone ?? '',
          application_type: data.application_type ?? form.application_type ?? '',
          parent_name: data.data.parent_name ?? '',
          parent_phone: data.data.parent_phone ?? '',
        })
        setShowForm(true)
        setMessage({ type: 'success', text: 'Данные распознаны. Проверьте и сохраните.' })
      } else {
        setMessage({ type: 'error', text: data.error || 'Ошибка распознавания' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message || 'Ошибка загрузки' })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await authenticatedFetch(`${API_URL}/paper-leads`, {
        method: 'POST',
        body: JSON.stringify({
          fio: form.fio,
          school: form.school,
          class: form.class,
          phone: form.phone,
          application_type: form.application_type,
          parent_name: form.parent_name || null,
          parent_phone: form.parent_phone || null,
          image_paths: [],
        }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: 'Заявка сохранена' })
        setForm({ fio: '', school: '', class: '', phone: '', application_type: '', parent_name: '', parent_phone: '' })
        setShowForm(false)
        loadLeads()
      } else {
        setMessage({ type: 'error', text: data.error || 'Ошибка сохранения' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message || 'Ошибка' })
    } finally {
      setSaving(false)
    }
  }

  const handleSendToAmo = async (ids: string[] | 'all') => {
    setSending(ids === 'all' ? 'all' : ids[0] ?? null)
    setMessage(null)
    try {
      const body = ids === 'all' ? {} : { ids }
      const res = await authenticatedFetch(`${API_URL}/paper-leads/send-to-amo`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        const failed = data.failed?.length ?? 0
        setMessage({
          type: failed > 0 ? 'error' : 'success',
          text: failed > 0
            ? `Отправлено: ${data.success?.length ?? 0}, ошибок: ${failed}`
            : `Отправлено в АМО: ${data.success?.length ?? 0}`,
        })
        loadLeads()
      } else {
        setMessage({ type: 'error', text: data.error || 'Ошибка отправки' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message || 'Ошибка' })
    } finally {
      setSending(null)
    }
  }

  const unsentLeads = leads.filter((l) => !l.sent_to_amo)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Лиды по фото</h1>
        <p className="text-gray-600 mb-6">
          Загрузите фото анкеты для распознавания, сохраните заявку и отправьте в АМО CRM.
        </p>

        {message && (
          <div
            className={`mb-4 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mb-8 p-4 bg-white rounded-lg shadow border border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-3">Загрузить фото</h2>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileSelect}
            disabled={uploading}
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700"
          />
          {uploading && <p className="mt-2 text-sm text-gray-500">Распознавание...</p>}
        </div>

        {showForm && (
          <div className="mb-8 p-4 bg-white rounded-lg shadow border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-3">Проверьте данные и сохраните</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">ФИО</label>
                <input
                  type="text"
                  value={form.fio}
                  onChange={(e) => setForm((f) => ({ ...f, fio: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Школа</label>
                <input
                  type="text"
                  value={form.school}
                  onChange={(e) => setForm((f) => ({ ...f, school: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Класс</label>
                <input
                  type="text"
                  value={form.class}
                  onChange={(e) => setForm((f) => ({ ...f, class: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Телефон</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Тип заявки</label>
                <input
                  type="text"
                  value={form.application_type}
                  onChange={(e) => setForm((f) => ({ ...f, application_type: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="например МК кибербез"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Родитель (имя)</label>
                <input
                  type="text"
                  value={form.parent_name}
                  onChange={(e) => setForm((f) => ({ ...f, parent_name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Телефон родителя</label>
                <input
                  type="text"
                  value={form.parent_phone}
                  onChange={(e) => setForm((f) => ({ ...f, parent_phone: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : 'Сохранить заявку'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gray-100 border-b flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-gray-900">Сохранённые заявки ({leads.length})</h2>
            {unsentLeads.length > 0 && (
              <button
                type="button"
                onClick={() => handleSendToAmo('all')}
                disabled={sending !== null}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {sending === 'all' ? 'Отправка...' : `Отправить все неотправленные (${unsentLeads.length})`}
              </button>
            )}
          </div>
          {loading ? (
            <div className="px-6 py-12 text-center text-gray-500">Загрузка...</div>
          ) : leads.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">Нет заявок. Загрузите фото и сохраните заявку.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">ФИО</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Школа</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Класс</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Телефон</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">В АМО</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{lead.fio}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{lead.school}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{lead.class}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{lead.phone}</td>
                      <td className="px-4 py-3 text-sm">
                        {lead.sent_to_amo ? (
                          <span className="text-green-600 font-medium">Да</span>
                        ) : (
                          <span className="text-gray-400">Нет</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {!lead.sent_to_amo && (
                          <button
                            type="button"
                            onClick={() => handleSendToAmo([lead.id])}
                            disabled={sending !== null}
                            className="text-green-600 hover:underline disabled:opacity-50"
                          >
                            {sending === lead.id ? 'Отправка...' : 'Отправить в АМО'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PhotoLeadsPage
