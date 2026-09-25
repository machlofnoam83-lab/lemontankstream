"use client";

/**
 * מרכז הבקרה של האבטחה — כל השליטה בשכבת ההגנה במקום אחד:
 *   • מצב המערכת (אכיפה/ניטור) ומתגי מדיניות (חוסם פרוקסי, TOR, מלכודות…)
 *   • רשימת חסימות פעילות עם שחרור בקליק, וחסימה ידנית של כתובת
 *   • התוקפנים הבולטים ואירועי החסימה האחרונים
 */

import { useCallback, useEffect, useState } from "react";
import { apiCall } from "@/lib/client/api";
import { Alert, Badge, Button, Card, Input, Spinner, Switch } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

type BanRow = {
  id: number;
  ip: string;
  reason: string;
  category: string;
  severity: string;
  strikes: number;
  hits: number;
  path: string | null;
  method: string | null;
  user_agent: string | null;
  auto: number;
  permanent: number;
  created_at: string;
  expires_at: string | null;
};

type Payload = {
  stats: { active: number; total: number; last24h: number; blocked24h: number; byCategory: { category: string; c: number }[] };
  bans: BanRow[];
  history: BanRow[];
  offenders: { ip: string; category: string; hits: number; last_seen: string }[];
  recentBlocks: { kind: string; severity: string; ip: string | null; detail: string | null; created_at: string }[];
  settings: Record<string, string>;
  intel: { present: boolean; updatedAt: string | null; tor: number; datacenter: number; blocked: number };
};

const CATEGORY_LABELS: Record<string, string> = {
  sqli: "הזרקת SQL",
  xss: "XSS",
  rce: "הרצת פקודות",
  traversal: "חדירת נתיבים",
  ssti: "הזרקת תבנית",
  xxe: "XXE",
  ssrf: "SSRF",
  crlf: "הזרקת כותרות",
  nosqli: "NoSQL",
  ldapi: "LDAP",
  malformed: "בקשה פגומה",
  probe: "סריקת שרתים",
  honeypot: "מלכודת",
  tool: "כלי תקיפה",
  spoof: "זיוף זהות",
  brute: "כוח גס",
  flood: "הצפה",
  threat: "ניקוד איומים",
  manual: "חסימה ידנית",
  proxy: "פרוקסי/VPN",
};

const POLICY_SWITCHES: { key: string; title: string; description: string; on: string; off: string; invert?: boolean }[] = [
  { key: "autoban", title: "חסימת IP אוטומטית", description: "זיהוי תקיפה = חסימה מיידית של הכתובת", on: "on", off: "off" },
  { key: "honeypot_paths", title: "נתיבי מלכודת", description: "/wp-login.php, /.env וכו' — כל נגיעה נחשבת פריצה", on: "on", off: "off" },
  { key: "tor_ban", title: "חסימת רשת TOR", description: "פנייה מיציאת TOR נחסמת מיד", on: "on", off: "off" },
  { key: "datacenter_ban", title: "חסימת מרכזי נתונים", description: "חסימה מלאה של עננים/VPN (עלול לחסום גם לקוחות עם VPN)", on: "on", off: "off" },
  { key: "flood_ban", title: "חסימת הצפות", description: "יותר מדי בקשות בדקה = חסימה", on: "on", off: "off" },
  { key: "internal_bypass", title: "פטור לרשת פנימית", description: "localhost ו-LAN לא נחסמים (מומלץ להשאיר פעיל)", on: "on", off: "off" },
  { key: "staff_bypass", title: "חסינות אנשי צוות", description: "סשן מנהל לא ייחסם — מונע נעילה עצמית", on: "on", off: "off" },
];

