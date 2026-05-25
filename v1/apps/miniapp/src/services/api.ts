import Taro from '@tarojs/taro';

const BASE_URL = process.env.TARO_APP_API_URL || 'http://localhost:8000';

interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: any;
  header?: Record<string, string>;
  needAuth?: boolean;
}

function getToken(): string {
  return Taro.getStorageSync('token') || '';
}

async function request<T = any>(options: RequestOptions): Promise<T> {
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
      Taro.showToast({ title: '登录已过期', icon: 'none' });
      throw new Error('登录已过期');
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data as T;
    }

    throw new Error(res.data?.detail || res.data?.message || '请求失败');
  } catch (error: any) {
    if (error.message !== '登录已过期') {
      Taro.showToast({ title: error.message || '网络异常', icon: 'none' });
    }
    throw error;
  }
}

export const authApi = {
  wechatLogin: (code: string) =>
    request({ url: '/api/auth/wechat/login', method: 'POST', data: { code }, needAuth: false }),

  bindPhone: (phoneCode: string) =>
    request({ url: '/api/auth/wechat/bind-phone', method: 'POST', data: { phone_code: phoneCode } }),
};

export const userApi = {
  getMe: () =>
    request({ url: '/api/me' }),

  updateMe: (data: { nickname?: string; avatar_url?: string }) =>
    request({ url: '/api/me', method: 'PATCH', data }),

  getQuota: () =>
    request({ url: '/api/me/quota' }),
};

export const plansApi = {
  getList: () =>
    request({ url: '/api/plans', needAuth: false }),
};

export const fileApi = {
  upload: (filePath: string, projectId: string) => {
    const token = getToken();
    return new Promise((resolve, reject) => {
      Taro.uploadFile({
        url: `${BASE_URL}/api/files/upload?project_id=${projectId}`,
        filePath,
        name: 'file',
        header: { Authorization: `Bearer ${token}` },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(res.data));
          } else {
            reject(new Error('上传失败'));
          }
        },
        fail: reject,
      });
    });
  },

  triggerOcr: (fileId: string) =>
    request({ url: '/api/ocr/parse', method: 'POST', data: { file_id: fileId } }),

  getOcrStatus: (fileId: string) =>
    request({ url: `/api/ocr/status/${fileId}` }),
};

export const recordApi = {
  getList: (projectId: string, params?: { direction?: string; category_code?: string; page?: number; size?: number }) =>
    request({ url: `/api/projects/${projectId}/records`, data: params }),

  create: (data: {
    project_id: string;
    file_id?: string;
    direction?: string;
    merchant_name?: string;
    amount?: number;
    tax_amount?: number;
    invoice_date?: string;
    category_code?: string;
    category_l1?: string;
    category_l2?: string;
    confidence?: number;
    raw_text?: string;
    reason?: string;
  }) =>
    request({ url: '/api/records', method: 'POST', data }),

  update: (recordId: string, data: {
    merchant_name?: string;
    amount?: number;
    tax_amount?: number;
    invoice_date?: string;
    category_code?: string;
    category_l1?: string;
    category_l2?: string;
  }) =>
    request({ url: `/api/records/${recordId}`, method: 'PATCH', data }),

  delete: (recordId: string) =>
    request({ url: `/api/records/${recordId}`, method: 'DELETE' }),
};

export const projectApi = {
  getList: (params?: { page?: number; size?: number }) =>
    request({ url: '/api/projects', data: params }),

  getDetail: (id: string) =>
    request({ url: `/api/projects/${id}` }),

  create: (data: { name: string; industry?: string; report_month?: string }) =>
    request({ url: '/api/projects', method: 'POST', data }),

  update: (id: string, data: { name?: string; industry?: string; report_month?: string; status?: string }) =>
    request({ url: `/api/projects/${id}`, method: 'PATCH', data }),

  delete: (id: string) =>
    request({ url: `/api/projects/${id}`, method: 'DELETE' }),

  getStats: (id: string) =>
    request({ url: `/api/projects/${id}/stats` }),

  addManualIncome: (id: string, data: { month: string; amount: number }) =>
    request({ url: `/api/projects/${id}/manual-income`, method: 'POST', data }),
};

export const reportApi = {
  getProjectReport: (projectId: string) =>
    request({ url: `/api/projects/${projectId}/report` }),

  exportReport: (projectId: string, fmt: 'csv' | 'excel') =>
    request({ url: `/api/projects/${projectId}/report/export`, data: { fmt } }),

  shareReport: (projectId: string) =>
    request({ url: `/api/projects/${projectId}/report/share`, method: 'POST' }),

  getSharedReport: (shareToken: string) =>
    request({ url: `/api/share/${shareToken}`, needAuth: false }),
};

export const toolkitApi = {
  getContents: () =>
    request({ url: '/api/toolkit/contents' }),
};

export const paymentApi = {
  createPrepay: (planCode: string) =>
    request({ url: '/api/wechat/prepay', method: 'POST', data: { plan_code: planCode } }),
};
