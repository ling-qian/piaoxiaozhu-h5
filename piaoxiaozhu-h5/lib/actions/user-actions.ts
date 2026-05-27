"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function registerUser(email: string, password: string, name: string) {
  const trimmedEmail = email.trim().toLowerCase();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(trimmedEmail)) throw new Error("邮箱格式不正确");
  if (password.length < 6) throw new Error("密码至少6位");
  if (!name.trim()) throw new Error("昵称不能为空");

  const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });
  if (existing) throw new Error("邮箱已注册");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email: trimmedEmail, passwordHash, name: name.trim() },
  });

  return { id: user.id, email: user.email, name: user.name };
}

export async function getUserInfo() {
  const session = await auth();
  if (!session?.user) return null;

  const userId = session.user.id;
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      planCode: true,
      quotaTotal: true,
      quotaUsed: true,
      createdAt: true,
    },
  });
}

export async function checkQuota(): Promise<{ used: number; total: number; available: boolean }> {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { quotaUsed: true, quotaTotal: true },
  });
  if (!user) throw new Error("用户不存在");

  return {
    used: user.quotaUsed,
    total: user.quotaTotal,
    available: user.quotaUsed < user.quotaTotal,
  };
}

export async function incrementQuotaUsed(): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;
  await prisma.user.update({
    where: { id: userId },
    data: { quotaUsed: { increment: 1 } },
  });
}

export async function updateUserName(name: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = session.user.id;
  return prisma.user.update({
    where: { id: userId },
    data: { name },
  });
}
