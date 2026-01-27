import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { School, UNKNOWN_SCHOOL_ID } from '../../types/school'
import { useApiUrl, authenticatedFetch } from '../../config/api'
import { formatMsk, formatMskYmd } from '../../config/datetime'

// Маппинг ключей метрик на названия (воронка + числовые)
const METRIC_LABELS: Record<string, string> = {
  newSchools: 'Новые школы',
  contactMade: 'Контакт состоялся',
  meetingScheduled: 'Встреча назначена',
  meetingHeld: 'Встреча состоялась',
  eventScheduled: 'Мероприятие назначено',
  eventHeld: 'Мероприятие проведено',
  excursionPlanned: 'Экскурсия запланирована',
  parentContacts: 'Кол-во контактов родителя',
  loadedToCRM: 'Кол-во загруженных в CRM',
  qualifiedLeads: 'Квал заявки',
  arrivedToCampus: 'Доехавшие до кампуса',
  preliminaryMeetings: 'Предвары',
}

interface UnknownItem {
  unknownSchoolId: string
  activityId: string
  date: string
  metricKey: string
  metricLabel: string
  count: number
  metricType: 'funnel' | 'numeric'
}

interface Resolution {
  schoolId: string
  schoolName: string
  date: string
  value?: number
}

type Step = 'period' | 'list' | 'resolve'

