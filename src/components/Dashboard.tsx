import { useState, useMemo, useEffect } from 'react'
import { School, METRICS_CONFIG, MetricKey, MonthlyPlan } from '../types/school'
import { useApiUrl } from '../config/api'
import { formatMsk, formatMskYmd } from '../config/datetime'

const NUMERIC_SUM_KEYS: MetricKey[] = [
  'parentContacts',
  'loadedToCRM',
  'qualifiedLeads',
  'arrivedToCampus',
  'preliminaryMeetings',
]

// Конфигурация производных метрик (конверсии/средние)
type DerivedKind = 'ratioPercent' | 'avgNumber'

interface DerivedMetricConfig {
  key: string
  label: string
  kind: DerivedKind
  // Для ratioPercent: числитель/знаменатель — значения метрик (fact)
  numeratorKey?: MetricKey
  denominatorKey?: MetricKey
  // Для avgNumber: числитель — значение метрики (fact), знаменатель — кастомный расчёт
  denominatorCustom?: 'schoolsWithLoadedToCRM' | 'classesSumForSchoolsWithLoadedToCRM'
  // Если знаменатель в fact кастомный — чем заменить его для plan (иначе plan будет недоступен)
  denominatorPlanKey?: MetricKey
  precision?: number
}

const DERIVED_METRICS: DerivedMetricConfig[] = [
  // Переименованные конверсии по воронке (как в ТЗ)
  { key: 'cr_dozvon', label: 'CR: Дозвон', kind: 'ratioPercent', numeratorKey: 'contactMade', denominatorKey: 'newSchools' },
  { key: 'cr_naznachenie', label: 'CR: Назначение', kind: 'ratioPercent', numeratorKey: 'meetingScheduled', denominatorKey: 'contactMade' },
  { key: 'cr_dojezd', label: 'CR: Доезд', kind: 'ratioPercent', numeratorKey: 'meetingHeld', denominatorKey: 'meetingScheduled' },
  { key: 'cr_soglashenie', label: 'CR: Соглашение', kind: 'ratioPercent', numeratorKey: 'eventScheduled', denominatorKey: 'meetingHeld' },
  { key: 'cr_provedenie', label: 'CR: Проведение', kind: 'ratioPercent', numeratorKey: 'eventHeld', denominatorKey: 'eventScheduled' },

  // Дополнительно
  { key: 'cr_vyezd', label: 'CR: Выезд', kind: 'ratioPercent', numeratorKey: 'excursionPlanned', denominatorKey: 'eventHeld' },
  { key: 'avg_contacts_per_school', label: 'Контактов на школу', kind: 'avgNumber', numeratorKey: 'parentContacts', denominatorCustom: 'schoolsWithLoadedToCRM', denominatorPlanKey: 'loadedToCRM', precision: 1 },
  { key: 'avg_contacts_per_class', label: 'Контактов на класс', kind: 'avgNumber', numeratorKey: 'parentContacts', denominatorCustom: 'classesSumForSchoolsWithLoadedToCRM', denominatorPlanKey: 'loadedToCRM', precision: 2 },
  { key: 'cr_kval', label: 'CR: Квал', kind: 'ratioPercent', numeratorKey: 'qualifiedLeads', denominatorKey: 'loadedToCRM' },
  { key: 'cr_vyhod', label: 'CR: Выход', kind: 'ratioPercent', numeratorKey: 'arrivedToCampus', denominatorKey: 'qualifiedLeads' },
  { key: 'cr_predvar', label: 'CR: Предвар', kind: 'ratioPercent', numeratorKey: 'preliminaryMeetings', denominatorKey: 'arrivedToCampus' },
  { key: 'cr_skvvoznoi_v_vyhod', label: 'CR: Сквозной в выход', kind: 'ratioPercent', numeratorKey: 'arrivedToCampus', denominatorKey: 'loadedToCRM' },
]

// Получение номера недели года (ISO week)
const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

const ymd = (d: Date) => formatMskYmd(d)

const ValueWithUnknownMark = ({ value, hasUnknown }: { value: number; hasUnknown: boolean }) => {
  if (!value) return <>-</>
  return (
    <span className="relative inline-block leading-none">
      <span className="tabular-nums">{value}</span>
      {hasUnknown && (
        <span
          className="absolute -top-1 -right-2 text-[10px] text-gray-400 select-none"
          title="Включает неизвестные школы"
        >
          *
        </span>
      )}
    </span>
  )
}

// Проверка даты в периоде
const isInPeriod = (dateStr: string | null, from: string, to: string): boolean => {
  if (!dateStr) return false
  return dateStr >= from && dateStr <= to
}

