import Client from "./client";
import { LINES } from "@/lib/metro-data";

/** خروجی استاتیک برای همه خطوط (ساخت APK) */
export function generateStaticParams() {
  return LINES.map((l) => ({ id: l.id }));
}

export const dynamicParams = false;

export default function LinePage() {
  return <Client />;
}
