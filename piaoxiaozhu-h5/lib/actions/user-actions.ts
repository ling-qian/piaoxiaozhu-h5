"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function registerUser(email: string, password: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("邮箱已注册");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });

  return { id: user.id, email: user.email, name: user.name };
}

export async function getUserInfo() {
  const session = await auth();
  if (!session?.user) return null;

  const userId = (session.user as any).id;
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

export async function updateUserName(name: string) {
  const session = await auth();
  if (!session?.user) throw new Error("未登录");

  const userId = (session.user as any).id;
  return prisma.user.update({
    where: { id: userId },
    data: { name },
  });
}
