"use client";

// صفحه ورود — هرگز بر اساس وجود کوکی ریدایرکت نمی‌شود (شکستن حلقه سفید)
// توکن موفقیت در body هم برمی‌گردد چون برخی محیط‌ها (تونل پیش‌نمایش)
// هدر Set-Cookie را می‌اندازند؛ اینجا با document.cookie هم نوشته می‌شود.

import { useState } from "react";
import { TrainFront, Loader2, User, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch, storeToken } from "@/lib/client";
import { gw } from "@/lib/path";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{
        token: string;
        admin: { username: string; name: string; role: string };
      }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });

      // نوشتن توکن در localStorage (حالت ابری) و کوکی (fallback برای
      // محیط‌هایی که Set-Cookie سرور را دور می‌ریزند)
      storeToken(data.token);
      document.cookie = `darmasir_admin_session=${data.token}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;

      toast.success(`خوش آمدید، ${data.admin.name}`);
      window.location.href = gw("/");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "ورود ناموفق بود. دوباره تلاش کنید.";
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <TrainFront className="size-7" />
          </div>
          <CardTitle className="text-lg">پنل مدیریت درمسیر</CardTitle>
          <CardDescription>برای ادامه وارد حساب خود شوید</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">نام کاربری</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  dir="ltr"
                  className="pl-9 text-left"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">گذرواژه</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  dir="ltr"
                  className="pl-9 text-left"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="mt-1">
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  در حال ورود...
                </>
              ) : (
                "ورود"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
