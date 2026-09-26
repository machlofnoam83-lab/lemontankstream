import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogBrowser } from "@/components/site/catalog-browser";
import { isCatalogEmpty } from "@/lib/catalog";
import { SearchBox } from "@/components/site/search-box";
import { sanitizeText } from "@/lib/validate";

export const metadata: Metadata = { title: "חיפוש", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const q = sanitizeText(params.q ?? "", 80);

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-xl">
        <SearchBox autoFocus />
      </div>
      <Suspense>
        <CatalogBrowser title={q ? `תוצאות עבור "${q}"` : "חיפוש בקטלוג"} catalogEmpty={isCatalogEmpty()} />
      </Suspense>
    </div>
  );
}
