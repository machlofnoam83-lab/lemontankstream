import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Player } from "@/components/site/player";
import { Card } from "@/components/ui/primitives";
import { PartyJoinCard } from "@/components/site/party-widgets";
import { buildPlayback } from "@/server/playback";
import { getCurrentUser } from "@/lib/session";
import { isMember, partyPreview, partySnapshot } from "@/lib/party";

export const metadata: Metadata = { title: "צפייה משותפת", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * חדר צפייה משותפת.
 *
 * מי שעוד לא חבר רואה מסך הצטרפות עם פרטים מינימליים בלבד — קוד חדר לא
 * הופך לדרך לעקוף את בדיקות ההרשאה של הנגן (התוכן נטען רק אחרי הצטרפות).
 */
export default async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = id.toUpperCase();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/party/${code}`)}`);

  const preview = partyPreview(code);
  if (!preview) notFound();

  if (!isMember(code, user.id)) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-4">
        <Card className="p-6 text-center">
          <div className="text-5xl" aria-hidden="true">🎉</div>
          <h1 className="mt-3 text-2xl font-black">{preview.host_name} מזמין אותך לצפייה משותפת</h1>
          <p className="mt-2 text-ink-300">
            יחד צופים ב<b> {preview.title_name}</b>
            {preview.episode_label ? ` · ${preview.episode_label}` : ""} · {preview.members} בחדר
          </p>
          <div className="mt-5 flex flex-col items-center gap-3">
            <PartyJoinCard partyId={code} />
            <Link href="/" className="text-[0.9rem] text-ink-400 hover:text-ink-200">
              לא עכשיו, חזרה לדף הבית
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const party = partySnapshot(code, user.id);
  const playback = buildPlayback({
    slug: party.title_slug,
    episodeId: party.episode_id,
    user,
    profileId: null,
  });
  if (!playback) notFound();

  const isHost = party.host_id === user.id;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">
            🎉 {party.title_name}
            {party.episode_label ? <span className="text-ink-400"> · {party.episode_label}</span> : null}
          </h1>
          <p className="text-[0.9rem] text-ink-400">
            {isHost ? "אתה המארח — כל שאר המשתתפים מסונכרנים איתך" : `${party.host_name} מוביל את הצפייה`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[0.9rem]">
          <span className="rounded-xl bg-white/[0.07] px-3 py-2">
            קוד הצטרפות: <b className="font-mono text-lemon-300" dir="ltr">{party.id}</b>
          </span>
          <Link href={`/title/${party.title_slug}`} className="rounded-xl bg-white/[0.07] px-3 py-2 hover:bg-white/[0.12]">
            פרטי הכותר
          </Link>
        </div>
      </div>

      <Player
        titleId={playback.title.id}
        titleName={playback.title.name_he}
        slug={playback.title.slug}
        episodeId={playback.episode?.id ?? null}
        sources={playback.sources}
        subtitles={playback.subtitles}
        poster={playback.title.backdrop_url ?? playback.title.poster_url}
        startAtSec={Math.floor(party.position_sec)}
        locked={playback.locked}
        lockReason={playback.lockReason}
        introStart={playback.episode?.intro_start_sec ?? null}
        introEnd={playback.episode?.intro_end_sec ?? null}
        creditsStart={playback.episode?.credits_start_sec ?? null}
        episodes={playback.episodes}
        nextEpisode={playback.nextEpisode}
        isPlus={user.effective_plan === "plus"}
        partyId={party.id}
        partyHost={isHost}
        partyCode={party.id}
      />

      <Card className="p-4">
        <h2 className="text-lg font-bold">בחדר ({party.members.length})</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {party.members.map((member) => (
            <li
              key={member.user_id}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[0.9rem] ${
                member.user_id === party.host_id ? "bg-lemon-400/15 text-lemon-200" : "bg-white/[0.07]"
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[0.75rem] font-black">
                {member.name.charAt(0)}
              </span>
              {member.name}
              {member.user_id === party.host_id && <span className="text-[0.75rem]">מארח</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.85rem] text-ink-400">
          כדי להזמין חברים — שלח להם את הקישור <span className="font-mono text-ink-300" dir="ltr">/party/{party.id}</span>.
          כל אחד צריך להיות מחובר לחשבון משלו.
        </p>
      </Card>
    </div>
  );
}
