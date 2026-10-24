import Taro from '@tarojs/taro';

const BASE_URL = process.env.TARO_APP_API_URL || 'http://localhost:8000';

/** 云托管环境 ID：callContainer 必须显式指定 */
const CLOUD_ENV = process.env.TARO_APP_CLOUD_ENV as string;
/** true = 走 callContainer（免域名）；false = 走 HTTPS 直连（本地联调） */
const USE_CALL_CONTAINER = process.env.TARO_APP_USE_CALLCONTAINER !== 'false';
/** callContainer 的 timeout 参数硬上限，官方文档：不得大于 15 秒 */
const CALLCONTAINER_MAX_TIMEOUT = 15000;
/**
 * 云托管**服务名**。
 *
 * callContainer 靠这个 header 决定把请求路由到环境里的哪个服务；
 * 不传时不会自动匹配到我们的 `api` 服务，表现为 404 或「服务不存在」。
 * 一个环境里可以有多个服务，所以必须显式指定。
 */
const CLOUD_SERVICE = process.env.TARO_APP_CLOUD_SERVICE || 'api';

/**
 * callContainer 的 GET 请求不会自动把 data 拼进查询串（它只当 body 用），
 * 而我们的列表/筛选接口（records、report、insights…）都靠 query 传参。
 * 不处理的话所有带筛选的 GET 都会变成「无条件查询」——结果对了但筛选失效，
 * 属于最难发现的那类 bug。
 */
function appendQuery(path: string, method: string, data?: any): string {
  if (!data || typeof data !== 'object') return path;
  if (method.toUpperCase() !== 'GET') return path;
  const qs = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  if (!qs) return path;
  return path.includes('?') ? `${path}&${qs}` : `${path}?${qs}`;
}

/** 把响应体归一成对象：字符串尝试 JSON.parse，失败则原样返回。 */
function normalizeBody(body: any): any {
  if (typeof body !== 'string') return body;
  const text = body.trim();
  if (!text) return null;
  if (text[0] !== '{' && text[0] !== '[') return body;
  try {
    return JSON.parse(text);
  } catch {
    return body;
  }
}

/**
 * 云调用「路由类」错误：请求根本没到达我们的服务（环境 ID 错、服务名错、未关联）。
 * 这类错误重试 HTTPS 是安全的——服务端没收到过请求，不会重复下单/重复扣费。
 *
 * 102002（超时）不在此列：它可能已经到达并在处理，重试会造成重复操作。
 */
function isRoutingError(err: any): boolean {
  const code = err?.errCode ?? err?.errno;
  if ([102002, 102005].includes(code)) return false;
  const msg = String(err?.errMsg || "");
  return (
    code === -501000 ||
    code === -601001 ||
    code === -601002 ||
    /service|env|环境|不存在|not found|invalid/i.test(msg)
  );
}

/** 云调用不可用时熔断，后续请求直接走 HTTPS，避免每次登录都白等一次。 */
let cloudBroken = false;

/** 云调用错误码 → 人话。102002 是超时，这次改造要重点观察的就是它。 */
function describeCallContainerError(err: any): string {
  const code = err?.errCode ?? err?.errno;
  if (code === 102002) return '请求超时：操作耗时超过云调用的 15 秒上限';
  if (code === 102005) return '请求方式不被支持';
  if (code === -501000) return '接口路径不存在';
  return err?.errMsg || '网络异常，请稍后重试';
}

/**
 * 把后端返回的媒体地址补全成小程序里可加载的绝对地址。
 *
 * 为什么需要：未配置对象存储（OSS/COS）时，后端返回的是**相对路径**，
 * 例如头像 `/files/static/avatars/<用户>/<文件>.jpg`（见后端 storage.py 的
 * local_public_url）。而小程序的 `<Image>` 会把以 `/` 开头的地址当成
 * **本地包内资源**而不是网络地址，于是永远加载失败——开发者工具里的表现就是
 * 「Failed to load image http://127.0.0.1:<工具端口>/__pageframe__/files/static/...」。
 *
 * 已配置对象存储时后端返回的就是 `http(s)://` 绝对地址，这里原样返回。
 * chooseAvatar 给的临时路径（http://tmp/... 或 wxfile://...）也原样返回。
 */
