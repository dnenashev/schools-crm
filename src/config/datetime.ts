export const MSK_TIME_ZONE = 'Europe/Moscow' as const

type DateInput = string | Date

const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

export function toDateForMskFormatting(input: DateInput): Date {
  if (input instanceof Date) return input
  if (isYmd(input)) {
    // Interpret YYYY-MM-DD as a calendar date (no timezone shift).
    // Using UTC midnight ensures the calendar date stays the same when formatted in MSK.
    return new Date(`${input}T00:00:00.000Z`)
  }
  return new Date(input)
}

export function formatMsk(
  input: DateInput,
  options: Intl.DateTimeFormatOptions,
  locale: string = 'ru-RU'
): string {
  const date = toDateForMskFormatting(input)
  return new Intl.DateTimeFormat(locale, { timeZone: MSK_TIME_ZONE, ...options }).format(date)
}

export function formatMskDate(input: DateInput): string {
  return formatMsk(input, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatMskYmd(input: DateInput = new Date()): string {
  // en-CA gives YYYY-MM-DD
  const date = toDateForMskFormatting(input)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MSK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

