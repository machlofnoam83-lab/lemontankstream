/**
 * סמל האתר — "הפנס בארכיון".
 *
 * במקום אימוג'י לימון (הסימן הכי מזוהה של אתר שנבנה מהר): סמל חרות —
 * קשת אבן, להבה, ושתי קרניים. הוא בנוי כולו בקו ובצבע הנוכחי, ולכן מתאים
 * לכל רקע ולכל גודל, ונשאר חד גם ב-16 פיקסלים בטאב הדפדפן.
 */

export function LogoMark({ className = "size-9", title = "LemonTank Stream" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label={title} fill="none">
      {/* מסגרת מחורצת */}
      <path
        d="M9 2.5h22a4.5 4.5 0 0 1 4.5 4.5v20L29.5 37.5h-19A4.5 4.5 0 0 1 6 33V7a4.5 4.5 0 0 1 3-4.5z"
        fill="url(#lt-plate)"
        stroke="rgb(224 188 120 / 0.75)"
        strokeWidth="1.1"
      />
      {/* קשת */}
      <path d="M14 27.5V17a6 6 0 0 1 12 0v10.5" stroke="rgb(240 217 168 / 0.85)" strokeWidth="1.4" strokeLinecap="round" />
      {/* להבה */}
      <path
        d="M20 12.5c1.9 2.6 3.4 4 3.4 6.2A3.4 3.4 0 0 1 20 22.1a3.4 3.4 0 0 1-3.4-3.4c0-1.4.9-2.3 1.9-3.9.4 1 .8 1.5 1.2 1.9 0-1.5 0-2.7.3-4.2z"
        fill="url(#lt-flame)"
        stroke="rgb(240 217 168 / 0.5)"
        strokeWidth="0.6"
      />
      {/* בסיס */}
      <path d="M12.5 30.5h15M15 33.5h10" stroke="rgb(224 188 120 / 0.6)" strokeWidth="1.2" strokeLinecap="round" />
      <defs>
        <linearGradient id="lt-plate" x1="6" y1="2" x2="34" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#221d17" />
          <stop offset="1" stopColor="#0a0806" />
        </linearGradient>
        <linearGradient id="lt-flame" x1="20" y1="12" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f0d9a8" />
          <stop offset="0.55" stopColor="#c99a4a" />
          <stop offset="1" stopColor="#865e24" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** שם האתר — serif, עם הפרדה דקה בין השתיים */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex flex-col leading-none ${className}`}>
      <span className="font-display text-[1.15rem] font-bold tracking-tight text-parchment-100">
        Lemon<span className="text-brass-300">Tank</span>
      </span>
      <span className="mt-0.5 font-mono text-[0.62rem] uppercase tracking-[0.34em] text-brass-400/80">archive</span>
    </span>
  );
}
