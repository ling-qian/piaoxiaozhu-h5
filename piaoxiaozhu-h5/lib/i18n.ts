export type Locale = "zh" | "en";

const translations: Record<Locale, Record<string, string>> = {
  zh: {
    // 通用
    "app.name": "票小助",
    "app.desc": "餐饮票据智能整理",
    "common.save": "保存",
    "common.cancel": "取消",
    "common.delete": "删除",
    "common.edit": "编辑",
    "common.back": "返回",
    "common.loading": "加载中...",
    "common.success": "操作成功",
    "common.error": "操作失败",
    "common.confirm": "确定",
    "common.search": "搜索",
    "common.filter": "筛选",
    "common.loadMore": "加载更多",
    "common.noMore": "没有更多了",
    "common.noData": "暂无数据",

    // 导航
    "nav.home": "首页",
    "nav.toolkit": "工具箱",
    "nav.mine": "我的",

    // 首页
    "home.title": "我的项目",
    "home.newProject": "新建",
    "home.projectName": "项目名称",
    "home.create": "确定",

    // 项目详情
    "project.manualEntry": "手动录入",
    "project.batchUpload": "批量上传",
    "project.merchant": "商户名称",
    "project.amount": "金额",
    "project.date": "日期",
    "project.category": "分类",
    "project.remark": "备注",

    // 分类
    "cat.food_material": "食材采购",
    "cat.rent": "房租",
    "cat.salary": "工资",
    "cat.utilities": "水电燃气",
    "cat.platform_fee": "平台服务费",
    "cat.advertising": "广告推广",
    "cat.office": "办公费用",
    "cat.other": "其他",

    // 报表
    "report.title": "报表统计",
    "report.month": "月份",
    "report.all": "全部",
    "report.income": "收入",
    "report.expense": "支出",
    "report.profit": "利润",
    "report.costDist": "成本分布",
    "report.monthlyTrend": "月度趋势",
    "report.export": "导出",
    "report.detail": "收支明细",

    // 会员
    "member.title": "会员套餐",
    "member.free": "免费版",
    "member.pro": "专业版",
    "member.enterprise": "企业版",
    "member.current": "当前",
    "member.buy": "立即购买",
    "member.currentPlan": "当前套餐",
    "member.purchasing": "跳转支付...",

    // 我的
    "mine.stats": "统计",
    "mine.records": "条记录",
    "mine.projects": "个项目",
    "mine.about": "关于票小助",
    "mine.logout": "退出登录",

    // 上传
    "upload.title": "上传票据",
    "upload.select": "选择图片",
    "upload.recognizing": "识别中...",
    "upload.success": "识别成功",
    "upload.failed": "识别失败",

    // 工具箱
    "toolkit.title": "工具箱",
    "toolkit.ocr": "票据识别",
    "toolkit.classify": "智能分类",

    // 认证
    "auth.login": "登录",
    "auth.register": "注册",
    "auth.email": "邮箱",
    "auth.password": "密码",
    "auth.confirmPwd": "确认密码",
    "auth.noAccount": "没有账号？",
    "auth.hasAccount": "已有账号？",
    "auth.goLogin": "去登录",
    "auth.goRegister": "去注册",

    // 错误
    "error.title": "出了点问题",
    "error.retry": "重新加载",
    "error.default": "页面加载失败，请稍后重试",
  },
  en: {
    "app.name": "PiaoXiaoZhu",
    "app.desc": "Smart Invoice Organizer",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.back": "Back",
    "common.loading": "Loading...",
    "common.success": "Success",
    "common.error": "Error",
    "common.confirm": "OK",
    "common.search": "Search",
    "common.filter": "Filter",
    "common.loadMore": "Load More",
    "common.noMore": "No more",
    "common.noData": "No data",

    "nav.home": "Home",
    "nav.toolkit": "Toolkit",
    "nav.mine": "Me",

    "home.title": "My Projects",
    "home.newProject": "New",
    "home.projectName": "Project name",
    "home.create": "Create",

    "project.manualEntry": "Manual Entry",
    "project.batchUpload": "Batch Upload",
    "project.merchant": "Merchant",
    "project.amount": "Amount",
    "project.date": "Date",
    "project.category": "Category",
    "project.remark": "Remark",

    "cat.food_material": "Food Material",
    "cat.rent": "Rent",
    "cat.salary": "Salary",
    "cat.utilities": "Utilities",
    "cat.platform_fee": "Platform Fee",
    "cat.advertising": "Advertising",
    "cat.office": "Office",
    "cat.other": "Other",

    "report.title": "Reports",
    "report.month": "Month",
    "report.all": "All",
    "report.income": "Income",
    "report.expense": "Expense",
    "report.profit": "Profit",
    "report.costDist": "Cost Distribution",
    "report.monthlyTrend": "Monthly Trend",
    "report.export": "Export",
    "report.detail": "Details",

    "member.title": "Plans",
    "member.free": "Free",
    "member.pro": "Pro",
    "member.enterprise": "Enterprise",
    "member.current": "Current",
    "member.buy": "Buy Now",
    "member.currentPlan": "Current Plan",
    "member.purchasing": "Redirecting...",

    "mine.stats": "Stats",
    "mine.records": "records",
    "mine.projects": "projects",
    "mine.about": "About",
    "mine.logout": "Log Out",

    "upload.title": "Upload Invoice",
    "upload.select": "Select Image",
    "upload.recognizing": "Recognizing...",
    "upload.success": "Recognized",
    "upload.failed": "Failed",

    "toolkit.title": "Toolkit",
    "toolkit.ocr": "OCR Scanner",
    "toolkit.classify": "Auto Classify",

    "auth.login": "Log In",
    "auth.register": "Sign Up",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.confirmPwd": "Confirm Password",
    "auth.noAccount": "No account?",
    "auth.hasAccount": "Have an account?",
    "auth.goLogin": "Log in",
    "auth.goRegister": "Sign up",

    "error.title": "Something went wrong",
    "error.retry": "Retry",
    "error.default": "Failed to load, please try again",
  },
};

let currentLocale: Locale = "zh";

export function setLocale(locale: Locale) {
  currentLocale = locale;
  if (typeof window !== "undefined") {
    localStorage.setItem("locale", locale);
  }
}

export function getLocale(): Locale {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("locale") as Locale | null;
    if (saved && (saved === "zh" || saved === "en")) {
      currentLocale = saved;
    }
  }
  return currentLocale;
}

export function t(key: string, locale?: Locale): string {
  const loc = locale || currentLocale;
  return translations[loc]?.[key] || translations.zh[key] || key;
}

export function useLocale() {
  return { locale: getLocale(), setLocale, t };
}
