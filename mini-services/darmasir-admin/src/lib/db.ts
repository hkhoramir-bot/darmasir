import { PrismaClient } from "@prisma/client";

// الگوی singleton — در dev با هر hot-reload اتصال جدید ساخته نشود
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
