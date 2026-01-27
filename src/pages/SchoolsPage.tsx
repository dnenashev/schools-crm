import { useMemo, useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import SchoolsTable from '../components/SchoolsTable'
import { School, METRICS_CONFIG, MetricKey } from '../types/school'
import { useApiUrl, authenticatedFetch } from '../config/api'
import { formatMsk } from '../config/datetime'

// Проверка даты в периоде
const isInPeriod = (dateStr: string | null, from: string, to: string): boolean => {
  if (!dateStr) return false
  return dateStr >= from && dateStr <= to
}

const isUnknownSchoolRecord = (s: School): boolean => {
  if (s.id === '__unknown_school__') return true
  if (typeof s.id === 'string' && s.id.startsWith('unknown_')) return true
  if (s.name === '❓ Неизвестно') return true
  return false
}

const collapseUnknownSchools = (schools: School[]): School[] => {
  const unknowns = schools.filter(isUnknownSchoolRecord)
  if (unknowns.length <= 1) return schools
  const preferred = unknowns.find(s => s.id === '__unknown_school__') || unknowns[0]
  return [...schools.filter(s => !isUnknownSchoolRecord(s)), preferred]
}

const SchoolsPage = () => {
  const [searchParams] = useSearchParams()
  const [schools, setSchools] = useState<School[]>([]) // храним ВСЕ (включая неизвестные) — фильтруем только на отображении
  const [loading, setLoading] = useState(true)
  const API_URL = useApiUrl()

  // Получаем параметры из URL
  const metric = searchParams.get('metric') as MetricKey | null
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // Загрузка школ с API
  useEffect(() => {
    const loadSchools = async () => {
      try {
        const res = await authenticatedFetch(`${API_URL}/schools`)
        if (res.ok) {
          const raw: unknown = await res.json()
          const data: School[] = Array.isArray(raw) ? (raw as School[]) : []
          // Дедупликация по ID
          const uniqueData = Array.from(
            new Map(data.map((s: School) => [s.id, s])).values()
          )
          console.log(`Загружено школ: ${data.length}, уникальных: ${uniqueData.length}`)
          setSchools(uniqueData)
        }
      } catch (error) {
        console.error('Error loading schools:', error)
      } finally {
        setLoading(false)
      }
    }
    loadSchools()
  }, [API_URL])

  // Фильтруем школы по параметрам
  const filteredSchools = useMemo(() => {
    if (!metric || !from || !to) {
      // В обычном списке "Все школы" скрываем технические записи неизвестных
      return schools.filter(s => !isUnknownSchoolRecord(s))
    }

    // Находим конфиг метрики
    const metricConfig = METRICS_CONFIG.find(m => m.key === metric)
    if (!metricConfig) {
      return schools
    }

    // Для числовых метрик - фильтр по активностям (numeric_metrics / metrics[metric])
    const numericActivityKeys: MetricKey[] = [
      'parentContacts',
      'loadedToCRM',
      'qualifiedLeads',
      'arrivedToCampus',
      'preliminaryMeetings',
    ]

    if (numericActivityKeys.includes(metric)) {
      const result = schools.filter(school => {
        if (!school.activities || school.activities.length === 0) return false
        return school.activities.some(a => {
          if (!isInPeriod(a.date, from, to)) return false
          // legacy parentContacts
          if (metric === 'parentContacts' && (a.parentContacts || 0) > 0) return true
          // new numeric metrics payload
          const v = a.metrics?.[metric]
          return typeof v === 'number' && v > 0
        })
      })
      return collapseUnknownSchools(result)
    }

    // Для накопительных метрик (школы в работе)
    if (metricConfig.cumulative) {
      if (!metricConfig.dateField) return collapseUnknownSchools([])
      const dateField = metricConfig.dateField as keyof School
      const base = schools.filter(school => {
        const value = school[dateField] as string | null
        return value && value <= to
      })
      // Если это накопительный итог по другой метрике (например newSchools),
      // добавим "__unknown_school__" в список, если у него есть вклад в период до `to`.
      const cumulativeFrom = (metricConfig as any).cumulativeFrom as MetricKey | undefined
      if (cumulativeFrom) {
        const unknown = schools.find(s => s.id === '__unknown_school__')
        const hasUnknown = !!unknown?.activities?.some(a => {
          if (!a.date || a.date > to) return false
          if (a.type !== 'funnel_metrics') return false
          const v = a.metrics?.[cumulativeFrom]
          return typeof v === 'number' && v > 0
        })
        if (hasUnknown && unknown && !base.some(s => s.id === unknown.id)) {
          return [...base, unknown]
        }
      }
      return collapseUnknownSchools(base)
    }

    // Для обычных метрик - по дате
    if (!metricConfig.dateField) return collapseUnknownSchools([])
    const dateField = metricConfig.dateField as keyof School
    const result = schools.filter(school => {
      const value = school[dateField] as string | null
      if (isInPeriod(value, from, to)) return true
      // Специально для "__unknown_school__": каскадные метрики могли быть сохранены как funnel_metrics (количеством)
      if (school.id === '__unknown_school__' && school.activities && school.activities.length > 0) {
        return school.activities.some(a => {
          if (!isInPeriod(a.date, from, to)) return false
          if (a.type !== 'funnel_metrics') return false
          const v = a.metrics?.[metric]
          return typeof v === 'number' && v > 0
        })
      }
      return false
    })
    return collapseUnknownSchools(result)
  }, [schools, metric, from, to])

  const hasUnknownInFiltered = useMemo(() => {
    return filteredSchools.some(isUnknownSchoolRecord)
  }, [filteredSchools])

  // Формируем заголовок и подзаголовок
  const { title, subtitle, filterDescription } = useMemo(() => {
    const formatDate = (dateStr: string) => {
      return formatMsk(dateStr, { day: 'numeric', month: 'long', year: 'numeric' })
    }

    // Находим конфиг метрики
    const metricConfig = METRICS_CONFIG.find(m => m.key === metric)

    if (!metric || !from || !to || !metricConfig) {
      return {
        title: 'Все школы',
        subtitle: 'Без фильтрации',
        filterDescription: ''
      }
    }

    // Проверяем, это один день или период
    const isSingleDay = from === to

    let periodStr = ''
    if (isSingleDay) {
      periodStr = formatDate(from)
    } else {
      periodStr = `${formatDate(from)} — ${formatDate(to)}`
    }

    return {
      title: metricConfig.label,
      subtitle: periodStr,
      filterDescription: metricConfig.cumulative
        ? `Школы где статус "${metricConfig.label}" установлен до ${formatDate(to)}`
        : `Школы где статус "${metricConfig.label}" установлен в период`
    }
  }, [metric, from, to])

  // Обновить данные после изменений
  const refreshSchools = async () => {
    try {
      const res = await authenticatedFetch(`${API_URL}/schools`)
      if (res.ok) {
        const raw: unknown = await res.json()
        const data: School[] = Array.isArray(raw) ? (raw as School[]) : []
        // Дедупликация по ID
        const uniqueData = Array.from(
          new Map(data.map((s: School) => [s.id, s])).values()
        )
        setSchools(uniqueData)
      }
    } catch (error) {
      console.error('Error refreshing schools:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Навигация */}
        <div className="mb-6 flex items-center gap-4">
          <Link
            to="/"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Дашборд
          </Link>
        </div>

        {/* Информация о фильтре */}
        {metric && from && to && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-blue-600">Фильтр:</span>
                <span className="ml-2 font-medium text-blue-900">
                  {filterDescription}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {hasUnknownInFiltered && (
                  <Link
                    to={`/pipeline?mode=resolve-unknown&from=${from}&to=${to}&metric=${metric}`}
                    className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                    title="Открыть «Решение неизвестности» с тем же периодом и метрикой"
                  >
                    Решить неизвестность
                  </Link>
                )}
                <Link
                  to="/schools"
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  Сбросить фильтр
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Таблица школ */}
        <SchoolsTable
          schools={filteredSchools}
          title={title}
          subtitle={subtitle}
          onUpdate={refreshSchools}
        />
      </div>
    </div>
  )
}

export default SchoolsPage
