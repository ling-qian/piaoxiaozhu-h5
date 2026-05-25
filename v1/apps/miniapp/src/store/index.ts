import { create } from 'zustand';
import Taro from '@tarojs/taro';
import { authApi, userApi, projectApi, plansApi } from '../services/api';

interface UserInfo {
  id: string;
  openid: string;
  nickname: string;
  avatar_url: string;
  phone: string;
  plan_code: string;
}

interface QuotaInfo {
  plan_code: string;
  plan_name: string;
  quota_total: number;
  quota_used: number;
  quota_remaining: number;
}

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

interface PlanInfo {
  code: string;
  name: string;
  quota: number;
  price_cents: number;
  features: string[];
}

interface AppState {
  token: string;
  userInfo: UserInfo | null;
  quota: QuotaInfo | null;
  projects: ProjectInfo[];
  currentProject: ProjectInfo | null;
  plans: PlanInfo[];
  initialized: boolean;

  setToken: (token: string) => void;
  fetchUserInfo: () => Promise<void>;
  fetchQuota: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  setCurrentProject: (project: ProjectInfo | null) => void;
  login: (code: string) => Promise<void>;
  autoLogin: () => Promise<void>;
  logout: () => void;
  isLoggedIn: () => boolean;
}

export const useStore = create<AppState>((set, get) => ({
  token: '',
  userInfo: null,
  quota: null,
  projects: [],
  currentProject: null,
  plans: [],
  initialized: false,

  setToken: (token: string) => {
    Taro.setStorageSync('token', token);
    set({ token });
  },

  fetchUserInfo: async () => {
    try {
      const data = await userApi.getMe();
      set({ userInfo: data as UserInfo });
    } catch {
      // network error, don't logout
    }
  },

  fetchQuota: async () => {
    try {
      const data = await userApi.getQuota();
      set({ quota: data as QuotaInfo });
    } catch {
      // ignore
    }
  },

  fetchProjects: async () => {
    try {
      const data = await projectApi.getList();
      set({ projects: data.items || [] });
    } catch {
      // ignore
    }
  },

  fetchPlans: async () => {
    try {
      const data = await plansApi.getList();
      set({ plans: data.items || [] });
    } catch {
      // ignore
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  login: async (code: string) => {
    try {
      const data = await authApi.wechatLogin(code);
      const accessToken = data.access_token;
      const user = data.user;
      get().setToken(accessToken);
      set({ userInfo: user as UserInfo, initialized: true });
      await Promise.all([get().fetchQuota(), get().fetchProjects()]);
    } catch (error: any) {
      Taro.showToast({ title: '登录失败', icon: 'none' });
      throw error;
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
