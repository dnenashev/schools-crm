import { useState, useMemo } from 'react'
import { School } from '../types/school'
import SchoolCard from './SchoolCard'
import { formatMsk } from '../config/datetime'

interface SchoolsTableProps {
  schools: School[]
  title: string
  subtitle?: string
  onUpdate?: () => void
  /** Статистика привязки к Амо по всем школам: сколько с ссылкой, сколько без */
  amoStats?: { linked: number; unlinked: number }
}

type SortField =
  | 'name'
  | 'city'
  | 'region'
  | 'inWorkDate'
  | 'contactDate'
  | 'meetingScheduledDate'
  | 'meetingHeldDate'
  | 'eventScheduledDate'
  | 'eventHeldDate'
  | 'excursionPlannedDate'
type SortDirection = 'asc' | 'desc'

const SchoolsTable = ({ schools, title, subtitle, onUpdate, amoStats }: SchoolsTableProps) => {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const filteredAndSortedSchools = useMemo(() => {
    // Дедупликация по ID (на случай если пришли дубли)
    const uniqueSchools = Array.from(
      new Map(schools.map(s => [s.id, s])).values()
    )
    
    let result = [...uniqueSchools]

    // Поиск
    if (search) {
      const searchLower = search.toLowerCase()
      result = result.filter(school => 
        school.name.toLowerCase().includes(searchLower) ||
        school.city.toLowerCase().includes(searchLower) ||
        (school.district && school.district.toLowerCase().includes(searchLower)) ||
        (school.address && school.address.toLowerCase().includes(searchLower)) ||
        school.id.toLowerCase().includes(searchLower) ||
        (school.tags && school.tags.some(tag => tag.toLowerCase().includes(searchLower)))
      )
    }

    // Сортировка
    result.sort((a, b) => {
      let aVal: string | null = null
      let bVal: string | null = null

      switch (sortField) {
        case 'name':
          aVal = a.name
          bVal = b.name
          break
        case 'city':
          aVal = a.city
          bVal = b.city
          break
        case 'region':
          aVal = a.region
          bVal = b.region
          break
        case 'inWorkDate':
          aVal = a.inWorkDate
          bVal = b.inWorkDate
          break
        case 'contactDate':
          aVal = a.contactDate
          bVal = b.contactDate
          break
        case 'meetingScheduledDate':
          aVal = a.meetingScheduledDate
          bVal = b.meetingScheduledDate
          break
        case 'meetingHeldDate':
          aVal = a.meetingHeldDate
          bVal = b.meetingHeldDate
          break
        case 'eventScheduledDate':
          aVal = a.eventScheduledDate
          bVal = b.eventScheduledDate
          break
        case 'eventHeldDate':
          aVal = a.eventHeldDate
          bVal = b.eventHeldDate
          break
        case 'excursionPlannedDate':
          aVal = a.excursionPlannedDate
          bVal = b.excursionPlannedDate
          break
      }

      if (aVal === null && bVal === null) return 0
      if (aVal === null) return 1
      if (bVal === null) return -1

      const comparison = aVal.localeCompare(bVal, 'ru')
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [schools, search, sortField, sortDirection])

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-blue-600 ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return formatMsk(dateStr, { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const getNumericTotal = (
    school: School,
    metricKey: 'parentContacts' | 'loadedToCRM' | 'qualifiedLeads' | 'arrivedToCampus' | 'preliminaryMeetings'
  ): number => {
    if (!school.activities || school.activities.length === 0) return 0
    return school.activities.reduce((sum, a) => {
      // legacy parentContacts
      const legacy = metricKey === 'parentContacts' ? (a.parentContacts || 0) : 0
      const v = typeof a.metrics?.[metricKey] === 'number' ? (a.metrics?.[metricKey] as number) : 0
      return sum + legacy + v
    }, 0)
  }

  const METRIC_COLUMNS: Array<
    | { kind: 'date'; key: SortField; label: string; getValue: (s: School) => string | null }
    | {
        kind: 'numeric'
        key: 'parentContacts' | 'loadedToCRM' | 'qualifiedLeads' | 'arrivedToCampus' | 'preliminaryMeetings'
        label: string
      }
  > = [
    { kind: 'date', key: 'inWorkDate', label: 'Взято в работу', getValue: (s) => s.inWorkDate },
    { kind: 'date', key: 'contactDate', label: 'Контакт состоялся', getValue: (s) => s.contactDate },
    { kind: 'date', key: 'meetingScheduledDate', label: 'Встреча назначена', getValue: (s) => s.meetingScheduledDate },
    { kind: 'date', key: 'meetingHeldDate', label: 'Встреча состоялась', getValue: (s) => s.meetingHeldDate },
    { kind: 'date', key: 'eventScheduledDate', label: 'Мероприятие назначено', getValue: (s) => s.eventScheduledDate },
    { kind: 'date', key: 'eventHeldDate', label: 'Мероприятие проведено', getValue: (s) => s.eventHeldDate },
    { kind: 'date', key: 'excursionPlannedDate', label: 'Экскурсия запланирована', getValue: (s) => s.excursionPlannedDate },
    { kind: 'numeric', key: 'parentContacts', label: 'Кол-во контактов родителя' },
    { kind: 'numeric', key: 'loadedToCRM', label: 'Кол-во загруженных в CRM' },
    { kind: 'numeric', key: 'qualifiedLeads', label: 'Квал заявки' },
    { kind: 'numeric', key: 'arrivedToCampus', label: 'Доехавшие до кампуса' },
    { kind: 'numeric', key: 'preliminaryMeetings', label: 'Предвары' },
  ]

  const handleSchoolUpdate = () => {
    setSelectedSchool(null)
    onUpdate?.()
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Заголовок */}
      <div className="px-6 py-4 bg-blue-600 text-white">
        <h2 className="text-xl font-bold">{title}</h2>
        {subtitle && <p className="text-blue-100 text-sm mt-1">{subtitle}</p>}
        <p className="text-blue-200 text-sm mt-2">Найдено: {filteredAndSortedSchools.length} школ</p>
        {amoStats != null && (
          <p className="text-blue-200 text-sm mt-1">
            Ссылка на Амо: <span className="font-medium text-white">{amoStats.linked}</span> с привязкой, <span className="font-medium text-blue-100">{amoStats.unlinked}</span> без привязки
          </p>
        )}
      </div>

      {/* Поиск */}
      <div className="px-6 py-4 border-b bg-gray-50">
        <input
          type="text"
          placeholder="Поиск по названию, городу, району или ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>

      {/* Таблица */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('name')}
              >
                Название <SortIcon field="name" />
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('city')}
              >
                Город <SortIcon field="city" />
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200"
                onClick={() => handleSort('region')}
              >
                Регион <SortIcon field="region" />
              </th>
              {METRIC_COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider ${
                    col.kind === 'date' ? 'cursor-pointer hover:bg-gray-200' : ''
                  }`}
                  onClick={col.kind === 'date' ? () => handleSort(col.key) : undefined}
                >
                  {col.label} {col.kind === 'date' ? <SortIcon field={col.key} /> : null}
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                Ссылки
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAndSortedSchools.length === 0 ? (
              <tr>
                <td colSpan={4 + METRIC_COLUMNS.length} className="px-6 py-12 text-center text-gray-500">
                  {search ? 'Ничего не найдено по вашему запросу' : 'Нет данных для отображения'}
                </td>
              </tr>
            ) : (
              filteredAndSortedSchools.slice(0, 100).map((school, index) => {
                return (
                  <tr 
                    key={school.id} 
                    className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors cursor-pointer`}
                    onClick={() => {
                      if (school.amoLink) {
                        window.open(school.amoLink, '_blank')
                      } else {
                        setSelectedSchool(school)
                      }
                    }}
                  >
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="font-medium">{school.name}</div>
                      <div className="text-xs text-gray-400">{school.district || '—'}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {school.city || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {school.region === 'Москва' ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">Москва</span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">МО</span>
                      )}
                    </td>
                    {METRIC_COLUMNS.map((col) => {
                      if (col.kind === 'date') {
                        return (
                          <td key={col.label} className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                            {formatDate(col.getValue(school))}
                          </td>
                        )
                      }

                      const v = getNumericTotal(school, col.key)
                      return (
                        <td key={col.label} className="px-4 py-3 whitespace-nowrap text-sm">
                          {v > 0 ? <span className="font-medium text-gray-900">{v}</span> : <span className="text-gray-400">—</span>}
                        </td>
                      )
                    })}
                    <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedSchool(school)}
                          className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                          title="Открыть карточку школы"
                        >
                          Карточка
                        </button>
                        {school.amoLink ? (
                          <a
                            href={school.amoLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex px-2 py-1 text-xs font-medium text-green-800 bg-green-100 hover:bg-green-200 rounded transition-colors"
                            title="Открыть сделку в АмоCRM"
                          >
                            АМО
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs" title="Ссылку можно добавить в карточке школы">
                            — АМО
                          </span>
                        )}
                        {school.uchiLink && (
                          <a 
                            href={school.uchiLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:text-purple-800 text-xs"
                          >
                            Учи
                          </a>
                        )}
                        {school.website && (
                          <a 
                            href={school.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-xs"
                          >
                            Сайт
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      
      {filteredAndSortedSchools.length > 100 && (
        <div className="px-6 py-3 bg-gray-50 text-center text-sm text-gray-500 border-t">
          Показаны первые 100 из {filteredAndSortedSchools.length}. Используйте поиск для уточнения.
        </div>
      )}

      {/* Карточка школы */}
      {selectedSchool && (
        <SchoolCard 
          school={selectedSchool}
          onClose={() => setSelectedSchool(null)}
          onUpdate={handleSchoolUpdate}
        />
      )}
    </div>
  )
}

export default SchoolsTable
