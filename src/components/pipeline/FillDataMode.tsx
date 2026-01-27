import { useState, useEffect, useMemo } from 'react'
import { School, UNKNOWN_SCHOOL_ID } from '../../types/school'
import { useApiUrl, authenticatedFetch } from '../../config/api'
import { formatMsk } from '../../config/datetime'
import DayCalendar from './DayCalendar'
import MetricsInput, { MetricsCount, FUNNEL_METRICS, NUMERIC_METRICS } from './MetricsInput'
import FunnelSelector, { SchoolSelections } from './FunnelSelector'
import NumericMetricsDistribution from './NumericMetricsDistribution'

type Step = 1 | 2 | 3 | 4

// Числовые метрики по школам: { [metricKey]: { [schoolId]: number } }
export type NumericMetricsBySchool = Record<string, Record<string, number>>

const FillDataMode = () => {
  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [metricsCount, setMetricsCount] = useState<MetricsCount>({})
  const [selections, setSelections] = useState<SchoolSelections>({})
  const [numericMetricsBySchool, setNumericMetricsBySchool] = useState<NumericMetricsBySchool>({})
  
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  
  const API_URL = useApiUrl()

  // Загрузка школ
  useEffect(() => {
    loadSchools()
  }, [API_URL])

  const loadSchools = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/schools`)
      if (res.ok) {
        const data = await res.json()
        // Дедупликация
        const uniqueData = Array.from(
          new Map(data.map((s: School) => [s.id, s])).values()
        )
        setSchools(uniqueData)
      }
    } catch (error) {
      console.error('Error loading schools:', error)
    } finally {
      setLoading(false)
    }
  }

  // Проверка валидности шага 2
  const isStep2Valid = useMemo(() => {
    // Должна быть хотя бы одна метрика с ненулевым значением
    const totalMetrics = Object.values(metricsCount).reduce((sum, v) => sum + v, 0)
    return totalMetrics > 0
  }, [metricsCount])

  // Проверяем, есть ли каскадные метрики для заполнения
  const hasCascadeMetrics = useMemo(() => {
    return FUNNEL_METRICS.some(m => (metricsCount[m.key] || 0) > 0)
  }, [metricsCount])

  const getEffectiveCascadeSelectedCount = (metricKey: string): number => {
    const target = metricsCount[metricKey] || 0
    const ids = selections[metricKey] || new Set<string>()
    const hasUnknown = ids.has(UNKNOWN_SCHOOL_ID)
    const knownCount = hasUnknown ? Math.max(0, ids.size - 1) : ids.size
    return hasUnknown ? Math.max(target, knownCount) : ids.size
  }

  // Проверка, все ли каскадные метрики заполнены на шаге 3
  const isStep3Complete = useMemo(() => {
    // Если нет каскадных метрик, шаг считается выполненным
    if (!hasCascadeMetrics) {
      return true
    }
    
    // Проверяем, что все каскадные метрики заполнены
    for (const metric of FUNNEL_METRICS) {
      const target = metricsCount[metric.key] || 0
      const selected = getEffectiveCascadeSelectedCount(metric.key)
      if (target > 0 && selected !== target) {
        return false
      }
    }
    return true
  }, [metricsCount, selections, hasCascadeMetrics])

  // Проверяем, есть ли числовые метрики для распределения
  const hasNumericMetrics = useMemo(() => {
    return NUMERIC_METRICS.some(m => (metricsCount[m.key] || 0) > 0)
  }, [metricsCount])

  // Проверка, все ли числовые метрики распределены на шаге 4
  const isStep4Complete = useMemo(() => {
    // Если нет числовых метрик, шаг считается выполненным
    if (!hasNumericMetrics) {
      return true
    }
    
    // Проверяем, что все числовые метрики распределены
    for (const metric of NUMERIC_METRICS) {
      const totalValue = metricsCount[metric.key] || 0
      if (totalValue > 0) {
        const metricBySchool = numericMetricsBySchool[metric.key] || {}
        const sumBySchool = Object.values(metricBySchool).reduce((sum, v) => sum + v, 0)
        if (sumBySchool !== totalValue) {
          return false
        }
      }
    }
    return true
  }, [metricsCount, numericMetricsBySchool, hasNumericMetrics])

  // Проверка, можно ли сохранить (есть каскадные метрики или числовые распределены)
  const canSave = useMemo(() => {
    // Можно сохранить каскадные метрики, даже если числовые не распределены
    // (числовые просто не будут сохранены)
    if (hasCascadeMetrics && isStep3Complete) {
      return true
    }
    // Если нет каскадных, но есть числовые - требуем их полного распределения
    if (hasNumericMetrics) {
      return isStep4Complete
    }
    // Если нет метрик вообще - нельзя сохранить
    return false
  }, [hasCascadeMetrics, hasNumericMetrics, isStep3Complete, isStep4Complete])

  // Сохранение данных
  const handleSave = async () => {
    if (!selectedDate) return
    
    setSaving(true)
    setSaveSuccess(false)
    
      try {
        // Собираем данные для обновления школ (только каскадные метрики)
        const updates: { schoolId: string; dateField: string; date: string }[] = []
        const unknownFunnelMetrics: Record<string, number> = {}
        
        if (hasCascadeMetrics) {
          for (const metric of FUNNEL_METRICS) {
            const target = metricsCount[metric.key] || 0
            const selectedIds = selections[metric.key] || new Set()

            const hasUnknown = selectedIds.has(UNKNOWN_SCHOOL_ID)
            const knownIds = Array.from(selectedIds).filter(id => id !== UNKNOWN_SCHOOL_ID)

            // Сохраняем статусы для известных школ
            knownIds.forEach((schoolId) => {
              updates.push({
                schoolId,
                dateField: metric.dateField,
                date: selectedDate
              })
            })

            // Если выбрано "неизвестно", считаем сколько школ "закрывает" оно
            if (hasUnknown && target > 0) {
              const unknownCount = Math.max(0, target - knownIds.length)
              if (unknownCount > 0) {
                unknownFunnelMetrics[metric.key] = (unknownFunnelMetrics[metric.key] || 0) + unknownCount
              }
            }
          }
        }

        // Собираем числовые метрики для сохранения (уже распределены по школам)
        const numericMetricsForSave: Array<{
          schoolId: string
          metrics: Record<string, number>
        }> = []
        
        if (hasNumericMetrics) {
          // Группируем по школам
          const schoolMetricsMap: Record<string, Record<string, number>> = {}
          
          Object.entries(numericMetricsBySchool).forEach(([metricKey, schoolValues]) => {
            Object.entries(schoolValues).forEach(([schoolId, value]) => {
              if (value > 0) {
                if (!schoolMetricsMap[schoolId]) {
                  schoolMetricsMap[schoolId] = {}
                }
                schoolMetricsMap[schoolId][metricKey] = value
              }
            })
          })
          
          // Преобразуем в массив
          Object.entries(schoolMetricsMap).forEach(([schoolId, metrics]) => {
            numericMetricsForSave.push({ schoolId, metrics })
          })
        }

        // Проверяем, что есть что сохранять
        const hasUnknownFunnel = Object.keys(unknownFunnelMetrics).length > 0
        if (updates.length === 0 && numericMetricsForSave.length === 0 && !hasUnknownFunnel) {
          alert('Нет данных для сохранения. Заполните хотя бы одну метрику.')
          setSaving(false)
          return
        }

        // Отправляем на сервер
        const res = await authenticatedFetch(`${API_URL}/schools/batch-update`, {
          method: 'POST',
          body: JSON.stringify({ 
            updates,
            numericMetricsBySchool: numericMetricsForSave,
            unknownFunnelMetrics,
            date: selectedDate
          })
        })

        if (res.ok) {
          const responseData = await res.json()
          setSaveSuccess(true)
          // Сбрасываем форму через 3 секунды (больше времени на просмотр попапа)
          setTimeout(() => {
            setCurrentStep(1)
            setSelectedDate(null)
            setMetricsCount({})
            setSelections({})
            setNumericMetricsBySchool({})
            setSaveSuccess(false)
            loadSchools()
          }, 3000)
        } else if (res.status === 401) {
          alert('Необходима авторизация. Войдите в систему.')
        } else if (res.status === 403) {
          alert('Недостаточно прав для выполнения этой операции.')
        } else {
          const data = await res.json()
          if (res.status === 400 && data?.debug) {
            const debug = data.debug
            alert(
              `${data.error || 'Ошибка сохранения'}\n\n` +
              `debug:\n` +
              `- date: ${debug.date}\n` +
              `- updatesLength: ${debug.updatesLength}\n` +
              `- numericMetricsLength: ${debug.numericMetricsLength}\n` +
              `- unknownFunnelCount: ${debug.unknownFunnelCount}\n` +
              `- unknownFunnelMetrics: ${JSON.stringify(debug.unknownFunnelMetrics)}\n` +
              `- cleanedUnknownFunnel: ${JSON.stringify(debug.cleanedUnknownFunnel)}\n`
            )
          } else {
            alert(data.error || 'Ошибка сохранения')
          }
        }
    } catch (error) {
      console.error('Error saving:', error)
      alert('Ошибка сохранения данных')
    } finally {
      setSaving(false)
    }
  }

  // Сброс формы
  const handleReset = () => {
    setCurrentStep(1)
    setSelectedDate(null)
    setMetricsCount({})
    setSelections({})
    setNumericMetricsBySchool({})
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Прогресс шагов */}
      <div className="mb-8">
        <div className="flex items-center justify-center">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center">
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-bold
                  ${currentStep >= step 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-500'
                  }
                `}
              >
                {step}
              </div>
              {step < 4 && (
                <div className={`w-20 h-1 mx-2 ${
                  currentStep > step ? 'bg-blue-600' : 'bg-gray-200'
                }`} />
              )}
            </div>
          ))}
        </div>
        
        <div className="flex justify-center mt-2 text-sm text-gray-600">
          <span className={`w-28 text-center ${currentStep === 1 ? 'font-medium text-blue-600' : ''}`}>
            Дата
          </span>
          <span className={`w-28 text-center ${currentStep === 2 ? 'font-medium text-blue-600' : ''}`}>
            Количества
          </span>
          <span className={`w-28 text-center ${currentStep === 3 ? 'font-medium text-blue-600' : ''}`}>
            Школы
          </span>
          <span className={`w-28 text-center ${currentStep === 4 ? 'font-medium text-blue-600' : ''}`}>
            Распределение
          </span>
        </div>
      </div>

      {/* Шаг 1: Выбор даты */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <DayCalendar
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
          />
          
          <div className="flex justify-center">
            <button
              onClick={() => setCurrentStep(2)}
              disabled={!selectedDate}
              className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                selectedDate
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              Далее
            </button>
          </div>
        </div>
      )}

      {/* Шаг 2: Ввод количеств */}
      {currentStep === 2 && selectedDate && (
        <div className="space-y-6">
          <MetricsInput
            metricsCount={metricsCount}
            onChange={setMetricsCount}
            selectedDate={selectedDate}
          />
          
          <div className="flex justify-center gap-4">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-6 py-3 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              Назад
            </button>
            <button
              onClick={() => {
                // Инициализируем selections пустыми Set только для каскадных метрик
                const initialSelections: SchoolSelections = {}
                for (const metric of FUNNEL_METRICS) {
                  initialSelections[metric.key] = new Set()
                }
                setSelections(initialSelections)
                
                // Определяем, на какой шаг переходить
                const hasCascade = FUNNEL_METRICS.some(m => (metricsCount[m.key] || 0) > 0)
                const hasNumeric = NUMERIC_METRICS.some(m => (metricsCount[m.key] || 0) > 0)
                
                if (hasCascade) {
                  // Есть каскадные метрики - идем на шаг 3
                  setCurrentStep(3)
                } else if (hasNumeric) {
                  // Нет каскадных, но есть числовые - пропускаем шаг 3, идем на шаг 4
                  setCurrentStep(4)
                } else {
                  // Нет метрик вообще (не должно произойти, т.к. кнопка заблокирована)
                  setCurrentStep(3)
                }
              }}
              disabled={!isStep2Valid}
              className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                isStep2Valid
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              Далее
            </button>
          </div>
        </div>
      )}

      {/* Шаг 3: Выбор школ (каскадные метрики) */}
      {currentStep === 3 && selectedDate && (
        <div className="space-y-6">
          {hasCascadeMetrics ? (
            <>
              <FunnelSelector
                allSchools={schools}
                metricsCount={metricsCount}
                selections={selections}
                onSelectionsChange={setSelections}
                selectedDate={selectedDate}
              />
              
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-6 py-3 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                  Назад
                </button>
                <button
                  onClick={() => {
                    // Если есть числовые метрики, идем на шаг 4, иначе сохраняем
                    if (hasNumericMetrics) {
                      setCurrentStep(4)
                    } else {
                      handleSave()
                    }
                  }}
                  disabled={!isStep3Complete || saving}
                  className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                    isStep3Complete && !saving
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {saving ? 'Сохранение...' : hasNumericMetrics ? 'Далее' : 'Сохранить'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white rounded-lg shadow-lg p-6 text-center">
                <p className="text-gray-500 mb-4">Нет каскадных метрик для выбора школ.</p>
                {hasNumericMetrics ? (
                  <p className="text-sm text-gray-600">Переходим к распределению числовых метрик...</p>
                ) : (
                  <p className="text-sm text-gray-600">Все метрики заполнены. Можно сохранить.</p>
                )}
              </div>
              
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-6 py-3 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                  Назад
                </button>
                <button
                  onClick={() => {
                    // Если есть числовые метрики, идем на шаг 4, иначе сохраняем
                    if (hasNumericMetrics) {
                      setCurrentStep(4)
                    } else {
                      handleSave()
                    }
                  }}
                  disabled={saving}
                  className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                    !saving
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {saving ? 'Сохранение...' : hasNumericMetrics ? 'Далее' : 'Сохранить'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Шаг 4: Распределение числовых метрик по школам */}
      {currentStep === 4 && selectedDate && (
        <div className="space-y-6">
          {/* Предупреждение, если числовые метрики не распределены, но есть каскадные */}
          {hasNumericMetrics && !isStep4Complete && hasCascadeMetrics && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Внимание:</strong> Числовые метрики указаны, но не распределены по школам. 
                Если сохранить сейчас, каскадные метрики будут сохранены, а числовые метрики будут пропущены.
                Распределите числовые метрики, чтобы сохранить их тоже.
              </p>
            </div>
          )}
          
          <NumericMetricsDistribution
            allSchools={schools}
            metricsCount={metricsCount}
            numericMetricsBySchool={numericMetricsBySchool}
            onNumericMetricsChange={setNumericMetricsBySchool}
            selectedDate={selectedDate}
            recommendedSchoolIds={selections['eventHeld'] || new Set()}
          />
          
          <div className="flex justify-center gap-4">
            <button
              onClick={() => setCurrentStep(3)}
              className="px-6 py-3 rounded-lg font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              Назад
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                canSave && !saving
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              {saving ? 'Сохранение...' : 'Сохранить день'}
            </button>
          </div>
          
        </div>
      )}

      {/* Попап успешного сохранения (показывается на любом шаге) */}
      {saveSuccess && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
          style={{ animation: 'fadeIn 0.3s ease-in' }}
          onClick={() => {
            // Закрыть попап при клике вне его
            setSaveSuccess(false)
            setCurrentStep(1)
            setSelectedDate(null)
            setMetricsCount({})
            setSelections({})
            setNumericMetricsBySchool({})
            loadSchools()
          }}
        >
          <div 
            className="bg-white rounded-xl p-8 text-center shadow-2xl max-w-md mx-4"
            style={{ animation: 'scaleIn 0.3s ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-3">✅ Успешно сохранено!</h3>
            <p className="text-gray-600 mb-4">
              Данные за <span className="font-semibold text-gray-800">
                {selectedDate ? formatMsk(selectedDate, { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
              </span> успешно сохранены
            </p>
            <div className="mt-4 space-y-2 bg-gray-50 rounded-lg p-4">
              {hasCascadeMetrics && isStep3Complete && (
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm text-green-700 font-medium">
                    Каскадные метрики сохранены (вкл. неизвестные)
                  </p>
                </div>
              )}
              {hasNumericMetrics && numericMetricsBySchool && Object.keys(numericMetricsBySchool).length > 0 && isStep4Complete && (
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm text-green-700 font-medium">
                    Числовые метрики сохранены
                  </p>
                </div>
              )}
              {hasNumericMetrics && (!numericMetricsBySchool || Object.keys(numericMetricsBySchool).length === 0 || !isStep4Complete) && (
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm text-amber-600 font-medium">
                    Числовые метрики не были распределены
                  </p>
                </div>
              )}
            </div>
            <div className="mt-6 pt-4 border-t">
              <p className="text-xs text-gray-500">Нажмите вне попапа или подождите 3 секунды...</p>
            </div>
          </div>
        </div>
      )}

      {/* Кнопка сброса (видна на шагах 2 и 3) */}
      {currentStep > 1 && (
        <div className="mt-8 text-center">
          <button
            onClick={handleReset}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Начать заново
          </button>
        </div>
      )}
    </div>
  )
}

export default FillDataMode
