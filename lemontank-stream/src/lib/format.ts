/**
 * פורמט תצוגה בעברית — תאריכים, מספרים, זמני צפייה, מטבע.
 * משתמשים ב-Intl של Node/דפדפן עם locale=he-IL (אין תלות חיצונית).
 */

const heDate = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
const heDateTime = new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const heRelative = new Intl.RelativeTimeFormat("he-IL", { numeric: "auto" });

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : heDate.format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : heDateTime.format(d);
}

/** "לפני 3 שעות" */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return heRelative.format(diffSec, "second");
  if (abs < 3600) return heRelative.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return heRelative.format(Math.round(diffSec / 3600), "hour");
  if (abs < 2_592_000) return heRelative.format(Math.round(diffSec / 86_400), "day");
  if (abs < 31_536_000) return heRelative.format(Math.round(diffSec / 2_592_000), "month");
  return heRelative.format(Math.round(diffSec / 31_536_000), "year");
}

/** משך: 2 שניות → "2:05" / "1:12:30" */
export function formatDuration(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(totalSeconds ?? 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "1 שעה ו-24 דקות" */
export function formatRuntime(totalSeconds: number | null | undefined): string {
  const min = Math.round(Number(totalSeconds ?? 0) / 60);
  if (min <= 0) return "לא צוין";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} דק'`;
  if (m === 0) return h === 1 ? "שעה" : `${h} שעות`;
  return `${h === 1 ? "שעה" : `${h} שעות`} ו-${m} דק'`;
}

export function formatMinutes(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(minutes ?? 0)));
  if (m < 60) return `${m} דק'`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} שעות`;
}

/** 12,345 → "12.3 אלף" */
export function formatCompact(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)} אלף`;
  return `${(v / 1_000_000).toFixed(1)} מיליון`;
}

export function formatPrice(amount: number, currency = "ILS"): string {
  const symbol = currency === "ILS" ? "₪" : currency === "USD" ? "$" : currency;
  const rounded = Number(amount ?? 0);
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return `${symbol}${text}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  const b = Math.max(0, Number(bytes ?? 0));
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

/** 1,234,567 */
export const formatNumber = (n: number | null | undefined): string => new Intl.NumberFormat("he-IL").format(Number(n ?? 0));

/** אחוזים לשורת ההתקדמות */
export const formatPercent = (value: number, digits = 0): string =>
  `${new Intl.NumberFormat("he-IL", { maximumFractionDigits: digits }).format(Number(value ?? 0) * 100)}%`;

/** חישוב "נשארו X דקות" בנגן */
export function remainingLabel(positionSec: number, durationSec: number): string {
  const left = Math.max(0, (durationSec || 0) - (positionSec || 0));
  return `נשארו ${formatDuration(left)}`;
}

/** שם עונה בעברית */
export const seasonLabel = (n: number): string => (n === 1 ? "עונה ראשונה" : `עונה ${n}`);

/** תווית פרק */
export const episodeLabel = (season: number, episode: number): string => `עונה ${season} · פרק ${episode}`;

/** ניקוד גיל לתצוגה */
export const maturityLabel = (maturity: string): string => (maturity === "0+" ? "לכל הגילאים" : `${maturity} ומעלה`);

/** כתובת אימייל מוסתרת למסכי פרטיות: a***@gmail.com */
export function maskEmail(email: string): string {
  const [user, domain] = String(email ?? "").split("@");
  if (!domain) return "***";
  const visible = user.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
}