export function SecurityCenter({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualIp, setManualIp] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualHours, setManualHours] = useState("24");

  const load = useCallback(async () => {
    const res = await apiCall<Payload>("/api/admin/security/bans");
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    setData(res.data);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (body: Record<string, unknown>, successMessage: string) => {
    setBusy(true);
    const res = await apiCall<Payload>("/api/admin/security/bans", { method: "POST", body });
    setBusy(false);
    if (!res.ok) {
      toast.push(res.error.message, "error");
      return;
    }
    toast.push(successMessage, "success");
    void load();
  };

  if (!data) {
    return (
      <Card className="p-6">
        <Spinner />
      </Card>
    );
  }

  const setting = (key: string) => data.settings[key];
  const enforce = setting("mode") === "enforce";

  return (
    <div className="space-y-5">
      {/* ── מצב המערכת ───────────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold">🛡️ מרכז הבקרה של האבטחה</h2>
          <div className="flex items-center gap-2">
            <Badge tone={enforce ? "success" : "warn"}>{enforce ? "אכיפה פעילה" : "מצב ניטור (לוג בלבד)"}</Badge>
            <span className="text-[11px] text-ink-400">שער האבטחה חוסם לפני שהבקשה מגיעה לאתר</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="חסימות פעילות" value={data.stats.active} tone="danger" />
          <Stat label="נחסמו ב-24 שעות" value={data.stats.blocked24h} tone="warn" />
          <Stat label="חסימות חדשות היום" value={data.stats.last24h} tone="neutral" />
          <Stat label={"סה\"כ חסימות שנצברו"} value={data.stats.total} tone="neutral" />
        </div>

        {canManage && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/8 pt-4">
            <Button
              variant={enforce ? "ghost" : "primary"}
              size="sm"
              disabled={busy}
              onClick={() => act({ action: "set", key: "mode", value: enforce ? "monitor" : "enforce" }, enforce ? "עבר למצב ניטור — רק לוגים" : "האכיפה הופעלה")}
            >
              {enforce ? "עבור למצב ניטור" : "הפעל אכיפה"}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => act({ action: "purge", days: 90 }, "נוקו חסימות ישנות")}>
              נקה חסימות ישנות
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => act({ action: "unban-all" }, "כל החסימות שוחררו")}>
              שחרר את כולן
            </Button>
          </div>
        )}
      </Card>

      {/* ── מדיניות ──────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-bold">⚙️ מדיניות הגנה</h2>
        <div className="grid gap-2.5 md:grid-cols-2">
          {POLICY_SWITCHES.map((item) => {
            const active = setting(item.key) === item.on;
            return (
              <div key={item.key} className="rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-1">
                <Switch
                  label={item.title}
                  description={item.description}
                  checked={active}
                  disabled={!canManage || busy}
                  onChange={(next) => act({ action: "set", key: item.key, value: next ? item.on : item.off }, `${item.title}: ${next ? "הופעל" : "כובה"}`)}
                />
              </div>
            );
          })}

          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
            <span className="block text-[13px] font-bold">מדיניות פרוקסי / VPN / ענן</span>
            <p className="mt-0.5 mb-2 text-[11px] text-ink-400">TOR נחסם תמיד. כאן קובעים מה עושים עם שאר הפרוקסי</p>
            <select
              className="w-full rounded-lg border border-white/12 bg-ink-900 px-2.5 py-1.5 text-xs"
              value={setting("proxy_policy")}
              disabled={!canManage || busy}
              onChange={(e) => act({ action: "set", key: "proxy_policy", value: e.target.value }, "מדיניות הפרוקסי עודכנה")}
            >
              <option value="off">לא לחסום (רק לתעד)</option>
              <option value="score">ניקוד איומים בלבד</option>
              <option value="block-writes">לחסום כתיבה (התחברות/הרשמה/העלאה)</option>
              <option value="block-all">לחסום הכול</option>
            </select>
          </div>

          <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
            <span className="block text-[13px] font-bold">חסימת כלי יירוט (Burp / ZAP)</span>
            <p className="mt-0.5 mb-2 text-[11px] text-ink-400">כותרת Proxy-Connection, חתימות Burp והתחזות דפדפן</p>
            <select
              className="w-full rounded-lg border border-white/12 bg-ink-900 px-2.5 py-1.5 text-xs"
              value={setting("tool_block")}
              disabled={!canManage || busy}
              onChange={(e) => act({ action: "set", key: "tool_block", value: e.target.value }, "מדיניות הכלים עודכנה")}
            >
              <option value="ban">לחסום את ה-IP (ברירת מחדל)</option>
              <option value="block">לחסום את הבקשה בלבד</option>
              <option value="off">לתעד בלבד</option>
            </select>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* ── חסימות פעילות ─────────────────────────────────────────────── */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">⛔ כתובות חסומות</h2>
            <span className="text-[11px] text-ink-400">{data.bans.length} פעילות</span>
          </div>

          {data.bans.length === 0 ? (
            <Alert tone="success">אין חסימות פעילות — המערכת נקייה.</Alert>
          ) : (
            <ul className="space-y-2">
              {data.bans.map((ban) => (
                <li key={ban.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <code dir="ltr" className="rounded-md bg-ink-900 px-2 py-0.5 text-[12.5px] text-red-300">{ban.ip}</code>
                      <Badge tone={ban.severity === "critical" ? "danger" : "warn"}>{CATEGORY_LABELS[ban.category] ?? ban.category}</Badge>
                      {ban.strikes > 1 && <span className="text-[11px] text-amber-300">החמרה ×{ban.strikes}</span>}
                      {ban.permanent ? <Badge tone="danger">קבוע</Badge> : null}
                    </div>
                    {canManage && (
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => act({ action: "unban", ip: ban.ip }, `החסימה של ${ban.ip} שוחררה`)}>
                        שחרר
                      </Button>
                    )}
                  </div>
                  <p className="mt-1.5 text-[12px] text-ink-300">{ban.reason}</p>
                  <p className="mt-1 text-[11px] text-ink-500" dir="ltr">
                    {ban.method ?? "—"} {ban.path ?? ""} · {ban.hits} בקשות נחסמו
                  </p>
                  <p className="text-[11px] text-ink-500">
                    נחסם: {new Date(ban.created_at).toLocaleString("he-IL")}
                    {ban.expires_at ? ` · משוחרר אוטומטית: ${new Date(ban.expires_at).toLocaleString("he-IL")}` : " · ללא תפוגה"}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <div className="mt-4 space-y-2 border-t border-white/8 pt-4">
              <h3 className="text-[13px] font-bold">חסימה ידנית</h3>
              <div className="flex flex-wrap gap-2">
                <Input
                  dir="ltr"
                  placeholder="כתובת IP"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  className="max-w-[190px]"
                />
                <Input
                  placeholder="סיבה (אופציונלי)"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  className="max-w-[240px]"
                />
                <Input
                  type="number"
                  min={1}
                  max={8760}
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  className="max-w-[110px]"
                  aria-label="שעות חסימה"
                />
                <Button
                  size="sm"
                  disabled={busy || !manualIp.trim()}
                  onClick={() => {
                    void act({ action: "ban", ip: manualIp.trim(), reason: manualReason, hours: Number(manualHours) || 24 }, `${manualIp} נחסמה`);
                    setManualIp("");
                    setManualReason("");
                  }}
                >
                  חסום
                </Button>
              </div>
              <p className="text-[11px] text-ink-500">ברירת מחדל: 24 שעות. חסימה חוזרת של אותה כתובת מכפילה את התקופה.</p>
            </div>
          )}
        </Card>

        {/* ── מודיעין ואירועים ───────────────────────────────────────────── */}
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">🔎 מודיעין איומים</h2>
            <ul className="space-y-2 text-[12px]">
              <li className="flex items-center justify-between">
                <span className="text-ink-400">יציאות TOR</span>
                <b>{data.intel.tor.toLocaleString("he-IL")}</b>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-ink-400">טווחי ענן/אירוח</span>
                <b>{data.intel.datacenter.toLocaleString("he-IL")}</b>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-ink-400">כתובות ברשימת חסימה</span>
                <b>{data.intel.blocked.toLocaleString("he-IL")}</b>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-ink-400">עדכון אחרון</span>
                <b>{data.intel.updatedAt ? new Date(data.intel.updatedAt).toLocaleDateString("he-IL") : "רשימות מובנות"}</b>
              </li>
            </ul>
            <p className="mt-3 text-[11px] text-ink-500">
              לרענון הרשימות (דורש אינטרנט בשרת): <code dir="ltr" className="text-lemon-300">node scripts/update-threat-intel.mjs</code>
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">🎯 התוקפנים הבולטים (7 ימים)</h2>
            {data.offenders.length === 0 ? (
              <p className="text-xs text-ink-400">לא זוהו תוקפנים.</p>
            ) : (
              <ul className="space-y-1.5 text-[11.5px]">
                {data.offenders.map((o) => (
                  <li key={o.ip} className="flex items-center justify-between gap-2">
                    <code dir="ltr" className="text-ink-200">{o.ip}</code>
                    <span className="text-ink-400">{CATEGORY_LABELS[o.category] ?? o.category}</span>
                    <b className="text-red-300">{o.hits}</b>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">📋 אירועים אחרונים</h2>
            {data.recentBlocks.length === 0 ? (
              <p className="text-xs text-ink-400">אין אירועים.</p>
            ) : (
              <ul className="max-h-[320px] space-y-1.5 overflow-y-auto pe-1 text-[11px]">
                {data.recentBlocks.map((e, i) => (
                  <li key={`${e.created_at}-${i}`} className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={e.severity === "critical" ? "text-red-300" : "text-amber-300"}>{e.kind}</span>
                      <span className="text-ink-500">{new Date(e.created_at).toLocaleTimeString("he-IL")}</span>
                    </div>
                    {e.ip && <code dir="ltr" className="text-ink-400">{e.ip}</code>}
                    {e.detail && <p className="truncate text-ink-500" dir="auto">{e.detail}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "warn" | "danger" }) {
  const color = tone === "danger" ? "text-red-300" : tone === "warn" ? "text-amber-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
      <span className="block text-[11px] text-ink-400">{label}</span>
      <b className={`text-xl ${color}`}>{value.toLocaleString("he-IL")}</b>
    </div>
  );
}
