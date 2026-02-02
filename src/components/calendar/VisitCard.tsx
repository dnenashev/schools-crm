import { Visit, getManagerColor, getVisitTypeLabel, getVisitTypeColor } from '../../types/visit'

interface VisitCardProps {
  visit: Visit
  onDelete?: () => void
}

// Иконки для типов выездов
const TypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'director_meeting':
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    case 'school_event':
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    case 'campus_excursion':
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      )
    case 'calls':
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.21l-2.2 1.1a11.04 11.04 0 005.52 5.52l1.1-2.2a1 1 0 011.21-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.82 21 3 14.18 3 6V5z" />
        </svg>
      )
    case 'spo_vo_lichki':
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    default:
      return null
  }
}

const VisitCard = ({ visit, onDelete: _onDelete }: VisitCardProps) => {
  const managerColor = getManagerColor(visit.managerId)
  const typeLabel = getVisitTypeLabel(visit.type)
  const typeColor = getVisitTypeColor(visit.type)

  // Цвета фона по типу
  const bgColorClass: Record<string, string> = {
    blue: 'bg-blue-50',
    green: 'bg-green-50',
    purple: 'bg-purple-50',
    orange: 'bg-orange-50',
    teal: 'bg-teal-50',
    gray: 'bg-gray-50'
  }

  // Цвета текста по типу
  const textColorClass: Record<string, string> = {
    blue: 'text-blue-700',
    green: 'text-green-700',
    purple: 'text-purple-700',
    orange: 'text-orange-700',
    teal: 'text-teal-700',
    gray: 'text-gray-700'
  }

  return (
    <div
      className={`
        rounded px-2 py-1 mb-1 cursor-pointer
        h-full w-full overflow-hidden
        border-l-4 transition-all hover:shadow-md
        ${bgColorClass[typeColor] || 'bg-gray-50'}
      `}
      style={{ borderLeftColor: managerColor }}
    >
      {/* Время и менеджер */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-600">
          {visit.timeStart}-{visit.timeEnd}
        </span>
        <span
          className="px-1.5 py-0.5 rounded text-xs font-medium text-white"
          style={{ backgroundColor: managerColor }}
        >
          {visit.managerName}
        </span>
      </div>

      {/* Тип выезда */}
      <div className={`flex items-center gap-1 mt-0.5 text-xs ${textColorClass[typeColor] || 'text-gray-700'}`}>
        <TypeIcon type={visit.type} />
        <span className="truncate">{typeLabel}</span>
      </div>

      {/* Школа (для calls может отсутствовать) */}
      {visit.schoolName ? (
        <div className="text-xs text-gray-600 truncate mt-0.5" title={visit.schoolName}>
          {visit.schoolName}
        </div>
      ) : (
        <div className="text-xs text-gray-400 truncate mt-0.5 italic">
          Без школы
        </div>
      )}

      {/* Заметки (если есть) */}
      {visit.notes && (
        <div className="text-xs text-gray-400 truncate mt-0.5 italic" title={visit.notes}>
          {visit.notes}
        </div>
      )}
    </div>
  )
}

export default VisitCard
