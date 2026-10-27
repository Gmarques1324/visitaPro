export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year, week };
}
export function startOfIsoWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}
export function addDays(date: Date, days: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + days); return d;
}
export function nextDueDate(lastVisit: Date, frequency: "weekly" | "fortnightly" | "monthly"): Date {
  if (frequency === "weekly") return addDays(startOfIsoWeek(lastVisit), 7);
  if (frequency === "fortnightly") return addDays(startOfIsoWeek(lastVisit), 14);
  // Monthly: same calendar day in the following month, clamped to that month's final day.
  const year = lastVisit.getFullYear(), month = lastVisit.getMonth();
  const nextMonthLastDay = new Date(year, month + 2, 0).getDate();
  return new Date(year, month + 1, Math.min(lastVisit.getDate(), nextMonthLastDay));
}
export function dateLabel(value: string | Date): string {
  return new Date(value).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}
