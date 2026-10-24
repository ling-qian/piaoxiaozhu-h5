import Taro from '@tarojs/taro';
import { useStore } from '../store';

/**
 * 「正式登录」= 已绑定手机号。
 *
 * 注意区分两层：
 * - 静默登录：启动时 wx.login 换 openid，只证明「是个微信用户」，无感；
 * - 正式登录：用户主动授权手机号，才算账号可用（可用于找回、客服、防刷）。
 * 产品上需要登录的动作（签到、上传、购买、AI 分析）一律以手机号为准。
 */
export function isFormallyLoggedIn(): boolean {
  const { userInfo } = useStore.getState();
  return Boolean(userInfo?.phone);
}

/** 跳到授权登录页。已经在授权页就不重复跳，避免叠一堆页面。 */
function goBindPhone(): void {
  const pages = Taro.getCurrentPages();
  const route = pages[pages.length - 1]?.route || '';
  if (route.includes('phone-bind')) return;
  Taro.navigateTo({ url: '/pages/phone-bind/index' });
}

/**
 * 需要登录的操作统一走这里。
 *
 * 用法：
 *   if (!(await requireLogin())) return;   // 未登录：已跳授权页，中止当前操作
 *   await doSomething();
 *
 * 返回 true 表示可以继续；false 表示已跳转、调用方必须中止。
 */
export async function requireLogin(options?: { silent?: boolean }): Promise<boolean> {
  const store = useStore.getState();

  // 连静默登录都还没成功的极端情况（首启失败/清过缓存），这里补一次
  if (!store.token) {
    try {
      const res = await Taro.login();
      if (res.code) await store.login(res.code);
    } catch {
      // 忽略：下面统一按未登录处理
    }
  }

  if (isFormallyLoggedIn()) return true;

  if (!options?.silent) {
    Taro.showToast({ title: '登录后即可使用', icon: 'none', duration: 1200 });
  }
  goBindPhone();
  return false;
}
