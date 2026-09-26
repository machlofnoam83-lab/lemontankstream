"use client";

import { useEffect, useState } from "react";
import { apiCall } from "@/lib/client/api";
import { useToast } from "@/components/ui/toast";
import { Button, EmptyState, Textarea } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/format";

type Comment = {
  id: number;
  body: string;
  created_at: string;
  likes: number;
  parent_id: number | null;
  user_name: string;
  user_plan: string;
  avatar_url: string | null;
};

type Review = {
  id: number;
  headline: string | null;
  body: string;
  stars: number | null;
  has_spoilers: number;
  likes: number;
  created_at: string;
  user_name: string;
  user_plan: string;
};

/** אזור תגובות לכותר/פרק */
export function CommentsSection({ titleId, episodeId, enabled = true }: { titleId?: number; episodeId?: number; enabled?: boolean }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const toast = useToast();

  const load = async () => {
    const qs = episodeId ? `episode_id=${episodeId}` : `title_id=${titleId}`;
    const res = await apiCall<{ items: Comment[] }>(`/api/comments?${qs}`);
    if (res.ok) setItems(res.data.items);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleId, episodeId]);

  const send = async () => {
    if (body.trim().length < 1) return;
    setSending(true);
    const res = await apiCall("/api/comments", { method: "POST", body: { title_id: titleId ?? null, episode_id: episodeId ?? null, body } });
    setSending(false);
    if (!res.ok) {
      toast.push(res.error.code === "UNAUTHORIZED" ? "צריך להתחבר כדי להגיב" : res.error.message, "error");
      return;
    }
    setBody("");
    toast.push("התגובה פורסמה ✓", "success");
    void load();
  };

  if (!enabled) return null;

  return (
    <section aria-labelledby="comments-heading" className="space-y-4">
      <h2 id="comments-heading" className="text-lg font-extrabold">💬 תגובות ({items.length})</h2>

      <div className="space-y-2">
        <label htmlFor="comment-body" className="sr-only">כתוב תגובה</label>
        <Textarea
          id="comment-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="מה דעתך? שמור על שיח מכבד (בלי ספוילרים בלי אזהרה)"
          maxLength={1500}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-500">{body.length}/1500</span>
          <Button onClick={send} loading={sending} disabled={body.trim().length === 0}>
            פרסם תגובה
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-400">טוען תגובות…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-400">עוד אין תגובות — תהיה הראשון להגיב!</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lemon-400 font-bold text-ink-900">
                  {c.user_name.charAt(0)}
                </span>
                <span className="text-sm font-bold">{c.user_name}</span>
                {c.user_plan === "plus" ? <span className="badge-plus">פלוס</span> : null}
                <span className="ms-auto text-[0.85rem] text-ink-400">{formatRelative(c.created_at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-200">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** אזור ביקורות עם דירוג כוכבים */
export function ReviewsSection({ titleId, canReview }: { titleId: number; canReview: boolean }) {
  const [items, setItems] = useState<Review[]>([]);
  const [body, setBody] = useState("");
  const [stars, setStars] = useState<number | null>(null);
  const [hasSpoilers, setSpoilers] = useState(false);
  const [sending, setSending] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const toast = useToast();

  const load = async () => {
    const res = await apiCall<{ items: Review[] }>(`/api/reviews?title_id=${titleId}`);
    if (res.ok) setItems(res.data.items);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleId]);

  const send = async () => {
    if (body.trim().length < 10) {
      toast.push("ביקורת צריכה להיות לפחות 10 תווים", "error");
      return;
    }
    setSending(true);
    const res = await apiCall("/api/reviews", { method: "POST", body: { title_id: titleId, body, stars, has_spoilers: hasSpoilers } });
    setSending(false);
    if (!res.ok) {
      toast.push(res.error.code === "UNAUTHORIZED" ? "צריך להתחבר כדי לכתוב ביקורת" : res.error.message, "error");
      return;
    }
    setBody("");
    setStars(null);
    setSpoilers(false);
    toast.push("הביקורת נשלחה — תודה! 🎉", "success");
    void load();
  };

  return (
    <section aria-labelledby="reviews-heading" className="space-y-4">
      <h2 id="reviews-heading" className="text-lg font-extrabold">⭐ ביקורות ({items.length})</h2>

      {canReview ? (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="כתוב ביקורת מפורטת… מה אהבת ומה פחות?" maxLength={4000} />
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1" role="radiogroup" aria-label="דירוג">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={stars === n}
                  aria-label={`${n} מתוך 10`}
                  onClick={() => setStars(n)}
                  className={`text-lg ${n <= (stars ?? 0) ? "text-lemon-400" : "text-ink-600 hover:text-lemon-600"}`}
                >
                  ★
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-300">
              <input type="checkbox" checked={hasSpoilers} onChange={(e) => setSpoilers(e.target.checked)} className="accent-lemon-400" />
              יש ספוילרים
            </label>
            <Button className="ms-auto" onClick={send} loading={sending}>פרסם ביקורת</Button>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title="עוד אין ביקורות" description="היה הראשון לכתוב ביקורת על הכותר הזה." icon="✍️" />
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{r.user_name}</span>
                {r.user_plan === "plus" ? <span className="badge-plus">פלוס</span> : null}
                {r.stars ? <span className="text-xs text-lemon-300">★ {r.stars}/10</span> : null}
                <span className="ms-auto text-[0.85rem] text-ink-400">{formatRelative(r.created_at)}</span>
              </div>
              {r.headline ? <h3 className="mt-2 font-bold">{r.headline}</h3> : null}
              {r.has_spoilers && !revealed[r.id] ? (
                <button onClick={() => setRevealed((prev) => ({ ...prev, [r.id]: true }))} className="mt-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-300">
                  ⚠️ הביקורת מכילה ספוילרים — לחץ להצגה
                </button>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-200">{r.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
