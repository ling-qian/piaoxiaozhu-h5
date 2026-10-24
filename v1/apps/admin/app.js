/* 票小助 · 管理后台（纯静态，无构建链）
 *
 * 鉴权：管理令牌存 sessionStorage，请求带 X-Admin-Token。
 * 后端接口在 /api/admin/*，本页面由 FastAPI 托管在 /admin。
 * 约定：接口返回 401 → 回登录页；403 → 提示未启用。
 */

const API_BASE = '';                     // 同源部署，留空即可
const TOKEN_KEY = 'pzx_admin_token';

const state = {
  token: sessionStorage.getItem(TOKEN_KEY) || '',
  tab: 'overview',
  users: { page: 1, size: 20 },
  orders: { page: 1, size: 20 },
  points: { page: 1, size: 30, actionsLoaded: false },
};

/* ---------------- 基础工具 ---------------- */

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

function fmtMoney(cents) {
  return `¥${((cents || 0) / 100).toFixed(2)}`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const ACTION_LABEL = {
  signup_bonus: '注册赠送',
  daily_checkin: '每日签到',
  purchase_grant: '购买/发放',
  consume_invoice_ocr: '票据识别',
  consume_ai_analysis: 'AI 分析',
  purchase_legacy: '历史记录',
};

async function api(path, params) {
  const url = new URL(API_BASE + path, window.location.origin);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url, {
    headers: { 'X-Admin-Token': state.token },
  });
  if (res.status === 401) {
    logout();
    throw new Error('令牌已失效');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `请求失败（${res.status}）`);
  }
  return res.json();
}

/* ---------------- 登录 ---------------- */

function showLogin(message) {
  $('#login').classList.remove('hidden');
  $('#app').classList.add('hidden');
  $('#login-error').textContent = message || '';
}

function logout() {
  state.token = '';
  sessionStorage.removeItem(TOKEN_KEY);
  showLogin('');
}

function enterApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  loadOverview();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = $('#token-input').value.trim();
  if (!token) return;
  state.token = token;
  try {
    await api('/api/admin/overview');
    sessionStorage.setItem(TOKEN_KEY, token);
    enterApp();
  } catch (err) {
    showLogin(err.message || '登录失败');
  }
});

$('#logout').addEventListener('click', logout);

