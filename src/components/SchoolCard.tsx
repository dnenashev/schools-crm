import { useState } from 'react'
import { School, Activity } from '../types/school'
import { useApiUrl, authenticatedFetch } from '../config/api'
import { useAuth } from './AuthProvider'
import { formatMsk } from '../config/datetime'

interface SchoolCardProps {
  school: School
  onClose: () => void
  onUpdate: () => void
}

// Конфигурация этапных метрик (уникальные школы, по датам)
const STAGE_FIELDS = [
  { key: 'inWorkDate', label: 'Новые школы' },
  { key: 'contactDate', label: 'Контакт состоялся' },
  { key: 'meetingScheduledDate', label: 'Встреча назначена' },
  { key: 'meetingHeldDate', label: 'Встреча состоялась' },
  { key: 'eventScheduledDate', label: 'Мероприятие назначено' },
  { key: 'eventHeldDate', label: 'Мероприятие проведено' },
  { key: 'excursionPlannedDate', label: 'Экскурсия запланирована' },
]

const NUMERIC_FIELDS: Array<{ key: keyof NonNullable<Activity['metrics']> | 'parentContactsLegacy'; label: string }> = [
  { key: 'parentContacts', label: 'Кол-во контактов родителя' },
  { key: 'loadedToCRM', label: 'Кол-во загруженных в CRM' },
  { key: 'qualifiedLeads', label: 'Квал заявки' },
  { key: 'arrivedToCampus', label: 'Доехавшие до кампуса' },
  { key: 'preliminaryMeetings', label: 'Предвары' },
]

