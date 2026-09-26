import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogBrowser } from "@/components/site/catalog-browser";
import { SkeletonRow } from "@/components/ui/primitives";
import { isCatalogEmpty } from "@/lib/catalog";

export const metadata: Metadata = { title: "סדרות", description: "כל הסדרות עם פרקים מלאים — חינם ופלוס" };
export const dynamic = "force-dynamic";

export default async function SeriesPage({ searchParams }: { searchParams: Promise<{ genre?: string; plan?: string }> }) {
  const params = await searchParams;
  const empty = isCatalogEmpty();
  return (
    <Suspense fallback={<SkeletonRow />}>
      <CatalogBrowser
        kind="series"
        catalogEmpty={empty}
        title="📺 סדרות"
        initialGenre={params.genre}
        initialPlan={params.plan === "free" || params.plan === "plus" ? params.plan : undefined}
      />
    </Suspense>
  );
}
