// Computes the day-cell accessibility label Android's native DatePickerDialog
// uses for "N days ago" (e.g. "20 August 2026"), plus how many times to tap
// "Previous month" to reach that month from whatever month the picker opens
// on (today's). Used by seed helpers to pick a control date safely outside
// every outcome window without hardcoding a specific date.
const DAYS_BACK = 8;
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const target = new Date(today);
target.setDate(target.getDate() - DAYS_BACK);

const monthsBack =
  (today.getFullYear() - target.getFullYear()) * 12 + (today.getMonth() - target.getMonth());

const day = String(target.getDate()).padStart(2, '0');
const label = `${day} ${MONTH_NAMES[target.getMonth()]} ${target.getFullYear()}`;

output.controlDateLabel = label;
output.controlMonthsBack = monthsBack;
