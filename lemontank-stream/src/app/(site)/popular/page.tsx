import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogBrowser } from "@/components/site/catalog-browser";
import { isCatalogEmpty } from "@/lib/catalog";

export const metadata: Metadata = { title: "הנצפים ביותר", description: "מה שכולם צופים בו עכשיו" };
export const dynamic = "force-dynamic";

export default function PopularPage() {
  return (
    <Suspense>
      <CatalogBrowser title="🔥 הנצפים ביותר" defaultSort="popular" catalogEmpty={isCatalogEmpty()} />
    </Suspense>
  );
}
