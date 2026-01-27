import { useState, useEffect } from 'react'
import { 
  School, 
  CallStatus, 
  DialogueStatus, 
  MeetingStatus, 
  EventStatus,
  CALL_STATUSES,
  DIALOGUE_STATUSES,
  MEETING_STATUSES,
  EVENT_STATUSES
} from '../../types/school'
import { useApiUrl } from '../../config/api'

interface SchoolEditFormProps {
  school: School
  onUpdate: () => void
  onClose: () => void
}

interface FormData {
  // В работе
  inWorkDate: string
  
  // Звонок
  callStatus: CallStatus | ''
  callDate: string
  callAttempts: number
  
  // Диалог
  dialogueStatus: DialogueStatus | ''
  dialogueDate: string
  dialogueNotes: string
  callbackDate: string
  
  // Встреча
  meetingStatus: MeetingStatus | ''
  meetingDate: string
  meetingNotes: string
  
  // Мероприятие
  eventStatus: EventStatus | ''
  eventDate: string
  eventNotes: string
  
  // Метрики
  classesCount: number
  leadsCount: number
  campusVisitsCount: number
  
  // Общие заметки
  notes: string
}

const SchoolEditForm = ({ school, onUpdate, onClose }: SchoolEditFormProps) => {
  const API_URL = useApiUrl()
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  
  const [formData, setFormData] = useState<FormData>({
    inWorkDate: school.inWorkDate || '',
    callStatus: school.callStatus || '',
    callDate: school.callDate || '',
    callAttempts: school.callAttempts || 0,
    dialogueStatus: school.dialogueStatus || '',
    dialogueDate: school.dialogueDate || '',
    dialogueNotes: school.dialogueNotes || '',
    callbackDate: school.callbackDate || '',
    meetingStatus: school.meetingStatus || '',
    meetingDate: school.meetingDate || '',
    meetingNotes: school.meetingNotes || '',
    eventStatus: school.eventStatus || '',
    eventDate: school.eventDate || '',
    eventNotes: school.eventNotes || '',
    classesCount: school.classesCount || 0,
    leadsCount: school.leadsCount || 0,
    campusVisitsCount: school.campusVisitsCount || 0,
    notes: school.notes || '',
  })

  // Обновляем форму при смене школы
  useEffect(() => {
    setFormData({
      inWorkDate: school.inWorkDate || '',
      callStatus: school.callStatus || '',
      callDate: school.callDate || '',
      callAttempts: school.callAttempts || 0,
      dialogueStatus: school.dialogueStatus || '',
      dialogueDate: school.dialogueDate || '',
      dialogueNotes: school.dialogueNotes || '',
      callbackDate: school.callbackDate || '',
      meetingStatus: school.meetingStatus || '',
      meetingDate: school.meetingDate || '',
      meetingNotes: school.meetingNotes || '',
      eventStatus: school.eventStatus || '',
      eventDate: school.eventDate || '',
      eventNotes: school.eventNotes || '',
      classesCount: school.classesCount || 0,
      leadsCount: school.leadsCount || 0,
      campusVisitsCount: school.campusVisitsCount || 0,
      notes: school.notes || '',
    })
    setHasChanges(false)
  }, [school])

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }

  const today = new Date().toISOString().split('T')[0]

  // Быстрое действие: взять в работу
  const handleTakeToWork = () => {
    updateField('inWorkDate', today)
  }

  // Быстрое действие: добавить попытку звонка
  const handleAddCallAttempt = (status: CallStatus) => {
    updateField('callStatus', status)
    updateField('callDate', today)
    if (status.startsWith('НДЗ')) {
      updateField('callAttempts', formData.callAttempts + 1)
    }
  }

  // Сохранение
  const handleSave = async () => {
    setSaving(true)
    try {
      const updateData: Partial<School> = {
        inWorkDate: formData.inWorkDate || null,
        callStatus: formData.callStatus || null,
        callDate: formData.callDate || null,
        callAttempts: formData.callAttempts,
        dialogueStatus: formData.dialogueStatus || null,
        dialogueDate: formData.dialogueDate || null,
        dialogueNotes: formData.dialogueNotes,
        callbackDate: formData.callbackDate || null,
        meetingStatus: formData.meetingStatus || null,
        meetingDate: formData.meetingDate || null,
        meetingNotes: formData.meetingNotes,
        eventStatus: formData.eventStatus || null,
        eventDate: formData.eventDate || null,
        eventNotes: formData.eventNotes,
        classesCount: formData.classesCount,
        leadsCount: formData.leadsCount,
        campusVisitsCount: formData.campusVisitsCount,
        notes: formData.notes,
        // Обновляем также старые поля для совместимости с дашбордом
        contactDate: formData.callStatus === 'дозвон' ? formData.callDate : school.contactDate,
        meetingScheduledDate: formData.meetingStatus === 'назначена' ? formData.meetingDate : school.meetingScheduledDate,
        meetingHeldDate: formData.meetingStatus === 'состоялась' ? formData.meetingDate : school.meetingHeldDate,
        eventScheduledDate: formData.eventStatus === 'запланировано' ? formData.eventDate : school.eventScheduledDate,
        eventHeldDate: formData.eventStatus === 'проведено' ? formData.eventDate : school.eventHeldDate,
      }

      const res = await fetch(`${API_URL}/schools/${school.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      if (res.ok) {
        setHasChanges(false)
        onUpdate()
      }
    } catch (error) {
      console.error('Error saving:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Заголовок */}
      <div className="px-6 py-4 border-b bg-gray-50 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{school.name}</h2>
          <p className="text-sm text-gray-500">
            {school.city}{school.district && `, ${school.district}`} • {school.region}
          </p>
          {school.uchiLink && (
            <a 
              href={school.uchiLink} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-purple-600 hover:underline"
            >
              Учи.ру →
            </a>
          )}
        </div>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Форма */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Секция: В работе */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            Взято в работу
          </h3>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!formData.inWorkDate}
                onChange={(e) => updateField('inWorkDate', e.target.checked ? today : '')}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">В работе</span>
            </label>
            {formData.inWorkDate && (
              <input
                type="date"
                value={formData.inWorkDate}
                onChange={(e) => updateField('inWorkDate', e.target.value)}
                className="px-2 py-1 border rounded text-sm"
              />
            )}
            {!formData.inWorkDate && (
              <button
                onClick={handleTakeToWork}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                Взять в работу
              </button>
            )}
          </div>
        </section>

        {/* Секция: Звонок */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
            Звонок
          </h3>
          <div className="space-y-3">
            {/* Быстрые кнопки */}
            <div className="flex flex-wrap gap-2">
              {CALL_STATUSES.map(status => (
                <button
                  key={status.value}
                  onClick={() => handleAddCallAttempt(status.value)}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    formData.callStatus === status.value
                      ? 'bg-yellow-500 text-white'
                      : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                  }`}
                >
                  {status.label}
                </button>
              ))}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Дата звонка</label>
                <input
                  type="date"
                  value={formData.callDate}
                  onChange={(e) => updateField('callDate', e.target.value)}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Попыток</label>
                <input
                  type="number"
                  min="0"
                  value={formData.callAttempts}
                  onChange={(e) => updateField('callAttempts', parseInt(e.target.value) || 0)}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Секция: Диалог */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Диалог
          </h3>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {DIALOGUE_STATUSES.map(status => (
                <button
                  key={status.value}
                  onClick={() => {
                    updateField('dialogueStatus', status.value)
                    if (!formData.dialogueDate) {
                      updateField('dialogueDate', today)
                    }
                  }}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    formData.dialogueStatus === status.value
                      ? 'bg-green-500 text-white'
                      : 'bg-green-100 text-green-800 hover:bg-green-200'
                  }`}
                >
                  {status.label}
                </button>
              ))}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Дата диалога</label>
                <input
                  type="date"
                  value={formData.dialogueDate}
                  onChange={(e) => updateField('dialogueDate', e.target.value)}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Дата перезвона</label>
                <input
                  type="date"
                  value={formData.callbackDate}
                  onChange={(e) => updateField('callbackDate', e.target.value)}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs text-gray-500 mb-1">Примечание к диалогу</label>
              <textarea
                value={formData.dialogueNotes}
                onChange={(e) => updateField('dialogueNotes', e.target.value)}
                rows={2}
                className="w-full px-2 py-1.5 border rounded text-sm"
                placeholder="Детали разговора..."
              />
            </div>
          </div>
        </section>

        {/* Секция: Встреча */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            Встреча
          </h3>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {MEETING_STATUSES.map(status => (
                <button
                  key={status.value}
                  onClick={() => {
                    updateField('meetingStatus', status.value)
                    if (!formData.meetingDate) {
                      updateField('meetingDate', today)
                    }
                  }}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    formData.meetingStatus === status.value
                      ? 'bg-purple-500 text-white'
                      : 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                  }`}
                >
                  {status.label}
                </button>
              ))}
              {formData.meetingStatus && (
                <button
                  onClick={() => {
                    updateField('meetingStatus', '')
                    updateField('meetingDate', '')
                  }}
                  className="px-3 py-1.5 text-sm rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  Сбросить
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Дата встречи</label>
                <input
                  type="date"
                  value={formData.meetingDate}
                  onChange={(e) => updateField('meetingDate', e.target.value)}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs text-gray-500 mb-1">Примечание к встрече</label>
              <textarea
                value={formData.meetingNotes}
                onChange={(e) => updateField('meetingNotes', e.target.value)}
                rows={2}
                className="w-full px-2 py-1.5 border rounded text-sm"
                placeholder="Результат встречи..."
              />
            </div>
          </div>
        </section>

        {/* Секция: Мероприятие */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            Мероприятие
          </h3>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {EVENT_STATUSES.map(status => (
                <button
                  key={status.value}
                  onClick={() => {
                    updateField('eventStatus', status.value)
                    if (!formData.eventDate) {
                      updateField('eventDate', today)
                    }
                  }}
                  className={`px-3 py-1.5 text-sm rounded transition-colors ${
                    formData.eventStatus === status.value
                      ? 'bg-orange-500 text-white'
                      : 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                  }`}
                >
                  {status.label}
                </button>
              ))}
              {formData.eventStatus && (
                <button
                  onClick={() => {
                    updateField('eventStatus', '')
                    updateField('eventDate', '')
                  }}
                  className="px-3 py-1.5 text-sm rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  Сбросить
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Дата мероприятия</label>
                <input
                  type="date"
                  value={formData.eventDate}
                  onChange={(e) => updateField('eventDate', e.target.value)}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs text-gray-500 mb-1">Примечание к мероприятию</label>
              <textarea
                value={formData.eventNotes}
                onChange={(e) => updateField('eventNotes', e.target.value)}
                rows={2}
                className="w-full px-2 py-1.5 border rounded text-sm"
                placeholder="Детали мероприятия..."
              />
            </div>
          </div>
        </section>

        {/* Секция: Метрики */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
            Метрики
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Кол-во классов</label>
              <input
                type="number"
                min="0"
                value={formData.classesCount}
                onChange={(e) => updateField('classesCount', parseInt(e.target.value) || 0)}
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Кол-во лидов</label>
              <input
                type="number"
                min="0"
                value={formData.leadsCount}
                onChange={(e) => updateField('leadsCount', parseInt(e.target.value) || 0)}
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Приезды на кампус</label>
              <input
                type="number"
                min="0"
                value={formData.campusVisitsCount}
                onChange={(e) => updateField('campusVisitsCount', parseInt(e.target.value) || 0)}
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
            </div>
          </div>
        </section>

        {/* Секция: Общие заметки */}
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Общие заметки</h3>
          <textarea
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border rounded text-sm"
            placeholder="Дополнительная информация о школе..."
          />
        </section>
      </div>

      {/* Кнопка сохранения */}
      <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
        <div>
          {hasChanges && (
            <span className="text-sm text-orange-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              Есть несохраненные изменения
            </span>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${
            hasChanges
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
          }`}
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}

export default SchoolEditForm
