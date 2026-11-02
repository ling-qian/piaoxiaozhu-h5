import { create } from 'zustand';
import Taro from '@tarojs/taro';
import { authApi, userApi, projectApi } from '../services/api';
import type { QuotaPayload } from '../services/api';

interface UserInfo {
  id: string;
  openid: string;
  nickname: string;
  avatar_url: string;
  phone: string;
  plan_code: string;
}

/**
 * 字段以后端 /api/me/quota 为准，直接复用其类型，避免两处手写字段名漂移。
 * plan_days_left / subscribe_template_id / can_remind_renewal 是到期提醒相关字段。
 */
interface QuotaInfo extends QuotaPayload {}

interface ProjectInfo {
  id: string;
  name: string;
  industry: string;
  report_month: string;
  status: string;
  record_count: number;
  total_cost: number;
  total_income: number;
  created_at: string;
}

interface AppState {
  token: string;
  userInfo: UserInfo | null;
  quota: QuotaInfo | null;
  projects: ProjectInfo[];
  currentProject: ProjectInfo | null;
  initialized: boolean;

  setToken: (token: string) => void;
  fetchUserInfo: () => Promise<void>;
  fetchQuota: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  setCurrentProject: (project: ProjectInfo | null) => void;
  login: (code: string, promptProfile?: boolean) => Promise<void>;
  autoLogin: () => Promise<void>;
  logout: () => void;
  isLoggedIn: () => boolean;
}

/** 401 时 api 层抛出的固定文案，收到即说明登录态已失效 */
const AUTH_EXPIRED_MSG = '登录已过期';

function isAuthExpired(error: any): boolean {
  return error?.message === AUTH_EXPIRED_MSG;
}

/**
 * 引导首次登录的用户去设置头像昵称。
 *
 * 微信自 2022-10 起收回了 wx.getUserProfile，登录接口本身不返回昵称头像，
 * 只能由用户在编辑资料页主动设置。没有这一步，界面会一直显示「用户」和
 * 默认头像，看起来像登录没生效。
 *
 * 但**只提示一次**：这个函数挂在 autoLogin 上，而 autoLogin 每次冷启动都会跑。
 * 原来没有去重，用户点「稍后」后下次开小程序又弹——反复被同一个弹窗打断，
 * 比「界面显示用户」更让人想关掉小程序。「我的」页有三处入口能进编辑资料，
 * 不靠弹窗用户也找得到。
 */
function promptProfileSetup() {
  const PROMPT_KEY = 'profile_prompt_shown';
  if (Taro.getStorageSync(PROMPT_KEY)) return;
  Taro.setStorageSync(PROMPT_KEY, true);

  Taro.showModal({
    title: '完善个人资料',
    content: '设置头像和昵称，方便在小程序内识别你的账号。',
    confirmText: '去设置',
    cancelText: '稍后',
    success: (res) => {
      if (res.confirm) {
        Taro.navigateTo({ url: '/pages/profile/index' });
      }
    },
  });
}

export const useStore = create<AppState>((set, get) => ({
  token: '',
  userInfo: null,
  quota: null,
  projects: [],
  currentProject: null,
  initialized: false,

  setToken: (token: string) => {
    Taro.setStorageSync('token', token);
    set({ token });
  },

  fetchUserInfo: async () => {
    try {
      const data = await userApi.getMe();
      set({ userInfo: data as UserInfo });
    } catch (error) {
      // 网络抖动不该踢登录态，但 401 必须踢，否则界面还显示着已登录
      if (isAuthExpired(error)) get().logout();
    }
  },

  fetchQuota: async () => {
    try {
      const data = await userApi.getQuota();
      set({ quota: data as QuotaInfo });
    } catch (error) {
      if (isAuthExpired(error)) get().logout();
    }
  },

  fetchProjects: async () => {
    try {
      const data = await projectApi.getList();
      set({ projects: data.items || [] });
    } catch (error) {
      if (isAuthExpired(error)) get().logout();
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  /**
   * 登录。
   *
   * @param promptProfile 是否在昵称为空时弹「完善资料」。
   *   默认 false：冷启动的静默登录（autoLogin）和 requireLogin 的兜底登录
   *   都不该弹窗——前者用户还没看到内容就被打断，后者用户正要点上传，
   *   弹窗会把当前任务冲掉。只有「我的 → 微信一键登录」这种用户主动发起的
   *   登录才适合顺势引导。
   */
  login: async (code: string, promptProfile = false) => {
    // 失败原因由 api 层按后端 detail 提示，这里不再覆盖成笼统的「登录失败」
    const data = await authApi.wechatLogin(code);
    const accessToken = data.access_token;
    const user = data.user;
    get().setToken(accessToken);
    set({ userInfo: user as UserInfo, initialized: true });
    await Promise.all([get().fetchQuota(), get().fetchProjects()]);

    if (promptProfile && !user.nickname) {
      promptProfileSetup();
    }
  },

  autoLogin: async () => {
    const token = Taro.getStorageSync('token');
    if (token) {
      get().setToken(token);
      try {
        await Promise.all([
          get().fetchUserInfo(),
          get().fetchQuota(),
          get().fetchProjects(),
        ]);
      } catch {
        // if all fail, token might be expired
        const freshToken = Taro.getStorageSync('token');
        if (!freshToken) {
          get().logout();
        }
      }
    } else {
      try {
        const loginRes = await Taro.login();
        if (loginRes.code) {
          await get().login(loginRes.code);
        }
      } catch {
        // auto login failed, user can manually login later
      }
    }

    // 登录语义：静默登录只负责拿到 openid/token；「正式登录」由用户在
    // 「我的 → 微信一键登录」主动点击，跳转手机号授权页完成（仿大众点评）。
    // 这里不做强制跳转，避免冷启动就被弹窗打断。
    set({ initialized: true });
  },

  logout: () => {
    Taro.removeStorageSync('token');
    set({ token: '', userInfo: null, quota: null, projects: [], currentProject: null });
  },

  isLoggedIn: () => {
    return !!Taro.getStorageSync('token');
  },
}));
