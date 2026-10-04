// Дата без UTC-сдвига: дефолт фильтра — Москва, формат YYYY-MM-DD.
export function todayISO(timeZone = 'Europe/Moscow'): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
