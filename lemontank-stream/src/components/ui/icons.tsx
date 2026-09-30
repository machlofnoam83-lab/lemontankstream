/**
 * אייקונים חרוטים — SVG בקו דק, בסגנון תחריט עץ.
 *
 * למה לא אימוג'י: אימוג'י הוא הסימן המזהה החזק ביותר של "אתר שנבנה מהר" —
 * הוא נראה שונה בכל מערכת הפעלה, צבעוני, ולא מתחבר לשפה עיצובית. אלה
 * אייקונים מצוירים בקו אחד (stroke), משתמשים בצבע הטקסט (currentColor),
 * ומתכווננים לגודל דרך font-size — כך שהממשק נראה מגולף ולא מודבק.
 *
 * שימוש:
 *   import { Icon } from "@/components/ui/icons";
 *   <Icon name="play" className="size-5" />
 */

import type { SVGProps } from "react";

type IconName =
  | "play" | "pause" | "plus" | "check" | "close" | "search" | "user" | "bell"
  | "star" | "crown" | "shield" | "key" | "mask" | "flame" | "book" | "film"
  | "reel" | "quill" | "scroll" | "lantern" | "compass" | "moon" | "sun"
  | "eye" | "eye-off" | "download" | "chevron-left" | "chevron-right" | "chevron-down"
  | "menu" | "arrow-left" | "arrow-right" | "clock" | "calendar" | "tag"
  | "list" | "heart" | "users" | "sparkles" | "wand" | "lock" | "unlock"
  | "door" | "skull" | "dragon" | "sword" | "chalice" | "knot" | "feather"
  | "mail" | "copy" | "refresh" | "trash" | "edit" | "chart" | "wifi" | "monitor"
  | "wallet" | "gift" | "info" | "warn" | "shield-check" | "wrench" | "scissors"
  | "anchor" | "hourglass" | "seal";