const SchoolCard = ({ school, onClose, onUpdate }: SchoolCardProps) => {
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [notes, setNotes] = useState(school.notes || '')
  const [callbackDate, setCallbackDate] = useState(school.callbackDate || '')
  const [callsLink, setCallsLink] = useState(school.callsLink || '')
  const [savingCallsLink, setSavingCallsLink] = useState(false)
  const [saving, setSaving] = useState(false)
  const API_URL = useApiUrl()
  const { isAdmin } = useAuth()

  const normalizeUrl = (raw: string): string => {
    const v = raw.trim()
    if (!v) return ''
    if (/^https?:\/\//i.test(v)) return v
    return `https://${v}`
  }

  const saveCallsLink = async () => {
    setSavingCallsLink(true)
    try {
      const response = await authenticatedFetch(`${API_URL}/schools/${school.id}`, {
        method: 'PUT',
        body: JSON.stringify({ callsLink: callsLink.trim() })
      })

      if (response.ok) {
        onUpdate()
      } else {
        const data = await response.json()
        alert(data.error || 'Ошибка сохранения')
      }
    } catch (error) {
      console.error('Error saving calls link:', error)
      alert('Ошибка сохранения')
    } finally {
      setSavingCallsLink(false)
    }
  }

  // Сохранение изменения статуса (только для админов)
  const saveStatus = async (field: string, value: string | null) => {
    if (!isAdmin) {
      alert('Редактирование доступно только администраторам')
      return
    }

    setSaving(true)
    try {
      const response = await authenticatedFetch(`${API_URL}/schools/${school.id}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: value || null })
      })

      if (response.ok) {
        onUpdate()
      } else {
        const data = await response.json()
        alert(data.error || 'Ошибка сохранения')
      }
    } catch (error) {
      console.error('Error saving:', error)
      alert('Ошибка сохранения')
    } finally {
      setSaving(false)
      setEditingField(null)
    }
  }

  // Сохранение заметок (только для админов)
  const saveNotes = async () => {
    if (!isAdmin) {
      alert('Редактирование доступно только администраторам')
      return
    }

    setSaving(true)
    try {
      const response = await authenticatedFetch(`${API_URL}/schools/${school.id}`, {
        method: 'PUT',
        body: JSON.stringify({ notes, callbackDate: callbackDate || null })
      })

      if (response.ok) {
        onUpdate()
      } else {
        const data = await response.json()
        alert(data.error || 'Ошибка сохранения')
      }
    } catch (error) {
      console.error('Error saving notes:', error)
      alert('Ошибка сохранения заметок')
    } finally {
      setSaving(false)
    }
  }

  // Форматирование даты
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—'
    return formatMsk(dateStr, { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // Тип активности на русском
  const getActivityTypeLabel = (type: Activity['type']): string => {
    const labels: Record<string, string> = {
      contact: 'Контакт',
      meeting: 'Встреча',
      event: 'Мероприятие',
      call: 'Звонок',
      note: 'Заметка',
      campus_visit: 'Выезд на кампус',
      numeric_metrics: 'Числовые метрики',
      funnel_metrics: 'Воронка (количеством)'
    }
    return labels[type] || type
  }

  const metricKeyToLabel = (key: string): string => {
    const map: Record<string, string> = {
      newSchools: 'Новые школы',
      contactMade: 'Контакт состоялся',
      meetingScheduled: 'Встреча назначена',
      meetingHeld: 'Встреча состоялась',
      eventScheduled: 'Мероприятие назначено',
      eventHeld: 'Мероприятие проведено',
      excursionPlanned: 'Экскурсия запланирована',
      parentContacts: 'Кол-во контактов родителя',
      loadedToCRM: 'Кол-во загруженных в CRM',
      qualifiedLeads: 'Квал заявки',
      arrivedToCampus: 'Доехавшие до кампуса',
      preliminaryMeetings: 'Предвары',
    }
    return map[key] || key
  }

  const getNumericTotal = (metricKey: string): { total: number; lastDate: string | null } => {
    if (!school.activities || school.activities.length === 0) return { total: 0, lastDate: null }
    let total = 0
    let lastDate: string | null = null

    for (const a of school.activities) {
      if (!a?.date) continue
      const value =
        metricKey === 'parentContacts'
          ? (a.parentContacts || 0) + (typeof a.metrics?.parentContacts === 'number' ? a.metrics.parentContacts : 0)
          : (typeof a.metrics?.[metricKey] === 'number' ? (a.metrics as any)[metricKey] : 0)

      if (value > 0) {
        total += value
        if (!lastDate || a.date > lastDate) lastDate = a.date
      }
    }

    return { total, lastDate }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="px-6 py-4 bg-blue-600 text-white sticky top-0">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold">{school.name}</h2>
              <p className="text-blue-200 text-sm mt-1">
                {school.city}{school.district && `, ${school.district}`}
              </p>
            </div>
            <button onClick={onClose} className="text-white hover:text-blue-200 text-2xl">×</button>
          </div>
        </div>

        <div className="p-6">
          {/* Информация о школе */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Информация</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Регион:</span>
                <span className="ml-2 font-medium">{school.region}</span>
              </div>
              <div>
                <span className="text-gray-500">Адрес:</span>
                <span className="ml-2 font-medium">{school.address || '—'}</span>
              </div>
              <div>
                <span className="text-gray-500">Время до МР:</span>
                <span className="ml-2 font-medium">{school.travelTime || '—'}</span>
              </div>
              <div>
                <span className="text-gray-500">Теги:</span>
                <span className="ml-2">
                  {school.tags.map((tag, i) => (
                    <span key={i} className="inline-block px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs mr-1">
                      {tag}
                    </span>
                  ))}
                </span>
              </div>
            </div>

            {/* Ссылки */}
            <div className="flex gap-3 mt-3">
              {school.uchiLink && (
                <a href={school.uchiLink} target="_blank" rel="noopener noreferrer"
                   className="text-purple-600 hover:underline text-sm">Учи.ру</a>
              )}
              {school.website && (
                <a href={school.website} target="_blank" rel="noopener noreferrer"
                   className="text-blue-600 hover:underline text-sm">Сайт</a>
              )}
              {school.amoLink && (
                <a href={school.amoLink} target="_blank" rel="noopener noreferrer"
                   className="text-green-600 hover:underline text-sm">АМО CRM</a>
              )}
              {school.callsLink && (
                <a
                  href={normalizeUrl(school.callsLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-700 hover:underline text-sm"
                >
                  Звонки
                </a>
              )}
            </div>

            {/* Ссылка на звонки (редактируется менеджерами) */}
            <div className="mt-4">
              <label className="block text-sm text-gray-600 mb-1">
                Ссылка на звонки (Meet/Zoom)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={callsLink}
                  onChange={(e) => setCallsLink(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                />
                <button
                  onClick={saveCallsLink}
                  disabled={savingCallsLink}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm disabled:opacity-50"
                  title="Сохранить ссылку"
                >
                  {savingCallsLink ? '...' : 'Сохранить'}
                </button>
              </div>
              {callsLink.trim() && (
                <div className="mt-2">
                  <a
                    href={normalizeUrl(callsLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-orange-700 hover:underline"
                  >
                    Открыть ссылку →
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Метрики (порядок как в ТЗ) */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Метрики</h3>
            <div className="space-y-2">
              {STAGE_FIELDS.map(({ key, label }) => {
                const value = school[key as keyof School] as string | null
                const isEditing = editingField === key

                return (
                  <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-sm text-gray-700">{label}</span>

                    {isEditing && isAdmin ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="px-2 py-1 border rounded text-sm"
                        />
                        <button
                          onClick={() => saveStatus(key, editValue)}
                          disabled={saving}
                          className="px-2 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setEditingField(null)}
                          className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${value ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                          {formatDate(value)}
                        </span>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => {
                                setEditingField(key)
                                setEditValue(value || new Date().toISOString().split('T')[0])
                              }}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              {value ? 'изм.' : 'уст.'}
                            </button>
                            {value && (
                              <button
                                onClick={() => saveStatus(key, null)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                сбр.
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Числовые метрики (сумма по активностям) */}
            <div className="mt-6 pt-4 border-t">
              <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                Числовые метрики
              </h4>
              <div className="space-y-2">
                {NUMERIC_FIELDS.map(({ key, label }) => {
                  const stats = getNumericTotal(String(key))
                  const value = stats.total
                  return (
                    <div key={String(key)} className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-700">{label}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-medium ${value > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                          {value > 0 ? value : '—'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {stats.lastDate ? `посл.: ${formatDate(stats.lastDate)}` : ''}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Числовые метрики считаются как сумма по активностям (пайплайн «Заполнить данные»).
              </p>
            </div>
          </div>

          {/* Перезвон и заметки */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">Перезвон и заметки</h3>
            {isAdmin ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Дата перезвона</label>
                  <input
                    type="date"
                    value={callbackDate}
                    onChange={(e) => setCallbackDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Заметки</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="Заметки о школе..."
                  />
                </div>
                <button
                  onClick={saveNotes}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
                >
                  {saving ? 'Сохранение...' : 'Сохранить заметки'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {callbackDate && (
                  <div className="text-sm">
                    <span className="text-gray-500">Дата перезвона:</span>
                    <span className="ml-2 font-medium">{formatDate(callbackDate)}</span>
                  </div>
                )}
                {notes ? (
                  <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
                    {notes}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">Нет заметок</p>
                )}
                <p className="text-xs text-gray-400 italic mt-2">
                  Редактирование доступно только администраторам
                </p>
              </div>
            )}
          </div>

          {/* История активностей */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">
              История активностей ({school.activities?.length || 0})
            </h3>
            {!school.activities || school.activities.length === 0 ? (
              <p className="text-gray-500 text-sm">Нет активностей</p>
            ) : (
              <div className="space-y-2">
                {school.activities.sort((a, b) => b.date.localeCompare(a.date)).map(activity => (
                  <div key={activity.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {getActivityTypeLabel(activity.type)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDate(activity.date)}
                        {(activity.createdByName || activity.createdBy) && (
                          <span className="text-gray-400">{` • ${activity.createdByName || activity.createdBy}`}</span>
                        )}
                      </span>
                    </div>
                    {activity.description && (
                      <p className="text-sm text-gray-600 mt-1">{activity.description}</p>
                    )}
                    {(activity.parentContacts || activity.metrics || activity.classesContacted?.length) && (
                      <div className="text-xs text-gray-500 mt-1">
                        {(() => {
                          const parentContacts = activity.parentContacts ?? 0
                          return parentContacts > 0 ? (
                            <span className="mr-3">Родители: {parentContacts}</span>
                          ) : null
                        })()}
                        {activity.metrics && Object.keys(activity.metrics).length > 0 && (
                          <span className="mr-3">
                            Метрики: {Object.entries(activity.metrics)
                              .filter(([, v]) => typeof v === 'number' && v > 0)
                              .map(([k, v]) => `${metricKeyToLabel(k)}: ${v}`)
                              .join(', ')}
                          </span>
                        )}
                        {(() => {
                          const classes = activity.classesContacted ?? []
                          return classes.length > 0 ? <span>Классы: {classes.join(', ')}</span> : null
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Кнопка закрытия */}
        <div className="px-6 py-4 bg-gray-50 sticky bottom-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

export default SchoolCard
