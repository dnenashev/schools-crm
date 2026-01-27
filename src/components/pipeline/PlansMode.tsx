import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../AuthProvider'
import { useMode, authenticatedFetch } from '../../config/api'
import { MonthlyPlan } from '../../types/school'
import { FUNNEL_METRICS, NUMERIC_METRICS } from './MetricsInput'

// Все метрики для планирования (объединяем воронку и числовые)
const ALL_PLAN_METRICS = [
  ...FUNNEL_METRICS.map(m => ({ key: m.key, label: m.label, type: 'funnel' as const })),
  ...NUMERIC_METRICS.map(m => ({ key: m.key, label: m.label, type: 'numeric' as const }))
]

type Step = 'select-month' | 'enter-targets' | 'distribute' | 'save'

// Утилита: получить рабочие дни месяца (Пн-Пт)
const getWorkingDaysInMonth = (month: string): string[] => {
  const [year, monthNum] = month.split('-').map(Number)
  const days: string[] = []
  
  const date = new Date(year, monthNum - 1, 1)
  while (date.getMonth() === monthNum - 1) {
    const dayOfWeek = date.getDay()
    // 0 = воскресенье, 6 = суббота
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dayStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      days.push(dayStr)
    }
    date.setDate(date.getDate() + 1)
  }
  
  return days
}

// Утилита: равномерное распределение
const distributeEvenly = (total: number, days: string[]): Record<string, number> => {
  if (days.length === 0 || total <= 0) return {}
  
  const base = Math.floor(total / days.length)
  const remainder = total % days.length
  
  const result: Record<string, number> = {}
  days.forEach((day, index) => {
    result[day] = base + (index < remainder ? 1 : 0)
  })
  
  return result
}