const getUnknownContribution = (
  schools: School[],
  metricKey: MetricKey,
  from: string,
  to: string
): number => {
  // Исторически "неизвестные" могли быть сохранены как:
  // - одна запись "__unknown_school__" (текущий путь)
  // - несколько временных записей "unknown_*" (старый путь)
  const unknownSchools = schools.filter(s =>
    s.id === '__unknown_school__' ||
    (typeof s.id === 'string' && s.id.startsWith('unknown_')) ||
    s.name === '❓ Неизвестно'
  )
  if (unknownSchools.length === 0) return 0
  const activities = unknownSchools.flatMap(s => (Array.isArray(s.activities) ? s.activities : []))

  // Числовые метрики: неизвестное = только то, что записано на __unknown_school__
  if (NUMERIC_SUM_KEYS.includes(metricKey)) {
    return activities
      .filter(a => a.type === 'numeric_metrics' && isInPeriod(a.date, from, to))
      .reduce((sum, a) => {
        const legacyParentContacts = metricKey === 'parentContacts' ? (a.parentContacts || 0) : 0
        const v = (a.metrics && typeof a.metrics[metricKey] === 'number') ? (a.metrics[metricKey] as number) : 0
        return sum + legacyParentContacts + v
      }, 0)
  }

  // Этапные метрики (уникальные школы): неизвестное = funnel_metrics (количеством)
  return activities
    .filter(a => a.type === 'funnel_metrics' && isInPeriod(a.date, from, to))
    .reduce((sum, a) => {
      const v = a.metrics?.[metricKey]
      return sum + (typeof v === 'number' ? v : 0)
    }, 0)
}

const MIN_YMD = '0000-01-01'

// Для производных метрик: количество школ, у которых есть числовая метрика loadedToCRM в периоде
const countSchoolsWithLoadedToCRM = (schools: School[], from: string, to: string): number => {
  return schools.filter((s) => {
    const acts = Array.isArray(s.activities) ? s.activities : []
    return acts.some((a) => {
      if (a.type !== 'numeric_metrics') return false
      if (!isInPeriod(a.date, from, to)) return false
      const v = (a.metrics && typeof a.metrics.loadedToCRM === 'number') ? (a.metrics.loadedToCRM as number) : 0
      return v > 0
    })
  }).length
}

// Для производных метрик: сумма classesCount по школам, у которых есть loadedToCRM в периоде
const sumClassesForSchoolsWithLoadedToCRM = (schools: School[], from: string, to: string): number => {
  return schools.reduce((sum, s) => {
    const acts = Array.isArray(s.activities) ? s.activities : []
    const hasLoaded = acts.some((a) => {
      if (a.type !== 'numeric_metrics') return false
      if (!isInPeriod(a.date, from, to)) return false
      const v = (a.metrics && typeof a.metrics.loadedToCRM === 'number') ? (a.metrics.loadedToCRM as number) : 0
      return v > 0
    })
    if (!hasLoaded) return sum
    const c = typeof s.classesCount === 'number' ? s.classesCount : 0
    return sum + (c > 0 ? c : 0)
  }, 0)
}

// Расчёт метрики по школам
const calculateMetric = (
  schools: School[], 
  metricKey: MetricKey, 
  from: string, 
  to: string
): number => {
  const config = METRICS_CONFIG.find(m => m.key === metricKey)
  if (!config) return 0

  // Числовые метрики: считаем сумму из активностей (numeric_metrics)
  if (NUMERIC_SUM_KEYS.includes(metricKey)) {
    return schools.reduce((sum, school) => {
      if (!school.activities) return sum
      return sum + school.activities
        .filter(a => isInPeriod(a.date, from, to))
        .reduce((s, a) => {
          // legacy: parentContacts мог быть записан отдельным полем
          const legacyParentContacts = metricKey === 'parentContacts' ? (a.parentContacts || 0) : 0
          const fromMetrics = (a.metrics && typeof a.metrics[metricKey] === 'number') ? (a.metrics[metricKey] as number) : 0
          return s + legacyParentContacts + fromMetrics
        }, 0)
    }, 0)
  }

  // Накопительная метрика (школы в работе)
  if (config.cumulative) {
    return schools.filter(s => {
      const dateField = config.dateField as keyof School
      const value = s[dateField] as string | null
      return value && value <= to
    }).length + (() => {
      // Накопительный итог по другой метрике (например, "Новые школы" с учётом неизвестных)
      const cumulativeFrom = (config as any).cumulativeFrom as (MetricKey | undefined)
      if (!cumulativeFrom) return 0
      return getUnknownContribution(schools, cumulativeFrom, MIN_YMD, to)
    })()
  }

  // Обычная метрика - считаем по дате
  const dateField = config.dateField as keyof School
  const baseCount = schools.filter(s => {
    const value = s[dateField] as string | null
    return isInPeriod(value, from, to)
  }).length

  const unknown = getUnknownContribution(schools, metricKey, from, to)
  return baseCount + unknown
}

// Структура данных для таблицы
interface DayData {
  date: string
  label: string
  dayOfWeek: number // 1-5 (пн-пт)
}

