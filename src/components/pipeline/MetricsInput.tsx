import { useRef } from 'react'
import { formatMsk } from '../../config/datetime'

// Конфигурация воронки метрик
export interface FunnelMetric {
  key: string
  label: string
  dateField: string
  parentKey: string | null  // Ключ родительской метрики в воронке
  isCascade: boolean        // Является ли частью каскадной воронки (выбор школ)
  isNumeric: boolean        // Является ли числовой метрикой (не выбор школ)
  hasClassDetails?: boolean // Можно ли указать детали по классам
}

// Каскадные метрики (выбор уникальных школ)
export const FUNNEL_METRICS: FunnelMetric[] = [
  { key: 'newSchools', label: 'Новые школы', dateField: 'inWorkDate', parentKey: null, isCascade: true, isNumeric: false },
  { key: 'contactMade', label: 'Контакт состоялся', dateField: 'contactDate', parentKey: 'newSchools', isCascade: true, isNumeric: false },
  { key: 'meetingScheduled', label: 'Встреча назначена', dateField: 'meetingScheduledDate', parentKey: 'contactMade', isCascade: true, isNumeric: false },
  { key: 'meetingHeld', label: 'Встреча состоялась', dateField: 'meetingHeldDate', parentKey: 'meetingScheduled', isCascade: true, isNumeric: false },
  { key: 'eventScheduled', label: 'Мероприятие назначено', dateField: 'eventScheduledDate', parentKey: 'meetingHeld', isCascade: true, isNumeric: false },
  { key: 'eventHeld', label: 'Мероприятие проведено', dateField: 'eventHeldDate', parentKey: 'eventScheduled', isCascade: true, isNumeric: false },
  { key: 'excursionPlanned', label: 'Экскурсия запланирована', dateField: 'excursionPlannedDate', parentKey: 'eventHeld', isCascade: true, isNumeric: false },
]

// Числовые метрики (не выбор школ)
export const NUMERIC_METRICS: FunnelMetric[] = [
  { key: 'parentContacts', label: 'Кол-во контактов родителя', dateField: 'parentContactsDate', parentKey: null, isCascade: false, isNumeric: true, hasClassDetails: true },
  { key: 'loadedToCRM', label: 'Загружено в CRM', dateField: 'loadedToCRMDate', parentKey: null, isCascade: false, isNumeric: true, hasClassDetails: true },
  { key: 'qualifiedLeads', label: 'Квал заявки', dateField: 'qualifiedLeadDate', parentKey: null, isCascade: false, isNumeric: true },
  { key: 'arrivedToCampus', label: 'Доехавшие до кампуса', dateField: 'arrivedToCampusDate', parentKey: null, isCascade: false, isNumeric: true },
  { key: 'preliminaryMeetings', label: 'Предвары', dateField: 'preliminaryMeetingDate', parentKey: null, isCascade: false, isNumeric: true },
]

// Для обратной совместимости
export const ADDITIONAL_METRICS: FunnelMetric[] = NUMERIC_METRICS

export type MetricsCount = Record<string, number>

interface MetricsInputProps {
  metricsCount: MetricsCount
  onChange: (metrics: MetricsCount) => void
  selectedDate: string
}