// Генерация списка месяцев (текущий + 5 вперед)
const generateMonthOptions = (): { value: string; label: string }[] => {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  
  for (let i = 0; i < 6; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  
  return options
}

const PlansMode = () => {
  const { isAdmin } = useAuth()
  const { apiUrl } = useMode()
  
  // State
  const [step, setStep] = useState<Step>('select-month')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [existingPlans, setExistingPlans] = useState<MonthlyPlan[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [metrics, setMetrics] = useState<Record<string, number>>({})
  const [dailyDistribution, setDailyDistribution] = useState<Record<string, Record<string, number>>>({})
  const [showSuccess, setShowSuccess] = useState(false)
  const [editingPlan, setEditingPlan] = useState<MonthlyPlan | null>(null)
  
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  
  // Загрузка существующих планов
  useEffect(() => {
    const loadPlans = async () => {
      setLoading(true)
      try {
        const res = await fetch(`${apiUrl}/plans`)
        if (res.ok) {
          const data = await res.json()
          setExistingPlans(data)
        }
      } catch (error) {
        console.error('Error loading plans:', error)
      } finally {
        setLoading(false)
      }
    }
    loadPlans()
  }, [apiUrl])
  
  // Опции месяцев
  const monthOptions = useMemo(() => generateMonthOptions(), [])
  
  // Рабочие дни выбранного месяца
  const workingDays = useMemo(() => {
    if (!selectedMonth) return []
    return getWorkingDaysInMonth(selectedMonth)
  }, [selectedMonth])
  
  // Активные метрики (с ненулевым значением)
  const activeMetrics = useMemo(() => {
    return ALL_PLAN_METRICS.filter(m => (metrics[m.key] || 0) > 0)
  }, [metrics])
  
  // Валидация: проверка что суммы по дням совпадают с месячными целями
  const distributionValidation = useMemo(() => {
    const errors: Record<string, { expected: number; actual: number }> = {}
    
    for (const metric of activeMetrics) {
      const expected = metrics[metric.key] || 0
      const distribution = dailyDistribution[metric.key] || {}
      const actual = Object.values(distribution).reduce((sum, v) => sum + v, 0)
      
      if (actual !== expected) {
        errors[metric.key] = { expected, actual }
      }
    }
    
    return errors
  }, [activeMetrics, metrics, dailyDistribution])
  
  const isDistributionValid = Object.keys(distributionValidation).length === 0
  
  // Если нет прав - показываем заглушку
  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Доступ ограничен</h2>
        <p className="text-gray-500">
          Управление планами доступно только администраторам
        </p>
      </div>
    )
  }
  
  // Обработчик выбора месяца для редактирования
  const handleEditPlan = (plan: MonthlyPlan) => {
    setEditingPlan(plan)
    setSelectedMonth(plan.month)
    setMetrics(plan.metrics || {})
    
    // Если есть сохраненное распределение - используем его
    if (plan.dailyDistribution) {
      setDailyDistribution(plan.dailyDistribution)
    } else {
      // Иначе генерируем равномерное
      const days = getWorkingDaysInMonth(plan.month)
      const newDistribution: Record<string, Record<string, number>> = {}
      for (const [key, value] of Object.entries(plan.metrics || {})) {
        if (value > 0) {
          newDistribution[key] = distributeEvenly(value, days)
        }
      }
      setDailyDistribution(newDistribution)
    }
    
    setStep('enter-targets')
  }
  
  // Обработчик выбора нового месяца
  const handleSelectNewMonth = () => {
    if (!selectedMonth) return
    
    setEditingPlan(null)
    setMetrics({})
    setDailyDistribution({})
    setStep('enter-targets')
  }
  
  // Обработчик изменения месячной цели
  const handleMetricChange = (key: string, value: number) => {
    const newMetrics = { ...metrics, [key]: Math.max(0, value) }
    setMetrics(newMetrics)
  }
  
  // Переход к распределению
  const handleGoToDistribute = () => {
    // Генерируем равномерное распределение для новых метрик
    const newDistribution = { ...dailyDistribution }
    
    for (const metric of ALL_PLAN_METRICS) {
      const value = metrics[metric.key] || 0
      if (value > 0) {
        // Если распределения нет или сумма не совпадает - генерируем новое
        const currentDistribution = newDistribution[metric.key] || {}
        const currentSum = Object.values(currentDistribution).reduce((s, v) => s + v, 0)
        
        if (currentSum !== value) {
          newDistribution[metric.key] = distributeEvenly(value, workingDays)
        }
      } else {
        // Удаляем распределение для нулевых метрик
        delete newDistribution[metric.key]
      }
    }
    
    setDailyDistribution(newDistribution)
    setStep('distribute')
  }
  
  // Обработчик изменения дневного значения
  const handleDailyValueChange = (metricKey: string, day: string, value: number) => {
    setDailyDistribution(prev => ({
      ...prev,
      [metricKey]: {
        ...(prev[metricKey] || {}),
        [day]: Math.max(0, value)
      }
    }))
  }
  
  // Сохранение плана
  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await authenticatedFetch(`${apiUrl}/plans/${selectedMonth}`, {
        method: 'PUT',
        body: JSON.stringify({
          metrics,
          dailyDistribution: activeMetrics.length > 0 ? dailyDistribution : null
        })
      })
      
      if (res.ok) {
        // Обновляем список планов
        const plansRes = await fetch(`${apiUrl}/plans`)
        if (plansRes.ok) {
          setExistingPlans(await plansRes.json())
        }
        
        setShowSuccess(true)
        setTimeout(() => {
          setShowSuccess(false)
          setStep('select-month')
          setSelectedMonth('')
          setMetrics({})
          setDailyDistribution({})
          setEditingPlan(null)
        }, 2000)
      } else {
        const error = await res.json()
        alert(`Ошибка сохранения: ${error.error || 'Неизвестная ошибка'}`)
      }
    } catch (error) {
      console.error('Error saving plan:', error)
      alert('Ошибка сохранения плана')
    } finally {
      setSaving(false)
    }
  }
  
  // Форматирование даты
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00')
    return date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })
  }
  
  // Форматирование месяца
  const formatMonth = (month: string) => {
    const [year, monthNum] = month.split('-').map(Number)
    const date = new Date(year, monthNum - 1, 1)
    const label = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  
  // Обработка Tab/Enter для перехода между полями
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
  
  // ========== РЕНДЕР ==========
  
  // Success popup
  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-md text-center shadow-2xl animate-pulse">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-green-600 mb-2">План сохранён!</h2>
          <p className="text-gray-500">
            План на {formatMonth(selectedMonth)} успешно {editingPlan ? 'обновлён' : 'создан'}
          </p>
        </div>
      </div>
    )
  }
  
  // Step 1: Select Month
  if (step === 'select-month') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Планы по месяцам</h2>
          
          {/* Выбор нового месяца */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Создать новый план
            </h3>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Выберите месяц</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Выберите месяц --</option>
                  {monthOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleSelectNewMonth}
                disabled={!selectedMonth}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Создать план
              </button>
            </div>
          </div>
          
          {/* Существующие планы */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Существующие планы
            </h3>
            
            {loading ? (
              <div className="text-center py-8 text-gray-500">Загрузка...</div>
            ) : existingPlans.length === 0 ? (
              <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg">
                Планы пока не созданы
              </div>
            ) : (
              <div className="space-y-3">
                {existingPlans
                  .sort((a, b) => b.month.localeCompare(a.month))
                  .map(plan => {
                    const totalMetrics = Object.values(plan.metrics || {}).reduce((s, v) => s + v, 0)
                    const metricsCount = Object.keys(plan.metrics || {}).filter(k => (plan.metrics[k] || 0) > 0).length
                    
                    return (
                      <div
                        key={plan.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div>
                          <div className="font-medium text-gray-900">{formatMonth(plan.month)}</div>
                          <div className="text-sm text-gray-500">
                            {metricsCount} метрик, сумма: {totalMetrics}
                          </div>
                          {plan.updatedAt && (
                            <div className="text-xs text-gray-400">
                              Обновлён: {new Date(plan.updatedAt).toLocaleDateString('ru-RU')}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleEditPlan(plan)}
                          className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          Редактировать
                        </button>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
  
  // Step 2: Enter Targets
  if (step === 'enter-targets') {
    const allMetricKeys = ALL_PLAN_METRICS.map(m => m.key)
    const totalSum = Object.values(metrics).reduce((s, v) => s + v, 0)
    
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Ввод месячных целей</h2>
              <p className="text-gray-500 text-sm mt-1">
                {formatMonth(selectedMonth)} • {workingDays.length} рабочих дней
              </p>
            </div>
            <button
              onClick={() => setStep('select-month')}
              className="text-gray-500 hover:text-gray-700"
            >
              ← Назад
            </button>
          </div>
          
          <p className="text-xs text-gray-400 mb-4">
            💡 Используйте Tab для быстрого перехода между полями
          </p>
          
          {/* Таблица воронки */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Воронка продаж
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-blue-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-blue-800">Этап</th>
                    <th className="px-4 py-2 text-center text-sm font-medium text-blue-800 w-32">План на месяц</th>
                  </tr>
                </thead>
                <tbody>
                  {FUNNEL_METRICS.map((metric, index) => (
                    <tr 
                      key={metric.key}
                      className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}
                    >
                      <td className="px-4 py-2">
                        <span className="text-sm text-gray-700">{metric.label}</span>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          ref={el => inputRefs.current[metric.key] = el}
                          type="number"
                          min="0"
                          value={metrics[metric.key] || ''}
                          placeholder="0"
                          onChange={(e) => handleMetricChange(metric.key, parseInt(e.target.value) || 0)}
                          onKeyDown={(e) => handleKeyDown(e, metric.key, allMetricKeys)}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-3 py-2 text-center border border-gray-300 rounded-lg font-medium text-gray-800 
                                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Таблица числовых метрик */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Числовые метрики
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-green-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-green-800">Метрика</th>
                    <th className="px-4 py-2 text-center text-sm font-medium text-green-800 w-32">План на месяц</th>
                  </tr>
                </thead>
                <tbody>
                  {NUMERIC_METRICS.map((metric, index) => (
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
                          value={metrics[metric.key] || ''}
                          placeholder="0"
                          onChange={(e) => handleMetricChange(metric.key, parseInt(e.target.value) || 0)}
                          onKeyDown={(e) => handleKeyDown(e, metric.key, allMetricKeys)}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-3 py-2 text-center border border-gray-300 rounded-lg font-medium text-gray-800 
                                     focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Итого и кнопка далее */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-gray-600">
              Всего метрик с планом: <span className="font-medium">{activeMetrics.length}</span>
              {totalSum > 0 && <span className="ml-2">(сумма: {totalSum})</span>}
            </div>
            <button
              onClick={handleGoToDistribute}
              disabled={activeMetrics.length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Далее: Распределение по дням →
            </button>
          </div>
        </div>
      </div>
    )
  }
  
  // Step 3: Distribute
  if (step === 'distribute') {
    return (
      <div className="max-w-full mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Распределение по дням</h2>
              <p className="text-gray-500 text-sm mt-1">
                {formatMonth(selectedMonth)} • {workingDays.length} рабочих дней
              </p>
            </div>
            <button
              onClick={() => setStep('enter-targets')}
              className="text-gray-500 hover:text-gray-700"
            >
              ← Назад к целям
            </button>
          </div>
          
          {/* Валидация */}
          {!isDistributionValid && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 font-medium mb-2">Суммы не совпадают:</p>
              <ul className="text-sm text-red-600 space-y-1">
                {Object.entries(distributionValidation).map(([key, { expected, actual }]) => {
                  const metric = ALL_PLAN_METRICS.find(m => m.key === key)
                  return (
                    <li key={key}>
                      {metric?.label}: план {expected}, распределено {actual} (разница: {actual - expected})
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          
          {/* Таблица распределения */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-2 py-2 text-left font-medium text-gray-700 sticky left-0 bg-gray-100 z-10 min-w-[150px]">
                    Дата
                  </th>
                  {activeMetrics.map(metric => (
                    <th key={metric.key} className="px-2 py-2 text-center font-medium text-gray-700 min-w-[80px]">
                      <div className="truncate" title={metric.label}>
                        {metric.label.length > 12 ? metric.label.slice(0, 10) + '...' : metric.label}
                      </div>
                      <div className="text-xs text-gray-400 font-normal">
                        ({metrics[metric.key]})
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workingDays.map((day, dayIndex) => (
                  <tr key={day} className={dayIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2 py-1 font-medium text-gray-700 sticky left-0 bg-inherit">
                      {formatDate(day)}
                    </td>
                    {activeMetrics.map(metric => {
                      const value = dailyDistribution[metric.key]?.[day] || 0
                      const inputKey = `${metric.key}_${day}`
                      
                      return (
                        <td key={metric.key} className="px-1 py-1">
                          <input
                            ref={el => inputRefs.current[inputKey] = el}
                            type="number"
                            min="0"
                            value={value || ''}
                            placeholder="0"
                            onChange={(e) => handleDailyValueChange(metric.key, day, parseInt(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            className="w-full px-2 py-1 text-center border border-gray-200 rounded text-sm
                                       focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-medium">
                <tr>
                  <td className="px-2 py-2 sticky left-0 bg-gray-100">Итого:</td>
                  {activeMetrics.map(metric => {
                    const distribution = dailyDistribution[metric.key] || {}
                    const sum = Object.values(distribution).reduce((s, v) => s + v, 0)
                    const expected = metrics[metric.key] || 0
                    const isValid = sum === expected
                    
                    return (
                      <td key={metric.key} className={`px-2 py-2 text-center ${isValid ? 'text-green-600' : 'text-red-600'}`}>
                        {sum} / {expected}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          
          {/* Кнопки */}
          <div className="flex justify-end gap-4 mt-6 pt-4 border-t">
            <button
              onClick={() => setStep('save')}
              disabled={!isDistributionValid}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Далее: Просмотр и сохранение →
            </button>
          </div>
        </div>
      </div>
    )
  }
  
  // Step 4: Save
  if (step === 'save') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-800">Просмотр и сохранение</h2>
            <button
              onClick={() => setStep('distribute')}
              className="text-gray-500 hover:text-gray-700"
            >
              ← Назад
            </button>
          </div>
          
          {/* Сводка */}
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">План на {formatMonth(selectedMonth)}</h3>
            
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Метрика</th>
                    <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">План</th>
                    <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">Ср. в день</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMetrics.map((metric, index) => {
                    const value = metrics[metric.key] || 0
                    const avgPerDay = workingDays.length > 0 ? (value / workingDays.length).toFixed(1) : '0'
                    
                    return (
                      <tr key={metric.key} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2 text-sm text-gray-700">{metric.label}</td>
                        <td className="px-4 py-2 text-center font-medium text-gray-900">{value}</td>
                        <td className="px-4 py-2 text-center text-gray-500">{avgPerDay}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Инфо */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            <p className="font-medium mb-1">Информация:</p>
            <ul className="space-y-1">
              <li>• Рабочих дней в месяце: {workingDays.length}</li>
              <li>• Метрик с планом: {activeMetrics.length}</li>
              <li>• {editingPlan ? 'Существующий план будет обновлён' : 'Будет создан новый план'}</li>
            </ul>
          </div>
          
          {/* Кнопка сохранения */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
            >
              {saving ? 'Сохранение...' : (editingPlan ? 'Обновить план' : 'Сохранить план')}
            </button>
          </div>
        </div>
      </div>
    )
  }
  
  return null
}

export default PlansMode
