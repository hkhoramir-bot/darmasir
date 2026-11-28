// نقش‌ها و سطح دسترسی — تک‌منبع حقیقت برای پنل و API

export type Role = "SUPERADMIN" | "OPERATOR" | "VIEWER";

export const ROLE_LABEL: Record<Role, string> = {
  SUPERADMIN: "مدیر کل",
  OPERATOR: "اپراتور",
  VIEWER: "ناظر",
};

/** ماتریس مجوز مبتنی بر اکشن: READ | CREATE | UPDATE | DELETE | ADMIN */
export function can(role: Role, action: string): boolean {
  switch (action) {
    case "READ":
      return true;
    case "CREATE":
    case "UPDATE":
      return role === "SUPERADMIN" || role === "OPERATOR";
    case "DELETE":
      return role === "SUPERADMIN";
    case "ADMIN": // مدیریت مدیران، مشاهده audit کامل، عملیات حساس
      return role === "SUPERADMIN";
    default:
      return false;
  }
}
