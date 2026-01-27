// Активность в школе (звонок, встреча, мероприятие)
export interface Activity {
  id: string
  date: string                    // ISO date string
  type: 'contact' | 'meeting' | 'event' | 'call' | 'note' | 'campus_visit' | 'numeric_metrics' | 'funnel_metrics'
  description: string
  parentContacts?: number         // Кол-во контактов родителей
  classesContacted?: string[]     // Какие классы (1А, 2Б и т.д.)
  metrics?: Record<string, number> // Числовые метрики (parentContacts, loadedToCRM, qualifiedLeads, ...)
  createdBy?: string              // userId автора
  createdByName?: string | null   // имя автора (если известно)
}

// Статусы звонков
export type CallStatus = 'НДЗ-1' | 'НДЗ-2' | 'НДЗ-3' | 'НДЗ-4' | 'НДЗ-5' | 'дозвон'

export const CALL_STATUSES: { value: CallStatus; label: string }[] = [
  { value: 'НДЗ-1', label: 'НДЗ 1' },
  { value: 'НДЗ-2', label: 'НДЗ 2' },
  { value: 'НДЗ-3', label: 'НДЗ 3' },
  { value: 'НДЗ-4', label: 'НДЗ 4' },
  { value: 'НДЗ-5', label: 'НДЗ 5' },
  { value: 'дозвон', label: 'Дозвон' },
]

// Статусы диалога
export type DialogueStatus = 'перезвон' | 'назначение' | 'отказ' | 'другое'

export const DIALOGUE_STATUSES: { value: DialogueStatus; label: string }[] = [
  { value: 'перезвон', label: 'Перезвон' },
  { value: 'назначение', label: 'Назначение встречи' },
  { value: 'отказ', label: 'Отказ' },
  { value: 'другое', label: 'Другое' },
]

// Статусы встречи
export type MeetingStatus = 'назначена' | 'состоялась' | 'отменена' | 'перенесена'

export const MEETING_STATUSES: { value: MeetingStatus; label: string }[] = [
  { value: 'назначена', label: 'Назначена' },
  { value: 'состоялась', label: 'Состоялась' },
  { value: 'отменена', label: 'Отменена' },
  { value: 'перенесена', label: 'Перенесена' },
]

// Статусы мероприятия
export type EventStatus = 'запланировано' | 'проведено' | 'отменено'

export const EVENT_STATUSES: { value: EventStatus; label: string }[] = [
  { value: 'запланировано', label: 'Запланировано' },
  { value: 'проведено', label: 'Проведено' },
  { value: 'отменено', label: 'Отменено' },
]

// ID виртуальной школы "неизвестно"
export const UNKNOWN_SCHOOL_ID = '__unknown_school__'

// Создать виртуальную школу "неизвестно"
export const createUnknownSchool = (): School => ({
  id: UNKNOWN_SCHOOL_ID,
  name: '❓ Неизвестно',
  district: '',
  region: 'Москва',
  city: '',
  address: '',
  website: '',
  uchiLink: '',
  travelTime: '',
  tags: [],
  amoLink: '',
  inWorkDate: null,
  contactDate: null,
  meetingScheduledDate: null,
  meetingHeldDate: null,
  eventScheduledDate: null,
  eventHeldDate: null,
  campusVisitPlannedDate: null,
  loadedToCRMDate: null,
  qualifiedLeadDate: null,
  arrivedToCampusDate: null,
  preliminaryMeetingDate: null,
  excursionPlannedDate: null,
  callStatus: null,
  callDate: null,
  callAttempts: 0,
  dialogueStatus: null,
  dialogueDate: null,
  dialogueNotes: '',
  callbackDate: null,
  meetingStatus: null,
  meetingDate: null,
  meetingNotes: '',
  eventStatus: null,
  eventDate: null,
  eventNotes: '',
  classesCount: 0,
  leadsCount: 0,
  campusVisitsCount: 0,
  notes: '',
  activities: []
})

// Школа
export interface School {
  id: string
  name: string                    // Название_школы
  district: string                // Район(детально)
  region: 'Москва' | 'Московская область'  // Регион
  city: string                    // Город
  address: string                 // Адрес
  website: string                 // Сайт
  uchiLink: string                // Ссылка на страницу Учи.ру
  travelTime: string              // Время_до_Марьина_Роща
  tags: string[]                  // Теги (например: "неполная инфа")
  
  // Статусы с датами (для метрик дашборда)
  inWorkDate: string | null              // Взято в работу (Новые школы)
  contactDate: string | null             // Контакт состоялся
  meetingScheduledDate: string | null    // Встреча назначена
  meetingHeldDate: string | null         // Встреча состоялась
  eventScheduledDate: string | null      // Мероприятие назначено
  eventHeldDate: string | null           // Мероприятие проведено
  campusVisitPlannedDate: string | null  // Выезд на кампус запланирован
  excursionPlannedDate: string | null    // Экскурсия запланирована
  loadedToCRMDate: string | null         // Загружено в CRM
  qualifiedLeadDate: string | null       // Квалифицированный лид
  arrivedToCampusDate: string | null     // Доехали до кампуса
  preliminaryMeetingDate: string | null  // Предвары
  
