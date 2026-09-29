"use client";

import { useEffect } from "react";

/**
 * שגיאה שלא נתפסה בשכבת הפריסה בכלל (כולל ה-html/body).
 * זו הרשת הביטחונית האחרונה של ה-UI: עמוד עצמאי, בלי תלות בשום קומפוננטה
 * שעלולה להיות חלק מהתקלה. סגנונות inline בלבד, כדי שלא יהיה תלוי ב-CSS
 * שאולי לא נטען.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[lemontank] fatal", error.digest ?? "", error.message);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background:
            "radial-gradient(80% 60% at 50% 0%, rgba(201,154,74,0.14), transparent 66%), #0a0806",
          color: "#efe4cd",
          fontFamily: "Georgia, 'Times New Roman', serif",
          padding: "2rem 1rem",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "32rem",
            textAlign: "center",
            border: "1px solid rgba(201,154,74,0.28)",
            background: "#12100c",
            padding: "2.5rem 1.75rem",
            clipPath:
              "polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.72rem",
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: "rgba(224,188,120,0.8)",
            }}
          >
            תקלה חמורה
          </p>
          <h1 style={{ margin: "0.5rem 0 0.5rem", fontSize: "1.6rem", fontWeight: 700 }}>
            הארכיון נסגר לרגע
          </h1>
          <p style={{ margin: 0, color: "rgba(214,200,174,0.85)", lineHeight: 1.7 }}>
            משהו נשבר בשלד של העמוד עצמו. הנתונים שמורים לא נפגעו.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              cursor: "pointer",
              border: "1px solid rgba(224,188,120,0.5)",
              background: "#c99a4a",
              color: "#0a0806",
              fontFamily: "inherit",
              fontWeight: 700,
              fontSize: "0.95rem",
              padding: "0.7rem 1.4rem",
              clipPath:
                "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)",
            }}
          >
            לפתוח מחדש
          </button>
        </div>
      </body>
    </html>
  );
}
