/**
 * תשלום בגיפט קארד — המסלול שמאפשר למכור מנוי בלי סולק (PSP).
 *
 * ─ שני סוגי כרטיסים ─────────────────────────────────────────────────────────
 *  1. **כרטיס שהאתר הנפיק** (`issued`) — אתה מייצר קוד, שולח ללקוח, והוא
 *     מממש אותו בעצמו ומקבל מנוי **מיד**. מתאים למכירה בדיסקורד/וואטסאפ.
 *  2. **כרטיס שהלקוח קנה במקום אחר** (`external`) — הוא שולח את הקוד, והקוד
 *     נכנס לתור **ממתין לאישור שלך**. שום מנוי לא מופעל לפני שאתה מאשר,
 *     כי אף אחד לא יכול לדעת מהשרת אם הכרטיס באמת שולם.
 *
 * ─ למה זה בנוי ככה מבחינת אבטחה ─────────────────────────────────────────────
 *  · הקוד **לא נשמר בטקסט גלוי**: נשמר Hash (לחיפוש) + עותק מוצפן (כדי שתוכל
 *    לשלוח אותו שוב ללקוח). גם מי שקורא את כל המסד לא יכול לנצל כרטיסים.
 *  · קוד בעל 20 תווים (100 ביט) — לא ניתן לניחוש, ובנוסף יש הגבלת קצב
 *    והתראה על ניסיונות כושלים, כי ניחוש קודים הוא בדיוק התקיפה כאן.
 *  · כל פעולה (יצירה, מימוש, אישור, דחייה) נרשמת ביומן הביקורת.
 *  · אישור/דחייה של תשלום דורש **אימות מחדש** (step-up) — זו פעולה בכסף.
 */

import crypto from "node:crypto";
import { all, count, get, run, tx } from "./db";
import { ApiError } from "./http";
import { encryptField, decryptField, sha256 } from "./crypto";
import { writeAudit, logSecurityEvent } from "./audit";
import { notifyOutbound } from "./notify-out";

/** אלפבית בלי תווים שמתבלבלים (0/O, 1/I/L) — הקודים נשלחים בהעתקה בעל-פה */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_GROUPS = 4;
const GROUP_SIZE = 5;

export type GiftCardKind = "issued" | "external";
export type GiftCardStatus = "active" | "used" | "expired" | "revoked";
export type RedemptionStatus = "pending" | "approved" | "rejected";

export type GiftCardRow = {
  id: number;
  code_hash: string;
  code_prefix: string;
  code_enc: string | null;
  kind: GiftCardKind;
  plan_code: string;
  months: number;
  value_ils: number;
  max_uses: number;
  used_count: number;
  status: GiftCardStatus;
  note: string | null;
  created_by: number | null;
  expires_at: string | null;
  created_at: string;
};

