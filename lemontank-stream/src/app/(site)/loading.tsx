import { ShelfLoading } from "@/components/ui/states";

/**
 * מסך הטעינה של האתר — מוצג מיד בניווט בין עמודים, לפני שהנתונים חוזרים.
 * במקום מסך לבן: מדפים שמצטיירים, ונר שממתין בקצה.
 */
export default function SiteLoading() {
  return (
    <div className="pt-2">
      <ShelfLoading rows={2} perRow={7} />
    </div>
  );
}
