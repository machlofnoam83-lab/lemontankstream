import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogBrowser } from "@/components/site/catalog-browser";

export const metadata: Metadata = { title: "חדש בפלטפורמה", description: "הסרטים והסדרות שנוספו לאחרונה" };
export const dynamic = "force-dynamic";

export default function NewPage() {
  return (
    <Suspense>
      <CatalogBrowser title="🆕 חדש בפלטפורמה" defaultSort="added" />
    </Suspense>
  );
}
