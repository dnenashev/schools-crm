// Типы выездов менеджеров
export type VisitType = 'director_meeting' | 'school_event' | 'campus_excursion'

// Выезд менеджера
export interface Visit {
  id: string
  managerId: string           // 'pati' | 'egor'
  managerName: string         // для отображения
  date: string                // YYYY-MM-DD
  timeStart: string           // HH:MM
  timeEnd: string             // HH:MM
  type: VisitType
  schoolId: string
  schoolName: string          // денормализовано для удобства
  notes?: string
  createdAt: string
  createdBy: string
}

// Конфигурация типов выездов
export const VISIT_TYPES: { value: VisitType; label: string; color: string }[] = [
  { value: 'director_meeting', label: 'Встреча с директором', color: 'blue' },
  { value: 'school_event', label: 'Мероприятие в школе', color: 'green' },
  { value: 'campus_excursion', label: 'Экскурсия на кампусе', color: 'purple' },
]

// Менеджеры
export const MANAGERS: { id: string; name: string; color: string }[] = [
  { id: 'pati', name: 'Pati', color: '#3B82F6' },
  { id: 'egor', name: 'Egor', color: '#10B981' },
]

// Временные слоты для выбора (с 9:00 до 19:00, шаг 30 минут)
export const TIME_SLOTS: string[] = []
for (let h = 9; h <= 19; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 19) {
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
  }
}

// Получить цвет менеджера по ID
export const getManagerColor = (managerId: string): string => {
  const manager = MANAGERS.find(m => m.id === managerId)
  return manager?.color || '#6B7280'
}

// Получить имя менеджера по ID
export const getManagerName = (managerId: string): string => {
  const manager = MANAGERS.find(m => m.id === managerId)
  return manager?.name || managerId
}

// Получить label типа выезда
export const getVisitTypeLabel = (type: VisitType): string => {
  const config = VISIT_TYPES.find(t => t.value === type)
  return config?.label || type
}

// Получить цвет типа выезда
export const getVisitTypeColor = (type: VisitType): string => {
  const config = VISIT_TYPES.find(t => t.value === type)
  return config?.color || 'gray'
}
