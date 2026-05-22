export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/upload/index',
    'pages/result/index',
    'pages/project/index',
    'pages/report/index',
    'pages/member/index',
    'pages/toolkit/index',
    'pages/mine/index',
  ],
  window: {
    background: '#F5F5F5',
    navigationBarTitleText: '票小助',
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
