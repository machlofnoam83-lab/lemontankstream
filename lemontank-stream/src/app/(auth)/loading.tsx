import { PageLoading } from "@/components/ui/states";

/** טעינה במסכי הכניסה — הדלת נפתחת */
export default function AuthLoading() {
  return (
    <div className="w-full">
      <PageLoading label="מסובבים את המפתח" />
    </div>
  );
}