const PATHS: Record<IconName, React.ReactNode> = {
  play: <path d="M7 4.5v15l12-7.5z" />,
  pause: <><path d="M8 5v14" /><path d="M16 5v14" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  close: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" /></>,
  bell: <><path d="M6 17h12l-1.4-2.2V10a4.6 4.6 0 0 0-9.2 0v4.8z" /><path d="M10 20h4" /></>,
  star: <path d="M12 3.6l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z" />,
  crown: <><path d="M4 8l3.5 3L12 5l4.5 6L20 8l-1.5 10h-13z" /><path d="M5.5 18h13" /></>,
  shield: <><path d="M12 3.5l7 2.6v6c0 4.2-2.9 7.3-7 8.4-4.1-1.1-7-4.2-7-8.4v-6z" /><path d="M12 8v5" /></>,
  "shield-check": <><path d="M12 3.5l7 2.6v6c0 4.2-2.9 7.3-7 8.4-4.1-1.1-7-4.2-7-8.4v-6z" /><path d="M9 12l2 2 4-4.5" /></>,
  key: <><circle cx="8.5" cy="8.5" r="3.5" /><path d="M11 11l8.5 8.5" /><path d="M16 16l2-2" /></>,
  mask: <><path d="M4 7c4-1.6 12-1.6 16 0v5c0 4-3.4 7-8 7s-8-3-8-7z" /><path d="M8.5 11.5h1.5M14 11.5h1.5" /><path d="M10 15.5c1.4.9 2.6.9 4 0" /></>,
  flame: <><path d="M12 3.5c3 4 5.5 6 5.5 9.6A5.5 5.5 0 0 1 12 18.6a5.5 5.5 0 0 1-5.5-5.5c0-2.2 1.4-3.6 3-6.1.6 1.6 1.3 2.4 2 3 0-2.4 0-4.3.5-6.5z" /></>,
  book: <><path d="M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" /><path d="M17 7.5h2v12h-2" /><path d="M8.5 8.5h5M8.5 12h5" /></>,
  film: <><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="M8 5v14M16 5v14M4 9.5h4M4 14.5h4M16 9.5h4M16 14.5h4" /></>,
  reel: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M12 4v4M12 16v4M4 12h4M16 12h4" /></>,
  quill: <><path d="M19 4c-6 1-9.5 4-11 8.5L5.5 19" /><path d="M8 15c3-1 6-3.5 8-7" /></>,
  scroll: <><path d="M6 4h10a2.5 2.5 0 0 1 2.5 2.5v13H8A2.5 2.5 0 0 1 5.5 17z" /><path d="M8.5 8h6M8.5 12h6" /></>,
  lantern: <><path d="M9 3h6" /><path d="M10 3v2h4V3" /><path d="M8 5.5h8l1 11H7z" /><path d="M12 9v5" /><path d="M9.5 20h5" /></>,
  compass: <><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5l-1.8 4.2-4.2 1.8 1.8-4.2z" /></>,
  moon: <path d="M19 14.5A8 8 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" /></>,
  eye: <><path d="M2.8 12S6 6.5 12 6.5 21.2 12 21.2 12 18 17.5 12 17.5 2.8 12 2.8 12z" /><circle cx="12" cy="12" r="3" /></>,
  "eye-off": <><path d="M4 4l16 16" /><path d="M9.5 9.6A3 3 0 0 0 12 15c.9 0 1.7-.4 2.3-1" /><path d="M6.3 7.2C4.2 8.7 2.8 12 2.8 12s3.2 5.5 9.2 5.5c1.6 0 3-.4 4.2-1" /><path d="M9.9 6.8A7.6 7.6 0 0 1 12 6.5c6 0 9.2 5.5 9.2 5.5a17 17 0 0 1-3.1 3.5" /></>,
  download: <><path d="M12 4v11" /><path d="M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19h14" /></>,
  "chevron-left": <path d="M14 6l-6 6 6 6" />,
  "chevron-right": <path d="M10 6l6 6-6 6" />,
  "chevron-down": <path d="M6 10l6 6 6-6" />,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  "arrow-left": <><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></>,
  "arrow-right": <><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3.5 2" /></>,
  calendar: <><rect x="4" y="6" width="16" height="14" rx="1.5" /><path d="M4 10h16M9 4v4M15 4v4" /></>,
  tag: <><path d="M4 11l7-7h8v8l-7 7z" /><circle cx="15.5" cy="8.5" r="1.2" /></>,
  list: <><path d="M5 7h14M5 12h14M5 17h14" /></>,
  heart: <path d="M12 19s-6.5-4.2-6.5-8.3A3.7 3.7 0 0 1 12 8.4a3.7 3.7 0 0 1 6.5 2.3C18.5 14.8 12 19 12 19z" />,
  users: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.9-3.2 3-4.8 5.5-4.8s4.6 1.6 5.5 4.8" /><path d="M15.5 6.5a3 3 0 0 1 0 5.6" /><path d="M17 14.5c2 .6 3.3 2.1 3.9 4.5" /></>,
  sparkles: <><path d="M12 4l1.4 3.6L17 9l-3.6 1.4L12 14l-1.4-3.6L7 9l3.6-1.4z" /><path d="M17.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>,
  wand: <><path d="M5 19L16 8" /><path d="M14.5 5.5l1.2 1.2M18 8l1.2 1.2M16.5 3.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" /></>,
  lock: <><rect x="5.5" y="10" width="13" height="9.5" rx="1.5" /><path d="M8.5 10V8a3.5 3.5 0 0 1 7 0v2" /><path d="M12 13.5v3" /></>,
  unlock: <><rect x="5.5" y="10" width="13" height="9.5" rx="1.5" /><path d="M8.5 10V8a3.5 3.5 0 0 1 6.6-1.6" /><path d="M12 13.5v3" /></>,
  door: <><path d="M6 20V4.5h9a2 2 0 0 1 2 2V20" /><path d="M4.5 20h15" /><circle cx="13.5" cy="12.5" r="0.9" /></>,
  skull: <><path d="M12 3.5c4.4 0 7 2.9 7 6.8 0 2.3-1 3.9-2.2 5v2.2H7.2v-2.2C6 14.2 5 12.6 5 10.3c0-3.9 2.6-6.8 7-6.8z" /><circle cx="9.5" cy="10.5" r="1.3" /><circle cx="14.5" cy="10.5" r="1.3" /><path d="M10.5 20.5v-2M13.5 20.5v-2" /></>,
  dragon: <><path d="M4 16c3-1 4.5-3 5-6 1 2 3 3.5 7 3.5 2.5 0 4 -1 4-2.5 0-2-2-3-4-3" /><path d="M9 10.5c-1-2-3-2.5-4.5-2 1 1 1.5 2.5 1.5 4" /><path d="M16 13.5l1.5 5.5" /><circle cx="16.5" cy="7.5" r="0.8" /></>,
  sword: <><path d="M18.5 4.5L9 14l1 1 9.5-9.5z" /><path d="M8 15l1 1-3 3-1-1z" /><path d="M6 12.5l5.5 5.5" /><path d="M19 3l1.5 1.5" /></>,
  chalice: <><path d="M7 4.5h10l-1 5a4 4 0 0 1-8 0z" /><path d="M12 13.5V19" /><path d="M8.5 19.5h7" /></>,
  knot: <><circle cx="12" cy="8" r="3.4" /><path d="M9 10.5L6 20M15 10.5l3 9.5" /><path d="M12 11.4v8" /></>,
  feather: <><path d="M18 5c-5 .5-8 3-9.5 7L6.5 18" /><path d="M8.5 15h6" /><path d="M10 11h5" /></>,
  mail: <><rect x="3.5" y="6" width="17" height="12" rx="1.5" /><path d="M4 7.5l8 5.5 8-5.5" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M15 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v8.5A1.5 1.5 0 0 0 5 15h1.5" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v4h-4" /></>,
  trash: <><path d="M5 7h14" /><path d="M9.5 7V5h5v2" /><path d="M6.5 7l1 12.5h9L17.5 7" /><path d="M10.5 11v5M13.5 11v5" /></>,
  edit: <><path d="M4 20l1-4.5L15.5 5a2 2 0 0 1 3 3L8 18.5z" /><path d="M13.5 7l3 3" /></>,
  chart: <><path d="M4 19h16" /><path d="M7 19V9M12 19V5M17 19v-7" /></>,
  wifi: <><path d="M4.5 10.5a11 11 0 0 1 15 0" /><path d="M7.5 13.8a7 7 0 0 1 9 0" /><path d="M10.3 17a3.2 3.2 0 0 1 3.4 0" /><circle cx="12" cy="19.6" r="0.8" /></>,
  monitor: <><rect x="3.5" y="5" width="17" height="11.5" rx="1.5" /><path d="M9 20h6M12 16.5V20" /></>,
  wallet: <><rect x="4" y="7" width="16" height="11.5" rx="1.5" /><path d="M4 10.5h16" /><circle cx="16" cy="14" r="1.1" /></>,
  gift: <><rect x="4" y="9" width="16" height="10.5" rx="1" /><path d="M4 13h16M12 9v10.5" /><path d="M12 9c-2.5 0-4-1-4-2.6C8 5.2 9 4.5 10 4.8c1.4.4 2 2 2 4.2zM12 9c2.5 0 4-1 4-2.6 0-1.2-1-1.9-2-1.6-1.4.4-2 2-2 4.2z" /></>,
  info: <><circle cx="12" cy="12" r="8" /><path d="M12 11v5" /><circle cx="12" cy="8.4" r="0.9" /></>,
  warn: <><path d="M12 4.5l8 14H4z" /><path d="M12 10v4.5" /><circle cx="12" cy="16.6" r="0.9" /></>,
  wrench: <><path d="M15.5 4.5a4.5 4.5 0 0 0-4 6.6L4.8 17.8a1.7 1.7 0 0 0 2.4 2.4l6.7-6.7a4.5 4.5 0 0 0 6.6-4.9l-2.6 2.6-2.4-.6-.6-2.4z" /></>,
  scissors: <><circle cx="6.5" cy="6.5" r="2.3" /><circle cx="6.5" cy="17.5" r="2.3" /><path d="M8.6 7.7L19 17M19 7L8.6 16.3" /></>,
  anchor: <><path d="M12 5.5v13" /><circle cx="12" cy="4.2" r="1.6" /><path d="M6 11h12" /><path d="M5 14.5c1.4 3 3.9 4.6 7 4.6s5.6-1.6 7-4.6" /></>,
  hourglass: <><path d="M7 3.5h10" /><path d="M7 20.5h10" /><path d="M8 3.5c0 4 4 5 4 8.5 0-3.5 4-4.5 4-8.5" /><path d="M8 20.5c0-4 4-5 4-8.5 0 3.5 4 4.5 4 8.5" /></>,
  seal: <><circle cx="12" cy="9" r="5" /><path d="M9 13.5L7.5 20.5l4.5-2.2 4.5 2.2L15 13.5" /></>,
};

export function Icon({
  name,
  className = "size-5",
  strokeWidth = 1.5,
  ...rest
}: { name: IconName; className?: string; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

export type { IconName };