interface WeekData {
  weekNumber: number
  from: string
  to: string
  label: string
  days: DayData[]
}

interface MonthData {
  month: string
  year: number
  from: string
  to: string
  weeks: WeekData[]
}

// Генерация структуры месяцев и недель
const generatePeriods = (): MonthData[] => {
  const months: MonthData[] = []
  const startDate = new Date(2025, 11, 1) // Декабрь 2025
  
  for (let i = 0; i < 6; i++) {
    const monthStart = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1)
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
    
    const weeks: WeekData[] = []
    let current = new Date(monthStart)
    
    // Находим понедельник первой недели
    const dayOfWeek = current.getDay()
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    current.setDate(current.getDate() + daysToMonday)
    
    while (current <= monthEnd) {
      const weekStart = new Date(current)
      const weekEnd = new Date(current)
      weekEnd.setDate(weekEnd.getDate() + 4) // Пятница
      
      // Проверяем что неделя пересекается с месяцем
      if (weekEnd >= monthStart && weekStart <= monthEnd) {
        const actualStart = weekStart < monthStart ? monthStart : weekStart
        const actualEnd = weekEnd > monthEnd ? monthEnd : weekEnd
        
        // Генерируем дни недели (пн-пт)
        const days: DayData[] = []
        const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт']
        for (let d = 0; d < 5; d++) {
          const dayDate = new Date(weekStart)
          dayDate.setDate(dayDate.getDate() + d)
          
          // Проверяем что день входит в месяц
          if (dayDate >= monthStart && dayDate <= monthEnd) {
            days.push({
              date: ymd(dayDate),
              label: `${dayNames[d]} ${dayDate.getDate()}`,
              dayOfWeek: d + 1
            })
          }
        }
        
        weeks.push({
          weekNumber: getWeekNumber(weekStart),
          from: ymd(actualStart),
          to: ymd(actualEnd),
          label: `Нед ${getWeekNumber(weekStart)}`,
          days
        })
      }
      
      current.setDate(current.getDate() + 7)
    }
    
    months.push({
      month: formatMsk(monthStart, { month: 'long' }),
      year: monthStart.getFullYear(),
      from: ymd(monthStart),
      to: ymd(monthEnd),
      weeks
    })
  }
  
  return months
}

// Утилита: получить рабочие дни в периоде (Пн-Пт)
const getWorkingDaysInPeriod = (from: string, to: string): string[] => {
  const days: string[] = []
  const start = new Date(from + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')
  
  const current = new Date(start)
  while (current <= end) {
    const dayOfWeek = current.getDay()
    // 0 = воскресенье, 6 = суббота
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(ymd(current))
    }
    current.setDate(current.getDate() + 1)
  }
  
  return days
}

// Компонент ячейки с план/факт
const PlanFactCell = ({ 
  fact, 
  plan, 
  hasUnknown,
  onClick 
}: { 
  fact: number; 
  plan: number | null; 
  hasUnknown: boolean;
  onClick?: () => void 
}) => {
  // Если плана нет - показываем только факт
  if (plan === null || plan === 0) {
    return (
      <div className="cursor-pointer" onClick={onClick}>
        <ValueWithUnknownMark value={fact} hasUnknown={hasUnknown} />
      </div>
    )
  }
  
  const percentage = plan > 0 ? Math.round((fact / plan) * 100) : 0
  
  // Цветовая индикация
  let bgColor = ''
  let textColor = 'text-gray-500'
  if (fact > 0 || plan > 0) {
    if (percentage >= 100) {
      bgColor = 'bg-green-100'
      textColor = 'text-green-700'
    } else if (percentage >= 80) {
      bgColor = 'bg-yellow-50'
      textColor = 'text-yellow-700'
    } else if (percentage > 0) {
      bgColor = 'bg-red-50'
      textColor = 'text-red-600'
    }
  }
  
  return (
    <div 
      className={`cursor-pointer rounded px-1 py-0.5 ${bgColor}`}
      onClick={onClick}
    >
      <div className="font-medium">
        <ValueWithUnknownMark value={fact} hasUnknown={hasUnknown} />
      </div>
      <div className={`text-[10px] ${textColor}`}>
        {plan > 0 && (
          <>
            <span className="opacity-70">/{plan}</span>
            <span className="ml-1 font-medium">{percentage}%</span>
          </>
        )}
      </div>
    </div>
  )
}

const formatDerived = (kind: DerivedKind, value: number, precision: number): string => {
  if (kind === 'ratioPercent') return `${Math.round(value)}%`
  return value.toFixed(precision)
}