  // Детальный трекинг звонков
  callStatus: CallStatus | null          // Статус звонка
  callDate: string | null                // Дата последнего звонка
  callAttempts: number                   // Количество попыток дозвона
  
  // Детальный трекинг диалога
  dialogueStatus: DialogueStatus | null  // Статус диалога
  dialogueDate: string | null            // Дата диалога
  dialogueNotes: string                  // Примечания к диалогу
  
  // Детальный трекинг встреч
  meetingStatus: MeetingStatus | null    // Статус встречи
  meetingDate: string | null             // Дата встречи
  meetingNotes: string                   // Примечания к встрече
  
  // Детальный трекинг мероприятий
  eventStatus: EventStatus | null        // Статус мероприятия
  eventDate: string | null               // Дата мероприятия
  eventNotes: string                     // Примечания к мероприятию
  
  // Числовые метрики
  classesCount: number                   // Кол-во классов
  leadsCount: number                     // Кол-во лидов
  campusVisitsCount: number              // Кол-во приездов на кампус
  
  // Дополнительные поля для работы
  callbackDate: string | null     // Дата перезвона
  notes: string                   // Заметки
  amoLink: string                 // Ссылка на АМО CRM
  
  // История активностей
  activities: Activity[]
}

// Конфигурация метрик для дашборда
export const METRICS_CONFIG = [
  // Порядок и названия метрик (дашборд/карточка) — как в ТЗ
  { key: 'newSchools', label: 'Новые школы', dateField: 'inWorkDate' },
  // Накопительно: сколько школ было взято в работу на дату (и раньше)
  // Это накопительный итог по метрике "Новые школы" (в т.ч. с учётом "неизвестных")
  { key: 'schoolsInWork', label: 'Школы в работе (накопительно)', dateField: 'inWorkDate', cumulative: true, cumulativeFrom: 'newSchools' },
  { key: 'contactMade', label: 'Контакт состоялся', dateField: 'contactDate' },
  { key: 'meetingScheduled', label: 'Встреча назначена', dateField: 'meetingScheduledDate' },
  { key: 'meetingHeld', label: 'Встреча состоялась', dateField: 'meetingHeldDate' },
  { key: 'eventScheduled', label: 'Мероприятие назначено', dateField: 'eventScheduledDate' },
  { key: 'eventHeld', label: 'Мероприятие проведено', dateField: 'eventHeldDate' },
  { key: 'excursionPlanned', label: 'Экскурсия запланирована', dateField: 'excursionPlannedDate' },
  { key: 'parentContacts', label: 'Кол-во контактов родителя', activityBased: true },
  { key: 'loadedToCRM', label: 'Кол-во загруженных в CRM', activityBased: true },
  { key: 'qualifiedLeads', label: 'Квал заявки', activityBased: true },
  { key: 'arrivedToCampus', label: 'Доехавшие до кампуса', activityBased: true },
  { key: 'preliminaryMeetings', label: 'Предвары', activityBased: true },
] as const

export type MetricKey = typeof METRICS_CONFIG[number]['key']

// Типы для фильтрации
export type PeriodType = 'day' | 'week' | 'month'

export interface FilterParams {
  metric: MetricKey
  periodStart: string
  periodEnd: string
}

// Месячный план
export interface MonthlyPlan {
  id: string                    // "plan_2026-01"
  month: string                 // "2026-01" (формат YYYY-MM)
  metrics: Record<string, number>  // { newSchools: 20, contactMade: 15, ... }
  dailyDistribution?: Record<string, Record<string, number>> | null  // { newSchools: { "2026-01-06": 2, ... }, ... }
  createdAt: string             // ISO date string
  createdBy: string             // userId
  updatedAt?: string            // ISO date string
  updatedBy?: string            // userId
}

// Режимы пайплайна
export type PipelineMode = 'fill-data' | 'calls' | 'meetings' | 'events' | 'plans' | 'resolve-unknown'

export const PIPELINE_MODES: { value: PipelineMode; label: string; adminOnly?: boolean }[] = [
  { value: 'fill-data', label: 'Заполнить данные' },
  { value: 'resolve-unknown', label: 'Решение неизвестности' },
  { value: 'calls', label: 'Режим звонков' },
  { value: 'meetings', label: 'Режим встреч' },
  { value: 'events', label: 'Режим мероприятий' },
  { value: 'plans', label: 'Планы', adminOnly: true },
]
