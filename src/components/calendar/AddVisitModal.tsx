import { useState, useEffect, useMemo } from 'react'
import { Visit, VisitType, VISIT_TYPES, MANAGERS, TIME_SLOTS } from '../../types/visit'
import { School, UNKNOWN_SCHOOL_ID } from '../../types/school'
import { useApiUrl, authenticatedFetch } from '../../config/api'

interface AddVisitModalProps {
  visit: Visit | null // null = создание, объект = редактирование
  prefilledDate: string | null
  prefilledTime: string | null
  onClose: () => void
  onSave: () => Promise<void>
}

const AddVisitModal = ({ visit, prefilledDate, prefilledTime, onClose, onSave }: AddVisitModalProps) => {
  const API_URL = useApiUrl()
  const isEditing = !!visit

  // Состояние формы
  const [managerId, setManagerId] = useState(visit?.managerId || 'pati')
  const [date, setDate] = useState(visit?.date || prefilledDate || '')
  const [timeStart, setTimeStart] = useState(visit?.timeStart || prefilledTime || '10:00')
  const [timeEnd, setTimeEnd] = useState(visit?.timeEnd || '11:00')
  const [type, setType] = useState<VisitType>(visit?.type || 'director_meeting')
  const [schoolId, setSchoolId] = useState(visit?.schoolId || '')
  const [schoolName, setSchoolName] = useState(visit?.schoolName || '')
  const [notes, setNotes] = useState(visit?.notes || '')

  // Поиск школ
  const [schools, setSchools] = useState<School[]>([])
  const [schoolSearch, setSchoolSearch] = useState('')
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false)
  const [loadingSchools, setLoadingSchools] = useState(false)

  // Сохранение
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Загрузка списка школ
  useEffect(() => {
    const loadSchools = async () => {
      setLoadingSchools(true)
      try {
        const res = await authenticatedFetch(`${API_URL}/schools`)
        if (res.ok) {
          const data = await res.json()
          // Фильтруем служебные записи
          const filtered = data.filter((s: School) => s.id !== UNKNOWN_SCHOOL_ID && !s.id.startsWith('unknown_'))
          setSchools(filtered)
        }
      } catch (error) {
        console.error('Error loading schools:', error)
      } finally {
        setLoadingSchools(false)
      }
    }
    loadSchools()
  }, [API_URL])

  // Автоматическое вычисление времени окончания
  useEffect(() => {
    if (timeStart) {
      const [hours, minutes] = timeStart.split(':').map(Number)
      const endHours = hours + 1
      if (endHours <= 19) {
        setTimeEnd(`${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`)
      }
    }
  }, [timeStart])

  // Фильтрация школ по поиску
  const filteredSchools = useMemo(() => {
    if (!schoolSearch.trim()) return schools.slice(0, 50) // Показываем первые 50 по умолчанию

    const searchLower = schoolSearch.toLowerCase()
    return schools
      .filter(s =>
        s.name.toLowerCase().includes(searchLower) ||
        s.city?.toLowerCase().includes(searchLower) ||
        s.district?.toLowerCase().includes(searchLower)
      )
      .slice(0, 50)
  }, [schools, schoolSearch])

  // Выбор школы
  const handleSelectSchool = (school: School) => {
    setSchoolId(school.id)
    setSchoolName(school.name)
    setSchoolSearch('')
    setShowSchoolDropdown(false)
  }

  // Валидация
  const isValid = useMemo(() => {
    const baseOk = Boolean(managerId && date && timeStart && timeEnd && type)
    if (!baseOk) return false
    if (type === 'calls') return true
    return Boolean(schoolId && schoolName)
  }, [managerId, date, timeStart, timeEnd, type, schoolId, schoolName])

  // Сохранение
  const handleSave = async () => {
    if (!isValid) return

    setSaving(true)
    try {
      const managerName = MANAGERS.find(m => m.id === managerId)?.name || managerId

      const payload = {
        managerId,
        managerName,
        date,
        timeStart,
        timeEnd,
        type,
        ...(type === 'calls' ? {} : { schoolId, schoolName }),
        notes: notes.trim()
      }

      const url = isEditing ? `${API_URL}/visits/${visit.id}` : `${API_URL}/visits`
      const method = isEditing ? 'PUT' : 'POST'

      const res = await authenticatedFetch(url, {
        method,
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        await onSave()
      } else {
        const error = await res.json()
        alert(error.error || 'Ошибка сохранения')
      }
    } catch (error) {
      console.error('Error saving visit:', error)
      alert('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!visit) return
    if (!confirm('Удалить этот выезд?')) return

    setDeleting(true)
    try {
      const res = await authenticatedFetch(`${API_URL}/visits/${visit.id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        await onSave()
      } else {
        const error = await res.json()
        alert(error.error || 'Ошибка удаления')
      }
    } catch (error) {
      console.error('Error deleting visit:', error)
      alert('Ошибка удаления')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Заголовок */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {isEditing ? 'Редактировать выезд' : 'Новый выезд'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Форма */}
        <div className="px-6 py-4 space-y-4">
          {/* Менеджер */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Менеджер</label>
            <div className="flex gap-3">
              {MANAGERS.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setManagerId(m.id)}
                  className={`px-4 py-2 rounded-lg border-2 transition-all ${
                    managerId === m.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={managerId === m.id ? { borderColor: m.color } : {}}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          {/* Дата */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Дата</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {/* Время */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Начало</label>
              <select
                value={timeStart}
                onChange={e => setTimeStart(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {TIME_SLOTS.filter(t => t < '19:00').map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Окончание</label>
              <select
                value={timeEnd}
                onChange={e => setTimeEnd(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                {TIME_SLOTS.filter(t => t > timeStart).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Тип выезда */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Тип выезда</label>
            <div className="space-y-2">
              {VISIT_TYPES.map(vt => (
                <label
                  key={vt.value}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                    type === vt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="visitType"
                    value={vt.value}
                    checked={type === vt.value}
                    onChange={e => {
                      const nextType = e.target.value as VisitType
                      setType(nextType)
                      if (nextType === 'calls') {
                        setSchoolId('')
                        setSchoolName('')
                        setSchoolSearch('')
                        setShowSchoolDropdown(false)
                      }
                    }}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-700">{vt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Школа */}
          {type !== 'calls' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Школа</label>
              <div className="relative">
                {schoolName ? (
                  <div className="flex items-center gap-2 p-3 border border-gray-300 rounded-lg bg-gray-50">
                    <span className="flex-1 text-gray-700">{schoolName}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSchoolId('')
                        setSchoolName('')
                      }}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Поиск школы..."
                      value={schoolSearch}
                      onChange={e => {
                        setSchoolSearch(e.target.value)
                        setShowSchoolDropdown(true)
                      }}
                      onFocus={() => setShowSchoolDropdown(true)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    {showSchoolDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {loadingSchools ? (
                          <div className="p-3 text-gray-500 text-center">Загрузка...</div>
                        ) : filteredSchools.length === 0 ? (
                          <div className="p-3 text-gray-500 text-center">Ничего не найдено</div>
                        ) : (
                          filteredSchools.map(school => (
                            <button
                              key={school.id}
                              type="button"
                              onClick={() => handleSelectSchool(school)}
                              className="w-full px-4 py-2 text-left hover:bg-blue-50 transition-colors"
                            >
                              <div className="font-medium text-gray-800">{school.name}</div>
                              {(school.city || school.district) && (
                                <div className="text-xs text-gray-500">
                                  {[school.city, school.district].filter(Boolean).join(', ')}
                                </div>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Заметки */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Заметки (необязательно)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Дополнительная информация..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            />
          </div>
        </div>

        {/* Кнопки */}
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          {isEditing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving || deleting}
              className={`mr-auto px-4 py-2 rounded-lg border transition-colors ${
                saving || deleting
                  ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'border-red-300 text-red-700 hover:bg-red-50'
              }`}
              title="Удалить выезд"
            >
              {deleting ? 'Удаление...' : 'Удалить'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid || saving || deleting}
            className={`px-6 py-2 rounded-lg transition-colors ${
              isValid && !saving && !deleting
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {saving ? 'Сохранение...' : isEditing ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>

      {/* Клик вне модального окна для закрытия dropdown */}
      {showSchoolDropdown && type !== 'calls' && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowSchoolDropdown(false)}
        />
      )}
    </div>
  )
}

export default AddVisitModal