// Ячейка plan/fact для производных метрик (конверсии/средние)
const DerivedPlanFactCell = ({
  kind,
  fact,
  plan,
  precision = 0
}: {
  kind: DerivedKind
  fact: number | null
  plan: number | null
  precision?: number
}) => {
  const hasPlan = typeof plan === 'number' && plan > 0
  const hasFact = typeof fact === 'number'

  if (!hasFact && !hasPlan) return <span className="text-gray-400">-</span>

  const completion = (hasPlan && hasFact) ? Math.round((fact! / plan!) * 100) : null

  let bgColor = ''
  let textColor = 'text-gray-500'
  if (completion !== null) {
    if (completion >= 100) {
      bgColor = 'bg-green-100'
      textColor = 'text-green-700'
    } else if (completion >= 80) {
      bgColor = 'bg-yellow-50'
      textColor = 'text-yellow-700'
    } else if (completion > 0) {
      bgColor = 'bg-red-50'
      textColor = 'text-red-600'
    }
  }

  return (
    <div className={`rounded px-1 py-0.5 ${bgColor}`}>
      <div className="font-medium tabular-nums">
        {hasFact ? formatDerived(kind, fact!, precision) : <span className="text-gray-400">-</span>}
      </div>
      <div className={`text-[10px] ${textColor}`}>
        {hasPlan ? (
          <>
            <span className="opacity-70">/{formatDerived(kind, plan!, precision)}</span>
            {completion !== null && <span className="ml-1 font-medium">{completion}%</span>}
          </>
        ) : (
          <span className="opacity-60">/—</span>
        )}
      </div>
    </div>
  )
}

