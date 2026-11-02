"use server";

/**
 * 给客户端组件用的登录/登出入口。
 *
 * lib/auth.ts 标了 server-only，客户端组件不能直接 import，
 * 所以经这层薄包装转发。名字保持 login/logout，调用方无感。
 */

import { signIn, signOut } from "@/lib/auth";

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  return signIn(email, password);
}

export async function logout(): Promise<void> {
  await signOut();
}
