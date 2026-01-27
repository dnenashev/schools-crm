import { useState, useMemo, useEffect } from 'react'
import { School, createUnknownSchool, UNKNOWN_SCHOOL_ID } from '../../types/school'
import { FUNNEL_METRICS, NUMERIC_METRICS, MetricsCount } from './MetricsInput'
import SchoolPicker from './SchoolPicker'
import { formatMsk } from '../../config/datetime'

export type SchoolSelections = Record<string, Set<string>>

interface FunnelSelectorProps {
  allSchools: School[]
  metricsCount: MetricsCount
  selections: SchoolSelections
  onSelectionsChange: (selections: SchoolSelections) => void
  selectedDate: string
}

const FunnelSelector = ({
  allSchools,
  metricsCount,
  selections,
  onSelectionsChange,
  selectedDate
}: FunnelSelectorProps) => {
  const [expandedMetric, setExpandedMetric] = useState<string | null>('newSchools')

  const getEffectiveSelectedCount = (metricKey: string): number => {
    const target = metricsCount[metricKey] || 0
    const ids = selections[metricKey] || new Set<string>()
    const hasUnknown = ids.has(UNKNOWN_SCHOOL_ID)
    const knownCount = hasUnknown ? Math.max(0, ids.size - 1) : ids.size
    return hasUnknown ? Math.max(target, knownCount) : ids.size
  }

  // Получить школы, доступные для выбора на этапе (все школы + "неизвестно")
  const getAvailableSchools = (metricKey: string): School[] => {
    // Добавляем виртуальную школу "неизвестно" в начало списка
    const unknownSchool = createUnknownSchool()
    // Важно: запись __unknown_school__ может уже приходить с сервера (для хранения метрик),
    // поэтому убираем её из списка, чтобы не показывать "неизвестно" дважды.
    const withoutUnknown = allSchools.filter(s => s.id !== UNKNOWN_SCHOOL_ID)
    return [unknownSchool, ...withoutUnknown]
  }

  // Получить рекомендуемые школы (из предыдущего этапа) для визуального выделения
  const getRecommendedSchoolIds = (metricKey: string): Set<string> => {
    const metric = FUNNEL_METRICS.find(m => m.key === metricKey)
    
    if (!metric || !metric.parentKey) {
      return new Set()
    }
    
    // Рекомендуемые школы - это выбранные на предыдущем этапе
    return selections[metric.parentKey] || new Set()
  }

  // Обработчик изменения выбора для этапа
  const handleSelectionChange = (metricKey: string, newSelection: Set<string>) => {
    // Просто обновляем выбор для этого этапа, без каскадного удаления
    // Пользователь может выбирать любые школы на любом этапе
    const newSelections = { ...selections, [metricKey]: newSelection }
    onSelectionsChange(newSelections)
  }

  // Автоматический переход к следующему незаполненному этапу
  useEffect(() => {
    const currentMetric = FUNNEL_METRICS.find(m => m.key === expandedMetric)
    if (!currentMetric) return

    const targetCount = metricsCount[expandedMetric || ''] || 0
    const effectiveCount = getEffectiveSelectedCount(expandedMetric || '')
    
    if (effectiveCount === targetCount && targetCount > 0) {
      // Найти следующий незаполненный этап (только каскадные)
      const currentIndex = FUNNEL_METRICS.findIndex(m => m.key === expandedMetric)
      
      for (let i = currentIndex + 1; i < FUNNEL_METRICS.length; i++) {
        const nextMetric = FUNNEL_METRICS[i]
        const nextTarget = metricsCount[nextMetric.key] || 0
        const nextEffective = getEffectiveSelectedCount(nextMetric.key)
        
        if (nextTarget > 0 && nextEffective < nextTarget) {
          setExpandedMetric(nextMetric.key)
          break
        }
      }
    }
  }, [selections, metricsCount, expandedMetric])

  // Проверка, все ли каскадные этапы заполнены
  const allComplete = useMemo(() => {
    // Проверяем только каскадные метрики (выбор школ)
    for (const metric of FUNNEL_METRICS) {
      const target = metricsCount[metric.key] || 0
      const selected = getEffectiveSelectedCount(metric.key)
      if (target > 0 && selected !== target) {
        return false
      }
    }
    return true
  }, [metricsCount, selections])

  const formatDate = (dateStr: string) => {
    return formatMsk(dateStr, { day: 'numeric', month: 'long', year: 'numeric' })
  }

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <h2 className="text-xl font-bold text-gray-800">Выбор школ по этапам</h2>
        <p className="text-gray-500 text-sm mt-1">
          Дата: <span className="font-medium">{formatDate(selectedDate)}</span>
        </p>
        
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <p className="font-medium mb-1">💡 Как это работает:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Школы из предыдущего этапа отмечены ⭐ и показаны первыми</li>
            <li>Можно быстро выбрать их кнопкой "Выбрать рекомендуемые"</li>
            <li>Но можно также выбрать <strong>любые другие школы</strong> через поиск</li>
            <li>Например: 10 новых школ, 0 дозвонов, но 2 встречи с предыдущих дней</li>
          </ul>
        </div>
        
        {allComplete && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Все этапы заполнены! Можно сохранять.
          </div>
        )}
      </div>

      {/* Воронка */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
          Воронка продаж
        </h3>
        
        <div className="space-y-2">
          {FUNNEL_METRICS.map((metric, index) => {
            const targetCount = metricsCount[metric.key] || 0
            const availableSchools = getAvailableSchools(metric.key)
            const recommendedIds = getRecommendedSchoolIds(metric.key)
            const currentSelection = selections[metric.key] || new Set()

            return (
              <div key={metric.key} style={{ marginLeft: `${index * 16}px` }}>
                {index > 0 && (
                  <div className="flex items-center ml-4 mb-1">
                    <span className="text-gray-300">↓</span>
                  </div>
                )}
                <SchoolPicker
                  schools={availableSchools}
                  selectedIds={currentSelection}
                  targetCount={targetCount}
                  onSelectionChange={(ids) => handleSelectionChange(metric.key, ids)}
                  label={metric.label}
                  isExpanded={expandedMetric === metric.key}
                  onToggleExpand={() => setExpandedMetric(
                    expandedMetric === metric.key ? null : metric.key
                  )}
                  recommendedIds={recommendedIds}
                />
              </div>
            )
          })}
        </div>
      </div>


      {/* Сводка выбора */}
      <div className="bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          Сводка
        </h3>
        
        <div className="space-y-1 text-sm">
          {/* Каскадные метрики (выбор школ) */}
          {FUNNEL_METRICS.map(metric => {
            const target = metricsCount[metric.key] || 0
            const selected = (selections[metric.key] || new Set()).size
            
            if (target === 0) return null
            
            const isComplete = selected === target
            
            return (
              <div key={metric.key} className="flex items-center justify-between py-1">
                <span className="text-gray-600">{metric.label}</span>
                <span className={`font-medium ${
                  isComplete ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {selected} / {target}
                  {isComplete && ' ✓'}
                </span>
              </div>
            )
          })}
          
        </div>
      </div>
    </div>
  )
}

export default FunnelSelector
