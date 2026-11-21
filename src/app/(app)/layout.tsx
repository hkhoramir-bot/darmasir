import { BottomNav, MenuDrawer } from "@/components/metro/shell";
import { AuthGate } from "@/components/metro/auth/auth-gate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    /* دروازه حساب — تا کاربر وارد نشود، اپ نمایش داده نمی‌شود */
    <AuthGate>
      {children}
      <MenuDrawer />
      <BottomNav />
    </AuthGate>
  );
}
