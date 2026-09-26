"use client";

const FINGERPRINT_KEY = "lt_device_fp";

/**
 * מזהה מכשיר יציב לדפדפן הזה.
 * נשמר ב-localStorage בלבד — בלי cookies, בלי טביעות אצבע של חומרה, בלי פרטים אישיים.
 */
export function deviceFingerprint(): string {
  if (typeof window === "undefined") return "ssr";
  let value = window.localStorage.getItem(FINGERPRINT_KEY);
  if (!value) {
    value = `web-${crypto.randomUUID()}`;
    window.localStorage.setItem(FINGERPRINT_KEY, value);
  }
  return value;
}

export const deviceLabel = (): string => {
  if (typeof navigator === "undefined") return "מכשיר";
  if (/iPhone|iPad|Android/i.test(navigator.userAgent)) return "טלפון";
  return "מחשב";
};
