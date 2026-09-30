/**
 * התראות יוצאות מהאתר — דיסקורד, Webhook כללי, ומייל (SMTP אופציונלי).
 *
 * ─ למה זה קריטי ולא "נחמד שיש" ───────────────────────────────────────────────
 * מערכת שמתריעה רק **בתוך** האתר מפספסת את התרחיש הגרוע ביותר: תוקף שנכנס
 * לחשבון הבעלים ימחק/ישתיק את ההתראות, ואף אחד לא ידע. התראה שיוצאת
 * לשרת חיצוני (דיסקורד/מייל) לא תלויה במי שבתוך המערכת.
 *
 * ─ כללי התנהגות ────────────────────────────────────────────────────────────
 *  · **לעולם לא זורק** — התראה שנכשלה לא מפילה את הפעולה שהפעילה אותה.
 *  · כל ניסיון נרשם ב-`outbound_alerts` (queued → sent/failed) עם סיבת הכשל.
 *  · בלי יעד מוגדר — נרשם `skipped`, כדי שהמסך יראה "לא הוגדר יעד" ולא "שקט".
 *  · יש השהיה (timeout) קצרה: התראה לא תוקעת בקשת משתמש.
 *
 * הגדרה (לפי סדר עדיפויות):
 *  1. `security_settings.outbound_webhook` / `outbound_discord` (מהמסך)
 *  2. משתני סביבה: `DISCORD_WEBHOOK_URL` · `ALERT_WEBHOOK_URL`
 *  3. מייל: `SMTP_URL` (למשל smtps://user:pass@host:465) + `ALERT_EMAIL`
 */

import { all, get, run } from "./db";

export type OutboundKind = "payment_request" | "security" | "payment" | "backup" | "test" | "signup";
export type OutboundChannel = "discord" | "webhook" | "email";
/** ערוץ מדומה לרישום התראה שלא יצאה כי לא הוגדר יעד — כדי ש"שקט" יהיה מצב גלוי */
export type RecordedChannel = OutboundChannel | "none";

export type OutboundInput = {
  kind: OutboundKind;
  title: string;
  body: string;
  /** קישור יחסי בתוך האתר — יוצג בהודעה */
  link?: string;
  /** ערוצים מועדפים; ברירת מחדל: כל מה שמוגדר */
  channels?: OutboundChannel[];
  severity?: "info" | "warning" | "critical";
};

const SEVERITY_EMOJI: Record<string, string> = { info: "ℹ️", warning: "⚠️", critical: "🚨" };
const KIND_LABEL: Record<OutboundKind, string> = {
  payment_request: "💰 בקשת תשלום",
  payment: "💳 תשלום",
  security: "🛡️ אבטחה",
  backup: "💾 גיבוי",
  signup: "🎉 הרשמה",
  test: "🧪 בדיקה",
};

/* ─────────────────────────── הגדרות ─────────────────────────────────── */

function setting(key: string): string {
  try {
    return String(get<{ value: string }>("SELECT value FROM security_settings WHERE key = ?", [key])?.value ?? "").trim();
  } catch {
    return "";
  }
}

export function outboundConfig() {
  const discord = setting("outbound_discord") || String(process.env.DISCORD_WEBHOOK_URL ?? "").trim();
  const webhook = setting("outbound_webhook") || String(process.env.ALERT_WEBHOOK_URL ?? "").trim();
  const emailTo = setting("outbound_email") || String(process.env.ALERT_EMAIL ?? "").trim();
  const smtpUrl = String(process.env.SMTP_URL ?? "").trim();
  const appUrl = String(process.env.APP_URL ?? "").replace(/\/$/, "");
  return { discord, webhook, emailTo, smtpUrl, appUrl, emailReady: Boolean(smtpUrl && emailTo) };
}

