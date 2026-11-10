import { BottomNav, MenuDrawer } from "@/components/metro/shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MenuDrawer />
      <BottomNav />
    </>
  );
}