const ResolveUnknownMode = () => {
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState<Step>('period')
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [unknownItems, setUnknownItems] = useState<UnknownItem[]>([])
  const [selectedItem, setSelectedItem] = useState<UnknownItem | null>(null)
  const [resolutions, setResolutions] = useState<Resolution[]>([])
  const [mode, setMode] = useState<'simple' | 'detailed'>('simple')
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<Set<string>>(new Set())
  const [numericAllocations, setNumericAllocations] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState<string>('all')
  const [districtFilter, setDistrictFilter] = useState<string>('all')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

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
        // Дедупликация по ID (иначе React ругается на повторяющиеся key и фильтры выглядят «сломанными»)
        const uniqueData = Array.from(
          new Map((data as School[]).map((s: School) => [s.id, s])).values()
        )
        setSchools(uniqueData)
      }
    } catch (error) {
      console.error('Error loading schools:', error)
    } finally {
      setLoading(false)
    }
  }

  // Авто-инициализация из URL: /pipeline?mode=resolve-unknown&from=...&to=...&metric=...
  useEffect(() => {
    if (schools.length === 0) return
    if (step !== 'period') return

    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const metric = searchParams.get('metric')

    if (!from || !to) return

    const items = extractUnknownItems(from, to)
    const filtered = metric ? items.filter(i => i.metricKey === metric) : items

    setPeriod({ from, to })
    setUnknownItems(filtered)
    setStep('list')

    // Если остался ровно один пункт — сразу открываем экран раскрытия
    if (filtered.length === 1) {
      handleSelectItem(filtered[0])
    }
  }, [schools, step, searchParams])

  // Пресеты периодов
  const presets = useMemo(() => {
    const today = new Date()
    const todayStr = formatMskYmd(today)

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = formatMskYmd(yesterday)

    // Начало этой недели (понедельник)
    const thisWeekStart = new Date(today)
    const dayOfWeek = thisWeekStart.getDay()
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    thisWeekStart.setDate(thisWeekStart.getDate() + daysToMonday)

    // Прошлая неделя
    const lastWeekStart = new Date(thisWeekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(thisWeekStart)
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1)

    // Этот месяц
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)

    return [
      { label: 'Сегодня', from: todayStr, to: todayStr },
      { label: 'Вчера', from: yesterdayStr, to: yesterdayStr },
      { label: 'Эта неделя', from: formatMskYmd(thisWeekStart), to: todayStr },
      { label: 'Прошлая неделя', from: formatMskYmd(lastWeekStart), to: formatMskYmd(lastWeekEnd) },
      { label: 'Этот месяц', from: formatMskYmd(thisMonthStart), to: todayStr },
    ]
  }, [])

  // Извлечение неизвестных: funnel_metrics + numeric_metrics
  const extractUnknownItems = (from: string, to: string): UnknownItem[] => {
    const unknownSchools = schools.filter(s => s.id === UNKNOWN_SCHOOL_ID || s.name === '❓ Неизвестно')
    if (unknownSchools.length === 0) return []

    const items: UnknownItem[] = []

    unknownSchools.forEach((unknownSchool) => {
      if (!unknownSchool.activities) return

      // funnel_metrics (счёт школ)
      unknownSchool.activities
        .filter(a => a.type === 'funnel_metrics' && a.date >= from && a.date <= to)
        .forEach(activity => {
          if (!activity.metrics) return
          Object.entries(activity.metrics).forEach(([metricKey, count]) => {
            if (typeof count === 'number' && count > 0) {
              items.push({
                unknownSchoolId: unknownSchool.id,
                activityId: activity.id,
                date: activity.date,
                metricKey,
                metricLabel: METRIC_LABELS[metricKey] || metricKey,
                count,
                metricType: 'funnel'
              })
            }
          })
        })

      // numeric_metrics (значения)
      unknownSchool.activities
        .filter(a => a.type === 'numeric_metrics' && a.date >= from && a.date <= to)
        .forEach(activity => {
          // legacy parentContacts
          const legacyParentContacts = typeof activity.parentContacts === 'number' ? activity.parentContacts : 0

          if (!activity.metrics) return
          const metrics = activity.metrics as Record<string, unknown>

          // parentContacts мог быть и в legacy поле, и в metrics — не дублируем, а суммируем
          const fromMetricsParentContacts = typeof metrics.parentContacts === 'number' ? (metrics.parentContacts as number) : 0
          const combinedParentContacts = legacyParentContacts + fromMetricsParentContacts
          if (combinedParentContacts > 0) {
            items.push({
              unknownSchoolId: unknownSchool.id,
              activityId: activity.id,
              date: activity.date,
              metricKey: 'parentContacts',
              metricLabel: METRIC_LABELS['parentContacts'],
              count: combinedParentContacts,
              metricType: 'numeric'
            })
          }

          Object.entries(activity.metrics).forEach(([metricKey, value]) => {
            if (metricKey === 'parentContacts') return
            if (typeof value === 'number' && value > 0) {
              items.push({
                unknownSchoolId: unknownSchool.id,
                activityId: activity.id,
                date: activity.date,
                metricKey,
                metricLabel: METRIC_LABELS[metricKey] || metricKey,
                count: value,
                metricType: 'numeric'
              })
            }
          })
        })
    })

    // Сортировка по дате (новые первыми)
    items.sort((a, b) => b.date.localeCompare(a.date))

    return items
  }

  // Обработчик выбора периода
  const handlePeriodSelect = (from: string, to: string) => {
    setPeriod({ from, to })
    const items = extractUnknownItems(from, to)
    setUnknownItems(items)
    setStep('list')
  }

  // Обработчик выбора элемента для раскрытия
  const handleSelectItem = (item: UnknownItem) => {
    setSelectedItem(item)
    setResolutions([])
    setSelectedSchoolIds(new Set())
    setNumericAllocations({})
    setSearch('')
    setCityFilter('all')
    setDistrictFilter('all')
    setMode('simple')
    setStep('resolve')
  }

  const availableCities = useMemo(() => {
    const set = new Set<string>()
    schools
      .filter(s => s.id !== UNKNOWN_SCHOOL_ID)
      .forEach(s => {
        const v = (s.city || '').trim()
        if (v) set.add(v)
      })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [schools])

  const availableDistricts = useMemo(() => {
    const set = new Set<string>()
    schools
      .filter(s => s.id !== UNKNOWN_SCHOOL_ID)
      .forEach(s => {
        const v = (s.district || '').trim()
        if (v) set.add(v)
      })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [schools])

  // Фильтрованный список школ (без __unknown_school__)
  const filteredSchools = useMemo(() => {
    let filtered = schools.filter(s => s.id !== UNKNOWN_SCHOOL_ID)

    if (cityFilter !== 'all') {
      filtered = filtered.filter(s => (s.city || '').trim() === cityFilter)
    }
    if (districtFilter !== 'all') {
      filtered = filtered.filter(s => (s.district || '').trim() === districtFilter)
    }

    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(searchLower) ||
        s.city.toLowerCase().includes(searchLower) ||
        s.district.toLowerCase().includes(searchLower)
      )
    }

    // Выбранные школы первыми
    return [...filtered].sort((a, b) => {
      const aSelected = selectedSchoolIds.has(a.id)
      const bSelected = selectedSchoolIds.has(b.id)
      if (aSelected && !bSelected) return -1
      if (!aSelected && bSelected) return 1
      return 0
    })
  }, [schools, search, selectedSchoolIds, cityFilter, districtFilter])

  // Простой режим: переключение выбора школы
  const toggleSchoolSelection = (school: School) => {
    const newSet = new Set(selectedSchoolIds)
    if (newSet.has(school.id)) {
      newSet.delete(school.id)
    } else {
      newSet.add(school.id)
    }
    setSelectedSchoolIds(newSet)
  }

  // Детальный режим: добавить строку
  const addResolutionRow = () => {
    if (!selectedItem) return
    setResolutions([...resolutions, { schoolId: '', schoolName: '', date: selectedItem.date }])
  }

  // Детальный режим: удалить строку
  const removeResolutionRow = (index: number) => {
    setResolutions(resolutions.filter((_, i) => i !== index))
  }

  // Детальный режим: обновить строку
  const updateResolution = (index: number, field: keyof Resolution, value: string) => {
    const newResolutions = [...resolutions]
    newResolutions[index] = { ...newResolutions[index], [field]: value }

    // Если выбрали школу, обновляем имя
    if (field === 'schoolId') {
      const school = schools.find(s => s.id === value)
      newResolutions[index].schoolName = school?.name || ''
    }

    setResolutions(newResolutions)
  }

  // Сохранение
  const handleSave = async () => {
    if (!selectedItem) return

    let resolveData: Array<{ schoolId: string; date: string; value?: number }> = []

    if (selectedItem.metricType === 'funnel') {
      if (mode === 'simple') {
        // Простой режим: все выбранные школы с одной датой
        resolveData = Array.from(selectedSchoolIds).map(schoolId => ({
          schoolId,
          date: selectedItem.date
        }))
      } else {
        // Детальный режим: из таблицы
        resolveData = resolutions
          .filter(r => r.schoolId && r.date)
          .map(r => ({ schoolId: r.schoolId, date: r.date }))
      }
    } else {
      // numeric: берём распределение значений по школам
      resolveData = Object.entries(numericAllocations)
        .filter(([, v]) => typeof v === 'number' && v > 0)
        .map(([schoolId, v]) => ({ schoolId, date: selectedItem.date, value: v }))
    }

    if (resolveData.length === 0) {
      alert('Выберите хотя бы одну школу')
      return
    }

    setSaving(true)
    try {
      const res = await authenticatedFetch(`${API_URL}/schools/resolve-unknown`, {
        method: 'POST',
        body: JSON.stringify({
          unknownSchoolId: selectedItem.unknownSchoolId,
          activityId: selectedItem.activityId,
          metricKey: selectedItem.metricKey,
          metricType: selectedItem.metricType,
          resolutions: resolveData
        })
      })

      if (res.ok) {
        const data = await res.json()
        setSuccessMessage(`Раскрыто ${data.resolvedCount} школ из ${selectedItem.count}`)

        // Перезагружаем данные
        await loadSchools()

        // Через 2 секунды возвращаемся к списку
        setTimeout(() => {
          setSuccessMessage(null)
          setSelectedItem(null)

          // Обновляем список неизвестных
          if (period) {
            const items = extractUnknownItems(period.from, period.to)
            setUnknownItems(items)
          }
          setStep('list')
        }, 2000)
      } else {
        const error = await res.json()
        alert(error.error || 'Ошибка при раскрытии')
      }
    } catch (error) {
      console.error('Error resolving:', error)
      alert('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  // Форматирование даты
  const formatDate = (dateStr: string) => {
    return formatMsk(dateStr, { day: 'numeric', month: 'long', year: 'numeric' })
  }

  if (loading && schools.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Заголовок */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-800">Решение неизвестности</h2>
        <p className="text-gray-500 text-sm mt-1">
          Замените неизвестные школы реальными данными
        </p>
      </div>

      {/* Шаг 1: Выбор периода */}
      {step === 'period' && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Выберите период</h3>

          {/* Пресеты */}
          <div className="flex flex-wrap gap-2 mb-6">
            {presets.map((preset, index) => (
              <button
                key={index}
                onClick={() => handlePeriodSelect(preset.from, preset.to)}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Ручной выбор */}
          <div className="border-t pt-4">
            <p className="text-sm text-gray-600 mb-3">Или укажите даты вручную:</p>
            <div className="flex gap-4 items-end">
              <div>
                <label className="block text-xs text-gray-500 mb-1">От</label>
                <input
                  type="date"
                  className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  onChange={(e) => {
                    const from = e.target.value
                    const toInput = document.getElementById('period-to') as HTMLInputElement
                    if (from && toInput?.value) {
                      handlePeriodSelect(from, toInput.value)
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">До</label>
                <input
                  id="period-to"
                  type="date"
                  className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  onChange={(e) => {
                    const to = e.target.value
                    const fromInput = document.querySelector('input[type="date"]') as HTMLInputElement
                    if (to && fromInput?.value) {
                      handlePeriodSelect(fromInput.value, to)
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Шаг 2: Список неизвестных */}
      {step === 'list' && period && (
        <div className="space-y-4">
          {/* Информация о периоде */}
          <div className="bg-white rounded-lg shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-500">Период: </span>
                <span className="font-medium text-gray-800">
                  {period.from === period.to
                    ? formatDate(period.from)
                    : `${formatDate(period.from)} — ${formatDate(period.to)}`
                  }
                </span>
              </div>
              <button
                onClick={() => {
                  setStep('period')
                  setPeriod(null)
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Изменить период
              </button>
            </div>
          </div>

          {/* Таблица неизвестных */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            {unknownItems.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <div className="text-4xl mb-3">🎉</div>
                <p className="font-medium">Нет неизвестных школ за этот период</p>
                <p className="text-sm mt-1">Все данные раскрыты</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Дата</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Метрика</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Тип</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-700">Кол-во</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-700"></th>
                  </tr>
                </thead>
                <tbody>
                  {unknownItems.map((item, index) => (
                    <tr key={`${item.activityId}-${item.metricKey}`} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm text-gray-800">
                        {formatDate(item.date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800">
                        {item.metricLabel}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          item.metricType === 'funnel'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {item.metricType === 'funnel' ? 'Школы' : 'Значение'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
                          {item.count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleSelectItem(item)}
                          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                        >
                          Раскрыть
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Сводка */}
          {unknownItems.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm text-orange-800">
              <strong>Всего неизвестных:</strong> {unknownItems.reduce((sum, item) => sum + item.count, 0)} школ
            </div>
          )}
        </div>
      )}

      {/* Шаг 3: Раскрытие */}
      {step === 'resolve' && selectedItem && (
        <div className="space-y-4">
          {/* Заголовок */}
          <div className="bg-white rounded-lg shadow-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">
                  Раскрыть: {selectedItem.metricLabel}
                </h3>
                <p className="text-sm text-gray-500">
                  {formatDate(selectedItem.date)} • {selectedItem.count} неизвестных
                </p>
              </div>
              <button
                onClick={() => {
                  setStep('list')
                  setSelectedItem(null)
                }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                ← Назад к списку
              </button>
            </div>

            {/* Переключатель режима */}
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit">
              <button
                onClick={() => setMode('simple')}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  mode === 'simple'
                    ? 'bg-white text-gray-800 shadow'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Простой режим
              </button>
              <button
                onClick={() => setMode('detailed')}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  mode === 'detailed'
                    ? 'bg-white text-gray-800 shadow'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Детальный (с датами)
              </button>
            </div>
          </div>

          {/* Простой режим */}
          {mode === 'simple' && selectedItem.metricType === 'funnel' && (
            <div className="bg-white rounded-lg shadow-lg p-4">
              {/* Счётчик */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    selectedSchoolIds.size === selectedItem.count
                      ? 'bg-green-100 text-green-800'
                      : selectedSchoolIds.size > selectedItem.count
                        ? 'bg-red-100 text-red-800'
                        : 'bg-blue-100 text-blue-800'
                  }`}>
                    Выбрано: {selectedSchoolIds.size} / {selectedItem.count}
                  </span>
                  {selectedSchoolIds.size > selectedItem.count && (
                    <span className="text-sm text-red-600">Выбрано больше чем нужно</span>
                  )}
                </div>

                <button
                  onClick={() => setSelectedSchoolIds(new Set())}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Сбросить
                </button>
              </div>

              {/* Поиск */}
              <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
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

              {/* Список школ */}
              <div className="max-h-96 overflow-y-auto border rounded-lg">
                {filteredSchools.map((school, index) => {
                  const isSelected = selectedSchoolIds.has(school.id)
                  return (
                    <label
                      key={school.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      } ${isSelected ? 'bg-blue-50' : ''} hover:bg-blue-50`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSchoolSelection(school)}
                        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 truncate">{school.name}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {school.city}{school.district && `, ${school.district}`}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Numeric resolve: распределение значения по школам */}
          {selectedItem.metricType === 'numeric' && (
            <div className="bg-white rounded-lg shadow-lg p-4">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="text-sm text-gray-700">
                  Всего неизвестно: <span className="font-bold">{selectedItem.count}</span>
                </div>
                <div className="text-sm text-gray-700">
                  Распределено:{' '}
                  <span className="font-bold">
                    {Object.values(numericAllocations).reduce((s, v) => s + (v || 0), 0)}
                  </span>
                </div>
                <div className="text-sm text-gray-700">
                  Осталось:{' '}
                  <span className="font-bold">
                    {Math.max(
                      0,
                      selectedItem.count - Object.values(numericAllocations).reduce((s, v) => s + (v || 0), 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
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

              <div className="max-h-96 overflow-y-auto border rounded-lg">
                {filteredSchools.map((school, index) => {
                  const value = numericAllocations[school.id] || 0
                  return (
                    <div
                      key={school.id}
                      className={`flex items-center gap-3 px-4 py-3 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 truncate">{school.name}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {school.city}{school.district && `, ${school.district}`}
                        </div>
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={value || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const next = parseInt(e.target.value) || 0
                          setNumericAllocations((prev) => {
                            const copy = { ...prev }
                            if (next > 0) copy[school.id] = next
                            else delete copy[school.id]
                            return copy
                          })
                        }}
                        onFocus={(e) => e.target.select()}
                        className="w-28 px-3 py-2 text-center border rounded-lg font-medium text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 text-xs text-gray-500">
                Введите, сколько значения перенести в каждую школу. Сумма не должна превышать {selectedItem.count}.
              </div>
            </div>
          )}

          {/* Детальный режим */}
          {mode === 'detailed' && selectedItem.metricType === 'funnel' && (
            <div className="bg-white rounded-lg shadow-lg p-4">
              {/* Информация */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                Укажите школу и дату для каждой записи. Можно указать разные даты.
              </div>

              {/* Фильтры для выпадающего списка */}
              <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
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

              {/* Таблица */}
              <div className="space-y-2 mb-4">
                {resolutions.map((resolution, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="flex-1">
                      <select
                        value={resolution.schoolId}
                        onChange={(e) => updateResolution(index, 'schoolId', e.target.value)}
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">Выберите школу...</option>
                        {filteredSchools.map(school => (
                          <option key={school.id} value={school.id}>
                            {school.name} ({school.city})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-40">
                      <input
                        type="date"
                        value={resolution.date}
                        onChange={(e) => updateResolution(index, 'date', e.target.value)}
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <button
                      onClick={() => removeResolutionRow(index)}
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Кнопка добавить */}
              <button
                onClick={addResolutionRow}
                disabled={resolutions.length >= selectedItem.count}
                className={`w-full py-2 border-2 border-dashed rounded-lg text-sm transition-colors ${
                  resolutions.length >= selectedItem.count
                    ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'border-blue-300 text-blue-600 hover:border-blue-400 hover:bg-blue-50'
                }`}
              >
                + Добавить школу ({resolutions.length} / {selectedItem.count})
              </button>
            </div>
          )}

          {/* Кнопка сохранения */}
          <div className="flex justify-center">
            <button
              onClick={handleSave}
              disabled={
                saving ||
                (selectedItem.metricType === 'funnel'
                  ? (mode === 'simple'
                      ? selectedSchoolIds.size === 0
                      : resolutions.filter(r => r.schoolId && r.date).length === 0)
                  : Object.values(numericAllocations).reduce((s, v) => s + (v || 0), 0) <= 0)
              }
              className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                saving ||
                (selectedItem.metricType === 'funnel'
                  ? (mode === 'simple'
                      ? selectedSchoolIds.size === 0
                      : resolutions.filter(r => r.schoolId && r.date).length === 0)
                  : Object.values(numericAllocations).reduce((s, v) => s + (v || 0), 0) <= 0)
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {(() => {
                if (saving) return 'Сохранение...'
                if (selectedItem.metricType === 'funnel') {
                  const n = mode === 'simple'
                    ? selectedSchoolIds.size
                    : resolutions.filter(r => r.schoolId && r.date).length
                  return `Раскрыть ${n} школ`
                }
                const sum = Object.values(numericAllocations).reduce((s, v) => s + (v || 0), 0)
                return `Перенести ${sum}`
              })()}
            </button>
          </div>
        </div>
      )}

      {/* Попап успеха */}
      {successMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 text-center shadow-2xl max-w-md mx-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Успешно!</h3>
            <p className="text-gray-600">{successMessage}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default ResolveUnknownMode
