import Taro from '@tarojs/taro';

const BASE_URL = 'https://api.piaoxiaozhu.com/v1';

interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: any;
  header?: Record<string, string>;
  needAuth?: boolean;
}

interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

function getToken(): string {
  return Taro.getStorageSync('token') || '';
}

async function request<T = any>(options: RequestOptions): Promise<ApiResponse<T>> {
  const { url, method = 'GET', data, header = {}, needAuth = true } = options;

  if (needAuth) {
    const token = getToken();
    if (token) {
      header['Authorization'] = `Bearer ${token}`;
    }
  }

  header['Content-Type'] = header['Content-Type'] || 'application/json';

  try {
    const res = await Taro.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header,
    });

    if (res.statusCode === 401) {
      Taro.removeStorageSync('token');
      Taro.redirectTo({ url: '/pages/mine/index' });
      throw new Error('登录已过期，请重新登录');
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data as ApiResponse<T>;
    }

    throw new Error(res.data?.message || '请求失败');
  } catch (error: any) {
    Taro.showToast({ title: error.message || '网络异常', icon: 'none' });
    throw error;
  }
}

export const authApi = {
  wxLogin: (code: string) =>
    request({ url: '/auth/wx-login', method: 'POST', data: { code }, needAuth: false }),

  getProfile: () =>
    request({ url: '/auth/profile' }),
};

export const invoiceApi = {
  upload: (filePath: string, projectId?: string) => {
    const token = getToken();
    return new Promise((resolve, reject) => {
      const uploadTask = Taro.uploadFile({
        url: `${BASE_URL}/invoices/upload`,
        filePath,
        name: 'file',
        header: { Authorization: `Bearer ${token}` },
        formData: projectId ? { projectId } : {},
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(res.data));
          } else {
            reject(new Error('上传失败'));
          }
        },
        fail: reject,
      });
      return uploadTask;
    });
  },

  getList: (params?: { projectId?: string; page?: number; pageSize?: number }) =>
    request({ url: '/invoices', data: params }),

  getDetail: (id: string) =>
    request({ url: `/invoices/${id}` }),

  update: (id: string, data: any) =>
    request({ url: `/invoices/${id}`, method: 'PUT', data }),

  delete: (id: string) =>
    request({ url: `/invoices/${id}`, method: 'DELETE' }),
};

export const projectApi = {
  getList: (params?: { page?: number; pageSize?: number }) =>
    request({ url: '/projects', data: params }),

  getDetail: (id: string) =>
    request({ url: `/projects/${id}` }),

  create: (data: { name: string; description?: string }) =>
    request({ url: '/projects', method: 'POST', data }),

  update: (id: string, data: any) =>
    request({ url: `/projects/${id}`, method: 'PUT', data }),

  delete: (id: string) =>
    request({ url: `/projects/${id}`, method: 'DELETE' }),

  getReport: (id: string) =>
    request({ url: `/projects/${id}/report` }),

  addManualIncome: (id: string, data: { amount: number; description: string }) =>
    request({ url: `/projects/${id}/manual-income`, method: 'POST', data }),
};

export const userApi = {
  getQuota: () =>
    request({ url: '/user/quota' }),

  getPlans: () =>
    request({ url: '/user/plans', needAuth: false }),

  getCurrentPlan: () =>
    request({ url: '/user/current-plan' }),

  upgradePlan: (planId: string) =>
    request({ url: '/user/upgrade', method: 'POST', data: { planId } }),
};

export const reportApi = {
  getProjectReport: (projectId: string) =>
    request({ url: `/reports/project/${projectId}` }),

  exportReport: (projectId: string, format: 'pdf' | 'excel') =>
    request({ url: `/reports/export/${projectId}`, data: { format } }),

  getCategoryBreakdown: (projectId: string) =>
    request({ url: `/reports/category-breakdown/${projectId}` }),
};

export const categoryApi = {
  getList: () =>
    request({ url: '/categories' }),

  create: (data: { name: string; color?: string }) =>
    request({ url: '/categories', method: 'POST', data }),
};
