import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogBrowser } from "@/components/site/catalog-browser";
import { SkeletonRow } from "@/components/ui/primitives";
import { isCatalogEmpty } from "@/lib/catalog";

export const metadata: Metadata = { title: "סרטים", description: "כל הסרטים בפלטפורמה — חינם ופלוס, בעברית ובאיכות 4K" };
export const dynamic = "force-dynamic";

export default async function MoviesPage({ searchParams }: { searchParams: Promise<{ genre?: string; plan?: string }> }) {
  const params = await searchParams;
  const empty = isCatalogEmpty();
  return (
    <Suspense fallback={<SkeletonRow />}>
      <CatalogBrowser
        kind="movie"
        catalogEmpty={empty}
        title="🎬 סרטים"
        initialGenre={params.genre}
        initialPlan={params.plan === "free" || params.plan === "plus" ? params.plan : undefined}
      />
    </Suspense>
  );
}