export function resolveMediaUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${BASE_URL}${url}`;
  return url;
}

interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: any;
  header?: Record<string, string>;
  needAuth?: boolean;
  /** 超时毫秒数。AI 分析等长耗时接口需要放宽（Taro 默认 60s）。 */
  timeout?: number;
}

function getToken(): string {
  return Taro.getStorageSync('token') || '';
}

interface RawResponse {
  statusCode: number;
  data: any;
  header?: Record<string, string>;
}

/**
 * 统一出口：按开关选择云调用或 HTTPS。
 *
 * 云调用（callContainer）走微信私有协议，不需要域名、不需要在后台配服务器域名，
 * 代价是请求超时**不能超过 15 秒**，且请求体上限 100K。
 * 因此 AI 经营分析这类长耗时接口要么压缩输出，要么改异步——这一点在实测中确认。
 */
function sendRequest(
  path: string,
  method: string,
  data: any,
  header: Record<string, string>,
  timeout?: number
): Promise<RawResponse> {
  const wxAny = wx as any;

  const viaHttps = () =>
    Taro.request({
      url: `${BASE_URL}${path}`,
      method: method as any,
      data,
      header,
      ...(timeout ? { timeout } : {}),
    }) as unknown as Promise<RawResponse>;

  if (!USE_CALL_CONTAINER || cloudBroken || !wxAny?.cloud?.callContainer) {
    // 本地联调 / 基础库过低 / 云调用已熔断：走 HTTPS 直连
    return viaHttps();
  }

  return new Promise<RawResponse>((resolve, reject) => {
    wxAny.cloud.callContainer({
      config: { env: CLOUD_ENV },
      path: appendQuery(path, method, data),
      method: method.toUpperCase(),
      // GET 已经把参数拼进 path，body 就不再重复传
      ...(method.toUpperCase() === 'GET' ? {} : { data }),
      // X-WX-SERVICE 是云调用的路由依据，缺了它请求落不到 api 服务上
      header: { ...header, 'X-WX-SERVICE': CLOUD_SERVICE },
      timeout: Math.min(timeout || CALLCONTAINER_MAX_TIMEOUT, CALLCONTAINER_MAX_TIMEOUT),
      success: (r: any) =>
        resolve({
          statusCode: r.statusCode,
          // 云调用的 data 可能是已解析的对象，也可能是原始字符串（取决于 dataType）。
          // 上游 request() 直接读 res.data.detail，这里必须归一成对象，
          // 否则错误信息会全变成 undefined，前端只显示「请求失败」四个字。
          data: normalizeBody(r.data),
          header: r.header,
        }),
      fail: async (err: any) => {
        const message = describeCallContainerError(err);
        console.error('[callContainer] 失败', err?.errCode, message, path);
        // GET 超时也可以安全回落：读操作没有副作用，重试不会重复扣费。
        // POST/PUT/DELETE 超时不能重试——服务端可能已经处理完，重发会重复下单。
        const method_ = method.toUpperCase();
        const timeoutRetryable = method_ === 'GET' && /timeout/i.test(String(err?.errMsg || ''));
        if (isRoutingError(err) || timeoutRetryable) {
          // 路由类失败说明请求没到达服务（环境/服务名配错、未关联）。
          // 当场回落 HTTPS：既让功能可用，也把真实错误留在日志里。
          cloudBroken = true;
          console.warn('[callContainer] 云调用不可用（路由失败或超时），'
            + '本次及后续请求改用 HTTPS。请检查 TARO_APP_CLOUD_ENV / TARO_APP_CLOUD_SERVICE');
          try {
            resolve(await viaHttps());
          } catch (e2) {
            reject(e2);
          }
          return;
        }
        reject(new Error(message));
      },
    });
  });
}

async function request<T = any>(options: RequestOptions): Promise<T> {
  const { url, method = 'GET', data, header = {}, needAuth = true, timeout } = options;

  if (needAuth) {
    const token = getToken();
    if (token) {
      header['Authorization'] = `Bearer ${token}`;
    }
  }

  header['Content-Type'] = header['Content-Type'] || 'application/json';

  try {
    const res = await sendRequest(url, method, data, header, timeout);

    if (res.statusCode === 401) {
      Taro.removeStorageSync('token');
      // 同步清空 zustand store：只删 storage 的话界面仍显示「已登录」和过期
      // 用户信息。动态 import 避免 store → api 的循环依赖。
      void import('../store').then(({ useStore }) => useStore.getState().logout());
      Taro.showToast({ title: '登录已过期', icon: 'none' });
      throw new Error('登录已过期');
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data as T;
    }

    throw new Error(res.data?.detail || res.data?.message || '请求失败');
  } catch (error: any) {
    if (error.message !== '登录已过期') {
      // Taro 的 request:fail 抛出的对象通常没有 message 字段，只显示兜底文案
      // 会让真机排查无从下手（域名校验失败、超时、连不通都长一个样）。
      // 这里优先透出 errMsg，把真实原因显示出来。
      const msg = error?.errMsg || error?.message || '网络异常';
      Taro.showToast({ title: msg, icon: 'none' });
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

/** 后端 /api/me/quota 返回结构；数值 -1 表示无限 */
export interface QuotaPayload {
  plan_code: string;
  plan_name: string;
  /** 积分余额（计量单位已从「发票张数」切换为积分） */
  points_balance: number;
  /** 本月已消耗积分（正数） */
  points_used_this_month: number;
  /** 当前套餐每月发放的积分（免费版为 0） */
  points_per_month: number;
  /** 识别一张票消耗的积分 */
  points_cost_ocr: number;
  /** 一次 AI 分析消耗的积分 */
  points_cost_ai: number;
  can_export: boolean;
  /** 付费套餐到期时间（ISO 字符串），无订阅周期时为 null */
  plan_expires_at: string | null;
  /** 距离到期还有多少天（向上取整，已过期为负数）；无订阅周期时为 null */
  plan_days_left: number | null;
  /** 付费套餐是否已到期（到期后 plan_code 会回落到 free） */
  plan_expired: boolean;
  /** 库里记录的套餐，用于把「续费原套餐」和「升级其他套餐」区分开 */
  purchased_plan_code: string;
  /**
   * 到期提醒的订阅消息模板 id；后端未配置时为 null。
   * 前端必须据此决定是否展示「开启到期提醒」入口——模板没配就调不了
   * wx.requestSubscribeMessage。
   */
  subscribe_template_id: string | null;
  /** 后端已把「模板已配 + 有到期日 + 7 天内」三个条件拼好，前端不用自己算 */
  can_remind_renewal: boolean;
}

export const userApi = {
  getMe: () =>
    request({ url: '/api/me' }),

  updateMe: (data: { nickname?: string; avatar_url?: string }) =>
    request({ url: '/api/me', method: 'PATCH', data }),

  /**
   * 上传头像。微信 chooseAvatar 给的是临时路径，必须传给后端落库，
   * 直接把临时路径存进 avatar_url 会失效。
   */
  uploadAvatar: (filePath: string) => {
    const token = getToken();
    return new Promise<{ avatar_url: string }>((resolve, reject) => {
      Taro.uploadFile({
        url: `${BASE_URL}/api/me/avatar`,
        filePath,
        name: 'file',
        header: { Authorization: `Bearer ${token}` },
        success: (res) => {
          try {
            const data = JSON.parse(res.data || '{}');
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(data?.detail || '头像上传失败'));
            }
          } catch {
            reject(new Error('头像上传失败'));
          }
        },
        fail: () => reject(new Error('头像上传失败')),
      });
    });
  },

  getQuota: () =>
    request<QuotaPayload>({ url: '/api/me/quota' }),

  /** 注销账号：后端级联删除该用户全部数据，不可恢复 */
  deleteAccount: () =>
    request({ url: '/api/me', method: 'DELETE' }),
};

/** 套餐定义，与后端 plan_config.py 保持一致，-1 表示无限 */
export interface PlanPeriod {
  months: number;
  label: string;
  /** 1.0 = 原价，0.9 = 9 折 */
  discount: number;
  price_cents: number;
  /** 该周期发放的积分（折扣不克扣额度，按整月倍数给） */
  points: number;
}

export interface PlanItem {
  code: string;
  name: string;
  desc: string;
  /** 每月发放的积分（计量单位已从「发票张数」改为积分） */
  points_per_month: number;
  project_limit: number; // 项目数量上限
  price_cents: number;
  can_export: boolean;
  features: string[];
  /** 可购买周期：1 / 3 / 12 个月 */
  periods: PlanPeriod[];
}

export const plansApi = {
  getList: () =>
    request<{ items: PlanItem[] }>({ url: '/api/plans' }),
};

/** 上传接口返回。图片走异步 OCR，XML/OFD 是同步解析，看 content_kind 分流。 */
export interface UploadResult {
  file_id: string;
  file_url: string;
  file_key: string;
  filename: string;
  content_type: string;
  /** image / xml / ofd */
  content_kind: string;
  ocr_status: string;
  /** 仅 XML 有效：done / failed / blocked / pending */
  parse_status: string;
  /** 同一份原始文件之前已上传过（按 sha256 判定） */
  is_duplicate_file: boolean;
  duplicate_file_id: string | null;
  /** XML 解析因月度额度耗尽被暂停（文件仍已归档） */
  quota_exceeded: boolean;
  /** 解析失败等需要提示给用户的原因 */
  message: string | null;
}

/** 扩展名 → MIME。直传时 COS 用的是我们给的 Content-Type，必须准。 */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  xml: 'application/xml',
  ofd: 'application/ofd',
};

/** 读本地临时文件为 ArrayBuffer（不传 encoding 即返回二进制） */
function readFileAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      success: (res) => resolve(res.data as ArrayBuffer),
      fail: (err) => reject(new Error(err?.errMsg || '读取文件失败')),
    });
  });
}

/** 预签名 PUT 到对象存储。签名由后端算，前端不接触密钥。 */
function putToStorage(url: string, data: ArrayBuffer, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Taro.request({
      url,
      method: 'PUT',
      data,
      header: { 'Content-Type': contentType },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`对象存储上传失败（${res.statusCode}）`));
      },
      fail: (err) => reject(new Error(err?.errMsg || '对象存储上传失败')),
    });
  });
}

/** 本地开发（未配对象存储）时的老路径：文件经后端中转 */
function uploadViaBackend(filePath: string, projectId: string): Promise<UploadResult> {
  const token = getToken();
  return new Promise<UploadResult>((resolve, reject) => {
    Taro.uploadFile({
      url: `${BASE_URL}/api/files/upload?project_id=${projectId}`,
      filePath,
      name: 'file',
      header: { Authorization: `Bearer ${token}` },
      success: (res) => {
        let data: any = {};
        try {
          data = JSON.parse(res.data || '{}');
        } catch {
          // 非 JSON 响应（如网关错误页），统一走下面的失败分支
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data as UploadResult);
        } else {
          reject(new Error(data?.detail || '上传失败'));
        }
      },
      fail: reject,
    });
  });
}

interface UploadTicket {
  file_id: string;
  file_key: string;
  upload_url: string;
  content_kind: string;
  max_bytes: number;
}

export const fileApi = {
  /**
   * 上传票据。优先走「预签名直传对象存储」：
   *   申请地址 → 直传 COS → 登记。图片不经后端中转，省带宽；
   *   且只需在小程序后台配置对象存储域名的 request 合法域名，不依赖自有域名。
   * 未配对象存储时（本地开发）自动回退到后端中转。
   */
  upload: async (filePath: string, projectId: string): Promise<UploadResult> => {
    const filename = filePath.split('/').pop() || 'upload.jpg';
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';

    let ticket: UploadTicket;
    try {
      ticket = await request<UploadTicket>({
        url: '/api/files/upload-url',
        data: { project_id: projectId, filename, content_type: contentType },
      });
    } catch {
      // 后端明确不支持直传（未配置对象存储）时回退；其他错误继续往上抛
      return uploadViaBackend(filePath, projectId);
    }

    const buffer = await readFileAsArrayBuffer(filePath);
    if (buffer.byteLength > ticket.max_bytes) {
      throw new Error(`文件不得超过 ${Math.floor(ticket.max_bytes / 1024 / 1024)}MB`);
    }
    await putToStorage(ticket.upload_url, buffer, contentType);

    return request<UploadResult>({
      url: '/api/files/register',
      method: 'POST',
      data: {
        project_id: projectId,
        file_id: ticket.file_id,
        file_key: ticket.file_key,
        filename,
        content_type: contentType,
      },
    });
  },

  triggerOcr: (fileId: string) =>
    request({ url: '/api/ocr/parse', method: 'POST', data: { file_id: fileId } }),

  getOcrStatus: (fileId: string) =>
    request({ url: `/api/ocr/status/${fileId}` }),
};

/** 票面自检结果。channel 恒为 local——不是税局真伪查验结果。 */
export interface VerifyCheck {
  key: string;
  label: string;
  level: 'ok' | 'warn' | 'fail';
  detail: string;
}

export interface VerifyResult {
  status: 'pass' | 'attention' | 'suspect' | 'insufficient';
  channel: 'local';
  checked_at: string;
  checks: VerifyCheck[];
  official: {
    elements: {
      invoice_code: string | null;
      invoice_no: string | null;
      invoice_date: string | null;
      amount_without_tax: string | null;
    };
    complete: boolean;
    url: string;
    missing: string[];
  };
}

export const recordApi = {
  getDetail: (recordId: string) =>
    request({ url: `/api/records/${recordId}` }),

  getList: (
    projectId: string,
    params?: {
      direction?: string;
      category_code?: string;
      /** 一级分类名（用户看到的分类），与 category_code 二选一 */
      category_l1?: string;
      /** 关键词：同时匹配商户名与一级分类 */
      keyword?: string;
      page?: number;
      size?: number;
    },
  ) => request({ url: `/api/projects/${projectId}/records`, data: params }),

  create: (data: {
    project_id: string;
    file_id?: string;
    direction: string;
    merchant_name?: string;
    tax_no?: string;
    amount?: number;
    tax_amount?: number;
    invoice_date?: string;
    // 票据身份字段：手工录入时直接填，后端据此做查重与票面自检
    invoice_code?: string;
    invoice_no?: string;
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
    tax_no?: string;
    amount?: number;
    tax_amount?: number;
    invoice_date?: string;
    invoice_code?: string;
    invoice_no?: string;
    category_code?: string;
    category_l1?: string;
    category_l2?: string;
  }) =>
    request({ url: `/api/records/${recordId}`, method: 'PATCH', data }),

  /** 重跑票面结构自检（本地校验，非税局查验）。后端会顺带把结果落库。 */
  verify: (recordId: string) =>
    request<VerifyResult>({ url: `/api/records/${recordId}/verify`, method: 'POST' }),

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

export interface ParsedEntry {
  ok: boolean;
  direction: 'out' | 'income';
  amount: number | null;
  merchant: string;
  date: string | null;
  category_l1: string;
  note: string;
  missing: string[];
}

export interface AnomalyFinding {
  code: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  evidence: Array<{ id: string; invoice_no: string | null; merchant: string | null; amount: number; date: string }>;
}

export const insightsApi = {
  /** 自然语言查账：一句话问，返回结论 + 模型对问题的理解 */
  ask: (question: string) =>
    request<{
      question: string;
      interpretation: string;
      answer: string;
      time_range: string;
      metric: string;
      dimension: string | null;
      row_count: number;
      free_remaining: number;
      charged: boolean;
    }>({ url: '/api/insights/ask', method: 'POST', data: { question } }),

  /** 把一句话解析成记账草稿（不入库，等用户确认） */
  parseText: (text: string) =>
    request<ParsedEntry>({ url: '/api/insights/parse-text', method: 'POST', data: { text } }),

  /** AI 审单报告：体检发现 + 收支汇总 + 审核意见（一次拿全） */
  auditReport: (projectId?: string) =>
    request<{
      summary: { record_count: number; income: number; expense: number; finding_count: number; high_count: number };
      findings: AnomalyFinding[];
      advice: string;
    }>({ url: '/api/insights/audit-report', data: projectId ? { project_id: projectId } : {} }),

  /** 账目体检：扫描重复发票、金额离群、连号发票、商户支出突变 */
  listAnomalies: (projectId?: string) =>
    request<{ scanned: number; total: number; items: AnomalyFinding[] }>({
      url: '/api/insights/anomalies',
      data: projectId ? { project_id: projectId } : {},
    }),
};

export const reportApi = {
  getProjectReport: (projectId: string, month?: string) =>
    request({ url: `/api/projects/${projectId}/report`, data: month ? { month } : undefined }),

  exportReport: (projectId: string, fmt: 'csv' | 'excel') =>
    request({ url: `/api/projects/${projectId}/report/export`, data: { fmt } }),

  shareReport: (projectId: string) =>
    request({ url: `/api/projects/${projectId}/report/share`, method: 'POST' }),

  getSharedReport: (shareToken: string) =>
    request({ url: `/api/share/${shareToken}`, needAuth: false }),

  /**
   * AI 经营分析。实测生成约 900 字需 13–21 秒，因此单独放宽到 60s。
   * ⚠️ 云调用 callContainer 超时上限 15s，走那条通道会超时；详见后端 analysis.py 注释。
   */
  analyzeProject: (projectId: string) =>
    request({
      url: `/api/projects/${projectId}/analysis`,
      method: 'POST',
      timeout: 60000,
    }),
};

/** 积分体系：余额/签到/流水。消耗单价由后端下发，前端不写死。 */
export const pointsApi = {
  getPoints: () =>
    request<{
      balance: number;
      checked_in_today: boolean;
      checkin_reward: number;
      signup_bonus: number;
      costs: { invoice_ocr: number; ai_analysis: number };
    }>({ url: '/api/points' }),

  checkin: () =>
    request<{ balance: number; earned: number; message: string }>({
      url: '/api/points/checkin',
      method: 'POST',
    }),

  getLogs: (limit = 30) =>
    request<{ items: Array<{ action: string; delta: number; reason: string; created_at: string }> }>({
      url: '/api/points/logs',
      data: { limit },
    }),

  /** 可购买的积分包。价格高于套餐内单价（套餐是批发价），由后端统一定价 */
  getPackages: () =>
    request<{
      items: Array<{
        code: string;
        label: string;
        points: number;
        price_cents: number;
        unit_price_yuan: number;
      }>;
    }>({ url: '/api/points/packages' }),

  /** 签到日历：指定月份（默认本月）的签到日期、连续天数、本月天数 */
  getCheckinCalendar: (month?: string) =>
    request<{
      month: string;
      today: string;
      checked_dates: string[];
      today_checked_in: boolean;
      month_count: number;
      streak: number;
      balance: number;
      reward: number;
    }>({ url: '/api/points/checkin/calendar', data: month ? { month } : undefined }),
};

export const toolkitApi = {
  getContents: () =>
    request<{ items: Array<{ id: string; title: string; content: string; category: string }> }>({
      url: '/api/toolkit/contents',
    }),
};

/** 后端返回的支付参数，字段名与 Taro.requestPayment 对齐 */
export interface PrepayResult {
  order_id: string;
  plan_code: string;
  amount_cents: number;
  is_mock: boolean;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'MD5' | 'HMAC-SHA256' | 'RSA';
  paySign: string;
}

export const paymentApi = {
  createPrepay: (planCode: string, periodMonths = 1) =>
    request<PrepayResult>({
      url: '/api/payments/wechat/prepay',
      method: 'POST',
      data: { plan_code: planCode, period_months: periodMonths },
    }),

  // 未配置微信支付参数时用于联调，真实支付场景不会走到
  mockComplete: (orderId: string) =>
    request({ url: '/api/payments/mock/complete', method: 'POST', data: { order_id: orderId } }),

  /**
   * 查询订单真实状态。requestPayment 的返回不可信（真机调试模式会限制支付
   * 却可能正常返回），支付成功与否以此接口的 status 为准。
   */
  getOrder: (orderId: string) =>
    request<{
      order_id: string;
      status: 'pending' | 'paid';
      plan_code: string;
      amount_cents: number;
      paid_at: string | null;
    }>({ url: `/api/payments/orders/${orderId}` }),
};