const Dashboard = () => {
  const [schools, setSchools] = useState<School[]>([])
  const [plans, setPlans] = useState<MonthlyPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set())
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set()) // "monthIndex-weekIndex"
  const API_URL = useApiUrl()
  
  const periods = useMemo(() => generatePeriods(), [])

  // Загрузка школ и планов
  useEffect(() => {
    const loadData = async () => {
      try {
        const [schoolsRes, plansRes] = await Promise.all([
          fetch(`${API_URL}/schools`),
          fetch(`${API_URL}/plans`)
        ])
        
        if (schoolsRes.ok) {
          const schoolsData = await schoolsRes.json()
          setSchools(schoolsData)
        }
        
        if (plansRes.ok) {
          const plansData = await plansRes.json()
          setPlans(plansData)
        }
      } catch (error) {
        console.log('API unavailable')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [API_URL])

  // Функция расчёта плана для периода
  const getPlanValue = useMemo(() => {
    return (metricKey: MetricKey, from: string, to: string): number | null => {
      if (plans.length === 0) return null
      
      // Определяем какие месяцы входят в период
      const fromDate = new Date(from + 'T12:00:00')
      const toDate = new Date(to + 'T12:00:00')
      
      let totalPlan = 0
      let hasPlan = false
      
      // Проходим по месяцам в периоде
      const currentMonth = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)
      while (currentMonth <= toDate) {
        const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`
        const plan = plans.find(p => p.month === monthKey)
        
        if (plan && plan.metrics[metricKey] !== undefined) {
          hasPlan = true
          const monthlyTotal = plan.metrics[metricKey] || 0
          
          // Определяем границы месяца
          const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
          const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
          
          // Пересечение периода запроса с месяцем
          const periodStart = fromDate > monthStart ? fromDate : monthStart
          const periodEnd = toDate < monthEnd ? toDate : monthEnd
          
          // Если есть кастомное распределение - используем его
          if (plan.dailyDistribution && plan.dailyDistribution[metricKey]) {
            const distribution = plan.dailyDistribution[metricKey]
            const periodDays = getWorkingDaysInPeriod(ymd(periodStart), ymd(periodEnd))
            
            totalPlan += periodDays.reduce((sum, day) => {
              return sum + (distribution[day] || 0)
            }, 0)
          } else {
            // Равномерное распределение
            const monthWorkingDays = getWorkingDaysInPeriod(ymd(monthStart), ymd(monthEnd))
            const periodWorkingDays = getWorkingDaysInPeriod(ymd(periodStart), ymd(periodEnd))
            
            if (monthWorkingDays.length > 0) {
              const dailyRate = monthlyTotal / monthWorkingDays.length
              totalPlan += Math.round(dailyRate * periodWorkingDays.length)
            }
          }
        }
        
        // Переходим к следующему месяцу
        currentMonth.setMonth(currentMonth.getMonth() + 1)
      }
      
      return hasPlan ? totalPlan : null
    }
  }, [plans])

  // Общие итоги
  const totals = useMemo(() => {
    if (schools.length === 0) return null
    const from = periods[0].from
    const to = periods[periods.length - 1].to
    
    const result: Record<string, number> = {}
    METRICS_CONFIG.forEach(m => {
      result[m.key] = calculateMetric(schools, m.key as MetricKey, from, to)
    })
    return result
  }, [schools, periods])

  const toggleMonth = (index: number) => {
    const newSet = new Set(expandedMonths)
    if (newSet.has(index)) {
      newSet.delete(index)
      // Сворачиваем все недели этого месяца
      const weeksToRemove: string[] = []
      expandedWeeks.forEach(key => {
        if (key.startsWith(`${index}-`)) {
          weeksToRemove.push(key)
        }
      })
      weeksToRemove.forEach(key => {
        const newWeeksSet = new Set(expandedWeeks)
        newWeeksSet.delete(key)
        setExpandedWeeks(newWeeksSet)
      })
    } else {
      newSet.add(index)
    }
    setExpandedMonths(newSet)
  }

  const toggleWeek = (monthIndex: number, weekIndex: number) => {
    const key = `${monthIndex}-${weekIndex}`
    const newSet = new Set(expandedWeeks)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      newSet.add(key)
    }
    setExpandedWeeks(newSet)
  }

  // Открыть список школ по метрике
  const openSchoolsList = (metricKey: MetricKey, from: string, to: string) => {
    const url = `/schools?metric=${metricKey}&from=${from}&to=${to}`
    window.open(url, '_blank')
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-12 text-center">
        <div className="text-gray-500">Загрузка данных...</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Панель управления */}
      <div className="flex flex-wrap gap-4 p-4 bg-gray-50 border-b items-center">
        <button 
          onClick={() => setExpandedMonths(new Set(periods.map((_, i) => i)))}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Развернуть месяцы
        </button>
        <button 
          onClick={() => setExpandedMonths(new Set())}
          className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
          Свернуть
        </button>
        
        <div className="ml-auto text-sm text-gray-500">
          Всего школ: {schools.length} | В работе: {schools.filter(s => s.inWorkDate).length}
        </div>
      </div>

      {/* Таблица метрик */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-3 text-left font-medium text-gray-700 sticky left-0 bg-gray-100 z-10 min-w-[200px] border-r">
                Метрика
              </th>
              {periods.map((month, monthIndex) => {
                const isExpanded = expandedMonths.has(monthIndex)
                let colSpan = 1
                if (isExpanded) {
                  // Считаем колонки: для каждой недели либо 1 (свернута), либо количество дней (раскрыта)
                  colSpan = month.weeks.reduce((sum, week, weekIndex) => {
                    const weekKey = `${monthIndex}-${weekIndex}`
                    return sum + (expandedWeeks.has(weekKey) ? week.days.length : 1)
                  }, 0) + 1 // +1 для итога месяца
                }
                
                return (
                  <th 
                    key={monthIndex}
                    colSpan={colSpan}
                    className="px-4 py-3 text-center font-medium text-white bg-blue-600 cursor-pointer hover:bg-blue-700 border-r border-blue-500"
                    onClick={() => toggleMonth(monthIndex)}
                  >
                    {month.month} {month.year} {isExpanded ? '▼' : '▶'}
                  </th>
                )
              })}
              <th className="px-4 py-3 text-center font-medium text-white bg-gray-800 min-w-[80px]">
                Итого
              </th>
            </tr>
            
            {/* Строка недель */}
            {periods.some((_, i) => expandedMonths.has(i)) && (
              <tr className="bg-blue-50">
                <th className="px-4 py-2 sticky left-0 bg-blue-50 z-10 border-r"></th>
                {periods.map((month, monthIndex) => {
                  if (!expandedMonths.has(monthIndex)) {
                    return <th key={monthIndex} className="border-r border-blue-200"></th>
                  }
                  return (
                    <>
                      {month.weeks.map((week, weekIndex) => {
                        const weekKey = `${monthIndex}-${weekIndex}`
                        const isWeekExpanded = expandedWeeks.has(weekKey)
                        const colSpan = isWeekExpanded ? week.days.length : 1
                        
                        return (
                          <th 
                            key={`${monthIndex}-${weekIndex}`}
                            colSpan={colSpan}
                            className="px-2 py-2 text-center text-xs font-medium text-blue-800 bg-blue-100 border-r border-blue-200 cursor-pointer hover:bg-blue-200"
                            onClick={() => toggleWeek(monthIndex, weekIndex)}
                            title="Кликните для раскрытия дней недели"
                          >
                            {week.label} {isWeekExpanded ? '▼' : '▶'}
                          </th>
                        )
                      })}
                      <th className="px-2 py-2 text-center text-xs font-medium text-blue-900 bg-blue-200 border-r border-blue-300">
                        Итог
                      </th>
                    </>
                  )
                })}
                <th className="bg-gray-700"></th>
              </tr>
            )}
            
            {/* Строка дней (пн-пт) */}
            {periods.some((month, monthIndex) => 
              expandedMonths.has(monthIndex) && 
              month.weeks.some((_, weekIndex) => expandedWeeks.has(`${monthIndex}-${weekIndex}`))
            ) && (
              <tr className="bg-green-50">
                <th className="px-4 py-2 sticky left-0 bg-green-50 z-10 border-r"></th>
                {periods.map((month, monthIndex) => {
                  if (!expandedMonths.has(monthIndex)) {
                    return <th key={monthIndex} className="border-r border-green-200"></th>
                  }
                  return (
                    <>
                      {month.weeks.map((week, weekIndex) => {
                        const weekKey = `${monthIndex}-${weekIndex}`
                        const isWeekExpanded = expandedWeeks.has(weekKey)
                        
                        if (!isWeekExpanded) {
                          return <th key={`${monthIndex}-${weekIndex}`} className="border-r border-green-200"></th>
                        }
                        
                        return (
                          <>
                            {week.days.map((day, dayIndex) => (
                              <th 
                                key={`${monthIndex}-${weekIndex}-${dayIndex}`}
                                className="px-1 py-2 text-center text-xs font-medium text-green-800 bg-green-100 border-r border-green-200"
                              >
                                {day.label}
                              </th>
                            ))}
                          </>
                        )
                      })}
                      <th className="px-2 py-2 text-center text-xs font-medium text-green-900 bg-green-200 border-r border-green-300">
                        Итог
                      </th>
                    </>
                  )
                })}
                <th className="bg-gray-700"></th>
              </tr>
            )}
          </thead>
          
          <tbody>
            {METRICS_CONFIG.map((metric, metricIndex) => (
              <tr key={metric.key} className={metricIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className={`px-4 py-3 font-medium text-gray-900 sticky left-0 z-10 border-r ${metricIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  {metric.label}
                </td>
                
                {periods.map((month, monthIndex) => {
                  const unknownKey = ((metric as any).cumulativeFrom as MetricKey | undefined) ?? (metric.key as MetricKey)
                  const monthUnknown = getUnknownContribution(schools, unknownKey, month.from, month.to)
                  const monthValue = calculateMetric(schools, metric.key as MetricKey, month.from, month.to)
                  const monthPlan = getPlanValue(metric.key as MetricKey, month.from, month.to)
                  
                  if (!expandedMonths.has(monthIndex)) {
                    return (
                      <td 
                        key={monthIndex}
                        className="px-4 py-2 text-center border-r border-blue-200"
                      >
                        <PlanFactCell 
                          fact={monthValue} 
                          plan={monthPlan} 
                          hasUnknown={monthUnknown > 0}
                          onClick={() => openSchoolsList(metric.key as MetricKey, month.from, month.to)}
                        />
                      </td>
                    )
                  }
                  
                  return (
                    <>
                      {month.weeks.map((week, weekIndex) => {
                        const weekKey = `${monthIndex}-${weekIndex}`
                        const isWeekExpanded = expandedWeeks.has(weekKey)
                        const weekUnknown = getUnknownContribution(schools, unknownKey, week.from, week.to)
                        const weekValue = calculateMetric(schools, metric.key as MetricKey, week.from, week.to)
                        const weekPlan = getPlanValue(metric.key as MetricKey, week.from, week.to)
                        
                        if (!isWeekExpanded) {
                          return (
                            <td 
                              key={`${monthIndex}-${weekIndex}`}
                              className="px-2 py-2 text-center border-r border-blue-100"
                            >
                              <PlanFactCell 
                                fact={weekValue} 
                                plan={weekPlan} 
                                hasUnknown={weekUnknown > 0}
                                onClick={() => openSchoolsList(metric.key as MetricKey, week.from, week.to)}
                              />
                            </td>
                          )
                        }
                        
                        // Раскрытая неделя - показываем дни
                        return (
                          <>
                            {week.days.map((day, dayIndex) => {
                              const dayUnknown = getUnknownContribution(schools, unknownKey, day.date, day.date)
                              const dayValue = calculateMetric(schools, metric.key as MetricKey, day.date, day.date)
                              const dayPlan = getPlanValue(metric.key as MetricKey, day.date, day.date)
                              return (
                                <td 
                                  key={`${monthIndex}-${weekIndex}-${dayIndex}`}
                                  className="px-1 py-1 text-center text-xs border-r border-green-100"
                                >
                                  <PlanFactCell 
                                    fact={dayValue} 
                                    plan={dayPlan} 
                                    hasUnknown={dayUnknown > 0}
                                    onClick={() => openSchoolsList(metric.key as MetricKey, day.date, day.date)}
                                  />
                                </td>
                              )
                            })}
                          </>
                        )
                      })}
                      <td 
                        className="px-2 py-2 text-center font-medium border-r border-blue-200 bg-blue-50"
                      >
                        <PlanFactCell 
                          fact={monthValue} 
                          plan={monthPlan} 
                          hasUnknown={monthUnknown > 0}
                          onClick={() => openSchoolsList(metric.key as MetricKey, month.from, month.to)}
                        />
                      </td>
                    </>
                  )
                })}
                
                <td className="px-4 py-2 text-center font-bold text-gray-900 bg-gray-100">
                  {(() => {
                    const totalValue = totals?.[metric.key] || 0
                    const unknownKey = ((metric as any).cumulativeFrom as MetricKey | undefined) ?? (metric.key as MetricKey)
                    const totalUnknown = periods.length > 0
                      ? getUnknownContribution(
                          schools,
                          unknownKey,
                          periods[0].from,
                          periods[periods.length - 1].to
                        )
                      : 0
                    const totalPlan = periods.length > 0 
                      ? getPlanValue(metric.key as MetricKey, periods[0].from, periods[periods.length - 1].to)
                      : null
                    return (
                      <PlanFactCell 
                        fact={totalValue} 
                        plan={totalPlan} 
                        hasUnknown={totalUnknown > 0}
                        onClick={() => openSchoolsList(metric.key as MetricKey, periods[0].from, periods[periods.length - 1].to)}
                      />
                    )
                  })()}
                </td>
              </tr>
            ))}
            
            {/* Разделитель перед производными метриками */}
            <tr className="bg-purple-100">
              <td colSpan={100} className="px-4 py-2 text-sm font-semibold text-purple-800 sticky left-0 z-10">
                Конверсии / средние показатели
              </td>
            </tr>
            
            {/* Строки производных метрик */}
            {DERIVED_METRICS.map((row, rowIndex) => (
              <tr key={row.key} className={rowIndex % 2 === 0 ? 'bg-purple-50/50' : 'bg-white'}>
                <td className={`px-4 py-2 text-sm text-purple-700 sticky left-0 z-10 border-r ${rowIndex % 2 === 0 ? 'bg-purple-50/50' : 'bg-white'}`}>
                  {row.label}
                </td>

                {periods.map((month, monthIndex) => {
                  const numerator = row.numeratorKey
                    ? calculateMetric(schools, row.numeratorKey, month.from, month.to)
                    : 0

                  const denominator = row.denominatorKey
                    ? calculateMetric(schools, row.denominatorKey, month.from, month.to)
                    : (row.denominatorCustom === 'schoolsWithLoadedToCRM'
                      ? countSchoolsWithLoadedToCRM(schools, month.from, month.to)
                      : row.denominatorCustom === 'classesSumForSchoolsWithLoadedToCRM'
                        ? sumClassesForSchoolsWithLoadedToCRM(schools, month.from, month.to)
                        : 0)

                  const numeratorPlan = row.numeratorKey ? getPlanValue(row.numeratorKey, month.from, month.to) : null
                  const denominatorPlan = row.denominatorKey
                    ? getPlanValue(row.denominatorKey, month.from, month.to)
                    : (row.denominatorPlanKey ? getPlanValue(row.denominatorPlanKey, month.from, month.to) : null)

                  const factValue = denominator > 0
                    ? (row.kind === 'ratioPercent' ? (numerator / denominator) * 100 : (numerator / denominator))
                    : null

                  const planValue = (numeratorPlan !== null && denominatorPlan !== null && denominatorPlan > 0)
                    ? (row.kind === 'ratioPercent' ? (numeratorPlan / denominatorPlan) * 100 : (numeratorPlan / denominatorPlan))
                    : null

                  if (!expandedMonths.has(monthIndex)) {
                    return (
                      <td
                        key={monthIndex}
                        className="px-4 py-2 text-center text-sm border-r border-purple-200"
                      >
                        <DerivedPlanFactCell kind={row.kind} fact={factValue} plan={planValue} precision={row.precision} />
                      </td>
                    )
                  }

                  return (
                    <>
                      {month.weeks.map((week, weekIndex) => {
                        const weekKey = `${monthIndex}-${weekIndex}`
                        const isWeekExpanded = expandedWeeks.has(weekKey)

                        const weekNumerator = row.numeratorKey
                          ? calculateMetric(schools, row.numeratorKey, week.from, week.to)
                          : 0

                        const weekDenominator = row.denominatorKey
                          ? calculateMetric(schools, row.denominatorKey, week.from, week.to)
                          : (row.denominatorCustom === 'schoolsWithLoadedToCRM'
                            ? countSchoolsWithLoadedToCRM(schools, week.from, week.to)
                            : row.denominatorCustom === 'classesSumForSchoolsWithLoadedToCRM'
                              ? sumClassesForSchoolsWithLoadedToCRM(schools, week.from, week.to)
                              : 0)

                        const weekNumeratorPlan = row.numeratorKey ? getPlanValue(row.numeratorKey, week.from, week.to) : null
                        const weekDenominatorPlan = row.denominatorKey
                          ? getPlanValue(row.denominatorKey, week.from, week.to)
                          : (row.denominatorPlanKey ? getPlanValue(row.denominatorPlanKey, week.from, week.to) : null)

                        const weekFactValue = weekDenominator > 0
                          ? (row.kind === 'ratioPercent' ? (weekNumerator / weekDenominator) * 100 : (weekNumerator / weekDenominator))
                          : null

                        const weekPlanValue = (weekNumeratorPlan !== null && weekDenominatorPlan !== null && weekDenominatorPlan > 0)
                          ? (row.kind === 'ratioPercent' ? (weekNumeratorPlan / weekDenominatorPlan) * 100 : (weekNumeratorPlan / weekDenominatorPlan))
                          : null

                        if (!isWeekExpanded) {
                          return (
                            <td
                              key={`${monthIndex}-${weekIndex}`}
                              className="px-2 py-2 text-center text-sm border-r border-purple-100"
                            >
                              <DerivedPlanFactCell kind={row.kind} fact={weekFactValue} plan={weekPlanValue} precision={row.precision} />
                            </td>
                          )
                        }

                        return (
                          <>
                            {week.days.map((day, dayIndex) => {
                              const dayNumerator = row.numeratorKey
                                ? calculateMetric(schools, row.numeratorKey, day.date, day.date)
                                : 0

                              const dayDenominator = row.denominatorKey
                                ? calculateMetric(schools, row.denominatorKey, day.date, day.date)
                                : (row.denominatorCustom === 'schoolsWithLoadedToCRM'
                                  ? countSchoolsWithLoadedToCRM(schools, day.date, day.date)
                                  : row.denominatorCustom === 'classesSumForSchoolsWithLoadedToCRM'
                                    ? sumClassesForSchoolsWithLoadedToCRM(schools, day.date, day.date)
                                    : 0)

                              const dayNumeratorPlan = row.numeratorKey ? getPlanValue(row.numeratorKey, day.date, day.date) : null
                              const dayDenominatorPlan = row.denominatorKey
                                ? getPlanValue(row.denominatorKey, day.date, day.date)
                                : (row.denominatorPlanKey ? getPlanValue(row.denominatorPlanKey, day.date, day.date) : null)

                              const dayFactValue = dayDenominator > 0
                                ? (row.kind === 'ratioPercent' ? (dayNumerator / dayDenominator) * 100 : (dayNumerator / dayDenominator))
                                : null

                              const dayPlanValue = (dayNumeratorPlan !== null && dayDenominatorPlan !== null && dayDenominatorPlan > 0)
                                ? (row.kind === 'ratioPercent' ? (dayNumeratorPlan / dayDenominatorPlan) * 100 : (dayNumeratorPlan / dayDenominatorPlan))
                                : null

                              return (
                                <td
                                  key={`${monthIndex}-${weekIndex}-${dayIndex}`}
                                  className="px-1 py-1 text-center text-xs border-r border-purple-100"
                                >
                                  <DerivedPlanFactCell kind={row.kind} fact={dayFactValue} plan={dayPlanValue} precision={row.precision} />
                                </td>
                              )
                            })}
                          </>
                        )
                      })}
                      <td className="px-2 py-2 text-center text-sm font-medium border-r border-purple-200 bg-purple-50">
                        <DerivedPlanFactCell kind={row.kind} fact={factValue} plan={planValue} precision={row.precision} />
                      </td>
                    </>
                  )
                })}

                {/* Итог по периоду */}
                <td className="px-4 py-2 text-center font-medium bg-gray-100">
                  {(() => {
                    const from = periods[0]?.from
                    const to = periods[periods.length - 1]?.to
                    if (!from || !to) return <span className="text-gray-400">-</span>

                    const totalNumerator = row.numeratorKey
                      ? calculateMetric(schools, row.numeratorKey, from, to)
                      : 0

                    const totalDenominator = row.denominatorKey
                      ? calculateMetric(schools, row.denominatorKey, from, to)
                      : (row.denominatorCustom === 'schoolsWithLoadedToCRM'
                        ? countSchoolsWithLoadedToCRM(schools, from, to)
                        : row.denominatorCustom === 'classesSumForSchoolsWithLoadedToCRM'
                          ? sumClassesForSchoolsWithLoadedToCRM(schools, from, to)
                          : 0)

                    const totalNumeratorPlan = row.numeratorKey ? getPlanValue(row.numeratorKey, from, to) : null
                    const totalDenominatorPlan = row.denominatorKey
                      ? getPlanValue(row.denominatorKey, from, to)
                      : (row.denominatorPlanKey ? getPlanValue(row.denominatorPlanKey, from, to) : null)

                    const totalFactValue = totalDenominator > 0
                      ? (row.kind === 'ratioPercent' ? (totalNumerator / totalDenominator) * 100 : (totalNumerator / totalDenominator))
                      : null

                    const totalPlanValue = (totalNumeratorPlan !== null && totalDenominatorPlan !== null && totalDenominatorPlan > 0)
                      ? (row.kind === 'ratioPercent' ? (totalNumeratorPlan / totalDenominatorPlan) * 100 : (totalNumeratorPlan / totalDenominatorPlan))
                      : null

                    return <DerivedPlanFactCell kind={row.kind} fact={totalFactValue} plan={totalPlanValue} precision={row.precision} />
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Dashboard
