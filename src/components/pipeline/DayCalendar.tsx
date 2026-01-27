import { useState, useMemo } from 'react'
import { formatMsk, formatMskYmd } from '../../config/datetime'

interface DayCalendarProps {
  selectedDate: string | null
  onDateSelect: (date: string) => void
  filledDates?: string[] // Даты, где уже есть данные
}

const DayCalendar = ({ selectedDate, onDateSelect, filledDates = [] }: DayCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const filledDatesSet = useMemo(() => new Set(filledDates), [filledDates])

  // Генерация дней месяца
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    
    // Первый день месяца
    const firstDay = new Date(year, month, 1)
    // Последний день месяца
    const lastDay = new Date(year, month + 1, 0)
    
    // День недели первого дня (0 = воскресенье, нужно сделать понедельник = 0)
    let startDayOfWeek = firstDay.getDay() - 1
    if (startDayOfWeek < 0) startDayOfWeek = 6
    
    const days: { date: Date | null; isCurrentMonth: boolean }[] = []
    
    // Добавляем пустые ячейки для дней предыдущего месяца
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: null, isCurrentMonth: false })
    }
    
    // Добавляем дни текущего месяца
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({ date: new Date(year, month, d), isCurrentMonth: true })
    }
    
    return days
  }, [currentMonth])

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const formatDateString = (date: Date): string => {
    return formatMskYmd(date)
  }

  const today = formatMskYmd(new Date())

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-auto">
      {/* Заголовок с навигацией */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={prevMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <h2 className="text-lg font-semibold text-gray-800">
          {formatMsk(currentMonth, { month: 'long', year: 'numeric' })}
        </h2>
        
        <button
          onClick={nextMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Дни недели */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map(day => (
          <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Дни месяца */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, index) => {
          if (!day.date) {
            return <div key={index} className="p-2" />
          }

          const dateStr = formatDateString(day.date)
          const isSelected = dateStr === selectedDate
          const isToday = dateStr === today
          const isFilled = filledDatesSet.has(dateStr)
          const isPast = dateStr < today
          const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6

          return (
            <button
              key={index}
              onClick={() => onDateSelect(dateStr)}
              className={`
                relative p-2 text-sm rounded-lg transition-all
                ${isSelected 
                  ? 'bg-blue-600 text-white font-bold' 
                  : isToday 
                    ? 'bg-blue-100 text-blue-800 font-medium'
                    : isPast
                      ? 'text-gray-400 hover:bg-gray-100'
                      : isWeekend
                        ? 'text-gray-500 hover:bg-gray-100'
                        : 'text-gray-700 hover:bg-gray-100'
                }
              `}
            >
              {day.date.getDate()}
              
              {/* Индикатор заполненного дня */}
              {isFilled && !isSelected && (
                <span className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-green-500 rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* Легенда */}
      <div className="mt-4 pt-4 border-t flex items-center justify-center gap-6 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-blue-600 rounded-full" />
          <span>Выбран</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          <span>Заполнен</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-blue-100 rounded" />
          <span>Сегодня</span>
        </div>
      </div>

      {/* Выбранная дата */}
      {selectedDate && (
        <div className="mt-4 text-center">
          <span className="text-sm text-gray-600">Выбрана дата: </span>
          <span className="font-semibold text-gray-800">
            {formatMsk(selectedDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
      )}
    </div>
  )
}

export default DayCalendar
