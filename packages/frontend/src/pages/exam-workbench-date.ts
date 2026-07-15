const DAY_MS = 24 * 60 * 60 * 1000;

function localCalendarSerial(value: Date): number {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

export function calendarDayDistance(targetIso: string, now = new Date()): number {
  const target = new Date(targetIso);
  return Math.round((localCalendarSerial(target) - localCalendarSerial(now)) / DAY_MS);
}

export function formatExamCountdown(examAt: string, now = new Date()): string {
  const days = calendarDayDistance(examAt, now);
  if (days > 0) return `还有 ${days} 天`;
  if (days === 0) return '今天（0 天）';
  return `已到期 ${Math.abs(days)} 天`;
}

export function isWithinCalendarDayWindow(valueIso: string, centerIso: string, days: number): boolean {
  const center = new Date(centerIso);
  return Math.abs(calendarDayDistance(valueIso, center)) <= days;
}

