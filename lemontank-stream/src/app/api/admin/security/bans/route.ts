import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { withApi } from "@/server/api";
import { jsonOk, ApiError } from "@/lib/http";
import { all, count } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  banIp, unbanIp, unbanAll, purgeBans, banStats, listActiveBans, listBanHistory,
  securitySettings, setSecuritySetting, DEFAULT_SECURITY_SETTINGS,
} from "@/lib/security/bans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ערכי הגדרה מותרים — מונע הזרקת ערכים שרירותיים מהפאנל */
const SETTING_RULES: Record<string, RegExp> = {
  mode: /^(enforce|monitor)$/,
  autoban: /^(on|off)$/,
  honeypot: /^(ban|block|off)$/,
  honeypot_paths: /^(on|off)$/,
  tool_block: /^(ban|block|off)$/,
  proxy_policy: /^(off|score|block-writes|block-all)$/,
  datacenter_ban: /^(on|off)$/,
  tor_ban: /^(on|off)$/,
  empty_ua: /^(score|block)$/,
  internal_bypass: /^(on|off)$/,
  staff_bypass: /^(on|off)$/,
  flood_ban: /^(on|off)$/,
  ip_mode: /^(full|hash)$/,
  rate_per_minute: /^\d{0,6}$/,
  retention_days: /^\d{1,4}$/,
};

/** מצב מודיעין האיומים (TOR/ענן) — נקרא מהקובץ שהסקריפט מעדכן */
function intelStatus() {
  const file = path.join(process.cwd(), "data", "threat-intel.json");
  try {
    if (!fs.existsSync(file)) return { present: false, updatedAt: null, tor: 0, datacenter: 0, blocked: 0, file: "data/threat-intel.json" };
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const size = (v: unknown) => (Array.isArray(v) ? v.length : 0);
    return {
      present: true,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
      source: typeof raw.source === "string" ? raw.source : "manual",
      tor: size(raw.tor),
      datacenter: size(raw.datacenter),
      blocked: size(raw.blocked),
      file: "data/threat-intel.json",
    };
  } catch {
    return { present: false, updatedAt: null, tor: 0, datacenter: 0, blocked: 0, file: "data/threat-intel.json" };
  }
}

/** מרכז הבקרה של האבטחה: חסימות, מדיניות, מודיעין ומצב */
export async function GET(req: NextRequest) {
  return withApi(req, { auth: "required", permission: "security.read" }, async (ctx) => {
    const active = listActiveBans(80);
    const history = listBanHistory(25);
    const stats = banStats();

    const blocked24h = count(
      "SELECT COUNT(*) c FROM security_events WHERE created_at > datetime('now','-1 day') AND (kind LIKE 'attack_%' OR kind LIKE 'honeypot%' OR kind LIKE 'proxy%' OR kind LIKE 'banned%' OR kind LIKE 'scanner%' OR kind LIKE 'payload_%' OR kind LIKE 'rate_limited%' OR kind LIKE 'system_path%' OR kind LIKE 'forbidden_%')",
    );

    const offenders = all<{ ip: string; category: string; hits: number; last_seen: string }>(
      `SELECT ip, MAX(category) category, COUNT(*) hits, MAX(created_at) last_seen
         FROM ip_bans WHERE created_at > datetime('now','-7 day')
        GROUP BY ip ORDER BY hits DESC, last_seen DESC LIMIT 12`,
    );

    const recentBlocks = all<{ kind: string; severity: string; ip: string | null; detail: string | null; created_at: string }>(
      `SELECT kind, severity, ip, detail, created_at FROM security_events
        WHERE created_at > datetime('now','-2 day')
        ORDER BY id DESC LIMIT 40`,
    );

    const byCategory = all<{ category: string; c: number }>(
      `SELECT category, COUNT(*) c FROM ip_bans WHERE created_at > datetime('now','-7 day') GROUP BY category ORDER BY c DESC LIMIT 8`,
    );

    return jsonOk(
      {
        stats: { ...stats, blocked24h, byCategory },
        bans: active,
        history,
        offenders,
        recentBlocks,
        settings: securitySettings(),
        defaults: DEFAULT_SECURITY_SETTINGS,
        intel: intelStatus(),
        gateway: {
          active: true,
          note: "כל התעבורה עוברת דרך שער האבטחה (server.mjs) לפני Next.js",
        },
      },
      undefined,
      req,
    );
  });
}

