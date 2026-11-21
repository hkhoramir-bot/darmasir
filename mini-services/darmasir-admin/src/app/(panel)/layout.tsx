import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { getServerAdmin } from "@/lib/auth";

// لایه اعتبارسنجی کامل صفحات پنل — کوکی باید در دیتابیس معتبر باشد.
// (پروکسی فقط «وجود» کوکی را می‌بیند؛ اینجا صحت‌سنجی واقعی انجام می‌شود)

export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getServerAdmin();
  if (!admin) {
    redirect("/login");
  }

  return <Shell admin={admin}>{children}</Shell>;
}