/* ---------------- 标签切换 ---------------- */

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    state.tab = tab;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${tab}`));
    if (tab === 'users') loadUsers();
    if (tab === 'orders') loadOrders();
    if (tab === 'points') loadPoints();
  });
});

/* ---------------- 概览 ---------------- */

async function loadOverview() {
  const box = $('#overview-cards');
  box.innerHTML = '<div class="card"><div class="label">加载中…</div></div>';
  try {
    const d = await api('/api/admin/overview');
    box.innerHTML = '';
    const cards = [
      { label: '用户总数', value: d.users.total, sub: `今日新增 ${d.users.today}` },
      { label: '订单总数', value: d.orders.total, sub: `已支付 ${d.orders.paid} 笔` },
      { label: '累计收入', value: fmtMoney(d.revenue_cents), sub: '仅统计已支付订单' },
      { label: '票据记录', value: d.records, sub: `项目 ${d.projects} 个` },
      { label: '累计发放积分', value: d.points.issued, sub: `已消耗 ${d.points.used}` },
    ];
    cards.forEach((c) => {
      const card = el('div', 'card');
      card.append(el('div', 'label', c.label), el('div', 'value', String(c.value)), el('div', 'sub', c.sub));
      box.appendChild(card);
    });
  } catch (err) {
    box.innerHTML = `<div class="card"><div class="label error">${err.message}</div></div>`;
  }
}

/* ---------------- 表格渲染 ---------------- */

function renderTable(table, columns, rows, emptyText) {
  table.innerHTML = '';
  const thead = el('thead');
  const tr = el('tr');
  columns.forEach((c) => tr.appendChild(el('th', null, c.title)));
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = el('tbody');
  if (!rows.length) {
    const td = el('td', 'empty', emptyText || '没有数据');
    td.colSpan = columns.length;
    const row = el('tr');
    row.appendChild(td);
    tbody.appendChild(row);
  } else {
    rows.forEach((item) => {
      const row = el('tr');
      columns.forEach((c) => {
        const td = el('td', c.cls ? c.cls : null);
        const value = c.render ? c.render(item) : item[c.key];
        if (value instanceof Node) td.appendChild(value);
        else td.textContent = value ?? '—';
        row.appendChild(td);
      });
      tbody.appendChild(row);
    });
  }
  table.appendChild(tbody);
}

function renderPager(pager, total, page, size, onChange) {
  pager.innerHTML = '';
  const pages = Math.max(1, Math.ceil(total / size));
  pager.append(el('span', null, `共 ${total} 条 · 第 ${page}/${pages} 页`));
  const prev = el('button', null, '上一页');
  prev.disabled = page <= 1;
  prev.onclick = () => onChange(page - 1);
  const next = el('button', null, '下一页');
  next.disabled = page >= pages;
  next.onclick = () => onChange(page + 1);
  pager.append(prev, next);
}

/* ---------------- 用户 ---------------- */

const USER_COLUMNS = [
  { title: '昵称', key: 'nickname', render: (r) => r.nickname || '（未设置）' },
  { title: '手机号', key: 'phone', render: (r) => r.phone || '—' },
  {
    title: '套餐',
    key: 'plan_code',
    render: (r) => {
      const b = el('span', `badge ${r.plan_code === 'free' ? '' : 'ok'}`, r.plan_code);
      return b;
    },
  },
  { title: '积分余额', key: 'points_balance', cls: 'num strong' },
  { title: '注册时间', key: 'created_at', render: (r) => fmtTime(r.created_at) },
  { title: '用户 ID', key: 'id', render: (r) => (r.id || '').slice(0, 8) + '…' },
];

async function loadUsers(page) {
  if (page) state.users.page = page;
  const { page: p, size } = state.users;
  try {
    const d = await api('/api/admin/users', {
      page: p,
      size,
      keyword: $('#user-keyword').value.trim(),
      plan: $('#user-plan').value,
    });
    renderTable($('#user-table'), USER_COLUMNS, d.items, '没有匹配的用户');
    renderPager($('#user-pager'), d.total, p, size, loadUsers);
  } catch (err) {
    renderTable($('#user-table'), USER_COLUMNS, [], err.message);
  }
}

$('#user-search').addEventListener('click', () => loadUsers(1));

/* ---------------- 订单 ---------------- */

const ORDER_COLUMNS = [
  { title: '时间', key: 'created_at', render: (r) => fmtTime(r.created_at) },
  {
    title: '商品',
    key: 'plan_code',
    render: (r) => `${r.plan_code} · ${r.period_months} 个月`,
  },
  { title: '金额', key: 'amount_cents', cls: 'num strong', render: (r) => fmtMoney(r.amount_cents) },
  {
    title: '状态',
    key: 'status',
    render: (r) => el('span', `badge ${r.status === 'paid' ? 'ok' : 'warn'}`, r.status === 'paid' ? '已支付' : '待支付'),
  },
  { title: '用户', key: 'user_nickname', render: (r) => `${r.user_nickname || '—'} ${r.user_phone || ''}` },
  { title: '支付时间', key: 'paid_at', render: (r) => fmtTime(r.paid_at) },
];

async function loadOrders(page) {
  if (page) state.orders.page = page;
  const { page: p, size } = state.orders;
  try {
    const d = await api('/api/admin/orders', { page: p, size, status: $('#order-status').value });
    renderTable($('#order-table'), ORDER_COLUMNS, d.items, '没有订单');
    renderPager($('#order-pager'), d.total, p, size, loadOrders);
  } catch (err) {
    renderTable($('#order-table'), ORDER_COLUMNS, [], err.message);
  }
}

$('#order-search').addEventListener('click', () => loadOrders(1));

/* ---------------- 积分流水 ---------------- */

const POINTS_COLUMNS = [
  { title: '时间', key: 'created_at', render: (r) => fmtTime(r.created_at) },
  { title: '用户', key: 'user_nickname', render: (r) => `${r.user_nickname || '—'} ${r.user_phone || ''}` },
  { title: '动作', key: 'action', render: (r) => ACTION_LABEL[r.action] || r.action },
  {
    title: '变动',
    key: 'delta',
    cls: 'num',
    render: (r) => el('span', r.delta > 0 ? 'plus' : r.delta < 0 ? 'minus' : '', `${r.delta > 0 ? '+' : ''}${r.delta}`),
  },
  { title: '说明', key: 'reason', render: (r) => r.reason || '—' },
];

async function loadPoints(page) {
  if (page) state.points.page = page;
  const { page: p, size } = state.points;
  try {
    const d = await api('/api/admin/points', {
      page: p,
      size,
      action: $('#points-action').value,
      user_id: $('#points-user').value.trim(),
    });
    if (!state.points.actionsLoaded && d.actions) {
      const sel = $('#points-action');
      d.actions.forEach((a) => {
        const opt = el('option', null, `${ACTION_LABEL[a] || a}（${a}）`);
        opt.value = a;
        sel.appendChild(opt);
      });
      state.points.actionsLoaded = true;
    }
    renderTable($('#points-table'), POINTS_COLUMNS, d.items, '没有积分流水');
    renderPager($('#points-pager'), d.total, p, size, loadPoints);
  } catch (err) {
    renderTable($('#points-table'), POINTS_COLUMNS, [], err.message);
  }
}

$('#points-search').addEventListener('click', () => loadPoints(1));

/* ---------------- 启动 ---------------- */

if (state.token) {
  api('/api/admin/overview')
    .then(enterApp)
    .catch(() => showLogin(''));
} else {
  showLogin('');
}
