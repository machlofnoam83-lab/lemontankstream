import { Card } from "@/components/ui/primitives";

const GROUPS: Array<{ title: string; icon: string; keys: string[] }> = [
  { title: "צפייה", icon: "▶️", keys: ["watch_history", "continue_watching", "autoplay_next", "skip_intro", "skip_recap", "next_episode_overlay", "quality_selector", "speed_control", "pip", "chromecast", "sleep_timer", "subtitle_styling", "keyboard_shortcuts"] },
  { title: "תוכן וגילוי", icon: "🔎", keys: ["hebrew_search", "voice_search", "top10", "collections", "collections_auto", "ai_recommendations", "trailers", "trailer_autoplay", "promos", "live_tv"] },
  { title: "קהילה", icon: "💬", keys: ["comments", "reviews", "notifications", "badges", "coins", "referrals", "referrals_rewards", "watch_party"] },
  { title: "מנוי ורווחים", icon: "💎", keys: ["downloads", "offline_sync", "coupons", "ads_on_free", "multi_language_ui", "csv_import", "tmdb_sync", "api_access", "webhooks"] },
  { title: "אבטחה ופרטיות", icon: "🛡️", keys: ["two_factor_auth", "audit_log", "rate_limiting", "csp_nonce", "session_rotation", "device_management", "security_dashboard", "backup_export", "export_user_data", "delete_account", "email_verification", "password_reset_email"] },
  { title: "משפחה ונגישות", icon: "👨‍👩‍👧", keys: ["kids_mode", "parental_pin", "accessibility", "rtl_full", "dark_theme", "light_theme", "mobile_pwa"] },
  { title: "אנליטיקה ותפעול", icon: "📊", keys: ["analytics_dashboard", "clickhouse_style_reports"] },
];

/** תצוגת "מפת פיצ'רים" לפי תחומים — עוזרת לראות מה דלוק בכל תחום מוצר */
export function CardsShowcase({ flags }: { flags: Array<{ key: string; enabled: boolean; description: string }> }) {
  const map = new Map(flags.map((f) => [f.key, f]));

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {GROUPS.map((group) => {
        const items = group.keys.map((k) => map.get(k)).filter(Boolean) as Array<{ key: string; enabled: boolean; description: string }>;
        const on = items.filter((i) => i.enabled).length;
        return (
          <Card key={group.title} className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <span aria-hidden="true">{group.icon}</span>
                {group.title}
              </h2>
              <span className="text-[11px] text-ink-400">{on}/{items.length} פעילים</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {items.map((item) => (
                <li key={item.key} className="flex items-start gap-2 text-[11px]">
                  <span className={item.enabled ? "text-emerald-400" : "text-ink-600"} aria-hidden="true">{item.enabled ? "●" : "○"}</span>
                  <span className={item.enabled ? "text-ink-200" : "text-ink-500"} title={item.key}>{item.description}</span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
