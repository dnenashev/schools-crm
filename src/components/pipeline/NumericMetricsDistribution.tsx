import { useState, useMemo, useRef } from 'react'
import { School, createUnknownSchool, UNKNOWN_SCHOOL_ID } from '../../types/school'
import { NUMERIC_METRICS, MetricsCount } from './MetricsInput'
import { NumericMetricsBySchool } from './FillDataMode'
import { formatMsk } from '../../config/datetime'

interface NumericMetricsDistributionProps {
  allSchools: School[]
  metricsCount: MetricsCount
  numericMetricsBySchool: NumericMetricsBySchool
  onNumericMetricsChange: (metrics: NumericMetricsBySchool) => void
  selectedDate: string
  recommendedSchoolIds?: Set<string>
}

const NumericMetricsDistribution = ({
  allSchools,
  metricsCount,
  numericMetricsBySchool,
  onNumericMetricsChange,
  selectedDate,
  recommendedSchoolIds = new Set()
}: NumericMetricsDistributionProps) => {
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState<string>('all')
  const [districtFilter, setDistrictFilter] = useState<string>('all')
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Активные метрики (с ненулевыми значениями)
  const activeMetrics = useMemo(() => 
    NUMERIC_METRICS.filter(m => (metricsCount[m.key] || 0) > 0),
    [metricsCount]
  )

  // "Избранное": рекомендуемые + уже использованные школы
  const favoriteSchoolIds = useMemo(() => {
    const fav = new Set<string>(recommendedSchoolIds)
    Object.values(numericMetricsBySchool).forEach((bySchool) => {
      Object.entries(bySchool).forEach(([schoolId, value]) => {
        if (value > 0) fav.add(schoolId)
      })
    })
    return fav
  }, [recommendedSchoolIds, numericMetricsBySchool])

  const availableCities = useMemo(() => {
    const set = new Set<string>()
    allSchools
      .filter(s => s.id !== UNKNOWN_SCHOOL_ID)
      .forEach(s => {
        const v = (s.city || '').trim()
        if (v) set.add(v)
      })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [allSchools])

  const availableDistricts = useMemo(() => {
    const set = new Set<string>()
    allSchools
      .filter(s => s.id !== UNKNOWN_SCHOOL_ID)
      .forEach(s => {
        const v = (s.district || '').trim()
        if (v) set.add(v)
      })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [allSchools])

  // Фильтрация и сортировка школ
  const filteredSchools = useMemo(() => {
    const unknownSchool = createUnknownSchool()
    // Важно: запись __unknown_school__ может уже приходить с сервера (для хранения метрик),
    // поэтому убираем её из списка, чтобы не показывать "неизвестно" дважды.
    const baseSchools = allSchools.filter(s => s.id !== UNKNOWN_SCHOOL_ID)
    let filteredBase = baseSchools

    if (cityFilter !== 'all') {
      filteredBase = filteredBase.filter(s => (s.city || '').trim() === cityFilter)
    }
    if (districtFilter !== 'all') {
      filteredBase = filteredBase.filter(s => (s.district || '').trim() === districtFilter)
    }

    let filtered = [unknownSchool, ...filteredBase]
    
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = [unknownSchool, ...filteredBase].filter(s => 
        s.id === UNKNOWN_SCHOOL_ID ||
        s.name.toLowerCase().includes(searchLower) ||
        s.city.toLowerCase().includes(searchLower) ||
        s.district.toLowerCase().includes(searchLower)
      )
    }
    
    return [...filtered].sort((a, b) => {
      if (a.id === UNKNOWN_SCHOOL_ID) return -1
      if (b.id === UNKNOWN_SCHOOL_ID) return 1
      
      const aFav = favoriteSchoolIds.has(a.id)
      const bFav = favoriteSchoolIds.has(b.id)
      if (aFav && !bFav) return -1
      if (!aFav && bFav) return 1
      return 0
    })
  }, [allSchools, search, favoriteSchoolIds, cityFilter, districtFilter])

  // Обновление значения
  const updateMetricValue = (metricKey: string, schoolId: string, value: number) => {
    const newMetrics = { ...numericMetricsBySchool }
    if (!newMetrics[metricKey]) {
      newMetrics[metricKey] = {}
    }
    if (value > 0) {
      newMetrics[metricKey][schoolId] = value
    } else {
      delete newMetrics[metricKey][schoolId]
      if (Object.keys(newMetrics[metricKey]).length === 0) {
        delete newMetrics[metricKey]
      }
    }
    onNumericMetricsChange(newMetrics)
  }

  // Статистика по метрикам
  const metricStats = useMemo(() => {
    const stats: Record<string, { total: number; distributed: number; remaining: number }> = {}
    activeMetrics.forEach(m => {
      const total = metricsCount[m.key] || 0
      const bySchool = numericMetricsBySchool[m.key] || {}
      const distributed = Object.values(bySchool).reduce((sum, v) => sum + v, 0)
      stats[m.key] = { total, distributed, remaining: total - distributed }
    })
    return stats
  }, [activeMetrics, metricsCount, numericMetricsBySchool])

  // Все ли распределено
  const allDistributed = useMemo(() => 
    Object.values(metricStats).every(s => s.remaining === 0),
    [metricStats]
  )

  // Обработка Tab/Enter
  const handleKeyDown = (e: React.KeyboardEvent, schoolId: string, metricKey: string) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      
      const schoolIndex = filteredSchools.findIndex(s => s.id === schoolId)
      const metricIndex = activeMetrics.findIndex(m => m.key === metricKey)
      
      let nextSchoolIndex = schoolIndex
      let nextMetricIndex = metricIndex
      
      if (e.shiftKey) {
        // Shift+Tab: назад
        nextMetricIndex--
        if (nextMetricIndex < 0) {
          nextMetricIndex = activeMetrics.length - 1
          nextSchoolIndex--
        }
      } else {
        // Tab/Enter: вперед
        nextMetricIndex++
        if (nextMetricIndex >= activeMetrics.length) {
          nextMetricIndex = 0
          nextSchoolIndex++
        }
      }
      
      if (nextSchoolIndex >= 0 && nextSchoolIndex < filteredSchools.length) {
        const nextSchool = filteredSchools[nextSchoolIndex]
        const nextMetric = activeMetrics[nextMetricIndex]
        const key = `${nextSchool.id}-${nextMetric.key}`
        inputRefs.current[key]?.focus()
        inputRefs.current[key]?.select()
      }
    }
  }

  // Сумма по школе
  const getSchoolTotal = (schoolId: string): number => {
    return activeMetrics.reduce((sum, m) => {
      return sum + (numericMetricsBySchool[m.key]?.[schoolId] || 0)
    }, 0)
  }

  // Быстрое заполнение: все на одну школу
  const fillAllToSchool = (schoolId: string) => {
    const newMetrics = { ...numericMetricsBySchool }
    activeMetrics.forEach(m => {
      const remaining = metricStats[m.key].remaining
      if (remaining > 0) {
        if (!newMetrics[m.key]) newMetrics[m.key] = {}
        const current = newMetrics[m.key][schoolId] || 0
        newMetrics[m.key][schoolId] = current + remaining
      }
    })
    onNumericMetricsChange(newMetrics)
  }

  // Распределить поровну по избранным
  const distributeEvenly = () => {
    if (favoriteSchoolIds.size === 0) return
    const favArray = Array.from(favoriteSchoolIds)
    const newMetrics = { ...numericMetricsBySchool }
    
    activeMetrics.forEach(m => {
      const remaining = metricStats[m.key].remaining
      if (remaining > 0) {
        const perSchool = Math.floor(remaining / favArray.length)
        const extra = remaining % favArray.length
        
        if (!newMetrics[m.key]) newMetrics[m.key] = {}
        favArray.forEach((schoolId, idx) => {
          const current = newMetrics[m.key][schoolId] || 0
          const add = perSchool + (idx < extra ? 1 : 0)
          newMetrics[m.key][schoolId] = current + add
        })
      }
    })
    onNumericMetricsChange(newMetrics)
  }

  const formatDate = (dateStr: string) => {
    return formatMsk(dateStr, { day: 'numeric', month: 'long', year: 'numeric' })
  }

  if (activeMetrics.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 text-center">
        <p className="text-gray-500">Нет числовых метрик для распределения</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <h2 className="text-xl font-bold text-gray-800">Распределение по школам</h2>
        <p className="text-gray-500 text-sm mt-1">
          Дата: <span className="font-medium">{formatDate(selectedDate)}</span>
        </p>
        <p className="text-xs text-gray-400 mt-2">
          💡 Используйте Tab для перехода между ячейками, Enter — следующая строка
        </p>
        
        {allDistributed && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Все метрики распределены! Можно сохранять.
          </div>
        )}
      </div>

      {/* Быстрые действия */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <div className="flex flex-wrap gap-2">
          {favoriteSchoolIds.size > 0 && !allDistributed && (
            <button
              onClick={distributeEvenly}
              className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors flex items-center gap-2"
            >
              <span>⭐</span>
              <span>Распределить поровну по избранным ({favoriteSchoolIds.size})</span>
            </button>
          )}
        </div>
        
        {/* Поиск */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Поиск школы..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="all">Все города</option>
            {availableCities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
          >
            <option value="all">Все районы</option>
            {availableDistricts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-3 text-left font-medium text-gray-700 sticky left-0 bg-gray-100 z-10 min-w-[200px] border-r">
                  Школа
                </th>
                {activeMetrics.map(m => (
                  <th key={m.key} className="px-2 py-3 text-center font-medium text-gray-700 min-w-[100px]">
                    <div className="text-xs">{m.label}</div>
                    <div className={`text-xs mt-1 ${
                      metricStats[m.key].remaining === 0 ? 'text-green-600' : 'text-amber-600'
                    }`}>
                      {metricStats[m.key].distributed}/{metricStats[m.key].total}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-medium text-gray-700 min-w-[80px] bg-gray-200">
                  Всего
                </th>
                <th className="px-2 py-3 text-center font-medium text-gray-700 w-12">
                  
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSchools.slice(0, 50).map((school, rowIndex) => {
                const isUnknown = school.id === UNKNOWN_SCHOOL_ID
                const isFav = favoriteSchoolIds.has(school.id)
                const schoolTotal = getSchoolTotal(school.id)
                const hasValues = schoolTotal > 0
                
                return (
                  <tr 
                    key={school.id} 
                    className={`
                      ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                      ${isUnknown ? 'bg-orange-50' : isFav && !hasValues ? 'bg-purple-50' : ''}
                      hover:bg-blue-50 transition-colors
                    `}
                  >
                    <td className={`px-3 py-2 sticky left-0 z-10 border-r ${
                      rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    } ${isUnknown ? 'bg-orange-50' : isFav && !hasValues ? 'bg-purple-50' : ''}`}>
                      <div className="flex items-center gap-2">
                        {isFav && !isUnknown && (
                          <span className="text-purple-500" title="Избранная">⭐</span>
                        )}
                        <div className="min-w-0">
                          <div className={`font-medium truncate ${
                            isUnknown ? 'text-orange-700' : 'text-gray-800'
                          }`}>
                            {school.name}
                          </div>
                          {!isUnknown && school.city && (
                            <div className="text-xs text-gray-400 truncate">
                              {school.city}{school.district && `, ${school.district}`}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    
                    {activeMetrics.map((m, colIndex) => {
                      const value = numericMetricsBySchool[m.key]?.[school.id] || 0
                      const refKey = `${school.id}-${m.key}`
                      
                      return (
                        <td key={m.key} className="px-1 py-1">
                          <input
                            ref={el => inputRefs.current[refKey] = el}
                            type="number"
                            min="0"
                            value={value || ''}
                            placeholder="0"
                            onChange={(e) => updateMetricValue(m.key, school.id, parseInt(e.target.value) || 0)}
                            onKeyDown={(e) => handleKeyDown(e, school.id, m.key)}
                            onFocus={(e) => e.target.select()}
                            className={`w-full px-2 py-1.5 text-center border rounded font-medium outline-none transition-colors
                              ${value > 0 
                                ? 'border-green-300 bg-green-50 text-green-800' 
                                : 'border-gray-200 text-gray-600 hover:border-blue-300'
                              }
                              focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                            `}
                          />
                        </td>
                      )
                    })}
                    
                    <td className="px-3 py-2 text-center font-bold bg-gray-100">
                      {schoolTotal || '-'}
                    </td>
                    
                    <td className="px-2 py-2">
                      {!allDistributed && (
                        <button
                          onClick={() => fillAllToSchool(school.id)}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors"
                          title="Весь остаток сюда"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-200 font-medium">
                <td className="px-3 py-2 sticky left-0 bg-gray-200 z-10 border-r">
                  Итого / Нужно
                </td>
                {activeMetrics.map(m => {
                  const stats = metricStats[m.key]
                  const isComplete = stats.remaining === 0
                  const isOver = stats.remaining < 0
                  
                  return (
                    <td key={m.key} className={`px-2 py-2 text-center ${
                      isComplete ? 'text-green-700 bg-green-100' : 
                      isOver ? 'text-red-700 bg-red-100' : 
                      'text-amber-700 bg-amber-100'
                    }`}>
                      {stats.distributed} / {stats.total}
                      {isComplete && ' ✓'}
                      {isOver && ` (${stats.remaining})`}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-center bg-gray-300">
                  {Object.values(metricStats).reduce((s, m) => s + m.distributed, 0)}
                </td>
                <td className="bg-gray-200"></td>
              </tr>
              {/* Строка остатков */}
              {!allDistributed && (
                <tr className="bg-amber-50">
                  <td className="px-3 py-2 sticky left-0 bg-amber-50 z-10 border-r text-amber-700">
                    Осталось распределить
                  </td>
                  {activeMetrics.map(m => {
                    const remaining = metricStats[m.key].remaining
                    return (
                      <td key={m.key} className={`px-2 py-2 text-center font-bold ${
                        remaining > 0 ? 'text-amber-700' : 'text-green-700'
                      }`}>
                        {remaining > 0 ? remaining : '-'}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center bg-amber-100 font-bold text-amber-700">
                    {Object.values(metricStats).reduce((s, m) => s + Math.max(0, m.remaining), 0)}
                  </td>
                  <td className="bg-amber-50"></td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
        
        {filteredSchools.length > 50 && (
          <div className="px-4 py-2 text-center text-sm text-gray-500 bg-gray-50 border-t">
            Показаны первые 50 школ. Используйте поиск для уточнения.
          </div>
        )}
      </div>
    </div>
  )
}

export default NumericMetricsDistribution