export type RedemptionRow = {
  id: number;
  user_id: number;
  code_hash: string;
  code_prefix: string;
  kind: GiftCardKind;
  status: RedemptionStatus;
  plan_code: string | null;
  months: number | null;
  value_ils: number | null;
  contact: string | null;
  evidence: string | null;
  decided_by: number | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

/* ─────────────────────────── יצירת קודים ─────────────────────────────── */

/** נירמול קלט: מסיר רווחים ומקפים, ממיר לאותיות גדולות (אנשים מקלידים איך שבא להם) */
export const normalizeCode = (value: string): string =>
  String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");

const formatCode = (raw: string): string =>
  raw.match(new RegExp(`.{1,${GROUP_SIZE}}`, "g"))?.join("-") ?? raw;

/**
 * הקידומת לתצוגה: "‎LT-ABCDE". מחושבת תמיד מהצורה המנורמלת, כדי שמה
 * שמוצג למשתמש יהיה בדיוק מה שמחפשים במסד — בלי הפתעות.
 */
export const codePrefix = (code: string): string => {
  const normalized = normalizeCode(code);
  return normalized.length >= 7 ? `${normalized.slice(0, 2)}-${normalized.slice(2, 7)}` : normalized;
};

/** קוד כרטיס: 4 קבוצות של 5 תווים (‎LTX-…) — 100 ביט אנטרופיה */
export function generateCode(prefix = "LT"): { code: string; raw: string } {
  const groups: string[] = [];
  for (let g = 0; g < CODE_GROUPS; g += 1) {
    const bytes = crypto.randomBytes(GROUP_SIZE);
    let group = "";
    for (const byte of bytes) group += ALPHABET[byte % ALPHABET.length];
    groups.push(group);
  }
  // ה-raw הוא הצורה המנורמלת המלאה — **כולל** הקידומת. זו הצורה שנשמרת
  // כ-Hash וזו שהמימוש מחשב, ולכן אין דרך שהקוד המוצג ייכשל במימוש.
  const body = groups.join("");
  return { code: `${prefix}-${formatCode(body)}`, raw: `${prefix}${body}` };
}

/* ─────────────────────────── יצירה וניהול ────────────────────────────── */

export type CreateGiftCardInput = {
  planCode?: string;
  months?: number;
  valueIls?: number;
  maxUses?: number;
  expiresInDays?: number | null;
  note?: string | null;
  actorId: number;
  count?: number;
  /** קוד חיצוני שהבעלים מקליד בעצמו (נדיר) */
  providedCode?: string;
};

/**
 * יצירת כרטיסים. מחזיר את הקודים **פעם אחת** — אחר כך רק ה-Prefix נגיש
 * לתצוגה, ומדויק מחדש רק דרך פענוח מוצפן (בעלים בלבד).
 */
export type CreatedCards = {
  ids: number[];
  codes: string[];
  note: string;
  planCode: string;
  months: number;
  valueIls: number;
  maxUses: number;
};

export function createGiftCards(input: CreateGiftCardInput): CreatedCards {
  const plan = get<{ code: string; price_ils: number }>(
    "SELECT code, price_ils FROM plans WHERE code = ?",
    [input.planCode ?? "plus"],
  );
  if (!plan) throw new ApiError("BAD_REQUEST", 400, undefined, "מסלול לא קיים");

  const months = Math.min(36, Math.max(1, Number(input.months ?? 1)));
  const value = Number(input.valueIls ?? plan.price_ils * months);
  const uses = Math.min(50, Math.max(1, Number(input.maxUses ?? 1)));
  const howMany = Math.min(50, Math.max(1, Number(input.count ?? 1)));
  const expiresAt =
    input.expiresInDays && Number(input.expiresInDays) > 0
      ? new Date(Date.now() + Number(input.expiresInDays) * 86_400_000).toISOString()
      : null;

  const ids: number[] = [];
  const codes: string[] = [];

  tx(() => {
    for (let i = 0; i < howMany; i += 1) {
      const { code, raw } = input.providedCode && howMany === 1
        ? { code: String(input.providedCode).toUpperCase(), raw: normalizeCode(String(input.providedCode)) }
        : generateCode();
      const existing = get<{ id: number }>("SELECT id FROM gift_cards WHERE code_hash = ?", [sha256(raw)]);
      if (existing) throw new ApiError("CONFLICT", 409, undefined, "הקוד הזה כבר קיים במערכת");

      const result = run(
        `INSERT INTO gift_cards(code_hash, code_prefix, code_enc, kind, plan_code, months, value_ils, max_uses, status, note, created_by, expires_at)
         VALUES(?,?,?,'issued',?,?,?,?,'active',?,?,?)`,
        [
          sha256(raw),
          codePrefix(code),
          encryptField(code),
          plan.code,
          months,
          value,
          uses,
          input.note ?? null,
          input.actorId,
          expiresAt,
        ],
      );
      ids.push(Number(result.lastInsertRowid));
      codes.push(code);
    }
  });

  const note = `${howMany} כרטיסים · ${plan.code} ל-${months} חודשים · שווי ₪${value.toFixed(2)}`;
  writeAudit(
    {
      action: "giftcard.create",
      entity: "gift_card",
      entityId: ids[0],
      severity: "warning",
      after: { count: howMany, plan: plan.code, months, value, maxUses: uses, prefixes: codes.map((c) => c.slice(0, 9)) },
    },
    { actorId: input.actorId },
  );
  void logSecurityEvent({
    kind: "giftcard_created",
    severity: "info",
    detail: `${note} (${codes.map((c) => c.slice(0, 9)).join(", ")})`,
  });

  return {
    ids,
    codes,
    note,
    planCode: plan.code,
    months,
    valueIls: value,
    maxUses: uses,
  };
}

/** הכרטיסים עצמם — בלי קוד גלוי, עם קידומת וסטטיסטיקת שימוש */
export function listGiftCards(limit = 100) {
  return all<{
    id: number; code_prefix: string; kind: string; plan_code: string; months: number; value_ils: number;
    max_uses: number; used_count: number; status: string; note: string | null; created_at: string;
    expires_at: string | null; creator: string | null;
  }>(
    `SELECT g.id, g.code_prefix, g.kind, g.plan_code, g.months, g.value_ils, g.max_uses, g.used_count,
            g.status, g.note, g.created_at, g.expires_at, u.email AS creator
     FROM gift_cards g LEFT JOIN users u ON u.id = g.created_by
     ORDER BY g.id DESC LIMIT ?`,
    [Math.min(500, Math.max(1, limit))],
  );
}

/** פענוח הקוד של כרטיס מסוים — לבעלים בלבד (כדי לשלוח ללקוח שוב) */
export function revealGiftCardCode(id: number): { code: string | null; status: string } {
  const row = get<{ code_enc: string | null; status: string }>("SELECT code_enc, status FROM gift_cards WHERE id = ?", [id]);
  if (!row) throw new ApiError("NOT_FOUND", 404);
  return { code: decryptField(row.code_enc), status: row.status };
}

export function revokeGiftCard(id: number, actorId: number, reason?: string): void {
  const row = get<{ status: string; used_count: number }>("SELECT status, used_count FROM gift_cards WHERE id = ?", [id]);
  if (!row) throw new ApiError("NOT_FOUND", 404);
  if (row.status === "revoked") throw new ApiError("CONFLICT", 409, undefined, "הכרטיס כבר מבוטל");
  run("UPDATE gift_cards SET status = 'revoked' WHERE id = ?", [id]);
  writeAudit(
    { action: "giftcard.revoke", entity: "gift_card", entityId: id, severity: "critical", detail: reason ?? undefined, before: { status: row.status } },
    { actorId },
  );
}

/* ─────────────────────────── מימוש כרטיס ────────────────────────────── */

export type GrantInput = {
  userId: number;
  planCode: string;
  months: number;
  amountIls: number;
  provider: string;
  externalId?: string | null;
  description: string;
  actorId?: number | null;
};

/**
 * הפעלת/הארכת מנוי. הארכה **מצטברת**: אם למשתמש יש מנוי פעיל, החודשים
 * נוספים לסוף התקופה הקיימת במקום לדרוס אותה — זה מה שלקוח מצפה לו.
 */
export function grantSubscription(input: GrantInput): { subscriptionId: number; periodEnd: string } {
  const months = Math.min(36, Math.max(1, input.months));
  const existing = get<{ id: number; current_period_end: string | null }>(
    `SELECT id, current_period_end FROM subscriptions
     WHERE user_id = ? AND status IN ('active','trialing') ORDER BY id DESC LIMIT 1`,
    [input.userId],
  );

  const now = Date.now();
  const base = existing?.current_period_end && Date.parse(existing.current_period_end) > now
    ? Date.parse(existing.current_period_end)
    : now;
  // חודש = 30 יום, כדי שלא יהיו הפתעות בסוף חודש (31 בינואר וכו')
  const periodEnd = new Date(base + months * 30 * 86_400_000).toISOString();

  let subscriptionId: number;
  if (existing) {
    run(
      "UPDATE subscriptions SET plan_code = ?, status = 'active', current_period_end = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      [input.planCode, periodEnd, existing.id],
    );
    subscriptionId = existing.id;
  } else {
    const result = run(
      `INSERT INTO subscriptions(user_id, plan_code, status, current_period_end, provider, external_id)
       VALUES(?,?,'active',?,?,?)`,
      [input.userId, input.planCode, periodEnd, input.provider, input.externalId ?? null],
    );
    subscriptionId = Number(result.lastInsertRowid);
  }

  // חיוב ביומן התשלומים — גם בתשלום בגיפט קארד נוצרת רשומה (הנהלת חשבונות)
  const vat = input.amountIls - input.amountIls / 1.18;
  const invoiceNo = `LT-${new Date().getFullYear()}-${String(count("SELECT COUNT(*) c FROM payments") + 1).padStart(5, "0")}`;
  run(
    `INSERT INTO payments(user_id, subscription_id, amount, currency, status, provider, external_id, invoice_no, vat_amount, meta)
     VALUES(?,?,?,'ILS','paid',?,?,?,?,?)`,
    [
      input.userId,
      subscriptionId,
      input.amountIls,
      input.provider,
      input.externalId ?? null,
      invoiceNo,
      Number(vat.toFixed(2)),
      JSON.stringify({ description: input.description, grantedBy: input.actorId ?? null }),
    ],
  );

  run("UPDATE users SET plan_code = ? WHERE id = ?", [input.planCode, input.userId]);
  run("INSERT INTO notifications(user_id, kind, title, body, link) VALUES(?,?,?,?,?)", [
    input.userId,
    "billing",
    "המנוי שלך פעיל! 🎉",
    `${input.description} — המנוי בתוקף עד ${new Date(periodEnd).toLocaleDateString("he-IL")}.`,
    "/account/subscription",
  ]);

  writeAudit(
    {
      action: "subscription.update",
      entity: "subscription",
      entityId: subscriptionId,
      severity: "warning",
      after: { userId: input.userId, plan: input.planCode, months, periodEnd, provider: input.provider, invoiceNo },
    },
    { actorId: input.actorId ?? undefined },
  );

  return { subscriptionId, periodEnd };
}

export type RedeemResult =
  | { mode: "granted"; cardId: number; planCode: string; months: number; periodEnd: string; requestId: number }
  | { mode: "pending"; requestId: number; message: string };

/**
 * מימוש קוד על ידי משתמש.
 *
 *  · קוד של כרטיס שהאתר הנפיק → מנוי **מיד**.
 *  · קוד לא מוכר → נוצרת בקשת תשלום **ממתינה לאישור** (ייתכן שהלקוח קנה
 *    כרטיס בחנות). אין הפעלה אוטומטית של שום דבר.
 */
export function redeemCode(input: {
  userId: number;
  code: string;
  contact?: string | null;
  evidence?: string | null;
  ip?: string | null;
}): RedeemResult {
  const raw = normalizeCode(input.code);
  if (raw.length < 8) throw new ApiError("BAD_REQUEST", 400, undefined, "קוד כרטיס קצר מדי");

  const hash = sha256(raw);
  const card = get<GiftCardRow>("SELECT * FROM gift_cards WHERE code_hash = ?", [hash]);
  const prefix = codePrefix(raw);

  // ── קוד לא מוכר: בקשת תשלום חיצונית שממתינה לבעלים ──────────────────────
  if (!card) {
    const duplicate = get<{ id: number }>(
      "SELECT id FROM redemption_requests WHERE code_hash = ? AND status = 'pending'",
      [hash],
    );
    if (duplicate) {
      return { mode: "pending", requestId: duplicate.id, message: "הבקשה הזו כבר ממתינה לאישור — נעדכן אותך ברגע שנאשר" };
    }

    const requestId = tx(() => {
      const result = run(
        `INSERT INTO redemption_requests(user_id, code_hash, code_prefix, code_enc, kind, status, contact, evidence)
         VALUES(?,?,?,?,'external','pending',?,?)`,
        [input.userId, hash, prefix, encryptField(String(input.code).toUpperCase()), input.contact ?? null, input.evidence ?? null],
      );
      return Number(result.lastInsertRowid);
    });

    void logSecurityEvent({
      kind: "giftcard_request",
      severity: "info",
      ip: input.ip ?? undefined,
      userId: input.userId,
      detail: `בקשת תשלום בגיפט קארד (${prefix}…)`,
    });
    writeAudit(
      { action: "payment.create", entity: "redemption_request", entityId: requestId, detail: "gift card claim" },
      { actorId: input.userId },
    );

    // התראה החוצה (דיסקורד/מייל) + התראה בתוך האתר לבעלים ולסגל
    void notifyOutbound({
      kind: "payment_request",
      title: "בקשת תשלום חדשה בגיפט קארד",
      body: `משתמש #${input.userId} שלח קוד כרטיס (${prefix}…) וממתין לאישור.\nלאישור: /admin/giftcards`,
    });
    for (const staff of all<{ id: number }>(
      "SELECT id FROM users WHERE role IN ('admin','owner') AND deleted_at IS NULL",
    )) {
      run("INSERT INTO notifications(user_id, kind, title, body, link) VALUES(?,?,?,?,?)", [
        staff.id,
        "billing",
        "בקשת תשלום ממתינה לאישור",
        `משתמש #${input.userId} שלח קוד כרטיס (${prefix}…) — נדרש אישור ידני.`,
        "/admin/giftcards",
      ]);
    }

    return { mode: "pending", requestId, message: "הבקשה נשלחה לאישור — ברגע שנאשר תקבל מנוי והודעה" };
  }

  // ── כרטיס מוכר: בדיקות תוקף ────────────────────────────────────────────
  if (card.status === "revoked") throw new ApiError("FORBIDDEN", 403, undefined, "הכרטיס הזה בוטל");
  if (card.status === "expired") throw new ApiError("FORBIDDEN", 403, undefined, "פג תוקף הכרטיס");
  if (card.expires_at && Date.parse(card.expires_at) < Date.now()) {
    run("UPDATE gift_cards SET status = 'expired' WHERE id = ?", [card.id]);
    throw new ApiError("FORBIDDEN", 403, undefined, "פג תוקף הכרטיס");
  }
  if (card.used_count >= card.max_uses) throw new ApiError("CONFLICT", 409, undefined, "הכרטיס הזה כבר נוצל");

  const alreadyUsedByMe = count(
    "SELECT COUNT(*) c FROM redemption_requests WHERE code_hash = ? AND user_id = ? AND status IN ('approved','pending')",
    [card.code_hash, input.userId],
  );
  if (alreadyUsedByMe) throw new ApiError("CONFLICT", 409, undefined, "כבר מימשת את הכרטיס הזה");

  const result = tx(() => {
    const request = run(
      `INSERT INTO redemption_requests(user_id, code_hash, code_prefix, code_enc, kind, status, plan_code, months, value_ils, contact, decided_at)
       VALUES(?,?,?,?,'issued','approved',?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
      [
        input.userId,
        card.code_hash,
        card.code_prefix,
        encryptField(String(input.code).toUpperCase()),
        card.plan_code,
        card.months,
        card.value_ils,
        input.contact ?? null,
      ],
    );
    run("UPDATE gift_cards SET used_count = used_count + 1, status = CASE WHEN used_count + 1 >= max_uses THEN 'used' ELSE status END WHERE id = ?", [card.id]);
    return Number(request.lastInsertRowid);
  });

  const grant = grantSubscription({
    userId: input.userId,
    planCode: card.plan_code,
    months: card.months,
    amountIls: card.value_ils,
    provider: "gift_card",
    externalId: `giftcard:${card.id}`,
    description: `מימוש כרטיס מתנה ${card.code_prefix}…`,
    actorId: input.userId,
  });

  // שתי רשומות נפרדות בכוונה: הראשונה עונה "מי מימש איזה כרטיס ומתי"
  // (חקירה), השנייה "נוצרה עסקה" (הנה"ח). מיזוג היה מאבד אחת מהשאלות.
  writeAudit(
    {
      action: "giftcard.redeem",
      entity: "gift_card",
      entityId: card.id,
      severity: "warning",
      after: {
        userId: input.userId,
        plan: card.plan_code,
        months: card.months,
        periodEnd: grant.periodEnd,
        prefix: card.code_prefix,
      },
    },
    { actorId: input.userId },
  );

  writeAudit(
    {
      action: "payment.create",
      entity: "gift_card",
      entityId: card.id,
      severity: "warning",
      after: { userId: input.userId, months: card.months, plan: card.plan_code, provider: "gift_card" },
    },
    { actorId: input.userId },
  );

  return {
    mode: "granted",
    cardId: card.id,
    planCode: card.plan_code,
    months: card.months,
    periodEnd: grant.periodEnd,
    requestId: result,
  };
}

/* ──────────────────── אישור/דחייה של בקשות תשלום ─────────────────────── */

export function decideRedemption(input: {
  id: number;
  decision: "approve" | "reject";
  actorId: number;
  note?: string | null;
  /** השווי שהבעלים מאשר (יכול להיות שונה ממה שהלקוח הצהיר) */
  valueIls?: number | null;
  months?: number | null;
  planCode?: string | null;
}): { ok: true; userId: number; periodEnd?: string } {
  const request = get<RedemptionRow>("SELECT * FROM redemption_requests WHERE id = ?", [input.id]);
  if (!request) throw new ApiError("NOT_FOUND", 404);
  if (request.status !== "pending") throw new ApiError("CONFLICT", 409, undefined, "הבקשה כבר טופלה");

  if (input.decision === "reject") {
    tx(() => {
      run(
        "UPDATE redemption_requests SET status = 'rejected', decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), decision_note = ? WHERE id = ?",
        [input.actorId, input.note ?? null, input.id],
      );
      run("INSERT INTO notifications(user_id, kind, title, body, link) VALUES(?,?,?,?,?)", [
        request.user_id,
        "billing",
        "הבקשה שלך לא אושרה",
        input.note ?? "לא הצלחנו לאמת את הכרטיס. אפשר לפנות לתמיכה עם פרטי הרכישה.",
        "/support",
      ]);
    });
    writeAudit(
      { action: "payment.refund", entity: "redemption_request", entityId: input.id, severity: "warning", detail: input.note ?? "rejected" },
      { actorId: input.actorId },
    );
    return { ok: true, userId: request.user_id };
  }

  const plan = input.planCode ?? request.plan_code ?? "plus";
  const months = Number(input.months ?? request.months ?? 1);
  const value = Number(input.valueIls ?? request.value_ils ?? 0);

  const grant = grantSubscription({
    userId: request.user_id,
    planCode: plan,
    months,
    amountIls: value,
    provider: "gift_card_manual",
    externalId: `redeem:${request.id}`,
    description: `אישור תשלום ידני (בקשה #${request.id}, ${request.code_prefix}…)`,
    actorId: input.actorId,
  });

  run(
    `UPDATE redemption_requests SET status = 'approved', decided_by = ?, decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       decision_note = ?, plan_code = ?, months = ?, value_ils = ? WHERE id = ?`,
    [input.actorId, input.note ?? null, plan, months, value, input.id],
  );

  writeAudit(
    {
      action: "payment.create",
      entity: "redemption_request",
      entityId: input.id,
      severity: "warning",
      after: { userId: request.user_id, plan, months, value, approvedBy: input.actorId },
    },
    { actorId: input.actorId },
  );

  return { ok: true, userId: request.user_id, periodEnd: grant.periodEnd };
}

/* ─────────────────────────── תצוגות ─────────────────────────────────── */

export const listRedemptions = (opts: { status?: string; limit?: number } = {}) =>
  all<RedemptionRow & { email: string; name: string; decider: string | null }>(
    `SELECT r.*, u.email, u.name, d.email AS decider
     FROM redemption_requests r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN users d ON d.id = r.decided_by
     ${opts.status ? "WHERE r.status = ?" : ""}
     ORDER BY r.id DESC LIMIT ?`,
    opts.status ? [opts.status, Math.min(300, opts.limit ?? 100)] : [Math.min(300, opts.limit ?? 100)],
  );

export const userRedemptions = (userId: number) =>
  all<Pick<RedemptionRow, "id" | "code_prefix" | "kind" | "status" | "plan_code" | "months" | "value_ils" | "created_at" | "decided_at" | "decision_note">>(
    `SELECT id, code_prefix, kind, status, plan_code, months, value_ils, created_at, decided_at, decision_note
     FROM redemption_requests WHERE user_id = ? ORDER BY id DESC LIMIT 50`,
    [userId],
  );

/** הכנסות מגיפט קארד — לבעלים */
export function giftCardStats() {
  const paid = get<{ total: number; cnt: number }>(
    "SELECT COALESCE(SUM(amount),0) total, COUNT(*) cnt FROM payments WHERE provider LIKE 'gift_card%' AND status = 'paid'",
  );
  return {
    revenueIls: Number(paid?.total ?? 0),
    payments: Number(paid?.cnt ?? 0),
    cardsCreated: count("SELECT COUNT(*) c FROM gift_cards"),
    cardsUsed: count("SELECT COUNT(*) c FROM gift_cards WHERE used_count > 0"),
    cardsRevoked: count("SELECT COUNT(*) c FROM gift_cards WHERE status = 'revoked'"),
    activeSubscriptions: count("SELECT COUNT(*) c FROM subscriptions WHERE status = 'active' AND current_period_end > strftime('%Y-%m-%dT%H:%M:%fZ','now')"),
    pendingRequests: count("SELECT COUNT(*) c FROM redemption_requests WHERE status = 'pending'"),
  };
}
