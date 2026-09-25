import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CatalogBrowser } from "@/components/site/catalog-browser";
import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const genre = get<{ name_he: string }>("SELECT name_he FROM genres WHERE slug = ?", [slug]);
  return { title: genre ? `${genre.name_he} — סרטים וסדרות` : "ז'אנר" };
}

export default async function GenrePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const genre = get<{ id: number; name_he: string; icon: string | null }>("SELECT id, name_he, icon FROM genres WHERE slug = ?", [slug]);
  if (!genre) notFound();

  return (
    <Suspense>
      <CatalogBrowser title={`${genre.icon ?? "🎬"} ${genre.name_he}`} initialGenre={slug} />
    </Suspense>
  );
}