/** פעולות: חסימה ידנית, שחרור, שינוי מדיניות, ניקוי */
export async function POST(req: NextRequest) {
  return withApi(
    req,
    { auth: "required", permission: "security.manage", rateLimit: "write", csrf: true },
    async (ctx) => {
      const body = await ctx.body<{
        action?: string;
        ip?: string;
        reason?: string;
        hours?: number;
        permanent?: boolean;
        key?: string;
        value?: string;
        days?: number;
      }>();
      const action = String(body.action ?? "");
      const actor = ctx.user!;

      const requireIp = (): string => {
        const ip = String(body.ip ?? "").trim();
        if (!/^[0-9a-fA-F:.]{3,45}$/.test(ip)) throw new ApiError("BAD_REQUEST", 400, undefined, "כתובת IP אינה תקינה");
        return ip;
      };

      switch (action) {
        case "ban": {
          const ip = requireIp();
          const hours = Math.min(Math.max(Number(body.hours ?? 24), 1), 24 * 365);
          const result = banIp({
            ip,
            category: "manual",
            reason: String(body.reason ?? "חסימה ידנית ע\"י מנהל").slice(0, 300),
            severity: "critical",
            auto: false,
            permanent: Boolean(body.permanent),
            ttlSec: body.permanent ? null : hours * 3600,
            action: `manual:${actor.email}`,
          });
          writeAudit(
            { action: "security.ban", entity: "ip_ban", entityId: ip, severity: "critical", after: { ip, hours, permanent: Boolean(body.permanent) } },
            { req, actorId: actor.id, actorEmail: actor.email },
          );
          return jsonOk({ banned: result }, undefined, req);
        }

        case "unban": {
          const ip = requireIp();
          const lifted = unbanIp(ip, actor.email);
          writeAudit(
            { action: "security.unban", entity: "ip_ban", entityId: ip, severity: "warning", after: { ip, lifted } },
            { req, actorId: actor.id, actorEmail: actor.email },
          );
          return jsonOk({ lifted }, undefined, req);
        }

        case "unban-all": {
          const lifted = unbanAll(actor.email);
          writeAudit(
            { action: "security.unban", entity: "ip_ban", entityId: "all", severity: "warning", after: { lifted } },
            { req, actorId: actor.id, actorEmail: actor.email },
          );
          return jsonOk({ lifted }, undefined, req);
        }

        case "set": {
          const key = String(body.key ?? "");
          const value = String(body.value ?? "");
          const rule = SETTING_RULES[key];
          if (!rule) throw new ApiError("BAD_REQUEST", 400, undefined, "מפתח הגדרה לא מוכר");
          if (!rule.test(value)) throw new ApiError("BAD_REQUEST", 400, undefined, "ערך לא חוקי להגדרה זו");
          setSecuritySetting(key, value);
          writeAudit(
            { action: "security.settings_update", entity: "security_settings", entityId: key, severity: "warning", after: { key, value } },
            { req, actorId: actor.id, actorEmail: actor.email },
          );
          return jsonOk({ settings: securitySettings() }, undefined, req);
        }

        case "purge": {
          const days = Math.min(Math.max(Number(body.days ?? 90), 1), 3650);
          const removed = purgeBans(days);
          return jsonOk({ removed }, undefined, req);
        }

        default:
          throw new ApiError("BAD_REQUEST", 400, undefined, "פעולה לא מוכרת");
      }
    },
  );
}
