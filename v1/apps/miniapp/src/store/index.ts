import { create } from 'zustand';
import Taro from '@tarojs/taro';
import { authApi, userApi, projectApi } from '../services/api';

interface UserInfo {
  id: string;
  nickname: string;
  avatar: string;
  phone?: string;
  plan: string;
}

interface QuotaInfo {
  total: number;
  used: number;
  remaining: number;
  plan: string;
  expireDate: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  description?: string;
  recordCount: number;
  totalIncome: number;
  totalCost: number;
  createdAt: string;
}

interface AppState {
  token: string;
  userInfo: UserInfo | null;
  quota: QuotaInfo | null;
  projects: ProjectInfo[];
  currentProject: ProjectInfo | null;

  setToken: (token: string) => void;
  fetchUserInfo: () => Promise<void>;
  fetchQuota: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  setCurrentProject: (project: ProjectInfo | null) => void;
  login: (code: string) => Promise<void>;
  logout: () => void;
  checkLogin: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  token: '',
  userInfo: null,
  quota: null,
  projects: [],
  currentProject: null,

  setToken: (token: string) => {
    Taro.setStorageSync('token', token);
    set({ token });
  },

  fetchUserInfo: async () => {
    try {
      const res = await authApi.getProfile();
      set({ userInfo: res.data });
    } catch {
      get().logout();
    }
  },

  fetchQuota: async () => {
    try {
      const res = await userApi.getQuota();
      set({ quota: res.data });
    } catch {
      // ignore
    }
  },

  fetchProjects: async () => {
    try {
      const res = await projectApi.getList();
      set({ projects: res.data.list || [] });
    } catch {
      // ignore
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  login: async (code: string) => {
    try {
      const res = await authApi.wxLogin(code);
      const { token, userInfo } = res.data;
      get().setToken(token);
      set({ userInfo });
      get().fetchQuota();
      get().fetchProjects();
    } catch (error: any) {
      Taro.showToast({ title: '登录失败', icon: 'none' });
      throw error;
    }
  },

  logout: () => {
    Taro.removeStorageSync('token');
    set({ token: '', userInfo: null, quota: null, projects: [], currentProject: null });
  },

  checkLogin: () => {
    const token = Taro.getStorageSync('token');
    if (!token) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
    }
  },
}));