const MetricsInput = ({ metricsCount, onChange, selectedDate }: MetricsInputProps) => {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const updateMetric = (key: string, value: number) => {
    const newMetrics = { ...metricsCount, [key]: Math.max(0, value) }
    onChange(newMetrics)
  }

  const formatDate = (dateStr: string) => {
    return formatMsk(dateStr, { day: 'numeric', month: 'long', year: 'numeric' })
  }

  // Обработка Tab/Enter для перехода к следующему полю
  const handleKeyDown = (e: React.KeyboardEvent, currentKey: string, allKeys: string[]) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      const currentIndex = allKeys.indexOf(currentKey)
      const nextIndex = e.shiftKey ? currentIndex - 1 : currentIndex + 1
      
      if (nextIndex >= 0 && nextIndex < allKeys.length) {
        const nextKey = allKeys[nextIndex]
        inputRefs.current[nextKey]?.focus()
        inputRefs.current[nextKey]?.select()
      }
    }
  }

  const allMetricKeys = [...FUNNEL_METRICS.map(m => m.key), ...NUMERIC_METRICS.map(m => m.key)]

  // Общее количество школ для выбора
  const totalSchoolsToSelect = FUNNEL_METRICS.reduce((sum, m) => sum + (metricsCount[m.key] || 0), 0)
  const totalNumeric = NUMERIC_METRICS.reduce((sum, m) => sum + (metricsCount[m.key] || 0), 0)

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800">Ввод количеств за день</h2>
        <p className="text-gray-500 text-sm mt-1">
          Дата: <span className="font-medium">{formatDate(selectedDate)}</span>
        </p>
        <p className="text-xs text-gray-400 mt-2">
          💡 Используйте Tab для быстрого перехода между полями
        </p>
      </div>

      {/* Таблица воронки */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          Воронка продаж (выбор школ)
        </h3>
        
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-blue-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-blue-800">Этап</th>
                <th className="px-4 py-2 text-center text-sm font-medium text-blue-800 w-32">Количество</th>
              </tr>
            </thead>
            <tbody>
              {FUNNEL_METRICS.map((metric, index) => {
                const value = metricsCount[metric.key] || 0
                const parentValue = metric.parentKey ? (metricsCount[metric.parentKey] || 0) : null
                
                return (
                  <tr 
                    key={metric.key} 
                    className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-300">{index > 0 ? '└' : ''}</span>
                        <span className="text-sm text-gray-700">{metric.label}</span>
                        {parentValue !== null && parentValue > 0 && (
                          <span className="text-xs text-gray-400">(≤{parentValue})</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        ref={el => inputRefs.current[metric.key] = el}
                        type="number"
                        min="0"
                        value={value || ''}
                        placeholder="0"
                        onChange={(e) => updateMetric(metric.key, parseInt(e.target.value) || 0)}
                        onKeyDown={(e) => handleKeyDown(e, metric.key, allMetricKeys)}
                        onFocus={(e) => e.target.select()}
                        className="w-full px-3 py-2 text-center border border-gray-300 rounded-lg font-medium text-gray-800 
                                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none
                                   hover:border-blue-400 transition-colors"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-blue-100">
              <tr>
                <td className="px-4 py-2 text-sm font-medium text-blue-800">Всего школ для выбора:</td>
                <td className="px-4 py-2 text-center font-bold text-blue-800">{totalSchoolsToSelect}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Таблица числовых метрик */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          Числовые метрики (распределение по школам)
        </h3>
        
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-green-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-green-800">Метрика</th>
                <th className="px-4 py-2 text-center text-sm font-medium text-green-800 w-32">Количество</th>
              </tr>
            </thead>
            <tbody>
              {NUMERIC_METRICS.map((metric, index) => {
                const value = metricsCount[metric.key] || 0
                
                return (
                  <tr 
                    key={metric.key} 
                    className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-green-50 transition-colors`}
                  >
                    <td className="px-4 py-2">
                      <span className="text-sm text-gray-700">{metric.label}</span>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        ref={el => inputRefs.current[metric.key] = el}
                        type="number"
                        min="0"
                        value={value || ''}
                        placeholder="0"
                        onChange={(e) => updateMetric(metric.key, parseInt(e.target.value) || 0)}
                        onKeyDown={(e) => handleKeyDown(e, metric.key, allMetricKeys)}
                        onFocus={(e) => e.target.select()}
                        className="w-full px-3 py-2 text-center border border-gray-300 rounded-lg font-medium text-gray-800 
                                   focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none
                                   hover:border-green-400 transition-colors"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-green-100">
              <tr>
                <td className="px-4 py-2 text-sm font-medium text-green-800">Всего числовых:</td>
                <td className="px-4 py-2 text-center font-bold text-green-800">{totalNumeric}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Подсказка */}
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
        <p className="font-medium mb-1">💡 Подсказка:</p>
        <p>Можно ввести любое количество на любом этапе. Например: 10 новых, 0 дозвонов, но 2 встречи — это нормально.</p>
      </div>
    </div>
  )
}

export default MetricsInput
