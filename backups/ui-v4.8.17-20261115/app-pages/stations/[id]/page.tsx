import Client from "./client";
import { STATIONS } from "@/lib/metro-data";

/** خروجی استاتیک برای همه ایستگاه‌ها (ساخت APK) */
export function generateStaticParams() {
  return STATIONS.map((s) => ({ id: s.id }));
}

export const dynamicParams = false;

export default function StationPage() {
  return <Client />;
}