export function setOutboundSetting(key: "outbound_discord" | "outbound_webhook" | "outbound_email", value: string): void {
  run(
    `INSERT INTO security_settings(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value ?? "").trim()],
  );
}

/* ─────────────────────────── שליחה ─────────────────────────────────── */

const text = (input: OutboundInput) => {
  const config = outboundConfig();
  const emoji = SEVERITY_EMOJI[input.severity ?? "info"];
  const link = input.link ? `\n${config.appUrl}${input.link}` : "";
  return `${emoji} **${KIND_LABEL[input.kind]} · ${input.title}**\n${input.body}${link}`;
};

function record(input: OutboundInput, channel: RecordedChannel, status: string, error?: string): void {
  try {
    run(
      `INSERT INTO outbound_alerts(channel, kind, title, body, status, attempts, error, sent_at)
       VALUES(?,?,?,?,?,1,?,?)`,
      [
        channel,
        input.kind,
        input.title.slice(0, 200),
        input.body.slice(0, 2000),
        status,
        error ? error.slice(0, 400) : null,
        status === "sent" ? new Date().toISOString() : null,
      ],
    );
  } catch {
    /* הטבלה חסרה (הגירה לא הוחלה) — לא מפילים את הבקשה בגלל לוג */
  }
}

async function postJson(url: string, payload: unknown, timeoutMs: number): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "LemonTank-Alerts/1.0" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * שליחת מייל דרך SMTP — בלי תלויות חיצוניות.
 *
 * תומך ב-**TLS מרומז** בלבד (`smtps://user:pass@host:465`), כי זה מה שכל
 * ספקי המייל המודרניים (Gmail, Zoho, Resend, Mailgun) נותנים. `smtp://`
 * רגיל דורש משא ומתן STARTTLS — לא מנתחים אותו כאן בכוונה: עדיף כשל ברור
 * מאשר הצפנה מדומה. אם אין SMTP מוגדר, הערוץ פשוט מדולג ורשום כ-skipped.
 *
 * סדר הדיבור: greeting → EHLO → (AUTH LOGIN) → MAIL FROM → RCPT TO → DATA → QUIT
 */
async function sendEmail(
  smtpUrl: string,
  to: string,
  subject: string,
  body: string,
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string }> {
  const url = new URL(smtpUrl);
  if (url.protocol !== "smtps:") {
    return { ok: false, error: "רק smtps:// נתמך (TLS מרומז). דוגמה: smtps://user:pass@smtp.gmail.com:465" };
  }

  const tls = await import("node:tls");
  const port = Number(url.port || 465);
  const user = decodeURIComponent(url.username);
  const pass = decodeURIComponent(url.password);
  const from = user.includes("@") ? user : `alerts@${url.hostname}`;
  const message =
    `From: ${from}\r\nTo: ${to}\r\nSubject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\nMIME-Version: 1.0\r\n\r\n${body.replace(/\r?\n\./g, "\n..")}\r\n.\r\n`;

  return new Promise((resolve) => {
    const socket = tls.connect({ host: url.hostname, port, servername: url.hostname });
    const steps = [
      "EHLO lemontank.local",
      ...(user ? ["AUTH LOGIN", Buffer.from(user).toString("base64"), Buffer.from(pass).toString("base64")] : []),
      `MAIL FROM:<${from}>`,
      `RCPT TO:<${to}>`,
      "DATA",
      message,
    ];
    let step = 0;
    let buffer = "";
    let settled = false;

    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      try {
        socket.write("QUIT\r\n");
      } catch {
        /* כבר סגור */
      }
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs, () => finish({ ok: false, error: "timeout מול שרת המייל" }));
    socket.on("error", (error) => finish({ ok: false, error: error.message }));

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      // תשובת SMTP רב-שורית מסתיימת בשורה "250 משהו" (רווח אחרי הקוד)
      const complete = buffer.split(/\r?\n/).filter(Boolean).pop();
      if (!complete || !/^\d{3}[ ]/.test(complete)) return;

      const code = Number(buffer.slice(0, 3));
      buffer = "";
      if (code >= 400) {
        finish({ ok: false, error: `SMTP ${code}` });
        return;
      }
      if (step === steps.length) {
        finish({ ok: true });
        return;
      }
      socket.write(`${steps[step]}\r\n`);
      step += 1;
      // אחרי שליחת ה-DATA השרת עונה 250 וסוגרים בהצלחה
      if (step === steps.length + 1) finish({ ok: true });
    });
  });
}

/**
 * שליחת התראה לכל הערוצים המוגדרים. תמיד מסתיים (גם בכשל) — לא זורק.
 */
export async function notifyOutbound(input: OutboundInput, opts: { timeoutMs?: number } = {}): Promise<{ sent: OutboundChannel[]; failed: OutboundChannel[]; skipped: OutboundChannel[] }> {
  const config = outboundConfig();
  const timeoutMs = opts.timeoutMs ?? 4000;
  const wanted = input.channels ?? (["discord", "webhook", "email"] as OutboundChannel[]);
  const sent: OutboundChannel[] = [];
  const failed: OutboundChannel[] = [];
  const skipped: OutboundChannel[] = [];

  // ── דיסקורד ───────────────────────────────────────────────────────────
  if (wanted.includes("discord")) {
    if (!config.discord) skipped.push("discord");
    else {
      const result = await postJson(config.discord, { content: text(input).slice(0, 1900) }, timeoutMs);
      record(input, "discord", result.ok ? "sent" : "failed", result.error);
      result.ok ? sent.push("discord") : failed.push("discord");
    }
  }

  // ── Webhook כללי ──────────────────────────────────────────────────────
  if (wanted.includes("webhook")) {
    if (!config.webhook) skipped.push("webhook");
    else {
      const result = await postJson(
        config.webhook,
        {
          kind: input.kind,
          severity: input.severity ?? "info",
          title: input.title,
          body: input.body,
          link: config.appUrl && input.link ? `${config.appUrl}${input.link}` : input.link ?? null,
          at: new Date().toISOString(),
        },
        timeoutMs,
      );
      record(input, "webhook", result.ok ? "sent" : "failed", result.error);
      result.ok ? sent.push("webhook") : failed.push("webhook");
    }
  }

  // ── מייל ──────────────────────────────────────────────────────────────
  if (wanted.includes("email")) {
    if (!config.emailReady) skipped.push("email");
    else {
      const result = await sendEmail(config.smtpUrl, config.emailTo, `[LemonTank] ${input.title}`, text(input), timeoutMs);
      record(input, "email", result.ok ? "sent" : "failed", result.error);
      result.ok ? sent.push("email") : failed.push("email");
    }
  }

  // אם לא ניסינו אפילו ערוץ אחד — רושמים שורה אחת "skipped", כדי שהמסך
  // יראה "לא הוגדר יעד" במקום להציג מצב שנראה כאילו ההתראה נשלחה.
  if (sent.length === 0 && failed.length === 0) record(input, "none", "skipped");

  return { sent, failed, skipped };
}

/** האם יש בכלל יעד מוגדר (למסך ההגדרות) */
export const outboundReady = (): boolean => {
  const config = outboundConfig();
  return Boolean(config.discord || config.webhook || config.emailReady);
};

/** 20 ההתראות האחרונות — כדי לראות מה יצא ומה נכשל */
export const recentOutbound = (limit = 20) => {
  try {
    return all(
      "SELECT id, channel, kind, title, status, error, created_at, sent_at FROM outbound_alerts ORDER BY id DESC LIMIT ?",
      [limit],
    );
  } catch {
    return []; // הטבלה עוד לא קיימת (לפני הגירה)
  }
};
