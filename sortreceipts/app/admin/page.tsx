import { getAdminToken } from "@/lib/admin";
import AdminDashboard from "./admin-dashboard";
import AdminLogin from "./admin-login";

/**
 * 管理后台入口。
 *
 * 只凭 cookie 里的令牌判断是否已登录，不查用户登录态——
 * 后台和用户账号是两套独立凭证，管理员不必是小程序用户。
 *
 * 这个页面不进任何导航：只有知道地址的人能进来，避免普通用户误点后
 * 看到一个要他输令牌的框。
 */
export default async function AdminPage() {
  const token = await getAdminToken();

  return token ? <AdminDashboard /> : <AdminLogin />;
}
