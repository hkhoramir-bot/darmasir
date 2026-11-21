// نسخه سبک hashPassword برای استفاده در اسکریپت‌های bun خارج از Next
// (seed نباید وابسته به ماژول‌های سرور Next باشد)

import bcrypt from "bcryptjs";

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}
