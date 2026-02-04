/**
 * AmoCRM pipeline stage mapping and cutoff date.
 * status_id (from Amo) -> school date field name.
 * Fill in status IDs from your Amo pipeline (GET /api/v4/leads/pipelines/:id).
 */
const CUTOFF_DATE = process.env.AMO_DASHBOARD_CUTOFF_DATE || '2025-02-09'; // YYYY-MM-DD

/**
 * Map Amo status_id to school date field.
 * Keys: status_id (number). Values: { dateField: string }.
 * Example: 12345 -> { dateField: 'meetingScheduledDate' }
 */
const STATUS_TO_DATE_FIELD = {
  // Fill in after getting pipeline statuses from Amo API, e.g.:
  // [status_id]: { dateField: 'inWorkDate' },
  // [status_id]: { dateField: 'contactDate' },
  // [status_id]: { dateField: 'meetingScheduledDate' },
  // [status_id]: { dateField: 'meetingHeldDate' },
  // [status_id]: { dateField: 'eventScheduledDate' },
  // [status_id]: { dateField: 'eventHeldDate' },
  // [status_id]: { dateField: 'excursionPlannedDate' },
};

export function getCutoffDate() {
  return CUTOFF_DATE;
}

export function getDateFieldForStatus(statusId) {
  const config = STATUS_TO_DATE_FIELD[Number(statusId)];
  return config ? config.dateField : null;
}

export function getAllStatusMappings() {
  return { ...STATUS_TO_DATE_FIELD };
}
