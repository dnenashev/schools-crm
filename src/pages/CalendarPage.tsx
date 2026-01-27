import { useState, useEffect, useCallback } from 'react'
import { Visit } from '../types/visit'
import { useApiUrl, authenticatedFetch } from '../config/api'
import WeekView from '../components/calendar/WeekView'
import AddVisitModal from '../components/calendar/AddVisitModal'

// Получить понедельник недели для даты
const getMonday = (d: Date): Date => {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

// Форматировать дату в YYYY-MM-DD
const formatDate = (d: Date): string => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Добавить дни к дате
const addDays = (d: Date, days: number): Date => {
  const result = new Date(d)
  result.setDate(result.getDate() + days)
  return result
}

// Форматировать период для заголовка
const formatPeriod = (monday: Date): string => {
  const sunday = addDays(monday, 6)
  const monthNames = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ]

  const startDay = monday.getDate()
  const endDay = sunday.getDate()
  const startMonth = monthNames[monday.getMonth()]
  const endMonth = monthNames[sunday.getMonth()]
  const year = monday.getFullYear()

  if (monday.getMonth() === sunday.getMonth()) {
    return `${startDay} — ${endDay} ${startMonth} ${year}`
  }
  return `${startDay} ${startMonth} — ${endDay} ${endMonth} ${year}`
}

const CalendarPage = () => {
  const API_URL = useApiUrl()
  const [currentMonday, setCurrentMonday] = useState<Date>(() => getMonday(new Date()))
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)

  // Модальное окно
  const [modalOpen, setModalOpen] = useState(false)
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null)
  const [prefilledDate, setPrefilledDate] = useState<string | null>(null)
  const [prefilledTime, setPrefilledTime] = useState<string | null>(null)

  // Вычисляем воскресенье
  const currentSunday = addDays(currentMonday, 6)

  // Загрузка выездов
  const loadVisits = useCallback(async () => {
    setLoading(true)
    try {
      const from = formatDate(currentMonday)
      const to = formatDate(currentSunday)
      const res = await authenticatedFetch(`${API_URL}/visits?from=${from}&to=${to}`)
      if (res.ok) {
        const data = await res.json()
        setVisits(data)
      }
    } catch (error) {
      console.error('Error loading visits:', error)
    } finally {
      setLoading(false)
    }
  }, [API_URL, currentMonday, currentSunday])

  useEffect(() => {
    loadVisits()
  }, [loadVisits])

  // Навигация
  const goToPrevWeek = () => {
    setCurrentMonday(addDays(currentMonday, -7))
  }

  const goToNextWeek = () => {
    setCurrentMonday(addDays(currentMonday, 7))
  }

  const goToToday = () => {
    setCurrentMonday(getMonday(new Date()))
  }

  // Обработчики модального окна
  const handleAddVisit = (date?: string, time?: string) => {
    setEditingVisit(null)
    setPrefilledDate(date || null)
    setPrefilledTime(time || null)
    setModalOpen(true)
  }

  const handleEditVisit = (visit: Visit) => {
    setEditingVisit(visit)
    setPrefilledDate(null)
    setPrefilledTime(null)
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setEditingVisit(null)
    setPrefilledDate(null)
    setPrefilledTime(null)
  }

  const handleSaveVisit = async () => {
    await loadVisits()
    handleCloseModal()
  }

  const handleDeleteVisit = async (visitId: string) => {
    if (!confirm('Удалить этот выезд?')) return

    try {
      const res = await authenticatedFetch(`${API_URL}/visits/${visitId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        await loadVisits()
      }
    } catch (error) {
      console.error('Error deleting visit:', error)
    }
  }

  // Проверяем, текущая ли это неделя
  const todayMonday = getMonday(new Date())
  const isCurrentWeek = currentMonday.getTime() === todayMonday.getTime()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6">
        {/* Заголовок и навигация */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Календарь выездов</h1>
            <p className="text-gray-500 mt-1">{formatPeriod(currentMonday)}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={goToPrevWeek}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors"
              title="Предыдущая неделя"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              onClick={goToToday}
              disabled={isCurrentWeek}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                isCurrentWeek
                  ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 hover:bg-gray-100'
              }`}
            >
              Сегодня
            </button>

            <button
              onClick={goToNextWeek}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors"
              title="Следующая неделя"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <button
              onClick={() => handleAddVisit()}
              className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Добавить выезд
            </button>
          </div>
        </div>

        {/* Календарь */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">Загрузка...</div>
          </div>
        ) : (
          <WeekView
            monday={currentMonday}
            visits={visits}
            onAddVisit={handleAddVisit}
            onEditVisit={handleEditVisit}
            onDeleteVisit={handleDeleteVisit}
          />
        )}
      </div>

      {/* Модальное окно */}
      {modalOpen && (
        <AddVisitModal
          visit={editingVisit}
          prefilledDate={prefilledDate}
          prefilledTime={prefilledTime}
          onClose={handleCloseModal}
          onSave={handleSaveVisit}
        />
      )}
    </div>
  )
}

export default CalendarPage
