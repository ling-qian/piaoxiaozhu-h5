export default defineAppConfig({
  /**
   * 按需注入：只注入当前访问页面所需的代码，未访问的页面不注入不执行。
   *
   * 收益：16 个页面，启动时少执行 15 个页面的模块级代码，降低启动耗时与内存。
   *
   * 已确认安全：所有页面顶层只有 interface/type/const 常量与组件定义，
   * 没有任何可执行副作用（无顶层 setInterval / addEventListener / Taro.xxx），
   * 所以「未访问页面代码不执行」不会影响行为。
   *
   * 官方要求基础库 ≥ 2.11.1；低于该版本兼容但无优化效果。
   */
  lazyCodeLoading: 'requiredComponents',
  pages: [
    'pages/index/index',
    'pages/upload/index',
    'pages/result/index',
    'pages/project/index',
    'pages/report/index',
    'pages/ask/index',
    'pages/quick-entry/index',
    'pages/analysis/index',
    'pages/points/index',
    'pages/checkin/index',
    'pages/member/index',
    'pages/toolkit/index',
    'pages/mine/index',
    'pages/profile/index',
    'pages/privacy/index',
    'pages/phone-bind/index',
  ],
  window: {
    backgroundColor: '#F5F5F5',
    navigationBarTitleText: 'AI票小助',
    navigationBarBackgroundColor: '#FF6B35',
    navigationBarTextStyle: 'white',
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#FF6B35',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/tab/home.png',
        selectedIconPath: 'assets/tab/home-active.png',
      },
      {
        pagePath: 'pages/toolkit/index',
        text: '工具箱',
        iconPath: 'assets/tab/toolkit.png',
        selectedIconPath: 'assets/tab/toolkit-active.png',
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的',
        iconPath: 'assets/tab/mine.png',
        selectedIconPath: 'assets/tab/mine-active.png',
      },
    ],
  },
});
