import { t } from "./i18n/index.ts";

const LOCALE = "fr-FR";
const tokenFormat = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });
const numberFormat = new Intl.NumberFormat(LOCALE);
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { timeStyle: "short" });
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

export function formatTokens(count: number): string {
  return tokenFormat.format(count);
}

export function formatNumber(count: number): string {
  return numberFormat.format(count);
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function formatRelative(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return relativeFormat.format(0, "minute");
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return t("format.duration.underSecond");
  if (ms < 60_000) return t("format.duration.seconds", { seconds: Math.round(ms / 1000) });
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return t("format.duration.minutes", { minutes: totalMinutes });
  const hours = Math.floor(totalMinutes / 60);
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return t("format.duration.hours", { hours, minutes });
}

const dayFormat = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" });

// A calendar day as the API sends it (`YYYY-MM-DD`), read as that day, not as a UTC midnight.
export function formatDay(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return dayFormat.format(new Date(year, month - 1, date));
}
