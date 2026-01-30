import { useMemo } from 'react'
import { Visit } from '../../types/visit'
import VisitCard from './VisitCard'

interface WeekViewProps {
  monday: Date
  visits: Visit[]
  onAddVisit: (date?: string, time?: string) => void
  onEditVisit: (visit: Visit) => void
  onDeleteVisit: (visitId: string) => void
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

// Названия дней недели
const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const parseTimeToMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

type VisitLayout = { col: number; cols: number }

const WeekView = ({ monday, visits, onAddVisit, onEditVisit, onDeleteVisit }: WeekViewProps) => {
  // Генерируем дни недели
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i)
      return {
        date,
        dateStr: formatDate(date),
        dayName: DAY_NAMES[i],
        dayNumber: date.getDate(),
        isWeekend: i >= 5, // Сб, Вс
        isToday: formatDate(date) === formatDate(new Date())
      }
    })
  }, [monday])

  // Группируем выезды по дате
  const visitsByDate = useMemo(() => {
    const map: Record<string, Visit[]> = {}
    visits.forEach(visit => {
      if (!map[visit.date]) {
        map[visit.date] = []
      }
      map[visit.date].push(visit)
    })
    // Сортируем по времени начала
    Object.values(map).forEach(arr => {
      arr.sort((a, b) => a.timeStart.localeCompare(b.timeStart))
    })
    return map
  }, [visits])

  // Google Calendar-like layout: compute columns for overlapping intervals per day
  const layoutByVisitId = useMemo(() => {
    const result: Record<string, VisitLayout> = {}

    const computeForDay = (dayVisits: Visit[]) => {
      const items = dayVisits
        .map(v => ({
          v,
          start: parseTimeToMinutes(v.timeStart),
          end: parseTimeToMinutes(v.timeEnd),
        }))
        // treat zero/invalid as minimum duration
        .map(it => ({
          ...it,
          end: Math.max(it.end, it.start + 30),
        }))
        .sort((a, b) => (a.start - b.start) || (a.end - b.end))

      // Build overlap clusters (connected components by time overlap)
      const clusters: typeof items[] = []
      let current: typeof items = []
      let currentEnd = -1

      for (const it of items) {
        if (current.length === 0) {
          current = [it]
          currentEnd = it.end
          continue
        }
        if (it.start < currentEnd) {
          current.push(it)
          currentEnd = Math.max(currentEnd, it.end)
        } else {
          clusters.push(current)
          current = [it]
          currentEnd = it.end
        }
      }
      if (current.length) clusters.push(current)

      // For each cluster, assign columns with greedy interval partitioning
      for (const cluster of clusters) {
        // active: [{ end, col }]
        const active: { end: number; col: number }[] = []
        const freeCols: number[] = []
        const colById: Record<string, number> = {}
        let maxColIndex = -1

        for (const it of cluster) {
          // release finished
          for (let i = active.length - 1; i >= 0; i--) {
            if (active[i].end <= it.start) {
              freeCols.push(active[i].col)
              active.splice(i, 1)
            }
          }
          freeCols.sort((a, b) => a - b)

          const col = freeCols.length ? (freeCols.shift() as number) : (maxColIndex + 1)
          maxColIndex = Math.max(maxColIndex, col)
          colById[it.v.id] = col
          active.push({ end: it.end, col })
        }

        const cols = Math.max(1, maxColIndex + 1)
        for (const it of cluster) {
          result[it.v.id] = { col: colById[it.v.id], cols }
        }
      }
    }

    Object.values(visitsByDate).forEach(computeForDay)
    return result
  }, [visitsByDate])

  // Временные слоты для отображения (6:00–19:00, только часы)
  const timeSlots = useMemo(() => {
    const slots: string[] = []
    for (let h = 6; h <= 19; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`)
    }
    return slots
  }, [])

  // Получить выезды для конкретного временного слота и дня
  const getVisitsForSlot = (dateStr: string, slotTime: string): Visit[] => {
    const dayVisits = visitsByDate[dateStr] || []
    return dayVisits.filter(visit => {
      // Выезд попадает в слот, если его время начала >= slotTime и < следующего слота
      const slotHour = parseInt(slotTime.split(':')[0])
      const nextSlotTime = `${String(slotHour + 1).padStart(2, '0')}:00`
      return visit.timeStart >= slotTime && visit.timeStart < nextSlotTime
    })
  }

  // Обработчик клика по ячейке
  const handleCellClick = (dateStr: string, slotTime: string) => {
    onAddVisit(dateStr, slotTime)
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Заголовок с днями */}
      <div className="grid grid-cols-8 border-b">
        {/* Колонка времени */}
        <div className="p-3 bg-gray-50 border-r text-center">
          <span className="text-sm font-medium text-gray-500">Время</span>
        </div>

        {/* Дни недели */}
        {weekDays.map((day, idx) => (
          <div
            key={idx}
            className={`p-3 text-center border-r last:border-r-0 ${
              day.isWeekend ? 'bg-gray-100' : 'bg-gray-50'
            }`}
          >
            <div className={`text-sm font-medium ${day.isWeekend ? 'text-gray-400' : 'text-gray-600'}`}>
              {day.dayName}
            </div>
            <div
              className={`text-lg font-bold mt-1 ${
                day.isToday
                  ? 'bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center mx-auto'
                  : day.isWeekend
                  ? 'text-gray-400'
                  : 'text-gray-900'
              }`}
            >
              {day.dayNumber}
            </div>
          </div>
        ))}
      </div>

      {/* Сетка времени */}
      <div className="max-h-[600px] overflow-y-auto">
        {timeSlots.map((slotTime) => (
          <div key={slotTime} className="grid grid-cols-8 border-b last:border-b-0">
            {/* Время */}
            <div className="p-2 bg-gray-50 border-r text-center">
              <span className="text-sm text-gray-500">{slotTime}</span>
            </div>

            {/* Ячейки дней */}
            {weekDays.map((day, dayIdx) => {
              const slotVisits = getVisitsForSlot(day.dateStr, slotTime)

              return (
                <div
                  key={dayIdx}
                  className={`min-h-[60px] p-1 border-r last:border-r-0 relative ${
                    day.isWeekend ? 'bg-gray-100' : 'hover:bg-blue-50'
                  } ${!day.isWeekend ? 'cursor-pointer' : ''}`}
                  onClick={() => !day.isWeekend && handleCellClick(day.dateStr, slotTime)}
                >
                  {slotVisits.map((visit) => {
                    const startMinutes = parseTimeToMinutes(visit.timeStart)
                    const endMinutes = parseTimeToMinutes(visit.timeEnd)
                    const slotStartMinutes = parseTimeToMinutes(slotTime)

                    // 60px на 1 час => 1px на 1 минуту
                    const topPx = Math.max(0, startMinutes - slotStartMinutes)
                    const durationPx = Math.max(24, endMinutes - startMinutes)

                    const layout = layoutByVisitId[visit.id] || { col: 0, cols: 1 }
                    const colWidthPct = 100 / Math.max(1, layout.cols)
                    const leftPct = layout.col * colWidthPct

                    return (
                      <div
                      key={visit.id}
                      className="absolute z-10"
                      style={{
                        top: `${topPx}px`,
                        // Делим ширину на колонки и добавляем небольшой gap,
                        // чтобы карточки не налезали друг на друга визуально.
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${colWidthPct}% - 4px)`,
                        boxSizing: 'border-box',
                        height: `${durationPx}px`,
                      }}
                      onClick={e => {
                        e.stopPropagation()
                        onEditVisit(visit)
                      }}
                    >
                      <VisitCard
                        visit={visit}
                        onDelete={() => onDeleteVisit(visit.id)}
                      />
                    </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Легенда */}
      <div className="p-3 bg-gray-50 border-t flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#3B82F6' }} />
          <span className="text-gray-600">Pati</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#10B981' }} />
          <span className="text-gray-600">Egor</span>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <div className="w-4 h-3 bg-gray-200 rounded" />
          <span className="text-gray-400">Выходные</span>
        </div>
      </div>
    </div>
  )
}

export default WeekView
