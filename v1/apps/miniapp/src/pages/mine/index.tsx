import { View, Text, Button, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useStore } from '../../store';
import './index.scss';

interface MenuItem {
  icon: string;
  title: string;
  url?: string;
  action?: string;
}

const MENU_LIST: MenuItem[] = [
  { icon: '📋', title: '识别记录', url: '' },
  { icon: '📁', title: '我的项目', url: '' },
  { icon: '🏷️', title: '分类管理', url: '' },
  { icon: '📊', title: '数据统计', url: '' },
  { icon: '📤', title: '导出数据', url: '' },
  { icon: '⚙️', title: '设置', url: '' },
  { icon: '💬', title: '意见反馈', url: '' },
  { icon: '📖', title: '使用帮助', url: '' },
  { icon: 'ℹ️', title: '关于票小助', url: '' },
];

export default function Mine() {
  const { userInfo, quota, logout } = useStore();

  const handleLogin = () => {
    Taro.login({
      success: (res) => {
        if (res.code) {
          useStore.getState().login(res.code);
        }
      },
    });
  };

  const handleLogout = () => {
    Taro.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          logout();
          Taro.showToast({ title: '已退出登录', icon: 'success' });
        }
      },
    });
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.url) {
      Taro.navigateTo({ url: item.url });
    } else {
      Taro.showToast({ title: '功能开发中', icon: 'none' });
    }
  };

  const handleMemberClick = () => {
    Taro.navigateTo({ url: '/pages/member/index' });
  };

  return (
    <View className='mine-page'>
      <View className='user-header'>
        {userInfo ? (
          <View className='user-info'>
            <Image
              className='user-avatar'
              src={userInfo.avatar || 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI9FhqR6no4pKIrgIbEDk0YqIjYzS7JNibb2nZcTiaS6xFupbGBy1QcBcQ2Q'}
              mode='aspectFill'
            />
            <View className='user-detail'>
              <Text className='user-name'>{userInfo.nickname}</Text>
              <Text className='user-plan'>{userInfo.plan || '免费版'}</Text>
            </View>
          </View>
        ) : (
          <View className='login-entry'>
            <View className='login-avatar'>
              <Text className='login-icon'>👤</Text>
            </View>
            <Button className='login-btn' onClick={handleLogin}>
              点击登录
            </Button>
          </View>
        )}
      </View>

      {quota && (
        <View className='quota-bar' onClick={handleMemberClick}>
          <View className='quota-info'>
            <Text className='quota-label'>本月剩余次数</Text>
            <Text className='quota-value'>{quota.remaining} / {quota.total === -1 ? '∞' : quota.total}</Text>
          </View>
          <View className='quota-track'>
            <View
              className='quota-fill'
              style={{ width: `${quota.total > 0 ? (quota.remaining / quota.total) * 100 : 0}%` }}
            />
          </View>
          <Text className='quota-upgrade'>升级 ›</Text>
        </View>
      )}

      <View className='menu-list'>
        {MENU_LIST.map((item, idx) => (
          <View
            key={idx}
            className='menu-item'
            onClick={() => handleMenuClick(item)}
          >
            <View className='menu-left'>
              <Text className='menu-icon'>{item.icon}</Text>
              <Text className='menu-title'>{item.title}</Text>
            </View>
            <Text className='menu-arrow'>›</Text>
          </View>
        ))}
      </View>

      {userInfo && (
        <Button className='logout-btn' onClick={handleLogout}>
          退出登录
        </Button>
      )}
    </View>
  );
}
