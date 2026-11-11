"use client";

import { useEffect } from "react";
import { installNativeApiBridge } from "@/lib/native-api";

/** پل API محلی — فقط در WebView اندروید فعال می‌شود */
export function NativeApiBridge() {
  useEffect(() => {
    installNativeApiBridge();
  }, []);
  return null;
}
