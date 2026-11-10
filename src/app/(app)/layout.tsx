import { BottomNav, MenuDrawer } from "@/components/metro/shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* ناحیه اسکرول محتوا — مثل اپ واقعی: محتوا داخل گوشی اسکرول می‌شود،
          هدر چسبان و نویگیشن پایین ثابت می‌مانند */}
      <div className="app-scroll flex-1 min-h-0 flex flex-col">{children}</div>
      <MenuDrawer />
      <BottomNav />
    </>
  );
}
