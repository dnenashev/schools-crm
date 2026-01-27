import { useState, useMemo } from 'react'
import { School, UNKNOWN_SCHOOL_ID } from '../../types/school'

interface SchoolPickerProps {
  schools: School[]              // Доступные школы для выбора
  selectedIds: Set<string>       // ID выбранных школ
  targetCount: number            // Сколько нужно выбрать
  onSelectionChange: (ids: Set<string>) => void
  label: string
  isExpanded: boolean
  onToggleExpand: () => void
  disabled?: boolean
  recommendedIds?: Set<string>  // Рекомендуемые школы (из предыдущего этапа)
}

const SchoolPicker = ({
  schools,
  selectedIds,
  targetCount,
  onSelectionChange,
  label,
  isExpanded,
  onToggleExpand,
  disabled = false,
  recommendedIds = new Set()
}: SchoolPickerProps) => {
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState<string>('all')
  const [districtFilter, setDistrictFilter] = useState<string>('all')

  const hasUnknown = selectedIds.has(UNKNOWN_SCHOOL_ID)
  const knownCount = hasUnknown ? Math.max(0, selectedIds.size - 1) : selectedIds.size
  const unknownCount = hasUnknown ? Math.max(0, targetCount - knownCount) : 0
  const effectiveSelectedCount = hasUnknown ? Math.max(targetCount, knownCount) : selectedIds.size

  const isComplete = targetCount > 0 && effectiveSelectedCount === targetCount
  const hasExtra = targetCount > 0 && knownCount > targetCount
  const needsMore = targetCount > 0 && effectiveSelectedCount < targetCount

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

  // Фильтрация и сортировка школ: рекомендуемые первыми
  const filteredSchools = useMemo(() => {
    const unknown = schools.find(s => s.id === UNKNOWN_SCHOOL_ID) || null
    let filteredKnown = schools.filter(s => s.id !== UNKNOWN_SCHOOL_ID)

    if (cityFilter !== 'all') {
      filteredKnown = filteredKnown.filter(s => (s.city || '').trim() === cityFilter)
    }
    if (districtFilter !== 'all') {
      filteredKnown = filteredKnown.filter(s => (s.district || '').trim() === districtFilter)
    }
    
    if (search) {
      const searchLower = search.toLowerCase()
      filteredKnown = filteredKnown.filter(s => 
        s.name.toLowerCase().includes(searchLower) ||
        s.city.toLowerCase().includes(searchLower) ||
        s.district.toLowerCase().includes(searchLower)
      )
    }

    const filtered = unknown ? [unknown, ...filteredKnown] : filteredKnown
    
    // Сортируем: "неизвестно" всегда первым, затем рекомендуемые, затем остальные
    return [...filtered].sort((a, b) => {
      // "неизвестно" всегда первый
      if (a.id === UNKNOWN_SCHOOL_ID) return -1
      if (b.id === UNKNOWN_SCHOOL_ID) return 1
      
      const aRecommended = recommendedIds.has(a.id)
      const bRecommended = recommendedIds.has(b.id)
      if (aRecommended && !bRecommended) return -1
      if (!aRecommended && bRecommended) return 1
      return 0
    })
  }, [schools, search, cityFilter, districtFilter, recommendedIds])

  const toggleSchool = (schoolId: string) => {
    if (disabled) return
    
    const newSelection = new Set(selectedIds)
    if (newSelection.has(schoolId)) {
      newSelection.delete(schoolId)
    } else {
      newSelection.add(schoolId)
    }
    onSelectionChange(newSelection)
  }

  const selectAll = () => {
    if (disabled) return
    const newSelection = new Set(schools.map(s => s.id))
    onSelectionChange(newSelection)
  }

  const selectRecommended = () => {
    if (disabled || recommendedIds.size === 0) return
    const newSelection = new Set(selectedIds)
    recommendedIds.forEach(id => newSelection.add(id))
    onSelectionChange(newSelection)
  }

  const deselectAll = () => {
    if (disabled) return
    onSelectionChange(new Set())
  }

  // Цвет статуса
  const statusColor = isComplete 
    ? 'bg-green-100 text-green-800 border-green-300'
    : hasExtra
      ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
      : 'bg-gray-100 text-gray-600 border-gray-300'

  const headerColor = isComplete
    ? 'border-green-500 bg-green-50'
    : hasExtra
      ? 'border-yellow-500 bg-yellow-50'
      : needsMore && effectiveSelectedCount > 0
        ? 'border-blue-500 bg-blue-50'
        : 'border-gray-300 bg-gray-50'

  return (
    <div className={`border-2 rounded-lg overflow-hidden transition-all ${headerColor}`}>
      {/* Заголовок (всегда видимый) */}
      <button
        onClick={onToggleExpand}
        disabled={disabled || targetCount === 0}
        className={`w-full px-4 py-3 flex items-center justify-between text-left ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-opacity-80'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
          <span className="font-medium text-gray-800">{label}</span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Прогресс бар */}
          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${
                isComplete ? 'bg-green-500' : hasExtra ? 'bg-yellow-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(100, (effectiveSelectedCount / targetCount) * 100)}%` }}
            />
          </div>
          
          {/* Статус */}
          <span className={`px-2 py-1 text-sm font-medium rounded border ${statusColor}`}>
            {effectiveSelectedCount} / {targetCount}
          </span>
        </div>
      </button>

      {/* Контент (разворачиваемый) */}
      {isExpanded && targetCount > 0 && (
        <div className="border-t bg-white">
          {/* Поиск и действия */}
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              <input
                type="text"
                placeholder="Поиск школы..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="all">Все города</option>
                {availableCities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                className="w-full px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="all">Все районы</option>
                {availableDistricts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            
            <div className="flex gap-2 flex-wrap">
              {recommendedIds.size > 0 && (
                <button
                  onClick={selectRecommended}
                  disabled={disabled}
                  className="px-3 py-1.5 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50"
                  title={`Выбрать ${recommendedIds.size} рекомендуемых школ из предыдущего этапа`}
                >
                  Выбрать рекомендуемые ({recommendedIds.size})
                </button>
              )}
              <button
                onClick={selectAll}
                disabled={disabled}
                className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
              >
                Выбрать все
              </button>
              <button
                onClick={deselectAll}
                disabled={disabled}
                className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                Снять все
              </button>
            </div>
          </div>

          {/* Список школ */}
          <div className="max-h-64 overflow-y-auto p-2">
            {filteredSchools.length === 0 ? (
              <div className="text-center text-gray-500 py-4 text-sm">
                {search ? 'Школы не найдены' : 'Нет доступных школ'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {filteredSchools.map(school => {
                  const isSelected = selectedIds.has(school.id)
                  const isRecommended = recommendedIds.has(school.id)
                  
                  const isUnknown = school.id === UNKNOWN_SCHOOL_ID
                  
                  return (
                    <label
                      key={school.id}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors
                        ${isSelected 
                          ? isUnknown
                            ? 'bg-orange-100 border border-orange-300'
                            : isRecommended
                              ? 'bg-blue-100 border border-blue-300'
                              : 'bg-blue-50 border border-blue-200'
                          : isUnknown
                            ? 'bg-orange-50 border border-orange-200 hover:bg-orange-100'
                            : isRecommended
                              ? 'bg-purple-50 border border-purple-200 hover:bg-purple-100'
                              : 'hover:bg-gray-50 border border-transparent'
                        }
                        ${disabled ? 'cursor-not-allowed opacity-60' : ''}
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSchool(school.id)}
                        disabled={disabled}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <div className={`text-sm font-medium truncate ${
                            isUnknown ? 'text-orange-800' : 'text-gray-800'
                          }`}>
                            {school.name}
                          </div>
                          {isRecommended && !isSelected && !isUnknown && (
                            <span className="text-xs text-purple-600 font-medium" title="Рекомендуется из предыдущего этапа">
                              ⭐
                            </span>
                          )}
                        </div>
                        {!isUnknown && (
                          <div className="text-xs text-gray-500 truncate">
                            {school.city}{school.district && `, ${school.district}`}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Подсказка */}
          {!isComplete && (
            <div className={`px-4 py-2 text-sm ${
              hasExtra 
                ? 'bg-yellow-50 text-yellow-700' 
                : 'bg-blue-50 text-blue-700'
            }`}>
              {hasExtra 
                ? `Снимите ${knownCount - targetCount} лишних галочек`
                : `Выберите ещё ${targetCount - effectiveSelectedCount} школ`
              }
            </div>
          )}
          {hasUnknown && !hasExtra && targetCount > 0 && (
            <div className="px-4 py-2 text-xs bg-orange-50 text-orange-700 border-t">
              ❓ «Неизвестно» заполнит ещё {unknownCount} школ
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SchoolPicker
